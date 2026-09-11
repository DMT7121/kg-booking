import type { SpeakerRole } from './inputEnvelope'

export type BookingSlot =
  | 'customer_name'
  | 'phone'
  | 'contact_person'
  | 'guest_count'
  | 'adults_count'
  | 'children_count'
  | 'guest_range'
  | 'event_date'
  | 'event_time'
  | 'table_code'
  | 'table_preference'
  | 'table_rejection'
  | 'party_owner'
  | 'party_type'
  | 'deposit_amount'
  | 'deposit_sender'
  | 'deposit_note'
  | 'menu_item'
  | 'decor_color'
  | 'decor_special'
  | 'seating_preference'
  | 'dietary_notes'
  | 'allergy_warning'
  | 'smoking_preference'
  | 'conditional_request'
  | 'recommendation_intent'
  | 'general_note'

export type BookingOperation =
  | 'SET'
  | 'REPLACE'
  | 'APPEND'
  | 'REMOVE'
  | 'CLEAR'
  | 'CONFIRM'
  | 'REJECT'

export interface BookingFactEvent {
  id: string
  slot: BookingSlot
  operation: BookingOperation
  value: any
  previousValue?: any
  sourceTurnId: string
  sourceTurnIndex: number
  speaker: SpeakerRole
  evidence: string
  explicitness: 'explicit' | 'implicit' | 'inferred'
  extractionConfidence: number
  certainty?: number
  supersedesEventId?: string
  createdAt: string
}

export function createFactEvent(
  params: Omit<BookingFactEvent, 'id' | 'createdAt'>
): BookingFactEvent {
  return {
    ...params,
    id: `ev_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    createdAt: new Date().toISOString()
  }
}
