import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DualWriteOrderRepository } from '../dualWriteRepository'
import { GasOrderRepository } from '../../gas/gasRepositories'
import { PostgresOrderRepository } from '../../postgres/postgresRepository'
import * as outbox from '../../outbox/outbox'

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

vi.mock('../../gas/gasRepositories', () => {
  return {
    GasOrderRepository: vi.fn().mockImplementation(() => ({
      getHistory: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      getOrderById: vi.fn().mockResolvedValue({ ok: true }),
      saveOrder: vi.fn().mockResolvedValue({ ok: true }),
      deleteOrder: vi.fn().mockResolvedValue({ ok: true })
    }))
  }
})

vi.mock('../../postgres/postgresRepository', () => {
  return {
    PostgresOrderRepository: vi.fn().mockImplementation(() => ({
      getHistory: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      getOrderById: vi.fn().mockResolvedValue({ ok: true }),
      saveOrder: vi.fn().mockResolvedValue({ ok: true }),
      deleteOrder: vi.fn().mockResolvedValue({ ok: true })
    }))
  }
})

const originalFetch = global.fetch
const fetchMock = vi.fn().mockResolvedValue({
  ok: true,
  status: 200,
  text: () => Promise.resolve('ok'),
  json: () => Promise.resolve({ ok: true })
})

describe('DualWriteOrderRepository Tests', () => {
  let repository: DualWriteOrderRepository
  let mockGasRepo: any
  let mockPgRepo: any

  beforeEach(() => {
    getMockDb().clear()
    vi.clearAllMocks()
    global.fetch = fetchMock
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    repository = new DualWriteOrderRepository()
    mockGasRepo = vi.mocked(GasOrderRepository).mock.results[0].value
    mockPgRepo = vi.mocked(PostgresOrderRepository).mock.results[0].value
  })

  afterEach(async () => {
    // Wait for any pending background fetches to complete before restoring original fetch
    await new Promise(resolve => setTimeout(resolve, 10))
    vi.unstubAllEnvs()
    global.fetch = originalFetch
  })

  it('should call only GAS repo when backend mode is gas', async () => {
    vi.stubEnv('VITE_BACKEND_MODE', 'gas')
    mockGasRepo.getHistory.mockResolvedValue({ ok: true, data: [] })

    await repository.getHistory()

    expect(mockGasRepo.getHistory).toHaveBeenCalled()
    expect(mockPgRepo.getHistory).not.toHaveBeenCalled()
  })

  it('should call only Postgres repo when backend mode is postgres', async () => {
    vi.stubEnv('VITE_BACKEND_MODE', 'postgres')
    mockPgRepo.getHistory.mockResolvedValue({ ok: true, data: [] })

    await repository.getHistory()

    expect(mockPgRepo.getHistory).toHaveBeenCalled()
    expect(mockGasRepo.getHistory).not.toHaveBeenCalled()
  })

  it('should queue to outbox and return immediate success when saving in dual_write mode', async () => {
    vi.stubEnv('VITE_BACKEND_MODE', 'dual_write')
    const testData = { id: 'test-id', customer: { name: 'A', phone: '09' } }

    const res = await repository.saveOrder(testData)

    expect(res.ok).toBe(true)
    expect(res.id).toBe('test-id')
    expect(res.message).toContain('queued in local outbox')

    // Verify it was added to the outbox list
    const pending = await outbox.getPendingItems()
    expect(pending.length).toBe(1)
    expect(pending[0].id).toBe('test-id')
  })

  it('should queue to outbox and return immediate success when deleting in dual_write mode', async () => {
    vi.stubEnv('VITE_BACKEND_MODE', 'dual_write')

    const res = await repository.deleteOrder('test-id')

    expect(res.ok).toBe(true)
    expect(res.id).toBe('test-id')
    expect(res.message).toContain('Deletion queued in local outbox')

    // Verify it was added to the outbox list
    const pending = await outbox.getPendingItems()
    expect(pending.length).toBe(1)
    expect(pending[0].id).toBe('test-id')
    expect(pending[0].action).toBe('delete')
  })
})
