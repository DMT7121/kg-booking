import { AI_TIMEOUTS, AI_MODELS } from '@/utils/constants'
import type { AIModel } from '@/utils/constants'
import * as api from '@/services/api'
import { API_GATEWAY_URL } from '@/config/endpoints'
import { handleModelFailure, isGatewayCircuitOpen, reportGatewaySuccess, reportGatewayFailure, cooldownModel } from './circuitBreaker'
import * as localKeyVault from '@/services/security/localKeyVault'
import { classifyError, AITransportPolicy } from './aiTransportPolicy'
import { geminiAdapter } from './providerAdapters/geminiAdapter'
import { openaiAdapter } from './providerAdapters/openaiAdapter'
import { useConfigStore } from '@/stores/useConfigStore'

const CORS_RESTRICTED_PROVIDERS = new Set(['sambanova', 'github', 'huggingface', 'deepseek'])

async function fetchWithCorsFallback(
  url: string,
  init: RequestInit,
  provider: string,
  allowCorsProxy = true
): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch (err: any) {
    const isAbort = err?.name === 'AbortError' || init.signal?.aborted
    const errMsg = String(err?.message || err || '').toLowerCase()
    const isCorsOrNetwork = !isAbort && (err?.name === 'TypeError' || errMsg.includes('failed to fetch') || errMsg.includes('network'))
    if (allowCorsProxy && isCorsOrNetwork && CORS_RESTRICTED_PROVIDERS.has(provider.toLowerCase())) {
      const proxyUrl = `${API_GATEWAY_URL.replace(/\/$/, '')}/ai-proxy`
      const baseHeaders = (init.headers || {}) as Record<string, string>
      return await fetch(proxyUrl, {
        ...init,
        headers: {
          ...baseHeaders,
          'x-target-url': url
        }
      })
    }
    throw err
  }
}

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

// Latency EWMA cache: key is model ID, value is estimated latency in ms
const latencyEWMAMap: Record<string, number> = {}

export function getTimeoutForModel(model: AIModel): number {
  if (model.type === 'vision') return 30000 // 30s for vision
  const provider = model.provider.toLowerCase()
  if (provider === 'groq' || provider === 'cerebras' || provider === 'sambanova') {
    return 8000 // 8s for fast text
  }
  return 15000 // 15s for quality text
}

function getEWMALatency(modelId: string, defaultTimeout: number): number {
  const ewma = latencyEWMAMap[modelId]
  if (ewma === undefined) return defaultTimeout
  // Set budget as EWMA * 2.5 (with a minimum of 2s and maximum of model's default timeout)
  return Math.min(defaultTimeout, Math.max(2000, Math.round(ewma * 2.5)))
}

