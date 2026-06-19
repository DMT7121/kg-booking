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
