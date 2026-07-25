import { AI_MODELS } from '@/utils/constants'
import { get as idbGet, set as idbSet } from 'idb-keyval'

interface CooldownInfo {
  expiry: number
  reason: string
}

const cooldownMap: Record<string, CooldownInfo> = {}

export type ProviderFailureKind =
  | 'rate_limited'
  | 'timeout'
  | 'network_error'
  | 'server_error'
  | 'invalid_payload'
  | 'auth_error'
  | 'unknown';

export interface ProviderHealthState {
  provider: string
  status: 'closed' | 'open' | 'half_open'
  consecutiveFailures: number
  lastFailureAt?: number
  cooldownUntil?: number
  recentLatencyMs?: number
  lastFailureKind?: ProviderFailureKind
}

const providerHealthMap: Record<string, ProviderHealthState> = {}

export interface GatewayHealthState {
  gateway: string
  status: 'closed' | 'open' | 'half_open'
  consecutiveFailures: number
  cooldownUntil?: number
  lastFailureKind?: string
}

const gatewayHealthMap: Record<string, GatewayHealthState> = {}

export type PersistedCircuitState = {
  schemaVersion: number
  updatedAt: number
  providers: Record<string, {
    status: 'closed' | 'open' | 'half_open'
    cooldownUntil?: number
    lastFailureKind?: ProviderFailureKind
    consecutiveFailures: number
  }>
  models: Record<string, {
    expiry: number
    reason: string
  }>
  gateways: Record<string, {
    status: 'closed' | 'open' | 'half_open'
    cooldownUntil?: number
    lastFailureKind?: string
  }>
}

const CIRCUIT_STATE_DB_KEY = 'kg_circuit_breaker_state'

function saveStateToDB() {
  if (typeof indexedDB === 'undefined') return
  const state: PersistedCircuitState = {
    schemaVersion: 1,
    updatedAt: Date.now(),
    providers: { ...providerHealthMap } as any,
    models: { ...cooldownMap },
    gateways: { ...gatewayHealthMap } as any
  }
  idbSet(CIRCUIT_STATE_DB_KEY, state).catch(err => {
    console.warn('[CircuitBreaker] DB write failed:', err)
  })
}

export async function hydrateCircuitState(): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    return
  }
  try {
    const state = await idbGet<PersistedCircuitState>(CIRCUIT_STATE_DB_KEY)
    if (state && state.schemaVersion === 1) {
      const now = Date.now()
      if (state.models) {
        Object.entries(state.models).forEach(([modelId, info]) => {
          if (info.expiry > now) {
            cooldownMap[modelId] = info
          }
        })
      }
      if (state.providers) {
        Object.entries(state.providers).forEach(([provider, pState]) => {
          if (pState.cooldownUntil && pState.cooldownUntil > now) {
            providerHealthMap[provider] = pState as any
          } else if (pState.status === 'open') {
            providerHealthMap[provider] = {
              ...pState,
              status: 'half_open',
              cooldownUntil: undefined
            } as any
          } else {
            providerHealthMap[provider] = pState as any
          }
        })
      }
      if (state.gateways) {
        Object.entries(state.gateways).forEach(([gateway, gState]) => {
          if (gState.cooldownUntil && gState.cooldownUntil > now) {
            gatewayHealthMap[gateway] = gState as any
          } else if (gState.status === 'open') {
            gatewayHealthMap[gateway] = {
              ...gState,
              status: 'half_open',
              cooldownUntil: undefined
            } as any
          } else {
            gatewayHealthMap[gateway] = gState as any
          }
        })
      }
      console.info(`[Circuit Breaker] Hydrated: ${Object.keys(cooldownMap).length} models, ${Object.keys(providerHealthMap).length} providers active.`)
    }
  } catch (err) {
    console.warn('[CircuitBreaker] Hydration failed, using memory only:', err)
  }
}

hydrateCircuitState()

export function getProviderHealth(provider: string): ProviderHealthState {
  if (!providerHealthMap[provider]) {
    providerHealthMap[provider] = {
      provider,
      status: 'closed',
      consecutiveFailures: 0
    }
  }
  const state = providerHealthMap[provider]
  
  if (state.status === 'open' && state.cooldownUntil && Date.now() > state.cooldownUntil) {
    state.status = 'half_open'
    console.info(`[Circuit Breaker] Provider [${provider}] transitioned to HALF_OPEN. Cooldown expired.`)
  }
  return state
}

