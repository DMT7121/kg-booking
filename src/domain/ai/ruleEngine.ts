import { stripAccents, cleanPhoneNumber, formatVND } from '@/utils'

export interface TableCode {
  zone: string
  number: string
  raw: string
}

export interface HardEntities {
  phones: Array<{ value: string; confidence: number; warning?: string }>
  dates: Array<{ value: string; confidence: number; raw: string }>
  times: Array<{ value: string; confidence: number; raw: string }>
  guestCounts: Array<{ value: number; confidence: number; raw: string }>
  tables: Array<{ zone: string; number: string; raw: string; confidence: number }>
}

export interface InputSegment {
  raw: string
  lineIndex: number
  type?: 'table' | 'name' | 'phone' | 'datetime' | 'guest_count' | 'purpose' | 'staff' | 'menu' | 'note' | 'unknown'
  confidence: number
  extracted?: Record<string, any>
}

export function parseTableCodes(input: string): TableCode[] {
  if (!input) return []
  const results: TableCode[] = []
  let s = stripAccents(input).toUpperCase().trim()
  
  // Normalize "BAN 5" -> "A5", "TABLE 12" -> "A12"
  s = s.replace(/\b(BAN|TABLE|GHE)\s+(\d+)\b/g, 'A$2')
  
  s = s.replace(/[+\/]/g, ',')
  s = s.replace(/\b([A-G])(\d+)\s*[-–—]\s*([A-G])?(\d+)\b/gi, (match, z1, n1, z2, n2) => {
    const zone = z1.toUpperCase()
    const start = parseInt(n1)
    const end = parseInt(n2)
    if (!isNaN(start) && !isNaN(end) && start <= end && end - start <= 10) {
      const generated: string[] = []
      for (let i = start; i <= end; i++) {
        generated.push(`${zone}${i}`)
      }
      return generated.join(',')
    }
    return match
  })
  
  const tokens = s.split(/[,\s]+/).filter(Boolean)
  let currentZone = 'A'
  let lastTableIdx = -99
  
  for (let idx = 0; idx < tokens.length; idx++) {
    const token = tokens[idx]
    
    const fullMatch = token.match(/^([A-G])(\d+)$/)
    if (fullMatch) {
      currentZone = fullMatch[1]
      results.push({ zone: currentZone, number: fullMatch[2], raw: token })
      lastTableIdx = idx
      continue
    }
    
    const numMatch = token.match(/^(\d+)$/)
    if (numMatch) {
      const nextToken = tokens[idx + 1] || ''
      const isNextUnit = /^(NG|NGUOI|KHACH|PAX|TUOI|T|TRE|LON|NHO|NAM|THANG|CUOI)$/i.test(nextToken)
      
      if (idx - lastTableIdx <= 2 && !isNextUnit) {
        results.push({ zone: currentZone, number: numMatch[1], raw: currentZone + numMatch[1] })
        lastTableIdx = idx
      }
      continue
    }
    
    const zoneMatch = token.match(/^([A-G])$/)
    if (zoneMatch) {
      currentZone = zoneMatch[1]
      results.push({ zone: currentZone, number: '', raw: token })
      lastTableIdx = idx
      continue
    }
  }
  return results
}

export function parseDishItems(input: string): Array<{ name: string; qty: number }> {
  const results: Array<{ name: string; qty: number }> = []
  let cleanInput = input.trim()
  if (!cleanInput) return []

  // Pre-extract trailing quantity multiplier like "x2", "x 4", "*5", "(x3)"
  let baseQty = 1
  const qtyMatch = cleanInput.match(/(?:\((?:[x\*])\s*(\d+)\)|(?:[x\*])\s*(\d+))\s*$/i)
  if (qtyMatch) {
    const qtyStr = qtyMatch[1] || qtyMatch[2]
    baseQty = parseInt(qtyStr, 10)
    cleanInput = cleanInput.replace(/(?:\((?:[x\*])\s*(\d+)\)|(?:[x\*])\s*(\d+))\s*$/i, '').trim()
  }

  const regex = /(\d+)\s*([\p{L}\s]+)(?=\s*\d|$)/gu
  let match
  while ((match = regex.exec(cleanInput)) !== null) {
    const qty = parseInt(match[1])
    const name = match[2].trim()
    if (name.length > 2) {
      results.push({ name, qty })
    }
  }
  if (results.length === 0) {
    const suffixRegex = /([\p{L}\s]+?)\s*(?:x)?\s*(\d+)(?=\s*[\p{L}]|$)/gu
    while ((match = suffixRegex.exec(cleanInput)) !== null) {
      const name = match[1].trim()
      const qty = parseInt(match[2])
      if (name.length > 2) {
        const lowerName = stripAccents(name).toLowerCase()
        const isSetOrCombo = /(?:^|\s)(set\s*menu|set|combo|thuc\s*don|thực\s*đơn)(?:\s+)?$/i.test(lowerName)
        if (isSetOrCombo) {
          // Keep the trailing number as part of the set/combo name, do not treat as quantity here
        } else {
          results.push({ name, qty })
        }
      }
    }
  }
  if (results.length === 0 && cleanInput) {
    results.push({ name: cleanInput, qty: 1 })
  }
  return results.map(r => ({ name: r.name, qty: r.qty * baseQty }))
}

export function segmentInputBlocksCompat(text: string) {
  const blocks = {
    customer_block: [] as string[],
    booking_time_block: [] as string[],
    guest_count_block: [] as string[],
    menu_block: [] as string[],
    decoration_block: [] as string[],
    deposit_block: [] as string[],
    note_block: [] as string[]
  }
  
  const lines = text.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const lower = stripAccents(trimmed).toLowerCase()
    
    if (/happy birthday|hbd|chuc mung|bang chu|bong bay|trang tri/i.test(lower)) {
      blocks.decoration_block.push(trimmed)
      continue
    }
    if (/da chuyen|coc|ck|bill|ngan hang|chuyen khoan|ref/i.test(lower)) {
      blocks.deposit_block.push(trimmed)
      continue
    }
    const isGuestLine = /(\d+)\s*(?:pax|nguoi|người|ng|khach|khách|cho)/gi.test(lower) || /nguoi lon|tre em|lon.*nho|be/i.test(lower)
    if (isGuestLine) {
      blocks.guest_count_block.push(trimmed)
    }
    const hasTime = /\b\d{1,2}:\d{2}\b/gi.test(lower) || /\b\d{1,2}h\d{2}\b/gi.test(lower) || /\b\d{1,2}h\b/gi.test(lower)
    const hasDate = /\b\d{2}\/\d{2}\/\d{4}\b/gi.test(lower) || /ngay/i.test(lower)
    if (hasTime || hasDate) {
      blocks.booking_time_block.push(trimmed)
    }
    const hasPhone = /(0[35789]\d{7,9})/g.test(lower)
    const hasCustomerKeywords = /anh|chi|dat ban|khach/i.test(lower)
    if (hasPhone || hasCustomerKeywords) {
      blocks.customer_block.push(trimmed)
    }
    const isMenuLine = (/^\d+\s+[\p{L}\s]+/ui.test(lower) || /combo|set menu|thuc don/i.test(lower)) &&
                       !hasTime && !hasDate && !hasPhone && !isGuestLine
    if (isMenuLine) {
      blocks.menu_block.push(trimmed)
    }
    
    const matchedAny = 
      blocks.decoration_block.includes(trimmed) ||
      blocks.deposit_block.includes(trimmed) ||
      blocks.guest_count_block.includes(trimmed) ||
      blocks.booking_time_block.includes(trimmed) ||
      blocks.customer_block.includes(trimmed) ||
      blocks.menu_block.includes(trimmed)
      
    if (!matchedAny) {
      blocks.note_block.push(trimmed)
    }
  }
  
  return {
    customer_block: blocks.customer_block.join('\n'),
    booking_time_block: blocks.booking_time_block.join('\n'),
    guest_count_block: blocks.guest_count_block.join('\n'),
    menu_block: blocks.menu_block.join('\n'),
    decoration_block: blocks.decoration_block.join('\n'),
    deposit_block: blocks.deposit_block.join('\n'),
    note_block: blocks.note_block.join('\n')
  }
}

export function cleanHonorificPrefix(name: string): string {
  let cleaned = name.trim()
  const honorifics = ['anh', 'chi', 'chị', 'em', 'chu', 'chú', 'co', 'cô', 'ong', 'ông', 'ba', 'bà', 'be', 'bé', 'bac', 'bác', 'khach', 'khách', 'mr', 'ms', 'mrs', 'la', 'là']
  for (const h of honorifics) {
    const regex = new RegExp(`^(?:${h})\\s+`, 'i')
    if (regex.test(cleaned)) {
      cleaned = cleaned.replace(regex, '').trim()
    }
  }
  return cleaned
}

