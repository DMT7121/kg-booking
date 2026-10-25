import { isIOS, isAndroid, loadLibrary } from '@/utils'

// Lazy loader for modern-screenshot so initial startup bundle stays lightweight
let _domToCanvasPromise: Promise<typeof import('modern-screenshot').domToCanvas> | null = null
function getDomToCanvas() {
  if (!_domToCanvasPromise) {
    _domToCanvasPromise = import('modern-screenshot').then((m) => m.domToCanvas)
  }
  return _domToCanvasPromise
}

export type BillQualityPreset = 'standard' | 'hd' | 'ultra'

export interface RenderBillOptions {
  /** Target DOM element or pre-cloned element */
  element: HTMLElement
  /** Optional pre-captured clone before UI state transitions */
  preClonedElement?: HTMLElement | null
  /** Fixed layout width in CSS pixels (default: 800 for main bill, 600 for public bill, 640 for ticket) */
  width?: number
  /** Quality preset ('standard' = 1.5x, 'hd' = 2.0x, 'ultra' = 3.0x) */
  quality?: BillQualityPreset
  /** Explicit scale override */
  scale?: number
  /** Background color (default: '#ffffff') */
  backgroundColor?: string
  /** Border radius in px to apply to exported card (default: 0) */
  borderRadius?: number
}

export interface RenderedBillResult {
  canvas: HTMLCanvasElement
  scale: number
  width: number
  height: number
}

