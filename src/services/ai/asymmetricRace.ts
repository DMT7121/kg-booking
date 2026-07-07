import type { AIModel } from '@/utils/constants'
import { callAIModel } from './aiProviderClient'
import { safeParseJSON } from '@/domain/ai/jsonRepair'
import { validateAIResult } from '@/domain/ai/aiResultValidator'
import { repairAndNormalizeJSON } from '@/domain/booking/bookingNormalizer'
import { repairBrokenJSONWithAI } from './aiRouter'
import { getTimeoutForModel } from './aiProviderClient'
import { isProviderCircuitOpen, reportProviderSuccess, handleModelFailure } from './circuitBreaker'

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

export type RaceMode = 'race' | 'sequential' | 'single_fast' | 'single_quality';

export function getAdaptiveRaceDecision(request: RaceRequest): { mode: RaceMode; reason: string } {
  const { userPrompt, image, fastModel, qualityModel } = request

  // 1. Connection check (Effective Type and Save Data)
  const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection
  if (conn) {
    if (conn.saveData) {
      return { mode: 'single_quality', reason: 'Save Data mode active' }
    }
    const type = conn.effectiveType
    if (type === '2g' || type === 'slow-2g' || type === '3g') {
      return { mode: 'single_quality', reason: `Slow network detected: ${type}` }
    }
  }

  // 2. Payload size check
  const promptLen = userPrompt.length + (request.systemPrompt?.length || 0)
  const imageLen = image ? image.length : 0
  const totalSize = promptLen + imageLen
  if (totalSize > 150_000) {
    return { mode: 'sequential', reason: 'Payload size too large (> 150KB)' }
  }

  // 3. Provider Stability / Circuit breaker check
  const fastOpen = isProviderCircuitOpen(fastModel.provider)
  const qualityOpen = isProviderCircuitOpen(qualityModel.provider)
  if (fastOpen && qualityOpen) {
    return { mode: 'single_fast', reason: 'Both model providers in cooldown' }
  }
  if (fastOpen) {
    return { mode: 'single_quality', reason: `Fast model provider [${fastModel.provider}] is in cooldown` }
  }
  if (qualityOpen) {
    return { mode: 'single_fast', reason: `Quality model provider [${qualityModel.provider}] is in cooldown` }
  }

  // 4. Input complexity check
  const isSimpleBooking = !image && userPrompt.length < 120
  if (isSimpleBooking) {
    return { mode: 'single_fast', reason: 'Simple short booking input' }
  }

  return { mode: 'race', reason: 'Healthy network, high complexity' }
}

async function runSingleModel(request: RaceRequest, model: AIModel, modeName: string): Promise<RaceResult> {
  const startTime = performance.now()
  const rawText = await callAIModel({
    model,
    sysPrompt: request.systemPrompt,
    userPrompt: request.userPrompt,
    image: request.image,
    jsonMode: true,
    localKeys: [],
    signal: request.signal,
    apiGatewayUrl: request.apiGatewayUrl,
    aiMode: request.aiMode
  }, request.logCallback)

  if (!rawText) throw new Error(`Empty response from model ${model.name}`)
  let parsed = safeParseJSON(rawText)
  let repairApplied = false
  if (!parsed) {
    parsed = await repairBrokenJSONWithAI(rawText, [model], [], request.signal, request.logCallback)
    repairApplied = true
  }
  const normalized = repairAndNormalizeJSON(parsed, request.image ? 'chat_screenshot' : 'booking_text')
  
  const validation = validateAIResult(normalized)
  const acceptedData = validation.accepted ? (validation.normalized || normalized) : normalized
  
  const latency = ((performance.now() - startTime) / 1000).toFixed(2)
  reportProviderSuccess(model.provider, performance.now() - startTime)
  return {
    acceptedFrom: model === request.fastModel ? 'fast' : 'quality',
    parsed: acceptedData,
    routing: {
      pipeline: request.image ? 'vision' : 'text',
      tier_used: model.tier,
      model_used: model.name,
      fallback_count: 0,
      repair_applied: repairApplied,
      latency,
      mode: modeName
    }
  }
}

async function runSequential(request: RaceRequest): Promise<RaceResult> {
  const startTime = performance.now()
  if (request.logCallback) {
    request.logCallback(`[Sequential Run] Thử Fast Model [${request.fastModel.name}] trước...`, 'info')
  }
  try {
    const res = await runSingleModel(request, request.fastModel, 'sequential-fast')
    const validation = validateAIResult(res.parsed)
    if (validation.accepted) {
      if (request.logCallback) {
        request.logCallback(`[Sequential Run] Fast Model thắng cuộc và được CHẤP NHẬN!`, 'success')
      }
      return res
    }
    if (request.logCallback) {
      request.logCallback(`[Sequential Run] Fast Model trả về dữ liệu không hợp lệ: ${validation.reasons.join(', ')}. Thử Quality Model...`, 'warning')
    }
  } catch (err: any) {
    if (request.logCallback) {
      request.logCallback(`[Sequential Run] Fast Model lỗi: ${err.message}. Thử Quality Model...`, 'warning')
    }
  }

  // Fallback to quality model
  return runSingleModel(request, request.qualityModel, 'sequential-quality')
}

