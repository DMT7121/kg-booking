import { stripAccents, cleanPhoneNumber } from '@/utils'
import { createBookingEnvelope, createInputEnvelope, type BookingInputEnvelope, type ConversationTurn } from './inputEnvelope'
import { segmentTurns } from './turnSegmenter'
import { parseGuestCountNonDestructive, parseBookingTimeNonDestructive, type NumericRangeValue } from './nonDestructiveNormalizer'
import { createFactEvent, type BookingFactEvent, type BookingSlot, type BookingOperation } from './factEvents'
import { detectAmendmentMarkers } from './amendmentResolver'
import { reduceBookingEvents, type BookingState } from './dialogueStateReducer'
import { evaluateBookingConstraints, type ConstraintViolation } from '@/domain/booking/v2/bookingConstraintEngine'
import { buildProvenanceAuditTrail, type BookingAuditTrail } from './provenanceEngine'
import { evaluateStructuredFormSafety, type SafetyGateEvaluation } from './structuredFormSafetyGate'
import {
  resolveMenuCascade,
  extractConditionalMenuRequests,
  extractRecommendationIntents,
  type MenuKnowledgeItem,
  STANDARD_MENU_KNOWLEDGE
} from '@/domain/menu/v2/menuResolverV2'

function getWeekdayIndex(w: string): number {
  const cleanW = stripAccents(w).toLowerCase().replace(/\s+/g, '')
  if (/cn|chunhat/.test(cleanW)) return 0
  if (/t2|thuhai|thu2/.test(cleanW)) return 1
  if (/t3|thuba|thu3/.test(cleanW)) return 2
  if (/t4|thutu|thu4/.test(cleanW)) return 3
  if (/t5|thunam|thu5/.test(cleanW)) return 4
  if (/t6|thusau|thu6/.test(cleanW)) return 5
  if (/t7|thubay|thu7/.test(cleanW)) return 6
  return -1
}

export interface BookingIntelligenceV2Result {
  state: BookingState
  events: BookingFactEvent[]
  envelope: BookingInputEnvelope
  violations: ConstraintViolation[]
  auditTrail: BookingAuditTrail
  safetyGate: SafetyGateEvaluation
  legacyFormPayload: {
    customer: {
      name: string
      phone: string
      contact_person?: string
    }
    booking: {
      date: string
      time: string
      guest_count: number | null
      table: string
      need: string
    }
    deposit: {
      amount: number
      status: string
      sender_name?: string
      transfer_note?: string
    }
    party: {
      owner_name: string
      decor_color: string
      special_request: string
      display_board_text: string
      mirror_board_text: string
      seating_preference: string
      dietary_notes: string
    }
    items: Array<{
      name: string
      quantity: number
      note: string
      unit_price?: number
    }>
    warnings: string[]
  }
}

/**
 * Main Entry Point: King's Grill Booking Intelligence V2 Orchestrator.
 * Connects the multi-turn conversational dialogue pipeline, non-destructive normalization,
 * cascade menu resolution, operational constraint safety checks, and explainable provenance.
 */
