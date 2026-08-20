import { describe, it, expect } from 'vitest'
import { optimizePriceReduction, PriceOptimizationInput } from '../priceOptimizer'

describe('Price Adjustment Optimizer Tests', () => {
  it('should generate 3 distinct optimization strategies without altering protected items', () => {
    const input: PriceOptimizationInput = {
      currentTotal: 21377680,
      reductionTarget: 2000000, // Reduce 2,000,000 VND
      items: [
        { id: '1', name: 'Lẩu Riêu Cua Signature', quantity: 2, unitPrice: 550000, isProtected: true }, // Protected
        { id: '2', name: 'Hàu nướng phô mai (10 con)', quantity: 4, unitPrice: 350000 },
        { id: '3', name: 'Sườn nướng mật ong', quantity: 3, unitPrice: 280000 },
        { id: '4', name: 'Gỏi ngó sen tôm thịt', quantity: 2, unitPrice: 165000 }
      ]
    }

    const options = optimizePriceReduction(input)
    expect(options.length).toBe(3)

    // Option A: Closest
    const optA = options.find((o) => o.strategy === 'CLOSEST')
    expect(optA).toBeDefined()
    expect(optA?.deltas.some((d) => d.name.includes('Signature'))).toBe(false) // Protected item untouched
    expect(optA?.actualReduction).toBeGreaterThanOrEqual(1800000)

    // Option B: Least changes
    const optB = options.find((o) => o.strategy === 'LEAST_CHANGES')
    expect(optB).toBeDefined()
    expect(optB?.deltas.length).toBeLessThanOrEqual(optA!.deltas.length + 1)

    // Option C: Balanced
    const optC = options.find((o) => o.strategy === 'BALANCED')
    expect(optC).toBeDefined()
  })

  it('should return empty array if reduction target is 0 or negative', () => {
    const input: PriceOptimizationInput = {
      currentTotal: 5000000,
      reductionTarget: 0,
      items: [{ id: '1', name: 'Món A', quantity: 1, unitPrice: 500000 }]
    }
    expect(optimizePriceReduction(input).length).toBe(0)
  })
})
