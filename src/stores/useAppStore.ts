import { defineStore } from 'pinia'
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
    // --- Order & History Domain (Getters/Setters preserve 100% Vue reactivity across stores) ---
    get historyList() { return orderStore.historyList },
    set historyList(val) { orderStore.historyList = val },
    get groupedHistory() { return orderStore.groupedHistory },
    get filteredHistory() { return orderStore.filteredHistory },
    get activeConflicts() { return orderStore.activeConflicts },
    set activeConflicts(val) { orderStore.activeConflicts = val },
    get offlineQueueCount() { return orderStore.offlineQueueCount },
    set offlineQueueCount(val) { orderStore.offlineQueueCount = val },
    
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
    get menuList() { return menuStore.menuList },
    set menuList(val) { menuStore.menuList = val },
    get menuDetails() { return menuStore.menuDetails },
    set menuDetails(val) { menuStore.menuDetails = val },
    get menuImages() { return menuStore.menuImages },
    get dishImages() { return menuStore.dishImages },
    get menuSheets() { return menuStore.menuSheets },
    set menuSheets(val) { menuStore.menuSheets = val },
    get activeSheet() { return menuStore.activeSheet },
    set activeSheet(val) { menuStore.activeSheet = val },
    get newMenuName() { return menuStore.newMenuName },
    set newMenuName(val) { menuStore.newMenuName = val },
    get newMenuContent() { return menuStore.newMenuContent },
    set newMenuContent(val) { menuStore.newMenuContent = val },
    get defaultMenuProfileId() { return menuStore.defaultMenuProfileId },
    get menuAliases() { return menuStore.menuAliases },
    get aiCorrections() { return menuStore.aiCorrections },
    get menuFingerprint() { return menuStore.menuFingerprint },
    get correctionFingerprint() { return menuStore.correctionFingerprint },
    
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
    get bankList() { return bankStaffStore.bankList },
    get selectedBankIndex() { return bankStaffStore.selectedBankIndex },
    set selectedBankIndex(val) { bankStaffStore.selectedBankIndex = val },
    get defaultBankAccountIndex() { return bankStaffStore.defaultBankAccountIndex },
    get newBank() { return bankStaffStore.newBank },
    get currentBank() { return bankStaffStore.currentBank },
    get staffList() { return bankStaffStore.staffList },
    get newStaff() { return bankStaffStore.newStaff },
    get showPortalMinigames() { return bankStaffStore.showPortalMinigames },
    set showPortalMinigames(val) { bankStaffStore.showPortalMinigames = val },
    
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
    get adminToken() { return adminStore.adminToken },
    set adminToken(val) { adminStore.adminToken = val },
    get adminExpiresAt() { return adminStore.adminExpiresAt },
    get currentUserRole() { return adminStore.currentUserRole },
    get isAdminSettingsUnlocked() { return adminStore.isAdminSettingsUnlocked },
    unlockAdminSettings: adminStore.unlockAdminSettings,
    lockAdminSettings: adminStore.lockAdminSettings,
    logout: adminStore.logout,
    handleInactivityTimeout: adminStore.handleInactivityTimeout,
    verifyAdminSession: adminStore.verifyAdminSession,
    verifySession: adminStore.verifySession
  }
})
