import { stripAccents, cleanPhoneNumber } from '@/utils'
import { safeParseJSON } from '@/domain/ai/jsonRepair'

export function resolveDisplayCustomerName(parsed: any): string {
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

export function buildPartyNote(party: any, existingNote: string): string {
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

export function cleanBookingNotes(noteText: string, customer: any, booking: any, menuItems: any[]): string {
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

export function normalizePartyType(typeStr: string): string {
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

export function applyDeterministicRuleLock(aiResult: any, hardEntities: any, ruleBasedResult?: any): any {
  const result = { ...aiResult }
  if (!result.customer) result.customer = {}
  if (!result.booking) result.booking = {}
  if (!result.deposit) result.deposit = {}
  if (!result.needs_review_fields) result.needs_review_fields = []
  if (!result.warnings) result.warnings = []

  // Deterministic Customer Name resolution
  if (ruleBasedResult?.customer_name) {
    result.customer.name = ruleBasedResult.customer_name
  }

  // Deterministic Customer Phone resolution (must match VN format if available)
  if (hardEntities.phones && hardEntities.phones.length > 0) {
    const validPhones = hardEntities.phones.filter((p: any) => p.confidence >= 0.9)
    if (validPhones.length > 0) {
      result.customer.phone = validPhones[0].value
    } else {
      result.customer.phone = hardEntities.phones[0].value
    }
  }

  // Deterministic Event Date lock (e.g. Mai, Hôm nay, Tối mai)
  if (hardEntities.dates && hardEntities.dates.length > 0) {
    const freshDates = hardEntities.dates.filter((d: any) => d.confidence >= 0.9)
    if (freshDates.length > 0) {
      result.booking.event_date = freshDates[0].value
    }
  }

  // Deterministic Event Time lock (e.g. 19h, 11h30)
  if (hardEntities.times && hardEntities.times.length > 0) {
    const standardTimes = hardEntities.times.filter((t: any) => t.confidence >= 0.9)
    if (standardTimes.length > 0) {
      result.booking.event_time = standardTimes[0].value
    }
  }

  // Deterministic Table Code lock (e.g. C6, B12)
  if (hardEntities.tables && hardEntities.tables.length > 0) {
    const directTables = hardEntities.tables.filter((t: any) => t.confidence >= 0.9)
    if (directTables.length > 0) {
      result.booking.table_number = directTables.map((t: any) => t.zone + t.number).join(',')
    }
  }

  // Deterministic Guest Count lock (e.g. 10 người)
  if (hardEntities.guestCounts && hardEntities.guestCounts.length > 0) {
    const confCounts = hardEntities.guestCounts.filter((g: any) => g.confidence >= 0.9)
    if (confCounts.length > 0) {
      result.booking.guest_count = confCounts[0].value
    }
  }

  return result
}

export function repairAndNormalizeJSON(raw: any, inputType = 'unknown'): any {
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
  const parsed = typeof raw === 'string' ? safeParseJSON(raw) : raw
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
  const rawNote = safeGet(parsed, 'notes.customer_note', safeGet(parsed, 'notes.note', parsed.note || ""))
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

export function validateParsedFields(aiResult: any) {
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
