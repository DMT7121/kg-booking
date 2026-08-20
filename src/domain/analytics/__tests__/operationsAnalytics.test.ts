import { describe, it, expect } from 'vitest'
import { calculateDailyOperationsKPI, calculateOperationsTrends } from '../operationsAnalytics'

describe('Operations Analytics Engine Tests', () => {
  const sampleBookings = [
    {
      id: '1',
      date: '20/08/2026',
      time: '18:30',
      guest_count: 10,
      tables: 'VIP01',
      deposit_amount: 500000,
      deposit_status: 'đã cọc',
      total_amount: 3500000,
      status: 'confirmed',
      menu_items: [{ name: 'Lẩu Riêu Cua', quantity: 2, unit_price: 350000 }]
    },
    {
      id: '2',
      date: '20/08/2026',
      time: '19:00',
      guest_count: 4,
      tables: 'A1',
      deposit_amount: 0,
      deposit_status: 'chờ cọc',
      total_amount: 1200000,
      status: 'confirmed',
      menu_items: [{ name: 'Hàu nướng phô mai', quantity: 2, unit_price: 150000 }]
    },
    {
      id: '3',
      date: '20/08/2026',
      time: '19:30',
      guest_count: 6,
      status: 'cancelled'
    }
  ]

  it('should calculate daily operations KPI accurately', () => {
    const kpi = calculateDailyOperationsKPI('20/08/2026', sampleBookings, 20)
    expect(kpi.totalBookings).toBe(3)
    expect(kpi.totalGuests).toBe(14) // 10 + 4 (cancelled excluded from guests)
    expect(kpi.projectedRevenue).toBe(4700000)
    expect(kpi.depositReceived).toBe(500000)
    expect(kpi.cancelledBookingsCount).toBe(1)
  })

  it('should calculate trend metrics and identify top dishes and peak hours', () => {
    const trends = calculateOperationsTrends(sampleBookings)
    expect(trends.totalPeriodBookings).toBe(3)
    expect(trends.cancellationRate).toBe(33)
    expect(trends.topDishes.length).toBeGreaterThan(0)
    expect(trends.peakArrivalHours.length).toBeGreaterThan(0)
  })
})
