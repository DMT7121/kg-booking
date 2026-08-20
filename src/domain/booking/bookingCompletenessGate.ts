export interface FieldConfidence<T> {
  value?: T
  confidence: number
  source: 'rule' | 'llm' | 'user' | 'default'
  evidence?: string
}

export interface LocalBookingExtractionResult {
  customerName: FieldConfidence<string>
  phone: FieldConfidence<string>
  guestCount: FieldConfidence<number>
  bookingDate: FieldConfidence<string>
  bookingTime: FieldConfidence<string>
  partyType: FieldConfidence<string>
  notes: FieldConfidence<string>
  overallConfidence: number
  missingFields: string[]
  warnings: string[]
}

export interface BookingBypassDecision {
  canBypassLLM: boolean
  confidence: number
  reasons: string[]
  extracted: LocalBookingExtractionResult
}

export function evaluateBookingBypass(
  extracted: LocalBookingExtractionResult,
  hasImage: boolean,
  hasMenuKeyword: boolean,
  hasAmbiguousPhrase: boolean
): BookingBypassDecision {
  const reasons: string[] = []
  let canBypassLLM = true

  // 1. Check Image presence
  if (hasImage) {
    canBypassLLM = false
    reasons.push('Có hình ảnh đính kèm (yêu cầu chạy OCR).')
  }

  // 2. Check Menu keywords presence
  if (hasMenuKeyword) {
    canBypassLLM = false
    reasons.push('Có từ khóa món ăn hoặc thực đơn (cần AI xử lý fuzzy match món).')
  }

  // 3. Check Ambiguous reference phrases
  if (hasAmbiguousPhrase) {
    canBypassLLM = false
    reasons.push('Có cụm từ tham chiếu mơ hồ ("bàn cũ", "như cũ", "như hôm trước").')
  }

  // 4. Validate core fields confidence and values
  const minConfidence = 0.95

  // Name
  if (!extracted.customerName.value || extracted.customerName.value.trim() === '') {
    canBypassLLM = false
    reasons.push('Thiếu tên khách đặt bàn.')
  } else if (extracted.customerName.confidence < 0.80) {
    canBypassLLM = false
    reasons.push(`Độ tin cậy tên khách đặt quá thấp (${extracted.customerName.confidence}).`)
  }

  // Phone
  if (!extracted.phone.value || extracted.phone.value.trim() === '') {
    canBypassLLM = false
    reasons.push('Thiếu số điện thoại liên hệ.')
  } else {
    // Validate VN phone format
    const cleanPhone = extracted.phone.value.replace(/\s+/g, '')
    const vnPhoneRegex = /^(?:0|\+84)[1-9]\d{8}$/
    if (!vnPhoneRegex.test(cleanPhone)) {
      canBypassLLM = false
      reasons.push(`Số điện thoại không đúng định dạng VN: "${extracted.phone.value}".`)
    } else if (extracted.phone.confidence < minConfidence) {
      canBypassLLM = false
      reasons.push(`Độ tin cậy số điện thoại quá thấp (${extracted.phone.confidence}).`)
    }
  }

  // Guest Count
  if (extracted.guestCount.value === undefined || extracted.guestCount.value === null) {
    canBypassLLM = false
    reasons.push('Thiếu số lượng khách.')
  } else {
    const guests = extracted.guestCount.value
    if (guests < 1 || guests > 200) {
      canBypassLLM = false
      reasons.push(`Số khách nằm ngoài khoảng thông thường (1-200): ${guests}.`)
    } else if (extracted.guestCount.confidence < minConfidence) {
      canBypassLLM = false
      reasons.push(`Độ tin cậy số khách quá thấp (${extracted.guestCount.confidence}).`)
    }
  }

  // Date
  if (!extracted.bookingDate.value || extracted.bookingDate.value.trim() === '') {
    canBypassLLM = false
    reasons.push('Thiếu ngày đặt bàn.')
  } else {
    // Validate DD/MM/YYYY format
    const datePattern = /^\d{2}\/\d{2}\/\d{4}$/
    if (!datePattern.test(extracted.bookingDate.value)) {
      canBypassLLM = false
      reasons.push(`Được trích xuất ngày sai định dạng DD/MM/YYYY: "${extracted.bookingDate.value}".`)
    } else if (extracted.bookingDate.confidence < minConfidence) {
      canBypassLLM = false
      reasons.push(`Độ tin cậy ngày đặt quá thấp (${extracted.bookingDate.confidence}).`)
    }
  }

  // Time
  if (!extracted.bookingTime.value || extracted.bookingTime.value.trim() === '') {
    canBypassLLM = false
    reasons.push('Thiếu giờ đặt bàn.')
  } else {
    // Validate HH:mm format and range
    const timePattern = /^\d{2}:\d{2}$/
    if (!timePattern.test(extracted.bookingTime.value)) {
      canBypassLLM = false
      reasons.push(`Giờ đặt sai định dạng HH:mm: "${extracted.bookingTime.value}".`)
    } else {
      const [hStr, mStr] = extracted.bookingTime.value.split(':')
      const hour = parseInt(hStr, 10)
      const minute = parseInt(mStr, 10)
      if (hour < 10 || hour > 23 || (hour === 23 && minute > 30)) {
        canBypassLLM = false
        reasons.push(`Giờ đặt bàn nằm ngoài khung hoạt động thông thường (10:00 - 23:30): "${extracted.bookingTime.value}".`)
      } else if (extracted.bookingTime.confidence < minConfidence) {
        canBypassLLM = false
        reasons.push(`Độ tin cậy giờ đặt quá thấp (${extracted.bookingTime.confidence}).`)
      }
    }
  }

  if (canBypassLLM) {
    reasons.push('Tất cả các trường cốt lõi đầy đủ và hợp lệ, bypass LLM thành công.')
  }

  return {
    canBypassLLM,
    confidence: extracted.overallConfidence,
    reasons,
    extracted
  }
}

