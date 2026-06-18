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

export interface OrderRepository {
  getHistory(): Promise<any>
  getOrderById(id: string): Promise<any>
  saveOrder(data: any): Promise<any>
  deleteOrder(id: string, password?: string, token?: string): Promise<any>
}

export interface MenuRepository {
  getMenu(sheetName: string): Promise<any>
  getMenuSheets(): Promise<any>
  createMenu(name: string, rawText: string, password?: string, token?: string): Promise<any>
  deleteMenu(name: string, password?: string, token?: string): Promise<any>
  uploadMenuImage(sheetName: string, base64: string, password?: string, token?: string): Promise<any>
  uploadDishImage(dishId: string, base64: string, password?: string, token?: string): Promise<any>
  getMenuAliases(token?: string): Promise<any>
  saveMenuAlias(alias: string, dishName: string, token?: string): Promise<any>
  deleteMenuAlias(alias: string, token?: string): Promise<any>
}

export interface SettingsRepository {
  getConfig(): Promise<any>
  saveConfig(payload: {
    bankList?: string
    staffList?: string
    webhookUrl?: string
    telegramChatId?: string
    password?: string
    token?: string
  }): Promise<any>
  saveApiKeyToCloud(provider: string, key: string, password?: string, token?: string): Promise<any>
  deleteApiKeyFromCloud(provider: string, index: number, token?: string): Promise<any>
  borrowApiKeys(password: string): Promise<any>
  authAdminSettings(password: string): Promise<any>
  verifyAdminSettings(token: string): Promise<any>
  logoutAdminSettings(token: string): Promise<any>
  getAdminSystemConfig(token: string): Promise<any>
  saveAiApiConfig(token: string, config: any): Promise<any>
  testAiApiKey(token: string, provider: string, apiKey: string): Promise<any>
  getAiRuntimeConfig(): Promise<any>
  upsertSystemConfig(key: string, value: any, options?: any, token?: string): Promise<any>
  upsertSystemConfigBatch(configPatch: Record<string, any>, options?: any, token?: string): Promise<any>
  mergeSystemConfig(configPatch: Record<string, any>, options?: any, token?: string): Promise<any>
  backupSystemConfig(reason?: string, token?: string): Promise<any>
  restoreSystemConfigBackup(backupId: string, token?: string): Promise<any>
  getSystemConfigBackups(token: string): Promise<any>
  getSystemConfigAuditLogs(token: string): Promise<any>
}

export interface CorrectionRepository {
  logAiCorrection(inputText: string, wrongValue: any, correctValue: any, field: string, token?: string): Promise<any>
  getAiCorrections(token?: string): Promise<any>
}
