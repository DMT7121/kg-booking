import { redactPII } from '@/utils/security'

export interface ApprovedCorrection {
  inputText: string
  wrongValue: any
  correctValue: any
  field: string
  approvedForLearning: boolean
  piiRedacted: boolean
}

export function redactObjectPII(obj: any, name?: string, phone?: string): any {
  if (!obj) return obj
  if (typeof obj !== 'object') {
    if (typeof obj === 'string') {
      return redactPII(obj, name, phone)
    }
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map(item => redactObjectPII(item, name, phone))
  }

  const redacted: any = {}
  for (const key of Object.keys(obj)) {
    const val = obj[key]
    const lowerKey = key.toLowerCase()
    if (lowerKey === 'phone' || lowerKey === 'customer_phone' || lowerKey === 'normalized_phone') {
      redacted[key] = '[PHONE]'
    } else if (typeof val === 'object') {
      redacted[key] = redactObjectPII(val, name, phone)
    } else if (typeof val === 'string') {
      redacted[key] = redactPII(val, name, phone)
    } else {
      redacted[key] = val
    }
  }
  return redacted
}

/**
 * Scrub PII from a correction entry if not already redacted
 */
export function redactCorrection(c: ApprovedCorrection): ApprovedCorrection {
  if (c.piiRedacted) return c

  const name = c.correctValue?.name || c.correctValue?.customer_name || (c.correctValue?.customer && c.correctValue.customer.name)
  const phone = c.correctValue?.phone || c.correctValue?.customer_phone || (c.correctValue?.customer && c.correctValue.customer.phone)

  const cleanInput = redactPII(c.inputText, name, phone)
  const cleanWrong = redactObjectPII(c.wrongValue, name, phone)
  const cleanCorrect = redactObjectPII(c.correctValue, name, phone)

  return {
    ...c,
    inputText: cleanInput,
    wrongValue: cleanWrong,
    correctValue: cleanCorrect,
    piiRedacted: true
  }
}

/**
 * Build few-shot examples string from a list of approved, redacted corrections.
 * Filters by field to ensure we only include examples relevant to the current task/field if appropriate,
 * or general corrections.
 */
export function buildFewShotString(
  corrections: ApprovedCorrection[],
  currentField?: string,
  maxExamples = 5,
  maxTokensBudget = 1000
): string {
  if (!corrections || corrections.length === 0) return ''
  
  // Filter for approved corrections
  let filtered = corrections.filter(c => c.approvedForLearning)

  // Scrub PII for all
  filtered = filtered.map(redactCorrection)

  // Prioritize corrections that match the current field/type of task
  if (currentField) {
    const fieldMatches = filtered.filter(c => c.field === currentField)
    const otherMatches = filtered.filter(c => c.field !== currentField)
    filtered = [...fieldMatches, ...otherMatches]
  }

  // Take up to maxExamples
  const selected = filtered.slice(0, maxExamples)
  if (selected.length === 0) return ''

  let result = '\n\n=== CÁC VÍ DỤ HIỆU CHỈNH THỰC TẾ (FEW-SHOT EXAMPLES) ===\n'
  let tokenEstimate = 0

  for (const item of selected) {
    const exampleStr = `\nĐầu vào: "${item.inputText}"\nKết quả AI trước đó: ${typeof item.wrongValue === 'object' ? JSON.stringify(item.wrongValue) : item.wrongValue}\nKết quả đúng sau khi hiệu chỉnh: ${typeof item.correctValue === 'object' ? JSON.stringify(item.correctValue) : item.correctValue}\n`
    
    const addedTokens = Math.ceil(exampleStr.length / 4)
    if (tokenEstimate + addedTokens > maxTokensBudget) {
      break
    }
    
    result += exampleStr
    tokenEstimate += addedTokens
  }

  return result
}
