import { parseTimeToMinutes, parseRestaurantDateTime, getMinutesUntilBooking } from '@/utils/time'

export type RiskSeverity = 'INFO' | 'WARNING' | 'HIGH' | 'CRITICAL'

export interface OperationalRiskIssue {
  code: string
  severity: RiskSeverity
  title: string
  message: string
  bookingId: string
  suggestedResolution?: string
  dueMinutes?: number
}

export interface TableDefinition {
  id: string
  code: string
  name: string
  zone: string
  minCapacity: number
  maxCapacity: number
}

// Default standard tables configuration if not provided
export const DEFAULT_TABLE_DEFINITIONS: Record<string, TableDefinition> = {
  'A1': { id: 't_a1', code: 'A1', name: 'Bàn A1', zone: 'Khu A', minCapacity: 2, maxCapacity: 4 },
  'A2': { id: 't_a2', code: 'A2', name: 'Bàn A2', zone: 'Khu A', minCapacity: 2, maxCapacity: 4 },
  'A3': { id: 't_a3', code: 'A3', name: 'Bàn A3', zone: 'Khu A', minCapacity: 4, maxCapacity: 6 },
  'B1': { id: 't_b1', code: 'B1', name: 'Bàn B1', zone: 'Khu B', minCapacity: 4, maxCapacity: 8 },
  'B2': { id: 't_b2', code: 'B2', name: 'Bàn B2', zone: 'Khu B', minCapacity: 4, maxCapacity: 8 },
  'C1': { id: 't_c1', code: 'C1', name: 'Bàn C1', zone: 'Sân vườn', minCapacity: 6, maxCapacity: 12 },
  'C2': { id: 't_c2', code: 'C2', name: 'Bàn C2', zone: 'Sân vườn', minCapacity: 6, maxCapacity: 12 },
  'VIP1': { id: 't_vip1', code: 'VIP1', name: 'Phòng VIP 1', zone: 'VIP', minCapacity: 8, maxCapacity: 16 },
  'VIP2': { id: 't_vip2', code: 'VIP2', name: 'Phòng VIP 2', zone: 'VIP', minCapacity: 10, maxCapacity: 25 },
}

/**
 * Checks for table overlaps with other confirmed bookings on the same date.
 */
export function checkTableOverlap(
  currentBooking: any,
  allBookings: any[],
  bufferMinutes = 120
): OperationalRiskIssue[] {
  const issues: OperationalRiskIssue[] = []
  const currentId = String(currentBooking.id || currentBooking.order_id || '')
  const currentDate = currentBooking.booking?.event_date || currentBooking.date || ''
  const currentTime = currentBooking.booking?.event_time || currentBooking.time || ''
  const currentTablesStr = currentBooking.booking?.table_number || currentBooking.table_number || currentBooking.tables || ''

  if (!currentDate || !currentTime || !currentTablesStr) return issues

  const currentTables = currentTablesStr.split(/[\s,]+/).map((t: string) => t.trim().toUpperCase()).filter(Boolean)
  if (currentTables.length === 0) return issues

  const currentMinutes = parseTimeToMinutes(currentTime)

  for (const other of allBookings) {
    const otherId = String(other.id || other.order_id || '')
    if (otherId && otherId === currentId) continue

    const otherStatus = String(other.status || '').toLowerCase()
    if (otherStatus.includes('hủy') || otherStatus.includes('cancel')) continue

    const otherDate = other.booking?.event_date || other.date || ''
    if (otherDate !== currentDate) continue

    const otherTablesStr = other.booking?.table_number || other.table_number || other.tables || ''
    if (!otherTablesStr) continue

    const otherTables = otherTablesStr.split(/[\s,]+/).map((t: string) => t.trim().toUpperCase()).filter(Boolean)
    const overlappedTables = currentTables.filter((t: string) => otherTables.includes(t))

    if (overlappedTables.length > 0) {
      const otherTime = other.booking?.event_time || other.time || ''
      const otherMinutes = parseTimeToMinutes(otherTime)

      const isConflict = currentMinutes < otherMinutes + bufferMinutes && otherMinutes < currentMinutes + bufferMinutes
      if (isConflict) {
        const otherCustomer = other.customer?.name || other.customer_name || 'Khách khác'
        issues.push({
          code: 'TABLE_OVERLAP',
          severity: 'CRITICAL',
          title: 'Trùng bàn đặt tiệc',
          message: `Bàn ${overlappedTables.join(', ')} bị trùng giờ giữa đơn "${currentBooking.customer?.name || currentBooking.customer_name || 'Đơn này'}" (${currentTime}) và đơn "${otherCustomer}" (${otherTime}).`,
          bookingId: currentId,
          suggestedResolution: `Đổi bàn cho một trong hai đơn hoặc ghép thêm bàn phụ.`
        })
      }
    }
  }

  return issues
}

/**
 * Checks if guest count exceeds the maximum capacity of the assigned tables.
 */
