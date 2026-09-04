import { describe, it, expect } from 'vitest'
import { cleanCustomerName } from '@/domain/booking/bookingNormalizer'
import { extractByRules } from '@/domain/ai/ruleEngine'

describe('Customer Name & Decor Tone Fixes', () => {
  it('should clean single letter abbreviation prefixes like C, c, C., a, A., C2 from customer names', () => {
    expect(cleanCustomerName('C Hồng Nhung')).toBe('Hồng Nhung')
    expect(cleanCustomerName('c Hồng Nhung')).toBe('Hồng Nhung')
    expect(cleanCustomerName('C. Hồng Nhung')).toBe('Hồng Nhung')
    expect(cleanCustomerName('C2 Hồng Nhung')).toBe('Hồng Nhung')
    expect(cleanCustomerName('A Tuấn')).toBe('Tuấn')
    expect(cleanCustomerName('a Tuấn')).toBe('Tuấn')
    expect(cleanCustomerName('A. Tuấn')).toBe('Tuấn')
  })

  it('should extract customer name, table C2 and decor tone from the user sample message', () => {
    const raw = `C2\tHồng Nhung
\t3ng - 19h30
\t0369695285
\tSinh nhật
\tNhận: DMT
\t"TONE TRẮNG
CÓ MÓN - ĐỢI CỌC 500K
1. Gỏi tôm thịt hoa chuối (x1)
2. Cơm chiên hải sản (x1)
3. Chả giò bát bửu (x1)
4. Sụn gà chiên mắm tỏi (x1)
5. Tôm Cocktail (5 con) (x1)"`

    const ruleRes = extractByRules(raw)
    expect(ruleRes.customer_name).toBe('Hồng Nhung')
    expect(ruleRes.table_code).toBe('C2')
    expect(ruleRes.phone).toBe('0369695285')
    expect(ruleRes.guest_count).toBe(3)
    expect(ruleRes.event_time).toBe('19:30')
    expect(ruleRes.booking_need).toBe('Sinh nhật')
    expect(ruleRes.deposit_amount).toBe(500000)
    expect(ruleRes.decoration_details.decor_color).toMatch(/trắng/i)
  })

  it('should extract multi-item decor (tông trắng, tone trắng, hoa tươi, background trắng, bóng bay) into note and NOT into menu_items', () => {
    const raw = `C2 Hồng Nhung 0901234567 19h 4 khách
Tông trắng, tone trắng, hoa tươi, background trắng, bóng bay, ....
Nhận: DMT`

    const ruleRes = extractByRules(raw)
    expect(ruleRes.customer_name).toBe('Hồng Nhung')
    expect(ruleRes.table_code).toBe('C2')
    expect(ruleRes.phone).toBe('0901234567')
    expect(ruleRes.guest_count).toBe(4)
    expect(ruleRes.event_time).toBe('19:00')
    expect(ruleRes.receiver).toBe('DMT')

    // Decor verification
    expect(ruleRes.decoration_details.decor_color).toMatch(/trắng/i)
    expect(ruleRes.decoration_details.special_requests.some(r => /hoa\s*tươi/i.test(r))).toBe(true)
    expect(ruleRes.decoration_details.special_requests.some(r => /background/i.test(r))).toBe(true)
    expect(ruleRes.decoration_details.special_requests.some(r => /bóng\s*bay/i.test(r))).toBe(true)

    // Critical: NO menu items should be created from customer name, receiver, or decor!
    expect(ruleRes.menu_items).toEqual([])
  })

  it('should handle customer names without dishes and not mistake them for new dishes', () => {
    const raw = `Bàn A5 Anh Tuấn 0912345678 18h30 6 người
Trang trí: Hoa tươi, bóng bay
Đã cọc 500k`

    const ruleRes = extractByRules(raw)
    expect(ruleRes.customer_name).toBe('Tuấn')
    expect(ruleRes.table_code).toBe('A5')
    expect(ruleRes.phone).toBe('0912345678')
    expect(ruleRes.guest_count).toBe(6)
    expect(ruleRes.event_time).toBe('18:30')
    expect(ruleRes.deposit_amount).toBe(500000)
    expect(ruleRes.menu_items).toEqual([])
    expect(ruleRes.decoration_details.special_requests.some(r => /hoa\s*tươi/i.test(r))).toBe(true)
    expect(ruleRes.decoration_details.special_requests.some(r => /bóng\s*bay/i.test(r))).toBe(true)
  })

  it('should accurately separate decor, customer name, and real food dishes', () => {
    const raw = `C2 Hồng Nhung 0901234567 19h 4 khách
Tông trắng, tone trắng, hoa tươi, background trắng, bóng bay
Món:
1. Bò nướng tảng x1
2. Cơm chiên dưa bò 2 đĩa
Nhận: DMT`

    const ruleRes = extractByRules(raw)
    expect(ruleRes.customer_name).toBe('Hồng Nhung')
    expect(ruleRes.menu_items.length).toBe(2)
    expect(ruleRes.menu_items[0].raw_name).toMatch(/Bò nướng tảng/i)
    expect(ruleRes.menu_items[1].raw_name).toMatch(/Cơm chiên dưa bò/i)
    // Decor should be in decoration_details, not menu_items
    expect(ruleRes.menu_items.some(m => /trắng|hoa tươi|bóng bay|DMT/i.test(m.raw_name))).toBe(false)
  })
})