export function isProviderCircuitOpen(provider: string): boolean {
  const state = getProviderHealth(provider)
  return state.status === 'open'
}

export function reportProviderSuccess(provider: string, latencyMs?: number): void {
  const state = getProviderHealth(provider)
  state.consecutiveFailures = 0
  state.recentLatencyMs = latencyMs
  if (state.status === 'half_open' || state.status === 'open') {
    state.status = 'closed'
    state.cooldownUntil = undefined
    console.info(`[Circuit Breaker] Provider [${provider}] circuit CLOSED (Success!).`)
  }
  saveStateToDB()
}

export function reportProviderFailure(provider: string, kind: ProviderFailureKind, errorMsg: string): void {
  const state = getProviderHealth(provider)
  state.consecutiveFailures++
  state.lastFailureAt = Date.now()
  state.lastFailureKind = kind
  
  let cooldownDuration = 0
  let shouldOpen = false

  if (kind === 'auth_error') {
    cooldownDuration = 15 * 60 * 1000
    shouldOpen = true
    console.warn(`[Circuit Breaker] Provider [${provider}] auth error. Opening circuit immediately.`)
  } else if (kind === 'rate_limited') {
    cooldownDuration = 60 * 1000
    shouldOpen = true
    console.warn(`[Circuit Breaker] Provider [${provider}] rate limited. Opening circuit immediately.`)
  } else {
    if (state.consecutiveFailures >= 3 || state.status === 'half_open') {
      shouldOpen = true
      const failuresOverThree = Math.max(0, state.consecutiveFailures - 3)
      const multiplier = Math.min(10, Math.pow(2, failuresOverThree))
      cooldownDuration = 30 * 1000 * multiplier
      console.warn(`[Circuit Breaker] Provider [${provider}] consecutive failure count: ${state.consecutiveFailures}. Opening circuit.`)
    }
  }

  if (shouldOpen) {
    state.status = 'open'
    state.cooldownUntil = Date.now() + cooldownDuration
    console.warn(`[Circuit Breaker] Provider [${provider}] circuit OPEN. Cooldown for ${Math.round(cooldownDuration / 1000)}s. Reason: ${errorMsg}`)
  }
  saveStateToDB()
}

export function cooldownModel(modelId: string, durationMs: number, reason: string): void {
  const expiry = Date.now() + durationMs
  cooldownMap[modelId] = { expiry, reason }
  console.warn(`[Circuit Breaker] Model [${modelId}] has been put in cooldown for ${Math.round(durationMs / 1000)}s. Reason: ${reason}`)
  saveStateToDB()
}

export function isModelCooldown(modelId: string): boolean {
  const info = cooldownMap[modelId]
  if (!info) return false
  
  if (Date.now() > info.expiry) {
    delete cooldownMap[modelId]
    saveStateToDB()
    return false
  }
  return true
}

export function getRemainingCooldown(modelId: string): number {
  const info = cooldownMap[modelId]
  if (!info) return 0
  
  const remainingMs = info.expiry - Date.now()
  if (remainingMs <= 0) {
    delete cooldownMap[modelId]
    saveStateToDB()
    return 0
  }
  return Math.ceil(remainingMs / 1000)
}

export function getCooldownReason(modelId: string): string | null {
  if (!isModelCooldown(modelId)) return null
  return cooldownMap[modelId]?.reason || null
}

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

export function clearAllCooldowns(): void {
  for (const key in cooldownMap) {
    delete cooldownMap[key]
  }
  for (const key in providerHealthMap) {
    delete providerHealthMap[key]
  }
  for (const key in gatewayHealthMap) {
    delete gatewayHealthMap[key]
  }
  console.log('[Circuit Breaker] All model, provider, and gateway cooldowns cleared.')
  saveStateToDB()
}

