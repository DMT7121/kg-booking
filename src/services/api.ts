/**
 * Google Apps Script Gateway Service
 * Migrated from King's Grill Manager AI v1.8.6
 */

import { postGAS, fetchWithRetry } from '@/infrastructure/gas/gasClient'
export { fetchWithRetry }

/** Active AbortController for cancellable requests */
let activeAIController: AbortController | null = null

import { useUIStore } from '@/stores/useUIStore'

const API_GATEWAY = import.meta.env.VITE_GAS_URL ||
  'https://script.google.com/macros/s/AKfycbxzjio4sat5fWoUncPgp8SfjoGqfGxW5vFoDgkHvBI3OKVWIaszsAaUt0LE2fCHtkCFsA/exec'

/** Cancel any active AI request and create new controller */
export function createAIAbortController(): AbortController {
  if (activeAIController) {
    activeAIController.abort()
  }
  activeAIController = new AbortController()
  return activeAIController
}

/** Abort active AI request */
export function abortActiveAIRequest() {
  if (activeAIController) {
    activeAIController.abort()
    activeAIController = null
  }
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
export async function deleteOrder(id: string, password?: string, token?: string): Promise<any> {
  return postGAS({ action: 'deleteOrder', id, password, token })
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
export async function createMenu(name: string, rawText: string, password?: string, token?: string): Promise<any> {
  return postGAS({ action: 'createMenu', name, rawText, password, token })
}

/** Delete menu */
export async function deleteMenu(name: string, password?: string, token?: string): Promise<any> {
  return postGAS({ action: 'deleteMenu', name, password, token })
}

/** Upload menu image */
export async function uploadMenuImage(sheetName: string, base64: string, password?: string, token?: string): Promise<any> {
  return postGAS({ action: 'uploadMenuImage', sheetName, base64, password, token })
}

/** Upload dish image */
export async function uploadDishImage(dishId: string, base64: string, password?: string, token?: string): Promise<any> {
  return postGAS({ action: 'uploadDishImage', dishId, base64, password, token })
}

/** Save API key to cloud */
export async function saveApiKeyToCloud(provider: string, key: string, password: string, token?: string): Promise<any> {
  return postGAS({ action: 'saveApiKey', provider, key, password, token })
}

export async function deleteApiKeyFromCloud(provider: string, index: number, token?: string): Promise<any> {
  return postGAS({ action: 'deleteApiKey', provider, index, token })
}

/** Borrow API keys from admin */
export async function borrowApiKeys(password: string): Promise<any> {
  return postGAS({ action: 'borrowApiKeys', password })
}

export async function getSharedApiKeysWithoutPassword(): Promise<any> {
  return postGAS({ action: 'getSharedApiKeysWithoutPassword' })
}

/** Get remote config (banks, staff) */
export async function getConfig(): Promise<any> {
  return postGAS({ action: 'getConfig' })
}

/** Save config to remote */
export async function saveConfig(bankList?: string, staffList?: string, password?: string, webhookUrl?: string, telegramChatId?: string, token?: string): Promise<any> {
  return postGAS({
    action: 'saveConfig',
    bankList,
    staffList,
    banks: bankList,
    staff: staffList,
    webhookUrl,
    telegramChatId,
    password,
    token
  })
}

/** Fetch public order by ID (POST request to bypass CORS issues) */
export async function getOrderById(id: string): Promise<any> {
  return postGAS({ action: 'getOrder', id })
}

// --- NEW SYSTEM CONFIG & ADMIN ENDPOINTS ---

export async function authAdminSettings(password: string): Promise<any> {
  return postGAS({ action: 'authAdminSettings', password })
}

export async function verifyAdminSettings(token: string): Promise<any> {
  return postGAS({ action: 'verifyAdminSettings', token })
}

export async function logoutAdminSettings(token: string): Promise<any> {
  return postGAS({ action: 'logoutAdminSettings', token })
}

export async function getAdminSystemConfig(token: string): Promise<any> {
  return postGAS({ action: 'getAdminSystemConfig', token })
}

export async function saveAiApiConfig(token: string, config: any): Promise<any> {
  return postGAS({ action: 'saveAiApiConfig', token, config })
}

export async function testAiApiKey(token: string, provider: string, apiKey: string): Promise<any> {
  return postGAS({ action: 'testAiApiKey', token, provider, apiKey })
}

export async function getAiRuntimeConfig(): Promise<any> {
  return postGAS({ action: 'getAiRuntimeConfig' })
}

export async function callAiProxy(payload: {
  provider: string
  model: string
  sysPrompt: string
  userPrompt: string
  image?: string | null
  jsonMode?: boolean
  format?: string
  url: string
}, signal?: AbortSignal): Promise<any> {
  return postGAS({ action: 'callAiService', ...payload }, signal)
}

export async function callAiService(payload: {
  provider: string
  model: string
  sysPrompt: string
  userPrompt: string
  image?: string
  jsonMode?: boolean
  format?: string
  url: string
}, signal?: AbortSignal): Promise<any> {
  return postGAS({ action: 'callAiService', ...payload }, signal)
}

export async function upsertSystemConfig(key: string, value: any, options?: any, token?: string): Promise<any> {
  return postGAS({ action: 'upsertSystemConfig', key, value, options, token })
}

export async function upsertSystemConfigBatch(configPatch: Record<string, any>, options?: any, token?: string): Promise<any> {
  return postGAS({ action: 'upsertSystemConfigBatch', configPatch, options, token })
}

export async function mergeSystemConfig(configPatch: Record<string, any>, options?: any, token?: string): Promise<any> {
  return postGAS({ action: 'mergeSystemConfig', configPatch, options, token })
}

export async function backupSystemConfig(reason?: string, token?: string): Promise<any> {
  return postGAS({ action: 'backupSystemConfig', reason, token })
}

export async function restoreSystemConfigBackup(backupId: string, token?: string): Promise<any> {
  return postGAS({ action: 'restoreSystemConfigBackup', backupId, token })
}

export async function getSystemConfigBackups(token: string): Promise<any> {
  return postGAS({ action: 'getSystemConfigBackups', token })
}

export async function getSystemConfigAuditLogs(token: string): Promise<any> {
  return postGAS({ action: 'getSystemConfigAuditLogs', token })
}

export async function getMenuAliases(token?: string): Promise<any> {
  return postGAS({ action: 'getMenuAliases', token })
}

export async function saveMenuAlias(alias: string, dishName: string, token?: string): Promise<any> {
  return postGAS({ action: 'saveMenuAlias', alias, dishName, token })
}

export async function deleteMenuAlias(alias: string, token?: string): Promise<any> {
  return postGAS({ action: 'deleteMenuAlias', alias, token })
}

export async function logAiCorrection(inputText: string, wrongValue: any, correctValue: any, field: string, token?: string): Promise<any> {
  return postGAS({ action: 'logAiCorrection', inputText, wrongValue, correctValue, field, token })
}

export async function getAiCorrections(token?: string): Promise<any> {
  return postGAS({ action: 'getAiCorrections', token })
}


