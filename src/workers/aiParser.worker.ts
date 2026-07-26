import { analyzeBookingLocally } from '@/services/ai/localFirstBookingAnalyzer'
import { resolveMenuItemsLocally } from '@/domain/menu/menuMatcher'

self.onmessage = async (event: MessageEvent) => {
  const { id, type, payload } = event.data

  try {
    if (type === 'ANALYZE_LOCAL') {
      const result = analyzeBookingLocally(payload.text)
      self.postMessage({ id, type, ok: true, result })
    } else if (type === 'FUZZY_MATCH') {
      const result = resolveMenuItemsLocally(payload.rawItems, payload.activeMenu)
      self.postMessage({ id, type, ok: true, result })
    } else {
      self.postMessage({ id, type, ok: false, error: `Unknown worker action: ${type}` })
    }
  } catch (err: any) {
    self.postMessage({ id, type, ok: false, error: err?.message || String(err) })
  }
}

