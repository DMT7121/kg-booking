import { describe, it, expect } from 'vitest'
import {
  parseUnifiedBooking,
  cleanNameTitle,
  disambiguatePolysemicWord,
  parseBankTransferMessage,
  applyDistributiveQuantifiers
} from '../unifiedParserEngine'

describe('Unified Deterministic Booking Parser Engine V3', () => {
  describe('cleanNameTitle & Polysemic Disambiguation', () => {
    it('should strip compound conversational titles from names', () => {
      expect(cleanNameTitle('Chị Lan')).toBe('Lan')
      expect(cleanNameTitle('Anh Đạt')).toBe('Đạt')
      expect(cleanNameTitle('C. Hồng Nhung')).toBe('Hồng Nhung')
      expect(cleanNameTitle('Khách hàng: Serena')).toBe('Serena')
      expect(cleanNameTitle('Bác Hùng')).toBe('Hùng')
    })

    it('should correctly distinguish person name vs food item vs relative time', () => {
      expect(disambiguatePolysemicWord('Yến', 'Chị Yến đặt bàn 18h')).toBe('person')
      expect(disambiguatePolysemicWord('Yến', 'Cho 2 chén chè yến')).toBe('dish')
      expect(disambiguatePolysemicWord('Đào', '1 dĩa gỏi và 2 ly trà đào')).toBe('dish')
      expect(disambiguatePolysemicWord('Mai', 'tối mai 19h có mặt')).toBe('time')
      expect(disambiguatePolysemicWord('Cua', '1 nồi lẩu cua đồng')).toBe('dish')
    })
  })

  describe('Bank Transfer SMS Parser', () => {
    it('should parse standard bank transaction notification formats', () => {
      const vcbText = 'SD TK 0123456789 +500,000VND vao 14/10/2026. ND: CK COC BAN A1 CHI LAN'
      const res = parseBankTransferMessage(vcbText)
      expect(res).not.toBeNull()
      expect(res?.amount).toBe(500000)
      expect(res?.bankRef).toContain('CK COC BAN A1 CHI LAN')
    })

    it('should parse informal deposit text like "cọc 500k"', () => {
      const res = parseBankTransferMessage('Khách đã chuyển cọc 500k qua MB')
      expect(res).not.toBeNull()
      expect(res?.amount).toBe(500000)
    })
  })

  describe('Distributive Quantifiers', () => {
    it('should apply collective multiplier "mỗi món 2 phần" to all preceding dishes', () => {
      const dishes = [
        { name: 'Bò nướng tảng', quantity: 1, note: '', confidence: 0.9 },
        { name: 'Lẩu thái hải sản', quantity: 1, note: '', confidence: 0.9 }
      ]
      const distributed = applyDistributiveQuantifiers(dishes, 'Bò nướng tảng, Lẩu thái - mỗi món 2 phần nha em')
      expect(distributed[0].quantity).toBe(2)
      expect(distributed[1].quantity).toBe(2)
    })

    it('should apply partial distribution "2 món đầu mỗi món 3 phần"', () => {
      const dishes = [
        { name: 'Khoai tây chiên', quantity: 1, note: '', confidence: 0.9 },
        { name: 'Gỏi bò bóp thấu', quantity: 1, note: '', confidence: 0.9 },
        { name: 'Lẩu cá kèo', quantity: 1, note: '', confidence: 0.9 }
      ]
      const distributed = applyDistributiveQuantifiers(dishes, '2 món đầu mỗi món 3 phần, lẩu 1 phần')
      expect(distributed[0].quantity).toBe(3)
      expect(distributed[1].quantity).toBe(3)
      expect(distributed[2].quantity).toBe(1)
    })
  })

  describe('End-to-End Unified Deterministic Ingestion', () => {
    it('should parse structured key-value booking input with 100% completeness and high confidence', () => {
      const input = `
Tên khách: Chị Lan Hương
SĐT: 0908123456
Ngày: 20/10/2026
Giờ: 19:00
Khách: 15 người
Bàn: VIP1
Tiệc: Sinh nhật
Chủ tiệc: Bé Bắp
Tone: Hồng pastel
Bảng tên: Happy 1st Birthday Bé Bắp
Cọc: 1000k đã chuyển
Món ăn:
- Bò nướng tảng x 2
- 1 Lẩu thái hải sản (làm không cay)
- Khoai tây chiên (2 dĩa)
      `

      const payload = parseUnifiedBooking(input)
      expect(payload.customer.name.value).toBe('Lan Hương')
      expect(payload.customer.phone.value).toBe('0908123456')
      expect(payload.booking.date.value).toBe('20/10/2026')
      expect(payload.booking.time.value).toBe('19:00')
      expect(payload.booking.guestCount.value).toBe(15)
      expect(payload.booking.tableCode.value).toBe('VIP1')
      expect(payload.booking.need.value).toBe('Sinh nhật')
      expect(payload.party.ownerName.value).toBe('Bé Bắp')
      expect(payload.party.decorColor.value).toBe('Hồng pastel')
      expect(payload.party.displayBoardText.value).toBe('Happy 1st Birthday Bé Bắp')
      expect(payload.deposit.amount.value).toBe(1000000)
      expect(payload.deposit.status.value).toBe('đã cọc')

      // Menu items
      expect(payload.menuItems.length).toBe(3)
      expect(payload.menuItems[0].rawName).toBe('Bò nướng tảng')
      expect(payload.menuItems[0].quantity).toBe(2)
      expect(payload.menuItems[1].rawName).toBe('Lẩu thái hải sản')
      expect(payload.menuItems[1].quantity).toBe(1)
      expect(payload.menuItems[1].note).toBe('làm không cay')
      expect(payload.menuItems[2].rawName).toBe('Khoai tây chiên')
      expect(payload.menuItems[2].quantity).toBe(2)

      // Fast-track & Markdown
      expect(payload.isComplete).toBe(true)
      expect(payload.overallConfidence).toBeGreaterThanOrEqual(0.95)
      expect(payload.canonicalMarkdown).toContain('Lan Hương')
      expect(payload.distilledAIPrompt).toContain('customer_name="Lan Hương"')
    })

    it('should parse informal chat message with polysemic name guard', () => {
      const chat = 'Chị Yến 0938112233 đặt bàn 18h tối mai 8 người, cho 1 dĩa bò nướng tảng và 2 chè yến tráng miệng'
      const payload = parseUnifiedBooking(chat)

      expect(payload.customer.name.value).toBe('Yến')
      expect(payload.customer.phone.value).toBe('0938112233')
      expect(payload.booking.guestCount.value).toBe(8)
      expect(payload.booking.time.value).toBe('18:00')
      expect(payload.isComplete).toBe(true)
    })

    it('should generate distilled AI payload for missing fields', () => {
      const incomplete = 'Cho đặt bàn 10 người tiệc công ty lúc 19h'
      const payload = parseUnifiedBooking(incomplete)

      expect(payload.isComplete).toBe(false)
      expect(payload.missingCoreFields).toContain('Tên khách hoặc Số điện thoại')
      expect(payload.distilledAIPrompt).toContain('[MISSING/UNCERTAIN FIELDS NEEDING ATTENTION]')
    })
  })
})
