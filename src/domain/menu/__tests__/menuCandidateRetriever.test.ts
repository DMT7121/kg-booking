import { describe, it, expect } from 'vitest'
import { retrieveMenuCandidates } from '../menuCandidateRetriever'

describe('Menu Candidate Retriever Tests', () => {
  const mockMenus = [
    {
      menuId: 'menu1',
      menuName: 'Thực đơn chính',
      items: [
        { id: 'item1', name: 'Lẩu Riêu Cua Đồng', price: 350000 },
        { id: 'item2', name: 'Tàu Hủ Lạnh', aliases: ['tau hu lanh', 'tau hu'], price: 50000 },
        { id: 'item3', name: 'Sườn Nướng Tảng', price: 250000 }
      ]
    }
  ]

  it('should retrieve candidate by exact match', () => {
    const result = retrieveMenuCandidates({
      text: 'Cho em đặt 1 nồi Lẩu Riêu Cua Đồng nha',
      menus: mockMenus
    })

    expect(result.length).toBeGreaterThan(0)
    expect(result[0].itemName).toBe('Lẩu Riêu Cua Đồng')
    expect(result[0].matchedBy).toContain('exact')
  })

  it('should retrieve candidate by alias', () => {
    const result = retrieveMenuCandidates({
      text: 'Thêm 2 cốc tau hu lanh',
      menus: mockMenus
    })

    expect(result.length).toBeGreaterThan(0)
    expect(result[0].itemName).toBe('Tàu Hủ Lạnh')
    expect(result[0].matchedBy).toContain('alias')
  })

  it('should retrieve candidate by partial token overlap', () => {
    const result = retrieveMenuCandidates({
      text: 'Sườn nướng',
      menus: mockMenus
    })

    expect(result.length).toBeGreaterThan(0)
    expect(result[0].itemName).toBe('Sườn Nướng Tảng')
    expect(result[0].matchedBy).toContain('token')
  })

  it('should respect the limit constraint', () => {
    const result = retrieveMenuCandidates({
      text: 'Lẩu Riêu Cua Đồng Tàu Hủ Lạnh Sườn Nướng Tảng',
      menus: mockMenus,
      limit: 1
    })

    expect(result.length).toBe(1)
  })
})
