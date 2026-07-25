/**
 * Vision OCR Image Preprocessing & Output Cleanup Engine
 * Optimizes image legibility, contrast, and cleans extracted OCR receipt text.
 */

export interface PreprocessOcrOptions {
  maxDimension?: number
  enhanceContrast?: boolean
  contrastFactor?: number // Default 1.25 (25% boost)
  grayscale?: boolean
}

export interface StructuredOcrItem {
  rawName: string
  quantity: number
  unitPrice: number | null
  totalPrice: number | null
}

/**
 * Preprocesses a base64 image (resizes to optimal OCR resolution and applies contrast enhancement if requested).
 * Gracefully falls back to original image in non-DOM (Node.js/testing) environments.
 */
export async function preprocessOcrImage(
  base64Image: string,
  options: PreprocessOcrOptions = {}
): Promise<string> {
  if (!base64Image || typeof base64Image !== 'string') return base64Image
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return base64Image
  }

  const {
    maxDimension = 1280,
    enhanceContrast = true,
    contrastFactor = 1.25,
    grayscale = false
  } = options

  return new Promise<string>((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    
    img.onload = () => {
      let width = img.width
      let height = img.height

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width)
          width = maxDimension
        } else {
          width = Math.round((width * maxDimension) / height)
          height = maxDimension
        }
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(base64Image)
        return
      }

      ctx.drawImage(img, 0, 0, width, height)

      if (enhanceContrast || grayscale) {
        try {
          const imgData = ctx.getImageData(0, 0, width, height)
          const data = imgData.data
          const factor = (259 * (contrastFactor * 255 + 255)) / (255 * (259 - contrastFactor * 255))

          for (let i = 0; i < data.length; i += 4) {
            let r = data[i]
            let g = data[i + 1]
            let b = data[i + 2]

            if (grayscale) {
              const gray = 0.299 * r + 0.587 * g + 0.114 * b
              r = gray
              g = gray
              b = gray
            }

            if (enhanceContrast) {
              r = factor * (r - 128) + 128
              g = factor * (g - 128) + 128
              b = factor * (b - 128) + 128
            }

            data[i] = Math.min(255, Math.max(0, r))
            data[i + 1] = Math.min(255, Math.max(0, g))
            data[i + 2] = Math.min(255, Math.max(0, b))
          }

          ctx.putImageData(imgData, 0, 0)
        } catch (e) {
          console.warn('[VisionProcessor] Canvas getImageData failed:', e)
        }
      }

      const processedBase64 = canvas.toDataURL('image/jpeg', 0.88)
      resolve(processedBase64)
    }

    img.onerror = () => {
      resolve(base64Image)
    }

    img.src = base64Image.startsWith('data:') ? base64Image : `data:image/jpeg;base64,${base64Image}`
  })
}

/**
 * Cleans OCR output text by removing AI conversational preambles and standardizing bill lines.
 */
export function cleanOcrOutputText(rawText: string): string {
  if (!rawText) return ''

  let clean = rawText
    .replace(/^```(?:json|text|markdown)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/^(?:Here is the extracted text|Dưới đây là kết quả OCR|Nội dung hình ảnh|Trích xuất văn bản):\s*/gi, '')
    .trim()

  clean = clean.replace(/\n{3,}/g, '\n\n')
  return clean
}

/**
 * Parses OCR lines matching receipt or item bill patterns (e.g., "2x Lẩu Thái 350k") into structured items.
 */
export function extractStructuredOcrLines(ocrText: string): StructuredOcrItem[] {
  if (!ocrText) return []
  const rawLines = ocrText.split('\n').map(l => l.trim()).filter(Boolean)
  const items: StructuredOcrItem[] = []

  for (const rawLine of rawLines) {
    const line = rawLine.replace(/^\d+[\.\)]\s*/, '')
    const match = line.match(/^(?:(\d+)\s*[x\*]\s*)?([^\d\-\:]+?)(?:\s*[\-\:]\s*|\s+)(\d+(?:[\.\,]\d+)?\s*(?:k|đ|vnd|trieu|tr)?)(?:\s*[x\*]\s*(\d+))?$/i)
    
    if (match) {
      const qty1 = match[1] ? parseInt(match[1], 10) : 1
      const rawName = match[2].trim()
      const priceStr = match[3].toLowerCase()
      const qty2 = match[4] ? parseInt(match[4], 10) : 1
      const quantity = Math.max(qty1, qty2)

      let priceNum = 0
      if (priceStr.includes('k')) {
        priceNum = parseFloat(priceStr.replace('k', '')) * 1000
      } else if (priceStr.includes('trieu') || priceStr.includes('tr')) {
        priceNum = parseFloat(priceStr.replace(/(?:trieu|tr)/g, '')) * 1000000
      } else {
        priceNum = parseInt(priceStr.replace(/[^\d]/g, ''), 10) || 0
      }

      if (rawName.length >= 2 && !/^(tổng|cộng|thành tiền|tiền cọc|giảm giá|vat|chiết khấu)/i.test(rawName)) {
        items.push({
          rawName,
          quantity,
          unitPrice: priceNum || null,
          totalPrice: priceNum ? priceNum * quantity : null
        })
      }
    }
  }

  return items
}
