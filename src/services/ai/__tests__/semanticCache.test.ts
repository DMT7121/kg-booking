import { describe, it, expect, beforeEach, vi } from 'vitest'
import { 
  extractEntitiesFromInput, 
  buildEntitySignature, 
  parseSignatureToEntities, 
  canUseSemanticCache, 
  querySemanticCache, 
  saveToSemanticCache,
  clearSemanticCache
} from '../semanticCache'
import { clear } from 'idb-keyval'

vi.mock('idb-keyval', () => {
  const store = new Map<string, any>()
  return {
    get: vi.fn(async (key: string) => store.get(key)),
    set: vi.fn(async (key: string, value: any) => store.set(key, value)),
    del: vi.fn(async (key: string) => store.delete(key)),
    clear: vi.fn(async () => store.clear())
  }
})

describe('Semantic Cache Tests', () => {
  beforeEach(async () => {
    await clearSemanticCache()
  })

  it('should extract entities correctly from rule-based hints and hard entities', () => {
    const ruleBased = {
      customer_name: 'Nam',
      phone: '0987654321',
      event_date: '20/06/2026',
      event_time: '19:00',
      guest_count: 4,
      menu_items: [
        { name: 'Sườn Ớt Xanh', quantity: 2 },
        { name: 'Lẩu Cua', quantity: 1 }
      ]
    }
    
    const hardEntities = {
      dates: [],
      times: [],
      guestCounts: []
    }
    
    const entities = extractEntitiesFromInput(ruleBased, hardEntities)
    expect(entities.name).toBe('nam')
    expect(entities.phone).toBe('0987654321')
    expect(entities.guestCount).toBe(4)
    expect(entities.menuItems.length).toBe(2)
    expect(entities.menuItems[0].name).toBe('lau cua')
    expect(entities.menuItems[0].qty).toBe(1)
    expect(entities.menuItems[1].name).toBe('suon ot xanh')
    expect(entities.menuItems[1].qty).toBe(2)
  })

  it('should build and parse entity signatures symmetrically', () => {
    const entities = {
      name: 'nam',
      phone: '0987654321',
      date: '20/06/2026',
      time: '19:00',
      guestCount: 4,
      menuItems: [
        { name: 'suon ot xanh', qty: 2 },
        { name: 'lau cua', qty: 1 }
      ]
    }
    
    const signature = buildEntitySignature(entities)
    const parsed = parseSignatureToEntities(signature)
    
    expect(parsed.name).toBe('nam')
    expect(parsed.phone).toBe('0987654321')
    expect(parsed.guestCount).toBe(4)
    expect(parsed.menuItems.length).toBe(2)
    expect(parsed.menuItems[0].name).toBe('suon ot xanh')
    expect(parsed.menuItems[0].qty).toBe(2)
    expect(parsed.menuItems[1].name).toBe('lau cua')
    expect(parsed.menuItems[1].qty).toBe(1)
  })

  it('should reject semantic lookup if entity fields mismatch', () => {
    const newEntities = {
      name: 'nam',
      phone: '0987654321',
      date: '20/06/2026',
      time: '19:00',
      guestCount: 4,
      menuItems: []
    }
    
    const cachedEntities = {
      name: 'nam',
      phone: '0987654321',
      date: '20/06/2026',
      time: '19:00',
      guestCount: 6, // mismatch guest count!
      menuItems: []
    }
    
    const check = canUseSemanticCache(newEntities, cachedEntities)
    expect(check.allowed).toBe(false)
    expect(check.reason).toBe('guest_count_mismatch')
  })

  it('should hit semantic cache when texts are similar but phrased differently', async () => {
    const entities = {
      name: 'nam',
      phone: '0987654321',
      date: '20/06/2026',
      time: '19:00',
      guestCount: 4,
      menuItems: []
    }
    
    const data = { ok: true, parsed: { test: true } }
    
    await saveToSemanticCache({
      normalizedText: 'dat ban 4 khach luc 19h anh nam',
      entitySignature: buildEntitySignature(entities),
      value: data,
      createdAt: Date.now(),
      expiresAt: Date.now() + 60000,
      menuFingerprint: 'menu_fp',
      promptSchemaVersion: 1,
      normalizerSchemaVersion: 1
    })
    
    const result = await querySemanticCache(
      'anh nam dat ban 4 nguoi luc 7h toi',
      entities,
      {
        menuFingerprint: 'menu_fp',
        promptSchemaVersion: 1,
        normalizerSchemaVersion: 1
      }
    )
    
    expect(result).not.toBeNull()
    expect(result?.value).toEqual(data)
  })
})
