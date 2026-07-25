import { defineStore } from 'pinia'
import { ref, computed, shallowRef } from 'vue'
import { stripAccents, formatVND, cleanPhoneNumber } from '@/utils'
import { useUIStore } from './useUIStore'
import { cacheHistory, getCachedHistory, getOfflineQueue, removeFromQueue } from '@/services/cache'
import { DualWriteOrderRepository as GasOrderRepository } from '@/infrastructure/dual/dualWriteRepository'
import { getPendingItems } from '@/infrastructure/outbox/outbox'

const orderRepo = new GasOrderRepository()

export interface HistoryOrder {
  id: string
  version?: number
  timestamp: string
  parsedCustomer: {
    name: string
    phone: string
    date: string
    time?: string
    pax?: string
    tables?: string
    type?: string
    note?: string
  }
  menuItems: any[]
  totalAmount: number
  depositAmount: number
  isDeposited: boolean
  transferImage?: string
  deposit?: { image?: string }
  staff?: { name: string; phone: string }
  billUrl?: string
  billFileId?: string
  aiEngine?: string
  isSyncing?: boolean
  isCared?: boolean
  activeMenuSheet?: string
}

export interface BookingConflict {
  localBookingId: string
  serverBookingId?: string
  type: 'table_time_overlap' | 'version_mismatch' | 'duplicate_customer_phone' | 'capacity_mismatch' | 'unknown'
  severity: 'warning' | 'blocking'
  localSnapshot: any
  serverSnapshot?: any
  detectedAt: string
  resolution?: 'keep_server' | 'keep_local' | 'merge' | 'change_table_time' | 'cancel_local'
}

export interface NormalizedBookingTime {
  bookingId: string;
  dateKey: string;
  tables: string[];
  startMinutes: number;
  endMinutes: number;
  status: string;
  phone?: string;
}

const bookingTimeIndex = new Map<string, NormalizedBookingTime[]>()
const bookingIdToDateKeyMap = new Map<string, string>()

function parseTimeToMinutesHelper(tStr: string): number {
  if (!tStr) return 0
  if (tStr.length === 5 && tStr[2] === ':') {
    const h = (tStr.charCodeAt(0) - 48) * 10 + (tStr.charCodeAt(1) - 48)
    const m = (tStr.charCodeAt(3) - 48) * 10 + (tStr.charCodeAt(4) - 48)
    if (h >= 0 && h < 24 && m >= 0 && m < 60) return h * 60 + m
  }
  const m = tStr.match(/^(\d{2}):(\d{2})$/)
  if (!m) return 0
  return parseInt(m[1]) * 60 + parseInt(m[2])
}

export function addOrderToTimeIndex(order: HistoryOrder): void {
  if (!order || !order.parsedCustomer || !order.id) return
  const customer = order.parsedCustomer
  const dateKey = (customer.date || '').trim()
  if (!dateKey) return

  removeOrderFromTimeIndex(order.id)

  const timeStr = customer.time || ''
  const tablesStr = customer.tables || ''
  const tables = tablesStr.split(/[\s,]+/).map(t => t.trim().toUpperCase()).filter(Boolean)

  const startMinutes = parseTimeToMinutesHelper(timeStr)
  const endMinutes = startMinutes + 120

  const normalized: NormalizedBookingTime = {
    bookingId: order.id,
    dateKey,
    tables,
    startMinutes,
    endMinutes,
    status: customer.type || '',
    phone: customer.phone || ''
  }

  let dateList = bookingTimeIndex.get(dateKey)
  if (!dateList) {
    dateList = []
    bookingTimeIndex.set(dateKey, dateList)
  }
  dateList.push(normalized)
  bookingIdToDateKeyMap.set(order.id, dateKey)
}

export function removeOrderFromTimeIndex(orderId: string): void {
  if (!orderId) return
  const dateKey = bookingIdToDateKeyMap.get(orderId)
  if (dateKey) {
    const candidates = bookingTimeIndex.get(dateKey)
    if (candidates) {
      const filtered = candidates.filter(c => c.bookingId !== orderId)
      if (filtered.length === 0) {
        bookingTimeIndex.delete(dateKey)
      } else {
        bookingTimeIndex.set(dateKey, filtered)
      }
    }
    bookingIdToDateKeyMap.delete(orderId)
  } else {
    for (const [dk, candidates] of bookingTimeIndex.entries()) {
      const idx = candidates.findIndex(c => c.bookingId === orderId)
      if (idx !== -1) {
        candidates.splice(idx, 1)
        if (candidates.length === 0) bookingTimeIndex.delete(dk)
        break
      }
    }
  }
}

