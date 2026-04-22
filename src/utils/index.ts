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
export const stripAccents = (s: string): string =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')

/** Format number to VND currency string */
export const formatVND = (v: number): string =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(v)

/** Safe JSON parse - extracts JSON object from text (handles markdown fences, escaped chars) */
export const parseJSON = <T = any>(t: string | object): T | null => {
  if (typeof t === 'object') return t as T
  let s = t as string
  // Strip markdown code fences: ```json ... ``` or ``` ... ```
  s = s.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '')
  // Fix escaped newlines that break JSON
  s = s.replace(/\\n/g, ' ').replace(/\r?\n/g, ' ')
  // Try direct parse first
  try { return JSON.parse(s.trim()) } catch {}
  // Extract deepest { ... } block
  const m = s.match(/\{[\s\S]*\}/)
  if (m) {
    try { return JSON.parse(m[0]) } catch {}
    // Try fixing common issues: trailing commas, single quotes
    let cleaned = m[0]
      .replace(/,\s*([\]}])/g, '$1')  // trailing commas
      .replace(/'/g, '"')             // single quotes → double
    try { return JSON.parse(cleaned) } catch {}
  }
  return null
}

/** Format date string to dd/mm/yyyy */
export const formatDateStr = (d: string): string => {
  if (!d) return ''
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) return d
  const date = new Date(d)
  return isNaN(date.getTime())
    ? d
    : `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
}

/** Clean and normalize phone number */
export const cleanPhoneNumber = (p: string): string => {
  const s = String(p).trim()
  return (s.length === 9 && /^\d+$/.test(s)) ? '0' + s : s
}

/** Resize image to max width, returns base64 data URL */
export const resizeImage = (base64Str: string, maxWidth = 1024): Promise<string> => {
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
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', 0.8))
    }
  })
}

/** Format set/combo note - split comma-separated items into numbered list */
export const formatSetNote = (str: string): string => {
  if (!str) return ''
  if (str.includes('\n')) return str

  const result: string[] = []
  let currentPart = ''
  let depth = 0

  for (let i = 0; i < str.length; i++) {
    const char = str[i]
    if (char === '(') depth++
    if (char === ')') depth--
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
  return str
}

/** Detect iOS device */
export const isIOS = typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

/** Detect Android device */
export const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)

/** Detect any mobile device (iOS, Android, tablets, WebViews) */
export const isMobile = typeof navigator !== 'undefined' && (
  isIOS || isAndroid ||
  /webOS|BlackBerry|Opera Mini|IEMobile/i.test(navigator.userAgent) ||
  (navigator.maxTouchPoints > 0 && window.innerWidth < 1024)
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

