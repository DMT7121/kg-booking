import type { AIModel } from '@/utils/constants'
import { callAIModel } from './aiProviderClient'
import { safeParseJSON } from '@/domain/ai/jsonRepair'
import { validateAIResult } from '@/domain/ai/aiResultValidator'
import { repairAndNormalizeJSON } from '@/domain/booking/bookingNormalizer'
import { repairBrokenJSONWithAI } from './aiRouter'
import { getTimeoutForModel } from './aiProviderClient'

export interface RaceRequest {
  systemPrompt: string
  userPrompt: string
  image: string | null
  fastModel: AIModel
  qualityModel: AIModel
  configKeys: Record<string, string[]>
  apiGatewayUrl?: string
  aiMode?: 'direct' | 'gateway'
  signal?: AbortSignal
  logCallback?: (msg: string, type?: 'info' | 'warning' | 'error' | 'success') => void
}

export interface RaceResult {
  acceptedFrom: 'fast' | 'quality' | 'fallback'
  parsed: any
  routing: {
    pipeline: 'text' | 'vision'
    tier_used: number
    model_used: string
    fallback_count: number
    repair_applied: boolean
    latency: string
    mode: string
  }
}

export async function runAsymmetricRace(request: RaceRequest): Promise<RaceResult> {
  const {
    systemPrompt,
    userPrompt,
    image,
    fastModel,
    qualityModel,
    configKeys,
    apiGatewayUrl,
    aiMode,
    signal,
    logCallback
  } = request

  const startTime = performance.now()
  let settled = false
  let fastError: any = null
  let qualityError: any = null

  const fastAbort = new AbortController()
  const qualityAbort = new AbortController()

  if (signal) {
    signal.addEventListener('abort', () => {
      fastAbort.abort()
      qualityAbort.abort()
    })
  }

  if (logCallback) {
    logCallback(`[Asymmetric Race] Bắt đầu cuộc đua song song: Fast Model [${fastModel.name}] vs Quality Model [${qualityModel.name}]...`, 'info')
  }

  const fastTimeoutMs = getTimeoutForModel(fastModel)
  const qualityTimeoutMs = getTimeoutForModel(qualityModel)

  return new Promise<RaceResult>((resolve, reject) => {
    // Timer to enforce timeouts
    const fastTimer = setTimeout(() => {
      fastAbort.abort()
      if (logCallback) {
        logCallback(`[Asymmetric Race] Fast Model [${fastModel.name}] quá hạn (${fastTimeoutMs / 1000}s). Hủy request.`, 'warning')
      }
      handleFastFailure(new Error('Fast model timeout'))
    }, fastTimeoutMs)

    const qualityTimer = setTimeout(() => {
      qualityAbort.abort()
      if (logCallback) {
        logCallback(`[Asymmetric Race] Quality Model [${qualityModel.name}] quá hạn (${qualityTimeoutMs / 1000}s). Hủy request.`, 'warning')
      }
      handleQualityFailure(new Error('Quality model timeout'))
    }, qualityTimeoutMs)

    function cleanup() {
      clearTimeout(fastTimer)
      clearTimeout(qualityTimer)
    }

    // --- Fast Model execution ---
    callAIModel({
      model: fastModel,
      sysPrompt: systemPrompt,
      userPrompt,
      image,
      jsonMode: true,
      localKeys: configKeys[fastModel.provider] || [],
      signal: fastAbort.signal,
      apiGatewayUrl,
      aiMode
    }, logCallback)
      .then(async (rawText) => {
        if (settled) return
        if (!rawText) {
          handleFastFailure(new Error('Empty response from fast model'))
          return
        }

        if (logCallback) {
          logCallback(`[Asymmetric Race] Fast Model [${fastModel.name}] đã trả về kết quả. Đang xác thực...`, 'info')
        }

        let parsed = safeParseJSON(rawText)
        let repairApplied = false
        if (!parsed) {
          parsed = await repairBrokenJSONWithAI(rawText, [fastModel], configKeys[fastModel.provider] || [], fastAbort.signal, logCallback)
          repairApplied = true
        }

        const normalized = repairAndNormalizeJSON(parsed, image ? 'chat_screenshot' : 'booking_text')
        const validation = validateAIResult(normalized)
        if (validation.accepted && normalized) {
          // Fast model is valid, settle immediately and abort quality model!
          settled = true
          qualityAbort.abort()
          cleanup()
          
          const latency = ((performance.now() - startTime) / 1000).toFixed(2)
          if (logCallback) {
            logCallback(`[Asymmetric Race] Fast Model [${fastModel.name}] thắng cuộc và được CHẤP NHẬN! Latency: ${latency}s`, 'success')
          }
          
          resolve({
            acceptedFrom: 'fast',
            parsed: validation.normalized || normalized,
            routing: {
              pipeline: image ? 'vision' : 'text',
              tier_used: fastModel.tier,
              model_used: fastModel.name,
              fallback_count: 0,
              repair_applied: repairApplied,
              latency,
              mode: 'race-fast-win'
            }
          })
        } else {
          // Fast model is invalid, we log and wait for the quality model
          const errMsg = validation.reasons.join(', ')
          if (logCallback) {
            logCallback(`[Asymmetric Race] Fast Model [${fastModel.name}] bị TỪ CHỐI do kiểm định lỗi: ${errMsg}. Đang đợi Quality Model...`, 'warning')
          }
          handleFastFailure(new Error(`Fast model validation failed: ${errMsg}`))
        }
      })
      .catch((err) => {
        handleFastFailure(err)
      })

    // --- Quality Model execution ---
    callAIModel({
      model: qualityModel,
      sysPrompt: systemPrompt,
      userPrompt,
      image,
      jsonMode: true,
      localKeys: configKeys[qualityModel.provider] || [],
      signal: qualityAbort.signal,
      apiGatewayUrl,
      aiMode
    }, logCallback)
      .then(async (rawText) => {
        if (settled) return
        if (!rawText) {
          handleQualityFailure(new Error('Empty response from quality model'))
          return
        }

        if (logCallback) {
          logCallback(`[Asymmetric Race] Quality Model [${qualityModel.name}] đã trả về kết quả. Đang xác thực...`, 'info')
        }

        let parsed = safeParseJSON(rawText)
        let repairApplied = false
        if (!parsed) {
          parsed = await repairBrokenJSONWithAI(rawText, [qualityModel], configKeys[qualityModel.provider] || [], qualityAbort.signal, logCallback)
          repairApplied = true
        }

        const normalized = repairAndNormalizeJSON(parsed, image ? 'chat_screenshot' : 'booking_text')
        const validation = validateAIResult(normalized)
        // For quality model, even if it has minor validation warnings, we accept it as fallback unless it's not JSON at all
        if (normalized) {
          settled = true
          fastAbort.abort()
          cleanup()
          
          const latency = ((performance.now() - startTime) / 1000).toFixed(2)
          if (logCallback) {
            logCallback(`[Asymmetric Race] Quality Model [${qualityModel.name}] được CHẤP NHẬN! Latency: ${latency}s`, 'success')
          }
          
          resolve({
            acceptedFrom: 'quality',
            parsed: validation.normalized || normalized,
            routing: {
              pipeline: image ? 'vision' : 'text',
              tier_used: qualityModel.tier,
              model_used: qualityModel.name,
              fallback_count: 1,
              repair_applied: repairApplied,
              latency,
              mode: 'race-quality-win'
            }
          })
        } else {
          handleQualityFailure(new Error('Quality model returned unparseable output'))
        }
      })
      .catch((err) => {
        handleQualityFailure(err)
      })

    function handleFastFailure(err: any) {
      if (settled) return
      fastError = err
      checkCompleteFailure()
    }

    function handleQualityFailure(err: any) {
      if (settled) return
      qualityError = err
      checkCompleteFailure()
    }

    function checkCompleteFailure() {
      if (fastError && qualityError) {
        cleanup()
        reject(new Error(`Cả hai mô hình trong cuộc đua đều thất bại. Fast error: ${fastError.message}. Quality error: ${qualityError.message}`))
      }
    }
  })
}
