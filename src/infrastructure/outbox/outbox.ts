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

async function encryptData(data: string, key: CryptoKey): Promise<{ ciphertext: ArrayBuffer; iv: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoder = new TextEncoder()
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(data)
  )
  return { ciphertext, iv }
}

async function decryptData(ciphertext: ArrayBuffer, iv: Uint8Array, key: CryptoKey): Promise<string> {
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  )
  const decoder = new TextDecoder()
  return decoder.decode(decrypted)
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
  const clonedPayload = JSON.parse(JSON.stringify(payload))

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
  
  const decrypted: DecryptedOutboxItem[] = []
  if (pending.length === 0) return decrypted

  const key = await getOrCreateOutboxKey()

  for (const item of pending) {
    try {
      const rawJson = await decryptData(item.ciphertext, item.iv, key)
      decrypted.push({
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
      })
    } catch (e: any) {
      console.error(`[Outbox] Failed to decrypt item ${item.id}:`, e.message)
    }
  }
  return decrypted
}

export async function getAllOutboxItemsDecrypted(): Promise<DecryptedOutboxItem[]> {
  const rawItems = await getOutboxRawItems()
  const unSynced = rawItems.filter(item => !item.synced)
  if (unSynced.length === 0) return []

  const decrypted: DecryptedOutboxItem[] = []
  const key = await getOrCreateOutboxKey()

  for (const item of unSynced) {
    try {
      const rawJson = await decryptData(item.ciphertext, item.iv, key)
      decrypted.push({
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
      })
    } catch (e: any) {
      console.error(`[Outbox] Failed to decrypt item ${item.id}:`, e.message)
      decrypted.push({
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
      })
    }
  }
  return decrypted
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

export async function recordAttemptFailure(id: string, action: 'upsert' | 'delete', errorMsg: string): Promise<void> {
  const items = await getOutboxRawItems()
  const idx = items.findIndex(item => item.id === id && item.action === action && !item.synced)
  if (idx >= 0) {
    items[idx].attempts += 1
    items[idx].lastError = errorMsg
    items[idx].lastAttemptAt = Date.now()
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
