import MiniSearch from 'minisearch'
import { stripAccents } from '@/utils'
import type { MenuCandidate, PromptProfile } from '../ai/promptBuilder'

export interface MenuCandidateRetrievalInput {
  text: string
  menus: Array<{
    menuId: string
    menuName: string
    items: Array<{
      id?: string
      name: string
      aliases?: string[]
      category?: string
      price?: number
    }>
  }>
  limit?: number
}

function normalizeString(str: string): string {
  return stripAccents(str || '')
    .toLowerCase()
    .replace(/[^\p{L}\d\s]/gu, '') // Keep letters and digits, strip punctuation
    .replace(/\s+/g, ' ')
    .trim()
}

function generateAcronym(name: string): string {
  return normalizeString(name)
    .split(' ')
    .filter(Boolean)
    .map(w => (/^\d+$/.test(w) ? w : w[0]))
    .join('')
}

function expandSetAndComboShorthands(normText: string): string {
  let expanded = normText
  expanded = expanded.replace(/\b(?:sm|set\s*menu|set)\s*0*([1-9]|1[0-5])\b/gi, '$& set menu $1 sm$1')
  expanded = expanded.replace(/\b(?:cc|combo\s*couple|couple|combo\s*2\s*nguoi|combo)\s*0*([1-9]|1[01])\b/gi, '$& combo couple $1 cc$1')
  return expanded
}

const MENU_SEARCH_STOP_WORDS = new Set([
  'dat', 'ban', 'nguoi', 'pax', 'khach', 'sdt', 'dien', 'thoai', 'ngay', 'gio', 'phut',
  'toi', 'mai', 'hom', 'nay', 'sang', 'trua', 'chieu', 'dem', 'tuan', 'thang', 'nam',
  'sinh', 'nhat', 'thoi', 'noi', 'day', 'thang', 'happy', 'birthday', 'hbd', 'hpbd', 'chuc', 'mung',
  'coc', 'ck', 'chuyen', 'khoan', 'bill', 'bank', 'banking', 'momo', 'tien',
  'anh', 'chi', 'em', 'bac', 'chu', 'co', 'ong', 'ba', 'be', 'khach', 'minh', 'toi',
  'le', 'tan', 'nhan', 'vien', 'giup', 'cho', 'nhe', 'nha', 'lien', 'he', 'so',
  'trang', 'tri', 'tong', 'mau', 'tone', 'color', 'guong', 'bang', 'chu', 'bong', 'bay', 'hoa', 'tuoi', 'lua',
  'ghe', 'baby', 'chair', 'phong', 'vip', 'khu', 'view', 'ban', 'cong', 'rooftop', 'san', 'thuong',
  'khau', 'vi', 'cay', 'di', 'ung', 'dau', 'phong', 'lac', 'an', 'chay', 'diet',
  'thu', 'hai', 'ba', 'tu', 'sau', 'bay', 'nhat'
])

let _cachedMiniSearch: MiniSearch | null = null
let _cachedFingerprint = ''

function computeMenuFingerprint(menus: any[]): string {
  if (!Array.isArray(menus) || menus.length === 0) return 'empty'
  return menus
    .map(m => {
      const items = m.items || []
      const first = items[0]?.name || ''
      const last = items[items.length - 1]?.name || ''
      const aliasCount = items.reduce((acc: number, it: any) => acc + (Array.isArray(it?.aliases) ? it.aliases.length : 0), 0)
      return `${m.menuId}:${items.length}:${aliasCount}:${first}:${last}`
    })
    .join('|')
}

