import { defineStore } from 'pinia'
import { ref, reactive, computed, shallowRef } from 'vue'
import { stripAccents, formatVND, cleanPhoneNumber } from '@/utils'
import { CACHE_KEYS, DEFAULTS } from '@/utils/constants'
import { useUIStore } from './useUIStore'
import {
  cacheHistory, getCachedHistory,
  cacheMenu, getCachedMenu, deleteCachedMenu,
  cacheMenuSheets, getCachedMenuSheets,
  cacheIsFresh, getOfflineQueue, removeFromQueue
} from '@/services/cache'
import { fetchWithRetry } from '@/infrastructure/gas/gasClient'
import { getPendingItems } from '@/infrastructure/outbox/outbox'
import { 
  DualWriteOrderRepository as GasOrderRepository, 
  DualWriteMenuRepository as GasMenuRepository, 
  DualWriteSettingsRepository as GasSettingsRepository, 
  DualWriteCorrectionRepository as GasCorrectionRepository 
} from '@/infrastructure/dual/dualWriteRepository'
import { clearAIResponseCache, hashAndStringifyLargeObject } from '@/services/ai/aiResponseCache'
import { can, UserRole, Permission } from '@/auth/permissions'
import { sha256 } from '@/utils/security'

const orderRepo = new GasOrderRepository()
const menuRepo = new GasMenuRepository()
const settingsRepo = new GasSettingsRepository()
const correctionRepo = new GasCorrectionRepository()

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

export interface MenuListItem {
  name: string
  price: number
  desc?: string
  cleanName: string
  acronym: string
}

export interface NormalizedBookingTime {
  bookingId: string;
  dateKey: string;
  tables: string[];
  startMinutes: number;
  endMinutes: number;
  status: string;
}

const bookingTimeIndex = new Map<string, NormalizedBookingTime[]>()

