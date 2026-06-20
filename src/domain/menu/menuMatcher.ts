import { stripAccents, formatSetNote } from '@/utils'
import { SETS } from '@/utils/constants'
import { parseDishItems } from '@/domain/ai/ruleEngine'

export function extractPortionSize(rawName: string): number | null {
  const clean = stripAccents(rawName).toLowerCase()
  const match = clean.match(/\b(5|10)\s*(?:con|c)\b/i)
  if (match) return parseInt(match[1])
  return null
}

export function getMenuPortionSize(menuName: string): number | null {
  const clean = stripAccents(menuName).toLowerCase()
  const match = clean.match(/\b(5|10)\s*(?:con|c)\b/i)
  if (match) return parseInt(match[1])
  return null
}

export function getBaseDishName(name: string): string {
  let clean = stripAccents(name).toLowerCase().trim()
  // Remove "5 con", "10 con", "5con", "10con"
  clean = clean.replace(/\b(5|10)\s*con\b/gi, '')
  clean = clean.replace(/\b(5|10)con\b/gi, '')
  // Remove "nho", "lon"
  clean = clean.replace(/\b(nho|lon)\b/gi, '')
  // Trim extra spaces
  return clean.replace(/\s+/g, ' ').trim()
}

export function normalizeSynonyms(name: string): string {
  const replacements = [
    { pattern: /\bba\s+roi\b/gi, replacement: 'ba chỉ' },
    { pattern: /\bsườn\s+non\b/gi, replacement: 'dẻ sườn' },
    { pattern: /\bnậm(?:\s+heo)?\b/gi, replacement: 'nầm heo' },
    { pattern: /\bnăm(?:\s+heo)?\b/gi, replacement: 'nầm heo' },
    { pattern: /\bmực\s+sữa\b/gi, replacement: 'mực trứng' },
    { pattern: /\blẩu\s+thái\s+hải\s+sản\b/gi, replacement: 'lẩu thái hs' },
  ]
  let normalized = name
  for (const r of replacements) {
    normalized = normalized.replace(r.pattern, r.replacement)
  }
  return normalized
}

export function jaroWinklerDistance(s1: string, s2: string): number {
  s1 = stripAccents(s1).toLowerCase().trim()
  s2 = stripAccents(s2).toLowerCase().trim()
  
  if (s1 === s2) return 1.0
  
  const len1 = s1.length
  const len2 = s2.length
  
  if (len1 === 0 || len2 === 0) return 0.0
  
  const matchWindow = Math.floor(Math.max(len1, len2) / 2) - 1
  const matches1 = new Array(len1).fill(false)
  const matches2 = new Array(len2).fill(false)
  
  let matches = 0
  let transpositions = 0
  
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchWindow)
    const end = Math.min(len2 - 1, i + matchWindow)
    for (let j = start; j <= end; j++) {
      if (!matches2[j] && s1[i] === s2[j]) {
        matches1[i] = true
        matches2[j] = true
        matches++
        break
      }
    }
  }
  
  if (matches === 0) return 0.0
  
  let k = 0
  for (let i = 0; i < len1; i++) {
    if (matches1[i]) {
      while (!matches2[k]) k++
      if (s1[i] !== s2[k]) transpositions++
      k++
    }
  }
  
  const jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3.0
  
  const prefixLimit = 4
  let commonPrefix = 0
  for (let i = 0; i < Math.min(prefixLimit, len1, len2); i++) {
    if (s1[i] === s2[i]) {
      commonPrefix++
    } else {
      break
    }
  }
  
  return jaro + commonPrefix * 0.1 * (1.0 - jaro)
}

export function levenshteinDistance(a: string, b: string): number {
  const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i])
  for (let j = 1; j <= a.length; j++) matrix[0][j] = j
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }
  return matrix[b.length][a.length]
}

