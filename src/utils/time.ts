/**
 * Timezone & Date Normalization Utilities
 * Enforces Vietnam Standard Time (Asia/Ho_Chi_Minh - GMT+7) across all operations.
 */

export const RESTAURANT_TIMEZONE = 'Asia/Ho_Chi_Minh'
export const RESTAURANT_TIMEZONE_OFFSET_HOURS = 7

/**
 * Returns current Date object in Restaurant Timezone context.
 */
export function getRestaurantNow(): Date {
  return new Date()
}

/**
 * Formats a Date object or ISO string to standard restaurant date string DD/MM/YYYY.
 */
export function formatRestaurantDate(dateInput: Date | string | number): string {
  if (!dateInput) return ''
  const date = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput
  if (isNaN(date.getTime())) return ''

  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()

  return `${day}/${month}/${year}`
}

/**
 * Formats a Date object or ISO string to standard restaurant time string HH:mm (24h).
 */
export function formatRestaurantTime(dateInput: Date | string | number): string {
  if (!dateInput) return ''
  const date = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput
  if (isNaN(date.getTime())) return ''

  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  return `${hours}:${minutes}`
}

/**
 * Parses a DD/MM/YYYY date string and HH:mm time string into a valid Date object.
 */
export function parseRestaurantDateTime(dateStr: string, timeStr = '18:00'): Date | null {
  if (!dateStr) return null
  const dateParts = dateStr.trim().split('/')
  if (dateParts.length < 2) return null

  const day = parseInt(dateParts[0], 10)
  const month = parseInt(dateParts[1], 10) - 1
  const year = dateParts[2] ? parseInt(dateParts[2], 10) : new Date().getFullYear()

  let hour = 18
  let minute = 0
  if (timeStr) {
    const timeMatch = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/)
    if (timeMatch) {
      hour = parseInt(timeMatch[1], 10)
      minute = parseInt(timeMatch[2], 10)
    }
  }

  const d = new Date(year, month, day, hour, minute, 0, 0)
  return isNaN(d.getTime()) ? null : d
}

/**
 * Parses time string (e.g., "18:30" or "19h15" or "19h") into minutes from start of day.
 */
export function parseTimeToMinutes(timeStr: string | null | undefined): number {
  if (!timeStr) return 0
  const clean = timeStr.trim().toLowerCase()
  const match = clean.match(/^(\d{1,2})(?:[:h\.](\d{1,2}))?/)
  if (!match) return 0
  const hours = parseInt(match[1], 10) || 0
  const minutes = parseInt(match[2], 10) || 0
  return hours * 60 + minutes
}

/**
 * Calculates remaining minutes until a booking event.
 */
export function getMinutesUntilBooking(dateStr: string, timeStr: string): number | null {
  const targetDate = parseRestaurantDateTime(dateStr, timeStr)
  if (!targetDate) return null
  const now = getRestaurantNow()
  return Math.round((targetDate.getTime() - now.getTime()) / (60 * 1000))
}


