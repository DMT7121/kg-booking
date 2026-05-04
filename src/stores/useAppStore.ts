import { defineStore } from 'pinia'
import { ref, reactive, computed, shallowRef } from 'vue'
import { stripAccents, formatVND, cleanPhoneNumber } from '@/utils'
import { CACHE_KEYS, DEFAULTS } from '@/utils/constants'
import * as api from '@/services/api'
import { useUIStore } from './useUIStore'
import {
  cacheHistory, getCachedHistory,
  cacheMenu, getCachedMenu,
  cacheMenuSheets, getCachedMenuSheets,
  addToOfflineQueue, getOfflineQueue, removeFromQueue
} from '@/services/cache'

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
}

export interface MenuListItem {
  name: string
  price: number
  desc?: string
  cleanName: string
  acronym: string
}

export const useAppStore = defineStore('app', () => {
  const uiStore = useUIStore()

  // --- History ---
  const historyList = shallowRef<HistoryOrder[]>([])

  // --- Menu ---
  const menuList = shallowRef<MenuListItem[]>([])
  const menuDetails = ref<Record<string, string>>({})
  const menuSheets = ref<string[]>([])
  const activeSheet = ref(localStorage.getItem(CACHE_KEYS.MENU_SHEET) || 'Menu')
  const newMenuName = ref('')
  const newMenuContent = ref('')

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

  // --- API Actions ---
  async function loadHistory(silent: boolean) {
    uiStore.connectionStatus = 'syncing'

    // Cache-first: Show cached data instantly
    const cached = await getCachedHistory()
    if (cached && cached.length > 0 && historyList.value.length === 0) {
      historyList.value = cached
    }

    try {
      const data = await api.getHistory()
      if (data.ok) {
        historyList.value = data.data || []
        uiStore.connectionStatus = 'online'
        // Update cache in background
        cacheHistory(data.data || [])
      } else {
        uiStore.connectionStatus = cached ? 'online' : 'error'
      }
    } catch (e) {
      console.error(e)
      uiStore.connectionStatus = cached ? 'online' : 'error'
      if (cached) uiStore.showToast('Đang dùng dữ liệu offline', 'info')
    }
  }

  async function fetchMenu(sheetName?: string) {
    const targetSheet = sheetName || activeSheet.value

    // Cache-first
    const cached = await getCachedMenu(targetSheet)
    if (cached && cached.length > 0 && menuList.value.length === 0) {
      menuList.value = cached
      const ds: Record<string, string> = {}
      cached.forEach((i: any) => { if (i.desc) ds[i.name] = i.desc })
      menuDetails.value = ds
    }

    try {
      const data = await api.getMenu(targetSheet)
      if (data.ok) {
        menuList.value = data.data || []
        const ds: Record<string, string> = {}
        if (Array.isArray(data.data)) {
          data.data.forEach((i: any) => { if (i.desc) ds[i.name] = i.desc })
        }
        menuDetails.value = ds
        activeSheet.value = targetSheet
        cacheMenu(targetSheet, data.data || [])
      }
    } catch (e) {
      console.error(e)
      if (!cached) uiStore.showToast('Không tải được menu', 'warning')
    }
  }

  async function fetchSheets() {
    const cached = await getCachedMenuSheets()
    if (cached && cached.length > 0) menuSheets.value = cached

    try {
      const data = await api.getMenuSheets()
      if (data.ok) {
        menuSheets.value = data.sheets || []
        cacheMenuSheets(data.sheets || [])
      }
    } catch (e) {
      console.error('Fetch Sheets Error', e)
    }

    // Process offline queue if any
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
    }
  }

  async function uploadNewMenu() {
    if (!newMenuName.value || !newMenuContent.value) {
      return uiStore.showToast('Vui lòng nhập tên và nội dung menu!', 'warning')
    }
    const pass = await uiStore.showPrompt('Bảo mật', 'Nhập mã PIN Quản Lý để cập nhật/tạo Menu lên Cloud:')
    if (pass === null) return

    try {
      const data = await api.createMenu(newMenuName.value, newMenuContent.value, pass)
      if (data.ok) {
        uiStore.showToast(uiStore.isUpdateMode ? 'Cập nhật thực đơn thành công!' : 'Tạo menu thành công!', 'success')
        await fetchSheets()
        await switchMenu(newMenuName.value)
        newMenuName.value = ''
        newMenuContent.value = ''
        uiStore.isUpdateMode = false
      } else {
        throw new Error(data.message)
      }
    } catch (e: any) {
      console.error(e)
    }
  }

  async function deleteMenu(sheetName: string) {
    const pass = await uiStore.showPrompt('Xóa Bộ Thực Đơn', `Nhập mã PIN Quản Lý để xóa bộ thực đơn "${sheetName}":`)
    if (pass === null) return

    try {
      const data = await api.deleteMenu(sheetName, pass)
      if (data.ok) {
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

  // --- Bank Actions ---
  function selectBank(idx: number) {
    selectedBankIndex.value = idx
    localStorage.setItem(CACHE_KEYS.SELECTED_BANK, String(idx))
  }

  function addBank() {
    if (!newBank.number || !newBank.bankId) return uiStore.showToast('Thiếu tin!', 'warning')
    bankList.value.push({ ...newBank })
    localStorage.setItem(CACHE_KEYS.BANK, JSON.stringify(bankList.value))
    selectedBankIndex.value = bankList.value.length - 1
    Object.assign(newBank, { bankId: '', name: '', number: '', owner: '', template: 'compact' })
    updateRemoteConfig()
  }

  function removeBank(idx: number) {
    if (bankList.value.length > 1) {
      bankList.value.splice(idx, 1)
      selectedBankIndex.value = 0
      localStorage.setItem(CACHE_KEYS.BANK, JSON.stringify(bankList.value))
      updateRemoteConfig()
    }
  }

  // --- Staff Actions ---
  function addStaff() {
    if (!newStaff.name || !newStaff.phone) return uiStore.showToast('Vui lòng nhập đủ Họ tên và SĐT!', 'warning')
    staffList.value.push({ ...newStaff })
    localStorage.setItem(CACHE_KEYS.STAFF, JSON.stringify(staffList.value))
    Object.assign(newStaff, { name: '', phone: '' })
    updateRemoteConfig()
  }

  function removeStaff(idx: number) {
    if (staffList.value.length > 1) {
      staffList.value.splice(idx, 1)
      localStorage.setItem(CACHE_KEYS.STAFF, JSON.stringify(staffList.value))
      updateRemoteConfig()
    } else {
      uiStore.showToast('Phải giữ lại ít nhất 1 nhân viên!', 'warning')
    }
  }

  // --- Remote Config Sync ---
  async function fetchRemoteConfig() {
    uiStore.connectionStatus = 'syncing'
    try {
      const result = await api.getConfig()
      if (result.ok && result.data) {
        uiStore.connectionStatus = 'online'
        let hasChanges = false
        if (result.data.bankList) {
          try {
            const sBanks = JSON.parse(result.data.bankList)
            if (Array.isArray(sBanks) && sBanks.length > 0) {
              bankList.value = sBanks
              localStorage.setItem(CACHE_KEYS.BANK, result.data.bankList)
              hasChanges = true
            }
          } catch { /* ignore */ }
        }
        if (result.data.staffList) {
          try {
            const sStaff = JSON.parse(result.data.staffList)
            if (Array.isArray(sStaff) && sStaff.length > 0) {
              staffList.value = sStaff
              localStorage.setItem(CACHE_KEYS.STAFF, result.data.staffList)
              hasChanges = true
            }
          } catch { /* ignore */ }
        }
        // --- Webhook config (borrow back from server) ---
        if (result.data.webhookUrl) {
          localStorage.setItem('kg_v400_webhookUrl', result.data.webhookUrl)
          hasChanges = true
        }
        if (result.data.telegramChatId) {
          localStorage.setItem('kg_v400_telegramChatId', result.data.telegramChatId)
          hasChanges = true
        }
        if (hasChanges) {
          uiStore.showToast('Đã đồng bộ cấu hình từ Server', 'info')
        }
      }
    } catch (e) {
      console.warn('Config Sync Failed (Offline Mode)', e)
      uiStore.connectionStatus = 'error'
    }
  }

  async function updateRemoteConfig() {
    const pass = await uiStore.showPrompt('Bảo Mật Cấu Hình', 'Nhập Password Admin để lưu Bank/Staff lên Cloud (hoặc Bỏ qua để chỉ lưu tại máy này):')
    
    if (!pass) {
      uiStore.showToast('Chỉ lưu cấu hình trên máy này (Chưa đồng bộ Cloud)', 'warning')
      return
    }

    uiStore.showToast('Đang lưu cấu hình lên Server...', 'info')
    uiStore.connectionStatus = 'syncing'
    api.saveConfig(
      JSON.stringify(bankList.value),
      JSON.stringify(staffList.value),
      pass
    ).then((data: any) => {
      if (data.ok) uiStore.connectionStatus = 'online'
      else {
        uiStore.connectionStatus = 'error'
        uiStore.showToast('Lỗi lưu cấu hình: ' + data.message, 'error')
      }
    }).catch((e: any) => {
      console.warn('Update Config Failed', e)
      uiStore.connectionStatus = 'error'
    })
  }

  // --- Offline Queue Processor ---
  async function processOfflineQueue() {
    const queue = await getOfflineQueue()
    if (queue.length === 0) return
    uiStore.showToast(`Đang đồng bộ ${queue.length} đơn offline...`, 'info')
    for (const item of queue) {
      try {
        await api.fetchWithRetry({ action: item.action, data: item.payload })
        await removeFromQueue(item.id)
      } catch (e) {
        console.warn('[OfflineQueue] Failed to sync item:', item.id, e)
        break // Stop on first failure, retry next time
      }
    }
  }

  // --- Auth Actions ---
  function logout() {
    uiStore.showToast('Đang đăng xuất và xóa phiên làm việc...', 'info')
    localStorage.removeItem(CACHE_KEYS.HISTORY)
    setTimeout(() => {
      window.location.reload()
    }, 500)
  }

  // --- Auto Background Sync ---
  window.addEventListener('online', () => {
    uiStore.showToast('Đã có mạng lại, đang đồng bộ dữ liệu...', 'info')
    processOfflineQueue()
  })

  return {
    historyList, menuList, menuDetails, menuSheets, activeSheet, newMenuName, newMenuContent,
    bankList, selectedBankIndex, newBank,
    staffList, newStaff,
    currentBank, groupedHistory, filteredHistory,
    getCrmStatus, computeDiff,
    loadHistory, fetchMenu, fetchSheets, switchMenu, uploadNewMenu, deleteMenu,
    selectBank, addBank, removeBank,
    addStaff, removeStaff,
    fetchRemoteConfig, updateRemoteConfig,
    logout
  }
})