export function scoreAndMatchMenu(
  inputName: string,
  guestCount?: number | null,
  menuList: any[] = [],
  menuAliases: any[] = [],
  fallbackGuestCount?: number | null
): {
  match: any | null
  confidence: number
  needsReview: boolean
  matchType: 'exact' | 'alias' | 'acronym' | 'fuzzy' | 'none'
} {
  if (!menuList || menuList.length === 0) {
    return { match: null, confidence: 0, needsReview: true, matchType: 'none' }
  }
  
  let rawName = inputName.trim()
  const qtyMatch = rawName.match(/(?:[x\*])\s*(\d+)\s*$/i)
  if (qtyMatch) {
    rawName = rawName.replace(/(?:[x\*])\s*(\d+)\s*$/i, '').trim()
  }
  
  rawName = normalizeSynonyms(rawName)
  const clean = stripAccents(rawName).toLowerCase().trim()
  if (!clean || clean.length < 2) {
    return { match: null, confidence: 0, needsReview: true, matchType: 'none' }
  }

  // Portion matching override
  const baseRaw = getBaseDishName(rawName)
  const portionCandidates = menuList.filter((m: any) => getBaseDishName(m.name) === baseRaw)
  const hasPortions = portionCandidates.some((m: any) => getMenuPortionSize(m.name) !== null)
  
  if (portionCandidates.length > 0 && hasPortions) {
    let targetPortion = extractPortionSize(rawName)
    if (targetPortion === null) {
      if (guestCount !== undefined && guestCount !== null) {
        targetPortion = guestCount < 5 ? 5 : 10
      } else if (fallbackGuestCount !== undefined && fallbackGuestCount !== null) {
        targetPortion = fallbackGuestCount < 5 ? 5 : 10
      } else {
        targetPortion = 10
      }
    }
    
    const portionMatch = portionCandidates.find((m: any) => getMenuPortionSize(m.name) === targetPortion)
    if (portionMatch) {
      return {
        match: portionMatch,
        confidence: 0.98,
        needsReview: false,
        matchType: 'fuzzy'
      }
    }
  }

  const inputTokens = clean.split(/\s+/).filter(t => t.length > 1)
  const candidates: { item: any; score: number; reasons: string[]; risks: string[] }[] = []

  for (const m of menuList) {
    let score = 0.0
    const reasons: string[] = []
    const risks: string[] = []
    
    const mClean = stripAccents(m.name).toLowerCase().trim()
    const mTokens = mClean.split(/\s+/)
    
    // 1. Exact match
    if (clean === mClean || m.acronym === clean) {
      score = Math.max(score, 1.0)
      reasons.push('exact_match')
    }
    
    // 2. Alias match
    const aliasMatch = menuAliases.find((a: any) => stripAccents(a.alias).toLowerCase().trim() === clean)
    if (aliasMatch && aliasMatch.dishName === m.name) {
      score = Math.max(score, 0.95)
      reasons.push('alias_match')
    }
    
    // 3. Synonym matching
    const dynamicSynonymMatch = menuAliases.find((a: any) => a.dishName === m.name && stripAccents(a.alias).toLowerCase().trim() === clean)
    if (dynamicSynonymMatch) {
      score = Math.max(score, 0.90)
      reasons.push('synonym_match')
    }
    
    // 4. Prefix match
    if (mClean.startsWith(clean) || clean.startsWith(mClean)) {
      const prefixScore = 0.80
      if (prefixScore > score) {
        score = prefixScore
        reasons.push('prefix_match')
      }
    }
    
    // 5. Word / Token overlap
    const overlap = inputTokens.filter(t => mTokens.some(mt => mt.includes(t) || t.includes(mt))).length
    if (overlap > 0) {
      const overlapScore = (overlap / Math.max(inputTokens.length, 1)) * 0.7
      if (overlapScore > score) {
        score = Math.max(score, overlapScore)
        reasons.push('token_overlap')
      }
    }
    
    // 6. Levenshtein / Jaro-Winkler
    const dist = levenshteinDistance(clean, mClean)
    const maxLen = Math.max(clean.length, mClean.length, 1)
    const levenshteinScore = 1 - (dist / maxLen)
    const jaroWinklerScore = jaroWinklerDistance(clean, mClean)
    const fuzzyScore = 0.5 * levenshteinScore + 0.5 * jaroWinklerScore
    
    if (fuzzyScore > score && fuzzyScore >= 0.4) {
      score = Math.max(score, fuzzyScore)
      reasons.push('fuzzy_match')
    }
    
    // 7. Category/context boost
    if (m.category && clean.includes(stripAccents(m.category).toLowerCase())) {
      score += 0.10
      reasons.push('category_boost')
    }
    
    // 8. Unavailable/disabled penalty
    if (m.status === 'unavailable' || m.available === false) {
      score -= 1.0
      risks.push('item_unavailable')
    }

    if (clean.length <= 3 && score < 1.0) {
      score *= 0.5
    }

    if (score >= 0.4) {
      candidates.push({ item: m, score, reasons, risks })
    }
  }

  candidates.sort((a, b) => b.score - a.score)

  if (candidates.length > 0 && candidates[0].score >= 0.5) {
    const best = candidates[0]
    let needsReview = false
    
    if (candidates.length > 1) {
      const runnerUp = candidates[1]
      if (best.score - runnerUp.score < 0.08) {
        needsReview = true
      }
    }
    if (best.score < 0.78) {
      needsReview = true
    }

    let matchType: 'exact' | 'alias' | 'acronym' | 'fuzzy' | 'none' = 'fuzzy'
    if (best.score >= 0.95) {
      matchType = 'exact'
    } else if (best.reasons.includes('alias_match') || best.reasons.includes('synonym_match')) {
      matchType = 'alias'
    }

    return {
      match: best.item,
      confidence: best.score,
      needsReview,
      matchType
    }
  }

  return { match: null, confidence: 0, needsReview: true, matchType: 'none' }
}

