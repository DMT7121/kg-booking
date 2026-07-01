export type AITransportPolicy = 'local_only' | 'local_first' | 'gateway_first' | 'gateway_only'

export interface ErrorClassification {
  action: 'retry_next_key' | 'cooldown_key' | 'cooldown_model' | 'fatal_no_retry' | 'switch_transport' | 'abort'
  cooldownMs?: number
  reason: string
}

export function classifyError(status: number | undefined, message: string): ErrorClassification {
  const msg = message.toLowerCase()
  
  if (msg.includes('abort') || msg.includes('cancelled') || msg.includes('user abort')) {
    return { action: 'abort', reason: 'User aborted' }
  }
  
  // Cloudflare Turnstile block or keyless 403
  if (msg.includes('turnstile') || msg.includes('missing turnstile token')) {
    return { action: 'switch_transport', reason: 'Cloudflare Turnstile block' }
  }
  
  if (status === 401 || status === 403 || msg.includes('unauthorized') || msg.includes('invalid api key') || msg.includes('invalid_key')) {
    return { action: 'retry_next_key', reason: 'Invalid API Key / Unauthorized' }
  }
  
  if (status === 429 || msg.includes('rate limit') || msg.includes('quota') || msg.includes('resource_exhausted') || msg.includes('too many requests')) {
    return { action: 'cooldown_key', cooldownMs: 60000, reason: 'Rate Limit / Quota Exceeded' }
  }
  
  if (status === 404 || msg.includes('not found') || msg.includes('model not found')) {
    return { action: 'cooldown_model', cooldownMs: 15 * 60 * 1000, reason: 'Model Not Found' }
  }
  
  if (status === 400 || msg.includes('bad request') || msg.includes('invalid format') || msg.includes('schema')) {
    return { action: 'fatal_no_retry', reason: 'Invalid Request Payload / Bad Request' }
  }
  
  if (status === 402 || msg.includes('payment') || msg.includes('billing') || msg.includes('balance')) {
    return { action: 'retry_next_key', reason: 'Billing / Payment Required' }
  }

  // CORS, Network failures, 5xx, or timeouts
  return { action: 'switch_transport', reason: 'Network, CORS, or Timeout' }
}
