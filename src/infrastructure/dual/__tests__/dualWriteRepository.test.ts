import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DualWriteOrderRepository } from '../dualWriteRepository'
import { GasOrderRepository } from '../../gas/gasRepositories'
import { PostgresOrderRepository } from '../../postgres/postgresRepository'

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

  it('should dual-write to both when mode is dual_write and return result', async () => {
    vi.stubEnv('VITE_BACKEND_MODE', 'dual_write')
    const testData = { id: 'test-id', customer: { name: 'A', phone: '09' } }
    mockPgRepo.saveOrder.mockResolvedValue({ ok: true, id: 'test-id' })
    mockGasRepo.saveOrder.mockResolvedValue({ ok: true, id: 'test-id' })

    const res = await repository.saveOrder(testData)

    expect(mockPgRepo.saveOrder).toHaveBeenCalledWith(testData)
    expect(mockGasRepo.saveOrder).toHaveBeenCalledWith(testData)
    expect(res.ok).toBe(true)
  })

  it('should handle PG success and GAS failure correctly in dual_write mode', async () => {
    vi.stubEnv('VITE_BACKEND_MODE', 'dual_write')
    const testData = { id: 'test-id', customer: { name: 'A', phone: '09' } }
    mockPgRepo.saveOrder.mockResolvedValue({ ok: true, id: 'test-id' })
    mockGasRepo.saveOrder.mockResolvedValue({ ok: false, message: 'GAS Error' })

    const res = await repository.saveOrder(testData)

    // PG should be called again to mark pending sync
    expect(mockPgRepo.saveOrder).toHaveBeenLastCalledWith(expect.objectContaining({
      sheet_sync_pending: true
    }))
    expect(res.ok).toBe(true)
  })

  it('should handle PG failure and GAS success correctly in dual_write mode', async () => {
    vi.stubEnv('VITE_BACKEND_MODE', 'dual_write')
    const testData = { id: 'test-id', customer: { name: 'A', phone: '09' } }
    mockPgRepo.saveOrder.mockResolvedValue({ ok: false, message: 'PG Error' })
    mockGasRepo.saveOrder.mockResolvedValue({ ok: true, id: 'test-id' })

    const res = await repository.saveOrder(testData)

    expect(res.pg_sync_failed).toBe(true)
    expect(res.warning).toContain('PostgreSQL save failed')
  })
})
