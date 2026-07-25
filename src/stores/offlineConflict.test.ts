import { describe, it, expect } from 'vitest'
import { hasTimeConflict } from './useAppStore'

describe('Offline Conflict Detection Tests', () => {
  it('should detect table time overlap for bookings on same date and table', () => {
    const bookingA = { date: '20/06/2026', time: '19:00', tables: 'A1' }
    const bookingB = { date: '20/06/2026', time: '19:30', tables: 'A1' }
    
    expect(hasTimeConflict(bookingA, bookingB)).toBe(true)
  })

  it('should NOT detect conflict if dates are different', () => {
    const bookingA = { date: '20/06/2026', time: '19:00', tables: 'A1' }
    const bookingB = { date: '21/06/2026', time: '19:00', tables: 'A1' }
    
    expect(hasTimeConflict(bookingA, bookingB)).toBe(false)
  })

  it('should NOT detect conflict if tables are different', () => {
    const bookingA = { date: '20/06/2026', time: '19:00', tables: 'A1' }
    const bookingB = { date: '20/06/2026', time: '19:00', tables: 'A2' }
    
    expect(hasTimeConflict(bookingA, bookingB)).toBe(false)
  })

  it('should NOT detect conflict if times are far apart (beyond buffer)', () => {
    const bookingA = { date: '20/06/2026', time: '17:00', tables: 'A1' }
    const bookingB = { date: '20/06/2026', time: '20:00', tables: 'A1' }
    
    expect(hasTimeConflict(bookingA, bookingB, { bufferMinutes: 120 })).toBe(false)
  })
})
