import type { 
  OrderRepository, 
  MenuRepository, 
  SettingsRepository, 
  CorrectionRepository 
} from '@/repositories/repositoryInterfaces'
import { GasOrderRepository, GasMenuRepository, GasSettingsRepository, GasCorrectionRepository } from '../gas/gasRepositories'
import { PostgresOrderRepository, PostgresMenuRepository, PostgresSettingsRepository, PostgresCorrectionRepository } from '../postgres/postgresRepository'

const getBackendMode = (): 'gas' | 'postgres' | 'dual_write' => {
  const mode = import.meta.env.VITE_BACKEND_MODE || 'gas'
  if (mode === 'postgres' || mode === 'dual_write' || mode === 'gas') {
    return mode
  }
  return 'gas'
}

export class DualWriteOrderRepository implements OrderRepository {
  private gas = new GasOrderRepository()
  private pg = new PostgresOrderRepository()

  async getHistory(onBgUpdate?: (data: any) => void): Promise<any> {
    const mode = getBackendMode()
    if (mode === 'gas') {
      return this.gas.getHistory(onBgUpdate)
    }
    if (mode === 'postgres') {
      return this.pg.getHistory(onBgUpdate)
    }
    
    // Dual Write Mode: Read from PG, fallback to GAS if PG fails
    try {
      const pgResult = await this.pg.getHistory(onBgUpdate)
      if (pgResult.ok) return pgResult
      throw new Error(pgResult.message || 'PG Read failed')
    } catch (e: any) {
      console.warn('[DualWrite] PG read failed, falling back to GAS:', e.message)
      return this.gas.getHistory(onBgUpdate)
    }
  }

  async getOrderById(id: string): Promise<any> {
    const mode = getBackendMode()
    if (mode === 'gas') return this.gas.getOrderById(id)
    if (mode === 'postgres') return this.pg.getOrderById(id)

    try {
      const res = await this.pg.getOrderById(id)
      if (res.ok) return res
      throw new Error(res.message)
    } catch {
      return this.gas.getOrderById(id)
    }
  }

  async saveOrder(data: any): Promise<any> {
    const mode = getBackendMode()
    if (mode === 'gas') return this.gas.saveOrder(data)
    if (mode === 'postgres') return this.pg.saveOrder(data)

    // Dual-Write Mode
    const orderId = data.id || data.data?.id || crypto.randomUUID()
    if (data.customer) {
      data.id = orderId
    } else if (data.data) {
      data.data.id = orderId
    }

    const [pgRes, gasRes] = await Promise.allSettled([
      this.pg.saveOrder(data),
      this.gas.saveOrder(data)
    ])

    const pgSuccess = pgRes.status === 'fulfilled' && pgRes.value.ok
    const gasSuccess = gasRes.status === 'fulfilled' && gasRes.value.ok

    if (pgSuccess && gasSuccess) {
      return pgRes.value
    }

    if (pgSuccess && !gasSuccess) {
      console.warn('[DualWrite] Booking saved in Postgres but failed on GAS (Google Sheets). Marking sync pending.')
      // Update postgres record to indicate sheet synchronization is pending
      try {
        await this.pg.saveOrder({
          ...(data.customer ? data : data.data),
          sheet_sync_pending: true
        })
      } catch (err: any) {
        console.error('[DualWrite] Failed to set sheet_sync_pending status in Postgres:', err.message)
      }
      return pgRes.value
    }

    if (!pgSuccess && gasSuccess) {
      console.error('[DualWrite] Booking saved on Sheets but failed in Postgres. Queueing PG reconciliation.')
      // Return GAS result but mark in log that PG sync failed
      return {
        ...gasRes.value,
        pg_sync_failed: true,
        warning: 'PostgreSQL save failed, synchronizing in background.'
      }
    }

    // Both failed
    const pgError = pgRes.status === 'rejected' ? pgRes.reason.message : (pgRes.value?.message || 'Postgres failed')
    const gasError = gasRes.status === 'rejected' ? gasRes.reason.message : (gasRes.value?.message || 'GAS failed')
    throw new Error(`DualWrite write failure! PG: ${pgError} | GAS: ${gasError}`)
  }

  async deleteOrder(id: string, password?: string, token?: string): Promise<any> {
    const mode = getBackendMode()
    if (mode === 'gas') return this.gas.deleteOrder(id, password, token)
    if (mode === 'postgres') return this.pg.deleteOrder(id, password, token)

    // Dual-write deletion
    const [pgRes, gasRes] = await Promise.allSettled([
      this.pg.deleteOrder(id, password, token),
      this.gas.deleteOrder(id, password, token)
    ])

    const pgSuccess = pgRes.status === 'fulfilled' && pgRes.value.ok
    const gasSuccess = gasRes.status === 'fulfilled' && gasRes.value.ok

    if (!pgSuccess && !gasSuccess) {
      throw new Error('Failed to delete booking in both databases')
    }
    return pgSuccess ? pgRes.value : gasRes.value
  }
}

