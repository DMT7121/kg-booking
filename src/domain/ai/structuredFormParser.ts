import { cleanPhoneNumber, formatDateStr, stripAccents } from '@/utils'

export interface ParsedMenuItemFromForm {
  raw_name: string
  matched_name: string
  quantity: number
  unit_price: number
  note: string
  confidence: number
  needs_review: boolean
}

export interface StructuredFormParseResult {
  isStructured: boolean
  matchedFieldCount: number
  confidence: number
  data: {
    customer: {
      name: string
      phone: string
      confidence: number
    }
    booking: {
      date: string
      time: string
      guest_count: number | null
      table_count: number | null
      tables: string
      need: string
      confidence: number
    }
    party: {
      type: string
      owner_name: string
      display_board_text: string
      mirror_board_text: string
      decor_color: string
      special_request: string
      seating_preference: string
      dietary_notes: string
      confidence: number
    }
    deposit: {
      amount: number
      status: string
      bank_ref: string
    }
    menu_items: ParsedMenuItemFromForm[]
    note: string
    warnings: string[]
  }
}

/**
 * Cleans prefix titles from customer name
 */
function cleanCustomerName(name: string): string {
  if (!name) return ''
  let cleaned = name.trim()
  cleaned = cleaned.replace(/^(?:anh|chị|chi|c\.|c|em|a\.|a|bác|bac|cô|co|chú|chu|bạn|ban|khách\s*hàng|khach\s*hang|khách|khach)\s+/i, '')
  cleaned = cleaned.replace(/^[\s-,\/:]+|[\s-,\/:]+$/g, '')
  return cleaned.trim()
}

/**
 * Normalizes key label by stripping accents, lowercasing and trimming
 */
function normalizeKey(key: string): string {
  return stripAccents(key).toLowerCase().replace(/[^a-z0-9]/g, '').trim()
}

/**
 * Checks if a line resembles a key-value pair, e.g. "Tên: Lan", "SĐT - 0912...", "1. Ngày: 12/10"
 */
function parseKeyValueLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim().replace(/^[•▶●\*\-\d\.\)]+\s*/, '')
  // Match key followed by colon or hyphen e.g. "Tên khách: ..." or "SĐT - ..."
  const match = trimmed.match(/^([^:\-–—\n]+)\s*[:\-–—]\s*(.*)$/)
  if (!match) return null
  const rawKey = match[1].trim()
  const rawVal = match[2].trim()
  if (rawKey.length < 2 || rawKey.length > 35) return null
  return { key: rawKey, value: rawVal }
}

/**
 * Extracts quantity from a dish line like "Gà ủ muối x2", "2 Coca", "1/2 con vịt", "Khoai tây chiên (1)"
 */
