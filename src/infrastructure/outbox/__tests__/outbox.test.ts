import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { set as idbSet } from 'idb-keyval'
import * as outbox from '../outbox'
import { triggerSync } from '../outboxSync'
import { PostgresOrderRepository } from '../../postgres/postgresRepository'

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

const getMockDb = () => {
  if (!(globalThis as any).__mockDb) {
    (globalThis as any).__mockDb = new Map<string, any>()
  }
  return (globalThis as any).__mockDb
}

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
    
    saveSpy = vi.spyOn(PostgresOrderRepository.prototype, 'saveOrder').mockResolvedValue({ ok: true })
    deleteSpy = vi.spyOn(PostgresOrderRepository.prototype, 'deleteOrder').mockResolvedValue({ ok: true })
  })

  afterEach(async () => {
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

    const pending = await outbox.getPendingItems()
    expect(pending.length).toBe(1)
    expect(pending[0].id).toBe(bookingId)
    expect(pending[0].action).toBe('upsert')
    expect(pending[0].payload.customer.name).toBe('Nguyễn Văn A')
    expect(pending[0].idempotencyKey).toBe(idempotencyKey)

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

    await triggerSync()

    expect(saveSpy.mock.calls[0][0]).toEqual(expect.objectContaining({
      id: bookingId,
      idempotencyKey: idempKey
    }))

    const rawItems = await outbox.getOutboxRawItems()
    expect(rawItems[0].synced).toBe(true)
    expect(fetchMock).toHaveBeenCalled()
  })

  it('should increment attempt count and halt queue on postgres failure', async () => {
    saveSpy.mockResolvedValueOnce({ ok: false, message: 'Server down' })

    const bookingId = 'order-345'
    await outbox.addToOutbox(bookingId, 'upsert', { id: bookingId, note: 'Failed Sync' })

    await triggerSync()

    const rawItems = await outbox.getOutboxRawItems()
    expect(rawItems[0].synced).toBe(false)
    expect(rawItems[0].attempts).toBe(1)
    expect(rawItems[0].lastError).toBe('Server down')
  })

  it('should move item to Dead-Letter Queue (DLQ) after MAX_OUTBOX_RETRIES and continue syncing subsequent items', async () => {
    saveSpy.mockImplementation(async (payload: any) => {
      if (payload.id === 'order-dlq') {
        return { ok: false, message: 'Persistent Backend Error 500' }
      }
      return { ok: true }
    })

    await outbox.addToOutbox('order-dlq', 'upsert', { id: 'order-dlq', note: 'Broken payload' })
    await outbox.addToOutbox('order-ok', 'upsert', { id: 'order-ok', note: 'Normal order' })

    for (let i = 0; i < outbox.MAX_OUTBOX_RETRIES; i++) {
      await outbox.recordAttemptFailure('order-dlq', 'upsert', 'Persistent Backend Error 500')
    }

    const rawItems = await outbox.getOutboxRawItems()
    const dlqRaw = rawItems.find(i => i.id === 'order-dlq')
    expect(dlqRaw?.status).toBe('dead_letter')
    expect(dlqRaw?.attempts).toBe(outbox.MAX_OUTBOX_RETRIES)

    await triggerSync()

    const okRaw = (await outbox.getOutboxRawItems()).find(i => i.id === 'order-ok')
    expect(okRaw?.synced).toBe(true)

    const deadLetters = await outbox.getDeadLetterItems()
    expect(deadLetters.length).toBe(1)
    expect(deadLetters[0].id).toBe('order-dlq')

    const retried = await outbox.retryDeadLetterItem('order-dlq')
    expect(retried).toBe(true)

    const pendingAfterRetry = await outbox.getPendingItems()
    expect(pendingAfterRetry.some(i => i.id === 'order-dlq')).toBe(true)
  })

  it('should recover and sync successfully on subsequent trigger after initial failure', async () => {
    saveSpy.mockResolvedValueOnce({ ok: false, message: 'Network Timeout' })
    const bookingId = 'order-999'
    await outbox.addToOutbox(bookingId, 'upsert', { id: bookingId, note: 'Recoverable Sync' })

    await triggerSync()

    let rawItems = await outbox.getOutboxRawItems()
    expect(rawItems[0].synced).toBe(false)
    expect(rawItems[0].attempts).toBe(1)

    rawItems[0].nextAttemptAt = 0
    await idbSet('kg_outbox_items', rawItems)

    saveSpy.mockResolvedValueOnce({ ok: true })
    await triggerSync()

    rawItems = await outbox.getOutboxRawItems()
    expect(rawItems[0].synced).toBe(true)
  })
})