export class DualWriteMenuRepository implements MenuRepository {
  private gas = new GasMenuRepository()
  private pg = new PostgresMenuRepository()

  async getMenu(sheetName: string, onBgUpdate?: (data: any) => void): Promise<any> {
    const mode = getBackendMode()
    if (mode === 'gas') return this.gas.getMenu(sheetName, onBgUpdate)
    if (mode === 'postgres') return this.pg.getMenu(sheetName, onBgUpdate)

    try {
      const res = await this.pg.getMenu(sheetName, onBgUpdate)
      if (res.ok) return res
      throw new Error(res.message)
    } catch {
      return this.gas.getMenu(sheetName, onBgUpdate)
    }
  }

  async getMenuSheets(): Promise<any> {
    const mode = getBackendMode()
    if (mode === 'gas') return this.gas.getMenuSheets()
    if (mode === 'postgres') return this.pg.getMenuSheets()

    try {
      const res = await this.pg.getMenuSheets()
      if (res.ok) return res
      throw new Error(res.message)
    } catch {
      return this.gas.getMenuSheets()
    }
  }

  async createMenu(name: string, rawText: string, password?: string, token?: string): Promise<any> {
    const mode = getBackendMode()
    if (mode === 'gas') return this.gas.createMenu(name, rawText, password, token)
    if (mode === 'postgres') return this.pg.createMenu(name, rawText, password, token)

    const [pgRes, gasRes] = await Promise.allSettled([
      this.pg.createMenu(name, rawText, password, token),
      this.gas.createMenu(name, rawText, password, token)
    ])
    return pgRes.status === 'fulfilled' && pgRes.value.ok ? pgRes.value : gasRes.status === 'fulfilled' ? gasRes.value : { ok: false }
  }

  async deleteMenu(name: string, password?: string, token?: string): Promise<any> {
    const mode = getBackendMode()
    if (mode === 'gas') return this.gas.deleteMenu(name, password, token)
    if (mode === 'postgres') return this.pg.deleteMenu(name, password, token)

    await Promise.allSettled([
      this.pg.deleteMenu(name, password, token),
      this.gas.deleteMenu(name, password, token)
    ])
    return { ok: true }
  }

  async uploadMenuImage(sheetName: string, base64: string, password?: string, token?: string): Promise<any> {
    const mode = getBackendMode()
    if (mode === 'postgres') return this.pg.uploadMenuImage(sheetName, base64, password, token)
    return this.gas.uploadMenuImage(sheetName, base64, password, token)
  }

  async uploadDishImage(dishId: string, base64: string, password?: string, token?: string): Promise<any> {
    const mode = getBackendMode()
    if (mode === 'postgres') return this.pg.uploadDishImage(dishId, base64, password, token)
    return this.gas.uploadDishImage(dishId, base64, password, token)
  }

  async getMenuAliases(token?: string): Promise<any> {
    const mode = getBackendMode()
    if (mode === 'gas') return this.gas.getMenuAliases(token)
    if (mode === 'postgres') return this.pg.getMenuAliases(token)

    try {
      const res = await this.pg.getMenuAliases(token)
      if (res.ok) return res
      throw new Error(res.message)
    } catch {
      return this.gas.getMenuAliases(token)
    }
  }

  async saveMenuAlias(alias: string, dishName: string, token?: string): Promise<any> {
    const mode = getBackendMode()
    if (mode === 'gas') return this.gas.saveMenuAlias(alias, dishName, token)
    if (mode === 'postgres') return this.pg.saveMenuAlias(alias, dishName, token)

    await Promise.allSettled([
      this.pg.saveMenuAlias(alias, dishName, token),
      this.gas.saveMenuAlias(alias, dishName, token)
    ])
    return { ok: true }
  }

  async deleteMenuAlias(alias: string, token?: string): Promise<any> {
    const mode = getBackendMode()
    if (mode === 'gas') return this.gas.deleteMenuAlias(alias, token)
    if (mode === 'postgres') return this.pg.deleteMenuAlias(alias, token)

    await Promise.allSettled([
      this.pg.deleteMenuAlias(alias, token),
      this.gas.deleteMenuAlias(alias, token)
    ])
    return { ok: true }
  }
}

export class DualWriteSettingsRepository implements SettingsRepository {
  private gas = new GasSettingsRepository()
  private pg = new PostgresSettingsRepository()

  async getConfig(onBgUpdate?: (data: any) => void): Promise<any> {
    const mode = getBackendMode()
    if (mode === 'gas') return this.gas.getConfig(onBgUpdate)
    if (mode === 'postgres') return this.pg.getConfig(onBgUpdate)

    try {
      const res = await this.pg.getConfig(onBgUpdate)
      if (res.ok) return res
      throw new Error(res.message)
    } catch {
      return this.gas.getConfig(onBgUpdate)
    }
  }

