import { describe, it, expect } from 'vitest'
import {
  CANONICAL_SET_AND_COMBO_ITEMS,
  matchMenuItems,
  scoreAndMatchMenu,
  normalizeSetOrComboName,
  extractSetOrComboHeaderAndQty,
  resolveSetMenuDescription,
  detectSetMenuFromComponentLines
} from '@/domain/menu/menuMatcher'
import { extractByRules, parseSingleMenuLine, parseDishItems, stripSetMenuComponents } from '@/domain/ai/ruleEngine'
import { parseStructuredForm } from '@/domain/ai/structuredFormParser'
import { parseUnifiedBooking } from '@/domain/ai/unifiedParserEngine'
import { retrieveMenuCandidates } from '@/domain/menu/menuCandidateRetriever'
import { formatSetNote, mergeSetComponentNote } from '@/utils'
import { SETS } from '@/utils/constants'

describe('Set Menu (1..15) & Combo Couple (1..11) Comprehensive Analysis & Matching', () => {
  const catalog: any[] = [
    ...CANONICAL_SET_AND_COMBO_ITEMS,
    { name: 'Bia Tiger', price: 25000, cleanName: 'bia tiger', acronym: 'bt', desc: '' },
    { name: 'Nước ngọt', price: 20000, cleanName: 'nuoc ngot', acronym: 'nn', desc: '' },
    { name: 'Khăn lạnh', price: 5000, cleanName: 'khan lanh', acronym: 'kl', desc: '' },
    { name: 'Súp Gà Trứng Bắc Thảo (10)', price: 279000, cleanName: 'sup ga trung bac thao 10', acronym: 'sgtbt', desc: '' },
    { name: 'Súp Cua Nấm Tuyết (10)', price: 329000, cleanName: 'sup cua nam tuyet 10', acronym: 'scnt', desc: '' },
    { name: 'Gỏi Ngó Sen Tôm Thịt', price: 259000, cleanName: 'goi ngo sen tom thit', acronym: 'gnstt', desc: '' },
    { name: 'Tôm Sú Hấp Bia (10)', price: 399000, cleanName: 'tom su hap bia 10', acronym: 'tshb', desc: '' },
    { name: 'Lẩu Hải Sản', price: 389000, cleanName: 'lau hai san', acronym: 'lhs', desc: '' }
  ]
  const aliases: any[] = [
    { alias: 'bia tiger', dishName: 'Bia Tiger' },
    { alias: 'nuoc ngot', dishName: 'Nước ngọt' },
    { alias: 'khan lanh', dishName: 'Khăn lạnh' }
  ]

  it('1. Matches all 15 Set menu (1..15) accurately with exact price, quantity=1, and full multi-line component note', () => {
    for (let i = 1; i <= 15; i++) {
      const targetName = `Set menu ${i}`
      const variants = [
        `Set menu ${i}`,
        `Set ${i}`,
        `SM${i}`,
        `SM ${i}`,
        `Set số ${i}`
      ]

      for (const variant of variants) {
        const matched = matchMenuItems(
          [{ name: variant, quantity: 1, note: '' }],
          null,
          catalog,
          aliases,
          SETS,
          null
        )

        expect(matched).toHaveLength(1)
        expect(matched[0].name).toBe(targetName)
        expect(matched[0].quantity).toBe(1)
        expect(matched[0].needsReview).toBe(false)
        expect(matched[0].price).toBeGreaterThan(1000000)

        // Note must be the full multi-line component list (not corrupted "T" or empty)
        expect(matched[0].note.length).toBeGreaterThan(40)
        expect(matched[0].note).toContain('1/')
        expect(matched[0].note).toContain('2/')
        expect(matched[0].note).toContain('\n')
      }
    }
  })

  it('2. Matches all 11 Combo couple (1..11) accurately with exact price, quantity=1, and full multi-line component note', () => {
    for (let i = 1; i <= 11; i++) {
      const targetName = `Combo couple ${i}`
      const variants = [
        `Combo couple ${i}`,
        `Combo ${i}`,
        `Couple ${i}`,
        `CC${i}`,
        `CC ${i}`,
        `Combo 2 người số ${i}`
      ]

      for (const variant of variants) {
        const matched = matchMenuItems(
          [{ name: variant, quantity: 1, note: '' }],
          null,
          catalog,
          aliases,
          SETS,
          null
        )

        expect(matched).toHaveLength(1)
        expect(matched[0].name).toBe(targetName)
        expect(matched[0].quantity).toBe(1)
        expect(matched[0].needsReview).toBe(false)
        expect(matched[0].price).toBeGreaterThanOrEqual(399000)

        expect(matched[0].note.length).toBeGreaterThan(25)
        expect(matched[0].note).toContain('1/')
        expect(matched[0].note).toContain('2/')
        expect(matched[0].note).toContain('3/')
        expect(matched[0].note).toContain('\n')
      }
    }
  })

  it('3. Never confuses Set/Combo identifier number with order quantity across leading, trailing, and parenthetical formats', () => {
    const cases = [
      { input: 'Set menu 3', expectedName: 'Set menu 3', expectedQty: 1, expectedCustomNote: '' },
      { input: '2 Set menu 3', expectedName: 'Set menu 3', expectedQty: 2, expectedCustomNote: '' },
      { input: '02 bàn Set menu 5', expectedName: 'Set menu 5', expectedQty: 2, expectedCustomNote: '' },
      { input: 'Set menu 3 x2', expectedName: 'Set menu 3', expectedQty: 2, expectedCustomNote: '' },
      { input: 'Set menu 4 (3 bàn)', expectedName: 'Set menu 4', expectedQty: 3, expectedCustomNote: '' },
      { input: 'Set menu 6 - 2 set', expectedName: 'Set menu 6', expectedQty: 2, expectedCustomNote: '' },
      { input: 'Set menu 12: 2 bàn', expectedName: 'Set menu 12', expectedQty: 2, expectedCustomNote: '' },
      { input: 'Combo couple 5', expectedName: 'Combo couple 5', expectedQty: 1, expectedCustomNote: '' },
      { input: '2 phần Combo couple 4', expectedName: 'Combo couple 4', expectedQty: 2, expectedCustomNote: '' },
      { input: 'Combo couple 7 x 3', expectedName: 'Combo couple 7', expectedQty: 3, expectedCustomNote: '' },
      { input: 'Set menu 2 (2 bàn, đổi lẩu Thái thành lẩu nấm)', expectedName: 'Set menu 2', expectedQty: 2, expectedCustomNote: 'đổi lẩu Thái thành lẩu nấm' },
      { input: 'Set menu 8 (không cay) x2', expectedName: 'Set menu 8', expectedQty: 2, expectedCustomNote: 'không cay' }
    ]

    for (const tc of cases) {
      const lineParsed = parseSingleMenuLine(tc.input)
      expect(lineParsed).not.toBeNull()
      expect(lineParsed!.raw_name).toBe(tc.expectedName)
      expect(lineParsed!.quantity).toBe(tc.expectedQty)
      if (tc.expectedCustomNote) {
        expect(lineParsed!.note).toContain(tc.expectedCustomNote)
      }

      const matched = matchMenuItems(
        [{ name: tc.input, quantity: lineParsed!.quantity, note: lineParsed!.note }],
        null,
        catalog,
        aliases,
        SETS,
        null
      )
      expect(matched).toHaveLength(1)
      expect(matched[0].name).toBe(tc.expectedName)
      expect(matched[0].quantity).toBe(tc.expectedQty)
      expect(matched[0].note).toContain('1/')
      if (tc.expectedCustomNote) {
        expect(matched[0].note).toContain(tc.expectedCustomNote)
      }
    }
  })

  it('4. Formats Set component notes without splitting inside parenthetical quantities like (10)', () => {
    const set4Note = resolveSetMenuDescription('Set menu 4', catalog, SETS)
    expect(set4Note).toContain('5/ Tôm Cocktail (10) [1]')
    expect(set4Note).not.toContain('(\n10)')

    const set12Note = resolveSetMenuDescription('Set menu 12', catalog, SETS)
    expect(set12Note).toContain('1/ Combo Khai Vị: (Chả Đùm Trứng Muối (1), Chả Giò Bát Bửu (10), Phá Lấu Bánh Mì (1)) [1]')

    const merged = mergeSetComponentNote('Đổi lẩu nấm qua lẩu chua cay', set4Note)
    expect(merged).toContain('1/ Gỏi Bò Rau Muống [2]')
    expect(merged).toContain('Đổi lẩu nấm qua lẩu chua cay')
  })

  it('5. Consolidates listed Set component lines so they are never extracted as duplicate standalone dishes', () => {
    const bookingText = `
Tên khách: Anh Minh
SĐT: 0909123456
Ngày: 20/10/2026 - 19h00
Số lượng: 20 khách
Thực đơn:
Set menu 2 (2 bàn)
1/ Combo Khai Vị: Chả Giò Kim Tiền (10), Gỏi Tôm Thịt Hoa Chuối, Thịt Xiên Nướng (10) [1]
2/ Miến Xào Trứng Tôm [2]
3/ Giò Heo Muối Hoa Tiêu Xôi Hạt Sen [1]
4/ Mực Trứng Om Ớt Xiêm Xanh [2]
5/ Lẩu Chua Cay Hải Sản [1] (đổi qua lẩu nấm)
6/ Trái Cây/ Tàu Hủ Lạnh/ Bánh Bò Thốt Nốt [1]
Bia Tiger Bạc (Lon) x 20
`.trim()

    const ruleRes = extractByRules(bookingText)
    expect(ruleRes.menu_items).toHaveLength(2)
    expect(ruleRes.menu_items[0].raw_name).toBe('Set menu 2')
    expect(ruleRes.menu_items[0].quantity).toBe(2)
    expect(ruleRes.menu_items[0].note).toContain('đổi qua lẩu nấm')

    const matched = matchMenuItems(ruleRes.menu_items, ruleRes.guest_count, catalog, aliases, SETS, ruleRes.guest_count)
    expect(matched).toHaveLength(2)
    expect(matched[0].name).toBe('Set menu 2')
    expect(matched[0].quantity).toBe(2)
    expect(matched[0].note).toContain('1/ Combo Khai Vị: Chả Giò Kim Tiền (10), Gỏi Tôm Thịt Hoa Chuối, Thịt Xiên Nướng (10) [1]')
    expect(matched[0].note).toContain('6/ Trái Cây/ Tàu Hủ Lạnh/ Bánh Bò Thốt Nốt [1]')
    expect(matched[0].note).toContain('đổi qua lẩu nấm')
    expect(matched[1].name).toContain('Tiger')
    expect(matched[1].quantity).toBe(20)
  })

  it('6. Reverse-identifies Set menu when customer pastes only the component lines without a Set header', () => {
    const orphanComponentsText = `
Chị Lan 0912345678
Tối mai 19h 10 người
1/ Combo Khai Vị: Chả Giò Kim Tiền (10), Gỏi Tôm Thịt Hoa Chuối, Thịt Xiên Nướng (10) [1]
2/ Miến Xào Trứng Tôm [2]
3/ Giò Heo Muối Hoa Tiêu Xôi Hạt Sen [1]
4/ Mực Trứng Om Ớt Xiêm Xanh [2]
5/ Lẩu Chua Cay Hải Sản [1]
6/ Trái Cây/ Tàu Hủ Lạnh/ Bánh Bò Thốt Nốt [1]
`.trim()

    const ruleRes = extractByRules(orphanComponentsText)
    expect(ruleRes.menu_items).toHaveLength(1)
    expect(ruleRes.menu_items[0].raw_name).toBe('Set menu 2')
    expect(ruleRes.menu_items[0].quantity).toBe(1)

    const matched = matchMenuItems(ruleRes.menu_items, ruleRes.guest_count, catalog, aliases, SETS, ruleRes.guest_count)
    expect(matched).toHaveLength(1)
    expect(matched[0].name).toBe('Set menu 2')
    expect(matched[0].quantity).toBe(1)
    expect(matched[0].note).toContain('1/ Combo Khai Vị: Chả Giò Kim Tiền (10), Gỏi Tôm Thịt Hoa Chuối, Thịt Xiên Nướng (10) [1]')
  })

  it('7. Retrieves exact Set menu and Combo couple candidates in retrieveMenuCandidates', () => {
    const menusInput = [{
      menuId: 'MENU2026',
      menuName: 'MENU2026',
      items: catalog.map((item, idx) => ({
        id: `id-${idx}`,
        name: item.name,
        price: item.price,
        aliases: item.acronym ? [item.acronym] : []
      }))
    }]

    const candSet2 = retrieveMenuCandidates({ text: 'Đặt 2 bàn Set 2 và Combo couple 3', menus: menusInput })
    const names = candSet2.map(c => c.itemName)
    expect(names).toContain('Set menu 2')
    expect(names).toContain('Combo couple 3')
  })
})
