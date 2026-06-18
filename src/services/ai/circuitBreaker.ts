interface CooldownInfo {
  expiry: number
  reason: string
}

// In-memory model cooldown state
const cooldownMap: Record<string, CooldownInfo> = {}

/**
 * Puts a model into cooldown state
 * @param modelId The ID of the model to cooldown
 * @param durationMs Duration in milliseconds
 * @param reason Reason for cooldown (e.g., "HTTP 429 Rate Limit")
 */
export function cooldownModel(modelId: string, durationMs: number, reason: string): void {
  const expiry = Date.now() + durationMs
  cooldownMap[modelId] = { expiry, reason }
  console.warn(`[Circuit Breaker] Model [${modelId}] has been put in cooldown for ${Math.round(durationMs / 1000)}s. Reason: ${reason}`)
}

/**
 * Checks if a model is currently in cooldown
 * @param modelId The ID of the model to check
 * @returns true if the model is in cooldown, false otherwise
 */
export function isModelCooldown(modelId: string): boolean {
  const info = cooldownMap[modelId]
  if (!info) return false
  
  if (Date.now() > info.expiry) {
    delete cooldownMap[modelId]
    return false
  }
  return true
}

/**
 * Gets the remaining cooldown time in seconds
 * @param modelId The ID of the model
 * @returns Remaining seconds or 0 if not in cooldown
 */
export function getRemainingCooldown(modelId: string): number {
  const info = cooldownMap[modelId]
  if (!info) return 0
  
  const remainingMs = info.expiry - Date.now()
  if (remainingMs <= 0) {
    delete cooldownMap[modelId]
    return 0
  }
  return Math.ceil(remainingMs / 1000)
}

/**
 * Gets the reason for the model's cooldown
 * @param modelId The ID of the model
 * @returns The cooldown reason string, or null
 */
export function getCooldownReason(modelId: string): string | null {
  if (!isModelCooldown(modelId)) return null
  return cooldownMap[modelId]?.reason || null
}

/**
 * Returns a list of all models currently in cooldown
 */
export function getActiveCooldowns(): Array<{ modelId: string; remainingSeconds: number; reason: string }> {
  const list: Array<{ modelId: string; remainingSeconds: number; reason: string }> = []
  for (const modelId in cooldownMap) {
    const remaining = getRemainingCooldown(modelId)
    if (remaining > 0) {
      list.push({
        modelId,
        remainingSeconds: remaining,
        reason: cooldownMap[modelId].reason
      })
    }
  }
  return list
}

/**
 * Clears all active cooldowns, resetting the circuit breaker
 */
export function clearAllCooldowns(): void {
  for (const key in cooldownMap) {
    delete cooldownMap[key]
  }
  console.log('[Circuit Breaker] All model cooldowns cleared.')
}

/**
 * Helper to automatically classify model errors and apply appropriate cooldown duration
 * @param modelId Model ID that failed
 * @param error Error object or message
 */
export function handleModelFailure(modelId: string, error: any): void {
  const errMsg = String(error?.message || error || '').toLowerCase()
  let durationMs = 0
  let reason = ''

  if (
    errMsg.includes('429') || 
    errMsg.includes('rate limit') || 
    errMsg.includes('quota') || 
    errMsg.includes('resource_exhausted') ||
    errMsg.includes('too many requests')
  ) {
    durationMs = 5 * 60 * 1000 // 5 minutes for rate limits
    reason = 'HTTP 429 Rate Limit / Quota Exceeded'
  } else if (
    errMsg.includes('404') || 
    errMsg.includes('not found') || 
    errMsg.includes('decommissioned') || 
    errMsg.includes('no longer supported')
  ) {
    durationMs = 15 * 60 * 1000 // 15 minutes for missing/dead models
    reason = 'HTTP 404 Model Not Found or Decommissioned'
  } else if (
    errMsg.includes('401') || 
    errMsg.includes('403') || 
    errMsg.includes('unauthorized') || 
    errMsg.includes('invalid_key') ||
    errMsg.includes('invalid api key')
  ) {
    durationMs = 15 * 60 * 1000 // 15 minutes for key issues
    reason = 'HTTP 401/403 Invalid API Key / Unauthorized'
  } else if (
    errMsg.includes('402') || 
    errMsg.includes('payment') || 
    errMsg.includes('balance') || 
    errMsg.includes('billing')
  ) {
    durationMs = 15 * 60 * 1000 // 15 minutes for billing issues
    reason = 'HTTP 402 Payment Required / Balance Exhausted'
  } else if (
    errMsg.includes('timeout') || 
    errMsg.includes('abort')
  ) {
    durationMs = 1 * 60 * 1000 // 1 minute for transient timeouts
    reason = 'Request Timeout'
  }

  if (durationMs > 0) {
    cooldownModel(modelId, durationMs, reason)
  }
}

