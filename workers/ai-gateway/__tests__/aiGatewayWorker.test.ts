import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import worker from '../src/index'
import * as crypto from 'crypto'

describe('AI Gateway Cloudflare Worker Tests', () => {
  const jwtSecret = 'test-supabase-jwt-secret-very-long'
  
  const mockEnv = {
    GEMINI_API_KEY: 'mock-gemini-key',
    OPENROUTER_API_KEY: 'mock-openrouter-key',
    GROQ_API_KEY: 'mock-groq-key',
    CEREBRAS_API_KEY: 'mock-cerebras-key',
    GOOGLE_SPREADSHEET_ID: 'mock-sheet-id',
    SUPABASE_JWT_SECRET: jwtSecret,
    GAS_URL: 'https://mock-gas-url.exec',
    BUCKET: {
      put: vi.fn().mockResolvedValue({}),
      get: vi.fn().mockResolvedValue({
        body: new Uint8Array([1, 2, 3]).buffer,
        httpMetadata: { contentType: 'image/jpeg' },
        httpEtag: 'mock-etag'
      }),
      delete: vi.fn().mockResolvedValue({}),
      list: vi.fn().mockResolvedValue({
        objects: [{ key: 'orders/123/img.jpg', size: 100, uploaded: new Date().toISOString() }],
        truncated: false
      })
    },
    SHEETS_QUEUE: {
      send: vi.fn().mockResolvedValue({})
    }
  }

  const originalFetch = global.fetch
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('ok') })

  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = fetchMock
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  function generateValidJwt(role: 'admin' | 'manager' | 'staff', expires?: number): string {
    const header = { alg: 'HS256', typ: 'JWT' }
    const payload = {
      app_metadata: { role },
      sub: `user-${role}-id`,
      exp: expires ?? (Math.floor(Date.now() / 1000) + 3600)
    }

    const headerB64 = btoa(JSON.stringify(header)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const payloadB64 = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const message = `${headerB64}.${payloadB64}`

    const signature = crypto
      .createHmac('sha256', jwtSecret)
      .update(message)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    return `${message}.${signature}`
  }

  it('should return 401 Unauthorized if auth header is missing or invalid', async () => {
    const request = new Request('http://localhost/api/ai/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        provider: 'groq',
        sysPrompt: 'sys',
        userPrompt: 'user'
      })
    })

    const response = await worker.fetch(request, mockEnv as any, {} as any)
    expect(response.status).toBe(401)
    const json = await response.json()
    expect(json.ok).toBe(false)
  })

  it('should respond to health check (public endpoint)', async () => {
    const healthReq = new Request('http://localhost/api/ai/health')
    const healthRes = await worker.fetch(healthReq, mockEnv as any, {} as any)
    expect(healthRes.status).toBe(200)
    const healthJson = await healthRes.json()
    expect(healthJson.status).toBe('healthy')
  })

  it('should list models when authenticated with staff JWT', async () => {
    const staffJwt = generateValidJwt('staff')
    const modelsReq = new Request('http://localhost/api/ai/models', {
      headers: {
        'Authorization': `Bearer ${staffJwt}`
      }
    })
    const modelsRes = await worker.fetch(modelsReq, mockEnv as any, {} as any)
    expect(modelsRes.status).toBe(200)
    const modelsJson = await modelsRes.json()
    expect(modelsJson.models.length).toBeGreaterThan(0)
  })

  it('should support presigned image upload and direct R2 storage', async () => {
    const staffJwt = generateValidJwt('staff')
    
    // 1. Get presigned upload URL
    const presignReq = new Request('http://localhost/api/images/presign', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${staffJwt}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        filename: 'bill.png',
        type: 'image/png',
        orderId: 'order-111'
      })
    })

    const presignRes = await worker.fetch(presignReq, mockEnv as any, {} as any)
    expect(presignRes.status).toBe(200)
    const { url, method, key } = await presignRes.json()
    expect(url).toContain('/api/images/upload?token=')
    expect(method).toBe('PUT')
    expect(key).toContain('orders/order-111/')

    // 2. Upload binary payload using the returned presigned URL
    const uploadReq = new Request(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': '3'
      },
      body: new Uint8Array([1, 2, 3]).buffer
    })

    const uploadRes = await worker.fetch(uploadReq, mockEnv as any, {} as any)
    expect(uploadRes.status).toBe(200)
    const uploadJson = await uploadRes.json()
    expect(uploadJson.ok).toBe(true)
    expect(uploadJson.key).toBe(key)

    expect(mockEnv.BUCKET.put).toHaveBeenCalledWith(
      key,
      expect.any(ArrayBuffer),
      expect.objectContaining({ httpMetadata: { contentType: 'image/png' } })
    )
  })

  it('should enforce size and type constraints on direct uploads', async () => {
    const staffJwt = generateValidJwt('staff')

    // 1. Unsupported mime-type
    const presignReq = new Request('http://localhost/api/images/presign', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${staffJwt}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        filename: 'document.pdf',
        type: 'application/pdf',
        orderId: 'order-111'
      })
    })
    const presignRes = await worker.fetch(presignReq, mockEnv as any, {} as any)
    expect(presignRes.status).toBe(400)

    // 2. Upload exceeding 5MB size limit
    const presignReqOk = new Request('http://localhost/api/images/presign', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${staffJwt}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        filename: 'large.jpg',
        type: 'image/jpeg',
        orderId: 'order-111'
      })
    })
    const presignResOk = await worker.fetch(presignReqOk, mockEnv as any, {} as any)
    const { url } = await presignResOk.json()

    const largeUploadReq = new Request(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': (6 * 1024 * 1024).toString()
      },
      body: new Uint8Array(6 * 1024 * 1024).buffer // 6MB
    })
    const largeRes = await worker.fetch(largeUploadReq, mockEnv as any, {} as any)
    expect(largeRes.status).toBe(413)
  })

  it('should forward Sheets sync tasks to Cloudflare Queue', async () => {
    const staffJwt = generateValidJwt('staff')
    const syncReq = new Request('http://localhost/api', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${staffJwt}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'saveOrder',
        id: 'order-999',
        data: { guest_count: 5 }
      })
    })

    const syncRes = await worker.fetch(syncReq, mockEnv as any, {} as any)
    expect(syncRes.status).toBe(202)
    const syncJson = await syncRes.json()
    expect(syncJson.status).toBe('pending')
    expect(mockEnv.SHEETS_QUEUE.send).toHaveBeenCalled()
  })

  it('should process Sheets sync queue batch and fetch GAS endpoint', async () => {
    const mockBatch = {
      messages: [
        { body: { action: 'saveOrder', id: 'order-999' } }
      ]
    }

    await worker.queue(mockBatch, mockEnv as any, {} as any)
    expect(fetchMock).toHaveBeenCalledWith(mockEnv.GAS_URL, expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ action: 'saveOrder', id: 'order-999' })
    }))
  })
})
