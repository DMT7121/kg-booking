import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { callAIModel } from '../aiProviderClient'
import * as api from '@/services/api'

vi.mock('@/services/api', () => ({
  callAiProxy: vi.fn(),
  createAIAbortController: vi.fn(),
  clearAIAbortController: vi.fn()
}))

describe('aiProviderClient - Server Fallback Gateway Tests', () => {
  const mockModel = {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    provider: 'google',
    type: 'text' as const,
    tier: 1,
    url: 'https://generativelanguage.googleapis.com',
    format: 'gemini' as const
  }

  const originalFetch = global.fetch

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('VITE_AI_GATEWAY_URL', 'https://mock-cf-worker.workers.dev')
    vi.stubEnv('VITE_APP_SHARED_SECRET', 'mock-shared-secret')
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.unstubAllEnvs()
  })

  it('should call Cloudflare Worker proxy first when local keys are missing and VITE_AI_GATEWAY_URL is set', async () => {
    const mockResponseContent = 'AI Response content'
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, content: mockResponseContent })
    })
    global.fetch = fetchMock

    const logCallback = vi.fn()

    const result = await callAIModel({
      model: mockModel,
      sysPrompt: 'sys',
      userPrompt: 'user',
      localKeys: [],
      apiGatewayUrl: 'https://mock-cf-worker.workers.dev',
      aiMode: 'direct'
    }, logCallback)

    // Verify Cloudflare Edge Proxy was called first
    expect(fetchMock).toHaveBeenCalled()
    const firstCallUrl = fetchMock.mock.calls[0][0]
    expect(firstCallUrl).toBe('https://mock-cf-worker.workers.dev/api/ai/analyze')

    // Verify request headers contain authorization
    const firstCallInit = fetchMock.mock.calls[0][1]
    expect(firstCallInit.headers.Authorization).toBe('Bearer mock-shared-secret')

    // Verify response content
    expect(result).toBe(mockResponseContent)

    // Verify GAS Proxy was NOT called
    expect(api.callAiProxy).not.toHaveBeenCalled()
    expect(logCallback).toHaveBeenCalledWith(expect.stringContaining('Gọi qua AI Gateway:'), 'info')
    expect(logCallback).toHaveBeenCalledWith(expect.stringContaining('Gọi qua AI Gateway thành công'), 'success')
  })

  it('should NOT fallback to GAS Proxy if Cloudflare Worker Edge Proxy fails', async () => {
    // Mock Cloudflare Worker failure (e.g. 500 server error)
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error')
    })
    global.fetch = fetchMock

    const logCallback = vi.fn()

    // Since VITE_AI_GATEWAY_URL is set, and it fails, it should throw an error because there are no keys and no GAS fallback
    await expect(
      callAIModel({
        model: mockModel,
        sysPrompt: 'sys',
        userPrompt: 'user',
        localKeys: [],
        apiGatewayUrl: 'https://mock-cf-worker.workers.dev',
        aiMode: 'direct'
      }, logCallback)
    ).rejects.toThrow('Tất cả các tuyến vận chuyển (2 stages) của mô hình Gemini 2.0 Flash đều thất bại.')

    // Verify fetch was tried
    expect(fetchMock).toHaveBeenCalled()

    // Verify GAS Proxy fallback was NOT called
    expect(api.callAiProxy).not.toHaveBeenCalled()

    // Verify warning log for Worker failure
    expect(logCallback).toHaveBeenCalledWith(expect.stringContaining('AI Gateway thất bại:'), 'warning')
  })
})
