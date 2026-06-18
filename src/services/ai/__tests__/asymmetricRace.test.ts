import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runAsymmetricRace } from '../asymmetricRace'
import { callAIModel } from '../aiProviderClient'

vi.mock('../aiProviderClient', () => ({
  callAIModel: vi.fn(),
  getTimeoutForModel: vi.fn(() => 2000)
}))

describe('Asymmetric Race Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockFastModel = { id: 'fast', name: 'Fast Model', provider: 'groq', type: 'text' as const, tier: 0, url: '', format: 'openai' as const }
  const mockQualityModel = { id: 'quality', name: 'Quality Model', provider: 'google', type: 'text' as const, tier: 1, url: '', format: 'gemini' as const }

  const validJsonResponse = JSON.stringify({
    customer: { name: 'Chị Vy', phone: '0901234567', confidence: 0.98 },
    booking: { date: '25/06/2026', time: '19:00', guest_count: 5, table_count: 1, tables: 'A2', confidence: 0.95 },
    party: { type: 'Ăn thường', owner_name: '', display_board_text: '', special_request: '', confidence: 0.95 },
    menu_items: [],
    note: '',
    needs_review: [],
    warnings: [],
    raw_entities: { people_names: [], phones: [], dates: [], times: [], numbers: [] }
  })

  it('should accept fast model result if it resolves first and is valid', async () => {
    vi.mocked(callAIModel).mockImplementation((req) => {
      if (req.model.id === 'fast') {
        return Promise.resolve(validJsonResponse)
      }
      // Quality model takes longer
      return new Promise((resolve) => setTimeout(() => resolve(validJsonResponse), 1000))
    })

    const result = await runAsymmetricRace({
      systemPrompt: 'sys',
      userPrompt: 'user',
      image: null,
      fastModel: mockFastModel,
      qualityModel: mockQualityModel,
      configKeys: {},
      apiGatewayUrl: '',
      aiMode: 'direct'
    })

    expect(result.acceptedFrom).toBe('fast')
    expect(result.parsed.customer.name).toBe('Chị Vy')
  })

  it('should wait for quality model if fast model fails validation', async () => {
    const invalidJsonResponse = JSON.stringify({ customer: { name: '' } }) // fails validation

    vi.mocked(callAIModel).mockImplementation((req) => {
      if (req.model.id === 'fast') {
        return Promise.resolve(invalidJsonResponse)
      }
      return new Promise((resolve) => setTimeout(() => resolve(validJsonResponse), 100))
    })

    const result = await runAsymmetricRace({
      systemPrompt: 'sys',
      userPrompt: 'user',
      image: null,
      fastModel: mockFastModel,
      qualityModel: mockQualityModel,
      configKeys: {},
      apiGatewayUrl: '',
      aiMode: 'direct'
    })

    expect(result.acceptedFrom).toBe('quality')
    expect(result.parsed.customer.name).toBe('Chị Vy')
  })
})
