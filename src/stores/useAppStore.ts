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
    // --- Order & History Domain ---
    historyList: orderStore.historyList,
    groupedHistory: orderStore.groupedHistory,
    filteredHistory: orderStore.filteredHistory,
    activeConflicts: orderStore.activeConflicts,
    offlineQueueCount: orderStore.offlineQueueCount,
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
    menuList: menuStore.menuList,
    menuDetails: menuStore.menuDetails,
    menuImages: menuStore.menuImages,
    dishImages: menuStore.dishImages,
    menuSheets: menuStore.menuSheets,
    activeSheet: menuStore.activeSheet,
    newMenuName: menuStore.newMenuName,
    newMenuContent: menuStore.newMenuContent,
    defaultMenuProfileId: menuStore.defaultMenuProfileId,
    menuAliases: menuStore.menuAliases,
    aiCorrections: menuStore.aiCorrections,
    menuFingerprint: menuStore.menuFingerprint,
    correctionFingerprint: menuStore.correctionFingerprint,
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
    bankList: bankStaffStore.bankList,
    selectedBankIndex: bankStaffStore.selectedBankIndex,
    defaultBankAccountIndex: bankStaffStore.defaultBankAccountIndex,
    newBank: bankStaffStore.newBank,
    currentBank: bankStaffStore.currentBank,
    staffList: bankStaffStore.staffList,
    newStaff: bankStaffStore.newStaff,
    showPortalMinigames: bankStaffStore.showPortalMinigames,
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
    adminToken: adminStore.adminToken,
    adminExpiresAt: adminStore.adminExpiresAt,
    currentUserRole: adminStore.currentUserRole,
    isAdminSettingsUnlocked: adminStore.isAdminSettingsUnlocked,
    unlockAdminSettings: adminStore.unlockAdminSettings,
    lockAdminSettings: adminStore.lockAdminSettings,
    verifyAdminSession: adminStore.verifyAdminSession,
    verifySession: adminStore.verifySession,
    logout: adminStore.logout,
    handleInactivityTimeout: adminStore.handleInactivityTimeout,
    triggerAuditLog: adminStore.triggerAuditLog,
    maskPii: adminStore.maskPii
  }
})
