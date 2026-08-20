import { roundVND, safeAddMoney } from '@/utils/money'
import { calculateCompositeStatus } from '@/domain/booking/statusCalculator'

export interface OperationsDailyKPI {
  date: string
  totalBookings: number
  totalGuests: number
  projectedRevenue: number
  depositReceived: number
  depositOutstanding: number
  tableOccupancyRate: number
  readyBookingsCount: number
  attentionBookingsCount: number
  inServiceBookingsCount: number
  completedBookingsCount: number
  cancelledBookingsCount: number
  averageSpendPerGuest: number
}

export interface OperationsTrendMetrics {
  totalPeriodBookings: number
  cancellationRate: number
  averagePartySize: number
  topDishes: Array<{ name: string; quantity: number; revenue: number }>
  peakArrivalHours: Array<{ hour: string; count: number }>
}

/**
 * Calculates daily operations KPIs from a list of booking records.
 */
export function calculateDailyOperationsKPI(
  targetDate: string,
  allBookings: any[],
  totalTablesAvailable = 30
): OperationsDailyKPI {
  const dayBookings = allBookings.filter((b) => {
    const bDate = b.booking?.event_date || b.date || ''
    return bDate === targetDate
  })

  let totalGuests = 0
  let projectedRevenue = 0
  let depositReceived = 0
  let depositOutstanding = 0
  let readyCount = 0
  let attentionCount = 0
  let inServiceCount = 0
  let completedCount = 0
  let cancelledCount = 0

  const tablesUsed = new Set<string>()

  for (const b of dayBookings) {
    const statusSummary = calculateCompositeStatus(b)
    const guestCount = b.booking?.guest_count ?? b.guest_count ?? 0
    const depositAmt = b.deposit?.amount ?? b.deposit_amount ?? 0
    const billTotal = b.total_amount ?? b.bill_amount ?? (guestCount * 300000)

    if (statusSummary.derived === 'CANCELLED') {
      cancelledCount++
      continue
    }

    totalGuests += guestCount
    projectedRevenue = safeAddMoney(projectedRevenue, billTotal)

    if (statusSummary.deposit === 'PAID') {
      depositReceived = safeAddMoney(depositReceived, depositAmt)
    } else {
      depositOutstanding = safeAddMoney(depositOutstanding, depositAmt || (guestCount >= 8 ? 500000 : 0))
    }

    if (statusSummary.derived === 'READY') readyCount++
    if (statusSummary.derived === 'NEEDS_ATTENTION' || statusSummary.derived === 'BLOCKED') attentionCount++
    if (statusSummary.derived === 'IN_SERVICE') inServiceCount++
    if (statusSummary.derived === 'COMPLETED') completedCount++

    const tableStr = b.booking?.table_number || b.table_number || b.tables || ''
    if (tableStr) {
      tableStr.split(/[\s,]+/).forEach((t: string) => {
        if (t.trim()) tablesUsed.add(t.trim().toUpperCase())
      })
    }
  }

  const activeBookings = dayBookings.length - cancelledCount
  const tableOccupancyRate = totalTablesAvailable > 0
    ? Math.min(100, Math.round((tablesUsed.size / totalTablesAvailable) * 100))
    : 0

  const averageSpendPerGuest = totalGuests > 0 ? roundVND(projectedRevenue / totalGuests) : 0

  return {
    date: targetDate,
    totalBookings: dayBookings.length,
    totalGuests,
    projectedRevenue,
    depositReceived,
    depositOutstanding,
    tableOccupancyRate,
    readyBookingsCount: readyCount,
    attentionBookingsCount: attentionCount,
    inServiceBookingsCount: inServiceCount,
    completedBookingsCount: completedCount,
    cancelledBookingsCount: cancelledCount,
    averageSpendPerGuest
  }
}

/**
 * Computes trend metrics across all historical bookings.
 */
export function calculateOperationsTrends(allBookings: any[] = []): OperationsTrendMetrics {
  const total = allBookings.length
  if (total === 0) {
    return {
      totalPeriodBookings: 0,
      cancellationRate: 0,
      averagePartySize: 0,
      topDishes: [],
      peakArrivalHours: []
    }
  }

  let totalGuests = 0
  let cancelledCount = 0
  const dishMap = new Map<string, { quantity: number; revenue: number }>()
  const hourMap = new Map<string, number>()

  for (const b of allBookings) {
    const status = String(b.status || '').toLowerCase()
    if (status.includes('hủy') || status.includes('cancel')) {
      cancelledCount++
    }

    const guestCount = b.booking?.guest_count ?? b.guest_count ?? 2
    totalGuests += guestCount

    const time = b.booking?.event_time || b.time || ''
    if (time) {
      const hour = time.split(':')[0] || time.substring(0, 2)
      const hourKey = `${hour}:00`
      hourMap.set(hourKey, (hourMap.get(hourKey) || 0) + 1)
    }

    const items = b.menu_items || b.items || []
    if (Array.isArray(items)) {
      for (const it of items) {
        if (it.name) {
          const prev = dishMap.get(it.name) || { quantity: 0, revenue: 0 }
          const qty = it.quantity || 1
          const price = it.unit_price ?? it.price ?? 0
          dishMap.set(it.name, {
            quantity: prev.quantity + qty,
            revenue: prev.revenue + qty * price
          })
        }
      }
    }
  }

  const cancellationRate = Math.round((cancelledCount / total) * 100)
  const averagePartySize = Math.round((totalGuests / total) * 10) / 10

  const topDishes = Array.from(dishMap.entries())
    .map(([name, data]) => ({ name, quantity: data.quantity, revenue: data.revenue }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5)

  const peakArrivalHours = Array.from(hourMap.entries())
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => b.count - a.count)

  return {
    totalPeriodBookings: total,
    cancellationRate,
    averagePartySize,
    topDishes,
    peakArrivalHours
  }
}
