import { describe, it, expect } from 'vitest'
import { buildBEOFromBooking, transitionBEOStatus } from '../beoEngine'

describe('Party / BEO Engine Tests', () => {
  it('should build a valid BEO from booking object', () => {
    const booking = {
      id: 'bk_100',
      customer: { name: 'Chị Lan', phone: '0909123456' },
      booking: { event_date: '28/08/2026', event_time: '18:30', guest_count: 20, table_number: 'VIP01' },
      party: {
        type: 'Sinh nhật',
        owner_name: 'Bé Su',
        decor_color: 'Hồng pastel',
        displayBoardText: 'Chúc Mừng Sinh Nhật Bé Su 3 Tuổi',
        fresh_flowers: 'Hoa tươi tone hồng trên bàn chính'
      },
      menu_items: [
        { name: '5 con hàu nướng phô mai', quantity: 2, unit_price: 150000 },
        { name: 'Lẩu Riêu Cua Bắp Bò', quantity: 1, unit_price: 350000 }
      ],
      deposit: { amount: 1000000, status: 'đã cọc' }
    }

    const beo = buildBEOFromBooking(booking)
    expect(beo.id).toBeDefined()
    expect(beo.version).toBe(1)
    expect(beo.status).toBe('DRAFT')
    expect(beo.general.partyOwnerName).toBe('Bé Su')
    expect(beo.decoration.freshFlowers).toContain('Hoa tươi')
    expect(beo.menu.items.length).toBe(2)
  })

  it('should flag update highlights when BEO is modified after distribution', () => {
    const originalBooking = {
      id: 'bk_200',
      booking: { guest_count: 10, event_time: '19:00' },
      menu_items: [{ name: 'Món 1', quantity: 1 }]
    }
    const initialBEO = buildBEOFromBooking(originalBooking)
    const distributedBEO = transitionBEOStatus(initialBEO, 'DISTRIBUTED')

    const modifiedBooking = {
      id: 'bk_200',
      booking: { guest_count: 15, event_time: '19:00' }, // Guest increased
      menu_items: [{ name: 'Món 1', quantity: 2 }] // Menu quantity increased
    }

    const updatedBEO = buildBEOFromBooking(modifiedBooking, distributedBEO)
    expect(updatedBEO.version).toBe(2)
    expect(updatedBEO.isUpdatedAfterDistribution).toBe(true)
    expect(updatedBEO.updateHighlights?.length).toBeGreaterThan(0)
  })
})
