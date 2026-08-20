import { AuditLogEntry, AuditEntityType, AuditActionType, AuditActorType } from './types'

const AUDIT_STORAGE_KEY = 'kg_audit_logs_v1'
const MAX_LOCAL_AUDIT_LOGS = 1000

class AuditService {
  private inMemoryLogs: AuditLogEntry[] = []
  private initialized = false

  constructor() {
    this.init()
  }

  public init(): void {
    if (this.initialized) return
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = localStorage.getItem(AUDIT_STORAGE_KEY)
        if (stored) {
          this.inMemoryLogs = JSON.parse(stored)
        }
      }
    } catch (e) {
      console.warn('[AuditService] Failed to load audit logs from storage', e)
    }
    this.initialized = true
  }

  public recordLog(input: {
    entityType: AuditEntityType
    entityId: string
    action: AuditActionType
    actorId?: string
    actorType?: AuditActorType
    beforeState?: any
    afterState?: any
    changedFields?: string[]
    source?: string
    deviceId?: string
    correlationId?: string
    note?: string
  }): AuditLogEntry {
    const entry: AuditLogEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      actorId: input.actorId || 'system',
      actorType: input.actorType || 'USER',
      timestamp: Date.now(),
      beforeState: input.beforeState ? JSON.parse(JSON.stringify(input.beforeState)) : null,
      afterState: input.afterState ? JSON.parse(JSON.stringify(input.afterState)) : null,
      changedFields: input.changedFields || this.computeChangedFields(input.beforeState, input.afterState),
      source: input.source || 'web_app',
      deviceId: input.deviceId,
      correlationId: input.correlationId,
      note: input.note
    }

    this.inMemoryLogs.unshift(entry)
    if (this.inMemoryLogs.length > MAX_LOCAL_AUDIT_LOGS) {
      this.inMemoryLogs = this.inMemoryLogs.slice(0, MAX_LOCAL_AUDIT_LOGS)
    }

    this.persist()
    return entry
  }

  public getHistoryForEntity(entityType: AuditEntityType, entityId: string): AuditLogEntry[] {
    return this.inMemoryLogs.filter(
      (log) => log.entityType === entityType && String(log.entityId) === String(entityId)
    )
  }

  public getRecentLogs(limit = 50): AuditLogEntry[] {
    return this.inMemoryLogs.slice(0, limit)
  }

  public clearAllLogs(): void {
    this.inMemoryLogs = []
    this.persist()
  }

  private computeChangedFields(before: any, after: any): string[] {
    if (!before || !after) return []
    const changed: string[] = []
    const allKeys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
    for (const key of allKeys) {
      if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
        changed.push(key)
      }
    }
    return changed
  }

  private persist(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(this.inMemoryLogs))
      }
    } catch (e) {
      console.warn('[AuditService] Failed to persist audit logs', e)
    }
  }
}

export const auditService = new AuditService()
