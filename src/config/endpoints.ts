/**
 * Centralized endpoint configuration.
 * Single source of truth for all API URLs and shared secrets.
 * Previously these were hardcoded/duplicated across gasClient.ts, outboxSync.ts, and api.ts.
 */

function resolveApiGatewayUrl(): string {
  // In development, always use local Vite proxy '/api' to leverage localApiServer middleware
  if (import.meta.env.DEV) {
    return '/api'
  }
  // In production, if explicitly configured with an absolute URL, use it
  const configured = (import.meta.env.VITE_API_URL || '').trim()
  if (configured && (configured.startsWith('http://') || configured.startsWith('https://'))) {
    return configured
  }
  // In production, relative '/api' fails on Cloudflare Pages with HTTP 405 Method Not Allowed.
  // Fallback to deployed Cloudflare Worker Edge Gateway endpoint!
  const aiGateway = (import.meta.env.VITE_AI_GATEWAY_URL || '').trim().replace(/\/$/, '')
  if (aiGateway) {
    return `${aiGateway}/api`
  }
  return 'https://kg-ai-gateway.dmt-kgwork.workers.dev/api'
}

/** API Gateway URL (Cloudflare Worker or local Vite proxy) */
export const API_GATEWAY_URL = resolveApiGatewayUrl()

function cleanGasUrl(url: string): string {
  if (!url) return ''
  return url.replace(/\/macros\/u\/\d+\/s\//, '/macros/s/').trim()
}

/** Google Apps Script direct URL (fallback) */
export const GAS_DIRECT_URL = cleanGasUrl(
  import.meta.env.VITE_GAS_URL ||
  'https://script.google.com/macros/s/AKfycbxzjio4sat5fWoUncPgp8SfjoGqfGxW5vFoDgkHvBI3OKVWIaszsAaUt0LE2fCHtkCFsA/exec'
)

/** Shared secret for API Gateway authentication */
export const SHARED_SECRET = import.meta.env.VITE_APP_SHARED_SECRET || 'kg_booking_secret_token_2026'

/** R2 image storage URL */
export const R2_URL = import.meta.env.VITE_R2_URL || ''

/** AI Gateway URL */
export const AI_GATEWAY_URL = import.meta.env.VITE_AI_GATEWAY_URL || ''

/** Build common headers for API Gateway requests */
export function buildGatewayHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (SHARED_SECRET) {
    headers['Authorization'] = `Bearer ${SHARED_SECRET}`
  }
  return headers
}

/** Build headers for direct GAS requests */
export function buildGASHeaders(): Record<string, string> {
  return { 'Content-Type': 'text/plain;charset=utf-8' }
}
