import { describe, it, expect } from 'vitest'
import { repairAndNormalizeJSON, applyDeterministicRuleLock, cleanBookingNotes, cleanCustomerName, normalizeDateString } from '../bookingNormalizer'

describe('Booking Normalizer Tests', () => {
  it('should normalize event dates to DD/MM/YYYY format', () => {
    const currentYear = new Date().getFullYear()
    expect(normalizeDateString('ngày 4/7')).toBe(`04/07/${currentYear}`)
    expect(normalizeDateString('4/7/2026')).toBe('04/07/2026')
    expect(normalizeDateString('04/7/2026')).toBe('04/07/2026')
    expect(normalizeDateString('4-7-2026')).toBe('04/07/2026')
    expect(normalizeDateString('04-07-2026')).toBe('04/07/2026')
    expect(normalizeDateString('4.7.2026')).toBe('04/07/2026')
    expect(normalizeDateString(' ngày 04-07-26 ')).toBe('04/07/2026')
  })

  it('should clean customer names by stripping table codes', () => {
    expect(cleanCustomerName('Anh Huy C6')).toBe('Anh Huy')
    expect(cleanCustomerName('Huy bàn C6')).toBe('Huy')
    expect(cleanCustomerName('bàn C6 Huy')).toBe('Huy')
    expect(cleanCustomerName('A1 Huy')).toBe('Huy')
    expect(cleanCustomerName('Huy A1')).toBe('Huy')
    expect(cleanCustomerName('Chị Vy bàn 12')).toBe('Chị Vy')
    expect(cleanCustomerName('C6')).toBe('')
    expect(cleanCustomerName('Anh Huy VIP2')).toBe('Anh Huy')
    expect(cleanCustomerName('Vy khu B')).toBe('Vy')
  })

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
