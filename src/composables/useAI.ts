import { useUIStore } from '@/stores/useUIStore'
import { useFormStore } from '@/stores/useFormStore'
import { useConfigStore } from '@/stores/useConfigStore'
import { useAppStore } from '@/stores/useAppStore'
import { parseJSON, resizeImage, stripAccents, formatVND, formatSetNote, cleanPhoneNumber, formatDateStr } from '@/utils'
import { AI_MODELS, SETS, ADVANCED_AI_PROMPT, IMAGE_OCR_PROMPT } from '@/utils/constants'
import type { AIModel } from '@/utils/constants'
import * as api from '@/services/api'
import { getCachedMenu, cacheMenu } from '@/services/cache'

/**
 * AI Core v6.0 APEX — Maximum Performance Engine
 * 
 * V6.0 UPGRADES:
 * - GPT-OSS 120B (2000+ tok/s) as Tier 0 on Cerebras & Groq
 * - Race mode: top 2 models fire simultaneously
 * - Response cache: instant results on repeated inputs (5min TTL)
 * - Schema validation: verify AI output has required fields
 * - 15s timeout with auto-fallback
 * - Fuzzy 3-level menu matching
 * - Dual-schema normalizer (V6 + legacy flat)
 */
export function useAI() {
  const uiStore = useUIStore()
  const formStore = useFormStore()
  const configStore = useConfigStore()
  const appStore = useAppStore()

  // Response cache (5 min TTL)
  const responseCache = new Map<string, { data: any; timestamp: number }>()
  const CACHE_TTL = 5 * 60 * 1000

  function getCacheKey(prompt: string): string {
    return prompt.substring(0, 200).replace(/\s+/g, ' ').trim()
  }

  function getCached(key: string): any | null {
    const entry = responseCache.get(key)
    if (entry && Date.now() - entry.timestamp < CACHE_TTL) return entry.data
    if (entry) responseCache.delete(key)
    return null
  }

  function setCache(key: string, data: any) {
    // Keep cache small — max 20 entries
    if (responseCache.size >= 20) {
      const oldest = responseCache.keys().next().value
      if (oldest) responseCache.delete(oldest)
    }
    responseCache.set(key, { data, timestamp: Date.now() })
  }

  // ═══════════════════════════════════════════════════════════════
    async function callAIModel(model: AIModel, sysPrompt: string, userPrompt: string, image: string | null = null, jsonMode: boolean = true): Promise<string | null> {
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
      })
      if (!res.ok) {
        throw new Error(res.message || 'AI Proxy failed')
      }
      return res.content
    } catch (e: any) {
      console.warn(`[AI Proxy] ${model.provider} failed: ${e.message}`)
      throw e
    }


  // ═══════════════════════════════════════════════════════════════
  //  SYNERGY: Auto-repair malformed JSON via a text model
  // ═══════════════════════════════════════════════════════════════
  async function repairJSON(badString: string): Promise<any> {
    uiStore.loading.subMsg = '🔧 Auto-repair JSON...'
    const repairPrompt = `Fix this broken JSON. Return ONLY valid JSON, nothing else:\n\n${badString.substring(0, 2000)}`
    
    // Use fastest available text model for repair
    const repairCandidates = AI_MODELS
      .filter(m => m.type === 'text')
      .filter(m => m.provider === 'pollinations' || (configStore.keysStatus[m.provider]?.configured))
      .sort((a, b) => a.tier - b.tier)
    
    if (repairCandidates.length === 0) return null
    
    try {
      const fixedStr = await callAIModel(repairCandidates[0], 'Return ONLY valid JSON', repairPrompt)
      return parseJSON(fixedStr || '')
    } catch {
      return null
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  SCHEMA VALIDATOR: Verify AI output has required fields
  // ═══════════════════════════════════════════════════════════════
  function validateSchema(parsed: any): boolean {
    if (!parsed || typeof parsed !== 'object') return false
    // Must have at least one meaningful section
    const hasCustomer = parsed.customer && (parsed.customer.name || parsed.customer.phone)
    const hasReservation = parsed.reservation && (parsed.reservation.date || parsed.reservation.time || parsed.reservation.pax || parsed.reservation.table_code)
    const hasItems = Array.isArray(parsed.items) && parsed.items.length > 0 && parsed.items[0].name
    // Legacy flat schema check
    const hasLegacyCustomer = parsed.customer && (parsed.customer.date || parsed.customer.time || parsed.customer.tables)
    const hasLegacyItems = Array.isArray(parsed.menuItems) && parsed.menuItems.length > 0
    return hasCustomer || hasReservation || hasItems || hasLegacyCustomer || hasLegacyItems
  }

  // ═══════════════════════════════════════════════════════════════
  //  SMART ROUTER V6.0 — Race Mode + Waterfall + Cache
  // ═══════════════════════════════════════════════════════════════
  async function smartRouter(type: 'text' | 'vision', sysPrompt: string, userPrompt: string, image: string | null = null) {
    const defaultId = type === 'vision' ? configStore.defaults.vision : configStore.defaults.text
    
    // ── CACHE CHECK: Instant return if we've seen this before ──
    if (!image) {
      const cacheKey = getCacheKey(type + ':' + userPrompt)
      const cached = getCached(cacheKey)
      if (cached) {
        cached.routing = { ...cached.routing, mode: 'cache', latency: '0.0' }
        return cached
      }
    }

    // Build candidate list: default first, then by tier
    const candidates = AI_MODELS
      .filter(m => m.type === type)
      .filter(m => m.provider === 'pollinations' || (configStore.keysStatus[m.provider]?.configured))
      .sort((a, b) => {
        if (a.id === defaultId) return -1
        if (b.id === defaultId) return 1
        return a.tier - b.tier
      })

    if (candidates.length === 0) {
      throw new Error(`Chưa cấu hình API Key cho ${type === 'text' ? 'Text' : 'Vision'}. Vào Cài đặt → AI Core v6.0 để thêm.`)
    }

    let fallbackCount = 0
    let lastError: Error | null = null
    const startTime = performance.now()

    // Helper: validate, inject routing, cache, return
    const finalize = (parsed: any, model: AIModel, repairApplied: boolean, mode: string) => {
      if (!validateSchema(parsed)) return null
      const latency = ((performance.now() - startTime) / 1000).toFixed(1)
      parsed.routing = {
        pipeline: type, tier_used: model.tier,
        model_used: model.name, fallback_count: fallbackCount,
        repair_applied: repairApplied, latency, mode,
        confidence_score: typeof parsed.menu_selection?.confidence === 'number' ? parsed.menu_selection.confidence : 1.0
      }
      // Cache for next time
      if (!image) setCache(getCacheKey(type + ':' + userPrompt), parsed)
      return parsed
    }

    // ── RACE MODE: Fire top 2 models simultaneously, use first success ──
    if (candidates.length >= 2) {
      const [m1, m2] = candidates.slice(0, 2)
      uiStore.loading.subMsg = `⚡ Race: ${m1.name} vs ${m2.name}...`
      
      try {
        const raceResult = await new Promise<{ raw: string | null; model: AIModel }>((resolve, reject) => {
          let settled = false
          let errors = 0
          const tryResolve = (raw: string | null, model: AIModel) => {
            if (!settled && raw) { settled = true; resolve({ raw, model }) }
            else { errors++; if (errors >= 2 && !settled) reject(new Error('Both race models failed')) }
          }
          callAIModel(m1, sysPrompt, userPrompt, image).then(r => tryResolve(r, m1)).catch(() => tryResolve(null, m1))
          callAIModel(m2, sysPrompt, userPrompt, image).then(r => tryResolve(r, m2)).catch(() => tryResolve(null, m2))
        })
        
        if (raceResult.raw) {
          let parsed = parseJSON(raceResult.raw)
          if (!parsed) parsed = await repairJSON(raceResult.raw)
          const result = parsed ? finalize(parsed, raceResult.model, false, 'race') : null
          if (result) return result
        }
      } catch {
        console.warn('[AI] Race mode failed, falling back to waterfall...')
        fallbackCount = 2
      }
    }

    // ── WATERFALL MODE: Try each model sequentially ──
    const waterfallStart = candidates.length >= 2 ? 2 : 0
    for (let i = waterfallStart; i < candidates.length; i++) {
      const model = candidates[i]
      try {
        uiStore.loading.subMsg = `Tier ${model.tier}: ${model.name}...`
        const rawResult = await callAIModel(model, sysPrompt, userPrompt, image)

        let parsedJSON = parseJSON(rawResult || '')
        let repairApplied = false

        if (!parsedJSON && rawResult) {
          parsedJSON = await repairJSON(rawResult)
          repairApplied = true
        }

        if (parsedJSON) {
          const result = finalize(parsedJSON, model, repairApplied, 'waterfall')
          if (result) return result
          throw new Error('Schema validation failed')
        } else {
          throw new Error('Cannot extract JSON structure')
        }
      } catch (e: any) {
        console.warn(`[AI] ${model.name} failed:`, e.message)
        fallbackCount++
        lastError = e
      }
    }
    throw new Error('Pipeline V6.0 thất bại. Lỗi cuối: ' + (lastError?.message || 'Không có model khả dụng'))
  }

  // ═══════════════════════════════════════════════════════════════
  //  NORMALIZER: Dual-schema (V5 + legacy flat) → unified format
  // ═══════════════════════════════════════════════════════════════
  function normalizeAIResponse(raw: any): any {
    if (!raw) return null
    
    // V5 schema (has reservation object) → pass through
    if (raw.reservation) return raw
    
    // Legacy flat schema (customer contains date/time/pax/tables)
    if (raw.customer && (raw.customer.date || raw.customer.time || raw.customer.pax || raw.customer.tables)) {
      return {
        customer: { name: raw.customer.name || null, phone: raw.customer.phone || null },
        reservation: {
          date: raw.customer.date || null,
          time: raw.customer.time || null,
          pax: raw.customer.pax || null,
          table_code: raw.customer.tables || raw.customer.table_code || null,
          type: raw.customer.type || null,
          notes: raw.customer.note || raw.customer.notes || null
        },
        items: (raw.menuItems || raw.items || []).map((i: any) => ({
          name: i.name, qty: i.qty || 1, price: i.price || null,
          notes: i.notes || i.note || null
        })),
        payment: raw.payment || null,
        routing: raw.routing
      }
    }
    
    // Unknown format but has items → minimal normalization
    if (raw.items && Array.isArray(raw.items)) {
      return {
        customer: raw.customer || {},
        reservation: raw.reservation || {},
        items: raw.items,
        payment: raw.payment || null,
        routing: raw.routing
      }
    }
    
    return raw
  }

  // ═══════════════════════════════════════════════════════════════
  //  TABLE PARSER: 4-case robust normalization (from legacy)
  // ═══════════════════════════════════════════════════════════════
  function ruleBasedParse(text: string) {
    const clean = stripAccents(text).toLowerCase()
    
    // 1. Phone number
    const phoneRegex = /(0[35789]\d{8})/g
    const phoneMatch = text.match(phoneRegex)
    const phone = phoneMatch ? phoneMatch[0] : null
    
    // 2. Pax
    const paxRegex = /(\d+)\s*(?:pax|nguoi|khach)/gi
    const paxMatch = clean.match(paxRegex)
    let pax = null
    if (paxMatch) {
      const matchNum = paxMatch[0].match(/\d+/)
      if (matchNum) pax = parseInt(matchNum[0])
    }
    
    // 3. Time
    const timeRegex = /(\d{1,2})[h:g](\d{2})?/gi
    const timeMatch = clean.match(timeRegex)
    let time = null
    if (timeMatch) {
      for (const t of timeMatch) {
        const parts = t.split(/[h:g]/i)
        const hour = parseInt(parts[0])
        const min = parts[1] ? parseInt(parts[1]) : 0
        if (hour >= 8 && hour <= 23 && min >= 0 && min < 60) {
          time = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`
          break
        }
      }
    }
    
    // 4. Date
    const dateRegex = /(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/g
    const dateMatch = clean.match(dateRegex)
    let date = null
    if (dateMatch) {
      const dParts = dateMatch[0].split(/[/-]/)
      const day = parseInt(dParts[0])
      const month = parseInt(dParts[1])
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        const year = dParts[2] ? (dParts[2].length === 2 ? '20' + dParts[2] : dParts[2]) : new Date().getFullYear()
        date = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`
      }
    } else {
      const today = new Date()
      if (/hom nay|nay/i.test(clean)) {
        date = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`
      } else if (/mai|ngay mai/i.test(clean)) {
        const tomorrow = new Date(today)
        tomorrow.setDate(today.getDate() + 1)
        date = `${String(tomorrow.getDate()).padStart(2, '0')}/${String(tomorrow.getMonth() + 1).padStart(2, '0')}/${tomorrow.getFullYear()}`
      }
    }

    // 5. Table code
    const tableRegex = /\b([a-g]\d{1,2})\b/gi
    const tableMatch = clean.match(tableRegex)
    const table_code = tableMatch ? tableMatch[0].toUpperCase() : null

    // 6. Party Type / Purpose
    let type = 'Ăn thường'
    if (/sinh nhat|sn|thoi noi|mung tho/i.test(clean)) type = 'Sinh nhật'
    else if (/lien hoan|tiec|hop lop|cong ty|tat nien/i.test(clean)) type = 'Liên hoan'
    else if (/hen ho|lang mang|ky niem/i.test(clean)) type = 'Hẹn hò'

    // 7. Name
    const nameMatch = text.match(/(?:anh|chi|chu|co|khach|ten|dat)\s+([A-ZÀ-Ỹa-zà-ỹ]+(?:\s+[A-ZÀ-Ỹa-zà-ỹ]+){0,3})/u)
    let name = null
    if (nameMatch) {
      const candidate = nameMatch[1].trim()
      if (!/^(mai|nay|kia|truoc|sau|sang|chieu|toi|ngay|gio|pax|khach|nguoi|ban)$/i.test(candidate)) {
        name = candidate
      }
    }

    return {
      customer: { name, phone },
      reservation: { date, time, pax, table_code, type, notes: null },
      items: []
    }
  }

  function parseTableCode(code: string | null | undefined) {
    if (!code) return null
    const s = String(code).trim().toUpperCase()
    // Zone + Number: "B5", "C12"
    const full = s.match(/^([A-G])(\d+)$/)
    if (full) return { zone: full[1], number: full[2] }
    // Number only: "5" → default Zone A
    const numOnly = s.match(/^(\d+)$/)
    if (numOnly) return { zone: 'A', number: numOnly[1] }
    // Zone only: "C"
    const zoneOnly = s.match(/^([A-G])$/)
    if (zoneOnly) return { zone: zoneOnly[1], number: '' }
    return null
  }

  // ═══════════════════════════════════════════════════════════════
  //  FUZZY MENU MATCHER: exact → clean → contains → partial
  // ═══════════════════════════════════════════════════════════════
  function fuzzyMatchMenu(inputName: string) {
    const menuList = appStore.menuList
    if (!menuList || menuList.length === 0) return null
    
    const clean = stripAccents(inputName).toLowerCase().trim()

    // check Menu Aliases first
    if (appStore.menuAliases && appStore.menuAliases.length > 0) {
      const aliasMatch = appStore.menuAliases.find((a: any) => stripAccents(a.alias).toLowerCase().trim() === clean)
      if (aliasMatch) {
        const resolvedName = aliasMatch.dishName
        const match = menuList.find((m: any) => m.name === resolvedName || m.cleanName === stripAccents(resolvedName).toLowerCase().trim())
        if (match) return match
      }
    }
    
    // 1. Exact match (cleanName or acronym)
    const exact = menuList.find((m: any) => m.cleanName === clean || m.acronym === clean)
    if (exact) return exact
    
    // 2. Contains match: input contains menu name or vice versa
    const contains = menuList.find((m: any) => 
      clean.includes(m.cleanName) || m.cleanName.includes(clean)
    )
    if (contains) return contains
    
    // 3. Word overlap match (for partial names like "ba chi" → "ba chi heo nuong")
    const inputWords = clean.split(/\s+/).filter(w => w.length > 1)
    if (inputWords.length > 0) {
      let bestMatch: any = null
      let bestScore = 0
      for (const m of menuList) {
        const menuWords = (m.cleanName || '').split(/\s+/)
        const overlap = inputWords.filter((w: string) => menuWords.some((mw: string) => mw.includes(w) || w.includes(mw))).length
        const score = overlap / Math.max(inputWords.length, 1)
        if (score > bestScore && score >= 0.5) {
          bestScore = score
          bestMatch = m
        }
      }
      if (bestMatch) return bestMatch
    }
    
    return null
  }

  // ═══════════════════════════════════════════════════════════════
  //  PIPELINE LAYERS: Pre-normalizer, Menu Routing, Post-validator
  // ═══════════════════════════════════════════════════════════════
  function preNormalize(text: string): string {
    if (!text) return ''
    
    // Clean redundant whitespaces and linebreaks
    let clean = text.replace(/\r\n/g, '\n').replace(/\n{2,}/g, '\n\n')
    
    // Standardize time/pax spacing
    clean = clean.replace(/(\d+)(pax|người|khách|bàn|mon|chỗ|h|g|hàu|set|combo)/gi, '$1 $2')

    // Normalize relative dates
    const today = new Date()
    const dd = String(today.getDate()).padStart(2, '0')
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const yyyy = today.getFullYear()
    
    clean = clean.replace(/hôm nay|nay/gi, `ngày ${dd}/${mm}/${yyyy}`)
    
    const tomorrow = new Date(today)
    tomorrow.setDate(today.getDate() + 1)
    const tDd = String(tomorrow.getDate()).padStart(2, '0')
    const tMm = String(tomorrow.getMonth() + 1).padStart(2, '0')
    const tYyyy = tomorrow.getFullYear()
    clean = clean.replace(/ngày mai|mai/gi, `ngày ${tDd}/${tMm}/${tYyyy}`)
    
    const nextDay = new Date(today)
    nextDay.setDate(today.getDate() + 2)
    const nDd = String(nextDay.getDate()).padStart(2, '0')
    const nMm = String(nextDay.getMonth() + 1).padStart(2, '0')
    const nYyyy = nextDay.getFullYear()
    clean = clean.replace(/ngày kia|mốt/gi, `ngày ${nDd}/${nMm}/${nYyyy}`)
    
    return clean.trim()
  }

  async function loadAllMenusData(): Promise<Record<string, any[]>> {
    const allData: Record<string, any[]> = {}
    let sheets = appStore.menuSheets
    if (!sheets || sheets.length === 0) {
      try {
        const res = await api.getMenuSheets()
        if (res.ok && res.sheets) {
          sheets = res.sheets
          appStore.menuSheets = sheets
        }
      } catch (e) {
        console.error('Failed to load menu sheets', e)
      }
    }
    if (!sheets || sheets.length === 0) return allData

    for (const sheet of sheets) {
      let menuItems = await getCachedMenu(sheet)
      if (!menuItems || menuItems.length === 0) {
        try {
          const res = await api.getMenu(sheet)
          if (res.ok && res.data) {
            menuItems = res.data
            cacheMenu(sheet, res.data)
          }
        } catch (e) {
          console.error(`Failed to load menu for sheet ${sheet}`, e)
        }
      }
      if (menuItems) {
        allData[sheet] = menuItems
      }
    }
    return allData
  }

  function resolveBestMenuSheet(
    text: string,
    parsedItems: any[],
    allMenus: Record<string, any[]>
  ): { bestSheet: string; score: number; isBorderline: boolean } {
    let bestSheet = appStore.activeSheet || ''
    let maxScore = 0
    const scores: Record<string, number> = {}

    const sheets = Object.keys(allMenus)
    if (sheets.length === 0) return { bestSheet, score: 0, isBorderline: false }

    const normalizedText = stripAccents(text).toLowerCase()

    for (const sheet of sheets) {
      let score = 0
      const items = allMenus[sheet] || []

      const sheetNorm = stripAccents(sheet).toLowerCase()
      if (sheetNorm.includes('sinh nhat') && normalizedText.includes('sinh nhat')) {
        score += 3
      }
      if (sheetNorm.includes('cuoi') && (normalizedText.includes('cuoi') || normalizedText.includes('dam cuoi'))) {
        score += 3
      }
      if (sheetNorm.includes('thuong') && (normalizedText.includes('thuong') || normalizedText.includes('goi mon'))) {
        score += 2
      }

      for (const pItem of parsedItems) {
        const pName = stripAccents(pItem.name || '').toLowerCase().trim()
        if (!pName) continue
        
        const found = items.some(item => {
          const mName = stripAccents(item.name || '').toLowerCase().trim()
          return mName === pName || mName.includes(pName) || pName.includes(mName)
        })
        if (found) {
          score += 1
        }
      }

      scores[sheet] = score
      if (score > maxScore) {
        maxScore = score
        bestSheet = sheet
      }
    }

    let isBorderline = false
    if (maxScore > 0) {
      const otherScores = Object.entries(scores).filter(([s, sc]) => s !== bestSheet && sc > 0)
      if (otherScores.length > 0) {
        const runnerUpScore = Math.max(...otherScores.map(([_, sc]) => sc))
        if (maxScore - runnerUpScore <= 1) {
          isBorderline = true
        }
      } else {
        if (maxScore === 1 && parsedItems.length >= 3) {
          isBorderline = true
        }
      }
    }

    return { bestSheet, score: maxScore, isBorderline }
  }

  function postValidate(parsed: any, ruleBased: any) {
    const warnings: string[] = []
    const unresolved_items: string[] = []
    const confidences: Record<string, { value: any; confidence: number; source_text: string; needs_review: boolean }> = {}

    const calcScore = (field: string, aiVal: any, rbVal: any) => {
      if (!aiVal) return { value: '', confidence: 0.0, source_text: '', needs_review: true }
      
      const cleanAI = String(aiVal).trim().toLowerCase()
      const cleanRB = rbVal ? String(rbVal).trim().toLowerCase() : ''
      
      if (field === 'phone') {
        const cleaned = cleanPhoneNumber(aiVal)
        if (/^0[35789]\d{8}$/.test(cleaned)) {
          return { value: aiVal, confidence: 1.0, source_text: aiVal, needs_review: false }
        }
        return { value: aiVal, confidence: 0.5, source_text: aiVal, needs_review: true }
      }
      
      if (field === 'date') {
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(aiVal)) {
          return { value: aiVal, confidence: 0.95, source_text: aiVal, needs_review: false }
        }
        return { value: aiVal, confidence: 0.4, source_text: aiVal, needs_review: true }
      }

      if (field === 'time') {
        if (/^\d{2}:\d{2}$/.test(aiVal)) {
          return { value: aiVal, confidence: 0.95, source_text: aiVal, needs_review: false }
        }
        return { value: aiVal, confidence: 0.4, source_text: aiVal, needs_review: true }
      }
      
      if (field === 'pax') {
        const num = parseInt(aiVal)
        if (num > 0) return { value: aiVal, confidence: 0.95, source_text: aiVal, needs_review: false }
        return { value: aiVal, confidence: 0.4, source_text: aiVal, needs_review: true }
      }
      
      if (field === 'name') {
        if (aiVal === 'Khách hàng') return { value: aiVal, confidence: 0.5, source_text: aiVal, needs_review: true }
        if (cleanAI === cleanRB) return { value: aiVal, confidence: 0.9, source_text: aiVal, needs_review: false }
        return { value: aiVal, confidence: 0.75, source_text: aiVal, needs_review: false }
      }

      if (field === 'tables') {
        if (/^[a-g]\d{1,2}/i.test(aiVal)) return { value: aiVal, confidence: 0.95, source_text: aiVal, needs_review: false }
        return { value: aiVal, confidence: 0.8, source_text: aiVal, needs_review: false }
      }

      return { value: aiVal, confidence: 0.8, source_text: aiVal, needs_review: false }
    }

    if (!parsed.customer) {
      parsed.customer = { name: 'Khách hàng', phone: '' }
    } else {
      if (!parsed.customer.name) parsed.customer.name = 'Khách hàng'
    }

    if (!parsed.reservation) {
      parsed.reservation = { date: '', time: '', pax: '', type: 'Ăn thường', notes: '' }
    }

    confidences.name = calcScore('name', parsed.customer.name, ruleBased?.customer?.name)
    confidences.phone = calcScore('phone', parsed.customer.phone, ruleBased?.customer?.phone)
    confidences.date = calcScore('date', parsed.reservation.date, ruleBased?.reservation?.date)
    confidences.time = calcScore('time', parsed.reservation.time, ruleBased?.reservation?.time)
    confidences.pax = calcScore('pax', parsed.reservation.pax, ruleBased?.reservation?.pax)
    confidences.tables = calcScore('tables', parsed.reservation.table_code, ruleBased?.reservation?.table_code)

    if (parsed.items && Array.isArray(parsed.items)) {
      parsed.items = parsed.items.map((item: any) => {
        const rawName = (item.name || '').trim()
        const match = fuzzyMatchMenu(rawName)
        if (match) {
          let note = item.notes || item.note || ''
          let description = match.desc || appStore.menuDetails[match.name] || ''
          
          if (description) {
            const isSet = /set|combo|goi|phan/i.test(match.name)
            if (isSet) {
              const formattedNote = formatSetNote(description)
              note = note ? `${note}\n${formattedNote}` : formattedNote
            } else {
              note = note ? `${note} (${description})` : description
            }
          } else {
            const isSet = /set|combo|goi|phan/i.test(match.name)
            if (isSet) {
              warnings.push(`Món "${match.name}" chưa có mô tả thành phần món con trong cột Description.`)
            }
          }

          return {
            name: match.name,
            qty: parseInt(String(item.qty)) || 1,
            price: match.price,
            note: note.trim()
          }
        } else {
          unresolved_items.push(rawName)
          warnings.push(`Món "${rawName}" không tìm thấy trong thực đơn hiện tại. Giá được đặt về 0đ.`)
          return {
            name: rawName,
            qty: parseInt(String(item.qty)) || 1,
            price: 0,
            note: (item.notes || item.note || '').trim()
          }
        }
      })
    }

    parsed.warnings = warnings
    parsed.unresolved_items = unresolved_items
    return parsed
  }

  // ═══════════════════════════════════════════════════════════════
  //  MAIN ORCHESTRATOR V6.0 APEX
  // ═══════════════════════════════════════════════════════════════
  async function processAI() {
    if (!formStore.rawInput && !formStore.aiImage) {
      return uiStore.showToast('Vui lòng nhập dữ liệu hoặc chụp ảnh!', 'warning')
    }

    uiStore.loading.is = true
    uiStore.loading.msg = 'AI PARSER V6.0'
    uiStore.loading.subMsg = 'Initializing...'

    try {
      // Build context
      const menuContext = appStore.menuList.map((i: any) => `- ${i.name} (${formatVND(i.price)})`).join('\n')
      const systemPrompt = ADVANCED_AI_PROMPT
        .replace('{{MENU_CONTEXT}}', menuContext)
        .replace('{{CURRENT_TIME}}', (() => {
          const now = new Date()
          const dayNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']
          const dd = String(now.getDate()).padStart(2, '0')
          const mm = String(now.getMonth() + 1).padStart(2, '0')
          const yyyy = now.getFullYear()
          const hh = String(now.getHours()).padStart(2, '0')
          const min = String(now.getMinutes()).padStart(2, '0')
          return `${dayNames[now.getDay()]}, ${dd}/${mm}/${yyyy} ${hh}:${min}`
        })())

      const type = formStore.aiImage ? 'vision' : 'text'
      const optimizedImg = formStore.aiImage ? await resizeImage(formStore.aiImage, 1120) : null
      let promptText = formStore.aiImage
        ? (formStore.rawInput || 'Phân tích ảnh này để lấy thông tin đặt bàn, khách hàng và danh sách món ăn.')
        : formStore.rawInput

      // Layer 1: Pre-normalize the input
      promptText = preNormalize(promptText)

      // Apply self-learning corrections from memory
      const corrections = appStore.aiCorrections || []
      const appliedCorrections: Record<string, string> = {}
      for (const corr of corrections) {
        if (corr.inputText && stripAccents(promptText).toLowerCase().includes(stripAccents(corr.inputText).toLowerCase())) {
          appliedCorrections[corr.field] = corr.correctValue
        }
      }

      const ruleBased = ruleBasedParse(promptText)
      const inputLower = stripAccents(promptText).toLowerCase()
      const hasDishes = appStore.menuList.some((m: any) => 
        inputLower.includes(m.cleanName) || 
        (m.acronym && inputLower.split(/\s+/).includes(m.acronym.toLowerCase()))
      ) || appStore.menuAliases.some((a: any) => 
        inputLower.split(/\s+/).includes(stripAccents(a.alias).toLowerCase())
      )

      let rawResult: any = null
      let isRuleBasedOnly = false

      if (type === 'text' && ruleBased.customer.phone && ruleBased.reservation.date && !hasDishes) {
        rawResult = {
          customer: ruleBased.customer,
          reservation: ruleBased.reservation,
          items: [],
          payment: null,
          routing: {
            pipeline: 'text',
            tier_used: 0,
            model_used: 'Rule-Based Engine V6.2',
            fallback_count: 0,
            repair_applied: false,
            latency: '0.0',
            mode: 'rule-based',
            confidence_score: 1.0
          }
        }
        isRuleBasedOnly = true
      }

      if (!isRuleBasedOnly) {
        // ── CALL AI ──
        rawResult = await smartRouter(type, systemPrompt, promptText, optimizedImg)
      }

      const v5 = isRuleBasedOnly ? rawResult : normalizeAIResponse(rawResult)
      if (!v5) throw new Error('AI trả về dữ liệu rỗng')

      // Apply matched corrections to fields if found
      Object.keys(appliedCorrections).forEach(field => {
        const val = appliedCorrections[field]
        if (field === 'name' || field === 'phone') {
          if (!v5.customer) v5.customer = {}
          v5.customer[field] = val
        } else {
          if (!v5.reservation) v5.reservation = {}
          if (field === 'tables') v5.reservation.table_code = val
          else v5.reservation[field] = val
        }
      })

      // Layer 2: Smart Menu Sheet Routing
      try {
        const allMenus = await loadAllMenusData()
        const { bestSheet, score, isBorderline } = resolveBestMenuSheet(promptText, v5.items || [], allMenus)
        
        if (bestSheet && bestSheet !== appStore.activeSheet) {
          if (isBorderline) {
            const confirmed = await uiStore.showConfirm(
              'Đổi thực đơn?',
              `Hệ thống nhận diện bạn đang dùng thực đơn "${bestSheet}" (độ khớp trung bình). Bạn có muốn chuyển sang thực đơn này không?`
            )
            if (confirmed) {
              await appStore.switchMenu(bestSheet)
            }
          } else {
            await appStore.switchMenu(bestSheet)
            uiStore.showToast(`Đã tự động chuyển sang thực đơn: ${bestSheet}`, 'success')
          }
        }
      } catch (errSheet) {
        console.warn('Menu sheet routing error:', errSheet)
      }

      // Layer 3: Post-validator & Mapping
      const validated = postValidate(v5, ruleBased)

      // Mark applied corrections with confidence = 1.0 and notes
      Object.keys(appliedCorrections).forEach(field => {
        if (validated.confidences && validated.confidences[field]) {
          validated.confidences[field].confidence = 1.0
          validated.confidences[field].needs_review = false
          validated.confidences[field].source_text = 'Self-Learned Dict'
        }
        validated.warnings.push(`Đã áp dụng chỉnh sửa tự học của Admin cho trường ${field}: "${appliedCorrections[field]}"`)
      })

      // ══════════ MAP DATA TO FORM (like legacy v1.8.6) ══════════

      // 1. Customer
      if (validated.customer) {
        if (validated.customer.name) formStore.customer.name = validated.customer.name
        if (validated.customer.phone) formStore.customer.phone = cleanPhoneNumber(validated.customer.phone)
      }

      // 2. Reservation
      if (validated.reservation) {
        if (validated.reservation.date) formStore.customer.date = formatDateStr(validated.reservation.date)
        if (validated.reservation.time) formStore.customer.time = validated.reservation.time
        if (validated.reservation.pax) formStore.customer.pax = String(parseInt(String(validated.reservation.pax)) || formStore.customer.pax)
        if (validated.reservation.notes) formStore.customer.note = validated.reservation.notes
        if (validated.reservation.type) formStore.customer.type = validated.reservation.type
        
        // Table normalization (4 cases)
        const table = parseTableCode(validated.reservation.table_code)
        if (table) {
          uiStore.tempTable.zone = table.zone
          uiStore.tempTable.number = table.number
        }
      }

      // 3. Menu Items
      if (validated.items && Array.isArray(validated.items)) {
        formStore.items = validated.items
      }

      // 4. Payment
      if (validated.payment?.amount) {
        formStore.deposit.amount = parseInt(String(validated.payment.amount)) || 0
        if (validated.payment.method === 'transfer') {
          formStore.deposit.note = `AI: ${validated.payment.bank_reference || 'Chuyển khoản'}`
        }
      }

      // ── SUCCESS TOAST ──
      const rt = validated.routing || {}
      const modeIcon = rt.mode === 'race' ? '🏎️' : '⚡'
      uiStore.showToast(
        `<b>V6.0 ${modeIcon} ${(rt.mode || 'direct').toUpperCase()}</b><br/>` +
        `Model: ${rt.model_used || 'Unknown'} (Tier ${rt.tier_used || '?'})<br/>` +
        `Latency: ${rt.latency || '?'}s | Fallback: ${rt.fallback_count || 0}`,
        'success', 5000
      )
      // Keep track of the original AI parsed values to detect admin corrections on save
      formStore.originalAiValues = {
        name: validated.customer?.name || '',
        phone: cleanPhoneNumber(validated.customer?.phone || ''),
        date: formatDateStr(validated.reservation?.date || ''),
        time: validated.reservation?.time || '',
        pax: String(parseInt(String(validated.reservation?.pax)) || ''),
        tables: validated.reservation?.table_code || '',
        type: validated.reservation?.type || 'Ăn thường',
        note: validated.reservation?.notes || '',
        items: JSON.parse(JSON.stringify(validated.items || []))
      }

      formStore.aiMetadata = {
        ...rt,
        confidences: validated.confidences
      }
      formStore.warnings = validated.warnings || []
      formStore.unresolvedItems = validated.unresolved_items || []

    } catch (e: any) {
      uiStore.error.show = true
      uiStore.error.msg = 'V6.0 Engine Error: ' + e.message
    } finally {
      uiStore.loading.is = false
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  VERIFY TRANSFER IMAGE
  // ═══════════════════════════════════════════════════════════════
  async function verifyTransferImage(base64Img: string) {
    uiStore.loading.is = true
    uiStore.loading.msg = 'AI KIỂM TRA BILL CK...'
    uiStore.loading.subMsg = 'Analyzing...'
    try {
      const sysPrompt = `Bạn là AI Kế Toán King's Grill. Trích xuất thông tin từ ảnh chuyển khoản.
Output JSON: { "amount": Number, "content": "String", "bank": "String", "time": "String" }
- amount: số tiền chuyển thành công (bỏ qua số dư)
- content: nội dung/lời nhắn chuyển tiền
- Không tìm thấy → null. Chỉ trả về JSON thuần.`
      
      const optimizedImg = await resizeImage(base64Img, 1120)
      const aiResponse = await smartRouter('vision', sysPrompt, 'Phân tích ảnh chuyển khoản', optimizedImg)

      if (aiResponse?.amount) {
        const aiAmount = parseInt(String(aiResponse.amount))
        const aiContent = String(aiResponse.content || '')
        const expected = parseInt(String(formStore.deposit.amount))

        if (aiAmount === expected) {
          formStore.deposit.isPaid = true
          formStore.deposit.note = aiContent || 'AI Verified ✓'
          formStore.deposit.time = String(aiResponse.time || new Date().toLocaleString('vi-VN'))
          uiStore.showToast(`✅ Xác thực thành công!\nSố tiền: ${formatVND(aiAmount)}\nNội dung: ${aiContent}`, 'success')
        } else {
          uiStore.verifyModal.show = true
          uiStore.verifyModal.scanned = { amount: aiAmount, content: aiContent }
          uiStore.verifyModal.expected = { amount: expected }
        }
      } else {
        throw new Error('Không đọc được thông tin chuyển khoản')
      }
    } catch (e: any) {
      uiStore.showToast('Lỗi xác thực: ' + e.message, 'warning')
    } finally {
      uiStore.loading.is = false
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  OCR: Extract raw text from image — WATERFALL (Fastest First)
  // ═══════════════════════════════════════════════════════════════
  async function ocrExtractText(base64Img: string): Promise<string> {
    uiStore.loading.is = true
    uiStore.loading.msg = 'AI OCR ĐANG ĐỌC ẢNH...'
    uiStore.loading.subMsg = 'Vision Processing...'

    try {
      const optimizedImg = await resizeImage(base64Img, 800)

      // Build candidates: sorted by tier (fastest first)
      const candidates = AI_MODELS
        .filter(m => m.type === 'vision')
        .filter(m => m.provider === 'pollinations' || (configStore.keysStatus[m.provider]?.configured))
        .sort((a, b) => a.tier - b.tier)

      if (candidates.length === 0) {
        throw new Error('Chưa cấu hình API Key cho Vision/OCR. Vào Cài đặt → thêm Key Google hoặc Groq.')
      }

      const startTime = performance.now()
      let lastError: Error | null = null

      // ── WATERFALL: Try each model, fastest first ──
      for (const model of candidates) {
        try {
          uiStore.loading.subMsg = `OCR: ${model.name}...`
          const rawResult = await callAIModel(model, IMAGE_OCR_PROMPT, 'Trích xuất toàn bộ văn bản từ ảnh này.', optimizedImg, false)

          if (rawResult && rawResult.trim().length > 10) {
            const latency = ((performance.now() - startTime) / 1000).toFixed(1)
            const cleanText = rawResult.trim().replace(/```[a-zA-Z]*\n([\s\S]*?)```/g, '$1').trim()
            uiStore.showToast(`<b>OCR ⚡</b> ${model.name} | ${latency}s`, 'success', 3000)
            return cleanText
          } else {
            throw new Error('OCR trả về kết quả rỗng')
          }
        } catch (e: any) {
          console.warn(`[OCR] ${model.name} failed:`, e.message)
          lastError = e
        }
      }
      throw new Error('OCR thất bại: ' + (lastError?.message || 'Không có model khả dụng'))
    } finally {
      uiStore.loading.is = false
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  PARSE MENU WITH AI
  // ═══════════════════════════════════════════════════════════════
  async function parseMenuAI(text: string): Promise<string> {
    uiStore.loading.is = true
    uiStore.loading.msg = 'AI ĐANG PHÂN TÍCH MENU...'
    try {
      const sysPrompt = `Bạn là một trợ lý ảo chuyên phân tích thực đơn. Hãy trích xuất danh sách các món ăn từ đoạn văn bản lộn xộn của người dùng.
Trả về kết quả dưới định dạng chuẩn sau, không thêm bất kì văn bản nào khác:
[Tên món ăn] - [Giá tiền]
Ví dụ:
Sườn nướng tảng - 250000
Salad bò - 120000
(Lưu ý: Giá tiền chỉ bao gồm số, bỏ chữ k, vnd, đ)`
      
      const candidates = AI_MODELS
        .filter(m => m.type === 'text')
        .filter(m => m.provider === 'pollinations' || (configStore.keysStatus[m.provider]?.configured))
        .sort((a, b) => a.tier - b.tier)
      
      if (candidates.length === 0) throw new Error('Chưa cấu hình API Key')
      
      const rawText = await callAIModel(candidates[0], sysPrompt, text, null, false)
      uiStore.showToast('✅ AI Phân tích thành công!', 'success')
      return rawText || text
    } catch (e: any) {
      uiStore.showToast('Lỗi AI Phân tích Menu: ' + e.message, 'warning')
      return text
    } finally {
      uiStore.loading.is = false
    }
  }

  async function checkAndLogAiCorrections() {
    if (!formStore.originalAiValues || !formStore.rawInput) return

    const original = formStore.originalAiValues
    const current = {
      name: formStore.customer.name,
      phone: cleanPhoneNumber(formStore.customer.phone),
      date: formatDateStr(formStore.customer.date),
      time: formStore.customer.time,
      pax: String(parseInt(String(formStore.customer.pax)) || ''),
      tables: (uiStore.tempTable.zone || '') + (uiStore.tempTable.number || ''),
      type: formStore.customer.type,
      note: formStore.customer.note
    }

    const fieldsToCompare = [
      { key: 'name', label: 'customer.name' },
      { key: 'phone', label: 'customer.phone' },
      { key: 'date', label: 'reservation.date' },
      { key: 'time', label: 'reservation.time' },
      { key: 'pax', label: 'reservation.pax' },
      { key: 'tables', label: 'reservation.table_code' },
      { key: 'type', label: 'reservation.type' }
    ]

    for (const f of fieldsToCompare) {
      const origVal = String(original[f.key] || '').trim().toLowerCase()
      const currVal = String((current as any)[f.key] || '').trim().toLowerCase()
      if (origVal && currVal && origVal !== currVal) {
        try {
          console.log(`[AI Auto-Learn] Logging correction for field ${f.key}: "${original[f.key]}" -> "${(current as any)[f.key]}"`)
          await api.logAiCorrection(
            formStore.rawInput,
            original[f.key],
            (current as any)[f.key],
            f.key,
            appStore.adminToken
          )
        } catch (e) {
          console.warn('[AI Auto-Learn] Failed to log correction:', e)
        }
      }
    }
  }

  return {
    callAIModel,
    repairJSON,
    smartRouter,
    processAI,
    verifyTransferImage,
    ocrExtractText,
    parseMenuAI,
    checkAndLogAiCorrections
  }
}
