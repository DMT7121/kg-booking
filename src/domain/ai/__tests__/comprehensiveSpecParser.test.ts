import { describe, it, expect } from 'vitest'
import { parseTableCodes, classifyPeopleNames, preNormalizeInput, parseSingleMenuLine, extractDecorationDetails } from '../ruleEngine'
import { normalizePartyType } from '../../booking/bookingNormalizer'
import { matchMenuItems } from '../../menu/menuMatcher'

describe('Comprehensive Input Processing Specs', () => {
  describe('1. Table Code Formats', () => {
    it('parses A1, A.01, Bàn A1, Bàn C5', () => {
      const t1 = parseTableCodes('A1')
      expect(t1).toEqual([{ zone: 'A', number: '1', raw: 'A1' }])

      const t2 = parseTableCodes('A.01')
      expect(t2).toEqual([{ zone: 'A', number: '1', raw: 'A1' }])

      const t3 = parseTableCodes('Bàn A1')
      expect(t3).toEqual([{ zone: 'A', number: '1', raw: 'A1' }])

      const t4 = parseTableCodes('Bàn C5')
      expect(t4).toEqual([{ zone: 'C', number: '5', raw: 'C5' }])
    })

    it('parses multi-table commas: Bàn C5,6; C6,7; D1,4; A1,2,3', () => {
      const t1 = parseTableCodes('Bàn C5,6')
      expect(t1.map(t => t.zone + t.number)).toEqual(['C5', 'C6'])

      const t2 = parseTableCodes('C6,7')
      expect(t2.map(t => t.zone + t.number)).toEqual(['C6', 'C7'])

      const t3 = parseTableCodes('D1,4')
      expect(t3.map(t => t.zone + t.number)).toEqual(['D1', 'D4'])

      const t4 = parseTableCodes('A1,2,3')
      expect(t4.map(t => t.zone + t.number)).toEqual(['A1', 'A2', 'A3'])
    })
  })

  describe('2. Customer Name Extraction after Table Code or Labels', () => {
    it('extracts name after table code: "A1 Lan Thương", "A5 Chị Lan", "Bàn C5 Chị Hoa"', () => {
      const res1 = classifyPeopleNames('A1 Lan Thương')
      expect(res1.bookerCandidates).toContain('Lan Thương')

      const res2 = classifyPeopleNames('A5 Chị Lan')
      expect(res2.bookerCandidates).toContain('Lan')

      const res3 = classifyPeopleNames('Bàn C5 Chị Hoa')
      expect(res3.bookerCandidates).toContain('Hoa')
    })

    it('extracts name after labels: "Người đặt: Anh Tuấn", "Khách hàng: Serena"', () => {
      const res1 = classifyPeopleNames('Người đặt: Anh Tuấn')
      expect(res1.bookerCandidates).toContain('Tuấn')

      const res2 = classifyPeopleNames('Khách hàng: Serena')
      expect(res2.bookerCandidates).toContain('Serena')
    })
  })

  describe('3. Event Hours (>= 15:00 PM standard)', () => {
    it('normalizes 7h -> 19:00, 6 giờ 30 -> 18:30, 8h -> 20:00', () => {
      const norm1 = preNormalizeInput('đặt bàn lúc 7h')
      expect(norm1).toContain('19:00')

      const norm2 = preNormalizeInput('đặt bàn lúc 6 giờ 30')
      expect(norm2).toContain('18:30')

      const norm3 = preNormalizeInput('đặt bàn 8h tối')
      expect(norm3).toContain('20:00')

      const norm4 = preNormalizeInput('bảy giờ rưỡi')
      expect(norm4).toContain('19:30')
    })
  })

  describe('4. Relative Date Calculations', () => {
    it('normalizes chiều mai, ngày mốt, thứ 7 tuần sau', () => {
      const norm1 = preNormalizeInput('chiều mai lúc 19h')
      expect(norm1).toMatch(/\d{2}\/\d{2}\/\d{4}/)

      const norm2 = preNormalizeInput('ngày mốt lúc 19h')
      expect(norm2).toMatch(/\d{2}\/\d{2}\/\d{4}/)

      const norm3 = preNormalizeInput('thứ 7 tuần sau 19h')
      expect(norm3).toMatch(/\d{2}\/\d{2}\/\d{4}/)
    })
  })

  describe('5. Guest Counts & Arithmetic Addition', () => {
    it('sums adults and children: "12 người lớn 3 trẻ em" -> 15 khách', () => {
      const norm = preNormalizeInput('12 người lớn 3 trẻ em')
      expect(norm).toContain('15 khách')
    })

    it('normalizes shorthand pax: 15ng, 15 người, 15 khách', () => {
      const norm1 = preNormalizeInput('15ng')
      expect(norm1).toContain('15 người')

      const norm2 = preNormalizeInput('mười lăm người')
      expect(norm2).toContain('15 khách')
    })
  })

  describe('6. Party Types Normalization', () => {
    it('normalizes all required party types', () => {
      expect(normalizePartyType('sinh nhật')).toBe('Sinh nhật')
      expect(normalizePartyType('SN')).toBe('Sinh nhật')
      expect(normalizePartyType('HPBD')).toBe('Sinh nhật')
      expect(normalizePartyType('Happy Birthday')).toBe('Sinh nhật')
      expect(normalizePartyType('CMSN')).toBe('Sinh nhật')
      expect(normalizePartyType('Báo hỷ')).toBe('Báo hỷ')
      expect(normalizePartyType('Ăn thường')).toBe('Ăn thường')
      expect(normalizePartyType('Họp mặt')).toBe('Họp mặt')
      expect(normalizePartyType('Liên hoan')).toBe('Liên hoan')
      expect(normalizePartyType('Kỉ niệm')).toBe('Kỉ niệm')
      expect(normalizePartyType('Tất niên')).toBe('Tất niên')
      expect(normalizePartyType('Tân niên')).toBe('Tân niên')
      expect(normalizePartyType('Tiệc chia tay (Farewell)')).toBe('Tiệc chia tay (Farewell)')
      expect(normalizePartyType('Thôi nôi (1st)')).toBe('Thôi nôi (1st)')
      expect(normalizePartyType('Đầy tháng')).toBe('Đầy tháng')
    })
  })

  describe('7. Decoration & Special Request Details', () => {
    it('extracts TONE TRẮNG, tông hồng, BẢNG HPBD, Gương HPBD, TRANG TRÍ HOA TƯƠI, SETUP BACKGROUND', () => {
      const decorBlock = `
        - TONE TRẮNG
        - BẢNG "HPBD Lan Thương"
        - Gương "HPBD Lan Thương"
        - TRANG TRÍ HOA TƯƠI
        - ƯU TIÊN BACKGROUND
        - CHỪA KHÔNG GIAN ĐỂ KHÁCH SETUP BACKGROUND
      `
      const details = extractDecorationDetails(decorBlock)
      expect(details.decor_color?.toUpperCase()).toContain('TRẮNG')
      expect(details.board_text).toContain('HPBD Lan Thương')
      expect(details.mirror_text).toContain('HPBD Lan Thương')
      expect(details.special_requests.some(r => /hoa tươi/i.test(r))).toBe(true)
      expect(details.special_requests.some(r => /background/i.test(r))).toBe(true)
    })
  })

  describe('8. STT Index Stripping', () => {
    it('strips 1/, 2/, 1., 2. before dish names', () => {
      const res1 = parseSingleMenuLine('1/ Cơm chiên hải sản x2')
      expect(res1?.raw_name).toBe('Cơm chiên hải sản')
      expect(res1?.quantity).toBe(2)

      const res2 = parseSingleMenuLine('2. Khoai tây chiên 5')
      expect(res2?.raw_name).toBe('Khoai tây chiên')
      expect(res2?.quantity).toBe(5)
    })
  })

  describe('9. Beverage & Trailing/Leading Quantity Formats', () => {
    it('parses leading quantities: 10 Coca, 2pepsi, 7 lon sting, 25 chai suối', () => {
      const res1 = parseSingleMenuLine('10 Coca')
      expect(res1?.raw_name).toBe('Coca')
      expect(res1?.quantity).toBe(10)

      const res2 = parseSingleMenuLine('2pepsi')
      expect(res2?.raw_name).toBe('pepsi')
      expect(res2?.quantity).toBe(2)

      const res3 = parseSingleMenuLine('7 lon sting')
      expect(res3?.raw_name).toBe('sting')
      expect(res3?.quantity).toBe(7)

      const res4 = parseSingleMenuLine('25 chai suối')
      expect(res4?.raw_name).toBe('suối')
      expect(res4?.quantity).toBe(25)
    })

    it('parses trailing quantities: Con gà cục tác lá chanh x5, Khoai tây chiên 5, Cánh gà chiên mắm tỏi -5, Sụn gà chiên mắm - 10, Cá diêu hồng nướng Hà Giang (x3)', () => {
      const res1 = parseSingleMenuLine('Con gà cục tác lá chanh x5')
      expect(res1?.raw_name).toBe('Con gà cục tác lá chanh')
      expect(res1?.quantity).toBe(5)

      const res2 = parseSingleMenuLine('Khoai tây chiên 5')
      expect(res2?.raw_name).toBe('Khoai tây chiên')
      expect(res2?.quantity).toBe(5)

      const res3 = parseSingleMenuLine('Cánh gà chiên mắm tỏi -5')
      expect(res3?.raw_name).toBe('Cánh gà chiên mắm tỏi')
      expect(res3?.quantity).toBe(5)

      const res4 = parseSingleMenuLine('Sụn gà chiên mắm - 10')
      expect(res4?.raw_name).toBe('Sụn gà chiên mắm')
      expect(res4?.quantity).toBe(10)

      const res5 = parseSingleMenuLine('Cá diêu hồng nướng Hà Giang (x3)')
      expect(res5?.raw_name).toBe('Cá diêu hồng nướng Hà Giang')
      expect(res5?.quantity).toBe(3)
    })
  })

  describe('10. Dish Bracket Protection vs Custom Notes', () => {
    const mockMenuList = [
      { id: '1', name: 'Cơm chiên cá mặn chà bông ớt hiểm (cay)', price: 145000 },
      { id: '2', name: 'Hàu nướng phô mai (5 con)', price: 125000 },
      { id: '3', name: 'Khoai tây chiên', price: 65000 }
    ]

    it('preserves official bracket (cay) and extracts custom note "(làm không cay) x4"', () => {
      const results = matchMenuItems(
        [{ raw_name: 'Cơm chiên cá mặn chà bông ớt hiểm (cay) (làm không cay) x4' }],
        10,
        mockMenuList
      )
      expect(results[0].matched_name).toBe('Cơm chiên cá mặn chà bông ớt hiểm (cay)')
      expect(results[0].quantity).toBe(4)
      expect(results[0].note).toContain('làm không cay')
      expect(results[0].match_confidence).toBeGreaterThanOrEqual(0.95)
    })

    it('preserves official bracket when note is placed after quantity: "... x4 (làm không cay)"', () => {
      const results = matchMenuItems(
        [{ raw_name: 'Cơm chiên cá mặn chà bông ớt hiểm (cay) x4 (làm không cay)' }],
        10,
        mockMenuList
      )
      expect(results[0].matched_name).toBe('Cơm chiên cá mặn chà bông ớt hiểm (cay)')
      expect(results[0].quantity).toBe(4)
      expect(results[0].note).toContain('làm không cay')
      expect(results[0].match_confidence).toBeGreaterThanOrEqual(0.95)
    })
  })
})
