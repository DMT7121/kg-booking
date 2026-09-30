import type { 
  OrderRepository, 
  MenuRepository, 
  SettingsRepository, 
  CorrectionRepository 
} from '@/repositories/repositoryInterfaces'
import { GasOrderRepository, GasMenuRepository, GasSettingsRepository, GasCorrectionRepository } from '../gas/gasRepositories'
import { PostgresOrderRepository, PostgresMenuRepository, PostgresSettingsRepository, PostgresCorrectionRepository, stringToUuid } from '../postgres/postgresRepository'
import * as outbox from '@/infrastructure/outbox/outbox'
import { triggerSync as triggerOutboxSync } from '@/infrastructure/outbox/outboxSync'
import { getBackendMode } from '@/utils/backendMode'

function notifyStoreOutboxUpdate() {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('kg-outbox-updated'))
    }
  } catch {}
}

function getAdminToken(): string {
  try {
    return sessionStorage.getItem('kg_admin_token') || ''
  } catch {
    return ''
  }
}

export function mergeHistoryRecords(pgList: any[], gasList: any[]): any[] {
  const map = new Map<string, any>()

  // 1. First add all Google Sheets items (canonical business records with human-readable IDs like KG-...)
  for (const gasItem of (gasList || [])) {
    if (!gasItem || !gasItem.id) continue
    const uuid = stringToUuid(gasItem.id)
    map.set(uuid, gasItem)
  }

  // 2. Merge PostgreSQL items
  for (const pgItem of (pgList || [])) {
    if (!pgItem || !pgItem.id) continue
    const uuid = pgItem.id
    if (!map.has(uuid)) {
      map.set(uuid, pgItem)
    } else {
      // Record exists in both -> merge, keeping newer version/timestamp, but retain human-readable ID
      const existing = map.get(uuid)
      const pgVer = Number(pgItem.version) || 1
      const exVer = Number(existing.version) || 1
      const pgTime = new Date(pgItem.timestamp || pgItem.created_at || 0).getTime()
      const exTime = new Date(existing.timestamp || existing.meta?.updatedAt || 0).getTime()

      if (pgVer > exVer || (pgVer === exVer && pgTime > exTime)) {
        const finalId = (existing.id && !existing.id.includes('-0000-') && !existing.id.endsWith('000000')) ? existing.id : pgItem.id
        map.set(uuid, { ...existing, ...pgItem, id: finalId })
      }
    }
  }

  const result = Array.from(map.values())
  result.sort((a, b) => {
    const tA = new Date(a.timestamp || a.created_at || a.meta?.updatedAt || 0).getTime()
    const tB = new Date(b.timestamp || b.created_at || b.meta?.updatedAt || 0).getTime()
    return tB - tA
  })
  return result
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
    
    // Dual Write Mode:
    // 1. Ưu tiên đọc từ PostgreSQL (Supabase) để đạt tốc độ cao (<100ms)
    let pgResult: any = null
    try {
      pgResult = await this.pg.getHistory()
    } catch (e: any) {
      console.warn('[DualWrite] PG read failed, falling back to GAS:', e.message)
    }

    // 2. Nếu Postgres có dữ liệu và có callback onBgUpdate
    if (pgResult && pgResult.ok && Array.isArray(pgResult.data) && pgResult.data.length > 0) {
      if (onBgUpdate) {
        // Tải ngầm từ Google Sheets để gộp dữ liệu hoàn chỉnh, không bỏ sót bất kỳ đơn thực tế nào
        const handleGasData = (gasResult: any) => {
          if (gasResult && gasResult.ok && Array.isArray(gasResult.data)) {
            const merged = mergeHistoryRecords(pgResult.data, gasResult.data)
            onBgUpdate({ ok: true, data: merged })
          }
        }
        this.gas.getHistory(handleGasData).then(handleGasData).catch(err => {
          console.warn('[DualWrite] Background GAS history sync error:', err.message)
        })
      }
      return pgResult
    }

    // 3. Fallback sang Google Sheets nếu Postgres thất bại hoặc rỗng
    try {
      const gasResult = await this.gas.getHistory(onBgUpdate)
      if (gasResult && gasResult.ok && Array.isArray(gasResult.data)) {
        return gasResult
      }
      throw new Error(gasResult?.message || 'GAS Read failed')
    } catch (e: any) {
      console.warn('[DualWrite] Both PG and GAS read failed:', e.message)
      return { ok: false, message: e.message }
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
    const orderData = data.id ? data : data.data
    const orderId = orderData.id || crypto.randomUUID()
    if (data.customer) {
      data.id = orderId
    } else if (data.data) {
      data.data.id = orderId
    }

    const mode = getBackendMode()
    const token = getAdminToken()

    if (mode === 'gas') {
      try {
        const gasRes = await this.gas.saveOrder(data)
        if (gasRes && gasRes.ok) return gasRes
        throw new Error(gasRes?.message || 'GAS save failed')
      } catch (err: any) {
        await outbox.addToOutbox(orderId, 'upsert', data)
        notifyStoreOutboxUpdate()
        return { ok: true, id: orderId, status: 'pending', message: 'Saved to local outbox (GAS offline)' }
      }
    }
    if (mode === 'postgres') {
      try {
        const pgRes = await this.pg.saveOrder(data, token)
        if (pgRes && pgRes.ok) return pgRes
        throw new Error(pgRes?.message || 'PostgreSQL save failed')
      } catch (err: any) {
        await outbox.addToOutbox(orderId, 'upsert', data)
        notifyStoreOutboxUpdate()
        return { ok: true, id: orderId, status: 'pending', message: 'Saved to local outbox (PostgreSQL offline)' }
      }
    }

    // Dual Write mode: Lưu đồng thời vào Google Sheets và PostgreSQL
    const gasPromise = this.gas.saveOrder(data, { silent: true })
    const pgPromise = this.pg.saveOrder(data, token)

    // Chờ tối đa 350ms để cả 2 cùng hoàn tất (trong môi trường test hoặc mạng siêu nhanh)
    // Nếu quá 350ms mà Postgres đã xong (thường chỉ mất 50-100ms), trả ngay kết quả cho UI
    // để nhân viên không phải chờ Google Apps Script chậm chạp (mất 2-5s)
    const fastGraceTimeout = new Promise<void>((r) => setTimeout(r, 350))
    const settledPromise = Promise.allSettled([gasPromise, pgPromise])

    const winner = await Promise.race([
      settledPromise.then(() => 'both_settled'),
      fastGraceTimeout.then(() => 'timeout')
    ])

    if (winner === 'both_settled') {
      const [gasResult, pgResult] = await settledPromise
      const gasRes = gasResult.status === 'fulfilled' ? gasResult.value : { ok: false }
      const pgRes = pgResult.status === 'fulfilled' ? pgResult.value : { ok: false }

      const gasOk = !!(gasRes && gasRes.ok)
      const pgOk = !!(pgRes && pgRes.ok)

      if (gasOk && pgOk) {
        // Cả 2 nguồn đều thành công
        return {
          ok: true,
          id: orderId,
          status: 'synced',
          message: 'Order Saved to GAS & PostgreSQL',
          calendarSync: gasRes.calendarSync
        }
      }

      if (gasOk || pgOk) {
        // Lưu thành công 1 nguồn, nguồn còn lại lỗi -> Đưa vào Outbox để retry bù trừ ngầm
        await outbox.addToOutbox(orderId, 'upsert', data, { syncedToPg: pgOk, syncedToSheets: gasOk })
        notifyStoreOutboxUpdate()
        triggerOutboxSync().catch(() => {})
        const failedTarget = !gasOk ? 'Google Sheets' : 'PostgreSQL'
        return {
          ok: true,
          id: orderId,
          status: 'partially_synced',
          message: `Order saved to ${gasOk ? 'Google Sheets' : 'PostgreSQL'}, queued for ${failedTarget}`,
          calendarSync: gasRes?.calendarSync
        }
      }

      // CẢ 2 NGUỒN ĐỀU THẤT BẠI (Mất mạng / Offline / Lỗi server đồng thời)
      await outbox.addToOutbox(orderId, 'upsert', data, { syncedToPg: false, syncedToSheets: false })
      notifyStoreOutboxUpdate()
      return {
        ok: true,
        id: orderId,
        status: 'pending',
        message: 'Saved to local outbox (Offline mode - will sync when online)'
      }
    }

    // Nếu sau 350ms mà GAS chưa xong: Kiểm tra trạng thái của PostgreSQL
    let pgSettled = false
    let pgRes: any = null
    try {
      pgRes = await Promise.race([pgPromise, Promise.resolve('not_yet')])
      if (pgRes !== 'not_yet') {
        pgSettled = true
      }
    } catch {
      pgSettled = true
    }

    if (pgSettled && pgRes && pgRes.ok) {
      // FAST-PATH: Postgres đã ghi thành công (<100ms)! Trả ngay kết quả cho UI và để GAS tiếp tục chạy ngầm
      gasPromise.then(async (gasRes) => {
        if (!gasRes || !gasRes.ok) {
          console.warn('[DualWrite FastPath] GAS sync failed in background, queuing to outbox')
          await outbox.addToOutbox(orderId, 'upsert', data, { syncedToPg: true, syncedToSheets: false })
          notifyStoreOutboxUpdate()
          triggerOutboxSync().catch(() => {})
        }
      }).catch(async (err) => {
        console.warn('[DualWrite FastPath] GAS error in background:', err.message)
        await outbox.addToOutbox(orderId, 'upsert', data, { syncedToPg: true, syncedToSheets: false })
        notifyStoreOutboxUpdate()
        triggerOutboxSync().catch(() => {})
      })

      return {
        ok: true,
        id: orderId,
        status: 'synced',
        message: 'Order Saved to PostgreSQL (Google Sheets syncing in background)',
        calendarSync: undefined
      }
    }

    // Nếu Postgres chưa xong hoặc thất bại: chờ cả 2 hoàn tất đầy đủ
    const [gasResult, pgResult] = await settledPromise
    const gasRes = gasResult.status === 'fulfilled' ? gasResult.value : { ok: false }
    const finalPgRes = pgResult.status === 'fulfilled' ? pgResult.value : { ok: false }

    const gasOk = !!(gasRes && gasRes.ok)
    const pgOk = !!(finalPgRes && finalPgRes.ok)

    if (gasOk && pgOk) {
      return {
        ok: true,
        id: orderId,
        status: 'synced',
        message: 'Order Saved to GAS & PostgreSQL',
        calendarSync: gasRes.calendarSync
      }
    }

    if (gasOk || pgOk) {
      await outbox.addToOutbox(orderId, 'upsert', data, { syncedToPg: pgOk, syncedToSheets: gasOk })
      notifyStoreOutboxUpdate()
      triggerOutboxSync().catch(() => {})
      const failedTarget = !gasOk ? 'Google Sheets' : 'PostgreSQL'
      return {
        ok: true,
        id: orderId,
        status: 'partially_synced',
        message: `Order saved to ${gasOk ? 'Google Sheets' : 'PostgreSQL'}, queued for ${failedTarget}`,
        calendarSync: gasRes?.calendarSync
      }
    }

    await outbox.addToOutbox(orderId, 'upsert', data, { syncedToPg: false, syncedToSheets: false })
    notifyStoreOutboxUpdate()
    return {
      ok: true,
      id: orderId,
      status: 'pending',
      message: 'Saved to local outbox (Offline mode - will sync when online)'
    }
  }

  async saveOrdersBatch(payloads: any[]): Promise<any> {
    const mode = getBackendMode()
    if (mode === 'gas') {
      return this.gas.saveOrdersBatch(payloads)
    }
    if (mode === 'postgres') {
      return this.pg.saveOrdersBatch(payloads)
    }

    // Dual Write mode: Chạy song song toàn bộ batch
    const batchResults = await Promise.allSettled(payloads.map(p => this.saveOrder(p)))
    const results = batchResults.map(r => r.status === 'fulfilled' ? r.value : { ok: false })
    return { ok: true, results }
  }

  async deleteOrder(id: string, password?: string, token?: string): Promise<any> {
    const mode = getBackendMode()
    const resolvedToken = token || getAdminToken()

    if (mode === 'gas') {
      try {
        const res = await this.gas.deleteOrder(id, password, resolvedToken)
        if (res && res.ok) return res
        throw new Error(res?.message || 'GAS delete failed')
      } catch (err: any) {
        await outbox.addToOutbox(id, 'delete', { id, password, token: resolvedToken })
        notifyStoreOutboxUpdate()
        return { ok: true, id, status: 'pending', message: 'Queued for offline deletion (GAS)' }
      }
    }
    if (mode === 'postgres') {
      try {
        const res = await this.pg.deleteOrder(id, password, resolvedToken)
        if (res && res.ok) return res
        throw new Error(res?.message || 'Postgres delete failed')
      } catch (err: any) {
        await outbox.addToOutbox(id, 'delete', { id, password, token: resolvedToken })
        notifyStoreOutboxUpdate()
        return { ok: true, id, status: 'pending', message: 'Queued for offline deletion (PostgreSQL)' }
      }
    }

    // Dual Write mode: Xóa song song ở cả 2 nguồn
    const [pgResult, gasResult] = await Promise.allSettled([
      this.pg.deleteOrder(id, password, resolvedToken),
      this.gas.deleteOrder(id, password, resolvedToken)
    ])

    const pgRes = pgResult.status === 'fulfilled' ? pgResult.value : { ok: false }
    const gasRes = gasResult.status === 'fulfilled' ? gasResult.value : { ok: false }

    const pgOk = !!(pgRes && pgRes.ok)
    const gasOk = !!(gasRes && gasRes.ok)

    if (pgOk && gasOk) {
      return { ok: true, id, status: 'synced', message: 'Deleted from PG & GAS' }
    }

    if (pgOk || gasOk) {
      // Xóa thành công 1 bên, đưa tác vụ xóa bên còn lại vào Outbox
      await outbox.addToOutbox(id, 'delete', { id, password, token: resolvedToken }, { syncedToPg: pgOk, syncedToSheets: gasOk })
      notifyStoreOutboxUpdate()
      triggerOutboxSync().catch(() => {})
      return { ok: true, id, status: 'partially_synced', message: 'Partially deleted, queued for remaining target' }
    }

    // Cả 2 bên đều thất bại (Offline)
    await outbox.addToOutbox(id, 'delete', { id, password, token: resolvedToken }, { syncedToPg: false, syncedToSheets: false })
    notifyStoreOutboxUpdate()
    return { ok: true, id, status: 'pending', message: 'Queued for offline deletion' }
  }

  async syncBookingCalendar(id: string, token?: string): Promise<any> {
    const mode = getBackendMode()
    if (mode === 'gas' || mode === 'dual_write') {
      return this.gas.syncBookingCalendar(id, token)
    }
    return { ok: true, message: 'Sync skipped (Not in GAS mode)' }
  }
}

