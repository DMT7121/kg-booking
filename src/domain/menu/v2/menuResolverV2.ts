import { stripAccents } from '@/utils'
import { jaroWinklerDistance } from '../menuMatcher'

export interface MenuKnowledgeItem {
  id: string
  sku?: string
  canonicalName: string
  aliases: string[]
  normalizedAliases: string[]
  customerSlang?: string[]
  kitchenNames?: string[]
  category?: string
  unitPrice?: number
  available?: boolean
  tags?: string[]
}

export interface MenuResolutionCandidate {
  item: MenuKnowledgeItem
  score: number
  matchedTier: 'sku' | 'canonical' | 'alias' | 'accent' | 'token' | 'fuzzy'
  evidence: string
}

export interface MenuResolutionResult {
  acceptedItem: MenuKnowledgeItem | null
  confidence: number
  isAmbiguous: boolean
  needsReview: boolean
  candidates: MenuResolutionCandidate[]
  reason: string
}

export interface ConditionalMenuRequest {
  condition: string
  ifTrueAction: string
  ifFalseAction: string
  raw: string
}

export interface RecommendationIntent {
  query: string
  criteria: 'BEST_SELLER' | 'COMBO' | 'CHEF_SPECIAL' | 'RECOMMENDED' | string
  quantity: number
  raw: string
}

export const DEFAULT_MENU_THRESHOLDS = {
  autoAcceptScore: 0.86,
  minMargin: 0.08,
  reviewScore: 0.70
}

/**
 * Standard default menu knowledge base for King's Grill
 */
export const STANDARD_MENU_KNOWLEDGE: MenuKnowledgeItem[] = [
  {
    id: 'm_lau_thai',
    sku: 'LT01',
    canonicalName: 'Lẩu Thái',
    aliases: ['lẩu thái', 'lẩu thái hải sản', 'lau thai', 'lẫu thái', 'lẩu thái chua cay', 'lẩu thái hs'],
    normalizedAliases: ['lau thai', 'lau thai hai san', 'lau thai hs', 'lau thai chua cay'],
    category: 'Lẩu',
    unitPrice: 289000,
    available: true,
    tags: ['hot', 'soup', 'seafood']
  },
  {
    id: 'm_bo_luc_lac',
    sku: 'BLL01',
    canonicalName: 'Bò lúc lắc',
    aliases: ['bò lúc lắc', 'bo luc lac', 'bò lúc lac', 'bò lắc', 'bò lúc lắc khoai tây'],
    normalizedAliases: ['bo luc lac', 'bo lac', 'bo luc lac khoai tay'],
    category: 'Bò',
    unitPrice: 169000,
    available: true,
    tags: ['beef', 'stirfry']
  },
  {
    id: 'm_lau_hai_san',
    sku: 'LHS01',
    canonicalName: 'Lẩu hải sản',
    aliases: ['lẩu hải sản', 'lau hai san', 'lẩu hs', 'lau hs', 'lẩu hải sản chua cay'],
    normalizedAliases: ['lau hai san', 'lau hs', 'lau hai san chua cay'],
    category: 'Lẩu',
    unitPrice: 299000,
    available: true,
    tags: ['hot', 'soup', 'seafood']
  },
  {
    id: 'm_ga_nuong',
    sku: 'GN01',
    canonicalName: 'Gà nướng muối ớt',
    aliases: ['gà nướng', 'ga nuong', 'gà nướng muối ớt', 'gà nướng mật ong', 'ga nuong muoi ot'],
    normalizedAliases: ['ga nuong', 'ga nuong muoi ot', 'ga nuong mat ong'],
    category: 'Gà',
    unitPrice: 220000,
    available: true,
    tags: ['chicken', 'grill', 'best_seller']
  },
  {
    id: 'm_ca_lang',
    sku: 'CL01',
    canonicalName: 'Cá lăng nướng',
    aliases: ['cá lăng', 'ca lang', 'cá lăng nướng', 'lẩu cá lăng'],
    normalizedAliases: ['ca lang', 'ca lang nuong', 'lau ca lang'],
    category: 'Cá',
    unitPrice: 250000,
    available: true,
    tags: ['fish']
  },
  {
    id: 'm_ca_dieu_hong',
    sku: 'CDH01',
    canonicalName: 'Cá diêu hồng chiên xù',
    aliases: ['cá diêu hồng', 'ca dieu hong', 'cá điêu hồng'],
    normalizedAliases: ['ca dieu hong'],
    category: 'Cá',
    unitPrice: 180000,
    available: true,
    tags: ['fish']
  }
]

