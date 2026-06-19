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
    expect(logCallback).toHaveBeenCalledWith(expect.stringContaining('qua Server Proxy (Cloudflare Edge)...'), 'info')
    expect(logCallback).toHaveBeenCalledWith(expect.stringContaining('qua Server Proxy (Cloudflare Edge) thành công!'), 'success')
  })

  it('should fallback to GAS Proxy if Cloudflare Worker Edge Proxy fails', async () => {
    // Mock Cloudflare Worker failure (e.g. 500 server error)
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error')
    })
    global.fetch = fetchMock

    // Mock GAS Proxy success
    const mockGasResponse = { ok: true, content: 'GAS Response Content' }
    vi.mocked(api.callAiProxy).mockResolvedValue(mockGasResponse)

    const logCallback = vi.fn()

    const result = await callAIModel({
      model: mockModel,
      sysPrompt: 'sys',
      userPrompt: 'user',
      localKeys: [],
      apiGatewayUrl: 'https://mock-cf-worker.workers.dev',
      aiMode: 'direct'
    }, logCallback)

    // Verify fetch was tried first
    expect(fetchMock).toHaveBeenCalled()

    // Verify GAS Proxy fallback was called
    expect(api.callAiProxy).toHaveBeenCalled()

    // Verify GAS result is returned
    expect(result).toBe('GAS Response Content')

    // Verify warning log for Worker failure and info log for GAS fallback
    expect(logCallback).toHaveBeenCalledWith(expect.stringContaining('Lỗi khi gọi qua Server Proxy (Cloudflare Edge)'), 'warning')
    expect(logCallback).toHaveBeenCalledWith(expect.stringContaining('Chuyển tiếp yêu cầu qua Server Proxy (GAS)...'), 'info')
    expect(logCallback).toHaveBeenCalledWith(expect.stringContaining('Gọi qua Server Proxy (GAS) thành công!'), 'success')
  })
})
