<script setup lang="ts">
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

const ui = useUIStore()
const formStore = useFormStore()
const appStore = useAppStore()
const configStore = useConfigStore()
const { updatePreviewScale, confirmStaffAndSave, triggerSave } = useBillRender()
const { handleInputFocus, handleInputBlur, copyToClipboard, copyBookingConfirmation } = useForm()

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
    let maxViewportHeight = window.visualViewport.height
    window.visualViewport.addEventListener('resize', () => {
      if (window.visualViewport!.height > maxViewportHeight) {
        maxViewportHeight = window.visualViewport!.height
      }
      ui.isKeyboardOpen = window.visualViewport!.height < maxViewportHeight * 0.85
    })
  }

  // Visual Viewport height setup
  window.visualViewport?.addEventListener('resize', setAppHeight)
  window.visualViewport?.addEventListener('scroll', setAppHeight)
  window.addEventListener('resize', setAppHeight)
  setAppHeight()

  // Preview scaling
  window.addEventListener('resize', () => {
    if (ui.tab === 'preview') updatePreviewScale()
  })

  setTimeout(() => {
    const observerTarget = document.getElementById('bill-render')
    if (observerTarget && window.ResizeObserver) {
      const resizeObserver = new ResizeObserver(() => {
        if (ui.tab === 'preview') updatePreviewScale()
      })
      resizeObserver.observe(observerTarget)
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
  window.visualViewport?.removeEventListener('resize', setAppHeight)
  window.visualViewport?.removeEventListener('scroll', setAppHeight)
  window.removeEventListener('resize', setAppHeight)

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
</script>

<template>
  <div class="min-h-screen h-[100dvh] md:h-auto overflow-hidden bg-slate-100 flex items-center justify-center font-sans text-slate-800">
    <div id="app-root" class="w-full max-w-[480px] lg:max-w-[1200px] xl:max-w-[1440px] 2xl:max-w-[1680px] h-[100dvh] md:h-[96vh] md:max-h-none md:rounded-[2rem] md:shadow-2xl flex flex-col relative overflow-hidden bg-white border border-slate-200 transition-all duration-300" v-cloak>

    <!-- GLOBAL PROGRESS BAR -->
    <div class="fixed top-0 left-0 h-[3px] bg-blue-500 z-[999999] transition-all duration-300 ease-out shadow-[0_0_10px_rgba(59,130,246,0.5)]" 
         :class="{'opacity-100 w-[85%]': ui.isFetchingAPI, 'opacity-0 w-full': !ui.isFetchingAPI}">
    </div>

    <!-- LOADING OVERLAY -->
    <div v-if="ui.loading.is" class="fixed inset-0 bg-white/95 z-[9999] flex flex-col justify-center items-center backdrop-blur-sm text-center p-6">
      <div class="w-14 h-14 border-4 border-gray-100 border-t-blue-600 rounded-full animate-spin-fast mb-6"></div>
      <div class="text-slate-800 font-black text-xl tracking-tight animate-pulse whitespace-pre-line">{{ ui.loading.msg }}</div>
      <div v-if="ui.loading.subMsg" class="mt-2 text-xs text-blue-600 font-bold uppercase tracking-widest">{{ ui.loading.subMsg }}</div>
    </div>

    <!-- PROMISE-BASED MODALS -->
    <!-- Alert -->
    <transition name="modal">
    <div v-if="ui.modal.alert.show" class="fixed inset-0 bg-blue-950/80 z-[99999] flex justify-center items-center p-4 backdrop-blur-md" @click.self="ui.resolveModal('alert')">
      <div class="bg-white rounded-3xl shadow-2xl p-6 md:p-8 max-w-sm w-[95%] md:w-full flex flex-col relative overflow-hidden border border-white/20">
        <div class="absolute top-0 left-0 right-0 h-24 bg-gradient-to-r from-blue-600 to-cyan-500 rounded-t-3xl opacity-10"></div>
        <div class="flex justify-center items-center mb-6 relative z-10 flex-col gap-3">
          <div class="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-500 text-2xl shadow-sm border border-blue-100">
            <i class="fa-solid fa-circle-info"></i>
          </div>
          <h3 class="text-xl font-black text-blue-900 uppercase tracking-tighter text-center">{{ ui.modal.alert.title }}</h3>
        </div>
        <div class="relative z-10 mb-8">
          <p class="text-sm text-slate-600 font-medium text-center whitespace-pre-line">{{ ui.modal.alert.msg }}</p>
        </div>
        <div class="relative z-10">
          <button @click="ui.resolveModal('alert')" class="w-full py-4 bg-blue-900 text-white rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-blue-900/20 hover:bg-blue-800 active:scale-95 transition-all">ĐÃ HIỂU</button>
        </div>
      </div>
    </div>
    </transition>

    <!-- Confirm -->
    <transition name="modal">
    <div v-if="ui.modal.confirm.show" class="fixed inset-0 bg-blue-950/80 z-[99999] flex justify-center items-center p-4 backdrop-blur-md" @click.self="ui.resolveModal('confirm', false)">
      <div class="bg-white rounded-3xl shadow-2xl p-6 md:p-8 max-w-sm w-[95%] md:w-full flex flex-col relative overflow-hidden border border-white/20">
        <div class="absolute top-0 left-0 right-0 h-24 bg-gradient-to-r from-rose-500 to-orange-500 rounded-t-3xl opacity-10"></div>
        <div class="flex justify-center items-center mb-6 relative z-10 flex-col gap-3">
          <div class="w-14 h-14 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-500 text-2xl shadow-sm border border-rose-100">
            <i class="fa-solid fa-triangle-exclamation"></i>
          </div>
          <h3 class="text-xl font-black text-blue-900 uppercase tracking-tighter text-center">{{ ui.modal.confirm.title }}</h3>
        </div>
        <div class="relative z-10 mb-8">
          <p class="text-sm text-slate-600 font-medium text-center whitespace-pre-line">{{ ui.modal.confirm.msg }}</p>
        </div>
        <div class="grid grid-cols-2 gap-3 relative z-10">
          <button @click="ui.resolveModal('confirm', false)" class="py-4 bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700 rounded-xl font-black uppercase tracking-widest text-[10px] active:scale-95 transition-all shadow-sm">HỦY BỎ</button>
          <button @click="ui.resolveModal('confirm', true)" class="py-4 bg-rose-600 text-white rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-rose-600/20 hover:bg-rose-700 active:scale-95 transition-all">ĐỒNG Ý</button>
        </div>
      </div>
    </div>
    </transition>

    <!-- Prompt -->
    <transition name="modal">
    <div v-if="ui.modal.prompt.show" class="fixed inset-0 bg-blue-950/80 z-[99999] flex justify-center items-center p-4 backdrop-blur-md" @click.self="ui.resolveModal('prompt', null)">
      <div class="bg-white rounded-3xl shadow-2xl p-6 md:p-8 max-w-sm w-[95%] md:w-full flex flex-col relative overflow-hidden border border-white/20">
        <div class="absolute top-0 left-0 right-0 h-24 bg-gradient-to-r from-purple-600 to-blue-900 rounded-t-3xl opacity-10"></div>
        <div class="flex justify-center items-center mb-6 relative z-10 flex-col gap-3">
          <div class="w-14 h-14 bg-purple-50 rounded-2xl flex items-center justify-center text-purple-600 text-2xl shadow-sm border border-purple-100">
            <i class="fa-solid fa-keyboard"></i>
          </div>
          <h3 class="text-xl font-black text-blue-900 uppercase tracking-tighter text-center">{{ ui.modal.prompt.title }}</h3>
        </div>
        <div class="relative z-10 mb-6">
          <p class="text-[11px] font-black text-slate-500 uppercase tracking-widest text-center mb-4">{{ ui.modal.prompt.msg }}</p>
          <input v-model="ui.modal.prompt.value" class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-100 shadow-sm transition-all placeholder-slate-300 text-center" placeholder="Nhập nội dung...">
        </div>
        <div class="grid grid-cols-2 gap-3 relative z-10">
          <button @click="ui.resolveModal('prompt', null)" class="py-4 bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700 rounded-xl font-black uppercase tracking-widest text-[10px] active:scale-95 transition-all shadow-sm">HỦY BỎ</button>
          <button @click="ui.resolveModal('prompt', ui.modal.prompt.value)" class="py-4 bg-purple-600 text-white rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-purple-600/20 hover:bg-purple-700 active:scale-95 transition-all">XÁC NHẬN</button>
        </div>
      </div>
    </div>
    </transition>

    <!-- ERROR MODAL -->
    <div v-if="ui.error.show" class="fixed inset-0 bg-black/60 z-50 flex justify-center items-center p-4 backdrop-blur-sm" @click.self="ui.error.show = false">
      <div class="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-[95%] md:w-full border-l-8 border-red-500">
        <h3 class="text-xl font-black text-red-600 mb-4 flex items-center gap-2"><i class="fa-solid fa-bolt-lightning"></i> AI Error</h3>
        <div class="bg-red-50 p-4 rounded-xl text-xs font-mono mb-4 max-h-40 overflow-y-auto border border-red-100">{{ ui.error.msg }}</div>
        <div class="flex gap-3">
          <button @click="copyToClipboard(ui.error.msg)" class="flex-1 py-3 bg-gray-100 rounded-xl font-bold text-gray-600 min-h-[44px]">Copy log</button>
          <button @click="ui.error.show = false" class="px-6 py-3 bg-red-600 text-white rounded-xl font-bold shadow-lg shadow-red-200 min-h-[44px]">Đóng</button>
        </div>
      </div>
    </div>

    <!-- SETTINGS HUB MODAL -->
    <div v-if="ui.showSettingsHub" class="absolute inset-0 bg-slate-50 z-[12000] flex flex-col md:flex-row overflow-hidden">
      <!-- Left Sidebar (Menu) -->
      <div class="w-full md:w-80 bg-slate-50 flex flex-col h-full shrink-0 shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-20 overflow-y-auto custom-scrollbar md:border-r md:border-slate-200" :class="{'hidden md:flex': ui.activeSettingModal, 'flex': !ui.activeSettingModal}">
        <!-- Top Header -->
        <div class="bg-white px-4 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm border-b border-slate-100">
          <button @click="ui.showSettingsHub = false; ui.closeConfig()" class="w-10 h-10 flex items-center justify-center text-slate-800 text-xl active:scale-95 transition-transform">
            <i class="fa-solid fa-arrow-left"></i>
          </button>
          <div class="text-center flex-1">
            <h2 class="text-xl font-black text-blue-900">Cài đặt</h2>
            <p class="text-[10px] font-bold text-slate-400 mt-0.5">Quản lý hệ thống</p>
          </div>
          <div class="w-10 h-10"></div>
        </div>

      <div class="p-4 md:p-6 max-w-2xl mx-auto w-full space-y-6 pb-20">
        <!-- Brand Card -->
        <div @click="ui.openConfig('branding')" class="bg-white rounded-2xl p-4 flex items-center justify-between shadow-sm border border-slate-100 active:scale-[0.98] transition-transform cursor-pointer hover:bg-slate-50">
          <div class="flex items-center gap-4">
            <div class="w-14 h-14 bg-slate-50 rounded-xl overflow-hidden border border-slate-100 p-1.5 flex items-center justify-center">
              <img :src="configStore.branding.logo || 'https://ui-avatars.com/api/?name=King+Grill&background=1e293b&color=fff'" alt="Logo" class="w-full h-full object-contain rounded-lg">
            </div>
            <div>
              <h3 class="font-black text-slate-800 text-base">King's Grill</h3>
              <p class="text-[11px] font-bold text-slate-400 mt-0.5">Nhà hàng / Quản trị viên</p>
            </div>
          </div>
          <i class="fa-solid fa-chevron-right text-slate-300 text-sm"></i>
        </div>

        <!-- Section: Content -->
        <div class="space-y-3">
          <h4 class="text-[11px] font-black text-slate-400 uppercase tracking-widest pl-2">Quản lý nội dung</h4>
          <div class="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <!-- Menu -->
            <button @click="ui.openConfig('menu')" :class="['w-full px-4 py-4 flex items-center gap-4 transition-colors border-b border-slate-50 group', ui.activeSettingModal === 'menu' ? 'bg-blue-50/50' : 'hover:bg-slate-50 active:bg-slate-100']">
              <div class="w-12 h-12 rounded-2xl bg-blue-50 text-blue-500 flex items-center justify-center text-xl shrink-0 group-hover:scale-110 transition-transform">
                <i class="fa-solid fa-bell-concierge"></i>
              </div>
              <div class="flex-1 text-left">
                <div class="font-black text-slate-800 text-[13px] mb-0.5">Thêm thực đơn</div>
                <div class="text-[10px] font-bold text-slate-400 leading-tight">Quản lý và cập nhật các món ăn, đồ uống<br>hiển thị trên phiếu đặt bàn</div>
              </div>
              <i class="fa-solid fa-chevron-right text-sm" :class="ui.activeSettingModal === 'menu' ? 'text-blue-500' : 'text-slate-300'"></i>
            </button>
            
            <!-- AI -->
            <button @click="handleOpenConfig('ai')" :class="['w-full px-4 py-4 flex items-center gap-4 transition-colors border-b border-slate-50 group', ui.activeSettingModal === 'ai' ? 'bg-blue-50/50' : 'hover:bg-slate-50 active:bg-slate-100']">
              <div class="w-12 h-12 rounded-2xl bg-purple-50 text-purple-500 flex items-center justify-center text-xl shrink-0 group-hover:scale-110 transition-transform">
                <i class="fa-solid fa-wand-magic-sparkles"></i>
              </div>
              <div class="flex-1 text-left">
                <div class="font-black text-slate-800 text-[13px] mb-0.5">Thêm cấu hình AI</div>
                <div class="text-[10px] font-bold text-slate-400 leading-tight">Thiết lập và tùy chỉnh AI hỗ trợ gợi ý số bàn,<br>phân tích và nhắc nhở</div>
              </div>
              <i class="fa-solid fa-chevron-right text-sm" :class="ui.activeSettingModal === 'ai' ? 'text-blue-500' : 'text-slate-300'"></i>
            </button>

            <!-- Staff -->
            <button @click="ui.openConfig('staff')" :class="['w-full px-4 py-4 flex items-center gap-4 transition-colors border-b border-slate-50 group', ui.activeSettingModal === 'staff' ? 'bg-blue-50/50' : 'hover:bg-slate-50 active:bg-slate-100']">
              <div class="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center text-xl shrink-0 group-hover:scale-110 transition-transform">
                <i class="fa-regular fa-user"></i>
              </div>
              <div class="flex-1 text-left">
                <div class="font-black text-slate-800 text-[13px] mb-0.5">Thêm nhân viên nhận bàn</div>
                <div class="text-[10px] font-bold text-slate-400 leading-tight">Thêm và quản lý nhân viên nhận bàn.<br>Thông tin sẽ hiển thị trên phiếu để khách hàng<br>liên hệ khi cần</div>
              </div>
              <i class="fa-solid fa-chevron-right text-sm" :class="ui.activeSettingModal === 'staff' ? 'text-blue-500' : 'text-slate-300'"></i>
            </button>

            <!-- Bank -->
            <button @click="ui.openConfig('bank')" :class="['w-full px-4 py-4 flex items-center gap-4 transition-colors group', ui.activeSettingModal === 'bank' ? 'bg-blue-50/50' : 'hover:bg-slate-50 active:bg-slate-100']">
              <div class="w-12 h-12 rounded-2xl bg-cyan-50 text-cyan-500 flex items-center justify-center text-xl shrink-0 group-hover:scale-110 transition-transform">
                <i class="fa-solid fa-building-columns"></i>
              </div>
              <div class="flex-1 text-left">
                <div class="font-black text-slate-800 text-[13px] mb-0.5">Thêm ngân hàng</div>
                <div class="text-[10px] font-bold text-slate-400 leading-tight">Quản lý thông tin tài khoản ngân hàng<br>hiển thị trên phiếu đặt bàn</div>
              </div>
              <i class="fa-solid fa-chevron-right text-sm" :class="ui.activeSettingModal === 'bank' ? 'text-blue-500' : 'text-slate-300'"></i>
            </button>
          </div>
        </div>

        <!-- Section: UI -->
        <div class="space-y-3">
          <h4 class="text-[11px] font-black text-slate-400 uppercase tracking-widest pl-2">Tùy chỉnh giao diện</h4>
          <div class="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <button @click="ui.openConfig('branding')" :class="['w-full px-4 py-4 flex items-center gap-4 transition-colors border-b border-slate-50 group', ui.activeSettingModal === 'branding' ? 'bg-blue-50/50' : 'hover:bg-slate-50 active:bg-slate-100']">
              <div class="w-12 h-12 rounded-2xl bg-orange-50 text-orange-500 flex items-center justify-center text-xl shrink-0 group-hover:scale-110 transition-transform">
                <i class="fa-solid fa-pen-nib"></i>
              </div>
              <div class="flex-1 text-left">
                <div class="font-black text-slate-800 text-[13px] mb-0.5">Tinh chỉnh giao diện</div>
                <div class="text-[10px] font-bold text-slate-400 leading-tight">Tùy chỉnh logo, màu sắc, font chữ và<br>các yếu tố hiển thị trên phiếu đặt bàn</div>
              </div>
              <i class="fa-solid fa-chevron-right text-sm" :class="ui.activeSettingModal === 'branding' ? 'text-blue-500' : 'text-slate-300'"></i>
            </button>
            <button @click="ui.toggleDarkMode()" class="w-full px-4 py-4 flex items-center gap-4 transition-colors group hover:bg-slate-50 active:bg-slate-100">
              <div class="w-12 h-12 rounded-2xl flex items-center justify-center text-xl shrink-0 group-hover:scale-110 transition-transform" :class="ui.isDarkMode ? 'bg-slate-800 text-yellow-400' : 'bg-slate-100 text-slate-600'">
                <i class="fa-solid" :class="ui.isDarkMode ? 'fa-moon' : 'fa-sun'"></i>
              </div>
              <div class="flex-1 text-left">
                <div class="font-black text-slate-800 text-[13px] mb-0.5">Chế độ ban đêm (Dark Mode)</div>
                <div class="text-[10px] font-bold text-slate-400 leading-tight">Giao diện tối giúp bảo vệ mắt khi làm việc<br>vào buổi tối hoặc môi trường thiếu sáng</div>
              </div>
              <div class="w-12 flex justify-end">
                <div class="w-10 h-6 bg-slate-200 rounded-full relative transition-colors" :class="{'!bg-blue-500': ui.isDarkMode}">
                  <div class="w-5 h-5 bg-white rounded-full absolute top-0.5 left-0.5 transition-transform shadow-sm" :class="{'translate-x-4': ui.isDarkMode}"></div>
                </div>
              </div>
            </button>
          </div>
        </div>

        <!-- Section: Other -->
        <div class="space-y-3">
          <h4 class="text-[11px] font-black text-slate-400 uppercase tracking-widest pl-2">Khác</h4>
          <div class="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <button @click="handleOpenConfig('webhook')" :class="['w-full px-4 py-4 flex items-center gap-4 transition-colors group', ui.activeSettingModal === 'webhook' ? 'bg-blue-50/50' : 'hover:bg-slate-50 active:bg-slate-100']">
              <div class="w-12 h-12 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center text-xl shrink-0 group-hover:scale-110 transition-transform">
                <i class="fa-solid fa-gear"></i>
              </div>
              <div class="flex-1 text-left">
                <div class="font-black text-slate-800 text-[13px] mb-0.5">Cài đặt hệ thống</div>
                <div class="text-[10px] font-bold text-slate-400 leading-tight">Quản lý thông báo Telegram, cấu hình chung<br>và các thiết lập khác</div>
              </div>
              <i class="fa-solid fa-chevron-right text-sm" :class="ui.activeSettingModal === 'webhook' ? 'text-blue-500' : 'text-slate-300'"></i>
            </button>
            <button @click="ui.openConfig('guide')" :class="['w-full px-4 py-4 flex items-center gap-4 transition-colors group border-t border-slate-50', ui.activeSettingModal === 'guide' ? 'bg-blue-50/50' : 'hover:bg-slate-50 active:bg-slate-100']">
              <div class="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-500 flex items-center justify-center text-xl shrink-0 group-hover:scale-110 transition-transform">
                <i class="fa-solid fa-book-open"></i>
              </div>
              <div class="flex-1 text-left">
                <div class="font-black text-slate-800 text-[13px] mb-0.5">Hướng dẫn sử dụng</div>
                <div class="text-[10px] font-bold text-slate-400 leading-tight">Hướng dẫn chi tiết quy trình tạo phiếu,<br>sử dụng AI và đồng bộ dữ liệu</div>
              </div>
              <i class="fa-solid fa-chevron-right text-sm" :class="ui.activeSettingModal === 'guide' ? 'text-blue-500' : 'text-slate-300'"></i>
            </button>
          </div>
        </div>

        <button @click="appStore.logout()" class="w-full py-4 bg-white border border-rose-100 text-rose-500 rounded-2xl font-black text-sm shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2 hover:bg-rose-50 mb-8">
          <i class="fa-solid fa-arrow-right-from-bracket"></i> Đăng xuất
        </button>
      </div>
      </div> <!-- Closes Sidebar -->

      <!-- Right Content Area (Modals) -->
      <div class="flex-1 h-full overflow-hidden relative bg-white flex flex-col" :class="{'hidden md:flex': !ui.activeSettingModal, 'flex': ui.activeSettingModal}">
        <div v-if="!ui.activeSettingModal" class="hidden md:flex flex-col items-center justify-center h-full text-slate-400 p-8 text-center bg-slate-50/50">
          <i class="fa-solid fa-gear text-4xl mb-4 text-slate-300"></i>
          <h3 class="font-black text-slate-700 text-xs uppercase tracking-wider">Cấu hình hệ thống</h3>
          <p class="text-[10px] font-bold text-slate-400 mt-2 max-w-xs leading-relaxed">Chọn một danh mục cài đặt bên trái để bắt đầu cấu hình các tính năng.</p>
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
    <div v-if="ui.showStaffSelector" class="fixed inset-0 bg-blue-950/80 z-[10002] flex justify-center items-center p-4 backdrop-blur-md" @click.self="ui.showStaffSelector = false">
      <div class="bg-white rounded-3xl shadow-2xl p-6 md:p-8 max-w-sm w-[95%] md:w-full flex flex-col relative overflow-hidden border border-white/20">
        <div class="absolute top-0 left-0 right-0 h-24 bg-gradient-to-r from-blue-600 to-cyan-500 rounded-t-3xl opacity-10"></div>
        <div class="flex justify-center items-center mb-6 relative z-10 flex-col gap-3">
          <div class="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-500 text-2xl shadow-sm border border-blue-100">
            <i class="fa-solid fa-user-tag"></i>
          </div>
          <h3 class="text-xl font-black text-blue-900 uppercase tracking-tighter text-center">CHỌN NGƯỜI TẠO PHIẾU</h3>
        </div>
        <div class="grid grid-cols-2 gap-3 max-h-[50vh] overflow-y-auto custom-scrollbar p-1 relative z-10">
          <button v-for="(staff, idx) in appStore.staffList" :key="idx"
            @click="confirmStaffAndSave(staff)"
            class="p-4 rounded-2xl bg-slate-50 border border-slate-200 hover:border-blue-500 hover:bg-blue-50 hover:shadow-md transition-all active:scale-95 flex flex-col items-center justify-center gap-1 group min-h-[80px]">
            <i class="fa-solid fa-user-check text-2xl text-slate-300 group-hover:text-blue-500 mb-1 transition-colors"></i>
            <span class="font-black text-xs uppercase text-slate-700 text-center leading-tight">{{ staff.name }}</span>
            <span class="text-[9px] font-mono font-bold text-slate-400">{{ staff.phone }}</span>
          </button>
        </div>
        <div class="relative z-10 mt-6">
          <button @click="ui.showStaffSelector = false" class="w-full py-4 bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700 rounded-xl font-black uppercase tracking-widest text-[10px] active:scale-95 transition-all shadow-sm">HỦY BỎ</button>
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

    <!-- COMMAND PALETTE MODAL -->
    <transition name="fade">
      <div v-if="ui.showCommandPalette" class="fixed inset-0 z-[99999] flex items-start justify-center pt-[10vh] px-4 backdrop-blur-sm bg-slate-950/60" @click.self="ui.showCommandPalette = false">
        <div class="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-xl flex flex-col overflow-hidden max-h-[75vh] transition-all transform duration-300">
          <!-- Search Header -->
          <div class="p-4 border-b border-slate-100 flex items-center gap-3 bg-slate-50">
            <i class="fa-solid fa-magnifying-glass text-slate-400 text-lg"></i>
            <input
              id="palette-search"
              v-model="searchQuery"
              class="flex-1 bg-transparent border-none outline-none font-bold text-slate-800 text-sm placeholder-slate-400"
              placeholder="Tìm tên, SĐT, số bàn hoặc gõ lệnh /..."
              autocomplete="off"
            >
            <kbd class="hidden md:inline-flex items-center gap-0.5 px-2 py-0.5 rounded border border-slate-200 bg-white text-[10px] font-bold text-slate-400 shadow-sm">ESC</kbd>
          </div>

          <!-- Content Area -->
          <div class="flex-grow overflow-y-auto p-2 custom-scrollbar space-y-4 max-h-[50vh]">
            <!-- Booking Search Results -->
            <div v-if="searchResults.length > 0" class="space-y-1">
              <div class="px-3 py-1.5 text-[10px] font-black uppercase text-slate-400 tracking-wider">Đơn đặt bàn khớp kết quả</div>
              <button
                v-for="order in searchResults"
                :key="order.id"
                @click="handleResultClick(order)"
                class="w-full text-left px-3 py-2.5 rounded-xl hover:bg-blue-50/50 active:bg-blue-50 transition-colors flex items-center justify-between border border-transparent hover:border-blue-100/50"
              >
                <div class="min-w-0">
                  <div class="font-black text-slate-800 text-xs flex items-center gap-2">
                    <span>{{ order.parsedCustomer.name }}</span>
                    <span v-if="order.parsedCustomer.tables" class="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[9px] font-black border border-blue-100">Bàn {{ order.parsedCustomer.tables }}</span>
                  </div>
                  <div class="text-[10px] text-slate-400 font-semibold mt-0.5 flex items-center gap-3">
                    <span><i class="fa-solid fa-phone text-[8px]"></i> {{ order.parsedCustomer.phone }}</span>
                    <span><i class="fa-solid fa-calendar text-[8px]"></i> {{ order.parsedCustomer.date }} ({{ order.parsedCustomer.time }})</span>
                  </div>
                </div>
                <i class="fa-solid fa-chevron-right text-slate-300 text-xs pr-1"></i>
              </button>
            </div>

            <!-- Commands -->
            <div class="space-y-1">
              <div class="px-3 py-1.5 text-[10px] font-black uppercase text-slate-400 tracking-wider">Lệnh điều hướng nhanh</div>
              <button
                v-for="cmd in filteredCommands"
                :key="cmd.cmd"
                @click="executeCommand(cmd.cmd)"
                class="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-50 active:bg-slate-100 transition-colors flex items-center gap-3 border border-transparent hover:border-slate-100"
              >
                <div class="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center border border-slate-100 shrink-0">
                  <i class="fa-solid" :class="cmd.icon"></i>
                </div>
                <div class="flex-grow">
                  <div class="font-black text-slate-800 text-xs flex items-center justify-between">
                    <span>{{ cmd.label }}</span>
                    <span class="text-[9px] font-mono font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{{ cmd.cmd }}</span>
                  </div>
                  <div class="text-[10px] text-slate-400 mt-0.5 font-semibold leading-tight">{{ cmd.desc }}</div>
                </div>
              </button>
            </div>

            <!-- No results -->
            <div v-if="searchQuery && searchResults.length === 0 && filteredCommands.length === 0" class="text-center py-8 text-slate-400 font-semibold text-xs">
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
