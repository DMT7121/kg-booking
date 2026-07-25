import type { AIModel } from '@/utils/constants'

export type ModelTier = 'TIER_0_FAST' | 'TIER_1_BALANCED' | 'TIER_2_QUALITY' | 'TIER_3_OCR'

export interface ModelPolicy {
  tier: ModelTier
  provider: 'groq' | 'cerebras' | 'google' | 'openrouter' | 'pollinations' | string
  model: string
  supportsJsonMode: boolean
  supportsJsonSchema: boolean
  supportsVision: boolean
  defaultTimeoutMs: number
  maxOutputTokens: number
  temperature: number
}

export function getModelPolicy(model: AIModel): ModelPolicy {
  const provider = model.provider.toLowerCase()
  const modelId = model.id.toLowerCase()

  let tier: ModelTier = 'TIER_1_BALANCED'
  let supportsJsonMode = true
  let supportsJsonSchema = false
  let supportsVision = model.type === 'vision'
  let defaultTimeoutMs = 10000
  let maxOutputTokens = 800
  let temperature = 0.1

  // Set Tiers - Check Vision models first so Vision OCR timeouts apply correctly regardless of provider
  if (model.type === 'vision') {
    tier = 'TIER_3_OCR'
    defaultTimeoutMs = (modelId.includes('90b') || modelId.includes('pro') || modelId.includes('large') || modelId.includes('72b')) ? 25000 : 15000
    maxOutputTokens = 1500
    if (provider === 'groq' || provider === 'google') {
      supportsJsonSchema = true
    }
  } else if (provider === 'groq' || provider === 'cerebras') {
    tier = 'TIER_0_FAST'
    defaultTimeoutMs = 6000
    if (provider === 'groq' && (modelId.includes('3.3') || modelId.includes('3.1') || modelId.includes('3.2'))) {
      supportsJsonSchema = true
    }
  } else if (modelId.includes('pro') || modelId.includes('large')) {
    tier = 'TIER_2_QUALITY'
    defaultTimeoutMs = 12000
  }

  // Adjust specific properties
  if (provider === 'pollinations' || provider === 'huggingface') {
    supportsJsonMode = false
    defaultTimeoutMs = 8000
  }

  if (provider === 'google') {
    supportsJsonSchema = true
    if (model.type !== 'vision') defaultTimeoutMs = 12000
  }

  return {
    tier,
    provider: model.provider,
    model: model.id,
    supportsJsonMode,
    supportsJsonSchema,
    supportsVision,
    defaultTimeoutMs,
    maxOutputTokens,
    temperature
  }
}
