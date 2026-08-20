import { cleanPhoneNumber } from '@/utils'
import { roundVND, safeAddMoney } from '@/utils/money'

export type CustomerTier = 'STANDARD' | 'SILVER' | 'GOLD' | 'VIP'

export interface CustomerFavoriteItem {
  name: string
  count: number
}

export interface CustomerProfile360 {
  phone: string
  name: string
  tier: CustomerTier
  totalBookings: number
  completedBookings: number
  cancelledBookings: number
  noShowBookings: number
  lifetimeValue: number
  averageSpend: number
  favoriteTables: CustomerFavoriteItem[]
  favoriteDishes: CustomerFavoriteItem[]
  commonPartyTypes: CustomerFavoriteItem[]
  tags: string[]
  firstBookingDate?: string
  lastBookingDate?: string
}

/**
 * Aggregates a full Customer 360 Profile from booking history.
 */
export function aggregateCustomer360Profile(phoneInput: string, allBookings: any[] = []): CustomerProfile360 {
  const phone = cleanPhoneNumber(phoneInput)
  const matchedBookings = allBookings.filter((b) => {
    const bPhone = cleanPhoneNumber(b.customer?.phone || b.phone || '')
    return bPhone === phone && phone.length >= 7
  })

  let customerName = ''
  let completedCount = 0
  let cancelledCount = 0
  let noShowCount = 0
  let lifetimeValue = 0

  const tableCounts = new Map<string, number>()
  const dishCounts = new Map<string, number>()
  const partyCounts = new Map<string, number>()
  const dates: string[] = []

  for (const b of matchedBookings) {
    if (!customerName && (b.customer?.name || b.customer_name)) {
      customerName = b.customer?.name || b.customer_name
    }

    const bDate = b.booking?.event_date || b.date || ''
    if (bDate) dates.push(bDate)

    const status = String(b.status || '').toLowerCase()
    if (status.includes('hủy') || status.includes('cancel')) {
      cancelledCount++
    } else if (status.includes('no_show') || status.includes('vắng')) {
      noShowCount++
    } else {
      completedCount++
      const depositAmt = b.deposit?.amount ?? b.deposit_amount ?? 0
      const billTotal = b.total_amount ?? b.bill_amount ?? depositAmt
      lifetimeValue = safeAddMoney(lifetimeValue, billTotal)
    }

    // Tables
    const table = b.booking?.table_number || b.table_number || b.tables || ''
    if (table) {
      tableCounts.set(table, (tableCounts.get(table) || 0) + 1)
    }

    // Dishes
    const items = b.menu_items || b.items || []
    if (Array.isArray(items)) {
      for (const it of items) {
        if (it.name) {
          dishCounts.set(it.name, (dishCounts.get(it.name) || 0) + (it.quantity || 1))
        }
      }
    }

    // Party Types
    const pType = b.party?.type || b.booking?.need || ''
    if (pType && pType !== 'Ăn thường') {
      partyCounts.set(pType, (partyCounts.get(pType) || 0) + 1)
    }
  }

  const totalBookings = matchedBookings.length
  const averageSpend = completedCount > 0 ? roundVND(lifetimeValue / completedCount) : 0

  // Determine Customer Tier
  let tier: CustomerTier = 'STANDARD'
  if (lifetimeValue >= 30000000 || completedCount >= 10) {
    tier = 'VIP'
  } else if (lifetimeValue >= 15000000 || completedCount >= 5) {
    tier = 'GOLD'
  } else if (lifetimeValue >= 5000000 || completedCount >= 2) {
    tier = 'SILVER'
  }

  // Tags
  const tags: string[] = []
  if (tier === 'VIP') tags.push('Khách VIP')
  if (completedCount >= 5) tags.push('Khách Thân Thiết')
  if (cancelledCount > 2) tags.push('Hay Hủy Bàn')
  if (partyCounts.size > 0) tags.push('Khách Đặt Tiệc')

  return {
    phone,
    name: customerName || 'Khách Hàng',
    tier,
    totalBookings,
    completedBookings: completedCount,
    cancelledBookings: cancelledCount,
    noShowBookings: noShowCount,
    lifetimeValue,
    averageSpend,
    favoriteTables: Array.from(tableCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3),
    favoriteDishes: Array.from(dishCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    commonPartyTypes: Array.from(partyCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    tags,
    firstBookingDate: dates[0],
    lastBookingDate: dates[dates.length - 1]
  }
}
