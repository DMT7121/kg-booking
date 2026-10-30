/**
 * Utility functions
 * Migrated from King's Grill Manager AI v1.8.6
 */

/** Load external JS library dynamically */
export const loadLibrary = (src: string): Promise<void> => new Promise((resolve, reject) => {
  if (document.querySelector(`script[src="${src}"]`)) return resolve()
  const s = document.createElement('script')
  s.src = src
  s.onload = () => resolve()
  s.onerror = () => reject(new Error(`Failed to load: ${src}`))
  document.head.appendChild(s)
})

/** Remove Vietnamese diacritical marks */
export const stripAccents = (s: string | any): string => {
  if (!s) return ''
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
}


/** Format number to VND currency string */
export const formatVND = (v: number): string =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(v)

/** Safe JSON parse - extracts JSON object from text (handles markdown fences, <think> blocks, escaped chars) */
export const parseJSON = <T = any>(t: string | object): T | null => {
  if (typeof t === 'object') return t as T
  if (!t) return null
  let s = String(t)
  // Strip <think>...</think> reasoning blocks
  s = s.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  // Strip markdown code fences: ```json ... ``` or ``` ... ```
  s = s.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '').trim()
  // Try direct parse first (preserves valid \n escapes in JSON string values)
  try { return JSON.parse(s) } catch {}
  // Extract outermost { ... } block and try direct parse
  const rawMatch = s.match(/\{[\s\S]*\}/)
  if (rawMatch) {
    try { return JSON.parse(rawMatch[0]) } catch {}
  }
  // Fallback: Fix escaped/literal newlines that break malformed JSON
  s = s.replace(/\\n/g, ' ').replace(/\r?\n/g, ' ')
  try { return JSON.parse(s.trim()) } catch {}
  const m = s.match(/\{[\s\S]*\}/)
  if (m) {
    try { return JSON.parse(m[0]) } catch {}
    // Try fixing common issues: trailing commas, single quotes
    const cleaned = m[0]
      .replace(/,\s*([\]}])/g, '$1')  // trailing commas
      .replace(/'/g, '"')             // single quotes → double
    try { return JSON.parse(cleaned) } catch {}
  }
  return null
}

