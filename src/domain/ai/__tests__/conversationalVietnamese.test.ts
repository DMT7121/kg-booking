import { describe, it, expect } from 'vitest'
import { extractByRules, resolveDistributiveQuantifiers, preNormalizeInput } from '@/domain/ai/ruleEngine'
import { cleanCustomerName } from '@/domain/booking/bookingNormalizer'

describe('Conversational Vietnamese AI Extraction Tests', () => {
  it('should extract names from various conversational chat prefaces and formats', () => {
    // Conversational prefaces
    expect(cleanCustomerName('Em ơi cho anh đặt bàn tên Tuấn')).toBe('Tuấn')
    expect(cleanCustomerName('Khách: Ánh Tiên')).toBe('Ánh Tiên')
    expect(cleanCustomerName('Serena đặt bàn')).toBe('Serena')
    expect(cleanCustomerName('Mr. David')).toBe('David')
    expect(cleanCustomerName('Đặt bàn cho chị Thảo')).toBe('Thảo')
  })

  it('should handle distributive quantifiers (e.g. "mỗi món 2 phần")', () => {
    const rawText = `Thực đơn:
1. Gỏi bò bóp thấu
2. Cơm chiên hải sản
3. Sườn nướng sốt cay
4. Lẩu thái hải sản
Mỗi món 2 phần, riêng lẩu 1 phần`

    const ruleRes = extractByRules(rawText)
    expect(ruleRes.menu_items.length).toBe(4)
    
    const goi = ruleRes.menu_items.find(i => i.raw_name.includes('Gỏi'))
    const com = ruleRes.menu_items.find(i => i.raw_name.includes('Cơm'))
    const suon = ruleRes.menu_items.find(i => i.raw_name.includes('Sườn'))
    const lau = ruleRes.menu_items.find(i => i.raw_name.includes('Lẩu'))

    expect(goi?.quantity).toBe(2)
    expect(com?.quantity).toBe(2)
    expect(suon?.quantity).toBe(2)
    expect(lau?.quantity).toBe(1)
  })

  it('should handle head N items modifier (e.g. "2 món đầu mỗi món 2 phần")', () => {
    const items = [
      { raw_name: 'Bò tơ nướng', quantity: 1 },
      { raw_name: 'Dê hấp tía tô', quantity: 1 },
      { raw_name: 'Cơm chiên', quantity: 1 }
    ]
    const resolved = resolveDistributiveQuantifiers(items, '2 món đầu mỗi món 2 phần')
    expect(resolved[0].quantity).toBe(2)
    expect(resolved[1].quantity).toBe(2)
    expect(resolved[2].quantity).toBe(1)
  })

  it('should parse complex chat with taste and decor instructions seamlessly', () => {
    const chat = `Chào King Grill, mình muốn book bàn:
- Khách: Serena
- SĐT: 0986945194
- Ngày mai lúc 19h
- 8 người lớn + 2 trẻ em
- Món: Gỏi tôm hoa chuối, Sụn gà chiên mắm, Lẩu cua đồng (mỗi món 2 phần)
- Dặn dò: Không cay, ít ngọt, nhiều đá. Bàn gần sân khấu`

    const res = extractByRules(chat)
    expect(res.customer_name).toBe('Serena')
    expect(res.phone).toBe('0986945194')
    expect(res.event_time).toBe('19:00')
    expect(res.guest_count).toBe(10)
    expect(res.menu_items.length).toBe(3)
    expect(res.menu_items[0].quantity).toBe(2)
    expect(res.menu_items[1].quantity).toBe(2)
    expect(res.menu_items[2].quantity).toBe(2)
  })
})
