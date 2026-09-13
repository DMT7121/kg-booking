import { stripAccents } from '@/utils'

export interface ResolvedPeopleRoles {
  customerName: string | null
  customerConfidence: number
  partyOwnerName: string | null
  partyOwnerConfidence: number
  contactPerson: string | null
  depositSender: string | null
  discrepancies: string[]
}

export interface DisambiguatedEntityCategory {
  type: 'person' | 'food' | 'decor' | 'seating' | 'dietary' | 'time' | 'unknown'
  raw: string
  normalized: string
  confidence: number
  targetSlot: string
  role?: string
  notes?: string
}

// Child / Pet / Party Host Nicknames commonly used in Vietnamese birthday / thôi nôi celebrations
const PARTY_HOST_NICKNAMES = new Set([
  'bap', 'bắp', 'bo', 'bơ', 'cua', 'tho', 'thỏ', 'gau', 'gấu', 'dau', 'dâu',
  'sam', 'ken', 'tin', 'sua', 'sữa', 'mi', 'mì', 'ca rot', 'cà rốt',
  'khoai', 'khoai tay', 'khoai tây', 'chip', 'chíp', 'sushi', 'bon',
  'bong', 'bông', 'may', 'mây', 'kem', 'tit', 'tít', 'socola', 'kem dâu',
  'suri', 'simba', 'lucas', 'leo', 'max', 'ben', 'tom', 'jerry'
])

// Polysemic names that overlap with food / nature / verbs
const POLYSEMIC_NAMES = new Set([
  'mai', 'dat', 'đạt', 'son', 'sơn', 'hai', 'hải', 'yen', 'yến', 'dao', 'đào',
  'hong', 'hồng', 'sen', 'bong', 'bông', 'que', 'quế', 'thao', 'thảo',
  'hanh', 'hạnh', 'huong', 'hương', 'truc', 'trúc', 'giang', 'tu', 'tú',
  'lam', 'lâm', 'quyen', 'quyên', 'hoa', 'trang', 'hang', 'hằng'
])

// Food cooking verbs / preparation markers
const FOOD_PREPARATION_MARKERS = [
  /\b(?:nướng|nuong|lẩu|lau|xào|xao|hấp|hap|chiên|chien|sốt|sot|rang|luộc|luoc)\b/i,
  /\b(?:cháy tỏi|chay toi|mỡ hành|mo hanh|phô mai|pho mai|trứng muối|trung muoi)\b/i,
  /\b(?:mắm tỏi|mam toi|tomyum|chua cay|tiêu đen|tieu den|sa tế|sa te|muối ớt|muoi ot)\b/i,
  /\b(?:bóp thấu|gỏi|goi|salad|súp|sup|cháo|chao|canh|cơm|com|mì|mi|bún|bun|kho|om|tái chanh)\b/i,
  /\b(?:set|combo|phần|dĩa|đĩa|tô|nồi|chảo|thố|lon|chai|két|thùng|ly)\b/i
]

// Decor indicators (accent-insensitive)
const DECOR_REGEX = /(?:^|[^\p{L}\d])(?:bong\s*bay|bong\s*bong|hoa\s*tuoi|hoa\s*lua|hoa\s*sap|background|backdrop|khung\s*check[\s-]*in|bang\s*ten|bang\s*chu|bang\s*mung|guong|tone|tong|mau\s*chu\s*dao|setup|set\s*up|trang\s*tri|nen|phao\s*sang|rem|den\s*led)(?:$|[^\p{L}\d])/iu

// Seating / Room / Amenity indicators (accent-insensitive)
const SEATING_AMENITY_REGEX = /(?:^|[^\p{L}\d])(?:ghe\s*em\s*be|ghe\s*tre\s*em|ghe\s*baby|baby\s*chair|ghe\s*an\s*dam|phong\s*vip|vip\s*room|view\s*ban\s*cong|ban\s*cong|ngoai\s*troi|san\s*thuong|rooftop|khu\s*yen\s*tinh|khu\s*hut\s*thuoc|khong\s*hut\s*thuoc|tu\s*mang\s*ruou|tu\s*mang\s*banh\s*kem|ly\s*ruou\s*vang)(?:$|[^\p{L}\d])/iu