export const AMBIGUOUS_VIETNAMESE_NAME_TOKENS = new Set([
  'nam', 'mai', 'dat', 'đạt', 'son', 'sơn', 'hanh', 'hạnh', 'oanh', 'vui',
  'bang', 'bằng', 'hai', 'hải', 'phuc', 'phúc', 'tam', 'tâm', 'hien', 'hiền',
  'dung', 'dũng', 'loan', 'lanh', 'lành'
])

export function evaluateNameConfidence(name: string, normalizedText: string): {
  confidence: number
  signals: string[]
  risks: string[]
} {
  const nameClean = (name || '').trim()
  const nameCleanLower = nameClean.toLowerCase()
  const nameCleanNoAccent = stripAccents(nameCleanLower)
  const words = nameCleanLower.split(/\s+/).filter(Boolean)
  const isSingleToken = words.length === 1
  
  let score = 0.80 // base confidence
  const signals: string[] = []
  const risks: string[] = []

  const hasAmbiguousToken = words.some(w => {
    const noAccent = stripAccents(w)
    return AMBIGUOUS_VIETNAMESE_NAME_TOKENS.has(w) || AMBIGUOUS_VIETNAMESE_NAME_TOKENS.has(noAccent)
  })

  if (isSingleToken && hasAmbiguousToken) {
    score -= 0.35
    risks.push('ambiguous_single_token_name')
  }

  const escapedName = nameClean.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
  const honorificRegex = new RegExp(`\\b(anh|chi|chị|em|chu|chú|co|cô|ong|ông|ba|bà|be|bé|bac|bác|khach|khách)\\s+${escapedName}\\b`, 'i')
  if (honorificRegex.test(normalizedText)) {
    score += 0.20
    signals.push('honorific_before_name')
  }

  const introRegex = new RegExp(`\\b(ten la|tên là|ten em la|tên em là|ten anh la|tên anh là|ten chi la|tên chị là|minh la|mình là|em la|em là|anh la|anh là|chi la|chị là)\\s+${escapedName}\\b`, 'i')
  if (introRegex.test(normalizedText)) {
    score += 0.35
    signals.push('introduction_phrase')
  }

  const contactPrefixRegex = new RegExp(`\\b(lien he|liên hệ|sdt|sđt)\\s+(?:anh\\s+|chi\\s+|chị\\s+)?${escapedName}\\b`, 'i')
  if (contactPrefixRegex.test(normalizedText)) {
    score += 0.25
    signals.push('contact_prefix')
  }

  const phoneRegex = /(0[35789]\d{7,9})/g
  const matches = [...normalizedText.matchAll(phoneRegex)]
  if (matches.length > 0) {
    const nameIndex = normalizedText.toLowerCase().indexOf(nameCleanLower)
    if (nameIndex !== -1) {
      const nameEnd = nameIndex + nameClean.length
      const hasPhoneNearby = matches.some(m => {
        const phoneIdx = m.index!
        const dist = phoneIdx < nameIndex ? (nameIndex - (phoneIdx + m[0].length)) : (phoneIdx - nameEnd)
        return dist >= 0 && dist <= 35
      })
      if (hasPhoneNearby) {
        score += 0.35
        signals.push('phone_nearby')
      }
    }
  }

  if (words.length >= 2) {
    score += 0.15
    signals.push('multi_token_name')
  }

  if (nameCleanNoAccent === 'mai') {
    const maiContextRegex = new RegExp(`\\b(ngay|ngày|toi|tối|chieu|chiều|trua|trưa|sang|sáng|den|đến|hen|hẹn|thoi|thôi)\\s+${escapedName}\\b`, 'i')
    if (maiContextRegex.test(normalizedText)) {
      score -= 0.40
      risks.push('mai_time_context')
    }
    const maiAskRegex = new RegExp(`${escapedName}\\s+(?:dat\\s+)?(?:duoc|được)\\s+(?:khong|không)`, 'i')
    if (maiAskRegex.test(normalizedText)) {
      score -= 0.25
      risks.push('ask_context')
    }
  }

  if (nameCleanNoAccent === 'son' || nameCleanNoAccent === 'sơn') {
    const sonVerbRegex = new RegExp(`\\b(nuoc|nước|son|sơn)\\s+${escapedName}\\b|\\b${escapedName}\\s+(lai|lại|tuong|tường)\\b`, 'i')
    if (sonVerbRegex.test(normalizedText)) {
      score -= 0.40
      risks.push('son_verb_context')
    }
  }

  if (nameCleanNoAccent === 'vui') {
    const vuiPhraseRegex = new RegExp(`\\b${escapedName}\\s+(long|lòng|ve|vẻ)\\b`, 'i')
    if (vuiPhraseRegex.test(normalizedText)) {
      score -= 0.40
      risks.push('vui_phrase_context')
    }
  }

  if (nameCleanNoAccent === 'bang' || nameCleanNoAccent === 'bằng') {
    const bangPhraseRegex = new RegExp(`\\b${escapedName}\\s+(momo|ck|chuyen|chuyển|tien|tiền|the|thẻ|mat|mặt|va|và)\\b|\\b(dat|đặt|thanh\\s+toan|thanh\\s+toán|tra|trả)\\s+${escapedName}\\b`, 'i')
    if (bangPhraseRegex.test(normalizedText)) {
      score -= 0.40
      risks.push('bang_preposition_context')
    }
  }

  if (nameCleanNoAccent === 'dat' || nameCleanNoAccent === 'đạt') {
    const datVerbRegex = new RegExp(`\\b(dat|đặt)\\s+(ban|bàn|truoc|trước|mon|món|cho|viet|viết)\\b|\\b${escapedName}\\s+(chua|chưa)\\b`, 'i')
    if (datVerbRegex.test(normalizedText)) {
      score -= 0.40
      risks.push('dat_verb_context')
    }
  }

  if (nameCleanNoAccent === 'nam') {
    const namGenderRegex = new RegExp(`\\b(?:nguoi|người|khach|khách|lon|lớn|pax|\\d+)\\s+${escapedName}\\b|\\b${escapedName}\\s+(lon|lớn|nu|nữ|nguoi|người|khach|khách)\\b`, 'i')
    if (namGenderRegex.test(normalizedText)) {
      score -= 0.40
      risks.push('nam_noun_context')
    }
  }

  // Check if message is too short and lacks booking context
  const hasPhone = phoneRegex.test(normalizedText)
  const hasDate = /\b\d{1,2}[\/\.\-]\d{1,2}\b/g.test(normalizedText) || /ngay|ngày/i.test(normalizedText)
  const hasTime = /\b\d{1,2}[h:]/i.test(normalizedText)
  if (normalizedText.length < 25 && !hasPhone && !hasDate && !hasTime) {
    score -= 0.20
    risks.push('short_message_no_context')
  }

  const finalScore = parseFloat(Math.min(1.0, Math.max(0.0, score)).toFixed(2))
  return {
    confidence: finalScore,
    signals,
    risks
  }
}

