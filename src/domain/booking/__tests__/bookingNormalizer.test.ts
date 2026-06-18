import { describe, it, expect } from 'vitest'
import { repairAndNormalizeJSON, applyDeterministicRuleLock, cleanBookingNotes } from '../bookingNormalizer'

describe('Booking Normalizer Tests', () => {
  it('should clean redundant notes from noteText', () => {
    const noteText = 'Tên khách: Nguyễn Văn A\nSĐT: 0987654321\nNote quan trọng: ăn không hành'
    const customer = { name: 'Nguyễn Văn A', phone: '0987654321' }
    const booking = { guest_count: 5 }
    const cleaned = cleanBookingNotes(noteText, customer, booking, [])
    expect(cleaned).toBe('Note quan trọng: ăn không hành')
  })

  it('should lock deterministic rule outputs', () => {
    const aiResult = {
      customer: { name: '', phone: '' },
      booking: { event_date: '', event_time: '' }
    }
    const hardEntities = {
      phones: [{ value: '0987654321', confidence: 0.95 }],
      dates: [{ value: '25/06/2026', confidence: 0.95, raw: '25/6' }],
      times: [{ value: '18:30', confidence: 0.95, raw: '18h30' }],
      guestCounts: [],
      tables: []
    }
    const ruleBased = { customer_name: 'Nguyễn Văn A' }
    const locked = applyDeterministicRuleLock(aiResult, hardEntities, ruleBased)
    
    expect(locked.customer.name).toBe('Nguyễn Văn A')
    expect(locked.customer.phone).toBe('0987654321')
    expect(locked.booking.event_date).toBe('25/06/2026')
    expect(locked.booking.event_time).toBe('18:30')
  })
})
