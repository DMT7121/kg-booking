import MiniSearch from 'minisearch'
import { get, set, del } from 'idb-keyval'
import { jaroWinklerDistance } from '@/domain/menu/menuMatcher'
import { cleanPhoneNumber, stripAccents } from '@/utils'

/**
 * FNV-1a 32-bit hash algorithm for quick string fingerprinting
 */
export function hashString(str: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)
  }
  return (h >>> 0).toString(16)
}

export interface BookingEntities {
  name: string | null
  phone: string | null
  date: string | null
  time: string | null
  guestCount: number | null
  menuItems: { name: string; qty: number }[]
}

export interface SemanticCacheEntry<T = unknown> {
  id: string
  normalizedText: string
  entitySignature: string
  value: T
  createdAt: number
  expiresAt: number
  menuFingerprint: string
  correctionFingerprint?: string
  promptSchemaVersion: number
  normalizerSchemaVersion: number
  modelProfile?: string
}

const SEMANTIC_CACHE_DB_KEY = 'kg_semantic_cache_entries'
let memoryEntries: SemanticCacheEntry[] = []
let isHydrated = false
let miniSearchInstance: MiniSearch<SemanticCacheEntry> | null = null

function getMiniSearch() {
  if (!miniSearchInstance) {
    miniSearchInstance = new MiniSearch({
      fields: ['normalizedText', 'entitySignature'],
      storeFields: [
        'id',
        'entitySignature',
        'menuFingerprint',
        'promptSchemaVersion',
        'normalizerSchemaVersion',
        'expiresAt'
      ],
      searchOptions: {
        boost: { entitySignature: 3, normalizedText: 1 },
        fuzzy: 0.2,
        prefix: true
      }
    })
  }
  return miniSearchInstance
}

export function extractEntitiesFromInput(
  ruleBasedResult: any,
  hardEntities: any
): BookingEntities {
  const name = ruleBasedResult?.customer_name || null
  const phone = ruleBasedResult?.phone || null
  
  let date = ruleBasedResult?.event_date || null
  if (!date && hardEntities?.dates?.length > 0) {
    date = hardEntities.dates[0].value
  }
  
  let time = ruleBasedResult?.event_time || null
  if (!time && hardEntities?.times?.length > 0) {
    time = hardEntities.times[0].value
  }
  
  let guestCount = ruleBasedResult?.guest_count || null
  if (guestCount === null && hardEntities?.guestCounts?.length > 0) {
    guestCount = hardEntities.guestCounts[0].value
  }
  
  const rawMenuItems = ruleBasedResult?.menu_items || []
  const menuItems = rawMenuItems.map((item: any) => {
    const itemName = typeof item === 'string' ? item : (item.name || item.raw_name || '')
    const itemQty = typeof item === 'string' ? 1 : (item.quantity || item.qty || 1)
    return {
      name: stripAccents(itemName).toLowerCase().trim(),
      qty: Number(itemQty)
    }
  }).filter((i: any) => i.name.length > 0)
  .sort((a: any, b: any) => a.name.localeCompare(b.name))

  return {
    name: name ? stripAccents(name).toLowerCase().trim() : null,
    phone: phone ? cleanPhoneNumber(phone) : null,
    date,
    time,
    guestCount: guestCount ? Number(guestCount) : null,
    menuItems
  }
}

export function buildEntitySignature(entities: BookingEntities): string {
  const menuStr = entities.menuItems.map(i => `${i.name}:${i.qty}`).join(',')
  return `name:${entities.name || ''}|phone:${entities.phone || ''}|date:${entities.date || ''}|time:${entities.time || ''}|pax:${entities.guestCount || ''}|menu:[${menuStr}]`
}

export function parseSignatureToEntities(signature: string): BookingEntities {
  const parts = signature.split('|')
  const entities: BookingEntities = {
    name: null,
    phone: null,
    date: null,
    time: null,
    guestCount: null,
    menuItems: []
  }
  
  for (const part of parts) {
    const colonIdx = part.indexOf(':')
    if (colonIdx === -1) continue
    const key = part.substring(0, colonIdx)
    const value = part.substring(colonIdx + 1)
    
    if (key === 'name') entities.name = value || null
    else if (key === 'phone') entities.phone = value || null
    else if (key === 'date') entities.date = value || null
    else if (key === 'time') entities.time = value || null
    else if (key === 'pax') entities.guestCount = value ? Number(value) : null
    else if (key === 'menu') {
      const match = part.match(/menu:\[(.*)\]/)
      if (match && match[1]) {
        const itemParts = match[1].split(',').filter(Boolean)
        entities.menuItems = itemParts.map(ip => {
          const cIdx = ip.lastIndexOf(':')
          return {
            name: ip.substring(0, cIdx),
            qty: Number(ip.substring(cIdx + 1))
          }
        })
      }
    }
  }
  return entities
}