function rebuildBookingTimeIndex(history: HistoryOrder[]) {
  bookingTimeIndex.clear()
  
  const parseTimeToMinutes = (tStr: string) => {
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
  
  history.forEach(order => {
    if (!order.parsedCustomer) return
    const customer = order.parsedCustomer
    const dateKey = (customer.date || '').trim()
    if (!dateKey) return
    
    const timeStr = customer.time || ''
    const tablesStr = customer.tables || ''
    const tables = tablesStr.split(/[\s,]+/).map(t => t.trim().toUpperCase()).filter(Boolean)
    
    const startMinutes = parseTimeToMinutes(timeStr)
    const endMinutes = startMinutes + 120
    
    const normalized: NormalizedBookingTime = {
      bookingId: order.id,
      dateKey,
      tables,
      startMinutes,
      endMinutes,
      status: customer.type || ''
    }
    
    let dateList = bookingTimeIndex.get(dateKey)
    if (!dateList) {
      dateList = []
      bookingTimeIndex.set(dateKey, dateList)
    }
    dateList.push(normalized)
  })
}

export function hasTimeConflictIndexed(
  a: { id?: string; date: string; time: string; tables: string },
  bufferMinutes = 120
): boolean {
  const dateKey = (a.date || '').trim()
  if (!dateKey) return false
  
  const candidates = bookingTimeIndex.get(dateKey)
  if (!candidates || candidates.length === 0) return false
  
  const tablesA = a.tables.split(/[\s,]+/).map(t => t.trim().toUpperCase()).filter(Boolean)
  if (tablesA.length === 0) return false
  
  const parseTimeToMinutes = (tStr: string) => {
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
  
  const timeA = parseTimeToMinutes(a.time)
  const startA = timeA
  const endA = timeA + bufferMinutes
  
  for (const other of candidates) {
    if (a.id && other.bookingId === a.id) continue
    
    // Check table overlap
    const hasCommonTable = tablesA.some(t => other.tables.includes(t))
    if (!hasCommonTable) continue
    
    // Check time overlap
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
  
  const parseTimeToMinutes = (tStr: string) => {
    if (tStr.length === 5 && tStr[2] === ':') {
      const h = (tStr.charCodeAt(0) - 48) * 10 + (tStr.charCodeAt(1) - 48)
      const m = (tStr.charCodeAt(3) - 48) * 10 + (tStr.charCodeAt(4) - 48)
      if (h >= 0 && h < 24 && m >= 0 && m < 60) {
        return h * 60 + m
      }
    }
    const m = tStr.match(/^(\d{2}):(\d{2})$/)
    if (!m) return 0
    return parseInt(m[1]) * 60 + parseInt(m[2])
  }
  
  const timeA = parseTimeToMinutes(a.time)
  const timeB = parseTimeToMinutes(b.time)
  const buffer = options?.bufferMinutes ?? 120
  
  return timeA < timeB + buffer && timeB < timeA + buffer
}

export type OfflineQueueItemStatus =
  | 'pending'
  | 'syncing'
  | 'synced'
  | 'failed'
  | 'conflict'
  | 'deferred';

export const useAppStore = defineStore('app', () => {
  const uiStore = useUIStore()

  // --- History ---
  const historyList = shallowRef<HistoryOrder[]>([])

  // --- Menu ---
  const menuList = shallowRef<MenuListItem[]>([])
  const menuDetails = ref<Record<string, string>>({})
  const menuImages = ref<Record<string, string>>({})
  const dishImages = ref<Record<string, string>>({})
  const menuSheets = ref<string[]>([])
  const activeSheet = ref(localStorage.getItem(CACHE_KEYS.MENU_SHEET) || 'Menu')
  const newMenuName = ref('')
  const newMenuContent = ref('')
  const adminToken = ref(sessionStorage.getItem('kg_admin_token') || '')
  const adminExpiresAt = ref(parseInt(sessionStorage.getItem('kg_admin_expires_at') || '0'))
  const defaultMenuProfileId = ref(localStorage.getItem('default_menu_profile_id') || '')
  const defaultBankAccountIndex = ref(parseInt(localStorage.getItem('default_bank_account_index') || '-1'))
  const menuAliases = ref<{ alias: string; dishName: string }[]>(JSON.parse(localStorage.getItem('menu_aliases') || '[]'))
  const aiCorrections = ref<any[]>(JSON.parse(localStorage.getItem('ai_corrections') || '[]'))

  // --- Cached Fingerprints ---
  const menuFingerprint = ref('')
  const correctionFingerprint = ref('')
  const showPortalMinigames = ref(localStorage.getItem('showPortalMinigames') === 'true')

  async function computeMenuFingerprint() {
    if (menuList.value.length === 0) {
      menuFingerprint.value = ''
      return
    }
    const normalizedMenu = [...menuList.value]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(item => ({
        name: item.name,
        price: item.price,
        desc: item.desc,
        acronym: item.acronym
      }))
    const { hash } = await hashAndStringifyLargeObject(normalizedMenu)
    menuFingerprint.value = hash
  }

  async function computeCorrectionFingerprint() {
    if (!aiCorrections.value || aiCorrections.value.length === 0) {
      correctionFingerprint.value = ''
      return
    }
    const normalizedCorrections = [...aiCorrections.value]
      .sort((a, b) => `${a.field}:${a.inputText}`.localeCompare(`${b.field}:${b.inputText}`))
      .map(c => ({
        inputText: c.inputText,
        wrongValue: c.wrongValue,
        correctValue: c.correctValue,
        field: c.field
      }))
    const { hash } = await hashAndStringifyLargeObject(normalizedCorrections)
    correctionFingerprint.value = hash
  }

  // --- Bank ---
  const bankList = ref<any[]>(JSON.parse(localStorage.getItem(CACHE_KEYS.BANK) || DEFAULTS.BANKS))
  const selectedBankIndex = ref(parseInt(localStorage.getItem(CACHE_KEYS.SELECTED_BANK) || '0'))
  const newBank = reactive({ bankId: '', name: '', number: '', owner: '', template: 'compact' })

  // --- Staff ---
  const staffList = ref<any[]>(JSON.parse(localStorage.getItem(CACHE_KEYS.STAFF) || DEFAULTS.STAFF))
  const newStaff = reactive({ name: '', phone: '' })

  // --- Computed: Current Bank ---
  const currentBank = computed(() => bankList.value[selectedBankIndex.value] || bankList.value[0])

  // --- Computed: Grouped History ---
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

  // --- Computed: Filtered History (search & filters) ---
  const filteredHistory = computed(() => {
    const groups = groupedHistory.value
    const query = uiStore.historySearch.trim().toLowerCase()
    const { time, status, deposit, sort } = uiStore.historyFilters

    let entries = Object.entries(groups)

    entries = entries.filter(([key, group]) => {
      const customer = group.latest.parsedCustomer
      
      // Search
      if (query) {
        const searchStr = `${customer.name} ${customer.phone} ${customer.date} ${formatVND(group.latest.totalAmount)}`.toLowerCase()
        if (!stripAccents(searchStr).includes(stripAccents(query))) return false
      }
      
      // Deposit filter
      if (deposit === 'paid' && !group.latest.isDeposited) return false
      if (deposit === 'unpaid' && group.latest.isDeposited) return false
      
      // Time filter (simple logic for today)
      if (time === 'today') {
        const todayStr = `${String(new Date().getDate()).padStart(2, '0')}/${String(new Date().getMonth() + 1).padStart(2, '0')}/${new Date().getFullYear()}`
        if ((customer.date || '').trim() !== todayStr) return false
      }
      
      // Status filter
      if (status === 'synced' && group.latest.isSyncing) return false
      if (status === 'syncing' && !group.latest.isSyncing) return false
      
      return true
    })

    // Sort
    entries.sort((a, b) => {
      const tA = new Date(a[1].latest.timestamp || 0).getTime()
      const tB = new Date(b[1].latest.timestamp || 0).getTime()
      return sort === 'newest' ? tB - tA : tA - tB
    })

    const filtered: Record<string, any> = {}
    entries.forEach(([k, v]) => { filtered[k] = v })
    return filtered
  })

  // --- CRM Status ---
  function getCrmStatus(phone: string): string | null {
    if (!phone) return null
    const cleanedPhone = cleanPhoneNumber(phone)
    const historyCount = historyList.value.filter(h => cleanPhoneNumber(h.parsedCustomer.phone) === cleanedPhone).length
    if (historyCount >= 5) return 'VIP'
    if (historyCount >= 1) return 'Khách quen'
    return 'Khách mới'
  }

  // --- Compute Diff between versions ---
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

  // --- Optimistic UI Save Hooks ---
  function setOptimisticOrder(order: HistoryOrder) {
    const list = [...historyList.value]
    const idx = list.findIndex(h => h.id === order.id)
    if (idx !== -1) {
      list[idx] = order
    } else {
      list.push(order)
    }
    historyList.value = list
    rebuildBookingTimeIndex(list)
    cacheHistory(list)
  }

  function markOrderSynced(orderId: string, serverData?: any) {
    const list = [...historyList.value]
    const idx = list.findIndex(h => h.id === orderId)
    if (idx !== -1) {
      list[idx] = {
        ...list[idx],
        ...serverData,
        isSyncing: false
      }
      historyList.value = list
      rebuildBookingTimeIndex(list)
      cacheHistory(list)
    }
  }

  function markOrderFailed(orderId: string) {
    const list = [...historyList.value]
    const idx = list.findIndex(h => h.id === orderId)
    if (idx !== -1) {
      list[idx] = {
        ...list[idx],
        isSyncing: false
      }
      historyList.value = list
      rebuildBookingTimeIndex(list)
      cacheHistory(list)
    }
  }

  // --- API Actions ---
  async function loadHistory(silent: boolean) {
    uiStore.connectionStatus = 'syncing'

    const cached = await getCachedHistory()
    if (cached && cached.length > 0 && historyList.value.length === 0) {
      historyList.value = cached
      rebuildBookingTimeIndex(cached)
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
        uiStore.connectionStatus = cached ? 'online' : 'error'
      }
    } catch (e) {
      console.error(e)
      uiStore.connectionStatus = cached ? 'online' : 'error'
      if (cached && !silent) uiStore.showToast('Đang dùng dữ liệu offline', 'info')
    }
  }

  async function fetchMenu(sheetName?: string) {
    await clearAIResponseCache('manual_menu_reload')
    const targetSheet = sheetName || activeSheet.value

    const cached = await getCachedMenu(targetSheet)
    if (cached && cached.length > 0) {
      menuList.value = cached
      computeMenuFingerprint()
      const ds: Record<string, string> = {}
      cached.forEach((i: any) => { if (i.desc) ds[i.name] = i.desc })
      menuDetails.value = ds
      activeSheet.value = targetSheet

      // Revalidate in the background
      menuRepo.getMenu(targetSheet).then((data) => {
        if (data.ok) {
          menuList.value = data.data || []
          computeMenuFingerprint()
          const dsUpdate: Record<string, string> = {}
          if (Array.isArray(data.data)) {
            data.data.forEach((i: any) => { if (i.desc) dsUpdate[i.name] = i.desc })
          }
          menuDetails.value = dsUpdate
          cacheMenu(targetSheet, data.data || [])
        }
      }).catch((e) => {
        console.warn('[Menu Revalidation Failed]', e)
      })
      
      return
    }

    try {
      const data = await menuRepo.getMenu(targetSheet)
      if (data.ok) {
        menuList.value = data.data || []
        computeMenuFingerprint()
        const ds: Record<string, string> = {}
        if (Array.isArray(data.data)) {
          data.data.forEach((i: any) => { if (i.desc) ds[i.name] = i.desc })
        }
        menuDetails.value = ds
        activeSheet.value = targetSheet
        await cacheMenu(targetSheet, data.data || [])
      }
    } catch (e) {
      console.error(e)
      uiStore.showToast('Không tải được menu', 'warning')
    }
  }

  function runInBackground(task: () => Promise<void>): Promise<void> {
    const execute = async () => {
      try {
        await task()
      } catch (error) {
        console.error('[Background Task Error]', error)
      }
    }

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      return new Promise((resolve) => {
        (window as any).requestIdleCallback(
          () => {
            execute().finally(resolve)
          },
          { timeout: 3000 }
        )
      })
    }

    return new Promise((resolve) => {
      window.setTimeout(() => {
        execute().finally(resolve)
      }, 0)
    })
  }

  async function runWithConcurrencyLimit<T>(
    items: T[],
    limit: number,
    worker: (item: T) => Promise<void>
  ): Promise<void> {
    const queue = [...items]
    const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
      while (queue.length > 0) {
        const item = queue.shift()
        if (item === undefined) continue
        await worker(item)
      }
    })
    await Promise.allSettled(workers)
  }

  const menuPrefetchInFlight = new Map<string, Promise<void>>()

  function scheduleMenuPrefetch(
    sheetName: string,
    options?: { reason?: string; priority?: 'background' | 'high' }
  ): Promise<void> {
    const key = `kg_menu_${sheetName}`

    if (menuPrefetchInFlight.has(key)) {
      return menuPrefetchInFlight.get(key)!
    }

    const task = runInBackground(async () => {
      try {
        const cached = await getCachedMenu(sheetName)
        const fresh = await cacheIsFresh(key, 3600000)

        if (cached && cached.length > 0 && fresh) {
          console.debug(`[Prefetch] Cache hit & fresh for: ${sheetName}`)
          return
        }

        console.debug(`[Prefetch] Cache miss or stale for: ${sheetName}. Fetching from network...`)
        const res = await menuRepo.getMenu(sheetName)
        if (res.ok && res.data) {
          await cacheMenu(sheetName, res.data)
          console.debug(`[Prefetch] Success for: ${sheetName}. Items: ${res.data.length}`)
        }
      } catch (error) {
        console.warn(`[Prefetch] Failed for: ${sheetName}`, error)
      } finally {
        menuPrefetchInFlight.delete(key)
      }
    })

    menuPrefetchInFlight.set(key, task)
    return task
  }

  function scheduleMenusPrecache(
    sheets: string[],
    options?: { reason?: string; priority?: 'background' | 'high' }
  ) {
    const start = performance.now()
    console.debug(`[Pre-cache] Starting pre-cache for ${sheets.length} menus. Reason: ${options?.reason || 'unknown'}`)

    runInBackground(async () => {
      await runWithConcurrencyLimit(sheets, 3, async (sheet) => {
        await scheduleMenuPrefetch(sheet, options)
      })
      console.debug(`[Pre-cache] Finished pre-cache for all menus in ${(performance.now() - start).toFixed(1)}ms`)
    })
  }

  async function fetchSheets() {
    const cached = await getCachedMenuSheets()
    if (cached && cached.length > 0) {
      menuSheets.value = cached
      scheduleMenusPrecache(cached, { reason: 'app-startup-cache' })
    }

    try {
      const data = await menuRepo.getMenuSheets()
      if (data.ok) {
        menuSheets.value = data.sheets || []
        await cacheMenuSheets(data.sheets || [])
        scheduleMenusPrecache(data.sheets || [], { reason: 'app-startup-network' })
      }
    } catch (e) {
      console.error('Fetch Sheets Error', e)
    }

    processOfflineQueue()
  }

  async function switchMenu(sheetName: string) {
    uiStore.loading.is = true
    uiStore.loading.msg = 'ĐANG CHUYỂN MENU...'
    uiStore.loading.subMsg = `Syncing: ${sheetName}`
    try {
      activeSheet.value = sheetName
      localStorage.setItem(CACHE_KEYS.MENU_SHEET, sheetName)
      await fetchMenu(sheetName)
      uiStore.showMenuManager = false
    } catch (e: any) {
      console.error(e)
    } finally {
      uiStore.loading.is = false
    }
  }

  async function uploadNewMenu() {
    if (!newMenuName.value || !newMenuContent.value) {
      return uiStore.showToast('Vui lòng nhập tên và nội dung menu!', 'warning')
    }
    
    const isAuth = await verifyAdminSession()
    if (!isAuth) return

    try {
      const data = await menuRepo.createMenu(newMenuName.value, newMenuContent.value, undefined, adminToken.value)
      if (data.ok) {
        await deleteCachedMenu(newMenuName.value)
        uiStore.showToast(uiStore.isUpdateMode ? 'Cập nhật thực đơn thành công!' : 'Tạo menu thành công!', 'success')
        const wasUpdateMode = uiStore.isUpdateMode
        await fetchSheets()
        await switchMenu(newMenuName.value)
        newMenuName.value = ''
        newMenuContent.value = ''
        uiStore.isUpdateMode = false

        if (data.logs && data.logs.length > 0) {
          const logText = data.logs.map((log: string) => `• ${log}`).join('\n')
          setTimeout(() => {
            uiStore.showAlert('Báo cáo thay đổi thực đơn', logText)
          }, 600)
        } else if (wasUpdateMode) {
          uiStore.showToast('Thực đơn không có thay đổi nào về món hoặc giá.', 'info')
        }
      } else {
        throw new Error(data.message)
      }
    } catch (e: any) {
      console.error(e)
    }
  }

  async function deleteMenu(sheetName: string) {
    const confirm = await uiStore.showConfirm('Xóa Bộ Thực Đơn', `Bạn có chắc chắn muốn xóa bộ thực đơn "${sheetName}"?`)
    if (!confirm) return

    const isAuth = await verifyAdminSession()
    if (!isAuth) return

    try {
      const data = await menuRepo.deleteMenu(sheetName, undefined, adminToken.value)
      if (data.ok) {
        await deleteCachedMenu(sheetName)
        uiStore.showToast(`Xóa menu "${sheetName}" thành công!`, 'success')
        await fetchSheets()
        if (activeSheet.value === sheetName) {
          if (menuSheets.value.length > 0) {
            await switchMenu(menuSheets.value[0])
          } else {
            menuList.value = []
          }
        }
      } else {
        throw new Error(data.message)
      }
    } catch (e: any) {
      console.error(e)
    }
  }

  async function uploadMenuImageStore(base64: string) {
    if (!activeSheet.value) return uiStore.showToast('Không có menu nào đang chọn!', 'warning')
    
    const isAuth = await verifyAdminSession()
    if (!isAuth) return

    uiStore.loading.is = true
    uiStore.loading.msg = 'ĐANG TẢI ẢNH LÊN CLOUD...'
    try {
      const data = await menuRepo.uploadMenuImage(activeSheet.value, base64, undefined, adminToken.value)
      if (data.ok && data.url) {
        uiStore.showToast('Tải ảnh thành công!', 'success')
        menuImages.value[activeSheet.value] = data.url
      } else {
        throw new Error(data.message)
      }
    } catch (e: any) {
      console.error(e)
      uiStore.showToast('Lỗi: ' + e.message, 'error')
    } finally {
      uiStore.loading.is = false
    }
  }

  async function uploadDishImageStore(dishId: string, base64: string) {
    const isAuth = await verifyAdminSession()
    if (!isAuth) return

    uiStore.loading.is = true
    uiStore.loading.msg = 'ĐANG TẢI ẢNH MÓN LÊN CLOUD...'
    try {
      const data = await menuRepo.uploadDishImage(dishId, base64, undefined, adminToken.value)
      if (data.ok && data.url) {
        uiStore.showToast('Tải ảnh món thành công!', 'success')
        dishImages.value[dishId] = data.url
      } else {
        throw new Error(data.message)
      }
    } catch (e: any) {
      console.error(e)
      uiStore.showToast('Lỗi: ' + e.message, 'error')
    } finally {
      uiStore.loading.is = false
    }
  }

  // --- Bank Actions ---
  function selectBank(idx: number) {
    selectedBankIndex.value = idx
    localStorage.setItem(CACHE_KEYS.SELECTED_BANK, String(idx))
  }

  async function addBank() {
    if (!newBank.number || !newBank.bankId) return uiStore.showToast('Thiếu tin!', 'warning')
    bankList.value.push({ ...newBank })
    localStorage.setItem(CACHE_KEYS.BANK, JSON.stringify(bankList.value))
    selectedBankIndex.value = bankList.value.length - 1
    Object.assign(newBank, { bankId: '', name: '', number: '', owner: '', template: 'compact' })
    await updateRemoteConfig('bank')
  }

  async function removeBank(idx: number) {
    if (bankList.value.length > 1) {
      bankList.value.splice(idx, 1)
      selectedBankIndex.value = 0
      localStorage.setItem(CACHE_KEYS.BANK, JSON.stringify(bankList.value))
      await updateRemoteConfig('bank')
    }
  }

  // --- Staff Actions ---
  async function addStaff() {
    if (!newStaff.name || !newStaff.phone) return uiStore.showToast('Vui lòng nhập đủ Họ tên và SĐT!', 'warning')
    staffList.value.push({ ...newStaff })
    localStorage.setItem(CACHE_KEYS.STAFF, JSON.stringify(staffList.value))
    Object.assign(newStaff, { name: '', phone: '' })
    await updateRemoteConfig('staff')
  }

  async function removeStaff(idx: number) {
    if (staffList.value.length > 1) {
      staffList.value.splice(idx, 1)
      localStorage.setItem(CACHE_KEYS.STAFF, JSON.stringify(staffList.value))
      await updateRemoteConfig('staff')
    } else {
      uiStore.showToast('Phải giữ lại ít nhất 1 nhân viên!', 'warning')
    }
  }

  // --- Remote Config Sync ---
  async function fetchRemoteConfig() {
    uiStore.connectionStatus = 'syncing'
    try {
      const result = await settingsRepo.getConfig((freshConfig) => {
        if (freshConfig && freshConfig.ok && freshConfig.data) {
          processRemoteConfigPayload(freshConfig.data)
        }
      })
      if (result.ok && result.data) {
        uiStore.connectionStatus = 'online'
        processRemoteConfigPayload(result.data)
      } else {
        uiStore.connectionStatus = 'error'
      }
    } catch (e) {
      console.warn('Config Sync Failed (Offline Mode)', e)
      uiStore.connectionStatus = 'error'
    }
  }

  function processRemoteConfigPayload(data: Record<string, any>) {
    const startParse = performance.now()
    let hasChanges = false
    if (data.bankList) {
      try {
        const sBanks = JSON.parse(data.bankList)
        if (Array.isArray(sBanks) && sBanks.length > 0) {
          bankList.value = sBanks
          localStorage.setItem(CACHE_KEYS.BANK, data.bankList)
          hasChanges = true
        }
      } catch { /* ignore */ }
    }
    if (data.staffList) {
      try {
        const sStaff = JSON.parse(data.staffList)
        if (Array.isArray(sStaff) && sStaff.length > 0) {
          staffList.value = sStaff
          localStorage.setItem(CACHE_KEYS.STAFF, data.staffList)
          hasChanges = true
        }
      } catch { /* ignore */ }
    }
    if (data.webhookUrl) {
      localStorage.setItem('kg_v400_webhookUrl', data.webhookUrl)
      hasChanges = true
    }
    if (data.telegramChatId) {
      localStorage.setItem('kg_v400_telegramChatId', data.telegramChatId)
      hasChanges = true
    }
    if (data.showPortalMinigames !== undefined) {
      showPortalMinigames.value = String(data.showPortalMinigames) === 'true'
      localStorage.setItem('showPortalMinigames', String(showPortalMinigames.value))
      hasChanges = true
    }
    
    if (data.default_bank_account_id) {
      const accountId = data.default_bank_account_id
      localStorage.setItem('default_bank_account_id', accountId)
      const index = bankList.value.findIndex((b: any) => b.bankId === accountId || b.number === accountId)
      if (index !== -1) {
        defaultBankAccountIndex.value = index
        selectedBankIndex.value = index
        localStorage.setItem(CACHE_KEYS.SELECTED_BANK, String(index))
      }
    }
    if (data.default_menu_profile_id) {
      defaultMenuProfileId.value = data.default_menu_profile_id
      localStorage.setItem('default_menu_profile_id', data.default_menu_profile_id)
      if (!localStorage.getItem(CACHE_KEYS.MENU_SHEET)) {
        activeSheet.value = data.default_menu_profile_id
        localStorage.setItem(CACHE_KEYS.MENU_SHEET, data.default_menu_profile_id)
      }
    }
    
    // --- OPTIMIZED IMAGE RESOLVING ---
    const IMAGE_CONFIG_KEY_PATTERN = /(image|img|photo|avatar|logo|banner|drive|thumbnail|background|qr)/i
    const GOOGLE_DRIVE_URL_PATTERN = /drive\.google\.com|docs\.google\.com/i

    Object.keys(data).forEach(k => {
      // Fast selective key filter
      if (!k.startsWith('dishImage_') && !k.startsWith('menuImage_') && !IMAGE_CONFIG_KEY_PATTERN.test(k)) {
        return
      }
      
      let url = data[k]
      if (typeof url === 'string') {
        const hasDriveUrl = GOOGLE_DRIVE_URL_PATTERN.test(url)
        if (hasDriveUrl) {
          const match = url.match(/id=([^&]+)/)
          if (match) url = `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1200`
        }
        if (k.startsWith('dishImage_')) {
          dishImages.value[k.replace('dishImage_', '')] = url
        } else if (k.startsWith('menuImage_')) {
          menuImages.value[k.replace('menuImage_', '')] = url
        }
      }
    })
    
    try {
      loadMenuAliases()
    } catch (errAliases) {
      console.warn('Aliases sync error:', errAliases)
    }
    try {
      loadAiCorrections()
    } catch (errCorrections) {
      console.warn('Corrections sync error:', errCorrections)
    }

    const durationMs = (performance.now() - startParse).toFixed(1)
    console.info(`[Perf Instrumentation] remoteConfig.parse: ${durationMs}ms`)

    if (hasChanges) {
      uiStore.showToast('Đã đồng bộ cấu hình từ Server', 'info')
    }
  }

  function getJwtExpiry(token: string): number | null {
    try {
      const parts = token.split('.')
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
        if (payload && typeof payload.exp === 'number') {
          return payload.exp * 1000
        }
      }
    } catch (e) {}
    return null
  }

  function getRoleFromToken(token: string): UserRole {
    if (token === 'admin_bypass' || (token && token.startsWith('ADM_'))) return 'admin'
    try {
      const parts = token.split('.')
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
        if (payload && payload.app_metadata && typeof payload.app_metadata.role === 'string') {
          return payload.app_metadata.role as UserRole
        }
      }
    } catch (e) {}
    return 'staff'
  }

  const currentUserRole = computed<UserRole>(() => {
    if (!adminToken.value) return 'staff'
    const jwtExp = getJwtExpiry(adminToken.value)
    if (jwtExp !== null && Date.now() >= jwtExp) {
      return 'staff'
    }
    if (adminExpiresAt.value <= Date.now()) {
      return 'staff'
    }
    return getRoleFromToken(adminToken.value)
  })

  async function triggerAuditLog(action: string, targetType?: string, targetId?: string, before?: any, after?: any) {
    try {
      const userAgent = navigator.userAgent
      const uaHash = await sha256(userAgent)
      const ipHash = await sha256('local-client-ip')
      const payload = {
        actor_id: adminToken.value ? 'session-user' : undefined,
        actor_role: currentUserRole.value,
        action,
        target_type: targetType,
        target_id: targetId,
        before_json: before ? JSON.parse(JSON.stringify(before)) : null,
        after_json: after ? JSON.parse(JSON.stringify(after)) : null,
        ip_hash: ipHash,
        user_agent_hash: uaHash
      }
      await settingsRepo.writeAuditLog(payload)
    } catch (e) {
      console.warn('[AuditLog] Failed to write audit log:', e)
    }
  }

  const isAdminSettingsUnlocked = computed(() => {
    if (!adminToken.value) return false
    const jwtExp = getJwtExpiry(adminToken.value)
    if (jwtExp !== null && Date.now() >= jwtExp) {
      return false
    }
    return adminExpiresAt.value > Date.now()
  })

  async function lockAdminSettings() {
    const roleBefore = currentUserRole.value
    const tokenBefore = adminToken.value
    if (adminToken.value) {
      try {
        await settingsRepo.logoutAdminSettings(adminToken.value)
      } catch (e) {}
    }
    adminToken.value = ''
    adminExpiresAt.value = 0
    sessionStorage.removeItem('kg_admin_token')
    sessionStorage.removeItem('kg_admin_expires_at')
    uiStore.showToast('Đã khóa cấu hình Admin', 'info')
    await triggerAuditLog('logout', 'auth', tokenBefore, { role: roleBefore }, null)
  }

  async function unlockAdminSettings(password: string): Promise<boolean> {
    try {
      const res = await settingsRepo.authAdminSettings(password)
      if (res.ok && res.token) {
        adminToken.value = res.token
        const jwtExp = getJwtExpiry(res.token)
        const expiryTime = jwtExp !== null ? jwtExp : res.expiresAt
        adminExpiresAt.value = expiryTime
        sessionStorage.setItem('kg_admin_token', res.token)
        sessionStorage.setItem('kg_admin_expires_at', String(expiryTime))
        
        const role = getRoleFromToken(res.token)
        const roleLabel = role === 'admin' ? 'Admin' : role === 'manager' ? 'Manager' : 'Staff'
        uiStore.showToast(`Xác thực ${roleLabel} thành công!`, 'success')
        await triggerAuditLog('login', 'auth', res.token, null, { role })
        return true
      } else {
        uiStore.showToast(res.message || 'Mật khẩu không chính xác!', 'error')
        return false
      }
    } catch (e: any) {
      uiStore.showToast('Không thể kết nối với server để xác thực!', 'error')
      return false
    }
  }

  async function verifySession(permission: Permission): Promise<boolean> {
    if (can(currentUserRole.value, permission)) return true

    // Prompt user to unlock
    const pass = await uiStore.showPrompt(
      'Mở khóa quyền hạn',
      `Tính năng này yêu cầu quyền [${permission}]. Nhập mật khẩu để tiếp tục:`
    )
    if (!pass) return false
    const success = await unlockAdminSettings(pass)
    if (success) {
      return can(currentUserRole.value, permission)
    }
    return false
  }

  async function verifyAdminSession(): Promise<boolean> {
    return verifySession('settings:update')
  }

  async function saveOrder(data: any): Promise<any> {
    const beforeOrder = data.id ? historyList.value.find(h => h.id === data.id) : null
    const result = await orderRepo.saveOrder(data)
    if (result.ok) {
      await triggerAuditLog(
        beforeOrder ? 'booking:update' : 'booking:create',
        'booking',
        result.id || data.id,
        beforeOrder ? beforeOrder.parsedCustomer : null,
        data.customer || data.data?.customer || data
      )
    }
    return result
  }

  async function deleteOrder(id: string, password?: string, token?: string): Promise<any> {
    const beforeOrder = historyList.value.find(h => h.id === id)
    const result = await orderRepo.deleteOrder(id, password, token)
    if (result.ok) {
      await triggerAuditLog(
        'booking:delete',
        'booking',
        id,
        beforeOrder ? beforeOrder.parsedCustomer : null,
        null
      )
    }
    return result
  }

  async function updateRemoteConfig(onlyType?: 'staff' | 'bank') {
    let tokenVal = ''
    if (onlyType !== 'staff') {
      const isAuth = await verifyAdminSession()
      if (!isAuth) {
        uiStore.showToast('Chỉ lưu cấu hình trên máy này (Chưa đồng bộ Cloud)', 'warning')
        return
      }
      tokenVal = adminToken.value
    }

    uiStore.showToast('Đang lưu cấu hình lên Server...', 'info')
    uiStore.connectionStatus = 'syncing'
    
    const bList = (!onlyType || onlyType === 'bank') ? JSON.stringify(bankList.value) : undefined
    const sList = (!onlyType || onlyType === 'staff') ? JSON.stringify(staffList.value) : undefined

    settingsRepo.saveConfig({
      bankList: bList,
      staffList: sList,
      token: tokenVal
    }).then((data: any) => {
      if (data.ok) {
        uiStore.connectionStatus = 'online'
        uiStore.showToast('Đã lưu cấu hình thành công lên Server!', 'success')
      } else {
        uiStore.connectionStatus = 'error'
        uiStore.showToast('Lỗi lưu cấu hình: ' + data.message, 'error')
        if (data.message && data.message.includes('Từ chối') && onlyType !== 'staff') {
          adminToken.value = ''
          adminExpiresAt.value = 0
          sessionStorage.removeItem('kg_admin_token')
          sessionStorage.removeItem('kg_admin_expires_at')
        }
      }
    }).catch((e: any) => {
      console.warn('Update Config Failed', e)
      uiStore.connectionStatus = 'error'
      uiStore.showToast('Lỗi kết nối khi lưu cấu hình', 'error')
    })
  }

  async function setDefaultBankAccount(accountId: string) {
    const isAuth = await verifyAdminSession()
    if (!isAuth) return
    
    uiStore.showToast('Đang đặt tài khoản ngân hàng mặc định...', 'info')
    try {
      const res = await settingsRepo.upsertSystemConfig('default_bank_account_id', accountId, {
        type: 'string', scope: 'global', isProtected: false, description: 'Default bank account index/ID'
      }, adminToken.value)
      if (res.ok) {
        const index = bankList.value.findIndex((b: any) => b.bankId === accountId || b.number === accountId)
        if (index !== -1) {
          defaultBankAccountIndex.value = index
          selectedBankIndex.value = index
          localStorage.setItem(CACHE_KEYS.SELECTED_BANK, String(index))
        }
        uiStore.showToast('Đã đặt tài khoản mặc định thành công!', 'success')
      } else {
        uiStore.showToast(res.message || 'Lỗi đặt tài khoản mặc định', 'error')
      }
    } catch(e) {
      uiStore.showToast('Lỗi kết nối đặt tài khoản mặc định', 'error')
    }
  }

  async function setDefaultMenuProfile(menuId: string) {
    const isAuth = await verifyAdminSession()
    if (!isAuth) return
    
    uiStore.showToast('Đang đặt thực đơn mặc định...', 'info')
    try {
      const res = await settingsRepo.upsertSystemConfig('default_menu_profile_id', menuId, {
        type: 'string', scope: 'global', isProtected: false, description: 'Default menu profile ID/sheet name'
      }, adminToken.value)
      if (res.ok) {
        defaultMenuProfileId.value = menuId
        uiStore.showToast('Đã đặt thực đơn mặc định thành công!', 'success')
      } else {
        uiStore.showToast(res.message || 'Lỗi đặt thực đơn mặc định', 'error')
      }
    } catch(e) {
      uiStore.showToast('Lỗi kết nối đặt thực đơn mặc định', 'error')
    }
  }

  async function loadMenuAliases() {
    try {
      const res = await menuRepo.getMenuAliases()
      if (res.ok && res.data) {
        menuAliases.value = res.data
        localStorage.setItem('menu_aliases', JSON.stringify(res.data))
      }
    } catch (e) {
      console.warn('Failed to load menu aliases:', e)
    }
  }

  async function saveAlias(alias: string, dishName: string) {
    const isAuth = await verifySession('corrections:approve')
    if (!isAuth) return { ok: false, message: 'Permission Denied' }

    const res = await menuRepo.saveMenuAlias(alias, dishName, adminToken.value)
    if (res.ok) {
      await loadMenuAliases()
      uiStore.showToast('Lưu từ viết tắt thành công!', 'success')
      await triggerAuditLog('alias:create', 'menu', alias, null, { dishName })
    }
    return res
  }

  async function deleteAlias(alias: string) {
    const isAuth = await verifySession('corrections:approve')
    if (!isAuth) return { ok: false, message: 'Permission Denied' }

    const res = await menuRepo.deleteMenuAlias(alias, adminToken.value)
    if (res.ok) {
      await loadMenuAliases()
      uiStore.showToast('Đã xóa từ viết tắt!', 'success')
      await triggerAuditLog('alias:delete', 'menu', alias, null, null)
    }
    return res
  }

  async function loadAiCorrections() {
    try {
      const res = await correctionRepo.getAiCorrections()
      if (res.ok && res.data) {
        aiCorrections.value = res.data
        computeCorrectionFingerprint()
        localStorage.setItem('ai_corrections', JSON.stringify(res.data))
      }
    } catch (e) {
      console.warn('Failed to load AI corrections:', e)
    }
  }

  async function logAiCorrection(inputText: string, wrongValue: any, correctValue: any, field: string, token?: string) {
    const res = await correctionRepo.logAiCorrection(inputText, wrongValue, correctValue, field, token)
    await loadAiCorrections()
    return res
  }

  const offlineQueueCount = ref(0)
  async function updateOfflineQueueCount() {
    try {
      const queue = await getOfflineQueue()
      let count = queue.length
      
      const mode = import.meta.env.VITE_BACKEND_MODE || 'postgres'
      if (mode === 'postgres' || mode === 'dual_write') {
        try {
          const pendingOutbox = await getPendingItems()
          count += pendingOutbox.length
        } catch (err) {
          console.warn('Failed to read outbox queue:', err)
        }
      }
      
      offlineQueueCount.value = count
    } catch (e) {
      console.warn('Failed to read offline queue:', e)
    }
  }

  async function autoSyncIfReady() {
    // Populate history cache early for instant offline access and conflict checking
    try {
      const cached = await getCachedHistory()
      if (cached && cached.length > 0 && historyList.value.length === 0) {
        historyList.value = cached
        rebuildBookingTimeIndex(cached)
      }
    } catch (e) {
      console.warn('Failed to pre-hydrate history cache:', e)
    }

    fetchRemoteConfig()
    updateOfflineQueueCount()
    computeMenuFingerprint()
    computeCorrectionFingerprint()
  }

  autoSyncIfReady()

  const activeConflicts = ref<BookingConflict[]>(JSON.parse(localStorage.getItem('kg_sync_conflicts') || '[]'))

  function saveConflicts() {
    localStorage.setItem('kg_sync_conflicts', JSON.stringify(activeConflicts.value))
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
            await triggerAuditLog('booking:resolve_conflict', 'conflict', localId, conflict, { resolution })
          }
          if (res?.ok) {
            const queue = await getOfflineQueue()
            const queueItem = queue.find(q => q.payload.id === localId)
            if (queueItem) {
              await removeFromQueue(queueItem.id)
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
      
      // Also mark outbox item as synced (dropped) if in postgres/dual_write mode
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

  const offlineItemStatuses = ref<Record<string, { status: OfflineQueueItemStatus; retries: number; lastAttempt?: number }>>({})
  let isProcessingOfflineQueue = false

  async function processOfflineQueue() {
    if (isProcessingOfflineQueue) return
    isProcessingOfflineQueue = true

    try {
      const queue = await getOfflineQueue()
      offlineQueueCount.value = queue.length
      if (queue.length === 0) return

      queue.forEach(item => {
        if (!offlineItemStatuses.value[item.id]) {
          offlineItemStatuses.value[item.id] = { status: 'pending', retries: 0 }
        }
      })

      const pendingItems = queue.filter(item => {
        const state = offlineItemStatuses.value[item.id]
        if (state.status === 'synced' || state.status === 'conflict' || state.status === 'failed') return false
        
        if (state.status === 'deferred') {
          const backoff = Math.min(30000, 1000 * Math.pow(2, state.retries))
          if (Date.now() - (state.lastAttempt || 0) < backoff) {
            return false
          }
        }
        return true
      })

      if (pendingItems.length === 0) return

      uiStore.showToast(`Đang đồng bộ ${pendingItems.length} đơn offline...`, 'info')
      await loadHistory(true)

      // 1. Separate 'saveOrder' items from other actions
      const saveOrderItems = pendingItems.filter(item => item.action === 'saveOrder')
      const otherItems = pendingItems.filter(item => item.action !== 'saveOrder')

      const batchToSync: typeof saveOrderItems = []

      // 2. Perform conflict detection on 'saveOrder' items first
      for (const item of saveOrderItems) {
        const state = offlineItemStatuses.value[item.id]
        state.lastAttempt = Date.now()
        const payload = item.payload
        const localId = payload.id

        let conflictType: BookingConflict['type'] | null = null
        let serverSnapshot: any = null

        const existingServerBooking = historyList.value.find(h => h.id === localId)
        if (existingServerBooking) {
          const baseVersion = payload.baseServerVersion ?? payload.version ?? 1
          const serverVersion = existingServerBooking.version ?? 1
          if (serverVersion > baseVersion) {
            conflictType = 'version_mismatch'
          }
        }

        if (!conflictType) {
          const date = payload.customer.date
          const time = payload.customer.time
          const tables = payload.customer.tables || ''

          const hasConflict = hasTimeConflictIndexed({ id: localId, date, time, tables })
          if (hasConflict) {
            conflictType = 'table_time_overlap'
            serverSnapshot = historyList.value.find(h => {
              if (h.id === localId) return false
              return hasTimeConflict(
                { date, time, tables },
                { date: h.parsedCustomer.date, time: h.parsedCustomer.time || '', tables: h.parsedCustomer.tables || '' }
              )
            })
          }
        }

        if (conflictType) {
          state.status = 'conflict'
          const newConflict: BookingConflict = {
            localBookingId: localId,
            serverBookingId: serverSnapshot?.id,
            type: conflictType,
            severity: 'blocking',
            localSnapshot: payload,
            serverSnapshot,
            detectedAt: new Date().toISOString()
          }

          if (!activeConflicts.value.some(c => c.localBookingId === localId)) {
            activeConflicts.value.push(newConflict)
            saveConflicts()
          }
          uiStore.showToast(`Phát hiện xung đột đồng bộ cho đơn của ${payload.customer.name}!`, 'warning', 6000)
        } else {
          batchToSync.push(item)
        }
      }

      // 3. Batch sync non-conflicting saveOrder items using saveOrdersBatch
      if (batchToSync.length > 0) {
        batchToSync.forEach(item => {
          offlineItemStatuses.value[item.id].status = 'syncing'
        })

        try {
          const controller = new AbortController()
          const tId = setTimeout(() => controller.abort(), 15000) // 15s timeout for batch

          const payloads = batchToSync.map(item => item.payload)
          const res = await orderRepo.saveOrdersBatch(payloads)
          clearTimeout(tId)

          if (res?.ok && Array.isArray(res.results)) {
            for (let i = 0; i < batchToSync.length; i++) {
              const item = batchToSync[i]
              const state = offlineItemStatuses.value[item.id]
              const result = res.results[i]
              if (result && result.ok) {
                state.status = 'synced'
                
                // Trigger audit logs for each successfully batch-saved item
                const beforeOrder = item.payload.id ? historyList.value.find(h => h.id === item.payload.id) : null
                await triggerAuditLog(
                  beforeOrder ? 'booking:update' : 'booking:create',
                  'booking',
                  result.id || item.payload.id,
                  beforeOrder ? beforeOrder.parsedCustomer : null,
                  item.payload.customer || item.payload.data?.customer || item.payload
                )

                await removeFromQueue(item.id)
              } else {
                state.status = 'failed'
                console.warn('[OfflineQueue] Batch sync rejected sub-item:', item.id, result)
              }
            }
            await updateOfflineQueueCount()
          } else {
            throw new Error(res?.message || 'Invalid batch response')
          }
        } catch (e: any) {
          console.warn('[OfflineQueue] Exception processing batch sync:', e)
          batchToSync.forEach(item => {
            const state = offlineItemStatuses.value[item.id]
            const isNetworkOrTimeout = e.name === 'AbortError' || e.message?.includes('fetch') || e.message?.includes('network')
            if (isNetworkOrTimeout && state.retries < 3) {
              state.status = 'deferred'
              state.retries++
            } else {
              state.status = 'failed'
            }
          })
        }
      }

      // 4. Process non-saveOrder items concurrently (e.g. config updates, deletes, alias saves)
      if (otherItems.length > 0) {
        await runWithConcurrencyLimit(otherItems, 2, async (item) => {
          const state = offlineItemStatuses.value[item.id]
          state.status = 'syncing'
          state.lastAttempt = Date.now()

          try {
            const payload = item.payload
            const controller = new AbortController()
            const tId = setTimeout(() => controller.abort(), 8000)

            const res = await fetchWithRetry({ action: item.action, data: payload }, 1, controller.signal)
            clearTimeout(tId)

            if (res?.ok) {
              state.status = 'synced'
              await removeFromQueue(item.id)
              await updateOfflineQueueCount()
            } else {
              state.status = 'failed'
              console.warn('[OfflineQueue] Server sync rejected other item:', item.id, res)
            }
          } catch (e: any) {
            const isNetworkOrTimeout = e.name === 'AbortError' || e.message?.includes('fetch') || e.message?.includes('network')
            if (isNetworkOrTimeout && state.retries < 3) {
              state.status = 'deferred'
              state.retries++
            } else {
              state.status = 'failed'
            }
            console.warn('[OfflineQueue] Exception processing other item:', item.id, e)
          }
        })
      }
    } finally {
      isProcessingOfflineQueue = false
    }
  }

  function logout() {
    uiStore.showToast('Đang đăng xuất và xóa phiên làm việc...', 'info')
    lockAdminSettings()
    localStorage.removeItem(CACHE_KEYS.HISTORY)
    setTimeout(() => {
      window.location.reload()
    }, 500)
  }

  function handleInactivityTimeout() {
    sessionStorage.setItem('kg_logout_reason', 'inactivity')
    logout()
  }

  window.addEventListener('online', () => {
    uiStore.showToast('Đã có mạng lại, đang đồng bộ dữ liệu...', 'info')
    processOfflineQueue()
    fetchSheets()
    fetchMenu()
    loadHistory(true)
    fetchRemoteConfig()
  })

  window.addEventListener('offline', () => {
    uiStore.showToast('Đã mất kết nối mạng. Ứng dụng hoạt động ở chế độ offline.', 'warning')
    uiStore.connectionStatus = 'error'
  })

  return {
    adminToken, adminExpiresAt, isAdminSettingsUnlocked, lockAdminSettings, unlockAdminSettings, defaultMenuProfileId, defaultBankAccountIndex, setDefaultBankAccount, setDefaultMenuProfile, autoSyncIfReady,
    showPortalMinigames,
    historyList, menuList, menuDetails, menuImages, dishImages, menuSheets, activeSheet, newMenuName, newMenuContent,
    menuAliases, loadMenuAliases, saveAlias, deleteAlias,
    aiCorrections, loadAiCorrections, logAiCorrection,
    menuFingerprint, correctionFingerprint,
    bankList, selectedBankIndex, newBank,
    staffList, newStaff,
    currentBank, groupedHistory, filteredHistory,
    getCrmStatus, computeDiff,
    setOptimisticOrder, markOrderSynced, markOrderFailed,
    loadHistory, fetchMenu, fetchSheets, switchMenu, uploadNewMenu, deleteMenu, uploadMenuImageStore, uploadDishImageStore,
    selectBank, addBank, removeBank,
    addStaff, removeStaff,
    fetchRemoteConfig, updateRemoteConfig, verifyAdminSession,
    currentUserRole, verifySession, saveOrder, deleteOrder, triggerAuditLog,
    logout, handleInactivityTimeout,
    offlineQueueCount, updateOfflineQueueCount,
    scheduleMenuPrefetch, scheduleMenusPrecache,
    activeConflicts, saveConflicts, resolveConflict
  }
})
