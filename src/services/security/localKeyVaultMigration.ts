import * as vault from './localKeyVault'
import { CACHE_KEYS } from '@/utils/constants'

export interface MigrationResult {
  migrated: boolean
  count: number
  requiresInitialization?: boolean
  requiresUnlock?: boolean
  keysToMigrate?: Record<string, string[]>
  error?: string
}

export async function migrateLegacyKeys(): Promise<MigrationResult> {
  if (typeof localStorage === 'undefined') {
    return { migrated: false, count: 0 }
  }

  const legacyKeysJson = localStorage.getItem(CACHE_KEYS.KEYS)
  if (!legacyKeysJson) {
    return { migrated: false, count: 0 }
  }

  let legacyKeys: Record<string, string[]> = {}
  try {
    legacyKeys = JSON.parse(legacyKeysJson)
  } catch (e) {
    console.error('[Migration] Failed to parse legacy keys JSON', e)
    return { migrated: false, count: 0, error: 'Malformed legacy keys JSON' }
  }

  const totalKeys = Object.values(legacyKeys).reduce((acc, list) => acc + (list?.length || 0), 0)
  if (totalKeys === 0) {
    // Plaintext key exists but is empty, clear it idempotent
    localStorage.removeItem(CACHE_KEYS.KEYS)
    return { migrated: true, count: 0 }
  }

  const isInitialized = await vault.isVaultInitialized()
  if (!isInitialized) {
    return { requiresInitialization: true, keysToMigrate: legacyKeys, migrated: false, count: 0 }
  }

  if (!vault.isUnlocked()) {
    return { requiresUnlock: true, migrated: false, count: 0 }
  }

  try {
    let migratedCount = 0
    // 1. Add all keys to vault
    for (const provider of Object.keys(legacyKeys)) {
      const keys = legacyKeys[provider] || []
      for (const rawKey of keys) {
        if (rawKey && rawKey !== 'free') {
          await vault.addKey(provider, rawKey)
          migratedCount++
        }
      }
    }

    // 2. Verification Step
    let verified = true
    for (const provider of Object.keys(legacyKeys)) {
      const legacyProviderKeys = legacyKeys[provider] || []
      const vaultProviderKeys = await vault.getKeysForProvider(provider)
      
      for (const rawKey of legacyProviderKeys) {
        if (rawKey && rawKey !== 'free' && !vaultProviderKeys.includes(rawKey)) {
          verified = false
          break
        }
      }
      if (!verified) break
    }

    if (verified) {
      // 3. Clear plaintext legacy keys only after verified successful write
      localStorage.removeItem(CACHE_KEYS.KEYS)
      console.info(`[Migration] Successfully migrated ${migratedCount} keys and purged legacy storage`)
      return { migrated: true, count: migratedCount }
    } else {
      throw new Error('Verification failed: keys in vault do not match legacy keys')
    }
  } catch (e: any) {
    console.error('[Migration] Failed migrating legacy keys into secure vault:', e.message)
    return { migrated: false, count: 0, error: e.message }
  }
}
