import { describe, it, expect } from 'vitest'
import { signRequest } from '../security'

describe('Request Security Signing Tests', () => {
  it('should generate a signature that matches timing-safe requirements', async () => {
    const key = 'secret_test_signing_key'
    const body = JSON.stringify({ model: 'gemini-1.5', provider: 'google', prompt: 'test' })
    const path = '/api/ai/analyze'
    
    const signed = await signRequest('POST', path, body, key, 'token_id')
    
    expect(signed.timestamp).toBeGreaterThan(0)
    expect(signed.nonce.length).toBeGreaterThan(5)
    expect(signed.signature.length).toBeGreaterThan(10)
    expect(signed.keyId).toBe('token_id')
    
    // Ensure signature changes if body changes
    const signed2 = await signRequest('POST', path, body + ' ', key, 'token_id')
    expect(signed.signature).not.toBe(signed2.signature)
  })
})
