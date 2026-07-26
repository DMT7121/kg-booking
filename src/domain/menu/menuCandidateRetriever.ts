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
    .map(w => w[0])
    .join('')
}

export function retrieveMenuCandidates(input: MenuCandidateRetrievalInput): MenuCandidate[] {
  const { text, menus, limit = 15 } = input
  const normalizedText = normalizeString(text)
  if (!normalizedText) return []

  // Initialize MiniSearch Index
  const miniSearch = new MiniSearch({
    fields: ['name', 'cleanName', 'acronym', 'aliases'],
    storeFields: ['menuId', 'menuName', 'itemId', 'itemName', 'aliases'],
    searchOptions: {
      boost: { name: 2, acronym: 1.5, cleanName: 1 },
      fuzzy: 0.2,
      prefix: true
    }
  })

  const documents: any[] = []
  let docId = 1

  for (const menu of menus) {
    for (const item of menu.items) {
      const cleanName = normalizeString(item.name)
      const acronym = generateAcronym(item.name)
      const aliasesStr = (item.aliases || []).map(normalizeString).join(' ')

      documents.push({
        id: docId++,
        menuId: menu.menuId,
        menuName: menu.menuName,
        itemId: item.id || `item-${docId}`,
        itemName: item.name,
        cleanName,
        acronym,
        aliases: aliasesStr
      })
    }
  }

  if (documents.length === 0) return []

  miniSearch.addAll(documents)
  const searchResults = miniSearch.search(normalizedText)

  const candidates: MenuCandidate[] = []
  const textTokens = normalizedText.split(' ').filter(Boolean)

  for (const res of searchResults) {
    const matchedBy: Array<'exact' | 'alias' | 'token' | 'fuzzy' | 'bm25'> = []

    const cleanItemName = normalizeString(res.itemName)
    if (normalizedText.includes(cleanItemName)) {
      matchedBy.push('exact')
    }

    if (res.aliases) {
      const aliasList = res.aliases.split(' ')
      for (const a of aliasList) {
        if (a && normalizedText.includes(a)) {
          matchedBy.push('alias')
          break
        }
      }
    }

    const itemTokens = cleanItemName.split(' ')
    const hasTokenOverlap = itemTokens.some(t => textTokens.includes(t))
    if (hasTokenOverlap) {
      matchedBy.push('token')
    }

    matchedBy.push('fuzzy', 'bm25')

    candidates.push({
      menuId: res.menuId,
      menuName: res.menuName,
      itemId: res.itemId,
      itemName: res.itemName,
      aliases: res.aliases ? res.aliases.split(' ') : [],
      score: parseFloat(Math.min(1.0, res.score / 10).toFixed(2)),
      matchedBy
    })
  }


  // Fallback Rule-Based Candidate Search if MiniSearch returns few results
  if (candidates.length < limit) {
    for (const menu of menus) {
      for (const item of menu.items) {
        const normalizedName = normalizeString(item.name)
        if (normalizedText.includes(normalizedName) && normalizedName.length > 2) {
          const exists = candidates.some(c => c.itemName === item.name)
          if (!exists) {
            candidates.push({
              menuId: menu.menuId,
              menuName: menu.menuName,
              itemId: item.id,
              itemName: item.name,
              aliases: item.aliases,
              score: 0.95,
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

