import { describe, it, expect } from 'vitest'
import { matchMenuItems, resolveBestMenuSheet, scoreAndMatchMenu } from '../menuMatcher'

describe('Menu Matcher Tests', () => {
  const mockMenuList = [
    { name: 'Sum Vầy [1]', price: 2500000, cleanName: 'sum vay 1', acronym: 'sv1' },
    { name: 'Súp Gà Trứng Bắc Thảo (10)', price: 450000, cleanName: 'sup ga trung bac thao 10' },
    { name: 'Tàu Hủ Lạnh', price: 50000, cleanName: 'tau hu lanh', acronym: 'thl' },
    { name: 'Lẩu Riêu Cua Đồng', price: 350000, cleanName: 'lau rieu cua dong' },
    { name: 'Tôm Cocktail (10)', price: 300000, cleanName: 'tom cocktail 10', acronym: 'tc' },
    { name: 'Bò Nướng Y Y', price: 280000, cleanName: 'bo nuong y y' },
    { name: 'Bò Xào Sốt Tiêu', price: 290000, cleanName: 'bo xao sot tieu' },
    { name: 'Gà Nướng Mật Ong', price: 220000, cleanName: 'ga nuong mat ong' }
  ]

  const mockAliases = [
    { alias: 'tau hu lanh', dishName: 'Tàu Hủ Lạnh' },
    { alias: 'tom cocktail 10', dishName: 'Tôm Cocktail (10)' },
    { alias: 'bò hẻm', dishName: 'Bò Nướng Y Y' }
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
    const rawItems = [{ name: 'Tôm Cocktail', quantity: 1 }]
    const matched = matchMenuItems(rawItems, 10, mockMenuList, mockAliases, {})
    expect(matched[0].matched_name).toBe('Tôm Cocktail (10)')
  })

  it('should penalize cooking method conflicts ("Bò xào" should match "Bò Xào Sốt Tiêu" rather than "Bò Nướng Y Y")', () => {
    const result = scoreAndMatchMenu('Bò xào', 4, mockMenuList, [], null)
    expect(result.match?.name).toBe('Bò Xào Sốt Tiêu')
    expect(result.match?.name).not.toBe('Bò Nướng Y Y')
  })

  it('should penalize ingredient conflicts ("Gà nướng" should match "Gà Nướng Mật Ong" rather than "Bò Nướng Y Y")', () => {
    const result = scoreAndMatchMenu('Gà nướng', 4, mockMenuList, [], null)
    expect(result.match?.name).toBe('Gà Nướng Mật Ong')
    expect(result.match?.name).not.toBe('Bò Nướng Y Y')
  })

  it('should match learned alias ("bò hẻm") with high confidence', () => {
    const result = scoreAndMatchMenu('bò hẻm', 4, mockMenuList, mockAliases, null)
    expect(result.match?.name).toBe('Bò Nướng Y Y')
    expect(result.confidence).toBeGreaterThanOrEqual(0.95)
    expect(result.matchType).toBe('alias')
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
