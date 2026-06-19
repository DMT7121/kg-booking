import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getCachedAIResponse,
  setCachedAIResponse,
  deleteCachedAIResponse,
  clearAIResponseCache,
  hashString,
  stableStringify
} from '../aiResponseCache'
import * as idbKeyval from 'idb-keyval'

const mockIdbStore = new Map<string, any>()

vi.mock('idb-keyval', () => {
  return {
    get: vi.fn(async (key) => mockIdbStore.get(key)),
    set: vi.fn(async (key, value) => { mockIdbStore.set(key, value) }),
    del: vi.fn(async (key) => { mockIdbStore.delete(key) }),
    clear: vi.fn(async () => { mockIdbStore.clear() })
  }
})

describe('AI Response Cache Service Tests', () => {
  beforeEach(async () => {
    mockIdbStore.clear()
    await clearAIResponseCache('test-reset')
    vi.clearAllMocks()
  })

  it('should successfully hit Memory Cache (L1) on second call', async () => {
    const key = 'test-cache-key-1'
    const value = { parsed: 'success-data' }

    await setCachedAIResponse(key, value, { ttl: 60000 })
    
    // First read should hit memory
    const result = await getCachedAIResponse(key)
    expect(result).toEqual(value)
    expect(idbKeyval.get).not.toHaveBeenCalled() // L1 hit, L2 get not called
  })

  it('should hit IndexedDB (L2) and hydrate L1 memory cache if L1 misses', async () => {
    const key = 'test-cache-key-2'
    const value = { parsed: 'success-l2-data' }

    // Manually set in L2 (IndexedDB mock)
    mockIdbStore.set(key, {
      value,
      createdAt: Date.now(),
      expiresAt: Date.now() + 60000,
      schemaVersion: 1,
      menuFingerprint: 'menu-1',
      correctionFingerprint: 'corr-1'
    })

    // Read cache, should miss L1 and hit L2
    const result = await getCachedAIResponse(key, {
      menuFingerprint: 'menu-1',
      correctionFingerprint: 'corr-1'
    })
    expect(result).toEqual(value)
    expect(idbKeyval.get).toHaveBeenCalledWith(key)

    // Call again, should now hit L1 and NOT query L2
    vi.clearAllMocks()
    const result2 = await getCachedAIResponse(key, {
      menuFingerprint: 'menu-1',
      correctionFingerprint: 'corr-1'
    })
    expect(result2).toEqual(value)
    expect(idbKeyval.get).not.toHaveBeenCalled()
  })

  it('should return null and delete entry if cache has expired', async () => {
    const key = 'expired-key'
    const value = { parsed: 'expired' }

    // Set with expired ttl
    await setCachedAIResponse(key, value, { ttl: -1000 })

    const result = await getCachedAIResponse(key)
    expect(result).toBeNull()
  })

  it('should invalidate cache if menu fingerprint changes but item count is same', async () => {
    const key = 'fingerprint-key'
    const value = { parsed: 'matched' }

    const menuA = [{ name: 'Combo Nướng A', price: 200000 }]
    const menuB = [{ name: 'Combo Nướng B', price: 200000 }]

    const fingerprintA = hashString(stableStringify(menuA))
    const fingerprintB = hashString(stableStringify(menuB))

    expect(fingerprintA).not.toEqual(fingerprintB)

    // Set cache with fingerprintA
    await setCachedAIResponse(key, value, {
      ttl: 60000,
      menuFingerprint: fingerprintA
    })

    // Try reading with fingerprintB (simulating menu name update)
    const resultStale = await getCachedAIResponse(key, {
      menuFingerprint: fingerprintB
    })
    expect(resultStale).toBeNull() // Should be invalid (miss/stale)

    // Reading with fingerprintA should hit if not deleted, but since it was stale, it got deleted
    const resultOrig = await getCachedAIResponse(key, {
      menuFingerprint: fingerprintA
    })
    expect(resultOrig).toBeNull()
  })

  it('should clear all cache when manual reload menu is called', async () => {
    const key1 = 'key-1'
    const key2 = 'key-2'
    await setCachedAIResponse(key1, { data: 1 })
    await setCachedAIResponse(key2, { data: 2 })

    await clearAIResponseCache('manual_menu_reload')

    expect(await getCachedAIResponse(key1)).toBeNull()
    expect(await getCachedAIResponse(key2)).toBeNull()
  })
})
