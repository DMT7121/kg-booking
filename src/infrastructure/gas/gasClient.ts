import { useUIStore } from '@/stores/useUIStore'
import { get as idbGet, set as idbSet } from 'idb-keyval'
import { isGatewayCircuitOpen, reportGatewaySuccess, reportGatewayFailure } from '@/services/ai/circuitBreaker'

// URL của API Gateway (Local/Worker). Mặc định là '/api' để khớp với Vite Middleware
const API_URL = import.meta.env.VITE_API_URL || '/api'

// URL dự phòng của Google Apps Script
const GAS_FALLBACK_URL = import.meta.env.VITE_GAS_URL ||
  'https://script.google.com/macros/s/AKfycbxzjio4sat5fWoUncPgp8SfjoGqfGxW5vFoDgkHvBI3OKVWIaszsAaUt0LE2fCHtkCFsA/exec'

// L1 memory cache for API read requests
const l1ApiCache = new Map<string, { data: any; timestamp: number }>()
const inFlightGasRequests = new Map<string, Promise<any>>()

function isSuccessfulResponse(res: any): boolean {
  return res && typeof res === 'object' && res.ok === true
}

export function clearL1ApiCache(): void {
  l1ApiCache.clear()
}

/**
 * Generic Stale-While-Revalidate and Coalescing wrapper
 */
export async function fetchWithStaleWhileRevalidate<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: { ttlMs: number; onBgUpdate?: (data: T) => void }
): Promise<T> {
  const { ttlMs, onBgUpdate } = options
  const now = Date.now()

  // 1. Check L1 Memory Cache
  const cachedL1 = l1ApiCache.get(key)
  if (cachedL1) {
    const isStale = (now - cachedL1.timestamp) > ttlMs
    if (!isStale) {
      return cachedL1.data as T
    }
    // Stale: trigger background fetch and return stale data
    triggerBackgroundFetch(key, fetcher, onBgUpdate)
    return cachedL1.data as T
  }

  // 2. Check L2 IndexedDB Cache
  let cachedL2: { data: T; timestamp: number } | null = null
  try {
    const val = await idbGet<{ data: T; timestamp: number }>(`kg_api_cache_${key}`)
    cachedL2 = val ?? null
  } catch (err) {
    console.warn('[API Cache] L2 read failed:', key, err)
  }

  if (cachedL2) {
    l1ApiCache.set(key, cachedL2)
    const isStale = (now - cachedL2.timestamp) > ttlMs
    if (!isStale) {
      return cachedL2.data
    }
    // Stale: trigger background fetch and return stale data
    triggerBackgroundFetch(key, fetcher, onBgUpdate)
    return cachedL2.data
  }

  // 3. Cache Miss: Fetch synchronously (coalesced)
  const fresh = await coalesceRequest(key, fetcher)
  if (isSuccessfulResponse(fresh)) {
    const entry = { data: fresh, timestamp: Date.now() }
    l1ApiCache.set(key, entry)
    idbSet(`kg_api_cache_${key}`, entry).catch(() => {})
  }
  return fresh
}

function triggerBackgroundFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  onBgUpdate?: (data: T) => void
) {
  coalesceRequest(key, fetcher)
    .then(async (fresh) => {
      if (isSuccessfulResponse(fresh)) {
        const entry = { data: fresh, timestamp: Date.now() }
        l1ApiCache.set(key, entry)
        await idbSet(`kg_api_cache_${key}`, entry)
        if (onBgUpdate) {
          onBgUpdate(fresh)
        }
      }
    })
    .catch((err) => {
      console.warn(`[API Cache] Background revalidation failed for ${key}:`, err)
    })
}

function coalesceRequest<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  let promise = inFlightGasRequests.get(key)
  if (!promise) {
    promise = fetcher().finally(() => {
      inFlightGasRequests.delete(key)
    })
    inFlightGasRequests.set(key, promise)
  }
  return promise as Promise<T>
}

/**
 * Gửi request POST tới API Gateway hoặc fallback sang GAS (Direct core execution)
 */
async function postGASDirect(payload: Record<string, any>, signal?: AbortSignal): Promise<any> {
  const ui = useUIStore()
  ui.activeRequests++

  const useWorker = !isGatewayCircuitOpen('cloudflare_edge')

  if (useWorker) {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal
      })
      
      if (res.ok) {
        reportGatewaySuccess('cloudflare_edge')
        const data = await res.json()
        if (!data.ok && data.message) {
          showErrorToastIfNeeded(payload.action, `Lỗi Server: ${data.message}`, ui)
        }
        return data
      }
      throw new Error(`Gateway returned HTTP ${res.status}`)
    } catch (gatewayError: any) {
      if (gatewayError.name === 'AbortError') throw gatewayError

      console.warn(`[API Client] Lỗi kết nối tới Gateway (${gatewayError.message}). Đang chuyển hướng dự phòng sang GAS trực tiếp...`)
      
      const isNetworkErr = gatewayError instanceof TypeError || gatewayError.message?.includes('fetch') || gatewayError.message?.includes('network')
      if (isNetworkErr) {
        reportGatewayFailure('cloudflare_edge', 'edge_cors_or_network', gatewayError.message)
      }
      
      // Fallback to GAS below
    } finally {
      setTimeout(() => { ui.activeRequests-- }, 300)
    }
  } else {
    console.info('[API Client] Cloudflare Edge circuit is open. Bypassing Gateway, calling GAS directly.')
  }

  // Fallback sang GAS trực tiếp
  try {
    const res = await fetch(GAS_FALLBACK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      signal
    })
    if (!res.ok) throw new Error(`GAS fallback HTTP error! status: ${res.status}`)
    const data = await res.json()
    if (!data.ok && data.message) {
      showErrorToastIfNeeded(payload.action, `Lỗi Server (GAS Fallback): ${data.message}`, ui)
    }
    return data
  } catch (gasError: any) {
    if (gasError.name === 'AbortError') throw gasError
    showErrorToastIfNeeded(payload.action, `Lỗi mạng (Cả Gateway và GAS đều lỗi): ${gasError.message}`, ui)
    throw gasError
  } finally {
    setTimeout(() => { ui.activeRequests-- }, 300)
  }
}

