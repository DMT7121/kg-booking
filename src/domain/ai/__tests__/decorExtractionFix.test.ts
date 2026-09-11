import { describe, it, expect } from 'vitest'
import { extractByRules, extractDecorationDetails, scanFullTextForDecor } from '../ruleEngine'
import { analyzeBookingIntelligenceV2 } from '../v2/bookingIntelligenceV2'
import { buildPartyNote, cleanBookingNotes, repairAndNormalizeJSON, applyDeterministicRuleLock } from '@/domain/booking/bookingNormalizer'

describe('Decor and Notes Extraction & Booking Form Integration', () => {
  const sample1 = 'Đặt tiệc sinh nhật bé Min, 19h tối mai 10 khách, TONE HỒNG, thêm bóng bay, dựng background, không cay, 2 ghế em bé'
  const sample2 = `Khách: Chị Lan 0908889999
Ngày: 15/10/2026 lúc 18h30
Số khách: 12 người
Yêu cầu: TONE HỒNG PASTEL, làm backdrop chụp ảnh, bóng bay trang trí
Ghi chú khác: đồ ăn không cay, ít ngọt, bàn gần cửa sổ, chuẩn bị 3 ghế trẻ em`
  const sample3 = 'Anh Hùng 0912345678 book bàn 20h tối nay 6 khách, tone xanh dương, view cửa sổ, không cay, sốt để riêng, thêm bóng bay'

  it('correctly extracts TONE HỒNG, decor and notes in extractByRules for single line input', () => {
    const res = extractByRules(sample1)
    expect(res.party.decor_color).toMatch(/hồng/i)
    expect(res.party.special_request).toMatch(/bóng bay|background/i)
    expect(res.party.seating_preference).toMatch(/ghế trẻ em|baby chair/i)
    expect(res.party.dietary_notes).toMatch(/không cay/i)

    const note = buildPartyNote(res.party, '')
    expect(note).toMatch(/Tông màu trang trí:\s*HỒNG/i)
    expect(note).toContain('Ghi chú / Dặn dò trang trí:')
    expect(note).toContain('[Không gian & Chỗ ngồi]: Cần 2 ghế trẻ em (baby chair)')
    expect(note).toContain('[Khẩu vị & Dị ứng]: Làm không cay')
  })

  it('correctly extracts TONE HỒNG PASTEL and notes in extractByRules for multi-line input', () => {
    const res = extractByRules(sample2)
    expect(res.party.decor_color).toMatch(/hồng/i)
    expect(res.party.special_request).toMatch(/backdrop|bóng bay/i)
    expect(res.party.seating_preference).toMatch(/ghế trẻ em|cửa sổ/i)
    expect(res.party.dietary_notes).toMatch(/không cay/i)

    const note = buildPartyNote(res.party, '')
    expect(note).toMatch(/Tông màu trang trí:\s*(?:TONE\s*)?HỒNG/i)
    expect(note).toContain('[Khẩu vị & Dị ứng]:')
    expect(note).toContain('[Không gian & Chỗ ngồi]:')
  })

  it('extracts decor color, seating and taste facts in BookingIntelligenceV2', () => {
    const v2_1 = analyzeBookingIntelligenceV2(sample1)
    expect(v2_1.state.party.decor_color).toMatch(/hồng/i)
    expect(v2_1.state.party.special_request).toMatch(/bóng bay|background/i)
    expect(v2_1.state.party.seating_preference).toMatch(/ghế trẻ em|baby chair/i)
    expect(v2_1.state.party.dietary_notes).toMatch(/không cay/i)
    expect(v2_1.legacyFormPayload.party.decor_color).toMatch(/hồng/i)

    const v2_3 = analyzeBookingIntelligenceV2(sample3)
    expect(v2_3.state.party.decor_color).toMatch(/xanh/i)
    expect(v2_3.state.party.special_request).toMatch(/bóng bay/i)
    expect(v2_3.state.party.seating_preference).toMatch(/cửa sổ/i)
    expect(v2_3.state.party.dietary_notes).toMatch(/không cay/i)
  })

  it('locks and synchronizes party note when AI payload lacks party fields (Full Pipeline)', () => {
    const ruleRes = extractByRules(sample1)
    const rawAiParsed = {
      customer: { name: 'Chị Lan', phone: '0908889999' },
      booking: { event_date: '15/10/2026', event_time: '19:00', guest_count: 10 }
      // AI didn't return party
    }
    const normalized = repairAndNormalizeJSON(rawAiParsed, 'booking_text')
    const locked = applyDeterministicRuleLock(normalized, { phones: [], dates: [], times: [], guestCounts: [], tables: [] }, ruleRes)

    expect(locked.party.decor_color).toMatch(/hồng/i)
    expect(locked.party.special_request).toMatch(/bóng bay|background/i)
    expect(locked.party.seating_preference).toMatch(/ghế trẻ em|baby chair/i)
    expect(locked.party.dietary_notes).toMatch(/không cay/i)

    expect(locked.note).toMatch(/Tông màu trang trí:\s*HỒNG/i)
    expect(locked.note).toContain('Ghi chú / Dặn dò trang trí:')
    expect(locked.note).toContain('[Không gian & Chỗ ngồi]: Cần 2 ghế trẻ em (baby chair)')
    expect(locked.note).toContain('[Khẩu vị & Dị ứng]: Làm không cay')
  })

  it('prevents note duplication when buildPartyNote is invoked sequentially', () => {
    const party = {
      owner_name: 'Bé Min',
      decor_color: 'TONE HỒNG',
      special_request: 'Thêm bóng bay; Dựng background',
      seating_preference: '2 ghế em bé',
      dietary_notes: 'Làm không cay'
    }

    const note1 = buildPartyNote(party, '')
    // Call second time with existing note
    const note2 = buildPartyNote(party, note1)

    // Count occurrences of 'Tông màu trang trí:'
    const matches = note2.match(/Tông màu trang trí:/g)
    expect(matches?.length).toBe(1)
  })
})
