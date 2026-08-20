export type AuditEntityType = 'booking' | 'deposit' | 'menu_item' | 'table' | 'party' | 'customer'

export type AuditActionType =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'STATUS_CHANGE'
  | 'DEPOSIT_PAID'
  | 'DEPOSIT_REFUND'
  | 'TABLE_ASSIGN'
  | 'RECONCILE'
  | 'MERGE'

export type AuditActorType = 'USER' | 'AI' | 'SYNC' | 'SYSTEM' | 'AUTOMATION'

export interface AuditLogEntry {
  id: string
  entityType: AuditEntityType
  entityId: string
  action: AuditActionType
  actorId: string
  actorType: AuditActorType
  timestamp: number
  beforeState: any
  afterState: any
  changedFields?: string[]
  source: string
  deviceId?: string
  correlationId?: string
  note?: string
}
