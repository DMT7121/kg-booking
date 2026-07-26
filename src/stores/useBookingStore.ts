import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { HistoryOrder, BookingConflict } from './useAppStore'
import { DualWriteOrderRepository as GasOrderRepository } from '@/infrastructure/dual/dualWriteRepository'
import { getCachedHistory, cacheHistory } from '@/services/cache'

const orderRepo = new GasOrderRepository()

export const useBookingStore = defineStore('bookingStore', () => {
  const history = ref<HistoryOrder[]>([])
  const historyLoading = ref(false)
  const historyLoaded = ref(false)
  const conflicts = ref<BookingConflict[]>([])
  const activeConflict = ref<BookingConflict | null>(null)

  // Filters
  const selectedDate = ref('')
  const searchQuery = ref('')
  const selectedStatusFilter = ref<'all' | 'pending' | 'deposited' | 'cancelled'>('all')

  const filteredHistory = computed(() => {
    return history.value.filter((order) => {
      if (selectedDate.value && order.parsedCustomer.date !== selectedDate.value) {
        return false
      }
      if (selectedStatusFilter.value === 'deposited' && !order.isDeposited) {
        return false
      }
      if (selectedStatusFilter.value === 'pending' && order.isDeposited) {
        return false
      }
      if (searchQuery.value) {
        const q = searchQuery.value.toLowerCase().trim()
        const name = (order.parsedCustomer.name || '').toLowerCase()
        const phone = (order.parsedCustomer.phone || '').toLowerCase()
        return name.includes(q) || phone.includes(q)
      }
      return true
    })
  })

  async function loadHistory(forceReload = false) {
    if (historyLoaded.value && !forceReload) return
    historyLoading.value = true

    try {
      const cached = await getCachedHistory()
      if (cached && Array.isArray(cached) && cached.length > 0) {
        history.value = cached
        historyLoaded.value = true
      }

      const res = await orderRepo.getHistory()
      if (res && res.ok && Array.isArray(res.data)) {
        history.value = res.data
        historyLoaded.value = true
        await cacheHistory(res.data)
      }
    } catch (err) {
      console.error('[BookingStore] Failed to load history:', err)
    } finally {
      historyLoading.value = false
    }
  }

  function addOrUpdateBooking(booking: HistoryOrder) {
    const idx = history.value.findIndex(b => b.id === booking.id)
    if (idx >= 0) {
      history.value[idx] = { ...history.value[idx], ...booking }
    } else {
      history.value.unshift(booking)
    }
    cacheHistory(history.value)
  }

  function removeBooking(id: string) {
    history.value = history.value.filter(b => b.id !== id)
    cacheHistory(history.value)
  }

  return {
    history,
    historyLoading,
    historyLoaded,
    conflicts,
    activeConflict,
    selectedDate,
    searchQuery,
    selectedStatusFilter,
    filteredHistory,
    loadHistory,
    addOrUpdateBooking,
    removeBooking
  }
})
