/**
 * Centralized endpoint configuration.
 * Single source of truth for all API URLs and shared secrets.
 * Previously these were hardcoded/duplicated across gasClient.ts, outboxSync.ts, and api.ts.
 */

/** API Gateway URL (Cloudflare Worker or local Vite proxy) */
export const API_GATEWAY_URL = import.meta.env.VITE_API_URL || '/api'

/** Google Apps Script direct URL (fallback) */
export const GAS_DIRECT_URL = import.meta.env.VITE_GAS_URL ||
  'https://script.google.com/macros/s/AKfycbxzjio4sat5fWoUncPgp8SfjoGqfGxW5vFoDgkHvBI3OKVWIaszsAaUt0LE2fCHtkCFsA/exec'

/** Shared secret for API Gateway authentication */
export const SHARED_SECRET = import.meta.env.VITE_APP_SHARED_SECRET || ''

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
