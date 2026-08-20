import { describe, it, expect } from 'vitest'
import {
  createFieldEvidence,
  computeOverallConfidence,
  checkRequiresReview
} from '../evidenceModel'

describe('AI Field Evidence Model Tests', () => {
  it('should create standardized field evidence with proper validation state', () => {
    const highConf = createFieldEvidence('Nguyễn Văn A', 0.98, { sourceEvidence: 'Anh A đặt bàn' })
    expect(highConf.confidence).toBe(0.98)
    expect(highConf.validationState).toBe('valid')
    expect(highConf.sourceEvidence).toBe('Anh A đặt bàn')

    const lowConf = createFieldEvidence('Chị Su', 0.65)
    expect(lowConf.validationState).toBe('needs_review')

    const empty = createFieldEvidence('', 0.9)
    expect(empty.validationState).toBe('missing')
  })

  it('should compute overall confidence accurately', () => {
    const f1 = createFieldEvidence('A', 0.9)
    const f2 = createFieldEvidence('B', 0.8)
    const f3 = createFieldEvidence('C', 1.0)

    const avg = computeOverallConfidence([f1, f2, f3])
    expect(avg).toBe(0.9)
  })

  it('should flag review requirement when any critical field is below threshold', () => {
    const evidences = {
      name: createFieldEvidence('Anh T', 0.99),
      phone: createFieldEvidence('0901234567', 0.98),
      date: createFieldEvidence('25/08', 0.75) // Low confidence
    }

    expect(checkRequiresReview(evidences, 0.85)).toBe(true)
  })
})
