import { stripAccents, formatSetNote, mergeSetComponentNote } from '@/utils'
import { SETS } from '@/utils/constants'
import { parseDishItems } from '@/domain/ai/ruleEngine'
import {
  PRIMARY_MENU_SHEET,
  isValidMenuSheetName,
  normalizeMenuSheetName,
  filterValidMenuSheets,
  prioritizeMenuSheets,
  isValidMenuItemsDataset
} from './menuSheetGuard'

export {
  PRIMARY_MENU_SHEET,
  isValidMenuSheetName,
  normalizeMenuSheetName,
  filterValidMenuSheets,
  prioritizeMenuSheets,
  isValidMenuItemsDataset
}

export const CANONICAL_SET_AND_COMBO_ITEMS = [
  { name: 'Set menu 1', price: 2500000, acronym: 'SM1', cleanName: 'set menu 1', desc: SETS['Set menu 1'] },
  { name: 'Set menu 2', price: 2500000, acronym: 'SM2', cleanName: 'set menu 2', desc: SETS['Set menu 2'] },
  { name: 'Set menu 3', price: 2500000, acronym: 'SM3', cleanName: 'set menu 3', desc: SETS['Set menu 3'] },
  { name: 'Set menu 4', price: 2500000, acronym: 'SM4', cleanName: 'set menu 4', desc: SETS['Set menu 4'] },
  { name: 'Set menu 5', price: 2500000, acronym: 'SM5', cleanName: 'set menu 5', desc: SETS['Set menu 5'] },
  { name: 'Set menu 6', price: 3000000, acronym: 'SM6', cleanName: 'set menu 6', desc: SETS['Set menu 6'] },
  { name: 'Set menu 7', price: 3000000, acronym: 'SM7', cleanName: 'set menu 7', desc: SETS['Set menu 7'] },
  { name: 'Set menu 8', price: 3000000, acronym: 'SM8', cleanName: 'set menu 8', desc: SETS['Set menu 8'] },
  { name: 'Set menu 9', price: 3000000, acronym: 'SM9', cleanName: 'set menu 9', desc: SETS['Set menu 9'] },
  { name: 'Set menu 10', price: 3000000, acronym: 'SM10', cleanName: 'set menu 10', desc: SETS['Set menu 10'] },
  { name: 'Set menu 11', price: 3900000, acronym: 'SM11', cleanName: 'set menu 11', desc: SETS['Set menu 11'] },
  { name: 'Set menu 12', price: 3900000, acronym: 'SM12', cleanName: 'set menu 12', desc: SETS['Set menu 12'] },
  { name: 'Set menu 13', price: 3900000, acronym: 'SM13', cleanName: 'set menu 13', desc: SETS['Set menu 13'] },
  { name: 'Set menu 14', price: 3900000, acronym: 'SM14', cleanName: 'set menu 14', desc: SETS['Set menu 14'] },
  { name: 'Set menu 15', price: 3900000, acronym: 'SM15', cleanName: 'set menu 15', desc: SETS['Set menu 15'] },
  { name: 'Combo couple 1', price: 499000, acronym: 'CC1', cleanName: 'combo couple 1', desc: SETS['Combo couple 1'] },
  { name: 'Combo couple 2', price: 499000, acronym: 'CC2', cleanName: 'combo couple 2', desc: SETS['Combo couple 2'] },
  { name: 'Combo couple 3', price: 499000, acronym: 'CC3', cleanName: 'combo couple 3', desc: SETS['Combo couple 3'] },
  { name: 'Combo couple 4', price: 599000, acronym: 'CC4', cleanName: 'combo couple 4', desc: SETS['Combo couple 4'] },
  { name: 'Combo couple 5', price: 599000, acronym: 'CC5', cleanName: 'combo couple 5', desc: SETS['Combo couple 5'] },
  { name: 'Combo couple 6', price: 499000, acronym: 'CC6', cleanName: 'combo couple 6', desc: SETS['Combo couple 6'] },
  { name: 'Combo couple 7', price: 499000, acronym: 'CC7', cleanName: 'combo couple 7', desc: SETS['Combo couple 7'] },
  { name: 'Combo couple 8', price: 599000, acronym: 'CC8', cleanName: 'combo couple 8', desc: SETS['Combo couple 8'] },
  { name: 'Combo couple 9', price: 599000, acronym: 'CC9', cleanName: 'combo couple 9', desc: SETS['Combo couple 9'] },
  { name: 'Combo couple 10', price: 599000, acronym: 'CC10', cleanName: 'combo couple 10', desc: SETS['Combo couple 10'] },
  { name: 'Combo couple 11', price: 599000, acronym: 'CC11', cleanName: 'combo couple 11', desc: SETS['Combo couple 11'] }
]

/**
 * Normalize Set menu (1..15) and Combo couple (1..11) shorthand names to canonical form.
 * E.g. "Set 2", "SM2", "Set menu số 02" -> "Set menu 2"
 *      "Combo 3", "Couple 3", "CC3", "Combo 2 người số 3" -> "Combo couple 3"
 */
