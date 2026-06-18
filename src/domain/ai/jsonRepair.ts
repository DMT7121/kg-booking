import { parseJSON } from '@/utils'

/**
 * Validate parsed schema according to requirements
 */
export function validateSchema(parsed: any): boolean {
  if (!parsed || typeof parsed !== 'object') return false
  const hasCustomer = parsed.customer && (parsed.customer.name || parsed.customer.phone)
  const hasBooking = parsed.booking && (parsed.booking.event_date || parsed.booking.event_time || parsed.booking.guest_count || parsed.booking.table_number)
  const hasReservation = parsed.reservation && (parsed.reservation.date || parsed.reservation.time || parsed.reservation.pax || parsed.reservation.table_code)
  const hasItems = (Array.isArray(parsed.menu_items) && parsed.menu_items.length > 0) || (Array.isArray(parsed.items) && parsed.items.length > 0)
  const hasLegacy = parsed.customer && (parsed.customer.date || parsed.customer.time || parsed.customer.tables)
  return !!(hasCustomer || hasBooking || hasReservation || hasItems || hasLegacy)
}

/**
 * Attempt to clean/extract JSON block from markdown code blocks or raw string
 */
export function cleanJSONString(rawStr: string): string {
  if (!rawStr) return ''
  let clean = rawStr.trim()
  
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
