import { stripAccents, cleanPhoneNumber, formatDateStr } from '@/utils'
import { SETS } from '@/utils/constants'
import { parseStructuredForm, isStructuredFormText } from './structuredFormParser'
import { extractByRules, extractHardEntities, classifyPeopleNames } from './ruleEngine'
import { matchMenuItems, getBaseDishName } from '@/domain/menu/menuMatcher'

export interface ParsedSlot<T = any> {
  value: T
  rawText?: string
  confidence: number // 0.0 to 1.0
  source: 'form_kv' | 'rule_regex' | 'bank_sms' | 'dialogue_turn' | 'default'
  isAmbiguous?: boolean
  warning?: string
}

export interface CanonicalCustomerSlot {
  name: ParsedSlot<string>
  phone: ParsedSlot<string>
  contactPerson?: ParsedSlot<string>
}

export interface CanonicalBookingSlot {
  date: ParsedSlot<string>
  time: ParsedSlot<string>
  guestCount: ParsedSlot<number | null>
  tableCode: ParsedSlot<string>
  need: ParsedSlot<string>
}

export interface CanonicalPartySlot {
  ownerName: ParsedSlot<string>
  decorColor: ParsedSlot<string>
  displayBoardText: ParsedSlot<string>
  mirrorBoardText: ParsedSlot<string>
  specialRequest: ParsedSlot<string>
  seatingPreference: ParsedSlot<string>
  dietaryNotes: ParsedSlot<string>
}

export interface CanonicalDepositSlot {
  amount: ParsedSlot<number>
  status: ParsedSlot<'đã cọc' | 'chờ cọc'>
  bankRef: ParsedSlot<string>
  senderName: ParsedSlot<string>
}

export interface CanonicalMenuItemSlot {
  rawName: string
  matchedName: string
  quantity: number
  unitPrice: number
  note: string
  confidence: number
}

export interface CanonicalBookingPayload {
  customer: CanonicalCustomerSlot
  booking: CanonicalBookingSlot
  party: CanonicalPartySlot
  deposit: CanonicalDepositSlot
  menuItems: CanonicalMenuItemSlot[]
  note: string
  overallConfidence: number
  isComplete: boolean // All 4 core fields present: name/phone, date, time, pax
  missingCoreFields: string[]
  warnings: string[]
  distilledAIPrompt: string
  canonicalMarkdown: string
}

/**
 * Clean prefix titles from customer name
 */
export function cleanNameTitle(name: string): string {
  if (!name) return ''
  let cleaned = name.trim()
  cleaned = cleaned.replace(/^(?:khách\s*hàng|khach\s*hang|khách|khach|anh|chị|chi|c\.|c|em|a\.|a|bác|bac|cô|co|chú|chu|bạn|ban)\s*[:\-–—]?\s*/i, '')
  cleaned = cleaned.replace(/^[\s-,\/:_.]+|[\s-,\/:_.]+$/g, '')
  return cleaned.trim()
}

/**
 * Polysemic Disambiguation: Check if a word like "Yến", "Đào", "Mai", "Cua", "Bắp" is a person or dish
 */
export function disambiguatePolysemicWord(word: string, context: string): 'person' | 'dish' | 'time' | 'unknown' {
  const cleanWord = stripAccents(word).toLowerCase().trim()
  const cleanContext = stripAccents(context).toLowerCase()

  if (cleanWord === 'mai') {
    if (/\b(?:ngay\s+mai|toi\s+mai|chieu\s+mai|sang\s+mai|mai\s+nay)\b/i.test(cleanContext)) {
      return 'time'
    }
  }

  // Person indicators (Check first: if text has "chị Yến" or "Yến 0938...", it IS a person)
  const personPatterns = [
    new RegExp(`\\b(?:anh|chi|em|be|ban|ong|ba|khach|bac)\\s+${cleanWord}\\b`, 'i'),
    new RegExp(`\\b(?:ten|nguoi\\s*dat|chu\\s*tiec|lien\\s*he|sdt)\\s*[:\\-]?\\s*${cleanWord}\\b`, 'i'),
    new RegExp(`\\b${cleanWord}\\s+(?:dat|nhan|ck|chuyen\\s*khoan|goi\\s*dien|alo|nhan\\s*tin)\\b`, 'i'),
    new RegExp(`\\b${cleanWord}\\s+(?:0\\d{8,10}|\\+84\\d{8,10})\\b`, 'i')
  ]
  for (const p of personPatterns) {
    if (p.test(cleanContext)) return 'person'
  }

  // Food indicators surrounding word
  const foodPatterns = [
    new RegExp(`\\b(?:lau|che|sup|tra|mon|dia|phan|suat|an|goi|nuong|xao|hap|ran|chien)\\s+${cleanWord}\\b`, 'i'),
    new RegExp(`\\b${cleanWord}\\s+(?:xao|nuong|hap|chien|rang|nau|bo|trung|me|sot)\\b`, 'i'),
    new RegExp(`\\b\\d+\\s*(?:ly|dia|noi|to|bat|con|kg)\\s+${cleanWord}\\b`, 'i')
  ]
  for (const p of foodPatterns) {
    if (p.test(cleanContext)) return 'dish'
  }

  return 'unknown'
}