function parseDishLine(line: string): { name: string; quantity: number; note: string } | null {
  const clean = line.replace(/^[•▶●\*\-\+\d\.\)]+\s*/, '').trim()
  if (!clean || clean.length < 2) return null

  // Check prefix quantity: "2 Coca", "10 lon tiger"
  const prefixMatch = clean.match(/^(\d+)\s*(?:lon|chai|dia|phan|suat|to|cai|hop|con)?\s+([^(\-–—]+)(?:\(([^)]+)\))?/i)
  if (prefixMatch && parseInt(prefixMatch[1]) > 0 && prefixMatch[2].trim().length > 1) {
    return {
      name: prefixMatch[2].trim(),
      quantity: parseInt(prefixMatch[1]),
      note: (prefixMatch[3] || '').trim()
    }
  }

  // Check suffix quantity: "Gà ủ muối x 2", "Lẩu thái - 2", "Khoai tây chiên (x2)", "Lẩu cá chép giòn 1"
  const suffixMatch = clean.match(/^([^(xX\*\-–—\d]+?)(?:\s*[\*xX\-–—]\s*(\d+)|\s*\(x?(\d+)\)|\s+(\d+))(?:\s*[-–—]\s*(.*))?$/i)
  if (suffixMatch) {
    const qty = parseInt(suffixMatch[2] || suffixMatch[3] || suffixMatch[4] || '1', 10)
    return {
      name: suffixMatch[1].trim(),
      quantity: qty > 0 ? qty : 1,
      note: (suffixMatch[5] || '').trim()
    }
  }

  // Check parenthesis with quantity: "Khoai tây chiên (2 dĩa)", "Bò lúc lắc (1 phần)"
  const parenQtyMatch = clean.match(/^([^(]+?)\s*\((\d+)\s*(?:dĩa|dia|phần|phan|suất|suat|nồi|noi|con|lon|chai|bát|bat|chén|chen|ly)?\)$/i)
  if (parenQtyMatch) {
    const qty = parseInt(parenQtyMatch[2], 10)
    return {
      name: parenQtyMatch[1].trim(),
      quantity: qty > 0 ? qty : 1,
      note: ''
    }
  }

  // Check parenthesis note: "Cá chép giòn (nấu măng chua)"
  const parenMatch = clean.match(/^([^(]+?)\s*\(([^)]+)\)$/)
  if (parenMatch) {
    return {
      name: parenMatch[1].trim(),
      quantity: 1,
      note: parenMatch[2].trim()
    }
  }

  return {
    name: clean,
    quantity: 1,
    note: ''
  }
}

/**
 * Parses structured Form / Key-Value text inputs with high precision (< 5ms)
 */
export function parseStructuredForm(text: string): StructuredFormParseResult {
  const result: StructuredFormParseResult = {
    isStructured: false,
    matchedFieldCount: 0,
    confidence: 0,
    data: {
      customer: { name: '', phone: '', confidence: 0 },
      booking: { date: '', time: '', guest_count: null, table_count: null, tables: '', need: '', confidence: 0 },
      party: {
        type: '',
        owner_name: '',
        display_board_text: '',
        mirror_board_text: '',
        decor_color: '',
        special_request: '',
        seating_preference: '',
        dietary_notes: '',
        confidence: 0
      },
      deposit: { amount: 0, status: 'chờ cọc', bank_ref: '' },
      menu_items: [],
      note: '',
      warnings: []
    }
  }

  if (!text || text.trim().length < 10) return result

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const kvPairs: Array<{ key: string; normKey: string; value: string }> = []
  let inMenuSection = false
  const rawMenuItems: string[] = []

  // Step 1: Scan lines into Key-Value pairs or Menu items
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Menu block detection
    const cleanLineLower = stripAccents(line).toLowerCase()
    if (/^(?:mon|mon an|thuc don|danh sach mon|menu|dishes|items)\s*[:\-–—]?$/i.test(cleanLineLower) ||
        /^(?:mon|thuc don|menu)\s*[:\-–—]/i.test(cleanLineLower)) {
      inMenuSection = true
      const colonIdx = line.indexOf(':')
      if (colonIdx !== -1) {
        const afterColon = line.substring(colonIdx + 1).trim()
        if (afterColon) rawMenuItems.push(afterColon)
      }
      continue
    }

    const kv = parseKeyValueLine(line)
    if (kv && !inMenuSection) {
      const normKey = normalizeKey(kv.key)
      kvPairs.push({ key: kv.key, normKey, value: kv.value })
    } else if (inMenuSection) {
      // If we see another strong key-value outside menu like "Cọc:", "Ghi chú:", exit menu section
      const testKv = parseKeyValueLine(line)
      if (testKv && /^(?:coc|tiencoc|datcoc|chuyenkhoan|ghichu|note|yeucau|dando|tongtien|total)/i.test(normalizeKey(testKv.key))) {
        inMenuSection = false
        const normKey = normalizeKey(testKv.key)
        kvPairs.push({ key: testKv.key, normKey, value: testKv.value })
      } else {
        rawMenuItems.push(line)
      }
    }
  }

  // Count core matched fields
  const keyAliases: Record<string, string[]> = {
    customer_name: ['ten', 'tenkhach', 'tenkhachhang', 'khach', 'khachhang', 'nguoidat', 'nguoidatban', 'lienhe', 'customer', 'name'],
    phone: ['sdt', 'sodienthoai', 'sodt', 'dienthoai', 'phone', 'tel', 'zalo', 'hotline'],
    date: ['ngay', 'ngaydat', 'ngaynhan', 'ngaytochuc', 'date', 'ngaynhanban'],
    time: ['gio', 'giodat', 'gioden', 'thoigian', 'time', 'gioan'],
    pax: ['sokhach', 'soluong', 'khach', 'pax', 'guest', 'songuoi', 'slkhach', 'soluongkhach', 'sl'],
    table: ['ban', 'soban', 'khuban', 'khuban', 'khuvuc', 'table', 'vitriban'],
    party_type: ['loaitiec', 'loaitec', 'nhucau', 'mucdich', 'tiec', 'loai', 'type', 'sukien'],
    party_owner: ['chutiec', 'nguoiductochuc', 'tenbe', 'tenchutiec', 'chunhan', 'owner'],
    decor_color: ['tongmau', 'tone', 'tonemau', 'mausac', 'mauchudao', 'color', 'tonemauchudao', 'mau'],
    board_text: ['bangten', 'bangmung', 'bang', 'bangchu', 'noidungbang', 'displayboard', 'banghpbd'],
    mirror_text: ['guong', 'guongviet', 'guongvietten', 'noidungguong', 'mirror'],
    decor_request: ['trangtri', 'decor', 'setup', 'yeucautrangtri', 'bongbay', 'background', 'hoatuoi'],
    seating_req: ['chongoi', 'khonggian', 'vitri', 'seating', 'banngoaitroi', 'phongvip', 'phonglanh'],
    dietary_req: ['khauvi', 'anuong', 'diung', 'bep', 'dietary', 'khongcay', 'itcay', 'luuybep'],
    general_note: ['ghichu', 'note', 'dando', 'luuy', 'yeucau', 'yeucaurien', 'specialrequest'],
    deposit: ['coc', 'tiencoc', 'datcoc', 'chuyenkhoan', 'deposit', 'ck', 'datiencoc']
  }

  const recognized: Record<string, string> = {}
  for (const pair of kvPairs) {
    for (const [canonicalField, aliases] of Object.entries(keyAliases)) {
      if (aliases.includes(pair.normKey) && !recognized[canonicalField]) {
        recognized[canonicalField] = pair.value
        break
      }
    }
  }

  // Count recognized fields
  const recognizedCount = Object.keys(recognized).length
  if (recognizedCount < 3 && rawMenuItems.length === 0) {
    result.isStructured = false
    return result
  }

  result.isStructured = true
  result.matchedFieldCount = recognizedCount

  // Map Customer
  if (recognized.customer_name) {
    const cleaned = cleanCustomerName(recognized.customer_name)
    result.data.customer.name = cleaned
    result.data.customer.confidence = 0.98
  }
  if (recognized.phone) {
    result.data.customer.phone = cleanPhoneNumber(recognized.phone)
    result.data.customer.confidence = 0.99
  }

  // Map Booking
  if (recognized.date) {
    result.data.booking.date = formatDateStr(recognized.date)
  }
  if (recognized.time) {
    const timeMatch = recognized.time.match(/(\d{1,2})\s*(?:h|gior|gio|:)\s*(\d{2})?/i)
      || recognized.time.match(/(\d{1,2}):(\d{2})/)
    if (timeMatch) {
      const hh = String(parseInt(timeMatch[1])).padStart(2, '0')
      const mm = String(parseInt(timeMatch[2] || '0')).padStart(2, '0')
      result.data.booking.time = `${hh}:${mm}`
    } else {
      result.data.booking.time = recognized.time.trim()
    }
  }
  if (recognized.pax) {
    const num = parseInt(recognized.pax.replace(/\D/g, ''), 10)
    if (!isNaN(num) && num > 0) {
      result.data.booking.guest_count = num
    }
  }
  if (recognized.table) {
    result.data.booking.tables = recognized.table.replace(/^(?:bàn|phòng|khu|ban|phong)\s*/i, '').replace(/\s+/g, '').toUpperCase()
  }
  if (recognized.party_type) {
    const rawType = recognized.party_type.trim()
    result.data.party.type = rawType
    const cleanType = stripAccents(rawType).toLowerCase()
    if (/sinh nhat|sn|mung tho/i.test(cleanType)) result.data.booking.need = 'Sinh nhật'
    else if (/thoi noi/i.test(cleanType)) result.data.booking.need = 'Thôi nôi (1st)'
    else if (/cau hon|proposal/i.test(cleanType)) result.data.booking.need = 'Cầu hôn (Proposal)'
    else if (/gender reveal|tiet lo gioi tinh/i.test(cleanType)) result.data.booking.need = 'Gender Reveal (Tiết lộ giới tính)'
    else if (/ky niem/i.test(cleanType)) result.data.booking.need = 'Kỉ niệm'
    else if (/tiec doc than|bachelor/i.test(cleanType)) result.data.booking.need = 'Tiệc độc thân'
    else if (/cong ty|cty|doanh nghiep/i.test(cleanType)) result.data.booking.need = 'Công ty'
    else if (/tiep khach|doi tac|vip/i.test(cleanType)) result.data.booking.need = 'Tiếp khách / Đối tác'
    else if (/workshop|offline|hoi thao|hop/i.test(cleanType)) result.data.booking.need = 'Workshop / Họp nhóm'
    else if (/tat nien/i.test(cleanType)) result.data.booking.need = 'Tất niên'
    else if (/tan nien/i.test(cleanType)) result.data.booking.need = 'Tân niên'
    else if (/cuoi|bao hy/i.test(cleanType)) result.data.booking.need = 'Cưới/Báo hỷ'
    else if (/farewell|chia tay/i.test(cleanType)) result.data.booking.need = 'Farewell (Tiệc chia tay)'
    else result.data.booking.need = rawType
  }

  // Map Party & Decor
  if (recognized.party_owner) {
    result.data.party.owner_name = recognized.party_owner.trim()
  }
  if (recognized.decor_color) {
    result.data.party.decor_color = recognized.decor_color.trim()
  }
  if (recognized.board_text) {
    result.data.party.display_board_text = recognized.board_text.trim()
  }
  if (recognized.mirror_text) {
    result.data.party.mirror_board_text = recognized.mirror_text.trim()
  }
  if (recognized.decor_request) {
    result.data.party.special_request = recognized.decor_request.trim()
  }
  if (recognized.seating_req) {
    result.data.party.seating_preference = recognized.seating_req.trim()
  }
  if (recognized.dietary_req) {
    result.data.party.dietary_notes = recognized.dietary_req.trim()
  }

  // Map Deposit
  if (recognized.deposit) {
    const depNum = parseInt(recognized.deposit.replace(/[^\d]/g, ''), 10)
    if (!isNaN(depNum) && depNum > 0) {
      // If entered e.g. 500k -> 500000
      let finalAmt = depNum
      if (depNum < 1000 && /k\b/i.test(recognized.deposit)) {
        finalAmt = depNum * 1000
      }
      result.data.deposit.amount = finalAmt
      const isPaid = /da\s*ck|da\s*chuyen|da\s*nhan|da\s*coc|yes|ok|hoan\s*tat/i.test(stripAccents(recognized.deposit))
      result.data.deposit.status = isPaid ? 'đã cọc' : 'chờ cọc'
    }
  }

  // Map General Note
  if (recognized.general_note) {
    result.data.note = recognized.general_note.trim()
  }

  // Map Menu Items
  for (const itemLine of rawMenuItems) {
    const parsed = parseDishLine(itemLine)
    if (parsed && parsed.name) {
      result.data.menu_items.push({
        raw_name: parsed.name,
        matched_name: parsed.name,
        quantity: parsed.quantity,
        unit_price: 0,
        note: parsed.note,
        confidence: 0.95,
        needs_review: false
      })
    }
  }

  // Overall confidence
  const weights = [
    result.data.customer.name ? 0.2 : 0,
    result.data.customer.phone ? 0.2 : 0,
    result.data.booking.date ? 0.2 : 0,
    result.data.booking.time ? 0.2 : 0,
    result.data.booking.guest_count ? 0.1 : 0,
    result.data.menu_items.length > 0 ? 0.1 : 0
  ]
  result.confidence = Math.min(1.0, weights.reduce((a, b) => a + b, 0) + 0.1)

  return result
}

/**
 * Quick heuristic to check if text is a structured form (at least 3 key-value lines)
 */
export function isStructuredFormText(text: string): boolean {
  if (!text || text.length < 15) return false
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  let kvCount = 0
  for (const line of lines) {
    if (parseKeyValueLine(line)) {
      kvCount++
      if (kvCount >= 3) return true
    }
  }
  return false
}
