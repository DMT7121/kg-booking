import { get as idbGet, set as idbSet } from 'idb-keyval'

const OUTBOX_KEY_NAME = 'kg_outbox_encryption_key'
const OUTBOX_ITEMS_STORE = 'kg_outbox_items'
const OUTBOX_IMAGES_STORE = 'kg_outbox_images'

export async function saveImageToBuffer(id: string, imageBase64: string): Promise<void> {
  const images = (await idbGet<Record<string, string>>(OUTBOX_IMAGES_STORE)) || {}
  images[id] = imageBase64
  await idbSet(OUTBOX_IMAGES_STORE, images)
}

export async function getImageFromBuffer(id: string): Promise<string | null> {
  const images = (await idbGet<Record<string, string>>(OUTBOX_IMAGES_STORE)) || {}
  return images[id] || null
}

export async function deleteImageFromBuffer(id: string): Promise<void> {
  const images = (await idbGet<Record<string, string>>(OUTBOX_IMAGES_STORE)) || {}
  delete images[id]
  await idbSet(OUTBOX_IMAGES_STORE, images)
}

export interface OutboxItem {
  id: string
  action: 'upsert' | 'delete'
  ciphertext: ArrayBuffer
  iv: Uint8Array
  createdAt: number
  synced: boolean
  attempts: number
  lastError: string | null
  idempotencyKey: string
  syncedToPg?: boolean
  syncedToSheets?: boolean
  lastAttemptAt?: number
}

export interface DecryptedOutboxItem {
  id: string
  action: 'upsert' | 'delete'
  payload: any
  createdAt: number
  synced: boolean
  attempts: number
  lastError: string | null
  idempotencyKey: string
  syncedToPg?: boolean
  syncedToSheets?: boolean
  lastAttemptAt?: number
}

export interface PartialSyncStatus {
  syncedToPg?: boolean
  syncedToSheets?: boolean
}

async function getOrCreateOutboxKey(): Promise<CryptoKey> {
  let key = await idbGet<CryptoKey>(OUTBOX_KEY_NAME)
  if (!key) {
    key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false, // non-extractable
      ['encrypt', 'decrypt']
    )
    await idbSet(OUTBOX_KEY_NAME, key)
  }
  return key
}

const sharedOutboxEncoder = new TextEncoder()
const sharedOutboxDecoder = new TextDecoder()

function fastClonePayload<T>(payload: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(payload)
    } catch {}
  }
  return JSON.parse(JSON.stringify(payload))
}

/**
 * Normalizes any order payload variant (fastPayload, HistoryOrder/optimisticOrder with parsedCustomer,
 * or legacy BookingDetailModal payload with stringified .data) into a canonical sync payload
 * while preserving all original fields.
 */
