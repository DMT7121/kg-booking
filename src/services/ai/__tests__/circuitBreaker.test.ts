import { describe, it, expect, beforeEach } from 'vitest'
import { 
  cooldownModel, 
  isModelCooldown, 
  getRemainingCooldown, 
  getCooldownReason, 
  getActiveCooldowns, 
  clearAllCooldowns,
  handleModelFailure
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
})
