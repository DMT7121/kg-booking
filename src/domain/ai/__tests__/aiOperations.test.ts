import { describe, it, expect, beforeEach } from 'vitest'
import { aiOperationsTracker } from '../aiOperations'

describe('AI Operations Telemetry Tests', () => {
  beforeEach(() => {
    localStorage.clear()
    aiOperationsTracker.clear()
  })

  it('should record requests, cache hits and compute telemetry report', () => {
    aiOperationsTracker.recordRequest(200, true) // Hit
    aiOperationsTracker.recordRequest(400, false) // Miss
    aiOperationsTracker.recordRequest(300, true) // Hit

    const report = aiOperationsTracker.getTelemetryReport()
    expect(report.totalRequests).toBe(3)
    expect(report.cacheHitRate).toBe(67) // 2 / 3 = 67%
    expect(report.averageLatencyMs).toBe(300)
  })

  it('should track human corrections by field and record error rates', () => {
    aiOperationsTracker.recordRequest(250)
    aiOperationsTracker.recordCorrection({
      field: 'guestCount',
      originalValue: 4,
      correctedValue: 6,
      confidence: 0.75
    })

    const report = aiOperationsTracker.getTelemetryReport()
    expect(report.totalCorrections).toBe(1)
    expect(report.fieldCorrectionRates.guestCount).toBeDefined()
    expect(report.fieldCorrectionRates.guestCount.corrected).toBe(1)
  })
})