// Dietary / Cooking constraints (accent-insensitive)
const DIETARY_ALLERGY_REGEX = /(?:^|[^\p{L}\d])(?:lam\s*khong\s*cay|khong\s*cay|it\s*cay|cay\s*vua|khong\s*ot|khong\s*hanh|khong\s*ngo|khong\s*hanh\s*ngo|sot\s*de\s*rieng|nuoc\s*cham\s*de\s*rieng|it\s*ngot|khong\s*ngot|khong\s*bot\s*ngot|khong\s*mi\s*chinh|it\s*dau\s*mo|an\s*chay|di\s*ung\s*hai\s*san|di\s*ung\s*tom|di\s*ung\s*cua|di\s*ung\s*dau\s*phong|di\s*ung\s*lac|chin\s*ky|chin\s*vua|uop\s*lanh\s*san|khong\s*lay\s*da|it\s*da)(?:$|[^\p{L}\d])/iu

/**
 * Disambiguates whether a polysemic word (e.g. Mai, Đạt, Yến, Đào, Bắp) is a person name, food, time, or action.
 */
export function disambiguatePolysemicToken(
  token: string,
  contextBefore: string,
  contextAfter: string
): {
  category: 'person' | 'food' | 'time' | 'action' | 'decor'
  confidence: number
  explanation: string
} {
  const normToken = stripAccents(token).toLowerCase().trim()
  const normBefore = stripAccents(contextBefore).toLowerCase().trim()
  const normAfter = stripAccents(contextAfter).toLowerCase().trim()
  const fullContext = `${normBefore} ${normToken} ${normAfter}`

  // 1. Check for child party nickname markers (e.g. "bé Bắp", "chủ tiệc bé Bơ", "sinh nhật bé Cua")
  if (PARTY_HOST_NICKNAMES.has(normToken) || /\b(?:be|bé)\b/.test(normBefore)) {
    if (/\b(?:be|bé|chu\s*tiec|chủ\s*tiệc|sinh\s*nhat|sinh\s*nhật|thoi\s*noi|thôi\s*nôi|sn|hpbd|mung|mừng|tiec\s*cua|tiệc\s*của)\b/.test(normBefore) ||
        /\b(?:mung|mừng|sinh\s*nhat|sinh\s*nhật)\b/.test(normAfter)) {
      return {
        category: 'person',
        confidence: 0.95,
        explanation: `Xác định "${token}" là Tên Chủ Tiệc / Bé Mừng Sinh Nhật (đứng cạnh tiền tố bé/chủ tiệc)`
      }
    }
  }

  // 2. Check for honorifics (Anh / Chị / Cô / Bác / Em...) -> 100% Person
  if (/\b(?:anh|chi|chị|em|bac|bác|chu|chú|co|cô|ong|ông|ba|bà|ban|bạn)\b/.test(normBefore)) {
    return {
      category: 'person',
      confidence: 0.98,
      explanation: `Xác định "${token}" là Tên Người do đứng liền sau đại từ danh xưng (Anh/Chị/Em/Bác/Cô/Chú)`
    }
  }

  // 3. Check for specific token: "Mai"
  if (normToken === 'mai') {
    if (/\b(?:ngay|ngày|toi|tối|trua|trưa|sang|sáng|chieu|chiều|den|đến|hen|hẹn)\b/.test(normBefore) ||
        /\b(?:di|đi|dat|đặt|qua|den|đến|toi|tới|co|có)\b/.test(normAfter)) {
      return {
        category: 'time',
        confidence: 0.92,
        explanation: '"Mai" biểu thị mốc thời gian (ngày mai / tối mai)'
      }
    }
    if (/\b(?:cua|ghe)\b/.test(normBefore)) {
      return {
        category: 'food',
        confidence: 0.90,
        explanation: '"Mai" là một phần món ăn (mai cua / ghẹ)'
      }
    }
  }

  // 4. Check for specific token: "Đạt"
  if (normToken === 'dat') {
    if (/\b(?:dat|đặt)\s*(?:ban|bàn|duoc|được|cho|truoc|trước|yeu\s*cau|yêu\s*cầu|chuan|chuẩn)\b/.test(`${normToken} ${normAfter}`) ||
        /\b(?:da|đã|chua|chưa|khong|không)\b/.test(normBefore) ||
        /\b(?:yeu\s*cau|yêu\s*cầu|tieu\s*chuan|tiêu\s*chuẩn)\b/.test(normAfter)) {
      return {
        category: 'action',
        confidence: 0.92,
        explanation: '"Đạt/Đặt" là động từ đặt chỗ / đạt chuẩn'
      }
    }
  }

  // 5. Check for food preparation verbs surrounding the token -> Food
  const hasFoodMarker = FOOD_PREPARATION_MARKERS.some(regex => regex.test(normBefore) || regex.test(normAfter))
  if (hasFoodMarker) {
    return {
      category: 'food',
      confidence: 0.90,
      explanation: `"${token}" kết hợp với từ khóa chế biến ẩm thực -> Món ăn`
    }
  }

  // 6. Check for decor context
  if (DECOR_REGEX.test(fullContext)) {
    return {
      category: 'decor',
      confidence: 0.88,
      explanation: `"${token}" xuất hiện trong ngữ cảnh trang trí tiệc`
    }
  }

  return {
    category: 'person',
    confidence: 0.75,
    explanation: `Mặc định xác định "${token}" là danh từ chỉ người`
  }
}

