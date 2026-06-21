import { get, set, del, clear } from 'idb-keyval'
import { clearSemanticCache } from './semanticCache'
import { clearL1ApiCache } from '@/infrastructure/gas/gasClient'

export interface AIResponseCacheEntry<T = unknown> {
  value: T
  createdAt: number
  expiresAt: number
  schemaVersion: number
  menuFingerprint?: string
  correctionFingerprint?: string
}

export interface CacheOptions {
  ttl?: number // in milliseconds
  menuFingerprint?: string
  correctionFingerprint?: string
  schemaVersion?: number
}

// L1 Cache: Memory Map
const l1Cache = new Map<string, AIResponseCacheEntry<any>>()
const CURRENT_SCHEMA_VERSION = 1

/**
 * FNV-1a 32-bit hash algorithm for quick string fingerprinting
 */
export function hashString(str: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    // Multiply by FNV-1a prime
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)
  }
  return (h >>> 0).toString(16)
}

/**
 * Stable stringify to ensure object keys order is deterministic
 */
export function stableStringify(val: any): string {
  if (val === null || val === undefined) return ''
  if (Array.isArray(val)) {
    return '[' + val.map(stableStringify).join(',') + ']'
  }
  if (typeof val === 'object') {
    const keys = Object.keys(val).sort()
    return '{' + keys.map(k => `${k}:${stableStringify(val[k])}`).join(',') + '}'
  }
  return String(val)
}

// --- WORKER OFFLOADING FOR LARGE OBJECTS ---

const workerCode = `
  function stableStringify(val) {
    if (val === null || val === undefined) return '';
    if (Array.isArray(val)) {
      return '[' + val.map(stableStringify).join(',') + ']';
    }
    if (typeof val === 'object') {
      const keys = Object.sort ? Object.keys(val).sort() : Object.keys(val);
      return '{' + keys.map(k => k + ':' + stableStringify(val[k])).join(',') + '}';
    }
    return String(val);
  }

  function hashString(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return (h >>> 0).toString(16);
  }

  self.onmessage = function(e) {
    const { action, payload } = e.data;
    if (action === 'hash_and_stringify') {
      const str = stableStringify(payload);
      const hash = hashString(str);
      self.postMessage({ action, hash, str });
    }
  };
`;

let workerInstance: Worker | null = null

function getWorker(): Worker | null {
  if (typeof window === 'undefined' || !window.Worker) return null
  if (!workerInstance) {
    try {
      const blob = new Blob([workerCode], { type: 'application/javascript' })
      workerInstance = new Worker(URL.createObjectURL(blob))
    } catch (e) {
      console.warn('[Worker] Failed to create inline worker:', e)
    }
  }
  return workerInstance
}

export function hashAndStringifyLargeObject(obj: any): Promise<{ hash: string; str: string }> {
  return new Promise((resolve) => {
    const w = getWorker()
    if (!w) {
      const str = stableStringify(obj)
      const hash = hashString(str)
      resolve({ hash, str })
      return
    }
    const onMsg = (e: MessageEvent) => {
      if (e.data.action === 'hash_and_stringify') {
        w.removeEventListener('message', onMsg)
        resolve({ hash: e.data.hash, str: e.data.str })
      }
    }
    w.addEventListener('message', onMsg)
    w.postMessage({ action: 'hash_and_stringify', payload: obj })
  })
}

/**
 * Get cached AI response (L1 -> L2)
 */
export async function getCachedAIResponse<T>(
  key: string,
  options?: { menuFingerprint?: string; correctionFingerprint?: string }
): Promise<T | null> {
  const keyHash = hashString(key).slice(0, 8)
  const currentMenuFP = options?.menuFingerprint || ''
  const currentCorrFP = options?.correctionFingerprint || ''

  // 1. Check L1 Memory Cache
  const l1Entry = l1Cache.get(key)
  if (l1Entry) {
    if (Date.now() < l1Entry.expiresAt &&
        l1Entry.schemaVersion === CURRENT_SCHEMA_VERSION &&
        l1Entry.menuFingerprint === currentMenuFP &&
        l1Entry.correctionFingerprint === currentCorrFP) {
      console.info('[AI Cache] memory hit', { keyHash })
      return l1Entry.value as T
    }
    // Expired or stale
    l1Cache.delete(key)
  }

  // 2. Check L2 IndexedDB Cache
  try {
    const l2Entry = await get<AIResponseCacheEntry<T>>(key)
    if (l2Entry) {
      if (Date.now() < l2Entry.expiresAt &&
          l2Entry.schemaVersion === CURRENT_SCHEMA_VERSION &&
          l2Entry.menuFingerprint === currentMenuFP &&
          l2Entry.correctionFingerprint === currentCorrFP) {
        console.info('[AI Cache] idb hit', { keyHash })
        // Hydrate L1
        l1Cache.set(key, l2Entry)
        return l2Entry.value
      }
      // Expired or stale, cleanup
      await del(key)
    }
  } catch (err: any) {
    console.warn('[AI Cache] idb unavailable, using memory only', { errorName: err.name || 'Error' })
  }

  console.info('[AI Cache] miss', { keyHash })
  return null
}

/**
 * Save AI response (L1 + L2 async)
 */
export async function setCachedAIResponse<T>(
  key: string,
  value: T,
  options?: CacheOptions
): Promise<void> {
  const keyHash = hashString(key).slice(0, 8)
  const ttl = options?.ttl || 5 * 60 * 1000 // default 5 minutes
  const entry: AIResponseCacheEntry<T> = {
    value,
    createdAt: Date.now(),
    expiresAt: Date.now() + ttl,
    schemaVersion: options?.schemaVersion || CURRENT_SCHEMA_VERSION,
    menuFingerprint: options?.menuFingerprint || '',
    correctionFingerprint: options?.correctionFingerprint || ''
  }

  // 1. Write L1 Memory Cache
  l1Cache.set(key, entry)

  // 2. Write L2 IndexedDB Cache (async)
  try {
    await set(key, entry)
  } catch (err: any) {
    console.warn('[AI Cache] idb unavailable, using memory only', { errorName: err.name || 'Error' })
  }
}

/**
 * Delete specific cached entry
 */
export async function deleteCachedAIResponse(key: string): Promise<void> {
  l1Cache.delete(key)
  try {
    await del(key)
  } catch (e) {}
}

/**
 * Clear all cache entries
 */
export async function clearAIResponseCache(reason?: string): Promise<void> {
  l1Cache.clear()
  clearL1ApiCache()
  try {
    await clear()
    await clearSemanticCache()
  } catch (e) {}
  console.info('[AI Cache] cleared', { reason })
}
