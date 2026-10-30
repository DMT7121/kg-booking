import { useUIStore } from '@/stores/useUIStore'
import { get as idbGet, set as idbSet } from 'idb-keyval'
import { isGatewayCircuitOpen, reportGatewaySuccess, reportGatewayFailure } from '@/services/ai/circuitBreaker'
import { API_GATEWAY_URL, GAS_DIRECT_URL, buildGatewayHeaders, buildGASHeaders } from '@/config/endpoints'
import { getBackendMode } from '@/utils/backendMode'

// L1 memory cache for API read requests
const l1ApiCache = new Map<string, { data: any; timestamp: number }>()
const inFlightGasRequests = new Map<string, Promise<any>>()

const SERIALIZED_GAS_MUTATION_ACTIONS = new Set([
  'saveOrder',
  'saveOrdersBatch',
  'deleteOrder',
  'removeOrderFromSheet',
  'updateOrderImages'
])

let gasMutationChain: Promise<void> = Promise.resolve()

/**
 * Serializes mutating GAS calls on the client so concurrent writes (e.g. saveOrder + updateOrderImages + outboxSync)
 * never stampede Google Apps Script's single ScriptLock.
 */
export function enqueueGasMutation<T>(action: string | undefined, task: () => Promise<T>): Promise<T> {
  if (!action || !SERIALIZED_GAS_MUTATION_ACTIONS.has(action) || import.meta.env.MODE === 'test') {
    return task()
  }
  const run = gasMutationChain.then(() => task(), () => task())
  gasMutationChain = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

function isSuccessfulResponse(res: any): boolean {
  return res && typeof res === 'object' && res.ok === true
}

export function clearL1ApiCache(): void {
  l1ApiCache.clear()
}

function invalidateL1CacheForAction(action?: string): void {
  if (!action) return
  const lower = action.toLowerCase()
  if (lower.includes('order')) {
    l1ApiCache.delete('getHistory')
  } else if (lower.includes('menu') || lower.includes('dish')) {
    for (const key of l1ApiCache.keys()) {
      if (key.startsWith('getMenu') || key === 'getMenuAliases') {
        l1ApiCache.delete(key)
      }
    }
  } else if (lower.includes('config') || lower.includes('correction')) {
    l1ApiCache.delete('getConfig_v2')
    l1ApiCache.delete('getAiRuntimeConfig')
    l1ApiCache.delete('getAiCorrections')
  }
}

function createBoundedSignal(externalSignal: AbortSignal | undefined, timeoutMs: number): {
  signal: AbortSignal | undefined
  cleanup: () => void
} {
  if (externalSignal) {
    return { signal: externalSignal, cleanup: () => {} }
  }
  if (typeof AbortController === 'undefined') {
    return { signal: undefined, cleanup: () => {} }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error(`Request timeout after ${timeoutMs}ms`)), timeoutMs)
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer)
  }
}

/**
 * Generic Stale-While-Revalidate and Coalescing wrapper
 */
export async function fetchWithStaleWhileRevalidate<T>(
  key: string,
  fetcher: (isBg: boolean) => Promise<T>,
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
  // Wrap in try/catch so offline first-load doesn't crash the app
  try {
    const fresh = await coalesceRequest(key, () => fetcher(false))
    if (isSuccessfulResponse(fresh)) {
      const entry = { data: fresh, timestamp: Date.now() }
      l1ApiCache.set(key, entry)
      idbSet(`kg_api_cache_${key}`, entry).catch(() => {})
    }
    return fresh
  } catch (err) {
    console.warn(`[API Cache] Network fetch failed for ${key} (offline?):`, err)
    // Return a safe fallback so callers don't crash
    return { ok: false, message: 'Không có mạng và chưa có dữ liệu cache.' } as T
  }
}