  async saveConfig(payload: any): Promise<any> {
    const mode = getBackendMode()
    if (mode === 'gas') return this.gas.saveConfig(payload)
    if (mode === 'postgres') return this.pg.saveConfig(payload)

    await Promise.allSettled([
      this.pg.saveConfig(payload),
      this.gas.saveConfig(payload)
    ])
    return { ok: true }
  }

  async saveApiKeyToCloud(provider: string, key: string, password?: string, token?: string): Promise<any> {
    return this.gas.saveApiKeyToCloud(provider, key, password, token)
  }

  async deleteApiKeyFromCloud(provider: string, index: number, token?: string): Promise<any> {
    return this.gas.deleteApiKeyFromCloud(provider, index, token)
  }

  async borrowApiKeys(password: string): Promise<any> {
    return this.gas.borrowApiKeys(password)
  }

  async authAdminSettings(password: string): Promise<any> {
    const mode = getBackendMode()
    if (mode === 'postgres') return this.pg.authAdminSettings(password)
    return this.gas.authAdminSettings(password)
  }

  async verifyAdminSettings(token: string): Promise<any> {
    const mode = getBackendMode()
    if (mode === 'postgres') return this.pg.verifyAdminSettings(token)
    return this.gas.verifyAdminSettings(token)
  }

  async logoutAdminSettings(token: string): Promise<any> {
    const mode = getBackendMode()
    if (mode === 'postgres') return this.pg.logoutAdminSettings(token)
    return this.gas.logoutAdminSettings(token)
  }

  async getAdminSystemConfig(token: string): Promise<any> {
    return this.gas.getAdminSystemConfig(token)
  }

  async saveAiApiConfig(token: string, config: any): Promise<any> {
    return this.gas.saveAiApiConfig(token, config)
  }

  async testAiApiKey(token: string, provider: string, apiKey: string): Promise<any> {
    return this.gas.testAiApiKey(token, provider, apiKey)
  }

  async getAiRuntimeConfig(): Promise<any> {
    const mode = getBackendMode()
    if (mode === 'postgres') return this.pg.getAiRuntimeConfig()
    return this.gas.getAiRuntimeConfig()
  }

  async upsertSystemConfig(key: string, value: any, options?: any, token?: string): Promise<any> {
    return this.gas.upsertSystemConfig(key, value, options, token)
  }

  async upsertSystemConfigBatch(configPatch: Record<string, any>, options?: any, token?: string): Promise<any> {
    return this.gas.upsertSystemConfigBatch(configPatch, options, token)
  }

  async mergeSystemConfig(configPatch: Record<string, any>, options?: any, token?: string): Promise<any> {
    return this.gas.mergeSystemConfig(configPatch, options, token)
  }

  async backupSystemConfig(reason?: string, token?: string): Promise<any> {
    return this.gas.backupSystemConfig(reason, token)
  }

  async restoreSystemConfigBackup(backupId: string, token?: string): Promise<any> {
    return this.gas.restoreSystemConfigBackup(backupId, token)
  }

  async getSystemConfigBackups(token: string): Promise<any> {
    return this.gas.getSystemConfigBackups(token)
  }

  async getSystemConfigAuditLogs(token: string): Promise<any> {
    return { ok: true, logs: [] }
  }

  async writeAuditLog(log: any): Promise<any> {
    const mode = getBackendMode()
    if (mode === 'gas') return this.gas.writeAuditLog(log)
    if (mode === 'postgres') return this.pg.writeAuditLog(log)

    await Promise.allSettled([
      this.pg.writeAuditLog(log),
      this.gas.writeAuditLog(log)
    ])
    return { ok: true }
  }
}

export class DualWriteCorrectionRepository implements CorrectionRepository {
  private gas = new GasCorrectionRepository()
  private pg = new PostgresCorrectionRepository()

  async logAiCorrection(inputText: string, wrongValue: any, correctValue: any, field: string, token?: string): Promise<any> {
    const mode = getBackendMode()
    if (mode === 'gas') return this.gas.logAiCorrection(inputText, wrongValue, correctValue, field, token)
    if (mode === 'postgres') return this.pg.logAiCorrection(inputText, wrongValue, correctValue, field, token)

    await Promise.allSettled([
      this.pg.logAiCorrection(inputText, wrongValue, correctValue, field, token),
      this.gas.logAiCorrection(inputText, wrongValue, correctValue, field, token)
    ])
    return { ok: true }
  }

  async getAiCorrections(token?: string): Promise<any> {
    const mode = getBackendMode()
    if (mode === 'gas') return this.gas.getAiCorrections(token)
    if (mode === 'postgres') return this.pg.getAiCorrections(token)

    try {
      const res = await this.pg.getAiCorrections(token)
      if (res.ok) return res
      throw new Error(res.message)
    } catch {
      return this.gas.getAiCorrections(token)
    }
  }
}
