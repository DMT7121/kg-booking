export const PRIMARY_MENU_SHEET = 'MENU2026'

const EXACT_INVALID_MENU_SHEETS = new Set([
  'menu',
  'thuc_don',
  'alias',
  'aliases',
  'menu_alias',
  'menu_aliases',
  'ai_correction',
  'ai_corrections',
  'config',
  'system_config',
  'system_config_backup',
  'system_config_old_backup',
  'orders',
  'api_keys',
  'audit_log',
  'webhook_logs',
  'booking_location_index',
  'booking_location_history',
  'sheet1',
  'sheet2',
  'sheet3',
  'trang_tinh1',
  'trang_tinh2',
  'trang_tinh3'
])

const BLOCKED_SUBSTRINGS = [
  'menu_alias',
  'ai_correction',
  'system_config',
  'booking_location',
  'webhook_log',
  'audit_log',
  'api_key',
  'trang_tinh'
]

function normalizeSheetKey(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[\s\-_]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/**
 * Validates whether a sheet/profile name represents a real customer-facing menu
 * rather than an internal system/config/alias/scratch table (e.g. "Menu_Aliases", "Trang tính2").
 */
export function isValidMenuSheetName(name: unknown): name is string {
  if (typeof name !== 'string') return false
  const trimmed = name.trim()
  if (!trimmed) return false
  if (trimmed.toUpperCase().startsWith('[RS]')) return false
  if (/^(sheet|trang[\s_]*tinh|trang[\s_]*tính)\s*\d*$/i.test(trimmed)) return false

  const norm = normalizeSheetKey(trimmed)
  if (!norm) return false
  if (EXACT_INVALID_MENU_SHEETS.has(norm)) return false

  for (const blocked of BLOCKED_SUBSTRINGS) {
    if (norm.includes(blocked)) return false
  }

  return true
}

/**
 * Normalizes a valid menu sheet name, ensuring any casing variant of "MENU2026"
 * ("menu2026", "Menu2026") resolves to canonical "MENU2026".
 */
export function normalizeMenuSheetName(name: string): string {
  const trimmed = String(name || '').trim()
  if (!trimmed) return PRIMARY_MENU_SHEET
  if (trimmed.toUpperCase() === PRIMARY_MENU_SHEET) return PRIMARY_MENU_SHEET
  return trimmed
}

/**
 * Filters, deduplicates, and prioritizes valid menu sheet names so that "MENU2026"
 * is ALWAYS placed first (index 0) whenever present.
 */
export function filterValidMenuSheets(sheets: unknown): string[] {
  if (!Array.isArray(sheets)) return []
  const seenLower = new Set<string>()
  const others: string[] = []
  let hasPrimary = false

  for (const raw of sheets) {
    if (!isValidMenuSheetName(raw)) continue
    const clean = normalizeMenuSheetName(raw)
    const lower = clean.toLowerCase()
    if (seenLower.has(lower)) continue
    seenLower.add(lower)

    if (clean === PRIMARY_MENU_SHEET) {
      hasPrimary = true
    } else {
      others.push(clean)
    }
  }

  return hasPrimary ? [PRIMARY_MENU_SHEET, ...others] : others
}

/**
 * Filters valid menu sheets and guarantees "MENU2026" is present at index 0.
 */
export function prioritizeMenuSheets(sheets: unknown, ensurePrimary: boolean = true): string[] {
  const filtered = filterValidMenuSheets(sheets)
  if (!ensurePrimary) return filtered
  if (filtered[0] === PRIMARY_MENU_SHEET) return filtered
  return [PRIMARY_MENU_SHEET, ...filtered.filter(s => s !== PRIMARY_MENU_SHEET)]
}

/**
 * Guards against corrupted/poisoned menu datasets (such as Menu_Aliases rows cached
 * under a menu key where 100% of items have explicit price === 0).
 */
export function isValidMenuItemsDataset(items: unknown): boolean {
  if (!Array.isArray(items) || items.length === 0) return false
  let namedCount = 0
  let explicitPriceCount = 0
  let pricedCount = 0
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const name = String((item as any).name || '').trim()
    if (!name) continue
    namedCount++
    const rawPrice = (item as any).price
    if (rawPrice !== undefined && rawPrice !== null && rawPrice !== '') {
      explicitPriceCount++
      if (Number(rawPrice) > 0) {
        pricedCount++
      }
    }
  }
  if (namedCount === 0) return false
  if (explicitPriceCount > 0 && pricedCount === 0) return false
  return true
}