export function normalizeOrderPayloadForSync(id: string, rawPayload: any): any {
  if (!rawPayload || typeof rawPayload !== 'object') {
    return { id }
  }
  const cloned: any = JSON.parse(JSON.stringify(rawPayload))
  if (!cloned.id && id) {
    cloned.id = id
  }

  let inner: any = null
  if (typeof cloned.data === 'string' && cloned.data.trim().startsWith('{')) {
    try {
      inner = JSON.parse(cloned.data)
    } catch {}
  } else if (cloned.data && typeof cloned.data === 'object') {
    inner = cloned.data
  }

  const srcCust = cloned.customer || cloned.parsedCustomer || inner?.customer || inner?.parsedCustomer || null
  if (!cloned.customer && srcCust && typeof srcCust === 'object') {
    cloned.customer = {
      name: srcCust.name || cloned.customerName || cloned.customer_name || cloned.name || '',
      phone: srcCust.phone || cloned.customerPhone || cloned.customer_phone || cloned.phone || '',
      date: srcCust.date || cloned.bookingDate || cloned.booking_date || '',
      time: srcCust.time || cloned.booking_time || '18:00',
      pax: String(srcCust.pax ?? cloned.guest_count ?? '1'),
      tables: cloned.customerTable || srcCust.tables || srcCust.table_number || '',
      type: srcCust.type || cloned.status || 'Ăn thường',
      note: srcCust.note || cloned.note || ''
    }
  } else if (!cloned.customer && (cloned.customerName || cloned.customer_name || cloned.name)) {
    cloned.customer = {
      name: cloned.customerName || cloned.customer_name || cloned.name || '',
      phone: cloned.customerPhone || cloned.customer_phone || cloned.phone || '',
      date: cloned.date || cloned.bookingDate || cloned.booking_date || '',
      time: cloned.time || cloned.booking_time || '18:00',
      pax: String(cloned.pax ?? cloned.guest_count ?? '1'),
      tables: cloned.customerTable || cloned.tables || cloned.table_number || '',
      type: cloned.type || cloned.status || 'Ăn thường',
      note: cloned.note || ''
    }
  }

  if (!Array.isArray(cloned.items)) {
    if (Array.isArray(cloned.menuItems)) {
      cloned.items = cloned.menuItems
    } else if (Array.isArray(inner?.items)) {
      cloned.items = inner.items
    } else if (Array.isArray(inner?.menuItems)) {
      cloned.items = inner.menuItems
    }
  }

  if (cloned.total === undefined || cloned.total === null) {
    if (cloned.totalAmount !== undefined) {
      cloned.total = Number(cloned.totalAmount) || 0
    } else if (inner?.total !== undefined) {
      cloned.total = Number(inner.total) || 0
    } else if (inner?.totalAmount !== undefined) {
      cloned.total = Number(inner.totalAmount) || 0
    }
  }

  if (!cloned.deposit && (cloned.isDeposited !== undefined || cloned.depositAmount !== undefined || cloned.transferImage || inner?.deposit)) {
    const innerDep = inner?.deposit || {}
    cloned.deposit = {
      isPaid: Boolean(cloned.isDeposited || innerDep.isPaid),
      amount: Number(cloned.depositAmount ?? innerDep.amount) || 0,
      image: cloned.transferImage || innerDep.image || '',
      note: innerDep.note || ''
    }
  }

  if (cloned.deposit && cloned.deposit.image === '__OFFLINE_IMAGE_BUFFER_REF__') {
    cloned.deposit.image = ''
  }
  if (cloned.transferImage === '__OFFLINE_IMAGE_BUFFER_REF__') {
    cloned.transferImage = ''
  }
  if (cloned.staff === null) {
    cloned.staff = { name: 'Admin', phone: '' }
  }

  return cloned
}

async function encryptData(data: string, key: CryptoKey): Promise<{ ciphertext: ArrayBuffer; iv: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    sharedOutboxEncoder.encode(data)
  )
  return { ciphertext, iv }
}

async function decryptData(ciphertext: ArrayBuffer, iv: Uint8Array, key: CryptoKey): Promise<string> {
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  )
  return sharedOutboxDecoder.decode(decrypted)
}

export async function getOutboxRawItems(): Promise<OutboxItem[]> {
  return (await idbGet<OutboxItem[]>(OUTBOX_ITEMS_STORE)) || []
}

async function saveOutboxRawItems(items: OutboxItem[]): Promise<void> {
  await idbSet(OUTBOX_ITEMS_STORE, items)
}

