import { describe, it, expect } from 'vitest'
import { extractByRules, preNormalizeInput, segmentInputBlocksCompat, parseSingleMenuLine } from '../ruleEngine'
import { crossValidateResults, buildPartyNote } from '../../booking/bookingNormalizer'

describe('Phuong Nhung Booking Extraction & Unicode/Bullet Tests', () => {
  const phuongNhungText = `● Khách hàng: Chị Phương Nhung
⠀● SĐT: 0977574916
⠀● Thời gian: 18:00 - Thứ 7 (22/08)
⠀● Số lượng: 12 - 15 khách
⠀● Loại tiệc: Sinh nhật 2 bé trai (Trần An - Trần Khang)
⠀● Trang trí: Setup mặt bàn miễn phí (Tông xanh dương)

● Gánh gánh gồng gồng × 2 phần
⠀● Gỏi bò hoa chuối × 2 phần
⠀● Bò cuộn phô mai nướng × 2 phần
⠀● Gà nướng × 1 phần
⠀● Giò heo muối hoa tiêu × 1 phần
⠀● Cá chim om chanh × 1 phần
⠀● Cơm chiên cá mặn × 2 phần
⠀● Hàu nướng phô mai × 6 con
⠀● Rau luộc kho quẹt × 1 phần`

  it('should extract all fields, all 9 dishes, correct quantities, and party note for Phuong Nhung input', () => {
    const res = extractByRules(phuongNhungText)

    expect(res.customer_name).toBe('Phương Nhung')
    expect(res.phone).toBe('0977574916')
    expect(res.event_time).toBe('18:00')
    expect(res.event_date).toContain('22/08')
    expect(res.guest_count).toBe(15)
    expect(res.booking_need).toBe('Sinh nhật')

    // Must extract all 9 dishes
    expect(res.menu_items.length).toBe(9)
    
    // Check specific items and quantities
    const golo = res.menu_items.find(i => i.raw_name.includes('Gánh gánh gồng gồng'))
    expect(golo).toBeDefined()
    expect(golo?.quantity).toBe(2)

    const goiBo = res.menu_items.find(i => i.raw_name.includes('Gỏi bò hoa chuối'))
    expect(goiBo).toBeDefined()
    expect(goiBo?.quantity).toBe(2)

    const boCuon = res.menu_items.find(i => i.raw_name.includes('Bò cuộn phô mai'))
    expect(boCuon).toBeDefined()
    expect(boCuon?.quantity).toBe(2)

    const gaNuong = res.menu_items.find(i => i.raw_name.includes('Gà nướng'))
    expect(gaNuong).toBeDefined()
    expect(gaNuong?.quantity).toBe(1)

    const gioHeo = res.menu_items.find(i => i.raw_name.includes('Giò heo muối hoa tiêu'))
    expect(gioHeo).toBeDefined()
    expect(gioHeo?.quantity).toBe(1)

    const caChim = res.menu_items.find(i => i.raw_name.includes('Cá chim om chanh'))
    expect(caChim).toBeDefined()
    expect(caChim?.quantity).toBe(1)

    const comChien = res.menu_items.find(i => i.raw_name.includes('Cơm chiên cá mặn'))
    expect(comChien).toBeDefined()
    expect(comChien?.quantity).toBe(2)

    const hauNuong = res.menu_items.find(i => i.raw_name.includes('Hàu nướng phô mai'))
    expect(hauNuong).toBeDefined()
    expect(hauNuong?.quantity).toBe(6)

    const rauLuoc = res.menu_items.find(i => i.raw_name.includes('Rau luộc kho quẹt'))
    expect(rauLuoc).toBeDefined()
    expect(rauLuoc?.quantity).toBe(1)

    // Check party owner & decor details
    expect(res.party).toBeDefined()
    expect(res.party?.owner_name).toContain('Trần An')
    expect(res.party?.owner_name).toContain('Trần Khang')
    expect(res.decoration_details?.decor_color).toContain('xanh dương')
  })

  it('should format full party note with owner names and decor instructions', () => {
    const res = extractByRules(phuongNhungText)
    const formattedNote = buildPartyNote(res.party, '')

    expect(formattedNote).toContain('Trần An')
    expect(formattedNote).toContain('Trần Khang')
    expect(formattedNote).toContain('Tông màu trang trí:')
    expect(formattedNote).toContain('xanh dương')
  })
})
