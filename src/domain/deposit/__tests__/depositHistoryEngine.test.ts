import { describe, it, expect } from 'vitest'
import { formatShortVND, formatCurrentDepositTime, formatTimestampToDepositTime } from '@/utils'
import type { DepositHistoryEntry } from '@/stores/useFormStore'

describe('Deposit History & Installments Tracking Tests', () => {
  describe('formatShortVND', () => {
    it('formats millions with TR suffix and comma for decimals', () => {
      expect(formatShortVND(1000000)).toBe('+1TR')
      expect(formatShortVND(1500000)).toBe('+1,5TR')
      expect(formatShortVND(2000000)).toBe('+2TR')
      expect(formatShortVND(2500000)).toBe('+2,5TR')
    })

    it('formats thousands with K suffix', () => {
      expect(formatShortVND(500000)).toBe('+500K')
      expect(formatShortVND(200000)).toBe('+200K')
      expect(formatShortVND(50000)).toBe('+50K')
    })

    it('formats negative deltas correctly', () => {
      expect(formatShortVND(-300000)).toBe('-300K')
      expect(formatShortVND(-1000000)).toBe('-1TR')
      expect(formatShortVND(-500000)).toBe('-500K')
    })

    it('formats zero or invalid amounts safely', () => {
      expect(formatShortVND(0)).toBe('0đ')
      expect(formatShortVND(null)).toBe('0đ')
      expect(formatShortVND(undefined)).toBe('0đ')
    })

    it('supports withSign = false', () => {
      expect(formatShortVND(1000000, false)).toBe('1TR')
      expect(formatShortVND(500000, false)).toBe('500K')
      expect(formatShortVND(-500000, false)).toBe('-500K')
    })
  })

  describe('formatCurrentDepositTime & formatTimestampToDepositTime', () => {
    it('formats date to DD/MM/YYYY - HH:mm', () => {
      const fixedDate = new Date(2026, 8, 14, 4, 1) // 14 Sep 2026 04:01
      const formatted = formatCurrentDepositTime(fixedDate)
      expect(formatted).toBe('14/09/2026 - 04:01')
    })

    it('converts ISO string to DD/MM/YYYY - HH:mm', () => {
      const formatted = formatTimestampToDepositTime('2026-09-14T04:01:00.000Z')
      expect(formatted).toMatch(/^\d{2}\/\d{2}\/\d{4} - \d{2}:\d{2}$/)
    })
  })

  describe('Deposit installment accumulation logic', () => {
    it('correctly tracks sequential installments and deltas', () => {
      const history: DepositHistoryEntry[] = []

      // Lần 1: Cọc 1.000.000đ
      const time1 = '14/09/2026 - 04:01'
      const amount1 = 1000000
      history.push({
        time: time1,
        amount: amount1,
        delta: amount1,
        note: 'Cọc lần 1',
        type: 'initial'
      })

      expect(history).toHaveLength(1)
      expect(history[0].delta).toBe(1000000)
      expect(formatShortVND(history[0].delta)).toBe('+1TR')

      // Lần 2: Bổ sung 500.000đ -> Tổng 1.500.000đ
      const time2 = '15/09/2026 - 15:35'
      const amount2 = 1500000
      const delta2 = amount2 - amount1
      history.push({
        time: time2,
        amount: amount2,
        delta: delta2,
        note: 'Bổ sung cọc (Lần 2)',
        type: 'increase'
      })

      expect(history).toHaveLength(2)
      expect(history[1].delta).toBe(500000)
      expect(formatShortVND(history[1].delta)).toBe('+500K')

      // Tổng cọc
      const totalDeposit = history[history.length - 1].amount
      expect(totalDeposit).toBe(1500000)
      expect(formatShortVND(totalDeposit)).toBe('+1,5TR')
    })
  })
})