// ═══════════════════════════════════════════════════════════════════
//  IN-MEMORY ASSET & FONT DATA-URL CACHE (0ms on repeat exports)
// ═══════════════════════════════════════════════════════════════════
const _dataUrlCache = new Map<string, Promise<string>>()

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve((reader.result as string) || '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

function resolveAbsoluteUrl(rawUrl: string): string {
  if (!rawUrl || rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) return rawUrl
  try {
    return new URL(rawUrl, window.location.href).href
  } catch {
    return rawUrl
  }
}

/**
 * Fetches any local or cross-origin asset and caches its Base64 DataURL in memory.
 */
export function fetchUrlAsDataUrl(rawUrl: string): Promise<string> {
  if (!rawUrl) return Promise.resolve('')
  if (rawUrl.startsWith('data:')) return Promise.resolve(rawUrl)

  const absUrl = resolveAbsoluteUrl(rawUrl)
  const existing = _dataUrlCache.get(absUrl)
  if (existing) return existing

  const promise = (async () => {
    const isExternal = absUrl.startsWith('http') && !absUrl.includes(window.location.host)

    // 1. Try direct CORS fetch first (works for same-origin, VietQR, Google Fonts, cdnjs)
    try {
      const res = await fetch(absUrl, {
        mode: 'cors',
        cache: 'force-cache'
      })
      if (res.ok) {
        const blob = await res.blob()
        const dataUrl = await blobToDataUrl(blob)
        if (dataUrl && dataUrl.startsWith('data:')) return dataUrl
      }
    } catch {
      // Fall through to proxy if external
    }

    // 2. Fallback to R2 proxy or wsrv.nl for external images without CORS headers
    if (isExternal) {
      const r2Url = (import.meta as any).env?.VITE_R2_URL || ''
      const proxyUrls = [
        r2Url ? `${r2Url}/proxy?url=${encodeURIComponent(absUrl)}` : '',
        `https://wsrv.nl/?url=${encodeURIComponent(absUrl)}&output=png`
      ].filter(Boolean)

      for (const proxyUrl of proxyUrls) {
        try {
          const res = await fetch(proxyUrl, { mode: 'cors', cache: 'force-cache' })
          if (res.ok) {
            const blob = await res.blob()
            const dataUrl = await blobToDataUrl(blob)
            if (dataUrl && dataUrl.startsWith('data:')) return dataUrl
          }
        } catch {
          // Try next proxy
        }
      }
    }

    throw new Error(`Unable to inline resource: ${absUrl}`)
  })().catch((err) => {
    _dataUrlCache.delete(absUrl)
    throw err
  })

  _dataUrlCache.set(absUrl, promise)
  return promise
}

/**
 * Pre-warms static bill assets (stamps, brand logos) during browser idle time
 * so the first export has zero network wait for static images.
 */
let _prewarmed = false
export function prewarmBillExportAssets(): void {
  if (_prewarmed || typeof window === 'undefined') return
  _prewarmed = true

  const runPrewarm = () => {
    getDomToCanvas().catch(() => {})
    const staticAssets = [
      '/images/stamps/paid.png?v=2',
      '/images/stamps/pending.png?v=2',
      '/images/brand-logo.svg',
      '/favicon.svg'
    ]
    for (const url of staticAssets) {
      fetchUrlAsDataUrl(url).catch(() => {})
    }
  }

  if ('requestIdleCallback' in window) {
    ;(window as any).requestIdleCallback(runPrewarm, { timeout: 2000 })
  } else {
    setTimeout(runPrewarm, 600)
  }
}

// ═══════════════════════════════════════════════════════════════════
//  SMART SCALE CALCULATOR (Zalo / Messenger & Retina Optimized)
// ═══════════════════════════════════════════════════════════════════
export function computeOptimalRenderScale(
  quality: BillQualityPreset,
  width: number,
  height: number,
  explicitScale?: number
): number {
  let targetScale = explicitScale ?? (quality === 'standard' ? 1.5 : quality === 'ultra' ? 3.0 : 2.0)

  // Zalo & Messenger anti-downscale guard for 'hd' mode:
  // Messenger & Zalo aggressively downscale images if longest edge exceeds ~2560px in standard chat.
  // For 'hd' (default), keep longest edge <= 2560px while maintaining at least 1.6x crispness.
  const longestEdge = Math.max(width, height)
  if (!explicitScale && quality === 'hd' && longestEdge * targetScale > 2800) {
    targetScale = Math.max(1.6, Math.min(2.0, 2800 / longestEdge))
  }

  // iOS Safari WebKit Canvas maximum area safety guard (max 16.7M pixels -> safe limit 12.5M pixels)
  if (isIOS) {
    const maxSafePixels = 12_500_000
    const totalPixels = width * targetScale * (height * targetScale)
    if (totalPixels > maxSafePixels) {
      targetScale = Math.max(1.5, Math.floor(Math.sqrt(maxSafePixels / (width * height)) * 10) / 10)
    }
    if (targetScale > 2.5) targetScale = 2.5
  }

  return Math.round(targetScale * 100) / 100
}

// ═══════════════════════════════════════════════════════════════════
//  DOM IMAGE INLINING & PARALLAX NORMALIZATION
// ═══════════════════════════════════════════════════════════════════
async function prepareAndInlineCloneImages(rootEl: HTMLElement): Promise<void> {
  // 1. Neutralize any dynamic hover parallax on stamp overlays so stamp is always centered
  const allElements = rootEl.querySelectorAll<HTMLElement>('[style*="translate("]')
  allElements.forEach((el) => {
    const rawTransform = el.style.transform || ''
    if (rawTransform.includes('translate(') && !rawTransform.includes('-50%')) {
      el.style.transform = rawTransform.replace(/translate\([^)]+\)/g, 'translate(0px, 0px)')
    }
  })

  // 2. Inline all <img> sources from cache / network and decode them
  const imgs = Array.from(rootEl.querySelectorAll('img'))
  await Promise.all(
    imgs.map(async (img) => {
      img.loading = 'eager'
      img.decoding = 'sync'
      const src = img.getAttribute('src') || img.src
      if (!src) return

      if (!src.startsWith('data:')) {
        try {
          const dataUrl = await fetchUrlAsDataUrl(src)
          if (dataUrl) {
            img.srcset = ''
            img.src = dataUrl
          }
        } catch (err) {
          console.warn('[BillExport] Could not inline image, keeping original src:', src, err)
        }
      }

      if ('decode' in img) {
        try {
          await img.decode()
        } catch {
          // Ignore decode warning on SVG/cached images
        }
      }
    })
  )
}

// Lazy fallback loader for html2canvas
let _h2cPromise: Promise<any> | null = null
async function getHtml2CanvasFallback(): Promise<any> {
  if (!_h2cPromise) {
    _h2cPromise = import('html2canvas').then((m) => m.default || m)
  }
  return _h2cPromise
}