function updateEWMALatency(modelId: string, currentLatencyMs: number) {
  const current = latencyEWMAMap[modelId]
  if (current === undefined) {
    latencyEWMAMap[modelId] = currentLatencyMs
  } else {
    // EWMA weight: 0.8 old, 0.2 new
    latencyEWMAMap[modelId] = Math.round(current * 0.8 + currentLatencyMs * 0.2)
  }
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
    responseSchema,
    maxOutputTokens,
    temperature
  } = request

  const modelId = model.id
  const overallStartTime = performance.now()

  if (logCallback) {
    logCallback(`[Model: ${model.name}] Bắt đầu điều phối cuộc gọi. Provider: ${model.provider}`)
  }

  // 1. Load active transport policy (Sử dụng configStore hoặc mặc định local_first)
  let transportPolicy: AITransportPolicy = 'local_first'
  try {
    const configStore = useConfigStore()
    if (configStore.defaults.aiTransportPolicy) {
      transportPolicy = configStore.defaults.aiTransportPolicy as AITransportPolicy
    }
  } catch (e) {
    // Store not initialized (e.g. in standalone tests), fallback to default
  }

  // 2. Fetch direct keys from local vault if localKeys is empty
  let effectiveLocalKeys = [...localKeys]
  if (effectiveLocalKeys.length === 0 && model.provider !== 'pollinations') {
    if (!localKeyVault.isUnlocked()) {
      try {
        const unlocked = await localKeyVault.tryAutoUnlockFromSession()
        if (!unlocked && localKeyVault.getUnlockMode() !== 'passphrase') {
          await localKeyVault.unlock()
        }
      } catch {
        // Ignore auto-unlock error and fallback to gateway
      }
    }
    if (localKeyVault.isUnlocked()) {
      effectiveLocalKeys = await localKeyVault.getKeysForProvider(model.provider)
      // Also support legacy 'gemini' or 'gemini-exp' key buckets when provider is 'google'
      if (effectiveLocalKeys.length === 0 && model.provider === 'google') {
        const legacyGeminiKeys = await localKeyVault.getKeysForProvider('gemini')
        const legacyExpKeys = await localKeyVault.getKeysForProvider('gemini-exp')
        effectiveLocalKeys = [...legacyGeminiKeys, ...legacyExpKeys]
      }
    }
  }

  // Filter out empty or known dummy placeholder keys
  effectiveLocalKeys = effectiveLocalKeys
    .map(k => (k || '').trim())
    .filter(k => k.length > 0 && k !== 'test-gemini-key-12345')

  const adapter = model.format === 'gemini' ? geminiAdapter : openaiAdapter
  const baseTimeout = getTimeoutForModel(model)
  const directTimeout = getEWMALatency(modelId, baseTimeout)

  // define stages
  const stages: Array<() => Promise<string | null>> = []

  // Stage: Direct provider call
  const directCallStage = async (): Promise<string | null> => {
    const hasKeys = effectiveLocalKeys.length > 0 || model.provider === 'pollinations'
    if (!hasKeys) {
      if (logCallback) {
        logCallback(`[Model: ${model.name}] Chưa có API Key cục bộ cho ${model.provider} (chuyển sang Gateway).`, 'warning')
      }
      return null
    }

    const keysList = model.provider === 'pollinations' ? ['free'] : effectiveLocalKeys

    for (let i = 0; i < keysList.length; i++) {
      if (signal?.aborted) throw new Error('Request aborted by user')
      const key = keysList[i]
      
      if (logCallback) {
        logCallback(`[Model: ${model.name}] Thử gọi Direct API (Key #${i + 1}/${keysList.length}). Timeout budget: ${(directTimeout / 1000).toFixed(1)}s`, 'info')
      }

      const stageStart = performance.now()
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), directTimeout)
      
      const onAbort = () => controller.abort()
      if (signal) signal.addEventListener('abort', onAbort)

      try {
        const { url, headers, body } = adapter.formatRequest({
          model,
          sysPrompt,
          userPrompt,
          image,
          jsonMode,
          responseSchema,
          maxOutputTokens,
          temperature,
          key
        })

        let res = await fetchWithCorsFallback(url, {
          method: 'POST',
          headers,
          body,
          signal: controller.signal
        }, model.provider)

        // Helper to safely read error body whether res has .text() or .json()
        const readErrorBody = async (r: any, st: number): Promise<string> => {
          try {
            if (typeof r.text === 'function') {
              return await r.text()
            }
            if (typeof r.json === 'function') {
              const data = await r.json()
              return typeof data === 'string' ? data : JSON.stringify(data)
            }
          } catch {
            // fallback
          }
          return `HTTP ${st}`
        }

        // If provider rejected structured schema / response_format with HTTP 400, immediately retry once without schema constraint on the same key
        if (!res.ok && res.status === 400 && (responseSchema || jsonMode)) {
          const initialErrText = await readErrorBody(res, res.status)
          const initialClass = classifyError(res.status, initialErrText)
          if (initialClass.action === 'retry_without_schema') {
            if (logCallback) {
              logCallback(`[Model: ${model.name}] Provider từ chối strict schema, tự động thử lại chế độ JSON linh hoạt (Key #${i + 1})...`, 'info')
            }
            const fallbackReq = adapter.formatRequest({
              model,
              sysPrompt,
              userPrompt,
              image,
              jsonMode: false,
              responseSchema: undefined,
              maxOutputTokens,
              temperature,
              key
            })
            res = await fetchWithCorsFallback(fallbackReq.url, {
              method: 'POST',
              headers: fallbackReq.headers,
              body: fallbackReq.body,
              signal: controller.signal
            }, model.provider)
          } else {
            // Reconstruct a synthetic response-like flow using initialClass
            clearTimeout(timeoutId)
            if (signal) signal.removeEventListener('abort', onAbort)
            if (logCallback) {
              logCallback(`[Model: ${model.name}] Lỗi Direct API (Key #${i + 1}): ${initialClass.reason} (${initialClass.action})`, 'warning')
            }
            if (initialClass.action === 'abort') throw new Error('Request aborted by user')
            if (initialClass.action === 'cooldown_model') {
              cooldownModel(modelId, initialClass.cooldownMs || 60000, initialClass.reason)
              return null
            }
            if (initialClass.action === 'switch_transport') break
            continue
          }
        }

        clearTimeout(timeoutId)
        if (signal) signal.removeEventListener('abort', onAbort)

        if (!res.ok) {
          const status = res.status
          const errText = await readErrorBody(res, status)
          
          // Classify the error
          const classification = classifyError(status, errText)
          if (logCallback) {
            logCallback(`[Model: ${model.name}] Lỗi Direct API (Key #${i + 1}): ${classification.reason} (${classification.action})`, 'warning')
          }

          if (classification.action === 'abort') {
            throw new Error('Request aborted by user')
          }
          if (classification.action === 'cooldown_model') {
            cooldownModel(modelId, classification.cooldownMs || 60000, classification.reason)
            return null // Skip to next stage (Gateway)
          }
          if (classification.action === 'switch_transport') {
            break // Break key loop to switch to next stage (Gateway)
          }
          // Retry next key for 'retry_next_key', 'cooldown_key', 'retry_without_schema', or 'fatal_no_retry'
          continue
        }

        const resJson = await res.json()
        const content = adapter.parseResponse(resJson)
        
        const latencyMs = Math.round(performance.now() - stageStart)
        updateEWMALatency(modelId, latencyMs)

        if (logCallback) {
          logCallback(`[Model: ${model.name}] Gọi direct thành công trong ${latencyMs}ms!`, 'success')
        }
        return content

      } catch (e: any) {
        clearTimeout(timeoutId)
        if (signal) signal.removeEventListener('abort', onAbort)

        if (e.name === 'AbortError' || e.message?.includes('aborted') || signal?.aborted) {
          if (signal?.aborted) {
            throw new Error('Request aborted by user')
          }
          // Classification for timeout
          if (logCallback) {
            logCallback(`[Model: ${model.name}] Direct API gọi quá hạn timeout (${(directTimeout / 1000).toFixed(1)}s)`, 'warning')
          }
          continue // Try next key
        }

        const classification = classifyError(undefined, e.message || String(e))
        if (logCallback) {
          logCallback(`[Model: ${model.name}] Lỗi mạng/CORS: ${e.message}`, 'warning')
        }
        if (classification.action === 'switch_transport') {
          break // switch to Gateway
        }
      }
    }

    return null
  }

  // Stage: Gateway call
  const gatewayCallStage = async (): Promise<string | null> => {
    const isGatewayOpen = isGatewayCircuitOpen('cloudflare_edge')
    if (isGatewayOpen) {
      if (logCallback) logCallback(`[Model: ${model.name}] Circuit Breaker của Gateway đang mở (cooldown). Bỏ qua.`, 'warning')
      return null
    }

    const gatewayUrl = apiGatewayUrl || import.meta.env.VITE_AI_GATEWAY_URL || ''
    if (!gatewayUrl) {
      if (logCallback) logCallback(`[Model: ${model.name}] Chưa cấu hình URL Gateway. Bỏ qua.`, 'warning')
      return null
    }

    if (logCallback) {
      logCallback(`[Model: ${model.name}] Gọi qua AI Gateway: ${gatewayUrl}...`, 'info')
    }

    const gatewayStartTime = performance.now()
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUTS.proxyMs)
    
    const onAbort = () => controller.abort()
    if (signal) signal.addEventListener('abort', onAbort)

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      const sharedSecret = import.meta.env.VITE_APP_SHARED_SECRET || 'kg_booking_secret_token_2026'
      headers['Authorization'] = `Bearer ${sharedSecret}`

      const res = await fetch(`${gatewayUrl}/api/ai/analyze`, {
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
      if (signal) signal.removeEventListener('abort', onAbort)

      if (!res.ok) {
        const status = res.status
        const errText = await res.text().catch(() => `HTTP ${status}`)
        if (status === 502 || status === 503 || status === 504) {
          reportGatewayFailure('cloudflare_edge', `gateway_status_${status}`, errText)
        }
        throw new Error(`Gateway Error (${status}): ${errText.substring(0, 150)}`)
      }

      const json = await res.json()
      if (json.ok && json.content) {
        const latencyMs = Math.round(performance.now() - gatewayStartTime)
        reportGatewaySuccess('cloudflare_edge')
        if (logCallback) {
          logCallback(`[Model: ${model.name}] Gọi qua AI Gateway thành công trong ${latencyMs}ms!`, 'success')
        }
        return json.content
      }
      throw new Error(json.error || 'Gateway returned invalid payload structure')

    } catch (e: any) {
      clearTimeout(timeoutId)
      if (signal) signal.removeEventListener('abort', onAbort)
      
      const isTimeout = e.name === 'AbortError'
      reportGatewayFailure('cloudflare_edge', isTimeout ? 'timeout' : 'network_error', e.message)
      if (logCallback) {
        logCallback(`[Model: ${model.name}] AI Gateway thất bại: ${isTimeout ? 'Timeout (10s)' : e.message}`, 'warning')
      }
    }
    return null
  }

  // Populate execution stages based on policy
  if (transportPolicy === 'local_only') {
    stages.push(directCallStage)
  } else if (transportPolicy === 'local_first') {
    stages.push(directCallStage)
    stages.push(gatewayCallStage)
  } else if (transportPolicy === 'gateway_first') {
    stages.push(gatewayCallStage)
    stages.push(directCallStage)
  } else if (transportPolicy === 'gateway_only') {
    stages.push(gatewayCallStage)
  }

  // Run stages sequentially
  for (const runStage of stages) {
    if (signal?.aborted) throw new Error('Request aborted by user')
    try {
      const content = await runStage()
      if (content !== null) {
        return content
      }
    } catch (e: any) {
      if (e.message?.includes('aborted') || signal?.aborted) {
        throw new Error('Request aborted by user')
      }
      throw e // fatal error
    }
  }

  throw new Error(`Tất cả các tuyến vận chuyển (${stages.length} stages) của mô hình ${model.name} đều thất bại.`)
}

