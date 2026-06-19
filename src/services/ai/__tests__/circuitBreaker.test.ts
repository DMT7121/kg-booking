import { describe, it, expect, beforeEach } from 'vitest'
import { 
  cooldownModel, 
  isModelCooldown, 
  getRemainingCooldown, 
  getCooldownReason, 
  getActiveCooldowns, 
  clearAllCooldowns,
  handleModelFailure,
  isProviderCircuitOpen,
  reportProviderSuccess,
  reportProviderFailure,
  getProviderHealth
} from '../circuitBreaker'

describe('Circuit Breaker (Model Cooldown) Service', () => {
  beforeEach(() => {
    clearAllCooldowns()
  })

  it('should put model in cooldown and verify it is active', () => {
    const modelId = 'test-model-429'
    expect(isModelCooldown(modelId)).toBe(false)

    cooldownModel(modelId, 5000, 'Rate limit exceeded')
    
    expect(isModelCooldown(modelId)).toBe(true)
    expect(getRemainingCooldown(modelId)).toBeGreaterThan(0)
    expect(getCooldownReason(modelId)).toBe('Rate limit exceeded')
    
    const active = getActiveCooldowns()
    expect(active.length).toBe(1)
    expect(active[0].modelId).toBe(modelId)
    expect(active[0].reason).toBe('Rate limit exceeded')
  })

  it('should automatically expire cooldown after duration', async () => {
    const modelId = 'test-model-short'
    // Cooldown only 1ms
    cooldownModel(modelId, 1, 'Quick expire')
    
    // Wait 5ms
    await new Promise(resolve => setTimeout(resolve, 5))
    
    expect(isModelCooldown(modelId)).toBe(false)
    expect(getRemainingCooldown(modelId)).toBe(0)
    expect(getActiveCooldowns().length).toBe(0)
  })

  it('should clear all cooldowns when clearAllCooldowns is called', () => {
    cooldownModel('m1', 10000, 'Error 1')
    cooldownModel('m2', 10000, 'Error 2')
    
    expect(getActiveCooldowns().length).toBe(2)
    
    clearAllCooldowns()
    
    expect(getActiveCooldowns().length).toBe(0)
    expect(isModelCooldown('m1')).toBe(false)
    expect(isModelCooldown('m2')).toBe(false)
  })

  it('should automatically classify error 429 and apply 5 minutes cooldown', () => {
    const modelId = 'model-429-test'
    handleModelFailure(modelId, new Error('Rate limit reached for model (HTTP 429)'))
    
    expect(isModelCooldown(modelId)).toBe(true)
    expect(getCooldownReason(modelId)).toBe('HTTP 429 Rate Limit / Quota Exceeded')
    
    // Remaining time should be around 300 seconds
    const remaining = getRemainingCooldown(modelId)
    expect(remaining).toBeGreaterThan(290)
    expect(remaining).toBeLessThanOrEqual(300)
  })

  it('should automatically classify error 404 and apply 15 minutes cooldown', () => {
    const modelId = 'model-404-test'
    handleModelFailure(modelId, new Error('Error: HTTP 404: Not Found'))
    
    expect(isModelCooldown(modelId)).toBe(true)
    expect(getCooldownReason(modelId)).toBe('HTTP 404 Model Not Found or Decommissioned')
    
    const remaining = getRemainingCooldown(modelId)
    expect(remaining).toBeGreaterThan(890)
    expect(remaining).toBeLessThanOrEqual(900)
  })

  it('should automatically classify error 402 and apply 15 minutes cooldown', () => {
    const modelId = 'model-402-test'
    handleModelFailure(modelId, { message: 'HTTP 402: payment method is required to continue' })
    
    expect(isModelCooldown(modelId)).toBe(true)
    expect(getCooldownReason(modelId)).toBe('HTTP 402 Payment Required / Balance Exhausted')
  })

  it('should automatically classify timeout and apply 1 minute cooldown', () => {
    const modelId = 'model-timeout-test'
    handleModelFailure(modelId, new Error('Timeout model test-model'))
    
    expect(isModelCooldown(modelId)).toBe(true)
    expect(getCooldownReason(modelId)).toBe('Request Timeout')
    
    const remaining = getRemainingCooldown(modelId)
    expect(remaining).toBeGreaterThan(50)
    expect(remaining).toBeLessThanOrEqual(60)
  })

  describe('Provider Circuit Breaker tests', () => {
    it('should open provider circuit immediately on rate limit (HTTP 429)', () => {
      const provider = 'groq'
      expect(isProviderCircuitOpen(provider)).toBe(false)

      reportProviderFailure(provider, 'rate_limited', 'HTTP 429 Rate Limit')

      expect(isProviderCircuitOpen(provider)).toBe(true)
      const health = getProviderHealth(provider)
      expect(health.status).toBe('open')
      expect(health.lastFailureKind).toBe('rate_limited')
    })

    it('should open provider circuit after 3 consecutive failures', () => {
      const provider = 'google'
      expect(isProviderCircuitOpen(provider)).toBe(false)

      reportProviderFailure(provider, 'server_error', 'HTTP 500 Server Error')
      expect(isProviderCircuitOpen(provider)).toBe(false)

      reportProviderFailure(provider, 'timeout', 'Request Timeout')
      expect(isProviderCircuitOpen(provider)).toBe(false)

      reportProviderFailure(provider, 'network_error', 'Network Connection Error')
      expect(isProviderCircuitOpen(provider)).toBe(true)

      const health = getProviderHealth(provider)
      expect(health.status).toBe('open')
      expect(health.consecutiveFailures).toBe(3)
    })

    it('should close provider circuit on success', () => {
      const provider = 'cerebras'
      reportProviderFailure(provider, 'rate_limited', 'HTTP 429 Rate Limit')
      expect(isProviderCircuitOpen(provider)).toBe(true)

      reportProviderSuccess(provider)
      expect(isProviderCircuitOpen(provider)).toBe(false)
      expect(getProviderHealth(provider).consecutiveFailures).toBe(0)
    })

    it('should transition provider status to half-open when cooldown expires', async () => {
      const provider = 'sambanova'
      const health = getProviderHealth(provider)
      
      // Simulate rate limit to open circuit
      reportProviderFailure(provider, 'rate_limited', 'HTTP 429 Rate Limit')
      expect(health.status).toBe('open')

      // Manually set cooldown to the past to simulate expiry
      health.cooldownUntil = Date.now() - 1000

      // Accessing health triggers transition
      const activeHealth = getProviderHealth(provider)
      expect(activeHealth.status).toBe('half_open')
    })

    it('should classify invalid output validation as invalid_payload kind', () => {
      const modelId = 'llama-3.3-70b-versatile' // maps to groq
      handleModelFailure(modelId, new Error('invalid output format or validation failed'))

      const health = getProviderHealth('groq')
      expect(health.lastFailureKind).toBe('invalid_payload')
    })
  })
})
