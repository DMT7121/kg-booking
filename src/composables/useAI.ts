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

  // Response cache Map
  const responseCache = new Map<string, { data: any; timestamp: number; ttl: number }>()

  // Menu index caching
  let cachedIndex: any = null
  let lastMenuVer = 0
  let lastAliasVer = 0

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
      return res.content
    } catch (e: any) {
      console.warn(`[AI Proxy] ${model.provider} failed: ${e.message}`)
      throw e
    }
  }

  async function repairJSON(badString: string): Promise<any> {
    uiStore.loading.subMsg = '🔧 Auto-repair JSON...'
    const repairPrompt = `Fix this broken JSON. Return ONLY valid JSON, nothing else:\n\n${badString.substring(0, 2000)}`
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

  // Segment input blocks locally
  function segmentInputBlocks(text: string) {
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
      if (/(\d+)\s*(?:pax|nguoi|khach|cho)/gi.test(lower) || /nguoi lon|tre em|lon.*nho|be/i.test(lower)) {
        blocks.guest_count_block.push(trimmed)
      }
      const hasTime = /\b\d{1,2}:\d{2}\b/gi.test(lower) || /\b\d{1,2}h\d{2}\b/gi.test(lower) || /\b\d{1,2}h\b/gi.test(lower)
      const hasDate = /\b\d{2}\/\d{2}\/\d{4}\b/gi.test(lower) || /ngay/i.test(lower)
      if (hasTime || hasDate) {
        blocks.booking_time_block.push(trimmed)
      }
      const hasPhone = /(0[35789]\d{8})/g.test(lower)
      const hasCustomerKeywords = /anh|chi|dat ban|khach/i.test(lower)
      if (hasPhone || hasCustomerKeywords) {
        blocks.customer_block.push(trimmed)
      }
      const isMenuLine = /^\d+\s+[a-zà-ỹ\s]+/i.test(lower) || /combo|set menu|thuc don/i.test(lower)
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

  function classifyInputType(rawInput: string, hasImage: boolean): string {
    const cleanText = stripAccents(rawInput).toLowerCase().trim()
    const phoneRegex = /(0[35789]\d{8})/g
    const hasPhone = phoneRegex.test(cleanText)
    const hasGuestCount = /(\d+)\s*(?:pax|nguoi|khach|cho)/i.test(cleanText)
    const hasBookingNeed = /sinh nhat|ky niem|hop mat|cong ty|lien hoan|tat nien|thoi noi|mung tho/i.test(cleanText)
    
    const lines = cleanText.split('\n')
    let foodLinesCount = 0
    for (const line of lines) {
      if (/^\d+\s+[a-zà-ỹ\s]+$/i.test(line.trim())) {
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
    let clean = rawText.replace(/\r\n/g, '\n').replace(/\n{2,}/g, '\n\n')
    clean = clean.replace(/\s+/g, ' ')
    
    clean = clean.replace(/(\d+)(pax|người|khách|cho|nguoi|khach|ban)/gi, '$1 $2')
    clean = clean.replace(/([a-zà-ỹ]+)(\d+)\b/gi, '$1 x$2')
    
    clean = clean.replace(/\b(\d{1,2})h(\d{2})\b/gi, '$1:$2')
    clean = clean.replace(/\b(\d{1,2})h\b/gi, '$1:00')
    clean = clean.replace(/(\d+)(?![hg\d\s\/:\-\.])([a-zà-ỹÀ-Ỹ])/gi, '$1 $2')

    const today = new Date()
    const formatDate = (d: Date) => {
      const dd = String(d.getDate()).padStart(2, '0')
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const yyyy = d.getFullYear()
      return `${dd}/${mm}/${yyyy}`
    }

    const relativePatterns = [
      { pattern: /\b(hôm nay|nay|tối nay|chiều nay)\b/gi, offset: 0 },
      { pattern: /\b(ngày mai|mai|chiều mai|tối mai)\b/gi, offset: 1 },
      { pattern: /\b(ngày mốt|mốt|ngày kia)\b/gi, offset: 2 }
    ]
    
    relativePatterns.forEach(({ pattern, offset }) => {
      if (pattern.test(clean)) {
        const targetDate = new Date(today)
        targetDate.setDate(today.getDate() + offset)
        clean = clean.replace(pattern, formatDate(targetDate))
      }
    })
    
    const vnDays = ['chủ nhật', 'thứ hai', 'thứ ba', 'thứ tư', 'thứ năm', 'thứ sáu', 'thứ bảy', 'cn', 't2', 't3', 't4', 't5', 't6', 't7']
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

    if (/cuối tuần này/gi.test(clean)) {
      const satIndex = 6
      const currentDay = today.getDay()
      const diff = satIndex - currentDay
      const targetDate = new Date(today)
      targetDate.setDate(today.getDate() + diff)
      clean = clean.replace(/cuối tuần này/gi, formatDate(targetDate))
    }

    clean = clean.replace(/\b(\d{1,2})[\.\-\/](\d{1,2})[\.\-\/](\d{2,4})\b/g, (match, d, m, y) => {
      const day = String(d).padStart(2, '0')
      const month = String(m).padStart(2, '0')
      let year = String(y)
      if (year.length === 2) year = '20' + year
      return `${day}/${month}/${year}`
    })

    clean = clean.replace(/\b(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\b/g, (match, t1, t2) => t1)

    clean = clean.replace(/\b(\d{1,2}):(\d{2})\s*(chiều|tối|pm)\b/gi, (match, h, m) => {
      let hour = parseInt(h)
      if (hour < 12) hour += 12
      return `${String(hour).padStart(2, '0')}:${m}`
    })
    
    clean = clean.replace(/\b(vào lúc|lúc|tầm|khoảng|gio|giao)\s+(\d{1,2}):(\d{2})\b/gi, (match, prefix, h, m) => {
      let hour = parseInt(h)
      if (hour >= 1 && hour <= 11) {
        const isMorning = /sáng|trưa|am/i.test(rawText)
        if (!isMorning) hour += 12
      }
      return `${prefix} ${String(hour).padStart(2, '0')}:${m}`
    })

    clean = clean.replace(/\b(\d+)\s*(?:đến|-)\s*(\d+)\s*(khách|người|pax|guest)/gi, '$2 $3')
    clean = clean.replace(/\b(\d+)\s*(?:lớn|người lớn)\s*(?:\+)?\s*(\d+)\s*(?:nhỏ|bé|trẻ em)/gi, (match, adults, kids) => {
      const total = parseInt(adults) + parseInt(kids)
      return `${total} khách`
    })

    return clean.trim()
  }

  function extractByRules(normalizedText: string) {
    const blocks = segmentInputBlocks(normalizedText)
    const clean = stripAccents(normalizedText).toLowerCase()
    
    let phone: string | null = null
    const phoneRegex = /(0[35789]\d{8})/g
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
    const nonDecoLines = normalizedText.split('\n').filter(line => !/happy birthday|hbd|chuc mung/i.test(stripAccents(line)))
    const nonDecoText = nonDecoLines.join('\n')
    
    const nameMatch = nonDecoText.match(/(?:anh|chi|chu|co|khach|ten|dat)\s+([A-ZÀ-Ỹa-zà-ỹ]+(?:\s+[A-ZÀ-Ỹa-zà-ỹ]+){0,3})/u)
    if (nameMatch) {
      const candidate = nameMatch[1].trim()
      if (!/^(mai|nay|kia|truoc|sau|sang|chieu|toi|ngay|gio|pax|khach|nguoi|ban|dat|mon|set|combo)$/i.test(stripAccents(candidate))) {
        customer_name = candidate
      }
    }
    
    if (!customer_name && nonDecoLines.length > 0) {
      const firstLine = nonDecoLines[0].trim()
      if (phone && firstLine.includes(phone)) {
        const partBefore = firstLine.split(phone)[0].trim().replace(/[-:\/,\s]+$/, '')
        if (partBefore && partBefore.split(/\s+/).length <= 4) {
          customer_name = partBefore
        }
      }
    }

    let event_date: string | null = null
    const dateRegex = /(\d{2})\/(\d{2})\/(\d{4})/g
    const dateMatch = normalizedText.match(dateRegex)
    if (dateMatch) {
      event_date = dateMatch[0]
    }
    
    let event_time: string | null = null
    const timeRegex = /\b(\d{2}):(\d{2})\b/g
    const timeMatch = normalizedText.match(timeRegex)
    if (timeMatch) {
      event_time = timeMatch[0]
    }

    let guest_count: number | null = null
    const paxMatch = clean.match(/(\d+)\s*(pax|nguoi|khach|cho)/i)
    if (paxMatch) {
      guest_count = parseInt(paxMatch[1])
    }
    
    let table_code: string | null = null
    const tableMatch = clean.match(/ban\s+([a-g]?\d{1,2})/i)
    if (tableMatch) {
      const code = tableMatch[1].toUpperCase()
      table_code = /^[A-G]/.test(code) ? code : 'A' + code
    } else {
      const directMatch = clean.match(/\b([a-g]\d{1,2})\b/i)
      if (directMatch) {
        table_code = directMatch[1].toUpperCase()
      }
    }

    let booking_need = 'Ăn thường'
    if (/sinh nhat|sn|thoi noi|mung tho/i.test(clean)) booking_need = 'Sinh nhật'
    else if (/lien hoan|tiec|hop lop|cong ty|tat nien/i.test(clean)) booking_need = 'Liên hoan'
    else if (/hen ho|lang mang|ky niem/i.test(clean)) booking_need = 'Hẹn hò'

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
    const depositMatch = clean.match(/(\d+)\s*(?:k|vnd|trieu|cu|trn|tr)/i)
    if (depositMatch) {
      let amt = parseInt(depositMatch[1])
      const unit = depositMatch[0].replace(depositMatch[1], '').trim()
      if (unit.includes('k')) amt *= 1000
      else if (unit.includes('tr') || unit.includes('cu')) amt *= 1000000
      else if (amt < 1000) amt *= 1000
      deposit_amount = amt
    }
    
    let deposit_status = 'chờ cọc'
    if (/da chuyen|chuyen roi|da coc/i.test(clean)) {
      deposit_status = 'đã cọc'
    }

    const note = blocks.note_block || ''

    const menu_items: any[] = []
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
      menu_items
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

  function shouldBypassAI(ruleResult: any, inputType: string, menuDetected: boolean): boolean {
    if (['menu_order_text', 'mixed_booking_menu', 'deposit_bill_image', 'chat_screenshot', 'decoration_request'].includes(inputType)) {
      return false
    }
    if (menuDetected) return false
    
    const hasNameOrPhone = !!(ruleResult.customer_name || ruleResult.phone)
    const hasDate = !!ruleResult.event_date
    const hasTime = !!ruleResult.event_time
    const hasPax = !!ruleResult.guest_count
    
    return hasNameOrPhone && hasDate && hasTime && hasPax
  }

  function isFieldDirty(field: string): boolean {
    if (!formStore.originalAiValues) return false
    if (field === 'name') return formStore.customer.name !== formStore.originalAiValues.name
    if (field === 'phone') return cleanPhoneNumber(formStore.customer.phone) !== cleanPhoneNumber(formStore.originalAiValues.phone)
    if (field === 'date') return formatDateStr(formStore.customer.date) !== formatDateStr(formStore.originalAiValues.date)
    if (field === 'time') return formStore.customer.time !== formStore.originalAiValues.time
    if (field === 'pax') return String(formStore.customer.pax) !== String(formStore.originalAiValues.pax)
    if (field === 'tables') {
      const currentTable = (uiStore.tempTable.zone || '') + (uiStore.tempTable.number || '')
      return currentTable !== formStore.originalAiValues.tables
    }
    return false
  }

  function fillBookingFormSafely(parsedResult: any, options: { mode: 'all' | 'customer' | 'menu' }) {
    const { mode } = options
    const setFormVal = (field: string, newValue: any, setter: (val: any) => void) => {
      if (newValue === undefined || newValue === null) return
      const isDirty = isFieldDirty(field)
      if (!isDirty) {
        setter(newValue)
      } else {
        formStore.warnings.push(`Trường ${field} không được ghi đè vì nhân viên đã sửa thủ công thành "${formStore.customer[field as any]}".`)
      }
    }

    if (mode === 'all' || mode === 'customer') {
      if (parsedResult.customer) {
        if (parsedResult.customer.name) {
          setFormVal('name', parsedResult.customer.name, (val) => { formStore.customer.name = val })
        }
        if (parsedResult.customer.phone) {
          setFormVal('phone', cleanPhoneNumber(parsedResult.customer.phone), (val) => { formStore.customer.phone = val })
        }
      }
      
      if (parsedResult.booking) {
        if (parsedResult.booking.event_date) {
          setFormVal('date', formatDateStr(parsedResult.booking.event_date), (val) => { formStore.customer.date = val })
        }
        if (parsedResult.booking.event_time) {
          setFormVal('time', parsedResult.booking.event_time, (val) => { formStore.customer.time = val })
        }
        if (parsedResult.booking.guest_count) {
          setFormVal('pax', String(parsedResult.booking.guest_count), (val) => { formStore.customer.pax = val })
        }
        if (parsedResult.booking.need) {
          setFormVal('type', parsedResult.booking.need, (val) => { formStore.customer.type = val })
        }
        if (parsedResult.booking.table_number) {
          const isTableDirty = isFieldDirty('tables')
          if (!isTableDirty) {
            const table = parseTableCode(parsedResult.booking.table_number)
            if (table) {
              uiStore.tempTable.zone = table.zone
              uiStore.tempTable.number = table.number
            }
          }
        }
      }

      if (parsedResult.notes?.customer_note) {
        const parsedNote = parsedResult.notes.customer_note.trim()
        if (parsedNote) {
          if (!formStore.customer.note) {
            formStore.customer.note = parsedNote
          } else if (!formStore.customer.note.includes(parsedNote)) {
            formStore.customer.note += `\n${parsedNote}`
          }
        }
      }
      
      if (parsedResult.deposit?.amount) {
        formStore.deposit.amount = parsedResult.deposit.amount
        if (parsedResult.deposit.status === 'đã cọc' || parsedResult.deposit.status === 'YES') {
          formStore.deposit.isPaid = true
        }
        if (parsedResult.deposit.bank_ref) {
          formStore.deposit.note = `AI Ref: ${parsedResult.deposit.bank_ref}`
        }
      }
    }

    if (mode === 'all' || mode === 'menu') {
      if (parsedResult.menu_items && Array.isArray(parsedResult.menu_items)) {
        const existingItems = [...formStore.items]
        for (const newItem of parsedResult.menu_items) {
          const matchIdx = existingItems.findIndex(i => 
            stripAccents(i.name).toLowerCase().trim() === stripAccents(newItem.matched_name).toLowerCase().trim() &&
            i.note === newItem.note
          )
          if (matchIdx !== -1) {
            existingItems[matchIdx].qty += newItem.quantity
          } else {
            existingItems.push({
              name: newItem.matched_name,
              qty: newItem.quantity,
              price: newItem.unit_price,
              note: newItem.note
            })
          }
        }
        formStore.items = existingItems
      }
    }
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

    const customerName = safeGet(parsed, 'customer.name', parsed.customer_name || "")
    const customerPhone = safeGet(parsed, 'customer.phone', parsed.customer_phone || "")

    const eventDate = safeGet(parsed, 'booking.event_date', safeGet(parsed, 'reservation.date', parsed.event_date || ""))
    const eventTime = safeGet(parsed, 'booking.event_time', safeGet(parsed, 'reservation.time', parsed.event_time || ""))
    const guestCount = safeGet(parsed, 'booking.guest_count', safeGet(parsed, 'reservation.pax', parsed.guest_count || null))
    const tableCount = safeGet(parsed, 'booking.table_count', parsed.table_count || null)
    const tableNumber = safeGet(parsed, 'booking.table_number', safeGet(parsed, 'reservation.table_code', parsed.table_number || ""))
    const need = safeGet(parsed, 'booking.need', safeGet(parsed, 'reservation.type', parsed.booking_need || ""))
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
    const textOnBoard = safeGet(parsed, 'decoration.text_on_board', parsed.decoration_text || "")
    const decorationNote = safeGet(parsed, 'decoration.note', parsed.decoration_note || "")

    const customerNote = safeGet(parsed, 'notes.customer_note', safeGet(parsed, 'reservation.notes', parsed.note || ""))
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
    fallback.needs_review_fields = parsed.needs_review_fields || []
    fallback.reasoning_summary = parsed.reasoning_summary || ""

    return fallback
  }

  function validateParsedFields(aiResult: any) {
    const result = { ...aiResult }
    const needsReviewFields: string[] = []
    const conf = result.confidence
    
    const cleanPhone = cleanPhoneNumber(result.customer.phone || '')
    if (/^0[35789]\d{8}$/.test(cleanPhone)) {
      conf.phone = 1.0
    } else {
      conf.phone = 0.3
      needsReviewFields.push('phone')
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
          needsReviewFields.push('event_date')
        }
      } else {
        conf.event_date = 0.2
        needsReviewFields.push('event_date')
      }
    } else {
      conf.event_date = 0.0
      needsReviewFields.push('event_date')
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
          needsReviewFields.push('event_time')
        }
      } else {
        conf.event_time = 0.2
        needsReviewFields.push('event_time')
      }
    } else {
      conf.event_time = 0.0
      needsReviewFields.push('event_time')
    }

    const pax = result.booking.guest_count
    if (pax !== null && pax >= 1 && pax <= 200) {
      conf.guest_count = 1.0
    } else {
      conf.guest_count = 0.3
      needsReviewFields.push('guest_count')
    }

    const name = result.customer.name || ''
    const cleanName = stripAccents(name).toLowerCase()
    const hasKeywords = /ngay|gio|pax|khach|nguoi|ban|dat|mon|set|combo|happy|birthday|hbd|chuc|mung/i.test(cleanName)
    if (name && name !== 'Khách hàng' && !hasKeywords) {
      conf.customer_name = 1.0
    } else {
      conf.customer_name = 0.3
      needsReviewFields.push('customer_name')
    }

    const depAmt = result.deposit.amount
    if (depAmt !== null) {
      if (depAmt >= 0 && depAmt <= 50000000) {
        conf.deposit = 1.0
      } else {
        conf.deposit = 0.4
        needsReviewFields.push('deposit')
      }
    }

    result.needs_review_fields = needsReviewFields
    const activeFields = ['customer_name', 'phone', 'event_date', 'event_time', 'guest_count']
    const sum = activeFields.reduce((acc, f) => acc + conf[f], 0)
    conf.overall = sum / activeFields.length
    
    return result
  }

  function matchMenuItems(rawItems: any[]): any[] {
    const { exactMap, aliasMap, acronymMap } = getMenuIndex()
    const menuList = appStore.menuList || []
    
    return rawItems.map((item) => {
      const rawName = (item.raw_name || item.name || '').trim()
      const clean = stripAccents(rawName).toLowerCase().trim()
      
      let match: any = null
      let confidence = 0.0
      
      if (exactMap.has(clean)) {
        match = exactMap.get(clean)
        confidence = 1.0
      } else if (aliasMap.has(clean)) {
        match = aliasMap.get(clean)
        confidence = 1.0
      } else if (acronymMap.has(clean)) {
        match = acronymMap.get(clean)
        confidence = 0.95
      } else {
        const containsMatch = menuList.find(m => {
          const mClean = stripAccents(m.name).toLowerCase().trim()
          return mClean.includes(clean) || clean.includes(mClean)
        })
        if (containsMatch) {
          match = containsMatch
          confidence = 0.8
        }
      }
      
      if (!match) {
        const inputTokens = clean.split(/\s+/).filter(t => t.length > 1)
        if (inputTokens.length > 0) {
          let bestItem: any = null
          let bestScore = 0
          for (const m of menuList) {
            const mClean = stripAccents(m.name).toLowerCase().trim()
            const mTokens = mClean.split(/\s+/)
            const overlap = inputTokens.filter(t => mTokens.some(mt => mt.includes(t) || t.includes(mt))).length
            const score = overlap / Math.max(inputTokens.length, 1)
            if (score > bestScore && score >= 0.5) {
              bestScore = score
              bestItem = m
            }
          }
          if (bestItem) {
            match = bestItem
            confidence = 0.7
          }
        }
      }
      
      if (!match) {
        let bestItem: any = null
        let minDistance = 999
        for (const m of menuList) {
          const mClean = stripAccents(m.name).toLowerCase().trim()
          const dist = levenshteinDistance(clean, mClean)
          const maxAllowed = Math.floor(mClean.length * 0.3)
          if (dist < minDistance && dist <= maxAllowed) {
            minDistance = dist
            bestItem = m
          }
        }
        if (bestItem) {
          match = bestItem
          confidence = 0.6
        }
      }
      
      if (match) {
        let note = item.note || item.notes || ''
        const isSet = /set|combo|goi|phan/i.test(match.name)
        let description = match.desc || appStore.menuDetails?.[match.name] || ''
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
          matched_name: match.name,
          quantity: item.quantity || item.qty || 1,
          unit_price: match.price || 0,
          note: note.trim(),
          match_confidence: confidence,
          needs_review: confidence < 0.75
        }
      } else {
        return {
          raw_name: rawName,
          matched_name: rawName,
          quantity: item.quantity || item.qty || 1,
          unit_price: 0,
          note: (item.note || item.notes || '').trim(),
          match_confidence: 0.0,
          needs_review: true
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
    
    if (candidates.length === 0) {
      throw new Error(`Chưa cấu hình API Key cho ${type === 'text' ? 'Text' : 'Vision'}`)
    }

    let runRace = false
    if (candidates.length >= 2) {
      const [m1, m2] = candidates.slice(0, 2)
      if (m1.tier <= 2 && m2.tier <= 2) {
        runRace = true
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
        fallbackCount += 2
        lastError = e
      }
    }

    const waterfallStart = runRace ? 2 : 0
    for (let i = waterfallStart; i < candidates.length; i++) {
      const model = candidates[i]
      try {
        uiStore.loading.subMsg = `Waterfall (Tier ${model.tier}): ${model.name}...`
        const controller = new AbortController()
        if (signal) {
          signal.addEventListener('abort', () => controller.abort())
        }
        
        const timeoutPromise = new Promise<null>((_, reject) => {
          setTimeout(() => {
            controller.abort()
            reject(new Error(`Timeout model ${model.name}`))
          }, 15000)
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
            return finalizeResult(parsed, model, 'waterfall', repairApplied)
          }
        }
        throw new Error(`Invalid output format from ${model.name}`)
      } catch (e: any) {
        console.warn(`[AI Router] Model ${model.name} failed:`, e.message)
        fallbackCount++
        lastError = e
      }
    }
    
    throw new Error('Tất cả các model AI đều thất bại. Lỗi cuối: ' + (lastError?.message || 'Không có model khả dụng'))
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

    await Promise.all(sheets.map(async (sheet) => {
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
    }))
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

    const activeController = api.createAIAbortController()
    uiStore.loading.is = true
    uiStore.loading.msg = 'AI PIPELINE V7.0'
    uiStore.loading.subMsg = 'Analyzing input...'

    const startTime = performance.now()

    try {
      const type = formStore.aiImage ? 'vision' : 'text'
      const hasImage = !!formStore.aiImage
      
      // 1. Classification
      const inputType = classifyInputType(formStore.rawInput || '', hasImage)
      
      // 2. Pre-normalization
      let promptText = formStore.aiImage
        ? (formStore.rawInput || 'Phân tích ảnh này để lấy thông tin đặt bàn, khách hàng và danh sách món ăn.')
        : formStore.rawInput
      promptText = preNormalizeInput(promptText)

      // 3. Local Rule Extraction
      const ruleBasedResult = extractByRules(promptText)

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
          menu_items: []
        }, inputType)
      } else {
        // 6. Cache check
        const cacheKey = getSmartCacheKey(formStore.rawInput, inputType, appStore.activeSheet, formStore.customer.date)
        const cached = getCachedParseResult(cacheKey)
        
        if (cached) {
          finalParsedResult = cached
          isBypassed = true
          const latency = ((performance.now() - startTime) / 1000).toFixed(2)
          routingInfo = {
            ...cached.routing,
            latency,
            mode: 'cache-hit'
          }
        }
      }

      if (!finalParsedResult) {
        // Apply admin self-learning corrections before calling AI
        const corrections = appStore.aiCorrections || []
        const appliedCorrections: Record<string, string> = {}
        for (const corr of corrections) {
          if (corr.inputText && stripAccents(promptText).toLowerCase().includes(stripAccents(corr.inputText).toLowerCase())) {
            appliedCorrections[corr.field] = corr.correctValue
          }
        }

        // Build context & Call AI
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

        const optimizedImg = formStore.aiImage ? await resizeImage(formStore.aiImage, 1120) : null
        
        // 7. Run AI router
        const routerResponse = await smartRouter(type, systemPrompt, promptText, optimizedImg, inputType, activeController.signal)
        routingInfo = routerResponse.routing
        
        // 8. Repair and Normalize JSON to V7 strict format
        const rawJsonParsed = repairAndNormalizeJSON(routerResponse.parsed, inputType)

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
          rawJsonParsed.menu_items = matchMenuItems(rawJsonParsed.menu_items)
        }

        // 10. Menu Sheet switching detection
        try {
          const allMenus = await loadAllMenusData()
          const { bestSheet, score, isBorderline } = resolveBestMenuSheet(promptText, rawJsonParsed.menu_items || [], allMenus)
          
          if (bestSheet && bestSheet !== appStore.activeSheet) {
            if (isBorderline) {
              const confirmed = await uiStore.showConfirm(
                'Đổi thực đơn?',
                `Nhận diện thực đơn "${bestSheet}". Bạn có muốn chuyển sang thực đơn này không?`
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

        finalParsedResult = rawJsonParsed
        
        // Save to cache
        const cacheKey = getSmartCacheKey(formStore.rawInput, inputType, appStore.activeSheet, formStore.customer.date)
        setSmartCache(cacheKey, finalParsedResult, inputType)
      }

      // 11. Validate fields and compute confidence scores
      const validatedResult = validateParsedFields(finalParsedResult)
      validatedResult.routing = routingInfo

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
      formStore.originalAiValues = {
        name: validatedResult.customer.name,
        phone: validatedResult.customer.phone,
        date: validatedResult.booking.event_date,
        time: validatedResult.booking.event_time,
        pax: String(validatedResult.booking.guest_count || ''),
        tables: validatedResult.booking.table_number,
        type: validatedResult.booking.need || 'Ăn thường',
        note: validatedResult.notes.customer_note,
        items: JSON.parse(JSON.stringify(validatedResult.menu_items || []))
      }

      formStore.aiMetadata = {
        ...routingInfo,
        confidences: validatedResult.confidence
      }
      formStore.warnings = validatedResult.needs_review_fields.map((f: string) => `Trường ${f} cần kiểm tra lại độ chính xác`)
      formStore.unresolvedItems = validatedResult.menu_items.filter((i: any) => i.needs_review).map((i: any) => i.raw_name)

    } catch (e: any) {
      if (e.name !== 'AbortError') {
        uiStore.error.show = true
        uiStore.error.msg = 'V7.0 Engine Error: ' + e.message
      }
    } finally {
      uiStore.loading.is = false
      api.clearAIAbortController()
    }
  }

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

      const amountVal = aiResponse?.parsed?.amount || aiResponse?.amount
      const contentVal = aiResponse?.parsed?.content || aiResponse?.content
      const timeVal = aiResponse?.parsed?.time || aiResponse?.time

      if (amountVal) {
        const aiAmount = parseInt(String(amountVal))
        const aiContent = String(contentVal || '')
        const expected = parseInt(String(formStore.deposit.amount))

        if (aiAmount === expected) {
          formStore.deposit.isPaid = true
          formStore.deposit.note = aiContent || 'AI Verified ✓'
          formStore.deposit.time = String(timeVal || new Date().toLocaleString('vi-VN'))
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

  async function ocrExtractText(base64Img: string): Promise<string> {
    uiStore.loading.is = true
    uiStore.loading.msg = 'AI OCR ĐANG ĐỌC ẢNH...'
    uiStore.loading.subMsg = 'Vision Processing...'

    try {
      const optimizedImg = await resizeImage(base64Img, 800)
      const candidates = AI_MODELS
        .filter(m => m.type === 'vision')
        .filter(m => m.provider === 'pollinations' || (configStore.keysStatus[m.provider]?.configured))
        .sort((a, b) => a.tier - b.tier)

      if (candidates.length === 0) {
        throw new Error('Chưa cấu hình API Key cho Vision/OCR. Vào Cài đặt → thêm Key Google/Groq.')
      }

      const startTime = performance.now()
      let lastError: Error | null = null

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
    fillBookingFormSafely
  }
}
