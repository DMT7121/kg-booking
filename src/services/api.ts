/**
 * Google Apps Script Gateway Service
 * Migrated from King's Grill Manager AI v1.8.6
 */

const API_GATEWAY = import.meta.env.VITE_GAS_URL ||
  'https://script.google.com/macros/s/AKfycbxzjio4sat5fWoUncPgp8SfjoGqfGxW5vFoDgkHvBI3OKVWIaszsAaUt0LE2fCHtkCFsA/exec'

/** Active AbortController for cancellable requests */
let activeAIController: AbortController | null = null

/** Generic POST to GAS */
async function postGAS(payload: Record<string, any>, signal?: AbortSignal): Promise<any> {
  const res = await fetch(API_GATEWAY, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
    signal
  })
  return res.json()
}

/** POST with auto-retry (for save operations) */
export async function fetchWithRetry(
  payload: Record<string, any>,
  retries = 3,
  signal?: AbortSignal
): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(API_GATEWAY, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        signal
      })
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`)
      return await res.json()
    } catch (e: any) {
      if (e.name === 'AbortError') throw e
      if (i === retries - 1) throw e
      console.warn(`Sync failed. Retrying... (${i + 1}/${retries})`)
      await new Promise(r => setTimeout(r, 1000 * (i + 1)))
    }
  }
}

/** Cancel any active AI request and create new controller */
export function createAIAbortController(): AbortController {
  if (activeAIController) {
    activeAIController.abort()
  }
  activeAIController = new AbortController()
  return activeAIController
}

/** Clear active controller after completion */
export function clearAIAbortController() {
  activeAIController = null
}

/** Fetch history from GAS */
export async function getHistory(): Promise<any> {
  return postGAS({ action: 'getHistory' })
}

/** Save order to GAS */
export async function saveOrder(data: any): Promise<any> {
  return fetchWithRetry({ action: 'saveOrder', data })
}

/** Delete order from GAS */
export async function deleteOrder(id: string, password?: string): Promise<any> {
  return postGAS({ action: 'deleteOrder', id, password })
}

/** Fetch menu items for a specific sheet */
export async function getMenu(sheetName: string): Promise<any> {
  return postGAS({ action: 'getMenu', sheetName })
}

/** Fetch available menu sheet names */
export async function getMenuSheets(): Promise<any> {
  return postGAS({ action: 'getMenuSheets' })
}

/** Create or update menu */
export async function createMenu(name: string, rawText: string, password?: string): Promise<any> {
  return postGAS({ action: 'createMenu', name, rawText, password })
}

/** Delete menu */
export async function deleteMenu(name: string, password?: string): Promise<any> {
  return postGAS({ action: 'deleteMenu', name, password })
}

/** Save API key to cloud */
export async function saveApiKeyToCloud(provider: string, key: string, password: string): Promise<any> {
  return postGAS({ action: 'saveApiKey', provider, key, password })
}

/** Borrow API keys from admin */
export async function borrowApiKeys(password: string): Promise<any> {
  return postGAS({ action: 'borrowApiKeys', password })
}

/** Get remote config (banks, staff) */
export async function getConfig(): Promise<any> {
  return postGAS({ action: 'getConfig' })
}

/** Save config to remote */
export async function saveConfig(bankList: string, staffList: string, password?: string, webhookUrl?: string, telegramChatId?: string): Promise<any> {
  return postGAS({ action: 'saveConfig', bankList, staffList, webhookUrl, telegramChatId, password })
}

/** Fetch public order by ID (GET request) */
export async function getOrderById(id: string): Promise<any> {
  const url = `${API_GATEWAY}?action=getOrder&id=${encodeURIComponent(id)}`
  const res = await fetch(url)
  return res.json()
}
