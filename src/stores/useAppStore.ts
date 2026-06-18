import { defineStore } from 'pinia'
import { ref, reactive, computed, shallowRef } from 'vue'
import { stripAccents, formatVND, cleanPhoneNumber } from '@/utils'
import { CACHE_KEYS, DEFAULTS } from '@/utils/constants'
import * as api from '@/services/api'
import { useUIStore } from './useUIStore'
import {
  cacheHistory, getCachedHistory,
  cacheMenu, getCachedMenu, deleteCachedMenu,
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
  isCared?: boolean
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

    // Cache-first (SWR: Stale-While-Revalidate)
    const cached = await getCachedMenu(targetSheet)
    if (cached && cached.length > 0) {
      menuList.value = cached
      const ds: Record<string, string> = {}
      cached.forEach((i: any) => { if (i.desc) ds[i.name] = i.desc })
      menuDetails.value = ds
      activeSheet.value = targetSheet

      // Revalidate in the background
      api.getMenu(targetSheet).then((data) => {
        if (data.ok) {
          menuList.value = data.data || []
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
      
      return // Return early to prevent UI blocking
    }

    // No cache case: Fetch from network and await
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
        await cacheMenu(targetSheet, data.data || [])
      }
    } catch (e) {
      console.error(e)
      uiStore.showToast('Không tải được menu', 'warning')
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
      const data = await api.createMenu(newMenuName.value, newMenuContent.value, undefined, adminToken.value)
      if (data.ok) {
        // Clear cache for this menu first to ensure we reload fresh data
        await deleteCachedMenu(newMenuName.value)
        uiStore.showToast(uiStore.isUpdateMode ? 'Cập nhật thực đơn thành công!' : 'Tạo menu thành công!', 'success')
        const wasUpdateMode = uiStore.isUpdateMode
        await fetchSheets()
        await switchMenu(newMenuName.value)
        newMenuName.value = ''
        newMenuContent.value = ''
        uiStore.isUpdateMode = false

        // Display logs of changes if any
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
      const data = await api.deleteMenu(sheetName, undefined, adminToken.value)
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
      const data = await api.uploadMenuImage(activeSheet.value, base64, undefined, adminToken.value)
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
      const data = await api.uploadDishImage(dishId, base64, undefined, adminToken.value)
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
        
        // --- Defaults handling ---
        if (result.data.default_bank_account_id) {
          const accountId = result.data.default_bank_account_id
          localStorage.setItem('default_bank_account_id', accountId)
          const index = bankList.value.findIndex((b: any) => b.bankId === accountId || b.number === accountId)
          if (index !== -1) {
            defaultBankAccountIndex.value = index
            selectedBankIndex.value = index
            localStorage.setItem(CACHE_KEYS.SELECTED_BANK, String(index))
          }
        }
        if (result.data.default_menu_profile_id) {
          defaultMenuProfileId.value = result.data.default_menu_profile_id
          localStorage.setItem('default_menu_profile_id', result.data.default_menu_profile_id)
          if (!localStorage.getItem(CACHE_KEYS.MENU_SHEET)) {
            activeSheet.value = result.data.default_menu_profile_id
            localStorage.setItem(CACHE_KEYS.MENU_SHEET, result.data.default_menu_profile_id)
          }
        }
        
        // Extract images
        Object.keys(result.data).forEach(k => {
          let url = result.data[k]
          if (typeof url === 'string' && url.includes('drive.google.com/uc?')) {
            const match = url.match(/id=([^&]+)/)
            if (match) url = `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1200`
          }
          if (k.startsWith('dishImage_')) {
            dishImages.value[k.replace('dishImage_', '')] = url
          }
          if (k.startsWith('menuImage_')) {
            menuImages.value[k.replace('menuImage_', '')] = url
          }
        })
        
        try {
          await loadMenuAliases()
        } catch (errAliases) {
          console.warn('Aliases sync error:', errAliases)
        }
        try {
          await loadAiCorrections()
        } catch (errCorrections) {
          console.warn('Corrections sync error:', errCorrections)
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

  const isAdminSettingsUnlocked = computed(() => {
    return !!adminToken.value && adminExpiresAt.value > Date.now()
  })

  async function lockAdminSettings() {
    if (adminToken.value) {
      try {
        await api.logoutAdminSettings(adminToken.value)
      } catch (e) {}
    }
    adminToken.value = ''
    adminExpiresAt.value = 0
    sessionStorage.removeItem('kg_admin_token')
    sessionStorage.removeItem('kg_admin_expires_at')
    uiStore.showToast('Đã khóa cấu hình Admin', 'info')
  }

  async function unlockAdminSettings(password: string): Promise<boolean> {
    try {
      const res = await api.authAdminSettings(password)
      if (res.ok && res.token) {
        adminToken.value = res.token
        adminExpiresAt.value = res.expiresAt
        sessionStorage.setItem('kg_admin_token', res.token)
        sessionStorage.setItem('kg_admin_expires_at', String(res.expiresAt))
        uiStore.showToast('Xác thực Admin thành công!', 'success')
        return true
      } else {
        uiStore.showToast(res.message || 'Mật khẩu Admin không chính xác!', 'error')
        return false
      }
    } catch (e: any) {
      uiStore.showToast('Không thể kết nối với server để xác thực!', 'error')
      return false
    }
  }

  async function verifyAdminSession(): Promise<boolean> {
    if (isAdminSettingsUnlocked.value) {
      const newExpiresAt = Date.now() + 30 * 60 * 1000
      adminExpiresAt.value = newExpiresAt
      sessionStorage.setItem('kg_admin_expires_at', String(newExpiresAt))
      return true
    }
    
    adminToken.value = ''
    adminExpiresAt.value = 0
    sessionStorage.removeItem('kg_admin_token')
    sessionStorage.removeItem('kg_admin_expires_at')

    const pass = await uiStore.showPrompt('Xác thực Admin', 'Vui lòng nhập mật khẩu cấu hình:')
    if (pass) {
      return await unlockAdminSettings(pass)
    } else if (pass !== null) {
      uiStore.showToast('Vui lòng nhập mật khẩu!', 'warning')
    }
    return false
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

    api.saveConfig(
      bList,
      sList,
      undefined,
      undefined,
      undefined,
      tokenVal
    ).then((data: any) => {
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
      const res = await api.upsertSystemConfig('default_bank_account_id', accountId, {
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
      const res = await api.upsertSystemConfig('default_menu_profile_id', menuId, {
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
      const res = await api.getMenuAliases()
      if (res.ok && res.data) {
        menuAliases.value = res.data
        localStorage.setItem('menu_aliases', JSON.stringify(res.data))
      }
    } catch (e) {
      console.warn('Failed to load menu aliases:', e)
    }
  }

  async function saveAlias(alias: string, dishName: string) {
    const res = await api.saveMenuAlias(alias, dishName, adminToken.value)
    if (res.ok) {
      await loadMenuAliases()
      uiStore.showToast('Lưu từ viết tắt thành công!', 'success')
    }
    return res
  }

  async function deleteAlias(alias: string) {
    const res = await api.deleteMenuAlias(alias, adminToken.value)
    if (res.ok) {
      await loadMenuAliases()
      uiStore.showToast('Đã xóa từ viết tắt!', 'success')
    }
    return res
  }

  async function loadAiCorrections() {
    try {
      const res = await api.getAiCorrections()
      if (res.ok && res.data) {
        aiCorrections.value = res.data
        localStorage.setItem('ai_corrections', JSON.stringify(res.data))
      }
    } catch (e) {
      console.warn('Failed to load AI corrections:', e)
    }
  }

  const offlineQueueCount = ref(0)
  async function updateOfflineQueueCount() {
    try {
      const queue = await getOfflineQueue()
      offlineQueueCount.value = queue.length
    } catch (e) {
      console.warn('Failed to read offline queue:', e)
    }
  }

  function autoSyncIfReady() {
    fetchRemoteConfig()
    updateOfflineQueueCount()
  }

  // Auto trigger remote config fetch when app starts
  autoSyncIfReady()

  // --- Offline Queue Processor ---
  async function processOfflineQueue() {
    const queue = await getOfflineQueue()
    offlineQueueCount.value = queue.length
    if (queue.length === 0) return
    uiStore.showToast(`Đang đồng bộ ${queue.length} đơn offline...`, 'info')
    for (const item of queue) {
      try {
        await api.fetchWithRetry({ action: item.action, data: item.payload })
        await removeFromQueue(item.id)
        await updateOfflineQueueCount()
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
    adminToken, adminExpiresAt, isAdminSettingsUnlocked, lockAdminSettings, unlockAdminSettings, defaultMenuProfileId, defaultBankAccountIndex, setDefaultBankAccount, setDefaultMenuProfile, autoSyncIfReady,
    historyList, menuList, menuDetails, menuImages, dishImages, menuSheets, activeSheet, newMenuName, newMenuContent,
    menuAliases, loadMenuAliases, saveAlias, deleteAlias,
    aiCorrections, loadAiCorrections,
    bankList, selectedBankIndex, newBank,
    staffList, newStaff,
    currentBank, groupedHistory, filteredHistory,
    getCrmStatus, computeDiff,
    loadHistory, fetchMenu, fetchSheets, switchMenu, uploadNewMenu, deleteMenu, uploadMenuImageStore, uploadDishImageStore,
    selectBank, addBank, removeBank,
    addStaff, removeStaff,
    fetchRemoteConfig, updateRemoteConfig, verifyAdminSession,
    logout,
    offlineQueueCount, updateOfflineQueueCount
  }
})
