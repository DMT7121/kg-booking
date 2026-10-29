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

export interface ParsedSetComponent {
  index: string
  name: string
  qty: string | null
  raw: string
}

export function parseSetComponentLine(line: string): ParsedSetComponent {
  const trimmed = (line || '').trim()
  const match = trimmed.match(/^(\d{1,2})\s*[\/\.\)]\s*(.+?)(?:\s*\[(\d+)\])?\s*$/)
  if (match) {
    return {
      index: match[1],
      name: match[2].trim(),
      qty: match[3] || null,
      raw: trimmed
    }
  }
  return {
    index: '•',
    name: trimmed,
    qty: null,
    raw: trimmed
  }
}

function splitInlineSetComponents(rawLine: string): { prefixNote: string | null; items: string[] } {
  const trimmed = (rawLine || '').trim()
  if (!trimmed) return { prefixNote: null, items: [] }

  const splitIndices: number[] = []
  let depth = 0

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i]
    if (ch === '(' || ch === '[') {
      depth++
      continue
    }
    if (ch === ')' || ch === ']') {
      depth = Math.max(0, depth - 1)
      continue
    }
    if (depth === 0 && (i === 0 || /[\s,;•|]/.test(trimmed[i - 1]))) {
      const rest = trimmed.slice(i)
      const m = rest.match(/^(?:[1-9]|1[0-9]|20)\s*(?:\/|\.(?=\s)|(?:\)(?=\s)))\s*\S/)
      if (m) {
        splitIndices.push(i)
      }
    }
  }

  if (splitIndices.length === 0) {
    return { prefixNote: trimmed, items: [] }
  }

  let prefixNote: string | null = null
  if (splitIndices[0] > 0) {
    const rawPrefix = trimmed.slice(0, splitIndices[0]).trim().replace(/[:\-–—|,;\s]+$/, '').trim()
    const isGenericHeader = /^(?:chi\s*tiết(?:\s*(?:gói|set|combo|menu|thực\s*đơn))?|bao\s*gồm|gồm\s*có|gồm|danh\s*sách\s*món)$/i.test(rawPrefix)
    if (rawPrefix && !isGenericHeader) {
      prefixNote = rawPrefix
    }
  }

  const items: string[] = []
  for (let k = 0; k < splitIndices.length; k++) {
    const start = splitIndices[k]
    const end = k + 1 < splitIndices.length ? splitIndices[k + 1] : trimmed.length
    const segment = trimmed.slice(start, end).trim().replace(/^[,;\s]+|[,;\s]+$/g, '')
    if (segment) items.push(segment)
  }

  return { prefixNote, items }
}

export function parseBillItemNote(noteStr?: string): {
  components: string[]
  parsedComponents: ParsedSetComponent[]
  customNotes: string[]
} {
  if (!noteStr || !noteStr.trim()) {
    return { components: [], parsedComponents: [], customNotes: [] }
  }
  const lines = noteStr.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const components: string[] = []
  const parsedComponents: ParsedSetComponent[] = []
  const customNotes: string[] = []
  for (const line of lines) {
    const { prefixNote, items } = splitInlineSetComponents(line)
    if (prefixNote) {
      customNotes.push(prefixNote)
    }
    for (const itemLine of items) {
      components.push(itemLine)
      parsedComponents.push(parseSetComponentLine(itemLine))
    }
  }
  return { components, parsedComponents, customNotes }
}
