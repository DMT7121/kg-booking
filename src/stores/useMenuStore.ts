import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { MenuListItem } from './useAppStore'
import { DualWriteMenuRepository as GasMenuRepository } from '@/infrastructure/dual/dualWriteRepository'
import { getCachedMenu, cacheMenu, deleteCachedMenu, getCachedMenuSheets, cacheMenuSheets } from '@/services/cache'
import { stripAccents } from '@/utils'
import { DEFAULT_FALLBACK_MENU_ITEMS } from '@/utils/constants'
import {
  PRIMARY_MENU_SHEET,
  isValidMenuSheetName as isValidSheet,
  normalizeMenuSheetName,
  prioritizeMenuSheets,
  isValidMenuItemsDataset
} from '@/domain/menu/menuSheetGuard'

const menuRepo = new GasMenuRepository()

function hydrateItems(rawList: any[]): MenuListItem[] {
  return (Array.isArray(rawList) ? rawList : [])
    .filter(item => item && String(item.name || '').trim().length > 0)
    .map(item => {
      const name = String(item.name).trim()
      const cleanName = stripAccents(name).toLowerCase().trim()
      const smMatch = cleanName.match(/^set\s+menu\s+(\d+)$/)
      const ccMatch = cleanName.match(/^combo\s+couple\s+(\d+)$/)
      const acronym = smMatch
        ? `SM${smMatch[1]}`
        : ccMatch
          ? `CC${ccMatch[1]}`
          : (item.acronym || cleanName.split(/\s+/).filter(Boolean).map((w: string) => w[0]).join(''))
      return {
        ...item,
        name,
        price: Number(item.price) || 0,
        cleanName,
        acronym
      }
    })
}

export const useMenuStore = defineStore('menuStore', () => {
  const savedMenuSheet = localStorage.getItem('kg_v400_menu_sheet')
  const initialMenuSheet = isValidSheet(savedMenuSheet) ? normalizeMenuSheetName(savedMenuSheet!) : PRIMARY_MENU_SHEET
  if (savedMenuSheet !== initialMenuSheet) {
    localStorage.setItem('kg_v400_menu_sheet', initialMenuSheet)
  }
  const activeMenuSheet = ref<string>(initialMenuSheet)
  const menuSheets = ref<string[]>([PRIMARY_MENU_SHEET])
  const menuList = ref<MenuListItem[]>(DEFAULT_FALLBACK_MENU_ITEMS)
  const menuLoading = ref(false)
  const menuLoaded = ref(false)
  const menuAliases = ref<Record<string, string>>({})

  const cleanMenuList = computed(() => {
    return hydrateItems(menuList.value)
  })

  async function loadMenuSheets() {
    try {
      const cached = await getCachedMenuSheets()
      if (cached && cached.length > 0) {
        menuSheets.value = prioritizeMenuSheets(cached, true)
      }
      const res = await menuRepo.getMenuSheets()
      if (res && res.ok && Array.isArray(res.sheets)) {
        menuSheets.value = prioritizeMenuSheets(res.sheets, true)
        if (!isValidSheet(activeMenuSheet.value) || !menuSheets.value.includes(activeMenuSheet.value)) {
          activeMenuSheet.value = menuSheets.value.includes(PRIMARY_MENU_SHEET) ? PRIMARY_MENU_SHEET : menuSheets.value[0]
          localStorage.setItem('kg_v400_menu_sheet', activeMenuSheet.value)
        }
        await cacheMenuSheets(menuSheets.value)
      }
    } catch (e) {
      console.error('[MenuStore] Failed to load menu sheets:', e)
    }
  }

  async function loadMenu(sheetName?: string, forceReload = false) {
    const requested = sheetName || activeMenuSheet.value || PRIMARY_MENU_SHEET
    const targetSheet = isValidSheet(requested) ? normalizeMenuSheetName(requested) : PRIMARY_MENU_SHEET
    if (menuLoaded.value && activeMenuSheet.value === targetSheet && !forceReload) return
    menuLoading.value = true
    activeMenuSheet.value = targetSheet

    try {
      const cached = await getCachedMenu(targetSheet)
      if (cached && Array.isArray(cached) && cached.length > 0 && !isValidMenuItemsDataset(cached)) {
        await deleteCachedMenu(targetSheet).catch(() => {})
      } else if (!forceReload && cached && isValidMenuItemsDataset(cached)) {
        menuList.value = hydrateItems(cached)
        menuLoaded.value = true
      }

      const res = await menuRepo.getMenu(targetSheet)
      const rawItems = Array.isArray(res?.data) ? res.data : (Array.isArray(res?.items) ? res.items : [])
      if (res && res.ok && isValidMenuItemsDataset(rawItems)) {
        const hydrated = hydrateItems(rawItems)
        if (hydrated.length > 0) {
          menuList.value = hydrated
          menuLoaded.value = true
          await cacheMenu(targetSheet, hydrated)
        }
      } else if (menuList.value.length === 0) {
        menuList.value = hydrateItems(DEFAULT_FALLBACK_MENU_ITEMS)
        menuLoaded.value = true
      }
    } catch (e) {
      console.error('[MenuStore] Failed to load menu:', e)
      if (menuList.value.length === 0) {
        menuList.value = hydrateItems(DEFAULT_FALLBACK_MENU_ITEMS)
        menuLoaded.value = true
      }
    } finally {
      menuLoading.value = false
    }
  }

  function setMenuList(items: MenuListItem[]) {
    menuList.value = items
    menuLoaded.value = true
  }

  function setMenuSheets(sheets: string[]) {
    menuSheets.value = prioritizeMenuSheets(sheets, true)
  }

  function setActiveMenuSheet(sheet: string) {
    if (!isValidSheet(sheet)) return
    const clean = normalizeMenuSheetName(sheet)
    activeMenuSheet.value = clean
    localStorage.setItem('kg_v400_menu_sheet', clean)
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
    loadMenu,
    setMenuList,
    setMenuSheets,
    setActiveMenuSheet
  }
})
