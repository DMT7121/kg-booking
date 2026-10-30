/**
 * Centralized endpoint configuration.
 * Single source of truth for all API URLs and shared secrets.
 * Previously these were hardcoded/duplicated across gasClient.ts, outboxSync.ts, and api.ts.
 */

const PRODUCTION_AI_GATEWAY_URL = 'https://kg-ai-gateway.dmt-kgwork.workers.dev'
const PRODUCTION_GAS_URL =
  'https://script.google.com/macros/s/AKfycbxzjio4sat5fWoUncPgp8SfjoGqfGxW5vFoDgkHvBI3OKVWIaszsAaUt0LE2fCHtkCFsA/exec'
const PRODUCTION_R2_URL = 'https://kg-images.dmt-kgwork.workers.dev'
const PRODUCTION_SUPABASE_URL = 'https://azfkzheypuvfcitckovf.supabase.co'
const PRODUCTION_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6Zmt6aGV5cHV2ZmNpdGNrb3ZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwNzc1MjEsImV4cCI6MjEwMDY1MzUyMX0.ltnY7GTzKGE7QiWTv8ZuDlfT_NWIR2sGfGudoVDw4NQ'
const PRODUCTION_CUSTOMER_BOOKING_URL = 'https://datban-kingsgrill.pages.dev'

export function resolveSupabaseUrl(): string {
  const configured = (import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '')
  if (configured) return configured
  if (import.meta.env.MODE === 'test') return ''
  return PRODUCTION_SUPABASE_URL
}

export function resolveSupabaseAnonKey(): string {
  const configured = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()
  if (configured) return configured
  if (import.meta.env.MODE === 'test') return ''
  return PRODUCTION_SUPABASE_ANON_KEY
}

export function resolveR2Url(): string {
  const configured = (import.meta.env.VITE_R2_URL || '').trim().replace(/\/$/, '')
  if (configured) return configured
  if (import.meta.env.MODE === 'test') return ''
  return PRODUCTION_R2_URL
}

export function resolveAiGatewayUrl(): string {
  const configured = (import.meta.env.VITE_AI_GATEWAY_URL || '').trim().replace(/\/$/, '')
  if (configured) return configured
  if (import.meta.env.MODE === 'test') return ''
  return PRODUCTION_AI_GATEWAY_URL
}

export function resolveAiMode(): 'direct' | 'gateway' {
  const configured = (import.meta.env.VITE_AI_MODE || '').trim()
  if (configured === 'direct' || configured === 'gateway') return configured
  if (import.meta.env.MODE === 'test') return 'direct'
  return 'gateway'
}

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
  const aiGateway = resolveAiGatewayUrl()
  if (aiGateway) {
    return `${aiGateway}/api`
  }
  return `${PRODUCTION_AI_GATEWAY_URL}/api`
}

/** API Gateway URL (Cloudflare Worker or local Vite proxy) */
export const API_GATEWAY_URL = resolveApiGatewayUrl()

function cleanGasUrl(url: string): string {
  if (!url) return ''
  return url.replace(/\/macros\/u\/\d+\/s\//, '/macros\/s/').trim()
}

/** Google Apps Script direct URL (fallback) */
export const GAS_DIRECT_URL = cleanGasUrl(
  import.meta.env.VITE_GAS_URL || PRODUCTION_GAS_URL
)

/** Shared secret for API Gateway authentication */
export const SHARED_SECRET = import.meta.env.VITE_APP_SHARED_SECRET || 'kg_booking_secret_token_2026'

/** R2 image storage URL */
export const R2_URL = resolveR2Url()

/** AI Gateway URL */
export const AI_GATEWAY_URL = resolveAiGatewayUrl()

/** Customer online booking portal URL */
export const CUSTOMER_BOOKING_URL = (
  import.meta.env.VITE_CUSTOMER_BOOKING_URL || PRODUCTION_CUSTOMER_BOOKING_URL
).trim()

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