export function classifyPeopleNames(text: string) {
  const peopleNames: string[] = []
  const bookerCandidates: string[] = []
  const partyOwnerCandidates: string[] = []
  
  const invalidNameSet = new Set(['ban', 'giup', 'minh', 'toi', 'ngay', 'gio', 'pax', 'khach', 'nguoi', 'sdt', 'lien', 'he', 'cho', 'duoc', 'khong', 'nhe', 'nha', 'ho', 'lam', 'sao', 'nao', 'chua', 'co', 'hoi', 'hỏi', 'xin', 'xem', 'gui', 'gửi', 'nhan', 'nhận', 'co', 'có', 'con', 'còn', 'la', 'là'])

  const lines = text.split('\n')
  for (const line of lines) {
    const lineClean = line.trim()
    if (!lineClean) continue
    
    // Extract capitalized words next to phone numbers as candidates
    const phoneRegex = /(0[35789]\d{7,9})/g
    let phoneMatch
    while ((phoneMatch = phoneRegex.exec(lineClean)) !== null) {
      const phoneIndex = phoneMatch.index!
      const beforeText = lineClean.slice(Math.max(0, phoneIndex - 20), phoneIndex).trim()
      const afterText = lineClean.slice(phoneIndex + phoneMatch[0].length, phoneIndex + phoneMatch[0].length + 20).trim()
      
      // Look for a single word before the phone
      const beforeWords = beforeText.split(/\s+/)
      const lastWord = beforeWords[beforeWords.length - 1]
      if (lastWord && /^[A-Z\p{Lu}][\p{Ll}]+$/u.test(lastWord)) {
        const cleanName = cleanHonorificPrefix(lastWord)
        if (cleanName && !/^(nay|kia|truoc|sau|sang|chieu|toi|ngay|gio|pax|khach|nguoi|ban|mon|set|combo|happy|birthday|hbd|hpbd|sinh|nhat|thoi|noi|giup|giom|cho|sdt|lien|he|table|pax|duoc|khong)$/i.test(stripAccents(cleanName))) {
          const nameWords = stripAccents(cleanName).toLowerCase().split(/\s+/)
          const hasInvalidWord = nameWords.some(w => invalidNameSet.has(w))
          if (!hasInvalidWord && !peopleNames.includes(cleanName)) {
            peopleNames.push(cleanName)
          }
        }
      }
      
      // Look for a single word after the phone
      const afterWords = afterText.split(/\s+/)
      const firstWord = afterWords[0]
      if (firstWord && /^[A-Z\p{Lu}][\p{Ll}]+$/u.test(firstWord)) {
        const cleanName = cleanHonorificPrefix(firstWord)
        if (cleanName && !/^(nay|kia|truoc|sau|sang|chieu|toi|ngay|gio|pax|khach|nguoi|ban|mon|set|combo|happy|birthday|hbd|hpbd|sinh|nhat|thoi|noi|giup|giom|cho|sdt|lien|he|table|pax|duoc|khong)$/i.test(stripAccents(cleanName))) {
          const nameWords = stripAccents(cleanName).toLowerCase().split(/\s+/)
          const hasInvalidWord = nameWords.some(w => invalidNameSet.has(w))
          if (!hasInvalidWord && !peopleNames.includes(cleanName)) {
            peopleNames.push(cleanName)
          }
        }
      }
    }

    const nameRegex = /(?:anh|chị|em|chú|cô|ông|bà|anh|chi|em|chu|co|ong|ba|bé|be|khách|khach|tên|ten|đặt|dat|cho|liên hệ|lien he)\s+(\p{L}+(?:\s+(?!cho\b|dat\b|đặt\b|dat\s+ban|đặt\s+bàn|xin\b|gui\b|gửi\b|nha\b|nhà\b|ngay\b|ngày\b|luc\b|lúc\b|vao\b|vào\b|sdt\b|sđt\b|ban\b|bàn\b)\p{L}+){0,3})/gui
    let match
    while ((match = nameRegex.exec(lineClean)) !== null) {
      let name = match[1].trim()
      name = cleanHonorificPrefix(name)
      if (name.length <= 1) continue
      if (/^(nay|kia|truoc|sau|sang|chieu|toi|ngay|gio|pax|khach|nguoi|ban|mon|set|combo|happy|birthday|hbd|hpbd|sinh|nhat|thoi|noi|giup|giom|cho|sdt|lien|he|table|pax|duoc|khong)$/i.test(stripAccents(name))) {
        continue
      }
      // Bộ lọc từ cấm cho tên khớp từ regex nameRegex:
      const nameWords = stripAccents(name).toLowerCase().split(/\s+/)
      const hasInvalidWord = nameWords.some(w => invalidNameSet.has(w))
      if (hasInvalidWord) continue

      if (!peopleNames.includes(name)) {
        peopleNames.push(name)
      }
    }

    let cleanLine = lineClean
      .replace(/(0[35789]\d{7,9})/g, '')
      .replace(/\b\d{1,2}[h:]\d{2}?\b/gi, '')
      .replace(/\b\d{1,2}[\/\.\-]\d{1,2}(?:[\/\.\-]\d{2,4})?\b/g, '')
      .replace(/[0-9()\-–—:+.,\/[\]]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    const cleanWords = cleanLine.split(/\s+/).filter(Boolean)
    if (cleanWords.length >= 2 && cleanWords.length <= 5) {
      const isPureLetters = cleanWords.every(w => /^\p{L}+$/u.test(w))
      const stopWords = new Set([
        'ngay', 'mai', 'hom', 'nay', 'kia', 'mot', 'tuan', 'thang', 'nam',
        'gio', 'luc', 'tam', 'khoang', 'sang', 'trua', 'chieu', 'toi',
        'pax', 'nguoi', 'khach', 'ban', 'table', 'ghe',
        'sinh', 'nhat', 'thoi', 'noi', 'hop', 'lop', 'lien', 'hoan', 'tiec', 'cuoi', 'hpbd', 'hbd', 'sn', 'mung', 'tho', 'tieu', 'ca', 'nhac',
        'coc', 'ck', 'chuyen', 'khoan', 'bill', 'bank', 'banking', 'momo',
        'mon', 'an', 'menu', 'combo', 'set', 'lau', 'nuong', 'xao', 'hap', 'bo', 'ga', 'heo', 'suon', 'de', 'tom', 'cua', 'muc',
        'nv', 'dmt', 'nhan', 'gui', 'nha', 'giup', 'giom', 'sdt', 'lien', 'he',
        'an', 'thuong', 'lon', 'nho', 'be', 'tre', 'em',
        'yeu', 'cau', 'trang', 'tri', 'phong', 'lanh', 'sanh', 'may', 'ngoai', 'troi', 'san', 'khau', 'gan', 'bong', 'bay', 'board', 'chu', 
        'thiet', 'ke', 'bao', 'gia', 'thuc', 'don', 'uong', 'tien', 'giam', 'gia', 'khuyen', 'mai', 'tang', 'banh', 'kem', 'hoa', 'nen', 
        'hat', 'acoustic', 'phuc', 'vu', 'nhan', 'vien', 'ho', 'tro', 'chu', 'dao', 'nhiet', 'tinh', 'phi', 'dich', 'vu', 'free', 'mien', 
        'phi', 'bat', 'dua', 'chen', 'ly', 'coc', 'da', 'khan', 'uot', 'ngot', 'cay', 'chua', 'man', 'lat', 'nhat', 'nuong', 'lau', 'hap', 
        'chien', 'xao', 'luoc', 'goi', 'salad', 'sup', 'canh', 'com', 'mi', 'bun', 'pho', 'chao', 'khoai', 'tay', 'ngo', 'bap', 'dau', 
        'rau', 'dua', 'ca', 'chua', 'hanh', 'toi', 'ot', 'tieu', 'sa', 'gung', 'rieng', 'me', 'dam', 'giam', 'sot', 'mam', 'muoi', 'duong', 
        'chinh', 'nem', 'dau', 'bo', 'sua', 'trung', 'bot', 'tuong', 'thit', 'bo', 'heo', 'lon', 'ga', 'vit', 'ngan', 'ngong', 'de', 'cuu', 
        'tho', 'ech', 'luon', 'ca', 'tom', 'cua', 'ghe', 'muc', 'bach', 'tuoc', 'hau', 'so', 'ngheu', 'oc', 'hen', 'sua', 'cha', 'gio', 
        'xuc', 'xich', 'lap', 'xuong', 'roi', 'chi', 'suon', 'nam', 'linh', 'long', 'doi', 'tai', 'mui', 'luoi', 'chan', 'canh', 'dui', 
        'uc', 'me', 'gan', 'tim', 'cat', 'pheo', 'day', 'bao', 'tu', 'gan', 'sun', 'xuong', 'duoi', 'dau', 'co', 'da', 'mo', 'nac', 
        'than', 'vai', 'nong', 'ma', 'nam', 'sua', 'doi', 'sun'
      ])
      const hasStopWord = cleanWords.some(w => stopWords.has(stripAccents(w).toLowerCase()))

      if (isPureLetters && !hasStopWord) {
        const candidateName = cleanWords.join(' ')
        const cleanName = cleanHonorificPrefix(candidateName)
        if (cleanName && !peopleNames.includes(cleanName)) {
          peopleNames.push(cleanName)
        }
      }
    }
  }

  const specialPatterns = [
    { regex: /(?:sinh nhật|sinh nhat|hbd|hpbd|happy birthday|thôi nôi|thoi noi|đầy tháng|day thang|bé|be)\s+of\s+(\p{L}+(?:\s+(?!cho\b|dat\b|đặt\b|dat\s+ban|đặt\s+bàn|xin\b|gui\b|gửi\b|nha\b|nhà\b|ngay\b|ngày\b|luc\b|lúc\b|vao\b|vào\b|sdt\b|sđt\b|ban\b|bàn\b)\p{L}+){0,3})/ugi, isPartyOwner: true },
    { regex: /(?:sinh nhật|sinh nhat|hbd|hpbd|happy birthday|thôi nôi|thoi noi|đầy tháng|day thang|bé|be)\s+(\p{L}+(?:\s+(?!cho\b|dat\b|đặt\b|dat\s+ban|đặt\s+bàn|xin\b|gui\b|gửi\b|nha\b|nhà\b|ngay\b|ngày\b|luc\b|lúc\b|vao\b|vào\b|sdt\b|sđt\b|ban\b|bàn\b)\p{L}+){0,3})/ugi, isPartyOwner: true },
    { regex: /(?:bảng tên|bang ten|chữ|chu)\s+(\p{L}+(?:\s+(?!cho\b|dat\b|đặt\b|dat\s+ban|đặt\s+bàn|xin\b|gui\b|gửi\b|nha\b|nhà\b|ngay\b|ngày\b|luc\b|lúc\b|vao\b|vào\b|sdt\b|sđt\b|ban\b|bàn\b)\p{L}+){0,3})/ugi, isPartyOwner: true },
    { regex: /(?:người đặt|nguoi dat|liên hệ|lien he|anh|chị|chi|anh|sđt|sdt|tên|ten)\s+(\p{L}+(?:\s+(?!cho\b|dat\b|đặt\b|dat\s+ban|đặt\s+bàn|xin\b|gui\b|gửi\b|nha\b|nhà\b|ngay\b|ngày\b|luc\b|lúc\b|vao\b|vào\b|sdt\b|sđt\b|ban\b|bàn\b)\p{L}+){0,3})/ugi, isBooker: true },
    { regex: /\b((?:cty|công ty|đoàn|doan|team|group|phòng|phong)\s+\p{L}+(?:\s+(?!cho\b|dat\b|đặt\b|dat\s+ban|đặt\s+bàn|xin\b|gui\b|gửi\b|nha\b|nhà\b|ngay\b|ngày\b|luc\b|lúc\b|vao\b|vào\b|sdt\b|sđt\b|ban\b|bàn\b)\p{L}+){0,4})\b/ugi, isBooker: true, isPartyOwner: true }
  ]

  specialPatterns.forEach(({ regex, isPartyOwner, isBooker }) => {
    let match
    while ((match = regex.exec(text)) !== null) {
      let name = match[1].trim()
      name = cleanHonorificPrefix(name)
      if (name.length > 1 && !/^(nay|kia|truoc|sau|sang|chieu|toi|ngay|gio|pax|khach|nguoi|ban|mon|set|combo|happy|birthday|hbd|hpbd|sinh|nhat|thoi|noi|giup|giom|cho|sdt|lien|he|table|pax|duoc|khong)$/i.test(stripAccents(name))) {
        // Bộ lọc từ cấm cho tên khớp từ specialPatterns:
        const nameWords = stripAccents(name).toLowerCase().split(/\s+/)
        const hasInvalidWord = nameWords.some(w => invalidNameSet.has(w))
        if (hasInvalidWord) continue

        if (!peopleNames.includes(name)) {
          peopleNames.push(name)
        }
        if (isPartyOwner && !partyOwnerCandidates.includes(name)) {
          partyOwnerCandidates.push(name)
        }
        if (isBooker && !bookerCandidates.includes(name)) {
          bookerCandidates.push(name)
        }
      }
    }
  })

  peopleNames.forEach(name => {
    if (bookerCandidates.includes(name) || partyOwnerCandidates.includes(name)) return

    const index = text.indexOf(name)
    if (index !== -1) {
      const contextBefore = text.slice(Math.max(0, index - 30), index).toLowerCase()
      const contextAfter = text.slice(index, index + 30).toLowerCase()
      
      const isBookerContext = /đặt|dat|book|liên hệ|lien he|sđt|sdt|khách|khach|tên|ten/.test(contextBefore) || /đặt|dat|book|sđt|sdt|liên hệ|lien he/.test(contextAfter)
      const isPartyContext = /sinh nhật|sinh nhat|hbd|hpbd|happy|thôi nôi|thoi noi|đầy tháng|day thang|bảng|bang|chữ|chu|trang trí|trang tri|bé|be/.test(contextBefore)

      if (isBookerContext && !isPartyContext) {
        bookerCandidates.push(name)
      } else if (isPartyContext) {
        partyOwnerCandidates.push(name)
      }
    }
  })

  return {
    peopleNames,
    bookerCandidates,
    partyOwnerCandidates
  }
}

function getWeekdayIndex(w: string): number {
  const cleanW = stripAccents(w).toLowerCase().replace(/\s+/g, '')
  if (/cn|chunhat/.test(cleanW)) return 0
  if (/t2|thuhai|thu2/.test(cleanW)) return 1
  if (/t3|thuba|thu3/.test(cleanW)) return 2
  if (/t4|thutu|thu4/.test(cleanW)) return 3
  if (/t5|thunam|thu5/.test(cleanW)) return 4
  if (/t6|thusau|thu6/.test(cleanW)) return 5
  if (/t7|thubay|thu7/.test(cleanW)) return 6
  return -1
}

export function preNormalizeInput(rawText: string): string {
  if (!rawText) return ''
  
  let clean = rawText.replace(/\r\n/g, '\n')
  clean = clean.replace(/[^\S\n]+/g, ' ')
  
  clean = clean
    .split('\n')
    .map(line => line.trim())
    .join('\n')

  clean = clean.replace(/\n{3,}/g, '\n\n')

  clean = clean.replace(/(?:\+84|84|0)(?:\s*[\.-]?\s*\d){9}\b/g, (match) => {
    let digits = match.replace(/[\s\.-]+/g, '')
    if (digits.startsWith('+84')) digits = '0' + digits.slice(3)
    if (digits.startsWith('84')) digits = '0' + digits.slice(2)
    return digits
  })

  const abbreviations: { pattern: RegExp; replacement: string }[] = [
    { pattern: /\b(sn|sinh nhat)\b/gi, replacement: 'sinh nhật' },
    { pattern: /\b(hbd|hpbd)\b/gi, replacement: 'Happy Birthday' },
    { pattern: /\b(tn)\b/gi, replacement: 'thôi nôi' },
    { pattern: /\b(thoi noi)\b/gi, replacement: 'thôi nôi' },
    { pattern: /\b(day thang)\b/gi, replacement: 'đầy tháng' },
    { pattern: /\b(hn)\b/gi, replacement: 'hôm nay' }
  ]
  abbreviations.forEach(({ pattern, replacement }) => {
    clean = clean.replace(pattern, replacement)
  })

  // Safe replacement for Vietnamese short abbreviations to avoid breaking words like "người" and "khách"
  clean = clean.replace(/(^|\s)(kh)(?=\s|$|[\.,\?!])/gi, '$1khách')
  clean = clean.replace(/(^|\s)(ng)(?=\s|$|[\.,\?!])/gi, '$1người')

  const spellingAliases = [
    { pattern: /\b(dut lo|dut\s+lo)\b/gi, replacement: 'đốt lò' },
    { pattern: /\b(chac toi|chac\s+toi)\b/gi, replacement: 'cháy tỏi' },
    { pattern: /\b(sate|sa\s+te)\b/gi, replacement: 'sa tế' },
    { pattern: /\b(tcocktail|t\s*cocktail)\b/gi, replacement: 'cocktail' }
  ]
  spellingAliases.forEach(({ pattern, replacement }) => {
    clean = clean.replace(pattern, replacement)
  })

  clean = clean.replace(/\bthu\s+(\d)\b/gi, (match, num) => {
    const mapping: Record<string, string> = {
      '2': 'thứ hai',
      '3': 'thứ ba',
      '4': 'thứ tư',
      '5': 'thứ năm',
      '6': 'thứ sáu',
      '7': 'thứ bảy'
    }
    return mapping[num] || match
  })

  clean = clean.replace(/\b(\d{1,2})h(\d{2})m\b/gi, '$1:$2')
  clean = clean.replace(/\b(\d{1,2})h(\d{2})\b/gi, '$1:$2')
  clean = clean.replace(/\b(\d{1,2})h\b/gi, '$1:00')
  clean = clean.replace(/\b(\d{1,2})g(\d{2})\b/gi, '$1:$2')
  clean = clean.replace(/\b(\d{1,2})g\b/gi, '$1:00')

  clean = clean.replace(/(\d+)(pax|người|khách|cho|nguoi|khach|ban)/gi, '$1 $2')
  clean = clean.replace(/([\p{L}]{2,})(\d+)\b/ugi, (match, word, num) => {
    const lowerWord = stripAccents(word).toLowerCase()
    if (/^(set|combo|menu|ban|table|vip|tang|goi|phong|kv|khu|khu\s+vuc)$/.test(lowerWord)) {
      return `${word} ${num}`
    }
    return `${word} x${num}`
  })
  clean = clean.replace(/(\d+)(?![hg\d\s\/:\-\.,])([\p{L}])/ugi, '$1 $2')

  clean = clean.replace(/\b(\d+)\s*(?:-|–|—|đến|den|to)\s*(\d+)\s*(pax|người|khách|cho|nguoi|khach|guest)/gi, (match, min, max, unit) => {
    return `${max} ${unit}`
  })
  
  clean = clean.replace(/\b(\d+)\s*(?:người lớn|nguoi lon|lớn|lon)\s*(?:\+|,|và|va)?\s*(\d+)\s*(?:nhỏ|bé|trẻ em|tre em|nho|be)\b/gi, (match, adults, kids) => {
    const total = parseInt(adults) + parseInt(kids)
    return `${total} khách`
  })

  clean = clean.replace(/\b(\d{1,2}:\d{2})\s*[-–—đến|den|to]\s*(\d{1,2}:\d{2})\b/g, (match, t1, t2) => t1)

  clean = clean.replace(/\b(\d{1,2}):(\d{2})\s*(chiều|tối|pm|chieu|toi)\b/gi, (match, h, m) => {
    let hour = parseInt(h)
    if (hour < 12) hour += 12
    return `${String(hour).padStart(2, '0')}:${m}`
  })

  const hasMorningIndicator = /sáng|trưa|am/i.test(rawText)
  clean = clean.replace(/\b(vào lúc|lúc|tầm|khoảng|gio|giao|luc|tam|khoang)?\s*(\d{1,2}):(\d{2})\b/gi, (match, prefix, h, m) => {
    let hour = parseInt(h)
    if (hour >= 1 && hour <= 11 && !hasMorningIndicator) {
      if (hour >= 5 && hour <= 11) {
        hour += 12
      }
    }
    return `${prefix || ''} ${String(hour).padStart(2, '0')}:${m}`
  })

  const today = new Date()
  const formatDate = (d: Date) => {
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yyyy = d.getFullYear()
    return `${dd}/${mm}/${yyyy}`
  }

  const weekdayNormRegex = /\b(chu\s*nhat|cn|thu\s*hai|thu\s*ba|thu\s*tu|thu\s*nam|thu\s*sau|thu\s*bay|t2|t3|t4|t5|t6|t7)\b(?:\s+(tuan\s+)?(nay|sau))?/gi
  
  clean = clean.replace(weekdayNormRegex, (match, dayStr, _, modifier) => {
    const wIndex = getWeekdayIndex(dayStr)
    if (wIndex === -1) return match
    const currentDay = today.getDay()
    const vnToday = currentDay === 0 ? 7 : currentDay
    const vnTarget = wIndex === 0 ? 7 : wIndex
    
    let diff = vnTarget - vnToday
    if (diff < 0) {
      diff += 7
    }
    
    const mod = modifier ? modifier.toLowerCase() : ''
    if (mod === 'sau' && (vnTarget - vnToday) >= 0) {
      diff += 7
    }
    
    const targetDate = new Date(today)
    targetDate.setDate(today.getDate() + diff)
    return formatDate(targetDate)
  })

  clean = clean.replace(/\b(?:ngay\s+)?(\d{1,2})\s+(?:thang|thg|t|t\s*)\s*(\d{1,2})\b/gi, (match, d, m) => {
    const day = parseInt(d)
    const month = parseInt(m)
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const dd = String(day).padStart(2, '0')
      const mm = String(month).padStart(2, '0')
      return `${dd}/${mm}/${today.getFullYear()}`
    }
    return match
  })

  const relativePatterns = [
    { pattern: /\b(hôm nay|nay|tối nay|chiều nay|hom nay|toi nay|chieu nay)\b/gi, offset: 0 },
    { pattern: /\b(ngày mai|mai|chiều mai|tối mai|ngay mai|chieu mai|toi mai)\b/gi, offset: 1 },
    { pattern: /\b(ngày mốt|mốt|ngày kia|ngay mot|mot|ngay kia)\b/gi, offset: 2 }
  ]
  
  relativePatterns.forEach(({ pattern, offset }) => {
    if (pattern.test(clean)) {
      const targetDate = new Date(today)
      targetDate.setDate(today.getDate() + offset)
      clean = clean.replace(pattern, formatDate(targetDate))
    }
  })
  
  const vnDays = ['chủ nhật', 'thứ hai', 'thứ ba', 'thứ tư', 'thứ năm', 'thứ sáu', 'thứ bảy', 'cn', 't2', 't3', 't4', 't5', 't6', 't7', 'chu nhat', 'thu hai', 'thu ba', 'thu tu', 'thu nam', 'thu sau', 'thu bay']
  vnDays.forEach(day => {
    const regexNext = new RegExp(`(${day})\\s+tuần\\s+sau`, 'gi')
    if (regexNext.test(clean)) {
      const dayIndex = vnDays.indexOf(day) % 7
      const currentDay = today.getDay()
      let diff = dayIndex - currentDay
      diff += 7
      const targetDate = new Date(today)
      targetDate.setDate(today.getDate() + diff)
      clean = clean.replace(regexNext, formatDate(targetDate))
    }
    const regexThis = new RegExp(`(${day})\\s+tuần\\s+này`, 'gi')
    if (regexThis.test(clean)) {
      const dayIndex = vnDays.indexOf(day) % 7
      const currentDay = today.getDay()
      let diff = dayIndex - currentDay
      const targetDate = new Date(today)
      targetDate.setDate(today.getDate() + diff)
      clean = clean.replace(regexThis, formatDate(targetDate))
    }
  })

  if (/cuối tuần này|cuoi tuan nay/gi.test(clean)) {
    const satIndex = 6
    const currentDay = today.getDay()
    const diff = satIndex - currentDay
    const targetDate = new Date(today)
    targetDate.setDate(today.getDate() + diff)
    clean = clean.replace(/cuối tuần này|cuoi tuan nay/gi, formatDate(targetDate))
  }

  clean = clean.replace(/\b(\d{1,2})[\.\-\/](\d{1,2})[\.\-\/](\d{2,4})\b/g, (match, d, m, y) => {
    const day = String(d).padStart(2, '0')
    const month = String(m).padStart(2, '0')
    let year = String(y)
    if (year.length === 2) year = '20' + year
    return `${day}/${month}/${year}`
  })

  clean = clean.replace(/\b(\d{1,2})[\/\.\-](\d{1,2})\b(?![\/\.\-\d])/g, (match, d, m) => {
    const day = parseInt(d)
    const month = parseInt(m)
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const dd = String(day).padStart(2, '0')
      const mm = String(month).padStart(2, '0')
      return `${dd}/${mm}/${today.getFullYear()}`
    }
    return match
  })

  return clean.trim()
}

