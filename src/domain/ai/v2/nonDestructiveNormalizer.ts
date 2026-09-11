import { stripAccents } from '@/utils'

export type NumericPrecision = 'exact' | 'approximate' | 'range' | 'minimum' | 'maximum' | 'unknown'

export interface NumericRangeValue {
  exact: number | null
  min: number | null
  max: number | null
  precision: NumericPrecision
  raw: string
  possibleAdditional?: number
  isConfirmed: boolean
}

export type TimePrecision = 'exact' | 'approximate' | 'range' | 'unknown'

export interface BookingTimeValue {
  exact: string | null
  approximateAround: string | null
  approximateAfter: string | null
  approximateBefore: string | null
  precision: TimePrecision
  raw: string
}

/**
 * Extracts numeric guest count representation preserving uncertainty and ranges.
 * Does NOT destructively coerce ranges like "8-10" into a single hardcoded number.
 */
export function parseGuestCountNonDestructive(text: string): NumericRangeValue | null {
  if (!text) return null
  const clean = stripAccents(text).toLowerCase()

  // 1. Check range patterns with additional guests, e.g. "Khoảng 18 người, có thể thêm 2, chị chốt chính xác sau"
  const addlMatch = clean.match(/(?:khoang|tam|co|chung|tam\s*tam)?\s*(\d+)\s*(?:nguoi|khach|pax)?\s*[,.]?\s*(?:co\s*the\s*them|them|du\s*kien\s*them)\s*(\d+)/i)
  if (addlMatch) {
    const base = parseInt(addlMatch[1], 10)
    const addl = parseInt(addlMatch[2], 10)
    return {
      exact: null,
      min: base,
      max: base + addl,
      precision: 'range',
      raw: addlMatch[0],
      possibleAdditional: addl,
      isConfirmed: false
    }
  }

  // 2. Range patterns: "tầm 8-10 người", "khoảng 12 đến 15 khách", "12-15 pax", "12 - 15 khách"
  const rangeMatch = clean.match(/(?:khoang|tam|co|chung|uoc\s*chung)?\s*(\d+)\s*(?:-|–|—|den|to)\s*(\d+)\s*(?:pax|nguoi|khach|ng\b)?/i)
  if (rangeMatch) {
    const min = Math.min(parseInt(rangeMatch[1], 10), parseInt(rangeMatch[2], 10))
    const max = Math.max(parseInt(rangeMatch[1], 10), parseInt(rangeMatch[2], 10))
    return {
      exact: null,
      min,
      max,
      precision: 'range',
      raw: rangeMatch[0],
      isConfirmed: !/chua\s*chot|chot\s*sau|tinh\s*sau/i.test(clean)
    }
  }

  // 3. Approximate single number: "khoảng 10 người", "tầm 15 khách", "cỡ 20 bạn"
  const approxMatch = clean.match(/(?:khoang|tam|co|chung|uoc\s*chung)\s*(\d+)\s*(?:pax|nguoi|khach|ng\b|ban\b)/i)
  if (approxMatch) {
    const val = parseInt(approxMatch[1], 10)
    return {
      exact: null,
      min: Math.max(1, val - 1),
      max: val + 2,
      precision: 'approximate',
      raw: approxMatch[0],
      isConfirmed: false
    }
  }

  // 4. Exact count with adults + children addition: "10 người lớn với 3 bé", "10 lớn 3 nhỏ"
  const additionMatch = clean.match(/(\d+)\s*(?:nguoi\s*lon|lon|ng\s*lon)\s*(?:\+|,|va|voi)?\s*(\d+)\s*(?:tre\s*em|nho|be)\b/i)
  if (additionMatch) {
    const adults = parseInt(additionMatch[1], 10)
    const kids = parseInt(additionMatch[2], 10)
    const total = adults + kids
    return {
      exact: total,
      min: total,
      max: total,
      precision: 'exact',
      raw: additionMatch[0],
      isConfirmed: true
    }
  }

  // 5. Exact number: "13 người", "15 khách", "20 pax", "13 thôi"
  const exactMatch = clean.match(/(?<![:\d\/])\b(\d+)\s*(?:pax|nguoi|khach|ng\b|thoi\b)/i)
  if (exactMatch) {
    const val = parseInt(exactMatch[1], 10)
    return {
      exact: val,
      min: val,
      max: val,
      precision: 'exact',
      raw: exactMatch[0],
      isConfirmed: true
    }
  }

  return null
}

/**
 * Extracts booking time representation preserving approximate vs exact indicators.
 * Does NOT destructively turn "19h hơn" into 19:15 or "khoảng 7h" into exact 19:00.
 */
export function parseBookingTimeNonDestructive(text: string): BookingTimeValue | null {
  if (!text) return null
  const clean = stripAccents(text).toLowerCase()

  // 1. Approximate after: "19h hơn", "7h hơn"
  const afterMatch = clean.match(/(\d{1,2})\s*(?:h|gio)\s*(?:hon|tro\s*di)\b/i)
  if (afterMatch) {
    let h = parseInt(afterMatch[1], 10)
    if (h < 12 && !/sang|trua|am/i.test(clean)) h += 12
    const hStr = `${String(h).padStart(2, '0')}:00`
    return {
      exact: null,
      approximateAround: hStr,
      approximateAfter: hStr,
      approximateBefore: null,
      precision: 'approximate',
      raw: afterMatch[0]
    }
  }

  // 2. Approximate around: "khoảng 7h", "tầm 19h", "cỡ 18h30"
  const aroundMatch = clean.match(/(?:khoang|tam|co|chung)\s*(\d{1,2})(?::(\d{2})|h(\d{2})|h)?\b/i)
  if (aroundMatch) {
    let h = parseInt(aroundMatch[1], 10)
    if (h < 12 && !/sang|trua|am/i.test(clean)) h += 12
    const m = aroundMatch[2] || aroundMatch[3] || '00'
    const formatted = `${String(h).padStart(2, '0')}:${m}`
    return {
      exact: null,
      approximateAround: formatted,
      approximateAfter: null,
      approximateBefore: null,
      precision: 'approximate',
      raw: aroundMatch[0]
    }
  }

  // 3. Exact colon or 'h' time: "19:00", "19h30", "18:30", "7h", "7 rưỡi"
  const rưỡiMatch = clean.match(/(\d{1,2})\s*(?:h|gio)?\s*(?:ruoi|30)\b/i)
  if (rưỡiMatch) {
    let h = parseInt(rưỡiMatch[1], 10)
    if (h < 12 && !/sang|trua|am/i.test(clean)) h += 12
    const formatted = `${String(h).padStart(2, '0')}:30`
    return {
      exact: formatted,
      approximateAround: formatted,
      approximateAfter: null,
      approximateBefore: null,
      precision: 'exact',
      raw: rưỡiMatch[0]
    }
  }

  const standardMatch = clean.match(/\b(\d{1,2}):(\d{2})\b/) || clean.match(/\b(\d{1,2})h(\d{2})?\b/i)
  if (standardMatch) {
    let h = parseInt(standardMatch[1], 10)
    if (h < 12 && !/sang|trua|am/i.test(clean)) h += 12
    const m = standardMatch[2] ? standardMatch[2] : '00'
    const formatted = `${String(h).padStart(2, '0')}:${m}`
    return {
      exact: formatted,
      approximateAround: formatted,
      approximateAfter: null,
      approximateBefore: null,
      precision: 'exact',
      raw: standardMatch[0]
    }
  }

  return null
}
