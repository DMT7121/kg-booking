/**
 * Currency & Money Calculation Utilities
 * Ensures integer-safe arithmetic for VND and prevents floating-point inaccuracies.
 */

/**
 * Rounds any number to the nearest integer VND value (Dong has no sub-units).
 */
export function roundVND(amount: number | null | undefined): number {
  if (amount === null || amount === undefined || isNaN(amount)) return 0
  return Math.round(Number(amount))
}

/**
 * Safely adds multiple currency amounts.
 */
export function safeAddMoney(...amounts: Array<number | null | undefined>): number {
  return amounts.reduce<number>((total, curr) => total + roundVND(curr), 0)
}

/**
 * Safely subtracts a deduction from a base amount (cannot go below 0 unless allowNegative is true).
 */
export function safeSubtractMoney(base: number, deduction: number, allowNegative = false): number {
  const result = roundVND(base) - roundVND(deduction)
  return allowNegative ? result : Math.max(0, result)
}

/**
 * Safely multiplies a base unit price by a quantity multiplier.
 */
export function safeMultiplyMoney(unitPrice: number, qty: number): number {
  const price = roundVND(unitPrice)
  const quantity = Math.max(0, Number(qty) || 0)
  return Math.round(price * quantity)
}

/**
 * Safely calculates discount amount and returns the rounded reduction amount.
 */
export function safeCalculateDiscount(baseAmount: number, percentOrFixed: { percent?: number; fixed?: number }): number {
  const base = roundVND(baseAmount)
  if (percentOrFixed.fixed !== undefined && percentOrFixed.fixed > 0) {
    return Math.min(base, roundVND(percentOrFixed.fixed))
  }
  if (percentOrFixed.percent !== undefined && percentOrFixed.percent > 0) {
    const rate = Math.min(100, Math.max(0, percentOrFixed.percent)) / 100
    return Math.min(base, Math.round(base * rate))
  }
  return 0
}

/**
 * Safely calculates order total from a list of items with unit_price and quantity.
 */
export function safeCalculateTotal(items: Array<{ unit_price?: number; price?: number; quantity?: number; qty?: number }>): number {
  if (!Array.isArray(items)) return 0
  return items.reduce((sum, item) => {
    const price = item.unit_price !== undefined ? item.unit_price : (item.price || 0)
    const quantity = item.quantity !== undefined ? item.quantity : (item.qty || 1)
    return sum + safeMultiplyMoney(price, quantity)
  }, 0)
}

/**
 * Formats a VND number into standard Vietnamese display string (e.g., "1.250.000đ").
 */
export function formatVNDCurrency(amount: number | null | undefined, suffix = 'đ'): string {
  const value = roundVND(amount)
  return `${value.toLocaleString('vi-VN')}${suffix ? ' ' + suffix : ''}`
}