export function updateOrderInTimeIndex(order: HistoryOrder): void {
  if (!order || !order.id) return
  removeOrderFromTimeIndex(order.id)
  addOrderToTimeIndex(order)
}

export function rebuildBookingTimeIndex(history: HistoryOrder[]) {
  bookingTimeIndex.clear()
  bookingIdToDateKeyMap.clear()
  if (!Array.isArray(history)) return
  history.forEach(order => {
    addOrderToTimeIndex(order)
  })
}

export function hasTimeConflictIndexed(
  a: { id?: string; date: string; time: string; tables: string; phone?: string },
  bufferMinutes = 120
): boolean {
  const dateKey = (a.date || '').trim()
  if (!dateKey) return false
  
  const candidates = bookingTimeIndex.get(dateKey)
  if (!candidates || candidates.length === 0) return false
  
  const tablesA = a.tables.split(/[\s,]+/).map(t => t.trim().toUpperCase()).filter(Boolean)
  if (tablesA.length === 0) return false
  
  const timeA = parseTimeToMinutesHelper(a.time)
  const startA = timeA
  const endA = timeA + bufferMinutes
  
  for (const other of candidates) {
    if (a.id && other.bookingId === a.id) continue
    
    if (a.phone && other.phone) {
      const cleanPhoneA = String(a.phone).replace(/\D/g, "")
      const cleanPhoneOther = String(other.phone).replace(/\D/g, "")
      if (cleanPhoneA && cleanPhoneOther) {
        const suffixA = cleanPhoneA.substring(Math.max(0, cleanPhoneA.length - 9))
        const suffixOther = cleanPhoneOther.substring(Math.max(0, cleanPhoneOther.length - 9))
        if (suffixA === suffixOther) {
          continue
        }
      }
    }
    
    const hasCommonTable = tablesA.some(t => other.tables.includes(t))
    if (!hasCommonTable) continue
    
    const overlap = startA < other.endMinutes && other.startMinutes < endA
    if (overlap) {
      return true
    }
  }
  return false
}

export function hasTimeConflict(
  a: { date: string; time: string; tables: string },
  b: { date: string; time: string; tables: string },
  options?: { bufferMinutes?: number }
): boolean {
  if (a.date !== b.date) return false
  if (!a.tables || !b.tables) return false
  
  const tablesA = a.tables.split(/[\s,]+/).map(t => t.trim().toUpperCase()).filter(Boolean)
  const tablesB = b.tables.split(/[\s,]+/).map(t => t.trim().toUpperCase()).filter(Boolean)
  const hasCommonTable = tablesA.some(t => tablesB.includes(t))
  if (!hasCommonTable) return false
  
  const timeA = parseTimeToMinutesHelper(a.time)
  const timeB = parseTimeToMinutesHelper(b.time)
  const buffer = options?.bufferMinutes ?? 120
  
  return timeA < timeB + buffer && timeB < timeA + buffer
}

