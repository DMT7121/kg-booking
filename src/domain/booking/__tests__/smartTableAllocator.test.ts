import { describe, it, expect } from 'vitest'
import { allocateSmartTables } from '../smartTableAllocator'

describe('Smart Table Allocator Unit Tests', () => {
  it('should allocate 1 table in preferred zone A for small party (4 pax)', () => {
    const res = allocateSmartTables({
      guestCount: 4,
      preferredZone: 'A',
      bookingTime: '18:00',
      existingBookings: []
    })

    expect(res.recommendedTables).toEqual(['A1'])
    expect(res.zone).toBe('A')
    expect(res.score).toBe(0.98)
    expect(res.reason).toContain('Khu A')
  })

  it('should allocate 2 tables for 10 guests (capacity 6 per table)', () => {
    const res = allocateSmartTables({
      guestCount: 10,
      preferredZone: 'A',
      bookingTime: '19:00',
      existingBookings: []
    })

    expect(res.recommendedTables).toHaveLength(2)
    expect(res.recommendedTables).toEqual(['A1', 'A2'])
    expect(res.zone).toBe('A')
  })

  it('should skip occupied tables within 90-minute buffer window', () => {
    const existingBookings = [
      {
        tables: ['A1', 'A2'],
        bookingTime: '18:30',
        status: 'confirmed'
      }
    ]

    const res = allocateSmartTables({
      guestCount: 6,
      preferredZone: 'A',
      bookingTime: '19:00', // within 30 min diff (<90 min)
      existingBookings
    })

    // A1 and A2 are occupied, so should allocate A3
    expect(res.recommendedTables).toEqual(['A3'])
    expect(res.zone).toBe('A')
  })

  it('should allow booking table if existing booking is outside 90-minute window', () => {
    const existingBookings = [
      {
        tables: ['A1'],
        bookingTime: '12:00', // 6 hours difference (>90 min)
        status: 'confirmed'
      }
    ]

    const res = allocateSmartTables({
      guestCount: 4,
      preferredZone: 'A',
      bookingTime: '18:00',
      existingBookings
    })

    expect(res.recommendedTables).toEqual(['A1'])
  })

  it('should ignore cancelled bookings when checking occupied tables', () => {
    const existingBookings = [
      {
        tables: ['A1'],
        bookingTime: '18:00',
        status: 'cancelled'
      }
    ]

    const res = allocateSmartTables({
      guestCount: 4,
      preferredZone: 'A',
      bookingTime: '18:00',
      existingBookings
    })

    expect(res.recommendedTables).toEqual(['A1'])
  })

  it('should shift to secondary zone B if preferred zone A is full', () => {
    // Fill zone A (A1 through A10)
    const existingBookings = [
      {
        tables: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10'],
        bookingTime: '18:00',
        status: 'confirmed'
      }
    ]

    const res = allocateSmartTables({
      guestCount: 6,
      preferredZone: 'A',
      bookingTime: '18:15',
      existingBookings
    })

    expect(res.zone).toBe('B')
    expect(res.recommendedTables).toEqual(['B1'])
    expect(res.score).toBe(0.85)
  })
})