export function normalizeSetOrComboName(rawInput: string): string {
  if (!rawInput) return ''
  const cleaned = stripAccents(rawInput)
    .toLowerCase()
    .replace(/^[\s\-–—•*+>:,.]+|[\s\-–—•*+>:,.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  // Set menu 1..15
  const setMatch = cleaned.match(/^(?:set\s*menu|menu\s*set|set)\s*(?:so\s*|#|:|-|\s)*0*([1-9]|1[0-5])$/i)
  if (setMatch) return `Set menu ${setMatch[1]}`

  const smMatch = cleaned.match(/^sm\s*(?:so\s*|#|:|-|\s)*0*([1-9]|1[0-5])$/i)
  if (smMatch) return `Set menu ${smMatch[1]}`

  // Combo couple 1..11
  const ccExplicitMatch = cleaned.match(/^(?:combo\s*couple|couple\s*combo|set\s*couple|menu\s*couple|couple|combo\s*2\s*nguoi|combo\s*doi|combo\s*cap\s*doi)\s*(?:so\s*|#|:|-|\s)*0*([1-9]|1[01])$/i)
  if (ccExplicitMatch) return `Combo couple ${ccExplicitMatch[1]}`

  const ccAcronymMatch = cleaned.match(/^cc\s*(?:so\s*|#|:|-|\s)*0*([1-9]|1[01])$/i)
  if (ccAcronymMatch) return `Combo couple ${ccAcronymMatch[1]}`

  const comboShortMatch = cleaned.match(/^combo\s*(?:so\s*|#|:|-|\s)*0*([1-9]|1[01])$/i)
  if (comboShortMatch) return `Combo couple ${comboShortMatch[1]}`

  return rawInput.trim()
}

/**
 * Extract canonical Set menu / Combo couple name, explicit order quantity, and custom notes
 * from a raw dish string without ever mistaking the Set/Combo identifier number for quantity.
 */
export function extractSetOrComboHeaderAndQty(
  rawInput: string,
  existingQty?: number | null
): {
  isSetOrCombo: boolean
  canonicalName: string
  identifierNumber: number
  quantity: number
  hasExplicitQty: boolean
  customNote: string
} | null {
  if (!rawInput) return null
  let work = rawInput.trim().replace(/^[\s\-–—•*+>✔↳]+|[\s\-–—:;.]+$/g, '').trim()
  if (!work) return null

  const customNotes: string[] = []
  let explicitQty: number | null = null

  // 1. Iteratively strip trailing parentheticals, price tags, and explicit trailing quantities in any order
  let stripLoop = true
  while (stripLoop) {
    stripLoop = false

    // 1a. Strip trailing standalone price tag e.g. "1.699.000đ", "1699k", "- 499k"
    const trailingPriceMatch = work.match(/\s*(?:[-–—:]\s*)?\b(?:\d{3,4}\s*k|\d{1,3}(?:[.,]\d{3})+(?:\s*(?:đ|d|vnd|vnđ))?)\s*$/i)
    if (trailingPriceMatch && trailingPriceMatch.index && trailingPriceMatch.index > 0) {
      work = work.slice(0, trailingPriceMatch.index).trim()
      stripLoop = true
      continue
    }

    // 1b. Check parenthetical or bracket expressions at the end: e.g. "(2 bàn)", "(x2)", "(02 set)", "(đổi lẩu nấm)", "(2 bàn, không cay)"
    const parenMatch = work.match(/\s*(?:\(([^)]+)\)|\[([^\]]+)\])\s*$/)
    if (parenMatch) {
      const inside = (parenMatch[1] ?? parenMatch[2] ?? '').trim()
      const insideNorm = stripAccents(inside).toLowerCase().trim()

      // Ignore price inside parens e.g. "(1.699k)", "(1.699.000đ)"
      if (/^(?:\d{3,4}\s*k|\d{1,3}(?:[.,]\d{3})+(?:\s*(?:d|vnd))?)$/i.test(insideNorm)) {
        work = work.slice(0, parenMatch.index).trim()
        stripLoop = true
        continue
      }

      // Pure quantity inside parens/brackets: "(x2)", "[2]", "(2 bàn)", "(02 set)", "(2 phần)", "(2 suất)", "(2 combo)"
      const pureQtyMatch = insideNorm.match(/^(?:[x\*]\s*0*(\d+)|0*(\d+)\s*(?:[x\*]|ban|set|phan|suat|combo|goi|mam)?)$/)
      if (pureQtyMatch) {
        const q = parseInt(pureQtyMatch[1] || pureQtyMatch[2], 10)
        if (q >= 1 && q <= 100) {
          explicitQty = q
          work = work.slice(0, parenMatch.index).trim()
          stripLoop = true
          continue
        }
      }

      // Combined quantity + note inside parens: "(2 bàn, đổi lẩu nấm)" or "(2 set - không cay)"
      const comboQtyNoteMatch = inside.match(/^(?:[x\*]\s*0*(\d+)|0*(\d+)\s*(?:bàn|ban|set|phần|phan|suất|suat|combo))\s*[,;\-–—]\s*(.+)$/i)
      if (comboQtyNoteMatch) {
        const q = parseInt(comboQtyNoteMatch[1] || comboQtyNoteMatch[2], 10)
        if (q >= 1 && q <= 100) {
          explicitQty = q
        }
        if (comboQtyNoteMatch[3]?.trim()) {
          customNotes.unshift(comboQtyNoteMatch[3].trim())
        }
        work = work.slice(0, parenMatch.index).trim()
        stripLoop = true
        continue
      }

      // Otherwise it's a custom note in parens, e.g. "(đổi lẩu nấm)"
      customNotes.unshift(inside)
      work = work.slice(0, parenMatch.index).trim()
      stripLoop = true
      continue
    }

    // 1c. Check explicit trailing multiplier with x/* or unit: e.g. "x2", "x 2 bàn", "- 2 bàn", ": 2 set"
    const explicitTrailingUnitMatch = work.match(/^(.+?)\s*(?:(?:[x\*])\s*0*(\d+)\s*(?:bàn|ban|set|phần|phan|suất|suat|combo|gói|goi|mâm|mam)?|(?:[-–—:]\s*|\s+)0*(\d+)\s*(?:bàn|ban|set|phần|phan|suất|suat|combo|gói|goi|mâm|mam))\s*$/i)
    if (explicitTrailingUnitMatch) {
      const candidatePrefix = explicitTrailingUnitMatch[1].trim()
      // Only strip if the remaining prefix still contains a Set/Combo number or parenthetical before it
      if (/\d/.test(candidatePrefix)) {
        const q = parseInt(explicitTrailingUnitMatch[2] || explicitTrailingUnitMatch[3], 10)
        if (q >= 1 && q <= 100) {
          explicitQty = q
          work = candidatePrefix
          stripLoop = true
          continue
        }
      }
    }
  }

  // 2. Check leading quantity before Set/Combo: e.g. "2 Set menu 3", "02 bàn Set menu 3", "2 phần Combo couple 4", "2x Set 3", "2 set Set menu 3"
  const leadingMatch = work.match(/^0*(\d+)\s*(?:(?:bàn|ban|phần|phan|suất|suat|gói|goi|mâm|mam|x|\*)\s+|(?:set|combo)\s+(?=(?:set|combo|couple|sm|cc)\b)|\s+)(.+)$/i)
  if (leadingMatch) {
    const candidateRest = leadingMatch[2].trim()
    // Re-check if candidateRest has trailing quantity/notes or is already a canonical Set/Combo name
    const normRest = normalizeSetOrComboName(candidateRest)
    if (/^(?:Set menu \d+|Combo couple \d+|SET \d+K|COMBO \d+ NGƯỜI)$/i.test(normRest)) {
      if (explicitQty === null) explicitQty = parseInt(leadingMatch[1], 10)
      work = candidateRest
    }
  }

  // 3. Check trailing bare hyphen/colon quantity after a Set/Combo identifier: e.g. "Set menu 3 - 2", "Set menu 3: 2"
  const trailingWithIdentMatch = work.match(/^(.+?\b0*(?:[1-9]|1[0-5]))\s*[-–—:]\s*0*(\d+)\s*$/i)
  if (trailingWithIdentMatch) {
    const candidatePrefix = trailingWithIdentMatch[1].trim()
    const normPrefix = normalizeSetOrComboName(candidatePrefix)
    if (/^(?:Set menu \d+|Combo couple \d+)$/i.test(normPrefix)) {
      const q = parseInt(trailingWithIdentMatch[2], 10)
      if (q >= 1 && q <= 100) {
        explicitQty = q
        work = candidatePrefix
      }
    }
  }

  // 4. Also check trailing note separated by dash/colon/comma after Set/Combo identifier:
  //    e.g. "Set menu 3 - đổi lẩu bò thành lẩu nấm"
  const trailingNoteMatch = work.match(/^(.+?\b0*(?:[1-9]|1[0-5]))\s*(?:[-–—:,])\s*([^\d].*)$/i)
  if (trailingNoteMatch) {
    const candidatePrefix = trailingNoteMatch[1].trim()
    const normPrefix = normalizeSetOrComboName(candidatePrefix)
    if (/^(?:Set menu \d+|Combo couple \d+)$/i.test(normPrefix)) {
      customNotes.push(trailingNoteMatch[2].trim())
      work = candidatePrefix
    }
  }

  const canonical = normalizeSetOrComboName(work)
  const identMatch = canonical.match(/^(Set menu|Combo couple)\s+(\d+)$/i)
  if (!identMatch) {
    return null
  }

  const identifierNumber = parseInt(identMatch[2], 10)
  let finalQty = 1
  if (explicitQty !== null && explicitQty >= 1) {
    finalQty = explicitQty
  } else if (existingQty && existingQty >= 1) {
    finalQty = existingQty
  }

  return {
    isSetOrCombo: true,
    canonicalName: `${identMatch[1]} ${identifierNumber}`,
    identifierNumber,
    quantity: finalQty,
    hasExplicitQty: explicitQty !== null,
    customNote: customNotes.join('; ').trim()
  }
}

/**
 * Reverse-match a list of component dish lines (e.g. "1/ Sum Vầy [1]", "2/ Súp Gà...")
 * to the canonical Set menu (1..15) or Combo couple (1..11).
 */
export function detectSetMenuFromComponentLines(
  lines: string[],
  menuList: any[] = [],
  menuDetails: Record<string, string> = {}
): {
  matchedSetName: string
  score: number
  matchedCount: number
  customModifications: string[]
} | null {
  if (!lines || lines.length < 2) return null

  const cleanComp = (s: string) =>
    stripAccents(s)
      .toLowerCase()
      .replace(/^\s*(?:[-•*+>↳]|\d+\s*[\/\.\)])\s*/, '')
      .replace(/\[\d+\]/g, '')
      .replace(/\(\d+(?:\s*con)?\)/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  const inputCleaned = lines.map(l => ({ raw: l.trim(), norm: cleanComp(l) })).filter(x => x.norm.length >= 3)
  if (inputCleaned.length < 2) return null

  // Build candidate set definitions from SETS + menuDetails + menuList
  const setDefs = new Map<string, string>()
  for (const [k, v] of Object.entries(SETS)) {
    if (v && v.trim().length >= 5) setDefs.set(k, v)
  }
  for (const [k, v] of Object.entries(menuDetails || {})) {
    if (v && v.trim().length >= 5 && /set\s*menu|combo\s*couple/i.test(k)) {
      setDefs.set(k, v)
    }
  }
  for (const m of menuList || []) {
    if (m?.name && m?.desc && String(m.desc).trim().length >= 5 && /set\s*menu|combo\s*couple/i.test(m.name)) {
      setDefs.set(m.name, String(m.desc))
    }
  }

  let bestSet = ''
  let bestScore = 0
  let bestMatchedCount = 0
  let bestCanonicalNorms: string[] = []

  for (const [setName, desc] of setDefs.entries()) {
    const canonLines = formatSetNote(desc).split('\n').map(cleanComp).filter(Boolean)
    if (canonLines.length < 3) continue

    let matchedCanon = 0
    for (const cNorm of canonLines) {
      const cWords = cNorm.split(' ').filter(w => w.length > 1)
      const isHit = inputCleaned.some(inp => {
        if (inp.norm === cNorm) return true
        if (cNorm.includes(inp.norm) || inp.norm.includes(cNorm)) return inp.norm.length >= 5
        const iWords = inp.norm.split(' ').filter(w => w.length > 1)
        if (iWords.length >= 2 && cWords.length >= 2) {
          const shared = iWords.filter(w => cWords.includes(w)).length
          return shared / Math.min(iWords.length, cWords.length) >= 0.7
        }
        return false
      })
      if (isHit) matchedCanon++
    }

    const ratio = matchedCanon / canonLines.length
    if (matchedCanon >= 3 && (ratio > bestScore || (ratio === bestScore && matchedCanon > bestMatchedCount))) {
      bestScore = ratio
      bestSet = setName
      bestMatchedCount = matchedCanon
      bestCanonicalNorms = canonLines
    }
  }

  if (!bestSet || bestScore < 0.5) return null

  // Identify any input lines that were modified compared to canonical lines
  const MOD_WORDS = /\b(?:doi|thay|bo|khong\s+lay|khong\s+cay|it\s+cay|them)\b/i
  const customModifications: string[] = []
  for (const inp of inputCleaned) {
    if (MOD_WORDS.test(inp.norm)) {
      customModifications.push(inp.raw)
    }
  }

  return {
    matchedSetName: bestSet,
    score: bestScore,
    matchedCount: bestMatchedCount,
    customModifications
  }
}

export function extractPortionSize(rawName: string): number | string | null {
  const clean = stripAccents(rawName).toLowerCase()
  const match = clean.match(/\b(5|10)\s*(?:con|c)\b/i)
  if (match) return parseInt(match[1])
  if (/\b(?:1\/2|½|nua)\s*con\b/i.test(clean)) return '1/2 con'
  if (/\b(?:0[\.,]5\s*kg|500\s*g|nua\s*kg)\b/i.test(clean)) return '0.5kg'
  if (/\b1\s*kg\b/i.test(clean)) return '1kg'
  if (/\b(?:dia\s*lon|phan\s*lon|lon|size\s*l)\b/i.test(clean)) return 'lớn'
  if (/\b(?:dia\s*nho|phan\s*nho|nho|size\s*s|size\s*m)\b/i.test(clean)) return 'nhỏ'
  return null
}

export function getMenuPortionSize(menuName: string): number | string | null {
  const clean = stripAccents(menuName).toLowerCase()
  const match = clean.match(/\b(5|10)\s*(?:con|c)\b/i)
  if (match) return parseInt(match[1])
  if (/\b(?:1\/2|½|nua)\s*con\b/i.test(clean)) return '1/2 con'
  if (/\b(?:0[\.,]5\s*kg|500\s*g|nua\s*kg)\b/i.test(clean)) return '0.5kg'
  if (/\b1\s*kg\b/i.test(clean)) return '1kg'
  if (/\b(?:dia\s*lon|phan\s*lon|lon|size\s*l)\b/i.test(clean)) return 'lớn'
  if (/\b(?:dia\s*nho|phan\s*nho|nho|size\s*s|size\s*m)\b/i.test(clean)) return 'nhỏ'
  return null
}

export function getBaseDishName(name: string): string {
  let clean = stripAccents(name).toLowerCase().trim()
  // Remove "5 con", "10 con", "5con", "10con"
  clean = clean.replace(/\b(5|10)\s*(?:con|c)\b/gi, '')
  clean = clean.replace(/\b(5|10)(?:con|c)\b/gi, '')
  // Remove 1/2 con, nửa con, 0.5kg, 1kg
  clean = clean.replace(/\b(?:1\/2|½|nua)\s*con\b/gi, '')
  clean = clean.replace(/\b(?:0[\.,]5\s*kg|500\s*g|1\s*kg|nua\s*kg)\b/gi, '')
  // Remove "nho", "lon", "dia lon", "dia nho", "phan lon", "phan nho"
  clean = clean.replace(/\b(?:dia|phan)?\s*(nho|lon)\b/gi, '')
  // Trim extra spaces
  return clean.replace(/\s+/g, ' ').trim()
}

export function normalizeSynonyms(name: string): string {
  const setOrCombo = normalizeSetOrComboName(name)
  if (setOrCombo !== name.trim()) {
    return setOrCombo
  }
  const replacements = [
    { pattern: /\bba\s+roi\b/gi, replacement: 'ba chỉ' },
    { pattern: /\bsườn\s+non\b/gi, replacement: 'dẻ sườn' },
    { pattern: /\bnậm(?:\s+heo)?\b/gi, replacement: 'nầm heo' },
    { pattern: /\bnăm(?:\s+heo)?\b/gi, replacement: 'nầm heo' },
    { pattern: /\bmực\s+sữa\b/gi, replacement: 'mực trứng' },
    { pattern: /\blẩu\s+thái\s+hải\s+sản\b/gi, replacement: 'lẩu thái hs' },
    { pattern: /\b(cơm\s+chiên\s+cá\s+mặn|com\s+chien\s+ca\s+man)(\s+(chà\s+bông|cha\s+bong|ớt\s+hiểm|ot\s+hiem|cay))*\b/gi, replacement: 'cơm chiên cá mặn chà bông ớt hiểm (cay)' },
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

  // First check if this is a Set menu or Combo couple expression
  const setOrComboParsed = extractSetOrComboHeaderAndQty(rawName)
  if (setOrComboParsed) {
    rawName = setOrComboParsed.canonicalName
  } else {
    const qtyMatch = rawName.match(/(?:[x\*])\s*(\d+)\s*$/i)
    if (qtyMatch) {
      rawName = rawName.replace(/(?:[x\*])\s*(\d+)\s*$/i, '').trim()
    }
  }

  // Ensure canonical Set menu 1..15 and Combo couple 1..11 exist in effectiveMenuList when matching Set/Combo
  let effectiveMenuList = menuList
  if (/^(?:Set menu \d+|Combo couple \d+)$/i.test(rawName)) {
    const targetNorm = stripAccents(rawName).toLowerCase().trim()
    const existsInMenu = menuList.some((m: any) => stripAccents(m.name || '').toLowerCase().trim() === targetNorm)
    if (!existsInMenu) {
      effectiveMenuList = [...menuList, ...CANONICAL_SET_AND_COMBO_ITEMS]
    }
  }

  // Strip parenthetical note / discount like "(Giảm 10% tiền thức ăn)" or "(làm không cay)" before matching
  // but protect official menu suffixes like (cay), (chay), (5 con), (10 con)
  const hasExactFullMatch = effectiveMenuList.some((m: any) => stripAccents(m.name).toLowerCase().trim() === stripAccents(rawName).toLowerCase().trim())
  if (!hasExactFullMatch) {
    const parenMatch = rawName.match(/\s*\(([^)]+)\)\s*$/)
    if (parenMatch) {
      const insideParen = parenMatch[1].trim()
      const isOfficialMenuSuffix = effectiveMenuList.some((m: any) => {
        const mNorm = stripAccents(m.name).toLowerCase()
        return mNorm.endsWith(`(${stripAccents(insideParen).toLowerCase()})`)
      })
      if (!isOfficialMenuSuffix && !/^\d+\s*(?:con|c|kg|g|l|ml)$/i.test(insideParen)) {
        rawName = rawName.replace(/\s*\([^)]+\)\s*$/, '').trim()
      }
    }
  }
  
  rawName = normalizeSynonyms(rawName)
  const clean = stripAccents(rawName).toLowerCase().trim()
  if (!clean || clean.length < 2) {
    return { match: null, confidence: 0, needsReview: true, matchType: 'none' }
  }

  // Portion matching override
  const baseRaw = getBaseDishName(rawName)
  const portionCandidates = effectiveMenuList.filter((m: any) => getBaseDishName(m.name) === baseRaw)
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

  // Keep single-digit numbers (1..9) in inputTokens so Set menu 1..9 & Combo couple 1..9 retain their identifier token
  const inputTokens = clean.split(/\s+/).filter(t => t.length > 1 || /^\d+$/.test(t))
  const inputNumbers = clean.match(/\b\d+\b/g) || []
  const isInputNumberedSetOrCombo = /\b(?:set|combo|couple)\b/i.test(clean) && inputNumbers.length > 0
  const hasDirectMenuMatch = effectiveMenuList.some((m: any) => stripAccents(m.name || '').toLowerCase().trim() === clean)

  const candidates: { item: any; score: number; reasons: string[]; risks: string[] }[] = []

  for (const m of effectiveMenuList) {
    let score = 0.0
    const reasons: string[] = []
    const risks: string[] = []
    
    const mClean = stripAccents(m.name).toLowerCase().trim()
    const mTokens = mClean.split(/\s+/)
    const mNumbers = mClean.match(/\b\d+\b/g) || []
    const mAcronym = String(m.acronym || '').toLowerCase().trim()

    // Strict Number Guard for Set menu / Combo couple:
    // Never allow "Set menu 2" to match "Set menu 1" or "Set menu 12", or "Combo couple 3" to match "Combo couple 1"
    if (isInputNumberedSetOrCombo && /\b(?:set|combo|couple)\b/i.test(mClean) && mNumbers.length > 0) {
      if (inputNumbers[0] !== mNumbers[0]) {
        continue
      }
    }
    
    // 1. Exact match (only match acronym if it's exact and not a truncated SM1 for Set menu 10..15)
    const isTruncatedAcronym =
      (mAcronym === 'sm1' && /^set\s+menu\s+1\d$/.test(mClean)) ||
      (mAcronym === 'cc1' && /^combo\s+couple\s+1\d$/.test(mClean))
    if (clean === mClean || (!isTruncatedAcronym && mAcronym === clean)) {
      score = Math.max(score, 1.0)
      reasons.push('exact_match')
    }
    
    // 2. Alias match (Guard against poisoned aliases when input is already an exact dish name in menuList)
    if (!hasDirectMenuMatch || clean === mClean) {
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
    }
    
    // 4. Prefix match (must respect word/digit boundaries so "set menu 1" is NOT a prefix of "set menu 10")
    const isWordBoundaryPrefix =
      (mClean.startsWith(clean) && (mClean.length === clean.length || mClean[clean.length] === ' ')) ||
      (clean.startsWith(mClean) && (clean.length === mClean.length || clean[mClean.length] === ' '))
    if (isWordBoundaryPrefix) {
      const prefixScore = 0.80
      if (prefixScore > score) {
        score = prefixScore
        reasons.push('prefix_match')
      }
    }
    
    // 5. Word / Token overlap (numbers must match exactly, not as substrings like '1' in '10')
    const overlap = inputTokens.filter(t => {
      if (/^\d+$/.test(t)) {
        return mTokens.some(mt => mt === t)
      }
      return mTokens.some(mt => !/^\d+$/.test(mt) && (mt.includes(t) || t.includes(mt)))
    }).length
    if (overlap > 0) {
      const menuOverlapRatio = overlap / Math.max(mTokens.length, 1)
      const inputOverlapRatio = overlap / Math.max(inputTokens.length, 1)
      const overlapScore = menuOverlapRatio * 0.75 + inputOverlapRatio * 0.15
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
    let fuzzyScore = 0.5 * levenshteinScore + 0.5 * jaroWinklerScore
    
    // Giảm mạnh hình phạt nếu không có overlap token
    if (overlap === 0 && !isWordBoundaryPrefix) {
      fuzzyScore *= 0.5 // Phạt nặng nếu không có token overlap và không phải prefix
    }
    
    if (fuzzyScore > score && fuzzyScore >= 0.55) {
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

    if (score >= 0.50) {
      candidates.push({ item: m, score, reasons, risks })
    }
  }

  candidates.sort((a, b) => b.score - a.score)

  if (candidates.length > 0 && candidates[0].score >= 0.65) {
    const best = candidates[0]
    let needsReview = false
    
    if (candidates.length > 1 && !best.reasons.includes('exact_match')) {
      const runnerUp = candidates[1]
      // Nếu top 2 món ăn quá gần nhau về điểm (khoảng cách < 0.1), yêu cầu người dùng xác nhận
      if (best.score - runnerUp.score < 0.1) {
        needsReview = true
      }
    }
    
    if (best.score < 0.75 || (best.reasons.includes('fuzzy_match') && !best.reasons.includes('exact_match') && !best.reasons.includes('alias_match') && best.score < 0.85)) {
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
    const rawStr = item.raw_name || item.name || ''
    const setOrCombo = extractSetOrComboHeaderAndQty(rawStr, item.quantity || item.qty || null)
    const lookupName = setOrCombo ? setOrCombo.canonicalName : rawStr
    const match = fuzzyMatchMenu(lookupName, guestCount, menuList, aliases, fallbackGuestCount)
    const resolvedQty = setOrCombo ? setOrCombo.quantity : (item.quantity || item.qty || 1)
    let note = item.note || ''
    if (setOrCombo?.customNote && !note.includes(setOrCombo.customNote)) {
      note = note ? `${note}; ${setOrCombo.customNote}` : setOrCombo.customNote
    }
    const matchedName = match ? match.name : lookupName
    if (/set|combo|couple/i.test(matchedName)) {
      const desc = resolveSetMenuDescription(matchedName, menuList, SETS)
      if (desc) {
        note = mergeSetComponentNote(note, desc)
      }
    }
    return {
      matched_name: matchedName,
      name: matchedName,
      quantity: resolvedQty,
      unit_price: match ? match.price : (item.unit_price || 0),
      price: match ? match.price : (item.unit_price || 0),
      note
    }
  })
}

export function resolveSetMenuDescription(
  name: string,
  menuList: any[] = [],
  menuDetails: Record<string, string> = {}
): string {
  if (!name) return ''
  const isValidDesc = (d?: string) => typeof d === 'string' && d.trim().length >= 5

  const normalizedName = normalizeSetOrComboName(name)
  if (isValidDesc(menuDetails[normalizedName])) return menuDetails[normalizedName].trim()
  if (isValidDesc(menuDetails[name])) return menuDetails[name].trim()

  const normTarget = stripAccents(normalizedName).toLowerCase().trim()

  for (const [key, desc] of Object.entries(menuDetails)) {
    if (isValidDesc(desc) && stripAccents(key).toLowerCase().trim() === normTarget) {
      return desc.trim()
    }
  }

  const foundItem = menuList.find(i => i.name && stripAccents(i.name).toLowerCase().trim() === normTarget)
  if (foundItem) {
    const itemDesc = foundItem.desc || foundItem.description
    if (isValidDesc(itemDesc)) {
      return String(itemDesc).trim()
    }
  }

  // Exact match in canonical SETS first (prevents "set menu 1" matching "set menu 10")
  for (const [setKey, setVal] of Object.entries(SETS)) {
    const normKey = stripAccents(setKey).toLowerCase().trim()
    if (normTarget === normKey && isValidDesc(setVal)) {
      return setVal.trim()
    }
  }

  // Fallback substring match ONLY for non-numbered legacy sets
  const targetHasNum = /\b\d+\b/.test(normTarget)
  if (!targetHasNum) {
    for (const [setKey, setVal] of Object.entries(SETS)) {
      const normKey = stripAccents(setKey).toLowerCase().trim()
      if ((normTarget.includes(normKey) || normKey.includes(normTarget)) && isValidDesc(setVal)) {
        return setVal.trim()
      }
    }
  }

  return ''
}

/**
 * Consolidate Set menu / Combo couple items and absorb any component sub-dishes
 * that were accidentally extracted as separate items alongside or instead of the Set header.
 */
function consolidateSetMenuItems(
  rawItems: any[],
  menuList: any[] = [],
  menuDetails: Record<string, string> = {}
): any[] {
  if (!rawItems || rawItems.length === 0) return []

  const cleanCompNorm = (s: string) =>
    stripAccents(s)
      .toLowerCase()
      .replace(/^\s*(?:[-•*+>↳]|\d+\s*[\/\.\)])\s*/, '')
      .replace(/\[\d+\]/g, '')
      .replace(/\(\d+(?:\s*con)?\)/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  // Check if a raw item name looks like a Set component line (e.g. "1/ Sum Vầy [1]", "Miến Xào Trứng Tôm [2]")
  const hasComponentMarkers = (s: string) =>
    /^\s*(?:[1-9]|1[0-5])\s*[\/\.\)]\s+\S+/.test(s) || /\[\d+\]\s*$/.test(s)

  // Step A: Find any explicit or generic Set menu / Combo couple items in rawItems
  const setIndices: number[] = []
  for (let i = 0; i < rawItems.length; i++) {
    const rName = String(rawItems[i].raw_name || rawItems[i].name || '').trim()
    const mName = String(rawItems[i].matched_name || '').trim()
    const parsedSet = extractSetOrComboHeaderAndQty(rName) || extractSetOrComboHeaderAndQty(mName)
    const isGenericSet = /^(?:set\s*menu|menu\s*set|combo\s*couple|couple\s*combo)$/i.test(stripAccents(rName).trim())
    if (parsedSet || isGenericSet) {
      setIndices.push(i)
    }
  }

  // Case 1: No explicit Set header in rawItems, check if rawItems (3+ items) are actually a dumped Set menu component list
  if (setIndices.length === 0 && rawItems.length >= 3) {
    const candidateLines = rawItems.map(it => String(it.raw_name || it.name || '').trim()).filter(Boolean)
    const markedCount = candidateLines.filter(hasComponentMarkers).length
    if (markedCount >= 2 || rawItems.length >= 4) {
      const detected = detectSetMenuFromComponentLines(candidateLines, menuList, menuDetails)
      if (detected && (detected.score >= 0.65 || (markedCount >= 3 && detected.score >= 0.5))) {
        return [{
          raw_name: detected.matchedSetName,
          matched_name: detected.matchedSetName,
          quantity: 1,
          note: detected.customModifications.join('\n')
        }]
      }
    }
    return rawItems
  }

  if (setIndices.length === 0) return rawItems

  // Case 2: At least one Set menu / Combo couple item exists in rawItems.
  // Check if non-set items in rawItems are actually the component dishes of the Set menu(s).
  const nonSetIndices = rawItems.map((_, idx) => idx).filter(idx => !setIndices.includes(idx))
  if (nonSetIndices.length === 0) return rawItems

  const nonSetNames = nonSetIndices.map(idx => String(rawItems[idx].raw_name || rawItems[idx].name || '').trim())
  const detectedFromComponents = nonSetNames.length >= 2
    ? detectSetMenuFromComponentLines(nonSetNames, menuList, menuDetails)
    : null

  const absorbedIndices = new Set<number>()

  for (const sIdx of setIndices) {
    const setItem = rawItems[sIdx]
    let rName = String(setItem.raw_name || setItem.name || '').trim()
    const mName = String(setItem.matched_name || '').trim()
    let parsedSet = extractSetOrComboHeaderAndQty(rName, setItem.quantity || setItem.qty || null) ||
                    extractSetOrComboHeaderAndQty(mName, setItem.quantity || setItem.qty || null)

    // If the Set item was generic ("Set menu") or mis-numbered to "Set menu 1" when components clearly belong to another Set
    if (detectedFromComponents && detectedFromComponents.score >= 0.65) {
      const isGeneric = !parsedSet
      const isLikelyMisnumberedSet1 =
        parsedSet &&
        parsedSet.identifierNumber === 1 &&
        detectedFromComponents.matchedSetName !== parsedSet.canonicalName &&
        setItem.quantity &&
        `Set menu ${setItem.quantity}` === detectedFromComponents.matchedSetName

      if (isGeneric || isLikelyMisnumberedSet1) {
        setItem.raw_name = detectedFromComponents.matchedSetName
        setItem.name = detectedFromComponents.matchedSetName
        setItem.matched_name = detectedFromComponents.matchedSetName
        setItem.quantity = 1
        setItem.qty = 1
        rName = detectedFromComponents.matchedSetName
        parsedSet = extractSetOrComboHeaderAndQty(rName, 1)
      }
    }

    const canonicalSetName = parsedSet ? parsedSet.canonicalName : rName
    const desc = resolveSetMenuDescription(canonicalSetName, menuList, menuDetails)
    if (!desc) continue

    const canonSubDishes = formatSetNote(desc)
      .split('\n')
      .flatMap(line => {
        const cleanedLine = cleanCompNorm(line)
        // Also split sub-items inside "Combo Khai Vị: A, B, C" or "Trái Cây/ Tàu Hủ Lạnh/ Bánh Bò Thốt Nốt"
        const subParts = line
          .replace(/^\s*\d+\s*[\/\.\)]\s*/, '')
          .replace(/\[\d+\]/g, '')
          .split(/[:,\/()]/)
          .map(cleanCompNorm)
          .filter(s => s.length >= 4)
        return [cleanedLine, ...subParts]
      })
      .filter(Boolean)

    // Find which nonSetIndices match a canonical component of this Set
    const matchingNonSetIndices: number[] = []
    for (const nsIdx of nonSetIndices) {
      if (absorbedIndices.has(nsIdx)) continue
      const nsRaw = String(rawItems[nsIdx].raw_name || rawItems[nsIdx].name || '').trim()
      const nsNorm = cleanCompNorm(nsRaw)
      if (!nsNorm) continue

      const isCompMatch = canonSubDishes.some(cNorm => {
        if (cNorm === nsNorm) return true
        if (cNorm.includes(nsNorm) || nsNorm.includes(cNorm)) return nsNorm.length >= 5
        const nWords = nsNorm.split(' ').filter(w => w.length > 1)
        const cWords = cNorm.split(' ').filter(w => w.length > 1)
        if (nWords.length >= 2 && cWords.length >= 2) {
          const shared = nWords.filter(w => cWords.includes(w)).length
          return shared / Math.min(nWords.length, cWords.length) >= 0.75
        }
        return false
      })

      if (isCompMatch) {
        matchingNonSetIndices.push(nsIdx)
      }
    }

    // Absorb if items have explicit component markers OR at least 3 component dishes of the Set were dumped
    for (const nsIdx of matchingNonSetIndices) {
      const nsRaw = String(rawItems[nsIdx].raw_name || rawItems[nsIdx].name || '').trim()
      if (hasComponentMarkers(nsRaw) || matchingNonSetIndices.length >= 3) {
        absorbedIndices.add(nsIdx)
        const nsNote = String(rawItems[nsIdx].note || rawItems[nsIdx].notes || '').trim()
        if (nsNote && /\b(?:doi|thay|khong\s+cay|it\s+cay|khong\s+hanh)\b/i.test(stripAccents(nsNote))) {
          setItem.note = setItem.note ? `${setItem.note}; ${nsRaw} (${nsNote})` : `${nsRaw} (${nsNote})`
        }
      }
    }
  }

  return rawItems.filter((_, idx) => !absorbedIndices.has(idx))
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
  const consolidatedRawItems = consolidateSetMenuItems(rawItems, menuList, menuDetails)
  const expandedItems: any[] = []
  
  for (const item of consolidatedRawItems) {
    const rawName = (item.raw_name || item.name || '').trim()
    const isSetOrCombo = !!extractSetOrComboHeaderAndQty(rawName) || /set\s*menu|combo\s*couple/i.test(rawName)
    const parsedSubDishes = isSetOrCombo ? [] : parseDishItems(rawName)
    if (parsedSubDishes.length > 1) {
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
      expandedItems.push({ ...item })
    }
  }

  return expandedItems.map((item) => {
    let rawName = (item.raw_name || item.name || '').trim()
    let extractedCustomNote = ''

    // Special Fast-Path for Set Menu (1..15) & Combo Couple (1..11):
    // Protects Set/Combo identifier numbers from ever being stripped as quantities!
    const setComboCandidate = extractSetOrComboHeaderAndQty(rawName, item.quantity || item.qty || null) ||
                              extractSetOrComboHeaderAndQty(item.matched_name || '', item.quantity || item.qty || null)
    if (setComboCandidate) {
      rawName = setComboCandidate.canonicalName
      item.quantity = setComboCandidate.quantity
      if (setComboCandidate.customNote) {
        extractedCustomNote = setComboCandidate.customNote
      }
    } else {
      // 0. Extract trailing custom note if it's placed after quantity (e.g. "... x4 (làm không cay)")
      const trailingParenCustomNote = rawName.match(/\s*\(([^)]+)\)\s*$/)
      if (trailingParenCustomNote) {
        const inside = trailingParenCustomNote[1].trim()
        const isOfficialMenuSuffix = menuList.some((m: any) => {
          const mNorm = stripAccents(m.name).toLowerCase()
          return mNorm.endsWith(`(${stripAccents(inside).toLowerCase()})`)
        })
        const isParenQty = /^(?:[x\*]\s*\d+|\d+\s*(?:[x\*]|phần|phan|đĩa|dia|suất|suat|bàn|ban|set|combo|lon|chai|ly|tháp|thap|nồi|noi))$/i.test(inside)
        if (!isOfficialMenuSuffix && !isParenQty && !/^\d+\s*(?:con|c|kg|g|l|ml)$/i.test(inside)) {
          extractedCustomNote = inside
          rawName = rawName.replace(/\s*\([^)]+\)\s*$/, '').trim()
        }
      }

      // Kiểm tra xem số ở đầu có phải là quy cách khẩu phần (vd: "5 con", "10 con", "1/2 con", "0.5kg") hay không
      const isPortionPrefix = /^(?:(?:5|10)\s*(?:con|c)|1\/[2348]\s*con|½\s*con|nửa\s*con|nua\s*con|0[\.,]\d+\s*kg|\d+\s*(?:kg|g|l|ml)|dĩa\s*(?:lớn|nhỏ|lon|nho)|phan\s*(?:lon|nho))\b/i.test(rawName)
      let hadLeadingQty = false

      // 1. Trích xuất số lượng có từ "phần", "dĩa", "suất", "bàn", "set", "x" ở đầu: e.g. "2 phần hàu 5 con", "2x gà 1/2 con"
      const explicitLeadingQtyMatch = rawName.match(/^(?:(\d+)\s*(?:phần|phan|đĩa|dia|suất|suat|bàn|ban|set|x|\*)\s+)(.+)$/i)
      if (explicitLeadingQtyMatch) {
        item.quantity = parseInt(explicitLeadingQtyMatch[1], 10) || item.quantity || 1
        rawName = explicitLeadingQtyMatch[2].trim()
        hadLeadingQty = true
      } else if (!isPortionPrefix) {
        // Trích xuất số lượng đứng ở đầu tên món thông thường (vd: "2 cơm chiên hải sản", "2 miến xào cua", "10 Coca", "25 chai suối")
        const leadingQtyMatch = rawName.match(/^(\d+)\s+(.+)$/)
        if (leadingQtyMatch) {
          const extractedQty = parseInt(leadingQtyMatch[1], 10)
          // Chỉ nhận là số lượng nếu phần sau không bắt đầu bằng đơn vị con/kg/g
          if (!/^(?:con|c|kg|g|l|ml)\b/i.test(leadingQtyMatch[2].trim())) {
            rawName = leadingQtyMatch[2].trim()
            hadLeadingQty = true
            if (!item.quantity || item.quantity === 1) {
              item.quantity = extractedQty
            }
          }
        }
      }

      // Check again if stripping leading quantity revealed a Set menu / Combo couple (e.g. "2 Set menu 3")
      const postLeadingSetCheck = extractSetOrComboHeaderAndQty(rawName, item.quantity)
      if (postLeadingSetCheck) {
        rawName = postLeadingSetCheck.canonicalName
        if (postLeadingSetCheck.hasExplicitQty) {
          item.quantity = postLeadingSetCheck.quantity
        }
        if (postLeadingSetCheck.customNote) {
          extractedCustomNote = extractedCustomNote
            ? `${extractedCustomNote}; ${postLeadingSetCheck.customNote}`
            : postLeadingSetCheck.customNote
        }
      } else {
        // 2. Trích xuất số lượng ở cuối tên món (vd: "cơm chiên hải sản x 2", "khoai tây chiên 5", "cánh gà -5", "cá diêu hồng (x3)")
        // Bảo vệ tên món có sẵn số trong menu (vd: "7up", "555", "Set 199k")
        const fullRawMatchesMenu = menuList.some(
          (m: any) => stripAccents(m.name || '').toLowerCase().trim() === stripAccents(rawName).toLowerCase().trim()
        )
        const qtyMatch = rawName.match(/(?:\((?:[x\*])\s*(\d+)\)|\(\s*(\d+)\s*(?:phần|phan|đĩa|dia|suất|suat|bàn|ban|set)\s*\)|(?:[x\*]|\bphần|\bphan|\bđĩa|\bdia|\bsuất|\bsuat|\bbàn|\bban|\bset)\s*(\d+)|(?:[-–—]\s*|\s+)(\d+))\s*$/i)
        if (qtyMatch) {
          const explicitTrailingQty = qtyMatch[1] || qtyMatch[2] || qtyMatch[3]
          const bareTrailingQty = qtyMatch[4]
          const candidatePrefix = rawName.slice(0, qtyMatch.index).trim()
          const isSetPrefix = /\b(?:set(?:\s+menu)?|combo(?:\s+couple|\s+2\s*nguoi|\s+doi)?|couple|menu\s+set|sm|cc)\s*(?:so|#)?$/i.test(
            stripAccents(candidatePrefix)
          )

          if (explicitTrailingQty) {
            const parsedQty = parseInt(explicitTrailingQty, 10)
            if (parsedQty >= 1 && parsedQty <= 100) {
              item.quantity = parsedQty
              rawName = candidatePrefix
            }
          } else if (bareTrailingQty && !hadLeadingQty && !fullRawMatchesMenu && !isSetPrefix) {
            const parsedQty = parseInt(bareTrailingQty, 10)
            if (parsedQty >= 1 && parsedQty <= 100) {
              item.quantity = parsedQty
              rawName = candidatePrefix
            }
          }
        }
      }

      // 2b. Check if there is still a custom parenthetical note before quantity
      const preQtyParenNote = rawName.match(/\s*\(([^)]+)\)\s*$/)
      if (preQtyParenNote) {
        const inside = preQtyParenNote[1].trim()
        const isOfficialMenuSuffix = menuList.some((m: any) => {
          const mNorm = stripAccents(m.name).toLowerCase()
          return mNorm.endsWith(`(${stripAccents(inside).toLowerCase()})`)
        })
        if (!isOfficialMenuSuffix && !/^\d+\s*(?:con|c|kg|g|l|ml)$/i.test(inside)) {
          extractedCustomNote = extractedCustomNote ? `${extractedCustomNote} - ${inside}` : inside
          rawName = rawName.replace(/\s*\([^)]+\)\s*$/, '').trim()
        }
      }
    }

    // 3. Trích xuất khẩu phần để bổ sung vào note nếu cần
    const detectedPortion = extractPortionSize(rawName)

    const { match, confidence, needsReview, matchType } = scoreAndMatchMenu(
      rawName,
      guestCount,
      menuList,
      menuAliases,
      fallbackGuestCount
    )

    if (match) {
      let note = item.note || item.notes || ''
      if (extractedCustomNote && !note.includes(extractedCustomNote)) {
        note = note ? `${note} (${extractedCustomNote})` : extractedCustomNote
      }
      if (detectedPortion && !note.includes(String(detectedPortion)) && !match.name.includes(String(detectedPortion))) {
        note = note ? `${note} (${detectedPortion})` : String(detectedPortion)
      }
      const isSet = /set|combo|goi|phan|couple/i.test(match.name) || /set|combo|goi|phan|couple/i.test(rawName)
      const validMatchDesc = match.desc && String(match.desc).trim().length >= 5 ? String(match.desc).trim() : ''
      const description =
        resolveSetMenuDescription(match.name, menuList, menuDetails) ||
        validMatchDesc ||
        resolveSetMenuDescription(rawName, menuList, menuDetails)

      if (description) {
        if (isSet) {
          note = mergeSetComponentNote(note, description)
        } else {
          const formattedNote = formatSetNote(description)
          if (!note.includes(description) && !note.includes(formattedNote)) {
            note = note ? `${note} (${description})` : description
          }
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
        needsReview,
        matchType,
        match_type: matchType,
        warning: confidence < 0.75 ? 'dish_fuzzy_match_low_confidence' : undefined
      }
    } else {
      if (logCallback) logCallback(`[Khớp món] Không tìm thấy món khớp cho "${rawName}"`, 'error')
      let note = item.note || item.notes || ''
      if (extractedCustomNote && !note.includes(extractedCustomNote)) {
        note = note ? `${note} (${extractedCustomNote})` : extractedCustomNote
      }
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
        note: note.trim(),
        match_confidence: 0.0,
        confidence: 0.0,
        needs_review: true,
        needsReview: true,
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
  const rawActiveValid = isValidMenuSheetName(activeSheet) ? normalizeMenuSheetName(activeSheet) : ''
  const sheets = filterValidMenuSheets(
    Object.keys(allMenus || {}).filter(s => isValidMenuSheetName(s) && isValidMenuItemsDataset(allMenus[s]))
  )
  const safeActiveSheet = rawActiveValid || (sheets.includes(PRIMARY_MENU_SHEET) ? PRIMARY_MENU_SHEET : '')
  let bestSheet = safeActiveSheet
  let maxScore = 0
  const scores: Record<string, number> = {}
  const dishScores: Record<string, number> = {}
  if (sheets.length === 0) return { bestSheet, score: 0, isBorderline: false }

  const normalizedText = stripAccents(text).toLowerCase()

  for (const sheet of sheets) {
    let score = 0
    let dishScore = 0
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
      if (found) {
        score += 1
        dishScore += 1
      }
    }

    scores[sheet] = score
    dishScores[sheet] = dishScore
    if (
      score > maxScore ||
      (score === maxScore && score > 0 && (sheet === safeActiveSheet || sheet === PRIMARY_MENU_SHEET))
    ) {
      maxScore = score
      bestSheet = sheet
    }
  }

  // Prefer keeping the currently active menu (especially official MENU2026) unless another menu
  // strictly matches MORE actual ordered dishes rather than generic event keywords.
  const activeScore = safeActiveSheet && scores[safeActiveSheet] !== undefined ? scores[safeActiveSheet] : 0
  const activeDishScore = safeActiveSheet && dishScores[safeActiveSheet] !== undefined ? dishScores[safeActiveSheet] : 0
  if (safeActiveSheet && bestSheet !== safeActiveSheet) {
    const bestDishScore = dishScores[bestSheet] || 0
    if (
      parsedItems.length === 0 ||
      maxScore <= activeScore ||
      bestDishScore <= activeDishScore
    ) {
      bestSheet = safeActiveSheet
      maxScore = activeScore
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

/**
 * Post-dedup: Merge items that matched to the same dish (same matched_name + same note).
 * This handles cases where the same dish is extracted twice under different raw names.
 */
export function deduplicateMatchedItems(
  items: any[],
  logCallback?: (msg: string, level?: string) => void
): any[] {
  if (!items || items.length <= 1) return items

  const dedupMap = new Map<string, any>()
  const mergedLog: string[] = []

  for (const item of items) {
    const matchedName = (item.matched_name || item.name || item.matchedName || '').trim()
    const note = (item.note || '').trim()
    // Only dedup items that were actually matched (confidence > 0)
    const confidence = item.match_confidence || item.confidence || 0
    if (!matchedName || confidence <= 0) {
      // Unmatched items: keep as-is with a unique key
      const uniqueKey = `__unmatched_${dedupMap.size}__`
      dedupMap.set(uniqueKey, { ...item })
      continue
    }

    const key = `${stripAccents(matchedName).toLowerCase()}_${stripAccents(note).toLowerCase()}`

    if (dedupMap.has(key)) {
      const existing = dedupMap.get(key)
      const oldQty = existing.quantity || existing.qty || 1
      const addQty = item.quantity || item.qty || 1
      existing.quantity = oldQty + addQty
      existing.qty = oldQty + addQty
      existing.auto_merged = true
      mergedLog.push(`Gộp "${matchedName}" (${oldQty} + ${addQty} = ${existing.quantity})`)
    } else {
      dedupMap.set(key, { ...item })
    }
  }

  if (mergedLog.length > 0 && logCallback) {
    logCallback(`[Dedup] ${mergedLog.join('; ')}`, 'info')
  }

  return Array.from(dedupMap.values())
}
