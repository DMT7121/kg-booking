import { describe, it, expect, beforeEach } from 'vitest'
import { featureFlagService } from '../featureFlagService'

describe('FeatureFlagService Tests', () => {
  beforeEach(() => {
    localStorage.clear()
    featureFlagService.resetToDefaults()
  })

  it('should have default flags initialized properly', () => {
    expect(featureFlagService.isEnabled('auditLogSystem')).toBe(true)
    expect(featureFlagService.isEnabled('commandCenterV2')).toBe(false)
    expect(featureFlagService.isEnabled('kitchenBoard')).toBe(false)
  })

  it('should enable and disable flags correctly and persist', () => {
    featureFlagService.setEnabled('commandCenterV2', true)
    expect(featureFlagService.isEnabled('commandCenterV2')).toBe(true)

    featureFlagService.setEnabled('commandCenterV2', false)
    expect(featureFlagService.isEnabled('commandCenterV2')).toBe(false)
  })

  it('should return all flags dictionary with metadata', () => {
    const flags = featureFlagService.getAllFlags()
    expect(flags.compositeBookingStatus).toBeDefined()
    expect(flags.compositeBookingStatus.name).toContain('Trạng thái')
    expect(flags.compositeBookingStatus.category).toBe('operations')
  })

  it('should reset to default state when requested', () => {
    featureFlagService.setEnabled('decorBoard', true)
    expect(featureFlagService.isEnabled('decorBoard')).toBe(true)

    featureFlagService.resetToDefaults()
    expect(featureFlagService.isEnabled('decorBoard')).toBe(false)
  })
})
