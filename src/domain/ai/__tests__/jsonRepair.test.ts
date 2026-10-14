import { describe, it, expect } from 'vitest'
import { safeParseJSON, validateSchema } from '../jsonRepair'

describe('JSON Repair Tests', () => {
  it('should parse valid JSON', () => {
    const raw = '{"customer": {"name": "Giang"}}'
    const parsed = safeParseJSON(raw)
    expect(parsed).not.toBeNull()
    expect(parsed.customer.name).toBe('Giang')
  })

  it('should extract JSON from markdown code blocks', () => {
    const raw = '```json\n{"customer": {"name": "Giang"}}\n```'
    const parsed = safeParseJSON(raw)
    expect(parsed).not.toBeNull()
    expect(parsed.customer.name).toBe('Giang')
  })

  it('should validate schema successfully', () => {
    const valid = { customer: { name: 'Giang' }, booking: { guest_count: 5 } }
    expect(validateSchema(valid)).toBe(true)

    const invalid = { irrelevant_field: 'hello' }
    expect(validateSchema(invalid)).toBe(false)
  })

  it('should strip <think>...</think> reasoning blocks before parsing JSON', () => {
    const raw = '<think>\nLet me analyze the booking...\n{"fake": 123}\n</think>\n```json\n{"customer": {"name": "Minh"}, "booking": {"guest_count": 8}}\n```'
    const parsed = safeParseJSON(raw)
    expect(parsed).not.toBeNull()
    expect(parsed.customer.name).toBe('Minh')
    expect(parsed.booking.guest_count).toBe(8)
  })

  it('should preserve valid escaped newlines inside JSON string values', () => {
    const raw = '{"customer": {"name": "Tuấn"}, "ocr_raw_text": "Dòng 1\\nDòng 2"}'
    const parsed = safeParseJSON(raw)
    expect(parsed).not.toBeNull()
    expect(parsed.ocr_raw_text).toBe('Dòng 1\nDòng 2')
  })
})