export async function addToOutbox(
  id: string, 
  action: 'upsert' | 'delete', 
  payload: any,
  partialStatus?: PartialSyncStatus
): Promise<string> {
  // Clone payload to avoid modifying the caller's reference
  const clonedPayload = fastClonePayload(payload)

  let depositImage: string | null = null
  if (clonedPayload && clonedPayload.deposit && clonedPayload.deposit.image) {
    depositImage = clonedPayload.deposit.image
    clonedPayload.deposit.image = '__OFFLINE_IMAGE_BUFFER_REF__'
  }
  
  if (depositImage) {
    await saveImageToBuffer(id, depositImage)
  }

  const key = await getOrCreateOutboxKey()
  const { ciphertext, iv } = await encryptData(JSON.stringify(clonedPayload), key)
  
  const items = await getOutboxRawItems()
  const existingIdx = items.findIndex(item => item.id === id && item.action === action && !item.synced)
  
  let idempotencyKey = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2)
  if (existingIdx >= 0) {
    idempotencyKey = items[existingIdx].idempotencyKey
  }

  const newItem: OutboxItem = {
    id,
    action,
    ciphertext,
    iv,
    createdAt: existingIdx >= 0 ? items[existingIdx].createdAt : Date.now(),
    synced: false,
    attempts: existingIdx >= 0 ? items[existingIdx].attempts : 0,
    lastError: null,
    idempotencyKey,
    syncedToPg: partialStatus?.syncedToPg ?? (existingIdx >= 0 ? items[existingIdx].syncedToPg : false),
    syncedToSheets: partialStatus?.syncedToSheets ?? (existingIdx >= 0 ? items[existingIdx].syncedToSheets : false),
    lastAttemptAt: Date.now()
  }

  if (existingIdx >= 0) {
    items[existingIdx] = newItem
  } else {
    items.push(newItem)
  }

  await saveOutboxRawItems(items)
  return idempotencyKey
}

export async function updateTargetSyncStatus(
  id: string,
  action: 'upsert' | 'delete',
  status: PartialSyncStatus
): Promise<void> {
  const items = await getOutboxRawItems()
  const idx = items.findIndex(item => item.id === id && item.action === action && !item.synced)
  if (idx >= 0) {
    if (status.syncedToPg !== undefined) items[idx].syncedToPg = status.syncedToPg
    if (status.syncedToSheets !== undefined) items[idx].syncedToSheets = status.syncedToSheets
    await saveOutboxRawItems(items)
  }
}

export async function getPendingItems(includeDeadLetter = false): Promise<DecryptedOutboxItem[]> {
  const rawItems = await getOutboxRawItems()
  const pending = rawItems.filter(item => {
    if (item.synced) return false
    if (item.lastError?.startsWith('Conflict detected')) return false
    if (!includeDeadLetter && item.attempts >= 5) return false
    return true
  })
  
  if (pending.length === 0) return []

  const key = await getOrCreateOutboxKey()

  // Decrypt all pending items concurrently via WebCrypto
  const settled = await Promise.all(
    pending.map(async (item): Promise<DecryptedOutboxItem | null> => {
      try {
        const rawJson = await decryptData(item.ciphertext, item.iv, key)
        return {
          id: item.id,
          action: item.action,
          payload: JSON.parse(rawJson),
          createdAt: item.createdAt,
          synced: item.synced,
          attempts: item.attempts,
          lastError: item.lastError,
          idempotencyKey: item.idempotencyKey,
          syncedToPg: item.syncedToPg,
          syncedToSheets: item.syncedToSheets,
          lastAttemptAt: item.lastAttemptAt
        }
      } catch (e: any) {
        console.error(`[Outbox] Failed to decrypt item ${item.id}:`, e.message)
        return null
      }
    })
  )

  return settled.filter((it): it is DecryptedOutboxItem => it !== null)
}

