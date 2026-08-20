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
})