export function fuzzyMatchMenu(
  inputName: string,
  guestCount?: number | null,
  menuList: any[] = [],
  aliases: any[] = [],
  fallbackGuestCount?: number | null
): any | null {
  const result = scoreAndMatchMenu(inputName, guestCount, menuList, aliases, fallbackGuestCount)
  return result.match
}

export function resolveMenuItemsLocally(
  rawItems: any[],
  guestCount?: number | null,
  menuList: any[] = [],
  aliases: any[] = [],
  fallbackGuestCount?: number | null
): any[] {
  if (!rawItems || rawItems.length === 0) return []
  return rawItems.map(item => {
    const match = fuzzyMatchMenu(item.raw_name || item.name || '', guestCount, menuList, aliases, fallbackGuestCount)
    return {
      matched_name: match ? match.name : (item.raw_name || item.name),
      name: match ? match.name : (item.raw_name || item.name),
      quantity: item.quantity || item.qty || 1,
      unit_price: match ? match.price : (item.unit_price || 0),
      price: match ? match.price : (item.unit_price || 0),
      note: item.note || ''
    }
  })
}

export function matchMenuItems(
  rawItems: any[],
  guestCount: number | null,
  menuList: any[] = [],
  menuAliases: any[] = [],
  menuDetails: Record<string, string> = {},
  fallbackGuestCount?: number | null,
  logCallback?: (msg: string, type?: 'info' | 'warning' | 'error' | 'success') => void
): any[] {
  const expandedItems: any[] = []
  
  for (const item of rawItems) {
    const rawName = (item.raw_name || item.name || '').trim()
    const parsedSubDishes = parseDishItems(rawName)
    if (parsedSubDishes.length > 0) {
      if (logCallback) {
        logCallback(`Tách món ghép: "${rawName}" -> [${parsedSubDishes.map(d => `${d.qty}x ${d.name}`).join(', ')}]`)
      }
      for (const sub of parsedSubDishes) {
        const originalQty = item.quantity || item.qty || 1
        const finalQty = (sub.qty === 1 && originalQty > 1) ? originalQty : sub.qty
        expandedItems.push({
          raw_name: sub.name,
          quantity: finalQty,
          unit_price: item.unit_price || item.price || null,
          note: item.note || item.notes || ''
        })
      }
    } else {
      expandedItems.push(item)
    }
  }

  const attributes = ['trung muoi', 'tieu', 'pho mai', 'mo hanh', 'cay', 'lau', 'nuong', 'xao', 'hap']
  const SETS: Record<string, string> = {
    'SUM VAY 1': 'Set sum vầy [1]'
  }

  return expandedItems.map((item) => {
    let rawName = (item.raw_name || item.name || '').trim()
    const qtyMatch = rawName.match(/(?:[x\*])\s*(\d+)\s*$/i)
    if (qtyMatch) {
      item.quantity = parseInt(qtyMatch[1], 10)
      rawName = rawName.replace(/(?:[x\*])\s*(\d+)\s*$/i, '').trim()
    }

    const { match, confidence, needsReview, matchType } = scoreAndMatchMenu(
      rawName,
      guestCount,
      menuList,
      menuAliases,
      fallbackGuestCount
    )

    if (match) {
      let note = item.note || item.notes || ''
      const isSet = /set|combo|goi|phan/i.test(match.name)
      let description = match.desc || menuDetails[match.name] || ''
      if (description) {
        if (isSet) {
          const formattedNote = formatSetNote(description)
          note = note ? `${note}\n${formattedNote}` : formattedNote
        } else {
          note = note ? `${note} (${description})` : description
        }
      }
      
      if (logCallback) {
        const reviewText = needsReview ? ' (Cần duyệt lại)' : ''
        logCallback(`[Khớp món] "${rawName}" -> "${match.name}" (Độ tin cậy: ${Math.round(confidence * 100)}%${reviewText})`, confidence < 0.75 ? 'warning' : 'success')
      }

      return {
        raw_name: rawName,
        inputName: rawName,
        matched_name: match.name,
        matchedName: match.name,
        name: match.name,
        quantity: item.quantity || item.qty || 1,
        qty: item.quantity || item.qty || 1,
        unit_price: match.price || 0,
        price: match.price || 0,
        note: note.trim(),
        match_confidence: confidence,
        confidence,
        needs_review: needsReview,
        matchType,
        match_type: matchType,
        warning: confidence < 0.75 ? 'dish_fuzzy_match_low_confidence' : undefined
      }
    } else {
      if (logCallback) logCallback(`[Khớp món] Không tìm thấy món khớp cho "${rawName}"`, 'error')
      return {
        raw_name: rawName,
        inputName: rawName,
        matched_name: rawName,
        matchedName: rawName,
        name: rawName,
        quantity: item.quantity || item.qty || 1,
        qty: item.quantity || item.qty || 1,
        unit_price: 0,
        price: 0,
        note: (item.note || item.notes || '').trim(),
        match_confidence: 0.0,
        confidence: 0.0,
        needs_review: true,
        matchType: 'none',
        match_type: 'none',
        warning: 'dish_not_found'
      }
    }
  })
}

