import { defineStore } from 'pinia'
import { reactive, ref, computed, watch } from 'vue'
import { sound } from '@/utils/audio'

export interface Toast {
  id: number
  title: string
  msg: string
  type: 'success' | 'error' | 'warning' | 'info'
  progress?: number
  duration?: number
  timerId?: any
}

export interface ModalState {
  show: boolean
  title: string
  msg: string
  value?: string
  resolve: ((value: any) => void) | null
}

export const useUIStore = defineStore('ui', () => {
  // --- Version Mode (v3.0 Parallel Operation with v2.5.0) ---
  const loadInitialVersion = (): '2.5.0' | '3.0' => {
    try {
      const saved = localStorage.getItem('kg_app_ui_version')
      if (saved === '2.5.0' || saved === '3.0') return saved
    } catch {}
    return '3.0'
  }
  const appVersion = ref<'2.5.0' | '3.0'>(loadInitialVersion())
  const isV3 = computed(() => appVersion.value === '3.0')

  // --- Tab & Panel ---
  const tab = ref<'dashboard' | 'create' | 'timeline' | 'history' | 'preview' | 'analytics' | 'test' | 'logs'>('create')
  const connectionStatus = ref<'online' | 'degraded' | 'offline' | 'reconnecting' | 'syncing' | 'error'>('online')
  const isKeyboardOpen = ref(false)
  const isVoiceSupported = ref(false)

  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      connectionStatus.value = 'reconnecting'
      setTimeout(() => {
        if (connectionStatus.value === 'reconnecting') {
          connectionStatus.value = 'online'
        }
      }, 1200)
    })
    window.addEventListener('offline', () => {
      connectionStatus.value = 'offline'
    })
    if (!navigator.onLine) {
      connectionStatus.value = 'offline'
    }
  }

  const todayStr = () => {
    const d = new Date()
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  }
  const selectedTimelineDate = ref(todayStr())

  // --- Loading ---
  const loading = reactive({ is: false, msg: '', subMsg: '' })
  const activeRequests = ref(0)
  const isFetchingAPI = computed(() => activeRequests.value > 0)

  // --- Error ---
  const error = reactive({ show: false, msg: '' })

  // --- Modal Visibility ---
  const showSettingsHub = ref(false)
  const activeSettingModal = ref<string | null>(null)
  const showCommandPalette = ref(false)
  
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
  const isDarkMode = ref(localStorage.getItem('kg_dark_mode') === 'true')
  
  const showStaffSelector = ref(false)
  const showBookingDetailModal = ref(false)
  const showVersionModal = ref(false)
  const showSocialBotModal = ref(false)
  const showOutboxModal = ref(false)
  const showBookingConfirmationModal = ref(false)
  const bookingConfirmationPayload = ref<any>(null)
  const bookingConfirmationResolve = ref<((value: boolean) => void) | null>(null)

  const selectedBooking = ref<any>(null)
  const pendingAction = ref<string | null>(null)

  // --- Active Shift Staff Pinning & Live Bill Studio Dock ---
  const loadSavedShiftStaff = (): { name: string; phone: string; role?: string } | null => {
    try {
      const raw = localStorage.getItem('kg_active_shift_staff')
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed.name === 'string' && parsed.name.trim()) {
        return parsed
      }
    } catch {}
    return null
  }
  const activeShiftStaff = ref<{ name: string; phone: string; role?: string } | null>(loadSavedShiftStaff())
  const pinShiftStaff = ref<boolean>(localStorage.getItem('kg_pin_shift_staff') !== 'false')
  const showLiveBillDock = ref<boolean>(localStorage.getItem('kg_show_live_bill_dock') !== 'false')

  function setActiveShiftStaff(staff: { name: string; phone: string; role?: string } | null, pin = true) {
    activeShiftStaff.value = staff
    pinShiftStaff.value = pin
    try {
      if (staff && pin) {
        localStorage.setItem('kg_active_shift_staff', JSON.stringify(staff))
      } else {
        localStorage.removeItem('kg_active_shift_staff')
      }
      localStorage.setItem('kg_pin_shift_staff', String(pin))
    } catch {}
  }

  function toggleLiveBillDock() {
    showLiveBillDock.value = !showLiveBillDock.value
    try {
      localStorage.setItem('kg_show_live_bill_dock', String(showLiveBillDock.value))
    } catch {}
  }

  // --- Menu Tab ---
  const menuTab = ref<'select' | 'upload'>('select')
  const isUpdateMode = ref(false)
  const showMenuUploadModal = ref(false)

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
    const toast = reactive<Toast>({ id, title: titleMap[type], msg, type, progress: 100, duration })
    toasts.value.push(toast)

    const timer = setTimeout(() => {
      removeToast(id)
    }, duration)
    toast.timerId = timer
  }

  function removeToast(id: number) {
    const target = toasts.value.find(t => t.id === id)
    if (target && target.timerId) {
      clearTimeout(target.timerId)
    }
    toasts.value = toasts.value.filter(t => t.id !== id)
  }

  // --- Promise-based Modal System ---
  function resolveModal(type: 'alert' | 'confirm' | 'prompt', value?: any) {
    const resolveFn = modal[type].resolve
    modal[type].resolve = null
    modal[type].show = false
    if (resolveFn) {
      resolveFn(value)
    }
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

  // --- Draft Protection Conflict Modal ---
  const draftConflictModal = reactive({
    show: false,
    draftSummary: '',
    historicName: '',
    resolve: null as ((action: 'save' | 'discard' | 'cancel') => void) | null
  })

  function promptDraftConflict(draftSummary: string, historicName: string): Promise<'save' | 'discard' | 'cancel'> {
    sound.playPop()
    return new Promise((resolve) => {
      draftConflictModal.show = true
      draftConflictModal.draftSummary = draftSummary
      draftConflictModal.historicName = historicName
      draftConflictModal.resolve = resolve
    })
  }

  function resolveDraftConflict(action: 'save' | 'discard' | 'cancel') {
    if (draftConflictModal.resolve) {
      draftConflictModal.resolve(action)
      draftConflictModal.resolve = null
    }
    draftConflictModal.show = false
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
    showMenuManager.value = false
  }

  watch(showMenuManager, (val) => {
    if (val) {
      openConfig('menu')
    }
  })

  // --- Batch Mode ---
  function toggleBatchMode() {
    isBatchMode.value = !isBatchMode.value
    selectedIds.value = []
  }

  function toggleDarkMode() {
    isDarkMode.value = !isDarkMode.value
    localStorage.setItem('kg_dark_mode', String(isDarkMode.value))
    if (isDarkMode.value) {
      document.documentElement.classList.add('dark-theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark-theme', 'dark')
    }
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

  function openBookingConfirmation(payload: any): Promise<boolean> {
    sound.playPop()
    bookingConfirmationPayload.value = payload
    showBookingConfirmationModal.value = true
    return new Promise((resolve) => {
      bookingConfirmationResolve.value = resolve
    })
  }

  function resolveBookingConfirmation(confirmed: boolean) {
    if (bookingConfirmationResolve.value) {
      bookingConfirmationResolve.value(confirmed)
      bookingConfirmationResolve.value = null
    }
    showBookingConfirmationModal.value = false
    bookingConfirmationPayload.value = null
  }

  function setAppVersion(ver: '2.5.0' | '3.0', notify = true) {
    appVersion.value = ver
    try {
      localStorage.setItem('kg_app_ui_version', ver)
    } catch {}
    if (ver === '3.0') {
      if (tab.value === 'dashboard' || tab.value === 'timeline') {
        tab.value = 'create'
      }
      showFloorPlan.value = false
      showSocialBotModal.value = false
    }
    if (notify) {
      showToast(
        ver === '3.0'
          ? '⚡ Đã chuyển sang Phiên bản 3.0 (Tinh gọn & Tối ưu tốc độ thao tác)'
          : '🔄 Đã chuyển về Phiên bản 2.5.0 (Đầy đủ phân hệ truyền thống)',
        'info',
        2600
      )
    }
  }

  function toggleAppVersion() {
    setAppVersion(appVersion.value === '3.0' ? '2.5.0' : '3.0', true)
  }

  return {
    appVersion, isV3, setAppVersion, toggleAppVersion,
    tab, connectionStatus, isKeyboardOpen, isVoiceSupported, selectedTimelineDate,
    loading, activeRequests, isFetchingAPI, error,
    showSettingsHub, activeSettingModal, showCommandPalette, showAiConfig, showBankConfig, showMenuManager, showBrandingConfig, showStaffConfig, showStaffSelector, showWebhookConfig, showBookingDetailModal, showVersionModal, showSocialBotModal, showOutboxModal, showBookingConfirmationModal, bookingConfirmationPayload, showFloorPlan, showCustomerCareModal, activeOrderForCare, selectedBooking,


    pendingAction, activeShiftStaff, pinShiftStaff, showLiveBillDock, menuTab, isUpdateMode, isDarkMode, showMenuUploadModal,
    historySearch, isBatchMode, selectedIds, historyFilters,
    focusIdx, listening, tempTable,
    toasts, verifyModal, modal, draftConflictModal,
    showToast, removeToast,
    resolveModal, showAlert, showConfirm, showPrompt, promptDraftConflict, resolveDraftConflict,
    openBookingConfirmation, resolveBookingConfirmation, setActiveShiftStaff, toggleLiveBillDock,
    openConfig, closeConfig, toggleBatchMode, toggleSelection, toggleDarkMode
  }
})