/**
 * Resolves raw item text using a multi-tiered cascade with dual-threshold margin gating.
 */
export function resolveMenuCascade(
  rawQuery: string,
  menuKnowledge: MenuKnowledgeItem[] = STANDARD_MENU_KNOWLEDGE,
  thresholds = DEFAULT_MENU_THRESHOLDS
): MenuResolutionResult {
  const cleanRaw = rawQuery.trim()
  const cleanNoAccents = stripAccents(cleanRaw).toLowerCase()
  const candidates: MenuResolutionCandidate[] = []

  for (const item of menuKnowledge) {
    if (item.available === false) continue

    // 1. Exact SKU
    if (item.sku && cleanRaw.toUpperCase() === item.sku.toUpperCase()) {
      candidates.push({ item, score: 1.0, matchedTier: 'sku', evidence: item.sku })
      continue
    }

    // 2. Exact Canonical Name
    if (cleanRaw.toLowerCase() === item.canonicalName.toLowerCase()) {
      candidates.push({ item, score: 1.0, matchedTier: 'canonical', evidence: item.canonicalName })
      continue
    }

    // 3. Exact Alias
    const exactAlias = item.aliases.find(a => a.toLowerCase() === cleanRaw.toLowerCase())
    if (exactAlias) {
      candidates.push({ item, score: 0.98, matchedTier: 'alias', evidence: exactAlias })
      continue
    }

    // 4. Accent-insensitive matching
    const itemNormCanonical = stripAccents(item.canonicalName).toLowerCase()
    if (cleanNoAccents === itemNormCanonical) {
      candidates.push({ item, score: 0.95, matchedTier: 'accent', evidence: item.canonicalName })
      continue
    }

    const normAlias = item.normalizedAliases.find(na => na === cleanNoAccents)
    if (normAlias) {
      candidates.push({ item, score: 0.93, matchedTier: 'accent', evidence: normAlias })
      continue
    }

    // 5. Normalized Token matching
    const queryTokens = cleanNoAccents.split(/\s+/).filter(Boolean)
    const itemTokens = itemNormCanonical.split(/\s+/).filter(Boolean)
    const matchedTokens = queryTokens.filter(qt => itemTokens.includes(qt))

    if (matchedTokens.length === queryTokens.length && queryTokens.length >= 2) {
      candidates.push({ item, score: 0.90, matchedTier: 'token', evidence: matchedTokens.join(' ') })
      continue
    }

    // 6. Fuzzy Jaro-Winkler Matching
    const jwScore = jaroWinklerDistance(cleanNoAccents, itemNormCanonical)
    let bestAliasJw = 0
    for (const na of item.normalizedAliases) {
      const aScore = jaroWinklerDistance(cleanNoAccents, na)
      if (aScore > bestAliasJw) bestAliasJw = aScore
    }
    const fuzzyScore = Math.max(jwScore, bestAliasJw)
    if (fuzzyScore >= thresholds.reviewScore) {
      candidates.push({ item, score: fuzzyScore, matchedTier: 'fuzzy', evidence: item.canonicalName })
    }
  }

  candidates.sort((a, b) => b.score - a.score)

  if (candidates.length === 0) {
    return {
      acceptedItem: null,
      confidence: 0,
      isAmbiguous: false,
      needsReview: false,
      candidates: [],
      reason: 'Không tìm thấy món ăn phù hợp trong thực đơn.'
    }
  }

  const top1 = candidates[0]
  const top2 = candidates[1]

  // Dual Threshold Gate
  if (top1.score >= thresholds.autoAcceptScore) {
    // Only trigger ambiguity if top2 is also a strong tier (not just a low-confidence fuzzy overlap against an exact match)
    const isTop1Exact = top1.matchedTier === 'sku' || top1.matchedTier === 'canonical' || top1.matchedTier === 'alias' || top1.matchedTier === 'accent'
    const isAmbiguityConflict = top2 && (top1.score - top2.score) < thresholds.minMargin && (!isTop1Exact || top2.matchedTier !== 'fuzzy')

    if (isAmbiguityConflict) {
      // Ambiguity gate triggered: Top 1 and Top 2 are too close
      return {
        acceptedItem: null,
        confidence: top1.score,
        isAmbiguous: true,
        needsReview: true,
        candidates: [top1, top2],
        reason: `Món mơ hồ giữa "${top1.item.canonicalName}" (${top1.score.toFixed(2)}) và "${top2.item.canonicalName}" (${top2.score.toFixed(2)}). Cần xác nhận lại.`
      }
    }

    return {
      acceptedItem: top1.item,
      confidence: top1.score,
      isAmbiguous: false,
      needsReview: false,
      candidates,
      reason: `Khớp chính xác với "${top1.item.canonicalName}" (${(top1.score * 100).toFixed(0)}%).`
    }
  }

  return {
    acceptedItem: null,
    confidence: top1.score,
    isAmbiguous: false,
    needsReview: true,
    candidates,
    reason: `Điểm khớp (${top1.score.toFixed(2)}) chưa đạt ngưỡng tự động chấp nhận (${thresholds.autoAcceptScore}).`
  }
}