export function resolveBestMenuSheet(
  text: string,
  parsedItems: any[],
  allMenus: Record<string, any[]>,
  activeSheet: string = ''
): { bestSheet: string; score: number; isBorderline: boolean } {
  let bestSheet = activeSheet
  let maxScore = 0
  const scores: Record<string, number> = {}
  const sheets = Object.keys(allMenus)
  if (sheets.length === 0) return { bestSheet, score: 0, isBorderline: false }

  const normalizedText = stripAccents(text).toLowerCase()

  for (const sheet of sheets) {
    let score = 0
    const items = allMenus[sheet] || []
    const sheetNorm = stripAccents(sheet).toLowerCase()
    if (sheetNorm.includes('sinh nhat') && normalizedText.includes('sinh nhat')) {
      score += 3
    }
    if (sheetNorm.includes('cuoi') && (normalizedText.includes('cuoi') || normalizedText.includes('dam cuoi'))) {
      score += 3
    }
    if (sheetNorm.includes('thuong') && (normalizedText.includes('thuong') || normalizedText.includes('goi mon'))) {
      score += 2
    }

    for (const pItem of parsedItems) {
      const pName = stripAccents(pItem.matched_name || pItem.raw_name || '').toLowerCase().trim()
      if (!pName) continue
      const found = items.some(item => {
        const mName = stripAccents(item.name || '').toLowerCase().trim()
        return mName === pName || mName.includes(pName) || pName.includes(mName)
      })
      if (found) score += 1
    }

    scores[sheet] = score
    if (score > maxScore) {
      maxScore = score
      bestSheet = sheet
    }
  }

  let isBorderline = false
  if (maxScore > 0) {
    const otherScores = Object.entries(scores).filter(([s, sc]) => s !== bestSheet && sc > 0)
    if (otherScores.length > 0) {
      const runnerUpScore = Math.max(...otherScores.map(([_, sc]) => sc))
      if (maxScore - runnerUpScore <= 1) {
        isBorderline = true
      }
    } else {
      if (maxScore === 1 && parsedItems.length >= 3) {
        isBorderline = true
      }
    }
  }

  return { bestSheet, score: maxScore, isBorderline }
}