export function classifyInputType(rawInput: string, hasImage: boolean): string {
  const cleanText = stripAccents(rawInput).toLowerCase().trim()
  const phoneRegex = /(0[35789]\d{8})/g
  const hasPhone = phoneRegex.test(cleanText)
  const hasGuestCount = /(\d+)\s*(?:pax|nguoi|khach|cho)/i.test(cleanText)
  const hasBookingNeed = /sinh nhat|ky niem|hop mat|cong ty|lien hoan|tat nien|thoi noi|mung tho/i.test(cleanText)
  
  const lines = cleanText.split('\n')
  let foodLinesCount = 0
  for (const line of lines) {
    if (/^\d+\s+[\p{L}\s]+$/ui.test(line.trim())) {
      foodLinesCount++
    }
  }
  const hasMenuOrders = foodLinesCount >= 2 || /combo|set menu|thuc don/i.test(cleanText)
  const hasDeposit = /da chuyen|coc|ck|bill|ngan hang|chuyen khoan/i.test(cleanText)
  const hasDeco = /happy birthday|hbd|chuc mung|bang chu|bong bay|trang tri/i.test(cleanText)
  
  if (hasImage) {
    if (hasDeposit) return 'deposit_bill_image'
    return 'chat_screenshot'
  }
  if (hasDeposit && !hasPhone && !hasGuestCount) {
    return 'deposit_bill_image'
  }
  if (hasDeco && !hasMenuOrders && !hasPhone) {
    return 'decoration_request'
  }
  if (hasPhone && hasMenuOrders) {
    return 'mixed_booking_menu'
  }
  if (hasMenuOrders) {
    return 'menu_order_text'
  }
  if (hasPhone || hasGuestCount || hasBookingNeed) {
    return 'booking_text'
  }
  return 'unknown'
}

