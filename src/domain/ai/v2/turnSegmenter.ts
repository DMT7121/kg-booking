import { stripAccents } from '@/utils'
import type { ConversationTurn, SpeakerRole } from './inputEnvelope'

/**
 * Heuristically identifies the speaker based on conversational context and Vietnamese F&B phrasing.
 */
export function detectSpeaker(line: string, previousSpeaker?: SpeakerRole): { speaker: SpeakerRole; content: string } {
  const trimmed = line.trim()
  if (!trimmed) return { speaker: 'unknown', content: '' }

  // 1. Explicit speaker prefixes
  const staffPrefixMatch = trimmed.match(/^(?:nh[aâ]n\s*vi[eê]n|nv|page|bot|ad|admin|qu[aá]n|king'?s\s*grill)\s*[:\-–—]\s*(.*)$/i)
  if (staffPrefixMatch) {
    return { speaker: 'staff', content: staffPrefixMatch[1].trim() }
  }

  const customerPrefixMatch = trimmed.match(/^(?:kh[aá]ch(?:\s*h[aà]ng)?|kh|b[aạ]n|ch[iị]|anh|em)\s*[:\-–—]\s*(.*)$/i)
  if (customerPrefixMatch) {
    return { speaker: 'customer', content: customerPrefixMatch[1].trim() }
  }

  const systemPrefixMatch = trimmed.match(/^(?:h[eệ]\s*th[oố]ng|system)\s*[:\-–—]\s*(.*)$/i)
  if (systemPrefixMatch) {
    return { speaker: 'system', content: systemPrefixMatch[1].trim() }
  }

  // 2. Heuristic detection from colloquial F&B cues
  const cleanNoAccents = stripAccents(trimmed).toLowerCase()

  // Staff indicators (greeting customer, confirming booking, answering capacity)
  const isStaffHeuristic = /^(?:da\s+(?:anh|chi|em|ban|quy\s*khach)|ben\s*em|quan\s*em|nha\s*hang\s*em|em\s*xac\s*nhan|em\s*ghi\s*nhan|em\s*gui\s*chuyen\s*khoan|chuc\s*anh\s*chi)\b/i.test(cleanNoAccents) ||
    /\b(?:da\s+chi\s+chot|da\s+anh\s+chot|da\s+ben\s*em\s*san\s*sang|minh\s+di\s+may\s+nguoi\s+a)\b/i.test(cleanNoAccents)

  if (isStaffHeuristic) {
    return { speaker: 'staff', content: trimmed }
  }

  // Customer indicators (greeting staff with "em ơi", placing order, confirmation answers)
  const isCustomerHeuristic = /^(?:em\s+oi|shop\s+oi|quan\s+oi|alo\s+em|cho\s+(?:anh|chi|minh|em)\s+(?:dat|lay|book)|dung\s+em|dung\s+roi|chot\s+(?:nha|nhe)|a\s+khoan|khoan)\b/i.test(cleanNoAccents)

  if (isCustomerHeuristic) {
    return { speaker: 'customer', content: trimmed }
  }

  // If previous speaker was staff and current line is a short confirmation
  if (previousSpeaker === 'staff' && /^(?:dung|ok|oke|duoc|chuan|chot|vang)\b/i.test(cleanNoAccents)) {
    return { speaker: 'customer', content: trimmed }
  }

  return {
    speaker: previousSpeaker === 'staff' ? 'customer' : 'customer',
    content: trimmed
  }
}

/**
 * Segments raw conversation text into ordered ConversationTurns with speakers preserved.
 */
export function segmentTurns(rawText: string): ConversationTurn[] {
  if (!rawText || !rawText.trim()) return []

  const rawLines = rawText.split('\n').map(l => l.trim()).filter(Boolean)
  const turns: ConversationTurn[] = []

  let lastSpeaker: SpeakerRole = 'unknown'

  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i]
    const { speaker, content } = detectSpeaker(rawLine, lastSpeaker)

    turns.push({
      id: `turn_${i + 1}`,
      index: i + 1,
      speaker,
      rawText: rawLine,
      normalizedText: content || rawLine
    })

    lastSpeaker = speaker
  }

  return turns
}
