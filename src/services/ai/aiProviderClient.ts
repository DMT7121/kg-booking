import { AI_TIMEOUTS } from '@/utils/constants'
import type { AIModel } from '@/utils/constants'
import * as api from '@/services/api'
import { handleModelFailure, isGatewayCircuitOpen, reportGatewaySuccess, reportGatewayFailure, cooldownModel } from './circuitBreaker'
import * as localKeyVault from '@/services/security/localKeyVault'
import { classifyError, AITransportPolicy } from './aiTransportPolicy'
import { geminiAdapter } from './providerAdapters/geminiAdapter'
import { openaiAdapter } from './providerAdapters/openaiAdapter'

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
    const { useConfigStore } = await import('@/stores/useConfigStore')
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
    if (localKeyVault.isUnlocked()) {
      effectiveLocalKeys = await localKeyVault.getKeysForProvider(model.provider)
    }
  }

  const adapter = model.format === 'gemini' ? geminiAdapter : openaiAdapter
  const baseTimeout = getTimeoutForModel(model)
  const directTimeout = getEWMALatency(modelId, baseTimeout)

  // define stages
  const stages: Array<() => Promise<string | null>> = []

  // Stage: Direct provider call
  const directCallStage = async (): Promise<string | null> => {
    const isBrowser = typeof window !== 'undefined'
    const hasKeys = effectiveLocalKeys.length > 0 || (model.provider === 'pollinations' && !isBrowser)
    if (!hasKeys) {
      if (logCallback) {
        logCallback(`[Model: ${model.name}] Gọi Direct không khả dụng trên trình duyệt (sử dụng Gateway).`, 'warning')
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

        const res = await fetch(url, {
          method: 'POST',
          headers,
          body,
          signal: controller.signal
        })

        clearTimeout(timeoutId)
        if (signal) signal.removeEventListener('abort', onAbort)

        if (!res.ok) {
          const status = res.status
          const errText = await res.text().catch(() => `HTTP ${status}`)
          
          // Classify the error
          const classification = classifyError(status, errText)
          if (logCallback) {
            logCallback(`[Model: ${model.name}] Lỗi Direct API (Key #${i + 1}): ${classification.reason} (${classification.action})`, 'warning')
          }

          if (classification.action === 'abort') {
            throw new Error('Request aborted by user')
          }
          if (classification.action === 'fatal_no_retry') {
            throw new Error(`Fatal AI Error: ${errText.substring(0, 150)}`)
          }
          if (classification.action === 'cooldown_model') {
            cooldownModel(modelId, classification.cooldownMs || 60000, classification.reason)
            return null // Skip to next stage (Gateway)
          }
          if (classification.action === 'switch_transport') {
            break // Break key loop to switch to next stage (Gateway)
          }
          // Retry next key for 'retry_next_key' or 'cooldown_key'
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
      const sharedSecret = import.meta.env.VITE_APP_SHARED_SECRET
      if (sharedSecret) {
        headers['Authorization'] = `Bearer ${sharedSecret}`
      }

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
        reportGatewayFailure('cloudflare_edge', `gateway_status_${status}`, errText)
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