export function handleModelFailure(modelId: string, error: any): void {
  const errMsg = String(error?.message || error || '').toLowerCase()
  let durationMs = 0
  let reason = ''
  let failureKind: ProviderFailureKind = 'unknown'

  if (
    errMsg.includes('429') || 
    errMsg.includes('rate limit') || 
    errMsg.includes('quota') || 
    errMsg.includes('resource_exhausted') ||
    errMsg.includes('too many requests') ||
    errMsg.includes('lock timeout') ||
    errMsg.includes('script lock')
  ) {
    durationMs = 5 * 60 * 1000
    reason = 'HTTP 429 Rate Limit / Quota Exceeded'
    failureKind = 'rate_limited'
  } else if (
    errMsg.includes('404') || 
    errMsg.includes('not found') || 
    errMsg.includes('decommissioned') || 
    errMsg.includes('no longer supported')
  ) {
    durationMs = 15 * 60 * 1000
    reason = 'HTTP 404 Model Not Found or Decommissioned'
    failureKind = 'server_error'
  } else if (
    errMsg.includes('401') || 
    errMsg.includes('403') || 
    errMsg.includes('unauthorized') || 
    errMsg.includes('invalid_key') ||
    errMsg.includes('invalid api key')
  ) {
    if (errMsg.includes('turnstile') || errMsg.includes('missing turnstile token')) {
      durationMs = 1 * 60 * 1000
      reason = 'Cloudflare Turnstile block'
      failureKind = 'network_error'
    } else {
      durationMs = 15 * 60 * 1000
      reason = 'HTTP 401/403 Invalid API Key / Unauthorized'
      failureKind = 'auth_error'
    }
  } else if (
    errMsg.includes('402') || 
    errMsg.includes('payment') || 
    errMsg.includes('balance') || 
    errMsg.includes('billing')
  ) {
    durationMs = 15 * 60 * 1000
    reason = 'HTTP 402 Payment Required / Balance Exhausted'
    failureKind = 'auth_error'
  } else if (
    errMsg.includes('timeout') || 
    errMsg.includes('abort')
  ) {
    durationMs = 1 * 60 * 1000
    reason = 'Request Timeout'
    failureKind = 'timeout'
  } else if (
    errMsg.includes('schema') ||
    errMsg.includes('validation') ||
    errMsg.includes('invalid output format')
  ) {
    durationMs = 30 * 1000
    reason = 'Invalid JSON Schema / Output Validation Failure'
    failureKind = 'invalid_payload'
  } else if (
    errMsg.includes('failed to fetch') ||
    errMsg.includes('network') ||
    errMsg.includes('fetch')
  ) {
    durationMs = 1 * 60 * 1000
    reason = 'Network Connection / CORS Error'
    failureKind = 'network_error'
  }

  if (durationMs > 0) {
    cooldownModel(modelId, durationMs, reason)
  }

  const model = AI_MODELS.find(m => m.id === modelId)
  if (model) {
    reportProviderFailure(model.provider, failureKind, reason || errMsg)
  }
}

// --- GATEWAY CIRCUIT BREAKER ---

export function getGatewayHealth(gateway: string): GatewayHealthState {
  if (!gatewayHealthMap[gateway]) {
    gatewayHealthMap[gateway] = {
      gateway,
      status: 'closed',
      consecutiveFailures: 0
    }
  }
  const state = gatewayHealthMap[gateway]
  if (state.status === 'open' && state.cooldownUntil && Date.now() > state.cooldownUntil) {
    state.status = 'half_open'
    console.info(`[Circuit Breaker] Gateway [${gateway}] transitioned to HALF_OPEN. Cooldown expired.`)
  }
  return state
}

export function isGatewayCircuitOpen(gateway: string): boolean {
  const state = getGatewayHealth(gateway)
  return state.status === 'open'
}

export function reportGatewaySuccess(gateway: string): void {
  const state = getGatewayHealth(gateway)
  state.consecutiveFailures = 0
  if (state.status === 'half_open' || state.status === 'open') {
    state.status = 'closed'
    state.cooldownUntil = undefined
    console.info(`[Circuit Breaker] Gateway [${gateway}] circuit CLOSED (Success!).`)
  }
  saveStateToDB()
}

export function reportGatewayFailure(gateway: string, kind: string, errorMsg: string): void {
  const state = getGatewayHealth(gateway)
  state.consecutiveFailures++
  state.lastFailureKind = kind
  
  const isLockContention = /lock|timeout|script lock|concurrent|exceeded/i.test(errorMsg)
  const cooldownDuration = isLockContention ? 15 * 1000 : 30 * 1000
  state.status = 'open'
  state.cooldownUntil = Date.now() + cooldownDuration
  console.warn(`[Circuit Breaker] Gateway [${gateway}] circuit OPEN. Cooldown for ${Math.round(cooldownDuration / 1000)}s. Reason: ${errorMsg}`)
  saveStateToDB()
}
