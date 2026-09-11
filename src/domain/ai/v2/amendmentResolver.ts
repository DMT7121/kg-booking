import { stripAccents } from '@/utils'
import type { BookingFactEvent, BookingSlot } from './factEvents'

export interface AmendmentMarker {
  type: 'correction' | 'negation' | 'confirmation' | 'retention' | 'addition' | 'reduction'
  rawMarker: string
  slotTarget?: BookingSlot
  scope: string
}

export const CORRECTION_MARKERS_REGEX = /\b(à|a|à khoan|a khoan|khoan|đổi|doi|đổi lại|doi lai|dời|doi|dời lại|sửa|sua|sửa lại|chuyển|chuyen|chuyển sang|chuyển thành|nhầm|nham|không phải|khong phai|thôi|thoi|thôi cứ|bỏ|bỏ cái đó|giữ nguyên|giu nguyen|vẫn|van|chốt lại|chot lai|cuối cùng|chốt|thay bằng|thay bang|xuống còn|xuong con|lên thành|len thanh)\b/i

/**
 * Detects if a text or turn contains explicit Vietnamese amendment / correction triggers.
 */
export function detectAmendmentMarkers(text: string): AmendmentMarker[] {
  if (!text) return []
  const clean = stripAccents(text).toLowerCase()
  const markers: AmendmentMarker[] = []

  // 1. Negation: "không phải mai", "VIP2 không lấy nữa", "đừng lấy VIP2 nữa", "bỏ cái đó"
  const negMatches = [
    { pattern: /(?:khong\s*lay|dung\s*lay|bo|bo\s*cai\s*nay|huy)\s+([a-g]\d{1,2}|vip\d{1,2})/i, slot: 'table_rejection' as BookingSlot },
    { pattern: /([a-g]\d{1,2}|vip\d{1,2})\s*(?:khong\s*lay\s*nua|dung\s*lay\s*nua|bo\s*qua|thoi)/i, slot: 'table_rejection' as BookingSlot },
    { pattern: /khong\s*phai\s*(?:ngay\s*)?(mai|hom\s*nay|thu\s*\d|t\d)/i, slot: 'event_date' as BookingSlot }
  ]

  for (const { pattern, slot } of negMatches) {
    const match = clean.match(pattern)
    if (match) {
      markers.push({
        type: 'negation',
        rawMarker: match[0],
        slotTarget: slot,
        scope: match[1] || match[0]
      })
    }
  }

  // 2. Retention: "giờ giữ nguyên", "cái đó giữ nguyên", "vẫn 12 nha", "cứ 7h đi em"
  const retMatches = [
    { pattern: /(?:gio|thoi\s*gian)\s*giu\s*nguyen|cu\s*(\d{1,2}h|\d{1,2}:\d{2})\s*di/i, slot: 'event_time' as BookingSlot },
    { pattern: /(?:so\s*luong|so\s*khach|khach)\s*giu\s*nguyen|van\s*(\d+)\s*(?:nha|nhe|nguoi|khach|pax)/i, slot: 'guest_count' as BookingSlot },
    { pattern: /giu\s*nguyen/i, slot: undefined }
  ]

  for (const { pattern, slot } of retMatches) {
    const match = clean.match(pattern)
    if (match) {
      markers.push({
        type: 'retention',
        rawMarker: match[0],
        slotTarget: slot,
        scope: match[1] || match[0]
      })
    }
  }

  // 3. Correction & Replacement: "à khoan", "đổi sang", "chuyển sang", "xuống còn", "lên thành"
  const corrMatch = clean.match(/(?:a\s*khoan|khoan|doi\s*sang|chuyen\s*sang|xuong\s*con|len\s*thanh|doi\s*lai|chot\s*lai|chot\s*thanh)\s*([^,.]+)/i)
  if (corrMatch) {
    markers.push({
      type: 'correction',
      rawMarker: corrMatch[0],
      scope: corrMatch[1]
    })
  }

  return markers
}

/**
 * Resolves amendment conflicts between multiple events on the same slot.
 * Ensures that explicit corrections supersede earlier stated values.
 */
export function resolveEventPrecedence(events: BookingFactEvent[]): BookingFactEvent[] {
  const finalEvents: BookingFactEvent[] = []
  // Group events by slot
  const slotGroups = new Map<BookingSlot, BookingFactEvent[]>()

  for (const ev of events) {
    if (!slotGroups.has(ev.slot)) {
      slotGroups.set(ev.slot, [])
    }
    slotGroups.get(ev.slot)!.push(ev)
  }

  for (const [slot, evList] of slotGroups.entries()) {
    // For appendable slots like menu items, decor specials, table preferences, preserve all non-rejected
    if (['menu_item', 'decor_special', 'table_preference', 'dietary_notes', 'allergy_warning', 'conditional_request', 'recommendation_intent'].includes(slot)) {
      finalEvents.push(...evList)
      continue
    }

    if (evList.length === 1) {
      finalEvents.push(evList[0])
      continue
    }

    // Multiple events for a single scalar slot (e.g. guest_count, event_time, customer_name):
    // Precedence rule:
    // 1. Latest explicit turn with REPLACE or CONFIRM wins over earlier turns.
    // 2. Retention ("vẫn 12 nha", "cứ 7h đi em") overrides an intermediate amendment.
    let activeWinner = evList[0]

    for (let i = 1; i < evList.length; i++) {
      const challenger = evList[i]

      // If challenger has higher turn index and explicit evidence, it supersedes earlier event
      if (challenger.sourceTurnIndex > activeWinner.sourceTurnIndex) {
        challenger.supersedesEventId = activeWinner.id
        challenger.previousValue = activeWinner.value
        activeWinner = challenger
      } else if (challenger.sourceTurnIndex === activeWinner.sourceTurnIndex) {
        // Same turn: higher extraction confidence or explicit replacement wins
        if (challenger.operation === 'REPLACE' || challenger.operation === 'CONFIRM') {
          challenger.supersedesEventId = activeWinner.id
          challenger.previousValue = activeWinner.value
          activeWinner = challenger
        } else if (challenger.extractionConfidence > activeWinner.extractionConfidence) {
          activeWinner = challenger
        }
      }
    }

    finalEvents.push(activeWinner)
  }

  return finalEvents
}