export function extractHardEntities(normalizedText: string): HardEntities {
  const phones: HardEntities['phones'] = []
  const dates: HardEntities['dates'] = []
  const times: HardEntities['times'] = []
  const guestCounts: HardEntities['guestCounts'] = []
  const tables: HardEntities['tables'] = []
  const clean = stripAccents(normalizedText).toLowerCase()

  const blocks = segmentInputBlocksCompat(normalizedText)
  const phoneRegex = /(0[35789]\d{7,9})/g
  let bestCustomerPhone: string | null = null
  const custPhoneMatch = blocks.customer_block.match(phoneRegex)
  if (custPhoneMatch) {
    bestCustomerPhone = cleanPhoneNumber(custPhoneMatch[0])
  } else {
    const allPhoneMatch = normalizedText.match(phoneRegex)
    if (allPhoneMatch) {
      const depositPhones = blocks.deposit_block.match(phoneRegex)
      if (depositPhones && depositPhones[0] === allPhoneMatch[0]) {
        if (allPhoneMatch.length > 1) bestCustomerPhone = cleanPhoneNumber(allPhoneMatch[1])
      } else {
        bestCustomerPhone = cleanPhoneNumber(allPhoneMatch[0])
      }
    }
  }

  if (bestCustomerPhone) {
    const isMaybeInvalid = bestCustomerPhone.length < 10
    phones.push({
      value: bestCustomerPhone,
      confidence: isMaybeInvalid ? 0.5 : 0.95,
      warning: isMaybeInvalid ? 'phone_maybe_invalid' : undefined
    })
  }
  
  let phoneMatch
  while ((phoneMatch = phoneRegex.exec(normalizedText)) !== null) {
    const val = cleanPhoneNumber(phoneMatch[1])
    if (val !== bestCustomerPhone && !phones.some(p => p.value === val)) {
      phones.push({
        value: val,
        confidence: 0.5,
        warning: 'alternative_phone'
      })
    }
  }

  const today = new Date()
  const formatDateStrLocal = (d: Date) => {
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yyyy = d.getFullYear()
    return `${dd}/${mm}/${yyyy}`
  }

  const relativePatterns = [
    { regex: /\b(hom nay|nay|toi nay|chieu nay)\b/gi, offset: 0, raw: 'hôm nay' },
    { regex: /\b(ngay mai|mai|chieu mai|toi mai)\b/gi, offset: 1, raw: 'ngày mai' },
    { regex: /\b(ngay mot|mot|ngay kia)\b/gi, offset: 2, raw: 'ngày mốt' }
  ]
  relativePatterns.forEach(({ regex, offset, raw }) => {
    if (regex.test(clean)) {
      const targetDate = new Date(today)
      targetDate.setDate(today.getDate() + offset)
      dates.push({ value: formatDateStrLocal(targetDate), confidence: 0.95, raw })
    }
  })

  const weekdayRegex = /\b(chu\s*nhat|cn|thu\s*hai|t2|thu\s*ba|t3|thu\s*tu|t4|thu\s*nam|t5|thu\s*sau|t6|thu\s*bay|t7|thu\s*2|thu\s*3|thu\s*4|thu\s*5|thu\s*6|thu\s*7)\b(?:\s+(tuan\s+)?(nay|sau))?/gi
  let weekdayMatch
  while ((weekdayMatch = weekdayRegex.exec(clean)) !== null) {
    const wIndex = getWeekdayIndex(weekdayMatch[1])
    if (wIndex !== -1) {
      const currentDay = today.getDay()
      const vnToday = currentDay === 0 ? 7 : currentDay
      const vnTarget = wIndex === 0 ? 7 : wIndex
      let diff = vnTarget - vnToday
      if (diff < 0) {
        diff += 7
      }
      const modifier = weekdayMatch[3] ? weekdayMatch[3].toLowerCase() : ''
      if (modifier === 'sau' && (vnTarget - vnToday) >= 0) {
        diff += 7
      }
      const targetDate = new Date(today)
      targetDate.setDate(today.getDate() + diff)
      dates.push({ value: formatDateStrLocal(targetDate), confidence: 0.95, raw: weekdayMatch[0] })
    }
  }

  const explicitDateRegex = /\b(\d{1,2})[\.\-\/](\d{1,2})[\.\-\/](\d{2,4})\b/g
  let dateMatch
  while ((dateMatch = explicitDateRegex.exec(normalizedText)) !== null) {
    const d = String(dateMatch[1]).padStart(2, '0')
    const m = String(dateMatch[2]).padStart(2, '0')
    let y = String(dateMatch[3])
    if (y.length === 2) y = '20' + y
    dates.push({ value: `${d}/${m}/${y}`, confidence: 0.95, raw: dateMatch[0] })
  }

  const partialDateRegex = /\b(\d{1,2})[\/\.\-](\d{1,2})\b(?![\/\.\-\d])/g
  let partialMatch
  while ((partialMatch = partialDateRegex.exec(normalizedText)) !== null) {
    const day = parseInt(partialMatch[1])
    const month = parseInt(partialMatch[2])
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const dd = String(day).padStart(2, '0')
      const mm = String(month).padStart(2, '0')
      dates.push({ value: `${dd}/${mm}/${today.getFullYear()}`, confidence: 0.9, raw: partialMatch[0] })
    }
  }

  const matchedTimeRanges: Array<[number, number]> = []
  const rangeTimeRegex = /\b(\d{1,2})[h:](\d{2})?\s*[-–—đến|den|to]\s*(\d{1,2})[h:](\d{2})?\b/gi
  let rangeMatch
  while ((rangeMatch = rangeTimeRegex.exec(clean)) !== null) {
    let h = parseInt(rangeMatch[1])
    const m = rangeMatch[2] ? parseInt(rangeMatch[2]) : 0
    
    const hasNoonOrNight = /toi|dem|chieu/i.test(clean)
    const hasMorningOrLunch = /sang|trua/i.test(clean)
    if (h >= 1 && h <= 9) {
      if (!hasMorningOrLunch) {
        h += 12
      }
    } else if (h >= 10 && h <= 14) {
      if (hasNoonOrNight) {
        h += 12
      }
    } else if (h >= 15 && h <= 23) {
      // already PM
    } else if (h === 24) {
      h = 0
    }

    times.push({ value: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, confidence: 0.95, raw: rangeMatch[0] })
    matchedTimeRanges.push([rangeMatch.index, rangeMatch.index + rangeMatch[0].length])
  }

  const standardTimeRegex = /\b(\d{1,2})[h:](\d{2})?\b/gi
  let timeMatchObj
  while ((timeMatchObj = standardTimeRegex.exec(clean)) !== null) {
    const start = timeMatchObj.index
    const end = start + timeMatchObj[0].length
    const isOverlapping = matchedTimeRanges.some(([s, e]) => (start >= s && start < e) || (end > s && end <= e))
    if (isOverlapping) {
      continue
    }
    let h = parseInt(timeMatchObj[1])
    const m = timeMatchObj[2] ? parseInt(timeMatchObj[2]) : 0
    
    const hasNoonOrNight = /toi|dem|chieu/i.test(clean)
    const hasMorningOrLunch = /sang|trua/i.test(clean)
    if (h >= 1 && h <= 9) {
      if (!hasMorningOrLunch) {
        h += 12
      }
    } else if (h >= 10 && h <= 14) {
      if (hasNoonOrNight) {
        h += 12
      }
    } else if (h >= 15 && h <= 23) {
      // already PM
    } else if (h === 24) {
      h = 0
    }

    times.push({ value: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, confidence: 0.95, raw: timeMatchObj[0] })
    matchedTimeRanges.push([start, end])
  }

  if (times.length === 0) {
    if (/\b(toi nay|toi mai|toi kia|chieu toi)\b/i.test(clean)) {
      times.push({ value: '19:00', confidence: 0.6, raw: 'tối' })
    } else if (/\b(trua nay|trua mai|trua kia)\b/i.test(clean)) {
      times.push({ value: '11:30', confidence: 0.6, raw: 'trưa' })
    } else if (/\b(chieu nay|chieu mai|chieu kia)\b/i.test(clean)) {
      times.push({ value: '17:30', confidence: 0.6, raw: 'chiều' })
    } else if (/\b(sang nay|sang mai|sang kia)\b/i.test(clean)) {
      times.push({ value: '09:00', confidence: 0.6, raw: 'sáng' })
    }
  }

  const additionGuestRegex = /\b(\d+)\s*(?:nguoi lon|lon)\s*(?:\+|,|va)?\s*(\d+)\s*(?:nho|be|tre em)\b/gi
  let addMatch
  while ((addMatch = additionGuestRegex.exec(clean)) !== null) {
    const total = parseInt(addMatch[1]) + parseInt(addMatch[2])
    guestCounts.push({ value: total, confidence: 0.95, raw: addMatch[0] })
  }

  const rangeGuestRegex = /\b(\d+)\s*(?:-|đến|den|to)\s*(\d+)\s*(?:pax|nguoi|khach|guest)\b/gi
  let rangeGuestMatch
  while ((rangeGuestMatch = rangeGuestRegex.exec(clean)) !== null) {
    const maxVal = Math.max(parseInt(rangeGuestMatch[1]), parseInt(rangeGuestMatch[2]))
    guestCounts.push({ value: maxVal, confidence: 0.95, raw: rangeGuestMatch[0] })
  }

  const stdGuestRegex = /\b(\d+)\s*(?:pax|nguoi|người|khach|khách|guest|pax|ng\b)/gi
  let stdGuestMatch
  while ((stdGuestMatch = stdGuestRegex.exec(clean)) !== null) {
    const val = parseInt(stdGuestMatch[1])
    const alreadyMatched = guestCounts.some(g => clean.indexOf(g.raw) <= stdGuestMatch!.index && stdGuestMatch!.index <= clean.indexOf(g.raw) + g.raw.length)
    if (!alreadyMatched) {
      guestCounts.push({ value: val, confidence: 0.9, raw: stdGuestMatch[0] })
    }
  }

  const tableCodes = parseTableCodes(normalizedText)
  tableCodes.forEach(tc => {
    tables.push({
      zone: tc.zone,
      number: tc.number,
      raw: tc.raw,
      confidence: 0.95
    })
  })

  return { phones, dates, times, guestCounts, tables }
}

