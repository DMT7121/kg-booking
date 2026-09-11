import type { BookingFactEvent } from './factEvents'
import { resolveEventPrecedence } from './amendmentResolver'
import type { NumericRangeValue, BookingTimeValue } from './nonDestructiveNormalizer'

export interface BookingState {
  customer: {
    name: string
    phone: string
    contact_person?: string
  }
  booking: {
    event_date: string
    event_time: string
    guest_count: number | null
    adults?: number
    children?: number
    guest_range?: NumericRangeValue
    time_detail?: BookingTimeValue
    table_code: string
    need: string
  }
  table: {
    assigned: string[]
    preferences: string[]
    rejected: string[]
  }
  party: {
    owner_name: string
    type: string
    decor_color: string
    display_board_text: string
    mirror_board_text: string
    special_request: string
    seating_preference: string
    dietary_notes: string
    allergens: string[]
    smoking_area: boolean
    baby_chairs: number
  }
  deposit: {
    amount: number
    status: 'chờ cọc' | 'đã cọc' | 'không cọc'
    sender_name?: string
    transfer_note?: string
  }
  menu: {
    items: Array<{
      name: string
      quantity: number
      note: string
      unit_price?: number
      portion?: string
    }>
    conditional_requests: Array<{
      condition: string
      ifTrueAction: string
      ifFalseAction: string
    }>
    recommendation_intents: Array<{
      query: string
      criteria: string
      quantity: number
    }>
  }
  metadata: {
    version: number
    lastUpdatedTurn: number
    eventCount: number
    provenance: Record<string, {
      sourceTurn: number
      evidence: string
      operation: string
      confidence: number
    }>
  }
}

export function createInitialBookingState(): BookingState {
  return {
    customer: { name: '', phone: '' },
    booking: {
      event_date: '',
      event_time: '',
      guest_count: null,
      table_code: '',
      need: 'Ăn thường'
    },
    table: {
      assigned: [],
      preferences: [],
      rejected: []
    },
    party: {
      owner_name: '',
      type: 'Ăn thường',
      decor_color: '',
      display_board_text: '',
      mirror_board_text: '',
      special_request: '',
      seating_preference: '',
      dietary_notes: '',
      allergens: [],
      smoking_area: false,
      baby_chairs: 0
    },
    deposit: {
      amount: 0,
      status: 'chờ cọc'
    },
    menu: {
      items: [],
      conditional_requests: [],
      recommendation_intents: []
    },
    metadata: {
      version: 2,
      lastUpdatedTurn: 0,
      eventCount: 0,
      provenance: {}
    }
  }
}

/**
 * Pure deterministic reducer: reconstructs BookingState completely from an event stream.
 */
