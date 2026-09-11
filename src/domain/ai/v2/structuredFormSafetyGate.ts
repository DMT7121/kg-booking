import { isStructuredFormText, parseStructuredForm } from '../structuredFormParser'
import { CORRECTION_MARKERS_REGEX } from './amendmentResolver'

export interface SafetyGateEvaluation {
  canSafelyBypass: boolean
  reasons: string[]
  isStructured: boolean
  hasAmendments: boolean
  hasAmbiguity: boolean
}

/**
 * Evaluates whether a structured form input can safely bypass remote LLMs
 * without accidentally ignoring post-form corrections or amendments.
 */
export function evaluateStructuredFormSafety(text: string): SafetyGateEvaluation {
  const isStructured = isStructuredFormText(text)
  const reasons: string[] = []

  if (!isStructured) {
    return {
      canSafelyBypass: false,
      reasons: ['Không phải định dạng mẫu form có cấu trúc chuẩn.'],
      isStructured: false,
      hasAmendments: false,
      hasAmbiguity: false
    }
  }

  // 1. Check for amendment or correction markers anywhere in the text
  const hasAmendments = CORRECTION_MARKERS_REGEX.test(text)
  if (hasAmendments) {
    reasons.push('Phát hiện từ khóa đính chính / đổi ý trong văn bản (cần xử lý chuỗi sự kiện thay vì bypass tĩnh).')
  }

  // 2. Check for duplicate conflicting keys (e.g. two "Số lượng:" lines with different values)
  const lines = text.split('\n').map(l => l.trim().toLowerCase()).filter(Boolean)
  const keySet = new Set<string>()
  let hasConflictingDuplicateKeys = false

  for (const line of lines) {
    const colonIdx = line.indexOf(':')
    if (colonIdx > 0 && colonIdx < 30) {
      const key = line.substring(0, colonIdx).trim()
      if (keySet.has(key)) {
        hasConflictingDuplicateKeys = true
        reasons.push(`Phát hiện trường thông tin trùng lặp ("${key}") có thể gây xung đột.`)
        break
      }
      keySet.add(key)
    }
  }

  // 3. Validate parsed schema completeness
  const parsed = parseStructuredForm(text)
  const isSchemaValid = parsed.isStructured && (!!parsed.data.customer.name || !!parsed.data.customer.phone)

  if (!isSchemaValid) {
    reasons.push('Dữ liệu form chưa đủ các trường định danh cơ bản (Tên hoặc SĐT).')
  }

  // 4. Critical ambiguity check (e.g. phrases like "chưa chốt", "xem lại", "đang tính")
  const hasAmbiguity = /chưa chốt|chua chot|tính sau|tinh sau|chốt sau|chot sau|hoặc|hoac|tùy|tuy/i.test(text)
  if (hasAmbiguity) {
    reasons.push('Văn bản chứa yếu tố phân vân hoặc chưa chốt dứt khoát.')
  }

  const canSafelyBypass = !hasAmendments && !hasConflictingDuplicateKeys && !hasAmbiguity && isSchemaValid

  return {
    canSafelyBypass,
    reasons,
    isStructured,
    hasAmendments,
    hasAmbiguity
  }
}