export function extractByRules(normalizedText: string) {
  const blocks = segmentInputBlocksCompat(normalizedText)
  const clean = stripAccents(normalizedText).toLowerCase()
  
  let phone: string | null = null
  const phoneRegex = /(0[35789]\d{7,9})/g
  const custPhoneMatch = blocks.customer_block.match(phoneRegex)
  if (custPhoneMatch) {
    phone = custPhoneMatch[0]
  } else {
    const allPhoneMatch = normalizedText.match(phoneRegex)
    if (allPhoneMatch) {
      const depositPhones = blocks.deposit_block.match(phoneRegex)
      if (depositPhones && depositPhones[0] === allPhoneMatch[0]) {
        if (allPhoneMatch.length > 1) phone = allPhoneMatch[1]
      } else {
        phone = allPhoneMatch[0]
      }
    }
  }
  if (phone) phone = cleanPhoneNumber(phone)
  
  let customer_name: string | null = null
  let customer_name_confidence = 1.0
  let customer_name_metadata: any = null

  const nameResults = classifyPeopleNames(normalizedText)
  const requestKeywords = /\byeu\s+cau\b|\bphong\s+lanh\b|\btrang\s+tri\b|\bbong\s+bong\b|\bbong\s+bay\b|\bcom\s+chien\b|\bthuc\s+don\b|\bmon\s+an\b|\bcoc\b|\bchuyen\s+khoan\b|\bset\s+menu\b|\bcombo\b|\bbao\s+gia\b|\bbia\b|\bnuoc\s+ngot\b/i
  const filterValidNames = (names: string[]) => names.filter(n => !requestKeywords.test(stripAccents(n).toLowerCase()))

  const candidatesList = filterValidNames(nameResults.peopleNames)
  const confidentCandidates = candidatesList.filter(c => evaluateNameConfidence(c, normalizedText).confidence >= 0.55)

  if (confidentCandidates.length > 1) {
    customer_name = null
    customer_name_confidence = 0.0
    customer_name_metadata = { confidence: 0.0, signals: [], risks: ['conflicting_multiple_names'] }
  } else if (candidatesList.length > 1) {
    let bestName: string | null = null
    let bestScore = -1
    let bestEval: any = null
    let hasTie = false

    for (const nameCandidate of candidatesList) {
      const evalRes = evaluateNameConfidence(nameCandidate, normalizedText)
      if (evalRes.confidence > bestScore) {
        bestScore = evalRes.confidence
        bestName = nameCandidate
        bestEval = evalRes
        hasTie = false
      } else if (evalRes.confidence === bestScore) {
        hasTie = true
      }
    }

    if (bestName && !hasTie && bestScore >= 0.80) {
      customer_name = bestName
      customer_name_confidence = bestScore
      customer_name_metadata = bestEval
    } else {
      customer_name = null
      customer_name_confidence = 0.0
      customer_name_metadata = { confidence: 0.0, signals: [], risks: ['conflicting_multiple_names'] }
    }
  } else {
    const validBookers = filterValidNames(nameResults.bookerCandidates)
    if (validBookers.length > 0) {
      customer_name = validBookers[0]
    } else {
      const potentialBookers = filterValidNames(nameResults.peopleNames).filter(name => !nameResults.partyOwnerCandidates.includes(name))
      if (potentialBookers.length > 0) {
        customer_name = potentialBookers[0]
      }
    }

    if (customer_name) {
      const evalRes = evaluateNameConfidence(customer_name, normalizedText)
      customer_name_confidence = evalRes.confidence
      customer_name_metadata = evalRes
      if (customer_name_confidence < 0.55) {
        customer_name = null
        customer_name_confidence = 0.0
      }
    }
  }

  let event_time: string | null = null
  const colonTimeMatch = normalizedText.match(/\b(\d{1,2}):(\d{2})\b/)
  if (colonTimeMatch) {
    event_time = colonTimeMatch[0].length === 4 ? '0' + colonTimeMatch[0] : colonTimeMatch[0]
  }
  if (!event_time) {
    const vnTimeMatch = clean.match(/(\d{1,2})h(\d{2})?/)
    if (vnTimeMatch) {
      let h = parseInt(vnTimeMatch[1])
      const m = vnTimeMatch[2] ? parseInt(vnTimeMatch[2]) : 0
      if (h < 12 && !/sang/i.test(clean)) h += 12
      if (h >= 24) h -= 12
      event_time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    }
  }

  let event_date: string | null = null
  const dateRegex = /(\d{2})\/(\d{2})\/(\d{4})/g
  const dateMatch = normalizedText.match(dateRegex)
  if (dateMatch) {
    event_date = dateMatch[0]
  }

  if (!event_date && event_time) {
    const timeMatch = event_time.match(/^(\d{2}):(\d{2})$/)
    if (timeMatch) {
      const bookHour = parseInt(timeMatch[1], 10)
      const bookMin = parseInt(timeMatch[2], 10)
      
      const todayDate = new Date()
      const currHour = todayDate.getHours()
      const currMin = todayDate.getMinutes()
      
      const bookTotal = bookHour * 60 + bookMin
      const currTotal = currHour * 60 + currMin
      
      const targetDate = new Date(todayDate)
      if (bookTotal > currTotal) {
        // Today
      } else {
        // Tomorrow
        targetDate.setDate(todayDate.getDate() + 1)
      }
      const dd = String(targetDate.getDate()).padStart(2, '0')
      const mm = String(targetDate.getMonth() + 1).padStart(2, '0')
      const yyyy = targetDate.getFullYear()
      event_date = `${dd}/${mm}/${yyyy}`
    }
  }

  let guest_count: number | null = null
  const paxMatch = clean.match(/(\d+)\s*(?:pax|nguoi|người|khach|khách|cho|guest|\bng\b)\b/i)
  if (paxMatch) {
    guest_count = parseInt(paxMatch[1])
  }
  
  let table_code: string | null = null
  const tableWithLetterMatch = clean.match(/ban\s+([a-g]\d{1,2})\b/i)
  if (tableWithLetterMatch) {
    table_code = tableWithLetterMatch[1].toUpperCase()
  }
  if (!table_code) {
    const directMatch = clean.match(/\b([a-g]\d{1,2})\b/i)
    if (directMatch) {
      table_code = directMatch[1].toUpperCase()
    }
  }
  if (!table_code) {
    const bareTableMatch = clean.match(/ban\s+(\d{1,2})\b(?!\s*(?:ng\b|nguoi|khach|pax|cho\b))/i)
    if (bareTableMatch) {
      table_code = 'A' + bareTableMatch[1]
    }
  }

  let booking_need = 'Ăn thường'
  if (/sinh nhat|sn|mung tho/i.test(clean)) booking_need = 'Sinh nhật'
  else if (/thoi noi/i.test(clean)) booking_need = 'Thôi nôi (1st)'
  else if (/cong ty|cty|doanh nghiep|ortholite/i.test(clean)) booking_need = 'Công ty'
  else if (/tat nien/i.test(clean)) booking_need = 'Tất niên'
  else if (/tan nien/i.test(clean)) booking_need = 'Tân niên'
  else if (/cuoi|bao hy/i.test(clean)) booking_need = 'Cưới/Báo hỷ'
  else if (/farewell|chia tay/i.test(clean)) booking_need = 'Farewell (Tiệc chia tay)'
  else if (/ky niem/i.test(clean)) booking_need = 'Kỉ niệm'
  else if (/lien hoan|tiec|hop lop/i.test(clean)) booking_need = 'Liên hoan'

  let decoration_text = ''
  if (blocks.decoration_block) {
    const decoMatch = normalizedText.match(/(?:happy birthday|hbd|bang chu|chu)\s+([^:\n]+)/i)
    if (decoMatch) {
      decoration_text = decoMatch[1].trim()
    } else {
      decoration_text = blocks.decoration_block
    }
  }

  let deposit_amount: number | null = null
  const hasDepositCtx = /coc|dat coc|doi coc|da coc/i.test(clean)
  if (hasDepositCtx) {
    const depMatch = clean.match(/(?:coc|dat coc|doi coc|da coc)\s*(\d+(?:[.,]\d+)?)\s*(k|tr|trieu|cu|trn)/i)
      || clean.match(/(\d+(?:[.,]\d+)?)\s*(k|tr|trieu|cu|trn)(?=\s|$)/i)
    if (depMatch) {
      let amt = parseFloat(depMatch[1].replace(',', '.'))
      const unit = depMatch[2].toLowerCase()
      if (unit === 'k') amt *= 1000
      else if (unit.startsWith('tr') || unit === 'cu' || unit === 'trn') amt *= 1000000
      deposit_amount = Math.round(amt)
    }
  }
  
  let deposit_status = 'chờ cọc'
  if (/da chuyen|chuyen roi|da coc/i.test(clean)) {
    deposit_status = 'đã cọc'
  } else if (/doi coc|cho coc|chua coc/i.test(clean)) {
    deposit_status = 'chờ cọc'
  }

  const note = blocks.note_block || ''

  let receiver: string | null = null
  const receiverMatch = clean.match(/(?:nhan:|nhan\s+nv|nhan\s+dmt|nv\b)\s*([a-z0-9]+)/i)
  if (receiverMatch) {
    receiver = receiverMatch[1].toUpperCase()
  }

  const menu_items: any[] = []

  const isTableFormat = /stt|s\s*t\s*t|món ăn|mon an|số lượng|so luong|đơn giá|don gia/i.test(normalizedText)
  if (isTableFormat) {
    const allLines = normalizedText.split('\n')
    for (const line of allLines) {
      const trimmed = line.trim()
      const tableMatch = trimmed.match(/^(\d{1,3})\s+([\p{L}\s,]+?)\s+(\d{1,3})\s+([\d,.]+)\s*$/u)
      if (tableMatch) {
        const stt = parseInt(tableMatch[1])
        const name = tableMatch[2].trim()
        const qty = parseInt(tableMatch[3])
        const priceStr = tableMatch[4].replace(/[,.]/g, '')
        const price = parseInt(priceStr) || 0
        if (stt >= 1 && stt <= 99 && qty >= 1 && qty <= 999 && name.length > 1) {
          menu_items.push({
            raw_name: name,
            quantity: qty,
            unit_price: price,
            note: ''
          })
        }
      }
    }
  }

  if (menu_items.length === 0) {
    const menuLines = blocks.menu_block.split('\n')
    for (const line of menuLines) {
      const lineClean = line.trim()
      const lineMatch = lineClean.match(/^(\d+)\s+(.+)$/)
      if (lineMatch) {
        menu_items.push({
          raw_name: lineMatch[2].trim(),
          quantity: parseInt(lineMatch[1]),
          unit_price: null,
          note: ''
        })
      } else {
        const lineMatch2 = lineClean.match(/^(.+?)\s*x\s*(\d+)$/i)
        if (lineMatch2) {
          menu_items.push({
            raw_name: lineMatch2[1].trim(),
            quantity: parseInt(lineMatch2[2]),
            unit_price: null,
            note: ''
          })
        }
      }
    }
  }

  if (menu_items.length === 0) {
    const foodLabelMatch = normalizedText.match(/(?:yêu cầu đặt trước|thức ăn|món ăn|thuc an|mon an|dat truoc|order|gọi món|goi mon)[^:]*:\s*(.+)/i)
    if (foodLabelMatch) {
      const dishList = foodLabelMatch[1].split(/[,;]/).map((d: string) => d.trim()).filter((d: string) => d.length > 2)
      for (const dish of dishList) {
        if (/^\d+$/.test(dish) || /sinh nhat|lien hoan|cong ty/i.test(dish)) continue
        menu_items.push({
          raw_name: dish,
          quantity: 1,
          unit_price: null,
          note: ''
        })
      }
    }
  }

  return {
    customer_name,
    customer_name_confidence,
    customer_name_metadata,
    phone,
    event_date,
    event_time,
    guest_count,
    table_code,
    booking_need,
    decoration_text,
    deposit_amount,
    deposit_status,
    note,
    menu_items,
    receiver
  }
}

