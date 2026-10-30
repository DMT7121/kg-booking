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

  it('should track partial sync status and only sync missing target in dual_write mode', async () => {
    vi.stubEnv('VITE_BACKEND_MODE', 'dual_write')
    const bookingId = 'order-partial-1'
    const payload = { id: bookingId, customer: { name: 'Partial Test' } }

    // Enqueue with syncedToPg = true, syncedToSheets = false
    await outbox.addToOutbox(bookingId, 'upsert', payload, { syncedToPg: true, syncedToSheets: false })

    // Trigger sync
    await triggerSync()

    // Postgres saveOrder should NOT have been called because it was already synced to PG!
    expect(saveSpy).not.toHaveBeenCalled()

    // Sheets fetch should have been called
    expect(fetchMock).toHaveBeenCalled()

    // Both should now be marked synced
    const rawItems = await outbox.getOutboxRawItems()
    expect(rawItems[0].synced).toBe(true)
    expect(rawItems[0].syncedToPg).toBe(true)
    expect(rawItems[0].syncedToSheets).toBe(true)
  })

  it('should continue syncing subsequent items when an item fails sheets sync (non-blocking queue)', async () => {
    vi.stubEnv('VITE_BACKEND_MODE', 'dual_write')

    // Mock fetch to fail for order-fail, but succeed for order-pass
    fetchMock.mockImplementation(async (url: string, opts: any) => {
      const body = JSON.parse(opts.body)
      if (body.id === 'order-fail') {
        return { ok: false, status: 500, json: async () => ({ ok: false, message: 'GAS lock timeout' }) }
      }
      return { ok: true, status: 200, json: async () => ({ ok: true }) }
    })

    await outbox.addToOutbox('order-fail', 'upsert', { id: 'order-fail', name: 'Failed Sheets' })
    await outbox.addToOutbox('order-pass', 'upsert', { id: 'order-pass', name: 'Success Item' })

    const result = await triggerSync()

    const rawItems = await outbox.getOutboxRawItems()
    const failItem = rawItems.find(i => i.id === 'order-fail')
    const passItem = rawItems.find(i => i.id === 'order-pass')

    // order-fail should be unsynced with 1 attempt
    expect(failItem?.synced).toBe(false)
    expect(failItem?.attempts).toBe(1)

    // order-pass MUST be synced (not blocked by order-fail!)
    expect(passItem?.synced).toBe(true)
    expect(result.processed).toBe(1)
    expect(result.failures).toBe(1)
  })

  it('should support manual retry, item removal, and diagnostic retrieval', async () => {
    const bookingId = 'order-diag-1'
    await outbox.addToOutbox(bookingId, 'upsert', { id: bookingId, customer: { name: 'Diag Test' } })
    await outbox.recordAttemptFailure(bookingId, 'upsert', 'Simulated error')

    let decrypted = await outbox.getAllOutboxItemsDecrypted()
    expect(decrypted.length).toBe(1)
    expect(decrypted[0].attempts).toBe(1)
    expect(decrypted[0].lastError).toBe('Simulated error')

    // Retry resets attempts
    await outbox.retryOutboxItem(bookingId, 'upsert')
    decrypted = await outbox.getAllOutboxItemsDecrypted()
    expect(decrypted[0].attempts).toBe(0)
    expect(decrypted[0].lastError).toBeNull()

    // Remove clears the item
    await outbox.removeOutboxItem(bookingId, 'upsert')
    decrypted = await outbox.getAllOutboxItemsDecrypted()
    expect(decrypted.length).toBe(0)
  })

  it('should count dead-letter items (>= 5 attempts) in getUnsyncedOutboxCount and recover them via resetFailedOutboxAttempts', async () => {
    vi.stubEnv('VITE_BACKEND_MODE', 'dual_write')
    const bookingId = 'KG-20261026-223815-4JFM'
    await outbox.addToOutbox(
      bookingId,
      'upsert',
      { id: bookingId, customer: { name: 'Trần Văn Thưởng', phone: '0363070363', date: '28/10/2026', time: '20:00', tables: 'E1', pax: '16' }, total: 3665000 },
      { syncedToPg: false, syncedToSheets: false }
    )

    // Simulate 6 failed attempts ("Lần thử 6/5: Failed to save to Google Sheets")
    for (let i = 0; i < 6; i++) {
      await outbox.recordAttemptFailure(bookingId, 'upsert', 'Failed to save to Google Sheets')
    }

    // Standard auto-sync skips dead-letter items, but getUnsyncedOutboxCount still reports 1
    expect((await outbox.getPendingItems(false)).length).toBe(0)
    expect(await outbox.getUnsyncedOutboxCount()).toBe(1)

    // Reset failed attempts and run Dual-Write sync
    const resetCount = await outbox.resetFailedOutboxAttempts(false)
    expect(resetCount).toBe(1)

    const syncRes = await triggerSync(true)
    expect(syncRes).toEqual({ processed: 1, failures: 0 })
    expect(await outbox.getUnsyncedOutboxCount()).toBe(0)
    expect(saveSpy).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('should queue forceRetryAll=true instead of dropping when an initial auto-sync is already running', async () => {
    vi.stubEnv('VITE_BACKEND_MODE', 'dual_write')
    await outbox.addToOutbox('auto-1', 'upsert', { id: 'auto-1', customer: { name: 'Khách 1', phone: '0901111111' } })
    await outbox.addToOutbox('dead-2', 'upsert', { id: 'dead-2', customer: { name: 'Khách 2', phone: '0902222222' } })
    for (let i = 0; i < 6; i++) {
      await outbox.recordAttemptFailure('dead-2', 'upsert', 'Failed to save to Google Sheets')
    }

    saveSpy.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 25))
      return { ok: true }
    })

    // Fire auto-sync (forceRetryAll=false) and immediately fire manual "Đồng bộ tất cả ngay" (forceRetryAll=true)
    const pAuto = triggerSync(false)
    const pForce = triggerSync(true)

    const [resAuto, resForce] = await Promise.all([pAuto, pForce])
    expect(resForce.processed).toBe(2)
    expect(resAuto.processed).toBe(2)
    expect(await outbox.getUnsyncedOutboxCount()).toBe(0)
  })

  it('should normalize HistoryOrder/optimisticOrder payloads and suppress stale Telegram notifications', async () => {
    vi.stubEnv('VITE_BACKEND_MODE', 'dual_write')
    const bookingId = 'KG85053425901'
    await outbox.addToOutbox(bookingId, 'upsert', {
      id: bookingId,
      parsedCustomer: {
        name: 'Tường Linh',
        phone: '0934141687',
        date: '27/10/2026',
        time: '20:00',
        tables: 'C6',
        pax: '14'
      },
      menuItems: [{ name: 'Miến xào cua', qty: 2, price: 250000 }],
      totalAmount: 3998000,
      isDeposited: true,
      depositAmount: 1000000,
      staff: null
    })

    // Backdate createdAt to 73 hours ago
    const raw = await outbox.getOutboxRawItems()
    raw[0].createdAt = Date.now() - 73 * 3600 * 1000
    const { set } = await import('idb-keyval')
    await set('kg_outbox_items', raw)

    await triggerSync(true)

    expect(saveSpy).toHaveBeenCalledTimes(1)
    expect(saveSpy.mock.calls[0][0].customer.name).toBe('Tường Linh')
    expect(saveSpy.mock.calls[0][0].total).toBe(3998000)

    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(sentBody.action).toBe('saveOrder')
    expect(sentBody.data.customer.name).toBe('Tường Linh')
    expect(sentBody.data.items).toHaveLength(1)
    expect(sentBody.data.total).toBe(3998000)
    expect(sentBody.data.skipNotification).toBe(true)
  })

  it('should batch >= 4 queued orders via saveOrdersBatch and fallback to saveOrder for any failed batch entry', async () => {
    vi.stubEnv('VITE_BACKEND_MODE', 'dual_write')
    for (let i = 1; i <= 5; i++) {
      await outbox.addToOutbox(
        `batch-order-${i}`,
        'upsert',
        { id: `batch-order-${i}`, customer: { name: `Khách ${i}`, phone: `090000000${i}` }, total: 500000 },
        { syncedToPg: false, syncedToSheets: false }
      )
    }

    fetchMock.mockImplementation(async (_url: string, opts: any) => {
      const body = JSON.parse(opts.body)
      if (body.action === 'saveOrdersBatch') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            results: body.payloads.map((p: any, idx: number) =>
              idx === 4 ? { ok: false, message: 'Transient row error' } : { ok: true, id: p.id }
            )
          })
        }
      }
      // Per-item fallback for idx === 4 succeeds
      return { ok: true, status: 200, json: async () => ({ ok: true, id: body.id }) }
    })

    const res = await triggerSync(true)
    expect(res).toEqual({ processed: 5, failures: 0 })
    expect(await outbox.getUnsyncedOutboxCount()).toBe(0)
    const actionsCalled = fetchMock.mock.calls.map((c: any) => JSON.parse(c[1].body).action)
    expect(actionsCalled).toContain('saveOrdersBatch')
    expect(actionsCalled).toContain('saveOrder')
  })
})
