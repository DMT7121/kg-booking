export type BookingInputSource =
  | 'zalo'
  | 'messenger'
  | 'sms'
  | 'form'
  | 'voice'
  | 'manual'
  | 'conversation'
  | 'unknown'

export type SpeakerRole = 'customer' | 'staff' | 'system' | 'unknown'

export interface ConversationTurn {
  id: string
  index: number
  speaker: SpeakerRole
  rawText: string
  normalizedText: string
  timestamp?: string
}

export interface BookingInputEnvelope {
  readonly id: string
  readonly rawText: string
  readonly source: BookingInputSource
  readonly receivedAt: string
  readonly turns: readonly ConversationTurn[]
}

/**
 * Creates an immutable BookingInputEnvelope ensuring rawText is strictly preserved.
 */
export function createBookingEnvelope(
  rawText: string,
  options?: {
    source?: BookingInputSource
    turns?: ConversationTurn[]
    id?: string
  }
): BookingInputEnvelope {
  const envelope: BookingInputEnvelope = Object.freeze({
    id: options?.id || `env_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    rawText: String(rawText ?? ''),
    source: options?.source || 'unknown',
    receivedAt: new Date().toISOString(),
    turns: Object.freeze(options?.turns ? [...options.turns] : [])
  })

  return envelope
}

export const createInputEnvelope = createBookingEnvelope
