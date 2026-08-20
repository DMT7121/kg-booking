import { describe, it, expect } from 'vitest'
import {
  roundVND,
  safeAddMoney,
  safeSubtractMoney,
  safeMultiplyMoney,
  safeCalculateDiscount,
  safeCalculateTotal,
  formatVNDCurrency
} from '../money'
import {
  formatRestaurantDate,
  formatRestaurantTime,
  parseRestaurantDateTime,
  getMinutesUntilBooking
} from '../time'

describe('Money & Currency Utilities Tests', () => {
  it('should round numbers to nearest integer VND value', () => {
    expect(roundVND(150000.4)).toBe(150000)
    expect(roundVND(150000.6)).toBe(150001)
    expect(roundVND(null)).toBe(0)
    expect(roundVND(undefined)).toBe(0)
  })

  it('should safely add multiple currency amounts without float issues', () => {
    expect(safeAddMoney(100000, 250000, 50000)).toBe(400000)
    expect(safeAddMoney(0.1, 0.2)).toBe(0)
    expect(safeAddMoney(150000.2, 250000.3)).toBe(400000)
  })

  it('should safely subtract amounts and prevent negative when disallowed', () => {
    expect(safeSubtractMoney(500000, 200000)).toBe(300000)
    expect(safeSubtractMoney(200000, 500000)).toBe(0)
    expect(safeSubtractMoney(200000, 500000, true)).toBe(-300000)
  })

  it('should safely multiply unit price and quantity', () => {
    expect(safeMultiplyMoney(129000, 3)).toBe(387000)
    expect(safeMultiplyMoney(150000, 0)).toBe(0)
    expect(safeMultiplyMoney(150000, 2.5)).toBe(375000)
  })

  it('should accurately calculate percentage and fixed discounts', () => {
    expect(safeCalculateDiscount(1000000, { percent: 10 })).toBe(100000)
    expect(safeCalculateDiscount(1000000, { fixed: 150000 })).toBe(150000)
    expect(safeCalculateDiscount(1000000, { fixed: 1500000 })).toBe(1000000) // Capped at base
  })

  it('should accurately calculate total bill for item list', () => {
    const items = [
      { unit_price: 150000, quantity: 2 },
      { unit_price: 250000, quantity: 1 },
      { price: 50000, qty: 3 }
    ]
    expect(safeCalculateTotal(items)).toBe(700000)
  })

  it('should format VND currency string properly', () => {
    expect(formatVNDCurrency(1250000)).toContain('1.250.000')
    expect(formatVNDCurrency(0)).toContain('0')
  })
})

describe('Timezone & Date Utilities Tests', () => {
  it('should format date and time reliably', () => {
    const testDate = new Date(2026, 7, 20, 19, 30) // 20/08/2026 19:30
    expect(formatRestaurantDate(testDate)).toBe('20/08/2026')
    expect(formatRestaurantTime(testDate)).toBe('19:30')
  })

  it('should parse DD/MM/YYYY and HH:mm into Date object', () => {
    const parsed = parseRestaurantDateTime('25/08/2026', '18:45')
    expect(parsed).not.toBeNull()
    expect(parsed?.getFullYear()).toBe(2026)
    expect(parsed?.getMonth()).toBe(7) // Month is 0-indexed (7 = August)
    expect(parsed?.getDate()).toBe(25)
    expect(parsed?.getHours()).toBe(18)
    expect(parsed?.getMinutes()).toBe(45)
  })

  it('should compute remaining minutes to booking', () => {
    const futureDate = new Date(Date.now() + 120 * 60 * 1000) // 2 hours in future
    const dateStr = formatRestaurantDate(futureDate)
    const timeStr = formatRestaurantTime(futureDate)
    const diff = getMinutesUntilBooking(dateStr, timeStr)
    expect(diff).toBeGreaterThan(115)
    expect(diff).toBeLessThan(125)
  })
})
