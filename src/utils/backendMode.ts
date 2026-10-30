import { resolveSupabaseUrl } from '@/config/endpoints'

let _resolvedMode: 'gas' | 'postgres' | 'dual_write' | null = null

export function getBackendMode(): 'gas' | 'postgres' | 'dual_write' {
  if (_resolvedMode && import.meta.env.MODE !== 'test') return _resolvedMode

  const defaultMode = import.meta.env.MODE === 'test' ? 'postgres' : 'dual_write'
  const mode = import.meta.env.VITE_BACKEND_MODE || defaultMode

  // If dual_write or postgres mode but Supabase not configured, fall back to gas
  if (mode !== 'gas') {
    const supabaseUrl = resolveSupabaseUrl()
    if (!supabaseUrl) {
      console.warn(`[Backend] VITE_BACKEND_MODE="${mode}" but VITE_SUPABASE_URL not set. Falling back to GAS mode.`)
      _resolvedMode = 'gas'
      return 'gas'
    }
  }

  if (mode === 'postgres' || mode === 'dual_write' || mode === 'gas') {
    _resolvedMode = mode
    return mode
  }
  _resolvedMode = defaultMode
  return defaultMode
}

export function clearResolvedMode(): void {
  _resolvedMode = null
}
