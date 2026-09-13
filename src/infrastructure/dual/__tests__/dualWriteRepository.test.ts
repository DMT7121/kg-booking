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

  it('should write directly to pg and gas and return success when saving in dual_write mode', async () => {
    vi.stubEnv('VITE_BACKEND_MODE', 'dual_write')
    const testData = { id: 'test-id', customer: { name: 'A', phone: '09' } }
    mockPgRepo.saveOrder.mockResolvedValue({ ok: true, id: 'test-id' })
    mockGasRepo.saveOrder.mockResolvedValue({ ok: true, id: 'test-id', message: 'Saved to GAS' })

    const res = await repository.saveOrder(testData)

    expect(res.ok).toBe(true)
    expect(res.id).toBe('test-id')
    expect(mockPgRepo.saveOrder).toHaveBeenCalledWith(testData, '')
    expect(mockGasRepo.saveOrder).toHaveBeenCalledWith(testData)
  })

  it('should delete directly from pg and gas and return success when deleting in dual_write mode', async () => {
    vi.stubEnv('VITE_BACKEND_MODE', 'dual_write')
    mockPgRepo.deleteOrder.mockResolvedValue({ ok: true, id: 'test-id' })
    mockGasRepo.deleteOrder.mockResolvedValue({ ok: true, id: 'test-id', message: 'Deleted from GAS' })

    const res = await repository.deleteOrder('test-id')

    expect(res.ok).toBe(true)
    expect(res.id).toBe('test-id')
    expect(mockPgRepo.deleteOrder).toHaveBeenCalledWith('test-id', undefined, '')
    expect(mockGasRepo.deleteOrder).toHaveBeenCalledWith('test-id', undefined, '')
  })

  it('should prioritize Postgres-first when reading history in dual_write mode', async () => {
    vi.stubEnv('VITE_BACKEND_MODE', 'dual_write')
    mockPgRepo.getHistory.mockResolvedValue({ ok: true, data: [{ id: 'order-pg-1' }] })
    mockGasRepo.getHistory.mockResolvedValue({ ok: true, data: [{ id: 'order-gas-1' }] })

    const res = await repository.getHistory()

    expect(res.ok).toBe(true)
    expect(res.data[0].id).toBe('order-pg-1')
    expect(mockPgRepo.getHistory).toHaveBeenCalled()
    expect(mockGasRepo.getHistory).not.toHaveBeenCalled()
  })

  it('should fallback to GAS when Postgres fails to read history in dual_write mode', async () => {
    vi.stubEnv('VITE_BACKEND_MODE', 'dual_write')
    mockPgRepo.getHistory.mockRejectedValue(new Error('PG down'))
    mockGasRepo.getHistory.mockResolvedValue({ ok: true, data: [{ id: 'order-gas-fallback' }] })

    const res = await repository.getHistory()

    expect(res.ok).toBe(true)
    expect(res.data[0].id).toBe('order-gas-fallback')
    expect(mockPgRepo.getHistory).toHaveBeenCalled()
    expect(mockGasRepo.getHistory).toHaveBeenCalled()
  })

  it('should enqueue to outbox and return pending status when both PG and GAS fail in dual_write mode (offline)', async () => {
    vi.stubEnv('VITE_BACKEND_MODE', 'dual_write')
    const addToOutboxSpy = vi.spyOn(outbox, 'addToOutbox')
    mockPgRepo.saveOrder.mockRejectedValue(new Error('Network error PG'))
    mockGasRepo.saveOrder.mockRejectedValue(new Error('Network error GAS'))

    const testData = { id: 'offline-order-1', customer: { name: 'Offline User', phone: '0912345678' } }
    const res = await repository.saveOrder(testData)

    expect(res.ok).toBe(true)
    expect(res.status).toBe('pending')
    expect(res.id).toBe('offline-order-1')
    expect(addToOutboxSpy).toHaveBeenCalledWith('offline-order-1', 'upsert', testData)
    addToOutboxSpy.mockRestore()
  })

  it('should enqueue to outbox and return partially_synced when GAS succeeds but PG fails', async () => {
    vi.stubEnv('VITE_BACKEND_MODE', 'dual_write')
    const addToOutboxSpy = vi.spyOn(outbox, 'addToOutbox')
    mockPgRepo.saveOrder.mockResolvedValue({ ok: false, message: 'PG timeout' })
    mockGasRepo.saveOrder.mockResolvedValue({ ok: true, id: 'partial-order-1' })

    const testData = { id: 'partial-order-1', customer: { name: 'Partial User', phone: '0912345678' } }
    const res = await repository.saveOrder(testData)

    expect(res.ok).toBe(true)
    expect(res.status).toBe('partially_synced')
    expect(addToOutboxSpy).toHaveBeenCalledWith('partial-order-1', 'upsert', testData)
    addToOutboxSpy.mockRestore()
  })

  it('should enqueue to outbox and return partially_synced when PG succeeds but GAS fails', async () => {
    vi.stubEnv('VITE_BACKEND_MODE', 'dual_write')
    const addToOutboxSpy = vi.spyOn(outbox, 'addToOutbox')
    mockPgRepo.saveOrder.mockResolvedValue({ ok: true, id: 'partial-order-2' })
    mockGasRepo.saveOrder.mockResolvedValue({ ok: false, message: 'GAS quota exceeded' })

    const testData = { id: 'partial-order-2', customer: { name: 'Partial User 2', phone: '0912345678' } }
    const res = await repository.saveOrder(testData)

    expect(res.ok).toBe(true)
    expect(res.status).toBe('partially_synced')
    expect(addToOutboxSpy).toHaveBeenCalledWith('partial-order-2', 'upsert', testData)
    addToOutboxSpy.mockRestore()
  })

  it('should enqueue to outbox and return pending status when deleteOrder fails in dual_write mode', async () => {
    vi.stubEnv('VITE_BACKEND_MODE', 'dual_write')
    const addToOutboxSpy = vi.spyOn(outbox, 'addToOutbox')
    mockPgRepo.deleteOrder.mockRejectedValue(new Error('Network error PG'))
    mockGasRepo.deleteOrder.mockRejectedValue(new Error('Network error GAS'))

    const res = await repository.deleteOrder('del-order-1')

    expect(res.ok).toBe(true)
    expect(res.status).toBe('pending')
    expect(addToOutboxSpy).toHaveBeenCalledWith('del-order-1', 'delete', expect.objectContaining({ id: 'del-order-1' }))
    addToOutboxSpy.mockRestore()
  })
})
