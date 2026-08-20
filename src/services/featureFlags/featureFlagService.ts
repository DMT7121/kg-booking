import { reactive } from 'vue'
import { FeatureFlagKey, FeatureFlagConfig, DEFAULT_FEATURE_FLAGS } from './types'

const STORAGE_KEY = 'kg_feature_flags_v1'

function cloneDefaultFlags(): Record<FeatureFlagKey, FeatureFlagConfig> {
  return JSON.parse(JSON.stringify(DEFAULT_FEATURE_FLAGS))
}

class FeatureFlagService {
  private flags = reactive<Record<FeatureFlagKey, FeatureFlagConfig>>(cloneDefaultFlags())
  private initialized = false

  constructor() {
    this.init()
  }

  public init(): void {
    if (this.initialized) return
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored) {
          const parsed = JSON.parse(stored)
          Object.keys(DEFAULT_FEATURE_FLAGS).forEach((key) => {
            const flagKey = key as FeatureFlagKey
            if (parsed[flagKey] !== undefined) {
              this.flags[flagKey].enabled = !!parsed[flagKey]
            }
          })
        }
      }
    } catch (e) {
      console.warn('[FeatureFlagService] Failed to load feature flags from localStorage', e)
    }
    this.initialized = true
  }

  public isEnabled(key: FeatureFlagKey): boolean {
    return this.flags[key]?.enabled ?? false
  }

  public setEnabled(key: FeatureFlagKey, enabled: boolean): void {
    if (this.flags[key]) {
      this.flags[key].enabled = enabled
      this.save()
    }
  }

  public getAllFlags(): Record<FeatureFlagKey, FeatureFlagConfig> {
    return this.flags
  }

  public resetToDefaults(): void {
    const defaults = cloneDefaultFlags()
    Object.keys(defaults).forEach((key) => {
      const flagKey = key as FeatureFlagKey
      this.flags[flagKey].enabled = defaults[flagKey].enabled
    })
    this.save()
  }

  private save(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const simpleMap: Record<string, boolean> = {}
        Object.keys(this.flags).forEach((k) => {
          simpleMap[k] = this.flags[k as FeatureFlagKey].enabled
        })
        localStorage.setItem(STORAGE_KEY, JSON.stringify(simpleMap))
      }
    } catch (e) {
      console.warn('[FeatureFlagService] Failed to save feature flags', e)
    }
  }
}

export const featureFlagService = new FeatureFlagService()
