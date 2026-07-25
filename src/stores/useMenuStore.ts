import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import { CACHE_KEYS } from '@/utils/constants'
import { useUIStore } from './useUIStore'
import { useAdminStore } from './useAdminStore'
import {
  cacheMenu, getCachedMenu, deleteCachedMenu,
  cacheMenuSheets, getCachedMenuSheets,
  cacheIsFresh
} from '@/services/cache'
import { DualWriteMenuRepository as GasMenuRepository, DualWriteCorrectionRepository as GasCorrectionRepository } from '@/infrastructure/dual/dualWriteRepository'
import { clearAIResponseCache, hashAndStringifyLargeObject } from '@/services/ai/aiResponseCache'

const menuRepo = new GasMenuRepository()
const correctionRepo = new GasCorrectionRepository()

export interface MenuListItem {
  name: string
  price: number
  desc?: string
  cleanName: string
  acronym: string
}

export const useMenuStore = defineStore('menu', () => {
  const uiStore = useUIStore()

  const menuList = shallowRef<MenuListItem[]>([])
  const menuDetails = ref<Record<string, string>>({})
  const menuImages = ref<Record<string, string>>({})
  const dishImages = ref<Record<string, string>>({})
  const menuSheets = ref<string[]>([])
  const activeSheet = ref(localStorage.getItem(CACHE_KEYS.MENU_SHEET) || 'Menu')
  const newMenuName = ref('')
  const newMenuContent = ref('')
  const defaultMenuProfileId = ref(localStorage.getItem('default_menu_profile_id') || '')
  
  const menuAliases = ref<{ alias: string; dishName: string }[]>(
    JSON.parse(localStorage.getItem('menu_aliases') || '[]')
  )
  const aiCorrections = ref<any[]>(
    JSON.parse(localStorage.getItem('ai_corrections') || '[]')
  )

  const menuFingerprint = ref('')
  const correctionFingerprint = ref('')

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

  async function saveAlias(alias: string, dishName: string, adminToken?: string) {
    const res = await menuRepo.saveMenuAlias(alias, dishName, adminToken)
    if (res.ok) {
      await loadMenuAliases()
      uiStore.showToast('Lưu từ viết tắt thành công!', 'success')
    }
    return res
  }

  async function deleteAlias(alias: string, adminToken?: string) {
    const res = await menuRepo.deleteMenuAlias(alias, adminToken)
    if (res.ok) {
      await loadMenuAliases()
      uiStore.showToast('Đã xóa từ viết tắt!', 'success')
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

  async function learnFromStaffCorrection(rawInputName: string, correctedDishName: string) {
    if (!rawInputName || !correctedDishName) return
    const cleanRaw = rawInputName.trim()
    const cleanCorrected = correctedDishName.trim()
    if (!cleanRaw || !cleanCorrected || cleanRaw.toLowerCase() === cleanCorrected.toLowerCase()) return

    const existing = menuAliases.value.find((a: any) => 
      a.alias.toLowerCase().trim() === cleanRaw.toLowerCase() && 
      a.dishName.toLowerCase().trim() === cleanCorrected.toLowerCase()
    )
    if (!existing) {
      console.log(`[Auto-Learning] Learning dish alias mapping: "${cleanRaw}" -> "${cleanCorrected}"`)
      await saveAlias(cleanRaw, cleanCorrected)
      await logAiCorrection(cleanRaw, cleanRaw, cleanCorrected, 'menu_item')
      uiStore.showToast(`🧠 Đã tự động ghi nhớ từ viết tắt: "${cleanRaw}" ➔ "${cleanCorrected}"`, 'success')
    }
  }

  function setDefaultMenuProfile(profileId: string) {
    defaultMenuProfileId.value = profileId
    localStorage.setItem('default_menu_profile_id', profileId)
    uiStore.showToast(`Đã chọn "${profileId}" làm thực đơn mặc định`, 'info')
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

  async function uploadNewMenu(adminToken?: string, verifyAdminFn?: () => Promise<boolean>) {
    if (!newMenuName.value || !newMenuContent.value) {
      return uiStore.showToast('Vui lòng nhập tên và nội dung menu!', 'warning')
    }
    
    if (verifyAdminFn) {
      const isAuth = await verifyAdminFn()
      if (!isAuth) return
    }

    const adminStore = useAdminStore()
    const resolvedToken = adminToken || adminStore.adminToken

    try {
      const data = await menuRepo.createMenu(newMenuName.value, newMenuContent.value, undefined, resolvedToken)
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

  async function deleteMenu(sheetName: string, adminToken?: string, verifyAdminFn?: () => Promise<boolean>) {
    const confirm = await uiStore.showConfirm('Xóa Bộ Thực Đơn', `Bạn có chắc chắn muốn xóa bộ thực đơn "${sheetName}"?`)
    if (!confirm) return

    if (verifyAdminFn) {
      const isAuth = await verifyAdminFn()
      if (!isAuth) return
    }

    const adminStore = useAdminStore()
    const resolvedToken = adminToken || adminStore.adminToken

    try {
      const data = await menuRepo.deleteMenu(sheetName, undefined, resolvedToken)
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

  async function uploadMenuImageStore(base64: string, adminToken?: string, verifyAdminFn?: () => Promise<boolean>) {
    if (!activeSheet.value) return uiStore.showToast('Không có menu nào đang chọn!', 'warning')
    
    if (verifyAdminFn) {
      const isAuth = await verifyAdminFn()
      if (!isAuth) return
    }

    const adminStore = useAdminStore()
    const resolvedToken = adminToken || adminStore.adminToken

    uiStore.loading.is = true
    uiStore.loading.msg = 'ĐANG TẢI ẢNH LÊN CLOUD...'
    try {
      const data = await menuRepo.uploadMenuImage(activeSheet.value, base64, undefined, resolvedToken)
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

  async function uploadDishImageStore(dishId: string, base64: string, adminToken?: string, verifyAdminFn?: () => Promise<boolean>) {
    if (verifyAdminFn) {
      const isAuth = await verifyAdminFn()
      if (!isAuth) return
    }

    const adminStore = useAdminStore()
    const resolvedToken = adminToken || adminStore.adminToken

    uiStore.loading.is = true
    uiStore.loading.msg = 'ĐANG TẢI ẢNH MÓN LÊN CLOUD...'
    try {
      const data = await menuRepo.uploadDishImage(dishId, base64, undefined, resolvedToken)
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

  return {
    menuList,
    menuDetails,
    menuImages,
    dishImages,
    menuSheets,
    activeSheet,
    newMenuName,
    newMenuContent,
    defaultMenuProfileId,
    menuAliases,
    aiCorrections,
    menuFingerprint,
    correctionFingerprint,
    loadMenuAliases,
    saveAlias,
    deleteAlias,
    loadAiCorrections,
    logAiCorrection,
    learnFromStaffCorrection,
    setDefaultMenuProfile,
    computeMenuFingerprint,
    computeCorrectionFingerprint,
    fetchMenu,
    fetchSheets,
    switchMenu,
    uploadNewMenu,
    deleteMenu,
    uploadMenuImageStore,
    uploadDishImageStore,
    scheduleMenuPrefetch,
    scheduleMenusPrecache
  }
})