export function checkCapacityLimit(
  booking: any,
  tableDefinitions: Record<string, TableDefinition> = DEFAULT_TABLE_DEFINITIONS
): OperationalRiskIssue[] {
  const issues: OperationalRiskIssue[] = []
  const currentId = String(booking.id || booking.order_id || '')
  const guestCount = booking.booking?.guest_count ?? booking.guest_count ?? 0
  const tablesStr = booking.booking?.table_number || booking.table_number || booking.tables || ''

  if (!guestCount || !tablesStr) return issues

  const tables = tablesStr.split(/[\s,]+/).map((t: string) => t.trim().toUpperCase()).filter(Boolean)
  let totalMaxCapacity = 0

  for (const tableCode of tables) {
    const def = tableDefinitions[tableCode]
    if (def) {
      totalMaxCapacity += def.maxCapacity
    } else {
      totalMaxCapacity += 6 // Default assumption for unlisted table
    }
  }

  if (guestCount > totalMaxCapacity) {
    issues.push({
      code: 'CAPACITY_EXCEEDED',
      severity: 'HIGH',
      title: 'Vượt sức chứa bàn',
      message: `Đoàn ${guestCount} khách vượt quá sức chứa tối đa (${totalMaxCapacity} chỗ) của bàn ${tables.join('+')}.`,
      bookingId: currentId,
      suggestedResolution: `Ghép thêm bàn liền kề hoặc chuyển sang phòng VIP lớn hơn.`
    })
  }

  return issues
}

/**
 * Scans a booking for all operational risks.
 */
export function detectBookingRisks(
  booking: any,
  allBookings: any[] = [],
  tableDefinitions: Record<string, TableDefinition> = DEFAULT_TABLE_DEFINITIONS
): OperationalRiskIssue[] {
  const issues: OperationalRiskIssue[] = []
  const bookingId = String(booking.id || booking.order_id || '')
  const bookingStatus = String(booking.status || '').toLowerCase()
  if (bookingStatus.includes('hủy') || bookingStatus.includes('cancel')) return issues

  const dateStr = booking.booking?.event_date || booking.date || ''
  const timeStr = booking.booking?.event_time || booking.time || ''
  const guestCount = booking.booking?.guest_count ?? booking.guest_count ?? 0
  const tableCode = booking.booking?.table_number || booking.table_number || booking.tables || ''
  const depositAmount = booking.deposit?.amount ?? booking.deposit_amount ?? 0
  const depositStatus = String(booking.deposit?.status || booking.deposit_status || '').toLowerCase()
  const party = booking.party || {}
  const partyType = String(party.type || booking.booking?.need || '').toLowerCase()
  const isParty = /sinh nhật|thôi nôi|đầy tháng|công ty|tiệc|hbd/i.test(partyType)

  const minutesUntil = (dateStr && timeStr) ? getMinutesUntilBooking(dateStr, timeStr) : null

  // 1. Check Table Overlaps
  issues.push(...checkTableOverlap(booking, allBookings))

  // 2. Check Capacity Limits
  issues.push(...checkCapacityLimit(booking, tableDefinitions))

  // 3. Check Unassigned Table near event (< 4 hours)
  if (!tableCode || !tableCode.trim()) {
    if (minutesUntil !== null && minutesUntil <= 240 && minutesUntil > 0) {
      issues.push({
        code: 'UNASSIGNED_TABLE_NEAR_EVENT',
        severity: 'CRITICAL',
        title: 'Chưa xếp bàn sát giờ tiệc',
        message: `Đoàn khách đến trong vòng ${Math.round(minutesUntil / 60)}h nữa nhưng chưa được gán số bàn.`,
        bookingId,
        dueMinutes: minutesUntil,
        suggestedResolution: 'Gán bàn trống ngay trên sơ đồ bàn.'
      })
    } else {
      issues.push({
        code: 'UNASSIGNED_TABLE',
        severity: 'WARNING',
        title: 'Chưa gán số bàn',
        message: 'Đơn đặt bàn chưa có số bàn/khu vực được gán.',
        bookingId,
        suggestedResolution: 'Chọn số bàn thích hợp.'
      })
    }
  }

  // 4. Check Missing Deposit for large party
  if (guestCount >= 8 && depositAmount <= 0 && !depositStatus.includes('đã cọc') && !depositStatus.includes('paid')) {
    const isNearEvent = minutesUntil !== null && minutesUntil <= 1440 // Within 24h
    issues.push({
      code: 'MISSING_DEPOSIT',
      severity: isNearEvent ? 'HIGH' : 'WARNING',
      title: 'Chưa nhận tiền cọc tiệc đông',
      message: `Đoàn ${guestCount} khách chưa cọc giữ chỗ (Cần cọc trước giờ đón khách).`,
      bookingId,
      suggestedResolution: 'Gửi mã VietQR nhắc khách chuyển khoản cọc.'
    })
  }

  // 5. Check Decor details missing for birthday/anniversary parties
  if (isParty) {
    const hasBoard = !!(party.display_board_text || party.text_on_board || booking.decoration?.text_on_board)
    const hasColor = !!(party.decor_color || booking.decoration?.decor_color)
    if (!hasBoard && !hasColor) {
      issues.push({
        code: 'DECOR_DETAILS_MISSING',
        severity: 'WARNING',
        title: 'Thiếu thông tin trang trí tiệc',
        message: `Tiệc sinh nhật/sự kiện chưa có nội dung bảng chữ mừng hoặc tông màu chủ đạo.`,
        bookingId,
        suggestedResolution: 'Liên hệ khách để chốt tên ghi trên bảng và màu trang trí.'
      })
    }
  }

  return issues
}