export function canUseSemanticCache(
  newEntities: BookingEntities,
  cachedEntities: BookingEntities
): { allowed: boolean; reason?: string } {
  if (newEntities.phone !== cachedEntities.phone) {
    return { allowed: false, reason: 'phone_mismatch' }
  }
  if (newEntities.name !== cachedEntities.name) {
    return { allowed: false, reason: 'name_mismatch' }
  }
  if (newEntities.guestCount !== cachedEntities.guestCount) {
    return { allowed: false, reason: 'guest_count_mismatch' }
  }
  if (newEntities.time !== cachedEntities.time) {
    return { allowed: false, reason: 'time_mismatch' }
  }
  if (newEntities.date !== cachedEntities.date) {
    return { allowed: false, reason: 'date_mismatch' }
  }
  
  // Compare menu items:
  if (newEntities.menuItems.length !== cachedEntities.menuItems.length) {
    return { allowed: false, reason: 'menu_items_mismatch' }
  }
  for (let i = 0; i < newEntities.menuItems.length; i++) {
    const newItem = newEntities.menuItems[i]
    const cachedItem = cachedEntities.menuItems[i]
    if (newItem.name !== cachedItem.name || newItem.qty !== cachedItem.qty) {
      return { allowed: false, reason: 'menu_items_mismatch' }
    }
  }

  return { allowed: true }
}

export async function hydrateSemanticCache() {
  if (isHydrated) return
  try {
    const stored = await get<SemanticCacheEntry[]>(SEMANTIC_CACHE_DB_KEY)
    if (stored && Array.isArray(stored)) {
      const now = Date.now()
      memoryEntries = stored.filter(entry => entry.expiresAt > now)
      
      const ms = getMiniSearch()
      ms.removeAll()
      ms.addAll(memoryEntries)
    }
  } catch (e) {
    console.warn('[SemanticCache] Failed to hydrate cache:', e)
  }
  isHydrated = true
}

export async function querySemanticCache(
  inputText: string,
  newEntities: BookingEntities,
  options: {
    menuFingerprint: string
    correctionFingerprint?: string
    promptSchemaVersion: number
    normalizerSchemaVersion: number
  }
): Promise<SemanticCacheEntry | null> {
  await hydrateSemanticCache()
  
  const normText = stripAccents(inputText).toLowerCase().trim()
  const keyHash = hashString(normText).slice(0, 8)
  
  const ms = getMiniSearch()
  const results = ms.search(normText, {
    filter: (result) => {
      const entry = memoryEntries.find(e => e.id === result.id)
      if (!entry) return false
      if (entry.expiresAt <= Date.now()) return false
      if (entry.menuFingerprint !== options.menuFingerprint) return false
      if (entry.correctionFingerprint !== options.correctionFingerprint) return false
      if (entry.promptSchemaVersion !== options.promptSchemaVersion) return false
      if (entry.normalizerSchemaVersion !== options.normalizerSchemaVersion) return false
      return true
    }
  })
  
  if (!results || results.length === 0) {
    console.info('[SemanticCache] miss', { keyHash })
    return null
  }
  
  // Find the best match
  for (const match of results) {
    const entry = memoryEntries.find(e => e.id === match.id)
    if (!entry) continue
    
    const cachedEntities = parseSignatureToEntities(entry.entitySignature)
    const safetyCheck = canUseSemanticCache(newEntities, cachedEntities)
    
    // Similarity calculation (using Jaro-Winkler distance on text)
    const textSim = jaroWinklerDistance(normText, entry.normalizedText)
    
    if (safetyCheck.allowed && textSim >= 0.60) {
      console.info('[SemanticCache] hit', { keyHash: entry.id.slice(0, 8), similarity: textSim })
      return entry
    } else {
      const reason = !safetyCheck.allowed ? safetyCheck.reason : 'low_similarity'
      console.info('[SemanticCache] rejected', { 
        reason,
        similarity: textSim 
      })
    }
  }
  
  console.info('[SemanticCache] miss', { keyHash })
  return null
}

export async function saveToSemanticCache(entry: Omit<SemanticCacheEntry, 'id'>) {
  await hydrateSemanticCache()
  
  const id = hashString(entry.normalizedText)
  const fullEntry: SemanticCacheEntry = {
    ...entry,
    id
  }
  
  memoryEntries = memoryEntries.filter(e => e.id !== id)
  memoryEntries.push(fullEntry)
  
  if (memoryEntries.length > 300) {
    memoryEntries.shift()
  }
  
  const ms = getMiniSearch()
  ms.removeAll()
  ms.addAll(memoryEntries)
  
  try {
    await set(SEMANTIC_CACHE_DB_KEY, memoryEntries)
  } catch (e) {
    console.warn('[SemanticCache] Failed to save cache:', e)
  }
}

export async function clearSemanticCache() {
  memoryEntries = []
  const ms = getMiniSearch()
  if (ms) {
    ms.removeAll()
  }
  try {
    await del(SEMANTIC_CACHE_DB_KEY)
  } catch (e) {}
}
