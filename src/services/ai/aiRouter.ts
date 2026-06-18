import { classifyPeopleNames, extractByRules } from '@/domain/ai/ruleEngine'
import { safeParseJSON } from '@/domain/ai/jsonRepair'
import { repairAndNormalizeJSON, validateParsedFields } from '@/domain/booking/bookingNormalizer'
import { callAIModel } from './aiProviderClient'
import type { AIModel } from '@/utils/constants'

export interface AIRoutingInfo {
  pipeline: 'text' | 'vision'
  tier_used: number
  model_used: string
  fallback_count: number
  repair_applied: boolean
  latency: string
  mode: string
}

export interface AIRouterResult {
  parsed: any
  routing: AIRoutingInfo
}

export async function repairBrokenJSONWithAI(
  badString: string,
  candidates: AIModel[],
  localKeys: string[],
  signal?: AbortSignal,
  logCallback?: (msg: string, type?: 'info' | 'warning' | 'error' | 'success') => void
): Promise<any> {
  if (logCallback) {
    logCallback('Phát hiện dữ liệu JSON bị lỗi cấu trúc. Đang kích hoạt AI tự động sửa (repair)...', 'warning')
  }
  const repairPrompt = `Fix this broken JSON. Return ONLY valid JSON, nothing else:\n\n${badString.substring(0, 2000)}`
  const repairCandidates = candidates
    .filter(m => m.type === 'text')
    .sort((a, b) => a.tier - b.tier)
  
  if (repairCandidates.length === 0) {
    if (logCallback) logCallback('Không tìm thấy model AI khả dụng để tự động sửa lỗi JSON.', 'error')
    return null
  }
  
  try {
    const fixedStr = await callAIModel({
      model: repairCandidates[0],
      sysPrompt: 'Return ONLY valid JSON',
      userPrompt: repairPrompt,
      jsonMode: true,
      localKeys,
      signal
    }, logCallback)
    
    const parsed = safeParseJSON(fixedStr || '')
    if (parsed) {
      if (logCallback) logCallback('Tự động sửa lỗi JSON thành công!', 'success')
    } else {
      if (logCallback) logCallback('Tự động sửa lỗi JSON thất bại. Kết quả trả về không phải JSON hợp lệ.', 'error')
    }
    return parsed
  } catch (e: any) {
    if (logCallback) logCallback(`Tự động sửa lỗi JSON thất bại: ${e.message}`, 'error')
    return null
  }
}

