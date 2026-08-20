import { describe, it, expect } from 'vitest'
import {
  checkTableOverlap,
  checkCapacityLimit,
  detectBookingRisks
} from '../conflictEngine'

describe('Conflict & Risk Engine Tests', () => {
  it('should detect table overlap when 2 bookings share table within buffer window', () => {
    const bookingA = {
      id: 'bk_1',
      customer: { name: 'Khách A' },
      date: '25/08/2026',
      time: '18:30',
      tables: 'A1',
      status: 'confirmed'
    }

    const bookingB = {
      id: 'bk_2',
      customer: { name: 'Khách B' },
      date: '25/08/2026',
      time: '19:00',
      tables: 'A1, A2',
      status: 'confirmed'
    }

    const issues = checkTableOverlap(bookingB, [bookingA])
    expect(issues.length).toBe(1)
    expect(issues[0].code).toBe('TABLE_OVERLAP')
    expect(issues[0].severity).toBe('CRITICAL')
    expect(issues[0].message).toContain('A1')
  })

  it('should NOT detect overlap when times are far apart', () => {
    const bookingA = {
      id: 'bk_1',
      customer: { name: 'Khách A' },
      date: '25/08/2026',
      time: '12:00',
      tables: 'A1',
      status: 'confirmed'
    }

    const bookingB = {
      id: 'bk_2',
      customer: { name: 'Khách B' },
      date: '25/08/2026',
      time: '18:00',
      tables: 'A1',
      status: 'confirmed'
    }

    const issues = checkTableOverlap(bookingB, [bookingA])
    expect(issues.length).toBe(0)
  })

  it('should detect capacity limit exceeded', () => {
    const booking = {
      id: 'bk_large',
      guest_count: 20,
      tables: 'A1' // Max capacity is 4
    }

    const issues = checkCapacityLimit(booking)
    expect(issues.length).toBe(1)
    expect(issues[0].code).toBe('CAPACITY_EXCEEDED')
    expect(issues[0].severity).toBe('HIGH')
  })

  it('should detect missing deposit and missing table in detectBookingRisks', () => {
    const booking = {
      id: 'bk_test',
      customer: { name: 'Chị Hoa' },
      date: '25/08/2026',
      time: '19:00',
      guest_count: 12,
      tables: '', // Missing table
      deposit: { amount: 0, status: 'chờ cọc' }, // Missing deposit for 12 guests
      party: { type: 'Sinh nhật' } // Missing decor details
    }

    const issues = detectBookingRisks(booking)
    expect(issues.some(i => i.code === 'UNASSIGNED_TABLE')).toBe(true)
    expect(issues.some(i => i.code === 'MISSING_DEPOSIT')).toBe(true)
    expect(issues.some(i => i.code === 'DECOR_DETAILS_MISSING')).toBe(true)
  })
})
