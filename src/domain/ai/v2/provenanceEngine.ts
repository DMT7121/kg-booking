import type { BookingFactEvent } from './factEvents'

export interface ProvenanceRecord {
  slot: string
  value: any
  sourceTurnIndex: number
  evidence: string
  speaker: string
  extractor: string
  operation: string
  confidence: number
  supersededBy?: string
  isFinal: boolean
}

export interface BookingAuditTrail {
  traceId: string
  receivedAt: string
  rawTextLength: number
  totalTurns: number
  totalEvents: number
  records: Record<string, ProvenanceRecord>
  eventHistory: Array<{
    turn: number
    speaker: string
    slot: string
    op: string
    val: any
    evidence: string
  }>
}

/**
 * Builds a structured, explainable provenance audit trail from turns and events.
 */
export function buildProvenanceAuditTrail(
  traceId: string,
  events: BookingFactEvent[]
): BookingAuditTrail {
  const records: Record<string, ProvenanceRecord> = {}
  const eventHistory: BookingAuditTrail['eventHistory'] = []

  for (const ev of events) {
    eventHistory.push({
      turn: ev.sourceTurnIndex,
      speaker: ev.speaker,
      slot: ev.slot,
      op: ev.operation,
      val: ev.value,
      evidence: ev.evidence
    })

    records[ev.slot] = {
      slot: ev.slot,
      value: ev.value,
      sourceTurnIndex: ev.sourceTurnIndex,
      evidence: ev.evidence,
      speaker: ev.speaker,
      extractor: ev.explicitness,
      operation: ev.operation,
      confidence: ev.extractionConfidence,
      supersededBy: ev.supersedesEventId,
      isFinal: !ev.supersedesEventId
    }
  }

  return {
    traceId,
    receivedAt: new Date().toISOString(),
    rawTextLength: 0,
    totalTurns: 0,
    totalEvents: events.length,
    records,
    eventHistory
  }
}
