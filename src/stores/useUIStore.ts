import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'

export interface Toast {
  id: number
  title: string
  msg: string
  type: 'success' | 'error' | 'warning' | 'info'
  progress: number
}

export interface ModalState {
  show: boolean
  title: string
  msg: string
  value?: string
  resolve: ((value: any) => void) | null
}

export const useUIStore = defineStore('ui', () => {
  // --- Tab & Panel ---
  const tab = ref<'create' | 'history' | 'preview'>('history')
  const connectionStatus = ref<'online' | 'syncing' | 'error'>('online')
  const isKeyboardOpen = ref(false)
  const isVoiceSupported = ref(false)

  // --- Loading ---
  const loading = reactive({ is: false, msg: '', subMsg: '' })

  // --- Error ---
  const error = reactive({ show: false, msg: '' })

  // --- Modal Visibility ---
  const showSettingsHub = ref(false)
  const showAiConfig = ref(false)
  const showBankConfig = ref(false)
  const showMenuManager = ref(false)
  const showBrandingConfig = ref(false)
  const showStaffConfig = ref(false)
  const showStaffSelector = ref(false)
  const showWebhookConfig = ref(false)
  const showBookingDetailModal = ref(false)
  const selectedBooking = ref<any>(null)
  const pendingAction = ref<string | null>(null)

  // --- Menu Tab ---
  const menuTab = ref<'select' | 'upload'>('select')
  const isUpdateMode = ref(false)

  // --- History ---
  const historySearch = ref('')
  const isBatchMode = ref(false)
  const selectedIds = ref<string[]>([])

  // --- Form UI ---
  const focusIdx = ref<number | null>(null)
  const listening = ref(false)
  const tempTable = reactive({ zone: 'A', number: '' })

  // --- Toasts ---
  const toasts = ref<Toast[]>([])

  // --- Verify Modal ---
  const verifyModal = reactive({
    show: false,
    scanned: { amount: 0, content: '' },
    expected: { amount: 0 }
  })

  // --- Promise-based Modals ---
  const modal = reactive({
    alert: { show: false, title: '', msg: '', resolve: null } as ModalState,
    confirm: { show: false, title: '', msg: '', resolve: null } as ModalState,
    prompt: { show: false, title: '', msg: '', value: '', resolve: null } as ModalState
  })

  // --- Toast System ---
  function showToast(msg: string, type: Toast['type'] = 'info', duration = 3000) {
    const id = Date.now()
    const titleMap: Record<string, string> = { success: 'Thành Công', error: 'Lỗi', warning: 'Cảnh Báo', info: 'Thông Tin' }
    const toast = reactive<Toast>({ id, title: titleMap[type], msg, type, progress: 100 })
    toasts.value.push(toast)

    const step = 10
    const interval = setInterval(() => {
      toast.progress -= (step / duration) * 100
      if (toast.progress <= 0) {
        clearInterval(interval)
        removeToast(id)
      }
    }, step)
  }

  function removeToast(id: number) {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }

  // --- Promise-based Modal System ---
  function resolveModal(type: 'alert' | 'confirm' | 'prompt', value?: any) {
    if (modal[type].resolve) {
      modal[type].resolve!(value)
      modal[type].resolve = null
    }
    modal[type].show = false
  }

  function showAlert(title: string, msg: string): Promise<void> {
    return new Promise((resolve) => {
      modal.alert = { show: true, title, msg, resolve }
    })
  }

  function showConfirm(title: string, msg: string): Promise<boolean> {
    return new Promise((resolve) => {
      modal.confirm = { show: true, title, msg, resolve }
    })
  }

  function showPrompt(title: string, msg: string, defaultValue = ''): Promise<string | null> {
    return new Promise((resolve) => {
      modal.prompt = { show: true, title, msg, value: defaultValue, resolve }
    })
  }

  // --- Settings Hub ---
  function openConfig(type: string) {
    showSettingsHub.value = false
    if (type === 'branding') showBrandingConfig.value = true
    if (type === 'menu') showMenuManager.value = true
    if (type === 'bank') showBankConfig.value = true
    if (type === 'ai') showAiConfig.value = true
    if (type === 'staff') showStaffConfig.value = true
    if (type === 'webhook') showWebhookConfig.value = true
  }

  // --- Batch Mode ---
  function toggleBatchMode() {
    isBatchMode.value = !isBatchMode.value
    selectedIds.value = []
  }

  function toggleSelection(group: any) {
    const id = group.latest.id
    const key = id || `${group.latest.parsedCustomer.name}|${group.latest.parsedCustomer.phone}|${group.latest.parsedCustomer.date}`
    if (selectedIds.value.includes(key)) {
      selectedIds.value = selectedIds.value.filter((i: string) => i !== key)
    } else {
      selectedIds.value.push(key)
    }
  }

  return {
    tab, connectionStatus, isKeyboardOpen, isVoiceSupported,
    loading, error,
    showSettingsHub, showAiConfig, showBankConfig, showMenuManager, showBrandingConfig, showStaffConfig, showStaffSelector, showWebhookConfig, showBookingDetailModal, selectedBooking,
    pendingAction, menuTab, isUpdateMode,
    historySearch, isBatchMode, selectedIds,
    focusIdx, listening, tempTable,
    toasts, verifyModal, modal,
    showToast, removeToast,
    resolveModal, showAlert, showConfirm, showPrompt,
    openConfig, toggleBatchMode, toggleSelection
  }
})
