export type AutomationTrigger =
  | 'ON_BOOKING_CREATE'
  | 'ON_TIME_BEFORE_EVENT'
  | 'ON_DEPOSIT_PAID'
  | 'ON_STATUS_CHANGE'

export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'less_than'
  | 'contains'
  | 'is_empty'

export interface AutomationCondition {
  field: string
  operator: ConditionOperator
  value?: any
}

export type ActionType = 'MARK_NEEDS_ATTENTION' | 'SET_STATUS' | 'ADD_TAG' | 'CREATE_ALERT'

export interface AutomationAction {
  type: ActionType
  payload?: any
}

export interface AutomationRule {
  ruleId: string
  name: string
  enabled: boolean
  trigger: AutomationTrigger
  conditions: AutomationCondition[]
  actions: AutomationAction[]
  cooldownMinutes?: number
  lastExecutedAt?: number
  executionCount?: number
}

export interface AutomationExecutionResult {
  ruleId: string
  ruleName: string
  matched: boolean
  executedActions: ActionType[]
  outputState: any
  message?: string
}

/**
 * Checks if a single condition matches the context.
 */
export function evaluateCondition(condition: AutomationCondition, context: any): boolean {
  const fieldVal = getNestedValue(context, condition.field)

  switch (condition.operator) {
    case 'equals':
      return String(fieldVal).toLowerCase() === String(condition.value).toLowerCase()
    case 'not_equals':
      return String(fieldVal).toLowerCase() !== String(condition.value).toLowerCase()
    case 'greater_than':
      return Number(fieldVal) > Number(condition.value)
    case 'less_than':
      return Number(fieldVal) < Number(condition.value)
    case 'contains':
      return String(fieldVal).toLowerCase().includes(String(condition.value).toLowerCase())
    case 'is_empty':
      return fieldVal === null || fieldVal === undefined || String(fieldVal).trim() === ''
    default:
      return false
  }
}

/**
 * Evaluates all conditions of an Automation Rule and executes actions.
 */
export function evaluateAndExecuteRule(
  rule: AutomationRule,
  context: any,
  options?: { dryRun?: boolean }
): AutomationExecutionResult {
  if (!rule.enabled) {
    return { ruleId: rule.ruleId, ruleName: rule.name, matched: false, executedActions: [], outputState: context }
  }

  // Check cooldown
  if (rule.cooldownMinutes && rule.lastExecutedAt) {
    const elapsedMinutes = (Date.now() - rule.lastExecutedAt) / (60 * 1000)
    if (elapsedMinutes < rule.cooldownMinutes) {
      return {
        ruleId: rule.ruleId,
        ruleName: rule.name,
        matched: false,
        executedActions: [],
        outputState: context,
        message: 'Bỏ qua do đang trong thời gian cooldown.'
      }
    }
  }

  // Evaluate all conditions (AND logic)
  const allConditionsMatched = rule.conditions.every((cond) => evaluateCondition(cond, context))

  if (!allConditionsMatched) {
    return { ruleId: rule.ruleId, ruleName: rule.name, matched: false, executedActions: [], outputState: context }
  }

  const modifiedContext = JSON.parse(JSON.stringify(context))
  const executedActions: ActionType[] = []

  if (!options?.dryRun) {
    for (const act of rule.actions) {
      executedActions.push(act.type)
      switch (act.type) {
        case 'MARK_NEEDS_ATTENTION':
          modifiedContext.needs_attention = true
          modifiedContext.attention_note = act.payload?.note || rule.name
          break
        case 'SET_STATUS':
          if (act.payload?.status) {
            modifiedContext.status = act.payload.status
          }
          break
        case 'ADD_TAG':
          if (act.payload?.tag) {
            modifiedContext.tags = Array.from(new Set([...(modifiedContext.tags || []), act.payload.tag]))
          }
          break
        case 'CREATE_ALERT':
          modifiedContext.alert = act.payload?.message || rule.name
          break
      }
    }

    rule.lastExecutedAt = Date.now()
    rule.executionCount = (rule.executionCount || 0) + 1
  }

  return {
    ruleId: rule.ruleId,
    ruleName: rule.name,
    matched: true,
    executedActions,
    outputState: modifiedContext,
    message: `Đã thực thi thành công ${executedActions.length} hành động.`
  }
}

function getNestedValue(obj: any, path: string): any {
  if (!obj || !path) return undefined
  const parts = path.split('.')
  let curr = obj
  for (const part of parts) {
    if (curr === null || curr === undefined) return undefined
    curr = curr[part]
  }
  return curr
}