/**
 * Multi-Role Person Resolver (MRPR): Dissects and resolves distinct human roles in a booking message.
 */
export function resolvePeopleRoles(text: string): ResolvedPeopleRoles {
  const result: ResolvedPeopleRoles = {
    customerName: null,
    customerConfidence: 0,
    partyOwnerName: null,
    partyOwnerConfidence: 0,
    contactPerson: null,
    depositSender: null,
    discrepancies: []
  }

  if (!text) return result

  const lines = text.split('\n')

  // 1. Extract Party Owner (Chủ tiệc / Bé mừng sinh nhật / Nhân vật chính)
  const partyOwnerPatterns = [
    /(?:chủ\s*tiệc|chu\s*tiec|nhân\s*vật\s*chính|chủ\s*nhân\s*tiệc|tiệc\s*của|mừng\s*sinh\s*nhật|thôi\s*nôi|sinh\s*nhật|sn|hpbd|đầy\s*tháng)\s*[:\-–—]?\s*(?:cho\s+)?((?:bé\s+|anh\s+|chị\s+|em\s+)?[\p{L}\d\s]+?)(?:,|\.|\n|tối|ngày|\d+h|\d+\s*khách|\d+\s*người|$)/iu,
    /\b(?:bé|be)\s+([\p{L}]+(?:\s+[\p{L}]+)?)\b/iu
  ]

  for (const pattern of partyOwnerPatterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      let candidate = match[1].trim().replace(/^[:\-–—\s]+|[:\-–—\s]+$/g, '')
      candidate = candidate.replace(/\s+(?:tròn\s*)?\d+\s*tuổi.*$/iu, '').trim()
      
      const hadBaby = /(?:^|\s)(?:bé|be)\s+/iu.test(match[0])
      if (hadBaby && !/^(?:bé|be)\s+/iu.test(candidate)) {
        candidate = `Bé ${candidate}`
      } else if (/^(?:bé|be)\s+/iu.test(candidate)) {
        candidate = candidate.replace(/^(?:bé|be)\s+/iu, 'Bé ')
      }

      const cleanCandidate = stripAccents(candidate).toLowerCase()
      // Exclude generic words
      if (!/^(?:khach|khách|minh|mình|ban|bàn|nhe|nhé|nha|toi|tối|ngay|ngày)$/i.test(cleanCandidate) && candidate.length >= 2) {
        result.partyOwnerName = candidate
        result.partyOwnerConfidence = 0.90
        break
      }
    }
  }

  // 2. Extract Customer Name (Người đặt bàn chính)
  const bookerPatterns = [
    /(?:người\s*đặt|nguoi\s*dat|tên\s*khách|ten\s*khach|khách\s*hàng|khach\s*hang|liên\s*hệ|lien\s*he|khách|khach)\s*[:\-–—]?\s*(?:anh\s+|chị\s+|em\s+|cô\s+|chú\s+|bác\s+|bạn\s+)?([\p{L}\s]+?)(?:,|\.|\n|\d{9,11}|sđt|sdt|ngày|giờ|\d+h|$)/iu,
    /(?:^|\n)\s*(?:[A-G]|VIP)\d*\s+(?:anh\s+|chị\s+|em\s+|cô\s+|chú\s+|bác\s+)?([\p{L}\s]{2,20})(?:\s+|$)/iu,
    /\b(?:anh|chị|chi|em|cô|chú|bác|bạn)\s+([\p{L}]+(?:\s+[\p{L}]+){0,3})\s+(?:\d{9,11}|đặt|book|lấy|đi)\b/iu
  ]

  for (const pattern of bookerPatterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      const candidate = match[1].trim().replace(/^[:\-–—\s]+|[:\-–—\s]+$/g, '')
      const cleanCandidate = stripAccents(candidate).toLowerCase()
      // Verify not a table or food or decor
      if (!/^(?:ban|bàn|vip|khu|phong|món|mon|lẩu|lau|nướng|nuong|chờ|cho|đã|da|cọc|coc)$/i.test(cleanCandidate) && candidate.length >= 2) {
        result.customerName = candidate
        result.customerConfidence = 0.88
        break
      }
    }
  }

  // Fallback: If no explicit booker pattern, check first line for capitalized name
  if (!result.customerName) {
    for (const line of lines) {
      const trimmed = line.trim()
      if (/^[\p{Lu}][\p{Ll}]+(?:\s+[\p{Lu}][\p{Ll}]+){0,3}$/u.test(trimmed)) {
        const cleanNorm = stripAccents(trimmed).toLowerCase()
        if (!/^(?:khach|khách|menu|thuc don|thực đơn|dat ban|đặt bàn)$/i.test(cleanNorm)) {
          result.customerName = trimmed
          result.customerConfidence = 0.80
          break
        }
      }
    }
  }

  // 3. Extract Deposit Sender (Người chuyển khoản / chủ tài khoản cọc)
  const depositSenderMatch = text.match(/(?:người\s*chuyển(?:\s*khoản|\s*tiền|\s*cọc)?|nguoi\s*chuyen(?:\s*khoan|\s*tien|\s*coc)?|tài\s*khoản|tai\s*khoan|chủ\s*tk|chu\s*tk|tk\s*chuyển(?:\s*khoản|\s*cọc)?|tk\s*chuyen(?:\s*khoan|\s*coc)?|sender)\s*[:\-–—]?\s*([\p{L}\s]{2,30})/iu)
  if (depositSenderMatch && depositSenderMatch[1]) {
    let senderCandidate = depositSenderMatch[1].trim()
    senderCandidate = senderCandidate.replace(/^(?:khoản|cọc|tiền)\s*[:\-–—]?\s*/iu, '').trim()
    if (senderCandidate.length >= 2) {
      result.depositSender = senderCandidate
    }
  }

  // 4. Cross-Role Discrepancy Check
  if (result.customerName && result.partyOwnerName) {
    const cNorm = stripAccents(result.customerName).toLowerCase()
    const pNorm = stripAccents(result.partyOwnerName).toLowerCase()
    if (cNorm === pNorm) {
      result.discrepancies.push(`Người đặt trùng với chủ nhân tiệc: "${result.customerName}"`)
    } else {
      result.discrepancies.push(`Phân biệt rõ: Người đặt="${result.customerName}", Chủ tiệc="${result.partyOwnerName}"`)
    }
  }

  return result
}