export class DualWriteMenuRepository implements MenuRepository {
  private gas = new GasMenuRepository()
  private pg = new PostgresMenuRepository()

  async getMenu(sheetName: string, onBgUpdate?: (data: any) => void): Promise<any> {
    const mode = getBackendMode()
    if (mode === 'gas') return this.gas.getMenu(sheetName, onBgUpdate)
    if (mode === 'postgres') return this.pg.getMenu(sheetName, onBgUpdate)

    // 1. Ưu tiên đọc từ PostgreSQL (Supabase) để đạt tốc độ tức thì (<100ms)
    try {
      const pgRes = await this.pg.getMenu(sheetName, onBgUpdate)
      if (pgRes && pgRes.ok && Array.isArray(pgRes.data) && pgRes.data.length > 0) {
        // Nếu có callback revalidate, đồng bộ ngầm từ Google Sheets để không bao giờ bị lệch dữ liệu
        if (onBgUpdate) {
          this.gas.getMenu(sheetName, onBgUpdate).catch(() => {})
        }
        return pgRes
      }
    } catch (e: any) {
      console.warn('[DualWrite] PG getMenu failed, trying GAS:', e.message)
    }

    // 2. Fallback sang Google Sheets nếu Postgres chưa có hoặc lỗi
    return this.gas.getMenu(sheetName, onBgUpdate)
  }

