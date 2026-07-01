import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as vault from '../localKeyVault'
import * as migration from '../localKeyVaultMigration'
import { CACHE_KEYS } from '@/utils/constants'

// Mock idb-keyval to avoid relying on a real IndexedDB process in tests
const mockDb = new Map<string, any>()
vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: string) => mockDb.get(key)),
  set: vi.fn(async (key: string, val: any) => { mockDb.set(key, val) }),
  del: vi.fn(async (key: string) => { mockDb.delete(key) })
}))

// Safe fallback mock for localStorage
if (typeof global.localStorage === 'undefined') {
  const localStorageMock = (() => {
    let store: Record<string, string> = {}
    return {
      getItem(key: string) { return store[key] || null },
      setItem(key: string, value: string) { store[key] = value.toString() },
      clear() { store = {} },
      removeItem(key: string) { delete store[key] }
    }
  })()
  global.localStorage = localStorageMock as any
}

// Safe fallback mock for sessionStorage
if (typeof global.sessionStorage === 'undefined') {
  const sessionStorageMock = (() => {
    let store: Record<string, string> = {}
    return {
      getItem(key: string) { return store[key] || null },
      setItem(key: string, value: string) { store[key] = value.toString() },
      clear() { store = {} },
      removeItem(key: string) { delete store[key] }
    }
  })()
  global.sessionStorage = sessionStorageMock as any
}

describe('LocalKeyVault Service Tests', () => {
  beforeEach(async () => {
    mockDb.clear()
    global.localStorage.clear()
    global.sessionStorage.clear()
    vault.lock()
  })

  it('should initialize vault and encrypt keys in device mode', async () => {
    expect(await vault.isVaultInitialized()).toBe(false)
    
    await vault.initialize('device')
    expect(await vault.isVaultInitialized()).toBe(true)
    expect(vault.isUnlocked()).toBe(true)
    expect(vault.getUnlockMode()).toBe('device')

    await vault.addKey('google', 'test-gemini-key')
    const keys = await vault.getKeysForProvider('google')
    expect(keys).toContain('test-gemini-key')

    // Test lock
    vault.lock()
    expect(vault.isUnlocked()).toBe(false)
    await expect(vault.getKeysForProvider('google')).rejects.toThrow('Vault is locked')

    // Test unlock
    await vault.unlock()
    expect(vault.isUnlocked()).toBe(true)
    expect(await vault.getKeysForProvider('google')).toContain('test-gemini-key')
  })

  it('should initialize vault and encrypt keys in passphrase mode', async () => {
    await vault.initialize('passphrase', '123456')
    expect(vault.isUnlocked()).toBe(true)
    expect(vault.getUnlockMode()).toBe('passphrase')

    await vault.addKey('groq', 'test-groq-key')

    vault.lock()
    expect(vault.isUnlocked()).toBe(false)

    // Test wrong passphrase unlock
    await expect(vault.unlock('wrong-pin')).rejects.toThrow()
    expect(vault.isUnlocked()).toBe(false)

    // Test correct passphrase unlock
    await vault.unlock('123456')
    expect(vault.isUnlocked()).toBe(true)
    expect(await vault.getKeysForProvider('groq')).toContain('test-groq-key')
  })

  it('should support removing keys', async () => {
    await vault.initialize('device')
    await vault.addKey('google', 'key-1')
    await vault.addKey('google', 'key-2')
    
    let keys = await vault.getKeysForProvider('google')
    expect(keys.length).toBe(2)

    await vault.removeKey('google', 0)
    keys = await vault.getKeysForProvider('google')
    expect(keys.length).toBe(1)
    expect(keys[0]).toBe('key-2')
  })

  it('should recover unlock state after reload using sessionStorage key import', async () => {
    await vault.initialize('passphrase', 'securepass123')
    expect(vault.isUnlocked()).toBe(true)
    
    const cachedKey = global.sessionStorage.getItem('kg_vault_session_key')
    expect(cachedKey).toBeDefined()
    expect(cachedKey).not.toBe('device')

    // Simulate reload by locking but keeping sessionStorage
    vault.lock()
    expect(vault.isUnlocked()).toBe(false)
    global.sessionStorage.setItem('kg_vault_session_key', cachedKey!)

    const autoUnlocked = await vault.tryAutoUnlockFromSession()
    expect(autoUnlocked).toBe(true)
    expect(vault.isUnlocked()).toBe(true)
    expect(vault.getUnlockMode()).toBe('passphrase')
  })

  describe('Migration Tests', () => {
    it('should return requiresInitialization if vault is not initialized', async () => {
      const plaintextKeys = { google: ['key-to-migrate'] }
      global.localStorage.setItem(CACHE_KEYS.KEYS, JSON.stringify(plaintextKeys))

      const res = await migration.migrateLegacyKeys()
      expect(res.requiresInitialization).toBe(true)
      expect(res.migrated).toBe(false)
      expect(global.localStorage.getItem(CACHE_KEYS.KEYS)).toBe(JSON.stringify(plaintextKeys)) // should not delete
    })

    it('should return requiresUnlock if vault is initialized but locked', async () => {
      const plaintextKeys = { google: ['key-to-migrate'] }
      global.localStorage.setItem(CACHE_KEYS.KEYS, JSON.stringify(plaintextKeys))

      // Initialize and then lock
      await vault.initialize('device')
      vault.lock()

      const res = await migration.migrateLegacyKeys()
      expect(res.requiresUnlock).toBe(true)
      expect(res.migrated).toBe(false)
    })

    it('should successfully migrate plaintext keys and delete localStorage plain version', async () => {
      const plaintextKeys = { google: ['key-to-migrate-1', 'key-to-migrate-2'], groq: ['groq-key'] }
      global.localStorage.setItem(CACHE_KEYS.KEYS, JSON.stringify(plaintextKeys))

      // Initialize and unlock
      await vault.initialize('device')

      const res = await migration.migrateLegacyKeys()
      expect(res.migrated).toBe(true)
      expect(res.count).toBe(3)

      // Plaintext should be removed
      expect(global.localStorage.getItem(CACHE_KEYS.KEYS)).toBeNull()

      // Vault should contain the migrated keys
      const googleKeys = await vault.getKeysForProvider('google')
      const groqKeys = await vault.getKeysForProvider('groq')
      expect(googleKeys).toContain('key-to-migrate-1')
      expect(googleKeys).toContain('key-to-migrate-2')
      expect(groqKeys).toContain('groq-key')
    })
  })
})
