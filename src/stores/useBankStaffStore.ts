import { defineStore } from 'pinia'
import { ref, reactive, computed } from 'vue'
import { CACHE_KEYS, DEFAULTS } from '@/utils/constants'
import { useUIStore } from './useUIStore'
import { DualWriteSettingsRepository as GasSettingsRepository } from '@/infrastructure/dual/dualWriteRepository'
import { triggerSync as triggerOutboxSync } from '@/infrastructure/outbox/outboxSync'

const settingsRepo = new GasSettingsRepository()

export const useBankStaffStore = defineStore('bankStaff', () => {
  const uiStore = useUIStore()

  // --- Bank State ---
  const bankList = ref<any[]>(JSON.parse(localStorage.getItem(CACHE_KEYS.BANK) || DEFAULTS.BANKS))
  const selectedBankIndex = ref(parseInt(localStorage.getItem(CACHE_KEYS.SELECTED_BANK) || '0'))
  const defaultBankAccountIndex = ref(parseInt(localStorage.getItem('default_bank_account_index') || '-1'))
  const newBank = reactive({ bankId: '', name: '', number: '', owner: '', template: 'compact' })

  // --- Staff State ---
  const staffList = ref<any[]>(JSON.parse(localStorage.getItem(CACHE_KEYS.STAFF) || DEFAULTS.STAFF))
  const newStaff = reactive({ name: '', phone: '' })

  const showPortalMinigames = ref(localStorage.getItem('showPortalMinigames') === 'true')

  const currentBank = computed(() => bankList.value[selectedBankIndex.value] || bankList.value[0])

  function selectBank(idx: number) {
    selectedBankIndex.value = idx
    localStorage.setItem(CACHE_KEYS.SELECTED_BANK, String(idx))
  }

  function setDefaultBankAccount(index: number) {
    defaultBankAccountIndex.value = index
    localStorage.setItem('default_bank_account_index', String(index))
    if (index >= 0 && index < bankList.value.length) {
      selectBank(index)
      uiStore.showToast(`Đã chọn tài khoản ngân hàng mặc định`, 'info')
    }
  }

  async function updateRemoteConfig(type: 'bank' | 'staff' | 'all') {
    try {
      const payload: Record<string, any> = {}
      if (type === 'bank' || type === 'all') payload.bankList = JSON.stringify(bankList.value)
      if (type === 'staff' || type === 'all') payload.staffList = JSON.stringify(staffList.value)
      await settingsRepo.saveConfig(payload)
    } catch (e) {
      console.warn('[RemoteConfig] Local fallback saved, sync postponed')
    }
  }

  async function addBank() {
    if (!newBank.number || !newBank.bankId) return uiStore.showToast('Thiếu thông tin ngân hàng!', 'warning')
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

  async function fetchRemoteConfig() {
    const hasCachedConfig = localStorage.getItem('kg_v400_webhookUrl') || localStorage.getItem('showPortalMinigames')
    if (!hasCachedConfig) {
      uiStore.connectionStatus = 'syncing'
    }
    try {
      const result = await settingsRepo.getConfig((freshConfig) => {
        if (freshConfig && freshConfig.ok && freshConfig.data) {
          processRemoteConfigPayload(freshConfig.data)
        }
      })
      if (result.ok && result.data) {
        uiStore.connectionStatus = 'online'
        processRemoteConfigPayload(result.data)
      } else {
        if (!hasCachedConfig) {
          uiStore.connectionStatus = 'error'
        }
      }
    } catch (e) {
      console.warn('Config Sync Failed (Offline Mode)', e)
      if (!hasCachedConfig) {
        uiStore.connectionStatus = 'error'
      }
    }
    triggerOutboxSync()
  }

  function processRemoteConfigPayload(data: Record<string, any>) {
    let hasChanges = false
    if (data.bankList) {
      try {
        const sBanks = JSON.parse(data.bankList)
        if (Array.isArray(sBanks) && sBanks.length > 0) {
          bankList.value = sBanks
          localStorage.setItem(CACHE_KEYS.BANK, data.bankList)
          hasChanges = true
        }
      } catch { /* ignore */ }
    }
    if (data.staffList) {
      try {
        const sStaff = JSON.parse(data.staffList)
        if (Array.isArray(sStaff) && sStaff.length > 0) {
          staffList.value = sStaff
          localStorage.setItem(CACHE_KEYS.STAFF, data.staffList)
          hasChanges = true
        }
      } catch { /* ignore */ }
    }
    if (data.webhookUrl) {
      localStorage.setItem('kg_v400_webhookUrl', data.webhookUrl)
      hasChanges = true
    }
    if (data.telegramChatId) {
      localStorage.setItem('kg_v400_telegramChatId', data.telegramChatId)
      hasChanges = true
    }
    if (data.showPortalMinigames !== undefined) {
      showPortalMinigames.value = String(data.showPortalMinigames) === 'true'
      localStorage.setItem('showPortalMinigames', String(showPortalMinigames.value))
      hasChanges = true
    }
    
    if (data.default_bank_account_id) {
      const accountId = data.default_bank_account_id
      localStorage.setItem('default_bank_account_id', accountId)
      const index = bankList.value.findIndex((b: any) => b.bankId === accountId || b.number === accountId)
      if (index !== -1) {
        defaultBankAccountIndex.value = index
        selectedBankIndex.value = index
        localStorage.setItem(CACHE_KEYS.SELECTED_BANK, String(index))
      }
    }

    if (hasChanges) {
      uiStore.showToast('Đã đồng bộ cấu hình từ Server', 'info')
    }
  }

  return {
    bankList,
    selectedBankIndex,
    defaultBankAccountIndex,
    newBank,
    currentBank,
    staffList,
    newStaff,
    showPortalMinigames,
    selectBank,
    setDefaultBankAccount,
    addBank,
    removeBank,
    addStaff,
    removeStaff,
    fetchRemoteConfig,
    processRemoteConfigPayload,
    updateRemoteConfig
  }
})