export function reduceBookingEvents(events: BookingFactEvent[]): BookingState {
  const state = createInitialBookingState()
  if (!events || events.length === 0) return state

  // Resolve precedence across all turns
  const resolvedEvents = resolveEventPrecedence(events)

  for (const ev of resolvedEvents) {
    state.metadata.eventCount++
    if (ev.sourceTurnIndex > state.metadata.lastUpdatedTurn) {
      state.metadata.lastUpdatedTurn = ev.sourceTurnIndex
    }

    // Record field provenance
    state.metadata.provenance[ev.slot] = {
      sourceTurn: ev.sourceTurnIndex,
      evidence: ev.evidence,
      operation: ev.operation,
      confidence: ev.extractionConfidence
    }

    switch (ev.slot) {
      case 'customer_name':
        if (ev.operation === 'SET' || ev.operation === 'REPLACE' || ev.operation === 'CONFIRM') {
          state.customer.name = String(ev.value || '').trim()
        }
        break

      case 'phone':
        if (ev.operation === 'SET' || ev.operation === 'REPLACE' || ev.operation === 'CONFIRM') {
          state.customer.phone = String(ev.value || '').trim()
        }
        break

      case 'contact_person':
        state.customer.contact_person = String(ev.value || '').trim()
        break

      case 'guest_count':
        if (typeof ev.value === 'number') {
          state.booking.guest_count = ev.value
        } else if (ev.value && typeof ev.value === 'object') {
          const range = ev.value as NumericRangeValue
          state.booking.guest_range = range
          state.booking.guest_count = range.exact || range.max || null
        }
        break

      case 'adults_count':
        state.booking.adults = Number(ev.value)
        break

      case 'children_count':
        state.booking.children = Number(ev.value)
        break

      case 'guest_range':
        state.booking.guest_range = ev.value
        if (ev.value?.exact) state.booking.guest_count = ev.value.exact
        break

      case 'event_date':
        state.booking.event_date = String(ev.value || '')
        break

      case 'event_time':
        state.booking.event_time = String(ev.value || '')
        break

      case 'table_code':
        if (ev.operation === 'REJECT') {
          if (!state.table.rejected.includes(ev.value)) state.table.rejected.push(ev.value)
          if (state.booking.table_code === ev.value) state.booking.table_code = ''
        } else {
          state.booking.table_code = String(ev.value || '')
          if (!state.table.assigned.includes(ev.value)) state.table.assigned.push(ev.value)
        }
        break

      case 'table_rejection':
        if (!state.table.rejected.includes(ev.value)) state.table.rejected.push(ev.value)
        if (state.booking.table_code === ev.value) state.booking.table_code = ''
        break

      case 'table_preference':
        if (!state.table.preferences.includes(ev.value)) state.table.preferences.push(ev.value)
        break

      case 'party_owner':
        state.party.owner_name = String(ev.value || '')
        break

      case 'party_type':
        state.party.type = String(ev.value || '')
        state.booking.need = String(ev.value || '')
        break

      case 'deposit_amount':
        state.deposit.amount = Number(ev.value) || 0
        if (state.deposit.amount > 0) state.deposit.status = 'đã cọc'
        break

      case 'deposit_sender':
        state.deposit.sender_name = String(ev.value || '')
        break

      case 'deposit_note':
        state.deposit.transfer_note = String(ev.value || '')
        break

      case 'menu_item':
        if (ev.value && ev.value.name) {
          const existingIdx = state.menu.items.findIndex(i => i.name.toLowerCase() === ev.value.name.toLowerCase())
          if (existingIdx !== -1) {
            if (ev.operation === 'REPLACE') {
              state.menu.items[existingIdx].quantity = ev.value.quantity
            } else {
              state.menu.items[existingIdx].quantity += ev.value.quantity
            }
          } else {
            state.menu.items.push({
              name: ev.value.name,
              quantity: ev.value.quantity || 1,
              note: ev.value.note || '',
              unit_price: ev.value.unit_price || 0
            })
          }
        }
        break

      case 'conditional_request':
        state.menu.conditional_requests.push(ev.value)
        break

      case 'recommendation_intent':
        state.menu.recommendation_intents.push(ev.value)
        break

      case 'decor_color':
        state.party.decor_color = String(ev.value || '')
        break

      case 'decor_special':
        if (!state.party.special_request.includes(ev.value)) {
          state.party.special_request = state.party.special_request
            ? `${state.party.special_request}; ${ev.value}`
            : String(ev.value)
        }
        break

      case 'seating_preference':
        if (!state.party.seating_preference.includes(ev.value)) {
          state.party.seating_preference = state.party.seating_preference
            ? `${state.party.seating_preference}; ${ev.value}`
            : String(ev.value)
        }
        const chairMatch = String(ev.value).match(/(\d+)\s*(?:ghế\s*em\s*bé|ghế\s*trẻ\s*em|baby\s*chair)/i)
        if (chairMatch) {
          state.party.baby_chairs = parseInt(chairMatch[1], 10)
        }
        break

      case 'smoking_preference':
        state.party.smoking_area = Boolean(ev.value)
        break

      case 'dietary_notes':
        if (!state.party.dietary_notes.includes(ev.value)) {
          state.party.dietary_notes = state.party.dietary_notes
            ? `${state.party.dietary_notes}; ${ev.value}`
            : String(ev.value)
        }
        break

      case 'allergy_warning':
        if (!state.party.allergens.includes(ev.value)) {
          state.party.allergens.push(String(ev.value))
        }
        break

      default:
        break
    }
  }

  // Final synchronization of total guest count if adults & children were separated
  if ((!state.booking.guest_count || state.booking.guest_count === 0) && (state.booking.adults || state.booking.children)) {
    state.booking.guest_count = (state.booking.adults || 0) + (state.booking.children || 0)
  }

  return state
}
