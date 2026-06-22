import { describe, it, expect } from 'vitest'
import { redactCorrection, buildFewShotString } from '../correctionFewShotBuilder'
import { redactPII } from '@/utils/security'

describe('PII Redaction Tests', () => {
  it('should redact exact phone number and generic phone-like digit sequences', () => {
    const rawText = 'Khách Nam SĐT 0912345678 đặt bàn lúc 19h'
    const redacted = redactPII(rawText, 'Nam', '0912345678')
    expect(redacted).not.toContain('0912345678')
    expect(redacted).not.toContain('Nam')
    expect(redacted).toContain('[PHONE]')
    expect(redacted).toContain('[NAME]')
  })

  it('should redact any 9 to 11 digit numbers as phone numbers', () => {
    const rawText = 'Khách đặt qua số 090888999 và 84901234567'
    const redacted = redactPII(rawText)
    expect(redacted).not.toContain('090888999')
    expect(redacted).not.toContain('84901234567')
    expect(redacted.match(/\[PHONE\]/g)?.length).toBe(2)
  })
})

describe('Few-Shot Prompt Builder Tests', () => {
  const dummyCorrections: any[] = [
    {
      inputText: 'Anh Hùng 0901112223 gọi lẩu thái',
      wrongValue: { name: 'Hùng', phone: '0901112223', items: [] },
      correctValue: { name: 'Hùng', phone: '0901112223', items: [{ name: 'Lẩu Thái', quantity: 1 }] },
      field: 'items',
      approvedForLearning: true,
      piiRedacted: false
    },
    {
      inputText: 'Chị Lan 0903334445 đặt bàn 4 người',
      wrongValue: { pax: 2 },
      correctValue: { pax: 4 },
      field: 'pax',
      approvedForLearning: false,
      piiRedacted: false
    },
    {
      inputText: 'Anh Linh 0905556667 đặt bàn ngày 20/06',
      wrongValue: { date: '21/06' },
      correctValue: { date: '20/06' },
      field: 'date',
      approvedForLearning: true,
      piiRedacted: true
    }
  ]

  it('should only include approved corrections', () => {
    const result = buildFewShotString(dummyCorrections)
    expect(result).toContain('Lẩu Thái') // from approved items correction
    expect(result).toContain('20/06') // from approved date correction
    expect(result).not.toContain('Chị Lan') // pax correction is not approved
  })

  it('should prioritize corrections matching currentField', () => {
    const result = buildFewShotString(dummyCorrections, 'date')
    const indexDate = result.indexOf('20/06')
    const indexItems = result.indexOf('Lẩu Thái')
    expect(indexDate).toBeLessThan(indexItems) // date correction is prioritized and comes first
  })

  it('should automatically redact PII during prompt building if piiRedacted is false', () => {
    const result = buildFewShotString(dummyCorrections)
    expect(result).not.toContain('Anh Hùng')
    expect(result).not.toContain('0901112223')
    expect(result).toContain('[NAME]')
    expect(result).toContain('[PHONE]')
  })
})
