import { describe, it, expect } from 'vitest'
import { 
  hasTimeConflict, 
  hasTimeConflictIndexed, 
  rebuildBookingTimeIndex, 
  addOrderToTimeIndex, 
  removeOrderFromTimeIndex, 
  updateOrderInTimeIndex,
  HistoryOrder 
} from './useAppStore'

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

describe('Incremental Booking Indexing Tests', () => {
  const order1: HistoryOrder = {
    id: 'ord-1',
    timestamp: new Date().toISOString(),
    parsedCustomer: {
      name: 'Nguyen Van A',
      phone: '0901234567',
      date: '25/07/2026',
      time: '18:00',
      tables: 'A1, A2',
      type: 'Ăn tối'
    },
    menuItems: [],
    totalAmount: 500000,
    depositAmount: 100000,
    isDeposited: true
  }

  const order2: HistoryOrder = {
    id: 'ord-2',
    timestamp: new Date().toISOString(),
    parsedCustomer: {
      name: 'Tran Thi B',
      phone: '0987654321',
      date: '25/07/2026',
      time: '18:30',
      tables: 'A2',
      type: 'Ăn tối'
    },
    menuItems: [],
    totalAmount: 300000,
    depositAmount: 0,
    isDeposited: false
  }

  it('should incrementally add orders and detect time overlap correctly', () => {
    rebuildBookingTimeIndex([])
    
    addOrderToTimeIndex(order1)
    
    // Order 2 conflicts with Order 1 on Table A2 at 18:30 vs 18:00
    const conflictFound = hasTimeConflictIndexed({
      id: 'ord-2',
      date: '25/07/2026',
      time: '18:30',
      tables: 'A2',
      phone: '0987654321'
    })
    expect(conflictFound).toBe(true)
  })

  it('should remove order from index incrementally', () => {
    rebuildBookingTimeIndex([order1, order2])
    
    removeOrderFromTimeIndex('ord-1')
    
    // After removing order1, order2 should no longer conflict
    const conflictFound = hasTimeConflictIndexed({
      id: 'ord-2',
      date: '25/07/2026',
      time: '18:30',
      tables: 'A1',
      phone: '0987654321'
    })
    expect(conflictFound).toBe(false)
  })

  it('should update order incrementally when table/time changes', () => {
    rebuildBookingTimeIndex([order1])
    
    const updatedOrder1: HistoryOrder = {
      ...order1,
      parsedCustomer: {
        ...order1.parsedCustomer,
        tables: 'B1' // moved from A1, A2 to B1
      }
    }
    
    updateOrderInTimeIndex(updatedOrder1)
    
    // New booking on A2 at 18:00 should no longer conflict since order1 moved to B1
    const conflictFound = hasTimeConflictIndexed({
      id: 'new-ord',
      date: '25/07/2026',
      time: '18:00',
      tables: 'A2',
      phone: '0911223344'
    })
    expect(conflictFound).toBe(false)
  })
})

