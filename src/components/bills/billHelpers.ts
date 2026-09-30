import { formatVND, formatShortVND } from '@/utils'

export { formatVND, formatShortVND }

export function getDayOfWeek(dateStr?: string): string {
  if (!dateStr) return ''
  try {
    const parts = dateStr.split('/')
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10)
      const month = parseInt(parts[1], 10) - 1
      const year = parseInt(parts[2], 10)
      const date = new Date(year, month, day)
      if (!isNaN(date.getTime())) {
        const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']
        return days[date.getDay()]
      }
    }
    return ''
  } catch (e) {
    return ''
  }
}

export function formatDepositTime(timeStr?: string): string {
  if (!timeStr) return '✓'
  try {
    const parts = timeStr.split(/[\s,]+/)
    let datePart = parts.find(p => p.includes('/'))
    let timePart = parts.find(p => p.includes(':'))
    if (datePart && timePart) {
      timePart = timePart.split(':').slice(0, 2).join(':')
      return `${datePart} - ${timePart}`
    }
    return timeStr
  } catch (e) {
    return timeStr
  }
}
