import { classifyPeopleNames, extractByRules } from '@/domain/ai/ruleEngine'
import { safeParseJSON } from '@/domain/ai/jsonRepair'
import { repairAndNormalizeJSON, validateParsedFields } from '@/domain/booking/bookingNormalizer'
import { callAIModel } from './aiProviderClient'
import type { AIModel } from '@/utils/constants'
import { runAsymmetricRace } from './asymmetricRace'
import { getModelPolicy } from './modelPolicy'
import { BOOKING_EXTRACTION_SCHEMA } from '@/domain/ai/bookingExtractionSchema'

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
    logCallback('Phat hien JSON loi cau truc. Dang kich hoat AI sua loi...', 'warning')
  }
  const repairPrompt = `Fix this broken JSON. Return ONLY valid JSON, nothing else:\n\n${badString.substring(0, 2000)}`
  const repairCandidates = candidates
    .filter(m => m.type === 'text')
    .sort((a, b) => a.tier - b.tier)
  
  if (repairCandidates.length === 0) {
    if (logCallback) logCallback('Khong tim thay model AI de sua JSON.', 'error')
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
      if (logCallback) logCallback('Tu dong sua JSON thanh cong!', 'success')
    } else {
      if (logCallback) logCallback('Tu dong sua JSON that bai.', 'error')
    }
    return parsed
  } catch (e: any) {
    if (logCallback) logCallback(`Tu dong sua JSON that bai: ${e.message}`, 'error')
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
    logCallback(`[AI Router] Model kha dung: ${candidates.map(c => c.name).join(', ')}`)
  }
  if (candidates.length === 0) {
    if (logCallback) {
      logCallback(`[AI Router] Loi: Chua cau hinh API Key cho ${type === 'text' ? 'Text' : 'Vision'}`, 'error')
    }
    throw new Error(`Chua cau hinh API Key cho ${type === 'text' ? 'Text' : 'Vision'}`)
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

  const raceEnabled = import.meta.env.VITE_AI_RACE_MODE !== 'false'

  if (runRace && raceEnabled) {
    const [m1, m2] = candidates.slice(0, 2)
    if (loadingSubMsgCallback) {
      loadingSubMsgCallback(`⚡ Asymmetric Race: ${m1.name} vs ${m2.name}...`)
    }
    try {
      const raceRes = await runAsymmetricRace({
        systemPrompt: sysPrompt,
        userPrompt,
        image,
        fastModel: m1,
        qualityModel: m2,
        configKeys,
        apiGatewayUrl,
        aiMode,
        signal,
        logCallback
      })
      return {
        parsed: raceRes.parsed,
        routing: raceRes.routing
      }
    } catch (e: any) {
      if (logCallback) {
        logCallback(`[AI Router] Asymmetric Race that bai: ${e.message}. Chuyen sang Waterfall...`, 'warning')
      }
      fallbackCount += 2
      lastError = e
    }
  }

  const waterfallStart = (runRace && raceEnabled) ? 2 : 0
  const strictJsonEnabled = import.meta.env.VITE_AI_STRICT_JSON !== 'false'

  for (let i = waterfallStart; i < candidates.length; i++) {
    const model = candidates[i]
    try {
      const policy = getModelPolicy(model)
      if (loadingSubMsgCallback) {
        loadingSubMsgCallback(`Waterfall (Tier ${model.tier}): ${model.name}...`)
      }
      if (logCallback) {
        logCallback(`[AI Router] Waterfall (Tier ${model.tier}): Thu goi model [${model.name}]...`)
      }
      const controller = new AbortController()
      if (signal) {
        signal.addEventListener('abort', () => controller.abort())
      }
      
      const timeoutMs = policy.defaultTimeoutMs
      const timeoutPromise = new Promise<null>((_, reject) => {
        setTimeout(() => {
          controller.abort()
          reject(new Error(`Timeout model ${model.name}`))
        }, timeoutMs)
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
        aiMode,
        responseSchema: (strictJsonEnabled && policy.supportsJsonSchema) ? BOOKING_EXTRACTION_SCHEMA : undefined,
        maxOutputTokens: policy.maxOutputTokens,
        temperature: policy.temperature
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
                logCallback(`[AI Router] Model [${model.name}] (Tier 0) khong vuot qua kiem dinh: do tin cay thap (${overallConf}) hoac thieu thong tin cot loi (SDT, ngay, gio). Chuyen sang model tiep theo.`, 'warning')
              }
            }
          }
          
          if (!needsFallback) {
            if (logCallback) {
              logCallback(`[AI Router] Model [${model.name}] trich xuat thanh cong!`, 'success')
            }
            return finalizeResult(parsed, model, 'waterfall', repairApplied)
          }
          fallbackCount++
        }
      }
      throw new Error(`Invalid output format or validation failed from ${model.name}`)
    } catch (e: any) {
      if (logCallback) {
        logCallback(`[AI Router] Model [${model.name}] that bai: ${e.message}`, 'warning')
      }
      fallbackCount++
      lastError = e
    }
  }
  
  if (logCallback) {
    logCallback(`[AI Router] Tat ca cac model AI deu that bai. Loi cuoi: ${lastError?.message || 'Khong co model kha dung'}`, 'error')
  }
  throw new Error('Tat ca cac model AI deu that bai. Loi cuoi: ' + (lastError?.message || 'Khong co model kha dung'))
}