export function retrieveMenuCandidates(input: MenuCandidateRetrievalInput): MenuCandidate[] {
  const { text, menus, limit = 15 } = input
  const rawNormText = normalizeString(text)
  if (!rawNormText || !menus || menus.length === 0) return []
  const normalizedText = expandSetAndComboShorthands(rawNormText)
  const primaryMenuId = menus[0]?.menuId || ''

  // Reuse cached MiniSearch if menu has not changed
  const fingerprint = computeMenuFingerprint(menus)
  let miniSearch = _cachedMiniSearch

  if (!miniSearch || _cachedFingerprint !== fingerprint) {
    miniSearch = new MiniSearch({
      fields: ['name', 'cleanName', 'acronym', 'aliases'],
      storeFields: ['menuId', 'menuName', 'itemId', 'itemName', 'acronym', 'aliases', 'rawAliases', 'price'],
      searchOptions: {
        boost: { name: 2.5, cleanName: 1.5, aliases: 2, acronym: 0.8 },
        fuzzy: 0.15,
        prefix: true
      }
    })

    const documents: any[] = []
    let docId = 1

    for (const menu of menus) {
      for (const item of (menu.items || [])) {
        if (!item?.name) continue
        const cleanName = normalizeString(item.name)
        const acronym = generateAcronym(item.name)
        const rawAliases = Array.isArray(item.aliases) ? item.aliases.filter(Boolean) : []
        const aliasesStr = rawAliases.map(normalizeString).filter(Boolean).join(' ')

        documents.push({
          id: docId++,
          menuId: menu.menuId,
          menuName: menu.menuName,
          itemId: item.id || `item-${docId}`,
          name: item.name,
          itemName: item.name,
          cleanName,
          acronym,
          aliases: aliasesStr,
          rawAliases,
          price: item.price
        })
      }
    }

    if (documents.length > 0) {
      miniSearch.addAll(documents)
    }

    _cachedMiniSearch = miniSearch
    _cachedFingerprint = fingerprint
  }

  if (!miniSearch || (miniSearch as any).documentCount === 0) return []

  // Filter text tokens to remove general booking noise before searching (keep digits like 1..15)
  const textTokens = normalizedText
    .split(' ')
    .filter(t => (t.length > 1 || /^\d+$/.test(t)) && !MENU_SEARCH_STOP_WORDS.has(t))

  const searchQuery = textTokens.join(' ')
  if (!searchQuery) return []

  const searchResults = miniSearch.search(searchQuery)

  const candidates: MenuCandidate[] = []

  for (const res of searchResults) {
    const matchedBy: Array<'exact' | 'alias' | 'token' | 'fuzzy' | 'bm25'> = []

    const cleanItemName = normalizeString(res.itemName)
    const itemTokens = cleanItemName.split(' ').filter(t => t.length > 1 || /^\d+$/.test(t))

    // Check exact match (ensure numbered Set/Combo matches exact trailing number boundary)
    const exactRegex = new RegExp(`(?:^|\\s)${cleanItemName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`, 'i')
    if (cleanItemName && exactRegex.test(normalizedText)) {
      matchedBy.push('exact')
    }

    // Check full multi-word alias & acronym match
    const rawAliasList: string[] = Array.isArray(res.rawAliases) ? res.rawAliases : []
    for (const rawAlias of rawAliasList) {
      const aNorm = normalizeString(rawAlias)
      if (!aNorm || aNorm.length < 2) continue
      const aliasRegex = new RegExp(`(?:^|\\s)${aNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`, 'i')
      if (aliasRegex.test(normalizedText) || (aNorm.length >= 4 && normalizedText.includes(aNorm))) {
        matchedBy.push('alias')
        break
      }
    }
    if (!matchedBy.includes('alias') && typeof res.acronym === 'string' && res.acronym.length >= 2) {
      const acrNorm = res.acronym.toLowerCase()
      const acrRegex = new RegExp(`(?:^|\\s)${acrNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`, 'i')
      if (acrRegex.test(normalizedText)) {
        matchedBy.push('alias')
      }
    }

    // Check meaningful token overlap
    const hasMeaningfulToken = itemTokens.some(t => t.length >= 3 && textTokens.includes(t))
    if (hasMeaningfulToken) {
      matchedBy.push('token')
    }

    // Only include candidate if there is genuine exact/alias/token match or strong search score >= 2.0
    if (matchedBy.length === 0 && res.score < 2.0) {
      continue
    }

    matchedBy.push('fuzzy', 'bm25')

    const activeMenuBoost = res.menuId === primaryMenuId ? 0.05 : 0
    const baseScore = matchedBy.includes('exact')
      ? Math.max(0.95, res.score / 10)
      : matchedBy.includes('alias')
        ? Math.max(0.88, res.score / 10)
        : res.score / 10

    candidates.push({
      menuId: res.menuId,
      menuName: res.menuName,
      itemId: res.itemId,
      itemName: res.itemName,
      aliases: rawAliasList,
      price: typeof res.price === 'number' ? res.price : undefined,
      score: parseFloat(Math.min(1.0, baseScore + activeMenuBoost).toFixed(2)),
      matchedBy
    })
  }


  // Fallback Rule-Based Candidate Search if MiniSearch returns few results
  if (candidates.length < limit) {
    for (const menu of menus) {
      for (const item of menu.items) {
        if (!item?.name) continue
        const normalizedName = normalizeString(item.name)
        if (normalizedName.length > 2 && normalizedText.includes(normalizedName)) {
          const exists = candidates.some(c => c.menuId === menu.menuId && c.itemName === item.name)
          if (!exists) {
            const activeMenuBoost = menu.menuId === primaryMenuId ? 0.04 : 0
            candidates.push({
              menuId: menu.menuId,
              menuName: menu.menuName,
              itemId: item.id,
              itemName: item.name,
              aliases: item.aliases,
              price: item.price,
              score: parseFloat(Math.min(1.0, 0.95 + activeMenuBoost).toFixed(2)),
              matchedBy: ['exact']
            })
          }
        }
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score)

  const uniqueCandidates: MenuCandidate[] = []
  const seenItems = new Set<string>()
  for (const cand of candidates) {
    const key = `${cand.menuId}:${cand.itemName}`
    if (!seenItems.has(key)) {
      seenItems.add(key)
      uniqueCandidates.push(cand)
    }
  }

  return uniqueCandidates.slice(0, limit)
}

