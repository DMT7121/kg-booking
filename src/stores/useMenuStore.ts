import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import { CACHE_KEYS, SAMPLE_MENU } from '@/utils/constants'
import { useUIStore } from './useUIStore'
import { useAdminStore } from './useAdminStore'
import {
  cacheMenu, getCachedMenu, deleteCachedMenu,
  cacheMenuSheets, getCachedMenuSheets,
  cacheIsFresh
} from '@/services/cache'
import { stripAccents } from '@/utils'
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

export function parseSampleMenu(rawText: string): MenuListItem[] {
  const lines = rawText.split('\n')
  const items: MenuListItem[] = []
  let category = ''
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (!trimmed.includes('-') && !/\d+k/i.test(trimmed)) {
      category = trimmed
      continue
    }
    const parts = trimmed.split('-')
    const rawName = parts[0].replace(/^\d+[\.\)\s]+/, '').trim()
    if (!rawName) continue
    let price = 0
    if (parts[1]) {
      const pStr = parts[1].toLowerCase().replace(/k/g, '000').replace(/[^0-9]/g, '')
      price = parseInt(pStr) || 0
    }
    const cleanName = stripAccents(rawName).toLowerCase().trim().replace(/[^a-z0-9\s]/g, '')
    const acronym = cleanName.split(/\s+/).filter(Boolean).map(w => w[0]).join('')
    items.push({
      name: rawName,
      price,
      desc: category ? `Loại: ${category}` : '',
      cleanName,
      acronym
    })
  }
  return items
}

export function normalizeMenuItems(rawItems: any[]): MenuListItem[] {
  if (!Array.isArray(rawItems)) return []
  return rawItems.map((i: any) => {
    const name = i.name || ''
    const cleanName = i.cleanName || stripAccents(name).toLowerCase().trim().replace(/[^a-z0-9\s]/g, '')
    const acronym = i.acronym || cleanName.split(/\s+/).filter(Boolean).map((w: string) => w[0]).join('')
    return {
      name,
      price: Number(i.price) || 0,
      desc: i.desc || i.note || '',
      cleanName,
      acronym
    }
  })
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
      const normalized = normalizeMenuItems(cached)
      menuList.value = normalized
      computeMenuFingerprint()
      const ds: Record<string, string> = {}
      normalized.forEach((i: any) => { if (i.desc) ds[i.name] = i.desc })
      menuDetails.value = ds
      activeSheet.value = targetSheet

      menuRepo.getMenu(targetSheet).then((data) => {
        if (data.ok) {
          const raw = Array.isArray(data.data) ? data.data : (Array.isArray(data.items) ? data.items : [])
          if (raw.length > 0) {
            const updated = normalizeMenuItems(raw)
            menuList.value = updated
            computeMenuFingerprint()
            const dsUpdate: Record<string, string> = {}
            updated.forEach((i: any) => { if (i.desc) dsUpdate[i.name] = i.desc })
            menuDetails.value = dsUpdate
            cacheMenu(targetSheet, updated)
          }
        }
      }).catch((e) => {
        console.warn('[Menu Revalidation Failed]', e)
      })
      
      return
    }

    try {
      const data = await menuRepo.getMenu(targetSheet)
      if (data.ok) {
        const raw = Array.isArray(data.data) ? data.data : (Array.isArray(data.items) ? data.items : [])
        const updated = normalizeMenuItems(raw)
        if (updated.length > 0) {
          menuList.value = updated
          computeMenuFingerprint()
          const ds: Record<string, string> = {}
          updated.forEach((i: any) => { if (i.desc) ds[i.name] = i.desc })
          menuDetails.value = ds
          activeSheet.value = targetSheet
          await cacheMenu(targetSheet, updated)
        } else if (menuList.value.length === 0) {
          const sample = parseSampleMenu(SAMPLE_MENU)
          menuList.value = sample
          computeMenuFingerprint()
        }
      } else if (menuList.value.length === 0) {
        const sample = parseSampleMenu(SAMPLE_MENU)
        menuList.value = sample
        computeMenuFingerprint()
      }
    } catch (e) {
      console.error(e)
      if (menuList.value.length === 0) {
        const sample = parseSampleMenu(SAMPLE_MENU)
        menuList.value = sample
        computeMenuFingerprint()
      }
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

function selectBestDefaultSheet(sheets: string[], defaultProfileId = ''): string {
  if (!sheets || sheets.length === 0) return ''
  const validSheets = sheets.filter(s => !/alias/i.test(s))
  if (validSheets.length === 0) return sheets[0]
  if (defaultProfileId && validSheets.includes(defaultProfileId)) {
    return defaultProfileId
  }
  const preferred = validSheets.find(s => /2026|chinh|main|thuc_don/i.test(s)) ||
                    validSheets.find(s => /^menu\d*$/i.test(s.trim())) ||
                    validSheets.find(s => !/set/i.test(s))
  return preferred || validSheets[0]
}

function ensureMenu2026InSheets(sheets: string[]): string[] {
  const clean = sheets.filter(s => !/alias/i.test(s))
  if (!clean.includes('MENU2026')) {
    clean.unshift('MENU2026')
  }
  return clean
}

  async function fetchSheets() {
    const cached = await getCachedMenuSheets()
    if (cached && cached.length > 0) {
      const finalCached = ensureMenu2026InSheets(cached)
      menuSheets.value = finalCached
      const target = selectBestDefaultSheet(menuSheets.value, defaultMenuProfileId.value)
      if (target) {
        activeSheet.value = target
        localStorage.setItem(CACHE_KEYS.MENU_SHEET, target)
        fetchMenu(target)
      }
      scheduleMenusPrecache(menuSheets.value, { reason: 'app-startup-cache' })
    }

    try {
      const data = await menuRepo.getMenuSheets()
      if (data && data.ok && data.sheets && data.sheets.length > 0) {
        const finalSheets = ensureMenu2026InSheets(data.sheets)
        menuSheets.value = finalSheets
        await cacheMenuSheets(finalSheets)
        
        const target = selectBestDefaultSheet(finalSheets, defaultMenuProfileId.value)
        if (target) {
          activeSheet.value = target
          localStorage.setItem(CACHE_KEYS.MENU_SHEET, target)
          await fetchMenu(target)
        }
        scheduleMenusPrecache(finalSheets, { reason: 'app-startup-network' })
      } else if (menuSheets.value.length === 0) {
        menuSheets.value = ensureMenu2026InSheets(['MENU2026', 'Menu - Set'])
        const target = selectBestDefaultSheet(menuSheets.value, defaultMenuProfileId.value)
        activeSheet.value = target
        localStorage.setItem(CACHE_KEYS.MENU_SHEET, target)
        await fetchMenu(target)
      }
    } catch (e) {
      console.error('Fetch Sheets Error', e)
      if (menuSheets.value.length === 0) {
        menuSheets.value = ensureMenu2026InSheets(['MENU2026', 'Menu - Set'])
        const target = selectBestDefaultSheet(menuSheets.value, defaultMenuProfileId.value)
        activeSheet.value = target
        localStorage.setItem(CACHE_KEYS.MENU_SHEET, target)
        await fetchMenu(target)
      }
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