export async function runAIRouter(request: {
  type: 'text' | 'vision'
  sysPrompt: string
  userPrompt: string
  image: string | null
  inputType: string
  signal?: AbortSignal
  availableModels: AIModel[]
  defaultModelId: string
  configKeys: Record<string, string[]>
  keysStatus: Record<string, { configured: boolean }>
  apiGatewayUrl?: string
  aiMode?: 'direct' | 'gateway'
  logCallback?: (msg: string, type?: 'info' | 'warning' | 'error' | 'success') => void
  loadingSubMsgCallback?: (msg: string) => void
}): Promise<AIRouterResult> {
  const {
    type,
    sysPrompt,
    userPrompt,
    image,
    inputType,
    signal,
    availableModels,
    defaultModelId,
    configKeys,
    keysStatus,
    apiGatewayUrl,
    aiMode,
    logCallback,
    loadingSubMsgCallback
  } = request

  let candidates = availableModels
    .filter(m => m.type === type)
    .filter(m => m.provider === 'pollinations' || keysStatus[m.provider]?.configured)
    
  candidates.sort((a, b) => {
    if (a.id === defaultModelId) return -1
    if (b.id === defaultModelId) return 1
    return a.tier - b.tier
  })
  
  if (logCallback) {
    logCallback(`[AI Router] Các model AI khả dụng: ${candidates.map(c => c.name).join(', ')}`)
  }
  if (candidates.length === 0) {
    if (logCallback) {
      logCallback(`[AI Router] Lỗi: Chưa cấu hình API Key cho ${type === 'text' ? 'Text' : 'Vision'}`, 'error')
    }
    throw new Error(`Chưa cấu hình API Key cho ${type === 'text' ? 'Text' : 'Vision'}`)
  }

  let runRace = false
  if (candidates.length >= 2) {
    const [m1, m2] = candidates.slice(0, 2)
    if (m1.tier <= 2 && m2.tier <= 2) {
      const hasImage = !!image
      const isLongText = userPrompt.length > 150
      const isMixedOrMenu = ['mixed_booking_menu', 'menu_order_text', 'chat_screenshot', 'deposit_bill_image'].includes(inputType)
      const nameResults = classifyPeopleNames(userPrompt)
      const hasMultipleNames = nameResults.peopleNames.length > 1
      const timeRegex = /\b(\d{1,2})[h:](\d{2})?\b/gi
      const timesCount = (userPrompt.match(timeRegex) || []).length
      const hasMultipleTimes = timesCount > 1
      const moneyRegex = /\b\d+\s*(?:k|vnd|trieu|cu|trn|tr)\b/gi
      const moneyCount = (userPrompt.match(moneyRegex) || []).length
      const hasMultipleAmounts = moneyCount > 1

      if (hasImage || isLongText || isMixedOrMenu || hasMultipleNames || hasMultipleTimes || hasMultipleAmounts) {
        runRace = true
      }
    }
  }

  const startTime = performance.now()
  let fallbackCount = 0
  let lastError: Error | null = null

  const finalizeResult = (parsed: any, model: AIModel, mode: string, repairApplied = false): AIRouterResult => {
    const latency = ((performance.now() - startTime) / 1000).toFixed(1)
    return {
      parsed,
      routing: {
        pipeline: type,
        tier_used: model.tier,
        model_used: model.name,
        fallback_count: fallbackCount,
        repair_applied: repairApplied,
        latency,
        mode
      }
    }
  }

  if (runRace) {
    const [m1, m2] = candidates.slice(0, 2)
    if (loadingSubMsgCallback) {
      loadingSubMsgCallback(`⚡ Race Mode: ${m1.name} vs ${m2.name}...`)
    }
    if (logCallback) {
      logCallback(`[AI Router] Kích hoạt Chế độ Chạy đua (Race Mode): [${m1.name}] song song với [${m2.name}]...`, 'info')
    }
    
    try {
      const raceResult = await new Promise<{ raw: string | null; model: AIModel }>((resolve, reject) => {
        let settled = false
        let errors = 0
        const controller1 = new AbortController()
        const controller2 = new AbortController()
        
        if (signal) {
          signal.addEventListener('abort', () => {
            controller1.abort()
            controller2.abort()
          })
        }
        
        const handleSuccess = (raw: string | null, model: AIModel, otherController: AbortController) => {
          if (!settled && raw) {
            settled = true
            otherController.abort()
            resolve({ raw, model })
          } else {
            errors++
            if (errors >= 2 && !settled) reject(new Error('Both race models failed'))
          }
        }
        
        const handleFailure = (err: any) => {
          errors++
          if (errors >= 2 && !settled) reject(new Error('Both race models failed: ' + err.message))
        }

        callAIModel({
          model: m1,
          sysPrompt,
          userPrompt,
          image,
          jsonMode: true,
          localKeys: configKeys[m1.provider] || [],
          signal: controller1.signal,
          apiGatewayUrl,
          aiMode
        }, logCallback)
          .then(r => handleSuccess(r, m1, controller2))
          .catch(err => handleFailure(err))
          
        callAIModel({
          model: m2,
          sysPrompt,
          userPrompt,
          image,
          jsonMode: true,
          localKeys: configKeys[m2.provider] || [],
          signal: controller2.signal,
          apiGatewayUrl,
          aiMode
        }, logCallback)
          .then(r => handleSuccess(r, m2, controller1))
          .catch(err => handleFailure(err))
      })

      if (raceResult.raw) {
        if (logCallback) {
          logCallback(`[AI Router] Model thắng cuộc đua: [${raceResult.model.name}]`, 'success')
        }
        let parsed = safeParseJSON(raceResult.raw)
        let repairApplied = false
        if (!parsed) {
          parsed = await repairBrokenJSONWithAI(raceResult.raw, candidates, configKeys[raceResult.model.provider] || [], signal, logCallback)
          repairApplied = true
        }
        if (parsed) {
          return finalizeResult(parsed, raceResult.model, 'race', repairApplied)
        }
      }
    } catch (e: any) {
      if (logCallback) {
        logCallback(`[AI Router] Chế độ Race Mode thất bại (Lỗi: ${e.message}). Chuyển sang chế độ tuần tự (Waterfall)...`, 'warning')
      }
      fallbackCount += 2
      lastError = e
    }
  }

  const waterfallStart = runRace ? 2 : 0
  for (let i = waterfallStart; i < candidates.length; i++) {
    const model = candidates[i]
    try {
      if (loadingSubMsgCallback) {
        loadingSubMsgCallback(`Waterfall (Tier ${model.tier}): ${model.name}...`)
      }
      if (logCallback) {
        logCallback(`[AI Router] Waterfall (Tier ${model.tier}): Thử gọi model [${model.name}]...`)
      }
      const controller = new AbortController()
      if (signal) {
        signal.addEventListener('abort', () => controller.abort())
      }
      
      const getTimeoutForModel = (m: AIModel): number => {
        if (m.type === 'vision') return 20000
        const p = m.provider.toLowerCase()
        if (p === 'groq' || p === 'cerebras' || p === 'sambanova') {
          return 6000
        }
        if (p === 'google' || p === 'mistral' || p === 'github') {
          return 10000
        }
        return 15000
      }

      const timeoutPromise = new Promise<null>((_, reject) => {
        setTimeout(() => {
          controller.abort()
          reject(new Error(`Timeout model ${model.name}`))
        }, getTimeoutForModel(model))
      })
      
      const apiCallPromise = callAIModel({
        model,
        sysPrompt,
        userPrompt,
        image,
        jsonMode: true,
        localKeys: configKeys[model.provider] || [],
        signal: controller.signal,
        apiGatewayUrl,
        aiMode
      }, logCallback)
      
      const rawResult = await Promise.race([apiCallPromise, timeoutPromise])
      if (rawResult) {
        let parsed = safeParseJSON(rawResult)
        let repairApplied = false
        if (!parsed) {
          parsed = await repairBrokenJSONWithAI(rawResult, candidates, configKeys[model.provider] || [], signal, logCallback)
          repairApplied = true
        }
        if (parsed) {
          const normalizedParsed = repairAndNormalizeJSON(parsed, inputType)
          const validated = validateParsedFields(normalizedParsed)
          const isTier0 = model.tier === 0
          let needsFallback = false
          
          if (isTier0) {
            const overallConf = validated.confidence?.overall || 0.8
            const ruleBasedResult = extractByRules(userPrompt)
            
            const missingPhone = !validated.customer?.phone && !!ruleBasedResult.phone
            const missingDate = !(validated.booking?.date || validated.booking?.event_date) && !!ruleBasedResult.event_date
            const missingTime = !(validated.booking?.time || validated.booking?.event_time) && !!ruleBasedResult.event_time
            
            if (overallConf < 0.75 || missingPhone || missingDate || missingTime) {
              needsFallback = true
              if (logCallback) {
                logCallback(`[AI Router] Model [${model.name}] (Tier 0) không vượt qua kiểm định: độ tin cậy thấp (${overallConf}) hoặc thiếu thông tin cốt lõi (SĐT, ngày, giờ). Chuyển sang model tiếp theo.`, 'warning')
              }
            }
          }
          
          if (!needsFallback) {
            if (logCallback) {
              logCallback(`[AI Router] Model [${model.name}] trích xuất thành công!`, 'success')
            }
            return finalizeResult(parsed, model, 'waterfall', repairApplied)
          }
          fallbackCount++
        }
      }
      throw new Error(`Invalid output format or validation failed from ${model.name}`)
    } catch (e: any) {
      if (logCallback) {
        logCallback(`[AI Router] Model [${model.name}] thất bại: ${e.message}`, 'warning')
      }
      fallbackCount++
      lastError = e
    }
  }
  
  if (logCallback) {
    logCallback(`[AI Router] Tất cả các model AI đều thất bại. Lỗi cuối: ${lastError?.message || 'Không có model khả dụng'}`, 'error')
  }
  throw new Error('Tất cả các model AI đều thất bại. Lỗi cuối: ' + (lastError?.message || 'Không có model khả dụng'))
}
