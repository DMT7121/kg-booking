import { analyzeBookingLocally } from './localFirstBookingAnalyzer'
import { resolveMenuItemsLocally } from '@/domain/menu/menuMatcher'
import type { LocalBookingExtractionResult } from '@/domain/booking/bookingCompletenessGate'

class AIWorkerClient {
  private worker: Worker | null = null
  private pendingRequests = new Map<string, { resolve: (val: any) => void; reject: (err: any) => void }>()
  private isWorkerSupported = typeof window !== 'undefined' && typeof window.Worker !== 'undefined'

  constructor() {
    if (this.isWorkerSupported) {
      try {
        this.worker = new Worker(new URL('../../workers/aiParser.worker.ts', import.meta.url), {
          type: 'module'
        })
        this.worker.onmessage = this.handleMessage.bind(this)
        this.worker.onerror = (err) => {
          console.warn('[AIWorkerClient] Worker error, falling back to main thread:', err)
          this.worker = null
        }
      } catch (e) {
        console.warn('[AIWorkerClient] Failed to instantiate Web Worker, using main thread fallback:', e)
        this.worker = null
      }
    }
  }

  private handleMessage(event: MessageEvent) {
    const { id, ok, result, error } = event.data
    const handler = this.pendingRequests.get(id)
    if (!handler) return

    this.pendingRequests.delete(id)
    if (ok) {
      handler.resolve(result)
    } else {
      handler.reject(new Error(error || 'Worker error'))
    }
  }

  async analyzeLocal(text: string): Promise<LocalBookingExtractionResult> {
    if (!this.worker) {
      return analyzeBookingLocally(text)
    }

    const id = crypto.randomUUID()
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject })
      this.worker!.postMessage({ id, type: 'ANALYZE_LOCAL', payload: { text } })

      // 3 second safety timeout for worker response
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          resolve(analyzeBookingLocally(text))
        }
      }, 3000)
    })
  }

  async fuzzyMatchMenu(rawItems: any[], activeMenu: any): Promise<any> {
    if (!this.worker) {
      return resolveMenuItemsLocally(rawItems, activeMenu)
    }

    const id = crypto.randomUUID()
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject })
      this.worker!.postMessage({ id, type: 'FUZZY_MATCH', payload: { rawItems, activeMenu } })

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          resolve(resolveMenuItemsLocally(rawItems, activeMenu))
        }
      }, 3000)
    })
  }
}

export const aiWorkerClient = new AIWorkerClient()