/**
 * Extracts conditional menu requests (e.g. "Nếu còn cá lăng thì lấy 2, không thì...")
 */
export function extractConditionalMenuRequests(text: string): ConditionalMenuRequest[] {
  if (!text) return []
  const clean = text.trim()
  const results: ConditionalMenuRequest[] = []

  // Pattern: "Nếu [condition] thì [ifTrue], không [thì/có] [ifFalse]"
  const condRegex = /nếu\s+([^,.]+?)\s+thì\s+([^,.]+?)(?:,\s*|\s+)không\s*(?:thì|có)?\s+([^,.]+)/gi
  let match
  while ((match = condRegex.exec(clean)) !== null) {
    let ifTrue = match[2].trim()
    let ifFalse = match[3].trim()

    // Clean polite particles: "giúp chị", "giúp em", "nha", "nhé", "đi"
    ifTrue = ifTrue.replace(/\s+(?:giúp|cho)?\s*(?:chị|anh|em|mình|nhé|nha|nhe|đi)(?:\s+|$).*/iu, '').trim()
    ifFalse = ifFalse.replace(/^(?:thì|là|có\s+thì)\s+/iu, '').replace(/\s+(?:nha|nhé|đi|giúp em|giúp chị)(?:\s+|$).*/iu, '').trim()

    results.push({
      condition: match[1].trim(),
      ifTrueAction: ifTrue,
      ifFalseAction: ifFalse,
      raw: match[0].trim()
    })
  }

  return results
}

/**
 * Extracts recommendation intents (e.g. "món gà nướng gì bên em bán chạy ấy lấy 2")
 */
export function extractRecommendationIntents(text: string): RecommendationIntent[] {
  if (!text) return []
  const clean = text.trim()
  const results: RecommendationIntent[] = []

  const recRegex = /(?:cái\s+món|món|set|combo)?\s*([a-zA-Z\p{L}\s]+?)\s*(?:gì\s+bên\s+em|nào\s+ngon|bên\s+em)?\s*(bán\s*chạy|best\s*seller|hot|ngon\s*nhất|đặc\s*sản)\s*(?:ấy|đó)?\s*(?:lấy|cho\s*(?:chị|anh|em|mình))?\s*(\d+)?/gui
  let match
  while ((match = recRegex.exec(clean)) !== null) {
    let query = match[1].replace(/^(?:cái\s+món|món|set|combo)\s+/i, '').trim()
    if (query.length >= 2 && !/^(nếu|không|chị|anh|em|cho)$/i.test(query)) {
      const qty = match[3] ? parseInt(match[3], 10) : 1
      results.push({
        query,
        criteria: match[2].trim().toLowerCase(),
        quantity: qty,
        raw: match[0].trim()
      })
    }
  }

  return results
}