function triggerBackgroundFetch<T>(
  key: string,
  fetcher: (isBg: boolean) => Promise<T>,
  onBgUpdate?: (data: T) => void
) {
  coalesceRequest(key, () => fetcher(true))
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
async function postGASDirect(payload: Record<string, any>, signal?: AbortSignal, isBackground = false): Promise<any> {
  // Guard useUIStore() — may be called before Pinia is initialized (e.g. from outboxSync top-level import)
  let ui: ReturnType<typeof useUIStore> | null = null
  try {
    ui = useUIStore()
    ui.activeRequests++
  } catch {
    // Pinia not yet initialized, skip UI tracking
  }

  const isGasMode = getBackendMode() === 'gas'
  const useLocalProxy = import.meta.env.DEV && API_GATEWAY_URL.startsWith('/api')
  const useWorker = (useLocalProxy || !isGasMode) && !isGatewayCircuitOpen('cloudflare_edge')
  const isMutation = SERIALIZED_GAS_MUTATION_ACTIONS.has(String(payload.action || ''))
  const gatewayTimeoutMs = isMutation ? 45000 : 15000
  const directGasTimeoutMs = isMutation ? 45000 : 25000

  try {
    if (useWorker) {
      let gatewayTimedOut = false
      try {
        const headers = buildGatewayHeaders()
        const gwBound = createBoundedSignal(signal, gatewayTimeoutMs)

        const res = await fetch(API_GATEWAY_URL, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: gwBound.signal
        }).finally(gwBound.cleanup)
        
        if (res.ok) {
          const ct = res.headers.get('content-type') || ''
          if (!ct.includes('application/json')) {
            throw new Error(`Gateway returned non-JSON (${ct.split(';')[0] || 'unknown'})`)
          }
          reportGatewaySuccess('cloudflare_edge')
          const data = await res.json()
          if (!data.ok && data.message && !isBackground) {
            showErrorToastIfNeeded(payload.action, `Lỗi Server: ${data.message}`, ui)
          }
          if (ui) {
            ui.connectionStatus = 'online'
          }
          return data
        }
        throw new Error(`Gateway returned HTTP ${res.status}`)
      } catch (gatewayError: any) {
        if (signal?.aborted) throw gatewayError

        gatewayTimedOut =
          gatewayError?.name === 'AbortError' ||
          String(gatewayError?.message || '').includes('Request timeout after')

        console.warn(`[API Client] Lỗi kết nối tới Gateway (${gatewayError.message}).`)

        const isNetworkErr = gatewayError instanceof TypeError || gatewayError.message?.includes('fetch') || gatewayError.message?.includes('network')
        if (isNetworkErr) {
          reportGatewayFailure('cloudflare_edge', 'edge_cors_or_network', gatewayError.message)
        }

        // Do not fire a duplicate write into GAS if Gateway timed out after 45s while GAS is still executing
        if (isMutation && gatewayTimedOut) {
          throw gatewayError
        }
        // Fallback to GAS below
      }
    } else {
      console.info('[API Client] Cloudflare Edge circuit is open or GAS mode active. Calling GAS directly.')
    }

    // Fallback sang GAS trực tiếp
    const gasBound = createBoundedSignal(signal, directGasTimeoutMs)
    const res = await fetch(GAS_DIRECT_URL, {
      method: 'POST',
      headers: buildGASHeaders(),
      body: JSON.stringify(payload),
      signal: gasBound.signal
    }).finally(gasBound.cleanup)
    if (!res.ok) throw new Error(`GAS fallback HTTP error! status: ${res.status}`)
    const data = await res.json()
    if (!data.ok && data.message && !isBackground) {
      showErrorToastIfNeeded(payload.action, `Lỗi Server (GAS Fallback): ${data.message}`, ui)
    }
    if (ui) {
      ui.connectionStatus = 'online'
    }
    return data
  } catch (err: any) {
    if (err.name === 'AbortError') throw err
    if (ui && !isBackground) {
      ui.connectionStatus = 'error'
    }
    if (!isBackground) {
      showErrorToastIfNeeded(payload.action, `Lỗi mạng (Cả Gateway và GAS đều lỗi): ${err.message}`, ui)
    }
    throw err
  } finally {
    if (ui) {
      setTimeout(() => { ui!.activeRequests-- }, 300)
    }
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
    const cacheKey = payload.action === 'getMenu' ? `getMenu_v2_${payload.sheetName || 'MENU2026'}` : (payload.action === 'getMenuSheets' || payload.action === 'getConfig' ? `${payload.action}_v2` : payload.action)
    let ttlMs = 10 * 60 * 1000 // default 10 minutes
    if (payload.action === 'getMenu') ttlMs = 15 * 60 * 1000
    if (payload.action === 'getHistory') ttlMs = 3 * 60 * 1000
    
    return fetchWithStaleWhileRevalidate(
      cacheKey,
      (isBg) => postGASDirect(payload, signal, isBg),
      { ttlMs, onBgUpdate }
    )
  }

  invalidateL1CacheForAction(payload.action)
  return enqueueGasMutation(payload.action, () => postGASDirect(payload, signal, false))
}

/**
 * POST request có cơ chế tự động thử lại (Auto-retry), dùng cho các tác vụ ghi dữ liệu nhạy cảm
 */
export async function fetchWithRetry(
  payload: Record<string, any>,
  retries = 3,
  signal?: AbortSignal,
  options?: { silent?: boolean }
): Promise<any> {
  return enqueueGasMutation(payload.action, () =>
    fetchWithRetryInternal(payload, retries, signal, options)
  )
}