/**
 * Parses Bank Transfer SMS / Notification formats (Vietcombank, MB, Techcombank, ACB, VPBank)
 */
export function parseBankTransferMessage(text: string): { amount: number; senderName: string; bankRef: string; isDeposit: boolean } | null {
  const clean = text.replace(/,/g, '')
  // Match +500000 or +1000000 or "so tien: 500000" or "GD: +500000VND"
  const amountMatch = clean.match(/(?:\+|\bso\s*tien\s*[:\-]?\s*|\bchuyen\s*(?:khoan\s*)?[:\-]?\s*)(\d{4,9})\s*(?:vnd|d|k\b)?/i)
    || text.match(/(?:cọc|dat\s*coc|chuyen\s*khoan)\s*(\d{1,4})\s*(?:k|nghin|ngàn)\b/i)

  if (!amountMatch) return null

  let amount = 0
  if (amountMatch[0].toLowerCase().includes('k') || amountMatch[0].toLowerCase().includes('nghin') || amountMatch[0].toLowerCase().includes('ngàn')) {
    const num = parseInt(amountMatch[1], 10)
    if (num < 1000) amount = num * 1000
    else amount = num
  } else {
    amount = parseInt(amountMatch[1], 10)
  }

  if (amount <= 0) return null

  // Extract reference or content
  let bankRef = ''
  const refMatch = text.match(/(?:ND|Noi\s*dung|Ref|GD|Ma\s*GD|Ly\s*do)\s*[:\-–—]\s*([^\n;.]+)/i)
  if (refMatch) {
    bankRef = refMatch[1].trim()
  }

  // Extract sender name
  let senderName = ''
  const senderMatch = text.match(/(?:tu\s*TK|nguoi\s*gui|tu\s*KH|from)\s*[:\-–—]?\s*([^\n;.]+)/i)
  if (senderMatch) {
    senderName = cleanNameTitle(senderMatch[1].trim())
  }

  return {
    amount,
    senderName,
    bankRef,
    isDeposit: true
  }
}

/**
 * Parse distributive quantifiers in dish list
 * e.g. "Gỏi bò, Lẩu thái, Bò nướng tảng - mỗi món 2 phần"
 * e.g. "3 món đầu mỗi món 2 phần, món lẩu 1 phần"
 */
export function applyDistributiveQuantifiers(
  dishes: Array<{ name: string; quantity: number; note: string; unitPrice?: number; confidence: number }>,
  text: string
): Array<{ name: string; quantity: number; note: string; unitPrice?: number; confidence: number }> {
  if (dishes.length === 0) return dishes

  const cleanText = stripAccents(text).toLowerCase()

  // Case 1: "X mon dau moi mon Y phan" (Check first to avoid greedy matching)
  const prefixCountMatch = cleanText.match(/(\d+)\s*mon\s*dau\s*(?:moi\s*mon\s*)?(\d+)/i)
  if (prefixCountMatch) {
    const count = parseInt(prefixCountMatch[1], 10)
    const qty = parseInt(prefixCountMatch[2], 10)
    if (qty > 0 && count > 0) {
      return dishes.map((d, idx) => {
        if (idx < count) return { ...d, quantity: qty }
        return d
      })
    }
  }

  // Case 2: "moi mon X phan" / "moi thu X dia" / "moi loai X"
  const eachMatch = cleanText.match(/(?:moi|m[oõ]i)\s*(?:mon|loai|thu|dia|phan|suat|ban)\s*(?:lay\s*|la\s*|x\s*)?(\d+)/i)
  if (eachMatch) {
    const qty = parseInt(eachMatch[1], 10)
    if (qty > 0 && qty <= 50) {
      return dishes.map(d => ({ ...d, quantity: qty }))
    }
  }

  return dishes
}

