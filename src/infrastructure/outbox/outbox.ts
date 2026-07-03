import { get as idbGet, set as idbSet } from 'idb-keyval'

const OUTBOX_KEY_NAME = 'kg_outbox_encryption_key'
const OUTBOX_ITEMS_STORE = 'kg_outbox_items'

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

export async function addToOutbox(id: string, action: 'upsert' | 'delete', payload: any): Promise<string> {
  const key = await getOrCreateOutboxKey()
  const { ciphertext, iv } = await encryptData(JSON.stringify(payload), key)
  
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
    idempotencyKey
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
  const pending = rawItems.filter(item => !item.synced && !item.lastError?.startsWith('Conflict detected'))
  
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
        idempotencyKey: item.idempotencyKey
      })
    } catch (e: any) {
      console.error(`[Outbox] Failed to decrypt item ${item.id}:`, e.message)
    }
  }
  return decrypted
}

export async function markAsSynced(id: string, action: 'upsert' | 'delete'): Promise<void> {
  const items = await getOutboxRawItems()
  const idx = items.findIndex(item => item.id === id && item.action === action && !item.synced)
  if (idx >= 0) {
    items[idx].synced = true
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
