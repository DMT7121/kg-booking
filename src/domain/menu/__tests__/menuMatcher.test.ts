import { describe, it, expect } from 'vitest'
import { matchMenuItems, resolveBestMenuSheet, fuzzyMatchMenu } from '../menuMatcher'

describe('Menu Matcher Tests', () => {
  const mockMenuList = [
    { name: 'Sum Vầy [1]', price: 2500000, cleanName: 'sum vay 1', acronym: 'sv1' },
    { name: 'Súp Gà Trứng Bắc Thảo (10)', price: 450000, cleanName: 'sup ga trung bac thao 10' },
    { name: 'Tàu Hủ Lạnh', price: 50000, cleanName: 'tau hu lanh', acronym: 'thl' },
    { name: 'Lẩu Riêu Cua Đồng', price: 350000, cleanName: 'lau rieu cua dong' },
    { name: 'Tôm Cocktail (10)', price: 300000, cleanName: 'tom cocktail 10', acronym: 'tc' }
  ]

  const mockAliases = [
    { alias: 'tau hu lanh', dishName: 'Tàu Hủ Lạnh' },
    { alias: 'tom cocktail 10', dishName: 'Tôm Cocktail (10)' }
  ]

  it('should match exact menu name', () => {
    const rawItems = [{ name: 'Tàu Hủ Lạnh', quantity: 2 }]
    const matched = matchMenuItems(rawItems, 4, mockMenuList, mockAliases, {})
    expect(matched[0].matched_name).toBe('Tàu Hủ Lạnh')
    expect(matched[0].unit_price).toBe(50000)
    expect(matched[0].needs_review).toBe(false)
  })

  it('should match menu name by acronym', () => {
    const rawItems = [{ name: 'sv1', quantity: 1 }]
    const matched = matchMenuItems(rawItems, 10, mockMenuList, mockAliases, {})
    expect(matched[0].matched_name).toBe('Sum Vầy [1]')
    expect(matched[0].needs_review).toBe(false)
  })

  it('should handle portion matching with guests', () => {
    // "Tôm Cocktail 10" with 10 guest count should match "Tôm Cocktail (10)"
    const rawItems = [{ name: 'Tôm Cocktail', quantity: 1 }]
    const matched = matchMenuItems(rawItems, 10, mockMenuList, mockAliases, {})
    expect(matched[0].matched_name).toBe('Tôm Cocktail (10)')
  })

  it('should properly handle portion sizes without corrupting quantity', () => {
    const listWithPortions = [
      { name: 'Hàu Nướng Phô Mai (5 con)', price: 150000, cleanName: 'hau nuong pho mai 5 con' },
      { name: 'Hàu Nướng Phô Mai (10 con)', price: 280000, cleanName: 'hau nuong pho mai 10 con' },
      { name: 'Gà Ta Nướng Muối Ớt', price: 220000, cleanName: 'ga ta nuong muoi ot' }
    ]
    const rawItems = [
      { name: '5 con hàu nướng phô mai', quantity: 1 },
      { name: '2 phần 5 con hàu nướng phô mai', quantity: 1 },
      { name: 'Gà ta nướng muối ớt 1/2 con', quantity: 1 }
    ]
    const matched = matchMenuItems(rawItems, null, listWithPortions, [], {})
    expect(matched[0].quantity).toBe(1)
    expect(matched[0].matched_name).toBe('Hàu Nướng Phô Mai (5 con)')

    expect(matched[1].quantity).toBe(2)
    expect(matched[1].matched_name).toBe('Hàu Nướng Phô Mai (5 con)')

    expect(matched[2].quantity).toBe(1)
    expect(matched[2].note).toContain('1/2 con')
  })

  it('should resolve best menu sheet', () => {
    const parsedItems = [
      { matched_name: 'Sum Vầy [1]' },
      { matched_name: 'Tàu Hủ Lạnh' }
    ]
    const allMenus = {
      'MENU_1': [
        { name: 'Sum Vầy [1]' },
        { name: 'Tàu Hủ Lạnh' }
      ],
      'MENU_2': [
        { name: 'Lẩu Bò' }
      ]
    }
    const result = resolveBestMenuSheet('Menu sum vay co tau hu lanh', parsedItems, allMenus, 'MENU_2')
    expect(result.bestSheet).toBe('MENU_1')
    expect(result.score).toBeGreaterThan(0)
  })
})
