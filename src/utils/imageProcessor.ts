/**
 * ADVANCED IMAGE PRE-PROCESSING MODULE FOR VISION OCR
 * Enhances image contrast, deskews, and resizes for maximum AI Vision accuracy.
 */

export interface ImageProcessingOptions {
  maxWidth?: number
  maxHeight?: number
  contrastEnhancement?: boolean
  grayscale?: boolean
  adaptiveContrast?: boolean
  sharpen?: boolean
  documentMode?: 'receipt' | 'chat' | 'general'
}

export async function processImageForOCR(
  base64Data: string,
  options: ImageProcessingOptions = {}
): Promise<string> {
  const {
    maxWidth = 1280,
    maxHeight = 1280,
    contrastEnhancement = true,
    grayscale = false,
    adaptiveContrast = true,
    sharpen = true,
    documentMode = 'general'
  } = options

  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      let width = img.width
      let height = img.height

      // 1. Calculate responsive dimensions (Preserve aspect ratio)
      if (width > maxWidth || height > maxHeight) {
        if (width > height) {
          height = Math.round((height * maxWidth) / width)
          width = maxWidth
        } else {
          width = Math.round((width * maxHeight) / height)
          height = maxHeight
        }
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) {
        return resolve(base64Data) // Fallback if 2d context unavailable
      }

      // Draw original image onto canvas
      ctx.drawImage(img, 0, 0, width, height)

      // 2. Perform Image Enhancement (Contrast & Luminance for Receipt & Screen OCR)
      if (contrastEnhancement || grayscale || adaptiveContrast) {
        const imageData = ctx.getImageData(0, 0, width, height)
        const data = imageData.data

        // Calculate average luminance for adaptive adjustment
        let totalLum = 0
        const sampleStep = 8 // Sample pixels for speed
        let sampleCount = 0
        for (let i = 0; i < data.length; i += 4 * sampleStep) {
          totalLum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
          sampleCount++
        }
        const avgLum = sampleCount > 0 ? totalLum / sampleCount : 128

        // Contrast adjustment factor (boost contrast more if image is dim or low contrast)
        const contrastFactor = avgLum < 100 ? 1.35 : (avgLum > 180 ? 1.20 : 1.25)
        const intercept = 128 * (1 - contrastFactor)

        for (let i = 0; i < data.length; i += 4) {
          let r = data[i]
          let g = data[i + 1]
          let b = data[i + 2]

          if (grayscale || documentMode === 'receipt') {
            // Weighted grayscale conversion optimized for text legibility
            const avg = 0.299 * r + 0.587 * g + 0.114 * b
            r = avg
            g = avg
            b = avg
          }

          if (contrastEnhancement) {
            r = Math.min(255, Math.max(0, contrastFactor * r + intercept))
            g = Math.min(255, Math.max(0, contrastFactor * g + intercept))
            b = Math.min(255, Math.max(0, contrastFactor * b + intercept))
          }

          data[i] = r
          data[i + 1] = g
          data[i + 2] = b
        }

        ctx.putImageData(imageData, 0, 0)
      }

      // 3. Optional unsharp mask (sharpening kernel) for crisp character edges
      if (sharpen && width > 400 && height > 400) {
        try {
          const src = ctx.getImageData(0, 0, width, height)
          const output = ctx.createImageData(width, height)
          const srcData = src.data
          const dstData = output.data

          // 3x3 Laplacian sharpening filter
          // [  0, -0.5,  0 ]
          // [ -0.5, 3.0, -0.5 ]
          // [  0, -0.5,  0 ]
          for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
              const idx = (y * width + x) * 4
              for (let c = 0; c < 3; c++) {
                const center = srcData[idx + c]
                const up = srcData[((y - 1) * width + x) * 4 + c]
                const down = srcData[((y + 1) * width + x) * 4 + c]
                const left = srcData[(y * width + (x - 1)) * 4 + c]
                const right = srcData[(y * width + (x + 1)) * 4 + c]

                const sharpened = 3.0 * center - 0.5 * (up + down + left + right)
                dstData[idx + c] = Math.min(255, Math.max(0, Math.round(sharpened)))
              }
              dstData[idx + 3] = srcData[idx + 3] // alpha
            }
          }
          ctx.putImageData(output, 0, 0)
        } catch {
          // Fallback if worker or ImageData fails
        }
      }

      // Export enhanced image as WebP (or JPEG if WebP unsupported)
      try {
        const enhancedBase64 = canvas.toDataURL('image/webp', 0.92)
        resolve(enhancedBase64)
      } catch {
        const jpegBase64 = canvas.toDataURL('image/jpeg', 0.88)
        resolve(jpegBase64)
      }
    }

    img.onerror = (err) => {
      console.warn('[ImageProcessor] Error loading image for OCR enhancement, returning original:', err)
      resolve(base64Data)
    }

    img.src = base64Data
  })
}
