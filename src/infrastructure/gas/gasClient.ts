import { useUIStore } from '@/stores/useUIStore'

const API_GATEWAY = import.meta.env.VITE_GAS_URL ||
  'https://script.google.com/macros/s/AKfycbxzjio4sat5fWoUncPgp8SfjoGqfGxW5vFoDgkHvBI3OKVWIaszsAaUt0LE2fCHtkCFsA/exec'

export async function postGAS(payload: Record<string, any>, signal?: AbortSignal): Promise<any> {
  const ui = useUIStore()
  ui.activeRequests++
  try {
    const res = await fetch(API_GATEWAY, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      signal
    })
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`)
    const data = await res.json()
    
    if (!data.ok && data.message) {
      if (
        payload.action !== 'getConfig' && 
        payload.action !== 'getHistory' && 
        payload.action !== 'logAiCorrection' && 
        payload.action !== 'callAiService'
      ) {
        ui.showToast(`Lỗi Server: ${data.message}`, 'error')
      }
    }
    return data
  } catch (e: any) {
    if (e.name === 'AbortError') throw e
    if (
      payload.action !== 'getConfig' && 
      payload.action !== 'getHistory' && 
      payload.action !== 'logAiCorrection' && 
      payload.action !== 'callAiService'
    ) {
      ui.showToast(`Lỗi Mạng: ${e.message}`, 'error')
    }
    throw e
  } finally {
    setTimeout(() => { ui.activeRequests-- }, 300)
  }
}

export async function fetchWithRetry(
  payload: Record<string, any>,
  retries = 3,
  signal?: AbortSignal
): Promise<any> {
  const ui = useUIStore()
  ui.activeRequests++
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(API_GATEWAY, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
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
        ui.showToast(`Lỗi Mạng (Đã thử ${retries} lần): ${e.message}`, 'error')
        setTimeout(() => { ui.activeRequests-- }, 300)
        throw e
      }
      console.warn(`Sync failed. Retrying... (${i + 1}/${retries})`)
      await new Promise(r => setTimeout(r, 1000 * (i + 1)))
    }
  }
}
