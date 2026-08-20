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

  it('should include decor_color in party notes and repairAndNormalizeJSON output', () => {
    const parsed = {
      customer: { name: 'Chị Trang', phone: '0901234567' },
      party: { type: 'Sinh nhật', owner_name: 'Bé Min', display_board_text: 'Happy 1st Birthday Bé Min', decor_color: 'Hồng pastel', special_request: 'Bóng bay pastel' },
      booking: { date: '15/08/2026', time: '19:00', guest_count: 15 }
    }
    const normalized = repairAndNormalizeJSON(parsed)
    expect(normalized.customer.name).toBe('Chị Trang')
    expect(normalized.customer.phone).toBe('0901234567')
    expect(normalized.party.decor_color).toBe('Hồng pastel')
    expect(normalized.note).toContain('Chủ tiệc / người được tổ chức: Bé Min')
    expect(normalized.note).toContain('Tông màu trang trí: Hồng pastel')
    expect(normalized.note).toContain('Nội dung bảng/trang trí: Happy 1st Birthday Bé Min')
  })

  it('should reject table numbers and staff/receiver labels from cleanCustomerName', () => {
    expect(cleanCustomerName('Bàn 5')).toBe('')
    expect(cleanCustomerName('Bàn C6')).toBe('')
    expect(cleanCustomerName('Khu B')).toBe('')
    expect(cleanCustomerName('VIP2')).toBe('')
    expect(cleanCustomerName('Nhận')).toBe('')
    expect(cleanCustomerName('Lễ tân')).toBe('')
  })

  it('should format mirror_board_text and special requests fully in buildPartyNote and repairAndNormalizeJSON', () => {
    const parsed = {
      customer: { name: 'Anh Nam', phone: '0912345678' },
      party: {
        type: 'Sinh nhật',
        owner_name: 'Bé Su',
        display_board_text: 'Happy Birthday Bé Su',
        mirror_board_text: 'Welcome to Su Birthday',
        decor_color: 'Xanh dương pastel',
        special_request: 'Đem bánh kem lúc 20h'
      },
      booking: { date: '20/08/2026', time: '18:30', guest_count: 10 }
    }
    const normalized = repairAndNormalizeJSON(parsed)
    expect(normalized.note).toContain('Chủ tiệc / người được tổ chức: Bé Su')
    expect(normalized.note).toContain('Tông màu trang trí: Xanh dương pastel')
    expect(normalized.note).toContain('Nội dung bảng/trang trí: Happy Birthday Bé Su')
    expect(normalized.note).toContain('Gương viết tên: Welcome to Su Birthday')
    expect(normalized.note).toContain('Ghi chú / Dặn dò trang trí: Đem bánh kem lúc 20h')
  })

  it('should NOT overwrite customer.name with party.owner_name when booker is missing', () => {
    const parsed = {
      customer: { name: '', phone: '0901234567' },
      party: {
        type: 'Sinh nhật',
        owner_name: 'Bé Bắp',
        display_board_text: 'Happy Birthday Bé Bắp'
      },
      booking: { date: '20/08/2026', time: '19:00', guest_count: 8, tables: '5' }
    }
    const normalized = repairAndNormalizeJSON(parsed)
    // customer.name should be empty, NOT "Bé Bắp"
    expect(normalized.customer.name).toBe('')
    expect(normalized.party.owner_name).toBe('Bé Bắp')
    expect(normalized.needs_review_fields).toContain('party_owner_detected_but_booker_missing')
    expect(normalized.needs_review_fields).toContain('missing_customer_name')
  })

  it('should format fresh flower decoration and theme color in party notes', () => {
    const parsed = {
      customer: { name: 'Chị Ngọc', phone: '0938009889' },
      party: {
        type: 'Sinh nhật',
        owner_name: 'Thiên Hào',
        display_board_text: 'Happy Birthday Thiên Hào',
        decor_color: 'Hồng pastel',
        special_request: 'Trang trí hoa tươi trên bàn và bóng bay pastel'
      },
      booking: { date: '25/08/2026', time: '18:30', guest_count: 10 }
    }
    const normalized = repairAndNormalizeJSON(parsed)
    expect(normalized.customer.name).toBe('Chị Ngọc')
    expect(normalized.note).toContain('Nội dung bảng/trang trí: Happy Birthday Thiên Hào')
    expect(normalized.note).toContain('Ghi chú / Dặn dò trang trí: Trang trí hoa tươi trên bàn và bóng bay pastel')
  })
})
