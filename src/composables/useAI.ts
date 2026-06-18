import { useUIStore } from '@/stores/useUIStore'
import { useFormStore } from '@/stores/useFormStore'
import { useConfigStore } from '@/stores/useConfigStore'
import { useAppStore } from '@/stores/useAppStore'
import { useLogStore } from '@/stores/useLogStore'
import { parseJSON, resizeImage, stripAccents, formatVND, formatSetNote, cleanPhoneNumber, formatDateStr } from '@/utils'
import { AI_MODELS, SETS, ADVANCED_AI_PROMPT, IMAGE_OCR_PROMPT } from '@/utils/constants'
import type { AIModel } from '@/utils/constants'
import * as api from '@/services/api'
import { getCachedMenu, cacheMenu, getCachedMenuSheets, cacheMenuSheets } from '@/services/cache'

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
// Shared cache Map & indexing state across all useAI calls (Module Scope)
const responseCache = new Map<string, { data: any; timestamp: number; ttl: number }>()
let cachedIndex: any = null
let lastMenuVer = 0
let lastAliasVer = 0

export function useAI() {
  const uiStore = useUIStore()
  const formStore = useFormStore()
  const configStore = useConfigStore()
  const appStore = useAppStore()
  const logStore = useLogStore()

  function createMenuIndex(menuList: any[], aliases: any[]) {
    const exactMap = new Map<string, any>()
    const aliasMap = new Map<string, any>()
    const acronymMap = new Map<string, any>()
    const tokenMap = new Map<string, any[]>()
    
    for (const item of menuList) {
      const clean = stripAccents(item.name).toLowerCase().trim()
      exactMap.set(clean, item)
      if (item.cleanName) {
        exactMap.set(item.cleanName, item)
      }
      if (item.acronym) {
        const acr = String(item.acronym).toLowerCase().trim()
        acronymMap.set(acr, item)
      }
      
      const tokens = clean.split(/\s+/).filter(t => t.length > 1)
      for (const t of tokens) {
        if (!tokenMap.has(t)) {
          tokenMap.set(t, [])
        }
        tokenMap.get(t)!.push(item)
      }
    }
    
    for (const a of aliases) {
      const cleanAlias = stripAccents(a.alias).toLowerCase().trim()
      const match = menuList.find(m => m.name === a.dishName || m.cleanName === stripAccents(a.dishName).toLowerCase().trim())
      if (match) {
        aliasMap.set(cleanAlias, match)
      }
    }
    
    return { exactMap, aliasMap, acronymMap, tokenMap }
  }

  // Helper to extract portion size (5 or 10) from a raw dish name string
  function extractPortionSize(rawName: string): number | null {
    const clean = stripAccents(rawName).toLowerCase()
    
    // Check for explicit "nho" / "lon" keywords
    if (/\b(nho|nho\s+nhat|nho\s+hon)\b/i.test(clean)) {
      return 5
    }
    if (/\b(lon|lon\s+nhat|lon\s+hon)\b/i.test(clean)) {
      return 10
    }
    
    // Check for numbers inside parenthesis (e.g. (5), (5 con), (5con))
    const parenMatch = clean.match(/\(\s*(\d+)\s*(?:con)?\s*\)/i)
    if (parenMatch) {
      return parseInt(parenMatch[1], 10)
    }
    
    // Check for standalone/trailing number patterns e.g. "5 con", "5con", "10 con", "10con"
    const wordMatch = clean.match(/\b(5|10)\s*con\b/i) || clean.match(/\b(5|10)con\b/i)
    if (wordMatch) {
      return parseInt(wordMatch[1], 10)
    }
    
    return null
  }

  // Helper to extract portion size (5 or 10) from a menu item name string
  function getMenuPortionSize(menuName: string): number | null {
    const clean = stripAccents(menuName).toLowerCase()
    const match = clean.match(/\((\d+)\s*(?:con)?\)/) || clean.match(/\b(5|10)\s*con\b/)
    return match ? parseInt(match[1], 10) : null
  }

  // Helper to clean up portion-related details and typos to isolate base dish name
  function getBaseDishName(name: string): string {
    let clean = stripAccents(name).toLowerCase()
    // Normalise tcocktail typo
    clean = clean.replace(/\btcocktail\b/gi, 'cocktail')
    // Remove (5 con), (10 con), (5), (10), etc.
    clean = clean.replace(/\(\s*\d+\s*(?:con)?\s*\)/gi, '')
    // Remove "5 con", "10 con", "5con", "10con"
    clean = clean.replace(/\b(5|10)\s*con\b/gi, '')
    clean = clean.replace(/\b(5|10)con\b/gi, '')
    // Remove "nho", "lon"
    clean = clean.replace(/\b(nho|lon)\b/gi, '')
    // Trim extra spaces
    return clean.replace(/\s+/g, ' ').trim()
  }

  // Helper to clean redundant booking details (name, phone, pax, menu items) from customer note
  function cleanBookingNotes(noteText: string, customer: any, booking: any, menuItems: any[]): string {
    if (!noteText) return ''
    
    const lines = noteText.split('\n')
    const cleanedLines = lines.filter(line => {
      const cleanLine = stripAccents(line).toLowerCase().trim()
      if (!cleanLine) return false
      
      // 1. Remove redundancy if the line looks like a label / metadata
      if (/^(nguoi dat|ten khach|khach hang|sdt|dien thoai|phone|lien he|so dt|ngay dat|ngay tiec|gio tiec|so luong khach|so khach|so pax|so nguoi|pax|nguoi|ban|so ban):/i.test(cleanLine)) {
        return false
      }
      
      // 2. Remove customer name or phone if present in the line
      if (customer) {
        if (customer.name) {
          const cleanName = stripAccents(customer.name).toLowerCase().trim()
          if (cleanName && cleanLine.includes(cleanName) && /^(anh|chi|khach|nguoi|lien|sdt|dt)/.test(cleanLine)) {
            return false
          }
        }
        if (customer.phone) {
          const cleanPhone = String(customer.phone).replace(/\D/g, '')
          if (cleanPhone && cleanLine.replace(/\D/g, '').includes(cleanPhone)) {
            return false
          }
        }
      }
      
      // 3. Remove booking pax if line is just the pax count
      if (booking && booking.guest_count) {
        const guestStr = String(booking.guest_count)
        if (new RegExp(`^\\b${guestStr}\\s*(?:pax|nguoi|ng|khach|cho)\\b$`, 'i').test(cleanLine) ||
            new RegExp(`^\\b${guestStr}\\s*nguoi\\s*(?:lon)?\\b$`, 'i').test(cleanLine)) {
          return false
        }
      }
      
      // 4. Remove menu items from the notes
      if (Array.isArray(menuItems)) {
        for (const item of menuItems) {
          const rawName = item.raw_name || item.name || ''
          const itemBase = stripAccents(rawName).toLowerCase().trim()
          if (itemBase && itemBase.length > 2) {
            let lineContent = cleanLine.replace(/^[-+\d\s.*]+/, '').trim()
            lineContent = lineContent.replace(/(?:[x\*]|\bphan|\bcon)\s*\d+\s*$/i, '').trim()
            lineContent = lineContent.replace(/^\d+\s*(?:[x\*]|\bphan|\bcon)/i, '').trim()
            
            if (lineContent === itemBase || lineContent.includes(itemBase)) {
              return false
            }
          }
        }
      }
      
      return true
    })
    
    return cleanedLines.join('\n').trim()
  }

  function getMenuIndex() {
    const menuList = appStore.menuList || []
    const aliases = appStore.menuAliases || []
    const menuVer = menuList.length
    const aliasVer = aliases.length
    
    if (!cachedIndex || menuVer !== lastMenuVer || aliasVer !== lastAliasVer) {
      cachedIndex = createMenuIndex(menuList, aliases)
      lastMenuVer = menuVer
      lastAliasVer = aliasVer
    }
    return cachedIndex
  }

  function getSmartCacheKey(rawText: string, inputType: string, selectedMenuSheet: string, dateContext: string): string {
    const normalized = stripAccents(rawText).toLowerCase().replace(/\s+/g, ' ').trim()
    const menuVer = appStore.menuList.length
    const corrVer = appStore.aiCorrections?.length || 0
    return `${normalized}:${inputType}:${selectedMenuSheet}:${dateContext}:${menuVer}:${corrVer}`
  }

  function getCachedParseResult(key: string): any | null {
    const entry = responseCache.get(key)
    if (entry && Date.now() - entry.timestamp < entry.ttl) {
      return entry.data
    }
    if (entry) responseCache.delete(key)
    return null
  }

  function setSmartCache(key: string, data: any, inputType: string) {
    let ttl = 5 * 60 * 1000 // default 5 min
    if (inputType === 'booking_text') ttl = 10 * 60 * 1000
    if (inputType === 'menu_order_text' || inputType === 'mixed_booking_menu') ttl = 5 * 60 * 1000
    if (inputType === 'chat_screenshot') ttl = 30 * 60 * 1000
    if (inputType === 'deposit_bill_image') ttl = 60 * 60 * 1000
    
    if (responseCache.size >= 30) {
      const oldest = responseCache.keys().next().value
      if (oldest) responseCache.delete(oldest)
    }
    responseCache.set(key, { data, timestamp: Date.now(), ttl })
  }

  async function callAIModel(model: AIModel, sysPrompt: string, userPrompt: string, image: string | null = null, jsonMode = true, signal?: AbortSignal): Promise<string | null> {
    logStore.addLog(`[Model: ${model.name}] Bắt đầu gọi model. Provider: ${model.provider}, Chế độ JSON: ${jsonMode}`)
    const localKeys = configStore.keys[model.provider] || []
    
    // Check if we can perform a direct client-side call
    // (If the provider is pollinations, we try direct call first even with no key since it's free)
    const canCallDirect = localKeys.length > 0 || model.provider === 'pollinations'
    
    if (canCallDirect) {
      const keyList = model.provider === 'pollinations' ? ['free'] : localKeys
      for (let i = 0; i < keyList.length; i++) {
        const key = keyList[i]
        try {
          console.log(`[AI] Attempting direct client-side fetch for ${model.provider} (key #${i + 1})...`)
          logStore.addLog(`[Model: ${model.name}] Thử gọi API trực tiếp qua client (Key #${i + 1})...`)
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
            if (model.provider === 'openrouter') {
              headers['HTTP-Referer'] = window.location.origin
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

          // Build abort signal combined with standard 25s timeout
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 25000)
          
          // Connect parent abort signal if provided
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
          
          console.log(`[AI] Direct client-side fetch successful for ${model.provider}!`)
          logStore.addLog(`[Model: ${model.name}] Gọi API trực tiếp qua client thành công!`, 'success')
          return content
        } catch (e: any) {
          const errMsg = e.name === 'AbortError' ? 'Timeout (25s)' : e.message
          console.warn(`[AI] Direct client-side fetch failed for ${model.provider} key #${i + 1}: ${errMsg}`)
          logStore.addLog(`[Model: ${model.name}] Lỗi khi gọi trực tiếp qua client (Key #${i + 1}): ${errMsg}`, 'warning')
          // Fall back to the next key or proxy
        }
      }
    }

    // Fallback to Server-Side Proxy (Google Apps Script)
    console.log(`[AI] Falling back to GAS Server Proxy for ${model.provider}...`)
    logStore.addLog(`[Model: ${model.name}] Chuyển tiếp yêu cầu qua Server Proxy (GAS)...`, 'info')
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
      logStore.addLog(`[Model: ${model.name}] Gọi qua Server Proxy (GAS) thành công!`, 'success')
      return res.content
    } catch (e: any) {
      console.warn(`[AI Proxy] Server proxy fallback for ${model.provider} failed: ${e.message}`)
      logStore.addLog(`[Model: ${model.name}] Lỗi khi gọi qua Server Proxy (GAS): ${e.message}`, 'error')
      throw e
    }
  }

  async function repairJSON(badString: string): Promise<any> {
    uiStore.loading.subMsg = '🔧 Auto-repair JSON...'
    logStore.addLog('Phát hiện dữ liệu JSON bị lỗi cấu trúc. Đang kích hoạt AI tự động sửa (repair)...', 'warning')
    const repairPrompt = `Fix this broken JSON. Return ONLY valid JSON, nothing else:\n\n${badString.substring(0, 2000)}`
    const repairCandidates = AI_MODELS
      .filter(m => m.type === 'text')
      .filter(m => m.provider === 'pollinations' || (configStore.keysStatus[m.provider]?.configured))
      .sort((a, b) => a.tier - b.tier)
    
    if (repairCandidates.length === 0) {
      logStore.addLog('Không tìm thấy model AI khả dụng để tự động sửa lỗi JSON.', 'error')
      return null
    }
    try {
      const fixedStr = await callAIModel(repairCandidates[0], 'Return ONLY valid JSON', repairPrompt)
      const parsed = parseJSON(fixedStr || '')
      if (parsed) {
        logStore.addLog('Tự động sửa lỗi JSON thành công!', 'success')
      } else {
        logStore.addLog('Tự động sửa lỗi JSON thất bại. Kết quả trả về không phải JSON hợp lệ.', 'error')
      }
      return parsed
    } catch (e: any) {
      logStore.addLog(`Tự động sửa lỗi JSON thất bại: ${e.message}`, 'error')
      return null
    }
  }

  // Schema Validation (from V6.0 — verify AI output has required fields)
  function validateSchema(parsed: any): boolean {
    if (!parsed || typeof parsed !== 'object') return false
    const hasCustomer = parsed.customer && (parsed.customer.name || parsed.customer.phone)
    const hasBooking = parsed.booking && (parsed.booking.event_date || parsed.booking.event_time || parsed.booking.guest_count || parsed.booking.table_number)
    const hasReservation = parsed.reservation && (parsed.reservation.date || parsed.reservation.time || parsed.reservation.pax || parsed.reservation.table_code)
    const hasItems = (Array.isArray(parsed.menu_items) && parsed.menu_items.length > 0) || (Array.isArray(parsed.items) && parsed.items.length > 0)
    const hasLegacy = parsed.customer && (parsed.customer.date || parsed.customer.time || parsed.customer.tables)
    return hasCustomer || hasBooking || hasReservation || hasItems || hasLegacy
  }

  // Segment input blocks locally
  type InputSegment = {
    raw: string;
    lineIndex: number;
    type?: 'table' | 'name' | 'phone' | 'datetime' | 'guest_count' | 'purpose' | 'staff' | 'menu' | 'note' | 'unknown';
    confidence: number;
    extracted?: Record<string, any>;
  };

  type TableCode = { zone: string; number: string; raw: string };

  type HardEntities = {
    phones: Array<{ value: string; confidence: number; warning?: string }>;
    dates: Array<{ value: string; confidence: number; raw: string }>;
    times: Array<{ value: string; confidence: number; raw: string }>;
    guestCounts: Array<{ value: number; confidence: number; raw: string }>;
    tables: Array<{ zone: string; number: string; raw: string; confidence: number }>;
  };

  function parseTableCodes(input: string): TableCode[] {
    if (!input) return []
    const results: TableCode[] = []
    let s = stripAccents(input).toUpperCase().trim()
    
    // Normalize "BAN 5" -> "A5", "TABLE 12" -> "A12"
    s = s.replace(/\b(BAN|TABLE|GHE)\s+(\d+)\b/g, 'A$2')
    
    s = s.replace(/[+\/]/g, ',')
    s = s.replace(/\b([A-G])(\d+)\s*[-–—]\s*([A-G])?(\d+)\b/gi, (match, z1, n1, z2, n2) => {
      const zone = z1.toUpperCase()
      const start = parseInt(n1)
      const end = parseInt(n2)
      if (!isNaN(start) && !isNaN(end) && start <= end && end - start <= 10) {
        const generated: string[] = []
        for (let i = start; i <= end; i++) {
          generated.push(`${zone}${i}`)
        }
        return generated.join(',')
      }
      return match
    })
    
    const tokens = s.split(/[,\s]+/).filter(Boolean)
    let currentZone = 'A'
    let lastTableIdx = -99
    
    for (let idx = 0; idx < tokens.length; idx++) {
      const token = tokens[idx]
      
      const fullMatch = token.match(/^([A-G])(\d+)$/)
      if (fullMatch) {
        currentZone = fullMatch[1]
        results.push({ zone: currentZone, number: fullMatch[2], raw: token })
        lastTableIdx = idx
        continue
      }
      
      const numMatch = token.match(/^(\d+)$/)
      if (numMatch) {
        // Safe guards for bare numbers:
        // 1. Must be preceded by a table token within 2 steps
        // 2. Next token must not be a unit (e.g. "người", "khách", "tuổi", "pax")
        const nextToken = tokens[idx + 1] || ''
        const isNextUnit = /^(NG|NGUOI|KHACH|PAX|TUOI|T|TRE|LON|NHO|NAM|THANG|CUOI)$/i.test(nextToken)
        
        if (idx - lastTableIdx <= 2 && !isNextUnit) {
          results.push({ zone: currentZone, number: numMatch[1], raw: currentZone + numMatch[1] })
          lastTableIdx = idx
        }
        continue
      }
      
      const zoneMatch = token.match(/^([A-G])$/)
      if (zoneMatch) {
        currentZone = zoneMatch[1]
        results.push({ zone: currentZone, number: '', raw: token })
        lastTableIdx = idx
        continue
      }
    }
    return results
  }

  function normalizeSynonyms(name: string): string {
    const replacements = [
      { pattern: /\bba\s+roi\b/gi, replacement: 'ba chỉ' },
      { pattern: /\bsườn\s+non\b/gi, replacement: 'dẻ sườn' },
      { pattern: /\bnậm(?:\s+heo)?\b/gi, replacement: 'nầm heo' },
      { pattern: /\bnăm(?:\s+heo)?\b/gi, replacement: 'nầm heo' },
      { pattern: /\bmực\s+sữa\b/gi, replacement: 'mực trứng' },
      { pattern: /\blẩu\s+thái\s+hải\s+sản\b/gi, replacement: 'lẩu thái hs' },
    ]
    let normalized = name
    for (const r of replacements) {
      normalized = normalized.replace(r.pattern, r.replacement)
    }
    return normalized
  }

  function jaroWinklerDistance(s1: string, s2: string): number {
    s1 = stripAccents(s1).toLowerCase().trim()
    s2 = stripAccents(s2).toLowerCase().trim()
    
    if (s1 === s2) return 1.0
    
    const len1 = s1.length
    const len2 = s2.length
    
    if (len1 === 0 || len2 === 0) return 0.0
    
    const matchWindow = Math.floor(Math.max(len1, len2) / 2) - 1
    const matches1 = new Array(len1).fill(false)
    const matches2 = new Array(len2).fill(false)
    
    let matches = 0
    let transpositions = 0
    
    for (let i = 0; i < len1; i++) {
      const start = Math.max(0, i - matchWindow)
      const end = Math.min(len2 - 1, i + matchWindow)
      for (let j = start; j <= end; j++) {
        if (!matches2[j] && s1[i] === s2[j]) {
          matches1[i] = true
          matches2[j] = true
          matches++
          break
        }
      }
    }
    
    if (matches === 0) return 0.0
    
    let k = 0
    for (let i = 0; i < len1; i++) {
      if (matches1[i]) {
        while (!matches2[k]) k++
        if (s1[i] !== s2[k]) transpositions++
        k++
      }
    }
    
    const jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3.0
    
    // Winkler modification
    const prefixLimit = 4
    let commonPrefix = 0
    for (let i = 0; i < Math.min(prefixLimit, len1, len2); i++) {
      if (s1[i] === s2[i]) {
        commonPrefix++
      } else {
        break
      }
    }
    
    return jaro + commonPrefix * 0.1 * (1.0 - jaro)
  }

  function parseDishItems(input: string): Array<{ name: string; qty: number }> {
    const results: Array<{ name: string; qty: number }> = []
    let cleanInput = input.trim()
    if (!cleanInput) return []

    // Pre-extract trailing quantity multiplier like "x2", "x 4", "*5", "(x3)"
    let baseQty = 1
    const qtyMatch = cleanInput.match(/(?:\((?:[x\*])\s*(\d+)\)|(?:[x\*])\s*(\d+))\s*$/i)
    if (qtyMatch) {
      const qtyStr = qtyMatch[1] || qtyMatch[2]
      baseQty = parseInt(qtyStr, 10)
      cleanInput = cleanInput.replace(/(?:\((?:[x\*])\s*(\d+)\)|(?:[x\*])\s*(\d+))\s*$/i, '').trim()
    }

    const regex = /(\d+)\s*([\p{L}\s]+)(?=\s*\d|$)/gu
    let match
    while ((match = regex.exec(cleanInput)) !== null) {
      const qty = parseInt(match[1])
      const name = match[2].trim()
      if (name.length > 2) {
        results.push({ name, qty })
      }
    }
    if (results.length === 0) {
      const suffixRegex = /([\p{L}\s]+?)\s*(?:x)?\s*(\d+)(?=\s*[\p{L}]|$)/gu
      while ((match = suffixRegex.exec(cleanInput)) !== null) {
        const name = match[1].trim()
        const qty = parseInt(match[2])
        if (name.length > 2) {
          const lowerName = stripAccents(name).toLowerCase()
          const isSetOrCombo = /(?:^|\s)(set\s*menu|set|combo|thuc\s*don|thực\s*đơn)(?:\s+)?$/i.test(lowerName)
          if (isSetOrCombo) {
            // Keep the trailing number as part of the set/combo name, do not treat as quantity here
          } else {
            results.push({ name, qty })
          }
        }
      }
    }
    if (results.length === 0 && cleanInput) {
      results.push({ name: cleanInput, qty: 1 })
    }
    return results.map(r => ({ name: r.name, qty: r.qty * baseQty }))
  }

  function extractHardEntities(normalizedText: string): HardEntities {
    const phones: HardEntities['phones'] = []
    const dates: HardEntities['dates'] = []
    const times: HardEntities['times'] = []
    const guestCounts: HardEntities['guestCounts'] = []
    const tables: HardEntities['tables'] = []
    const clean = stripAccents(normalizedText).toLowerCase()

    const blocks = segmentInputBlocksCompat(normalizedText)
    const phoneRegex = /(0[35789]\d{7,9})/g
    let bestCustomerPhone: string | null = null
    const custPhoneMatch = blocks.customer_block.match(phoneRegex)
    if (custPhoneMatch) {
      bestCustomerPhone = cleanPhoneNumber(custPhoneMatch[0])
    } else {
      const allPhoneMatch = normalizedText.match(phoneRegex)
      if (allPhoneMatch) {
        const depositPhones = blocks.deposit_block.match(phoneRegex)
        if (depositPhones && depositPhones[0] === allPhoneMatch[0]) {
          if (allPhoneMatch.length > 1) bestCustomerPhone = cleanPhoneNumber(allPhoneMatch[1])
        } else {
          bestCustomerPhone = cleanPhoneNumber(allPhoneMatch[0])
        }
      }
    }

    if (bestCustomerPhone) {
      const isMaybeInvalid = bestCustomerPhone.length < 10
      phones.push({
        value: bestCustomerPhone,
        confidence: isMaybeInvalid ? 0.5 : 0.95,
        warning: isMaybeInvalid ? 'phone_maybe_invalid' : undefined
      })
    }
    
    let phoneMatch
    while ((phoneMatch = phoneRegex.exec(normalizedText)) !== null) {
      const val = cleanPhoneNumber(phoneMatch[1])
      if (val !== bestCustomerPhone && !phones.some(p => p.value === val)) {
        phones.push({
          value: val,
          confidence: 0.5,
          warning: 'alternative_phone'
        })
      }
    }

    const today = new Date()
    const formatDateStrLocal = (d: Date) => {
      const dd = String(d.getDate()).padStart(2, '0')
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const yyyy = d.getFullYear()
      return `${dd}/${mm}/${yyyy}`
    }

    const relativePatterns = [
      { regex: /\b(hom nay|nay|toi nay|chieu nay)\b/gi, offset: 0, raw: 'hôm nay' },
      { regex: /\b(ngay mai|mai|chieu mai|toi mai)\b/gi, offset: 1, raw: 'ngày mai' },
      { regex: /\b(ngay mot|mot|ngay kia)\b/gi, offset: 2, raw: 'ngày mốt' }
    ]
    relativePatterns.forEach(({ regex, offset, raw }) => {
      if (regex.test(clean)) {
        const targetDate = new Date(today)
        targetDate.setDate(today.getDate() + offset)
        dates.push({ value: formatDateStrLocal(targetDate), confidence: 0.95, raw })
      }
    })

    // Weekday patterns (CN, thứ 7, thứ bảy, etc.)
    const weekdayRegex = /\b(chu\s*nhat|cn|thu\s*hai|t2|thu\s*ba|t3|thu\s*tu|t4|thu\s*nam|t5|thu\s*sau|t6|thu\s*bay|t7|thu\s*2|thu\s*3|thu\s*4|thu\s*5|thu\s*6|thu\s*7)\b(?:\s+(tuan\s+)?(nay|sau))?/gi
    const getWeekdayIndex = (w: string): number => {
      const cleanW = stripAccents(w).toLowerCase().replace(/\s+/g, '')
      if (/cn|chunhat/.test(cleanW)) return 0
      if (/t2|thuhai|thu2/.test(cleanW)) return 1
      if (/t3|thuba|thu3/.test(cleanW)) return 2
      if (/t4|thutu|thu4/.test(cleanW)) return 3
      if (/t5|thunam|thu5/.test(cleanW)) return 4
      if (/t6|thusau|thu6/.test(cleanW)) return 5
      if (/t7|thubay|thu7/.test(cleanW)) return 6
      return -1
    }

    let weekdayMatch
    while ((weekdayMatch = weekdayRegex.exec(clean)) !== null) {
      const wIndex = getWeekdayIndex(weekdayMatch[1])
      if (wIndex !== -1) {
        const currentDay = today.getDay()
        const vnToday = currentDay === 0 ? 7 : currentDay
        const vnTarget = wIndex === 0 ? 7 : wIndex
        let diff = vnTarget - vnToday
        if (diff < 0) {
          diff += 7
        }
        const modifier = weekdayMatch[3] ? weekdayMatch[3].toLowerCase() : ''
        if (modifier === 'sau' && (vnTarget - vnToday) >= 0) {
          diff += 7
        }
        const targetDate = new Date(today)
        targetDate.setDate(today.getDate() + diff)
        dates.push({ value: formatDateStrLocal(targetDate), confidence: 0.95, raw: weekdayMatch[0] })
      }
    }

    const explicitDateRegex = /\b(\d{1,2})[\.\-\/](\d{1,2})[\.\-\/](\d{2,4})\b/g
    let dateMatch
    while ((dateMatch = explicitDateRegex.exec(normalizedText)) !== null) {
      const d = String(dateMatch[1]).padStart(2, '0')
      const m = String(dateMatch[2]).padStart(2, '0')
      let y = String(dateMatch[3])
      if (y.length === 2) y = '20' + y
      dates.push({ value: `${d}/${m}/${y}`, confidence: 0.95, raw: dateMatch[0] })
    }

    const partialDateRegex = /\b(\d{1,2})[\/\.\-](\d{1,2})\b(?![\/\.\-\d])/g
    let partialMatch
    while ((partialMatch = partialDateRegex.exec(normalizedText)) !== null) {
      const day = parseInt(partialMatch[1])
      const month = parseInt(partialMatch[2])
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        const dd = String(day).padStart(2, '0')
        const mm = String(month).padStart(2, '0')
        dates.push({ value: `${dd}/${mm}/${today.getFullYear()}`, confidence: 0.9, raw: partialMatch[0] })
      }
    }

    const matchedTimeRanges: Array<[number, number]> = []
    const rangeTimeRegex = /\b(\d{1,2})[h:](\d{2})?\s*[-–—đến|den|to]\s*(\d{1,2})[h:](\d{2})?\b/gi
    let rangeMatch
    while ((rangeMatch = rangeTimeRegex.exec(clean)) !== null) {
      let h = parseInt(rangeMatch[1])
      const m = rangeMatch[2] ? parseInt(rangeMatch[2]) : 0
      
      const hasNoonOrNight = /toi|dem|chieu/i.test(clean)
      const hasMorningOrLunch = /sang|trua/i.test(clean)
      if (h >= 1 && h <= 9) {
        if (!hasMorningOrLunch) {
          h += 12 // e.g. 6h -> 18h
        }
      } else if (h >= 10 && h <= 14) {
        if (hasNoonOrNight) {
          h += 12 // e.g. 11h tối -> 23h
        }
      } else if (h >= 15 && h <= 23) {
        // already PM
      } else if (h === 24) {
        h = 0
      }

      times.push({ value: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, confidence: 0.95, raw: rangeMatch[0] })
      matchedTimeRanges.push([rangeMatch.index, rangeMatch.index + rangeMatch[0].length])
    }

    const standardTimeRegex = /\b(\d{1,2})[h:](\d{2})?\b/gi
    let timeMatchObj
    while ((timeMatchObj = standardTimeRegex.exec(clean)) !== null) {
      const start = timeMatchObj.index
      const end = start + timeMatchObj[0].length
      const isOverlapping = matchedTimeRanges.some(([s, e]) => (start >= s && start < e) || (end > s && end <= e))
      if (isOverlapping) {
        continue
      }
      let h = parseInt(timeMatchObj[1])
      const m = timeMatchObj[2] ? parseInt(timeMatchObj[2]) : 0
      
      const hasNoonOrNight = /toi|dem|chieu/i.test(clean)
      const hasMorningOrLunch = /sang|trua/i.test(clean)
      if (h >= 1 && h <= 9) {
        if (!hasMorningOrLunch) {
          h += 12 // e.g. 6h -> 18h
        }
      } else if (h >= 10 && h <= 14) {
        if (hasNoonOrNight) {
          h += 12 // e.g. 11h tối -> 23h
        }
      } else if (h >= 15 && h <= 23) {
        // already PM
      } else if (h === 24) {
        h = 0
      }

      times.push({ value: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, confidence: 0.95, raw: timeMatchObj[0] })
      matchedTimeRanges.push([start, end])
    }

    if (times.length === 0) {
      if (/\b(toi nay|toi mai|toi kia|chieu toi)\b/i.test(clean)) {
        times.push({ value: '19:00', confidence: 0.6, raw: 'tối' })
      } else if (/\b(trua nay|trua mai|trua kia)\b/i.test(clean)) {
        times.push({ value: '11:30', confidence: 0.6, raw: 'trưa' })
      } else if (/\b(chieu nay|chieu mai|chieu kia)\b/i.test(clean)) {
        times.push({ value: '17:30', confidence: 0.6, raw: 'chiều' })
      } else if (/\b(sang nay|sang mai|sang kia)\b/i.test(clean)) {
        times.push({ value: '09:00', confidence: 0.6, raw: 'sáng' })
      }
    }

    const additionGuestRegex = /\b(\d+)\s*(?:nguoi lon|lon)\s*(?:\+|,|va)?\s*(\d+)\s*(?:nho|be|tre em)\b/gi
    let addMatch
    while ((addMatch = additionGuestRegex.exec(clean)) !== null) {
      const total = parseInt(addMatch[1]) + parseInt(addMatch[2])
      guestCounts.push({ value: total, confidence: 0.95, raw: addMatch[0] })
    }

    const rangeGuestRegex = /\b(\d+)\s*(?:-|đến|den|to)\s*(\d+)\s*(?:pax|nguoi|khach|guest)\b/gi
    let rangeGuestMatch
    while ((rangeGuestMatch = rangeGuestRegex.exec(clean)) !== null) {
      const maxVal = Math.max(parseInt(rangeGuestMatch[1]), parseInt(rangeGuestMatch[2]))
      guestCounts.push({ value: maxVal, confidence: 0.95, raw: rangeGuestMatch[0] })
    }

    const stdGuestRegex = /\b(\d+)\s*(?:pax|nguoi|người|khach|khách|guest|pax|ng\b)/gi
    let stdGuestMatch
    while ((stdGuestMatch = stdGuestRegex.exec(clean)) !== null) {
      const val = parseInt(stdGuestMatch[1])
      const alreadyMatched = guestCounts.some(g => clean.indexOf(g.raw) <= stdGuestMatch!.index && stdGuestMatch!.index <= clean.indexOf(g.raw) + g.raw.length)
      if (!alreadyMatched) {
        guestCounts.push({ value: val, confidence: 0.9, raw: stdGuestMatch[0] })
      }
    }

    const tableCodes = parseTableCodes(normalizedText)
    tableCodes.forEach(tc => {
      tables.push({
        zone: tc.zone,
        number: tc.number,
        raw: tc.raw,
        confidence: 0.95
      })
    })

    return { phones, dates, times, guestCounts, tables }
  }

  function applyDeterministicRuleLock(aiResult: any, hardEntities: HardEntities, ruleBasedResult?: any): any {
    const result = { ...aiResult }
    if (!result.customer) result.customer = {}
    if (!result.booking) result.booking = {}
    if (!result.warnings) result.warnings = []
    if (!result.deposit) result.deposit = {}
    if (!result.staff) result.staff = {}

    const debugLogs: string[] = []

    if (hardEntities.phones.length > 0) {
      const rulePhone = hardEntities.phones[0].value
      const aiPhone = cleanPhoneNumber(result.customer.phone || '')
      if (rulePhone && aiPhone !== rulePhone) {
        debugLogs.push(`Phone override: rule "${rulePhone}" vs AI "${aiPhone}"`)
        result.customer.phone = rulePhone
        result.warnings.push('Hệ thống tự động khóa SĐT chính xác từ rule engine.')
      } else if (!aiPhone) {
        result.customer.phone = rulePhone
      }
    }

    if (hardEntities.dates.length > 0) {
      const ruleDate = hardEntities.dates[0].value
      const aiDate = formatDateStr(result.booking.event_date || result.booking.date || '')
      if (ruleDate && aiDate !== ruleDate) {
        debugLogs.push(`Date override: rule "${ruleDate}" vs AI "${aiDate}"`)
        result.booking.event_date = ruleDate
        result.booking.date = ruleDate
        result.warnings.push('Hệ thống tự động khóa Ngày đặt bàn chính xác từ rule engine.')
      } else if (!aiDate) {
        result.booking.event_date = ruleDate
        result.booking.date = ruleDate
      }
    }

    if (hardEntities.times.length > 0) {
      const ruleTime = hardEntities.times[0].value
      const aiTime = result.booking.event_time || result.booking.time || ''
      if (ruleTime && aiTime !== ruleTime) {
        debugLogs.push(`Time override: rule "${ruleTime}" vs AI "${aiTime}"`)
        result.booking.event_time = ruleTime
        result.booking.time = ruleTime
        result.warnings.push('Hệ thống tự động khóa Giờ đặt bàn chính xác từ rule engine.')
      } else if (!aiTime) {
        result.booking.event_time = ruleTime
        result.booking.time = ruleTime
      }
    }

    if (hardEntities.guestCounts.length > 0) {
      const rulePax = hardEntities.guestCounts[0].value
      const aiPax = parseInt(String(result.booking.guest_count || result.booking.pax || ''))
      if (rulePax && aiPax !== rulePax) {
        debugLogs.push(`Guest count override: rule "${rulePax}" vs AI "${aiPax}"`)
        result.booking.guest_count = rulePax
        result.booking.pax = rulePax
        result.warnings.push('Hệ thống tự động khóa Số khách chính xác từ rule engine.')
      } else if (isNaN(aiPax)) {
        result.booking.guest_count = rulePax
        result.booking.pax = rulePax
      }
    }

    if (hardEntities.tables.length > 0) {
      const ruleTablesStr = hardEntities.tables.map(t => t.raw).join(', ')
      const aiTablesStr = result.booking.table_number || result.booking.table_code || ''
      if (ruleTablesStr && aiTablesStr !== ruleTablesStr) {
        debugLogs.push(`Tables override: rule "${ruleTablesStr}" vs AI "${aiTablesStr}"`)
        result.booking.table_number = ruleTablesStr
        result.booking.table_code = ruleTablesStr
        result.warnings.push('Hệ thống tự động khóa Bàn chính xác từ rule engine.')
      } else if (!aiTablesStr) {
        result.booking.table_number = ruleTablesStr
        result.booking.table_code = ruleTablesStr
      }
    }

    if (!result.party) result.party = {}

    // Customer name override protection from ruleBasedResult
    if (ruleBasedResult?.customer_name) {
      const aiName = result.customer.name || ''
      const isCompany = /^(cty|công ty|doanh nghiệp|đoàn|doan|team|group|phòng|phong)\b/i.test(ruleBasedResult.customer_name)
      const isBadName = !aiName || aiName === 'Khách hàng' || isCompany || /sinh nhat|lien hoan|an thuong|dmt|nhan/i.test(stripAccents(aiName).toLowerCase())
      if (isBadName && aiName !== ruleBasedResult.customer_name) {
        debugLogs.push(`Customer name override: rule "${ruleBasedResult.customer_name}" vs AI "${aiName}"`)
        result.customer.name = ruleBasedResult.customer_name
        if (isCompany) {
          result.party.owner_name = ruleBasedResult.customer_name
        }
      }
    }

    // Booking need (party type) override protection from ruleBasedResult
    if (ruleBasedResult?.booking_need) {
      const aiNeed = result.booking?.need || ''
      if (ruleBasedResult.booking_need !== 'Ăn thường' && aiNeed !== ruleBasedResult.booking_need) {
        debugLogs.push(`Booking need override: rule "${ruleBasedResult.booking_need}" vs AI "${aiNeed}"`)
        result.booking.need = ruleBasedResult.booking_need
        result.party.type = ruleBasedResult.booking_need
      }
    }

    // Deposit override protection from ruleBasedResult
    if (ruleBasedResult?.deposit_amount && ruleBasedResult.deposit_amount > 0) {
      const aiDeposit = result.deposit?.amount || null
      if (aiDeposit !== ruleBasedResult.deposit_amount) {
        debugLogs.push(`Deposit override: rule "${ruleBasedResult.deposit_amount}" vs AI "${aiDeposit}"`)
        result.deposit.amount = ruleBasedResult.deposit_amount
        result.deposit.status = ruleBasedResult.deposit_status || 'chờ cọc'
      }
    }

    // Staff receiver override protection from ruleBasedResult
    if (ruleBasedResult?.receiver) {
      const aiReceiver = result.staff?.receiver || ''
      if (aiReceiver !== ruleBasedResult.receiver) {
        debugLogs.push(`Receiver override: rule "${ruleBasedResult.receiver}" vs AI "${aiReceiver}"`)
        result.staff.receiver = ruleBasedResult.receiver
      }
    }

    if (debugLogs.length > 0) {
      console.log('[Rule-Lock Debug]', debugLogs.join(' | '))
    }

    return result
  }

  function prepareAIPayload(promptText: string, sysPrompt: string, ruleBasedResult: any): { sysPrompt: string; userPrompt: string; isLocalOnly: boolean; reason?: string } {
    const inputLower = stripAccents(promptText).toLowerCase()
    const inputTokens = inputLower.split(/\s+/).filter(t => t.length > 2)
    const candidates = appStore.menuList.filter((item: any) => {
      const cleanName = stripAccents(item.name).toLowerCase()
      const nameTokens = cleanName.split(/\s+/)
      const hasTokenMatch = nameTokens.some(t => inputTokens.some(it => it.includes(t) || t.includes(it)))
      const acronymMatch = item.acronym && inputTokens.includes(String(item.acronym).toLowerCase())
      return hasTokenMatch || acronymMatch
    })

    let finalSysPrompt = sysPrompt
    // If the base prompt size is too large (above 15,000 characters), strip the large few-shot examples section
    // to fit within strict token limits (like Groq's 12,000 TPM limit) while leaving room for menu items.
    const promptWithoutMenu = finalSysPrompt.replace(/\{\{MENU_CONTEXT\}\}/g, '')
    if (promptWithoutMenu.length + promptText.length > 15000) {
      finalSysPrompt = finalSysPrompt.replace(/# 12\. VÍ DỤ CHUẨN[^]*?(?=\n---|\n# 13|$)/g, '').trim()
    }

    // Establish a strict character limit for the prompt to stay within Groq's TPM limits (12,000 tokens ≈ 15,000 chars)
    // We target a safe budget of 15,000 characters total for finalSysPrompt + promptText
    const basePromptWithoutMenu = finalSysPrompt.replace(/\{\{MENU_CONTEXT\}\}/g, '')
    const baseSize = basePromptWithoutMenu.length + promptText.length
    const maxMenuChars = Math.max(0, 15000 - baseSize)

    // Build the menu context incrementally up to our maxMenuChars budget
    let menuToSend: any[] = []
    if (candidates.length > 0) {
      let currentChars = 0
      for (const item of candidates) {
        const line = `- ${item.name} (${formatVND(item.price)})\n`
        if (currentChars + line.length > maxMenuChars) break
        menuToSend.push(item)
        currentChars += line.length
      }
      
      // If we still have budget, backfill with general menu items to help matching
      if (currentChars < maxMenuChars) {
        for (const item of appStore.menuList) {
          if (candidates.includes(item)) continue
          const line = `- ${item.name} (${formatVND(item.price)})\n`
          if (currentChars + line.length > maxMenuChars) break
          menuToSend.push(item)
          currentChars += line.length
        }
      }
    } else {
      // No candidates matched, fill as much of the menu as our budget allows
      let currentChars = 0
      for (const item of appStore.menuList) {
        const line = `- ${item.name} (${formatVND(item.price)})\n`
        if (currentChars + line.length > maxMenuChars) break
        menuToSend.push(item)
        currentChars += line.length
      }
    }

    // Ensure we send at least a small context if budget was extremely tight
    if (menuToSend.length === 0 && appStore.menuList.length > 0) {
      menuToSend = appStore.menuList.slice(0, 5)
    }

    const menuContext = menuToSend.map((i: any) => `- ${i.name} (${formatVND(i.price)})`).join('\n')
    finalSysPrompt = finalSysPrompt.replace(/\{\{MENU_CONTEXT\}\}/g, menuContext)

    if (finalSysPrompt.length + promptText.length > 25000) {
      finalSysPrompt = finalSysPrompt.replace(/Ví dụ:[^]*?(?=\n\n|\n[A-Z]|$)/g, '').trim()
    }

    if (finalSysPrompt.length + promptText.length > 40000) {
      return {
        sysPrompt: finalSysPrompt,
        userPrompt: promptText,
        isLocalOnly: true,
        reason: 'payload_too_large'
      }
    }

    return {
      sysPrompt: finalSysPrompt,
      userPrompt: promptText,
      isLocalOnly: false
    }
  }

  function segmentInputBlocks(normalizedText: string): InputSegment[] {
    if (!normalizedText) return []
    const lines = normalizedText.split('\n')
    return lines.map((line, idx) => {
      const trimmed = line.trim()
      if (!trimmed) {
        return { raw: trimmed, lineIndex: idx, type: 'unknown', confidence: 0.1 }
      }
      const lower = stripAccents(trimmed).toLowerCase()
      let type: InputSegment['type'] = 'unknown'
      let confidence = 0.5
      const extracted: Record<string, any> = {}

      const phoneRegex = /(0[35789]\d{7,9})/g
      const phoneMatch = trimmed.match(phoneRegex)
      if (phoneMatch) {
        type = 'phone'
        confidence = 0.9
        extracted.phone = phoneMatch[0]
      }

      const tableRegex = /\b([a-g]\d{1,2})\b/i
      const hasTableKeyword = /\b(ban|ban\s+\d+|table)\b/i.test(lower)
      const hasTableCode = tableRegex.test(trimmed)
      if (hasTableCode || hasTableKeyword) {
        if (type === 'unknown' || (type === 'phone' && hasTableKeyword)) {
          type = 'table'
          confidence = 0.95
        }
      }

      const guestRegex = /(\d+)\s*(?:pax|nguoi|người|khach|khách|pax|ban|ng\b)/i
      if (guestRegex.test(trimmed) || /nguoi lon|tre em|lon\s*\+\s*nho|be/i.test(lower)) {
        if (type === 'unknown' || type === 'table') {
          type = 'guest_count'
          confidence = 0.9
        }
      }

      const hasTime = /\b\d{1,2}:\d{2}\b/g.test(lower) || /\b\d{1,2}h\d{2}?\b/g.test(lower) || /\b\d{1,2}\s*h\b/g.test(lower)
      const hasDate = /\b\d{1,2}[\/\.\-]\d{1,2}(?:[\/\.\-]\d{2,4})?\b/g.test(lower) || /ngay|hom nay|mai|mot/i.test(lower)
      if (hasTime || hasDate) {
        if (type === 'unknown' || type === 'guest_count') {
          type = 'datetime'
          confidence = 0.9
        }
      }

      if (/sinh nhat|sn\b|hbd|hpbd|happy birthday|thoi noi|thôi nôi|day thang|lien hoan|tat nien|hop lop|ky niem/i.test(lower)) {
        if (type === 'unknown') {
          type = 'purpose'
          confidence = 0.85
        }
      }

      if (/nhan:|nhan\s+nv|nhan\s+dmt|nv\b/i.test(lower)) {
        if (type === 'unknown') {
          type = 'staff'
          confidence = 0.9
        }
      }

      const startsWithNumberMenu = /^\d+[\s\p{L}]/u.test(trimmed) || /x\s*\d+\b/i.test(trimmed) || /\d+\s*(?:hàu|suon|mon|com|lau|ga|heo|bo|mi|nuoc)/i.test(lower)
      if (startsWithNumberMenu && type === 'unknown') {
        type = 'menu'
        confidence = 0.8
      }

      const nameResults = classifyPeopleNames(trimmed)
      if (nameResults.peopleNames.length > 0 && type === 'unknown') {
        type = 'name'
        confidence = 0.75
      }

      if (type === 'unknown') {
        if (/yeu cau|note|ghi chu|luu y/i.test(lower)) {
          type = 'note'
          confidence = 0.8
        }
      }

      return {
        raw: trimmed,
        lineIndex: idx,
        type,
        confidence,
        extracted
      }
    })
  }

  function segmentInputBlocksCompat(text: string) {
    const blocks = {
      customer_block: [] as string[],
      booking_time_block: [] as string[],
      guest_count_block: [] as string[],
      menu_block: [] as string[],
      decoration_block: [] as string[],
      deposit_block: [] as string[],
      note_block: [] as string[]
    }
    
    const lines = text.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const lower = stripAccents(trimmed).toLowerCase()
      
      if (/happy birthday|hbd|chuc mung|bang chu|bong bay|trang tri/i.test(lower)) {
        blocks.decoration_block.push(trimmed)
        continue
      }
      if (/da chuyen|coc|ck|bill|ngan hang|chuyen khoan|ref/i.test(lower)) {
        blocks.deposit_block.push(trimmed)
        continue
      }
      const isGuestLine = /(\d+)\s*(?:pax|nguoi|người|ng|khach|khách|cho)/gi.test(lower) || /nguoi lon|tre em|lon.*nho|be/i.test(lower)
      if (isGuestLine) {
        blocks.guest_count_block.push(trimmed)
      }
      const hasTime = /\b\d{1,2}:\d{2}\b/gi.test(lower) || /\b\d{1,2}h\d{2}\b/gi.test(lower) || /\b\d{1,2}h\b/gi.test(lower)
      const hasDate = /\b\d{2}\/\d{2}\/\d{4}\b/gi.test(lower) || /ngay/i.test(lower)
      if (hasTime || hasDate) {
        blocks.booking_time_block.push(trimmed)
      }
      const hasPhone = /(0[35789]\d{7,9})/g.test(lower)
      const hasCustomerKeywords = /anh|chi|dat ban|khach/i.test(lower)
      if (hasPhone || hasCustomerKeywords) {
        blocks.customer_block.push(trimmed)
      }
      const isMenuLine = (/^\d+\s+[\p{L}\s]+/ui.test(lower) || /combo|set menu|thuc don/i.test(lower)) &&
                         !hasTime && !hasDate && !hasPhone && !isGuestLine
      if (isMenuLine) {
        blocks.menu_block.push(trimmed)
      }
      
      const matchedAny = 
        blocks.decoration_block.includes(trimmed) ||
        blocks.deposit_block.includes(trimmed) ||
        blocks.guest_count_block.includes(trimmed) ||
        blocks.booking_time_block.includes(trimmed) ||
        blocks.customer_block.includes(trimmed) ||
        blocks.menu_block.includes(trimmed)
        
      if (!matchedAny) {
        blocks.note_block.push(trimmed)
      }
    }
    
    return {
      customer_block: blocks.customer_block.join('\n'),
      booking_time_block: blocks.booking_time_block.join('\n'),
      guest_count_block: blocks.guest_count_block.join('\n'),
      menu_block: blocks.menu_block.join('\n'),
      decoration_block: blocks.decoration_block.join('\n'),
      deposit_block: blocks.deposit_block.join('\n'),
      note_block: blocks.note_block.join('\n')
    }
  }

  /** Strip Set Menu component description lines from input before sending to AI */
  function stripSetMenuComponents(text: string): string {
    const lines = text.split('\n')
    const result: string[] = []
    let inSetMenuBlock = false
    for (const line of lines) {
      const trimmed = line.trim()
      const lower = stripAccents(trimmed).toLowerCase()
      // Detect Set Menu order line
      if (/set\s*menu|combo\s*\d/i.test(lower) && /x\s*\d|\(x\d\)|\d\s*phan/i.test(lower)) {
        inSetMenuBlock = true
        result.push(trimmed)
        continue
      }
      if (inSetMenuBlock) {
        // Lines like "1/ ...", "2/ ...", "1. ..." with brackets/parens = component descriptions
        if (/^\d+[\/.)]\s+/i.test(trimmed)) continue
        inSetMenuBlock = false
      }
      result.push(trimmed)
    }
    return result.join('\n')
  }

  function classifyInputType(rawInput: string, hasImage: boolean): string {
    const cleanText = stripAccents(rawInput).toLowerCase().trim()
    const phoneRegex = /(0[35789]\d{8})/g
    const hasPhone = phoneRegex.test(cleanText)
    const hasGuestCount = /(\d+)\s*(?:pax|nguoi|khach|cho)/i.test(cleanText)
    const hasBookingNeed = /sinh nhat|ky niem|hop mat|cong ty|lien hoan|tat nien|thoi noi|mung tho/i.test(cleanText)
    
    const lines = cleanText.split('\n')
    let foodLinesCount = 0
    for (const line of lines) {
      if (/^\d+\s+[\p{L}\s]+$/ui.test(line.trim())) {
        foodLinesCount++
      }
    }
    const hasMenuOrders = foodLinesCount >= 2 || /combo|set menu|thuc don/i.test(cleanText)
    const hasDeposit = /da chuyen|coc|ck|bill|ngan hang|chuyen khoan/i.test(cleanText)
    const hasDeco = /happy birthday|hbd|chuc mung|bang chu|bong bay|trang tri/i.test(cleanText)
    
    if (hasImage) {
      if (hasDeposit) return 'deposit_bill_image'
      return 'chat_screenshot'
    }
    if (hasDeposit && !hasPhone && !hasGuestCount) {
      return 'deposit_bill_image'
    }
    if (hasDeco && !hasMenuOrders && !hasPhone) {
      return 'decoration_request'
    }
    if (hasPhone && hasMenuOrders) {
      return 'mixed_booking_menu'
    }
    if (hasMenuOrders) {
      return 'menu_order_text'
    }
    if (hasPhone || hasGuestCount || hasBookingNeed) {
      return 'booking_text'
    }
    return 'unknown'
  }

  function preNormalizeInput(rawText: string): string {
    if (!rawText) return ''
    
    // Clean carriage returns and keep spacing neat
    let clean = rawText.replace(/\r\n/g, '\n')
    clean = clean.replace(/[^\S\n]+/g, ' ')
    
    // Trim each line individually to clean indentation/tabs, while preserving lines
    clean = clean
      .split('\n')
      .map(line => line.trim())
      .join('\n')

    clean = clean.replace(/\n{3,}/g, '\n\n')

    // Normalize phone numbers (e.g., "090 123 4567", "090.123.4567", "090-123-4567" -> "0901234567")
    clean = clean.replace(/(?:\+84|84|0)(?:\s*[\.-]?\s*\d){9}\b/g, (match) => {
      let digits = match.replace(/[\s\.-]+/g, '')
      if (digits.startsWith('+84')) digits = '0' + digits.slice(3)
      if (digits.startsWith('84')) digits = '0' + digits.slice(2)
      return digits
    })

    // 1. Abbreviations & typos normalization
    const abbreviations: { pattern: RegExp; replacement: string }[] = [
      { pattern: /\b(sn|sinh nhat)\b/gi, replacement: 'sinh nhật' },
      { pattern: /\b(hbd|hpbd)\b/gi, replacement: 'Happy Birthday' },
      { pattern: /\b(tn)\b/gi, replacement: 'thôi nôi' },
      { pattern: /\b(thoi noi)\b/gi, replacement: 'thôi nôi' },
      { pattern: /\b(day thang)\b/gi, replacement: 'đầy tháng' },
      { pattern: /\b(hn)\b/gi, replacement: 'hôm nay' },
      { pattern: /\b(kh)\b/gi, replacement: 'khách' },
      { pattern: /\b(ng)\b/gi, replacement: 'người' }
    ]
    abbreviations.forEach(({ pattern, replacement }) => {
      clean = clean.replace(pattern, replacement)
    })

    // spelling normalizations / aliases for dishes
    const spellingAliases = [
      { pattern: /\b(dut lo|dut\s+lo)\b/gi, replacement: 'đốt lò' },
      { pattern: /\b(chac toi|chac\s+toi)\b/gi, replacement: 'cháy tỏi' },
      { pattern: /\b(sate|sa\s+te)\b/gi, replacement: 'sa tế' },
      { pattern: /\b(tcocktail|t\s*cocktail)\b/gi, replacement: 'cocktail' }
    ]
    spellingAliases.forEach(({ pattern, replacement }) => {
      clean = clean.replace(pattern, replacement)
    })

    // Normalise thứ 2 -> thứ hai, thứ 7 -> thứ bảy
    clean = clean.replace(/\bthu\s+(\d)\b/gi, (match, num) => {
      const mapping: Record<string, string> = {
        '2': 'thứ hai',
        '3': 'thứ ba',
        '4': 'thứ tư',
        '5': 'thứ năm',
        '6': 'thứ sáu',
        '7': 'thứ bảy'
      }
      return mapping[num] || match
    })

    // 2. Time normalizations (MUST run before spacing regex to protect "18h15", "7h30" etc.)
    clean = clean.replace(/\b(\d{1,2})h(\d{2})m\b/gi, '$1:$2')
    clean = clean.replace(/\b(\d{1,2})h(\d{2})\b/gi, '$1:$2')
    clean = clean.replace(/\b(\d{1,2})h\b/gi, '$1:00')
    clean = clean.replace(/\b(\d{1,2})g(\d{2})\b/gi, '$1:$2')
    clean = clean.replace(/\b(\d{1,2})g\b/gi, '$1:00')

    // Spacing between number and units
    clean = clean.replace(/(\d+)(pax|người|khách|cho|nguoi|khach|ban)/gi, '$1 $2')
    // Require 2+ letters to avoid corrupting table codes (C6) and residual time tokens
    clean = clean.replace(/([\p{L}]{2,})(\d+)\b/ugi, (match, word, num) => {
      const lowerWord = stripAccents(word).toLowerCase()
      if (/^(set|combo|menu|ban|table|vip|tang|goi|phong|kv|khu|khu\s+vuc)$/.test(lowerWord)) {
        return `${word} ${num}`
      }
      return `${word} x${num}`
    })
    clean = clean.replace(/(\d+)(?![hg\d\s\/:\-\.,])([\p{L}])/ugi, '$1 $2')

    // 3. Guest counts ranges & additions
    clean = clean.replace(/\b(\d+)\s*(?:-|–|—|đến|den|to)\s*(\d+)\s*(pax|người|khách|cho|nguoi|khach|guest)/gi, (match, min, max, unit) => {
      return `${max} ${unit}`
    })
    
    clean = clean.replace(/\b(\d+)\s*(?:người lớn|nguoi lon|lớn|lon)\s*(?:\+|,|và|va)?\s*(\d+)\s*(?:nhỏ|bé|trẻ em|tre em|nho|be)\b/gi, (match, adults, kids) => {
      const total = parseInt(adults) + parseInt(kids)
      return `${total} khách`
    })

    clean = clean.replace(/\b(\d{1,2}:\d{2})\s*[-–—đến|den|to]\s*(\d{1,2}:\d{2})\b/g, (match, t1, t2) => t1)

    clean = clean.replace(/\b(\d{1,2}):(\d{2})\s*(chiều|tối|pm|chieu|toi)\b/gi, (match, h, m) => {
      let hour = parseInt(h)
      if (hour < 12) hour += 12
      return `${String(hour).padStart(2, '0')}:${m}`
    })

    const hasMorningIndicator = /sáng|trưa|am/i.test(rawText)
    clean = clean.replace(/\b(vào lúc|lúc|tầm|khoảng|gio|giao|luc|tam|khoang)?\s*(\d{1,2}):(\d{2})\b/gi, (match, prefix, h, m) => {
      let hour = parseInt(h)
      if (hour >= 1 && hour <= 11 && !hasMorningIndicator) {
        if (hour >= 5 && hour <= 11) {
          hour += 12
        }
      }
      return `${prefix || ''} ${String(hour).padStart(2, '0')}:${m}`
    })

    // 4. Date normalizations
    const today = new Date()
    const formatDate = (d: Date) => {
      const dd = String(d.getDate()).padStart(2, '0')
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const yyyy = d.getFullYear()
      return `${dd}/${mm}/${yyyy}`
    }

    // Convert relative weekday words like "thứ bảy", "cn", "thứ hai tuần sau" directly into dates
    const weekdayNormRegex = /\b(chu\s*nhat|cn|thu\s*hai|thu\s*ba|thu\s*tu|thu\s*nam|thu\s*sau|thu\s*bay|t2|t3|t4|t5|t6|t7)\b(?:\s+(tuan\s+)?(nay|sau))?/gi
    const getWeekdayIndex = (w: string): number => {
      const cleanW = stripAccents(w).toLowerCase().replace(/\s+/g, '')
      if (/cn|chunhat/.test(cleanW)) return 0
      if (/t2|thuhai/.test(cleanW)) return 1
      if (/t3|thuba/.test(cleanW)) return 2
      if (/t4|thutu/.test(cleanW)) return 3
      if (/t5|thunam/.test(cleanW)) return 4
      if (/t6|thusau/.test(cleanW)) return 5
      if (/t7|thubay/.test(cleanW)) return 6
      return -1
    }
    
    clean = clean.replace(weekdayNormRegex, (match, dayStr, _, modifier) => {
      const wIndex = getWeekdayIndex(dayStr)
      if (wIndex === -1) return match
      const currentDay = today.getDay()
      const vnToday = currentDay === 0 ? 7 : currentDay
      const vnTarget = wIndex === 0 ? 7 : wIndex
      
      let diff = vnTarget - vnToday
      if (diff < 0) {
        diff += 7
      }
      
      const mod = modifier ? modifier.toLowerCase() : ''
      if (mod === 'sau' && (vnTarget - vnToday) >= 0) {
        diff += 7
      }
      
      const targetDate = new Date(today)
      targetDate.setDate(today.getDate() + diff)
      return formatDate(targetDate)
    })

    // Convert "ngày X tháng Y" -> "X/Y/YYYY"
    clean = clean.replace(/\b(?:ngay\s+)?(\d{1,2})\s+(?:thang|thg|t|t\s*)\s*(\d{1,2})\b/gi, (match, d, m) => {
      const day = parseInt(d)
      const month = parseInt(m)
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        const dd = String(day).padStart(2, '0')
        const mm = String(month).padStart(2, '0')
        return `${dd}/${mm}/${today.getFullYear()}`
      }
      return match
    })

    const relativePatterns = [
      { pattern: /\b(hôm nay|nay|tối nay|chiều nay|hom nay|toi nay|chieu nay)\b/gi, offset: 0 },
      { pattern: /\b(ngày mai|mai|chiều mai|tối mai|ngay mai|chieu mai|toi mai)\b/gi, offset: 1 },
      { pattern: /\b(ngày mốt|mốt|ngày kia|ngay mot|mot|ngay kia)\b/gi, offset: 2 }
    ]
    
    relativePatterns.forEach(({ pattern, offset }) => {
      if (pattern.test(clean)) {
        const targetDate = new Date(today)
        targetDate.setDate(today.getDate() + offset)
        clean = clean.replace(pattern, formatDate(targetDate))
      }
    })
    
    const vnDays = ['chủ nhật', 'thứ hai', 'thứ ba', 'thứ tư', 'thứ năm', 'thứ sáu', 'thứ bảy', 'cn', 't2', 't3', 't4', 't5', 't6', 't7', 'chu nhat', 'thu hai', 'thu ba', 'thu tu', 'thu nam', 'thu sau', 'thu bay']
    vnDays.forEach(day => {
      const regexNext = new RegExp(`(${day})\\s+tuần\\s+sau`, 'gi')
      if (regexNext.test(clean)) {
        const dayIndex = vnDays.indexOf(day) % 7
        const currentDay = today.getDay()
        let diff = dayIndex - currentDay
        diff += 7
        const targetDate = new Date(today)
        targetDate.setDate(today.getDate() + diff)
        clean = clean.replace(regexNext, formatDate(targetDate))
      }
      const regexThis = new RegExp(`(${day})\\s+tuần\\s+này`, 'gi')
      if (regexThis.test(clean)) {
        const dayIndex = vnDays.indexOf(day) % 7
        const currentDay = today.getDay()
        let diff = dayIndex - currentDay
        const targetDate = new Date(today)
        targetDate.setDate(today.getDate() + diff)
        clean = clean.replace(regexThis, formatDate(targetDate))
      }
    })

    if (/cuối tuần này|cuoi tuan nay/gi.test(clean)) {
      const satIndex = 6
      const currentDay = today.getDay()
      const diff = satIndex - currentDay
      const targetDate = new Date(today)
      targetDate.setDate(today.getDate() + diff)
      clean = clean.replace(/cuối tuần này|cuoi tuan nay/gi, formatDate(targetDate))
    }

    clean = clean.replace(/\b(\d{1,2})[\.\-\/](\d{1,2})[\.\-\/](\d{2,4})\b/g, (match, d, m, y) => {
      const day = String(d).padStart(2, '0')
      const month = String(m).padStart(2, '0')
      let year = String(y)
      if (year.length === 2) year = '20' + year
      return `${day}/${month}/${year}`
    })

    // Handle 2-part dates without year: "6/6", "15/7", "06.06" → append current year
    clean = clean.replace(/\b(\d{1,2})[\/\.\-](\d{1,2})\b(?![\/\.\-\d])/g, (match, d, m) => {
      const day = parseInt(d)
      const month = parseInt(m)
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        const dd = String(day).padStart(2, '0')
        const mm = String(month).padStart(2, '0')
        return `${dd}/${mm}/${today.getFullYear()}`
      }
      return match
    })

    return clean.trim()
  }

  function classifyPeopleNames(text: string) {
    const peopleNames: string[] = []
    const bookerCandidates: string[] = []
    const partyOwnerCandidates: string[] = []
    
    const lines = text.split('\n')
    for (const line of lines) {
      const lineClean = line.trim()
      if (!lineClean) continue
      
      const nameRegex = /(?:anh|chị|em|chú|cô|ông|bà|anh|chi|em|chu|co|ong|ba|bé|be|khách|khach|tên|ten|đặt|dat|cho|liên hệ|lien he)\s+(\p{L}+(?:\s+(?!cho\b|dat\b|dat\s+ban|xin\b|gui\b|nha\b|ngay\b|luc\b|vao\b|sdt\b|ban\b)\p{L}+){0,3})/gu
      let match
      while ((match = nameRegex.exec(lineClean)) !== null) {
        const name = match[1].trim()
        // Filter single-char names (abbreviations like "c" for chị, "a" for anh)
        if (name.length <= 1) continue
        if (/^(mai|nay|kia|truoc|sau|sang|chieu|toi|ngay|gio|pax|khach|nguoi|ban|dat|mon|set|combo|happy|birthday|hbd|hpbd|sinh|nhat|thoi|noi|giup|giom|cho|sdt|lien|he|table|pax)$/i.test(stripAccents(name))) {
          continue
        }
        if (!peopleNames.includes(name)) {
          peopleNames.push(name)
        }
      }

      // Standalone Name Fallback: Check if the line itself represents a name (e.g. "Lê Giang")
      // Remove phone, time, date, and common formatting characters to inspect the clean line
      let cleanLine = lineClean
        .replace(/(0[35789]\d{7,9})/g, '') // remove phone
        .replace(/\b\d{1,2}[h:]\d{2}?\b/gi, '') // remove time
        .replace(/\b\d{1,2}[\/\.\-]\d{1,2}(?:[\/\.\-]\d{2,4})?\b/g, '') // remove date
        .replace(/[0-9()\-–—:+.,\/[\]]/g, ' ') // remove digits & punctuation
        .replace(/\s+/g, ' ')
        .trim()

      const cleanWords = cleanLine.split(/\s+/).filter(Boolean)
      if (cleanWords.length >= 2 && cleanWords.length <= 5) {
        const isPureLetters = cleanWords.every(w => /^\p{L}+$/u.test(w))
        const stopWords = new Set([
          'ngay', 'mai', 'hom', 'nay', 'kia', 'mot', 'tuan', 'thang', 'nam',
          'gio', 'luc', 'tam', 'khoang', 'sang', 'trua', 'chieu', 'toi',
          'pax', 'nguoi', 'khach', 'ban', 'table', 'ghe',
          'sinh', 'nhat', 'thoi', 'noi', 'hop', 'lop', 'lien', 'hoan', 'tiec', 'cuoi', 'hpbd', 'hbd', 'sn', 'mung', 'tho', 'tieu', 'ca', 'nhac',
          'coc', 'ck', 'chuyen', 'khoan', 'bill', 'bank', 'banking', 'momo',
          'mon', 'an', 'menu', 'combo', 'set', 'lau', 'nuong', 'xao', 'hap', 'bo', 'ga', 'heo', 'suon', 'de', 'tom', 'cua', 'muc',
          'nv', 'dmt', 'nhan', 'gui', 'nha', 'giup', 'giom', 'sdt', 'lien', 'he',
          'an', 'thuong', 'lon', 'nho', 'be', 'tre', 'em',
          'yeu', 'cau', 'trang', 'tri', 'phong', 'lanh', 'sanh', 'may', 'ngoai', 'troi', 'san', 'khau', 'gan', 'bong', 'bay', 'board', 'chu', 
          'thiet', 'ke', 'bao', 'gia', 'thuc', 'don', 'uong', 'tien', 'giam', 'gia', 'khuyen', 'mai', 'tang', 'banh', 'kem', 'hoa', 'nen', 
          'hat', 'acoustic', 'phuc', 'vu', 'nhan', 'vien', 'ho', 'tro', 'chu', 'dao', 'nhiet', 'tinh', 'phi', 'dich', 'vu', 'free', 'mien', 
          'phi', 'bat', 'dua', 'chen', 'ly', 'coc', 'da', 'khan', 'uot', 'ngot', 'cay', 'chua', 'man', 'lat', 'nhat', 'nuong', 'lau', 'hap', 
          'chien', 'xao', 'luoc', 'goi', 'salad', 'sup', 'canh', 'com', 'mi', 'bun', 'pho', 'chao', 'khoai', 'tay', 'ngo', 'bap', 'dau', 
          'rau', 'dua', 'ca', 'chua', 'hanh', 'toi', 'ot', 'tieu', 'sa', 'gung', 'rieng', 'me', 'dam', 'giam', 'sot', 'mam', 'muoi', 'duong', 
          'chinh', 'nem', 'dau', 'bo', 'sua', 'trung', 'bot', 'tuong', 'thit', 'bo', 'heo', 'lon', 'ga', 'vit', 'ngan', 'ngong', 'de', 'cuu', 
          'tho', 'ech', 'luon', 'ca', 'tom', 'cua', 'ghe', 'muc', 'bach', 'tuoc', 'hau', 'so', 'ngheu', 'oc', 'hen', 'sua', 'cha', 'gio', 
          'xuc', 'xich', 'lap', 'xuong', 'roi', 'chi', 'suon', 'nam', 'linh', 'long', 'doi', 'tai', 'mui', 'luoi', 'chan', 'canh', 'dui', 
          'uc', 'me', 'gan', 'tim', 'cat', 'pheo', 'day', 'bao', 'tu', 'gan', 'sun', 'xuong', 'duoi', 'dau', 'co', 'da', 'mo', 'nac', 
          'than', 'vai', 'nong', 'ma', 'nam', 'sua', 'doi', 'sun'
        ])
        const hasStopWord = cleanWords.some(w => stopWords.has(stripAccents(w).toLowerCase()))

        if (isPureLetters && !hasStopWord) {
          const candidateName = cleanWords.join(' ')
          if (!peopleNames.includes(candidateName)) {
            peopleNames.push(candidateName)
          }
        }
      }
    }

    const specialPatterns = [
      { regex: /(?:sinh nhật|sinh nhat|hbd|hpbd|happy birthday|thôi nôi|thoi noi|đầy tháng|day thang|bé|be)\s+of\s+([\p{L}\s]+)/ugi, isPartyOwner: true },
      { regex: /(?:sinh nhật|sinh nhat|hbd|hpbd|happy birthday|thôi nôi|thoi noi|đầy tháng|day thang|bé|be)\s+([\p{L}\s]+)/ugi, isPartyOwner: true },
      { regex: /(?:bảng tên|bang ten|chữ|chu|tên|ten)\s+([\p{L}\s]+)/ugi, isPartyOwner: true },
      { regex: /(?:người đặt|nguoi dat|liên hệ|lien he|anh|chị|chi|anh|sđt|sdt)\s+([\p{L}\s]+)/ugi, isBooker: true },
      { regex: /\b((?:cty|công ty|đoàn|doan|team|group|phòng|phong)\s+\p{L}+(?:\s+(?!cho\b|dat\b|dat\s+ban|xin\b|gui\b|nha\b|ngay\b|luc\b|vao\b|sdt\b|ban\b)\p{L}+){0,4})\b/ugi, isBooker: true, isPartyOwner: true }
    ]

    specialPatterns.forEach(({ regex, isPartyOwner, isBooker }) => {
      let match
      while ((match = regex.exec(text)) !== null) {
        const name = match[1].trim()
        if (name.length > 1 && !/^(mai|nay|kia|truoc|sau|sang|chieu|toi|ngay|gio|pax|khach|nguoi|ban|dat|mon|set|combo|happy|birthday|hbd|hpbd|sinh|nhat|thoi|noi|giup|giom|cho|sdt|lien|he|table|pax)$/i.test(stripAccents(name))) {
          if (!peopleNames.includes(name)) {
            peopleNames.push(name)
          }
          if (isPartyOwner && !partyOwnerCandidates.includes(name)) {
            partyOwnerCandidates.push(name)
          }
          if (isBooker && !bookerCandidates.includes(name)) {
            bookerCandidates.push(name)
          }
        }
      }
    })

    peopleNames.forEach(name => {
      if (bookerCandidates.includes(name) || partyOwnerCandidates.includes(name)) return

      const index = text.indexOf(name)
      if (index !== -1) {
        const contextBefore = text.slice(Math.max(0, index - 30), index).toLowerCase()
        const contextAfter = text.slice(index, index + 30).toLowerCase()
        
        const isBookerContext = /đặt|dat|book|liên hệ|lien he|sđt|sdt|khách|khach|tên|ten/.test(contextBefore) || /đặt|dat|book|sđt|sdt|liên hệ|lien he/.test(contextAfter)
        const isPartyContext = /sinh nhật|sinh nhat|hbd|hpbd|happy|thôi nôi|thoi noi|đầy tháng|day thang|bảng|bang|chữ|chu|trang trí|trang tri|bé|be/.test(contextBefore)

        if (isBookerContext && !isPartyContext) {
          bookerCandidates.push(name)
        } else if (isPartyContext) {
          partyOwnerCandidates.push(name)
        }
      }
    })

    return {
      peopleNames,
      bookerCandidates,
      partyOwnerCandidates
    }
  }

  function extractByRules(normalizedText: string) {
    const blocks = segmentInputBlocksCompat(normalizedText)
    const clean = stripAccents(normalizedText).toLowerCase()
    
    let phone: string | null = null
    const phoneRegex = /(0[35789]\d{7,9})/g
    const custPhoneMatch = blocks.customer_block.match(phoneRegex)
    if (custPhoneMatch) {
      phone = custPhoneMatch[0]
    } else {
      const allPhoneMatch = normalizedText.match(phoneRegex)
      if (allPhoneMatch) {
        const depositPhones = blocks.deposit_block.match(phoneRegex)
        if (depositPhones && depositPhones[0] === allPhoneMatch[0]) {
          if (allPhoneMatch.length > 1) phone = allPhoneMatch[1]
        } else {
          phone = allPhoneMatch[0]
        }
      }
    }
    if (phone) phone = cleanPhoneNumber(phone)
    
    let customer_name: string | null = null
    const nameResults = classifyPeopleNames(normalizedText)
    const requestKeywords = /\byeu\s+cau\b|\bphong\s+lanh\b|\btrang\s+tri\b|\bbong\s+bong\b|\bbong\s+bay\b|\bcom\s+chien\b|\bthuc\s+don\b|\bmon\s+an\b|\bcoc\b|\bchuyen\s+khoan\b|\bset\s+menu\b|\bcombo\b|\bbao\s+gia\b|\bbia\b|\bnuoc\s+ngot\b/i
    const filterValidNames = (names: string[]) => names.filter(n => !requestKeywords.test(stripAccents(n).toLowerCase()))
    
    const validBookers = filterValidNames(nameResults.bookerCandidates)
    if (validBookers.length > 0) {
      customer_name = validBookers[0]
    } else {
      // Fallback: Pick the first name that is not a party owner candidate
      const potentialBookers = filterValidNames(nameResults.peopleNames).filter(name => !nameResults.partyOwnerCandidates.includes(name))
      if (potentialBookers.length > 0) {
        customer_name = potentialBookers[0]
      }
    }

    let event_date: string | null = null
    const dateRegex = /(\d{2})\/(\d{2})\/(\d{4})/g
    const dateMatch = normalizedText.match(dateRegex)
    if (dateMatch) {
      event_date = dateMatch[0]
    }
    
    let event_time: string | null = null
    // Match HH:mm (colon) format first
    const colonTimeMatch = normalizedText.match(/\b(\d{1,2}):(\d{2})\b/)
    if (colonTimeMatch) {
      event_time = colonTimeMatch[0].length === 4 ? '0' + colonTimeMatch[0] : colonTimeMatch[0]
    }
    // Match Vietnamese time: 18h15, 7h30, 18h, 7h toi
    if (!event_time) {
      const vnTimeMatch = clean.match(/(\d{1,2})h(\d{2})?/)
      if (vnTimeMatch) {
        let h = parseInt(vnTimeMatch[1])
        const m = vnTimeMatch[2] ? parseInt(vnTimeMatch[2]) : 0
        // Restaurant context: hours < 12 likely PM
        if (h < 12 && !/sang/i.test(clean)) h += 12
        if (h >= 24) h -= 12
        event_time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      }
    }

    let guest_count: number | null = null
    const paxMatch = clean.match(/(\d+)\s*(pax|nguoi|ng|khach|cho)/i)
    if (paxMatch) {
      guest_count = parseInt(paxMatch[1])
    }
    
    let table_code: string | null = null
    // Priority 1: "bàn A13" — table with letter prefix (letter required)
    const tableWithLetterMatch = clean.match(/ban\s+([a-g]\d{1,2})\b/i)
    if (tableWithLetterMatch) {
      table_code = tableWithLetterMatch[1].toUpperCase()
    }
    // Priority 2: standalone "A13", "B8", "C6" anywhere
    if (!table_code) {
      const directMatch = clean.match(/\b([a-g]\d{1,2})\b/i)
      if (directMatch) {
        table_code = directMatch[1].toUpperCase()
      }
    }
    // Priority 3: "bàn 5" — bare number, NOT followed by guest-count words
    if (!table_code) {
      const bareTableMatch = clean.match(/ban\s+(\d{1,2})\b(?!\s*(?:ng\b|nguoi|khach|pax|cho\b))/i)
      if (bareTableMatch) {
        table_code = 'A' + bareTableMatch[1]
      }
    }

    let booking_need = 'Ăn thường'
    if (/sinh nhat|sn|mung tho/i.test(clean)) booking_need = 'Sinh nhật'
    else if (/thoi noi/i.test(clean)) booking_need = 'Thôi nôi (1st)'
    else if (/cong ty|cty|doanh nghiep|ortholite/i.test(clean)) booking_need = 'Công ty'
    else if (/tat nien/i.test(clean)) booking_need = 'Tất niên'
    else if (/tan nien/i.test(clean)) booking_need = 'Tân niên'
    else if (/cuoi|bao hy/i.test(clean)) booking_need = 'Cưới/Báo hỷ'
    else if (/farewell|chia tay/i.test(clean)) booking_need = 'Farewell (Tiệc chia tay)'
    else if (/ky niem/i.test(clean)) booking_need = 'Kỉ niệm'
    else if (/lien hoan|tiec|hop lop/i.test(clean)) booking_need = 'Liên hoan'

    let decoration_text = ''
    if (blocks.decoration_block) {
      const decoMatch = normalizedText.match(/(?:happy birthday|hbd|bang chu|chu)\s+([^:\n]+)/i)
      if (decoMatch) {
        decoration_text = decoMatch[1].trim()
      } else {
        decoration_text = blocks.decoration_block
      }
    }

    let deposit_amount: number | null = null
    // Only extract deposit when deposit context keywords are present
    const hasDepositCtx = /coc|dat coc|doi coc|da coc/i.test(clean)
    if (hasDepositCtx) {
      const depMatch = clean.match(/(?:coc|dat coc|doi coc|da coc)\s*(\d+(?:[.,]\d+)?)\s*(k|tr|trieu|cu|trn)/i)
        || clean.match(/(\d+(?:[.,]\d+)?)\s*(k|tr|trieu|cu|trn)(?=\s|$)/i)
      if (depMatch) {
        let amt = parseFloat(depMatch[1].replace(',', '.'))
        const unit = depMatch[2].toLowerCase()
        if (unit === 'k') amt *= 1000
        else if (unit.startsWith('tr') || unit === 'cu' || unit === 'trn') amt *= 1000000
        deposit_amount = Math.round(amt)
      }
    }
    
    let deposit_status = 'chờ cọc'
    if (/da chuyen|chuyen roi|da coc/i.test(clean)) {
      deposit_status = 'đã cọc'
    } else if (/doi coc|cho coc|chua coc/i.test(clean)) {
      deposit_status = 'chờ cọc'
    }

    const note = blocks.note_block || ''

    let receiver: string | null = null
    const receiverMatch = clean.match(/(?:nhan:|nhan\s+nv|nhan\s+dmt|nv\b)\s*([a-z0-9]+)/i)
    if (receiverMatch) {
      receiver = receiverMatch[1].toUpperCase()
    }

    const menu_items: any[] = []

    // Format 0: OCR table format — "STT Món ăn Số lượng Đơn giá" header detected
    // Lines like: "1 Miến xào cua 2 229,000" → {name: "Miến xào cua", qty: 2, price: 229000}
    const isTableFormat = /stt|s\s*t\s*t|món ăn|mon an|số lượng|so luong|đơn giá|don gia/i.test(normalizedText)
    if (isTableFormat) {
      const allLines = normalizedText.split('\n')
      for (const line of allLines) {
        const trimmed = line.trim()
        // Match: STT  DishName  Qty  Price (e.g., "1 Miến xào cua 2 229,000")
        const tableMatch = trimmed.match(/^(\d{1,3})\s+([\p{L}\s,]+?)\s+(\d{1,3})\s+([\d,.]+)\s*$/u)
        if (tableMatch) {
          const stt = parseInt(tableMatch[1])
          const name = tableMatch[2].trim()
          const qty = parseInt(tableMatch[3])
          const priceStr = tableMatch[4].replace(/[,.]/g, '')
          const price = parseInt(priceStr) || 0
          // Validate: STT should be sequential (1-99), qty reasonable (1-999)
          if (stt >= 1 && stt <= 99 && qty >= 1 && qty <= 999 && name.length > 1) {
            menu_items.push({
              raw_name: name,
              quantity: qty,
              unit_price: price,
              note: ''
            })
          }
        }
      }
    }

    // Format 1: "3 sườn nướng" or "sườn nướng x3" from menu_block (skip if table format already matched)
    if (menu_items.length === 0) {
      const menuLines = blocks.menu_block.split('\n')
      for (const line of menuLines) {
        const lineClean = line.trim()
        const lineMatch = lineClean.match(/^(\d+)\s+(.+)$/)
        if (lineMatch) {
          menu_items.push({
            raw_name: lineMatch[2].trim(),
            quantity: parseInt(lineMatch[1]),
            unit_price: null,
            note: ''
          })
        } else {
          const lineMatch2 = lineClean.match(/^(.+?)\s*x\s*(\d+)$/i)
          if (lineMatch2) {
            menu_items.push({
              raw_name: lineMatch2[1].trim(),
              quantity: parseInt(lineMatch2[2]),
              unit_price: null,
              note: ''
            })
          }
        }
      }
    }

    // Format 2: Comma-separated dishes from template labels
    // e.g. "Yêu cầu đặt trước (thức ăn,...): khói tây bắc, sụn gà chiên mắm tỏi, miến xào cua"
    if (menu_items.length === 0) {
      const foodLabelMatch = normalizedText.match(/(?:yêu cầu đặt trước|thức ăn|món ăn|thuc an|mon an|dat truoc|order|gọi món|goi mon)[^:]*:\s*(.+)/i)
      if (foodLabelMatch) {
        const dishList = foodLabelMatch[1].split(/[,;]/).map((d: string) => d.trim()).filter((d: string) => d.length > 2)
        for (const dish of dishList) {
          // Skip if it looks like a non-food label
          if (/^\d+$/.test(dish) || /sinh nhat|lien hoan|cong ty/i.test(dish)) continue
          menu_items.push({
            raw_name: dish,
            quantity: 1,
            unit_price: null,
            note: ''
          })
        }
      }
    }

    return {
      customer_name,
      phone,
      event_date,
      event_time,
      guest_count,
      table_code,
      booking_need,
      decoration_text,
      deposit_amount,
      deposit_status,
      note,
      menu_items,
      receiver
    }
  }

  function resolveContext(parsed: any) {
    const resolved = { ...parsed }
    if (formStore.customer.date && !resolved.event_date) {
      resolved.event_date = formStore.customer.date
    }
    const formTable = (uiStore.tempTable.zone || '') + (uiStore.tempTable.number || '')
    if (formTable && !resolved.table_code) {
      resolved.table_code = formTable
    }
    if (formStore.customer.name && !resolved.customer_name) {
      resolved.customer_name = formStore.customer.name
    }
    if (formStore.customer.phone && !resolved.phone) {
      resolved.phone = formStore.customer.phone
    }
    if (formStore.customer.pax && !resolved.guest_count) {
      resolved.guest_count = parseInt(formStore.customer.pax) || null
    }
    if (formStore.customer.type && resolved.booking_need === 'Ăn thường') {
      resolved.booking_need = formStore.customer.type
    }
    return resolved
  }

  // V6 Port: Fuzzy menu matching (exact → contains → word overlap)
  function fuzzyMatchMenu(inputName: string, guestCount?: number | null) {
    const menuList = appStore.menuList
    if (!menuList || menuList.length === 0) return null
    
    let rawName = inputName.trim()
    const qtyMatch = rawName.match(/(?:[x\*])\s*(\d+)\s*$/i)
    if (qtyMatch) {
      rawName = rawName.replace(/(?:[x\*])\s*(\d+)\s*$/i, '').trim()
    }
    const clean = stripAccents(rawName).toLowerCase().trim()
    if (!clean || clean.length < 2) return null

    // Portion resolution logic check
    const baseRaw = getBaseDishName(rawName)
    const portionCandidates = menuList.filter((m: any) => getBaseDishName(m.name) === baseRaw)
    const hasPortions = portionCandidates.some((m: any) => getMenuPortionSize(m.name) !== null)
    
    if (portionCandidates.length > 0 && hasPortions) {
      let targetPortion = extractPortionSize(rawName)
      if (targetPortion === null) {
        if (guestCount !== undefined && guestCount !== null) {
          targetPortion = guestCount < 5 ? 5 : 10
        } else {
          const formPax = formStore.customer?.pax
          const paxNum = formPax ? parseInt(String(formPax), 10) : null
          if (paxNum !== null && !isNaN(paxNum)) {
            targetPortion = paxNum < 5 ? 5 : 10
          } else {
            targetPortion = 10
          }
        }
      }
      const portionMatch = portionCandidates.find((m: any) => getMenuPortionSize(m.name) === targetPortion)
      if (portionMatch) {
        return portionMatch
      }
    }

    // 1. Exact match (cleanName or acronym)
    const exact = menuList.find((m: any) => m.cleanName === clean || m.acronym === clean)
    if (exact) return exact

    // 2. Alias match
    const aliases = appStore.menuAliases || []
    const aliasMatch = aliases.find((a: any) => stripAccents(a.alias).toLowerCase().trim() === clean)
    if (aliasMatch) {
      const dish = menuList.find((m: any) => m.name === aliasMatch.dishName)
      if (dish) return dish
    }

    // 3. Contains match: input contains menu name or vice versa (sorted by closest length)
    const containsCandidates: { item: any; score: number }[] = []
    for (const m of menuList) {
      if (m.cleanName && (clean.includes(m.cleanName) || m.cleanName.includes(clean))) {
        const lenDiff = Math.abs(clean.length - m.cleanName.length)
        containsCandidates.push({ item: m, score: 1 / (1 + lenDiff) })
      }
    }
    if (containsCandidates.length > 0) {
      containsCandidates.sort((a, b) => b.score - a.score)
      return containsCandidates[0].item
    }

    // 4. Word overlap match (for partial names like "ba chi" → "ba chi heo nuong")
    const inputWords = clean.split(/\s+/).filter((w: string) => w.length > 1)
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

  // Resolve raw menu items from rule extraction to real menu items using fuzzyMatchMenu
  function resolveMenuItemsLocally(rawItems: any[], guestCount?: number | null): any[] {
    if (!rawItems || rawItems.length === 0) return []
    return rawItems.map(item => {
      const match = fuzzyMatchMenu(item.raw_name || item.name || '', guestCount)
      return {
        matched_name: match ? match.name : (item.raw_name || item.name),
        name: match ? match.name : (item.raw_name || item.name),
        quantity: item.quantity || item.qty || 1,
        unit_price: match ? match.price : (item.unit_price || 0),
        price: match ? match.price : (item.unit_price || 0),
        note: item.note || ''
      }
    })
  }

  function shouldBypassAI(ruleResult: any, inputType: string, menuDetected: boolean): boolean {
    if (['menu_order_text', 'mixed_booking_menu', 'deposit_bill_image', 'chat_screenshot', 'decoration_request'].includes(inputType)) {
      return false
    }
    if (menuDetected) return false
    
    const nameResults = classifyPeopleNames(formStore.rawInput || '')
    if (nameResults.peopleNames.length > 1) {
      return false
    }

    const hasNameOrPhone = !!(ruleResult.customer_name || ruleResult.phone || nameResults.peopleNames[0])
    const hasDate = !!ruleResult.event_date
    const hasTime = !!ruleResult.event_time
    const hasPax = !!ruleResult.guest_count
    
    return hasNameOrPhone && hasDate && hasTime && hasPax
  }

  function isFieldDirty(field: string): boolean {
    if (field === 'name' && !formStore.customer.name) return false
    if (field === 'phone' && !formStore.customer.phone) return false
    if (field === 'date' && !formStore.customer.date) return false
    if (field === 'time' && !formStore.customer.time) return false
    if (field === 'pax' && !formStore.customer.pax) return false
    if (field === 'tables') {
      const currentTableNumber = uiStore.tempTable.number || ''
      if (!currentTableNumber.trim()) return false
    }

    if (!formStore.originalAiValues) {
      if (field === 'name' && formStore.customer.name) return true
      if (field === 'phone' && formStore.customer.phone) return true
      if (field === 'date' && formStore.customer.date) return true
      if (field === 'time' && formStore.customer.time) return true
      if (field === 'pax' && formStore.customer.pax) return true
      if (field === 'tables') {
        const currentTableNumber = uiStore.tempTable.number || ''
        if (currentTableNumber.trim()) return true
      }
      return false
    }

    if (field === 'name') return formStore.customer.name !== formStore.originalAiValues.name
    if (field === 'phone') return cleanPhoneNumber(formStore.customer.phone) !== cleanPhoneNumber(formStore.originalAiValues.phone)
    if (field === 'date') return formatDateStr(formStore.customer.date) !== formatDateStr(formStore.originalAiValues.date)
    if (field === 'time') return formStore.customer.time !== formStore.originalAiValues.time
    if (field === 'pax') return String(formStore.customer.pax) !== String(formStore.originalAiValues.pax)
    if (field === 'tables') {
      const currentTable = (uiStore.tempTable.zone || '') + (uiStore.tempTable.number || '')
      const originalTable = formStore.originalAiValues.tables || ''
      if (!uiStore.tempTable.number && !originalTable) return false
      return currentTable !== originalTable
    }
    return false
  }

  function resolveDisplayCustomerName(parsed: any): string {
    if (parsed.customer?.name && parsed.customer.name.trim()) {
      const name = parsed.customer.name.trim()
      const cleanNameLower = stripAccents(name).toLowerCase()
      // Guard: do not allow request, notes or food keywords to be used as customer name
      const requestKeywords = /\byeu\s+cau\b|\bphong\s+lanh\b|\btrang\s+tri\b|\bbong\s+bong\b|\bbong\s+bay\b|\bcom\s+chien\b|\bthuc\s+don\b|\bmon\s+an\b|\bcoc\b|\bchuyen\s+khoan\b|\bset\s+menu\b|\bcombo\b|\bbao\s+gia\b|\bbia\b|\bnuoc\s+ngot\b/i
      if (requestKeywords.test(cleanNameLower)) {
        return ''
      }
      return name;
    }
    if (parsed.party?.owner_name && parsed.party.owner_name.trim()) {
      if (!parsed.warnings) parsed.warnings = [];
      if (!parsed.warnings.includes('used_party_owner_as_customer_name')) {
        parsed.warnings.push('used_party_owner_as_customer_name');
        parsed.needs_review = parsed.needs_review || [];
        if (!parsed.needs_review.includes('used_party_owner_as_customer_name')) {
          parsed.needs_review.push('used_party_owner_as_customer_name');
        }
      }
      return parsed.party.owner_name;
    }
    if (parsed.raw_entities?.people_names?.length === 1 && parsed.raw_entities.people_names[0].trim()) {
      if (!parsed.warnings) parsed.warnings = [];
      if (!parsed.warnings.includes('used_single_ambiguous_name_as_customer_name')) {
        parsed.warnings.push('used_single_ambiguous_name_as_customer_name');
        parsed.needs_review = parsed.needs_review || [];
        if (!parsed.needs_review.includes('used_single_ambiguous_name_as_customer_name')) {
          parsed.needs_review.push('used_single_ambiguous_name_as_customer_name');
        }
      }
      return parsed.raw_entities.people_names[0];
    }
    if (!parsed.warnings) parsed.warnings = [];
    if (!parsed.warnings.includes('missing_customer_name')) {
      parsed.warnings.push('missing_customer_name');
      parsed.needs_review = parsed.needs_review || [];
      if (!parsed.needs_review.includes('missing_customer_name')) {
        parsed.needs_review.push('missing_customer_name');
      }
    }
    return '';
  }

  function buildPartyNote(party: any, existingNote: string): string {
    const lines: string[] = []
    if (party) {
      const ownerName = party.owner_name || '';
      if (ownerName.trim()) {
        if (ownerName.includes('và') || ownerName.includes(',') || ownerName.includes(';')) {
          lines.push('Chủ tiệc / người được tổ chức:')
          const names = ownerName.split(/và|,|;/).map((n: string) => n.trim()).filter(Boolean)
          names.forEach((name: string) => {
            lines.push(`- ${name}`)
          })
        } else {
          lines.push(`Chủ tiệc / người được tổ chức: ${ownerName.trim()}`)
        }
      }
      if (party.display_board_text || party.text_on_board) {
        lines.push(`Nội dung bảng/trang trí: ${party.display_board_text || party.text_on_board}`)
      }
      if (party.special_request) {
        lines.push(`Ghi chú thêm: ${party.special_request}`)
      }
    }
    
    const blockText = lines.join('\n')
    let cleanExisting = existingNote || ''
    
    if (cleanExisting.includes('Chủ tiệc / người được tổ chức:')) {
      const parts = cleanExisting.split(/Chủ tiệc \/ người được tổ chức:.+?(?=\n\n|\n[A-Z]|$)/s)
      cleanExisting = parts.join('').trim()
    }
    
    if (!blockText) return cleanExisting
    
    if (cleanExisting) {
      if (cleanExisting.includes(blockText)) return cleanExisting
      return `${blockText}\n\n${cleanExisting}`
    }
    return blockText
  }

  function fillBookingFormSafely(parsedResult: any, options: { mode: 'all' | 'customer' | 'menu' }) {
    const { mode } = options

    // P2: Robust 4-case table parser (from V6.0)
    function parseTableCode(tableStr: string): { zone: string; number: string } | null {
      if (!tableStr) return null
      const s = String(tableStr).trim().toUpperCase()
      // Case 1: Zone + Number — "B5", "C12", "A13"
      const full = s.match(/^([A-G])(\d+)$/)
      if (full) return { zone: full[1], number: full[2] }
      // Case 2: Number only — "5" → default Zone A
      const numOnly = s.match(/^(\d+)$/)
      if (numOnly) return { zone: 'A', number: numOnly[1] }
      // Case 3: Zone only — "C"
      const zoneOnly = s.match(/^([A-G])$/)
      if (zoneOnly) return { zone: zoneOnly[1], number: '' }
      // Case 4: Unknown format — try best effort
      const bestEffort = s.match(/([A-G])?\s*(\d+)/)
      if (bestEffort) return { zone: bestEffort[1] || 'A', number: bestEffort[2] }
      return null
    }

    const setFormVal = (field: string, newValue: any, setter: (val: any) => void) => {
      if (newValue === undefined || newValue === null) return
      const isDirty = isFieldDirty(field)
      if (!isDirty) {
        setter(newValue)
      } else {
        formStore.warnings.push(`Trường ${field} không được ghi đè vì nhân viên đã sửa thủ công thành "${formStore.customer[field as keyof typeof formStore.customer]}".`)
      }
    }

    if (mode === 'all' || mode === 'customer') {
      const resolvedName = resolveDisplayCustomerName(parsedResult)
      if (resolvedName) {
        setFormVal('name', resolvedName, (val) => { formStore.customer.name = val })
      }
      
      const customerInfo = parsedResult.customer || parsedResult
      if (customerInfo && customerInfo.phone) {
        setFormVal('phone', cleanPhoneNumber(customerInfo.phone), (val) => { formStore.customer.phone = val })
      }
      
      const bookingInfo = parsedResult.booking || parsedResult.reservation || parsedResult
      if (bookingInfo) {
        if (bookingInfo.event_date || bookingInfo.date) {
          setFormVal('date', formatDateStr(bookingInfo.event_date || bookingInfo.date), (val) => { formStore.customer.date = val })
        }
        if (bookingInfo.event_time || bookingInfo.time) {
          setFormVal('time', bookingInfo.event_time || bookingInfo.time, (val) => { formStore.customer.time = val })
        }
        if (bookingInfo.guest_count || bookingInfo.pax) {
          setFormVal('pax', String(bookingInfo.guest_count || bookingInfo.pax), (val) => { formStore.customer.pax = val })
        }
        // Party type: check booking.need, booking.type, AND party.type (AI may use any of these)
        const partyType = normalizePartyType(bookingInfo.need || bookingInfo.type || parsedResult.party?.type || '')
        if (partyType && partyType !== 'Ăn thường') {
          setFormVal('type', partyType, (val) => { formStore.customer.type = val })
        }
        if (bookingInfo.table_number || bookingInfo.table_code) {
          const isTableDirty = isFieldDirty('tables')
          if (!isTableDirty) {
            const table = parseTableCode(bookingInfo.table_number || bookingInfo.table_code)
            if (table) {
              uiStore.tempTable.zone = table.zone
              uiStore.tempTable.number = table.number
            }
          }
        }
      }

      const partyInfo = parsedResult.party || null
      const notesInfo = parsedResult.notes || parsedResult
      const customerNoteVal = notesInfo?.customer_note || parsedResult.booking?.notes || parsedResult.reservation?.notes || parsedResult.note || ''
      
      const currentItems = parsedResult.menu_items || parsedResult.items || []
      let updatedNote = buildPartyNote(partyInfo, formStore.customer.note || customerNoteVal)
      updatedNote = cleanBookingNotes(
        updatedNote,
        { name: formStore.customer.name, phone: formStore.customer.phone },
        { guest_count: formStore.customer.pax },
        currentItems
      )
      formStore.customer.note = updatedNote
      
      // Deposit: Only from explicit deposit/payment objects (NEVER fallback to parsedResult root)
      // Also validate that deposit keywords exist in input to prevent AI hallucination
      // Deposit: Only from explicit deposit/payment objects (NEVER fallback to parsedResult root)
      // Also validate that deposit keywords exist in input OR we are analyzing an image to prevent AI hallucination
      const depositInfo = parsedResult.deposit || parsedResult.payment || null
      if (depositInfo?.amount) {
        const depositKeywords = /c[oọ][ck]|đ[aặ]t c[oọ][ck]|chuy[eể]n kho[aả]n|thanh to[aá]n|deposit/i
        const rawInput = formStore.rawInput || ''
        const hasImageContext = !!formStore.aiImage || ['deposit_bill_image', 'chat_screenshot'].includes(parsedResult.input_type || '')
        
        if (depositKeywords.test(rawInput) || hasImageContext) {
          formStore.deposit.amount = parseInt(String(depositInfo.amount)) || 0
          if (depositInfo.status === 'đã cọc' || depositInfo.status === 'YES' || depositInfo.method === 'transfer') {
            formStore.deposit.isPaid = true
          }
          if (depositInfo.bank_ref || depositInfo.bank_reference) {
            formStore.deposit.note = `AI Ref: ${depositInfo.bank_ref || depositInfo.bank_reference}`
          }
        }
      }

      // Staff / Receiver match (from rule engine or AI)
      const receiver = parsedResult.staff?.receiver || parsedResult.receiver || null
      if (receiver && appStore.staffList) {
        const cleanRec = stripAccents(receiver).toLowerCase().trim()
        const matchedStaff = appStore.staffList.find((s: any) => 
          s.isActive !== false && (
            stripAccents(s.name).toLowerCase().trim() === cleanRec ||
            stripAccents(s.name).toLowerCase().replace(/\s+/g, '') === cleanRec ||
            stripAccents(s.name).toLowerCase().split(/\s+/).map((w: string) => w[0]).join('') === cleanRec
          )
        )
        if (matchedStaff) {
          formStore.staff.name = matchedStaff.name
          formStore.staff.phone = matchedStaff.phone || ''
        }
      }
    }

    if (mode === 'all' || mode === 'menu') {
      const menuItems = parsedResult.menu_items || parsedResult.items
      if (menuItems && Array.isArray(menuItems) && menuItems.length > 0) {
        const newItems = menuItems.map((newItem: any) => ({
          name: newItem.matched_name || newItem.name,
          qty: newItem.quantity || newItem.qty || 1,
          price: newItem.unit_price || newItem.price || 0,
          note: newItem.note || newItem.notes || ""
        }))

        if (mode === 'all') {
          // Full analysis → REPLACE items entirely (like V6 — prevents qty doubling)
          formStore.items = newItems
        } else {
          // Menu-only mode → MERGE incrementally
          const existingItems = [...formStore.items]
          for (const item of newItems) {
            const matchIdx = existingItems.findIndex(i => 
              stripAccents(i.name).toLowerCase().trim() === stripAccents(item.name).toLowerCase().trim() &&
              i.note === item.note
            )
            if (matchIdx !== -1) {
              existingItems[matchIdx].qty += item.qty
            } else {
              existingItems.push(item)
            }
          }
          formStore.items = existingItems
        }
      }
    }

    formStore.originalAiValues = {
      name: formStore.customer.name,
      phone: formStore.customer.phone,
      date: formStore.customer.date,
      time: formStore.customer.time,
      pax: String(formStore.customer.pax || ''),
      tables: (uiStore.tempTable.zone || '') + (uiStore.tempTable.number || ''),
      type: formStore.customer.type || 'Ăn thường',
      note: formStore.customer.note || '',
      items: JSON.parse(JSON.stringify(formStore.items || []))
    }
  }



  function normalizePartyType(typeStr: string): string {
    if (!typeStr) return 'Ăn thường'
    const s = stripAccents(typeStr).toLowerCase().trim()
    if (/sinh nhat|sn|mung tho/i.test(s)) return 'Sinh nhật'
    if (/thoi noi/i.test(s)) return 'Thôi nôi (1st)'
    if (/cong ty|cty|doanh nghiep|ortholite/i.test(s)) return 'Công ty'
    if (/tat nien/i.test(s)) return 'Tất niên'
    if (/tan nien/i.test(s)) return 'Tân niên'
    if (/cuoi|bao hy/i.test(s)) return 'Cưới/Báo hỷ'
    if (/farewell|chia tay/i.test(s)) return 'Farewell (Tiệc chia tay)'
    if (/ky niem/i.test(s)) return 'Kỉ niệm'
    if (/lien hoan|tiec|hop lop/i.test(s)) return 'Liên hoan'
    return 'Ăn thường'
  }

  function repairAndNormalizeJSON(raw: any, inputType = 'unknown'): any {
    const fallback: any = {
      version: "AI_CORE_V7",
      input_type: inputType,
      customer: { name: "", phone: "" },
      booking: {
        event_date: "",
        event_time: "",
        guest_count: null,
        table_count: null,
        table_number: "",
        need: "",
        status: ""
      },
      menu_items: [],
      deposit: {
        amount: null,
        status: "",
        transfer_time: "",
        sender_name: "",
        bank_ref: "",
        needs_review: false
      },
      decoration: { type: "", text_on_board: "", note: "" },
      notes: { customer_note: "", internal_note: "", uncertain_info: [] },
      confidence: {
        overall: 0.5,
        customer_name: 0.5,
        phone: 0.5,
        event_date: 0.5,
        event_time: 0.5,
        guest_count: 0.5,
        menu_items: 0.5,
        deposit: 0.5
      },
      needs_review_fields: [],
      reasoning_summary: ""
    }

    if (!raw) return fallback
    let parsed = typeof raw === 'string' ? parseJSON(raw) : raw
    if (!parsed) return fallback

    const safeGet = (obj: any, path: string, defVal: any) => {
      const parts = path.split('.')
      let curr = obj
      for (const part of parts) {
        if (curr === null || curr === undefined) return defVal
        curr = curr[part]
      }
      return curr !== undefined ? curr : defVal
    }

    let customerName = safeGet(parsed, 'customer.name', parsed.customer_name || "")
    const customerPhone = safeGet(parsed, 'customer.phone', parsed.customer_phone || "")

    const eventDate = safeGet(parsed, 'booking.event_date', safeGet(parsed, 'reservation.date', parsed.event_date || ""))
    const eventTime = safeGet(parsed, 'booking.event_time', safeGet(parsed, 'reservation.time', parsed.event_time || ""))
    const guestCount = safeGet(parsed, 'booking.guest_count', safeGet(parsed, 'reservation.pax', parsed.guest_count || null))
    const tableCount = safeGet(parsed, 'booking.table_count', parsed.table_count || null)
    const tableNumber = safeGet(parsed, 'booking.table_number', safeGet(parsed, 'reservation.table_code', parsed.table_number || ""))
    const needRaw = safeGet(parsed, 'booking.need', safeGet(parsed, 'reservation.type', parsed.booking_need || ""))
    const need = normalizePartyType(needRaw)
    const status = safeGet(parsed, 'booking.status', parsed.status || "")

    const parsedItems = parsed.menu_items || parsed.items || parsed.menuItems || []
    const menuItems = Array.isArray(parsedItems) ? parsedItems.map((item: any) => ({
      raw_name: item.raw_name || item.name || "",
      matched_name: item.matched_name || item.name || "",
      quantity: parseInt(String(item.quantity || item.qty || 1)) || 1,
      unit_price: parseFloat(String(item.unit_price || item.price || 0)) || 0,
      note: item.note || item.notes || "",
      match_confidence: parseFloat(String(item.match_confidence || 0.8)) || 0.8,
      needs_review: !!(item.needs_review || false)
    })) : []

    const depositAmount = safeGet(parsed, 'deposit.amount', safeGet(parsed, 'payment.amount', parsed.deposit_amount || null))
    const depositStatus = safeGet(parsed, 'deposit.status', safeGet(parsed, 'payment.method', parsed.deposit_status || ""))
    const transferTime = safeGet(parsed, 'deposit.transfer_time', parsed.transfer_time || "")
    const senderName = safeGet(parsed, 'deposit.sender_name', parsed.sender_name || "")
    const bankRef = safeGet(parsed, 'deposit.bank_ref', safeGet(parsed, 'payment.bank_reference', parsed.bank_ref || ""))
    const depositNeedsReview = !!safeGet(parsed, 'deposit.needs_review', false)

    const decorationType = safeGet(parsed, 'decoration.type', parsed.decoration_type || "")
    const textOnBoard = safeGet(parsed, 'decoration.text_on_board', parsed.decoration_text || safeGet(parsed, 'party.display_board_text', ""))
    const decorationNote = safeGet(parsed, 'decoration.note', parsed.decoration_note || "")

    const rawEntities = parsed.raw_entities || { people_names: [] }
    const peopleNames = rawEntities.people_names || []
    const partyOwner = safeGet(parsed, 'party.owner_name', parsed.party_owner || "")
    const needsReviewFields = parsed.needs_review_fields || []
    const warnings = parsed.warnings || []

    if (!customerName || !String(customerName).trim()) {
      if (partyOwner && String(partyOwner).trim()) {
        customerName = partyOwner
        if (!needsReviewFields.includes('used_party_owner_as_customer_name')) {
          needsReviewFields.push('used_party_owner_as_customer_name')
        }
        if (!warnings.includes('Dùng tên chủ tiệc làm tên khách hàng đặt bàn')) {
          warnings.push('Dùng tên chủ tiệc làm tên khách hàng đặt bàn')
        }
      } else if (peopleNames.length === 1) {
        customerName = peopleNames[0]
        if (!needsReviewFields.includes('used_single_ambiguous_name_as_customer_name')) {
          needsReviewFields.push('used_single_ambiguous_name_as_customer_name')
        }
        if (!warnings.includes('Dùng tên duy nhất trích xuất được làm tên khách hàng')) {
          warnings.push('Dùng tên duy nhất trích xuất được làm tên khách hàng')
        }
      } else if (peopleNames.length > 1) {
        if (!needsReviewFields.includes('missing_clear_booker_name')) {
          needsReviewFields.push('missing_clear_booker_name')
        }
        if (!warnings.includes('Có nhiều tên người nhưng không xác định rõ ai là người đặt')) {
          warnings.push('Có nhiều tên người nhưng không xác định rõ ai là người đặt')
        }
      } else {
        if (!needsReviewFields.includes('missing_customer_name')) {
          needsReviewFields.push('missing_customer_name')
        }
        if (!warnings.includes('Không tìm thấy tên khách hàng đặt bàn')) {
          warnings.push('Không tìm thấy tên khách hàng đặt bàn')
        }
      }
    }

    const partyObj = parsed.party || { type: need, owner_name: partyOwner, display_board_text: textOnBoard, special_request: "" }
    const rawNote = safeGet(parsed, 'notes.customer_note', safeGet(parsed, 'reservation.notes', parsed.note || ""))
    const customerNote = cleanBookingNotes(
      buildPartyNote(partyObj, rawNote),
      { name: customerName, phone: customerPhone },
      { guest_count: guestCount },
      menuItems
    )
    const internalNote = safeGet(parsed, 'notes.internal_note', parsed.internal_note || "")
    const uncertainInfo = safeGet(parsed, 'notes.uncertain_info', parsed.uncertain_info || [])

    fallback.input_type = parsed.input_type || inputType
    fallback.customer = { name: customerName, phone: cleanPhoneNumber(customerPhone) }
    fallback.booking = {
      event_date: eventDate,
      event_time: eventTime,
      guest_count: guestCount ? parseInt(String(guestCount)) : null,
      table_count: tableCount ? parseInt(String(tableCount)) : null,
      table_number: tableNumber,
      need: need,
      status: status
    }
    fallback.menu_items = menuItems
    fallback.deposit = {
      amount: depositAmount ? parseInt(String(depositAmount)) : null,
      status: depositStatus,
      transfer_time: transferTime,
      sender_name: senderName,
      bank_ref: bankRef,
      needs_review: depositNeedsReview
    }
    fallback.decoration = {
      type: decorationType || (textOnBoard ? 'Sinh nhật' : ''),
      text_on_board: textOnBoard,
      note: decorationNote
    }
    fallback.notes = {
      customer_note: customerNote,
      internal_note: internalNote,
      uncertain_info: uncertainInfo
    }
    fallback.confidence = {
      overall: parseFloat(String(safeGet(parsed, 'confidence.overall', 0.8))) || 0.8,
      customer_name: parseFloat(String(safeGet(parsed, 'confidence.customer_name', 0.8))) || 0.8,
      phone: parseFloat(String(safeGet(parsed, 'confidence.phone', 0.8))) || 0.8,
      event_date: parseFloat(String(safeGet(parsed, 'confidence.event_date', 0.8))) || 0.8,
      event_time: parseFloat(String(safeGet(parsed, 'confidence.event_time', 0.8))) || 0.8,
      guest_count: parseFloat(String(safeGet(parsed, 'confidence.guest_count', 0.8))) || 0.8,
      menu_items: parseFloat(String(safeGet(parsed, 'confidence.menu_items', 0.8))) || 0.8,
      deposit: parseFloat(String(safeGet(parsed, 'confidence.deposit', 0.8))) || 0.8
    }
    fallback.needs_review_fields = needsReviewFields
    fallback.warnings = warnings
    fallback.reasoning_summary = parsed.reasoning_summary || ""

    return fallback
  }

  function validateParsedFields(aiResult: any) {
    const result = { ...aiResult }
    const needsReviewFields = [...(result.needs_review_fields || [])]
    const conf = { ...result.confidence }

    const cleanPhone = cleanPhoneNumber(result.customer.phone || '')
    if (/^0[35789]\d{8}$/.test(cleanPhone)) {
      conf.phone = 1.0
    } else {
      conf.phone = 0.3
      if (!needsReviewFields.includes('phone')) needsReviewFields.push('phone')
    }

    if (result.booking.event_date) {
      const parts = result.booking.event_date.split('/')
      if (parts.length === 3) {
        const d = parseInt(parts[0])
        const m = parseInt(parts[1]) - 1
        const y = parseInt(parts[2])
        const eventDateObj = new Date(y, m, d, 23, 59, 59)
        const today = new Date()
        today.setHours(0,0,0,0)
        
        if (eventDateObj >= today) {
          conf.event_date = 1.0
        } else {
          conf.event_date = 0.2
          if (!needsReviewFields.includes('event_date')) needsReviewFields.push('event_date')
        }
      } else {
        conf.event_date = 0.2
        if (!needsReviewFields.includes('event_date')) needsReviewFields.push('event_date')
      }
    } else {
      conf.event_date = 0.0
      if (!needsReviewFields.includes('event_date')) needsReviewFields.push('event_date')
    }

    if (result.booking.event_time) {
      const timeMatch = result.booking.event_time.match(/^(\d{2}):(\d{2})$/)
      if (timeMatch) {
        const h = parseInt(timeMatch[1])
        const min = parseInt(timeMatch[2])
        if ((h > 15 || (h === 15 && min >= 0)) && (h < 23 || (h === 23 && min <= 30))) {
          conf.event_time = 1.0
        } else {
          conf.event_time = 0.4
          if (!needsReviewFields.includes('event_time')) needsReviewFields.push('event_time')
        }
      } else {
        conf.event_time = 0.2
        if (!needsReviewFields.includes('event_time')) needsReviewFields.push('event_time')
      }
    } else {
      conf.event_time = 0.0
      if (!needsReviewFields.includes('event_time')) needsReviewFields.push('event_time')
    }

    const pax = result.booking.guest_count
    if (pax !== null && pax >= 1 && pax <= 200) {
      conf.guest_count = 1.0
    } else {
      conf.guest_count = 0.3
      if (!needsReviewFields.includes('guest_count')) needsReviewFields.push('guest_count')
    }

    const name = result.customer.name || ''
    const cleanName = stripAccents(name).toLowerCase()
    const hasKeywords = /ngay|gio|pax|khach|nguoi|ban|dat|mon|set|combo|happy|birthday|hbd|chuc|mung/i.test(cleanName)
    if (name && name !== 'Khách hàng' && !hasKeywords) {
      conf.customer_name = 1.0
    } else {
      conf.customer_name = 0.3
      if (!needsReviewFields.includes('customer_name')) needsReviewFields.push('customer_name')
    }

    const depAmt = result.deposit.amount
    if (depAmt !== null) {
      if (depAmt >= 0 && depAmt <= 50000000) {
        conf.deposit = 1.0
      } else {
        conf.deposit = 0.4
        if (!needsReviewFields.includes('deposit')) needsReviewFields.push('deposit')
      }
    }

    const activeFields = ['customer_name', 'phone', 'event_date', 'event_time', 'guest_count']
    const sum = activeFields.reduce((acc, f) => acc + (conf[f] || 0.8), 0)
    conf.overall = sum / activeFields.length

    const finalConfidences: Record<string, { value: any; confidence: number; source_text: string; needs_review: boolean }> = {
      name: {
        value: result.customer.name,
        confidence: conf.customer_name,
        source_text: '',
        needs_review: needsReviewFields.includes('customer_name') || needsReviewFields.includes('used_party_owner_as_customer_name') || needsReviewFields.includes('used_single_ambiguous_name_as_customer_name') || needsReviewFields.includes('missing_clear_booker_name') || needsReviewFields.includes('missing_customer_name') || !result.customer.name
      },
      phone: {
        value: result.customer.phone,
        confidence: conf.phone,
        source_text: '',
        needs_review: needsReviewFields.includes('phone') || !result.customer.phone
      },
      date: {
        value: result.booking.event_date,
        confidence: conf.event_date,
        source_text: '',
        needs_review: needsReviewFields.includes('event_date') || !result.booking.event_date
      },
      time: {
        value: result.booking.event_time,
        confidence: conf.event_time,
        source_text: '',
        needs_review: needsReviewFields.includes('event_time') || !result.booking.event_time
      },
      pax: {
        value: result.booking.guest_count,
        confidence: conf.guest_count,
        source_text: '',
        needs_review: needsReviewFields.includes('guest_count') || !result.booking.guest_count
      },
      tables: {
        value: result.booking.table_number,
        confidence: 0.8,
        source_text: '',
        needs_review: needsReviewFields.includes('tables') || needsReviewFields.includes('table_number')
      }
    }

    if (result.needs_review && Array.isArray(result.needs_review)) {
      result.needs_review.forEach((nr: string) => {
        if (!needsReviewFields.includes(nr)) needsReviewFields.push(nr)
      })
    }
    if (result.warnings && Array.isArray(result.warnings)) {
      result.warnings.forEach((w: string) => {
        if (!needsReviewFields.includes(w)) needsReviewFields.push(w)
      })
    }

    result.confidence = conf
    result.confidences = finalConfidences
    result.needs_review_fields = needsReviewFields
    return result
  }

  function matchMenuItems(rawItems: any[], guestCount?: number | null): any[] {
    const { exactMap, aliasMap, acronymMap } = getMenuIndex()
    const menuList = appStore.menuList || []
    const attributes = ['trung muoi', 'tieu', 'pho mai', 'mo hanh', 'cay', 'lau', 'nuong', 'xao', 'hap']
    
    // Flatten multi-dish inputs (e.g. "6hàu phô mai 6 hàu mỡ hành")
    const expandedItems: any[] = []
    for (const item of rawItems) {
      const rawName = (item.raw_name || item.name || '').trim()
      const parsedSubDishes = parseDishItems(rawName)
      if (parsedSubDishes.length > 0) {
        logStore.addLog(`Tách món ghép: "${rawName}" -> [${parsedSubDishes.map(d => `${d.qty}x ${d.name}`).join(', ')}]`)
        for (const sub of parsedSubDishes) {
          const originalQty = item.quantity || item.qty || 1
          const finalQty = (sub.qty === 1 && originalQty > 1) ? originalQty : sub.qty
          expandedItems.push({
            raw_name: sub.name,
            quantity: finalQty,
            unit_price: item.unit_price || item.price || null,
            note: item.note || item.notes || ''
          })
        }
      } else {
        expandedItems.push(item)
      }
    }

    return expandedItems.map((item) => {
      let rawName = (item.raw_name || item.name || '').trim()
      
      // Extract quantity multiplier if present at the end, e.g. x2, x6, *2, *6
      const qtyMatch = rawName.match(/(?:[x\*])\s*(\d+)\s*$/i)
      if (qtyMatch) {
        item.quantity = parseInt(qtyMatch[1], 10)
        rawName = rawName.replace(/(?:[x\*])\s*(\d+)\s*$/i, '').trim()
      }

      // Normalize Vietnamese synonyms
      rawName = normalizeSynonyms(rawName)

      const clean = stripAccents(rawName).toLowerCase().trim()
      
      let match: any = null
      let confidence = 0.0
      let needsReview = false
      let matchType: 'exact' | 'alias' | 'acronym' | 'fuzzy' | 'none' = 'none'

      // 0. Portion size matching override for dishes with portion options
      const baseRaw = getBaseDishName(rawName)
      const portionCandidates = menuList.filter((m: any) => getBaseDishName(m.name) === baseRaw)
      const hasPortions = portionCandidates.some((m: any) => getMenuPortionSize(m.name) !== null)
      
      if (portionCandidates.length > 0 && hasPortions) {
        let targetPortion = extractPortionSize(rawName)
        if (targetPortion === null) {
          if (guestCount !== undefined && guestCount !== null) {
            targetPortion = guestCount < 5 ? 5 : 10
          } else {
            // Check formStore as fallback
            const formPax = formStore.customer?.pax
            const paxNum = formPax ? parseInt(String(formPax), 10) : null
            if (paxNum !== null && !isNaN(paxNum)) {
              targetPortion = paxNum < 5 ? 5 : 10
            } else {
              targetPortion = 10 // default fallback
            }
          }
        }
        
        const portionMatch = portionCandidates.find((m: any) => getMenuPortionSize(m.name) === targetPortion)
        if (portionMatch) {
          match = portionMatch
          confidence = 0.98
          matchType = 'fuzzy'
          logStore.addLog(`[Khớp phần ăn] Trích xuất "${rawName}" (Khách: ${guestCount || formStore.customer?.pax || 'chưa rõ'}) -> Khớp "${match.name}" (Phần ${targetPortion} con, Độ tin cậy: 98%)`, 'success')
        }
      }
      
      if (!match) {
        if (exactMap.has(clean)) {
          match = exactMap.get(clean)
          confidence = 1.0
          matchType = 'exact'
          logStore.addLog(`[Khớp món] "${rawName}" -> "${match.name}" (Khớp chính xác, Độ tin cậy: 100%)`, 'success')
        } else if (aliasMap.has(clean)) {
          match = aliasMap.get(clean)
          confidence = 1.0
          matchType = 'alias'
          logStore.addLog(`[Khớp món] "${rawName}" -> "${match.name}" (Khớp alias, Độ tin cậy: 100%)`, 'success')
        } else if (acronymMap.has(clean)) {
          match = acronymMap.get(clean)
          confidence = 0.95
          matchType = 'acronym'
          logStore.addLog(`[Khớp món] "${rawName}" -> "${match.name}" (Khớp viết tắt, Độ tin cậy: 95%)`, 'success')
        }
      }
      
      // 1.5. Contains match (subset/superset check)
      if (!match) {
        const containsCandidates: { item: any; score: number }[] = []
        const partModifiers = ['chan', 'canh', 'sun', 'me', 'long', 'doi', 'nam', 'gan', 'duoi', 'luoi', 'tai', 'vu', 'ba chi', 'nầm', 'chân', 'cánh', 'sụn', 'mề', 'lòng', 'dồi', 'gân', 'đuôi', 'lưỡi', 'tai', 'vú', 'ba chỉ']
        
        for (const m of menuList) {
          const mClean = stripAccents(m.name).toLowerCase().trim()
          if (mClean && clean && (mClean.includes(clean) || clean.includes(mClean))) {
            // Check if there is a part/type modifier in mClean that is NOT in clean
            let modifierConflict = false
            for (const mod of partModifiers) {
              const mHasMod = new RegExp(`\\b${mod}\\b`, 'i').test(mClean)
              const cleanHasMod = new RegExp(`\\b${mod}\\b`, 'i').test(clean)
              if (mHasMod && !cleanHasMod) {
                modifierConflict = true
                break
              }
            }
            
            const lenDiff = Math.abs(clean.length - mClean.length)
            let score = 1 / (1 + lenDiff)
            
            // StartsWith bonus
            if (mClean.startsWith(clean)) {
              score += 2.0
            }
            
            // Word boundary startsWith bonus
            const cleanWords = clean.split(/\s+/)
            const mWords = mClean.split(/\s+/)
            if (mWords.slice(0, cleanWords.length).join(' ') === clean) {
              score += 1.0
            }
            
            if (modifierConflict) {
              score -= 5.0 // heavy penalty for mismatching parts
            }
            
            containsCandidates.push({ item: m, score })
          }
        }
        
        const validCandidates = containsCandidates.filter(c => c.score > -2.0)
        if (validCandidates.length > 0) {
          validCandidates.sort((a, b) => b.score - a.score)
          match = validCandidates[0].item
          confidence = 0.95
          matchType = 'fuzzy'
          logStore.addLog(`[Khớp món] "${rawName}" -> "${match.name}" (Khớp chứa, Điểm: ${validCandidates[0].score.toFixed(2)})`, 'success')
        }
      }
      
      if (!match) {
        const inputTokens = clean.split(/\s+/).filter(t => t.length > 1)
        const matchedCandidates: { item: any; score: number; confidence: number }[] = []
        
        for (const m of menuList) {
          const mClean = stripAccents(m.name).toLowerCase().trim()
          const mTokens = mClean.split(/\s+/)
          
          const overlap = inputTokens.filter(t => mTokens.some(mt => mt.includes(t) || t.includes(mt))).length
          const overlapScore = (overlap / Math.max(inputTokens.length, 1)) * 0.7 + (overlap / Math.max(mTokens.length, 1)) * 0.3
          
          const dist = levenshteinDistance(clean, mClean)
          const levenshteinScore = 1 - (dist / Math.max(clean.length, mClean.length, 1))
          
          let attributeConflict = false
          let attributeMissingInUser = false
          for (const attr of attributes) {
            const cleanHasAttr = clean.includes(attr)
            const mCleanHasAttr = mClean.includes(attr)
            if (cleanHasAttr && !mCleanHasAttr) {
              attributeConflict = true
            } else if (!cleanHasAttr && mCleanHasAttr) {
              attributeMissingInUser = true
            }
          }
          
          const jaroWinklerScore = jaroWinklerDistance(clean, mClean)
          let score = 0.5 * overlapScore + 0.5 * jaroWinklerScore
          if (attributeConflict) {
            score *= 0.2
          } else if (attributeMissingInUser) {
            score *= 0.8
          }
          
          if (score >= 0.4) {
            matchedCandidates.push({ item: m, score, confidence: Math.max(0.1, score) })
          }
        }
        
        matchedCandidates.sort((a, b) => b.score - a.score)
        
        if (matchedCandidates.length > 0) {
          const best = matchedCandidates[0]
          match = best.item
          confidence = best.confidence
          matchType = 'fuzzy'
          
          if (matchedCandidates.length > 1) {
            const runnerUp = matchedCandidates[1]
            if (best.score - runnerUp.score < 0.15) {
              needsReview = true
            }
          }
          logStore.addLog(`[Khớp món] "${rawName}" -> "${match.name}" (Khớp mờ, Độ tin cậy: ${Math.round(confidence * 100)}%), Cần duyệt lại: ${needsReview}`, confidence < 0.75 ? 'warning' : 'info')
        }
      }
      
      if (match) {
        let note = item.note || item.notes || ''
        const isSet = /set|combo|goi|phan/i.test(match.name)
        let description = match.desc || appStore.menuDetails?.[match.name] || ''
        // Fallback to SETS constant for Set Menu descriptions (legacy support)
        if (!description && isSet && SETS[match.name.toUpperCase()]) {
          description = SETS[match.name.toUpperCase()]
        }
        if (description) {
          if (isSet) {
            const formattedNote = formatSetNote(description)
            note = note ? `${note}\n${formattedNote}` : formattedNote
          } else {
            note = note ? `${note} (${description})` : description
          }
        }
        
        return {
          raw_name: rawName,
          inputName: rawName,
          matched_name: match.name,
          matchedName: match.name,
          name: match.name,
          quantity: item.quantity || item.qty || 1,
          qty: item.quantity || item.qty || 1,
          unit_price: match.price || 0,
          price: match.price || 0,
          note: note.trim(),
          match_confidence: confidence,
          confidence,
          needs_review: needsReview || (confidence < 0.75),
          matchType,
          match_type: matchType,
          warning: confidence < 0.75 ? 'dish_fuzzy_match_low_confidence' : undefined
        }
      } else {
        logStore.addLog(`[Khớp món] Không tìm thấy món khớp cho "${rawName}"`, 'error')
        return {
          raw_name: rawName,
          inputName: rawName,
          matched_name: rawName,
          matchedName: rawName,
          name: rawName,
          quantity: item.quantity || item.qty || 1,
          qty: item.quantity || item.qty || 1,
          unit_price: 0,
          price: 0,
          note: (item.note || item.notes || '').trim(),
          match_confidence: 0.0,
          confidence: 0.0,
          needs_review: true,
          matchType: 'none',
          match_type: 'none',
          warning: 'dish_not_found'
        }
      }
    })
  }

  function levenshteinDistance(a: string, b: string): number {
    const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i])
    for (let j = 1; j <= a.length; j++) matrix[0][j] = j
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b[i - 1] === a[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1]
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          )
        }
      }
    }
    return matrix[b.length][a.length]
  }

  async function smartRouter(type: 'text' | 'vision', sysPrompt: string, userPrompt: string, image: string | null = null, inputType = 'unknown', signal?: AbortSignal) {
    const defaultId = type === 'vision' ? configStore.defaults.vision : configStore.defaults.text
    let candidates = AI_MODELS
      .filter(m => m.type === type)
      .filter(m => m.provider === 'pollinations' || configStore.keysStatus[m.provider]?.configured)
      
    candidates.sort((a, b) => {
      if (a.id === defaultId) return -1
      if (b.id === defaultId) return 1
      return a.tier - b.tier
    })
    
    logStore.addLog(`[AI Router] Các model AI khả dụng: ${candidates.map(c => c.name).join(', ')}`)
    if (candidates.length === 0) {
      logStore.addLog(`[AI Router] Lỗi: Chưa cấu hình API Key cho ${type === 'text' ? 'Text' : 'Vision'}`, 'error')
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

    const finalizeResult = (parsed: any, model: AIModel, mode: string, repairApplied = false) => {
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
      uiStore.loading.subMsg = `⚡ Race Mode: ${m1.name} vs ${m2.name}...`
      logStore.addLog(`[AI Router] Kích hoạt Chế độ Chạy đua (Race Mode): [${m1.name}] song song với [${m2.name}]...`, 'info')
      
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

          callAIModel(m1, sysPrompt, userPrompt, image, true, controller1.signal)
            .then(r => handleSuccess(r, m1, controller2))
            .catch(err => handleFailure(err))
            
          callAIModel(m2, sysPrompt, userPrompt, image, true, controller2.signal)
            .then(r => handleSuccess(r, m2, controller1))
            .catch(err => handleFailure(err))
        })

        if (raceResult.raw) {
          logStore.addLog(`[AI Router] Model thắng cuộc đua: [${raceResult.model.name}]`, 'success')
          let parsed = parseJSON(raceResult.raw)
          let repairApplied = false
          if (!parsed) {
            parsed = await repairJSON(raceResult.raw)
            repairApplied = true
          }
          if (parsed) {
            return finalizeResult(parsed, raceResult.model, 'race', repairApplied)
          }
        }
      } catch (e: any) {
        console.warn('[AI Router] Race mode failed, falling back to Waterfall...', e)
        logStore.addLog(`[AI Router] Chế độ Race Mode thất bại (Lỗi: ${e.message}). Chuyển sang chế độ tuần tự (Waterfall)...`, 'warning')
        fallbackCount += 2
        lastError = e
      }
    }

    const waterfallStart = runRace ? 2 : 0
    for (let i = waterfallStart; i < candidates.length; i++) {
      const model = candidates[i]
      try {
        uiStore.loading.subMsg = `Waterfall (Tier ${model.tier}): ${model.name}...`
        logStore.addLog(`[AI Router] Waterfall (Tier ${model.tier}): Thử gọi model [${model.name}]...`)
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
        
        const apiCallPromise = callAIModel(model, sysPrompt, userPrompt, image, true, controller.signal)
        const rawResult = await Promise.race([apiCallPromise, timeoutPromise])
        if (rawResult) {
          let parsed = parseJSON(rawResult)
          let repairApplied = false
          if (!parsed) {
            parsed = await repairJSON(rawResult)
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
                console.warn(`[AI Router] Model Tier 0 (${model.name}) failed validation checks. Overall: ${overallConf}, missingPhone: ${missingPhone}, missingDate: ${missingDate}, missingTime: ${missingTime}. Falling back to next candidate...`)
                logStore.addLog(`[AI Router] Model [${model.name}] (Tier 0) không vượt qua kiểm định: độ tin cậy thấp (${overallConf}) hoặc thiếu thông tin cốt lõi (SĐT, ngày, giờ). Chuyển sang model tiếp theo.`, 'warning')
              }
            }
            
            if (!needsFallback) {
              logStore.addLog(`[AI Router] Model [${model.name}] trích xuất thành công!`, 'success')
              return finalizeResult(parsed, model, 'waterfall', repairApplied)
            }
            fallbackCount++
          }
        }
        throw new Error(`Invalid output format or validation failed from ${model.name}`)
      } catch (e: any) {
        console.warn(`[AI Router] Model ${model.name} failed:`, e.message)
        logStore.addLog(`[AI Router] Model [${model.name}] thất bại: ${e.message}`, 'warning')
        fallbackCount++
        lastError = e
      }
    }
    
    logStore.addLog(`[AI Router] Tất cả các model AI đều thất bại. Lỗi cuối: ${lastError?.message || 'Không có model khả dụng'}`, 'error')
    throw new Error('Tất cả các model AI đều thất bại. Lỗi cuối: ' + (lastError?.message || 'Không có model khả dụng'))
  }

  async function loadAllMenusData(): Promise<Record<string, any[]>> {
    const start = performance.now()
    const allData: Record<string, any[]> = {}
    
    let sheets = appStore.menuSheets
    let sheetsSource = 'store'
    
    if (!sheets || sheets.length === 0) {
      try {
        const cachedSheets = await getCachedMenuSheets()
        if (cachedSheets && cachedSheets.length > 0) {
          sheets = cachedSheets
          appStore.menuSheets = cachedSheets
          sheetsSource = 'local-cache'
        }
      } catch (e) {
        console.error('Failed to load menu sheets from local cache', e)
      }
    }
    
    if (!sheets || sheets.length === 0) {
      logStore.addLog(`[loadAllMenusData] Không tìm thấy danh sách sheet thực đơn nào (trống). Thời gian: 0ms`, 'warning')
      return allData
    }

    let cacheHits = 0
    let cacheMisses = 0
    const details: string[] = []

    await Promise.all(sheets.map(async (sheet) => {
      const menuItems = await getCachedMenu(sheet)
      if (menuItems && menuItems.length > 0) {
        allData[sheet] = menuItems
        cacheHits++
        details.push(`${sheet}: HIT (${menuItems.length} món)`)
      } else {
        cacheMisses++
        details.push(`${sheet}: MISS (scheduled background prefetch)`)
        // Trigger background prefetch via the store helper, do NOT await it.
        appStore.scheduleMenuPrefetch(sheet, { reason: 'ai-cache-miss', priority: 'background' })
      }
    }))

    const durationMs = (performance.now() - start).toFixed(1)
    logStore.addLog(
      `[AI Caching V2] Đọc cache thực đơn xong: ${durationMs}ms | ` +
      `Nguồn sheets: ${sheetsSource} | Total: ${sheets.length} | ` +
      `HIT: ${cacheHits} | MISS: ${cacheMisses}`,
      'info'
    )
    console.debug(`[AI Caching V2] Details:`, details)
    
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
        const pName = stripAccents(pItem.matched_name || pItem.raw_name || '').toLowerCase().trim()
        if (!pName) continue
        const found = items.some(item => {
          const mName = stripAccents(item.name || '').toLowerCase().trim()
          return mName === pName || mName.includes(pName) || pName.includes(mName)
        })
        if (found) score += 1
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

  async function processAI() {
    if (!formStore.rawInput && !formStore.aiImage) {
      return uiStore.showToast('Vui lòng nhập dữ liệu hoặc chụp ảnh!', 'warning')
    }

    logStore.startNewSession('Phân tích AI')
    logStore.addLog(`Bắt đầu xử lý tin nhắn/ảnh đặt bàn...`)

    const activeController = api.createAIAbortController()
    uiStore.loading.is = true
    uiStore.loading.msg = 'AI PIPELINE V7.0'
    uiStore.loading.subMsg = 'Analyzing input...'

    const startTime = performance.now()

    let inputType = 'unknown'
    let ruleBasedResult: any = null
    let hardEntities: HardEntities = {
      phones: [],
      dates: [],
      times: [],
      guestCounts: [],
      tables: []
    }

    try {
      const type = formStore.aiImage ? 'vision' : 'text'
      const hasImage = !!formStore.aiImage
      
      // 1. Classification
      inputType = classifyInputType(formStore.rawInput || '', hasImage)
      logStore.addLog(`Phân loại loại đầu vào: "${inputType}"`)
      
      // 2. Pre-normalization
      let promptText = formStore.aiImage
        ? (formStore.rawInput || 'Phân tích ảnh này để lấy thông tin đặt bàn, khách hàng và danh sách món ăn.')
        : formStore.rawInput
      promptText = preNormalizeInput(promptText)
      logStore.addLog(`Đã chuẩn hóa tiền xử lý văn bản đầu vào.`)

      // 3. Local Rule Extraction
      ruleBasedResult = extractByRules(promptText)
      hardEntities = extractHardEntities(promptText)
      logStore.addLog(`Trích xuất Rule-Engine: Tên=${ruleBasedResult.customer_name || 'chưa có'}, SĐT=${ruleBasedResult.phone || 'chưa có'}, Ngày=${ruleBasedResult.event_date || 'chưa có'}, Giờ=${ruleBasedResult.event_time || 'chưa có'}, Khách=${ruleBasedResult.guest_count || 'chưa có'}, Bàn=${ruleBasedResult.table_code || 'chưa có'}`)

      // 4. Resolve Context against current form state
      const contextResolved = resolveContext(ruleBasedResult)

      // Check if menu has dishes
      const inputLower = stripAccents(promptText).toLowerCase()
      const hasDishes = appStore.menuList.some((m: any) => 
        inputLower.includes(m.cleanName) || 
        (m.acronym && inputLower.split(/\s+/).includes(String(m.acronym).toLowerCase()))
      ) || appStore.menuAliases.some((a: any) => 
        inputLower.split(/\s+/).includes(stripAccents(a.alias).toLowerCase())
      )

      let finalParsedResult: any = null
      let isBypassed = false
      let routingInfo: any = null

      // 5. Bypass check (if simple enough and no dishes)
      if (type === 'text' && shouldBypassAI(contextResolved, inputType, hasDishes)) {
        isBypassed = true
        logStore.addLog(`Kích hoạt chế độ Bypass AI: Tin nhắn đơn giản và không có món ăn. Sử dụng trực tiếp Rule Engine.`, 'success')
        const latency = ((performance.now() - startTime) / 1000).toFixed(2)
        routingInfo = {
          pipeline: 'text',
          tier_used: 0,
          model_used: 'Local Rule Engine V7.0',
          fallback_count: 0,
          repair_applied: false,
          latency,
          mode: 'bypass-local'
        }
        
        finalParsedResult = repairAndNormalizeJSON({
          customer: { name: contextResolved.customer_name || 'Khách hàng', phone: contextResolved.phone },
          booking: {
            event_date: contextResolved.event_date,
            event_time: contextResolved.event_time,
            guest_count: contextResolved.guest_count,
            table_number: contextResolved.table_code,
            need: contextResolved.booking_need
          },
          menu_items: resolveMenuItemsLocally(contextResolved.menu_items || [], contextResolved.guest_count)
        }, inputType)
      } else {
        // 6. Cache check
        const cacheKey = getSmartCacheKey(formStore.rawInput, inputType, appStore.activeSheet, formStore.customer.date)
        const cached = getCachedParseResult(cacheKey)
        
        if (cached) {
          finalParsedResult = cached
          isBypassed = true
          logStore.addLog(`Cache Hit: Tìm thấy kết quả đã xử lý trước đó trong cache. Bỏ qua gọi AI.`, 'success')
          const latency = ((performance.now() - startTime) / 1000).toFixed(2)
          routingInfo = {
            ...cached.routing,
            latency,
            mode: 'cache-hit'
          }
        }
      }

      if (!finalParsedResult) {
        logStore.addLog(`Bắt đầu chạy pipeline gọi AI...`)
        
        // Optimistic UI: Fill basic fields instantly using Rule Engine to give sub-second user experience
        logStore.addLog(`[Optimistic UI] Tự động điền nhanh các thông tin cơ bản trích xuất được từ Rule Engine...`)
        const optimisticResult = {
          customer: {
            name: contextResolved.customer_name || ruleBasedResult.customer_name || '',
            phone: contextResolved.phone || ruleBasedResult.phone || ''
          },
          booking: {
            event_date: contextResolved.event_date || ruleBasedResult.event_date || '',
            event_time: contextResolved.event_time || ruleBasedResult.event_time || '',
            guest_count: contextResolved.guest_count || ruleBasedResult.guest_count || null,
            table_number: contextResolved.table_code || ruleBasedResult.table_code || '',
            need: contextResolved.booking_need || ruleBasedResult.booking_need || 'Ăn thường'
          },
          party: {
            type: contextResolved.booking_need || ruleBasedResult.booking_need || 'Ăn thường',
            owner_name: '',
            display_board_text: ruleBasedResult.decoration_text || '',
            special_request: ''
          },
          notes: {
            customer_note: ruleBasedResult.note || ''
          }
        }
        fillBookingFormSafely(optimisticResult, { mode: 'customer' })
        uiStore.showToast('⚡ Đã nhận diện nhanh thông tin khách hàng...', 'info')
        // Apply admin self-learning corrections before calling AI
        const corrections = appStore.aiCorrections || []
        const appliedCorrections: Record<string, string> = {}
        for (const corr of corrections) {
          if (corr.inputText && stripAccents(promptText).toLowerCase().includes(stripAccents(corr.inputText).toLowerCase())) {
            appliedCorrections[corr.field] = corr.correctValue
            logStore.addLog(`Áp dụng sửa lỗi tự học (AI Correction) cho trường [${corr.field}]: "${corr.correctValue}"`)
          }
        }

        // Build context template — system prompt with MENU_CONTEXT left as template placeholder
        // Strip Set Menu component description lines to prevent AI from mis-parsing them as separate items
        const aiPromptText = stripSetMenuComponents(promptText)
        const systemPromptTemplate = ADVANCED_AI_PROMPT
          .replace('{{CURRENT_DATE}}', (() => {
            const now = new Date()
            const dayNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']
            const dd = String(now.getDate()).padStart(2, '0')
            const mm = String(now.getMonth() + 1).padStart(2, '0')
            const yyyy = now.getFullYear()
            const hh = String(now.getHours()).padStart(2, '0')
            const min = String(now.getMinutes()).padStart(2, '0')
            return `${dayNames[now.getDay()]}, ${dd}/${mm}/${yyyy} ${hh}:${min}`
          })())
          .replace('{{RAW_INPUT}}', aiPromptText)
          .replace('{{RULE_BASED_HINTS}}', JSON.stringify(ruleBasedResult, null, 2))
          .replace('{{LOCKED_ENTITIES}}', JSON.stringify(hardEntities, null, 2))
          .replace(/\{\{TOMORROW_DD_MM_YYYY\}\}/g, (() => {
            const tom = new Date()
            tom.setDate(tom.getDate() + 1)
            const dd = String(tom.getDate()).padStart(2, '0')
            const mm = String(tom.getMonth() + 1).padStart(2, '0')
            const yyyy = tom.getFullYear()
            return `${dd}/${mm}/${yyyy}`
          })())

        // 6. Use prepareAIPayload to compress prompts and enforce Token Guard limits
        const payload = prepareAIPayload(aiPromptText, systemPromptTemplate, ruleBasedResult)

        if (payload.isLocalOnly) {
          // Compact Local bypass activation if payload is too large
          isBypassed = true
          logStore.addLog(`Kích hoạt Token Guard: Dữ liệu đầu vào quá lớn, tự động kích hoạt chế độ tách tối giản cục bộ.`, 'warning')
          const latency = ((performance.now() - startTime) / 1000).toFixed(2)
          routingInfo = {
            pipeline: 'text',
            tier_used: 0,
            model_used: 'Local Rule Engine V7.0 (Payload Compact)',
            fallback_count: 0,
            repair_applied: false,
            latency,
            mode: 'bypass-local'
          }
          finalParsedResult = repairAndNormalizeJSON({
            customer: { name: contextResolved.customer_name || 'Khách hàng', phone: contextResolved.phone },
            booking: {
              event_date: contextResolved.event_date,
              event_time: contextResolved.event_time,
              guest_count: contextResolved.guest_count,
              table_number: contextResolved.table_code,
              need: contextResolved.booking_need
            },
            menu_items: resolveMenuItemsLocally(contextResolved.menu_items || [], contextResolved.guest_count)
          }, inputType)
          
          if (!finalParsedResult.warnings) finalParsedResult.warnings = []
          finalParsedResult.warnings.push('Đoạn text đặt bàn quá dài, kích hoạt chế độ tự động tách thông tin tối giản.')
        } else {
          const optimizedImg = formStore.aiImage ? await resizeImage(formStore.aiImage, 1120) : null
          if (optimizedImg) {
            logStore.addLog(`Đang tối ưu hóa kích thước hình ảnh để gửi AI...`)
          }

          // 7. Run AI router — using compressed payload prompts
          const routerResponse = await smartRouter(type, payload.sysPrompt, payload.userPrompt, optimizedImg, inputType, activeController.signal)
          routingInfo = routerResponse.routing

          // 8. Repair and Normalize JSON to V7 strict format
          const rawJsonParsed = repairAndNormalizeJSON(routerResponse.parsed, inputType)
          logStore.addLog(`Đã trích xuất và chuẩn hóa JSON đầu ra của AI.`)

          // Apply admin learning dictionary corrections
          Object.keys(appliedCorrections).forEach(field => {
            const val = appliedCorrections[field]
            if (field === 'name' || field === 'phone') {
              rawJsonParsed.customer[field] = val
            } else {
              if (field === 'tables') rawJsonParsed.booking.table_number = val
              else rawJsonParsed.booking[field] = val
            }
          })

          // 9. Match menu items using fuzzy maps
          if (rawJsonParsed.menu_items && rawJsonParsed.menu_items.length > 0) {
            logStore.addLog(`Bắt đầu đối khớp ${rawJsonParsed.menu_items.length} món ăn trích xuất được với thực đơn nhà hàng...`)
            rawJsonParsed.menu_items = matchMenuItems(rawJsonParsed.menu_items, rawJsonParsed.booking?.guest_count)
          }

          // 10. Menu Sheet switching detection
          try {
            const allMenus = await loadAllMenusData()
            const { bestSheet, score, isBorderline } = resolveBestMenuSheet(promptText, rawJsonParsed.menu_items || [], allMenus)
            
            if (bestSheet && bestSheet !== appStore.activeSheet) {
              logStore.addLog(`Phát hiện khả năng khớp thực đơn tốt hơn tại Sheet: "${bestSheet}" (Điểm: ${score}).`)
              if (isBorderline) {
                const confirmed = await uiStore.showConfirm(
                  'Đổi thực đơn?',
                  `Nhận diện thực đơn "${bestSheet}". Bạn có muốn chuyển sang thực đơn này không?`
                )
                if (confirmed) {
                  logStore.addLog(`Người dùng đồng ý chuyển sang thực đơn: "${bestSheet}"`, 'info')
                  await appStore.switchMenu(bestSheet)
                } else {
                  logStore.addLog(`Người dùng từ chối chuyển sang thực đơn: "${bestSheet}"`, 'warning')
                }
              } else {
                logStore.addLog(`Tự động chuyển sang thực đơn phù hợp nhất: "${bestSheet}"`, 'success')
                await appStore.switchMenu(bestSheet)
                uiStore.showToast(`Đã tự động chuyển sang thực đơn: ${bestSheet}`, 'success')
              }
            }
          } catch (errSheet) {
            console.warn('Menu sheet routing error:', errSheet)
          }

          finalParsedResult = rawJsonParsed

          // Save to cache
          const cacheKey = getSmartCacheKey(formStore.rawInput, inputType, appStore.activeSheet, formStore.customer.date)
          setSmartCache(cacheKey, finalParsedResult, inputType)
        }
      }

      // 10. Unified Deterministic Rule Lock
      // This applies rules unconditionally on AI-inferred, cached, and bypassed outputs before validation
      logStore.addLog(`Áp dụng Luật khóa dữ liệu deterministic (Deterministic Rule Lock)...`)
      finalParsedResult = applyDeterministicRuleLock(finalParsedResult, hardEntities, ruleBasedResult)

      // 11. Validate fields and compute confidence scores
      const validatedResult = validateParsedFields(finalParsedResult)
      validatedResult.routing = routingInfo
      
      logStore.addLog(`Độ tin cậy tổng thể: ${Math.round((validatedResult.confidence?.overall || 0) * 100)}%`)
      if (validatedResult.needs_review_fields.length > 0) {
        logStore.addLog(`Các trường cần duyệt lại: [${validatedResult.needs_review_fields.join(', ')}]`, 'warning')
      } else {
        logStore.addLog(`Tất cả các trường đạt độ tin cậy an toàn.`, 'success')
      }

      // Display Success Toast
      const modeIcon = routingInfo.mode === 'bypass-local' ? '🚀' : routingInfo.mode === 'cache-hit' ? '💾' : '⚡'
      uiStore.showToast(
        `<b>AI V7.0 ${modeIcon} ${routingInfo.mode.toUpperCase()}</b><br/>` +
        `Model: ${routingInfo.model_used}<br/>` +
        `Latency: ${routingInfo.latency}s`,
        'success', 5000
      )

      // Store results in the form store to open Review Card
      formStore.parsedAiResult = validatedResult

      formStore.aiMetadata = {
        ...routingInfo,
        confidences: validatedResult.confidence
      }
      const warningMap: Record<string, string> = {
        phone: 'Số điện thoại không đúng định dạng VN hoặc thiếu số',
        event_date: 'Ngày đã qua hoặc sai định dạng DD/MM/YYYY',
        event_time: 'Giờ nằm ngoài khung hoạt động (15:00 - 23:30)',
        guest_count: 'Số lượng khách ngoài khoảng thông thường (1 - 200)',
        customer_name: 'Tên chứa từ khóa nghi vấn hoặc để trống',
        used_party_owner_as_customer_name: '⚠️ Tên chủ tiệc được nạp tạm vào ô Người đặt bàn vì chưa có thông tin người liên hệ rõ ràng.',
        used_single_ambiguous_name_as_customer_name: '⚠️ Nạp tạm tên người duy nhất tìm thấy vào ô Người đặt bàn (chưa rõ vai trò).',
        missing_clear_booker_name: '⚠️ Chưa xác định rõ người đặt bàn thực tế.',
        missing_customer_name: '⚠️ Hoàn toàn không tìm thấy tên người liên hệ nào trong nội dung.',
        customerName_or_partyOwner_ambiguous: '⚠️ Tên người trong tin nhắn mơ hồ, chưa xác định rõ vai trò.'
      }
      formStore.warnings = validatedResult.needs_review_fields.map((f: string) => {
        return warningMap[f] || `Trường ${f} cần kiểm tra lại độ chính xác`
      })
      formStore.unresolvedItems = validatedResult.menu_items.filter((i: any) => i.needs_review).map((i: any) => i.raw_name)

      // Direct auto-fill if workflow mode is set to 'direct'
      if (configStore.defaults.aiWorkflowMode !== 'review') {
        logStore.addLog(`Chế độ tự động nạp form (Direct Mode): Đang nạp toàn bộ thông tin...`)
        fillBookingFormSafely(validatedResult, { mode: 'all' })
      }

    } catch (e: any) {
      if (e.name !== 'AbortError') {
        logStore.addLog(`Lỗi Pipeline AI: ${e.message}`, 'error')
        // LOCAL FALLBACK: If AI fails but rule-based extraction found data, use it
        const localItems = resolveMenuItemsLocally(ruleBasedResult?.menu_items || [], ruleBasedResult?.guest_count)
        if (localItems.length > 0 || ruleBasedResult?.phone || ruleBasedResult?.customer_name) {
          console.warn('[AI] All models failed, using LOCAL FALLBACK with rule-based data')
          logStore.addLog(`Bắt đầu chạy Chế độ dự phòng cục bộ (Local Fallback)...`, 'warning')
          const fallbackResult = repairAndNormalizeJSON({
            customer: { name: ruleBasedResult.customer_name || '', phone: ruleBasedResult.phone || '' },
            booking: {
              event_date: ruleBasedResult.event_date,
              event_time: ruleBasedResult.event_time,
              guest_count: ruleBasedResult.guest_count,
              table_number: ruleBasedResult.table_code,
              need: ruleBasedResult.booking_need
            },
            deposit: ruleBasedResult.deposit_amount ? {
              amount: ruleBasedResult.deposit_amount,
              status: ruleBasedResult.deposit_status || 'chờ cọc'
            } : undefined,
            menu_items: localItems,
            routing: { mode: 'local-fallback', model_used: 'Rule Engine', latency: '0.0', fallback_count: 0, tier_used: -1 }
          }, inputType)

          const validatedFallback = validateParsedFields(fallbackResult)
          validatedFallback.routing = fallbackResult.routing
          formStore.parsedAiResult = validatedFallback
          formStore.aiMetadata = { ...fallbackResult.routing }

          uiStore.showToast(
            `<b>⚠️ LOCAL FALLBACK</b><br/>AI không khả dụng. Đã dùng Rule Engine trích xuất ${localItems.length} món.`,
            'warning', 5000
          )
          logStore.addLog(`Local Fallback thành công! Trích xuất được ${localItems.length} món.`, 'success')

          if (configStore.defaults.aiWorkflowMode !== 'review') {
            fillBookingFormSafely(validatedFallback, { mode: 'all' })
          }
        } else {
          uiStore.error.show = true
          uiStore.error.msg = 'V7.0 Engine Error: ' + e.message
        }
      }
    } finally {
      uiStore.loading.is = false
      api.clearAIAbortController()
      logStore.addLog(`=== KẾT THÚC PHIÊN PHÂN TÍCH (Tổng độ trễ: ${((performance.now() - startTime)/1000).toFixed(2)}s) ===`, 'info')
    }
  }

  async function verifyTransferImage(base64Img: string) {
    logStore.startNewSession('Xác thực Bill Chuyển Khoản')
    logStore.addLog(`Khởi chạy AI xác thực Bill chuyển khoản...`)
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
      const aiResponse = (await smartRouter('vision', sysPrompt, 'Phân tích ảnh chuyển khoản', optimizedImg)) as any

      const amountVal = aiResponse?.parsed?.amount || aiResponse?.amount
      const contentVal = aiResponse?.parsed?.content || aiResponse?.content
      const timeVal = aiResponse?.parsed?.time || aiResponse?.time

      logStore.addLog(`AI trích xuất bill thành công. Số tiền: ${amountVal}, Nội dung: "${contentVal}", Thời gian: "${timeVal}"`)

      if (amountVal) {
        const aiAmount = parseInt(String(amountVal))
        const aiContent = String(contentVal || '')
        const expected = parseInt(String(formStore.deposit.amount))

        logStore.addLog(`So sánh số tiền quét được (${aiAmount}) với số tiền cần cọc (${expected}).`)
        if (aiAmount === expected) {
          formStore.deposit.isPaid = true
          formStore.deposit.note = aiContent || 'AI Verified ✓'
          formStore.deposit.time = String(timeVal || new Date().toLocaleString('vi-VN'))
          uiStore.showToast(`✅ Xác thực thành công!\nSố tiền: ${formatVND(aiAmount)}\nNội dung: ${aiContent}`, 'success')
          logStore.addLog(`Xác thực khớp hoàn toàn! Đã tự động cập nhật Trạng thái cọc thành ĐÃ CỌC.`, 'success')
        } else {
          uiStore.verifyModal.show = true
          uiStore.verifyModal.scanned = { amount: aiAmount, content: aiContent }
          uiStore.verifyModal.expected = { amount: expected }
          logStore.addLog(`Số tiền trên Bill không khớp với số tiền cần cọc! Yêu cầu người dùng duyệt thủ công.`, 'warning')
        }
      } else {
        throw new Error('Không đọc được thông tin chuyển khoản')
      }
    } catch (e: any) {
      uiStore.showToast('Lỗi xác thực: ' + e.message, 'warning')
      logStore.addLog(`Lỗi xác thực: ${e.message}`, 'error')
    } finally {
      uiStore.loading.is = false
      logStore.addLog(`=== KẾT THÚC XÁC THỰC BILL ===`, 'info')
    }
  }

  async function ocrExtractText(base64Img: string): Promise<string> {
    logStore.startNewSession('AI OCR Đọc Ảnh')
    logStore.addLog(`Bắt đầu trích xuất văn bản từ hình ảnh (OCR)...`)
    uiStore.loading.is = true
    uiStore.loading.msg = 'AI OCR ĐANG ĐỌC ẢNH...'
    uiStore.loading.subMsg = 'Vision Processing...'

    try {
      const optimizedImg = await resizeImage(base64Img, 1600)
      const defaultId = configStore.defaults.vision
      const candidates = AI_MODELS
        .filter(m => m.type === 'vision')
        .filter(m => m.provider === 'pollinations' || (configStore.keysStatus[m.provider]?.configured))

      candidates.sort((a, b) => {
        if (defaultId) {
          if (a.id === defaultId) return -1
          if (b.id === defaultId) return 1
        }
        return a.tier - b.tier
      })

      logStore.addLog(`Các model OCR khả dụng: ${candidates.map(c => c.name).join(', ')}`)
      if (candidates.length === 0) {
        logStore.addLog(`Chưa cấu hình API Key cho Vision/OCR.`, 'error')
        throw new Error('Chưa cấu hình API Key cho Vision/OCR. Vào Cài đặt → thêm Key Google/Groq.')
      }

      const startTime = performance.now()
      let lastError: Error | null = null

      for (const model of candidates) {
        try {
          uiStore.loading.subMsg = `OCR: ${model.name}...`
          logStore.addLog(`Thử chạy OCR bằng model: [${model.name}]...`)
          const rawResult = await callAIModel(model, IMAGE_OCR_PROMPT, 'Trích xuất TOÀN BỘ văn bản từ ảnh này. CRITICAL: Nếu có bảng, phải trích xuất TẤT CẢ các dòng từ đầu đến cuối, KHÔNG được bỏ sót hay cắt ngắn. Trả về đầy đủ 100% nội dung.', optimizedImg, false)

          if (rawResult && rawResult.trim().length > 10) {
            const latency = ((performance.now() - startTime) / 1000).toFixed(1)
            const cleanText = rawResult.trim().replace(/```[a-zA-Z]*\n([\s\S]*?)```/g, '$1').trim()
            uiStore.showToast(`<b>OCR ⚡</b> ${model.name} | ${latency}s`, 'success', 3000)
            logStore.addLog(`OCR thành công với [${model.name}] (Độ trễ: ${latency}s). Số ký tự trích xuất: ${cleanText.length}`, 'success')
            return cleanText
          } else {
            throw new Error('OCR trả về kết quả rỗng')
          }
        } catch (e: any) {
          console.warn(`[OCR] ${model.name} failed:`, e.message)
          logStore.addLog(`OCR model [${model.name}] thất bại: ${e.message}`, 'warning')
          lastError = e
        }
      }
      logStore.addLog(`Tất cả các model OCR đều thất bại.`, 'error')
      throw new Error('OCR thất bại: ' + (lastError?.message || 'Không có model khả dụng'))
    } finally {
      uiStore.loading.is = false
      logStore.addLog(`=== KẾT THÚC OCR ===`, 'info')
    }
  }

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
    checkAndLogAiCorrections,
    fillBookingFormSafely,
    extractByRules,
    preNormalizeInput,
    classifyInputType,
    shouldBypassAI,
    validateParsedFields,
    repairAndNormalizeJSON
  }
}
