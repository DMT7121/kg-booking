import { parseJSON } from '@/utils'

/**
 * Validate parsed schema according to requirements
 */
export function validateSchema(parsed: any): boolean {
  if (!parsed || typeof parsed !== 'object') return false
  const hasCustomer = parsed.customer && (parsed.customer.name || parsed.customer.phone)
  const hasBooking = parsed.booking && (
    parsed.booking.event_date ||
    parsed.booking.date ||
    parsed.booking.event_time ||
    parsed.booking.time ||
    parsed.booking.guest_count ||
    parsed.booking.table_number ||
    parsed.booking.tables
  )
  const hasReservation = parsed.reservation && (parsed.reservation.date || parsed.reservation.time || parsed.reservation.pax || parsed.reservation.table_code)
  const hasItems = (Array.isArray(parsed.menu_items) && parsed.menu_items.length > 0) || (Array.isArray(parsed.items) && parsed.items.length > 0)
  const hasLegacy = parsed.customer && (parsed.customer.date || parsed.customer.time || parsed.customer.tables)
  const hasParty = parsed.party && (parsed.party.owner_name || parsed.party.decor_color || parsed.party.display_board_text || parsed.party.special_request)
  const hasDeposit = (parsed.deposit && (parsed.deposit.amount || parsed.deposit.bank_ref)) || typeof parsed.amount === 'number'
  return !!(hasCustomer || hasBooking || hasReservation || hasItems || hasLegacy || hasParty || hasDeposit)
}

/**
 * Attempt to clean/extract JSON block from markdown code blocks or raw string
 */
export function cleanJSONString(rawStr: string): string {
  if (!rawStr) return ''
  let clean = rawStr.trim()

  // 0. Strip <think>...</think> reasoning blocks emitted by DeepSeek-R1 / Qwen3 / reasoning models
  clean = clean.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  // Also handle unclosed <think> if followed by a JSON block
  if (clean.toLowerCase().startsWith('<think>')) {
    const firstBrace = clean.indexOf('{')
    if (firstBrace !== -1) {
      clean = clean.slice(firstBrace).trim()
    }
  }
  
  // 1. Remove markdown code fence if exists
  const match = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (match) {
    clean = match[1].trim()
  }
  
  return clean
}

/**
 * Parses JSON safely and checks schema correctness
 */
export function safeParseJSON(rawStr: string): any | null {
  const cleaned = cleanJSONString(rawStr)
  return parseJSON(cleaned)
}