async function fetchWithRetryInternal(
  payload: Record<string, any>,
  retries = 3,
  signal?: AbortSignal,
  options?: { silent?: boolean }
): Promise<any> {
  const ui = useUIStore()
  ui.activeRequests++

  const isGasMode = getBackendMode() === 'gas'
  const useLocalProxy = import.meta.env.DEV && API_GATEWAY_URL.startsWith('/api')
  const useWorker = (useLocalProxy || !isGasMode) && !isGatewayCircuitOpen('cloudflare_edge')
  const isMutation = SERIALIZED_GAS_MUTATION_ACTIONS.has(String(payload.action || ''))
  const gatewayTimeoutMs = isMutation ? 45000 : 15000
  const directGasTimeoutMs = isMutation ? 45000 : 25000

  invalidateL1CacheForAction(payload.action)

  // Chỉ chạy vòng lặp retry qua API Gateway khi useWorker === true (tránh ngủ chờ 3s vô ích khi gọi thẳng GAS)
  if (useWorker) {
    const gatewayAttempts = Math.min(retries, 2)
    let gatewayTimedOut = false
    for (let i = 0; i < gatewayAttempts; i++) {
      if (signal?.aborted) {
        setTimeout(() => { ui.activeRequests-- }, 300)
        throw new Error('Aborted')
      }

      try {
        const headers = buildGatewayHeaders()
        const gwBound = createBoundedSignal(signal, gatewayTimeoutMs)

        const res = await fetch(API_GATEWAY_URL, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: gwBound.signal
        }).finally(gwBound.cleanup)
        if (res.ok) {
          const ct = res.headers.get('content-type') || ''
          if (!ct.includes('application/json')) {
            throw new Error(`Gateway returned non-JSON (${ct.split(';')[0] || 'unknown'})`)
          }
          reportGatewaySuccess('cloudflare_edge')
          const data = await res.json()
          // Retry once on transient GAS ScriptLock contention
          if (
            !data.ok &&
            i < gatewayAttempts - 1 &&
            typeof data.message === 'string' &&
            data.message.toLowerCase().includes('lock timeout')
          ) {
            await new Promise(r => setTimeout(r, 1500))
            continue
          }
          if (!data.ok && data.message && !options?.silent) {
            ui.showToast(`Lỗi Server: ${data.message}`, 'error')
          }
          ui.connectionStatus = 'online'
          setTimeout(() => { ui.activeRequests-- }, 300)
          return data
        }
        throw new Error(`HTTP error! status: ${res.status}`)
      } catch (e: any) {
        if (signal?.aborted) {
          setTimeout(() => { ui.activeRequests-- }, 300)
          throw e
        }

        gatewayTimedOut =
          e?.name === 'AbortError' ||
          String(e?.message || '').includes('Request timeout after')
        if (isMutation && gatewayTimedOut) {
          break
        }

        const isNetworkErr = e instanceof TypeError || e.message?.includes('fetch') || e.message?.includes('network')
        if (isNetworkErr) {
          reportGatewayFailure('cloudflare_edge', 'edge_cors_or_network', e.message)
          break // Fail fast to GAS fallback when Gateway is unreachable/CORS-blocked
        }
      }

      if (i < gatewayAttempts - 1) {
        console.warn(`[API Client] Giao dịch thất bại. Đang thử lại... (${i + 1}/${gatewayAttempts})`)
        await new Promise(r => setTimeout(r, 500 * (i + 1)))
      }
    }

    if (isMutation && gatewayTimedOut) {
      ui.connectionStatus = 'error'
      setTimeout(() => { ui.activeRequests-- }, 300)
      throw new Error(`Gateway write timeout after ${gatewayTimeoutMs}ms`)
    }
  }

  // Fallback to GAS directly if Gateway is skipped or fails
  console.warn(`[API Client] Chuyển hướng đồng bộ trực tiếp lên GAS...`)
  try {
    const gasBound = createBoundedSignal(signal, directGasTimeoutMs)
    const res = await fetch(GAS_DIRECT_URL, {
      method: 'POST',
      headers: buildGASHeaders(),
      body: JSON.stringify(payload),
      signal: gasBound.signal
    }).finally(gasBound.cleanup)
    if (!res.ok) throw new Error(`GAS fallback HTTP error! status: ${res.status}`)
    const ct = res.headers.get('content-type') || ''
    const data = ct.includes('application/json') ? await res.json() : JSON.parse(await res.text())
    ui.connectionStatus = 'online'
    setTimeout(() => { ui.activeRequests-- }, 300)
    return data
  } catch (gasError: any) {
    if (gasError.name === 'AbortError') throw gasError
    ui.connectionStatus = 'error'
    if (!options?.silent) {
      ui.showToast(`Đang gián đoạn kết nối tới Google Sheets (${gasError.message}). Dữ liệu đã được bảo lưu an toàn trong hàng đợi offline.`, 'warning')
    }
    setTimeout(() => { ui.activeRequests-- }, 300)
    throw gasError
  }
}

// Tránh hiển thị Toast thông báo lỗi cho các tác vụ lấy dữ liệu chạy nền hoặc AI
function showErrorToastIfNeeded(action: string, message: string, ui: any) {
  if (!ui) return // Pinia not initialized yet, skip toast
  const silentActions = [
    'getConfig', 'getHistory', 'logAiCorrection', 'callAiService',
    'writeAuditLog', 'getSystemConfigAuditLogs', 'getAiRuntimeConfig'
  ]
  if (!silentActions.includes(action)) {
    ui.showToast(message, 'error')
  }
}
