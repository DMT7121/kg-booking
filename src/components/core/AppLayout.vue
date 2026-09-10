<script setup lang="ts">
import { sound } from '@/utils/audio'
import { useUIStore } from '@/stores/useUIStore'
import { useFormStore } from '@/stores/useFormStore'
import { useAppStore } from '@/stores/useAppStore'
import { useConfigStore } from '@/stores/useConfigStore'
import { useBillRender } from '@/composables/useBillRender'
import { useForm } from '@/composables/useForm'
import { isIOS } from '@/utils'
import { onMounted, onUnmounted, ref, computed, watch, nextTick, defineAsyncComponent } from 'vue'
import LeftPanel from './LeftPanel.vue'
import BillPreview from './BillPreview.vue'

// Lazy-loaded Modals (only fetched when user opens them → ~40% smaller initial bundle)
const AiConfigModal = defineAsyncComponent(() => import('@/components/modals/AiConfigModal.vue'))
const StaffModal = defineAsyncComponent(() => import('@/components/modals/StaffModal.vue'))
const MenuManagerModal = defineAsyncComponent(() => import('@/components/modals/MenuManagerModal.vue'))
const BankConfigModal = defineAsyncComponent(() => import('@/components/modals/BankConfigModal.vue'))
const BrandingModal = defineAsyncComponent(() => import('@/components/modals/BrandingModal.vue'))
const VerifyTransferModal = defineAsyncComponent(() => import('@/components/modals/VerifyTransferModal.vue'))
const WebhookConfigModal = defineAsyncComponent(() => import('@/components/modals/WebhookConfigModal.vue'))
const BookingDetailModal = defineAsyncComponent(() => import('@/components/modals/BookingDetailModal.vue'))
const FloorPlanModal = defineAsyncComponent(() => import('@/components/modals/FloorPlanModal.vue'))
const CustomerCareModal = defineAsyncComponent(() => import('@/components/modals/CustomerCareModal.vue'))
const GuideConfigModal = defineAsyncComponent(() => import('@/components/modals/GuideConfigModal.vue'))
const ConflictResolutionModal = defineAsyncComponent(() => import('@/components/modals/ConflictResolutionModal.vue'))
const VersionReleaseModal = defineAsyncComponent(() => import('@/components/modals/VersionReleaseModal.vue'))
const SocialBotModal = defineAsyncComponent(() => import('@/components/modals/SocialBotModal.vue'))
const BookingConfirmationModal = defineAsyncComponent(() => import('@/components/modals/BookingConfirmationModal.vue'))

const ui = useUIStore()


const formStore = useFormStore()
const appStore = useAppStore()
const configStore = useConfigStore()
const { updatePreviewScale, confirmStaffAndSave, triggerSave } = useBillRender()
const { handleInputFocus, handleInputBlur, copyToClipboard, copyBookingConfirmation } = useForm()

const confirmActionVerb = computed(() => {
  const msg = (ui.modal.confirm.msg || '').toLowerCase()
  const title = (ui.modal.confirm.title || '').toLowerCase()
  if (msg.includes('xóa') || title.includes('xóa')) return 'XÓA PHIẾU'
  if (msg.includes('hủy cọc') || title.includes('hủy cọc')) return 'HỦY CỌC'
  if (msg.includes('hủy') || title.includes('hủy')) return 'XÁC NHẬN HỦY'
  return 'XÁC NHẬN'
})

// --- Inactivity Session Timeout ---
let inactivityTimer: any = null
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes
const activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'visibilitychange']

function resetInactivityTimer() {
  if (inactivityTimer) clearTimeout(inactivityTimer)
  inactivityTimer = setTimeout(() => {
    appStore.handleInactivityTimeout()
  }, INACTIVITY_TIMEOUT_MS)
}

async function handleOpenConfig(type: string) {
  if (type === 'ai') {
    const hasPerm = await appStore.verifySession('ai:configure')
    if (!hasPerm) return
  } else if (type === 'webhook') {
    const hasPerm = await appStore.verifySession('settings:update')
    if (!hasPerm) return
  }
  ui.openConfig(type)
}

// --- Watchers ---
watch(() => ui.tempTable, (val) => {
  formStore.customer.tables = val.number ? `${val.zone}${val.number}` : ''
}, { deep: true })

watch(() => ui.tab, (v) => {
  if (v === 'preview') {
    nextTick(() => {
      updatePreviewScale()
      // Re-calc after layout settles
      setTimeout(() => updatePreviewScale(), 100)
      setTimeout(() => updatePreviewScale(), 300)
    })
  }
})

// --- Mounted ---
function setAppHeight() {
  const height = window.visualViewport?.height || window.innerHeight
  document.documentElement.style.setProperty('--app-height', `${height}px`)
}

function handleGlobalPaste(e: ClipboardEvent) {
  if (ui.tab !== 'create') return
  const activeEl = document.activeElement
  const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.hasAttribute('contenteditable'))
  if (isInput) return
  
  const items = e.clipboardData?.items
  if (!items) return
  for (const item of items) {
    if (item.type.indexOf('image') !== -1) {
      e.preventDefault()
      const f = item.getAsFile()
      if (f) {
        const event = new CustomEvent('global-image-paste', { detail: { file: f } })
        window.dispatchEvent(event)
        ui.showToast('📸 Đã nhận diện ảnh chụp màn hình từ Clipboard toàn trang!', 'info')
      }
      break
    }
  }
}

// Lifecycle Listeners Management
let maxViewportHeight = 0
function handleViewportResize() {
  if (window.visualViewport) {
    if (window.visualViewport.height > maxViewportHeight) {
      maxViewportHeight = window.visualViewport.height
    }
    ui.isKeyboardOpen = window.visualViewport.height < maxViewportHeight * 0.85
  }
}

function handlePreviewResize() {
  if (ui.tab === 'preview') updatePreviewScale()
}

let billResizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (!formStore.id) formStore.id = crypto.randomUUID()
  ui.isVoiceSupported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window

  appStore.fetchSheets()
  appStore.fetchMenu()
  appStore.loadHistory(true)
  appStore.fetchRemoteConfig()
  configStore.hydrateAiRuntimeConfig()

  // Keyboard detection via visualViewport
  if (window.visualViewport) {
    maxViewportHeight = window.visualViewport.height
    window.visualViewport.addEventListener('resize', handleViewportResize)
  }

  // Visual Viewport height setup
  window.visualViewport?.addEventListener('resize', setAppHeight)
  window.visualViewport?.addEventListener('scroll', setAppHeight)
  window.addEventListener('resize', setAppHeight)
  setAppHeight()

  // Global paste handler
  window.addEventListener('paste', handleGlobalPaste)

  // Preview scaling
  window.addEventListener('resize', handlePreviewResize)

  setTimeout(() => {
    const observerTarget = document.getElementById('bill-render')
    if (observerTarget && window.ResizeObserver) {
      billResizeObserver = new ResizeObserver(() => {
        if (ui.tab === 'preview') updatePreviewScale()
      })
      billResizeObserver.observe(observerTarget)
    }
  }, 500)

  window.addEventListener('keydown', handleGlobalKeydown)

  // Inactivity listeners
  activityEvents.forEach(evt => {
    window.addEventListener(evt, resetInactivityTimer, { passive: true })
  })
  resetInactivityTimer()

  // Check if session was logged out due to inactivity
  const logoutReason = sessionStorage.getItem('kg_logout_reason')
  if (logoutReason === 'inactivity') {
    sessionStorage.removeItem('kg_logout_reason')
    ui.showToast('Phiên làm việc đã hết hạn do không hoạt động. Vui lòng đăng nhập lại.', 'info', 6000)
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.visualViewport?.removeEventListener('resize', handleViewportResize)
  window.visualViewport?.removeEventListener('resize', setAppHeight)
  window.visualViewport?.removeEventListener('scroll', setAppHeight)
  window.removeEventListener('resize', setAppHeight)
  window.removeEventListener('resize', handlePreviewResize)
  window.removeEventListener('paste', handleGlobalPaste)

  if (billResizeObserver) {
    billResizeObserver.disconnect()
    billResizeObserver = null
  }

  // Remove inactivity listeners
  activityEvents.forEach(evt => {
    window.removeEventListener(evt, resetInactivityTimer)
  })
  if (inactivityTimer) clearTimeout(inactivityTimer)
})

const searchQuery = ref('')

function getTodayStr() {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function getTomorrowStr() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

const commands = [
  { label: 'Tạo phiếu đặt bàn mới', cmd: '/create', desc: 'Xóa form và chuyển sang tab Tạo Phiếu', icon: 'fa-plus text-emerald-500' },
  { label: 'Lịch đặt bàn hôm nay', cmd: '/today', desc: 'Xem timeline đặt bàn ngày hôm nay', icon: 'fa-calendar-day text-blue-500' },
  { label: 'Lịch đặt bàn ngày mai', cmd: '/tomorrow', desc: 'Xem timeline đặt bàn ngày mai', icon: 'fa-calendar-plus text-indigo-500' },
  { label: 'Xem phiếu chưa cọc', cmd: '/unpaid', desc: 'Lọc lịch sử các phiếu chưa cọc', icon: 'fa-hourglass-half text-amber-500' },
  { label: 'Cài đặt hệ thống', cmd: '/settings', desc: 'Mở cửa sổ cài đặt hệ thống', icon: 'fa-gear text-slate-500' },
  { label: 'Đồng bộ dữ liệu Cloud', cmd: '/sync', desc: 'Tải lại lịch sử đặt bàn từ server', icon: 'fa-rotate text-purple-500' }
]

const filteredCommands = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return commands
  if (q.startsWith('/')) {
    return commands.filter(c => c.cmd.includes(q) || c.label.toLowerCase().includes(q))
  }
  return commands.filter(c => c.label.toLowerCase().includes(q))
})

const searchResults = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q || q.startsWith('/')) return []
  
  const cleanQ = q.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  return appStore.historyList.filter(o => {
    if (!o.parsedCustomer) return false
    const name = (o.parsedCustomer.name || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    const phone = (o.parsedCustomer.phone || '').replace(/\D/g, '')
    const id = (o.id || '').toLowerCase()
    const table = (o.parsedCustomer.tables || '').toLowerCase()
    return name.includes(cleanQ) || phone.includes(cleanQ) || id.includes(cleanQ) || table.includes(cleanQ)
  }).slice(0, 5)
})

function executeCommand(cmd: string) {
  ui.showCommandPalette = false
  searchQuery.value = ''
  
  if (cmd === '/create') {
    formStore.$reset()
    ui.tab = 'create'
    ui.showToast('Đã khởi tạo phiếu mới!', 'success')
  } else if (cmd === '/today') {
    ui.selectedTimelineDate = getTodayStr()
    ui.tab = 'timeline'
    appStore.loadHistory(false)
  } else if (cmd === '/tomorrow') {
    ui.selectedTimelineDate = getTomorrowStr()
    ui.tab = 'timeline'
    appStore.loadHistory(false)
  } else if (cmd === '/unpaid') {
    ui.tab = 'history'
    ui.historyFilters.deposit = 'unpaid'
    appStore.loadHistory(false)
  } else if (cmd === '/settings') {
    ui.showSettingsHub = true
  } else if (cmd === '/sync') {
    appStore.loadHistory(false)
  }
}

// --- Voice Recognition Setup ---
const isListening = ref(false)
const voiceStatus = ref('')
let recognition: any = null

