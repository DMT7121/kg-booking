import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DualWriteOrderRepository } from '../dualWriteRepository'
import { GasOrderRepository } from '../../gas/gasRepositories'
import { PostgresOrderRepository } from '../../postgres/postgresRepository'
import * as outbox from '../../outbox/outbox'

// Mock idb-keyval
const mockDb = new Map<string, any>()
vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: string) => mockDb.get(key)),
  set: vi.fn(async (key: string, val: any) => { mockDb.set(key, val) }),
  del: vi.fn(async (key: string) => { mockDb.delete(key) })
}))

vi.mock('../../gas/gasRepositories', () => {
  return {
    GasOrderRepository: vi.fn().mockImplementation(() => ({
      getHistory: vi.fn(),
      getOrderById: vi.fn(),
      saveOrder: vi.fn(),
      deleteOrder: vi.fn()
    }))
  }
})

vi.mock('../../postgres/postgresRepository', () => {
  return {
    PostgresOrderRepository: vi.fn().mockImplementation(() => ({
      getHistory: vi.fn(),
      getOrderById: vi.fn(),
      saveOrder: vi.fn(),
      deleteOrder: vi.fn()
    }))
  }
})

describe('DualWriteOrderRepository Tests', () => {
  let repository: DualWriteOrderRepository
  let mockGasRepo: any
  let mockPgRepo: any

  beforeEach(() => {
    mockDb.clear()
    vi.clearAllMocks()
    repository = new DualWriteOrderRepository()
    mockGasRepo = vi.mocked(GasOrderRepository).mock.results[0].value
    mockPgRepo = vi.mocked(PostgresOrderRepository).mock.results[0].value
  })

  afterEach(() => {
    vi.unstubAllEnvs()
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
