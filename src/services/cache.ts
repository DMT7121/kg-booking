/**
 * IndexedDB Cache Service (Offline-First)
 * Uses idb-keyval for lightweight key-value storage
 * 
 * Caches: history, menu, form drafts, bill images
 */
import { get, set, del, keys } from 'idb-keyval'

const PREFIX = 'kg_'

// --- Cache Keys ---
const CK = {
  HISTORY: `${PREFIX}history`,
  MENU: `${PREFIX}menu`,
  MENU_SHEETS: `${PREFIX}menu_sheets`,
  FORM_DRAFT: `${PREFIX}form_draft`,
  BILL_IMAGES: `${PREFIX}bill_images`,
  LAST_SYNC: `${PREFIX}last_sync`,
  OFFLINE_QUEUE: `${PREFIX}offline_queue`,
} as const

// --- Generic Cache Operations ---

/** Save data to IndexedDB with timestamp */
export async function cacheSet<T>(key: string, data: T): Promise<void> {
  try {
    await set(key, { data, timestamp: Date.now() })
  } catch (e) {
    console.warn('[Cache] Write failed:', key, e)
  }
}

/** Read data from IndexedDB */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const result = await get(key)
    return result?.data ?? null
  } catch (e) {
    console.warn('[Cache] Read failed:', key, e)
    return null
  }
}

/** Delete from IndexedDB */
export async function cacheDel(key: string): Promise<void> {
  try { await del(key) } catch { /* ignore */ }
}

/** Check if cache is fresh (within maxAge ms) */
export async function cacheIsFresh(key: string, maxAgeMs: number): Promise<boolean> {
  try {
    const result = await get(key)
    if (!result?.timestamp) return false
    return (Date.now() - result.timestamp) < maxAgeMs
  } catch {
    return false
  }
}

// --- Domain-Specific Operations ---

/** Cache history list */
export async function cacheHistory(data: any[]): Promise<void> {
  await cacheSet(CK.HISTORY, data)
}

/** Get cached history */
export async function getCachedHistory(): Promise<any[] | null> {
  return cacheGet<any[]>(CK.HISTORY)
}

/** Cache menu items */
export async function cacheMenu(sheetName: string, data: any[]): Promise<void> {
  await cacheSet(`${CK.MENU}_${sheetName}`, data)
}

/** Get cached menu */
export async function getCachedMenu(sheetName: string): Promise<any[] | null> {
  return cacheGet<any[]>(`${CK.MENU}_${sheetName}`)
}

/** Cache menu sheet names */
export async function cacheMenuSheets(sheets: string[]): Promise<void> {
  await cacheSet(CK.MENU_SHEETS, sheets)
}

/** Get cached menu sheets */
export async function getCachedMenuSheets(): Promise<string[] | null> {
  return cacheGet<string[]>(CK.MENU_SHEETS)
}

/** Auto-save form draft */
export async function saveFormDraft(formData: any): Promise<void> {
  await cacheSet(CK.FORM_DRAFT, formData)
}

/** Get saved form draft */
export async function getFormDraft(): Promise<any | null> {
  return cacheGet(CK.FORM_DRAFT)
}

/** Clear form draft */
export async function clearFormDraft(): Promise<void> {
  await cacheDel(CK.FORM_DRAFT)
}

// --- Offline Queue ---

interface QueueItem {
  id: string
  action: string
  payload: any
  timestamp: number
}

/** Add operation to offline queue */
export async function addToOfflineQueue(action: string, payload: any): Promise<void> {
  const queue = (await cacheGet<QueueItem[]>(CK.OFFLINE_QUEUE)) || []
  queue.push({
    id: crypto.randomUUID(),
    action,
    payload,
    timestamp: Date.now()
  })
  await cacheSet(CK.OFFLINE_QUEUE, queue)
}

/** Get all queued operations */
export async function getOfflineQueue(): Promise<QueueItem[]> {
  return (await cacheGet<QueueItem[]>(CK.OFFLINE_QUEUE)) || []
}

/** Clear offline queue */
export async function clearOfflineQueue(): Promise<void> {
  await cacheDel(CK.OFFLINE_QUEUE)
}

/** Remove specific item from queue */
export async function removeFromQueue(id: string): Promise<void> {
  const queue = (await cacheGet<QueueItem[]>(CK.OFFLINE_QUEUE)) || []
  await cacheSet(CK.OFFLINE_QUEUE, queue.filter(q => q.id !== id))
}

// --- Bill Image Cache (for offline preview) ---

/** Cache bill image (base64) with order ID */
export async function cacheBillImage(orderId: string, base64: string): Promise<void> {
  await cacheSet(`${CK.BILL_IMAGES}_${orderId}`, base64)
}

/** Get cached bill image */
export async function getCachedBillImage(orderId: string): Promise<string | null> {
  return cacheGet<string>(`${CK.BILL_IMAGES}_${orderId}`)
}

/** Get cache stats */
export async function getCacheStats(): Promise<{ keyCount: number }> {
  try {
    const allKeys = await keys()
    return { keyCount: allKeys.filter(k => String(k).startsWith(PREFIX)).length }
  } catch {
    return { keyCount: 0 }
  }
}
