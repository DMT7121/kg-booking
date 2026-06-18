import type { AIModel } from '@/utils/constants'
import * as api from '@/services/api'

export interface AICompletionRequest {
  model: AIModel
  sysPrompt: string
  userPrompt: string
  image?: string | null
  jsonMode?: boolean
  localKeys?: string[]
  signal?: AbortSignal
  apiGatewayUrl?: string
  aiMode?: 'direct' | 'gateway'
}

export interface AICompletionResponse {
  ok: boolean
  content: string | null
  error?: string
}

export async function callAIModel(
  request: AICompletionRequest,
  logCallback?: (msg: string, type?: 'info' | 'warning' | 'error' | 'success') => void
): Promise<string | null> {
  const {
    model,
    sysPrompt,
    userPrompt,
    image = null,
    jsonMode = true,
    localKeys = [],
    signal,
    apiGatewayUrl,
    aiMode = 'direct'
  } = request

  if (logCallback) {
    logCallback(`[Model: ${model.name}] Bắt đầu gọi model. Provider: ${model.provider}, Chế độ JSON: ${jsonMode}`)
  }

  // --- GATEWAY MODE ---
  if (aiMode === 'gateway' && apiGatewayUrl) {
    if (logCallback) {
      logCallback(`[Model: ${model.name}] Gửi request qua AI Gateway Proxy: ${apiGatewayUrl}...`, 'info')
    }
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 25000)
      if (signal) {
        signal.addEventListener('abort', () => controller.abort())
      }

      const res = await fetch(`${apiGatewayUrl}/api/ai/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model.id,
          provider: model.provider,
          sysPrompt,
          userPrompt,
          image,
          jsonMode
        }),
        signal: controller.signal
      })
      clearTimeout(timeoutId)

      if (!res.ok) {
        const errText = await res.text().catch(() => `HTTP ${res.status}`)
        throw new Error(errText.substring(0, 200))
      }

      const json = await res.json()
      if (json.ok && json.content) {
        if (logCallback) logCallback(`[Model: ${model.name}] Gọi qua AI Gateway thành công!`, 'success')
        return json.content
      }
      throw new Error(json.error || 'AI Gateway failed')
    } catch (e: any) {
      const errMsg = e.name === 'AbortError' ? 'Timeout (25s)' : e.message
      if (logCallback) {
        logCallback(`[Model: ${model.name}] Gọi qua AI Gateway thất bại: ${errMsg}. Đang dùng chế độ dự phòng...`, 'warning')
      }
      // Fallback to direct mode if gateway fails
    }
  }

  // --- DIRECT MODE ---
  const canCallDirect = localKeys.length > 0 || model.provider === 'pollinations'
  
  if (canCallDirect) {
    const keyList = model.provider === 'pollinations' ? ['free'] : localKeys
    for (let i = 0; i < keyList.length; i++) {
      const key = keyList[i]
      try {
        let fetchUrl = model.url
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        let body: any = {}

        if (model.format === 'gemini') {
          fetchUrl += `?key=${key}`
          body = {
            contents: [{
              parts: [
                { text: sysPrompt + '\n\nUser Input:\n' + userPrompt },
                ...(image ? [{ inline_data: { mime_type: 'image/jpeg', data: image.split(',')[1] } }] : [])
              ]
            }],
            generationConfig: { temperature: 0.1 },
            ...(model.id.includes('2.5') ? { generationConfig: { temperature: 0.1, thinkingConfig: { thinkingBudget: 0 } } } : {})
          }
        } else {
          if (key !== 'free') headers['Authorization'] = `Bearer ${key}`
          
          let originLocation = ''
          try {
            originLocation = window.location.origin
          } catch {
            originLocation = 'http://localhost:3000'
          }

          if (model.provider === 'openrouter') {
            headers['HTTP-Referer'] = originLocation
            headers['X-Title'] = "KING's GRILL BOOKING APP"
          }

          let msgContent: any = userPrompt
          if (image) {
            msgContent = [
              { type: 'text', text: userPrompt },
              { type: 'image_url', image_url: { url: image } }
            ]
          }

          const noResponseFormat = ['pollinations', 'huggingface']
          const effectiveSys = (jsonMode && noResponseFormat.includes(model.provider))
            ? sysPrompt + '\n\nCRITICAL: Respond ONLY with raw JSON. No markdown, no ```json blocks. Start with { end with }.'
            : sysPrompt

          body = {
            model: model.id,
            messages: [
              { role: 'system', content: effectiveSys },
              { role: 'user', content: msgContent }
            ],
            temperature: 0.1,
            max_tokens: 4096,
            ...(jsonMode && !noResponseFormat.includes(model.provider) ? { response_format: { type: 'json_object' } } : {})
          }
        }

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 25000)
        
        if (signal) {
          signal.addEventListener('abort', () => controller.abort())
        }

        const res = await fetch(fetchUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal
        })
        clearTimeout(timeoutId)

        if (res.status === 429) throw new Error('Rate limit exceeded (CORS/Client)')
        if (res.status === 401) throw new Error('Invalid API Key')
        if (res.status === 404) throw new Error('Model not found')
        if (!res.ok) {
          const errText = await res.text().catch(() => `HTTP ${res.status}`)
          throw new Error(errText.substring(0, 200))
        }

        const json = await res.json()
        let content: string | null = null

        if (model.format === 'gemini') {
          const parts = json.candidates?.[0]?.content?.parts || []
          for (let p = parts.length - 1; p >= 0; p--) {
            if (parts[p].text && !parts[p].thought) {
              content = parts[p].text
              break
            }
          }
          if (!content) content = parts.find((p: any) => p.text)?.text || null
        } else {
          content = json.choices?.[0]?.message?.content
        }

        if (!content) throw new Error('Empty response from model')
        
        if (logCallback) {
          logCallback(`[Model: ${model.name}] Gọi API trực tiếp qua client thành công!`, 'success')
        }
        return content
      } catch (e: any) {
        const errMsg = e.name === 'AbortError' ? 'Timeout (25s)' : e.message
        if (logCallback) {
          logCallback(`[Model: ${model.name}] Lỗi khi gọi trực tiếp qua client (Key #${i + 1}): ${errMsg}`, 'warning')
        }
      }
    }
  }

  // --- SERVER FALLBACK (GAS PROXY) ---
  if (logCallback) {
    logCallback(`[Model: ${model.name}] Chuyển tiếp yêu cầu qua Server Proxy (GAS)...`, 'info')
  }
  try {
    const res = await api.callAiProxy({
      provider: model.provider,
      model: model.id,
      sysPrompt,
      userPrompt,
      image,
      jsonMode,
      format: model.format as any,
      url: model.url
    }, signal)
    if (!res.ok) {
      throw new Error(res.message || 'AI Proxy failed')
    }
    if (logCallback) {
      logCallback(`[Model: ${model.name}] Gọi qua Server Proxy (GAS) thành công!`, 'success')
    }
    return res.content
  } catch (e: any) {
    if (logCallback) {
      logCallback(`[Model: ${model.name}] Lỗi khi gọi qua Server Proxy (GAS): ${e.message}`, 'error')
    }
    throw e
  }
}
