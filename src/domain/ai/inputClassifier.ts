import { stripAccents } from '@/utils'

export interface AIInputClassificationInput {
  text: string
  hasImage?: boolean
  attachedImageCount?: number
  currentFormState?: unknown
  now?: Date
}

export type AIInputComplexity =
  | 'simple_booking'
  | 'booking_with_menu'
  | 'booking_with_ambiguous_time'
  | 'booking_with_missing_fields'
  | 'image_ocr'
  | 'complex_conversation'
  | 'unknown'

export interface AIInputClassificationResult {
  complexity: AIInputComplexity
  shouldTryLocalFirst: boolean
  requiresLLM: boolean
  requiresOCR: boolean
  requiresMenuContext: boolean
  requiresConversationContext: boolean
  reasons: string[]
  detectedSignals: {
    hasPhone: boolean
    hasGuestCount: boolean
    hasDateExpression: boolean
    hasTimeExpression: boolean
    hasNameSignal: boolean
    hasMenuKeyword: boolean
    hasPartyKeyword: boolean
    hasImage: boolean
    hasAmbiguousPhrase: boolean
  }
}

export function classifyAIInput(input: AIInputClassificationInput): AIInputClassificationResult {
  const text = input.text || ''
  const hasImage = !!input.hasImage
  const cleanText = text.trim()
  const cleanTextLower = stripAccents(cleanText).toLowerCase()

  // 1. Detect Phone
  const phoneRegex = /(?:0|\+84)\s*[1-9](?:\s*\d){8,9}\b/
  const hasPhone = phoneRegex.test(cleanText)

  // 2. Detect Guest Count
  const guestRegex = /\b\d+\s*(?:nguoi|ng|pax|khach|cho|cho nguoi|lon|tre em)\b/i
  const hasGuestCount = guestRegex.test(cleanTextLower) || /\b(?:mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi)\s*(?:nguoi|pax|khach)\b/i.test(cleanTextLower)

  // 3. Detect Date Expression
  const dateRegex = /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/
  const relativeDateKeywords = /\b(?:hom nay|nay|mai|ngay mai|mot|ngay mot|kia|ngay kia|thu\s+(?:hai|ba|tu|nam|sau|bay)|chu\nh|cn)\b/i
  const hasDateExpression = dateRegex.test(cleanText) || relativeDateKeywords.test(cleanTextLower)

  // 4. Detect Time Expression
  const timeRegex = /\b\d{1,2}\s*(?:h|gior|gio|tieng|:|am|pm)\s*(?:\d{2})?\b/i
  const relativeTimeKeywords = /\b(?:toi|trua|chieu|sang|buoi\s+(?:toi|trua|chieu|sang)|o clock|giay)\b/i
  const hasTimeExpression = timeRegex.test(cleanText) || relativeTimeKeywords.test(cleanTextLower)

  // 5. Detect Name Signal
  const nameKeywords = /\b(?:anh|chi|em|khanh|nguoi dat|lien he|sdt|ten la|em la|la)\b/i
  const hasNameSignal = nameKeywords.test(cleanTextLower)

  // 6. Detect Menu Keywords
  const menuKeywords = /\b(?:mon|menu|thuc don|set|combo|suat|lau|nuong|buffet|tiger|heineken|coca|sting|7up|saigon|bia|ruou|nuoc|mon an|khai vi|mon chinh|trang mieng|set menu|combo\s+\d)\b/i
  const hasMenuKeyword = menuKeywords.test(cleanTextLower)

  // 7. Detect Party Keywords
  const partyKeywords = /\b(?:sinh nhat|sn|thoi noi|day thang|cong ty|cty|doanh nghiep|tat nien|tan nien|lien hoan|hop lop|ky niem|sinh nhat cua|happy birthday|hbd|hpbd)\b/i
  const hasPartyKeyword = partyKeywords.test(cleanTextLower)

  // 8. Detect Ambiguous Phrases
  const ambiguousKeywords = /\b(?:nhu hom truoc|ban cu|set do|menu cu|lan truoc|nhu cu|nhu lan truoc|giong hom truoc|nhu cuoi tuan truoc)\b/i
  const hasAmbiguousPhrase = ambiguousKeywords.test(cleanTextLower)

  const detectedSignals = {
    hasPhone,
    hasGuestCount,
    hasDateExpression,
    hasTimeExpression,
    hasNameSignal,
    hasMenuKeyword,
    hasPartyKeyword,
    hasImage,
    hasAmbiguousPhrase
  }

  const reasons: string[] = []
  let complexity: AIInputComplexity = 'unknown'
  let shouldTryLocalFirst = false
  let requiresLLM = true
  let requiresOCR = false
  let requiresMenuContext = false
  let requiresConversationContext = false

  if (hasImage) {
    complexity = 'image_ocr'
    requiresOCR = true
    requiresLLM = true
    shouldTryLocalFirst = false
    reasons.push('Input chứa hình ảnh, yêu cầu chạy OCR bằng Vision Model.')
  } else if (hasAmbiguousPhrase) {
    complexity = 'complex_conversation'
    requiresConversationContext = true
    requiresLLM = true
    shouldTryLocalFirst = false
    reasons.push('Input chứa các cụm từ tham chiếu mơ hồ ("như lần trước", "bàn cũ"), cần suy luận ngữ cảnh.')
  } else if (hasMenuKeyword) {
    complexity = 'booking_with_menu'
    requiresMenuContext = true
    requiresLLM = true
    shouldTryLocalFirst = false // Cần gọi LLM để trích xuất các món ăn và đối sánh fuzzy
    reasons.push('Input chứa từ khóa thực đơn/món ăn/combo, yêu cầu trích xuất danh sách món ăn.')
  } else {
    // Không có ảnh, không có menu, không mơ hồ -> Đánh giá các trường cốt lõi
    const missingFields: string[] = []
    if (!hasNameSignal) missingFields.push('Tên khách đặt')
    if (!hasPhone) missingFields.push('Số điện thoại')
    if (!hasDateExpression) missingFields.push('Ngày đặt')
    if (!hasTimeExpression) missingFields.push('Giờ đặt')
    if (!hasGuestCount) missingFields.push('Số khách')

    if (missingFields.length > 0) {
      complexity = 'booking_with_missing_fields'
      requiresLLM = true
      shouldTryLocalFirst = true // Vẫn chạy thử local để trích xuất những trường hiện có nhằm tối ưu optimistic UI
      reasons.push(`Thiếu thông tin cốt lõi: [${missingFields.join(', ')}].`)
    } else {
      complexity = 'simple_booking'
      requiresLLM = false // Có thể bypass LLM nếu vượt qua Validation Gate
      shouldTryLocalFirst = true
      reasons.push('Input dạng text đơn giản, đầy đủ thông tin cốt lõi, không chứa món ăn/ảnh.')
    }
  }

  return {
    complexity,
    shouldTryLocalFirst,
    requiresLLM,
    requiresOCR,
    requiresMenuContext,
    requiresConversationContext,
    reasons,
    detectedSignals
  }
}
