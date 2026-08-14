/**
 * Shared time utility functions.
 * Extracted from duplicated inline implementations across the codebase.
 */

/**
 * Parse a time string (HH:MM) into minutes since midnight.
 * Uses fast charCode parsing for common 5-char format, falls back to regex.
 * Returns 0 if unparseable (callers that need a different default should handle it).
 */
export function parseTimeToMinutes(tStr: string): number {
  if (!tStr) return 0
  // Fast path for "HH:MM" (5-char, colon at index 2)
  if (tStr.length === 5 && tStr[2] === ':') {
    const h = (tStr.charCodeAt(0) - 48) * 10 + (tStr.charCodeAt(1) - 48)
    const m = (tStr.charCodeAt(3) - 48) * 10 + (tStr.charCodeAt(4) - 48)
    if (h >= 0 && h < 24 && m >= 0 && m < 60) return h * 60 + m
  }
  // Fallback regex for "H:MM" or other formats
  const match = tStr.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return 0
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10)
}