/**
 * Strict Entity Isolation: Inspects an item string and determines if it is a non-food item
 * (e.g. decor, seating equipment, dietary allergy note, or customer name) that should be purged from menu_items.
 */
export function classifyNonFoodLeakage(itemText: string): {
  isLeakage: boolean
  divertTo: 'party.decor_color' | 'party.special_request' | 'party.seating_preference' | 'party.dietary_notes' | 'none'
  divertValue: string
  reason: string
} {
  const clean = (itemText || '').trim()
  if (!clean || clean.length < 2) {
    return { isLeakage: true, divertTo: 'none', divertValue: '', reason: 'Empty or invalid token' }
  }

  const cleanNorm = stripAccents(clean).toLowerCase()

  // 1. Check Decor Keywords
  if (DECOR_REGEX.test(cleanNorm)) {
    const isColor = /(?:^|[^\p{L}\d])(?:tong|tone|mau)\s*(?:trang|hong|xanh|vang|do|tim|cam|den|nau|bac|gold|silver|pastel|kem|be)(?:$|[^\p{L}\d])/iu.test(cleanNorm)
    return {
      isLeakage: true,
      divertTo: isColor ? 'party.decor_color' : 'party.special_request',
      divertValue: clean,
      reason: `Thuộc tính trang trí tiệc ("${clean}") không phải món ăn`
    }
  }

  // 2. Check Seating & Amenities (e.g. "2 ghế em bé", "phòng VIP", "ban công")
  if (SEATING_AMENITY_REGEX.test(cleanNorm)) {
    return {
      isLeakage: true,
      divertTo: 'party.seating_preference',
      divertValue: clean,
      reason: `Yêu cầu chỗ ngồi/tiện ích ("${clean}") không phải món ăn`
    }
  }

  // 3. Check Dietary & Allergies (e.g. "làm không cay", "dị ứng hải sản")
  if (DIETARY_ALLERGY_REGEX.test(cleanNorm)) {
    return {
      isLeakage: true,
      divertTo: 'party.dietary_notes',
      divertValue: clean,
      reason: `Ghi chú khẩu vị/dị ứng ("${clean}") không phải món ăn`
    }
  }

  return {
    isLeakage: false,
    divertTo: 'none',
    divertValue: '',
    reason: 'Hợp lệ'
  }
}

