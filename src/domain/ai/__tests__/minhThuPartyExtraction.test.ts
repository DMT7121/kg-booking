import { describe, it, expect } from 'vitest'
import { extractByRules, extractHardEntities, preNormalizeInput, segmentInputBlocksCompat } from '../ruleEngine'
import { cleanCustomerName, repairAndNormalizeJSON, crossValidateResults } from '../../booking/bookingNormalizer'

describe('Test User Prompt Directly', () => {
  const input = `✔ Tên khách/chủ tiệc: minh thư______
  ✔ Số điện thoại:0939621735
  ✔ Ngày và giờ tổ chức tiệc: 17/09 - 20h 
  ✔ Số lượng khách:
    ↳ Người lớn:25ng 
    ↳ Trẻ em (nếu có): ______
  ✔ Nhu cầu tiệc (Sinh nhật, liên hoan, họp mặt...): sinh nhật 

Cá chim chiên giòn sốt mắm chanh 
Tôm cocktail (10con)
Lẩu gà nấm shitake 
Cơm chuyên hải sản 
Thịt heo nướng xiêng 

Mỗi cái 4 phần nha anh`

  it('checks ruleEngine extraction and normalizer', () => {
    const norm = preNormalizeInput(input)
    const blocks = segmentInputBlocksCompat(norm)
    const ruleRes = extractByRules(input)

    expect(ruleRes.customer_name).toBe('minh thư')
    expect(ruleRes.phone).toBe('0939621735')
    expect(ruleRes.event_date).toBe('17/09/2026')
    expect(ruleRes.event_time).toBe('20:00')
    expect(ruleRes.guest_count).toBe(25)
    expect(ruleRes.booking_need).toBe('Sinh nhật')
    expect(ruleRes.party.owner_name).toBeNull()
    expect(ruleRes.note).toBe('Mỗi cái 4 phần nha anh')
    expect(ruleRes.menu_items).toHaveLength(5)
    ruleRes.menu_items.forEach((item: any) => {
      expect(item.quantity).toBe(4)
    })

    const hardEntities = extractHardEntities(input)
    const normalizedAi = repairAndNormalizeJSON({
      customer: { name: 'minh thư', phone: '0939621735' },
      booking: { event_date: '17/09/2026', event_time: '20:00', guest_count: 25, need: 'Sinh nhật' },
      menu_items: ruleRes.menu_items.map((m: any) => ({
        raw_name: m.raw_name,
        matched_name: m.raw_name,
        quantity: m.quantity
      })),
      note: 'Mỗi cái 4 phần nha anh'
    })

    const { result: crossValidated } = crossValidateResults(normalizedAi, ruleRes, hardEntities)
    expect(crossValidated.customer.name).toBe('minh thư')
    expect(crossValidated.customer.phone).toBe('0939621735')
    expect(crossValidated.booking.event_date).toBe('17/09/2026')
    expect(crossValidated.booking.event_time).toBe('20:00')
    expect(crossValidated.booking.guest_count).toBe(25)
    expect(crossValidated.party.owner_name).toBeFalsy()
    expect(crossValidated.menu_items).toHaveLength(5)
    crossValidated.menu_items.forEach((item: any) => {
      expect(item.quantity).toBe(4)
    })
  })
})
