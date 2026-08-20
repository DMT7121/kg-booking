export type ExtractionMethod = 'exact_rule' | 'fuzzy_rule' | 'ai_llm' | 'hybrid' | 'fallback' | 'user_manual'

export type FieldValidationState = 'valid' | 'needs_review' | 'conflict' | 'missing'

export interface FieldEvidence<T> {
  value: T
  confidence: number // 0.0 to 1.0
  sourceEvidence?: string // Exact substring snippet from input
  sourceRange?: [number, number]
  extractionMethod: ExtractionMethod
  validationState: FieldValidationState
  humanReviewed?: boolean
}

export interface ExtractedBookingEvidence {
  customerName: FieldEvidence<string>
  phone: FieldEvidence<string>
  eventDate: FieldEvidence<string>
  eventTime: FieldEvidence<string>
  guestCount: FieldEvidence<number>
  tableNumber: FieldEvidence<string>
  depositAmount: FieldEvidence<number>
  partyType: FieldEvidence<string>
  decorColor: FieldEvidence<string>
  displayBoardText: FieldEvidence<string>
  menuItems: FieldEvidence<Array<{ name: string; quantity: number; unit_price?: number }>>
  overallConfidence: number
  requiresHumanReview: boolean
}

/**
 * Builds a standardized FieldEvidence object.
 */
export function createFieldEvidence<T>(
  value: T,
  confidence: number,
  options?: {
    sourceEvidence?: string
    extractionMethod?: ExtractionMethod
    validationState?: FieldValidationState
    humanReviewed?: boolean
  }
): FieldEvidence<T> {
  let validationState: FieldValidationState = options?.validationState || 'valid'
  if (confidence < 0.8) {
    validationState = 'needs_review'
  }
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) {
    validationState = 'missing'
  }

  return {
    value,
    confidence: Math.max(0, Math.min(1, confidence)),
    sourceEvidence: options?.sourceEvidence,
    extractionMethod: options?.extractionMethod || 'hybrid',
    validationState,
    humanReviewed: options?.humanReviewed || false
  }
}

/**
 * Computes overall confidence from a collection of FieldEvidence.
 */
export function computeOverallConfidence(evidences: Array<FieldEvidence<any>>): number {
  if (evidences.length === 0) return 0
  const total = evidences.reduce((sum, item) => sum + item.confidence, 0)
  return Math.round((total / evidences.length) * 100) / 100
}

/**
 * Checks if any critical field requires human review (confidence < 0.85 or validationState === 'needs_review').
 */
export function checkRequiresReview(evidenceMap: Record<string, FieldEvidence<any>>, threshold = 0.85): boolean {
  return Object.values(evidenceMap).some(
    (item) => item.confidence < threshold || item.validationState === 'needs_review' || item.validationState === 'conflict'
  )
}
