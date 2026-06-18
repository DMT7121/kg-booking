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

export function retrieveMenuCandidates(input: MenuCandidateRetrievalInput): MenuCandidate[] {
  const { text, menus, limit = 15 } = input
  const normalizedText = normalizeString(text)
  if (!normalizedText) return []

  const textTokens = normalizedText.split(' ').filter(Boolean)
  const candidates: MenuCandidate[] = []

  for (const menu of menus) {
    for (const item of menu.items) {
      const normalizedName = normalizeString(item.name)
      const nameTokens = normalizedName.split(' ').filter(Boolean)
      
      let score = 0
      const matchedBy: Array<'exact' | 'alias' | 'token' | 'fuzzy' | 'bm25'> = []

      // 1. Exact phrase match
      if (normalizedText.includes(normalizedName) && normalizedName.length > 2) {
        score += 1.0
        matchedBy.push('exact')
      }

      // 2. Aliases match
      if (item.aliases && item.aliases.length > 0) {
        let matchedAlias = false
        for (const alias of item.aliases) {
          const normalizedAlias = normalizeString(alias)
          if (normalizedAlias && normalizedText.includes(normalizedAlias)) {
            score += 0.8
            matchedAlias = true
          }
        }
        if (matchedAlias) {
          matchedBy.push('alias')
        }
      }

      // 3. Token Overlap
      let overlapCount = 0
      for (const token of nameTokens) {
        if (textTokens.includes(token)) {
          overlapCount++
        }
      }
      if (overlapCount > 0 && nameTokens.length > 0) {
        const overlapRatio = overlapCount / nameTokens.length
        if (overlapRatio >= 0.4) {
          score += 0.6 * overlapRatio
          matchedBy.push('token')
        }
      }

      // 4. BM25 / Frequency-like scoring helper (token frequency match)
      let wordMatchCount = 0
      for (const token of textTokens) {
        if (nameTokens.includes(token)) {
          wordMatchCount++
        }
      }
      if (wordMatchCount > 0) {
        score += 0.2 * Math.min(wordMatchCount, 3)
        matchedBy.push('bm25')
      }

      if (score > 0) {
        candidates.push({
          menuId: menu.menuId,
          menuName: menu.menuName,
          itemId: item.id,
          itemName: item.name,
          aliases: item.aliases,
          score: parseFloat(score.toFixed(2)),
          matchedBy
        })
      }
    }
  }

  // Sort candidates by score descending
  candidates.sort((a, b) => b.score - a.score)

  // Remove duplicate items (if the same item matches multiple rules, keep highest score)
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
