import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useOrderStore } from '../useOrderStore'
import { useMenuStore } from '../useMenuStore'
import { useAdminStore } from '../useAdminStore'
import { useBankStaffStore } from '../useBankStaffStore'
import { useAppStore } from '../useAppStore'

describe('Modular Pinia Stores & Facade Integration Tests', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should initialize useOrderStore independently', () => {
    const orderStore = useOrderStore()
    expect(orderStore.historyList).toBeDefined()
    expect(Array.isArray(orderStore.historyList)).toBe(true)
    expect(orderStore.getCrmStatus('0901234567')).toBe('Khách mới')
  })

  it('should initialize useMenuStore independently', () => {
    const menuStore = useMenuStore()
    expect(menuStore.menuList).toBeDefined()
    expect(menuStore.activeSheet).toBe('Menu')
  })

  it('should initialize useAdminStore independently', () => {
    const adminStore = useAdminStore()
    expect(adminStore.currentUserRole).toBe('staff')
    expect(adminStore.isAdminSettingsUnlocked).toBe(false)
  })

  it('should initialize useBankStaffStore independently', () => {
    const bankStaffStore = useBankStaffStore()
    expect(bankStaffStore.bankList).toBeDefined()
    expect(bankStaffStore.staffList).toBeDefined()
  })

  it('should bridge all stores seamlessly through useAppStore Facade', () => {
    const appStore = useAppStore()
    expect(appStore.historyList).toBeDefined()
    expect(appStore.menuList).toBeDefined()
    expect(appStore.adminToken).toBe('')
    expect(appStore.bankList).toBeDefined()
  })
})