export interface BookingCompletenessAudit {
  isComplete: boolean
  riskLevel: 'low' | 'medium' | 'high'
  warnings: string[]
  missingFields: string[]
  unresolvedItems: string[]
  uncapturedRawNotes: string[]
  summary: string
}

export function auditBookingCompleteness(
  formData: {
    customer?: { name?: string; phone?: string; date?: string; time?: string; pax?: number | string; tables?: string; type?: string; note?: string }
    items?: Array<{ name?: string; qty?: number; price?: number; note?: string; needs_review?: boolean }>
    deposit?: { amount?: number; isPaid?: boolean }
  },
  rawInput?: string
): BookingCompletenessAudit {
  const warnings: string[] = []
  const missingFields: string[] = []
  const unresolvedItems: string[] = []
  const uncapturedRawNotes: string[] = []

  const c = formData.customer || {}
  const items = formData.items || []
  const deposit = formData.deposit || {}
  const paxNum = parseInt(String(c.pax || '0'), 10) || 0

  // 1. Customer Name
  if (!c.name || !c.name.trim()) {
    missingFields.push('customer_name')
    warnings.push('Chưa có tên khách hàng / người đặt.')
  }

  // 2. Phone
  if (!c.phone || !c.phone.trim()) {
    missingFields.push('phone')
    warnings.push('Chưa có số điện thoại liên hệ.')
  } else {
    const cleanPhone = c.phone.replace(/\s+/g, '')
    if (!/^(?:0|\+84)[1-9]\d{8}$/.test(cleanPhone)) {
      warnings.push(`Số điện thoại không đúng chuẩn VN (10 chữ số): "${c.phone}".`)
    }
  }

  // 3. Date & Time
  if (!c.date || !c.date.trim()) {
    missingFields.push('event_date')
    warnings.push('Chưa chọn ngày đặt tiệc.')
  }
  if (!c.time || !c.time.trim()) {
    missingFields.push('event_time')
    warnings.push('Chưa chọn giờ đặt tiệc.')
  }

  // 4. Guest Count & Table Seating
  if (!paxNum || paxNum <= 0) {
    missingFields.push('guest_count')
    warnings.push('Chưa nhập số lượng khách.')
  } else if (paxNum >= 8 && (!c.tables || !c.tables.trim())) {
    warnings.push(`Đoàn đông (${paxNum} khách) nhưng chưa được xếp bàn hoặc khu vực.`)
  }

  // 5. Deposit Safety
  const depositAmt = deposit.amount || 0
  const hasSetMenu = items.some(i => /set\s*menu|combo/i.test(i.name || ''))
  if ((paxNum >= 8 || hasSetMenu || (c.type && c.type !== 'Ăn thường')) && depositAmt <= 0 && !deposit.isPaid) {
    warnings.push('Tiệc đoàn / Set menu / Sinh nhật nhưng chưa có tiền cọc (khuyến nghị thu cọc).')
  }

  // 6. Unresolved Dishes
  items.forEach(i => {
    if (i.needs_review || !i.name || i.name.trim() === '') {
      unresolvedItems.push(i.name || 'Món chưa rõ tên')
    }
  })
  if (unresolvedItems.length > 0) {
    warnings.push(`Có ${unresolvedItems.length} món ăn cần kiểm tra lại thực đơn: [${unresolvedItems.join(', ')}].`)
  }

  // 7. Check uncaptured raw notes
  if (rawInput && rawInput.trim()) {
    const rawClean = rawInput.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const noteClean = (c.note || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

    if (/khong cay|it cay|cay vua/i.test(rawClean) && !noteClean.includes('cay')) {
      uncapturedRawNotes.push('Lưu ý độ cay (không cay / ít cay)')
    }
    if (/it ngot|nhieu da|bot dau/i.test(rawClean) && !noteClean.includes('ngot') && !noteClean.includes('da') && !noteClean.includes('dau')) {
      uncapturedRawNotes.push('Lưu ý khẩu vị (ít ngọt / nhiều đá / bớt dầu)')
    }
    if (/ghe tre em|ghe be|ghe nho/i.test(rawClean) && !noteClean.includes('ghe')) {
      uncapturedRawNotes.push('Yêu cầu ghế trẻ em')
    }
    if (/trang tri|tong mau|tone|bong bay|hoa tuoi|bang chu|guong/i.test(rawClean) && !noteClean.includes('trang tri') && !noteClean.includes('tong') && !noteClean.includes('tone')) {
      uncapturedRawNotes.push('Ghi chú trang trí tiệc / bảng tên')
    }

    if (uncapturedRawNotes.length > 0) {
      warnings.push(`Phát hiện lưu ý trong tin nhắn gốc chưa được ghi vào ô Ghi chú: [${uncapturedRawNotes.join(', ')}].`)
    }
  }

  const isComplete = missingFields.length === 0 && unresolvedItems.length === 0
  let riskLevel: 'low' | 'medium' | 'high' = 'low'
  if (missingFields.length > 0 || unresolvedItems.length > 0) {
    riskLevel = 'high'
  } else if (warnings.length > 0) {
    riskLevel = 'medium'
  }

  const summary = isComplete
    ? (warnings.length === 0 ? 'Dữ liệu hoàn thiện 100%' : `Hoàn thiện với ${warnings.length} lưu ý`)
    : `Thiếu ${missingFields.length} trường thông tin, ${warnings.length} cảnh báo`

  return {
    isComplete,
    riskLevel,
    warnings,
    missingFields,
    unresolvedItems,
    uncapturedRawNotes,
    summary
  }
}
