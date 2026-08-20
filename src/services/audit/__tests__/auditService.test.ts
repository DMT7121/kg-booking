import { describe, it, expect, beforeEach } from 'vitest'
import { auditService } from '../auditService'

describe('AuditService Tests', () => {
  beforeEach(() => {
    localStorage.clear()
    auditService.clearAllLogs()
  })

  it('should record an audit log with computed changed fields', () => {
    const beforeState = { guest_count: 10, status: 'chờ cọc', customer_name: 'Nguyễn Văn A' }
    const afterState = { guest_count: 15, status: 'đã cọc', customer_name: 'Nguyễn Văn A' }

    const entry = auditService.recordLog({
      entityType: 'booking',
      entityId: 'bk_123',
      action: 'UPDATE',
      actorId: 'staff_01',
      actorType: 'USER',
      beforeState,
      afterState,
      note: 'Khách tăng 5 người và chuyển cọc'
    })

    expect(entry.id).toBeDefined()
    expect(entry.entityId).toBe('bk_123')
    expect(entry.changedFields).toContain('guest_count')
    expect(entry.changedFields).toContain('status')
    expect(entry.changedFields).not.toContain('customer_name')
  })

  it('should retrieve audit history by entity ID', () => {
    auditService.recordLog({
      entityType: 'booking',
      entityId: 'bk_999',
      action: 'CREATE',
      actorId: 'ai_bot',
      actorType: 'AI'
    })

    auditService.recordLog({
      entityType: 'booking',
      entityId: 'bk_999',
      action: 'DEPOSIT_PAID',
      actorId: 'cashier',
      actorType: 'USER'
    })

    auditService.recordLog({
      entityType: 'booking',
      entityId: 'bk_888',
      action: 'CREATE',
      actorId: 'staff',
      actorType: 'USER'
    })

    const history999 = auditService.getHistoryForEntity('booking', 'bk_999')
    expect(history999.length).toBe(2)
    expect(history999[0].action).toBe('DEPOSIT_PAID') // Most recent first
    expect(history999[1].action).toBe('CREATE')
  })

  it('should return recent logs within limit', () => {
    for (let i = 0; i < 10; i++) {
      auditService.recordLog({
        entityType: 'deposit',
        entityId: `dep_${i}`,
        action: 'DEPOSIT_PAID'
      })
    }
    const recent = auditService.getRecentLogs(5)
    expect(recent.length).toBe(5)
  })
})
