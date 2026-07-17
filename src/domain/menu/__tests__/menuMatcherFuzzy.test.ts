import { describe, it, expect } from 'vitest'
import { scoreAndMatchMenu, matchMenuItems, fuzzyMatchMenu } from '../menuMatcher'

describe('Upgraded Menu Matcher Tests', () => {
  const mockMenu = [
    { name: 'Sườn Bé Sốt Ớt Xanh', price: 200000, category: 'Món Chính' },
    { name: 'Súp Gà Ngô', price: 50000, category: 'Khai Vị' },
    { name: 'Lẩu Riêu Cua Đồng', price: 350000, category: 'Lẩu' },
    { name: 'Mực Trứng Hấp', price: 180000, category: 'Hải Sản' },
    { name: 'Cơm Chiên Cua', price: 120000, category: 'Cơm' }
  ]

  const mockAliases = [
    { alias: 'lau cua', dishName: 'Lẩu Riêu Cua Đồng' },
    { alias: 'suon ot xanh', dishName: 'Sườn Bé Sốt Ớt Xanh' }
  ]

  it('should match alias or synonym correctly with high score', () => {
    const res = scoreAndMatchMenu('lau cua', null, mockMenu, mockAliases)
    expect(res.match).not.toBeNull()
    expect(res.match.name).toBe('Lẩu Riêu Cua Đồng')
    expect(res.confidence).toBeGreaterThanOrEqual(0.90)
    expect(res.needsReview).toBe(false)
  })

  it('should apply penalty to short queries like "ga" to prevent auto-selecting random chicken dishes', () => {
    const res = scoreAndMatchMenu('ga', null, mockMenu, mockAliases)
    // "ga" is very short (length 2), it matches "Súp Gà Ngô" but should trigger ambiguity guard/needsReview
    expect(res.needsReview).toBe(true)
  })

  it('should match fuzzy typos like "suon ot xiem xanh" to "Sườn Bé Sốt Ớt Xanh" and flag for review', () => {
    const res = scoreAndMatchMenu('suon ot xiem xanh', null, mockMenu, mockAliases)
    expect(res.match).not.toBeNull()
    expect(res.match.name).toBe('Sườn Bé Sốt Ớt Xanh')
    expect(res.needsReview).toBe(true)
  })

  it('should match minor typos like "suon be sot ot xan" without flagging review', () => {
    const res = scoreAndMatchMenu('suon be sot ot xan', null, mockMenu, mockAliases)
    expect(res.match).not.toBeNull()
    expect(res.match.name).toBe('Sườn Bé Sốt Ớt Xanh')
    expect(res.needsReview).toBe(false)
  })

  it('should flag match as ambiguous if scores between top candidates are too close', () => {
    const closeMenu = [
      { name: 'Lẩu Cá Kèo', price: 200000 },
      { name: 'Lẩu Cá Tầm', price: 220000 }
    ]
    const res = scoreAndMatchMenu('lau ca', null, closeMenu, [])
    // "lau ca" matches both "Lẩu Cá Kèo" and "Lẩu Cá Tầm" almost equally
    expect(res.needsReview).toBe(true)
  })

  it('should match cơm chiên cá mặn variations to cơm chiên cá mặn chà bông ớt hiểm (cay)', () => {
    const customMenu = [
      { name: 'Cơm chiên cá mặn chà bông ớt hiểm (cay)', price: 150000 },
      { name: 'Cơm chiên hải sản', price: 160000 }
    ]
    const inputs = [
      'cơm chiên cá mặn',
      'com chien ca man',
      'com chien ca man cha bong',
      'com chien ca man ớt hiểm'
    ]
    for (const input of inputs) {
      const res = scoreAndMatchMenu(input, null, customMenu, [])
      expect(res.match).not.toBeNull()
      expect(res.match.name).toBe('Cơm chiên cá mặn chà bông ớt hiểm (cay)')
      expect(res.needsReview).toBe(false)
    }
  })
})
