import { describe, it, expect } from 'vitest'
import { calculateCompositeStatus } from '../statusCalculator'

describe('Composite Status Calculator Tests', () => {
  it('should return READY when all domain criteria are met', () => {
    const booking = {
      customer: { name: 'Anh Nam', phone: '0901234567' },
      booking: { date: '25/08/2026', time: '19:00', guest_count: 4, table_number: 'VIP01' },
      deposit: { amount: 500000, status: 'đã cọc' },
      menu_items: [{ name: 'Lẩu Riêu Cua', quantity: 1 }],
      status: 'confirmed'
    }

    const summary = calculateCompositeStatus(booking)
    expect(summary.derived).toBe('READY')
    expect(summary.booking).toBe('CONFIRMED')
    expect(summary.deposit).toBe('PAID')
    expect(summary.table).toBe('ASSIGNED')
    expect(summary.menu).toBe('CONFIRMED')
    expect(summary.attentionReasons.length).toBe(0)
  })

  it('should return NEEDS_ATTENTION when large party lacks deposit or table', () => {
    const booking = {
      customer: { name: 'Chị Mai', phone: '0912345678' },
      booking: { date: '25/08/2026', time: '19:00', guest_count: 15 }, // No table, 15 guests
      deposit: { amount: 0, status: 'chờ cọc' },
      party: { type: 'Sinh nhật' }, // Missing board/color
      status: 'confirmed'
    }

    const summary = calculateCompositeStatus(booking)
    expect(summary.derived).toBe('NEEDS_ATTENTION')
    expect(summary.table).toBe('UNASSIGNED')
    expect(summary.deposit).toBe('UNPAID')
    expect(summary.decor).toBe('PENDING_DETAILS')
    expect(summary.attentionReasons.length).toBeGreaterThan(0)
  })

  it('should return BLOCKED when critical conflict exists', () => {
    const booking = {
      customer: { name: 'Anh Tuấn', phone: '0988888888' },
      booking: { date: '25/08/2026', time: '19:00', guest_count: 6, table_number: 'A1' },
      status: 'confirmed'
    }

    const summary = calculateCompositeStatus(booking, {
      hasCriticalConflict: true,
      conflictReasons: ['Bàn A1 bị trùng giờ với đơn đặt 18:30 của khách Chị Lan']
    })

    expect(summary.derived).toBe('BLOCKED')
    expect(summary.blockingReasons.length).toBe(1)
  })

  it('should return CANCELLED when booking status is cancelled', () => {
    const booking = {
      customer: { name: 'Anh Tuấn', phone: '0988888888' },
      status: 'hủy'
    }
    const summary = calculateCompositeStatus(booking)
    expect(summary.derived).toBe('CANCELLED')
    expect(summary.booking).toBe('CANCELLED')
  })
})
