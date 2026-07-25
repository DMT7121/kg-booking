import { defineStore } from 'pinia'
import { computed } from 'vue'
import { useOrderStore } from './useOrderStore'
import { useMenuStore } from './useMenuStore'
import { useAdminStore } from './useAdminStore'
import { useBankStaffStore } from './useBankStaffStore'

export type { HistoryOrder, BookingConflict, NormalizedBookingTime } from './useOrderStore'
export type { MenuListItem } from './useMenuStore'
export { 
  hasTimeConflictIndexed, 
  hasTimeConflict, 
  addOrderToTimeIndex, 
  removeOrderFromTimeIndex, 
  updateOrderInTimeIndex, 
  rebuildBookingTimeIndex 
} from './useOrderStore'

export type OfflineQueueItemStatus =
  | 'pending'
  | 'syncing'
  | 'synced'
  | 'failed'
  | 'conflict'
  | 'deferred';

export const useAppStore = defineStore('app', () => {
  const orderStore = useOrderStore()
  const menuStore = useMenuStore()
  const adminStore = useAdminStore()
  const bankStaffStore = useBankStaffStore()

  return {
    // --- Order & History Domain (Computed wrappers guarantee 100% Vue reactivity tracking) ---
    historyList: computed({
      get: () => orderStore.historyList,
      set: (val) => { orderStore.historyList = val }
    }),
    groupedHistory: computed(() => orderStore.groupedHistory),
    filteredHistory: computed(() => orderStore.filteredHistory),
    activeConflicts: computed({
      get: () => orderStore.activeConflicts,
      set: (val) => { orderStore.activeConflicts = val }
    }),
    offlineQueueCount: computed({
      get: () => orderStore.offlineQueueCount,
      set: (val) => { orderStore.offlineQueueCount = val }
    }),
    
    getCrmStatus: orderStore.getCrmStatus,
    computeDiff: orderStore.computeDiff,
    setOptimisticOrder: orderStore.setOptimisticOrder,
    markOrderSynced: orderStore.markOrderSynced,
    markOrderFailed: orderStore.markOrderFailed,
    loadHistory: orderStore.loadHistory,
    saveOrder: orderStore.saveOrder,
    deleteOrder: (id: string, staffName?: string, staffPhone?: string) => orderStore.deleteOrder(id, staffName, staffPhone),
    syncBookingCalendar: (id?: string) => orderStore.syncBookingCalendar(id),
    saveConflicts: orderStore.saveConflicts,
    resolveConflict: orderStore.resolveConflict,
    updateOfflineQueueCount: orderStore.updateOfflineQueueCount,

    // --- Menu Domain ---
    menuList: computed({
      get: () => menuStore.menuList,
      set: (val) => { menuStore.menuList = val }
    }),
    menuDetails: computed({
      get: () => menuStore.menuDetails,
      set: (val) => { menuStore.menuDetails = val }
    }),
    menuImages: computed(() => menuStore.menuImages),
    dishImages: computed(() => menuStore.dishImages),
    menuSheets: computed({
      get: () => menuStore.menuSheets,
      set: (val) => { menuStore.menuSheets = val }
    }),
    activeSheet: computed({
      get: () => menuStore.activeSheet,
      set: (val) => { menuStore.activeSheet = val }
    }),
    newMenuName: computed({
      get: () => menuStore.newMenuName,
      set: (val) => { menuStore.newMenuName = val }
    }),
    newMenuContent: computed({
      get: () => menuStore.newMenuContent,
      set: (val) => { menuStore.newMenuContent = val }
    }),
    defaultMenuProfileId: computed(() => menuStore.defaultMenuProfileId),
    menuAliases: computed(() => menuStore.menuAliases),
    aiCorrections: computed(() => menuStore.aiCorrections),
    menuFingerprint: computed(() => menuStore.menuFingerprint),
    correctionFingerprint: computed(() => menuStore.correctionFingerprint),
    
    loadMenuAliases: menuStore.loadMenuAliases,
    saveAlias: (alias: string, dishName: string) => menuStore.saveAlias(alias, dishName, adminStore.adminToken),
    deleteAlias: (alias: string) => menuStore.deleteAlias(alias, adminStore.adminToken),
    loadAiCorrections: menuStore.loadAiCorrections,
    logAiCorrection: (inputText: string, wrongValue: any, correctValue: any, field: string, token?: string) => menuStore.logAiCorrection(inputText, wrongValue, correctValue, field, token || adminStore.adminToken),
    learnFromStaffCorrection: menuStore.learnFromStaffCorrection,
    setDefaultMenuProfile: menuStore.setDefaultMenuProfile,
    computeMenuFingerprint: menuStore.computeMenuFingerprint,
    computeCorrectionFingerprint: menuStore.computeCorrectionFingerprint,
    fetchMenu: menuStore.fetchMenu,
    fetchSheets: menuStore.fetchSheets,
    switchMenu: menuStore.switchMenu,
    uploadNewMenu: () => menuStore.uploadNewMenu(adminStore.adminToken, adminStore.verifyAdminSession),
    deleteMenu: (sheetName: string) => menuStore.deleteMenu(sheetName, adminStore.adminToken, adminStore.verifyAdminSession),
    uploadMenuImageStore: (base64: string) => menuStore.uploadMenuImageStore(base64, adminStore.adminToken, adminStore.verifyAdminSession),
    uploadDishImageStore: (dishId: string, base64: string) => menuStore.uploadDishImageStore(dishId, base64, adminStore.adminToken, adminStore.verifyAdminSession),
    scheduleMenuPrefetch: menuStore.scheduleMenuPrefetch,
    scheduleMenusPrecache: menuStore.scheduleMenusPrecache,

    // --- Bank & Staff Config Domain ---
    bankList: computed(() => bankStaffStore.bankList),
    selectedBankIndex: computed({
      get: () => bankStaffStore.selectedBankIndex,
      set: (val) => { bankStaffStore.selectedBankIndex = val }
    }),
    defaultBankAccountIndex: computed(() => bankStaffStore.defaultBankAccountIndex),
    newBank: computed(() => bankStaffStore.newBank),
    currentBank: computed(() => bankStaffStore.currentBank),
    staffList: computed(() => bankStaffStore.staffList),
    newStaff: computed(() => bankStaffStore.newStaff),
    showPortalMinigames: computed({
      get: () => bankStaffStore.showPortalMinigames,
      set: (val) => { bankStaffStore.showPortalMinigames = val }
    }),
    
    selectBank: bankStaffStore.selectBank,
    setDefaultBankAccount: bankStaffStore.setDefaultBankAccount,
    addBank: bankStaffStore.addBank,
    removeBank: bankStaffStore.removeBank,
    addStaff: bankStaffStore.addStaff,
    removeStaff: bankStaffStore.removeStaff,
    fetchRemoteConfig: bankStaffStore.fetchRemoteConfig,
    processRemoteConfigPayload: bankStaffStore.processRemoteConfigPayload,
    updateRemoteConfig: bankStaffStore.updateRemoteConfig,

    // --- Admin & Security Domain ---
    adminToken: computed({
      get: () => adminStore.adminToken,
      set: (val) => { adminStore.adminToken = val }
    }),
    adminExpiresAt: computed(() => adminStore.adminExpiresAt),
    currentUserRole: computed(() => adminStore.currentUserRole),
    isAdminSettingsUnlocked: computed(() => adminStore.isAdminSettingsUnlocked),
    unlockAdminSettings: adminStore.unlockAdminSettings,
    lockAdminSettings: adminStore.lockAdminSettings,
    logout: adminStore.logout,
    handleInactivityTimeout: adminStore.handleInactivityTimeout,
    verifyAdminSession: adminStore.verifyAdminSession,
    verifySession: adminStore.verifySession
  }
})
