import { get as idbGet, set as idbSet } from 'idb-keyval'

const OUTBOX_KEY_NAME = 'kg_outbox_encryption_key'
const OUTBOX_ITEMS_STORE = 'kg_outbox_items'
const OUTBOX_IMAGES_STORE = 'kg_outbox_images'

export const MAX_OUTBOX_RETRIES = 5

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
  status?: 'pending' | 'syncing' | 'synced' | 'failed' | 'dead_letter'
  nextAttemptAt?: number
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
  status?: 'pending' | 'syncing' | 'synced' | 'failed' | 'dead_letter'
  nextAttemptAt?: number
}

async function getOrCreateOutboxKey(): Promise<CryptoKey> {
  let key = await idbGet<CryptoKey>(OUTBOX_KEY_NAME)
  if (!key) {
    key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
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

export async function addToOutbox(id: string, action: 'upsert' | 'delete', payload: any): Promise<string> {
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
    createdAt: Date.now(),
    synced: false,
    attempts: 0,
    lastError: null,
    idempotencyKey,
    status: 'pending',
    nextAttemptAt: 0
  }

  if (existingIdx >= 0) {
    items[existingIdx] = newItem
  } else {
    items.push(newItem)
  }

  await saveOutboxRawItems(items)
  return idempotencyKey
}

export async function getPendingItems(): Promise<DecryptedOutboxItem[]> {
  const rawItems = await getOutboxRawItems()
  const now = Date.now()

  const pending = rawItems.filter(item => 
    !item.synced && 
    item.status !== 'dead_letter' &&
    item.attempts < MAX_OUTBOX_RETRIES &&
    (!item.nextAttemptAt || item.nextAttemptAt <= now) &&
    !item.lastError?.startsWith('Conflict detected')
  )
  
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
        status: item.status || 'pending',
        nextAttemptAt: item.nextAttemptAt
      })
    } catch (e: any) {
      console.error(`[Outbox] Failed to decrypt item ${item.id}:`, e.message)
    }
  }
  return decrypted
}

export async function getDeadLetterItems(): Promise<DecryptedOutboxItem[]> {
  const rawItems = await getOutboxRawItems()
  const deadLetters = rawItems.filter(item => 
    !item.synced && 
    (item.status === 'dead_letter' || item.attempts >= MAX_OUTBOX_RETRIES)
  )
  
  const decrypted: DecryptedOutboxItem[] = []
  if (deadLetters.length === 0) return decrypted

  const key = await getOrCreateOutboxKey()

  for (const item of deadLetters) {
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
        status: 'dead_letter',
        nextAttemptAt: item.nextAttemptAt
      })
    } catch (e: any) {
      console.error(`[Outbox] Failed to decrypt dead-letter item ${item.id}:`, e.message)
    }
  }
  return decrypted
}

export async function retryDeadLetterItem(id: string): Promise<boolean> {
  const items = await getOutboxRawItems()
  const idx = items.findIndex(item => item.id === id && !item.synced)
  if (idx >= 0) {
    items[idx].attempts = 0
    items[idx].lastError = null
    items[idx].status = 'pending'
    items[idx].nextAttemptAt = 0
    await saveOutboxRawItems(items)
    return true
  }
  return false
}

export async function markAsSynced(id: string, action: 'upsert' | 'delete'): Promise<void> {
  const items = await getOutboxRawItems()
  const idx = items.findIndex(item => item.id === id && item.action === action && !item.synced)
  if (idx >= 0) {
    items[idx].synced = true
    items[idx].status = 'synced'
    items[idx].lastError = null
    await saveOutboxRawItems(items)
  }
}

export async function recordAttemptFailure(id: string, action: 'upsert' | 'delete', errorMsg: string): Promise<void> {
  const items = await getOutboxRawItems()
  const idx = items.findIndex(item => item.id === id && item.action === action && !item.synced)
  if (idx >= 0) {
    const attempts = items[idx].attempts + 1
    items[idx].attempts = attempts
    items[idx].lastError = errorMsg
    
    // Calculate exponential backoff delay with jitter (1s, 2s, 4s, 8s, 16s... up to 60s)
    const backoffMs = Math.min(1000 * Math.pow(2, attempts - 1) + Math.floor(Math.random() * 500), 60000)
    items[idx].nextAttemptAt = Date.now() + backoffMs
    
    if (attempts >= MAX_OUTBOX_RETRIES) {
      items[idx].status = 'dead_letter'
      console.warn(`[Outbox] Item ${id} reached max retries (${MAX_OUTBOX_RETRIES}). Moved to Dead-Letter Queue.`)
    } else {
      items[idx].status = 'failed'
    }
    
    await saveOutboxRawItems(items)
  }
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
