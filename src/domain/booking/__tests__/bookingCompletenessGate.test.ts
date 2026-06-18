import { describe, it, expect } from 'vitest'
import { evaluateBookingBypass } from '../bookingCompletenessGate'
import type { LocalBookingExtractionResult } from '../bookingCompletenessGate'

describe('Booking Completeness Gate Tests', () => {
  const mockValidResult: LocalBookingExtractionResult = {
    customerName: { value: 'Chị Vy', confidence: 0.98, source: 'rule' },
    phone: { value: '0901234567', confidence: 0.98, source: 'rule' },
    guestCount: { value: 5, confidence: 0.98, source: 'rule' },
    bookingDate: { value: '25/06/2026', confidence: 0.98, source: 'rule' },
    bookingTime: { value: '19:00', confidence: 0.95, source: 'rule' },
    partyType: { value: 'Ăn thường', confidence: 0.95, source: 'rule' },
    notes: { value: '', confidence: 0.50, source: 'rule' },
    overallConfidence: 0.97,
    missingFields: [],
    warnings: []
  }

  it('should bypass LLM if all core fields are complete and valid', () => {
    const decision = evaluateBookingBypass(mockValidResult, false, false, false)
    expect(decision.canBypassLLM).toBe(true)
    expect(decision.reasons).toContain('Tất cả các trường cốt lõi đầy đủ và hợp lệ, bypass LLM thành công.')
  })

  it('should not bypass LLM if has image', () => {
    const decision = evaluateBookingBypass(mockValidResult, true, false, false)
    expect(decision.canBypassLLM).toBe(false)
    expect(decision.reasons).toContain('Có hình ảnh đính kèm (yêu cầu chạy OCR).')
  })

  it('should not bypass LLM if menu keyword is present', () => {
    const decision = evaluateBookingBypass(mockValidResult, false, true, false)
    expect(decision.canBypassLLM).toBe(false)
    expect(decision.reasons).toContain('Có từ khóa món ăn hoặc thực đơn (cần AI xử lý fuzzy match món).')
  })

  it('should not bypass LLM if ambiguous phrase is present', () => {
    const decision = evaluateBookingBypass(mockValidResult, false, false, true)
    expect(decision.canBypassLLM).toBe(false)
    expect(decision.reasons).toContain('Có cụm từ tham chiếu mơ hồ ("bàn cũ", "như cũ", "như hôm trước").')
  })

  it('should not bypass LLM if customerName confidence is low', () => {
    const invalidResult = {
      ...mockValidResult,
      customerName: { value: 'Chị Vy', confidence: 0.70, source: 'rule' }
    }
    const decision = evaluateBookingBypass(invalidResult, false, false, false)
    expect(decision.canBypassLLM).toBe(false)
    expect(decision.reasons[0]).toContain('Độ tin cậy tên khách đặt quá thấp')
  })

  it('should not bypass LLM if phone is invalid', () => {
    const invalidResult = {
      ...mockValidResult,
      phone: { value: '012345', confidence: 0.98, source: 'rule' }
    }
    const decision = evaluateBookingBypass(invalidResult, false, false, false)
    expect(decision.canBypassLLM).toBe(false)
    expect(decision.reasons[0]).toContain('Số điện thoại không đúng định dạng VN')
  })

  it('should not bypass LLM if time is out of operating hours', () => {
    const invalidResult = {
      ...mockValidResult,
      bookingTime: { value: '05:00', confidence: 0.95, source: 'rule' }
    }
    const decision = evaluateBookingBypass(invalidResult, false, false, false)
    expect(decision.canBypassLLM).toBe(false)
    expect(decision.reasons[0]).toContain('Giờ đặt bàn nằm ngoài khung hoạt động thông thường')
  })
})
