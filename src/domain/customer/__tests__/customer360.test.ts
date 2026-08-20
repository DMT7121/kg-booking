import { describe, it, expect } from 'vitest'
import { aggregateCustomer360Profile } from '../customer360'

describe('Customer 360 Aggregation Engine Tests', () => {
  it('should aggregate history, spend and rank customer as VIP', () => {
    const bookings = [
      {
        customer: { name: 'Anh Hùng', phone: '0901234567' },
        booking: { table_number: 'VIP01', event_date: '10/06/2026' },
        total_amount: 12000000,
        status: 'completed',
        menu_items: [{ name: 'Lẩu Riêu Cua', quantity: 2 }]
      },
      {
        customer: { name: 'Anh Hùng', phone: '0901234567' },
        booking: { table_number: 'VIP01', event_date: '15/07/2026' },
        total_amount: 20000000,
        status: 'completed',
        menu_items: [{ name: 'Hàu nướng phô mai', quantity: 4 }]
      }
    ]

    const profile = aggregateCustomer360Profile('0901234567', bookings)
    expect(profile.phone).toBe('0901234567')
    expect(profile.name).toBe('Anh Hùng')
    expect(profile.totalBookings).toBe(2)
    expect(profile.completedBookings).toBe(2)
    expect(profile.lifetimeValue).toBe(32000000)
    expect(profile.tier).toBe('VIP')
    expect(profile.favoriteTables[0].name).toBe('VIP01')
  })

  it('should handle customer with cancelled bookings', () => {
    const bookings = [
      { customer: { phone: '0988888888' }, status: 'hủy' },
      { customer: { phone: '0988888888' }, status: 'cancelled' },
      { customer: { phone: '0988888888' }, status: 'hủy' }
    ]

    const profile = aggregateCustomer360Profile('0988888888', bookings)
    expect(profile.cancelledBookings).toBe(3)
    expect(profile.tags).toContain('Hay Hủy Bàn')
  })
})