export async function runAsymmetricRace(request: RaceRequest): Promise<RaceResult> {
  const decision = getAdaptiveRaceDecision(request)
  console.info('[AsymmetricRace] mode selected', decision)
  if (request.logCallback) {
    request.logCallback(`[AsymmetricRace] Chế độ được chọn: ${decision.mode} (Lý do: ${decision.reason})`, 'info')
  }

  if (decision.mode === 'single_fast') {
    return runSingleModel(request, request.fastModel, 'single-fast')
  }
  if (decision.mode === 'single_quality') {
    return runSingleModel(request, request.qualityModel, 'single-quality')
  }
  if (decision.mode === 'sequential') {
    return runSequential(request)
  }

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
    if (isProviderCircuitOpen(fastModel.provider)) {
      if (logCallback) {
        logCallback(`[Asymmetric Race] Bỏ qua Fast Model [${fastModel.name}] do provider [${fastModel.provider}] open circuit.`, 'warning')
      }
      handleFastFailure(new Error(`Provider ${fastModel.provider} circuit is open`))
    } else {
      callAIModel({
        model: fastModel,
        sysPrompt: systemPrompt,
        userPrompt,
        image,
        jsonMode: true,
        localKeys: [],
        signal: fastAbort.signal,
        apiGatewayUrl,
        aiMode
      }, logCallback)
        .then(async (rawText) => {
          if (settled) return
          if (!rawText) {
            const err = new Error('Empty response from fast model')
            handleModelFailure(fastModel.id, err)
            handleFastFailure(err)
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
          console.debug('[AsymmetricRace] Normalized fast model result before validation')
          const validation = validateAIResult(normalized)
          console.debug('[AsymmetricRace] Fast model validation result', { valid: validation.accepted, reason: validation.reasons.join(', ') })
          if (validation.accepted && normalized) {
            settled = true
            qualityAbort.abort()
            cleanup()
            
            const latency = ((performance.now() - startTime) / 1000).toFixed(2)
            if (logCallback) {
              logCallback(`[Asymmetric Race] Fast Model [${fastModel.name}] thắng cuộc và được CHẤP NHẬN! Latency: ${latency}s`, 'success')
            }
            
            reportProviderSuccess(fastModel.provider, performance.now() - startTime)
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
            const errMsg = validation.reasons.join(', ')
            if (logCallback) {
              logCallback(`[Asymmetric Race] Fast Model [${fastModel.name}] bị TỪ CHỐI do kiểm định lỗi: ${errMsg}. Đang đợi Quality Model...`, 'warning')
            }
            const err = new Error(`Fast model validation failed: ${errMsg}`)
            handleModelFailure(fastModel.id, err)
            handleFastFailure(err)
          }
        })
        .catch((err) => {
          handleModelFailure(fastModel.id, err)
          handleFastFailure(err)
        })
    }

    // --- Quality Model execution ---
    if (isProviderCircuitOpen(qualityModel.provider)) {
      if (logCallback) {
        logCallback(`[Asymmetric Race] Bỏ qua Quality Model [${qualityModel.name}] do provider [${qualityModel.provider}] open circuit.`, 'warning')
      }
      handleQualityFailure(new Error(`Provider ${qualityModel.provider} circuit is open`))
    } else {
      callAIModel({
        model: qualityModel,
        sysPrompt: systemPrompt,
        userPrompt,
        image,
        jsonMode: true,
        localKeys: [],
        signal: qualityAbort.signal,
        apiGatewayUrl,
        aiMode
      }, logCallback)
        .then(async (rawText) => {
          if (settled) return
          if (!rawText) {
            const err = new Error('Empty response from quality model')
            handleModelFailure(qualityModel.id, err)
            handleQualityFailure(err)
            return
          }

          if (logCallback) {
            logCallback(`[Asymmetric Race] Quality Model [${qualityModel.name}] đã trả về kết quả. Đang xác thực...`, 'info')
          }

          let parsed = safeParseJSON(rawText)
          let repairApplied = false
          if (!parsed) {
            parsed = await repairBrokenJSONWithAI(rawText, [qualityModel], [], qualityAbort.signal, logCallback)
            repairApplied = true
          }

          const normalized = repairAndNormalizeJSON(parsed, image ? 'chat_screenshot' : 'booking_text')
          console.debug('[AsymmetricRace] Normalized quality model result before validation')
          const validation = validateAIResult(normalized)
          if (normalized) {
            settled = true
            fastAbort.abort()
            cleanup()
            
            const latency = ((performance.now() - startTime) / 1000).toFixed(2)
            if (logCallback) {
              logCallback(`[Asymmetric Race] Quality Model [${qualityModel.name}] được CHẤP NHẬN! Latency: ${latency}s`, 'success')
            }
            
            reportProviderSuccess(qualityModel.provider, performance.now() - startTime)
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
            const err = new Error('Quality model returned unparseable output')
            handleModelFailure(qualityModel.id, err)
            handleQualityFailure(err)
          }
        })
        .catch((err) => {
          handleModelFailure(qualityModel.id, err)
          handleQualityFailure(err)
        })
    }

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
