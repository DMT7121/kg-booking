import {
  BookingDomainStatus,
  DepositDomainStatus,
  MenuDomainStatus,
  DecorDomainStatus,
  KitchenDomainStatus,
  TableDomainStatus,
  PaymentDomainStatus,
  DerivedOperationalStatus,
  CompositeStatusSummary
} from './statusTypes'

/**
 * Calculates Composite & Derived Operational Status from a booking record.
 */
export function calculateCompositeStatus(booking: any, options?: { hasCriticalConflict?: boolean; conflictReasons?: string[] }): CompositeStatusSummary {
  const attentionReasons: string[] = []
  const blockingReasons: string[] = options?.conflictReasons || []

  // 1. Resolve Booking Domain Status
  let bookingStatus: BookingDomainStatus = 'CONFIRMED'
  const rawStatus = String(booking?.status || '').toLowerCase().trim()
  if (rawStatus.includes('hủy') || rawStatus.includes('cancel') || rawStatus === 'cancelled') {
    bookingStatus = 'CANCELLED'
  } else if (rawStatus.includes('no_show') || rawStatus.includes('vắng')) {
    bookingStatus = 'NO_SHOW'
  } else if (rawStatus.includes('đang ăn') || rawStatus.includes('seated') || rawStatus.includes('in_service')) {
    bookingStatus = 'SEATED'
  } else if (rawStatus.includes('hoàn tất') || rawStatus.includes('completed') || rawStatus.includes('done')) {
    bookingStatus = 'COMPLETED'
  } else if (!booking?.customer?.name && !booking?.customer_name && !booking?.phone) {
    bookingStatus = 'DRAFT'
    attentionReasons.push('Thiếu thông tin người đặt hoặc SĐT liên hệ.')
  }

  // 2. Resolve Deposit Domain Status
  let depositStatus: DepositDomainStatus = 'UNPAID'
  const depAmount = booking?.deposit?.amount ?? booking?.deposit_amount ?? 0
  const depStatusStr = String(booking?.deposit?.status || booking?.deposit_status || '').toLowerCase()
  const guestCount = booking?.booking?.guest_count ?? booking?.guest_count ?? 0

  if (depStatusStr.includes('đã cọc') || depStatusStr.includes('paid') || depAmount > 0) {
    depositStatus = 'PAID'
  } else if (depStatusStr.includes('hoàn') || depStatusStr.includes('refund')) {
    depositStatus = 'REFUNDED'
  } else {
    depositStatus = 'UNPAID'
    if (guestCount >= 8 && bookingStatus !== 'CANCELLED' && bookingStatus !== 'COMPLETED') {
      attentionReasons.push(`Đoàn ${guestCount} khách chưa cọc giữ chỗ.`)
    }
  }

  // 3. Resolve Menu Domain Status
  let menuStatus: MenuDomainStatus = 'NOT_SELECTED'
  const items = booking?.menu_items || booking?.items || []
  if (Array.isArray(items) && items.length > 0) {
    menuStatus = 'CONFIRMED'
  } else if (booking?.party?.type && booking.party.type !== 'Ăn thường') {
    menuStatus = 'NOT_SELECTED'
    attentionReasons.push('Tiệc chưa chọn trước danh sách món ăn.')
  }

  // 4. Resolve Decor Domain Status
  let decorStatus: DecorDomainStatus = 'NOT_REQUIRED'
  const party = booking?.party || {}
  const partyType = String(party.type || booking?.booking?.need || '').toLowerCase()
  const isParty = /sinh nhật|thôi nôi|đầy tháng|công ty|kỷ niệm|tiệc|hbd/i.test(partyType)

  if (isParty) {
    const hasBoard = !!(party.display_board_text || party.text_on_board || booking?.decoration?.text_on_board)
    const hasColor = !!(party.decor_color || booking?.decoration?.decor_color)
    if (hasBoard || hasColor) {
      decorStatus = 'CONFIRMED'
    } else {
      decorStatus = 'PENDING_DETAILS'
      attentionReasons.push('Tiệc sinh nhật/sự kiện chưa có nội dung bảng mừng hoặc tông màu trang trí.')
    }
  }

  // 5. Resolve Kitchen Domain Status
  let kitchenStatus: KitchenDomainStatus = 'PENDING'
  if (menuStatus === 'CONFIRMED') {
    kitchenStatus = 'ACKNOWLEDGED'
  }

  // 6. Resolve Table Domain Status
  let tableStatus: TableDomainStatus = 'UNASSIGNED'
  const tableCode = booking?.booking?.table_number || booking?.table_number || booking?.tables
  if (tableCode && String(tableCode).trim()) {
    tableStatus = bookingStatus === 'SEATED' ? 'OCCUPIED' : 'ASSIGNED'
  } else {
    tableStatus = 'UNASSIGNED'
    if (bookingStatus !== 'CANCELLED' && bookingStatus !== 'COMPLETED') {
      attentionReasons.push('Chưa gán số bàn / khu vực cho đơn đặt bàn.')
    }
  }

  // 7. Resolve Payment Domain Status
  let paymentStatus: PaymentDomainStatus = 'UNPAID'
  if (bookingStatus === 'COMPLETED') {
    paymentStatus = 'PAID'
  } else if (depositStatus === 'PAID') {
    paymentStatus = 'PARTIAL'
  }

  // 8. Derive Operational Status
  let derived: DerivedOperationalStatus = 'READY'

  if (bookingStatus === 'CANCELLED' || bookingStatus === 'NO_SHOW') {
    derived = 'CANCELLED'
  } else if (options?.hasCriticalConflict || blockingReasons.length > 0) {
    derived = 'BLOCKED'
  } else if (bookingStatus === 'SEATED') {
    derived = 'IN_SERVICE'
  } else if (bookingStatus === 'COMPLETED') {
    derived = 'COMPLETED'
  } else if (attentionReasons.length > 0) {
    derived = 'NEEDS_ATTENTION'
  } else {
    derived = 'READY'
  }

  return {
    booking: bookingStatus,
    deposit: depositStatus,
    menu: menuStatus,
    decor: decorStatus,
    kitchen: kitchenStatus,
    table: tableStatus,
    payment: paymentStatus,
    derived,
    attentionReasons,
    blockingReasons
  }
}
