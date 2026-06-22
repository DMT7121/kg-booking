import { AI_TIMEOUTS } from '@/utils/constants'
import type { AIModel } from '@/utils/constants'
import * as api from '@/services/api'
import { handleModelFailure, isGatewayCircuitOpen, reportGatewaySuccess, reportGatewayFailure } from './circuitBreaker'

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
  responseSchema?: any
  maxOutputTokens?: number
  temperature?: number
}

export interface AICompletionResponse {
  ok: boolean
  content: string | null
  error?: string
}

class FatalAIError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'FatalAIError'
    this.status = status
  }
}

export const AI_TRANSPORT_TIMEOUTS = {
  directMs: 3000,
  edgeMs: 2500,
  gasMs: 6000,
  totalModelCallMs: 8000,
  totalPipelineMs: 12000
};

const MIN_STAGE_BUDGET_MS = 1500;

export function getTimeoutForModel(model: AIModel): number {
  if (model.type === 'vision') return AI_TIMEOUTS.proxyMs
  const provider = model.provider.toLowerCase()
  if (provider === 'groq' || provider === 'cerebras' || provider === 'sambanova') {
    return AI_TIMEOUTS.fastModelMs
  }
  if (provider === 'google' || provider === 'mistral' || provider === 'github' || provider === 'openai') {
    return AI_TIMEOUTS.qualityModelMs
  }
  if (provider === 'pollinations') {
    return AI_TIMEOUTS.qualityModelMs
  }
  return AI_TIMEOUTS.qualityModelMs
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
    aiMode = 'direct',
    responseSchema,
    maxOutputTokens,
    temperature
  } = request

  const overallStartTime = performance.now()

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
      const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUTS.proxyMs) // timeout from config
      if (signal) {
        signal.addEventListener('abort', () => controller.abort())
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      const sharedSecret = import.meta.env.VITE_APP_SHARED_SECRET
      if (sharedSecret) {
        headers['Authorization'] = `Bearer ${sharedSecret}`
      }

      const res = await fetch(`${apiGatewayUrl}/api/ai/analyze`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: model.id,
          provider: model.provider,
          sysPrompt,
          userPrompt,
          image,
          jsonMode,
          responseSchema,
          maxOutputTokens,
          temperature
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
      const errMsg = e.name === 'AbortError' ? 'Timeout (8s)' : e.message
      if (logCallback) {
        logCallback(`[Model: ${model.name}] Gọi qua AI Gateway thất bại: ${errMsg}. Đang dùng chế độ dự phòng...`, 'warning')
      }
      // Fallback to direct mode if gateway fails
    }
  }

  // --- DIRECT MODE ---
  const canCallDirect = localKeys.length > 0 || model.provider === 'pollinations'
  let lastFatalError: any = null
  let hasKeyConfigured = localKeys.length > 0
  
  if (canCallDirect) {
    const keyList = model.provider === 'pollinations' ? ['free'] : localKeys
    const modelTimeout = getTimeoutForModel(model)

    for (let i = 0; i < keyList.length; i++) {
      if (signal?.aborted) break
      
      const elapsedOverall = performance.now() - overallStartTime
      const remainingMs = AI_TRANSPORT_TIMEOUTS.totalModelCallMs - elapsedOverall
      if (remainingMs < MIN_STAGE_BUDGET_MS) {
        if (logCallback) {
          logCallback(`[Model: ${model.name}] Quá hạn budget gọi Direct (${remainingMs.toFixed(0)}ms remaining). Bỏ qua stage này.`, 'warning')
        }
        break
      }

      const key = keyList[i]
      const effectiveTimeout = Math.min(modelTimeout, remainingMs, AI_TRANSPORT_TIMEOUTS.directMs)
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
            generationConfig: { 
              temperature: temperature ?? 0.1,
              ...(maxOutputTokens ? { maxOutputTokens } : {}),
              ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
              ...(responseSchema && jsonMode ? { responseSchema } : {})
            },
            ...(model.id.includes('2.5') ? { generationConfig: { temperature: temperature ?? 0.1, thinkingConfig: { thinkingBudget: 0 } } } : {})
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
            temperature: temperature ?? 0.1,
            max_tokens: maxOutputTokens ?? 4096,
            ...(jsonMode && !noResponseFormat.includes(model.provider) 
              ? (responseSchema 
                  ? { response_format: { type: 'json_schema', json_schema: { name: 'booking_extraction', strict: true, schema: responseSchema } } }
                  : { response_format: { type: 'json_object' } }
                )
              : {}
            )
          }
        }

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout)
        
        const onAbort = () => controller.abort()
        if (signal) {
          signal.addEventListener('abort', onAbort)
        }

        try {
          const res = await fetch(fetchUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: controller.signal
          })
          clearTimeout(timeoutId)

          if (res.status === 401 || res.status === 403) {
            throw new FatalAIError(`Invalid API Key / Unauthorized (HTTP ${res.status})`, res.status)
          }
          if (res.status === 429) {
            throw new FatalAIError(`Rate limit / Quota exceeded (HTTP ${res.status})`, res.status)
          }
          if (res.status === 404) {
            throw new FatalAIError(`Model not found (HTTP ${res.status})`, res.status)
          }
          if (res.status === 402) {
            throw new FatalAIError(`Billing / Payment Required (HTTP ${res.status})`, res.status)
          }
          if (res.status === 400) {
            throw new FatalAIError(`Invalid request / model format (HTTP ${res.status})`, res.status)
          }
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
        } finally {
          clearTimeout(timeoutId)
          if (signal) {
            signal.removeEventListener('abort', onAbort)
          }
        }
      } catch (e: any) {
        const isFatal = e instanceof FatalAIError || e.name === 'FatalAIError' || e.message.includes('Unauthorized') || e.message.includes('Rate limit') || e.message.includes('Quota') || e.message.includes('not found') || e.message.includes('payment')
        const errMsg = e.name === 'AbortError' ? `Timeout (${effectiveTimeout / 1000}s)` : e.message
        if (logCallback) {
          logCallback(`[Model: ${model.name}] Lỗi khi gọi trực tiếp qua client (Key #${i + 1}): ${errMsg}`, 'warning')
        }
        if (isFatal) {
          handleModelFailure(model.id, e)
          lastFatalError = e
          break // Exit key loop, do not try next key or fall back to GAS
        }
      }
    }
  }

  if (lastFatalError) {
    throw lastFatalError
  }

  if (signal?.aborted) {
    throw new Error('Request aborted by user or timeout')
  }

  if (hasKeyConfigured && !canCallDirect) {
    throw new Error(`Tất cả các local keys cấu hình cho provider ${model.provider} đều thất bại.`)
  }

  const isProduction = import.meta.env.PROD || false
  const aiGatewayUrl = apiGatewayUrl || import.meta.env.VITE_AI_GATEWAY_URL || import.meta.env.VITE_R2_URL || ''
  let normalizedGatewayUrl = aiGatewayUrl ? aiGatewayUrl.replace(/\/+$/, '') : ''
  const sharedSecret = import.meta.env.VITE_APP_SHARED_SECRET || ''

  if (isProduction && normalizedGatewayUrl && !normalizedGatewayUrl.startsWith('https://')) {
    console.warn('[AI Gateway] invalid or non-HTTPS gateway URL in production');
    if (logCallback) {
      logCallback('[AI Gateway] invalid or non-HTTPS gateway URL in production. Skipping gateway proxy.', 'warning');
    }
    normalizedGatewayUrl = '';
  }

  const isEdgeCircuitOpen = isGatewayCircuitOpen('cloudflare_edge')

  // --- SERVER FALLBACK 1: CLOUDFLARE EDGE PROXY ---
  if (normalizedGatewayUrl && !isEdgeCircuitOpen) {
    const elapsedOverall = performance.now() - overallStartTime
    const remainingMs = AI_TRANSPORT_TIMEOUTS.totalModelCallMs - elapsedOverall

    if (remainingMs >= MIN_STAGE_BUDGET_MS) {
      console.info('[AI Proxy] Trying Cloudflare Edge Proxy...')
      if (logCallback) {
        logCallback(`[Model: ${model.name}] Chuyển tiếp yêu cầu qua Server Proxy (Cloudflare Edge)...`, 'info')
      }
      const workerStartTime = performance.now()
      
      const effectiveTimeout = Math.min(AI_TRANSPORT_TIMEOUTS.edgeMs, remainingMs)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout)
      
      const onAbort = () => controller.abort()
      if (signal) {
        signal.addEventListener('abort', onAbort)
      }

      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (sharedSecret) {
          headers['Authorization'] = `Bearer ${sharedSecret}`
        }
        
        const ephemeralKey = sessionStorage.getItem('kg_ephemeral_signing_key')
        const adminTokenVal = sessionStorage.getItem('kg_admin_token') || ''
        
        const bodyPayload = JSON.stringify({
          model: model.id,
          provider: model.provider,
          sysPrompt,
          userPrompt,
          image,
          jsonMode,
          responseSchema,
          maxOutputTokens,
          temperature
        })

        if (ephemeralKey && adminTokenVal) {
          try {
            const { signRequest } = await import('@/utils/security')
            const signingPath = '/api/ai/analyze'
            const signed = await signRequest('POST', signingPath, bodyPayload, ephemeralKey, adminTokenVal)
            
            headers['X-KG-Timestamp'] = String(signed.timestamp)
            headers['X-KG-Nonce'] = signed.nonce
            headers['X-KG-Key-Id'] = signed.keyId
            headers['X-KG-Signature'] = signed.signature
            
            if (logCallback) {
              logCallback('[Security] Request signature headers added successfully.', 'info')
            }
          } catch (signErr: any) {
            console.warn('[Security] Failed to sign request:', signErr.message)
          }
        }
        
        const res = await fetch(`${normalizedGatewayUrl}/api/ai/analyze`, {
          method: 'POST',
          headers,
          body: bodyPayload,
          signal: controller.signal
        })
        
        if (res.status === 401 || res.status === 403) {
          throw new Error(`Edge proxy unauthorized (HTTP ${res.status})`)
        }
        if (res.status === 404) {
          throw new Error(`Model not found on Edge (HTTP ${res.status})`)
        }
        if (res.status === 402) {
          throw new Error(`Edge billing / payment required (HTTP ${res.status})`)
        }
        if (res.status === 400) {
          throw new Error(`Edge invalid format/payload (HTTP ${res.status})`)
        }
        if (!res.ok) {
          const errText = await res.text().catch(() => `HTTP ${res.status}`)
          throw new Error(errText.substring(0, 150))
        }
        
        const json = await res.json()
        if (json.ok && json.content) {
          const latencyMs = Math.round(performance.now() - workerStartTime)
          console.info('[AI Proxy] Cloudflare Edge Proxy success', { latencyMs })
          if (logCallback) {
            logCallback(`[Model: ${model.name}] Gọi qua Server Proxy (Cloudflare Edge) thành công!`, 'success')
          }
          reportGatewaySuccess('cloudflare_edge')
          return json.content
        }
        throw new Error(json.error || 'Gateway returned invalid response')
      } catch (e: any) {
        const errorMsg = e.name === 'AbortError' ? `Timeout (${effectiveTimeout / 1000}s)` : (e.message || String(e))
        const latencyMs = Math.round(performance.now() - workerStartTime)
        
        const isFatal = e instanceof FatalAIError || e.name === 'FatalAIError'
        
        if (!isFatal && (e instanceof TypeError || e.name === 'AbortError' || e.message?.includes('fetch') || e.message?.includes('network'))) {
          reportGatewayFailure('cloudflare_edge', 'edge_cors_or_network', errorMsg)
        }
        
        console.warn('[AI Proxy] Cloudflare Edge Proxy failed, falling back to GAS', { error: errorMsg, latencyMs })
        if (logCallback) {
          logCallback(`[Model: ${model.name}] Lỗi khi gọi qua Server Proxy (Cloudflare Edge): ${errorMsg}. Đang dùng chế độ dự phòng sang GAS...`, 'warning')
        }
        
        if (isFatal) {
          handleModelFailure(model.id, e)
          throw e // Do not fallback to GAS for permanent credential/access errors
        }
      } finally {
        clearTimeout(timeoutId)
        if (signal) {
          signal.removeEventListener('abort', onAbort)
        }
      }
    } else {
      if (logCallback) {
        logCallback(`[Model: ${model.name}] Quá hạn budget gọi Edge Proxy (${remainingMs.toFixed(0)}ms remaining).`, 'warning')
      }
    }
  } else if (isEdgeCircuitOpen) {
    if (logCallback) {
      logCallback(`[Model: ${model.name}] Bỏ qua Cloudflare Edge Proxy do Circuit đang mở (cooldown).`, 'warning')
    }
  }

  // --- SERVER FALLBACK 2: GAS PROXY ---
  const elapsedOverall = performance.now() - overallStartTime
  const remainingMs = AI_TRANSPORT_TIMEOUTS.totalModelCallMs - elapsedOverall
  if (remainingMs < MIN_STAGE_BUDGET_MS) {
    throw new Error('AI_MODEL_CALL_BUDGET_EXHAUSTED')
  }

  if (logCallback) {
    logCallback(`[Model: ${model.name}] Chuyển tiếp yêu cầu qua Server Proxy (GAS)...`, 'info')
  }
  
  const gasStartTime = performance.now()
  const gasController = new AbortController()
  
  const effectiveGasTimeout = Math.min(AI_TRANSPORT_TIMEOUTS.gasMs, remainingMs)
  const gasTimeoutId = setTimeout(() => gasController.abort(), effectiveGasTimeout)
  
  const onGasAbort = () => gasController.abort()
  if (signal) {
    signal.addEventListener('abort', onGasAbort)
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
    }, gasController.signal)
    
    if (!res.ok) {
      throw new Error(res.message || 'AI Proxy failed')
    }
    const latencyMs = Math.round(performance.now() - gasStartTime)
    console.info('[AI Proxy] GAS fallback success', { latencyMs })
    if (logCallback) {
      logCallback(`[Model: ${model.name}] Gọi qua Server Proxy (GAS) thành công!`, 'success')
    }
    return res.content
  } catch (e: any) {
    const errMsg = e.name === 'AbortError' ? `Timeout (${effectiveGasTimeout / 1000}s)` : e.message
    if (logCallback) {
      logCallback(`[Model: ${model.name}] Lỗi khi gọi qua Server Proxy (GAS): ${errMsg}`, 'error')
    }
    handleModelFailure(model.id, e)
    throw e
  } finally {
    clearTimeout(gasTimeoutId)
    if (signal) {
      signal.removeEventListener('abort', onGasAbort)
    }
  }
}
