import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import worker from '../src/index'

describe('AI Gateway Cloudflare Worker Tests', () => {
  const mockEnv = {
    GEMINI_API_KEY: 'mock-gemini-key',
    OPENROUTER_API_KEY: 'mock-openrouter-key',
    GROQ_API_KEY: 'mock-groq-key',
    CEREBRAS_API_KEY: 'mock-cerebras-key',
    APP_SHARED_SECRET: 'test-shared-secret'
  }

  const originalFetch = global.fetch

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('should return 401 Unauthorized if shared secret is invalid', async () => {
    const request = new Request('http://localhost/api/ai/analyze', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer wrong-secret',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        provider: 'groq',
        sysPrompt: 'sys',
        userPrompt: 'user'
      })
    })

    const response = await worker.fetch(request, mockEnv, {} as any)
    expect(response.status).toBe(401)
    const json = await response.json()
    expect(json.ok).toBe(false)
    expect(json.error).toContain('Unauthorized')
  })

  it('should return 400 Bad Request on invalid task type', async () => {
    const request = new Request('http://localhost/api/ai/analyze', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer test-shared-secret',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        provider: 'groq',
        sysPrompt: 'sys',
        userPrompt: 'user',
        taskType: 'invalid_task_type'
      })
    })

    const response = await worker.fetch(request, mockEnv, {} as any)
    expect(response.status).toBe(400)
    const json = await response.json()
    expect(json.ok).toBe(false)
    expect(json.error).toContain('Invalid task type')
  })

  it('should return 413 Payload Too Large if Content-Length exceeds limit', async () => {
    const request = {
      method: 'POST',
      url: 'http://localhost/api/ai/analyze',
      headers: {
        get(name: string) {
          const lower = name.toLowerCase()
          if (lower === 'authorization') return 'Bearer test-shared-secret'
          if (lower === 'content-length') return String(6 * 1024 * 1024) // 6MB
          if (lower === 'cf-connecting-ip') return '127.0.0.1'
          return null
        }
      },
      json() {
        return Promise.resolve({
          model: 'llama-3.3-70b-versatile',
          provider: 'groq',
          sysPrompt: 'sys',
          userPrompt: 'user'
        })
      }
    } as any

    const response = await worker.fetch(request, mockEnv, {} as any)
    expect(response.status).toBe(413)
    const json = await response.json()
    expect(json.ok).toBe(false)
    expect(json.error).toContain('Payload too large')
  })

  it('should respond to health check and models endpoints', async () => {
    const healthReq = new Request('http://localhost/api/ai/health')
    const healthRes = await worker.fetch(healthReq, mockEnv, {} as any)
    expect(healthRes.status).toBe(200)
    const healthJson = await healthRes.json()
    expect(healthJson.status).toBe('healthy')

    const modelsReq = new Request('http://localhost/api/ai/models')
    const modelsRes = await worker.fetch(modelsReq, mockEnv, {} as any)
    expect(modelsRes.status).toBe(200)
    const modelsJson = await modelsRes.json()
    expect(modelsJson.models.length).toBeGreaterThan(0)
  })

  it('should successfully proxy chat request to groq provider', async () => {
    const mockContent = 'Mocked Groq output'
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: mockContent } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 }
      })
    })
    global.fetch = fetchMock

    const request = new Request('http://localhost/api/ai/analyze', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer test-shared-secret',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        provider: 'groq',
        sysPrompt: 'sys',
        userPrompt: 'user',
        taskType: 'booking_extract'
      })
    })

    const response = await worker.fetch(request, mockEnv, {} as any)
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.ok).toBe(true)
    expect(json.content).toBe(mockContent)
    expect(json.usage.total_tokens).toBe(15)

    // Check fetch headers contains authorization
    const firstCallInit = fetchMock.mock.calls[0][1]
    expect(firstCallInit.headers.Authorization).toBe('Bearer mock-groq-key')
  })
})
