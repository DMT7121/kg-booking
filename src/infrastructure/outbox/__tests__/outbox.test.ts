import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as outbox from '../outbox'
import { triggerSync } from '../outboxSync'
import { PostgresOrderRepository } from '../../postgres/postgresRepository'

// Mock idb-keyval
const mockDb = new Map<string, any>()
vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: string) => mockDb.get(key)),
  set: vi.fn(async (key: string, val: any) => { mockDb.set(key, val) }),
  del: vi.fn(async (key: string) => { mockDb.delete(key) })
}))

// Mock fetch for Sheets background sync trigger
const originalFetch = global.fetch
const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) })

describe('Outbox and OutboxSync Integration Tests', () => {
  let saveSpy: any
  let deleteSpy: any

  beforeEach(() => {
    mockDb.clear()
    vi.clearAllMocks()
    global.fetch = fetchMock
    
    // Spy on PostgresOrderRepository prototype methods
    saveSpy = vi.spyOn(PostgresOrderRepository.prototype, 'saveOrder').mockResolvedValue({ ok: true })
    deleteSpy = vi.spyOn(PostgresOrderRepository.prototype, 'deleteOrder').mockResolvedValue({ ok: true })
  })

  afterEach(() => {
    global.fetch = originalFetch
    saveSpy.mockRestore()
    deleteSpy.mockRestore()
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
})
