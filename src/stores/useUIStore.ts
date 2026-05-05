import { defineStore } from 'pinia'
import { reactive, ref, computed } from 'vue'
import { sound } from '@/utils/audio'

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
  const tab = ref<'create' | 'timeline' | 'history' | 'preview' | 'analytics'>('timeline')
  const connectionStatus = ref<'online' | 'syncing' | 'error'>('online')
  const isKeyboardOpen = ref(false)
  const isVoiceSupported = ref(false)

  // --- Loading ---
  const loading = reactive({ is: false, msg: '', subMsg: '' })
  const activeRequests = ref(0)
  const isFetchingAPI = computed(() => activeRequests.value > 0)

  // --- Error ---
  const error = reactive({ show: false, msg: '' })

  // --- Modal Visibility ---
  const showSettingsHub = ref(false)
  const activeSettingModal = ref<string | null>(null)
  
  // Modals that might still need individual visibility
  const showAiConfig = ref(false)
  const showBankConfig = ref(false)
  const showMenuManager = ref(false)
  const showBrandingConfig = ref(false)
  const showStaffConfig = ref(false)
  const showWebhookConfig = ref(false)
  const showFloorPlan = ref(false)
  const showCustomerCareModal = ref(false)
  const activeOrderForCare = ref<any>(null)
  
  const showStaffSelector = ref(false)
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
  const historyFilters = reactive({
    time: 'all',
    status: 'all',
    deposit: 'all',
    sort: 'newest'
  })

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
    if (type === 'success') sound.playSuccess()
    else if (type === 'error' || type === 'warning') sound.playError()
    else sound.playPop()

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
    sound.playPop()
    return new Promise((resolve) => {
      modal.alert = { show: true, title, msg, resolve }
    })
  }

  function showConfirm(title: string, msg: string): Promise<boolean> {
    sound.playPop()
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
    if (!showSettingsHub.value) {
      showSettingsHub.value = true
    }
    activeSettingModal.value = type
  }

  function closeConfig() {
    activeSettingModal.value = null
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
    loading, activeRequests, isFetchingAPI, error,
    showSettingsHub, activeSettingModal, showAiConfig, showBankConfig, showMenuManager, showBrandingConfig, showStaffConfig, showStaffSelector, showWebhookConfig, showBookingDetailModal, showFloorPlan, showCustomerCareModal, activeOrderForCare, selectedBooking,
    pendingAction, menuTab, isUpdateMode,
    historySearch, isBatchMode, selectedIds, historyFilters,
    focusIdx, listening, tempTable,
    toasts, verifyModal, modal,
    showToast, removeToast,
    resolveModal, showAlert, showConfirm, showPrompt,
    openConfig, closeConfig, toggleBatchMode, toggleSelection
  }
})