// ═══════════════════════════════════════════════════════════════════
//  CORE HIGH-PRECISION DOM -> CANVAS RENDERER
// ═══════════════════════════════════════════════════════════════════
export async function renderBillElementToCanvas(
  options: RenderBillOptions
): Promise<RenderedBillResult> {
  const {
    element,
    preClonedElement,
    width = 800,
    quality = 'hd',
    scale: explicitScale,
    backgroundColor = '#ffffff',
    borderRadius = 0
  } = options

  if (document.fonts?.ready) {
    await document.fonts.ready
  }

  // Create isolated light-mode sandbox container in viewport (opacity: 0.005 forces WebKit layout & image decode)
  const container = document.createElement('div')
  container.id = 'sandbox-container-export'
  container.style.cssText = [
    'position:fixed',
    'top:0',
    'left:0',
    `width:${width}px`,
    'z-index:-9999',
    'visibility:visible',
    'opacity:0.005',
    'pointer-events:none',
    `background:${backgroundColor}`,
    'color-scheme:light',
    'overflow:visible'
  ].join(';')

  const sourceNode = preClonedElement || element
  const clone = sourceNode.cloneNode(true) as HTMLElement

  const originalId = element.id
  if (originalId) {
    element.id = `${originalId}-live-source`
    clone.id = originalId
  }

  // Strip any preview scaling transforms or responsive mobile offsets
  clone.style.cssText = [
    'position:relative !important',
    'transform:none !important',
    'margin:0 !important',
    `width:${width}px !important`,
    `min-width:${width}px !important`,
    `max-width:${width}px !important`,
    'left:auto !important',
    'top:auto !important',
    `background-color:${backgroundColor} !important`,
    'box-shadow:none !important',
    borderRadius ? `border-radius:${borderRadius}px !important` : 'border-radius:0 !important',
    'overflow:hidden !important',
    '-webkit-font-smoothing:antialiased !important',
    'text-rendering:geometricPrecision !important'
  ].join(';')

  container.appendChild(clone)
  document.body.appendChild(container)

  try {
    // Inline images & await decode in parallel
    await prepareAndInlineCloneImages(clone)

    // Allow one layout frame for exact height calculation
    await new Promise<void>((r) => requestAnimationFrame(() => r()))

    const measuredHeight = Math.max(100, Math.ceil(clone.scrollHeight || clone.offsetHeight || 1000))
    const renderScale = computeOptimalRenderScale(quality, width, measuredHeight, explicitScale)

    let canvas: HTMLCanvasElement | null = null

    // Primary Engine: modern-screenshot (Browser-native SVG foreignObject rasterizer — 100% faithful to Preview)
    try {
      const domToCanvas = await getDomToCanvas()
      canvas = await domToCanvas(clone, {
        width,
        height: measuredHeight,
        scale: renderScale,
        backgroundColor,
        timeout: 15000,
        fetchFn: async (url: string) => {
          try {
            return await fetchUrlAsDataUrl(url)
          } catch {
            return false
          }
        },
        filter: (node: Node) => {
          if (node instanceof HTMLElement) {
            if (node.classList.contains('no-print')) return false
            if (node.style?.display === 'none') return false
          }
          return true
        }
      })
    } catch (modernErr) {
      console.warn('[BillExport] modern-screenshot failed, falling back to html2canvas:', modernErr)
      canvas = null
    }

    // Fallback Engine: html2canvas (if modern-screenshot ever fails or returns empty canvas)
    if (!canvas || canvas.width < 50 || canvas.height < 50) {
      const h2c = await getHtml2CanvasFallback()
      canvas = await h2c(clone, {
        scale: renderScale,
        useCORS: true,
        logging: false,
        backgroundColor,
        width,
        windowWidth: width,
        imageTimeout: 15000,
        ignoreElements: (el: Element) =>
          el.classList.contains('no-print') || (el as HTMLElement).style?.display === 'none'
      })
    }

    if (!canvas || canvas.width < 50) {
      throw new Error('Không thể khởi tạo ảnh phiếu đặt. Vui lòng thử lại.')
    }

    return {
      canvas,
      scale: renderScale,
      width: canvas.width,
      height: canvas.height
    }
  } finally {
    if (container.parentNode) {
      container.parentNode.removeChild(container)
    }
    if (originalId) {
      element.id = originalId
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
//  FAST BLOB, CLIPBOARD, WEBP & PDF EXPORTERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Converts rendered canvas to a true lossless PNG Blob (`image/png`).
 */
export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
      } else {
        try {
          const dataUrl = canvas.toDataURL('image/png')
          const binStr = atob(dataUrl.split(',')[1])
          const arr = new Uint8Array(binStr.length)
          for (let i = 0; i < binStr.length; i++) arr[i] = binStr.charCodeAt(i)
          resolve(new Blob([arr], { type: 'image/png' }))
        } catch (err) {
          reject(err)
        }
      }
    }, 'image/png')
  })
}

/**
 * Downscales a rendered canvas directly in memory (without re-decoding Base64)
 * and outputs a lightweight WebP DataURL for background R2 cloud upload.
 */