export function stripSetMenuComponents(text: string): string {
  const lines = text.split('\n')
  const result: string[] = []
  let inSetMenuBlock = false
  for (const line of lines) {
    const trimmed = line.trim()
    const lower = stripAccents(trimmed).toLowerCase()
    if (/set\s*menu|combo\s*\d/i.test(lower) && /x\s*\d|\(x\d\)|\d\s*phan/i.test(lower)) {
      inSetMenuBlock = true
      result.push(trimmed)
      continue
    }
    if (inSetMenuBlock) {
      if (/^\d+[\/.)]\s+/i.test(trimmed)) continue
      inSetMenuBlock = false
    }
    result.push(trimmed)
  }
  return result.join('\n')
}

export function prepareAIPayload(
  promptText: string,
  sysPrompt: string,
  ruleBasedResult: any,
  menuList: any[]
): { sysPrompt: string; userPrompt: string; isLocalOnly: boolean; reason?: string } {
  const inputLower = stripAccents(promptText).toLowerCase()
  const inputTokens = inputLower.split(/\s+/).filter(t => t.length > 2)
  const candidates = menuList.filter((item: any) => {
    const cleanName = stripAccents(item.name).toLowerCase()
    const nameTokens = cleanName.split(/\s+/)
    const hasTokenMatch = nameTokens.some(t => inputTokens.some(it => it.includes(t) || t.includes(it)))
    const acronymMatch = item.acronym && inputTokens.includes(String(item.acronym).toLowerCase())
    return hasTokenMatch || acronymMatch
  })

  let finalSysPrompt = sysPrompt
  const promptWithoutMenu = finalSysPrompt.replace(/\{\{MENU_CONTEXT\}\}/g, '')
  if (promptWithoutMenu.length + promptText.length > 15000) {
    finalSysPrompt = finalSysPrompt.replace(/# 12\. VÍ DỤ CHUẨN[^]*?(?=\n---|\n# 13|$)/g, '').trim()
  }

  const basePromptWithoutMenu = finalSysPrompt.replace(/\{\{MENU_CONTEXT\}\}/g, '')
  const baseSize = basePromptWithoutMenu.length + promptText.length
  const maxMenuChars = Math.max(0, 15000 - baseSize)

  let menuToSend: any[] = []
  if (candidates.length > 0) {
    let currentChars = 0
    for (const item of candidates) {
      const line = `- ${item.name} (${formatVND(item.price)})\n`
      if (currentChars + line.length > maxMenuChars) break
      menuToSend.push(item)
      currentChars += line.length
    }
    
    if (currentChars < maxMenuChars) {
      for (const item of menuList) {
        if (candidates.includes(item)) continue
        const line = `- ${item.name} (${formatVND(item.price)})\n`
        if (currentChars + line.length > maxMenuChars) break
        menuToSend.push(item)
        currentChars += line.length
      }
    }
  } else {
    let currentChars = 0
    for (const item of menuList) {
      const line = `- ${item.name} (${formatVND(item.price)})\n`
      if (currentChars + line.length > maxMenuChars) break
      menuToSend.push(item)
      currentChars += line.length
    }
  }

  if (menuToSend.length === 0 && menuList.length > 0) {
    menuToSend = menuList.slice(0, 5)
  }

  const menuContext = menuToSend.map((i: any) => `- ${i.name} (${formatVND(i.price)})`).join('\n')
  finalSysPrompt = finalSysPrompt.replace(/\{\{MENU_CONTEXT\}\}/g, menuContext)

  if (finalSysPrompt.length + promptText.length > 25000) {
    finalSysPrompt = finalSysPrompt.replace(/Ví dụ:[^]*?(?=\n\n|\n[A-Z]|$)/g, '').trim()
  }

  if (finalSysPrompt.length + promptText.length > 40000) {
    return {
      sysPrompt: finalSysPrompt,
      userPrompt: promptText,
      isLocalOnly: true,
      reason: 'payload_too_large'
    }
  }

  return {
    sysPrompt: finalSysPrompt,
    userPrompt: promptText,
    isLocalOnly: false
  }
}
