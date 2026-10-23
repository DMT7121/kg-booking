import { ref, watchEffect, type Ref } from 'vue'
import QRCode from 'qrcode'
import { formatVND, formatShortVND } from '@/utils'

export { formatVND, formatShortVND }

const _qrCache = new Map<string, string>()

export async function getCachedQRCodeDataURL(text: string, width = 240): Promise<string> {
  const key = `${width}:${text}`
  const cached = _qrCache.get(key)
  if (cached) return cached
  try {
    const dataUrl = await QRCode.toDataURL(text, {
      margin: 1,
      width,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    })
    _qrCache.set(key, dataUrl)
    return dataUrl
  } catch {
    return ''
  }
}

export function useVerificationQr(linkSource: () => string, width = 240): Ref<string> {
  const qrDataUrl = ref('')
  watchEffect(() => {
    const raw = linkSource() || 'https://kg-booking.pages.dev'
    const key = `${width}:${raw}`
    const cached = _qrCache.get(key)
    if (cached) {
      qrDataUrl.value = cached
      return
    }
    getCachedQRCodeDataURL(raw, width).then((url) => {
      if (url) qrDataUrl.value = url
    })
  })
  return qrDataUrl
}

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

export function parseBillItemNote(noteStr?: string): { components: string[]; customNotes: string[] } {
  if (!noteStr || !noteStr.trim()) return { components: [], customNotes: [] }
  const lines = noteStr.split('\n').map(l => l.trim()).filter(Boolean)
  const components: string[] = []
  const customNotes: string[] = []
  for (const line of lines) {
    if (/^\d{1,2}\s*\/\s*\S+/.test(line)) {
      components.push(line)
    } else {
      customNotes.push(line)
    }
  }
  return { components, customNotes }
}
