import { describe, it, expect } from 'vitest'
import { retrieveMenuCandidates } from '../menuCandidateRetriever'
import {
  resolveBestMenuSheet,
  PRIMARY_MENU_SHEET,
  isValidMenuSheetName,
  filterValidMenuSheets,
  prioritizeMenuSheets,
  isValidMenuItemsDataset
} from '../menuMatcher'
import { classifyAIInput } from '../../ai/inputClassifier'
import { buildDynamicPrompt } from '../../ai/promptBuilder'

describe('Active Menu → AI Candidate Retrieval & Prompt Routing Pipeline', () => {
  const activeMenuItems = [
    { id: '1', name: 'Bò nướng tảng', price: 250000, aliases: ['bò tảng', 'thăn bò tảng'] },
    { id: '2', name: 'Sum Vầy', price: 329000, aliases: ['khai vị sum vầy'] },
    { id: '3', name: 'Bí nụ xào tỏi', price: 89000, aliases: ['bí nụ'] },
    { id: '4', name: 'Đậu hũ hoàng kim', price: 95000, aliases: ['đậu phụ trứng muối'] },
    { id: '5', name: 'Panna Cotta chanh dây', price: 39000, aliases: ['panna cotta'] },
    { id: '6', name: 'Set menu 2', price: 2163000, aliases: ['SM2'] }
  ]

  it('retrieves dishes from active menu by exact name, multi-word alias, and acronym with prices', () => {
    const candidates = retrieveMenuCandidates({
      text: 'Anh Tuấn 0912345678 đặt 8 người 19h tối nay, gọi 1 bò tảng, 2 bí nụ xào tỏi và 1 sm2',
      menus: [
        { menuId: 'MENU2026', menuName: 'MENU2026', items: activeMenuItems },
        {
          menuId: 'Menu - Set',
          menuName: 'Menu - Set',
          items: [{ id: 's2', name: 'Set menu 2', price: 2163000 }]
        }
      ],
      limit: 10
    })

    const names = candidates.map(c => c.itemName)
    expect(names).toContain('Bò nướng tảng')
    expect(names).toContain('Bí nụ xào tỏi')
    expect(names).toContain('Set menu 2')

    const boTang = candidates.find(c => c.itemName === 'Bò nướng tảng')
    expect(boTang?.menuId).toBe('MENU2026')
    expect(boTang?.price).toBe(250000)
    expect(boTang?.matchedBy).toContain('alias')

    // Active menu (menus[0]) should rank ahead of secondary menu on shared Set menu 2
    const firstSet2 = candidates.find(c => c.itemName === 'Set menu 2')
    expect(firstSet2?.menuId).toBe('MENU2026')
  })

  it('detects active menu dishes in classifyAIInput via menuCatalog and expanded food keywords', () => {
    const res = classifyAIInput({
      text: 'Chị Lan 0988777666 đặt bàn 6 khách lúc 18h30 ngày 28/10, lấy Đậu phụ trứng muối và Panna cotta',
      menuCatalog: activeMenuItems
    })

    expect(res.detectedSignals.hasMenuKeyword).toBe(true)
    expect(res.requiresMenuContext).toBe(true)
    expect(res.complexity).toBe('booking_with_menu')
  })

  it('injects active menu summary & candidate prices in buildDynamicPrompt without forcing empty menu_items', () => {
    const classification = classifyAIInput({
      text: 'Khách: Chị lấy 1 Sum Vầy nhé\nNV: Dạ vâng ạ',
      menuCatalog: activeMenuItems
    })

    const candidates = retrieveMenuCandidates({
      text: 'Chị lấy 1 Sum Vầy nhé',
      menus: [{ menuId: 'MENU2026', menuName: 'MENU2026', items: activeMenuItems }]
    })

    const prompt = buildDynamicPrompt({
      profile: 'COMPLEX_CONVERSATION',
      userText: 'Khách: Chị lấy 1 Sum Vầy nhé\nNV: Dạ vâng ạ',
      classification,
      menuCandidates: candidates,
      activeMenuSummary: { sheetName: 'MENU2026', totalDishes: activeMenuItems.length },
      currentDateTime: 'Chủ Nhật, 25/10/2026 14:00',
      locale: 'vi-VN'
    })

    expect(prompt.includedSections).toContain('MENU_CANDIDATES')
    expect(prompt.systemPrompt).toContain('Thực đơn đang sử dụng của nhà hàng: "MENU2026"')
    expect(prompt.systemPrompt).toContain('Sum Vầy')
    expect(prompt.systemPrompt).toContain('329.000đ')

    // Verify TEXT_SIMPLE never forces "menu_items: []." blindly
    const simplePrompt = buildDynamicPrompt({
      profile: 'TEXT_SIMPLE',
      userText: 'Anh Nam 0909111222 đặt 4 người 19h tối nay',
      classification: classifyAIInput({ text: 'Anh Nam 0909111222 đặt 4 người 19h tối nay' }),
      menuCandidates: [],
      currentDateTime: 'Chủ Nhật, 25/10/2026 14:00',
      locale: 'vi-VN'
    })
    expect(simplePrompt.systemPrompt).not.toContain('và cọc. menu_items: [].')
  })

  it('preserves the currently active menu sheet in resolveBestMenuSheet on ties or zero-dish inputs', () => {
    const allMenus = {
      'Menu - Set': [{ name: 'Set menu 2', price: 2163000 }],
      'MENU2026': [
        { name: 'Set menu 2', price: 2163000 },
        { name: 'Bò nướng tảng', price: 250000 }
      ]
    }

    const tieResult = resolveBestMenuSheet(
      'Đặt 1 bàn Set menu 2',
      [{ raw_name: 'Set menu 2', matched_name: 'Set menu 2' }],
      allMenus,
      'MENU2026'
    )
    expect(tieResult.bestSheet).toBe('MENU2026')
  })

  it('strictly rejects Menu_Aliases and system sheets while keeping legitimate customer menus', () => {
    expect(isValidMenuSheetName('Menu_Aliases')).toBe(false)
    expect(isValidMenuSheetName(' Menu_Aliases ')).toBe(false)
    expect(isValidMenuSheetName('Menu Aliases')).toBe(false)
    expect(isValidMenuSheetName('Menu - Aliases')).toBe(false)
    expect(isValidMenuSheetName('Menu - Menu_Aliases')).toBe(false)
    expect(isValidMenuSheetName('AI_Corrections')).toBe(false)
    expect(isValidMenuSheetName('System_Config')).toBe(false)
    expect(isValidMenuSheetName('Menu')).toBe(false)
    expect(isValidMenuSheetName('Thực đơn')).toBe(false)
    expect(isValidMenuSheetName('[RS]📅2025')).toBe(false)

    expect(isValidMenuSheetName('MENU2026')).toBe(true)
    expect(isValidMenuSheetName('Menu - Set')).toBe(true)
    expect(isValidMenuSheetName('MENU_1')).toBe(true)
    expect(isValidMenuSheetName('MENU_TẾT_2026')).toBe(true)
    expect(isValidMenuSheetName('Thực đơn tiệc cưới')).toBe(true)

    expect(
      filterValidMenuSheets(['MENU2026', 'Menu_Aliases', ' Menu - Aliases ', 'Menu - Set', 'AI_Corrections'])
    ).toEqual(['MENU2026', 'Menu - Set'])
  })

  it('never suggests or switches to Menu_Aliases in resolveBestMenuSheet even when alias rows match ordered dishes', () => {
    const allMenus = {
      'MENU2026': [{ name: 'Bia Tiger Bạc', price: 25000 }],
      'Menu_Aliases': [
        { name: 'tiger bạc', price: 0 },
        { name: 'Tôm coctailk', price: 0 },
        { name: 'Gà nướng lá chanh', price: 0 }
      ]
    }

    const res = resolveBestMenuSheet(
      'Cho anh 10 tiger bạc và 1 gà nướng lá chanh',
      [
        { raw_name: 'tiger bạc', matched_name: 'tiger bạc' },
        { raw_name: 'Gà nướng lá chanh', matched_name: 'Gà nướng lá chanh' }
      ],
      allMenus,
      'MENU2026'
    )

    expect(res.bestSheet).toBe('MENU2026')
    expect(res.bestSheet).not.toBe('Menu_Aliases')
    expect(res.isBorderline).toBe(false)
  })

  it('always prioritizes official MENU2026 first (index 0) and uses it as default', () => {
    expect(PRIMARY_MENU_SHEET).toBe('MENU2026')

    // Even when secondary menus appear earlier in spreadsheet tab order, MENU2026 must be placed first
    expect(
      filterValidMenuSheets(['Trang tính2', 'Menu_Aliases', 'Menu - Set', 'MENU_TẾT_2026', 'menu2026', 'Bản sao của API_KEYS'])
    ).toEqual(['MENU2026', 'Menu - Set', 'MENU_TẾT_2026'])

    // Even when remote list is empty, prioritizeMenuSheets guarantees MENU2026 at index 0
    expect(prioritizeMenuSheets([], true)).toEqual(['MENU2026'])

    // Rejects poisoned 0-price Menu_Aliases payload masquerading as menu items
    expect(
      isValidMenuItemsDataset([
        { name: 'Tôm cocktail', price: 0 },
        { name: 'con vs', price: 0 },
        { name: 'con', price: 0 }
      ])
    ).toBe(false)
    expect(isValidMenuItemsDataset([{ name: 'Set menu 1', price: 2500000 }])).toBe(true)

    // Keeps MENU2026 active even when generic event keywords ("sinh nhật", "gọi món") match another menu sheet name
    const allMenus = {
      'Menu sinh nhật': [{ name: 'Set menu 2', price: 2500000 }],
      'Menu gọi món thường': [{ name: 'Bò nướng tảng', price: 250000 }],
      'MENU2026': [
        { name: 'Set menu 2', price: 2500000 },
        { name: 'Bò nướng tảng', price: 250000 }
      ]
    }
    const birthdayRes = resolveBestMenuSheet(
      'Đặt tiệc sinh nhật 10 người, lấy 1 Set menu 2 và 1 Bò nướng tảng',
      [
        { raw_name: 'Set menu 2', matched_name: 'Set menu 2' },
        { raw_name: 'Bò nướng tảng', matched_name: 'Bò nướng tảng' }
      ],
      allMenus,
      'MENU2026'
    )
    expect(birthdayRes.bestSheet).toBe('MENU2026')

    // Defaults to MENU2026 when activeSheet is empty or invalid
    const fallbackRes = resolveBestMenuSheet('', [], allMenus, 'Menu_Aliases')
    expect(fallbackRes.bestSheet).toBe('MENU2026')
  })
})
