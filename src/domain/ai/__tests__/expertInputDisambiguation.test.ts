import { describe, it, expect } from 'vitest'
import {
  disambiguatePolysemicToken,
  resolvePeopleRoles,
  classifyNonFoodLeakage,
  generateOperationalDispatch
} from '@/domain/ai/expertEntityDisambiguator'
import { cleanCustomerName, crossValidateResults } from '@/domain/booking/bookingNormalizer'

describe('Expert Input Disambiguation & Semantic Intelligence', () => {
  describe('1. Polysemic Token Disambiguation (Tên người vs Món ăn / Thời gian / Hành động)', () => {
    it('should identify "Yến" as a person when preceded by honorific "Chị"', () => {
      const res = disambiguatePolysemicToken('Yến', 'Chị', 'đặt bàn lúc 19h')
      expect(res.category).toBe('person')
      expect(res.confidence).toBeGreaterThan(0.9)
    })

    it('should identify "yến" as food when combined with cooking verb/dish prefix', () => {
      const res = disambiguatePolysemicToken('yến', '1 thố súp', 'thượng hạng')
      expect(res.category).toBe('food')
      expect(res.confidence).toBeGreaterThan(0.85)
    })

    it('should identify "Bắp" as a child / party celebrant nickname when preceded by "bé"', () => {
      const res = disambiguatePolysemicToken('Bắp', 'tiệc thôi nôi của bé', '1 tuổi')
      expect(res.category).toBe('person')
      expect(res.explanation).toContain('Tên Chủ Tiệc / Bé Mừng Sinh Nhật')
    })

    it('should identify "bắp" as food when combined with "xào bơ"', () => {
      const res = disambiguatePolysemicToken('bắp', 'cho 2 dĩa', 'xào bơ phô mai')
      expect(res.category).toBe('food')
    })

    it('should identify "Đào" as person after "Chị" and "trà đào" as drink', () => {
      const personRes = disambiguatePolysemicToken('Đào', 'Chị', '0908123456')
      expect(personRes.category).toBe('person')

      const drinkRes = disambiguatePolysemicToken('đào', 'cho thêm 3 ly trà', 'nhiệt đới')
      expect(drinkRes.category).toBe('food')
    })

    it('should distinguish "Mai" as time vs "Mai" as customer name', () => {
      const timeRes = disambiguatePolysemicToken('Mai', 'Hẹn quán tối', '19h nhé')
      expect(timeRes.category).toBe('time')

      const personRes = disambiguatePolysemicToken('Mai', 'Anh', 'đặt bàn cho')
      expect(personRes.category).toBe('person')
    })

    it('should distinguish "Đạt" as action/status vs "Đạt" as customer name', () => {
      const actionRes = disambiguatePolysemicToken('đạt', 'đã chuyển khoản cọc', 'yêu cầu')
      expect(actionRes.category).toBe('action')

      const personRes = disambiguatePolysemicToken('Đạt', 'Anh', '0933111222')
      expect(personRes.category).toBe('person')
    })
  })

  describe('2. Multi-Role People Separation (Booker, Host, Contact, Payer)', () => {
    it('should separate booker from birthday child with food-like nicknames', () => {
      const input = `Khách hàng: Chị Linh 0903123456
Tiệc thôi nôi bé Bắp tròn 1 tuổi
Bàn A1 lúc 18h30 ngày 15/10/2026
Người liên hệ phụ: Anh Tuấn 0909888777
Tk chuyển cọc: Trần Văn Nam`

      const roles = resolvePeopleRoles(input)
      expect(roles.customerName).toBe('Linh')
      expect(roles.partyOwnerName).toBe('Bé Bắp')
      expect(roles.depositSender).toBe('Trần Văn Nam')
      expect(roles.discrepancies.length).toBeGreaterThan(0)
    })

    it('should handle party host with nickname "Bé Cua" and booker "Anh Hải"', () => {
      const input = `Anh Hải 0918234567 đặt tiệc sinh nhật cho bé Cua 10 người`
      const roles = resolvePeopleRoles(input)
      expect(roles.customerName).toBe('Hải')
      expect(roles.partyOwnerName).toBe('Bé Cua')
    })

    it('should note discrepancy when booker is also the celebrant', () => {
      const input = `Khách hàng: Serena
Tiệc sinh nhật Serena`
      const roles = resolvePeopleRoles(input)
      expect(roles.customerName).toBe('Serena')
      expect(roles.partyOwnerName).toBe('Serena')
      expect(roles.discrepancies[0]).toContain('trùng với chủ nhân tiệc')
    })
  })

  describe('3. Strict Non-Food Leakage Classification & Routing', () => {
    it('should classify decor keywords and route to decor attributes', () => {
      const toneLeak = classifyNonFoodLeakage('tone hồng pastel')
      expect(toneLeak.isLeakage).toBe(true)
      expect(toneLeak.divertTo).toBe('party.decor_color')

      const flowerLeak = classifyNonFoodLeakage('trang trí hoa tươi')
      expect(flowerLeak.isLeakage).toBe(true)
      expect(flowerLeak.divertTo).toBe('party.special_request')

      const balloonLeak = classifyNonFoodLeakage('thêm bóng bay viền background')
      expect(balloonLeak.isLeakage).toBe(true)
      expect(balloonLeak.divertTo).toBe('party.special_request')
    })

    it('should classify seating and equipment and route to seating_preference', () => {
      const chairLeak = classifyNonFoodLeakage('2 ghế em bé')
      expect(chairLeak.isLeakage).toBe(true)
      expect(chairLeak.divertTo).toBe('party.seating_preference')

      const vipLeak = classifyNonFoodLeakage('phòng VIP lầu 1')
      expect(vipLeak.isLeakage).toBe(true)
      expect(vipLeak.divertTo).toBe('party.seating_preference')

      const balconyLeak = classifyNonFoodLeakage('view ban công')
      expect(balconyLeak.isLeakage).toBe(true)
      expect(balconyLeak.divertTo).toBe('party.seating_preference')
    })

    it('should classify dietary/cooking constraints and route to dietary_notes', () => {
      const spicyLeak = classifyNonFoodLeakage('làm không cay cho trẻ em')
      expect(spicyLeak.isLeakage).toBe(true)
      expect(spicyLeak.divertTo).toBe('party.dietary_notes')

      const allergyLeak = classifyNonFoodLeakage('dị ứng hải sản')
      expect(allergyLeak.isLeakage).toBe(true)
      expect(allergyLeak.divertTo).toBe('party.dietary_notes')

      const vegLeak = classifyNonFoodLeakage('ăn chay')
      expect(vegLeak.isLeakage).toBe(true)
      expect(vegLeak.divertTo).toBe('party.dietary_notes')
    })

    it('should NOT flag actual food items as leakage', () => {
      const food1 = classifyNonFoodLeakage('Sườn cọng nướng sốt BBQ')
      expect(food1.isLeakage).toBe(false)

      const food2 = classifyNonFoodLeakage('Lẩu thái hải sản')
      expect(food2.isLeakage).toBe(false)

      const food3 = classifyNonFoodLeakage('Bắp xào bơ tỏi')
      expect(food3.isLeakage).toBe(false)

      const food4 = classifyNonFoodLeakage('Cơm chiên cá mặn chà bông ớt hiểm (cay)')
      expect(food4.isLeakage).toBe(false)
    })
  })

  describe('4. Cross-Validation & Zero Non-Food Leakage in bookingNormalizer', () => {
    it('should purge customer name, party owner name, and diverted decor/seating from menu_items', () => {
      const mockResult: any = {
        customer: { name: 'Chị Yến', phone: '0908123456' },
        party: { owner_name: 'Bé Bắp' },
        menu_items: [
          { raw_name: 'Chị Yến', quantity: 1 },
          { raw_name: 'Bé Bắp', quantity: 1 },
          { raw_name: '2 ghế em bé', quantity: 2 },
          { raw_name: 'tone hồng', quantity: 1 },
          { raw_name: 'làm không cay', quantity: 1 },
          { raw_name: 'Sườn nướng sốt cay', quantity: 2 },
          { raw_name: 'Lẩu thái chua cay', quantity: 1 }
        ],
        notes: { customer_note: '' }
      }

      const { result, validations } = crossValidateResults(mockResult, null, { phones: [], dates: [], times: [], guestCounts: [], tables: [] })

      // Valid dishes should ONLY contain actual food
      expect(result.menu_items.length).toBe(2)
      expect(result.menu_items[0].raw_name).toBe('Sườn nướng sốt cay')
      expect(result.menu_items[1].raw_name).toBe('Lẩu thái chua cay')

      // Diverted fields
      expect(result.party.seating_preference).toContain('2 ghế em bé')
      expect(result.party.decor_color).toContain('tone hồng')
      expect(result.party.dietary_notes).toContain('làm không cay')

      // Validations logged
      expect(validations.some(v => v.reason.includes('Chị Yến'))).toBe(true)
      expect(validations.some(v => v.reason.includes('Bé Bắp'))).toBe(true)
    })
  })

  describe('5. Clean Customer Name Edge Cases', () => {
    it('should strip table codes and english titles while preserving polite names', () => {
      expect(cleanCustomerName('Chị Yến C6')).toBe('Chị Yến')
      expect(cleanCustomerName('Anh Đạt VIP2')).toBe('Anh Đạt')
      expect(cleanCustomerName('C. Mai')).toBe('Mai')
      expect(cleanCustomerName('Mr. Tuấn')).toBe('Tuấn')
    })

    it('should reject food names mistaken as customer names', () => {
      expect(cleanCustomerName('Lẩu thái hải sản')).toBe('')
      expect(cleanCustomerName('Cơm chiên cá mặn')).toBe('')
      expect(cleanCustomerName('Bò nướng tảng')).toBe('')
    })

    it('should reject seating and amenity phrases', () => {
      expect(cleanCustomerName('Ghế em bé')).toBe('')
      expect(cleanCustomerName('Phòng VIP 2')).toBe('')
    })
  })

  describe('6. Enterprise Operational Dispatch (BEO) Generation', () => {
    it('should generate complete 4-department dispatch instructions', () => {
      const dispatch = generateOperationalDispatch({
        customer: { name: 'Chị Mai', phone: '0908123456' },
        booking: { date: '15/10/2026', time: '19:00', tables: 'A1,A2', guest_count: 12, need: 'Sinh nhật' },
        party: {
          owner_name: 'Bé Bắp',
          decor_color: 'Tone hồng pastel',
          display_board_text: 'HPBD Bé Bắp 1st',
          special_request: 'Chừa chỗ chụp hình background',
          seating_preference: '2 ghế em bé',
          dietary_notes: 'Làm không cay cho bàn trẻ em'
        },
        items: [
          { name: 'Sườn nướng sốt BBQ', quantity: 3 },
          { name: 'Lẩu thái hải sản', quantity: 2, note: 'nước lẩu để riêng ớt' }
        ],
        deposit: { amount: 1000000, isPaid: true }
      })

      // Reception
      expect(dispatch.receptionDispatch).toContain('Chị Mai')
      expect(dispatch.receptionDispatch).toContain('A1,A2')
      expect(dispatch.receptionDispatch).toContain('2 ghế em bé')

      // Kitchen
      expect(dispatch.kitchenDispatch).toContain('Sườn nướng sốt BBQ')
      expect(dispatch.kitchenDispatch).toContain('Làm không cay cho bàn trẻ em')

      // Decor
      expect(dispatch.decorDispatch).toContain('Bé Bắp')
      expect(dispatch.decorDispatch).toContain('Tone hồng pastel')
      expect(dispatch.decorDispatch).toContain('HPBD Bé Bắp 1st')

      // Cashier
      expect(dispatch.cashierDispatch).toContain('1.000.000')
      expect(dispatch.cashierDispatch).toContain('ĐÃ CỌC')
    })
  })
})
