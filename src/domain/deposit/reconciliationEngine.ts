import { roundVND } from '@/utils/money'
import { stripAccents, cleanPhoneNumber } from '@/utils'

export type ReconciliationMatchStatus = 'MATCHED' | 'PROBABLE_MATCH' | 'AMBIGUOUS' | 'UNMATCHED'

export interface BankTransactionRecord {
  transactionId: string
  amount: number
  content: string
  transactionTime: number | string
  bankAccount?: string
}

export interface DepositReconciliationMatch {
  bookingId: string
  transactionId: string
  status: ReconciliationMatchStatus
  confidence: number
  reasons: string[]
  bookingAmount: number
  transactionAmount: number
  customerName: string
  phone: string
}

/**
 * Reconciles a single booking deposit against bank transactions deterministically.
 */
export function matchBookingDeposit(
  booking: any,
  transactions: BankTransactionRecord[]
): DepositReconciliationMatch | null {
  const bookingId = String(booking.id || booking.order_id || '')
  const requiredAmount = roundVND(booking.deposit?.amount ?? booking.deposit_amount ?? 0)
  const customerName = booking.customer?.name || booking.customer_name || ''
  const phone = cleanPhoneNumber(booking.customer?.phone || booking.phone || '')

  if (requiredAmount <= 0 && !phone) return null

  let bestMatch: BankTransactionRecord | null = null
  let highestScore = 0
  let bestReasons: string[] = []
  let matchStatus: ReconciliationMatchStatus = 'UNMATCHED'

  for (const tx of transactions) {
    let score = 0
    const reasons: string[] = []
    const txContent = (tx.content || '').toLowerCase()
    const txContentNoAccent = stripAccents(txContent)
    const txAmount = roundVND(tx.amount)

    // 1. Amount Exact Match (+40 points)
    if (requiredAmount > 0 && txAmount === requiredAmount) {
      score += 40
      reasons.push(`Khớp chính xác số tiền cọc: ${requiredAmount.toLocaleString('vi-VN')}đ`)
    } else if (requiredAmount > 0 && Math.abs(txAmount - requiredAmount) <= 10000) {
      score += 20
      reasons.push(`Số tiền giao dịch gần đúng (${txAmount.toLocaleString('vi-VN')}đ vs ${requiredAmount.toLocaleString('vi-VN')}đ)`)
    }

    // 2. Phone Match in Transaction Content (+40 points)
    if (phone && phone.length >= 7) {
      const strippedPhone = phone.startsWith('0') ? phone.substring(1) : phone
      if (txContent.includes(phone) || txContent.includes(strippedPhone)) {
        score += 40
        reasons.push(`Nội dung chuyển khoản chứa SĐT khách (${phone})`)
      }
    }

    // 3. Booking Code or Prefix Match (+30 points)
    if (bookingId && (txContent.includes(bookingId.toLowerCase()) || txContentNoAccent.includes(stripAccents(bookingId).toLowerCase()))) {
      score += 30
      reasons.push(`Khớp mã đơn đặt bàn: ${bookingId}`)
    } else if (txContentNoAccent.includes('kg') || txContentNoAccent.includes('dat ban') || txContentNoAccent.includes('coc')) {
      score += 10
      reasons.push(`Chứa từ khóa đặt cọc nhà hàng ("KG" / "coc")`)
    }

    // 4. Customer Name Match (+20 points)
    if (customerName) {
      const cleanName = customerName.toLowerCase().replace(/^(anh|chi|em|chú|bác|cô)\s+/i, '').trim()
      const cleanNameNoAccent = stripAccents(cleanName)
      if (cleanName.length > 2 && (txContent.includes(cleanName) || txContentNoAccent.includes(cleanNameNoAccent))) {
        score += 20
        reasons.push(`Chứa tên khách hàng: "${cleanName}"`)
      }
    }

    if (score > highestScore) {
      highestScore = score
      bestMatch = tx
      bestReasons = reasons
    }
  }

  if (!bestMatch || highestScore < 40) {
    return {
      bookingId,
      transactionId: '',
      status: 'UNMATCHED',
      confidence: 0,
      reasons: ['Chưa tìm thấy giao dịch ngân hàng khớp với thông tin đơn đặt bàn.'],
      bookingAmount: requiredAmount,
      transactionAmount: 0,
      customerName,
      phone
    }
  }

  if (highestScore >= 80) {
    matchStatus = 'MATCHED'
  } else if (highestScore >= 50) {
    matchStatus = 'PROBABLE_MATCH'
  } else {
    matchStatus = 'AMBIGUOUS'
  }

  return {
    bookingId,
    transactionId: bestMatch.transactionId,
    status: matchStatus,
    confidence: Math.min(1, Math.round((highestScore / 100) * 100) / 100),
    reasons: bestReasons,
    bookingAmount: requiredAmount,
    transactionAmount: bestMatch.amount,
    customerName,
    phone
  }
}
