import { defineStore } from 'pinia'
import { computed } from 'vue'
import { useBookingStore } from './useBookingStore'

export const useAnalyticsStore = defineStore('analyticsStore', () => {
  const bookingStore = useBookingStore()

  const totalRevenue = computed(() => {
    return bookingStore.history.reduce((sum, order) => sum + (order.totalAmount || 0), 0)
  })

  const totalDeposit = computed(() => {
    return bookingStore.history.reduce((sum, order) => sum + (order.depositAmount || 0), 0)
  })

  const totalBookingsCount = computed(() => {
    return bookingStore.history.length
  })

  const last7DaysRevenue = computed(() => {
    const today = new Date()
    const result: { date: string; revenue: number; bookings: number }[] = []

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(today.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]
      
      const dayOrders = bookingStore.history.filter(o => o.parsedCustomer.date === dateStr)
      const dayRevenue = dayOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0)

      result.push({
        date: dateStr,
        revenue: dayRevenue,
        bookings: dayOrders.length
      })
    }

    return result
  })

  const staffLeaderboard = computed(() => {
    const staffMap = new Map<string, { name: string; totalRevenue: number; totalBookings: number }>()

    bookingStore.history.forEach(order => {
      const staffName = order.staff?.name || 'Khác'
      const current = staffMap.get(staffName) || { name: staffName, totalRevenue: 0, totalBookings: 0 }
      current.totalRevenue += order.totalAmount || 0
      current.totalBookings += 1
      staffMap.set(staffName, current)
    })

    return Array.from(staffMap.values()).sort((a, b) => b.totalRevenue - a.totalRevenue)
  })

  return {
    totalRevenue,
    totalDeposit,
    totalBookingsCount,
    last7DaysRevenue,
    staffLeaderboard
  }
})
