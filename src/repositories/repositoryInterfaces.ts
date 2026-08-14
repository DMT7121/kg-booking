// Standard API response wrapper
export interface ApiResult<T = unknown> {
  ok: boolean
  message?: string
  data?: T
}

export interface OrderQuery {
  id?: string
  status?: string
}

export interface Order {
  id: string
  customer_name?: string
  phone?: string
  guest_count?: number
  booking_date?: string
  booking_time?: string
  table_number?: string
  status?: string
  note?: string
  [key: string]: any
}

export interface HistoryResponse {
  data: any[]
  source?: 'cache' | 'network' | 'idb'
}

export interface OrderRepository {
  getHistory(onBgUpdate?: (data: any[]) => void): Promise<HistoryResponse | any[]>
  getOrderById(id: string): Promise<Order | null>
  saveOrder(data: Record<string, any>, token?: string): Promise<ApiResult>
  saveOrdersBatch(payloads: Record<string, any>[]): Promise<ApiResult>
  deleteOrder(id: string, password?: string, token?: string): Promise<ApiResult>
  syncBookingCalendar?(id: string, token?: string): Promise<ApiResult>
}

export interface MenuSheetInfo {
  name: string
  itemCount?: number
}

export interface MenuRepository {
  getMenu(sheetName: string, onBgUpdate?: (data: any[]) => void): Promise<any[]>
  getMenuSheets(): Promise<string[]>
  createMenu(name: string, rawText: string, password?: string, token?: string): Promise<ApiResult>
  deleteMenu(name: string, password?: string, token?: string): Promise<ApiResult>
  uploadMenuImage(sheetName: string, base64: string, password?: string, token?: string): Promise<ApiResult>
  uploadDishImage(dishId: string, base64: string, password?: string, token?: string): Promise<ApiResult>
  getMenuAliases(token?: string): Promise<Array<{ alias: string; dishName: string }>>
  saveMenuAlias(alias: string, dishName: string, token?: string): Promise<ApiResult>
  deleteMenuAlias(alias: string, token?: string): Promise<ApiResult>
}

export interface AuthResponse {
  ok: boolean
  token?: string
  message?: string
  role?: string
}

export interface SettingsRepository {
  getConfig(onBgUpdate?: (data: Record<string, any>) => void): Promise<Record<string, any>>
  saveConfig(payload: {
    bankList?: string
    staffList?: string
    webhookUrl?: string
    telegramChatId?: string
    password?: string
    token?: string
  }): Promise<ApiResult>
  saveApiKeyToCloud(provider: string, key: string, password?: string, token?: string): Promise<ApiResult>
  deleteApiKeyFromCloud(provider: string, index: number, token?: string): Promise<ApiResult>
  borrowApiKeys(password: string): Promise<ApiResult<Record<string, string[]>>>
  authAdminSettings(password: string): Promise<AuthResponse>
  verifyAdminSettings(token: string): Promise<AuthResponse>
  logoutAdminSettings(token: string): Promise<ApiResult>
  getAdminSystemConfig(token: string): Promise<Record<string, any>>
  saveAiApiConfig(token: string, config: Record<string, any>): Promise<ApiResult>
  testAiApiKey(token: string, provider: string, apiKey: string): Promise<ApiResult>
  getAiRuntimeConfig(): Promise<Record<string, any>>
  upsertSystemConfig(key: string, value: any, options?: Record<string, any>, token?: string): Promise<ApiResult>
  upsertSystemConfigBatch(configPatch: Record<string, any>, options?: Record<string, any>, token?: string): Promise<ApiResult>
  mergeSystemConfig(configPatch: Record<string, any>, options?: Record<string, any>, token?: string): Promise<ApiResult>
  backupSystemConfig(reason?: string, token?: string): Promise<ApiResult>
  restoreSystemConfigBackup(backupId: string, token?: string): Promise<ApiResult>
  getSystemConfigBackups(token: string): Promise<Array<{ id: string; reason?: string; createdAt: string }>>
  getSystemConfigAuditLogs(token: string): Promise<Array<Record<string, any>>>
  writeAuditLog(log: Record<string, any>): Promise<ApiResult>
}

export interface CorrectionRepository {
  logAiCorrection(inputText: string, wrongValue: any, correctValue: any, field: string, token?: string): Promise<ApiResult>
  getAiCorrections(token?: string): Promise<Array<{ input: string; wrong: any; correct: any; field: string }>>
}
