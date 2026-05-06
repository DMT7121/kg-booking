import { useUIStore } from '@/stores/useUIStore'
import { useFormStore } from '@/stores/useFormStore'
import { useConfigStore } from '@/stores/useConfigStore'
import { useAppStore } from '@/stores/useAppStore'
import { parseJSON, resizeImage, stripAccents, formatVND, formatSetNote, cleanPhoneNumber, formatDateStr } from '@/utils'
import { AI_MODELS, SETS, ADVANCED_AI_PROMPT, IMAGE_OCR_PROMPT } from '@/utils/constants'
import type { AIModel } from '@/utils/constants'

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
  //  CORE: Direct API Call (no proxy, with timeout + abort)
  // ═══════════════════════════════════════════════════════════════
  async function callAIModel(model: AIModel, sysPrompt: string, userPrompt: string, image: string | null = null, jsonMode: boolean = true): Promise<string | null> {
    const keys = configStore.keys[model.provider] || []
    if (keys.length === 0 && model.provider !== 'pollinations') {
      throw new Error(`Thiếu API Key: ${model.provider}`)
    }

    // Pollinations doesn't need keys
    const keyList = model.provider === 'pollinations' ? ['free'] : keys

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
            // Disable thinking for speed — we need raw results, not reasoning chains
            ...(model.id.includes('2.5') ? { generationConfig: { temperature: 0.1, thinkingConfig: { thinkingBudget: 0 } } } : {})
          }
        } else {
          // OpenAI-compatible format
          if (key !== 'free') headers['Authorization'] = `Bearer ${key}`
          if (model.provider === 'openrouter') {
            headers['HTTP-Referer'] = window.location.href
            headers['X-Title'] = "King's Grill Manager"
          }

          let msgContent: any = userPrompt
          if (image) {
            msgContent = [
              { type: 'text', text: userPrompt },
              { type: 'image_url', image_url: { url: image } }
            ]
          }

          // Enforce JSON output only when jsonMode is true
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
            ...(jsonMode && !noResponseFormat.includes(model.provider) ? { response_format: { type: 'json_object' } } : {})
          }
        }

        // Fetch with 25s timeout (vision images need more time for upload)
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 25000)

        const res = await fetch(fetchUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal
        })
        clearTimeout(timeoutId)

        if (res.status === 429) throw new Error('Rate limit exceeded')
        if (res.status === 401) throw new Error('Invalid API Key')
        if (res.status === 404) throw new Error('Model not found')
        if (!res.ok) {
          const errText = await res.text().catch(() => `HTTP ${res.status}`)
          throw new Error(errText.substring(0, 200))
        }

        const json = await res.json()
        let content: string | null = null

        if (model.format === 'gemini') {
          // Gemini 2.5 "thinking models" return thinking steps in early parts
          // We need the LAST non-thinking text part which contains the actual response
          const parts = json.candidates?.[0]?.content?.parts || []
          for (let p = parts.length - 1; p >= 0; p--) {
            if (parts[p].text && !parts[p].thought) {
              content = parts[p].text
              break
            }
          }
          // Fallback: get any text part
          if (!content) content = parts.find((p: any) => p.text)?.text || null
        } else {
          content = json.choices?.[0]?.message?.content
        }

        if (!content) throw new Error('Empty response from model')
        return content
      } catch (e: any) {
        const errMsg = e.name === 'AbortError' ? 'Timeout (25s)' : e.message
        console.warn(`[AI] ${model.provider} key#${i + 1} failed: ${errMsg}`)
        
        // Skip remaining keys for THIS provider only if model doesn't exist
        // But still allow the NEXT provider/model to be tried by the caller
        if (errMsg.includes('Model not found') || errMsg.includes('Invalid API Key')) {
          throw new Error(`[${model.provider}] ${errMsg}`)
        }

        if (i === keyList.length - 1) throw new Error(errMsg)
      }
    }
    return null
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
      .filter(m => m.provider === 'pollinations' || (configStore.keys[m.provider]?.length > 0))
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
      .filter(m => m.provider === 'pollinations' || (configStore.keys[m.provider]?.length > 0))
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
        repair_applied: repairApplied, latency, mode
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
      const promptText = formStore.aiImage
        ? (formStore.rawInput || 'Phân tích ảnh này để lấy thông tin đặt bàn, khách hàng và danh sách món ăn.')
        : formStore.rawInput
      
      // ── CALL AI ──
      const rawResult = await smartRouter(type, systemPrompt, promptText, optimizedImg)
      const v5 = normalizeAIResponse(rawResult)

      if (!v5) throw new Error('AI trả về dữ liệu rỗng')

      // ══════════ MAP DATA TO FORM (like legacy v1.8.6) ══════════

      // 1. Customer
      if (v5.customer) {
        if (v5.customer.name) formStore.customer.name = v5.customer.name
        if (v5.customer.phone) formStore.customer.phone = cleanPhoneNumber(v5.customer.phone)
      }

      // 2. Reservation
      if (v5.reservation) {
        if (v5.reservation.date) formStore.customer.date = formatDateStr(v5.reservation.date)
        if (v5.reservation.time) formStore.customer.time = v5.reservation.time
        if (v5.reservation.pax) formStore.customer.pax = String(parseInt(String(v5.reservation.pax)) || formStore.customer.pax)
        if (v5.reservation.notes) formStore.customer.note = v5.reservation.notes
        if (v5.reservation.type) formStore.customer.type = v5.reservation.type
        
        // Table normalization (4 cases)
        const table = parseTableCode(v5.reservation.table_code)
        if (table) {
          uiStore.tempTable.zone = table.zone
          uiStore.tempTable.number = table.number
        }
      }

      // 3. Menu Items (fuzzy matching like legacy)
      if (v5.items && Array.isArray(v5.items) && v5.items.length > 0) {
        formStore.items = v5.items.map((item: any) => {
          const match = fuzzyMatchMenu(item.name || '')
          
          let note = item.notes || item.note || ''
          if (match && !note) {
            note = appStore.menuDetails[match.name] || ''
            if (!note && SETS[match.name.toUpperCase()]) {
              note = formatSetNote(SETS[match.name.toUpperCase()])
            }
          }

          return {
            name: match ? match.name : item.name,
            price: match ? match.price : (item.price || 0),
            qty: parseInt(String(item.qty)) || 1,
            note
          }
        })
      }

      // 4. Payment
      if (v5.payment?.amount) {
        formStore.deposit.amount = parseInt(String(v5.payment.amount)) || 0
        if (v5.payment.method === 'transfer') {
          formStore.deposit.note = `AI: ${v5.payment.bank_reference || 'Chuyển khoản'}`
        }
      }

      // ── SUCCESS TOAST ──
      const rt = v5.routing || {}
      const modeIcon = rt.mode === 'race' ? '🏎️' : '⚡'
      uiStore.showToast(
        `<b>V6.0 ${modeIcon} ${(rt.mode || 'direct').toUpperCase()}</b><br/>` +
        `Model: ${rt.model_used || 'Unknown'} (Tier ${rt.tier_used || '?'})<br/>` +
        `Latency: ${rt.latency || '?'}s | Fallback: ${rt.fallback_count || 0}`,
        'success', 5000
      )
      formStore.aiMetadata = rt

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
        .filter(m => m.provider === 'pollinations' || (configStore.keys[m.provider]?.length > 0))
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
        .filter(m => m.provider === 'pollinations' || (configStore.keys[m.provider]?.length > 0))
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

  return {
    callAIModel,
    repairJSON,
    smartRouter,
    processAI,
    verifyTransferImage,
    ocrExtractText,
    parseMenuAI
  }
}