/**
 * Gửi request POST với SWR Caching & Request Coalescing
 */
export async function postGAS(
  payload: Record<string, any>,
  signal?: AbortSignal,
  onBgUpdate?: (data: any) => void
): Promise<any> {
  const readActions = ['getConfig', 'getHistory', 'getMenu', 'getMenuSheets', 'getMenuAliases', 'getAiCorrections', 'getAiRuntimeConfig']
  const isRead = readActions.includes(payload.action)

  if (isRead) {
    const cacheKey = payload.action === 'getMenu' ? `getMenu_${payload.sheetName || 'default'}` : payload.action
    let ttlMs = 10 * 60 * 1000 // default 10 minutes
    if (payload.action === 'getMenu') ttlMs = 15 * 60 * 1000
    if (payload.action === 'getHistory') ttlMs = 3 * 60 * 1000
    
    return fetchWithStaleWhileRevalidate(
      cacheKey,
      () => postGASDirect(payload, signal),
      { ttlMs, onBgUpdate }
    )
  }

  return postGASDirect(payload, signal)
}

/**
 * POST request có cơ chế tự động thử lại (Auto-retry), dùng cho các tác vụ ghi dữ liệu nhạy cảm
 */
export async function fetchWithRetry(
  payload: Record<string, any>,
  retries = 3,
  signal?: AbortSignal
): Promise<any> {
  const ui = useUIStore()
  ui.activeRequests++

  const useWorker = !isGatewayCircuitOpen('cloudflare_edge')

  // Lần lượt thử qua API Gateway trước, nếu thất bại qua số lần retry thì chuyển sang GAS Fallback
  for (let i = 0; i < retries; i++) {
    if (signal?.aborted) {
      setTimeout(() => { ui.activeRequests-- }, 300)
      throw new Error('Aborted')
    }
    
    if (useWorker) {
      try {
        const res = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal
        })
        if (res.ok) {
          reportGatewaySuccess('cloudflare_edge')
          const data = await res.json()
          if (!data.ok && data.message) {
            ui.showToast(`Lỗi Server: ${data.message}`, 'error')
          }
          setTimeout(() => { ui.activeRequests-- }, 300)
          return data
        }
        throw new Error(`HTTP error! status: ${res.status}`)
      } catch (e: any) {
        if (e.name === 'AbortError') {
          setTimeout(() => { ui.activeRequests-- }, 300)
          throw e
        }
        
        const isNetworkErr = e instanceof TypeError || e.message?.includes('fetch') || e.message?.includes('network')
        if (isNetworkErr) {
          reportGatewayFailure('cloudflare_edge', 'edge_cors_or_network', e.message)
        }
      }
    }

    if (i === retries - 1) {
      break
    }
    console.warn(`[API Client] Giao dịch thất bại. Đang thử lại... (${i + 1}/${retries})`)
    await new Promise(r => setTimeout(r, 1000 * (i + 1)))
  }

  // Fallback to GAS directly if Gateway fails all retries
  console.warn(`[API Client] Chuyển hướng đồng bộ trực tiếp lên GAS...`)
  try {
    const res = await fetch(GAS_FALLBACK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      signal
    })
    if (!res.ok) throw new Error(`GAS fallback HTTP error! status: ${res.status}`)
    const data = await res.json()
    setTimeout(() => { ui.activeRequests-- }, 300)
    return data
  } catch (gasError: any) {
    if (gasError.name === 'AbortError') throw gasError
    ui.showToast(`Đồng bộ thất bại (Đã thử ${retries} lần Gateway và fallback GAS): ${gasError.message}`, 'error')
    setTimeout(() => { ui.activeRequests-- }, 300)
    throw gasError
  }
}

// Tránh hiển thị Toast thông báo lỗi cho các tác vụ lấy dữ liệu chạy nền hoặc AI
function showErrorToastIfNeeded(action: string, message: string, ui: any) {
  const silentActions = [
    'getConfig', 'getHistory', 'logAiCorrection', 'callAiService',
    'writeAuditLog', 'getSystemConfigAuditLogs', 'getAiRuntimeConfig'
  ]
  if (!silentActions.includes(action)) {
    ui.showToast(message, 'error')
  }
}
