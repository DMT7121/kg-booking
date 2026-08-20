export interface AiCorrectionEvent {
  id: string
  field: string
  originalValue: any
  correctedValue: any
  confidence: number
  provider?: string
  timestamp: number
}

export interface AiTelemetryReport {
  totalRequests: number
  cacheHitRate: number
  averageLatencyMs: number
  circuitBreakerTrips: number
  totalCorrections: number
  fieldCorrectionRates: Record<string, { total: number; corrected: number; errorRate: number }>
}

const AI_CORRECTIONS_KEY = 'kg_ai_corrections_v1'

class AiOperationsTracker {
  private corrections: AiCorrectionEvent[] = []
  private requestCount = 0
  private cacheHitCount = 0
  private totalLatency = 0
  private circuitBreakerTripCount = 0

  constructor() {
    this.load()
  }

  public recordRequest(latencyMs: number, isCacheHit = false): void {
    this.requestCount++
    if (isCacheHit) this.cacheHitCount++
    this.totalLatency += latencyMs
  }

  public recordCircuitTrip(): void {
    this.circuitBreakerTripCount++
  }

  public recordCorrection(event: Omit<AiCorrectionEvent, 'id' | 'timestamp'>): AiCorrectionEvent {
    const record: AiCorrectionEvent = {
      id: `cor_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      field: event.field,
      originalValue: event.originalValue,
      correctedValue: event.correctedValue,
      confidence: event.confidence,
      provider: event.provider || 'gemini',
      timestamp: Date.now()
    }

    this.corrections.unshift(record)
    if (this.corrections.length > 500) {
      this.corrections = this.corrections.slice(0, 500)
    }

    this.save()
    return record
  }

  public getTelemetryReport(): AiTelemetryReport {
    const totalRequests = Math.max(1, this.requestCount)
    const cacheHitRate = Math.round((this.cacheHitCount / totalRequests) * 100)
    const averageLatencyMs = Math.round(this.totalLatency / totalRequests)

    const fieldMap: Record<string, { total: number; corrected: number; errorRate: number }> = {}

    for (const cor of this.corrections) {
      if (!fieldMap[cor.field]) {
        fieldMap[cor.field] = { total: 0, corrected: 0, errorRate: 0 }
      }
      fieldMap[cor.field].corrected++
    }

    // Default base metrics
    Object.keys(fieldMap).forEach((f) => {
      fieldMap[f].total = Math.max(fieldMap[f].corrected, this.requestCount)
      fieldMap[f].errorRate = Math.round((fieldMap[f].corrected / fieldMap[f].total) * 100)
    })

    return {
      totalRequests: this.requestCount,
      cacheHitRate,
      averageLatencyMs,
      circuitBreakerTrips: this.circuitBreakerTripCount,
      totalCorrections: this.corrections.length,
      fieldCorrectionRates: fieldMap
    }
  }

  public getRecentCorrections(limit = 20): AiCorrectionEvent[] {
    return this.corrections.slice(0, limit)
  }

  public clear(): void {
    this.corrections = []
    this.requestCount = 0
    this.cacheHitCount = 0
    this.totalLatency = 0
    this.circuitBreakerTripCount = 0
    this.save()
  }

  private load(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = localStorage.getItem(AI_CORRECTIONS_KEY)
        if (stored) {
          this.corrections = JSON.parse(stored)
        }
      }
    } catch (e) {
      console.warn('[AiOperationsTracker] Failed to load corrections', e)
    }
  }

  private save(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(AI_CORRECTIONS_KEY, JSON.stringify(this.corrections))
      }
    } catch (e) {
      console.warn('[AiOperationsTracker] Failed to save corrections', e)
    }
  }
}

export const aiOperationsTracker = new AiOperationsTracker()