export const useOrderStore = defineStore('order', () => {
  const uiStore = useUIStore()
  const historyList = shallowRef<HistoryOrder[]>([])
  const activeConflicts = ref<BookingConflict[]>(JSON.parse(localStorage.getItem('kg_sync_conflicts') || '[]'))
  const offlineQueueCount = ref(0)

  const groupedHistory = computed(() => {
    const groups: Record<string, { latest: HistoryOrder; versions: HistoryOrder[] }> = {}
    if (!Array.isArray(historyList.value)) return {}
    historyList.value.forEach(order => {
      if (!order || !order.parsedCustomer) return
      const key = order.id || `${order.parsedCustomer.name}|${order.parsedCustomer.phone}|${order.parsedCustomer.date}`
      if (!groups[key]) groups[key] = { latest: order, versions: [] }
      groups[key].versions.push(order)
      const currVers = order.version ?? 0
      const latestVers = groups[key].latest.version ?? 0
      const isNewer = currVers && latestVers
        ? currVers > latestVers
        : new Date(order.timestamp || 0).getTime() > new Date(groups[key].latest.timestamp || 0).getTime()
      if (isNewer) groups[key].latest = order
    })
    return groups
  })

  const filteredHistory = computed(() => {
    const groups = groupedHistory.value
    const query = uiStore.historySearch.trim().toLowerCase()
    const { time, status, deposit, sort } = uiStore.historyFilters

    let entries = Object.entries(groups)

    entries = entries.filter(([key, group]) => {
      const customer = group.latest.parsedCustomer
      
      if (query) {
        const searchStr = `${customer.name} ${customer.phone} ${customer.date} ${formatVND(group.latest.totalAmount)}`.toLowerCase()
        if (!stripAccents(searchStr).includes(stripAccents(query))) return false
      }
      
      if (deposit === 'paid' && !group.latest.isDeposited) return false
      if (deposit === 'unpaid' && group.latest.isDeposited) return false
      
      if (time === 'today') {
        const todayStr = `${String(new Date().getDate()).padStart(2, '0')}/${String(new Date().getMonth() + 1).padStart(2, '0')}/${new Date().getFullYear()}`
        if ((customer.date || '').trim() !== todayStr) return false
      }
      
      if (status === 'synced' && group.latest.isSyncing) return false
      if (status === 'syncing' && !group.latest.isSyncing) return false
      
      return true
    })

    entries.sort((a, b) => {
      const tA = new Date(a[1].latest.timestamp || 0).getTime()
      const tB = new Date(b[1].latest.timestamp || 0).getTime()
      return sort === 'newest' ? tB - tA : tA - tB
    })

    const filtered: Record<string, any> = {}
    entries.forEach(([k, v]) => { filtered[k] = v })
    return filtered
  })

  function getCrmStatus(phone: string): string | null {
    if (!phone) return null
    const cleanedPhone = cleanPhoneNumber(phone)
    const historyCount = historyList.value.filter(h => cleanPhoneNumber(h.parsedCustomer.phone) === cleanedPhone).length
    if (historyCount >= 5) return 'VIP'
    if (historyCount >= 1) return 'Khách quen'
    return 'Khách mới'
  }

  function computeDiff(curr: any, prev: any): string {
    let html = ''
    if (curr.totalAmount !== prev.totalAmount) {
      html += `<div class="mb-1"><span class="diff-change">Tiền: ${formatVND(prev.totalAmount)} → ${formatVND(curr.totalAmount)}</span></div>`
    }
    if (curr.menuItems?.length !== prev.menuItems?.length) {
      html += `<div><span class="diff-add">Món: ${prev.menuItems?.length || 0} → ${curr.menuItems?.length || 0} món</span></div>`
    }
    return html || '<span class="text-gray-400 italic">Cập nhật thông tin chi tiết</span>'
  }

  function setOptimisticOrder(order: HistoryOrder) {
    const list = [...historyList.value]
    const idx = list.findIndex(h => h.id === order.id)
    if (idx !== -1) {
      list[idx] = order
    } else {
      list.push(order)
    }
    historyList.value = list
    updateOrderInTimeIndex(order)
    cacheHistory(list)
  }

  function markOrderSynced(orderId: string, serverData?: any) {
    const list = [...historyList.value]
    const idx = list.findIndex(h => h.id === orderId)
    if (idx !== -1) {
      const updatedOrder = {
        ...list[idx],
        ...serverData,
        isSyncing: false
      }
      list[idx] = updatedOrder
      historyList.value = list
      updateOrderInTimeIndex(updatedOrder)
      cacheHistory(list)
    }
  }

  function markOrderFailed(orderId: string) {
    const list = [...historyList.value]
    const idx = list.findIndex(h => h.id === orderId)
    if (idx !== -1) {
      const updatedOrder = {
        ...list[idx],
        isSyncing: false
      }
      list[idx] = updatedOrder
      historyList.value = list
      updateOrderInTimeIndex(updatedOrder)
      cacheHistory(list)
    }
  }

  async function loadHistory(silent: boolean) {
    const cached = await getCachedHistory()
    const hasCache = cached && cached.length > 0
    if (hasCache && historyList.value.length === 0) {
      historyList.value = cached
      rebuildBookingTimeIndex(cached)
    }

    if (!hasCache) {
      uiStore.connectionStatus = 'syncing'
    }

    try {
      const data = await orderRepo.getHistory((freshData) => {
        if (freshData && freshData.ok) {
          historyList.value = freshData.data || []
          rebuildBookingTimeIndex(freshData.data || [])
          uiStore.connectionStatus = 'online'
          cacheHistory(freshData.data || [])
        }
      })
      if (data.ok) {
        historyList.value = data.data || []
        rebuildBookingTimeIndex(data.data || [])
        uiStore.connectionStatus = 'online'
        cacheHistory(data.data || [])
      } else {
        uiStore.connectionStatus = hasCache ? 'online' : 'error'
        if (hasCache && cached) {
          historyList.value = cached
          rebuildBookingTimeIndex(cached)
        }
      }
    } catch (e) {
      console.error(e)
      uiStore.connectionStatus = hasCache ? 'online' : 'error'
      if (hasCache && cached) {
        historyList.value = cached
        rebuildBookingTimeIndex(cached)
      }
      if (hasCache && !silent) uiStore.showToast('Đang dùng dữ liệu offline', 'info')
    }
  }

  async function updateOfflineQueueCount() {
    try {
      const pendingOutbox = await getPendingItems()
      offlineQueueCount.value = pendingOutbox.length
    } catch (e) {
      console.warn('Failed to read outbox queue:', e)
    }
  }

  function saveConflicts() {
    localStorage.setItem('kg_sync_conflicts', JSON.stringify(activeConflicts.value))
  }

  async function saveOrder(payload: any) {
    try {
      const res = await orderRepo.saveOrder(payload)
      if (res.ok) {
        await loadHistory(true)
      }
      return res
    } catch (e: any) {
      return { ok: false, message: e.message }
    }
  }

  async function deleteOrder(id: string, staffName?: string, staffPhone?: string) {
    try {
      const res = await orderRepo.deleteOrder(id, staffName, staffPhone)
      if (res.ok) {
        removeOrderFromTimeIndex(id)
        historyList.value = historyList.value.filter(h => h.id !== id)
        cacheHistory(historyList.value)
      }
      return res
    } catch (e: any) {
      return { ok: false, message: e.message }
    }
  }

  async function syncBookingCalendar(id?: string) {
    if (id) {
      return await orderRepo.syncBookingCalendar(id)
    }
    await loadHistory(false)
    return { ok: true }
  }

  async function resolveConflict(localId: string, resolution: BookingConflict['resolution']) {
    if (resolution === 'keep_local') {
      const conflict = activeConflicts.value.find(c => c.localBookingId === localId)
      if (conflict) {
        const targetVersion = (conflict.serverSnapshot?.version ?? 0) + 1
        const payload = conflict.localSnapshot
        payload.version = targetVersion
        payload.baseServerVersion = conflict.serverSnapshot?.version ?? 0
        
        uiStore.loading.is = true
        uiStore.loading.msg = 'ĐANG ĐỒNG BỘ ĐÈ...'
        try {
          const res = await orderRepo.saveOrder(payload)
          if (res?.ok) {
            const queue = await getOfflineQueue()
            const queueItem = queue.find(q => q.payload.id === localId)
            if (queueItem) {
              await removeFromQueue(queueItem.id)
            }
            try {
              const { markAsSynced } = await import('@/infrastructure/outbox/outbox')
              await markAsSynced(localId, 'upsert')
            } catch (err) {
              console.warn('Failed to mark outbox item as synced:', err)
            }

            activeConflicts.value = activeConflicts.value.filter(c => c.localBookingId !== localId)
            saveConflicts()
            await updateOfflineQueueCount()
            await loadHistory(true)
            uiStore.showToast('Ghi đè cloud thành công!', 'success')
          }
        } catch (e: any) {
          uiStore.showToast('Lỗi ghi đè: ' + e.message, 'error')
        } finally {
          uiStore.loading.is = false
        }
      }
    } else if (resolution === 'keep_server' || resolution === 'cancel_local') {
      const queue = await getOfflineQueue()
      const queueItem = queue.find(q => q.payload.id === localId)
      if (queueItem) {
        await removeFromQueue(queueItem.id)
      }
      try {
        const { markAsSynced } = await import('@/infrastructure/outbox/outbox')
        await markAsSynced(localId, 'upsert')
      } catch (err) {
        console.warn('Failed to drop outbox item:', err)
      }
      
      activeConflicts.value = activeConflicts.value.filter(c => c.localBookingId !== localId)
      saveConflicts()
      await updateOfflineQueueCount()
      uiStore.showToast('Đã loại bỏ đơn offline.', 'info')
    }
  }

  return {
    historyList,
    groupedHistory,
    filteredHistory,
    activeConflicts,
    offlineQueueCount,
    getCrmStatus,
    computeDiff,
    setOptimisticOrder,
    markOrderSynced,
    markOrderFailed,
    loadHistory,
    saveOrder,
    deleteOrder,
    syncBookingCalendar,
    saveConflicts,
    resolveConflict,
    updateOfflineQueueCount
  }
})