export async function getAllOutboxItemsDecrypted(): Promise<DecryptedOutboxItem[]> {
  const rawItems = await getOutboxRawItems()
  const unSynced = rawItems.filter(item => !item.synced)
  if (unSynced.length === 0) return []

  const key = await getOrCreateOutboxKey()

  return Promise.all(
    unSynced.map(async (item): Promise<DecryptedOutboxItem> => {
      try {
        const rawJson = await decryptData(item.ciphertext, item.iv, key)
        return {
          id: item.id,
          action: item.action,
          payload: JSON.parse(rawJson),
          createdAt: item.createdAt,
          synced: item.synced,
          attempts: item.attempts,
          lastError: item.lastError,
          idempotencyKey: item.idempotencyKey,
          syncedToPg: item.syncedToPg,
          syncedToSheets: item.syncedToSheets,
          lastAttemptAt: item.lastAttemptAt
        }
      } catch (e: any) {
        console.error(`[Outbox] Failed to decrypt item ${item.id}:`, e.message)
        return {
          id: item.id,
          action: item.action,
          payload: null,
          createdAt: item.createdAt,
          synced: item.synced,
          attempts: item.attempts,
          lastError: item.lastError || 'Decryption failure',
          idempotencyKey: item.idempotencyKey,
          syncedToPg: item.syncedToPg,
          syncedToSheets: item.syncedToSheets,
          lastAttemptAt: item.lastAttemptAt
        }
      }
    })
  )
}

export async function markAsSynced(id: string, action: 'upsert' | 'delete'): Promise<void> {
  const items = await getOutboxRawItems()
  const idx = items.findIndex(item => item.id === id && item.action === action && !item.synced)
  if (idx >= 0) {
    items[idx].synced = true
    items[idx].syncedToPg = true
    items[idx].syncedToSheets = true
    items[idx].lastError = null
    await saveOutboxRawItems(items)
  }
}

export async function recordAttemptFailure(
  id: string,
  action: 'upsert' | 'delete',
  errorMsg: string,
  partialStatus?: PartialSyncStatus
): Promise<void> {
  const items = await getOutboxRawItems()
  const idx = items.findIndex(item => item.id === id && item.action === action && !item.synced)
  if (idx >= 0) {
    items[idx].attempts += 1
    items[idx].lastError = errorMsg
    items[idx].lastAttemptAt = Date.now()
    if (partialStatus?.syncedToPg !== undefined) items[idx].syncedToPg = partialStatus.syncedToPg
    if (partialStatus?.syncedToSheets !== undefined) items[idx].syncedToSheets = partialStatus.syncedToSheets
    await saveOutboxRawItems(items)
  }
}

export async function retryOutboxItem(id: string, action: 'upsert' | 'delete'): Promise<void> {
  const items = await getOutboxRawItems()
  const idx = items.findIndex(item => item.id === id && item.action === action)
  if (idx >= 0) {
    items[idx].attempts = 0
    items[idx].lastError = null
    items[idx].synced = false
    items[idx].lastAttemptAt = 0
    await saveOutboxRawItems(items)
  }
}

export async function getUnsyncedOutboxCount(): Promise<number> {
  const items = await getOutboxRawItems()
  return items.filter(item => !item.synced).length
}

export async function resetFailedOutboxAttempts(includeConflicts = false): Promise<number> {
  const items = await getOutboxRawItems()
  let resetCount = 0
  for (const item of items) {
    if (item.synced) continue
    if (!includeConflicts && item.lastError?.startsWith('Conflict detected')) continue
    if (item.attempts > 0 || item.lastError) {
      item.attempts = 0
      item.lastError = null
      item.lastAttemptAt = 0
      resetCount++
    }
  }
  if (resetCount > 0) {
    await saveOutboxRawItems(items)
  }
  return resetCount
}

export async function removeOutboxItem(id: string, action: 'upsert' | 'delete'): Promise<void> {
  const items = await getOutboxRawItems()
  const filtered = items.filter(item => !(item.id === id && item.action === action))
  await saveOutboxRawItems(filtered)
  await deleteImageFromBuffer(id).catch(() => {})
}

export async function cleanupOutboxHistory(retentionDays = 7): Promise<number> {
  const items = await getOutboxRawItems()
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  
  const initialCount = items.length
  const filtered = items.filter(item => !item.synced || item.createdAt > cutoff)
  
  await saveOutboxRawItems(filtered)
  return initialCount - filtered.length
}

export async function purgeAllOutbox(): Promise<void> {
  await idbSet(OUTBOX_ITEMS_STORE, [])
}
