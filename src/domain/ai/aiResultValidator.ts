import { cleanPhoneNumber } from '@/utils'

export interface AIResultValidation {
  accepted: boolean
  confidence: number
  reasons: string[]
  normalized?: any
}

export function validateAIResult(parsed: any): AIResultValidation {
  const reasons: string[] = []
  let accepted = true
  
  if (!parsed || typeof parsed !== 'object') {
    return {
      accepted: false,
      confidence: 0,
      reasons: ['Kết quả trả về trống hoặc không phải Object JSON.']
    }
  }

  // 1. Basic Schema key check
  const requiredKeys = ['customer', 'booking', 'menu_items']
  for (const key of requiredKeys) {
    if (!(key in parsed)) {
      accepted = false
      reasons.push(`Thiếu khóa bắt buộc trong Schema: "${key}".`)
    }
  }

  if (!accepted) {
    return { accepted, confidence: 0, reasons }
  }

  // Normalize customer
  const customer = parsed.customer || {}
  const name = typeof customer.name === 'string' ? customer.name.trim() : ''
  let phone = typeof customer.phone === 'string' ? customer.phone.trim() : ''
  if (phone) phone = cleanPhoneNumber(phone)

  // Verify Phone format if present
  if (phone) {
    const cleanPhone = phone.replace(/\s+/g, '')
    const vnPhoneRegex = /^(?:0|\+84)[1-9]\d{8}$/
    if (!vnPhoneRegex.test(cleanPhone)) {
      accepted = false
      reasons.push(`Số điện thoại không đúng định dạng VN: "${phone}".`)
    }
  }

  // Validate booking
  const booking = parsed.booking || {}
  const date = typeof booking.date === 'string' ? booking.date.trim() : ''
  const time = typeof booking.time === 'string' ? booking.time.trim() : ''
  const guestCount = typeof booking.guest_count === 'number' ? booking.guest_count : null

  // Date format check
  if (date) {
    const datePattern = /^\d{2}\/\d{2}\/\d{4}$/
    if (!datePattern.test(date)) {
      accepted = false
      reasons.push(`Ngày đặt sai định dạng DD/MM/YYYY: "${date}".`)
    }
  }

  // Time format check
  if (time) {
    const timePattern = /^\d{2}:\d{2}$/
    if (!timePattern.test(time)) {
      accepted = false
      reasons.push(`Giờ đặt sai định dạng HH:mm: "${time}".`)
    } else {
      const [hStr, mStr] = time.split(':')
      const hour = parseInt(hStr, 10)
      const minute = parseInt(mStr, 10)
      if (hour < 10 || hour > 23 || (hour === 23 && minute > 30)) {
        accepted = false
        reasons.push(`Giờ đặt bàn nằm ngoài khung hoạt động thông thường (10:00 - 23:30): "${time}".`)
      }
    }
  }

  // Guest count range check
  if (guestCount !== null && (guestCount < 1 || guestCount > 200)) {
    accepted = false
    reasons.push(`Số khách nằm ngoài khoảng thông thường (1-200): ${guestCount}.`)
  }

  // Confidence scores checking
  const customerConf = typeof customer.confidence === 'number' ? customer.confidence : 0.8
  const bookingConf = typeof booking.confidence === 'number' ? booking.confidence : 0.8
  const overallConfidence = parseFloat(((customerConf + bookingConf) / 2).toFixed(2))

  if (overallConfidence < 0.4) {
    accepted = false
    reasons.push(`Độ tin cậy tổng thể của AI quá thấp: ${overallConfidence}.`)
  }

  const normalized = {
    ...parsed,
    customer: {
      ...customer,
      name,
      phone,
      confidence: customerConf
    },
    booking: {
      ...booking,
      date,
      time,
      guest_count: guestCount,
      confidence: bookingConf
    },
    menu_items: Array.isArray(parsed.menu_items) ? parsed.menu_items : [],
    note: typeof parsed.note === 'string' ? parsed.note : '',
    needs_review: Array.isArray(parsed.needs_review) ? parsed.needs_review : [],
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
    raw_entities: parsed.raw_entities || {
      people_names: [],
      phones: [],
      dates: [],
      times: [],
      numbers: []
    }
  }

  if (accepted) {
    reasons.push('Xác thực đầu ra AI thành công.')
  }

  return {
    accepted,
    confidence: overallConfidence,
    reasons,
    normalized
  }
}