/**
 * Generates an Enterprise-grade Multi-Department Operational Dispatch (BEO)
 * Structuring instructions for Reception, Kitchen & Bar, Decor Team, and Cashier.
 */
export function generateOperationalDispatch(bookingData: {
  customer?: { name?: string; phone?: string }
  booking?: { date?: string; time?: string; tables?: string; guest_count?: number; need?: string }
  party?: { owner_name?: string; decor_color?: string; display_board_text?: string; mirror_board_text?: string; special_request?: string; seating_preference?: string; dietary_notes?: string }
  items?: Array<{ name: string; quantity: number; note?: string }>
  deposit?: { amount?: number; isPaid?: boolean }
}): {
  receptionDispatch: string
  kitchenDispatch: string
  decorDispatch: string
  cashierDispatch: string
} {
  const customer = bookingData.customer || {}
  const booking = bookingData.booking || {}
  const party = bookingData.party || {}
  const items = bookingData.items || []
  const deposit = bookingData.deposit || {}

  // Reception / Floor
  const recLines: string[] = []
  if (customer.name || customer.phone) {
    recLines.push(`Khách đặt: ${customer.name || 'Chưa có tên'}${customer.phone ? ` (${customer.phone})` : ''}`)
  }
  if (booking.tables) recLines.push(`Bàn: ${booking.tables}`)
  if (booking.guest_count) recLines.push(`Số khách: ${booking.guest_count} khách`)
  if (booking.time || booking.date) recLines.push(`Thời gian: ${booking.time || ''} ${booking.date ? `ngày ${booking.date}` : ''}`.trim())
  if (booking.need && booking.need !== 'Ăn thường') recLines.push(`Loại tiệc: ${booking.need}`)
  if (party.seating_preference) recLines.push(`Chỗ ngồi / Tiện ích: ${party.seating_preference}`)
  const receptionDispatch = recLines.join(' | ')

  // Kitchen & Bar
  const kitLines: string[] = []
  if (items.length > 0) {
    const dishSummary = items.map(it => `${it.quantity}x ${it.name}${it.note ? ` (${it.note})` : ''}`).join(', ')
    kitLines.push(`Thực đơn: ${dishSummary}`)
  } else {
    kitLines.push('Thực đơn: Khách gọi món tại bàn')
  }
  if (party.dietary_notes) {
    kitLines.push(`⚠️ CẢNH BÁO BẾP: ${party.dietary_notes}`)
  }
  const kitchenDispatch = kitLines.join(' | ')

  // Decor & Floor
  const decLines: string[] = []
  if (party.owner_name) decLines.push(`Chủ tiệc: ${party.owner_name}`)
  if (party.decor_color) decLines.push(`Tone màu: ${party.decor_color}`)
  if (party.display_board_text) decLines.push(`Bảng chữ: "${party.display_board_text}"`)
  if (party.mirror_board_text) decLines.push(`Gương: "${party.mirror_board_text}"`)
  if (party.special_request) decLines.push(`Yêu cầu setup: ${party.special_request}`)
  const decorDispatch = decLines.length > 0 ? decLines.join(' • ') : 'Không có yêu cầu trang trí đặc biệt'

  // Cashier
  const casLines: string[] = []
  if (deposit.amount) {
    casLines.push(`Tiền cọc: ${deposit.amount.toLocaleString('vi-VN')} đ (${deposit.isPaid ? 'ĐÃ CỌC' : 'CHỜ CỌC'})`)
  } else {
    casLines.push('Chưa đặt cọc')
  }
  const cashierDispatch = casLines.join(' • ')

  return {
    receptionDispatch,
    kitchenDispatch,
    decorDispatch,
    cashierDispatch
  }
}
