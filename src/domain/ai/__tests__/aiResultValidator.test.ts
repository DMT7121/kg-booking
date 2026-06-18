import { describe, it, expect } from 'vitest'
import { validateAIResult } from '../aiResultValidator'

describe('AI Result Validator Tests', () => {
  const mockValidResult = {
    customer: { name: 'Chị Vy', phone: '0901234567', confidence: 0.98 },
    booking: { date: '25/06/2026', time: '19:00', guest_count: 5, table_count: 1, tables: 'A2', confidence: 0.95 },
    party: { type: 'Ăn thường', owner_name: '', display_board_text: '', special_request: '', confidence: 0.95 },
    menu_items: [],
    note: '',
    needs_review: [],
    warnings: [],
    raw_entities: { people_names: [], phones: [], dates: [], times: [], numbers: [] }
  }

  it('should accept valid standard booking result', () => {
    const check = validateAIResult(mockValidResult)
    expect(check.accepted).toBe(true)
    expect(check.normalized.customer.phone).toBe('0901234567')
  })

  it('should reject result if missing required core keys', () => {
    const invalid = { customer: {} }
    const check = validateAIResult(invalid)
    expect(check.accepted).toBe(false)
    expect(check.reasons[0]).toContain('Thiếu khóa bắt buộc')
  })

  it('should reject result if phone format is invalid', () => {
    const invalid = {
      ...mockValidResult,
      customer: { ...mockValidResult.customer, phone: '01234' }
    }
    const check = validateAIResult(invalid)
    expect(check.accepted).toBe(false)
    expect(check.reasons[0]).toContain('Số điện thoại không đúng định dạng VN')
  })

  it('should reject result if date format is invalid', () => {
    const invalid = {
      ...mockValidResult,
      booking: { ...mockValidResult.booking, date: '2026/06/25' }
    }
    const check = validateAIResult(invalid)
    expect(check.accepted).toBe(false)
    expect(check.reasons[0]).toContain('Ngày đặt sai định dạng DD/MM/YYYY')
  })

  it('should reject result if time is out of operating hours', () => {
    const invalid = {
      ...mockValidResult,
      booking: { ...mockValidResult.booking, time: '04:00' }
    }
    const check = validateAIResult(invalid)
    expect(check.accepted).toBe(false)
    expect(check.reasons[0]).toContain('Giờ đặt bàn nằm ngoài khung hoạt động')
  })
})
