import { useUIStore } from '@/stores/useUIStore'

// URL của API Gateway (Local/Worker). Mặc định là '/api' để khớp với Vite Middleware
const API_URL = import.meta.env.VITE_API_URL || '/api'

// URL dự phòng của Google Apps Script
const GAS_FALLBACK_URL = import.meta.env.VITE_GAS_URL ||
  'https://script.google.com/macros/s/AKfycbxzjio4sat5fWoUncPgp8SfjoGqfGxW5vFoDgkHvBI3OKVWIaszsAaUt0LE2fCHtkCFsA/exec'

/**
 * Gửi request POST tới API Gateway hoặc fallback sang GAS
 */
export async function postGAS(payload: Record<string, any>, signal?: AbortSignal): Promise<any> {
  const ui = useUIStore()
  ui.activeRequests++

  // Thử gọi qua API Gateway trước
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal
    })
    
    if (res.ok) {
      const data = await res.json()
      if (!data.ok && data.message) {
        showErrorToastIfNeeded(payload.action, `Lỗi Server: ${data.message}`, ui)
      }
      return data
    }
    // Nếu status không phải 2xx, ném lỗi để nhảy vào block catch để fallback
    throw new Error(`Gateway returned HTTP ${res.status}`)
  } catch (gatewayError: any) {
    if (gatewayError.name === 'AbortError') throw gatewayError

    console.warn(`[API Client] Lỗi kết nối tới Gateway (${gatewayError.message}). Đang chuyển hướng dự phòng sang GAS trực tiếp...`)
    
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
  } finally {
    setTimeout(() => { ui.activeRequests-- }, 300)
  }
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

  // Lần lượt thử qua API Gateway trước, nếu thất bại qua số lần retry thì chuyển sang GAS Fallback
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal
      })
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`)
      const data = await res.json()
      if (!data.ok && data.message) {
        ui.showToast(`Lỗi Server: ${data.message}`, 'error')
      }
      setTimeout(() => { ui.activeRequests-- }, 300)
      return data
    } catch (e: any) {
      if (e.name === 'AbortError') {
        setTimeout(() => { ui.activeRequests-- }, 300)
        throw e
      }
      if (i === retries - 1) {
        // Hết lượt thử lại trên Gateway, chuyển sang gọi trực tiếp GAS
        console.warn(`[API Client] Hết ${retries} lượt thử trên Gateway. Thử đồng bộ trực tiếp lên GAS...`)
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
      console.warn(`[API Client] Giao dịch thất bại. Đang thử lại... (${i + 1}/${retries})`)
      await new Promise(r => setTimeout(r, 1000 * (i + 1)))
    }
  }
}

// Tránh hiển thị Toast thông báo lỗi cho các tác vụ lấy dữ liệu chạy nền hoặc AI
function showErrorToastIfNeeded(action: string, message: string, ui: any) {
  const silentActions = ['getConfig', 'getHistory', 'logAiCorrection', 'callAiService']
  if (!silentActions.includes(action)) {
    ui.showToast(message, 'error')
  }
}
