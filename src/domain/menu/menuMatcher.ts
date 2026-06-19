import { stripAccents, formatSetNote } from '@/utils'
import { SETS } from '@/utils/constants'
import { parseDishItems } from '@/domain/ai/ruleEngine'

const PART_MODIFIERS = [
  'chan', 'canh', 'sun', 'me', 'long', 'doi', 'nam', 'gan', 'duoi', 'luoi', 'tai', 'vu', 'ba chi',
  'nầm', 'chân', 'cánh', 'sụn', 'mề', 'lòng', 'dồi', 'gân', 'đuôi', 'lưỡi', 'tai', 'vú', 'ba chỉ'
]
const PART_MODIFIER_REGEXES = PART_MODIFIERS.map(mod => new RegExp(`\\b${mod}\\b`, 'i'))

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

export function jaroWinklerDistance(s1: string, s2: string, isNormalized = false): number {
  if (!isNormalized) {
    s1 = stripAccents(s1).toLowerCase().trim()
    s2 = stripAccents(s2).toLowerCase().trim()
  }
  
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

export function fuzzyMatchMenu(
  inputName: string,
  guestCount?: number | null,
  menuList: any[] = [],
  aliases: any[] = [],
  fallbackGuestCount?: number | null
): any | null {
  if (!menuList || menuList.length === 0) return null
  
  let rawName = inputName.trim()
  const qtyMatch = rawName.match(/(?:[x\*])\s*(\d+)\s*$/i)
  if (qtyMatch) {
    rawName = rawName.replace(/(?:[x\*])\s*(\d+)\s*$/i, '').trim()
  }
  const clean = stripAccents(rawName).toLowerCase().trim()
  if (!clean || clean.length < 2) return null

  // Portion resolution logic check
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
      return portionMatch
    }
  }

  // 1. Exact match
  const exact = menuList.find((m: any) => m.cleanName === clean || m.acronym === clean)
  if (exact) return exact

  // 2. Alias match
  const aliasMatch = aliases.find((a: any) => stripAccents(a.alias).toLowerCase().trim() === clean)
  if (aliasMatch) {
    const dish = menuList.find((m: any) => m.name === aliasMatch.dishName)
    if (dish) return dish
  }

  // 3. Contains match
  const containsCandidates: { item: any; score: number }[] = []
  for (const m of menuList) {
    if (m.cleanName && (clean.includes(m.cleanName) || m.cleanName.includes(clean))) {
      const lenDiff = Math.abs(clean.length - m.cleanName.length)
      containsCandidates.push({ item: m, score: 1 / (1 + lenDiff) })
    }
  }
  if (containsCandidates.length > 0) {
    containsCandidates.sort((a, b) => b.score - a.score)
    return containsCandidates[0].item
  }

  // 4. Word overlap match
  const inputWords = clean.split(/\s+/).filter((w: string) => w.length > 1)
  if (inputWords.length > 0) {
    let bestMatch: any = null
    let bestScore = 0
    for (const m of menuList) {
      const menuWords = (m.cleanName || '').split(/\s+/)
      const overlap = inputWords.filter((w: string) => menuWords.some((mw: string) => mw.includes(w) || w.includes(mw))).length
      const score = overlap / Math.max(inputWords.length, 1)
      if (score > bestScore && score >= 0.5) {
        bestScore = score
        bestMatch = m
      }
    }
    if (bestMatch) return bestMatch
  }
  return null
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
  const exactMap = new Map<string, any>()
  const aliasMap = new Map<string, any>()
  const acronymMap = new Map<string, any>()
  
  for (const item of menuList) {
    const clean = stripAccents(item.name).toLowerCase().trim()
    exactMap.set(clean, item)
    if (item.cleanName) exactMap.set(item.cleanName, item)
    if (item.acronym) acronymMap.set(String(item.acronym).toLowerCase().trim(), item)
  }
  for (const a of menuAliases) {
    const cleanAlias = stripAccents(a.alias).toLowerCase().trim()
    aliasMap.set(cleanAlias, a)
  }

  // Pre-normalize menuList for contains matching and fuzzy matching to avoid repeating it for each item
  const preparedMenuList = menuList.map(item => {
    const clean = item.cleanName || stripAccents(item.name).toLowerCase().trim()
    return {
      item,
      clean,
      tokens: clean.split(/\s+/).filter((t: string) => t.length > 0)
    }
  })

  const attributes = ['trung muoi', 'tieu', 'pho mai', 'mo hanh', 'cay', 'lau', 'nuong', 'xao', 'hap']
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

  return expandedItems.map((item) => {
    let rawName = (item.raw_name || item.name || '').trim()
    const qtyMatch = rawName.match(/(?:[x\*])\s*(\d+)\s*$/i)
    if (qtyMatch) {
      item.quantity = parseInt(qtyMatch[1], 10)
      rawName = rawName.replace(/(?:[x\*])\s*(\d+)\s*$/i, '').trim()
    }

    rawName = normalizeSynonyms(rawName)
    const clean = stripAccents(rawName).toLowerCase().trim()
    
    let match: any = null
    let confidence = 0.0
    let needsReview = false
    let matchType: 'exact' | 'alias' | 'acronym' | 'fuzzy' | 'none' = 'none'

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
        match = portionMatch
        confidence = 0.98
        matchType = 'fuzzy'
        if (logCallback) {
          logCallback(`[Khớp phần ăn] Trích xuất "${rawName}" (Khách: ${guestCount || fallbackGuestCount || 'chưa rõ'}) -> Khớp "${match.name}" (Phần ${targetPortion} con, Độ tin cậy: 98%)`, 'success')
        }
      }
    }
    
    if (!match) {
      if (exactMap.has(clean)) {
        match = exactMap.get(clean)
        confidence = 1.0
        matchType = 'exact'
        if (logCallback) logCallback(`[Khớp món] "${rawName}" -> "${match.name}" (Khớp chính xác, Độ tin cậy: 100%)`, 'success')
      } else if (aliasMap.has(clean)) {
        const aliasObj = aliasMap.get(clean)
        match = menuList.find((m: any) => m.name === aliasObj.dishName)
        if (match) {
          confidence = 1.0
          matchType = 'alias'
          if (logCallback) logCallback(`[Khớp món] "${rawName}" -> "${match.name}" (Khớp alias, Độ tin cậy: 100%)`, 'success')
        }
      } else if (acronymMap.has(clean)) {
        match = acronymMap.get(clean)
        confidence = 0.95
        matchType = 'acronym'
        if (logCallback) logCallback(`[Khớp món] "${rawName}" -> "${match.name}" (Khớp viết tắt, Độ tin cậy: 95%)`, 'success')
      }
    }
    
    // Contains match
    if (!match) {
      const containsCandidates: { item: any; score: number }[] = []
      
      for (const prepared of preparedMenuList) {
        const mClean = prepared.clean
        const m = prepared.item
        if (mClean && clean && (mClean.includes(clean) || clean.includes(mClean))) {
          let modifierConflict = false
          for (const regex of PART_MODIFIER_REGEXES) {
            const mHasMod = regex.test(mClean)
            const cleanHasMod = regex.test(clean)
            if (mHasMod && !cleanHasMod) {
              modifierConflict = true
              break
            }
          }
          
          const lenDiff = Math.abs(clean.length - mClean.length)
          let score = 1 / (1 + lenDiff)
          
          if (mClean.startsWith(clean)) score += 2.0
          const cleanWords = clean.split(/\s+/)
          const mWords = mClean.split(/\s+/)
          if (mWords.slice(0, cleanWords.length).join(' ') === clean) score += 1.0
          if (modifierConflict) score -= 5.0
          
          containsCandidates.push({ item: m, score })
        }
      }
      
      const validCandidates = containsCandidates.filter(c => c.score > -2.0)
      if (validCandidates.length > 0) {
        validCandidates.sort((a, b) => b.score - a.score)
        match = validCandidates[0].item
        confidence = 0.95
        matchType = 'fuzzy'
        if (logCallback) logCallback(`[Khớp món] "${rawName}" -> "${match.name}" (Khớp chứa, Điểm: ${validCandidates[0].score.toFixed(2)})`, 'success')
      }
    }
    
    // Fuzzy search with distance
    if (!match) {
      const inputTokens = clean.split(/\s+/).filter(t => t.length > 1)
      const matchedCandidates: { item: any; score: number; confidence: number }[] = []
      
      for (const prepared of preparedMenuList) {
        const mClean = prepared.clean
        const mTokens = prepared.tokens
        const m = prepared.item
        
        const overlap = inputTokens.filter(t => mTokens.some(mt => mt.includes(t) || t.includes(mt))).length
        if (overlap === 0) continue // Skip heavy calculations if there is no token overlap!
        
        const overlapScore = (overlap / Math.max(inputTokens.length, 1)) * 0.7 + (overlap / Math.max(mTokens.length, 1)) * 0.3
        
        const dist = levenshteinDistance(clean, mClean)
        const levenshteinScore = 1 - (dist / Math.max(clean.length, mClean.length, 1))
        
        let attributeConflict = false
        let attributeMissingInUser = false
        for (const attr of attributes) {
          const cleanHasAttr = clean.includes(attr)
          const mCleanHasAttr = mClean.includes(attr)
          if (cleanHasAttr && !mCleanHasAttr) {
            attributeConflict = true
          } else if (!cleanHasAttr && mCleanHasAttr) {
            attributeMissingInUser = true
          }
        }
        
        const jaroWinklerScore = jaroWinklerDistance(clean, mClean, true) // Pass true for isNormalized
        let score = 0.5 * overlapScore + 0.5 * jaroWinklerScore
        if (attributeConflict) {
          score *= 0.2
        } else if (attributeMissingInUser) {
          score *= 0.8
        }
        
        if (score >= 0.4) {
          matchedCandidates.push({ item: m, score, confidence: Math.max(0.1, score) })
        }
      }
      
      matchedCandidates.sort((a, b) => b.score - a.score)
      
      if (matchedCandidates.length > 0) {
        const best = matchedCandidates[0]
        match = best.item
        confidence = best.confidence
        matchType = 'fuzzy'
        
        if (matchedCandidates.length > 1) {
          const runnerUp = matchedCandidates[1]
          if (best.score - runnerUp.score < 0.15) {
            needsReview = true
          }
        }
        if (logCallback) {
          logCallback(`[Khớp món] "${rawName}" -> "${match.name}" (Khớp mờ, Độ tin cậy: ${Math.round(confidence * 100)}%), Cần duyệt lại: ${needsReview}`, confidence < 0.75 ? 'warning' : 'info')
        }
      }
    }
    
    if (match) {
      let note = item.note || item.notes || ''
      const isSet = /set|combo|goi|phan/i.test(match.name)
      let description = match.desc || menuDetails[match.name] || ''
      if (!description && isSet && SETS[match.name.toUpperCase()]) {
        description = SETS[match.name.toUpperCase()]
      }
      if (description) {
        if (isSet) {
          const formattedNote = formatSetNote(description)
          note = note ? `${note}\n${formattedNote}` : formattedNote
        } else {
          note = note ? `${note} (${description})` : description
        }
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
        needs_review: needsReview || (confidence < 0.75),
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
