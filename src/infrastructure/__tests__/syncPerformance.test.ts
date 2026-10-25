import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.hoisted(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://mock-supabase.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'mock-anon-key')
})

vi.mock('idb-keyval', () => {
  if (!(globalThis as any).__syncPerfMockDb) {
    ;(globalThis as any).__syncPerfMockDb = new Map<string, any>()
  }
  return {
    get: vi.fn(async (key: string) => (globalThis as any).__syncPerfMockDb.get(key)),
    set: vi.fn(async (key: string, val: any) => {
      ;(globalThis as any).__syncPerfMockDb.set(key, val)
    }),
    del: vi.fn(async (key: string) => {
      ;(globalThis as any).__syncPerfMockDb.delete(key)
    })
  }
})

import { PostgresOrderRepository } from '../postgres/postgresRepository'
import * as outbox from '../outbox/outbox'
import { triggerSync } from '../outbox/outboxSync'
import { fetchWithRetry } from '../gas/gasClient'
import { setActivePinia, createPinia } from 'pinia'

describe('Google Sheets, Supabase & Outbox Sync Performance Optimizations', () => {
  const originalFetch = global.fetch
  const mockFetch = vi.fn()

  beforeEach(() => {
    setActivePinia(createPinia())
    ;(globalThis as any).__syncPerfMockDb?.clear()
    vi.clearAllMocks()
    global.fetch = mockFetch
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.stubEnv('VITE_SUPABASE_URL', 'https://mock-supabase.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'mock-anon-key')
    global.fetch = originalFetch
  })

  it('batches multiple orders into a SINGLE PostgREST HTTP upsert and deduplicates colliding IDs', async () => {
    const repo = new PostgresOrderRepository()
    mockFetch.mockImplementation(async (_url: string, init?: RequestInit) => {
      const parsedBody = JSON.parse(String(init?.body || '[]'))
      return new Response(JSON.stringify(parsedBody), { status: 200 })
    })

    const payloads = [
      { id: 'KG-20261025-001', customer: { name: 'Khách 1', phone: '0901111111', date: '25/10/2026', time: '18:00', pax: 4 } },
      { id: 'KG-20261025-002', customer: { name: 'Khách 2', phone: '0902222222', date: '25/10/2026', time: '19:00', pax: 6 } },
      // Colliding ID updated later in the same batch: latest row wins without triggering Postgres ON CONFLICT duplicate error
      { id: 'KG-20261025-001', customer: { name: 'Khách 1 (Sửa)', phone: '0901111111', date: '25/10/2026', time: '18:30', pax: 8 } }
    ]

    const res = await repo.saveOrdersBatch(payloads)

    expect(res.ok).toBe(true)
    expect(res.results).toHaveLength(3)
    // Only ONE HTTP call instead of 3 serial HTTP calls
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const sentRows = JSON.parse(String(mockFetch.mock.calls[0][1].body))
    expect(Array.isArray(sentRows)).toBe(true)
    expect(sentRows).toHaveLength(2)
    const updatedRow = sentRows.find((r: any) => r.customer_name === 'Khách 1 (Sửa)')
    expect(updatedRow).toBeDefined()
    expect(updatedRow.guest_count).toBe(8)
  })

  it('fetches multi-page Supabase history (>1,000 rows) using parallel page batches', async () => {
    const repo = new PostgresOrderRepository()
    const makeRows = (count: number, startIdx: number) =>
      Array.from({ length: count }, (_, i) => ({
        id: `uuid-${startIdx + i}`,
        customer_name: `Khách ${startIdx + i}`,
        customer_phone: '0909000111',
        booking_date: '2026-10-25',
        start_time: '18:30:00',
        guest_count: 4
      }))

    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('offset=0&')) return new Response(JSON.stringify(makeRows(1000, 0)), { status: 200 })
      if (url.includes('offset=1000&')) return new Response(JSON.stringify(makeRows(1000, 1000)), { status: 200 })
      if (url.includes('offset=2000&')) return new Response(JSON.stringify(makeRows(250, 2000)), { status: 200 })
      return new Response(JSON.stringify([]), { status: 200 })
    })

    const res = await repo.getHistory()
    expect(res.ok).toBe(true)
    expect(res.data).toHaveLength(2250)
  })

  it('runs PostgreSQL and Google Sheets outbox sync CONCURRENTLY in dual_write mode with single-pass decryption', async () => {
    vi.stubEnv('VITE_BACKEND_MODE', 'dual_write')

    await outbox.addToOutbox(
      'dual-fast-1',
      'upsert',
      { id: 'dual-fast-1', customer: { name: 'Anh Hoàng', phone: '0911222333' } },
      { syncedToPg: false, syncedToSheets: false }
    )
    await outbox.addToOutbox(
      'dual-fast-2',
      'upsert',
      { id: 'dual-fast-2', customer: { name: 'Chị Lan', phone: '0944555666' } },
      { syncedToPg: false, syncedToSheets: false }
    )

    const saveOrderSpy = vi
      .spyOn(PostgresOrderRepository.prototype, 'saveOrder')
      .mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 40))
        return { ok: true, id: 'ok' }
      })

    mockFetch.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 40))
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    })

    const getPendingSpy = vi.spyOn(outbox, 'getPendingItems')

    const t0 = performance.now()
    const syncResult = await triggerSync(true)
    const elapsed = performance.now() - t0

    expect(syncResult).toEqual({ processed: 2, failures: 0 })
    // Single-pass decryption: 1 initial batch load + 1 empty tail check = 2 calls (instead of N+1 decryptions)
    expect(getPendingSpy).toHaveBeenCalledTimes(2)
    // Concurrent PG(40ms) + Sheets(40ms) x 2 items ~= 80-130ms (well below serial 160ms+ overhead)
    expect(elapsed).toBeLessThan(155)

    saveOrderSpy.mockRestore()
    getPendingSpy.mockRestore()
  })

  it('eliminates 3,000ms dead retry sleep when fetchWithRetry runs in direct GAS mode', async () => {
    vi.stubEnv('VITE_BACKEND_MODE', 'gas')
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, message: 'Direct GAS saved' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    )

    const t0 = performance.now()
    const res = await fetchWithRetry({ action: 'saveOrder', data: { id: 'gas-direct-fast' } }, 3, undefined, {
      silent: true
    })
    const elapsed = performance.now() - t0

    expect(res.ok).toBe(true)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    // Previously slept 1000ms + 2000ms = 3000ms before calling GAS_DIRECT_URL; now < 100ms!
    expect(elapsed).toBeLessThan(250)
  })
})