if (typeof window !== 'undefined') {
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  if (SpeechRecognition) {
    recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.lang = 'vi-VN'
    recognition.interimResults = false

    recognition.onstart = () => {
      isListening.value = true
      voiceStatus.value = 'Đang lắng nghe giọng nói của bạn...'
    }

    recognition.onerror = (e: any) => {
      console.error('[Speech] Error:', e.error)
      isListening.value = false
      voiceStatus.value = ''
      ui.showToast('Không nghe rõ hoặc trình duyệt chặn mic!', 'warning')
    }

    recognition.onend = () => {
      isListening.value = false
    }

    recognition.onresult = (event: any) => {
      const resultText = event.results[0][0].transcript
      voiceStatus.value = `Đã nhận diện: "${resultText}"`
      searchQuery.value = resultText
      
      // Parse Voice Commands
      parseVoiceCommand(resultText)
    }
  }
}

function toggleVoiceSearch() {
  if (!recognition) {
    ui.showToast('Trình duyệt không hỗ trợ nhận diện giọng nói!', 'warning')
    return
  }
  if (isListening.value) {
    recognition.stop()
  } else {
    recognition.start()
  }
}

function stopListening() {
  if (recognition) {
    recognition.stop()
  }
  isListening.value = false
  voiceStatus.value = ''
}

function parseVoiceCommand(text: string) {
  const lowerText = text.toLowerCase().trim()
  
  // 1. Navigation Commands
  if (lowerText.includes('đi tới') || lowerText.includes('chuyển sang') || lowerText.includes('mở tab')) {
    if (lowerText.includes('bảng điều khiển') || lowerText.includes('dashboard')) {
      ui.tab = 'dashboard'
      ui.showToast('Đã chuyển sang Bảng điều khiển', 'success')
      ui.showCommandPalette = false
      return
    }
    if (lowerText.includes('lịch biểu') || lowerText.includes('timeline') || lowerText.includes('lịch trình')) {
      ui.tab = 'timeline'
      ui.showToast('Đã chuyển sang Lịch biểu', 'success')
      ui.showCommandPalette = false
      return
    }
    if (lowerText.includes('danh sách') || lowerText.includes('lịch sử') || lowerText.includes('history')) {
      ui.tab = 'history'
      ui.showToast('Đã chuyển sang Danh sách lịch sử', 'success')
      ui.showCommandPalette = false
      return
    }
    if (lowerText.includes('tạo phiếu') || lowerText.includes('tạo đơn') || lowerText.includes('lịch mới')) {
      ui.tab = 'create'
      formStore.$reset()
      ui.showToast('Đã mở form Tạo lịch mới', 'success')
      ui.showCommandPalette = false
      return
    }
    if (lowerText.includes('cài đặt') || lowerText.includes('settings')) {
      ui.showSettingsHub = true
      ui.showToast('Đã mở menu Cài đặt', 'success')
      ui.showCommandPalette = false
      return
    }
  }

  // 2. Prefill Booking Form Commands
  // Pattern: "xếp bàn VIP1 cho khách Nguyễn Văn A lúc 7 giờ tối"
  if (lowerText.includes('xếp bàn') || lowerText.includes('đặt bàn') || lowerText.includes('chọn bàn')) {
    // Find table name (e.g. VIP1, A12, B3)
    const tableMatch = text.match(/\b([a-zA-Z]+\d+)\b/)
    if (tableMatch) {
      const tableVal = tableMatch[1].toUpperCase()
      formStore.customer.tables = tableVal
      const zone = tableVal.match(/^([A-Z]+)/i)?.[1]?.toUpperCase() || ''
      const number = tableVal.replace(zone, '')
      ui.tempTable.zone = zone
      ui.tempTable.number = number
    }
    
    // Find time name (e.g. 19:30 or 19h30)
    const timeMatch = text.match(/\b(\d{1,2})[:h](\d{2})\b/)
    if (timeMatch) {
      const hh = timeMatch[1].padStart(2, '0')
      const mm = timeMatch[2].padStart(2, '0')
      formStore.customer.time = `${hh}:${mm}`
    } else {
      // e.g. "7 giờ tối" -> 19:00, "8 giờ sáng" -> 08:00
      const hourMatch = text.match(/\b(\d{1,2})\s*giờ\b/)
      if (hourMatch) {
        let hr = parseInt(hourMatch[1])
        if (lowerText.includes('tối') || lowerText.includes('chiều')) {
          if (hr < 12) hr += 12
        }
        formStore.customer.time = `${String(hr).padStart(2, '0')}:00`
      }
    }

    // Find pax number
    const paxMatch = text.match(/\b(\d+)\s*người\b/) || text.match(/\b(\d+)\s*khách\b/)
    if (paxMatch) {
      formStore.customer.pax = paxMatch[1]
    }

    // Navigate to create tab
    ui.tab = 'create'
    ui.showCommandPalette = false
    ui.showToast('🎙️ Đã điền sẵn thông tin từ giọng nói!', 'success', 4000)
  }
}

function handleResultClick(order: any) {
  ui.showCommandPalette = false
  searchQuery.value = ''
  
  const form = useForm()
  form.editHistoricOrder(order)
  ui.showToast(`Đang chỉnh sửa đơn của ${order.parsedCustomer.name}`, 'info')
}

function handleGlobalKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    ui.showCommandPalette = !ui.showCommandPalette
    if (ui.showCommandPalette) {
      nextTick(() => {
        const inp = document.getElementById('palette-search')
        if (inp) inp.focus()
      })
    }
  }
}
watch(() => ui.tab, () => {
  sound.playPop()
})

watch(() => ui.activeSettingModal, (val) => {
  if (val) sound.playPop()
})

const ambientTheme = computed(() => {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 9) return 'ambient-dawn'
  if (hour >= 9 && hour < 17) return 'ambient-day'
  if (hour >= 17 && hour < 20) return 'ambient-dusk'
  return 'ambient-night'
})
</script>

