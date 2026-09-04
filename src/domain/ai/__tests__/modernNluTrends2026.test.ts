import { describe, it, expect } from 'vitest'
import { extractByRules, preNormalizeInput, extractSeatingPreferences, extractDietaryNotes } from '@/domain/ai/ruleEngine'
import { crossValidateResults, buildPartyNote } from '@/domain/booking/bookingNormalizer'

describe('Modern NLU & 2026 F&B Trends', () => {
  describe('Pillar 1: Slang & Teencode Zalo Processing', () => {
    it('should parse casual slang for guest counts like mống, mạng, mem', () => {
      const raw1 = 'Nhóm mình 6 mống đặt bàn 7h kém 15 đc ko shop, số 0901234567'
      const res1 = extractByRules(raw1)
      expect(res1.guest_count).toBe(6)
      expect(res1.event_time).toBe('18:45')
      expect(res1.phone).toBe('0901234567')

      const raw2 = 'Bên mình có 5 mạng ăn lúc 8h hơn tối nay'
      const res2 = extractByRules(raw2)
      expect(res2.guest_count).toBe(5)
      expect(res2.event_time).toBe('20:15')

      const raw3 = 'Set bàn cho 8 mem nhé shop'
      const res3 = extractByRules(raw3)
      expect(res3.guest_count).toBe(8)
    })

    it('should handle guest count range estimations taking the safe upper bound', () => {
      const raw = 'Bàn tầm 8-10 người lúc 19h tối mai gọi món sau'
      const res = extractByRules(raw)
      expect(res.guest_count).toBe(10)
      expect(res.event_time).toBe('19:00')
    })

    it('should normalize common chat abbreviations in preNormalizeInput', () => {
      const text = 'ib shop xem ngày mai còn bàn đc ko'
      const normalized = preNormalizeInput(text)
      expect(normalized).toContain('nhắn tin')
      expect(normalized).toContain('được không')
    })
  })

  describe('Pillar 2: Voice-to-Text & Spoken Vietnamese Recognition', () => {
    it('should recognize spoken Vietnamese guest counts with adults + children', () => {
      const raw = 'Bảy người lớn hai trẻ em lúc tám giờ rưỡi tối'
      const res = extractByRules(raw)
      expect(res.guest_count).toBe(9)
      expect(res.event_time).toBe('20:30')
    })

    it('should recognize standalone written numbers for guests', () => {
      const raw = 'Đặt bàn cho tám người lúc bảy giờ tối'
      const res = extractByRules(raw)
      expect(res.guest_count).toBe(8)
      expect(res.event_time).toBe('19:00')
    })

    it('should correctly parse spoken Vietnamese relative hours and "giờ kém"', () => {
      const raw1 = 'Bàn bảy giờ kém mười lăm'
      const res1 = extractByRules(raw1)
      expect(res1.event_time).toBe('18:45')

      const raw2 = 'Tám giờ kém hai mươi'
      const res2 = extractByRules(raw2)
      expect(res2.event_time).toBe('19:40')
    })
  })

  describe('Pillar 3: Seating & Space Preferences', () => {
    it('should extract private rooms, balcony views, baby chairs, and outside alcohol', () => {
      const raw = 'Đặt phòng VIP view ban công, chuẩn bị giúp 2 ghế em bé, khách tự mang rượu vào nhé'
      const seating = extractSeatingPreferences(raw)
      expect(seating).toContain('Phòng riêng / VIP')
      expect(seating).toContain('View ban công')
      expect(seating).toContain('Cần 2 ghế trẻ em (baby chair)')
      expect(seating).toContain('Khách mang rượu từ ngoài vào')
    })

    it('should populate party.seating_preference and build formatted note block', () => {
      const raw = 'Phòng VIP yên tĩnh không ồn, cần 1 ghế em bé. Tên khách Hoàng Nam 0912345678'
      const res = extractByRules(raw)
      expect(res.party.seating_preference).toMatch(/Phòng riêng \/ VIP/i)
      expect(res.party.seating_preference).toMatch(/ghế trẻ em/i)

      const partyObj = {
        decor_color: 'Trắng',
        seating_preference: res.party.seating_preference
      }
      const note = buildPartyNote(partyObj, '')
      expect(note).toContain('[Không gian & Chỗ ngồi]:')
      expect(note).toContain('Phòng riêng / VIP')
    })
  })

  describe('Pillar 4: Dietary Preferences & Allergy Safety', () => {
    it('should extract vegetarian, allergy warnings, and taste preferences', () => {
      const raw = 'Bàn có người ăn chay và DỊ ỨNG HẢI SẢN nặng, món làm không cay, nước sốt để riêng, không bột ngọt'
      const dietary = extractDietaryNotes(raw)
      expect(dietary).toContain('Ăn chay / Vegetarian')
      expect(dietary).toContain('DỊ ỨNG HẢI SẢN')
      expect(dietary).toContain('Làm không cay')
      expect(dietary).toContain('Nước sốt / ớt để riêng')
      expect(dietary).toContain('Không / ít bột ngọt (mì chính)')
    })

    it('should preserve [Khẩu vị & Dị ứng] in customer booking notes via cross-validation', () => {
      const aiMock = {
        customer: { name: 'Thanh Vân', phone: '0933888999' },
        booking: { guest_count: 4, event_time: '19:00', event_date: '06/09/2026' },
        party: {},
        menu_items: []
      }
      const raw = 'Khách Thanh Vân 0933888999 bàn 4 người dị ứng đậu phộng, ăn ít cay'
      const ruleRes = extractByRules(raw)
      const { result } = crossValidateResults(aiMock, ruleRes)

      expect(result.party.dietary_notes).toMatch(/DỊ ỨNG ĐẬU PHỘNG/i)
      expect(result.note).toContain('[Khẩu vị & Dị ứng]:')
      expect(result.note).toContain('DỊ ỨNG ĐẬU PHỘNG')
    })
  })

  describe('Pillar 5: Modern Occasions & Event Trends 2026', () => {
    it('should recognize Proposal (Cầu hôn) and Gender Reveal', () => {
      const resProposal = extractByRules('Tiệc cầu hôn lãng mạn lúc 19h')
      expect(resProposal.booking_need).toBe('Cầu hôn (Proposal)')

      const resGender = extractByRules('Tiệc gender reveal cho bé yêu')
      expect(resGender.booking_need).toBe('Gender Reveal (Tiết lộ giới tính)')
    })

    it('should recognize Anniversary, Bachelor party, VIP Business, and Workshop', () => {
      expect(extractByRules('Kỷ niệm 10 năm ngày cưới').booking_need).toBe('Kỉ niệm')
      expect(extractByRules('Tiệc độc thân bạn thân').booking_need).toBe('Tiệc độc thân')
      expect(extractByRules('Bàn tiếp khách đối tác VIP').booking_need).toBe('Tiếp khách / Đối tác')
      expect(extractByRules('Offline workshop team marketing').booking_need).toBe('Workshop / Họp nhóm')
    })
  })

  describe('Pillar 6: Amendment Override (Last-statement wins)', () => {
    it('should override guest count when customer clarifies or amends', () => {
      const raw = 'Đặt bàn 4 người lúc 18h... à thôi đổi sang 8 người nhé'
      const res = extractByRules(raw)
      expect(res.guest_count).toBe(8)
    })

    it('should override event time when customer clarifies or postpones', () => {
      const raw = 'Bàn lúc 18h... à đổi sang 19h30 nhé shop'
      const res = extractByRules(raw)
      expect(res.event_time).toBe('19:30')
    })

    it('should handle both guest count and time amendments in one sentence', () => {
      const raw = 'Ban đầu tính 5 người lúc 18h nhưng chuyển sang 10 người lúc 20h nhé'
      const res = extractByRules(raw)
      expect(res.guest_count).toBe(10)
      expect(res.event_time).toBe('20:00')
    })
  })
})