export function canvasToOptimizedWebpDataUrl(
  sourceCanvas: HTMLCanvasElement,
  maxWidth = 1800,
  quality = 0.94
): string {
  let targetCanvas = sourceCanvas
  if (sourceCanvas.width > maxWidth) {
    const ratio = maxWidth / sourceCanvas.width
    const w = maxWidth
    const h = Math.round(sourceCanvas.height * ratio)
    const offscreen = document.createElement('canvas')
    offscreen.width = w
    offscreen.height = h
    const ctx = offscreen.getContext('2d')
    if (ctx) {
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(sourceCanvas, 0, 0, w, h)
      targetCanvas = offscreen
    }
  }

  try {
    const webp = targetCanvas.toDataURL('image/webp', quality)
    if (webp.startsWith('data:image/webp')) return webp
  } catch {
    // Fallback to JPEG if WebP encoding is unsupported on older browser
  }
  return targetCanvas.toDataURL('image/jpeg', quality)
}

/**
 * Copies the lossless PNG directly to the system clipboard for 1-click Ctrl+V into Zalo / Messenger.
 */
export async function copyCanvasPngToClipboard(canvas: HTMLCanvasElement): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard || typeof ClipboardItem === 'undefined') {
    return false
  }
  try {
    const pngBlob = await canvasToPngBlob(canvas)
    await navigator.clipboard.write([
      new ClipboardItem({
        'image/png': pngBlob
      })
    ])
    return true
  } catch (err) {
    console.warn('[BillExport] Clipboard write failed:', err)
    return false
  }
}

/**
 * Saves a PNG Blob across Desktop, iOS Safari, and Android WebViews.
 */
export async function savePngBlobToDevice(
  blob: Blob,
  filename: string,
  onInfoToast?: (msg: string) => void
): Promise<void> {
  const cleanFilename = filename.endsWith('.png')
    ? filename
    : `${filename.replace(/\.(jpg|jpeg|webp|png)$/i, '')}.png`

  // 1. Mobile Native Share Sheet (Best quality preservation for Zalo / Messenger on iOS & Android)
  if ((isIOS || isAndroid) && navigator.share && navigator.canShare) {
    try {
      const file = new File([blob], cleanFilename, { type: 'image/png' })
      const shareData = { files: [file], title: cleanFilename }
      if (navigator.canShare(shareData)) {
        await navigator.share(shareData)
        return
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return
      console.warn('[BillExport] Web Share API fallback:', e?.message)
    }
  }

  // 2. iOS Safari fallback
  if (isIOS) {
    try {
      const blobUrl = URL.createObjectURL(blob)
      const newTab = window.open(blobUrl, '_blank')
      if (newTab) {
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000)
        onInfoToast?.('📱 Ảnh PNG sắc nét đã mở — nhấn giữ để lưu hoặc gửi Zalo!')
        return
      }
      URL.revokeObjectURL(blobUrl)
    } catch (e) {
      console.warn('[BillExport] iOS open tab failed:', e)
    }
  }

  // 3. Desktop & Android standard <a download> with Blob URL
  const blobUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = blobUrl
  link.download = cleanFilename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  if (isAndroid) {
    await new Promise((r) => setTimeout(r, 400))
  }
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(blobUrl), 15000)
}

// Lazy loader for jsPDF (uses bundled npm package first, CDN as backup)
let _jsPdfPromise: Promise<any> | null = null
async function getJsPdfConstructor(): Promise<any> {
  if ((window as any).jspdf?.jsPDF) {
    return (window as any).jspdf.jsPDF
  }
  if (!_jsPdfPromise) {
    _jsPdfPromise = import('jspdf')
      .then((m) => m.jsPDF || (m as any).default)
      .catch(async () => {
        await loadLibrary('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')
        return (window as any).jspdf.jsPDF
      })
  }
  return _jsPdfPromise
}

/**
 * Exports a rendered bill canvas to a high-definition PDF with dynamic page height
 * (never cuts off long bills at 297mm) and FAST lossless stream compression.
 */
export async function exportCanvasToPdf(
  canvas: HTMLCanvasElement,
  filename: string
): Promise<void> {
  const cleanFilename = filename.endsWith('.pdf')
    ? filename
    : `${filename.replace(/\.(pdf|png|jpg|jpeg)$/i, '')}.pdf`

  const jsPDF = await getJsPdfConstructor()

  // Standard A4 width is 210mm; compute exact proportional height in mm
  const pdfWidthMm = 210
  const pdfHeightMm = Math.ceil((canvas.height * pdfWidthMm) / canvas.width)
  const pageHeightMm = Math.max(297, pdfHeightMm)

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [pdfWidthMm, pageHeightMm],
    compress: true
  })

  // Pass the HTMLCanvasElement directly with 'FAST' compression (avoids redundant base64 decode)
  doc.addImage(canvas, 'PNG', 0, 0, pdfWidthMm, pdfHeightMm, undefined, 'FAST')
  doc.save(cleanFilename)
}
