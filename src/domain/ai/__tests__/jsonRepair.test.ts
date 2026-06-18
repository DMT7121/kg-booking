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
})
