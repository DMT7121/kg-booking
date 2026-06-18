import { postGAS, fetchWithRetry } from './gasClient'
import type { 
  OrderRepository, 
  MenuRepository, 
  SettingsRepository, 
  CorrectionRepository 
} from '@/repositories/repositoryInterfaces'

export class GasOrderRepository implements OrderRepository {
  async getHistory(): Promise<any> {
    return postGAS({ action: 'getHistory' })
  }
  
  async getOrderById(id: string): Promise<any> {
    const API_GATEWAY = import.meta.env.VITE_GAS_URL ||
      'https://script.google.com/macros/s/AKfycbxzjio4sat5fWoUncPgp8SfjoGqfGxW5vFoDgkHvBI3OKVWIaszsAaUt0LE2fCHtkCFsA/exec'
    const url = `${API_GATEWAY}?action=getOrder&id=${encodeURIComponent(id)}`
    const res = await fetch(url)
    return res.json()
  }

  async saveOrder(data: any): Promise<any> {
    return fetchWithRetry({ action: 'saveOrder', data })
  }

  async deleteOrder(id: string, password?: string, token?: string): Promise<any> {
    return postGAS({ action: 'deleteOrder', id, password, token })
  }
}

export class GasMenuRepository implements MenuRepository {
  async getMenu(sheetName: string): Promise<any> {
    return postGAS({ action: 'getMenu', sheetName })
  }

  async getMenuSheets(): Promise<any> {
    return postGAS({ action: 'getMenuSheets' })
  }

  async createMenu(name: string, rawText: string, password?: string, token?: string): Promise<any> {
    return postGAS({ action: 'createMenu', name, rawText, password, token })
  }

  async deleteMenu(name: string, password?: string, token?: string): Promise<any> {
    return postGAS({ action: 'deleteMenu', name, password, token })
  }

  async uploadMenuImage(sheetName: string, base64: string, password?: string, token?: string): Promise<any> {
    return postGAS({ action: 'uploadMenuImage', sheetName, base64, password, token })
  }

  async uploadDishImage(dishId: string, base64: string, password?: string, token?: string): Promise<any> {
    return postGAS({ action: 'uploadDishImage', dishId, base64, password, token })
  }

  async getMenuAliases(token?: string): Promise<any> {
    return postGAS({ action: 'getMenuAliases', token })
  }

  async saveMenuAlias(alias: string, dishName: string, token?: string): Promise<any> {
    return postGAS({ action: 'saveMenuAlias', alias, dishName, token })
  }

  async deleteMenuAlias(alias: string, token?: string): Promise<any> {
    return postGAS({ action: 'deleteMenuAlias', alias, token })
  }
}

export class GasSettingsRepository implements SettingsRepository {
  async getConfig(): Promise<any> {
    return postGAS({ action: 'getConfig' })
  }

  async saveConfig(payload: {
    bankList?: string
    staffList?: string
    webhookUrl?: string
    telegramChatId?: string
    password?: string
    token?: string
  }): Promise<any> {
    return postGAS({
      action: 'saveConfig',
      bankList: payload.bankList,
      staffList: payload.staffList,
      banks: payload.bankList,
      staff: payload.staffList,
      webhookUrl: payload.webhookUrl,
      telegramChatId: payload.telegramChatId,
      password: payload.password,
      token: payload.token
    })
  }

  async saveApiKeyToCloud(provider: string, key: string, password?: string, token?: string): Promise<any> {
    return postGAS({ action: 'saveApiKey', provider, key, password, token })
  }

  async deleteApiKeyFromCloud(provider: string, index: number, token?: string): Promise<any> {
    return postGAS({ action: 'deleteApiKey', provider, index, token })
  }

  async borrowApiKeys(password: string): Promise<any> {
    return postGAS({ action: 'borrowApiKeys', password })
  }

  async authAdminSettings(password: string): Promise<any> {
    return postGAS({ action: 'authAdminSettings', password })
  }

  async verifyAdminSettings(token: string): Promise<any> {
    return postGAS({ action: 'verifyAdminSettings', token })
  }

  async logoutAdminSettings(token: string): Promise<any> {
    return postGAS({ action: 'logoutAdminSettings', token })
  }

  async getAdminSystemConfig(token: string): Promise<any> {
    return postGAS({ action: 'getAdminSystemConfig', token })
  }

  async saveAiApiConfig(token: string, config: any): Promise<any> {
    return postGAS({ action: 'saveAiApiConfig', token, config })
  }

  async testAiApiKey(token: string, provider: string, apiKey: string): Promise<any> {
    return postGAS({ action: 'testAiApiKey', token, provider, apiKey })
  }

  async getAiRuntimeConfig(): Promise<any> {
    return postGAS({ action: 'getAiRuntimeConfig' })
  }

  async upsertSystemConfig(key: string, value: any, options?: any, token?: string): Promise<any> {
    return postGAS({ action: 'upsertSystemConfig', key, value, options, token })
  }

  async upsertSystemConfigBatch(configPatch: Record<string, any>, options?: any, token?: string): Promise<any> {
    return postGAS({ action: 'upsertSystemConfigBatch', configPatch, options, token })
  }

  async mergeSystemConfig(configPatch: Record<string, any>, options?: any, token?: string): Promise<any> {
    return postGAS({ action: 'mergeSystemConfig', configPatch, options, token })
  }

  async backupSystemConfig(reason?: string, token?: string): Promise<any> {
    return postGAS({ action: 'backupSystemConfig', reason, token })
  }

  async restoreSystemConfigBackup(backupId: string, token?: string): Promise<any> {
    return postGAS({ action: 'restoreSystemConfigBackup', backupId, token })
  }

  async getSystemConfigBackups(token: string): Promise<any> {
    return postGAS({ action: 'getSystemConfigBackups', token })
  }

  async getSystemConfigAuditLogs(token: string): Promise<any> {
    return postGAS({ action: 'getSystemConfigAuditLogs', token })
  }
}

export class GasCorrectionRepository implements CorrectionRepository {
  async logAiCorrection(inputText: string, wrongValue: any, correctValue: any, field: string, token?: string): Promise<any> {
    return postGAS({ action: 'logAiCorrection', inputText, wrongValue, correctValue, field, token })
  }

  async getAiCorrections(token?: string): Promise<any> {
    return postGAS({ action: 'getAiCorrections', token })
  }
}
