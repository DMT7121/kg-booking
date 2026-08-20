import { stripAccents, cleanPhoneNumber, formatVND } from '@/utils'

// Top 200 Vietnamese first names (no diacritics, lowercase) for NER boosting
export const COMMON_VN_FIRST_NAMES = new Set([
  'an', 'anh', 'bao', 'bich', 'binh', 'cam', 'chi', 'chung', 'cuong', 'dang',
  'danh', 'dao', 'dat', 'diem', 'diep', 'dinh', 'dong', 'duc', 'dung', 'duong',
  'duyen', 'giang', 'ha', 'hai', 'han', 'hang', 'hanh', 'hao', 'hau', 'hien',
  'hieu', 'hiep', 'hoa', 'hoai', 'hoan', 'hoang', 'hong', 'hue', 'hung', 'huong',
  'huy', 'huyen', 'kha', 'khai', 'khanh', 'khiem', 'khoa', 'khoi', 'khuong', 'kien',
  'kiet', 'kim', 'lam', 'lan', 'le', 'lien', 'linh', 'loan', 'loc', 'long',
  'luan', 'luc', 'luu', 'ly', 'mai', 'man', 'minh', 'my', 'nam', 'nga',
  'nghi', 'nghia', 'ngoc', 'nha', 'nhan', 'nhi', 'nhu', 'nhung', 'nhut', 'niem',
  'oanh', 'phat', 'phi', 'phu', 'phuc', 'phuoc', 'phuong', 'quang', 'quan', 'quoc',
  'quy', 'quyen', 'sang', 'sinh', 'son', 'tam', 'tan', 'thach', 'thai', 'than',
  'thang', 'thanh', 'thao', 'thi', 'thien', 'thiet', 'thinh', 'tho', 'thong', 'thu',
  'thua', 'thuan', 'thuc', 'thuy', 'tien', 'tin', 'tinh', 'toan', 'tong', 'tram',
  'trang', 'tri', 'trieu', 'trinh', 'trong', 'truc', 'trung', 'truong', 'tu', 'tuan',
  'tue', 'tung', 'tuoi', 'tuong', 'tuyen', 'uyen', 'van', 'vi', 'viet', 'vinh',
  'vu', 'vuong', 'xuan', 'yen',
  // Additional common names
  'huy', 'khang', 'phong', 'bao', 'nhat', 'khoi', 'duy', 'tien', 'khiem', 'phuc',
  'bach', 'cuc', 'suong', 'thu', 'tuyet', 'vy', 'thuy', 'phuong', 'quynh', 'ngan'
])

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

  // Mask portion parentheses like "(5 con)" or "(10 con)" or standalone "5 con", "10 con", "1/2 con", "0.5kg" so they aren't misparsed as leading dish quantities
  const portionParens: string[] = []
  const maskedInput = cleanInput.replace(/(?:\(\s*\d+\s*(?:con|c|kg|g|l|ml|phần|phan|đĩa|dia|tô|to|ly|lon|set|suất|suat)\s*\)|\b(?:5|10)\s*(?:con|c)\b|\b1\/[2348]\s*con\b|\b½\s*con\b|\b0[\.,]\d+\s*kg\b|\b\d+\s*(?:kg|g|l|ml)\b)/gi, (match) => {
    portionParens.push(match)
    return `__PORTION_PAREN_${portionParens.length - 1}__`
  })

  const regex = /(\d+)\s*([\p{L}\s_0-9]+?)(?=\s+\d+|$)/gu
  let match
  while ((match = regex.exec(maskedInput)) !== null) {
    const qty = parseInt(match[1])
    let name = match[2].trim()
    portionParens.forEach((p, idx) => {
      name = name.replace(`__PORTION_PAREN_${idx}__`, p)
    })
    name = name.replace(/\s+/g, ' ').trim()
    if (name.length > 2) {
      results.push({ name, qty })
    }
  }

  if (results.length === 0) {
    const suffixRegex = /([\p{L}\s_0-9]+?)\s*(?:x)?\s*(\d+)(?=\s*[\p{L}]|$)/gu
    while ((match = suffixRegex.exec(maskedInput)) !== null) {
      let name = match[1].trim()
      portionParens.forEach((p, idx) => {
        name = name.replace(`__PORTION_PAREN_${idx}__`, p)
      })
      const qty = parseInt(match[2])
      if (name.length > 2) {
        const lowerName = stripAccents(name).toLowerCase()
        const isSetOrCombo = /(?:^|\s)(set\s*menu|set|combo|thuc\s*don|thực\s*đơn)(?:\s+)?$/i.test(lowerName)
        if (!isSetOrCombo) {
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

// Label prefixes that indicate a decoration-related line even without keywords
// Color keywords (tông, tone, màu) don't require a separator; others require [:：-]
const DECOR_LABEL_PREFIX_REGEX = /^(?:(?:tông|tong|tone|màu|mau|color)(?:\s*[:：\-]|\s+)|(?:bảng|bang|gương|guong|gương viết|guong viet|dặn|dan|dặn dò|dan do|lưu ý|luu y|nhắc|nhac|nội dung|noi dung|theme)\s*[:：\-])/i

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
  let lastBlockType: string | null = null // context carry-over for multi-line threading
  for (const line of lines) {
    let trimmed = line.trim()
    if (!trimmed) continue
    trimmed = trimmed.replace(/^["'\u201c\u201d\u00ab\u00bb]+|["'\u201c\u201d\u00ab\u00bb]+$/g, '').trim()
    if (!trimmed) continue
    const lower = stripAccents(trimmed).toLowerCase()
    
    if (/happy birthday|hbd|chuc mung|bang chu|bang ten|bang|bảng|bong bay|bong bong|trang tri|tong mau|tone|màu|mau|guong|gương|dan do|dặn dò|sinh nhat|thoi noi|day thang|hoa tuoi|hoa lua|hoa sap|cam hoa|backdrop|banh kem/i.test(lower)) {
      blocks.decoration_block.push(trimmed)
      lastBlockType = 'decoration'
      continue
    }
    // Context carry-over: if previous line was decoration and this line starts with a decor label prefix
    if (lastBlockType === 'decoration' && DECOR_LABEL_PREFIX_REGEX.test(lower)) {
      blocks.decoration_block.push(trimmed)
      continue // keep lastBlockType as 'decoration'
    }
    if (/da chuyen|\bcoc\b|\bcoc\b|\bck\b|bill|ngan hang|chuyen khoan|ref/i.test(lower)) {
      blocks.deposit_block.push(trimmed)
      lastBlockType = 'deposit'
      continue
    }
    const isGuestLine = /(\d+)\s*(?:pax|nguoi|người|ng\b|khach|khách|cho)/i.test(lower) || /nguoi lon|tre em|lon.*nho|be/i.test(lower)
    if (isGuestLine) {
      blocks.guest_count_block.push(trimmed)
      lastBlockType = 'guest'
    }
    const hasTime = /\b\d{1,2}:\d{2}\b/i.test(lower) || /\b\d{1,2}h\d{2}\b/i.test(lower) || /\b\d{1,2}h\b/i.test(lower)
    const hasDate = /\b\d{2}\/\d{2}\/\d{4}\b/i.test(lower) || /ngay/i.test(lower)
    if (hasTime || hasDate) {
      blocks.booking_time_block.push(trimmed)
      lastBlockType = 'time'
    }
    const hasPhone = /(0[35789]\d{7,9})/.test(lower)
    const hasCustomerKeywords = /anh|chi|dat ban|khach/i.test(lower)
    if (hasPhone || hasCustomerKeywords) {
      blocks.customer_block.push(trimmed)
      lastBlockType = 'customer'
    }
    const isDishNumberPattern = /^\d+[\/\.\-\)]?\s+/ui.test(trimmed) || /^\d+\s*[\/\.\-\)]\s*/ui.test(trimmed)
    const isDishSuffixPattern = /(?:\s*x\s*\d+|\s+\d{2,3}k|\s+\d{3}\.000|\d+\s*(?:con|phan|dia|set|c))\s*$/i.test(trimmed)
    const isMenuKeywordPattern = /combo|set menu|thuc don|mon an|thuc an/i.test(lower)
    const isBulletPattern = /^[-*+•]\s+[\p{L}\s]+/ui.test(trimmed)

    const isMenuLine = (isDishNumberPattern || isDishSuffixPattern || isMenuKeywordPattern || isBulletPattern) &&
                       !hasTime && !hasDate && !hasPhone && !isGuestLine
    if (isMenuLine) {
      blocks.menu_block.push(trimmed)
      lastBlockType = 'menu'
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
      lastBlockType = 'note'
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

// Pre-compiled honorific regexes (used in cleanHonorificPrefix — called 100s of times per parse)
const HONORIFIC_REGEXES = [
  'anh', 'chi', 'chị', 'em', 'chu', 'chú', 'co', 'cô', 'ong', 'ông', 'ba', 'bà', 'be', 'bé', 'bac', 'bác', 'khach', 'khách',
  'mr', 'ms', 'mrs', 'c\\.', 'c\\/', 'c', 'a\\.', 'a\\/', 'a', 'la', 'là',
  '(?:[A-G]|VIP)\\d+'
].map(h => new RegExp(`^(?:${h})\\s+`, 'i'))

export function cleanHonorificPrefix(name: string): string {
  let cleaned = name.trim()
  for (const regex of HONORIFIC_REGEXES) {
    if (regex.test(cleaned)) {
      cleaned = cleaned.replace(regex, '').trim()
    }
  }
  return cleaned
}

export const AMBIGUOUS_VIETNAMESE_NAME_TOKENS = new Set([
  'nam', 'mai', 'dat', 'đạt', 'son', 'sơn', 'hanh', 'hạnh', 'oanh', 'vui',
  'bang', 'bằng', 'hai', 'hải', 'phuc', 'phúc', 'tam', 'tâm', 'hien', 'hiền',
  'dung', 'dũng', 'loan', 'lanh', 'lành',
  'chi', 'chị', 'anh', 'em', 'chu', 'chú', 'co', 'cô', 'ong', 'ông', 'ba', 'bà', 'be', 'bé', 'bac', 'bác', 'khach', 'khách'
])

// Module-level sets — allocated once, used in classifyPeopleNames (hot path)
const INVALID_NAME_SET = new Set([
  'đặt', 'ban', 'bàn', 'giup', 'giúp', 'minh', 'toi', 'tối', 'ngay', 'ngày', 'gio', 'giờ', 'pax', 'khach', 'khách', 'nguoi', 'người',
  'sdt', 'sđt', 'lien', 'liên', 'he', 'hệ', 'cho', 'duoc', 'được', 'khong', 'không', 'nhe', 'nhé', 'nha', 'nhà', 'ho', 'hộ',
  'lam', 'làm', 'sao', 'nao', 'nào', 'chua', 'chưa', 'co', 'có', 'hoi', 'hỏi', 'xin', 'xem', 'gui', 'gửi', 'nhan', 'nhận',
  'con', 'còn', 'la', 'là', 'luc', 'lúc', 'trua', 'trưa', 'sang', 'sáng', 'chieu', 'chiều', 'tai', 'tại',
  'lon', 'lớn', 'nho', 'nhỏ', 'tre', 'trẻ', 'em', 'vip', 'khu', 'phong', 'phòng', 'guong', 'gương', 'bang', 'bảng', 'hang', 'hàng'
])

const STOP_WORDS = new Set([
  'ngay', 'mai', 'hom', 'nay', 'kia', 'mot', 'tuan', 'thang', 'nam',
  'gio', 'luc', 'tam', 'khoang', 'sang', 'trua', 'chieu', 'toi',
  'pax', 'nguoi', 'khach', 'ban', 'table', 'ghe', 'hang', 'hàng',
  'sinh', 'nhat', 'thoi', 'noi', 'hop', 'lop', 'lien', 'hoan', 'tiec', 'cuoi', 'hpbd', 'hbd', 'sn', 'mung', 'tho', 'tieu', 'ca', 'nhac',
  'coc', 'ck', 'chuyen', 'khoan', 'bill', 'bank', 'banking', 'momo',
  'mon', 'an', 'menu', 'combo', 'set', 'lau', 'nuong', 'xao', 'hap', 'bo', 'ga', 'heo', 'suon', 'de', 'tom', 'cua', 'muc',
  'nv', 'dmt', 'nhan', 'gui', 'nha', 'giup', 'giom', 'sdt', 'he',
  'thuong', 'lon', 'nho', 'be', 'tre', 'em',
  'yeu', 'cau', 'trang', 'tri', 'phong', 'lanh', 'sanh', 'may', 'ngoai', 'troi', 'san', 'khau', 'gan', 'bong', 'bay', 'board', 'chu',
  'thiet', 'ke', 'bao', 'gia', 'thuc', 'don', 'uong', 'giam', 'khuyen', 'tang', 'banh', 'kem', 'hoa', 'nen',
  'hat', 'acoustic', 'phuc', 'vu', 'vien', 'ho', 'tro', 'dao', 'nhiet', 'tinh', 'phi', 'dich', 'free', 'mien',
  'bat', 'dua', 'chen', 'ly', 'da', 'khan', 'uot', 'ngot', 'cay', 'chua', 'man', 'lat',
  'chien', 'luoc', 'goi', 'salad', 'sup', 'canh', 'com', 'mi', 'bun', 'pho', 'chao', 'khoai', 'tay', 'ngo', 'bap', 'dau',
  'rau', 'hanh', 'toi', 'ot', 'sa', 'gung', 'rieng', 'me', 'dam', 'sot', 'mam', 'muoi', 'duong',
  'chinh', 'nem', 'sua', 'trung', 'bot', 'tuong', 'thit', 'vit', 'ngan', 'ngong', 'cuu',
  'ech', 'luon', 'ghe', 'bach', 'tuoc', 'hau', 'so', 'ngheu', 'oc', 'hen', 'cha',
  'xuc', 'xich', 'lap', 'xuong', 'roi', 'chi', 'linh', 'long', 'doi', 'tai', 'mui', 'luoi', 'chan', 'dui',
  'uc', 'tim', 'cat', 'pheo', 'day', 'tu', 'sun', 'duoi', 'co', 'mo', 'nac',
  'than', 'vai', 'nong', 'ma'
])

// Pre-compiled regex for rejecting common non-name tokens (used 5x in classifyPeopleNames)
const REJECT_NAME_REGEX = /^(nay|kia|truoc|sau|sang|chieu|toi|ngay|gio|pax|khach|nguoi|ban|mon|set|combo|happy|birthday|hbd|hpbd|sinh|nhat|thoi|noi|giup|giom|cho|sdt|lien|he|table|pax|duoc|khong|hang|hàng)$/i

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

  // --- NER Upgrade: Boost score if name matches common VN first names ---
  const lastWordNoAccent = stripAccents(words[words.length - 1] || '').toLowerCase()
  if (COMMON_VN_FIRST_NAMES.has(lastWordNoAccent) && !hasAmbiguousToken) {
    score += 0.05
    signals.push('common_vn_name')
  }

  const escapedName = nameClean.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')

  if (isSingleToken && hasAmbiguousToken) {
    const checkHonorific = new RegExp(`(?<!\\p{L})(?:anh|chi|chị|em|chu|chú|co|cô|ong|ông|ba|bà|be|bé|bac|bác|khach|khách)\\s+${escapedName}(?!\\p{L})`, 'ui')
    if (!checkHonorific.test(normalizedText)) {
      score -= 0.35
      risks.push('ambiguous_single_token_name')
    }
  }

  const honorificRegex = new RegExp(`(?<!\\p{L})(?:anh|chi|chị|em|chu|chú|co|cô|ong|ông|ba|bà|be|bé|bac|bác|khach|khách)\\s+${escapedName}(?!\\p{L})`, 'ui')
  if (honorificRegex.test(normalizedText)) {
    score += 0.20
    signals.push('honorific_before_name')
  }

  const introRegex = new RegExp(`(?<!\\p{L})(?:ten la|tên là|ten em la|tên em là|ten anh la|tên anh là|ten chi la|tên chị là|minh la|mình là|em la|em là|anh la|anh là|chi la|chị là)\\s+${escapedName}(?!\\p{L})`, 'ui')
  if (introRegex.test(normalizedText)) {
    score += 0.35
    signals.push('introduction_phrase')
  }

  const contactPrefixRegex = new RegExp(`(?<!\\p{L})(?:lien he|liên hệ|sdt|sđt)\\s+(?:anh\\s+|chi\\s+|chị\\s+)?${escapedName}(?!\\p{L})`, 'ui')
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

  // --- NER Upgrade: Positional Context Score ---
  // Names appearing on the first non-empty line get a boost
  const textLines = normalizedText.split('\n').filter(l => l.trim())
  if (textLines.length > 0) {
    const firstLineLower = textLines[0].toLowerCase()
    if (firstLineLower.includes(nameCleanLower)) {
      score += 0.10
      signals.push('first_line_position')
    }
  }

  // --- NER Upgrade: Abbreviated name + phone detection ---
  // Pattern like "T.Trang 0901234567" or "C.Hằng 0987654321"
  const abbrPhoneRegex = new RegExp(`[A-Z]\\s*\\.\\s*${escapedName}\\s+0[35789]\\d{7,9}`, 'i')
  if (abbrPhoneRegex.test(normalizedText)) {
    score += 0.30
    signals.push('abbreviated_name_with_phone')
  }

  const hasStrongNameSignal = signals.includes('introduction_phrase') || signals.includes('honorific_before_name') || signals.includes('contact_prefix')

  if (!hasStrongNameSignal && nameCleanNoAccent === 'mai') {
    const maiContextRegex = new RegExp(`(?<!\\p{L})(?:ngay|ngày|toi|tối|chieu|chiều|trua|trưa|sang|sáng|den|đến|hen|hẹn|thoi|thôi)\\s+${escapedName}(?!\\p{L})`, 'ui')
    if (maiContextRegex.test(normalizedText)) {
      score -= 0.40
      risks.push('mai_time_context')
    }
    const maiAskRegex = new RegExp(`${escapedName}\\s+(?:dat\\s+)?(?:duoc|được)\\s+(?:khong|không)`, 'ui')
    if (maiAskRegex.test(normalizedText)) {
      score -= 0.25
      risks.push('ask_context')
    }
  }

  if (!hasStrongNameSignal && (nameCleanNoAccent === 'son' || nameCleanNoAccent === 'sơn')) {
    const sonVerbRegex = new RegExp(`(?<!\\p{L})(?:nuoc|nước|son|sơn)\\s+${escapedName}(?!\\p{L})|(?<!\\p{L})${escapedName}\\s+(?:lai|lại|tuong|tường)(?!\\p{L})`, 'ui')
    if (sonVerbRegex.test(normalizedText)) {
      score -= 0.40
      risks.push('son_verb_context')
    }
  }

  if (!hasStrongNameSignal && nameCleanNoAccent === 'vui') {
    const vuiPhraseRegex = new RegExp(`(?<!\\p{L})${escapedName}\\s+(?:long|lòng|ve|vẻ)(?!\\p{L})`, 'ui')
    if (vuiPhraseRegex.test(normalizedText)) {
      score -= 0.40
      risks.push('vui_phrase_context')
    }
  }

  if (!hasStrongNameSignal && (nameCleanNoAccent === 'bang' || nameCleanNoAccent === 'bằng')) {
    const bangPhraseRegex = new RegExp(`(?<!\\p{L})${escapedName}\\s+(?:momo|ck|chuyen|chuyển|tien|tiền|the|thẻ|mat|mặt|va|và)(?!\\p{L})|(?<!\\p{L})(?:dat|đặt|thanh\\s+toan|thanh\\s+toán|tra|trả)\\s+${escapedName}(?!\\p{L})`, 'ui')
    if (bangPhraseRegex.test(normalizedText)) {
      score -= 0.40
      risks.push('bang_preposition_context')
    }
  }

  if (!hasStrongNameSignal && (nameCleanNoAccent === 'dat' || nameCleanNoAccent === 'đạt')) {
    const datVerbRegex = new RegExp(`(?<!\\p{L})(?:dat|đặt)\\s+(?:ban|bàn|truoc|trước|mon|món|cho|viet|viết)(?!\\p{L})|(?<!\\p{L})${escapedName}\\s+(?:chua|chưa)(?!\\p{L})`, 'ui')
    if (datVerbRegex.test(normalizedText)) {
      score -= 0.40
      risks.push('dat_verb_context')
    }
  }

  if (!hasStrongNameSignal && nameCleanNoAccent === 'nam') {
    const namGenderRegex = new RegExp(`(?<!\\p{L})(?:nguoi|người|khach|khách|lon|lớn|pax|\\d+)\\s+${escapedName}(?!\\p{L})|(?<!\\p{L})${escapedName}\\s+(?:lon|lớn|nu|nữ|nguoi|người|khach|khách)(?!\\p{L})`, 'ui')
    if (namGenderRegex.test(normalizedText)) {
      score -= 0.40
      risks.push('nam_noun_context')
    }
  }

  // --- NER Upgrade: Additional ambiguous names ---
  if (!hasStrongNameSignal && (nameCleanNoAccent === 'hai' || nameCleanNoAccent === 'hải')) {
    // "hai" can be number 2 in Vietnamese
    const haiNumberRegex = new RegExp(`(?<!\\p{L})${escapedName}\\s+(?:ban|bàn|nguoi|người|phan|phần|mon|món|con|cai|cái|dia|đĩa|ly|lon|chai)(?!\\p{L})`, 'ui')
    if (haiNumberRegex.test(normalizedText)) {
      score -= 0.40
      risks.push('hai_number_context')
    }
  }

  if (!hasStrongNameSignal && (nameCleanNoAccent === 'loan' || nameCleanNoAccent === 'lộn')) {
    const loanVerbRegex = new RegExp(`(?<!\\p{L})(?:lon|lộn|xon)\\s+${escapedName}(?!\\p{L})`, 'ui')
    if (loanVerbRegex.test(normalizedText)) {
      score -= 0.35
      risks.push('loan_verb_context')
    }
  }

  if (!hasStrongNameSignal && (nameCleanNoAccent === 'dung' || nameCleanNoAccent === 'dũng')) {
    const dungNounRegex = new RegExp(`(?<!\\p{L})(?:dung\\s+dich|dung\\s+moi|dung\\s+tich)(?!\\p{L})`, 'ui')
    if (dungNounRegex.test(normalizedText)) {
      score -= 0.35
      risks.push('dung_noun_context')
    }
  }

  if (!hasStrongNameSignal && (nameCleanNoAccent === 'hanh' || nameCleanNoAccent === 'hạnh')) {
    const hanhNounRegex = new RegExp(`(?<!\\p{L})(?:hanh\\s+phuc|hạnh\\s+phúc|hat\\s+hanh|hạt\\s+hạnh)(?!\\p{L})`, 'ui')
    if (hanhNounRegex.test(normalizedText)) {
      score -= 0.35
      risks.push('hanh_noun_context')
    }
  }

  // Check if message is too short and lacks booking context
  const hasPhone = /(0[35789]\d{7,9})/.test(normalizedText)
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
  const depositSenderCandidates: string[] = []
  
  const invalidNameSet = INVALID_NAME_SET

  const isInvalidName = (nameValStr: string) => {
    const nameWords = stripAccents(nameValStr).toLowerCase().split(/\s+/)
    return nameWords.some(w => {
      if (w === 'minh') {
        const isCapitalized = text.includes('Minh')
        const hasNameIndicator = /\b(anh|chi|chị|em|chu|chú|co|cô|ong|ông|ba|bà|be|bé|bac|bác|ten|tên)\s+minh\b/i.test(text)
        return !(isCapitalized || hasNameIndicator)
      }
      return invalidNameSet.has(w)
    })
  }

  const cleanTrailingInvalidWords = (nameStr: string): string => {
    let cleaned = nameStr.trim()
    while (true) {
      const words = cleaned.split(/\s+/)
      if (words.length <= 1) break
      const lastWordNorm = stripAccents(words[words.length - 1]).toLowerCase()
      if (invalidNameSet.has(lastWordNorm)) {
        words.pop()
        cleaned = words.join(' ')
      } else {
        break
      }
    }
    return cleaned
  }

  const lines = text.split('\n')
  // Check if first non-empty line is a clean capitalized name (e.g. "Ánh Tiên")
  for (const line of lines) {
    const firstClean = line.trim()
    if (!firstClean) continue
    if (/^[\p{Lu}][\p{Ll}]+(?:\s+[\p{Lu}][\p{Ll}]+){0,3}$/u.test(firstClean)) {
      const cleanName = cleanHonorificPrefix(firstClean)
      if (cleanName && !isInvalidName(cleanName) && !REJECT_NAME_REGEX.test(stripAccents(cleanName))) {
        if (!peopleNames.includes(cleanName)) peopleNames.push(cleanName)
        if (!bookerCandidates.includes(cleanName)) bookerCandidates.push(cleanName)
      }
    }
    break
  }

  for (const line of lines) {
    const lineClean = line.trim()
    if (!lineClean) continue

    // Check explicit field labels like "● Khách hàng: Serena", "Tên khách: Serena", "Người đặt: Serena"
    const labelMatch = lineClean.match(/^(?:[▶•●\*\-]\s*)?(?:khách\s*hàng|khach\s*hang|tên\s*khách|ten\s*khach|người\s*đặt|nguoi\s*dat|người\s*liên\s*hệ|nguoi\s*lien\s*he|tên|ten|khách|khach)\s*[:\-–—]\s*([A-Za-z\p{L}\s\.\-]+)$/iu)
    if (labelMatch) {
      const explicitName = cleanHonorificPrefix(labelMatch[1].trim())
      if (explicitName && !isInvalidName(explicitName) && !REJECT_NAME_REGEX.test(stripAccents(explicitName))) {
        if (!peopleNames.includes(explicitName)) peopleNames.push(explicitName)
        if (!bookerCandidates.includes(explicitName)) bookerCandidates.unshift(explicitName)
      }
    }
    
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
        if (cleanName && !REJECT_NAME_REGEX.test(stripAccents(cleanName))) {
          if (!isInvalidName(cleanName) && !peopleNames.includes(cleanName)) {
            peopleNames.push(cleanName)
          }
        }
      }
      
      // Look for a single word after the phone
      const afterWords = afterText.split(/\s+/)
      const firstWord = afterWords[0]
      if (firstWord && /^[A-Z\p{Lu}][\p{Ll}]+$/u.test(firstWord)) {
        const cleanName = cleanHonorificPrefix(firstWord)
        if (cleanName && !REJECT_NAME_REGEX.test(stripAccents(cleanName))) {
          if (!isInvalidName(cleanName) && !peopleNames.includes(cleanName)) {
            peopleNames.push(cleanName)
          }
        }
      }
    }

    const nameRegex = /(?:khách\s+hàng|khach\s+hang|tên\s+khách|ten\s+khach|người\s+đặt|nguoi\s+dat|anh|chị|chi|em|chú|chu|cô|co|ông|ong|bà|ba|bé|be|bác|bac|khách|khach|tên|ten|đặt|dat|cho|liên\s+hệ|lien\s+he)\s*[:\-]?\s+((?!hang\b|hàng\b|cho\b|dat\b|đặt\b|dat\s+ban|đặt\s+bàn|xin\b|gui\b|gửi\b|nha\b|nhà\b|ngay\b|ngày\b|luc\b|lúc\b|vao\b|vào\b|sdt\b|sđt\b|ban\b|bàn\b|trua\b|trưa\b|sang\b|sáng\b|chieu\b|chiều\b|toi\b|tối\b|tai\b|tại\b|lon\b|lớn\b|nho\b|nhỏ\b|tre\b|trẻ\b|em\b|pax\b|khach\b|khách\b|nguoi\b|người\b)\p{L}+(?:\s+(?!hang\b|hàng\b|cho\b|dat\b|đặt\b|dat\s+ban|đặt\s+bàn|xin\b|gui\b|gửi\b|nha\b|nhà\b|ngay\b|ngày\b|luc\b|lúc\b|vao\b|vào\b|sdt\b|sđt\b|ban\b|bàn\b|trua\b|trưa\b|sang\b|sáng\b|chieu\b|chiều\b|toi\b|tối\b|tai\b|tại\b|lon\b|lớn\b|nho\b|nhỏ\b|tre\b|trẻ\b|em\b|pax\b|khach\b|khách\b|nguoi\b|người\b)\p{L}+){0,3})/gui
    let match
    while ((match = nameRegex.exec(lineClean)) !== null) {
      const cleanedRaw = cleanTrailingInvalidWords(match[1])
      if (!cleanedRaw) continue
      const rawNameFirstChar = cleanedRaw.charAt(0)
      const isCapitalized = rawNameFirstChar === rawNameFirstChar.toUpperCase()
      const normName = stripAccents(cleanedRaw).toLowerCase()
      if (['anh', 'chi', 'em', 'chu', 'co', 'ong', 'ba', 'be', 'bac', 'khach'].includes(normName) && !isCapitalized) {
        continue
      }
      let name = cleanHonorificPrefix(cleanedRaw)
      if (name.length <= 1) continue
      if (REJECT_NAME_REGEX.test(stripAccents(name))) {
        continue
      }
      // Bộ lọc từ cấm cho tên khớp từ regex nameRegex:
      if (isInvalidName(name)) continue

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
      const stopWords = STOP_WORDS
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
    { regex: /(?:sinh nhật|sinh nhat|hbd|hpbd|happy birthday|thôi nôi|thoi noi|đầy tháng|day thang|bé|be)\s+of\s+((?!cho\b|dat\b|đặt\b|dat\s+ban|đặt\s+bàn|xin\b|gui\b|gửi\b|nha\b|nhà\b|ngay\b|ngày\b|luc\b|lúc\b|vao\b|vào\b|sdt\b|sđt\b|ban\b|bàn\b|trua\b|trưa\b|sang\b|sáng\b|chieu\b|chiều\b|toi\b|tối\b|tai\b|tại\b|lon\b|lớn\b|nho\b|nhỏ\b|tre\b|trẻ\b|em\b|pax\b|khach\b|khách\b|nguoi\b|người\b)\p{L}+(?:\s+(?!cho\b|dat\b|đặt\b|dat\s+ban|đặt\s+bàn|xin\b|gui\b|gửi\b|nha\b|nhà\b|ngay\b|ngày\b|luc\b|lúc\b|vao\b|vào\b|sdt\b|sđt\b|ban\b|bàn\b|trua\b|trưa\b|sang\b|sáng\b|chieu\b|chiều\b|toi\b|tối\b|tai\b|tại\b|lon\b|lớn\b|nho\b|nhỏ\b|tre\b|trẻ\b|em\b|pax\b|khach\b|khách\b|nguoi\b|người\b)\p{L}+){0,3})/ugi, isPartyOwner: true },
    { regex: /(?:sinh nhật|sinh nhat|hbd|hpbd|happy birthday|thôi nôi|thoi noi|đầy tháng|day thang|bé|be)\s+((?!cho\b|dat\b|đặt\b|dat\s+ban|đặt\s+bàn|xin\b|gui\b|gửi\b|nha\b|nhà\b|ngay\b|ngày\b|luc\b|lúc\b|vao\b|vào\b|sdt\b|sđt\b|ban\b|bàn\b|trua\b|trưa\b|sang\b|sáng\b|chieu\b|chiều\b|toi\b|tối\b|tai\b|tại\b|lon\b|lớn\b|nho\b|nhỏ\b|tre\b|trẻ\b|em\b|pax\b|khach\b|khách\b|nguoi\b|người\b)\p{L}+(?:\s+(?!cho\b|dat\b|đặt\b|dat\s+ban|đặt\s+bàn|xin\b|gui\b|gửi\b|nha\b|nhà\b|ngay\b|ngày\b|luc\b|lúc\b|vao\b|vào\b|sdt\b|sđt\b|ban\b|bàn\b|trua\b|trưa\b|sang\b|sáng\b|chieu\b|chiều\b|toi\b|tối\b|tai\b|tại\b|lon\b|lớn\b|nho\b|nhỏ\b|tre\b|trẻ\b|em\b|pax\b|khach\b|khách\b|nguoi\b|người\b)\p{L}+){0,3})/ugi, isPartyOwner: true },
    { regex: /(?:bảng tên|bang ten|chữ|chu)\s+((?!cho\b|dat\b|đặt\b|dat\s+ban|đặt\s+bàn|xin\b|gui\b|gửi\b|nha\b|nhà\b|ngay\b|ngày\b|luc\b|lúc\b|vao\b|vào\b|sdt\b|sđt\b|ban\b|bàn\b|trua\b|trưa\b|sang\b|sáng\b|chieu\b|chiều\b|toi\b|tối\b|tai\b|tại\b|lon\b|lớn\b|nho\b|nhỏ\b|tre\b|trẻ\b|em\b|pax\b|khach\b|khách\b|nguoi\b|người\b)\p{L}+(?:\s+(?!cho\b|dat\b|đặt\b|dat\s+ban|đặt\s+bàn|xin\b|gui\b|gửi\b|nha\b|nhà\b|ngay\b|ngày\b|luc\b|lúc\b|vao\b|vào\b|sdt\b|sđt\b|ban\b|bàn\b|trua\b|trưa\b|sang\b|sáng\b|chieu\b|chiều\b|toi\b|tối\b|tai\b|tại\b|lon\b|lớn\b|nho\b|nhỏ\b|tre\b|trẻ\b|em\b|pax\b|khach\b|khách\b|nguoi\b|người\b)\p{L}+){0,3})/ugi, isPartyOwner: true },
    { regex: /(?:tên|ten)\s+(?:em|mình|minh|tôi|toi|anh|chị|chi)\s+(?:là\s+)?(\p{L}+(?:\s+\p{L}+){0,2})/ugi, isBooker: true },
    { regex: /(?:người đặt|nguoi dat|liên hệ|lien he|anh|chị|chi|sđt|sdt|tên|ten)\s+((?!dat\b|đặt\b|cho\b|xin\b|gui\b|gửi\b|nha\b|nhà\b|ngay\b|ngày\b|luc\b|lúc\b|vao\b|vào\b|sdt\b|sđt\b|ban\b|bàn\b|trua\b|trưa\b|sang\b|sáng\b|chieu\b|chiều\b|toi\b|tối\b|tai\b|tại\b|lon\b|lớn\b|nho\b|nhỏ\b|tre\b|trẻ\b|em\b|pax\b|khach\b|khách\b|nguoi\b|người\b)\p{L}+(?:\s+(?!dat\b|đặt\b|cho\b|xin\b|gui\b|gửi\b|nha\b|nhà\b|ngay\b|ngày\b|luc\b|lúc\b|vao\b|vào\b|sdt\b|sđt\b|ban\b|bàn\b|trua\b|trưa\b|sang\b|sáng\b|chieu\b|chiều\b|toi\b|tối\b|tai\b|tại\b|lon\b|lớn\b|nho\b|nhỏ\b|tre\b|trẻ\b|em\b|pax\b|khach\b|khách\b|nguoi\b|người\b)\p{L}+){0,3})/ugi, isBooker: true },
    { regex: /\b((?:cty|công ty|đoàn|doan|team|group|phòng|phong)\s+(?!cho\b|dat\b|đặt\b|dat\s+ban|đặt\s+bàn|xin\b|gui\b|gửi\b|nha\b|nhà\b|ngay\b|ngày\b|luc\b|lúc\b|vao\b|vào\b|sdt\b|sđt\b|ban\b|bàn\b|trua\b|trưa\b|sang\b|sáng\b|chieu\b|chiều\b|toi\b|tối\b|tai\b|tại\b|lon\b|lớn\b|nho\b|nhỏ\b|tre\b|trẻ\b|em\b|pax\b|khach\b|khách\b|nguoi\b|người\b)\p{L}+(?:\s+(?!cho\b|dat\b|đặt\b|dat\s+ban|đặt\s+bàn|xin\b|gui\b|gửi\b|nha\b|nhà\b|ngay\b|ngày\b|luc\b|lúc\b|vao\b|vào\b|sdt\b|sđt\b|ban\b|bàn\b|trua\b|trưa\b|sang\b|sáng\b|chieu\b|chiều\b|toi\b|tối\b|tai\b|tại\b|lon\b|lớn\b|nho\b|nhỏ\b|tre\b|trẻ\b|em\b|pax\b|khach\b|khách\b|nguoi\b|người\b)\p{L}+){0,4})\b/ugi, isBooker: true, isPartyOwner: true }
  ]

  specialPatterns.forEach(({ regex, isPartyOwner, isBooker }) => {
    regex.lastIndex = 0
    let match
    while ((match = regex.exec(text)) !== null) {
      const cleanedRaw = cleanTrailingInvalidWords(match[1])
      if (!cleanedRaw) continue
      const rawNameFirstChar = cleanedRaw.charAt(0)
      const isCapitalized = rawNameFirstChar === rawNameFirstChar.toUpperCase()
      const normName = stripAccents(cleanedRaw).toLowerCase()
      if (['anh', 'chi', 'em', 'chu', 'co', 'ong', 'ba', 'be', 'bac', 'khach'].includes(normName) && !isCapitalized) {
        continue
      }
      let name = cleanHonorificPrefix(cleanedRaw)
      if (name.length > 1 && !REJECT_NAME_REGEX.test(stripAccents(name))) {
        // Bộ lọc từ cấm cho tên khớp từ specialPatterns:
        if (isInvalidName(name)) continue

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

  // --- Deposit Sender Isolation (#4) ---
  // Detect names that appear in deposit/transfer context
  const depositSenderRegex = /(?:đã chuyển|da chuyen|chuyển khoản|chuyen khoan|\bck\b|cọc|đặt cọc|nộp|gửi cọc)\s+(?:anh|chị|chi|em)?\s*(\p{L}+(?:\s+\p{L}+){0,2})/ugi
  let depMatch
  while ((depMatch = depositSenderRegex.exec(text)) !== null) {
    const senderName = cleanHonorificPrefix(depMatch[1].trim())
    if (senderName && senderName.length > 1 && !REJECT_NAME_REGEX.test(stripAccents(senderName))) {
      if (!depositSenderCandidates.includes(senderName)) {
        depositSenderCandidates.push(senderName)
      }
    }
  }
  // Also detect reverse pattern: "Anh Thuận đã chuyển"
  const depositSenderReverseRegex = /(?:anh|chị|chi|em)\s+(\p{L}+(?:\s+\p{L}+){0,2})\s+(?:đã chuyển|da chuyen|chuyển khoản|chuyen khoan|đã cọc|da coc|nộp cọc)/ugi
  while ((depMatch = depositSenderReverseRegex.exec(text)) !== null) {
    const senderName = cleanHonorificPrefix(depMatch[1].trim())
    if (senderName && senderName.length > 1 && !REJECT_NAME_REGEX.test(stripAccents(senderName))) {
      if (!depositSenderCandidates.includes(senderName)) {
        depositSenderCandidates.push(senderName)
      }
    }
  }
  // Remove deposit senders from booker candidates
  for (const sender of depositSenderCandidates) {
    const idx = bookerCandidates.indexOf(sender)
    if (idx !== -1) bookerCandidates.splice(idx, 1)
  }

  // --- NER Upgrade: Detect abbreviated name + phone pattern ---
  // Pattern like "T.Trang 0901234567" or "C.Hằng 0987654321"
  const abbrNamePhoneRegex = /[A-Z]\s*\.\s*(\p{Lu}[\p{Ll}]+)\s+0[35789]\d{7,9}/gu
  let abbrMatch
  while ((abbrMatch = abbrNamePhoneRegex.exec(text)) !== null) {
    const abbrName = abbrMatch[1].trim()
    if (abbrName && abbrName.length > 1 && !REJECT_NAME_REGEX.test(stripAccents(abbrName))) {
      if (!peopleNames.includes(abbrName)) peopleNames.push(abbrName)
      if (!bookerCandidates.includes(abbrName)) bookerCandidates.push(abbrName)
    }
  }

  return {
    peopleNames,
    bookerCandidates,
    partyOwnerCandidates,
    depositSenderCandidates
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

  clean = clean.replace(/(?<![\d\/])(?:\+84|84|0)(?:\s*[\.\-]?\s*\d){9}\b/g, (match) => {
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
    { pattern: /\b(tcocktail|t\s+cocktail)\b/gi, replacement: 'Tôm cocktail' }
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

  clean = clean.replace(/(?<![\d\/])(?:\(\+84\)\s*|\+84\s*|0(?=[35789])|84(?=[35789]))\s*([35789]\d{1,2})[\s\.\-]*(\d{3})[\s\.\-]*(\d{3,4})\b/gi, (m, p1, p2, p3) => {
    return (p1 && p2 && p3) ? `0${p1}${p2}${p3}` : m
  })

  clean = clean.replace(/\b(\d{1,2})h(\d{2})m\b/gi, '$1:$2')
  clean = clean.replace(/\b(\d{1,2})h(\d{2})\b/gi, '$1:$2')
  clean = clean.replace(/\b(\d{1,2})h\b/gi, '$1:00')
  clean = clean.replace(/(?<![\.\d])\b([0-2]?\d)g(\d{2})\b/gi, '$1:$2')
  clean = clean.replace(/(?<![\.\d])\b(1[0-9]|2[0-4]|[6-9])g\b(?!\s*(?:k|ram|r|con|kg))/gi, '$1:00')

  clean = clean.replace(/(\d+)(pax|người|khách|cho|nguoi|khach|ban)/gi, '$1 $2')
  clean = clean.replace(/([\p{L}]{2,})(\d+)\b/ugi, (match, word, num) => {
    const lowerWord = stripAccents(word).toLowerCase()
    if (/^(set|combo|menu|ban|table|vip|tang|goi|phong|kv|khu|khu\s+vuc)$/.test(lowerWord)) {
      return `${word} ${num}`
    }
    return `${word} x${num}`
  })
  clean = clean.replace(/(?<!\.)(\d+)(?![hg\d\s\/:\-\.,]|kg|ml)([\p{L}])/ugi, '$1 $2')
  clean = clean.replace(/(\d+(?:[\.,]\d+)?)\s*(kg|g|ml|l)\b/gi, '$1$2')

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
    return ` ${prefix || ''} ${String(hour).padStart(2, '0')}:${m} `
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
    { pattern: /\b(hôm nay|tối nay|chiều nay|hom nay|toi nay|chieu nay)\b/gi, offset: 0 },
    { pattern: /\b(ngày mai|chiều mai|tối mai|sáng mai|ngay mai|chieu mai|toi mai|sang mai)\b/gi, offset: 1 },
    { pattern: /\b(ngày mốt|mốt|ngày kia|ngay mot|ngay kia)\b/gi, offset: 2 }
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

  clean = clean.replace(/(?<!\d[\.\-\/])\b(\d{1,2})[\/\.](\d{1,2})(?!\s*(?:con|kg|g|l|ml|pax|phần|phan|đĩa|dia|tô|to|trái|trai|cái|cai|lon|chai|suất|suat)(?!\p{L}))/ugi, (match, d, m) => {
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

export function parseSingleMenuLine(lineStr: string): { raw_name: string; quantity: number; unit_price: number | null; note: string } | null {
  let cleaned = lineStr.trim()
  if (!cleaned) return null

  // Strip leading/trailing quote characters (e.g. from pasted messages with quotes)
  cleaned = cleaned.replace(/^["'“”«»]+|["'“”«»]+$/g, '').trim()
  if (!cleaned) return null

  // Skip quote headers without food context
  if (/^["'“”«»][^0-9]+["'“”«»]$/i.test(cleaned) && !/lẩu|nướng|xào|hấp|chiên|sốt|gà|bò|heo|tôm|cua|mực|cá|cơm|mì|bún|đậu|chả|chay/i.test(cleaned)) {
    return null
  }

  // 1. Strip STT index prefix: e.g. "1/", "1.", "1)", "1 -", "1/ ", "1 ", "1/ " (excluding decimals like 0.5kg and fractions like 1/2 con)
  cleaned = cleaned.replace(/^(?!\d+[\.,]\d+)(?!1\/[2348]\b)([1-9]\d{0,2})\s*[\/\.\-\)]\s*/, '')
  // Also strip bullet points
  cleaned = cleaned.replace(/^[-*+•]\s+/, '')

  cleaned = cleaned.trim()
  if (!cleaned) return null

  // Mask portion parens like "(5 con)" so they aren't misparsed as trailing order quantity
  const portionParens: string[] = []
  cleaned = cleaned.replace(/\(\s*\d+\s*(?:con|c|kg|g|l|ml|phần|phan|đĩa|dia|tô|to|ly|lon|set|suất|suat)\s*\)/gi, (match) => {
    portionParens.push(match)
    return `__PORTION_PAREN_${portionParens.length - 1}__`
  })

  // 2. Extract portion/qty indicators like "3 phần", "3 đĩa", "3 tô", "3 ly", "3 lon"
  let qty = 1
  
  // Trailing quantity multiplier: "x1", "x 2", "*3", "(x1)", "1 phần"
  const trailingQtyMatch = cleaned.match(/(?:\((?:[x\*])\s*(\d+)\)|(?:[x\*])\s*(\d+)|\b(\d+)\s*(?:phần|phan|đĩa|dia|tô|to|ly|lon|set|suất|suat))\s*$/i)
  if (trailingQtyMatch) {
    qty = parseInt(trailingQtyMatch[1] || trailingQtyMatch[2] || trailingQtyMatch[3], 10) || 1
    cleaned = cleaned.replace(/(?:\((?:[x\*])\s*(\d+)\)|(?:[x\*])\s*(\d+)|\b(\d+)\s*(?:phần|phan|đĩa|dia|tô|to|ly|lon|set|suất|suat))\s*$/i, '').trim()
  } else {
    // Leading explicit quantity: "2x ", "3* ", "2 phần ", "3 đĩa "
    const leadingQtyMatch = cleaned.match(/^(?:(\d+)\s*[x\*]\s*|(\d+)\s*(?:phần|phan|đĩa|dia|tô|to|ly|lon|set|suất|suat)\s+)/i)
    if (leadingQtyMatch) {
      qty = parseInt(leadingQtyMatch[1] || leadingQtyMatch[2], 10) || 1
      cleaned = cleaned.replace(/^(?:(\d+)\s*[x\*]\s*|(\d+)\s*(?:phần|phan|đĩa|dia|tô|to|ly|lon|set|suất|suat)\s+)/i, '').trim()
    } else {
      // Check if leading "X con" is not a dish portion (5 con, 10 con)
      const leadingConMatch = cleaned.match(/^(\d+)\s*(?:con|c)\s+(.+)$/i)
      if (leadingConMatch) {
        const count = parseInt(leadingConMatch[1], 10)
        // If count is 5 or 10, it's a portion specification for oysters/seafood, not order quantity
        if (count !== 5 && count !== 10) {
          qty = count
          cleaned = leadingConMatch[2].trim()
        }
      }
    }
  }

  // Restore portion parens
  portionParens.forEach((p, idx) => {
    cleaned = cleaned.replace(`__PORTION_PAREN_${idx}__`, p)
  })

  // 3. Extract weight/portion notes like "0.5kg", "500g", "1/2 con", "½ con"
  let note = ''
  const weightNotes: string[] = []
  let portionNoteMatch
  const portionRegex = /\b(\d+(?:[\.,]\d+)?\s*(?:kg|g|l)|1\/2\s*con|½\s*con|nửa\s*con|nua\s*con)\b/gi
  while ((portionNoteMatch = portionRegex.exec(cleaned)) !== null) {
    weightNotes.push(portionNoteMatch[1].trim())
  }
  if (weightNotes.length > 0) {
    cleaned = cleaned.replace(/\b(\d+(?:[\.,]\d+)?\s*(?:kg|g|l)|1\/2\s*con|½\s*con|nửa\s*con|nua\s*con)\b/gi, '').trim()
    const decimalNote = weightNotes.find(n => /0[\.,]\d+/.test(n))
    note = decimalNote || weightNotes[weightNotes.length - 1]
  }

  // 3b. Extract trailing parenthetical notes like "(Giảm 10% tiền thức ăn)", "(không cay)"
  const parenNoteMatch = cleaned.match(/\s*\(([^)]+)\)\s*$/)
  if (parenNoteMatch) {
    const insideParen = parenNoteMatch[1].trim()
    if (!/^\d+\s*(?:con|c|kg|g|l|ml)$/i.test(insideParen)) {
      note = note ? `${note} - ${insideParen}` : insideParen
      cleaned = cleaned.replace(/\s*\([^)]+\)\s*$/, '').trim()
    }
  }

  // 4. Extract price inside dish line: "129K", "129k", "250.000đ", "120000"
  let unit_price: number | null = null
  const priceMatch = cleaned.match(/\b(\d{2,4})\s*(k|K)\b/) || cleaned.match(/\b(\d{1,3}(?:[\.,]\d{3})+)\s*(?:đ|VND|vnd)?\b/i)
  if (priceMatch) {
    if (priceMatch[2] && priceMatch[2].toLowerCase() === 'k') {
      unit_price = parseInt(priceMatch[1], 10) * 1000
    } else {
      unit_price = parseInt(priceMatch[1].replace(/[\.,]/g, ''), 10)
    }
    cleaned = cleaned.replace(priceMatch[0], '').trim()
  }

  // Clean trailing/leading punctuation or brackets
  cleaned = cleaned.replace(/\(\s*\)/g, '').replace(/^[\s-,\/:]+|[\s-,\/:]+$/g, '').replace(/\s+/g, ' ').trim()

  // Guard: if cleaned dish name is just numbers or metadata keywords, skip
  if (/^\d+$/.test(cleaned) || /^(nam|nu|khach|pax|nguoi|ban|table|sdt|gio|ngay|sinh nhat|hbd|coc|ck)$/i.test(stripAccents(cleaned))) {
    return null
  }

  if (cleaned.length < 2) return null

  return {
    raw_name: cleaned,
    quantity: qty,
    unit_price,
    note
  }
}

export interface DecorationDetails {
  decor_color: string | null
  board_text: string | null
  mirror_text: string | null
  special_requests: string[]
  raw_decoration_lines: string[]
}

export function extractDecorationDetails(decorationBlock: string): DecorationDetails {
  const result: DecorationDetails = {
    decor_color: null,
    board_text: null,
    mirror_text: null,
    special_requests: [],
    raw_decoration_lines: []
  }
  if (!decorationBlock) return result

  const lines = decorationBlock.split('\n').map(l => l.trim()).filter(Boolean)
  result.raw_decoration_lines = [...lines]

  for (const line of lines) {
    const cleanDecorLine = line.replace(/^[▶•●\*\-–—\u2800\s]+/g, '').trim()
    const lower = stripAccents(cleanDecorLine).toLowerCase()

    // 0. Line starting with "Trang trí:" or "Decor:" or "Setup:"
    const decorPrefixMatch = cleanDecorLine.match(/^(?:trang\s*tr[ií]|decor|setup)(?:\s*ti[eệ]c)?\s*[:\-–—]\s*(.+)/i)
    if (decorPrefixMatch) {
      const content = decorPrefixMatch[1].trim()
      if (!result.special_requests.includes(content)) {
        result.special_requests.push(content)
      }
      const parenColorMatch = content.match(/\(([^)]*(?:tr[aắ]ng|h[oồ]ng|xanh|v[aà]ng|[đd][oỏ]|t[ií]m|cam|[đd]en|n[aâ]u|b[aạ]c|gold|silver|pastel)[^)]*)\)/i)
      if (parenColorMatch && !result.decor_color) {
        result.decor_color = parenColorMatch[1].trim()
      }
      continue
    }

    // 1. Decor color: "tông hồng pastel", "tông màu: xanh dương", "tone: blue", "màu hồng", "tone hồng pastel"
    const colorMatch = cleanDecorLine.match(/(?:t[oô]ng\s*(?:m[aà]u)?|m[aà]u|tone|color)\s*[:\-]?\s*([^,\n;]+)/i)
    if (colorMatch && !result.decor_color) {
      result.decor_color = colorMatch[1].trim()
    }

    const genericParenColor = cleanDecorLine.match(/\(([^)]*(?:tr[aắ]ng|h[oồ]ng|xanh|v[aà]ng|[đd][oỏ]|t[ií]m|cam|[đd]en|n[aâ]u|b[aạ]c|gold|silver|pastel)[^)]*)\)/i)
    if (genericParenColor && !result.decor_color) {
      result.decor_color = genericParenColor[1].trim()
    }

    // 2. Special requests with labels: "Dặn dò: ...", "lưu ý: ...", "nhắc: ...", "yêu cầu: ...", "note: ..."
    const reqMatch = cleanDecorLine.match(/^(?:d[aặ]n\s*d[oò]|l[uư]u\s*[yý]|nh[aắ]c|y[eê]u\s*c[aầ]u|note)\s*[:\-]?\s*(.+)/i)
    if (reqMatch) {
      result.special_requests.push(reqMatch[1].trim())
      continue
    }

    // 3. Board text: "Bảng: HBD Bé Su", "bảng sinh nhật: ...", "bảng chữ: ...", "bảng tên: ..."
    const boardMatch = line.match(/(?:b[aả]ng(?:\s+t[eê]n|\s+ch[uữ]|\s+sinh\s*nh[aậ]t|\s+m[uừ]ng)?|bang(?:\s+ten|\s+chu|\s+sinh\s*nhat|\s+mung)?)\s*[:\-]?\s*(.+)/i)
    if (boardMatch && !result.board_text) {
      result.board_text = boardMatch[1].trim()
      continue
    }

    // 4. Mirror text: "Gương viết: Welcome", "gương: ...", "mirror: ..."
    const mirrorMatch = line.match(/(?:g[uư][oơ]ng(?:\s+vi[eế]t(?:\s+t[eê]n)?)?|mirror)\s*[:\-]?\s*(.+)/i)
    if (mirrorMatch && !result.mirror_text) {
      result.mirror_text = mirrorMatch[1].trim()
      continue
    }

    // 5. Flower & Balloon Decoration: "Trang trí hoa tươi", "Hoa tươi trên bàn", "Bong bóng tone hồng", "Bóng bay pastel"
    if (/hoa\s+tuoi|hoa\s+lua|hoa\s+sap|cam\s+hoa|bong\s+bong|bong\s+bay|backdrop|banh\s+kem|phao|nen/i.test(lower)) {
      if (!result.special_requests.includes(line)) {
        result.special_requests.push(line)
      }
      continue
    }

    // 6. If line contains HBD or Happy Birthday text and no board_text yet, extract the message
    if (!result.board_text) {
      const hbdMatch = line.match(/(?:happy\s*birthday|hbd|hpbd|ch[uú]c\s*m[uừ]ng)\s+(.+)/i)
      if (hbdMatch) {
        result.board_text = hbdMatch[1].trim()
        continue
      }
    }
  }

  return result
}

export function extractByRules(rawOrNormalizedText: string) {
  const normalizedText = preNormalizeInput(rawOrNormalizedText)
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

  const validBookers = filterValidNames(nameResults.bookerCandidates)
  if (validBookers.length > 0) {
    const scores = validBookers.map(b => ({
      name: b,
      evalRes: evaluateNameConfidence(b, normalizedText)
    })).sort((a, b) => b.evalRes.confidence - a.evalRes.confidence)

    if (scores.length === 1) {
      if (scores[0].evalRes.confidence >= 0.55) {
        customer_name = scores[0].name
        customer_name_confidence = scores[0].evalRes.confidence
        customer_name_metadata = scores[0].evalRes
      }
    } else if (scores.length > 1) {
      const diff = scores[0].evalRes.confidence - scores[1].evalRes.confidence
      if (diff >= 0.15 && scores[0].evalRes.confidence >= 0.70) {
        customer_name = scores[0].name
        customer_name_confidence = scores[0].evalRes.confidence
        customer_name_metadata = scores[0].evalRes
      } else {
        customer_name = null
        customer_name_confidence = 0.0
        customer_name_metadata = { confidence: 0.0, signals: [], risks: ['conflicting_multiple_names'] }
      }
    }
  }

  if (!customer_name) {
    const candidatesList = filterValidNames(nameResults.peopleNames)
    const confidentCandidates = candidatesList.filter(c => evaluateNameConfidence(c, normalizedText).confidence >= 0.55)

    if (confidentCandidates.length === 1) {
      customer_name = confidentCandidates[0]
      const evalRes = evaluateNameConfidence(customer_name, normalizedText)
      customer_name_confidence = evalRes.confidence
      customer_name_metadata = evalRes
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
      const potentialBookers = filterValidNames(nameResults.peopleNames).filter(name => !nameResults.partyOwnerCandidates.includes(name))
      if (potentialBookers.length > 0) {
        customer_name = potentialBookers[0]
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
  const dateRegex = /(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{2,4})/
  const dateMatch = normalizedText.match(dateRegex)
  if (dateMatch) {
    const d = dateMatch[1].padStart(2, '0')
    const m = dateMatch[2].padStart(2, '0')
    let y = dateMatch[3]
    if (y.length === 2) y = '20' + y
    event_date = `${d}/${m}/${y}`
  }

  const today = new Date()
  const formatDateStrLocal = (d: Date) => {
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yyyy = d.getFullYear()
    return `${dd}/${mm}/${yyyy}`
  }

  // Parse relative date patterns first
  if (!event_date) {
    const relativePatterns = [
      { regex: /(?<!\p{L})(?:hôm nay|hom nay|tối nay|toi nay|chiều nay|chieu nay)(?!\p{L})/ugi, offset: 0 },
      { regex: /(?<!\p{L})(?:ngày mai|ngay mai|chiều mai|chieu mai|tối mai|toi mai)(?!\p{L})/ugi, offset: 1 },
      { regex: /(?<!\p{L})(?:ngày mốt|ngay mot|ngày kia|ngay kia)(?!\p{L})/ugi, offset: 2 }
    ]
    for (const { regex, offset } of relativePatterns) {
      if (regex.test(clean)) {
        const targetDate = new Date(today)
        targetDate.setDate(today.getDate() + offset)
        event_date = formatDateStrLocal(targetDate)
        break
      }
    }
  }

  // Parse weekday relative date patterns next
  if (!event_date) {
    const weekdayRegex = /\b(chu\s*nhat|cn|thu\s*hai|t2|thu\s*ba|t3|thu\s*tu|t4|thu\s*nam|t5|thu\s*sau|t6|thu\s*bay|t7|thu\s*2|thu\s*3|thu\s*4|thu\s*5|thu\s*6|thu\s*7)\b(?:\s+(tuan\s+)?(nay|sau))?/gi
    let weekdayMatch
    weekdayRegex.lastIndex = 0
    if ((weekdayMatch = weekdayRegex.exec(clean)) !== null) {
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
        event_date = formatDateStrLocal(targetDate)
      }
    }
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
      event_date = formatDateStrLocal(targetDate)
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
  const decoration_details = extractDecorationDetails(blocks.decoration_block)
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
      const parsed = parseSingleMenuLine(line)
      if (parsed) {
        menu_items.push(parsed)
      }
    }
  }

  if (menu_items.length === 0) {
    const menuLines = blocks.menu_block.split('\n')
    for (const line of menuLines) {
      const parsed = parseSingleMenuLine(line)
      if (parsed) {
        menu_items.push(parsed)
      }
    }
  }

  // Fallback scan: if menu_block yielded no dishes, scan full normalizedText line by line
  if (menu_items.length === 0) {
    const allLines = normalizedText.split('\n')
    for (const line of allLines) {
      const lower = stripAccents(line).toLowerCase()
      if (/(0[35789]\d{7,9})/.test(lower) || /\b\d{1,2}:\d{2}\b/.test(lower) || /\d+ng\b|\d+\s*pax|\d+\s*khach/i.test(lower)) continue
      const parsed = parseSingleMenuLine(line)
      if (parsed) {
        menu_items.push(parsed)
      }
    }
  }

  if (menu_items.length === 0) {
    const foodLabelMatch = normalizedText.match(/(?:yêu cầu đặt trước|thức ăn|món ăn|thuc an|mon an|dat truoc|order|gọi món|goi mon)[^:]*:\s*(.+)/i)
    if (foodLabelMatch) {
      const dishList = foodLabelMatch[1].split(/[,;]/).map((d: string) => d.trim()).filter((d: string) => d.length > 2)
      for (const dish of dishList) {
        if (/^\d+$/.test(dish) || /sinh nhat|lien hoan|cong ty/i.test(dish)) continue
        const parsed = parseSingleMenuLine(dish)
        if (parsed) {
          menu_items.push(parsed)
        } else {
          menu_items.push({
            raw_name: dish,
            quantity: 1,
            unit_price: null,
            note: ''
          })
        }
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
    decoration_details,
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
