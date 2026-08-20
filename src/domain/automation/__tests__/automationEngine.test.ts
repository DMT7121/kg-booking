import { describe, it, expect } from 'vitest'
import { evaluateAndExecuteRule, AutomationRule } from '../automationEngine'

describe('No-Code Automation Rule Engine Tests', () => {
  it('should evaluate rule and execute actions when conditions match', () => {
    const rule: AutomationRule = {
      ruleId: 'rule_large_party_no_deposit',
      name: 'Cảnh báo đoàn đông chưa cọc',
      enabled: true,
      trigger: 'ON_BOOKING_CREATE',
      conditions: [
        { field: 'guest_count', operator: 'greater_than', value: 15 },
        { field: 'deposit_status', operator: 'equals', value: 'unpaid' }
      ],
      actions: [
        { type: 'MARK_NEEDS_ATTENTION', payload: { note: 'Cần liên hệ lấy cọc đoàn đông' } },
        { type: 'ADD_TAG', payload: { tag: 'Đoàn Đông Chưa Cọc' } }
      ]
    }

    const context = {
      guest_count: 20,
      deposit_status: 'unpaid',
      tags: ['Khách Mới']
    }

    const result = evaluateAndExecuteRule(rule, context)
    expect(result.matched).toBe(true)
    expect(result.executedActions.length).toBe(2)
    expect(result.outputState.needs_attention).toBe(true)
    expect(result.outputState.tags).toContain('Đoàn Đông Chưa Cọc')
  })

  it('should NOT execute actions when conditions do not match', () => {
    const rule: AutomationRule = {
      ruleId: 'rule_vip',
      name: 'Khách VIP',
      enabled: true,
      trigger: 'ON_BOOKING_CREATE',
      conditions: [{ field: 'guest_count', operator: 'greater_than', value: 50 }],
      actions: [{ type: 'ADD_TAG', payload: { tag: 'Đại Tiệc' } }]
    }

    const context = { guest_count: 10 }
    const result = evaluateAndExecuteRule(rule, context)
    expect(result.matched).toBe(false)
    expect(result.executedActions.length).toBe(0)
  })
})