/** Format date string to dd/mm/yyyy */
export const formatDateStr = (d: string): string => {
  if (!d) return ''
  const str = String(d).trim()
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return str
  
  // Match DD/MM (e.g. 06/08 or 6/8)
  const ddmm = str.match(/^(\d{1,2})\/(\d{1,2})$/)
  if (ddmm) {
    const day = ddmm[1].padStart(2, '0')
    const month = ddmm[2].padStart(2, '0')
    const year = new Date().getFullYear()
    return `${day}/${month}/${year}`
  }
  
  // Match DD/MM/YYYY (e.g. 6/8/2026)
  const ddmmyyyy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (ddmmyyyy) {
    const day = ddmmyyyy[1].padStart(2, '0')
    const month = ddmmyyyy[2].padStart(2, '0')
    const year = ddmmyyyy[3]
    return `${day}/${month}/${year}`
  }

  // Match YYYY-MM-DD (e.g. 2026-08-06)
  const yyyymmdd = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (yyyymmdd) {
    const year = yyyymmdd[1]
    const month = yyyymmdd[2].padStart(2, '0')
    const day = yyyymmdd[3].padStart(2, '0')
    return `${day}/${month}/${year}`
  }

  const date = new Date(str)
  return isNaN(date.getTime())
    ? str
    : `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
}

/** Clean and normalize phone number */
export const cleanPhoneNumber = (p: string): string => {
  const s = String(p).trim()
  return (s.length === 9 && /^\d+$/.test(s)) ? '0' + s : s
}

/** Resize image to max width, returns base64 data URL */
export const resizeImage = (
  base64Str: string,
  maxWidth = 1024,
  quality = 0.8,
  format = 'image/jpeg'
): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image()
    img.src = base64Str
    img.onload = () => {
      const canvas = document.createElement('canvas')
      let width = img.width
      let height = img.height
      if (width > maxWidth) {
        height *= maxWidth / width
        width = maxWidth
      }
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      
      // Enable high-quality smoothing for sharp text rendering
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL(format, quality))
    }
  })
}

/** Split a single line containing multiple numbered set items (e.g. "1/ Dish A [1] 2/ Dish B (10) [1]") safely outside () and [] */
const splitNumberedSetLine = (line: string): string[] => {
  const trimmed = line.trim()
  if (!trimmed) return []

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
    if (depth === 0 && (i === 0 || /\s/.test(trimmed[i - 1]))) {
      const rest = trimmed.slice(i)
      // Match "1/ ", "2/ ", "1. ", "2) " at top level (1..15)
      const m = rest.match(/^(?:[1-9]|1[0-5])\s*(?:\/|\.(?=\s)|(?:\)(?=\s)))\s*/)
      if (m) {
        splitIndices.push(i)
      }
    }
  }

  if (splitIndices.length <= 1) {
    return [trimmed]
  }

  const parts: string[] = []
  for (let k = 0; k < splitIndices.length; k++) {
    const start = splitIndices[k]
    const end = k + 1 < splitIndices.length ? splitIndices[k + 1] : trimmed.length
    const segment = trimmed.slice(start, end).trim().replace(/^[,;\s]+|[,;\s]+$/g, '')
    if (segment) parts.push(segment)
  }
  return parts
}

/** Format set/combo note - split numbered or comma-separated items into clean multi-line list */
export const formatSetNote = (str: string): string => {
  if (!str) return ''

  // First split by existing newlines, and also split any line that has multiple top-level numbered items
  const rawLines = String(str)
    .split(/\r?\n/)
    .flatMap(line => splitNumberedSetLine(line))
    .map(line => line.trim())
    .filter(Boolean)

  if (rawLines.length > 1) {
    return rawLines.join('\n')
  }

  const single = rawLines[0] || ''
  if (!single) return ''

  // If it starts with a numbered prefix like "1/", return as-is
  if (/^(?:[1-9]|1[0-5])\s*[\/\.\)]/.test(single)) {
    return single
  }

  const result: string[] = []
  let currentPart = ''
  let depth = 0

  for (let i = 0; i < single.length; i++) {
    const char = single[i]
    if (char === '(' || char === '[') depth++
    if (char === ')' || char === ']') depth = Math.max(0, depth - 1)
    if (char === ',' && depth === 0) {
      if (currentPart.trim()) result.push(currentPart.trim())
      currentPart = ''
    } else {
      currentPart += char
    }
  }
  if (currentPart.trim()) result.push(currentPart.trim())

  if (result.length > 1) {
    return result.map((s, i) => `${i + 1}. ${s}`).join('\n')
  }
  return single
}

/** Normalize a set component line for deduplication comparison */
const normalizeSetComponentLine = (line: string): string => {
  return stripAccents(line)
    .toLowerCase()
    .replace(/^\d+\s*[\/\.\)]\s*/, '')
    .replace(/\[\d+\]/g, '')
    .replace(/\(\d+(?:\s*con)?\)/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Merge existing item note with canonical formatted Set/Combo component list
 * without duplicating component lines that are already present.
 */
export const mergeSetComponentNote = (existingNote: string, canonicalDescription: string): string => {
  const formattedCanonical = formatSetNote(canonicalDescription)
  if (!formattedCanonical) return (existingNote || '').trim()
  if (!existingNote || !existingNote.trim()) return formattedCanonical

  const trimmedExisting = existingNote.trim()
  if (trimmedExisting === formattedCanonical) return formattedCanonical

  const canonicalLines = formattedCanonical.split('\n').map(l => l.trim()).filter(Boolean)
  const canonicalExactLowerSet = new Set(
    canonicalLines.map(l => l.replace(/\s+/g, ' ').trim().toLowerCase())
  )
  const canonicalNorms = canonicalLines.map(normalizeSetComponentLine).filter(Boolean)

  const existingLines = formatSetNote(trimmedExisting).split('\n').map(l => l.trim()).filter(Boolean)
  const customLines: string[] = []

  const ACCENTED_MOD_REGEX = /(?<!\p{L})(?:đổi|thay|bỏ|không\s+lấy|không\s+ăn|không\s+hành|không\s+cay|ít\s+cay|tách\s+riêng|để\s+riêng|ghi\s+chú|lưu\s+ý|yêu\s+cầu)(?!\p{L})/iu
  const UNACCENTED_MOD_REGEX = /\b(?:doi|thay|bo\s+(?:mon|ra|phan|hanh|cay|tieu|ngo|khong)|khong\s+(?:lay|an|hanh|cay|ngo|tieu)|it\s+cay|tach\s+rieng|de\s+rieng|ghi\s+chu|luu\s+y|yeu\s+cau)\b|^them\s+/i

  for (const line of existingLines) {
    const collapsedLower = line.replace(/\s+/g, ' ').trim().toLowerCase()
    if (canonicalExactLowerSet.has(collapsedLower)) continue

    const normLine = normalizeSetComponentLine(line)
    if (!normLine) continue

    const strippedLower = stripAccents(line).toLowerCase().trim()
    const hasModification = ACCENTED_MOD_REGEX.test(line) || UNACCENTED_MOD_REGEX.test(strippedLower)
    const matchesCanonical = canonicalNorms.some(cNorm => {
      if (cNorm === normLine) return true
      const lineWords = normLine.split(' ').filter(w => w.length > 1)
      const cWords = cNorm.split(' ').filter(w => w.length > 1)
      if (lineWords.length >= 2 && cWords.length >= 2) {
        const shared = lineWords.filter(w => cWords.includes(w)).length
        return shared / Math.max(lineWords.length, cWords.length) >= 0.7
      }
      return false
    })

    if (!matchesCanonical || hasModification) {
      if (!customLines.includes(line)) {
        customLines.push(line)
      }
    }
  }

  if (customLines.length === 0) {
    return formattedCanonical
  }

  return `${customLines.join('\n')}\n${formattedCanonical}`
}

/** Detect iOS device */
export const isIOS = typeof navigator !== 'undefined' &&
  !/Windows|Win32|Win64/i.test(navigator.userAgent) &&
  !(typeof navigator.platform === 'string' && /Win/i.test(navigator.platform)) &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

/** Detect Android device */
export const isAndroid = typeof navigator !== 'undefined' &&
  !/Windows|Win32|Win64/i.test(navigator.userAgent) &&
  !(typeof navigator.platform === 'string' && /Win/i.test(navigator.platform)) &&
  /Android/i.test(navigator.userAgent)

/** Detect any mobile device (iOS, Android, tablets, WebViews) */
export const isMobile = typeof navigator !== 'undefined' && (
  isIOS || isAndroid ||
  /webOS|BlackBerry|Opera Mini|IEMobile/i.test(navigator.userAgent) ||
  (navigator.maxTouchPoints > 0 && window.innerWidth < 1024)
)

/** Detect Windows, Mac, or Linux Desktop */
export const isDesktop = typeof navigator !== 'undefined' && (
  /Windows/i.test(navigator.userAgent) ||
  (/Macintosh/i.test(navigator.userAgent) && !(navigator.maxTouchPoints > 1)) ||
  (/Linux/i.test(navigator.userAgent) && !/Android/i.test(navigator.userAgent))
)


/** HTML escape to prevent XSS attacks */
export const escapeHtml = (unsafe: string): string => {
  if (!unsafe) return ''
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/** Generate unique booking ID: KG-YYYYMMDD-HHMMSS-RANDOM */
export const generateBookingId = (): string => {
  const now = new Date()
  const yyyymmdd = now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0')
  const hhmmss = String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0')
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `KG-${yyyymmdd}-${hhmmss}-${rand}`
}

export { formatShortVND } from './money'

/** Format current local date time for deposit: DD/MM/YYYY - HH:mm */
export const formatCurrentDepositTime = (d = new Date()): string => {
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${day}/${month}/${year} - ${hours}:${minutes}`
}

/** Convert any timestamp string to DD/MM/YYYY - HH:mm */
export const formatTimestampToDepositTime = (ts?: string): string => {
  if (!ts) return formatCurrentDepositTime()
  try {
    const d = new Date(ts)
    if (!isNaN(d.getTime())) {
      return formatCurrentDepositTime(d)
    }
    return ts
  } catch {
    return ts
  }
}