  async getMenuSheets(): Promise<any> {
    const mode = getBackendMode()
    if (mode === 'gas') return this.gas.getMenuSheets()
    if (mode === 'postgres') return this.pg.getMenuSheets()

    // 1. Ưu tiên đọc danh sách sheet từ PostgreSQL (<100ms)
    try {
      const pgRes = await this.pg.getMenuSheets()
      if (pgRes && pgRes.ok && Array.isArray(pgRes.sheets) && pgRes.sheets.length > 0) {
        return pgRes
      }
    } catch (e: any) {
      console.warn('[DualWrite] PG getMenuSheets failed, trying GAS:', e.message)
    }

    // 2. Fallback sang Google Sheets nếu Postgres chưa có hoặc lỗi
    return this.gas.getMenuSheets()
  }

  async createMenu(name: string, rawText: string, password?: string, token?: string): Promise<any> {
    const mode = getBackendMode()
    if (mode === 'gas') return this.gas.createMenu(name, rawText, password, token)
    if (mode === 'postgres') return this.pg.createMenu(name, rawText, password, token)

    const [pgRes, gasRes] = await Promise.allSettled([
      this.pg.createMenu(name, rawText, password, token),
      this.gas.createMenu(name, rawText, password, token)
    ])
    const pgVal = pgRes.status === 'fulfilled' ? (pgRes as PromiseFulfilledResult<any>).value : null
    const gasVal = gasRes.status === 'fulfilled' ? (gasRes as PromiseFulfilledResult<any>).value : null
    return pgVal && pgVal.ok ? pgVal : gasVal ? gasVal : { ok: false }
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
      const gasRes = await this.gas.getMenuAliases(token)
      if (gasRes && gasRes.ok && Array.isArray(gasRes.aliases) && gasRes.aliases.length > 0) {
        return gasRes
      }
    } catch {}

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
      const gasRes = await this.gas.getConfig(onBgUpdate)
      if (gasRes && gasRes.ok) return gasRes
    } catch {}

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
      const gasRes = await this.gas.getAiCorrections(token)
      if (gasRes && gasRes.ok && Array.isArray(gasRes.corrections) && gasRes.corrections.length > 0) {
        return gasRes
      }
    } catch {}

    try {
      const res = await this.pg.getAiCorrections(token)
      if (res.ok) return res
      throw new Error(res.message)
    } catch {
      return this.gas.getAiCorrections(token)
    }
  }
}