export async function callAIModelStream(
  request: AICompletionRequest,
  onChunk: (textChunk: string) => void,
  logCallback?: (msg: string, type?: 'info' | 'warning' | 'error' | 'success') => void
): Promise<string> {
  const fullText = await callAIModel(request, logCallback)
  if (!fullText) {
    throw new Error('AI Model stream returned empty response')
  }

  // Simulate chunked streaming delivery if streaming stream reader is unavailable
  const chunkSize = 25
  for (let i = 0; i < fullText.length; i += chunkSize) {
    const chunk = fullText.slice(i, i + chunkSize)
    onChunk(chunk)
    await new Promise(resolve => setTimeout(resolve, 15))
  }

  return fullText
}

export interface KeyTestResult {
  ok: boolean
  provider: string
  modelName: string
  latencyMs: number
  activeKeyCount: number
  totalKeyCount: number
  message: string
}

export async function testProviderApiKey(
  provider: string,
  explicitKey?: string
): Promise<KeyTestResult> {
  const startTime = performance.now()
  const normProvider = provider.toLowerCase() === 'gemini' || provider.toLowerCase() === 'gemini-exp'
    ? 'google'
    : provider.toLowerCase()

  const textModels = AI_MODELS.filter(m => m.provider === normProvider && m.type === 'text')
  const candidateModels = textModels.length > 0
    ? textModels
    : AI_MODELS.filter(m => m.provider === normProvider)

  if (candidateModels.length === 0) {
    return {
      ok: false,
      provider: normProvider,
      modelName: 'N/A',
      latencyMs: 0,
      activeKeyCount: 0,
      totalKeyCount: 0,
      message: `Không tìm thấy model cấu hình cho nền tảng ${normProvider}`
    }
  }

  let activeModel = candidateModels[0]

  let keysToTest: string[] = []
  if (explicitKey && explicitKey.trim()) {
    keysToTest = [explicitKey.trim()]
  } else if (normProvider === 'pollinations') {
    keysToTest = ['free']
  } else {
    if (!localKeyVault.isUnlocked()) {
      try {
        const unlocked = await localKeyVault.tryAutoUnlockFromSession()
        if (!unlocked && localKeyVault.getUnlockMode() !== 'passphrase') {
          await localKeyVault.unlock()
        }
      } catch {}
    }
    if (localKeyVault.isUnlocked()) {
      keysToTest = await localKeyVault.getKeysForProvider(normProvider)
      if (keysToTest.length === 0 && normProvider === 'google') {
        const legacyGemini = await localKeyVault.getKeysForProvider('gemini')
        const legacyExp = await localKeyVault.getKeysForProvider('gemini-exp')
        keysToTest = [...legacyGemini, ...legacyExp]
      }
    }
  }

  keysToTest = keysToTest.map(k => (k || '').trim()).filter(k => k.length > 0 && k !== 'test-gemini-key-12345')

  if (keysToTest.length === 0 && normProvider !== 'pollinations') {
    return {
      ok: false,
      provider: normProvider,
      modelName: activeModel.name,
      latencyMs: 0,
      activeKeyCount: 0,
      totalKeyCount: 0,
      message: 'Chưa có API Key hợp lệ trong két sắt bảo mật (Vault).'
    }
  }

  let activeCount = 0
  let lastErrorMsg = ''
  let bestLatency = 0

  // Test up to 6 keys per provider
  const sampleKeys = keysToTest.slice(0, 6)
  for (const key of sampleKeys) {
    let keySucceeded = false
    for (const modelCandidate of candidateModels) {
      const adapter = modelCandidate.format === 'gemini' ? geminiAdapter : openaiAdapter
      const kStart = performance.now()
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000)
      try {
        const { url, headers, body } = adapter.formatRequest({
          model: modelCandidate,
          sysPrompt: 'You are a health check assistant. Respond with {"ok":true}',
          userPrompt: 'Ping JSON health check',
          image: null,
          jsonMode: false,
          maxOutputTokens: 32,
          temperature: 0,
          key
        })
        const res = await fetchWithCorsFallback(url, {
          method: 'POST',
          headers,
          body,
          signal: controller.signal
        }, normProvider)
        clearTimeout(timeoutId)

        if (res.ok) {
          // Verify that the 200 OK payload is a real completion JSON and not an empty/stub response
          let parsedJson: any = null
          let rawText = ''
          try {
            if (typeof res.text === 'function') {
              rawText = await res.text()
              parsedJson = rawText ? JSON.parse(rawText) : null
            } else if (typeof res.json === 'function') {
              parsedJson = await res.json()
            }
          } catch {
            parsedJson = null
          }

          if (parsedJson) {
            try {
              adapter.parseResponse(parsedJson)
              activeModel = modelCandidate
              activeCount++
              keySucceeded = true
              const lat = Math.round(performance.now() - kStart)
              if (bestLatency === 0 || lat < bestLatency) bestLatency = lat
              break
            } catch (parseErr: any) {
              lastErrorMsg = parseErr?.message || 'Phản hồi JSON thiếu trường dữ liệu AI'
            }
          } else {
            if (normProvider === 'github' && rawText.trim() === 'OK') {
              lastErrorMsg = 'Dịch vụ GitHub Models (models.github.ai) đã ngừng hoạt động (trả về stub "OK" thay vì JSON)'
            } else {
              lastErrorMsg = `Endpoint trả về dữ liệu không phải JSON hợp lệ (${rawText.slice(0, 40) || 'Empty'})`
            }
            break
          }
        } else {
          const errTxt = await res.text().catch(() => `HTTP ${res.status}`)
          const cls = classifyError(res.status, errTxt)
          lastErrorMsg = `HTTP ${res.status}: ${cls.reason}`
          // If model is not found or not allowed in subscription tier, try next candidate model for this provider
          if (cls.action === 'cooldown_model' && candidateModels.length > 1) {
            continue
          }
          break
        }
      } catch (e: any) {
        clearTimeout(timeoutId)
        lastErrorMsg = e.name === 'AbortError' ? 'Timeout (8s)' : (e.message || 'Lỗi mạng/CORS')
        break
      }
    }
    if (keySucceeded) {
      // Once we know which candidate model works for this provider, keep it first
      const idx = candidateModels.indexOf(activeModel)
      if (idx > 0) {
        candidateModels.splice(idx, 1)
        candidateModels.unshift(activeModel)
      }
    }
  }

  const totalLatency = bestLatency || Math.round(performance.now() - startTime)
  if (activeCount > 0) {
    return {
      ok: true,
      provider: normProvider,
      modelName: activeModel.name,
      latencyMs: totalLatency,
      activeKeyCount: activeCount,
      totalKeyCount: keysToTest.length,
      message: `Hoạt động tốt (${activeCount}/${sampleKeys.length} key phản hồi, ${totalLatency}ms)`
    }
  }

  return {
    ok: false,
    provider: normProvider,
    modelName: activeModel.name,
    latencyMs: totalLatency,
    activeKeyCount: 0,
    totalKeyCount: keysToTest.length,
    message: lastErrorMsg || 'Tất cả API Key đều không phản hồi'
  }
}


