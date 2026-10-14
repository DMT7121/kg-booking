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
  let maxOutputTokens = 4096
  let temperature = 0.1

  // Set Tiers — Vision models always get OCR/Vision timeout budget first
  if (model.type === 'vision') {
    tier = 'TIER_3_OCR'
    defaultTimeoutMs = 15000
  } else if (provider === 'groq' || provider === 'cerebras') {
    tier = 'TIER_0_FAST'
    defaultTimeoutMs = 8000
  } else if (modelId.includes('pro') || modelId.includes('large') || modelId.includes('r1')) {
    tier = 'TIER_2_QUALITY'
    defaultTimeoutMs = 14000
  }

  // Adjust specific properties
  if (provider === 'pollinations' || provider === 'huggingface' || modelId.includes(':free') || modelId.includes('r1')) {
    supportsJsonMode = false // Use prompt instructions instead of strict response_format parameter
    if (model.type !== 'vision') {
      defaultTimeoutMs = 12000
    }
  }

  if (provider === 'google') {
    supportsJsonSchema = true // Gemini natively supports sanitized responseSchema
    defaultTimeoutMs = model.type === 'vision' ? 16000 : 10000
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

