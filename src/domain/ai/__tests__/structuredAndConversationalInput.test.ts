import { describe, it, expect } from 'vitest'
import { parseStructuredForm, isStructuredFormText } from '../structuredFormParser'
import { classifyAIInput } from '../inputClassifier'
import { extractByRules } from '../ruleEngine'
import { crossValidateResults, repairAndNormalizeJSON } from '@/domain/booking/bookingNormalizer'

describe('Structured Form & Conversational AI Input Processing', () => {
  describe('1. Structured Form (Key-Value) Parsing', () => {
    const sampleForm = `
Tên khách: Chị Hoàng Yến
SĐT: 0988776655
Ngày: 25/12/2026
Giờ: 19:30
Số lượng: 12 người
Bàn: VIP1
Loại tiệc: Sinh nhật
Chủ tiệc: Bé Bơ
Tone màu: Tone đỏ
Trang trí: Thêm bóng bay, dựng background check-in
Chỗ ngồi: 2 ghế em bé, phòng VIP
Khẩu vị: Làm không cay, không hành ngò
Cọc: 1.000.000đ (đã chuyển)
Món:
- Gà ủ muối x2
- Lẩu cá chép giòn 1
- Khoai tây chiên (2 dĩa)
Ghi chú: Khách mang theo bánh kem
`

    it('should detect structured form text correctly', () => {
      expect(isStructuredFormText(sampleForm)).toBe(true)
      expect(isStructuredFormText('Chị Lan 0901234567 tối mai 19h')).toBe(false)
    })

    it('should accurately parse all fields from structured form (< 5ms)', () => {
      const parsed = parseStructuredForm(sampleForm)
      expect(parsed.isStructured).toBe(true)
      expect(parsed.matchedFieldCount).toBeGreaterThanOrEqual(10)
      
      // Customer
      expect(parsed.data.customer.name).toBe('Hoàng Yến')
      expect(parsed.data.customer.phone).toBe('0988776655')

      // Booking
      expect(parsed.data.booking.date).toBe('25/12/2026')
      expect(parsed.data.booking.time).toBe('19:30')
      expect(parsed.data.booking.guest_count).toBe(12)
      expect(parsed.data.booking.tables).toBe('VIP1')
      expect(parsed.data.booking.need).toBe('Sinh nhật')

      // Party & Decor & Preferences
      expect(parsed.data.party.owner_name).toBe('Bé Bơ')
      expect(parsed.data.party.decor_color.toLowerCase()).toContain('đỏ')
      expect(parsed.data.party.special_request.toLowerCase()).toContain('bóng bay')
      expect(parsed.data.party.seating_preference.toLowerCase()).toContain('ghế em bé')
      expect(parsed.data.party.dietary_notes.toLowerCase()).toContain('không cay')

      // Deposit
      expect(parsed.data.deposit.amount).toBe(1000000)
      expect(parsed.data.deposit.status).toBe('đã cọc')

      // Menu
      expect(parsed.data.menu_items.length).toBe(3)
      expect(parsed.data.menu_items[0].raw_name).toBe('Gà ủ muối')
      expect(parsed.data.menu_items[0].quantity).toBe(2)
      expect(parsed.data.menu_items[1].raw_name).toBe('Lẩu cá chép giòn')
      expect(parsed.data.menu_items[1].quantity).toBe(1)
      expect(parsed.data.menu_items[2].raw_name).toBe('Khoai tây chiên')
      expect(parsed.data.menu_items[2].quantity).toBe(2)
    })

    it('should classify structured form as highly ready for local-first extraction', () => {
      const classification = classifyAIInput({ text: sampleForm })
      expect(classification.detectedSignals.hasStructuredForm).toBe(true)
      expect(classification.shouldTryLocalFirst).toBe(true)
    })

    it('should enrich ruleEngine extractions from structured form', () => {
      const ruleResult = extractByRules(sampleForm)
      expect(ruleResult.customer_name).toBe('Hoàng Yến')
      expect(ruleResult.phone).toBe('0988776655')
      expect(ruleResult.guest_count).toBe(12)
      expect(ruleResult.table_code).toBe('VIP1')
      expect(ruleResult.booking_need).toBe('Sinh nhật')
      expect(ruleResult.deposit_amount).toBe(1000000)
      expect(ruleResult.deposit_status).toBe('đã cọc')
      expect(ruleResult.party.decor_color?.toLowerCase()).toContain('đỏ')
      expect(ruleResult.party.special_request?.toLowerCase()).toContain('bóng bay')
      expect(ruleResult.party.seating_preference?.toLowerCase()).toContain('ghế trẻ em')
      expect(ruleResult.party.dietary_notes?.toLowerCase()).toContain('không cay')
    })
  })

  describe('2. Multi-turn Conversational Input & Amendment Resolution', () => {
    const chatInput = `
Khách: Em ơi đặt bàn tối mai nhé
Nhân viên: Dạ bên em sẵn sàng đón tiếp, mình đi mấy người ạ?
Khách: Tầm 5 người nha em, tầm 18h
Nhân viên: Dạ 18h tối mai cho 5 khách ạ
Khách: À đổi sang 8 người nhé em, dời sang 19h giùm chị
Khách: Tên Lan Hương 0912345678
`

    it('should detect chat conversation signals and categorize as complex_conversation', () => {
      const classification = classifyAIInput({ text: chatInput })
      expect(classification.detectedSignals.hasChatConversation).toBe(true)
      expect(classification.complexity).toBe('complex_conversation')
      expect(classification.requiresConversationContext).toBe(true)
    })

    it('should resolve customer amendments (latest decision overrides earlier statements)', () => {
      const ruleResult = extractByRules(chatInput)
      // Customer changed from 5 to 8
      expect(ruleResult.guest_count).toBe(8)
      // Customer moved from 18h to 19h
      expect(ruleResult.event_time).toBe('19:00')
      // Customer identifier
      expect(ruleResult.customer_name).toBe('Lan Hương')
      expect(ruleResult.phone).toBe('0912345678')
    })
  })

  describe('3. Comprehensive Harvesting of Decor, Seating & Dietary into Notes', () => {
    const mixedInput = `
Anh Tuấn 0903112233 đặt bàn 6 khách tối mai 19h30, tổ chức sinh nhật cho vợ tone đỏ đô, có hoa tươi, thêm bóng bay và dựng background check-in. Cho anh 2 ghế em bé nha, món làm không cay cho trẻ nhỏ, sốt để riêng. Đã cọc 500k.
`

    it('should harvest all decor, seating, and dietary elements into party and note', () => {
      const ruleResult = extractByRules(mixedInput)
      expect(ruleResult.party.decor_color?.toLowerCase()).toContain('đỏ')
      expect(ruleResult.party.special_request?.toLowerCase()).toContain('bóng bay')
      expect(ruleResult.party.special_request?.toLowerCase()).toContain('background')
      expect(ruleResult.party.seating_preference?.toLowerCase()).toContain('ghế trẻ em')
      expect(ruleResult.party.dietary_notes?.toLowerCase()).toContain('không cay')
      expect(ruleResult.party.dietary_notes?.toLowerCase()).toContain('sốt')

      // Normalize through cross-validation pipeline
      const rawAi = repairAndNormalizeJSON({
        customer: { name: 'Tuấn', phone: '0903112233' },
        booking: { guest_count: 6, event_time: '19:30' }
      })
      const { result } = crossValidateResults(rawAi, ruleResult, { phones: [], dates: [], times: [], guestCounts: [] })

      // Note must preserve and present all critical operational reminders
      expect(result.note.toLowerCase()).toContain('tông màu trang trí: đỏ đô')
      expect(result.note.toLowerCase()).toContain('thêm bóng bay')
      expect(result.note.toLowerCase()).toContain('dựng background')
      expect(result.note.toLowerCase()).toContain('ghế trẻ em')
      expect(result.note.toLowerCase()).toContain('làm không cay')
      expect(result.note.toLowerCase()).toContain('sốt')
    })
  })
})