<template>
  <div class="w-full h-full min-h-screen h-[100dvh] overflow-hidden bg-[var(--bg-app)] text-[var(--text-primary)] flex flex-col relative z-0 transition-colors duration-200">
    <div id="app-root" class="w-full h-full flex-1 flex flex-col relative z-10 overflow-hidden" v-cloak>

    <!-- GLOBAL PROGRESS BAR -->
    <div class="fixed top-0 left-0 h-[3px] bg-blue-600 z-[999999] transition-all duration-300 ease-out shadow-[0_0_10px_rgba(37,99,235,0.4)]" 
         :class="{'opacity-100 w-[85%]': ui.isFetchingAPI, 'opacity-0 w-full': !ui.isFetchingAPI}">
    </div>

    <!-- LOADING OVERLAY -->
    <div v-if="ui.loading.is" class="fixed inset-0 bg-white/90 dark:bg-slate-950/90 z-[9999] flex flex-col justify-center items-center backdrop-blur-sm text-center p-6">
      <div class="w-12 h-12 border-3 border-slate-200 dark:border-slate-800 border-t-blue-600 rounded-full animate-spin mb-4"></div>
      <div class="text-slate-800 dark:text-slate-100 font-extrabold text-lg tracking-tight whitespace-pre-line">{{ ui.loading.msg }}</div>
      <div v-if="ui.loading.subMsg" class="mt-1 text-xs text-blue-600 dark:text-blue-400 font-bold uppercase tracking-widest">{{ ui.loading.subMsg }}</div>
    </div>

    <!-- PROMISE-BASED MODALS -->
    <!-- Alert -->
    <transition name="modal">
    <div v-if="ui.modal.alert.show" class="fixed inset-0 bg-slate-950/60 z-[99999] flex justify-center items-center p-4 backdrop-blur-sm" @click.self="ui.resolveModal('alert')">
      <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 md:p-7 max-w-sm w-[95%] md:w-full flex flex-col relative overflow-hidden border border-slate-200 dark:border-slate-800">
        <div class="flex justify-center items-center mb-5 flex-col gap-2.5">
          <div class="w-12 h-12 bg-blue-50 dark:bg-blue-950/50 rounded-2xl flex items-center justify-center text-blue-600 dark:text-blue-400 text-xl shadow-sm border border-blue-100 dark:border-blue-900/50">
            <i class="fa-solid fa-circle-info"></i>
          </div>
          <h3 class="text-lg font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight text-center">{{ ui.modal.alert.title }}</h3>
        </div>
        <div class="mb-6">
          <p class="text-sm text-slate-600 dark:text-slate-300 font-medium text-center whitespace-pre-line">{{ ui.modal.alert.msg }}</p>
        </div>
        <div>
          <button @click="ui.resolveModal('alert')" class="w-full py-3 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white rounded-xl font-bold uppercase tracking-wider text-xs shadow-md transition-all">ĐÃ HIỂU</button>
        </div>
      </div>
    </div>
    </transition>

    <!-- Confirm -->
    <transition name="modal">
    <div v-if="ui.modal.confirm.show" 
         class="fixed inset-0 bg-slate-950/60 z-[99999] flex justify-center items-center p-4 backdrop-blur-sm" 
         role="dialog"
         aria-modal="true"
         aria-labelledby="confirm-dialog-title"
         @click.self="ui.resolveModal('confirm', false)">
      <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 md:p-7 max-w-sm w-[95%] md:w-full flex flex-col relative overflow-hidden border border-slate-200 dark:border-slate-800">
        <div class="flex justify-center items-center mb-5 flex-col gap-2.5">
          <div class="w-12 h-12 bg-rose-50 dark:bg-rose-950/50 rounded-2xl flex items-center justify-center text-rose-600 dark:text-rose-400 text-xl shadow-sm border border-rose-100 dark:border-rose-900/50">
            <i class="fa-solid fa-triangle-exclamation"></i>
          </div>
          <h3 id="confirm-dialog-title" class="text-lg font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight text-center">{{ ui.modal.confirm.title }}</h3>
        </div>
        <div class="mb-6">
          <p class="text-sm text-slate-600 dark:text-slate-300 font-medium text-center whitespace-pre-line leading-relaxed">{{ ui.modal.confirm.msg }}</p>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <button @click="ui.resolveModal('confirm', false)" class="touch-target-48 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold uppercase tracking-wider text-xs active:scale-98 transition-all border border-slate-200 dark:border-slate-700">QUAY LẠI</button>
          <button @click="ui.resolveModal('confirm', true)" class="touch-target-48 py-3 bg-rose-600 hover:bg-rose-700 active:scale-98 text-white rounded-xl font-bold uppercase tracking-wider text-xs shadow-md transition-all flex items-center justify-center gap-1.5">{{ confirmActionVerb }}</button>
        </div>
      </div>
    </div>
    </transition>

    <!-- Prompt -->
    <transition name="modal">
    <div v-if="ui.modal.prompt.show" class="fixed inset-0 bg-slate-950/60 z-[99999] flex justify-center items-center p-4 backdrop-blur-sm" @click.self="ui.resolveModal('prompt', null)">
      <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 md:p-7 max-w-sm w-[95%] md:w-full flex flex-col relative overflow-hidden border border-slate-200 dark:border-slate-800">
        <div class="flex justify-center items-center mb-5 flex-col gap-2.5">
          <div class="w-12 h-12 bg-purple-50 dark:bg-purple-950/50 rounded-2xl flex items-center justify-center text-purple-600 dark:text-purple-400 text-xl shadow-sm border border-purple-100 dark:border-purple-900/50">
            <i class="fa-solid fa-keyboard"></i>
          </div>
          <h3 class="text-lg font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight text-center">{{ ui.modal.prompt.title }}</h3>
        </div>
        <div class="mb-5">
          <p class="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center mb-3">{{ ui.modal.prompt.msg }}</p>
          <input v-model="ui.modal.prompt.value" class="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 shadow-sm transition-all text-center" placeholder="Nhập nội dung...">
        </div>
        <div class="grid grid-cols-2 gap-3">
          <button @click="ui.resolveModal('prompt', null)" class="py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold uppercase tracking-wider text-xs active:scale-98 transition-all border border-slate-200 dark:border-slate-700">HỦY BỎ</button>
          <button @click="ui.resolveModal('prompt', ui.modal.prompt.value)" class="py-3 bg-purple-600 hover:bg-purple-700 active:scale-98 text-white rounded-xl font-bold uppercase tracking-wider text-xs shadow-md transition-all">XÁC NHẬN</button>
        </div>
      </div>
    </div>
    </transition>

    <!-- ERROR MODAL -->
    <div v-if="ui.error.show" class="fixed inset-0 bg-slate-950/60 z-50 flex justify-center items-center p-4 backdrop-blur-sm" @click.self="ui.error.show = false">
      <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 max-w-sm w-[95%] md:w-full border-l-4 border-rose-500 border-slate-200 dark:border-slate-800">
        <h3 class="text-xl font-black text-red-600 mb-4 flex items-center gap-2"><i class="fa-solid fa-bolt-lightning"></i> AI Error</h3>
        <div class="bg-red-50 p-4 rounded-xl text-xs font-mono mb-4 max-h-40 overflow-y-auto border border-red-100">{{ ui.error.msg }}</div>
        <div class="flex gap-3">
          <button @click="copyToClipboard(ui.error.msg)" class="flex-1 py-3 bg-gray-100 rounded-xl font-bold text-gray-600 min-h-[44px]">Copy log</button>
          <button @click="ui.error.show = false" class="px-6 py-3 bg-red-600 text-white rounded-xl font-bold shadow-lg shadow-red-200 min-h-[44px]">Đóng</button>
        </div>
      </div>
    </div>

    <!-- SETTINGS HUB MODAL -->
    <div v-if="ui.showSettingsHub" class="absolute inset-0 bg-slate-50 dark:bg-slate-950 z-[12000] flex flex-col md:flex-row overflow-hidden text-slate-800 dark:text-slate-100">
      <!-- Left Sidebar (Menu) -->
      <div class="w-full md:w-80 bg-slate-50 dark:bg-slate-900 flex flex-col h-full shrink-0 shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-20 overflow-y-auto custom-scrollbar md:border-r md:border-slate-200 dark:md:border-slate-800" :class="{'hidden md:flex': ui.activeSettingModal, 'flex': !ui.activeSettingModal}">
        <!-- Top Header -->
        <div class="bg-white dark:bg-slate-900 px-4 py-3.5 flex items-center justify-between sticky top-0 z-10 shadow-sm border-b border-slate-150 dark:border-slate-800">
          <button @click="ui.showSettingsHub = false; ui.closeConfig()" class="w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-800 dark:text-slate-200 text-lg active:scale-95 transition-all">
            <i class="fa-solid fa-arrow-left"></i>
          </button>
          <div class="text-center flex-1">
            <h2 class="text-base font-black text-slate-900 dark:text-slate-100">Cài đặt</h2>
            <p class="text-[10px] font-bold text-slate-400 mt-0.5">Quản lý hệ thống</p>
          </div>
          <div class="w-9 h-9"></div>
        </div>

      <div class="p-4 md:p-6 max-w-2xl mx-auto w-full space-y-5 pb-20">
        <!-- Brand Card -->
        <div @click="ui.openConfig('branding')" class="bg-white dark:bg-slate-850 rounded-2xl p-4 flex items-center justify-between shadow-sm border border-slate-200 dark:border-slate-800 active:scale-[0.98] transition-all cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
          <div class="flex items-center gap-3.5">
            <div class="w-12 h-12 bg-slate-50 dark:bg-slate-800 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 p-1 flex items-center justify-center">
              <img :src="configStore.branding.logo || 'https://ui-avatars.com/api/?name=King+Grill&background=1e293b&color=fff'" alt="Logo" class="w-full h-full object-contain rounded-lg">
            </div>
            <div>
              <h3 class="font-extrabold text-slate-900 dark:text-slate-100 text-sm">King's Grill</h3>
              <p class="text-[11px] font-semibold text-slate-400 mt-0.5">Nhà hàng / Quản trị viên</p>
            </div>
          </div>
          <i class="fa-solid fa-chevron-right text-slate-300 dark:text-slate-600 text-xs"></i>
        </div>

        <!-- Section 1: Quản lý Thực Đơn & Dịch Vụ -->
        <div class="space-y-2.5">
          <h4 class="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider pl-1">Thực đơn & Nhân sự</h4>
          <div class="bg-white dark:bg-slate-850 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
            <!-- Menu -->
            <button @click="ui.openConfig('menu')" :class="['w-full px-4 py-3.5 flex items-center gap-3.5 transition-colors border-b border-slate-100 dark:border-slate-800 group text-left', ui.activeSettingModal === 'menu' ? 'bg-blue-50/70 dark:bg-blue-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60']">
              <div class="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center text-lg shrink-0">
                <i class="fa-solid fa-bell-concierge"></i>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-slate-900 dark:text-slate-100 text-xs mb-0.5">Quản lý thực đơn</div>
                <div class="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">Danh mục món ăn, đồ uống, giá niêm yết</div>
              </div>
              <i class="fa-solid fa-chevron-right text-xs" :class="ui.activeSettingModal === 'menu' ? 'text-blue-500' : 'text-slate-300 dark:text-slate-600'"></i>
            </button>
            
            <!-- Staff -->
            <button @click="ui.openConfig('staff')" :class="['w-full px-4 py-3.5 flex items-center gap-3.5 transition-colors border-b border-slate-100 dark:border-slate-800 group text-left', ui.activeSettingModal === 'staff' ? 'bg-blue-50/70 dark:bg-blue-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60']">
              <div class="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-lg shrink-0">
                <i class="fa-regular fa-user"></i>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-slate-900 dark:text-slate-100 text-xs mb-0.5">Nhân viên nhận bàn</div>
                <div class="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">Danh sách nhân viên trực ca nhận bàn</div>
              </div>
              <i class="fa-solid fa-chevron-right text-xs" :class="ui.activeSettingModal === 'staff' ? 'text-blue-500' : 'text-slate-300 dark:text-slate-600'"></i>
            </button>

            <!-- Bank -->
            <button @click="ui.openConfig('bank')" :class="['w-full px-4 py-3.5 flex items-center gap-3.5 transition-colors group text-left', ui.activeSettingModal === 'bank' ? 'bg-blue-50/70 dark:bg-blue-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60']">
              <div class="w-10 h-10 rounded-xl bg-cyan-50 dark:bg-cyan-950/50 text-cyan-600 dark:text-cyan-400 flex items-center justify-center text-lg shrink-0">
                <i class="fa-solid fa-building-columns"></i>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-slate-900 dark:text-slate-100 text-xs mb-0.5">Tài khoản ngân hàng & QR Cọc</div>
                <div class="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">VietQR / SeAPay tự động tạo mã QR trên phiếu</div>
              </div>
              <i class="fa-solid fa-chevron-right text-xs" :class="ui.activeSettingModal === 'bank' ? 'text-blue-500' : 'text-slate-300 dark:text-slate-600'"></i>
            </button>
          </div>
        </div>

        <!-- Section 2: Trí Tuệ Nhân Tạo & Live Chat -->
        <div class="space-y-2.5">
          <h4 class="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider pl-1">Trí tuệ nhân tạo (AI)</h4>
          <div class="bg-white dark:bg-slate-850 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
            <!-- AI Config -->
            <button @click="handleOpenConfig('ai')" :class="['w-full px-4 py-3.5 flex items-center gap-3.5 transition-colors border-b border-slate-100 dark:border-slate-800 group text-left', ui.activeSettingModal === 'ai' ? 'bg-blue-50/70 dark:bg-blue-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60']">
              <div class="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 flex items-center justify-center text-lg shrink-0">
                <i class="fa-solid fa-wand-magic-sparkles"></i>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-slate-900 dark:text-slate-100 text-xs mb-0.5">Cấu hình AI & Prompt</div>
                <div class="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">Mô hình AI, phân tích tin nhắn và quy tắc nghiệp vụ</div>
              </div>
              <i class="fa-solid fa-chevron-right text-xs" :class="ui.activeSettingModal === 'ai' ? 'text-blue-500' : 'text-slate-300 dark:text-slate-600'"></i>
            </button>

            <!-- Social AI Bot -->
            <button @click="ui.showSocialBotModal = true; ui.showSettingsHub = false" class="w-full px-4 py-3.5 flex items-center gap-3.5 transition-colors group hover:bg-slate-50 dark:hover:bg-slate-800/60 text-left">
              <div class="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-lg shrink-0">
                <i class="fa-solid fa-robot"></i>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-slate-900 dark:text-slate-100 text-xs mb-0.5">Quản lý Social AI Bot (Fanpage)</div>
                <div class="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">Lịch sử tin nhắn thật & bật/tắt AI Messenger</div>
              </div>
              <i class="fa-solid fa-chevron-right text-xs text-slate-300 dark:text-slate-600"></i>
            </button>
          </div>
        </div>

        <!-- Section 3: Giao Diện & Hệ Thống -->
        <div class="space-y-2.5">
          <h4 class="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider pl-1">Giao diện & Hệ thống</h4>
          <div class="bg-white dark:bg-slate-850 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
            <button @click="ui.openConfig('branding')" :class="['w-full px-4 py-3.5 flex items-center gap-3.5 transition-colors border-b border-slate-100 dark:border-slate-800 group text-left', ui.activeSettingModal === 'branding' ? 'bg-blue-50/70 dark:bg-blue-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60']">
              <div class="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-950/50 text-orange-600 dark:text-orange-400 flex items-center justify-center text-lg shrink-0">
                <i class="fa-solid fa-pen-nib"></i>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-slate-900 dark:text-slate-100 text-xs mb-0.5">Thương hiệu & Mẫu in K80</div>
                <div class="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">Logo nhà hàng, màu sắc và mẫu phiếu xuất</div>
              </div>
              <i class="fa-solid fa-chevron-right text-xs" :class="ui.activeSettingModal === 'branding' ? 'text-blue-500' : 'text-slate-300 dark:text-slate-600'"></i>
            </button>

            <button @click="ui.toggleDarkMode()" class="w-full px-4 py-3.5 flex items-center gap-3.5 transition-colors border-b border-slate-100 dark:border-slate-800 group hover:bg-slate-50 dark:hover:bg-slate-800/60 text-left">
              <div class="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0" :class="ui.isDarkMode ? 'bg-slate-800 text-yellow-400' : 'bg-slate-100 text-slate-600'">
                <i class="fa-solid" :class="ui.isDarkMode ? 'fa-moon' : 'fa-sun'"></i>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-slate-900 dark:text-slate-100 text-xs mb-0.5">Chế độ ban đêm (Dark Mode)</div>
                <div class="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">Giao diện tối giúp làm việc ban đêm dịu mắt</div>
              </div>
              <div class="w-10 flex justify-end">
                <div class="w-9 h-5 bg-slate-200 dark:bg-slate-700 rounded-full relative transition-colors" :class="{'!bg-blue-600': ui.isDarkMode}">
                  <div class="w-4 h-4 bg-white rounded-full absolute top-0.5 left-0.5 transition-transform shadow-sm" :class="{'translate-x-4': ui.isDarkMode}"></div>
                </div>
              </div>
            </button>

            <button @click="handleOpenConfig('webhook')" :class="['w-full px-4 py-3.5 flex items-center gap-3.5 transition-colors group text-left', ui.activeSettingModal === 'webhook' ? 'bg-blue-50/70 dark:bg-blue-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60']">
              <div class="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center justify-center text-lg shrink-0">
                <i class="fa-solid fa-gear"></i>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-slate-900 dark:text-slate-100 text-xs mb-0.5">Cài đặt hệ thống & Webhook</div>
                <div class="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">Telegram Bot, Cloudflare Worker và đồng bộ DB</div>
              </div>
              <i class="fa-solid fa-chevron-right text-xs" :class="ui.activeSettingModal === 'webhook' ? 'text-blue-500' : 'text-slate-300 dark:text-slate-600'"></i>
            </button>
          </div>
        </div>

        <!-- Section 4: Kỹ Thuật & Kiểm Thử -->
        <div class="space-y-2.5">
          <h4 class="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider pl-1">Kỹ thuật & Hỗ trợ</h4>
          <div class="bg-white dark:bg-slate-850 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
            <!-- Test Dashboard -->
            <button @click="ui.tab = 'test'; ui.showSettingsHub = false" class="w-full px-4 py-3.5 flex items-center gap-3.5 transition-colors border-b border-slate-100 dark:border-slate-800 group hover:bg-slate-50 dark:hover:bg-slate-800/60 text-left">
              <div class="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center text-lg shrink-0">
                <i class="fa-solid fa-flask"></i>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-slate-900 dark:text-slate-100 text-xs mb-0.5">Kiểm thử AI & Parser (Benchmark)</div>
                <div class="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">Bộ kiểm thử tự động đánh giá độ chính xác</div>
              </div>
              <i class="fa-solid fa-arrow-up-right-from-square text-xs text-slate-300 dark:text-slate-600"></i>
            </button>

            <!-- Logs Viewer -->
            <button @click="ui.tab = 'logs'; ui.showSettingsHub = false" class="w-full px-4 py-3.5 flex items-center gap-3.5 transition-colors border-b border-slate-100 dark:border-slate-800 group hover:bg-slate-50 dark:hover:bg-slate-800/60 text-left">
              <div class="w-10 h-10 rounded-xl bg-slate-800 text-slate-200 flex items-center justify-center text-lg shrink-0">
                <i class="fa-solid fa-terminal"></i>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-slate-900 dark:text-slate-100 text-xs mb-0.5">Nhật ký hoạt động (System Logs)</div>
                <div class="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">Tiến trình đồng bộ ngoại tuyến và lỗi mạng</div>
              </div>
              <i class="fa-solid fa-arrow-up-right-from-square text-xs text-slate-300 dark:text-slate-600"></i>
            </button>

            <!-- User Guide -->
            <button @click="ui.openConfig('guide')" :class="['w-full px-4 py-3.5 flex items-center gap-3.5 transition-colors group text-left', ui.activeSettingModal === 'guide' ? 'bg-blue-50/70 dark:bg-blue-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60']">
              <div class="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-lg shrink-0">
                <i class="fa-solid fa-book-open"></i>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-slate-900 dark:text-slate-100 text-xs mb-0.5">Hướng dẫn sử dụng</div>
                <div class="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">Cẩm nang vận hành quy trình tạo phiếu</div>
              </div>
              <i class="fa-solid fa-chevron-right text-xs" :class="ui.activeSettingModal === 'guide' ? 'text-blue-500' : 'text-slate-300 dark:text-slate-600'"></i>
            </button>
          </div>
        </div>

        <button @click="appStore.logout()" class="w-full py-3.5 bg-white dark:bg-slate-850 border border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-400 rounded-xl font-bold text-xs shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2 hover:bg-rose-50 dark:hover:bg-rose-950/30 mb-8">
          <i class="fa-solid fa-arrow-right-from-bracket"></i> Đăng xuất
        </button>
      </div>
      </div> <!-- Closes Sidebar -->

      <!-- Right Content Area (Modals) -->
      <div class="flex-1 h-full overflow-hidden relative bg-white dark:bg-slate-900 flex flex-col" :class="{'hidden md:flex': !ui.activeSettingModal, 'flex': ui.activeSettingModal}">
        <div v-if="!ui.activeSettingModal" class="hidden md:flex flex-col items-center justify-center h-full text-slate-400 p-8 text-center bg-slate-50/50 dark:bg-slate-950/50">
          <i class="fa-solid fa-gear text-4xl mb-3 text-slate-300 dark:text-slate-600"></i>
          <h3 class="font-black text-slate-700 dark:text-slate-300 text-xs uppercase tracking-wider">Cấu hình hệ thống</h3>
          <p class="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 max-w-xs leading-relaxed">Chọn một danh mục cài đặt bên trái để bắt đầu cấu hình các tính năng.</p>
        </div>
        <AiConfigModal />
        <BankConfigModal />
        <BrandingModal />
        <MenuManagerModal />
        <StaffModal />
        <WebhookConfigModal />
        <GuideConfigModal />
      </div>
    </div>

    <!-- STAFF SELECTOR MODAL (ON SAVE) -->
    <transition name="modal">
    <div v-if="ui.showStaffSelector" class="fixed inset-0 bg-slate-950/60 z-[10002] flex justify-center items-center p-4 backdrop-blur-sm" @click.self="ui.showStaffSelector = false">
      <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 md:p-7 max-w-sm w-[95%] md:w-full flex flex-col relative overflow-hidden border border-slate-200 dark:border-slate-800">
        <div class="flex justify-center items-center mb-5 flex-col gap-2.5">
          <div class="w-12 h-12 bg-blue-50 dark:bg-blue-950/50 rounded-2xl flex items-center justify-center text-blue-600 dark:text-blue-400 text-xl shadow-sm border border-blue-100 dark:border-blue-900/50">
            <i class="fa-solid fa-user-tag"></i>
          </div>
          <h3 class="text-lg font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight text-center">CHỌN NGƯỜI TẠO PHIẾU</h3>
        </div>
        <div class="grid grid-cols-2 gap-2.5 max-h-[50vh] overflow-y-auto custom-scrollbar p-1">
          <button v-for="(staff, idx) in appStore.staffList" :key="idx"
            @click="confirmStaffAndSave(staff)"
            class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 transition-all active:scale-95 flex flex-col items-center justify-center gap-1 group min-h-[76px]">
            <i class="fa-solid fa-user-check text-xl text-slate-400 dark:text-slate-500 group-hover:text-blue-600 dark:group-hover:text-blue-400 mb-0.5 transition-colors"></i>
            <span class="font-black text-xs uppercase text-slate-800 dark:text-slate-200 text-center leading-tight">{{ staff.name }}</span>
            <span class="text-[9px] font-mono font-bold text-slate-400 dark:text-slate-500">{{ staff.phone }}</span>
          </button>
        </div>
        <div class="mt-5">
          <button @click="ui.showStaffSelector = false" class="w-full py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold uppercase tracking-wider text-xs active:scale-98 transition-all border border-slate-200 dark:border-slate-700">HỦY BỎ</button>
        </div>
      </div>
    </div>
    </transition>

    <!-- ALL CONFIG MODALS -->
    <VerifyTransferModal />
    <BookingDetailModal />
    <FloorPlanModal />
    <CustomerCareModal />
    <ConflictResolutionModal />
    <VersionReleaseModal />
    <SocialBotModal />
    <BookingConfirmationModal />

    <!-- COMMAND PALETTE MODAL -->
    <transition name="fade">
      <div v-if="ui.showCommandPalette" class="fixed inset-0 z-[99999] flex items-start justify-center pt-[10vh] px-4 backdrop-blur-sm bg-slate-950/60" @click.self="ui.showCommandPalette = false">
        <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-xl flex flex-col overflow-hidden max-h-[75vh] transition-all transform duration-200">
          <!-- Search Header -->
          <div class="p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3 bg-slate-50 dark:bg-slate-950">
            <i class="fa-solid fa-magnifying-glass text-slate-400 text-base"></i>
            <input
              id="palette-search"
              v-model="searchQuery"
              type="search"
              enterkeyhint="search"
              class="flex-1 bg-transparent border-none outline-none font-bold text-slate-800 dark:text-slate-100 text-[16px] md:text-sm placeholder-slate-400 min-h-[44px]"
              placeholder="Tìm tên khách, SĐT, số bàn hoặc nói 'Xếp bàn A1 lúc 19:00'..."
              autocomplete="off"
            >
            <button
              @click="toggleVoiceSearch"
              class="w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer shadow-sm border border-slate-200 dark:border-slate-700"
              :class="isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-white dark:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'"
              title="Điều khiển bằng giọng nói"
            >
              <i class="fa-solid fa-microphone text-xs"></i>
            </button>
            <kbd class="hidden md:inline-flex items-center gap-0.5 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[10px] font-bold text-slate-400 shadow-sm">ESC</kbd>
          </div>

          <!-- Voice Status Bar -->
          <div v-if="voiceStatus" class="px-4 py-2 bg-blue-50 dark:bg-blue-950/50 border-b border-blue-100 dark:border-blue-900/50 text-[10px] font-black text-blue-700 dark:text-blue-300 uppercase tracking-widest flex items-center justify-between">
            <span class="animate-pulse">🎙️ {{ voiceStatus }}</span>
            <button @click="stopListening" class="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-200 font-bold uppercase tracking-widest text-[9px] cursor-pointer">Dừng nghe</button>
          </div>

          <!-- Content Area -->
          <div class="flex-grow overflow-y-auto p-2 custom-scrollbar space-y-3 max-h-[50vh]">
            <!-- Booking Search Results -->
            <div v-if="searchResults.length > 0" class="space-y-1">
              <div class="px-3 py-1 text-[10px] font-black uppercase text-slate-400 tracking-wider">Đơn đặt bàn khớp kết quả</div>
              <button
                v-for="order in searchResults"
                :key="order.id"
                @click="handleResultClick(order)"
                class="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/70 active:bg-slate-200 dark:active:bg-slate-800 transition-colors flex items-center justify-between border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
              >
                <div class="min-w-0">
                  <div class="font-bold text-slate-800 dark:text-slate-100 text-xs flex items-center gap-2">
                    <span>{{ order.parsedCustomer.name }}</span>
                    <span v-if="order.parsedCustomer.tables" class="px-1.5 py-0.5 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded text-[9px] font-black border border-blue-200 dark:border-blue-800">Bàn {{ order.parsedCustomer.tables }}</span>
                  </div>
                  <div class="text-[10px] text-slate-400 font-medium mt-0.5 flex items-center gap-3">
                    <span><i class="fa-solid fa-phone text-[8px]"></i> {{ order.parsedCustomer.phone }}</span>
                    <span><i class="fa-solid fa-calendar text-[8px]"></i> {{ order.parsedCustomer.date }} ({{ order.parsedCustomer.time }})</span>
                  </div>
                </div>
                <i class="fa-solid fa-chevron-right text-slate-300 dark:text-slate-600 text-xs pr-1"></i>
              </button>
            </div>

            <!-- Commands -->
            <div class="space-y-1">
              <div class="px-3 py-1 text-[10px] font-black uppercase text-slate-400 tracking-wider">Lệnh điều hướng nhanh</div>
              <button
                v-for="cmd in filteredCommands"
                :key="cmd.cmd"
                @click="executeCommand(cmd.cmd)"
                class="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/70 active:bg-slate-200 dark:active:bg-slate-800 transition-colors flex items-center gap-3 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 min-h-[48px] touch-target-48"
              >
                <div class="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-700 shrink-0">
                  <i class="fa-solid" :class="cmd.icon"></i>
                </div>
                <div class="flex-grow min-w-0">
                  <div class="font-bold text-slate-800 dark:text-slate-100 text-xs flex items-center justify-between">
                    <span>{{ cmd.label }}</span>
                    <span class="hidden sm:inline-block text-[9px] font-mono font-bold text-slate-400 bg-slate-150 dark:bg-slate-800 px-1.5 py-0.5 rounded">{{ cmd.cmd }}</span>
                  </div>
                  <div class="text-[10px] text-slate-400 mt-0.5 leading-tight truncate">{{ cmd.desc }}</div>
                </div>
              </button>
            </div>

            <!-- No results -->
            <div v-if="searchQuery && searchResults.length === 0 && filteredCommands.length === 0" class="text-center py-6 text-slate-400 font-semibold text-xs">
               Không tìm thấy kết quả phù hợp cho "{{ searchQuery }}"
            </div>
          </div>
        </div>
      </div>
    </transition>

    <!-- MAIN PANELS -->
    <LeftPanel />
  </div>
  </div>
</template>
