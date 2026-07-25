import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as outbox from '../outbox'
import { triggerSync } from '../outboxSync'
import { PostgresOrderRepository } from '../../postgres/postgresRepository'

// Mock idb-keyval using a lazy global map to avoid hoisting/initialization race conditions
vi.mock('idb-keyval', () => {
  if (!(globalThis as any).__mockDb) {
    (globalThis as any).__mockDb = new Map<string, any>()
  }
  return {
    get: vi.fn(async (key: string) => (globalThis as any).__mockDb.get(key)),
    set: vi.fn(async (key: string, val: any) => { (globalThis as any).__mockDb.set(key, val) }),
    del: vi.fn(async (key: string) => { (globalThis as any).__mockDb.delete(key) })
  }
})

// Retrieve the database map reference safely for test assertions/clearing
const getMockDb = () => {
  if (!(globalThis as any).__mockDb) {
    (globalThis as any).__mockDb = new Map<string, any>()
  }
  return (globalThis as any).__mockDb
}

// Mock fetch for Sheets background sync trigger
const originalFetch = global.fetch
const fetchMock = vi.fn().mockResolvedValue({
  ok: true,
  status: 200,
  text: () => Promise.resolve('ok'),
  json: () => Promise.resolve({ ok: true })
})

describe('Outbox and OutboxSync Integration Tests', () => {
  let saveSpy: any
  let deleteSpy: any

  beforeEach(() => {
    getMockDb().clear()
    vi.clearAllMocks()
    global.fetch = fetchMock
    
    vi.stubEnv('VITE_BACKEND_MODE', 'postgres')
    vi.stubEnv('VITE_SUPABASE_URL', 'https://mock-supabase.supabase.co')
    
    // Spy on PostgresOrderRepository prototype methods
    saveSpy = vi.spyOn(PostgresOrderRepository.prototype, 'saveOrder').mockResolvedValue({ ok: true })
    deleteSpy = vi.spyOn(PostgresOrderRepository.prototype, 'deleteOrder').mockResolvedValue({ ok: true })
  })

  afterEach(async () => {
    // Wait for any pending background fetches to complete before restoring original fetch
    await new Promise(resolve => setTimeout(resolve, 10))
    global.fetch = originalFetch
    saveSpy.mockRestore()
    deleteSpy.mockRestore()
    vi.unstubAllEnvs()
  })

  it('should encrypt PII data and retrieve decrypted payload', async () => {
    const bookingId = 'order-123'
    const payload = {
      id: bookingId,
      customer: { name: 'Nguyễn Văn A', phone: '0901234567', date: '01/07/2026' }
    }

    const idempotencyKey = await outbox.addToOutbox(bookingId, 'upsert', payload)
    expect(idempotencyKey).toBeDefined()

    // Retrieve pending items, should be decrypted
    const pending = await outbox.getPendingItems()
    expect(pending.length).toBe(1)
    expect(pending[0].id).toBe(bookingId)
    expect(pending[0].action).toBe('upsert')
    expect(pending[0].payload.customer.name).toBe('Nguyễn Văn A')
    expect(pending[0].idempotencyKey).toBe(idempotencyKey)

    // Verify raw data in DB is encrypted (cannot find plaintext "Nguyễn Văn A")
    const rawItems = await outbox.getOutboxRawItems()
    expect(rawItems.length).toBe(1)
    
    const decoder = new TextDecoder()
    const rawText = decoder.decode(new Uint8Array(rawItems[0].ciphertext))
    expect(rawText).not.toContain('Nguyễn Văn A')
  })

  it('should sync pending outbox items to postgres and trigger background sheets sync', async () => {
    vi.stubEnv('VITE_BACKEND_MODE', 'dual_write')
    const bookingId = 'order-234'
    const payload = { id: bookingId, customer: { name: 'Customer B', phone: '0908888888' } }

    const idempKey = await outbox.addToOutbox(bookingId, 'upsert', payload)

    // Trigger sync
    await triggerSync()

    // Verify spy was called with idempotency key
    expect(saveSpy.mock.calls[0][0]).toEqual(expect.objectContaining({
      id: bookingId,
      idempotencyKey: idempKey
    }))

    // Verify outbox item marked as synced
    const rawItems = await outbox.getOutboxRawItems()
    expect(rawItems[0].synced).toBe(true)

    // Verify Sheets sync triggered in background via fetch
    expect(fetchMock).toHaveBeenCalled()
    const fetchBody = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(fetchBody.action).toBe('saveOrder')
    expect(fetchBody.id).toBe(bookingId)
  })

  it('should increment attempt count and halt queue on postgres failure', async () => {
    saveSpy.mockResolvedValueOnce({ ok: false, message: 'Server down' })

    const bookingId = 'order-345'
    await outbox.addToOutbox(bookingId, 'upsert', { id: bookingId, note: 'Failed Sync' })

    // Trigger sync
    await triggerSync()

    // Sync should halt and item remains unsynced but attempt incremented
    const rawItems = await outbox.getOutboxRawItems()
    expect(rawItems[0].synced).toBe(false)
    expect(rawItems[0].attempts).toBe(1)
    expect(rawItems[0].lastError).toBe('Server down')
  })

  it('should recover and sync successfully on subsequent trigger after initial crash/failure', async () => {
    // 1. First trigger fails
    saveSpy.mockResolvedValueOnce({ ok: false, message: 'Network Timeout' })
    const bookingId = 'order-999'
    await outbox.addToOutbox(bookingId, 'upsert', { id: bookingId, note: 'Recoverable Sync' })

    await triggerSync()

    let rawItems = await outbox.getOutboxRawItems()
    expect(rawItems[0].synced).toBe(false)
    expect(rawItems[0].attempts).toBe(1)

    // 2. Second trigger succeeds (Postgres recovers)
    saveSpy.mockResolvedValueOnce({ ok: true })
    await triggerSync()

    rawItems = await outbox.getOutboxRawItems()
    expect(rawItems[0].synced).toBe(true)
    expect(rawItems[0].attempts).toBe(1) // retains attempt metadata, but marked synced
  })

  it('should guarantee consistent idempotency key for exact same booking payload and version', async () => {
    const bookingId = 'order-idemp-123'
    const payload = { id: bookingId, version: 1, customer: { name: 'Idemp Test' } }

    const idempKey1 = await outbox.addToOutbox(bookingId, 'upsert', payload)
    const idempKey2 = await outbox.addToOutbox(bookingId, 'upsert', payload)

    // Idempotency key must be stable across multiple writes of the same record/version
    expect(idempKey1).toBe(idempKey2)
  })

  it('should skip conflict items and continue syncing subsequent non-conflict items in queue', async () => {
    // Mock saveOrder to fail with conflict for order-c1, but succeed for order-c2
    saveSpy.mockImplementation(async (payload: any) => {
      if (payload.id === 'order-c1') {
        return { ok: false, message: 'Conflict detected: table_time_overlap' }
      }
      return { ok: true }
    })

    await outbox.addToOutbox('order-c1', 'upsert', { id: 'order-c1', note: 'Conflicted' })
    await outbox.addToOutbox('order-c2', 'upsert', { id: 'order-c2', note: 'Normal' })

    // Trigger sync
    await triggerSync()

    // order-c1 should remain unsynced with attempts=1 and lastError='Conflict detected: table_time_overlap'
    const rawItems = await outbox.getOutboxRawItems()
    const c1 = rawItems.find(item => item.id === 'order-c1')
    const c2 = rawItems.find(item => item.id === 'order-c2')

    expect(c1?.synced).toBe(false)
    expect(c1?.attempts).toBe(1)
    expect(c1?.lastError).toContain('Conflict detected')

    // order-c2 should be successfully synced
    expect(c2?.synced).toBe(true)
  })
})
