export type AITransportPolicy = 'local_only' | 'local_first' | 'gateway_first' | 'gateway_only'

export interface ErrorClassification {
  action: 'retry_next_key' | 'cooldown_key' | 'cooldown_model' | 'retry_without_schema' | 'fatal_no_retry' | 'switch_transport' | 'abort'
  cooldownMs?: number
  reason: string
}

export function classifyError(status: number | undefined, message: string): ErrorClassification {
  const msg = (message || '').toLowerCase()
  
  if (msg.includes('abort') || msg.includes('cancelled') || msg.includes('user abort')) {
    return { action: 'abort', reason: 'User aborted' }
  }
  
  // Cloudflare Turnstile block or keyless 403
  if (msg.includes('turnstile') || msg.includes('missing turnstile token')) {
    return { action: 'switch_transport', reason: 'Cloudflare Turnstile block' }
  }
  
  // API Key invalid / expired / unauthorized (including Google Gemini HTTP 400 API_KEY_INVALID / "API key not valid")
  if (
    status === 401 ||
    status === 403 ||
    msg.includes('unauthorized') ||
    msg.includes('invalid api key') ||
    msg.includes('invalid_api_key') ||
    msg.includes('api_key_invalid') ||
    msg.includes('api key not valid') ||
    msg.includes('api key expired') ||
    msg.includes('key not valid') ||
    msg.includes('invalid_key') ||
    msg.includes('permission_denied') ||
    msg.includes('access token')
  ) {
    return { action: 'retry_next_key', reason: 'Invalid API Key / Unauthorized' }
  }
  
  // Rate limit or quota exhausted
  if (
    status === 429 ||
    msg.includes('rate limit') ||
    msg.includes('rate_limit') ||
    msg.includes('quota') ||
    msg.includes('resource_exhausted') ||
    msg.includes('too many requests')
  ) {
    return { action: 'cooldown_key', cooldownMs: 60000, reason: 'Rate Limit / Quota Exceeded' }
  }

  // Billing / insufficient balance (DeepSeek 402, OpenRouter 402, etc.)
  if (
    status === 402 ||
    msg.includes('payment') ||
    msg.includes('billing') ||
    msg.includes('insufficient balance') ||
    msg.includes('insufficient_quota') ||
    msg.includes('credit') ||
    msg.includes('balance')
  ) {
    return { action: 'retry_next_key', reason: 'Billing / Insufficient Balance' }
  }
  
  // Model not found or decommissioned (Groq returns HTTP 400 for model_decommissioned)
  if (
    status === 404 ||
    msg.includes('not found') ||
    msg.includes('model_not_found') ||
    msg.includes('decommissioned') ||
    msg.includes('does not exist') ||
    msg.includes('unsupported model')
  ) {
    return { action: 'cooldown_model', cooldownMs: 15 * 60 * 1000, reason: 'Model Not Found / Decommissioned' }
  }
  
  // Schema / response_format / thinkingConfig parameter rejection (HTTP 400) -> retry once without schema/json_object parameter
  if (
    status === 400 &&
    (msg.includes('response_format') ||
      msg.includes('json_schema') ||
      msg.includes('responseschema') ||
      msg.includes('thinkingconfig') ||
      msg.includes('schema') ||
      msg.includes('json_object') ||
      msg.includes('invalid_argument') ||
      msg.includes('invalid argument') ||
      msg.includes('bad request'))
  ) {
    return { action: 'retry_without_schema', reason: 'Provider rejected structured schema parameter' }
  }

  if (status === 400) {
    return { action: 'retry_next_key', reason: 'HTTP 400 Bad Request - Try next key or model' }
  }

  // CORS, Network failures, 5xx, or timeouts
  return { action: 'switch_transport', reason: 'Network, CORS, or Timeout' }
}

