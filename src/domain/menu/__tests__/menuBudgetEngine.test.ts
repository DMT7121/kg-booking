import { describe, it, expect } from 'vitest'
import { generateMenuBudgetSuggestions } from '../menuBudgetEngine'

describe('Smart Menu Budget Engine Tests', () => {
  it('should generate 3 balanced menu packages for 10 guests', () => {
    const packages = generateMenuBudgetSuggestions(10)
    expect(packages.length).toBe(3)

    const economy = packages.find((p) => p.tier === 'ECONOMY')
    const balanced = packages.find((p) => p.tier === 'BALANCED')
    const premium = packages.find((p) => p.tier === 'PREMIUM')

    expect(economy).toBeDefined()
    expect(balanced).toBeDefined()
    expect(premium).toBeDefined()

    expect(economy!.totalPrice).toBeLessThan(balanced!.totalPrice)
    expect(balanced!.totalPrice).toBeLessThan(premium!.totalPrice)

    // Check that dishes cover courses
    expect(balanced!.dishes.some((d) => d.category === 'starter')).toBe(true)
    expect(balanced!.dishes.some((d) => d.category === 'main_grill')).toBe(true)
    expect(balanced!.dishes.some((d) => d.category === 'hotpot_carb')).toBe(true)
  })

  it('should scale quantities appropriately for large groups (25 guests)', () => {
    const packages = generateMenuBudgetSuggestions(25)
    const balanced = packages.find((p) => p.tier === 'BALANCED')
    expect(balanced?.dishes[0].quantity).toBe(5) // 5 sets for 25 guests
  })
})
