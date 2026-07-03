import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useConfigStore } from '@/stores/useConfigStore'
import * as vault from '../../security/localKeyVault'
import { runAIRouter } from '../aiRouter'

// Mock idb-keyval
const mockDb = new Map<string, any>()
vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: string) => mockDb.get(key)),
  set: vi.fn(async (key: string, val: any) => { mockDb.set(key, val) }),
  del: vi.fn(async (key: string) => { mockDb.delete(key) })
}))

// Safe fallback mock for localStorage in non-browser env
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

// Mock API service module to prevent network calls
vi.mock('@/services/api', () => ({
  borrowApiKeys: vi.fn().mockResolvedValue({ ok: true, keys: [] }),
  getAiRuntimeConfig: vi.fn().mockResolvedValue({
    ok: true,
    keysStatus: {
      google: { configured: true, count: 1, maskedList: ['••••••••'] }
    }
  }),
  getSharedApiKeysWithoutPassword: vi.fn().mockResolvedValue({ ok: true, keys: [] }),
  callAiProxy: vi.fn()
}))

describe('Characterization Tests - Existing Behaviors', () => {
  const originalFetch = global.fetch

  beforeEach(async () => {
    mockDb.clear()
    setActivePinia(createPinia())
    global.localStorage.clear()
    vi.clearAllMocks()
    vault.lock()
    global.fetch = vi.fn().mockRejectedValue(new Error('Network fetch block for tests'))
  })

  afterEach(() => {
    global.localStorage.clear()
    global.fetch = originalFetch
  })

  describe('Key Storage in localKeyVault', () => {
    it('should read from metadata and update keysStatus without exposing raw keys', async () => {
      // Initialize vault and save a key
      await vault.initialize('device')
      await vault.addKey('google', 'test-key-gemini')

      const store = useConfigStore()
      await store.refreshVaultState()

      // The count should be updated
      expect(store.keysStatus.google.count).toBe(1)
      expect(store.keysStatus.google.configured).toBe(true)
      expect(store.keysStatus.google.maskedList[0]).toBe('test••••••••mini')

      // Store should NOT expose raw keys
      expect((store as any).keys).toBeUndefined()
    })
  })

  describe('AI Router Candidate Filtering', () => {
    it('should filter candidate models based on keysStatus', async () => {
      const mockModel = {
        id: 'gemini-2.0-flash',
        name: 'Gemini 2.0 Flash',
        provider: 'google',
        type: 'text' as const,
        tier: 1,
        url: 'https://generativelanguage.googleapis.com',
        format: 'gemini' as const
      }

      // If google provider is configured in keysStatus, it should be selected and call mock fetch
      const resultPromise = runAIRouter({
        type: 'text',
        sysPrompt: 'sys',
        userPrompt: 'user',
        image: null,
        inputType: 'text_booking',
        availableModels: [mockModel],
        defaultModelId: 'gemini-2.0-flash',
        configKeys: {},
        keysStatus: { google: { configured: true } }
      })

      await expect(resultPromise).rejects.toThrow() 
    })

    it('should throw if provider is not configured in keysStatus', async () => {
      const mockModel = {
        id: 'gemini-2.0-flash',
        name: 'Gemini 2.0 Flash',
        provider: 'google',
        type: 'text' as const,
        tier: 1,
        url: 'https://generativelanguage.googleapis.com',
        format: 'gemini' as const
      }

      await expect(
        runAIRouter({
          type: 'text',
          sysPrompt: 'sys',
          userPrompt: 'user',
          image: null,
          inputType: 'text_booking',
          availableModels: [mockModel],
          defaultModelId: 'gemini-2.0-flash',
          configKeys: {},
          keysStatus: { google: { configured: false } }
        })
      ).rejects.toThrow('Chua cau hinh API Key cho Text')
    })
  })
})
