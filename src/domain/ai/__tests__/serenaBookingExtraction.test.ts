import { describe, it, expect } from 'vitest'
import { cleanCustomerName, repairAndNormalizeJSON } from '@/domain/booking/bookingNormalizer'
import { extractByRules } from '@/domain/ai/ruleEngine'
import { scoreAndMatchMenu } from '@/domain/menu/menuMatcher'

describe('Serena Party Booking Extraction Tests', () => {
  const sampleText = `▶ Thông tin tiệc:
⠀● Khách hàng: Serena
⠀● SĐT: 0986945194
⠀● Thời gian: 18:30 – Ngày 22/08/2026
⠀● Số lượng: 10 người lớn + 1 ghế trẻ em (đang sắp xếp)
⠀● Thực đơn: Set Menu 6 (Giảm 10% tiền thức ăn)
⠀● Khu vực: Phòng lạnh dùng chung (đang kiểm tra)
⠀● Trang trí: Setup mặt bàn miễn phí (Trắng-Hồng-Xanh)
⠀● Ghi chú: Không cay, ít ngọt
⠀---------------------------------`

  it('should extract customer name Serena correctly (not "hàng")', () => {
    expect(cleanCustomerName('Khách hàng: Serena')).toBe('Serena')
    expect(cleanCustomerName('Serena')).toBe('Serena')
    
    const ruleRes = extractByRules(sampleText)
    expect(ruleRes.customer_name).toBe('Serena')
    expect(ruleRes.phone).toBe('0986945194')
    expect(ruleRes.event_time).toBe('18:30')
    expect(ruleRes.event_date).toBe('22/08/2026')
    expect(ruleRes.guest_count).toBe(10)
  })

  it('should match Set Menu 6 correctly when given discount note in parentheses', () => {
    const mockMenuList = [
      { id: '1', name: 'SET MENU 1', price: 2500000 },
      { id: '2', name: 'SET MENU 2', price: 2800000 },
      { id: '3', name: 'SET MENU 3', price: 3200000 },
      { id: '4', name: 'SET MENU 4', price: 3500000 },
      { id: '5', name: 'SET MENU 5', price: 3900000 },
      { id: '6', name: 'SET MENU 6', price: 4500000 }
    ]

    const matchRes = scoreAndMatchMenu('Set Menu 6 (Giảm 10% tiền thức ăn)', 10, mockMenuList)
    expect(matchRes.match).toBeDefined()
    expect(matchRes.match?.name).toBe('SET MENU 6')
  })

  it('should capture decor and special notes properly into normalized output', () => {
    const ruleRes = extractByRules(sampleText)
    expect(ruleRes.decoration_details.decor_color || ruleRes.decoration_details.special_requests.join(' ')).toMatch(/Trắng-Hồng-Xanh|Setup mặt bàn/i)

    const rawAiResult = {
      customer: { name: 'Serena', phone: '0986945194' },
      booking: { guest_count: 10, event_date: '22/08/2026', event_time: '18:30', tables: 'Phòng lạnh' },
      menu_items: [{ name: 'Set Menu 6', quantity: 1, note: 'Giảm 10% tiền thức ăn' }],
      party: { type: 'Liên hoan', decor_color: 'Trắng-Hồng-Xanh', special_request: 'Setup mặt bàn miễn phí (Trắng-Hồng-Xanh)' },
      note: 'Không cay, ít ngọt; 1 ghế trẻ em (đang sắp xếp)'
    }

    const normalized = repairAndNormalizeJSON(rawAiResult)
    expect(normalized.customer.name).toBe('Serena')
    expect(normalized.booking.event_date).toBe('22/08/2026')
    expect(normalized.booking.event_time).toBe('18:30')
    expect(normalized.booking.guest_count).toBe(10)
    expect(normalized.note).toContain('Tông màu trang trí: Trắng-Hồng-Xanh')
    expect(normalized.note).toContain('Không cay, ít ngọt')
  })
})
