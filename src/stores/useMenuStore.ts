import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { MenuListItem } from './useAppStore'
import { DualWriteMenuRepository as GasMenuRepository } from '@/infrastructure/dual/dualWriteRepository'
import { getCachedMenu, cacheMenu, getCachedMenuSheets, cacheMenuSheets } from '@/services/cache'
import { stripAccents } from '@/utils'

const menuRepo = new GasMenuRepository()

export const useMenuStore = defineStore('menuStore', () => {
  const activeMenuSheet = ref<string>('')
  const menuSheets = ref<string[]>([])
  const menuList = ref<MenuListItem[]>([])
  const menuLoading = ref(false)
  const menuLoaded = ref(false)
  const menuAliases = ref<Record<string, string>>({})

  const cleanMenuList = computed(() => {
    return menuList.value.map(item => ({
      ...item,
      cleanName: stripAccents(item.name).toLowerCase(),
      acronym: stripAccents(item.name).split(/\s+/).map(w => w[0]).join('').toLowerCase()
    }))
  })

  async function loadMenuSheets() {
    try {
      const cached = await getCachedMenuSheets()
      if (cached && cached.length > 0) {
        menuSheets.value = cached
      }
      const res = await menuRepo.getMenuSheets()
      if (res && res.ok && Array.isArray(res.sheets)) {
        menuSheets.value = res.sheets
        if (!activeMenuSheet.value && res.sheets.length > 0) {
          activeMenuSheet.value = res.sheets[0]
        }
        await cacheMenuSheets(res.sheets)
      }
    } catch (e) {
      console.error('[MenuStore] Failed to load menu sheets:', e)
    }
  }

  async function loadMenu(sheetName?: string, forceReload = false) {
    const targetSheet = sheetName || activeMenuSheet.value || 'Thực đơn'
    if (menuLoaded.value && activeMenuSheet.value === targetSheet && !forceReload) return
    menuLoading.value = true
    activeMenuSheet.value = targetSheet

    try {
      const cached = await getCachedMenu(targetSheet)
      if (cached && Array.isArray(cached) && cached.length > 0) {
        menuList.value = cached
        menuLoaded.value = true
      }

      const res = await menuRepo.getMenu(targetSheet)
      if (res && res.ok && Array.isArray(res.items)) {
        menuList.value = res.items
        menuLoaded.value = true
        await cacheMenu(targetSheet, res.items)
      }
    } catch (e) {
      console.error('[MenuStore] Failed to load menu:', e)
    } finally {
      menuLoading.value = false
    }
  }

  return {
    activeMenuSheet,
    menuSheets,
    menuList,
    menuLoading,
    menuLoaded,
    menuAliases,
    cleanMenuList,
    loadMenuSheets,
    loadMenu
  }
})