export function analyzeBookingIntelligenceV2(
  rawText: string,
  options?: {
    traceId?: string
    referenceDate?: Date
    menuKnowledge?: MenuKnowledgeItem[]
  }
): BookingIntelligenceV2Result {
  const traceId = options?.traceId || `trace_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const turns = segmentTurns(rawText)
  const envelope = createBookingEnvelope(rawText, { turns, source: 'conversation' })

  const safetyGate = evaluateStructuredFormSafety(rawText)
  const menuKb = options?.menuKnowledge || STANDARD_MENU_KNOWLEDGE
  const refDate = options?.referenceDate || new Date()

  const events: BookingFactEvent[] = []

  // Track state proposed by staff in preceding turn
  interface StaffProposal {
    guest_count?: number
    event_time?: string
    event_date?: string
    table_code?: string
  }
  let lastStaffProposal: StaffProposal | null = null

  for (let turnIdx = 0; turnIdx < turns.length; turnIdx++) {
    const turn = turns[turnIdx]
    const content = turn.normalizedText || turn.rawText
    const clean = stripAccents(content).toLowerCase()

    if (turn.speaker === 'staff') {
      // Extract staff proposal for confirmation context
      const staffProposal: StaffProposal = {}

      const paxMatch = content.match(/(\d+)\s*(?:khách|người|pax|khach|nguoi)/i)
      if (paxMatch) staffProposal.guest_count = parseInt(paxMatch[1], 10)

      const timeMatch = content.match(/(\d{1,2}(?::\d{2}|h\d{2}|h))\b/i)
      if (timeMatch) {
        let tStr = timeMatch[1]
        if (tStr.includes(':')) {
          const [h, m] = tStr.split(':')
          staffProposal.event_time = `${h.padStart(2, '0')}:${m}`
        } else if (tStr.includes('h')) {
          const [h, m] = tStr.split('h')
          staffProposal.event_time = `${h.padStart(2, '0')}:${(m || '00').padStart(2, '0')}`
        }
      }

      lastStaffProposal = staffProposal
      continue
    }

    // Customer or System turn processing
    const isCustomer = turn.speaker === 'customer' || turn.speaker === 'unknown'
    if (!isCustomer) continue

    // 1. Contextual confirmation of previous staff proposal: "Đúng em", "Đúng rồi", "Ok em"
    const hasConfirmationAffirmative = /^(?:đúng\s+(?:em|rồi|nha|nhé|nhe)|ok\s+(?:em|nha|nhé)|vâng\s+em|chính\s*xác|chuẩn\s*rồi)\b/i.test(content)
    if (hasConfirmationAffirmative && lastStaffProposal) {
      if (lastStaffProposal.guest_count) {
        events.push(createFactEvent({
          slot: 'guest_count',
          operation: 'CONFIRM',
          value: lastStaffProposal.guest_count,
          sourceTurnId: turn.id,
          sourceTurnIndex: turn.index,
          speaker: turn.speaker,
          evidence: content,
          explicitness: 'explicit',
          extractionConfidence: 0.98
        }))
      }
      if (lastStaffProposal.event_time) {
        events.push(createFactEvent({
          slot: 'event_time',
          operation: 'CONFIRM',
          value: lastStaffProposal.event_time,
          sourceTurnId: turn.id,
          sourceTurnIndex: turn.index,
          speaker: turn.speaker,
          evidence: content,
          explicitness: 'explicit',
          extractionConfidence: 0.98
        }))
      }
    }

    // 2. Role Distinction: Booker vs Party Owner vs Contact Person vs Deposit Sender
    // Delegate booking: "Em đặt giúp chị Lan", "đặt cho anh Tuấn"
    const delegateBookerMatch = content.match(/(?:(?:em\s+)?(?:đặt\s*giúp|book\s*giúp|đặt\s*giùm|book\s*giùm|đặt\s*cho|book\s*cho))\s+(?:chị|anh|cô|bác|em)?\s*([A-Za-z\p{L}]+)/iu)
    // Direct booker: "Chị Thu đặt bàn giùm", "Anh Nam book bàn"
    const directBookerMatch = content.match(/^(?:chị|anh|em|cô|bác)\s+([A-Za-z\p{L}]+)\s+(?:đặt\s*bàn|book\s*bàn|đặt\s*tiệc|book\s*tiệc|đặt\s*giùm|book\s*giùm|đặt|book)/iu)

    let bookerCandidate: string | null = null
    let bookerEvidence = ''

    if (delegateBookerMatch) {
      bookerCandidate = delegateBookerMatch[1].trim()
      bookerEvidence = delegateBookerMatch[0]
    } else if (directBookerMatch) {
      bookerCandidate = directBookerMatch[1].trim()
      bookerEvidence = directBookerMatch[0]
    }

    if (bookerCandidate && !/^(đặt|book|lấy|cho|hỏi|xem|giúp|giùm|ơi|em|chị|anh|bàn|khách|tiệc|phòng|vip|ngày|hôm|mai)$/i.test(bookerCandidate)) {
      events.push(createFactEvent({
        slot: 'customer_name',
        operation: 'SET',
        value: bookerCandidate,
        sourceTurnId: turn.id,
        sourceTurnIndex: turn.index,
        speaker: turn.speaker,
        evidence: bookerEvidence,
        explicitness: 'explicit',
        extractionConfidence: 0.98
      }))
    }

    // Party Owner: "tiệc sinh nhật bé Min", "sinh nhật bé Bảo", "thôi nôi bé An"
    const partyOwnerMatch = content.match(/(?:tiệc\s+)?(?:sinh\s*nhật|thôi\s*nôi|kỉ\s*niệm|tiệc)\s+(?:bé|be|em|con|cháu)\s+([A-Za-z\p{L}]+)/iu)
      || content.match(/(?:tiệc\s+)?(?:sinh\s*nhật|thôi\s*nôi|kỉ\s*niệm)\s+(?:cho\s+)?([A-Za-z\p{L}]+)/iu)
      || content.match(/(?:sinh\s*nhật|thôi\s*nôi|tiệc|kỉ\s*niệm)\s+(?:bé|be|em|con|cháu)?\s*([A-Za-z\p{L}]+)/iu)
    if (partyOwnerMatch) {
      const ownerName = partyOwnerMatch[1].trim()
      if (!/^(hôm|mai|nay|này|thứ|tuần|sinh|nhật|thôi|nôi|tiệc|bé|em|con)$/i.test(ownerName)) {
        events.push(createFactEvent({
          slot: 'party_owner',
          operation: 'SET',
          value: ownerName,
          sourceTurnId: turn.id,
          sourceTurnIndex: turn.index,
          speaker: turn.speaker,
          evidence: partyOwnerMatch[0],
          explicitness: 'explicit',
          extractionConfidence: 0.95
        }))
      }
    }

    // Party Type
    if (/sinh\s*nhat|sn\b/i.test(clean)) {
      events.push(createFactEvent({
        slot: 'party_type',
        operation: 'SET',
        value: 'Sinh nhật',
        sourceTurnId: turn.id,
        sourceTurnIndex: turn.index,
        speaker: turn.speaker,
        evidence: 'sinh nhật',
        explicitness: 'explicit',
        extractionConfidence: 0.95
      }))
    } else if (/thoi\s*noi/i.test(clean)) {
      events.push(createFactEvent({
        slot: 'party_type',
        operation: 'SET',
        value: 'Thôi nôi',
        sourceTurnId: turn.id,
        sourceTurnIndex: turn.index,
        speaker: turn.speaker,
        evidence: 'thôi nôi',
        explicitness: 'explicit',
        extractionConfidence: 0.95
      }))
    }

    // Contact Person & Phone: "SĐT liên hệ anh Hùng 0901234567"
    const contactMatch = content.match(/(?:sđt\s*liên\s*hệ|sdt\s*lien\s*he|người\s*liên\s*hệ|liên\s*hệ)\s+(?:anh|chị|em)?\s*([A-Za-z\p{L}]+)(?:\s+(0[35789]\d{7,9}))?/iu)
    if (contactMatch) {
      const contactPerson = contactMatch[1].trim()
      events.push(createFactEvent({
        slot: 'contact_person',
        operation: 'SET',
        value: contactPerson,
        sourceTurnId: turn.id,
        sourceTurnIndex: turn.index,
        speaker: turn.speaker,
        evidence: contactMatch[0],
        explicitness: 'explicit',
        extractionConfidence: 0.95
      }))
      if (contactMatch[2]) {
        events.push(createFactEvent({
          slot: 'phone',
          operation: 'SET',
          value: cleanPhoneNumber(contactMatch[2]),
          sourceTurnId: turn.id,
          sourceTurnIndex: turn.index,
          speaker: turn.speaker,
          evidence: contactMatch[2],
          explicitness: 'explicit',
          extractionConfidence: 0.99
        }))
      }
    }

    // Phone standalone if not extracted above
    const standalonePhone = content.match(/(0[35789]\d{7,9})/)
    if (standalonePhone && !events.some(e => e.slot === 'phone')) {
      events.push(createFactEvent({
        slot: 'phone',
        operation: 'SET',
        value: cleanPhoneNumber(standalonePhone[1]),
        sourceTurnId: turn.id,
        sourceTurnIndex: turn.index,
        speaker: turn.speaker,
        evidence: standalonePhone[1],
        explicitness: 'explicit',
        extractionConfidence: 0.98
      }))
    }

    // Deposit Sender: "Trần Quốc Nam chuyển", "Lát nữa Trần Quốc Nam CK"
    const depSenderMatch = content.match(/(?:tiền\s*cọc|cọc|chuyển\s*khoản|ck)(?:\s+(?:lát\s*nữa|tí\s*nữa|sau))?\s+(?:anh|chị|em)?\s*([A-Z\p{Lu}][\p{Ll}]+(?:\s+[A-Z\p{Lu}][\p{Ll}]+)+)\s+(?:chuyển|ck|nộp|gửi)/u)
      || content.match(/([A-Z\p{Lu}][\p{Ll}]+(?:\s+[A-Z\p{Lu}][\p{Ll}]+)+)\s+(?:chuyển|chuyển\s*khoản|ck)/u)
    if (depSenderMatch) {
      const senderRaw = depSenderMatch[1].trim()
      if (senderRaw.length > 2 && !/^(nội dung|tiền cọc|khách)$/i.test(senderRaw)) {
        events.push(createFactEvent({
          slot: 'deposit_sender',
          operation: 'SET',
          value: senderRaw,
          sourceTurnId: turn.id,
          sourceTurnIndex: turn.index,
          speaker: turn.speaker,
          evidence: depSenderMatch[0],
          explicitness: 'explicit',
          extractionConfidence: 0.95
        }))
      }
    }

    // Deposit Transfer Note: "nội dung CK chắc ghi NAM SN MINH"
    const depNoteMatch = content.match(/(?:nội\s*dung(?:\s*ck|\s*chuyển\s*khoản)?|ghi)\s*(?:chắc\s*ghi|là)?\s*[:\-–—]?\s*([A-Za-z0-9\s_-]+?)(?:\.|$)/iu)
    if (depNoteMatch) {
      const noteStr = depNoteMatch[1].trim()
      if (noteStr.length > 2) {
        events.push(createFactEvent({
          slot: 'deposit_note',
          operation: 'SET',
          value: noteStr,
          sourceTurnId: turn.id,
          sourceTurnIndex: turn.index,
          speaker: turn.speaker,
          evidence: depNoteMatch[0],
          explicitness: 'explicit',
          extractionConfidence: 0.95
        }))
      }
    }

    // 3. Guest Count & Range Processing (Non-destructive)
    // Adults + children separation: "10 người lớn với 3 bé"
    const additionPaxMatch = content.match(/(\d+)\s*(?:người\s*lớn|lớn)\s*(?:\+|,|và|voi|với)?\s*(\d+)\s*(?:bé|trẻ\s*em|nhỏ)/iu)
    if (additionPaxMatch) {
      const adults = parseInt(additionPaxMatch[1], 10)
      const kids = parseInt(additionPaxMatch[2], 10)
      events.push(createFactEvent({
        slot: 'adults_count',
        operation: 'SET',
        value: adults,
        sourceTurnId: turn.id,
        sourceTurnIndex: turn.index,
        speaker: turn.speaker,
        evidence: additionPaxMatch[0],
        explicitness: 'explicit',
        extractionConfidence: 0.98
      }))
      events.push(createFactEvent({
        slot: 'children_count',
        operation: 'SET',
        value: kids,
        sourceTurnId: turn.id,
        sourceTurnIndex: turn.index,
        speaker: turn.speaker,
        evidence: additionPaxMatch[0],
        explicitness: 'explicit',
        extractionConfidence: 0.98
      }))
      events.push(createFactEvent({
        slot: 'guest_count',
        operation: 'SET',
        value: adults + kids,
        sourceTurnId: turn.id,
        sourceTurnIndex: turn.index,
        speaker: turn.speaker,
        evidence: additionPaxMatch[0],
        explicitness: 'explicit',
        extractionConfidence: 0.98
      }))
    } else {
      // Check amendment guest count: "À khoan khách còn 13 thôi"
      const amendGuestMatch = content.match(/(?:à\s*khoan|khoan|đổi\s*sang|xuống\s*còn|còn)\s*(?:khách\s*còn|khách)?\s*(\d+)\s*(?:thôi|người|khách|pax)?/iu)
      if (amendGuestMatch) {
        const val = parseInt(amendGuestMatch[1], 10)
        events.push(createFactEvent({
          slot: 'guest_count',
          operation: 'REPLACE',
          value: val,
          sourceTurnId: turn.id,
          sourceTurnIndex: turn.index,
          speaker: turn.speaker,
          evidence: amendGuestMatch[0],
          explicitness: 'explicit',
          extractionConfidence: 0.98
        }))
      } else {
        const guestRangeVal = parseGuestCountNonDestructive(content)
        if (guestRangeVal) {
          if (guestRangeVal.precision === 'range' || guestRangeVal.precision === 'approximate') {
            events.push(createFactEvent({
              slot: 'guest_range',
              operation: 'SET',
              value: guestRangeVal,
              sourceTurnId: turn.id,
              sourceTurnIndex: turn.index,
              speaker: turn.speaker,
              evidence: guestRangeVal.raw,
              explicitness: 'explicit',
              extractionConfidence: 0.95
            }))
            // If range is confirmed without ambiguity, also set guest_count to upper bound
            if (guestRangeVal.isConfirmed && guestRangeVal.max) {
              events.push(createFactEvent({
                slot: 'guest_count',
                operation: 'SET',
                value: guestRangeVal.max,
                sourceTurnId: turn.id,
                sourceTurnIndex: turn.index,
                speaker: turn.speaker,
                evidence: guestRangeVal.raw,
                explicitness: 'implicit',
                extractionConfidence: 0.85
              }))
            }
          } else if (guestRangeVal.exact) {
            events.push(createFactEvent({
              slot: 'guest_count',
              operation: 'SET',
              value: guestRangeVal.exact,
              sourceTurnId: turn.id,
              sourceTurnIndex: turn.index,
              speaker: turn.speaker,
              evidence: guestRangeVal.raw,
              explicitness: 'explicit',
              extractionConfidence: 0.95
            }))
          }
        }
      }
    }

    // Children standalone count if not in addition pax match
    const childMatch = content.match(/(\d+)\s*(?:bé|bé\s*nhỏ|trẻ\s*em|con\s*nít)/iu)
    if (childMatch && !events.some(e => e.slot === 'children_count')) {
      events.push(createFactEvent({
        slot: 'children_count',
        operation: 'SET',
        value: parseInt(childMatch[1], 10),
        sourceTurnId: turn.id,
        sourceTurnIndex: turn.index,
        speaker: turn.speaker,
        evidence: childMatch[0],
        explicitness: 'explicit',
        extractionConfidence: 0.95
      }))
    }

    // 4. Time & Retention / Amendment Processing
    // Check retention: "Giờ giữ nguyên nha", "thôi cứ 7h đi em", "cứ 19h"
    const retainTimeMatch = content.match(/(?:giờ\s*giữ\s*nguyên|thôi\s*cứ\s*(\d{1,2}(?::\d{2}|h\d{2}|h)?)\s*đi|cứ\s*(\d{1,2}(?::\d{2}|h\d{2}|h))\s*đi)/iu)
    if (retainTimeMatch) {
      let tVal = retainTimeMatch[1] || retainTimeMatch[2]
      if (tVal) {
        let h = parseInt(tVal.replace(/h.*/i, ''), 10)
        if (h < 12) h += 12
        events.push(createFactEvent({
          slot: 'event_time',
          operation: 'CONFIRM',
          value: `${String(h).padStart(2, '0')}:00`,
          sourceTurnId: turn.id,
          sourceTurnIndex: turn.index,
          speaker: turn.speaker,
          evidence: retainTimeMatch[0],
          explicitness: 'explicit',
          extractionConfidence: 0.98
        }))
      } else {
        // "Giờ giữ nguyên" retains previous confirmed or stated time
        const prevTime = events.slice().reverse().find(e => e.slot === 'event_time')
        if (prevTime) {
          events.push(createFactEvent({
            slot: 'event_time',
            operation: 'CONFIRM',
            value: prevTime.value,
            sourceTurnId: turn.id,
            sourceTurnIndex: turn.index,
            speaker: turn.speaker,
            evidence: retainTimeMatch[0],
            explicitness: 'explicit',
            extractionConfidence: 0.98
          }))
        }
      }
    } else {
      const timeVal = parseBookingTimeNonDestructive(content)
      if (timeVal) {
        const timeStr = timeVal.exact || timeVal.approximateAround
        if (timeStr) {
          events.push(createFactEvent({
            slot: 'event_time',
            operation: 'SET',
            value: timeStr,
            sourceTurnId: turn.id,
            sourceTurnIndex: turn.index,
            speaker: turn.speaker,
            evidence: timeVal.raw,
            explicitness: 'explicit',
            extractionConfidence: 0.90
          }))
        }
      }
    }

    // 5. Date Parsing & Negation
    // Negation: "Không phải mai đâu em, thứ 7 tuần sau nha"
    const dateNegMatch = clean.match(/khong\s*phai\s*(?:ngay\s*)?(mai|hom\s*nay)/i)
    const weekdayMatch = clean.match(/\b(chu\s*nhat|cn|thu\s*hai|t2|thu\s*ba|t3|thu\s*tu|t4|thu\s*nam|t5|thu\s*sau|t6|thu\s*bay|t7|thu\s*2|thu\s*3|thu\s*4|thu\s*5|thu\s*6|thu\s*7)\b(?:\s+(tuan\s+)?(nay|sau))?/i)
    if (weekdayMatch) {
      const wIdx = getWeekdayIndex(weekdayMatch[1])
      if (wIdx !== -1) {
        const currentDay = refDate.getDay()
        const vnToday = currentDay === 0 ? 7 : currentDay
        const vnTarget = wIdx === 0 ? 7 : wIdx
        let diff = vnTarget - vnToday
        if (diff < 0) diff += 7
        const modifier = weekdayMatch[3] ? weekdayMatch[3].toLowerCase() : ''
        if (modifier === 'sau') {
          diff += 7
        }
        const targetDate = new Date(refDate)
        targetDate.setDate(refDate.getDate() + diff)
        const dStr = `${String(targetDate.getDate()).padStart(2, '0')}/${String(targetDate.getMonth() + 1).padStart(2, '0')}/${targetDate.getFullYear()}`

        events.push(createFactEvent({
          slot: 'event_date',
          operation: dateNegMatch ? 'REPLACE' : 'SET',
          value: dStr,
          sourceTurnId: turn.id,
          sourceTurnIndex: turn.index,
          speaker: turn.speaker,
          evidence: weekdayMatch[0],
          explicitness: 'explicit',
          extractionConfidence: 0.95
        }))
      }
    }

    // 6. Table Allocation, Rejections & Preferences
    // Rejection: "đừng lấy VIP2 nữa", "đặt VIP2 nhưng thôi", "không lấy VIP2"
    const tableRejectionMatch = clean.match(/(?:dung\s*lay|bo|khong\s*lay|huy)\s+([a-g]\d{1,2}|vip\d{1,2})|([a-g]\d{1,2}|vip\d{1,2})\s*(?:nhung\s*thoi|khong\s*lay\s*nua|dung\s*lay\s*nua)/i)
    if (tableRejectionMatch) {
      const rejectedCode = (tableRejectionMatch[1] || tableRejectionMatch[2]).toUpperCase()
      events.push(createFactEvent({
        slot: 'table_rejection',
        operation: 'REJECT',
        value: rejectedCode,
        sourceTurnId: turn.id,
        sourceTurnIndex: turn.index,
        speaker: turn.speaker,
        evidence: tableRejectionMatch[0],
        explicitness: 'explicit',
        extractionConfidence: 0.98
      }))
    }

    // Preference: "nếu VIP3 còn thì VIP3", "để khu ngoài cũng được"
    const prefMatch1 = clean.match(/neu\s+([a-g]\d{1,2}|vip\d{1,2})\s+con\s+thi\s+([a-g]\d{1,2}|vip\d{1,2})/i)
    if (prefMatch1) {
      const prefCode = prefMatch1[1].toUpperCase()
      events.push(createFactEvent({
        slot: 'table_preference',
        operation: 'APPEND',
        value: prefCode,
        sourceTurnId: turn.id,
        sourceTurnIndex: turn.index,
        speaker: turn.speaker,
        evidence: prefMatch1[0],
        explicitness: 'explicit',
        extractionConfidence: 0.95
      }))
    }
    if (/khu\s*ngoai|ngoai\s*troi|san\s*vuon/i.test(clean)) {
      events.push(createFactEvent({
        slot: 'table_preference',
        operation: 'APPEND',
        value: 'NGOÀI TRỜI',
        sourceTurnId: turn.id,
        sourceTurnIndex: turn.index,
        speaker: turn.speaker,
        evidence: 'khu ngoài',
        explicitness: 'explicit',
        extractionConfidence: 0.90
      }))
    }

    // Assigned Table: "Cho anh VIP1 20 người"
    const assignedTableMatch = clean.match(/(?:cho\s*(?:anh|chị|em|mình)?\s+)?(vip\d{1,2}|[a-g]\d{1,2})\b(?!\s*(?:nhung\s*thoi|khong\s*lay))/i)
    if (assignedTableMatch) {
      const tbl = assignedTableMatch[1].toUpperCase()
      // Only set if not rejected in same turn
      if (!tableRejectionMatch || (tableRejectionMatch[1] || tableRejectionMatch[2]).toUpperCase() !== tbl) {
        events.push(createFactEvent({
          slot: 'table_code',
          operation: 'SET',
          value: tbl,
          sourceTurnId: turn.id,
          sourceTurnIndex: turn.index,
          speaker: turn.speaker,
          evidence: assignedTableMatch[0],
          explicitness: 'explicit',
          extractionConfidence: 0.95
        }))
      }
    }

    // 7. Amenities, Seating, Decor & Allergies / Dietary
    // Decor color: "TONE HỒNG", "tone xanh", "tông hồng", "màu đỏ"
    const fullToneMatch = content.match(/\b((?:tone|t[oô]ng(?:\s*m[aà]u)?)\s+[a-zA-ZÀ-ỹ\s\-]+?)(?=[,.;\n]|\s*(?:nh[eé]|nha|gi[uú]p|ạ|\.|$))/i)
      || content.match(/\b(?:t[oô]ng\s*(?:m[aà]u)?|tone|m[aà]u)\s+([a-zA-ZÀ-ỹ\s\-]+?)(?=[,.;\n]|\s*(?:nh[eé]|nha|gi[uú]p|ạ|\.|$))/i)
    if (fullToneMatch) {
      const cVal = fullToneMatch[1].trim()
      const cLower = stripAccents(cVal).toLowerCase()
      if (/(?:do|trang|hong|xanh|vang|tim|cam|den|nau|bac|gold|silver|pastel|mint|navy|kem|xam|be)/i.test(cLower)) {
        events.push(createFactEvent({
          slot: 'decor_color',
          operation: 'SET',
          value: cVal,
          sourceTurnId: turn.id,
          sourceTurnIndex: turn.index,
          speaker: turn.speaker,
          evidence: fullToneMatch[0],
          explicitness: 'explicit',
          extractionConfidence: 0.95
        }))
      }
    }

    // Decor Special: Balloons
    if (/(?:bong\s*bay|b[oó]ng\s*bay|bong\s*b[oó]ng|th[eê]m\s*b[oó]ng)/i.test(clean)) {
      events.push(createFactEvent({
        slot: 'decor_special',
        operation: 'APPEND',
        value: 'Thêm bóng bay trang trí',
        sourceTurnId: turn.id,
        sourceTurnIndex: turn.index,
        speaker: turn.speaker,
        evidence: 'bóng bay',
        explicitness: 'explicit',
        extractionConfidence: 0.95
      }))
    }
    // Decor Special: Background / Backdrop / Khung check-in
    if (/(?:d[uự]ng\s*background|background|backdrop|khung\s*checkin)/i.test(clean)) {
      events.push(createFactEvent({
        slot: 'decor_special',
        operation: 'APPEND',
        value: 'Dựng background check-in',
        sourceTurnId: turn.id,
        sourceTurnIndex: turn.index,
        speaker: turn.speaker,
        evidence: 'background',
        explicitness: 'explicit',
        extractionConfidence: 0.95
      }))
    }
    // Decor Special: Fresh flowers
    if (/hoa\s*tuoi|hoa\s*lua|hoa\s*sap|cam\s*hoa/i.test(clean)) {
      events.push(createFactEvent({
        slot: 'decor_special',
        operation: 'APPEND',
        value: 'Trang trí hoa tươi',
        sourceTurnId: turn.id,
        sourceTurnIndex: turn.index,
        speaker: turn.speaker,
        evidence: 'hoa tươi',
        explicitness: 'explicit',
        extractionConfidence: 0.95
      }))
    }

    // Baby chairs: "3 ghế em bé", "ghế em bé", "ghế trẻ em"
    const chairMatch = content.match(/(\d+)\s*(?:ghế\s*em\s*bé|ghế\s*trẻ\s*em|ghế\s*cho\s*bé|baby\s*chair)/iu)
      || content.match(/(?:ghế\s*em\s*bé|ghế\s*trẻ\s*em|ghế\s*cho\s*bé|baby\s*chair)\s*(\d+)?/iu)
    if (chairMatch && !events.some(e => e.slot === 'seating_preference' && String(e.value).includes('ghế em bé'))) {
      const qty = chairMatch[1] ? `${chairMatch[1]} ` : ''
      events.push(createFactEvent({
        slot: 'seating_preference',
        operation: 'APPEND',
        value: `Cần ${qty}ghế trẻ em (baby chair)`.trim(),
        sourceTurnId: turn.id,
        sourceTurnIndex: turn.index,
        speaker: turn.speaker,
        evidence: chairMatch[0],
        explicitness: 'explicit',
        extractionConfidence: 0.98
      }))
    }

    // Seating position: Window, View, Quiet
    if (/gan\s*cua\s*so|view\s*cua\s*so|view\s*dep|view\s*thoang/i.test(clean)) {
      events.push(createFactEvent({
        slot: 'seating_preference',
        operation: 'APPEND',
        value: 'Bàn gần cửa sổ / view thoáng',
        sourceTurnId: turn.id,
        sourceTurnIndex: turn.index,
        speaker: turn.speaker,
        evidence: 'cửa sổ/view',
        explicitness: 'explicit',
        extractionConfidence: 0.95
      }))
    }
    if (/yen\s*tinh|khong\s*on/i.test(clean)) {
      events.push(createFactEvent({
        slot: 'seating_preference',
        operation: 'APPEND',
        value: 'Bàn yên tĩnh, không ồn',
        sourceTurnId: turn.id,
        sourceTurnIndex: turn.index,
        speaker: turn.speaker,
        evidence: 'yên tĩnh',
        explicitness: 'explicit',
        extractionConfidence: 0.95
      }))
    }

    // Smoking area
    if (/khu\s*(?:vuc\s*)?hut\s*thuoc|phong\s*hut\s*thuoc|cho\s*hut\s*thuoc/i.test(clean)) {
      events.push(createFactEvent({
        slot: 'smoking_preference',
        operation: 'SET',
        value: true,
        sourceTurnId: turn.id,
        sourceTurnIndex: turn.index,
        speaker: turn.speaker,
        evidence: 'khu hút thuốc',
        explicitness: 'explicit',
        extractionConfidence: 0.98
      }))
    }

    // Allergens: "dị ứng hải sản", "dị ứng đậu phộng"
    const allergyMatch = content.match(/dị\s*ứng\s+([A-Za-z\p{L}\s]+?)(?:,|\.|\s+nhưng|$)/iu)
    if (allergyMatch) {
      const allergen = allergyMatch[1].trim()
      events.push(createFactEvent({
        slot: 'allergy_warning',
        operation: 'APPEND',
        value: allergen,
        sourceTurnId: turn.id,
        sourceTurnIndex: turn.index,
        speaker: turn.speaker,
        evidence: allergyMatch[0],
        explicitness: 'explicit',
        extractionConfidence: 0.98
      }))
      events.push(createFactEvent({
        slot: 'dietary_notes',
        operation: 'APPEND',
        value: `Dị ứng ${allergen}`,
        sourceTurnId: turn.id,
        sourceTurnIndex: turn.index,
        speaker: turn.speaker,
        evidence: allergyMatch[0],
        explicitness: 'explicit',
        extractionConfidence: 0.95
      }))
    }

    // Taste & Dietary Preferences (không cay, ít cay, ít ngọt, sốt để riêng, không hành, ăn chay)
    if (/khong\s*cay|ko\s*cay|dung\s*lam\s*cay|do\s*an\s*khong\s*cay/i.test(clean)) {
      events.push(createFactEvent({
        slot: 'dietary_notes',
        operation: 'APPEND',
        value: 'Làm không cay',
        sourceTurnId: turn.id,
        sourceTurnIndex: turn.index,
        speaker: turn.speaker,
        evidence: 'không cay',
        explicitness: 'explicit',
        extractionConfidence: 0.95
      }))
    } else if (/it\s*cay|cay\s*nhe|cay\s*vua/i.test(clean)) {
      events.push(createFactEvent({
        slot: 'dietary_notes',
        operation: 'APPEND',
        value: 'Làm ít cay',
        sourceTurnId: turn.id,
        sourceTurnIndex: turn.index,
        speaker: turn.speaker,
        evidence: 'ít cay',
        explicitness: 'explicit',
        extractionConfidence: 0.95
      }))
    }
    if (/it\s*ngot|it\s*duong/i.test(clean)) {
      events.push(createFactEvent({
        slot: 'dietary_notes',
        operation: 'APPEND',
        value: 'Ít đường / ít ngọt',
        sourceTurnId: turn.id,
        sourceTurnIndex: turn.index,
        speaker: turn.speaker,
        evidence: 'ít ngọt',
        explicitness: 'explicit',
        extractionConfidence: 0.95
      }))
    }
    if (/sot\s*de\s*rieng|ot\s*de\s*rieng|nuoc\s*cham\s*de\s*rieng/i.test(clean)) {
      events.push(createFactEvent({
        slot: 'dietary_notes',
        operation: 'APPEND',
        value: 'Nước sốt / ớt để riêng',
        sourceTurnId: turn.id,
        sourceTurnIndex: turn.index,
        speaker: turn.speaker,
        evidence: 'sốt để riêng',
        explicitness: 'explicit',
        extractionConfidence: 0.95
      }))
    }
    if (/khong\s*hanh|bo\s*hanh/i.test(clean)) {
      events.push(createFactEvent({
        slot: 'dietary_notes',
        operation: 'APPEND',
        value: 'Không ăn hành',
        sourceTurnId: turn.id,
        sourceTurnIndex: turn.index,
        speaker: turn.speaker,
        evidence: 'không hành',
        explicitness: 'explicit',
        extractionConfidence: 0.95
      }))
    }
    if (/an\s*chay|mon\s*chay/i.test(clean)) {
      events.push(createFactEvent({
        slot: 'dietary_notes',
        operation: 'APPEND',
        value: 'Ăn chay',
        sourceTurnId: turn.id,
        sourceTurnIndex: turn.index,
        speaker: turn.speaker,
        evidence: 'ăn chay',
        explicitness: 'explicit',
        extractionConfidence: 0.95
      }))
    }

    // 8. Menu Resolution Cascade & Items
    // Strip conditional clauses to prevent matching conditional sets as direct orders
    const directMenuContent = content.replace(/nếu\s+[\s\S]+/gi, '')
    const dishRegex = /(\d+)\s+([a-zA-Z\p{L}\s]+?)(?=[,.\n]|và|cái\s+món|nếu|$)/gui
    let dMatch
    while ((dMatch = dishRegex.exec(directMenuContent)) !== null) {
      const qty = parseInt(dMatch[1], 10)
      const dishRaw = dMatch[2].trim()

      if (dishRaw.length >= 3 && !/^(người|khách|bé|ghế|con|tuần|tháng|bạn)$/i.test(dishRaw)) {
        const resolution = resolveMenuCascade(dishRaw, menuKb)
        if (resolution.acceptedItem) {
          events.push(createFactEvent({
            slot: 'menu_item',
            operation: 'APPEND',
            value: {
              name: resolution.acceptedItem.canonicalName,
              quantity: qty,
              unit_price: resolution.acceptedItem.unitPrice || 0,
              note: ''
            },
            sourceTurnId: turn.id,
            sourceTurnIndex: turn.index,
            speaker: turn.speaker,
            evidence: dMatch[0],
            explicitness: 'explicit',
            extractionConfidence: resolution.confidence
          }))
        }
      }
    }

    // Recommendation intents: "cái món gà nướng gì bên em bán chạy ấy lấy 2"
    const recIntents = extractRecommendationIntents(content)
    for (const rec of recIntents) {
      events.push(createFactEvent({
        slot: 'recommendation_intent',
        operation: 'APPEND',
        value: rec,
        sourceTurnId: turn.id,
        sourceTurnIndex: turn.index,
        speaker: turn.speaker,
        evidence: rec.raw,
        explicitness: 'explicit',
        extractionConfidence: 0.92
      }))
    }

    // Conditional menu requests: "Nếu có set 4 người ăn bò ngon thì đổi... không có thì..."
    const condRequests = extractConditionalMenuRequests(content)
    for (const cond of condRequests) {
      events.push(createFactEvent({
        slot: 'conditional_request',
        operation: 'APPEND',
        value: cond,
        sourceTurnId: turn.id,
        sourceTurnIndex: turn.index,
        speaker: turn.speaker,
        evidence: cond.raw,
        explicitness: 'explicit',
        extractionConfidence: 0.95
      }))
    }
  }

  // Pure deterministic state reduction from event log
  const state = reduceBookingEvents(events)

  // Operational constraint checks
  const violations = evaluateBookingConstraints(state)

  // Provenance audit trail
  const auditTrail = buildProvenanceAuditTrail(traceId, events)

  // Backward compatible legacy payload
  const legacyFormPayload = {
    customer: {
      name: state.customer.name,
      phone: state.customer.phone,
      contact_person: state.customer.contact_person
    },
    booking: {
      date: state.booking.event_date,
      time: state.booking.event_time,
      guest_count: state.booking.guest_count,
      table: state.booking.table_code,
      need: state.booking.need
    },
    deposit: {
      amount: state.deposit.amount,
      status: state.deposit.status,
      sender_name: state.deposit.sender_name,
      transfer_note: state.deposit.transfer_note
    },
    party: {
      owner_name: state.party.owner_name,
      decor_color: state.party.decor_color,
      special_request: state.party.special_request,
      display_board_text: state.party.display_board_text,
      mirror_board_text: state.party.mirror_board_text,
      seating_preference: state.party.seating_preference,
      dietary_notes: state.party.dietary_notes
    },
    items: state.menu.items.map(item => ({
      name: item.name,
      quantity: item.quantity,
      note: item.note,
      unit_price: item.unit_price
    })),
    warnings: violations.map(v => `[${v.severity}] ${v.title}: ${v.message}`)
  }

  return {
    state,
    events,
    envelope,
    violations,
    auditTrail,
    safetyGate,
    legacyFormPayload
  }
}
