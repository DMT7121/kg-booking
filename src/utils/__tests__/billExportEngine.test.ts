import { describe, it, expect } from 'vitest'
import { computeOptimalRenderScale, canvasToPngBlob } from '@/utils/billExportEngine'
import { getCachedQRCodeDataURL } from '@/components/bills/billHelpers'

describe('Bill Export Engine & QR Helpers', () => {
  it('computes optimal render scale for standard, hd, and ultra presets', () => {
    expect(computeOptimalRenderScale('standard', 800, 1000)).toBe(1.5)
    expect(computeOptimalRenderScale('hd', 800, 1000)).toBe(2.0)
    expect(computeOptimalRenderScale('ultra', 800, 1000)).toBe(3.0)
  })

  it('applies Zalo/Messenger anti-downscale guard in hd mode for extra-long bills', () => {
    // For a 2000px tall bill in hd mode, 2000 * 2.0 = 4000px (> 2800px threshold)
    // Scale is clamped to keep longest edge <= 2800px while staying >= 1.6x
    const scale = computeOptimalRenderScale('hd', 800, 1750)
    expect(scale).toBe(1.6)
    expect(1750 * scale).toBeLessThanOrEqual(2800)
  })

  it('generates offline verification QR DataURL locally and caches repeat calls', async () => {
    const start1 = performance.now()
    const qr1 = await getCachedQRCodeDataURL('KG-ORDER-12345', 160)
    const qr2 = await getCachedQRCodeDataURL('KG-ORDER-12345', 160)
    const elapsedCached = performance.now() - start1

    expect(qr1).toMatch(/^data:image\/png;base64,/)
    expect(qr2).toBe(qr1)
    expect(elapsedCached).toBeLessThan(500)
  })

  it('converts canvas to lossless PNG blob with image/png MIME type', async () => {
    const fakeCanvas = {
      width: 800,
      height: 1000,
      toBlob(cb: (b: Blob | null) => void, mimeType?: string) {
        cb(new Blob([new Uint8Array([137, 80, 78, 71])], { type: mimeType || 'image/png' }))
      },
      toDataURL() {
        return 'data:image/png;base64,iVBORw0KGgo='
      }
    } as unknown as HTMLCanvasElement

    const blob = await canvasToPngBlob(fakeCanvas)
    expect(blob.type).toBe('image/png')
    expect(blob.size).toBeGreaterThan(0)
  })
})