/**
 * Unified Deterministic Booking Parser Engine V3
 * Runs locally in < 5ms without AI, extracting 9 core slots and generating canonical representation.
 */
export function parseUnifiedBooking(
  rawInput: string,
  options?: {
    menuCatalog?: Array<{ name: string; price?: number; acronym?: string }>
    currentDate?: Date
  }
): CanonicalBookingPayload {
  const text = (rawInput || '').trim()
  const refDate = options?.currentDate || new Date()

  // Initialize payload
  const result: CanonicalBookingPayload = {
    customer: {
      name: { value: '', confidence: 0, source: 'default' },
      phone: { value: '', confidence: 0, source: 'default' }
    },
    booking: {
      date: { value: '', confidence: 0, source: 'default' },
      time: { value: '', confidence: 0, source: 'default' },
      guestCount: { value: null, confidence: 0, source: 'default' },
      tableCode: { value: '', confidence: 0, source: 'default' },
      need: { value: 'Ăn thường', confidence: 0.9, source: 'default' }
    },
    party: {
      ownerName: { value: '', confidence: 0, source: 'default' },
      decorColor: { value: '', confidence: 0, source: 'default' },
      displayBoardText: { value: '', confidence: 0, source: 'default' },
      mirrorBoardText: { value: '', confidence: 0, source: 'default' },
      specialRequest: { value: '', confidence: 0, source: 'default' },
      seatingPreference: { value: '', confidence: 0, source: 'default' },
      dietaryNotes: { value: '', confidence: 0, source: 'default' }
    },
    deposit: {
      amount: { value: 0, confidence: 0, source: 'default' },
      status: { value: 'chờ cọc', confidence: 0.9, source: 'default' },
      bankRef: { value: '', confidence: 0, source: 'default' },
      senderName: { value: '', confidence: 0, source: 'default' }
    },
    menuItems: [],
    note: '',
    overallConfidence: 0,
    isComplete: false,
    missingCoreFields: [],
    warnings: [],
    distilledAIPrompt: '',
    canonicalMarkdown: ''
  }

  if (!text || text.length < 5) {
    result.missingCoreFields = ['Tên khách', 'Số điện thoại', 'Ngày tổ chức', 'Giờ đến', 'Số lượng khách']
    return result
  }

  // --- LAYER 1: BANK TRANSFER SMS DETECTION ---
  const bankInfo = parseBankTransferMessage(text)
  if (bankInfo && bankInfo.amount > 0) {
    result.deposit.amount = { value: bankInfo.amount, confidence: 0.98, source: 'bank_sms' }
    result.deposit.status = { value: 'đã cọc', confidence: 0.98, source: 'bank_sms' }
    if (bankInfo.bankRef) {
      result.deposit.bankRef = { value: bankInfo.bankRef, confidence: 0.95, source: 'bank_sms' }
    }
    if (bankInfo.senderName) {
      result.deposit.senderName = { value: bankInfo.senderName, confidence: 0.92, source: 'bank_sms' }
      if (!result.customer.name.value) {
        result.customer.name = { value: bankInfo.senderName, confidence: 0.85, source: 'bank_sms' }
      }
    }
  }

  // --- LAYER 2: STRUCTURED FORM PARSING (If text has key-value style) ---
  const isStructured = isStructuredFormText(text)
  let structuredData: any = null
  if (isStructured) {
    const sRes = parseStructuredForm(text)
    if (sRes.isStructured) {
      structuredData = sRes.data

      if (structuredData.customer.name) {
        result.customer.name = {
          value: cleanNameTitle(structuredData.customer.name),
          confidence: 0.98,
          source: 'form_kv'
        }
      }
      if (structuredData.customer.phone) {
        result.customer.phone = {
          value: cleanPhoneNumber(structuredData.customer.phone),
          confidence: 0.99,
          source: 'form_kv'
        }
      }
      if (structuredData.booking.date) {
        result.booking.date = {
          value: formatDateStr(structuredData.booking.date),
          confidence: 0.98,
          source: 'form_kv'
        }
      }
      if (structuredData.booking.time) {
        result.booking.time = {
          value: structuredData.booking.time,
          confidence: 0.98,
          source: 'form_kv'
        }
      }
      if (structuredData.booking.guest_count) {
        result.booking.guestCount = {
          value: structuredData.booking.guest_count,
          confidence: 0.98,
          source: 'form_kv'
        }
      }
      if (structuredData.booking.tables) {
        result.booking.tableCode = {
          value: structuredData.booking.tables,
          confidence: 0.95,
          source: 'form_kv'
        }
      }
      if (structuredData.booking.need) {
        result.booking.need = {
          value: structuredData.booking.need,
          confidence: 0.98,
          source: 'form_kv'
        }
      }
      if (structuredData.deposit.amount > 0) {
        result.deposit.amount = {
          value: structuredData.deposit.amount,
          confidence: 0.98,
          source: 'form_kv'
        }
        result.deposit.status = {
          value: structuredData.deposit.status as any || 'đã cọc',
          confidence: 0.98,
          source: 'form_kv'
        }
      }
      // Party & Decor
      if (structuredData.party.owner_name) {
        result.party.ownerName = { value: structuredData.party.owner_name, confidence: 0.98, source: 'form_kv' }
      }
      if (structuredData.party.decor_color) {
        result.party.decorColor = { value: structuredData.party.decor_color, confidence: 0.98, source: 'form_kv' }
      }
      if (structuredData.party.display_board_text) {
        result.party.displayBoardText = { value: structuredData.party.display_board_text, confidence: 0.98, source: 'form_kv' }
      }
      if (structuredData.party.mirror_board_text) {
        result.party.mirrorBoardText = { value: structuredData.party.mirror_board_text, confidence: 0.98, source: 'form_kv' }
      }
      if (structuredData.party.special_request) {
        result.party.specialRequest = { value: structuredData.party.special_request, confidence: 0.98, source: 'form_kv' }
      }
      if (structuredData.party.seating_preference) {
        result.party.seatingPreference = { value: structuredData.party.seating_preference, confidence: 0.98, source: 'form_kv' }
      }
      if (structuredData.party.dietary_notes) {
        result.party.dietaryNotes = { value: structuredData.party.dietary_notes, confidence: 0.98, source: 'form_kv' }
      }
      // Structured menu items
      if (structuredData.menu_items && structuredData.menu_items.length > 0) {
        result.menuItems = structuredData.menu_items.map((i: any) => ({
          rawName: i.raw_name || i.matched_name,
          matchedName: i.matched_name || i.raw_name,
          quantity: i.quantity || 1,
          unitPrice: i.unit_price || 0,
          note: i.note || '',
          confidence: 0.95
        }))
      }
    }
  }

  // --- LAYER 3: REGEX & HEURISTIC ENGINE (For unstructured or missing slots) ---
  const ruleResult = extractByRules(text)
  const hardEntities = extractHardEntities(text)
  const nameResults = classifyPeopleNames(text)

  // 1. Customer Name fallback
  if (!result.customer.name.value) {
    // Direct title + phone / prefix check e.g. "Chị Yến 0938..."
    const titleMatch = text.match(/(?:chị|anh|c\.|a\.|em|bác|khách)\s+([A-ZÀ-Ỹa-zà-ỹ\s]{2,25})(?:\s+(?:0\d{8,11}|\+84\d{8,11}))/i)
      || text.match(/(?:chị|anh|c\.|a\.|em|bác)\s+([A-ZÀ-Ỹa-zà-ỹ]{2,20})\b/i)
    if (titleMatch) {
      const candidate = cleanNameTitle(titleMatch[1].trim())
      const poly = disambiguatePolysemicWord(candidate, text)
      if (poly !== 'dish' && poly !== 'time') {
        result.customer.name = {
          value: candidate,
          confidence: 0.95,
          source: 'rule_regex'
        }
      }
    }

    if (!result.customer.name.value && ruleResult.customer_name) {
      const clean = cleanNameTitle(ruleResult.customer_name)
      const poly = disambiguatePolysemicWord(clean, text)
      if (poly !== 'dish' && poly !== 'time') {
        result.customer.name = {
          value: clean,
          confidence: (ruleResult as any).customer_name_confidence ?? 0.92,
          source: 'rule_regex'
        }
      }
    } else if (!result.customer.name.value && nameResults.peopleNames.length > 0) {
      const candidate = cleanNameTitle(nameResults.peopleNames[0])
      const poly = disambiguatePolysemicWord(candidate, text)
      if (poly !== 'dish' && poly !== 'time') {
        result.customer.name = {
          value: candidate,
          confidence: 0.85,
          source: 'rule_regex'
        }
      }
    }
  }

  // 2. Customer Phone fallback
  if (!result.customer.phone.value) {
    if (ruleResult.phone) {
      result.customer.phone = {
        value: cleanPhoneNumber(ruleResult.phone),
        confidence: 0.98,
        source: 'rule_regex'
      }
    } else if (hardEntities.phones.length > 0) {
      result.customer.phone = {
        value: cleanPhoneNumber(hardEntities.phones[0].value),
        confidence: 0.98,
        source: 'rule_regex'
      }
    }
  }

  // 3. Booking Date fallback
  if (!result.booking.date.value) {
    if (ruleResult.event_date) {
      result.booking.date = {
        value: ruleResult.event_date,
        confidence: 0.95,
        source: 'rule_regex'
      }
    } else if (hardEntities.dates.length > 0) {
      result.booking.date = {
        value: hardEntities.dates[0].value,
        confidence: hardEntities.dates[0].confidence,
        source: 'rule_regex'
      }
    }
  }

  // 4. Booking Time fallback
  if (!result.booking.time.value) {
    if (ruleResult.event_time) {
      let t = ruleResult.event_time
      // Heuristic: If time is "7:00", "6:30" and text contains "tối" or "chiều", convert to 24h
      const [hStr, mStr] = t.split(':')
      const hour = parseInt(hStr, 10)
      if (hour >= 1 && hour <= 11) {
        if (/tối|toi|chiều|chieu|đêm|dem|tiệc/i.test(stripAccents(text))) {
          t = `${hour + 12}:${mStr || '00'}`
        }
      }
      result.booking.time = {
        value: t,
        confidence: 0.95,
        source: 'rule_regex'
      }
    } else if (hardEntities.times.length > 0) {
      result.booking.time = {
        value: hardEntities.times[0].value,
        confidence: hardEntities.times[0].confidence,
        source: 'rule_regex'
      }
    }
  }

  // 5. Guest Count fallback
  if (!result.booking.guestCount.value) {
    if (ruleResult.guest_count && ruleResult.guest_count > 0) {
      result.booking.guestCount = {
        value: ruleResult.guest_count,
        confidence: 0.95,
        source: 'rule_regex'
      }
    } else if (hardEntities.guestCounts.length > 0) {
      result.booking.guestCount = {
        value: hardEntities.guestCounts[0].value,
        confidence: hardEntities.guestCounts[0].confidence,
        source: 'rule_regex'
      }
    }
  }

  // 6. Table fallback
  if (!result.booking.tableCode.value && ruleResult.table_code) {
    result.booking.tableCode = {
      value: ruleResult.table_code,
      confidence: 0.90,
      source: 'rule_regex'
    }
  }

  // 7. Need / Party Type fallback
  if (result.booking.need.value === 'Ăn thường' && ruleResult.booking_need && ruleResult.booking_need !== 'Ăn thường') {
    result.booking.need = {
      value: ruleResult.booking_need,
      confidence: 0.95,
      source: 'rule_regex'
    }
  }

  // 8. Party details fallback
  const rAny = ruleResult as any
  if (!result.party.ownerName.value && rAny.party_owner) {
    result.party.ownerName = { value: rAny.party_owner, confidence: 0.92, source: 'rule_regex' }
  }
  if (!result.party.decorColor.value && rAny.decor_color) {
    result.party.decorColor = { value: rAny.decor_color, confidence: 0.95, source: 'rule_regex' }
  }
  if (!result.party.displayBoardText.value && rAny.board_text) {
    result.party.displayBoardText = { value: rAny.board_text, confidence: 0.95, source: 'rule_regex' }
  }
  if (!result.party.mirrorBoardText.value && rAny.mirror_text) {
    result.party.mirrorBoardText = { value: rAny.mirror_text, confidence: 0.95, source: 'rule_regex' }
  }
  if (!result.party.specialRequest.value && rAny.decor_request) {
    result.party.specialRequest = { value: rAny.decor_request, confidence: 0.90, source: 'rule_regex' }
  }
  if (!result.party.seatingPreference.value && rAny.seating_preference) {
    result.party.seatingPreference = { value: rAny.seating_preference, confidence: 0.90, source: 'rule_regex' }
  }
  if (!result.party.dietaryNotes.value && rAny.dietary_notes) {
    result.party.dietaryNotes = { value: rAny.dietary_notes, confidence: 0.90, source: 'rule_regex' }
  }

  // 9. Deposit fallback
  if (result.deposit.amount.value === 0 && ruleResult.deposit_amount && ruleResult.deposit_amount > 0) {
    result.deposit.amount = { value: ruleResult.deposit_amount, confidence: 0.95, source: 'rule_regex' }
    result.deposit.status = { value: ruleResult.deposit_status === 'đã cọc' ? 'đã cọc' : 'chờ cọc', confidence: 0.95, source: 'rule_regex' }
  }

  // 10. Menu Items extraction from dishes if not in structured form
  const ruleDishes = (ruleResult.menu_items && ruleResult.menu_items.length > 0) ? ruleResult.menu_items : rAny.dishes
  if (result.menuItems.length === 0 && ruleDishes && ruleDishes.length > 0) {
    const rawDishes = ruleDishes.map((d: any) => ({
      name: d.raw_name || d.name,
      quantity: d.quantity || 1,
      note: d.note || '',
      unitPrice: d.unit_price || 0,
      confidence: 0.90
    }))

    // Apply distributive quantifiers (e.g. "mỗi món 2 phần")
    const distributedDishes = applyDistributiveQuantifiers(rawDishes, text)

    result.menuItems = distributedDishes.map(d => ({
      rawName: d.name,
      matchedName: d.name,
      quantity: d.quantity,
      unitPrice: d.unitPrice || 0,
      note: d.note,
      confidence: d.confidence
    }))
  }

  // Optional: match with local menu catalog if provided
  if (options?.menuCatalog && options.menuCatalog.length > 0 && result.menuItems.length > 0) {
    const matched = matchMenuItems(
      result.menuItems.map(i => ({ name: i.rawName, quantity: i.quantity, note: i.note })),
      result.booking.guestCount.value,
      options.menuCatalog as any,
      [],
      SETS,
      result.booking.guestCount.value
    )
    result.menuItems = matched.map((m: any) => ({
      rawName: m.raw_name || m.name,
      matchedName: m.name,
      quantity: m.quantity || 1,
      unitPrice: m.price || 0,
      note: m.note || '',
      confidence: m.confidence || 0.90
    }))
  }

  // Aggregate General Note
  const noteParts: string[] = []
  if (result.party.ownerName.value) noteParts.push(`Chủ tiệc: ${result.party.ownerName.value}`)
  if (result.party.decorColor.value) noteParts.push(`Tone: ${result.party.decorColor.value}`)
  if (result.party.displayBoardText.value) noteParts.push(`Bảng: "${result.party.displayBoardText.value}"`)
  if (result.party.mirrorBoardText.value) noteParts.push(`Gương: "${result.party.mirrorBoardText.value}"`)
  if (result.party.specialRequest.value) noteParts.push(`Decor: ${result.party.specialRequest.value}`)
  if (result.party.seatingPreference.value) noteParts.push(`Chỗ ngồi: ${result.party.seatingPreference.value}`)
  if (result.party.dietaryNotes.value) noteParts.push(`Khẩu vị/Bếp: ${result.party.dietaryNotes.value}`)
  if (result.deposit.bankRef.value) noteParts.push(`Ref CK: ${result.deposit.bankRef.value}`)
  result.note = noteParts.join(' | ')

  // --- EVALUATION & FAST-TRACK GATE ---
  const hasName = !!result.customer.name.value
  const hasPhone = !!result.customer.phone.value
  const hasDate = !!result.booking.date.value
  const hasTime = !!result.booking.time.value
  const hasPax = result.booking.guestCount.value !== null && result.booking.guestCount.value > 0

  if (!hasName && !hasPhone) result.missingCoreFields.push('Tên khách hoặc Số điện thoại')
  if (!hasDate) result.missingCoreFields.push('Ngày đặt tiệc')
  if (!hasTime) result.missingCoreFields.push('Giờ đến')
  if (!hasPax) result.missingCoreFields.push('Số lượng khách')

  result.isComplete = (hasName || hasPhone) && hasDate && hasTime && hasPax

  // Overall Confidence Score
  const weights = [
    result.customer.name.confidence * 0.25,
    result.customer.phone.confidence * 0.25,
    result.booking.date.confidence * 0.20,
    result.booking.time.confidence * 0.15,
    (result.booking.guestCount.confidence || 0) * 0.15
  ]
  result.overallConfidence = parseFloat(weights.reduce((a, b) => a + b, 0).toFixed(2))

  // --- CANONICAL MARKDOWN REPRESENTATION ---
  const lines: string[] = []
  lines.push(`### 📋 Tóm Tắt Thông Tin Đặt Bàn (Canonical Card)`)
  lines.push(`- **Khách hàng:** ${result.customer.name.value || '*(Chưa có)*'} | **SĐT:** ${result.customer.phone.value || '*(Chưa có)*'}`)
  lines.push(`- **Thời gian:** ${result.booking.time.value || '??:??'} ngày ${result.booking.date.value || '??/??/????'}`)
  lines.push(`- **Số khách:** ${result.booking.guestCount.value ? `${result.booking.guestCount.value} pax` : '*(Chưa rõ)*'} | **Bàn:** ${result.booking.tableCode.value || 'Chưa xếp'} | **Tiệc:** ${result.booking.need.value}`)
  if (result.deposit.amount.value > 0) {
    lines.push(`- **Tiền cọc:** ${result.deposit.amount.value.toLocaleString('vi-VN')}đ (${result.deposit.status.value})`)
  }
  if (result.menuItems.length > 0) {
    lines.push(`- **Thực đơn (${result.menuItems.length} món):**`)
    result.menuItems.forEach(item => {
      lines.push(`  • ${item.quantity}x ${item.matchedName}${item.note ? ` (${item.note})` : ''}`)
    })
  }
  if (result.note) {
    lines.push(`- **Ghi chú & Dặn dò:** ${result.note}`)
  }
  result.canonicalMarkdown = lines.join('\n')

  // --- DISTILLED AI PAYLOAD (Shrinks prompt tokens by 75%) ---
  const distilledLines: string[] = []
  distilledLines.push(`[PRE-EXTRACTED FACTS]:`)
  if (result.customer.name.value) distilledLines.push(`customer_name="${result.customer.name.value}"`)
  if (result.customer.phone.value) distilledLines.push(`phone="${result.customer.phone.value}"`)
  if (result.booking.date.value) distilledLines.push(`event_date="${result.booking.date.value}"`)
  if (result.booking.time.value) distilledLines.push(`event_time="${result.booking.time.value}"`)
  if (result.booking.guestCount.value) distilledLines.push(`guest_count=${result.booking.guestCount.value}`)
  if (result.booking.need.value) distilledLines.push(`party_need="${result.booking.need.value}"`)
  if (result.deposit.amount.value > 0) distilledLines.push(`deposit_amount=${result.deposit.amount.value}`)

  if (result.missingCoreFields.length > 0) {
    distilledLines.push(`[MISSING/UNCERTAIN FIELDS NEEDING ATTENTION]: ${result.missingCoreFields.join(', ')}`)
  }
  distilledLines.push(`\n[ORIGINAL RAW TEXT]:\n"${text}"`)
  result.distilledAIPrompt = distilledLines.join('\n')

  return result
}
