<script setup lang="ts">
import { computed, ref, defineAsyncComponent } from 'vue'
import { useUIStore } from '@/stores/useUIStore'
import { useFormStore } from '@/stores/useFormStore'
import { useConfigStore } from '@/stores/useConfigStore'
import { useAppStore } from '@/stores/useAppStore'
import { useBillRender } from '@/composables/useBillRender'
import { useForm } from '@/composables/useForm'
import { useTabSwipe, haptic } from '@/composables/useGestures'
import AIInputPanel from '@/components/forms/AIInputPanel.vue'
import CustomerForm from '@/components/forms/CustomerForm.vue'
import DepositManager from '@/components/forms/DepositManager.vue'
import MenuItemsEditor from '@/components/forms/MenuItemsEditor.vue'
import HistoryList from '@/components/history/HistoryList.vue'
import QuickDashboard from '@/components/history/QuickDashboard.vue'
import BillPreview from './BillPreview.vue'
import { formatVND } from '@/utils'

// Tab components
import HistoryTimeline from '@/components/history/HistoryTimeline.vue'
const AnalyticsDashboard = defineAsyncComponent(() => import('@/components/history/AnalyticsDashboard.vue'))
const TestDashboard = defineAsyncComponent(() => import('@/components/history/TestDashboard.vue'))
const LogViewer = defineAsyncComponent(() => import('@/components/history/LogViewer.vue'))

const showChecklist = ref(true)

const buildInfo = computed(() => {
  try {
    const ts = typeof __BUILD_TIMESTAMP__ !== 'undefined' ? __BUILD_TIMESTAMP__ : 'dev'
    const hash = typeof __BUILD_HASH__ !== 'undefined' ? __BUILD_HASH__ : 'local'
    if (ts === 'dev') return 'Development Build'
    const d = new Date(ts)
    return `Hash #${hash} - Built: ${d.toLocaleString('vi-VN', { hour12: false })}`
  } catch {
    return 'v2.5.0-APEX'
  }
})

const checklistItems = computed(() => {
  return [
    { name: 'Khách & SĐT', done: !!(formStore.customer.name && formStore.customer.phone) },
    { name: 'Ngày & Giờ tiệc', done: !!(formStore.customer.date && formStore.customer.time) },
    { name: 'Số lượng khách', done: !!formStore.customer.pax },
    { name: 'Khu & Số bàn', done: !!formStore.customer.tables },
    { name: 'Thực đơn món ăn', done: formStore.items.length > 0 && formStore.items.some(i => i.name && i.qty > 0) },
    { name: 'Thông tin cọc', done: formStore.deposit.amount > 0 || formStore.deposit.isPaid }
  ]
})

const checklistPercent = computed(() => {
  const total = checklistItems.value.length
  const done = checklistItems.value.filter(item => item.done).length
  return Math.round((done / total) * 100)
})

const ui = useUIStore()
const formStore = useFormStore()
const configStore = useConfigStore()
const appStore = useAppStore()
const { triggerSave } = useBillRender()
const { copyBookingConfirmation, validateForm } = useForm()

const hasSoftWarning = computed(() => {
  const meta = formStore.aiMetadata
  const score = meta && typeof meta.confidence_score === 'number' ? meta.confidence_score : 1.0
  return score < 0.80 || (formStore.warnings && formStore.warnings.length > 0)
})

const doSave = (type: string) => { haptic('light'); triggerSave(type, validateForm); showActionSheet.value = false; }

const showDropdown = ref(false)
const showActionSheet = ref(false)
const showMoreSheet = ref(false)
const isHeaderCompact = ref(false)

function onContainerScroll(e: Event) {
  const el = e.target as HTMLElement
  if (el && el.scrollTop !== undefined) {
    isHeaderCompact.value = el.scrollTop > 24
  }
}

function reloadApp() {
  window.location.reload()
}

// --- Tab Swipe (mobile only) ---
const mobileTabs = ['dashboard', 'timeline', 'history', 'analytics', 'create', 'preview', 'test']
const tabRef = computed(() => ui.tab)
const { onSwipeStart, onSwipeEnd } = useTabSwipe(
  tabRef as any,
  mobileTabs,
  (tab) => {
    if (tab === 'history' || tab === 'timeline') appStore.loadHistory(false)
    else ui.tab = tab as any
  }
)

// --- Share Link for current order ---
function shareCurrentBill() {
  const id = formStore.id
  if (!id || !formStore.customer.name) {
    ui.showToast('Vui lòng nhập thông tin đơn hàng trước!', 'warning')
    return
  }
  const url = `${window.location.origin}${window.location.pathname}#/bill/${id}`
  navigator.clipboard.writeText(url).then(() => {
    haptic('light')
    ui.showToast(`📤 Đã copy link bill!`, 'success')
  }).catch(() => ui.showAlert('Link Bill', url))
}

// --- Share Link Đặt bàn Online cho khách ---
function copyCustomerBookingLink() {
  haptic('light')
  const url = `${window.location.origin}${window.location.pathname}#/dat-ban`
  navigator.clipboard.writeText(url).then(() => {
    ui.showToast('📋 Đã sao chép link Đặt bàn Online gửi cho khách!', 'success')
  }).catch(() => {
    prompt('Link đặt bàn cho khách:', url)
  })
}

// --- Quick Actions ---
function handleCreateNewForm() {
  haptic('light')
  formStore.$reset()
  ui.tab = 'create'
  showActionSheet.value = false
  ui.showToast('Đã khởi tạo phiếu mới!', 'success')
}

function toggleDepositPaid() {
  haptic('light')
  formStore.deposit.isPaid = !formStore.deposit.isPaid
  ui.showToast(formStore.deposit.isPaid ? 'Đã đánh dấu ĐÃ CỌC!' : 'Đã bỏ đánh dấu cọc!', 'success')
}

function openCareForCurrentForm() {
  haptic('light')
  if (!formStore.customer.name) {
    ui.showToast('Vui lòng nhập tên khách hàng!', 'warning')
    return
  }
  ui.activeOrderForCare = {
    id: formStore.id || 'draft',
    depositAmount: formStore.deposit.amount,
    isDeposited: formStore.deposit.isPaid,
    parsedCustomer: { ...formStore.customer },
    menuItems: [ ...formStore.items ]
  }
  ui.showCustomerCareModal = true
  showActionSheet.value = false
}

function goToTodayTimeline() {
  haptic('light')
  const d = new Date()
  ui.selectedTimelineDate = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  ui.tab = 'timeline'
  showActionSheet.value = false
}

function goToTomorrowTimeline() {
  haptic('light')
  const d = new Date()
  d.setDate(d.getDate() + 1)
  ui.selectedTimelineDate = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  ui.tab = 'timeline'
  showActionSheet.value = false
}
</script>

<template>
  <div
    class="w-full h-full flex-1 bg-white dark:bg-slate-900 flex flex-col z-20 text-[13px] safe-area-pt transition-colors duration-200"
    @touchstart="onSwipeStart"
    @touchend="onSwipeEnd"
  >
    <!-- HEADER -->
    <header 
      class="flex-shrink-0 bg-slate-900 dark:bg-slate-950 text-white px-3 md:px-4 flex items-center justify-between gap-2 md:gap-3 relative z-20 box-border w-full border-b border-slate-800 transition-all duration-200"
      :class="isHeaderCompact ? 'h-[52px] sm:h-[56px] py-1' : 'min-h-[64px] sm:min-h-[68px] py-2'"
    >
      <!-- LEFT: LOGO / APP NAME -->
      <div class="flex items-center gap-2.5 relative z-10 min-w-0">
        <div 
          class="bg-white rounded-xl shadow-md flex items-center justify-center overflow-hidden border border-slate-200/80 shrink-0 transition-all duration-200"
          :class="isHeaderCompact ? 'w-8 h-8 p-0.5' : 'w-9 h-9 p-1'"
          style="background-color: #ffffff !important;"
        >
          <img :src="configStore.branding.logo || '/images/brand-logo.svg'" class="w-full h-full object-contain" alt="KG Logo" loading="lazy" />
        </div>
        <div class="min-w-0">
          <h1 
            class="font-black tracking-wider leading-none text-white uppercase flex items-center gap-1.5 transition-all duration-200"
            :class="isHeaderCompact ? 'text-xs' : 'text-sm'" 
            style="font-family: 'Be Vietnam Pro', sans-serif;"
          >
            KING'S GRILL
            <span class="w-2 h-2 rounded-full shrink-0 transition-all"
                  :class="{
                    'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)] animate-pulse': ui.connectionStatus === 'online' && appStore.offlineQueueCount === 0,
                    'bg-amber-400 animate-pulse': ui.connectionStatus === 'reconnecting' || ui.connectionStatus === 'syncing' || (ui.connectionStatus === 'online' && appStore.offlineQueueCount > 0),
                    'bg-rose-400': ui.connectionStatus === 'offline' || ui.connectionStatus === 'error'
                  }"></span>
          </h1>
          <div class="flex items-center gap-1.5 mt-1" :class="{'hidden sm:flex': isHeaderCompact}">
            <button 
              @click="ui.showVersionModal = true" 
              :title="`Build: ${buildInfo}`"
              class="hidden sm:flex px-1.5 py-0.5 rounded bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 font-mono text-[9px] font-bold border border-blue-400/30 shrink-0 cursor-pointer transition-all active:scale-95 items-center gap-1"
            >
              <i class="fa-solid fa-sparkles text-[8px] text-amber-300"></i>
              <span>v2.5.0-APEX</span>
            </button>
            <span class="text-[9px] font-bold uppercase tracking-wider tabular-nums transition-colors"
                  :class="(ui.connectionStatus === 'offline' || ui.connectionStatus === 'error') ? 'text-rose-400' : (ui.connectionStatus === 'reconnecting' || ui.connectionStatus === 'syncing') ? 'text-amber-400' : 'text-slate-400'">
              {{ 
                ui.connectionStatus === 'syncing' ? 'Đang đồng bộ...' : 
                ui.connectionStatus === 'reconnecting' ? 'Đang kết nối lại...' :
                (ui.connectionStatus === 'offline' || ui.connectionStatus === 'error') ? 'Ngoại tuyến' : 
                appStore.offlineQueueCount > 0 ? `${appStore.offlineQueueCount} đơn chờ` : 'Trực tuyến'
              }}
            </span>
          </div>
        </div>
      </div>

      <!-- CENTER: NAVIGATION TABS (DESKTOP) - 3 Phân Hệ Workspace Vận Hành Chuyên Nghiệp -->
      <div class="hidden md:flex items-center gap-1.5 bg-slate-800/60 dark:bg-slate-900/60 p-1.5 rounded-2xl border border-slate-700/40 mx-2 flex-1 justify-center relative z-10 overflow-x-auto scrollbar-none flex-nowrap backdrop-blur-md">
        <!-- Phân hệ 1: TIẾP NHẬN ĐƠN (Booking Intake) -->
        <div class="flex items-center gap-1 bg-slate-900/80 dark:bg-slate-950/70 p-1 rounded-xl border border-blue-500/25 shadow-sm">
          <button @click="ui.tab = 'create'" :class="['px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 min-h-[32px] whitespace-nowrap cursor-pointer', ui.tab === 'create' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-300 hover:text-white hover:bg-slate-800/60']" title="Tạo phiếu đặt bàn mới (AI / Nhập tay)">
            <i class="fa-solid fa-plus text-xs text-blue-300"></i>
            <span>Tạo Phiếu</span>
          </button>
          <button v-if="formStore.customer.name || formStore.id" @click="ui.tab = 'preview'" :class="['px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 min-h-[32px] whitespace-nowrap cursor-pointer', ui.tab === 'preview' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-300 hover:text-white hover:bg-slate-800/60']" title="Xem & In phiếu Cukcuk K80">
            <i class="fa-solid fa-eye text-xs text-cyan-300"></i>
            <span>Xem Phiếu</span>
          </button>
        </div>

        <div class="h-4 w-[1px] bg-slate-700/60 mx-0.5"></div>

        <!-- Phân hệ 2: ĐIỀU PHỐI CA TRỰC TIẾP (Live Shift Operations) -->
        <div class="flex items-center gap-1 bg-slate-900/80 dark:bg-slate-950/70 p-1 rounded-xl border border-emerald-500/25 shadow-sm">
          <button @click="ui.tab = 'timeline'; appStore.loadHistory(false)" :class="['px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 min-h-[32px] whitespace-nowrap cursor-pointer', ui.tab === 'timeline' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-300 hover:text-white hover:bg-slate-800/60']" title="Lịch bàn tiệc theo khung giờ">
            <i class="fa-solid fa-calendar-days text-xs text-emerald-300"></i>
            <span>Lịch Bàn</span>
          </button>
          <button @click="ui.showFloorPlan = true" class="px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 min-h-[32px] whitespace-nowrap text-slate-300 hover:text-white hover:bg-slate-800/60 cursor-pointer" title="Sơ đồ mặt bằng phòng & bàn (Khu A, C, VIP)">
            <i class="fa-solid fa-map text-xs text-amber-300"></i>
            <span>Sơ Đồ Bàn</span>
          </button>
          <button @click="ui.tab = 'dashboard'" :class="['px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 min-h-[32px] whitespace-nowrap cursor-pointer', ui.tab === 'dashboard' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-300 hover:text-white hover:bg-slate-800/60']" title="Bảng tổng quan ca trực">
            <i class="fa-solid fa-gauge-high text-xs text-teal-300"></i>
            <span>Tổng Quan</span>
          </button>
        </div>

        <div class="h-4 w-[1px] bg-slate-700/60 mx-0.5"></div>

        <!-- Phân hệ 3: KHÁCH HÀNG & DỮ LIỆU (CRM & Analytics Hub) -->
        <div class="flex items-center gap-1 bg-slate-900/80 dark:bg-slate-950/70 p-1 rounded-xl border border-purple-500/25 shadow-sm">
          <button @click="ui.tab = 'history'; appStore.loadHistory(false)" :class="['px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 min-h-[32px] whitespace-nowrap cursor-pointer', ui.tab === 'history' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-300 hover:text-white hover:bg-slate-800/60']" title="Danh sách lịch sử đặt bàn">
            <i class="fa-solid fa-list-ul text-xs text-purple-300"></i>
            <span>Lịch Sử</span>
          </button>
          <button @click="ui.tab = 'analytics'; appStore.loadHistory(false)" :class="['px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 min-h-[32px] whitespace-nowrap cursor-pointer', ui.tab === 'analytics' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-300 hover:text-white hover:bg-slate-800/60']" title="Báo cáo doanh số & phân tích">
            <i class="fa-solid fa-chart-pie text-xs text-indigo-300"></i>
            <span>Báo Cáo</span>
          </button>
          <button @click="ui.showSocialBotModal = true" class="px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 min-h-[32px] whitespace-nowrap text-amber-300 hover:text-white hover:bg-amber-500/20 cursor-pointer" title="Quản lý Live Chat Fanpage AI">
            <i class="fa-solid fa-robot text-amber-400 animate-pulse text-xs"></i>
            <span>Social Bot</span>
          </button>
          <button @click="copyCustomerBookingLink" class="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 min-h-[32px] whitespace-nowrap text-emerald-300 hover:text-white hover:bg-emerald-500/20 cursor-pointer" title="Sao chép link Đặt bàn Online gửi cho khách hàng">
            <i class="fa-solid fa-link text-emerald-400 text-xs"></i>
            <span>Link Khách</span>
          </button>
        </div>
      </div>

      <!-- RIGHT: QUICK ACTIONS / SYSTEM -->
      <div class="flex items-center gap-1 relative z-10 shrink-0">
        <!-- Online/Offline Status Indicator (Mobile Only) -->
        <div class="md:hidden w-7 h-7 rounded-xl bg-slate-800/60 flex items-center justify-center border border-slate-700/40"
             :title="ui.connectionStatus === 'online' ? 'Trực tuyến' : ui.connectionStatus === 'reconnecting' ? 'Đang kết nối lại' : ui.connectionStatus === 'syncing' ? 'Đang đồng bộ' : 'Ngoại tuyến'">
          <span class="w-2.5 h-2.5 rounded-full transition-all" 
                :class="{
                  'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]': ui.connectionStatus === 'online' && appStore.offlineQueueCount === 0, 
                  'bg-yellow-400 animate-pulse': ui.connectionStatus === 'syncing' || ui.connectionStatus === 'reconnecting', 
                  'bg-amber-400 animate-pulse': ui.connectionStatus === 'online' && appStore.offlineQueueCount > 0,
                  'bg-rose-400': ui.connectionStatus === 'offline' || ui.connectionStatus === 'error'
                }"></span>
        </div>

        <!-- Search Command Palette (Mobile 48px hit target) -->
        <button 
          @click="ui.showCommandPalette = true" 
          class="touch-target-48 rounded-xl bg-slate-800/80 hover:bg-slate-700 flex items-center justify-center border border-slate-700/40 transition-all active:scale-95 text-slate-300 hover:text-white"
          title="Tìm kiếm nhanh (Ctrl+K)"
          aria-label="Tìm kiếm nhanh"
        >
          <i class="fa-solid fa-magnifying-glass text-sm"></i>
        </button>

        <!-- Sync Button (Desktop) -->
        <button @click="appStore.loadHistory(false)" class="hidden md:flex w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 items-center justify-center border border-slate-700/40 transition-all active:scale-95 text-slate-300 hover:text-white" title="Đồng bộ dữ liệu Cloud">
          <i class="fa-solid fa-rotate text-xs" :class="{'animate-spin text-blue-400': ui.isFetchingAPI}"></i>
        </button>

        <!-- Dark/Light Mode Toggle (Desktop Direct 1-Click) -->
        <button @click="ui.toggleDarkMode()" class="hidden md:flex w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 items-center justify-center border border-slate-700/40 transition-all active:scale-95 text-slate-300 hover:text-white" :title="ui.isDarkMode ? 'Chuyển giao diện Sáng' : 'Chuyển giao diện Tối'">
          <i class="fa-solid text-xs" :class="ui.isDarkMode ? 'fa-sun text-amber-400' : 'fa-moon text-slate-300'"></i>
        </button>

        <!-- Settings Button (Desktop) -->
        <button @click="ui.showSettingsHub = true" class="hidden md:flex w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 items-center justify-center border border-slate-700/40 transition-all active:scale-95 text-slate-300 hover:text-white" title="Cài đặt hệ thống">
          <i class="fa-solid fa-gear text-xs"></i>
        </button>

        <!-- Logout Button (Desktop) -->
        <button @click="appStore.logout()" class="hidden md:flex w-9 h-9 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 items-center justify-center border border-rose-900/30 transition-all active:scale-95 text-rose-300 hover:text-rose-100" title="Đăng xuất">
          <i class="fa-solid fa-arrow-right-from-bracket text-xs"></i>
        </button>

        <!-- More Menu for Mobile (48px hit target) -->
        <div class="relative md:hidden">
          <button 
            @click="showDropdown = !showDropdown" 
            class="touch-target-48 rounded-xl bg-slate-800/80 hover:bg-slate-700 flex items-center justify-center border border-slate-700/40 transition-all active:scale-95 text-slate-300 hover:text-white"
            aria-label="Thao tác thêm"
          >
            <i class="fa-solid fa-ellipsis-vertical text-sm"></i>
          </button>
          
          <div v-if="showDropdown" @click="showDropdown = false" class="fixed inset-0 z-[100]"></div>

          <transition enter-active-class="transition ease-out duration-100" enter-from-class="transform opacity-0 scale-95" enter-to-class="transform opacity-100 scale-100" leave-active-class="transition ease-in duration-75" leave-from-class="transform opacity-100 scale-100" leave-to-class="transform opacity-0 scale-95">
            <div v-if="showDropdown" class="absolute top-full right-0 mt-2 w-52 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 py-1.5 z-[101] text-slate-800 dark:text-slate-100">
              <button @click="ui.showSettingsHub = true; showDropdown = false" class="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                <i class="fa-solid fa-gear text-slate-400"></i>
                <span class="font-bold text-xs">Cài đặt hệ thống</span>
              </button>
              <button @click="ui.showSocialBotModal = true; showDropdown = false" class="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                <i class="fa-solid fa-robot text-amber-500"></i>
                <span class="font-bold text-xs">Quản lý Social Bot</span>
              </button>
              <button @click="copyCustomerBookingLink(); showDropdown = false" class="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                <i class="fa-solid fa-link text-emerald-500"></i>
                <span class="font-bold text-xs">Link Đặt Bàn Khách</span>
              </button>
              <button @click="ui.toggleDarkMode(); showDropdown = false" class="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                <i class="fa-solid" :class="ui.isDarkMode ? 'fa-sun text-amber-400' : 'fa-moon text-slate-400'"></i>
                <span class="font-bold text-xs">{{ ui.isDarkMode ? 'Giao diện Sáng' : 'Giao diện Tối' }}</span>
              </button>
              <button @click="reloadApp" class="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                <i class="fa-solid fa-rotate-right text-slate-400"></i>
                <span class="font-bold text-xs">Tải lại (Refresh)</span>
              </button>
              <button @click="appStore.loadHistory(false); showDropdown = false" class="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                <i class="fa-solid fa-cloud-arrow-down text-slate-400"></i>
                <span class="font-bold text-xs">Đồng bộ Cloud</span>
              </button>
              <button @click="ui.showVersionModal = true; showDropdown = false" class="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                <i class="fa-solid fa-sparkles text-amber-400"></i>
                <span class="font-bold text-xs">Thông tin phiên bản</span>
              </button>
              <div class="h-[1px] bg-slate-100 dark:bg-slate-800 my-1"></div>
              <button @click="appStore.logout()" class="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 transition-colors">
                <i class="fa-solid fa-arrow-right-from-bracket"></i>
                <span class="font-bold text-xs">Đăng xuất</span>
              </button>
            </div>
          </transition>
        </div>
      </div>
    </header>

    <!-- TAB CONTENT WRAPPER -->
    <div class="flex-grow relative overflow-hidden flex flex-col bg-slate-50 dark:bg-slate-950 z-0 min-h-0 w-full transition-colors duration-200">
      <!-- Active tab content (Always 100% width) -->
      <div class="flex-grow flex flex-col overflow-hidden relative min-h-0 w-full">
        <transition name="tab-fade" mode="out-in">
          <KeepAlive>
            <QuickDashboard v-if="ui.tab === 'dashboard'" key="dashboard" />
            <HistoryTimeline v-else-if="ui.tab === 'timeline'" key="timeline" />
            <HistoryList v-else-if="ui.tab === 'history'" key="history" />
            <AnalyticsDashboard v-else-if="ui.tab === 'analytics'" key="analytics" />
            <TestDashboard v-else-if="ui.tab === 'test'" key="test" />
            <LogViewer v-else-if="ui.tab === 'logs'" key="logs" class="flex-grow overflow-y-auto p-4 custom-scrollbar" />
            <div v-else-if="ui.tab === 'create'" key="create" class="flex-grow flex flex-col overflow-hidden relative min-h-0">
              <div @scroll.passive="onContainerScroll" class="flex-grow overflow-y-auto p-3 md:p-4 space-y-3 pb-6 bg-slate-50/50 dark:bg-slate-950/50 scroll-smooth custom-scrollbar">
                <!-- Mode Edit Warning Banner -->
                <div v-if="formStore.id" class="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50 rounded-2xl p-3.5 md:p-4 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 animate-fade-in">
                  <div class="flex items-center gap-2.5">
                    <div class="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                      <i class="fa-solid fa-pen-to-square"></i>
                    </div>
                    <div>
                      <div class="font-bold text-slate-900 dark:text-slate-100 text-xs uppercase tracking-wider">Đang chỉnh sửa phiếu đặt</div>
                      <div class="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">Khách: <span class="text-blue-600 dark:text-blue-400 font-bold">{{ formStore.customer.name || 'Chưa có tên' }}</span> <span v-if="formStore.customer.phone">(SĐT: {{ formStore.customer.phone }})</span></div>
                    </div>
                  </div>
                  <button @click="handleCreateNewForm" class="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl font-bold text-xs uppercase transition-all flex items-center justify-center gap-1.5 shadow-sm shrink-0">
                    <i class="fa-solid fa-file-circle-plus"></i> Tạo lịch mới
                  </button>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                  <!-- Left side: AI Input and Progress -->
                  <div class="lg:col-span-5 space-y-3">
                    <AIInputPanel />

                    <!-- Smart Checklist Widget -->
                    <div class="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
                      <div class="flex items-center justify-between cursor-pointer" @click="showChecklist = !showChecklist">
                        <div class="flex items-center gap-2">
                          <i class="fa-solid fa-list-check text-blue-600 text-sm"></i>
                          <span class="font-black text-slate-800 text-[11px] uppercase tracking-widest">Tiến độ hoàn thiện phiếu</span>
                          <span class="px-2 py-0.5 rounded-full text-[10px] font-black" :class="checklistPercent === 100 ? 'bg-green-100 text-green-700' : 'bg-blue-50 text-blue-700'">
                            {{ checklistPercent }}%
                          </span>
                        </div>
                        <i class="fa-solid text-slate-400 text-xs transition-transform" :class="showChecklist ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
                      </div>
                      
                      <div v-show="showChecklist" class="space-y-2 pt-2 border-t border-slate-100 transition-all duration-300">
                        <!-- Progress Bar -->
                        <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                          <div class="bg-gradient-to-r from-blue-500 to-indigo-600 h-full transition-all duration-500" :style="{ width: `${checklistPercent}%` }"></div>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-2 text-xs pt-1">
                          <div v-for="item in checklistItems" :key="item.name" class="flex items-center gap-2 p-2 rounded-xl border transition-all" :class="item.done ? 'bg-green-50/40 border-green-100 text-green-700 font-bold' : 'bg-slate-50/45 border-slate-100 text-slate-400 font-semibold'">
                            <i class="fa-solid" :class="item.done ? 'fa-circle-check text-green-500' : 'fa-circle text-slate-300'"></i>
                            <span>{{ item.name }}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- Smart Warning Widget -->
                    <div v-if="hasSoftWarning" class="bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/60 rounded-2xl p-4 shadow-sm space-y-2">
                      <div class="flex items-center gap-2 text-amber-800 dark:text-amber-200 font-black uppercase text-xs">
                        <i class="fa-solid fa-triangle-exclamation text-amber-500 text-sm"></i>
                        Cảnh báo phân tích AI
                      </div>
                      <ul class="list-disc pl-4 text-xs text-amber-700 dark:text-amber-300 space-y-1 font-medium">
                        <li v-if="formStore.aiMetadata && typeof formStore.aiMetadata.confidence_score === 'number' && formStore.aiMetadata.confidence_score < 0.8">
                          Đo độ tin cậy AI thấp ({{ Math.round(formStore.aiMetadata.confidence_score * 100) }}%). Vui lòng kiểm tra lại.
                        </li>
                        <li v-for="(warn, idx) in formStore.warnings" :key="idx">
                          {{ warn }}
                        </li>
                      </ul>
                    </div>
                  </div>

                  <!-- Right side: Manual input forms -->
                  <div class="lg:col-span-7 space-y-4">
                    <CustomerForm />
                    <DepositManager />
                    <MenuItemsEditor />
                  </div>
                </div>
              </div>

              <!-- Sticky bottom bar -->
              <div class="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-3.5 md:p-4 shrink-0 shadow-[0_-4px_16px_rgba(0,0,0,0.04)] dark:shadow-[0_-4px_16px_rgba(0,0,0,0.3)] flex flex-wrap items-center justify-between gap-3 z-10 safe-area-pb transition-colors duration-200">
                <div class="min-w-0">
                  <div class="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Tổng tạm tính</div>
                  <div class="text-base font-black text-slate-900 dark:text-slate-100 tracking-tight leading-none mt-1">
                    {{ formatVND(formStore.calculatedTotals.final) }}
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <!-- Nút Thao tác nhanh (Desktop) -->
                  <button 
                    @click="showActionSheet = !showActionSheet" 
                    title="Mở menu thao tác nhanh"
                    class="hidden md:inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white rounded-xl py-2.5 px-3.5 font-bold text-xs uppercase shadow-sm transition-all active:scale-95 border border-slate-700/80 dark:border-indigo-400/30"
                  >
                    <i class="fa-solid fa-bolt-lightning text-amber-400 text-xs"></i>
                    <span>Thao tác nhanh</span>
                  </button>

                  <button v-if="formStore.id" @click="handleCreateNewForm" class="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl py-2.5 px-3.5 font-bold text-xs uppercase flex items-center justify-center gap-1.5 transition-all active:scale-95 border border-slate-200 dark:border-slate-700">
                    <i class="fa-solid fa-file-circle-plus text-slate-400"></i> Tạo lịch mới
                  </button>
                  <button v-if="formStore.id" @click="doSave('save')" class="bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-2.5 px-4 font-bold text-xs uppercase shadow-sm flex items-center justify-center gap-1.5 transition-all active:scale-95">
                    <i class="fa-solid fa-cloud-arrow-up text-sm text-blue-200"></i> Cập Nhật
                  </button>
                  <button v-else-if="formStore.customer.name" @click="doSave('save')" class="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-2.5 px-5 font-bold text-xs uppercase shadow-sm flex items-center justify-center gap-1.5 transition-all active:scale-95">
                    <i class="fa-solid fa-check-double text-sm text-emerald-200"></i> Tạo Đơn
                  </button>
                </div>
              </div>
            </div>
          </KeepAlive>
        </transition>
      </div>

      <!-- Bill Preview (Overlay độc lập cho cả desktop và mobile) -->
      <div 
        v-show="ui.tab === 'preview'" 
        class="absolute inset-0 z-[110] bg-slate-100 dark:bg-slate-950 flex flex-col w-full h-full overflow-hidden animate-fade-in"
      >
        <BillPreview />
      </div>
    </div>

    <!-- FLOATING ACTION BUTTON (MOBILE) -->
    <div v-show="ui.tab === 'create'" class="md:hidden fixed bottom-[142px] right-3.5 z-[100] safe-area-pb">
      <button 
        @click="showActionSheet = true" 
        aria-label="Thao tác nhanh"
        class="h-10 px-3.5 bg-slate-900/95 dark:bg-indigo-600/95 hover:bg-slate-800 dark:hover:bg-indigo-500 rounded-full shadow-lg shadow-slate-950/30 dark:shadow-indigo-950/40 flex items-center justify-center gap-1.5 text-white font-bold text-xs active:scale-90 transition-all border border-white/20 dark:border-indigo-400/40 backdrop-blur-md"
      >
        <i class="fa-solid fa-bolt-lightning text-amber-400 text-xs"></i>
        <span>Thao tác</span>
      </button>
    </div>

    <!-- ACTION MENU BOTTOM SHEET & DIALOG -->
    <transition name="fade">
      <div v-if="showActionSheet" class="fixed inset-0 z-[110] flex flex-col justify-end md:justify-center md:items-center p-0 md:p-4">
        <div class="fixed inset-0 bg-slate-950/60 backdrop-blur-sm" @click="showActionSheet = false"></div>
        <transition name="slide-up" appear>
          <div v-if="showActionSheet" class="bg-white dark:bg-slate-900 border-t md:border border-slate-200/90 dark:border-slate-800 rounded-t-3xl md:rounded-2xl p-5 md:p-6 relative z-10 shadow-2xl pb-safe max-h-[85vh] md:max-w-xl w-full overflow-y-auto">
            <!-- Mobile drag indicator -->
            <div class="md:hidden w-12 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto mb-4"></div>
            
            <div class="flex items-center justify-between mb-5 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div class="flex items-center gap-2.5">
                <div class="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-500 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/40 text-sm">
                  <i class="fa-solid fa-bolt-lightning"></i>
                </div>
                <div>
                  <h3 class="font-black text-slate-900 dark:text-slate-100 text-sm uppercase tracking-wider">Thao tác nhanh</h3>
                  <p class="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Lối tắt xử lý phiếu đặt & xuất dữ liệu</p>
                </div>
              </div>
              <button @click="showActionSheet = false" aria-label="Đóng" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <i class="fa-solid fa-xmark text-sm"></i>
              </button>
            </div>
            
            <div class="space-y-4">
              <!-- Nhóm 1: Quản lý Phiếu -->
              <div class="space-y-2">
                <div class="text-[10px] font-black uppercase text-slate-400 dark:text-slate-400 tracking-wider flex items-center gap-1.5">
                  <i class="fa-solid fa-receipt text-[9px] text-indigo-500"></i>
                  <span>Quản lý phiếu đặt</span>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button @click="handleCreateNewForm(); showActionSheet = false" class="bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 p-3 rounded-xl font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-700/80 transition-all active:scale-95 flex flex-col items-center justify-center gap-1.5 border border-slate-200/80 dark:border-slate-700 shadow-sm min-h-[58px]">
                    <i class="fa-solid fa-file-circle-plus text-lg text-slate-500 dark:text-slate-300"></i>
                    <span>Tạo mới</span>
                  </button>
                  <button @click="toggleDepositPaid" class="p-3 rounded-xl font-bold text-xs transition-all active:scale-95 flex flex-col items-center justify-center gap-1.5 border shadow-sm min-h-[58px]"
                    :class="formStore.deposit.isPaid ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-400' : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/80'">
                    <i class="fa-solid text-lg" :class="formStore.deposit.isPaid ? 'fa-circle-check text-emerald-500 dark:text-emerald-400' : 'fa-circle text-slate-400'"></i>
                    <span>{{ formStore.deposit.isPaid ? 'Đã cọc' : 'Chưa cọc' }}</span>
                  </button>
                  <button @click="copyBookingConfirmation(); showActionSheet = false" class="bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 p-3 rounded-xl font-bold text-xs hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-all active:scale-95 flex flex-col items-center justify-center gap-1.5 border border-indigo-200/70 dark:border-indigo-800/50 shadow-sm min-h-[58px]">
                    <i class="fa-solid fa-copy text-lg text-indigo-600 dark:text-indigo-400"></i>
                    <span>Copy xác nhận</span>
                  </button>
                  <button @click="openCareForCurrentForm(); showActionSheet = false" class="bg-sky-50/70 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 p-3 rounded-xl font-bold text-xs hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-all active:scale-95 flex flex-col items-center justify-center gap-1.5 border border-sky-200/70 dark:border-sky-800/50 shadow-sm min-h-[58px]">
                    <i class="fa-solid fa-paper-plane text-lg text-sky-600 dark:text-sky-400"></i>
                    <span>Gửi phiếu</span>
                  </button>
                </div>
              </div>

              <!-- Nhóm 2: Xuất bản & Tải về -->
              <div class="space-y-2">
                <div class="text-[10px] font-black uppercase text-slate-400 dark:text-slate-400 tracking-wider flex items-center gap-1.5">
                  <i class="fa-solid fa-cloud-arrow-down text-[9px] text-emerald-500"></i>
                  <span>Xuất bản & Tải về</span>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button @click="doSave('save'); showActionSheet = false" class="bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 p-3 rounded-xl font-bold text-xs hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-all active:scale-95 flex flex-col items-center justify-center gap-1.5 border border-emerald-200/70 dark:border-emerald-800/50 shadow-sm min-h-[58px]">
                    <i class="fa-solid fa-cloud-arrow-up text-lg text-emerald-600 dark:text-emerald-400"></i>
                    <span>Lưu Cloud</span>
                  </button>
                  <button @click="doSave('print'); showActionSheet = false" class="bg-slate-900 dark:bg-slate-800 text-white p-3 rounded-xl font-bold text-xs hover:bg-slate-800 dark:hover:bg-slate-700 transition-all active:scale-95 flex flex-col items-center justify-center gap-1.5 shadow-sm border border-slate-700 dark:border-slate-600 min-h-[58px]">
                    <i class="fa-solid fa-print text-lg text-slate-200"></i>
                    <span>In Phiếu</span>
                  </button>
                  <button @click="doSave('image'); showActionSheet = false" class="bg-purple-50/70 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 p-3 rounded-xl font-bold text-xs hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-all active:scale-95 flex flex-col items-center justify-center gap-1.5 border border-purple-200/70 dark:border-purple-800/50 shadow-sm min-h-[58px]">
                    <i class="fa-solid fa-file-image text-lg text-purple-600 dark:text-purple-400"></i>
                    <span>Tải ảnh (PNG)</span>
                  </button>
                  <button @click="doSave('pdf'); showActionSheet = false" class="bg-rose-50/70 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 p-3 rounded-xl font-bold text-xs hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-all active:scale-95 flex flex-col items-center justify-center gap-1.5 border border-rose-200/70 dark:border-rose-800/50 shadow-sm min-h-[58px]">
                    <i class="fa-solid fa-file-pdf text-lg text-rose-600 dark:text-rose-400"></i>
                    <span>Tải PDF</span>
                  </button>
                </div>
              </div>

              <!-- Nhóm 3: Lịch đặt bàn & Điều hướng -->
              <div class="space-y-2">
                <div class="text-[10px] font-black uppercase text-slate-400 dark:text-slate-400 tracking-wider flex items-center gap-1.5">
                  <i class="fa-solid fa-calendar-days text-[9px] text-blue-500"></i>
                  <span>Lịch đặt bàn & Điều hướng</span>
                </div>
                <div class="grid grid-cols-3 gap-2">
                  <button @click="goToTodayTimeline(); showActionSheet = false" class="bg-blue-50/70 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 p-3 rounded-xl font-bold text-xs hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-all active:scale-95 flex flex-col items-center justify-center gap-1.5 border border-blue-200/70 dark:border-blue-800/50 shadow-sm min-h-[58px]">
                    <i class="fa-solid fa-calendar-day text-lg text-blue-600 dark:text-blue-400"></i>
                    <span>Lịch hôm nay</span>
                  </button>
                  <button @click="goToTomorrowTimeline(); showActionSheet = false" class="bg-blue-50/70 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 p-3 rounded-xl font-bold text-xs hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-all active:scale-95 flex flex-col items-center justify-center gap-1.5 border border-blue-200/70 dark:border-blue-800/50 shadow-sm min-h-[58px]">
                    <i class="fa-solid fa-calendar-plus text-lg text-blue-600 dark:text-blue-400"></i>
                    <span>Lịch ngày mai</span>
                  </button>
                  <button @click="shareCurrentBill(); showActionSheet = false" class="bg-cyan-50/70 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 p-3 rounded-xl font-bold text-xs hover:bg-cyan-100 dark:hover:bg-cyan-900/50 transition-all active:scale-95 flex flex-col items-center justify-center gap-1.5 border border-cyan-200/70 dark:border-cyan-800/50 shadow-sm min-h-[58px]">
                    <i class="fa-solid fa-share-nodes text-lg text-cyan-600 dark:text-cyan-400"></i>
                    <span>Chia sẻ link</span>
                  </button>
                </div>
              </div>
            </div>
            
          </div>
        </transition>
      </div>
    </transition>

    <!-- MORE MENU BOTTOM SHEET (MOBILE) -->
    <transition name="fade">
      <div v-if="showMoreSheet" class="absolute inset-0 z-[110] flex flex-col justify-end">
        <div class="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" @click="showMoreSheet = false"></div>
        <transition name="slide-up" appear>
          <div v-if="showMoreSheet" class="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 rounded-t-3xl p-5 relative z-10 shadow-2xl pb-safe max-h-[85vh] overflow-y-auto">
            <div class="w-12 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto mb-4"></div>
            
            <h3 class="text-center font-black text-slate-800 dark:text-slate-100 text-base mb-4 uppercase tracking-widest">Danh Mục & Tiện Ích</h3>
            
            <div class="space-y-4">
              <!-- Featured: Social Bot Messenger -->
              <button 
                @click="ui.showSocialBotModal = true; showMoreSheet = false" 
                class="bg-slate-900 dark:bg-slate-800 text-white p-3.5 rounded-2xl font-bold text-xs hover:opacity-95 transition-all active:scale-95 flex items-center justify-between w-full border border-amber-500/40 shadow-md"
              >
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-xl shrink-0 border border-amber-400/30">
                    <i class="fa-solid fa-robot animate-pulse"></i>
                  </div>
                  <div class="text-left">
                    <div class="font-black text-amber-300 uppercase tracking-wider text-xs">Quản Lý Social Bot (Messenger)</div>
                    <div class="text-[10px] text-slate-300 font-normal mt-0.5">Theo dõi hội thoại Live Chat & điều khiển AI Bot</div>
                  </div>
                </div>
                <i class="fa-solid fa-chevron-right text-slate-400 text-xs"></i>
              </button>

              <!-- Group 1: Quản lý & Vận hành -->
              <div>
                <div class="text-[10px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-wider mb-2 pl-1">Vận hành & Lịch sử</div>
                <div class="grid grid-cols-4 gap-2">
                  <button @click="ui.showFloorPlan = true; showMoreSheet = false" class="bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 p-2 rounded-2xl font-bold text-[10px] hover:bg-slate-100 dark:hover:bg-slate-700 transition-all active:scale-95 flex flex-col items-center justify-center gap-1.5 border border-slate-200/60 dark:border-slate-700">
                    <div class="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center text-sm">
                      <i class="fa-solid fa-map"></i>
                    </div>
                    <span>Sơ đồ bàn</span>
                  </button>
                  <button @click="ui.tab = 'history'; appStore.loadHistory(false); showMoreSheet = false" class="bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 p-2 rounded-2xl font-bold text-[10px] hover:bg-slate-100 dark:hover:bg-slate-700 transition-all active:scale-95 flex flex-col items-center justify-center gap-1.5 border border-slate-200/60 dark:border-slate-700">
                    <div class="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center text-sm">
                      <i class="fa-solid fa-list-ul"></i>
                    </div>
                    <span>Lịch sử</span>
                  </button>
                  <button @click="ui.tab = 'analytics'; appStore.loadHistory(false); showMoreSheet = false" class="bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 p-2 rounded-2xl font-bold text-[10px] hover:bg-slate-100 dark:hover:bg-slate-700 transition-all active:scale-95 flex flex-col items-center justify-center gap-1.5 border border-slate-200/60 dark:border-slate-700">
                    <div class="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 flex items-center justify-center text-sm">
                      <i class="fa-solid fa-chart-pie"></i>
                    </div>
                    <span>Báo cáo</span>
                  </button>
                  <button @click="ui.showSettingsHub = true; showMoreSheet = false" class="bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 p-2 rounded-2xl font-bold text-[10px] hover:bg-slate-100 dark:hover:bg-slate-700 transition-all active:scale-95 flex flex-col items-center justify-center gap-1.5 border border-slate-200/60 dark:border-slate-700">
                    <div class="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center text-sm">
                      <i class="fa-solid fa-gear"></i>
                    </div>
                    <span>Cài đặt</span>
                  </button>
                </div>
              </div>

              <!-- Group 2: Dữ liệu & AI -->
              <div>
                <div class="text-[10px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-wider mb-2 pl-1">Cấu hình dữ liệu</div>
                <div class="grid grid-cols-3 gap-2.5">
                  <button @click="ui.openConfig('menu'); showMoreSheet = false" class="bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 p-2.5 rounded-2xl font-bold text-[11px] hover:bg-slate-100 dark:hover:bg-slate-700 transition-all active:scale-95 flex flex-col items-center justify-center gap-1.5 border border-slate-200/60 dark:border-slate-700">
                    <div class="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-base">
                      <i class="fa-solid fa-bell-concierge"></i>
                    </div>
                    <span>Thực đơn</span>
                  </button>
                  <button @click="ui.openConfig('ai'); showMoreSheet = false" class="bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 p-2.5 rounded-2xl font-bold text-[11px] hover:bg-slate-100 dark:hover:bg-slate-700 transition-all active:scale-95 flex flex-col items-center justify-center gap-1.5 border border-slate-200/60 dark:border-slate-700">
                    <div class="w-9 h-9 rounded-xl bg-pink-50 dark:bg-pink-950/50 text-pink-600 dark:text-pink-400 flex items-center justify-center text-base">
                      <i class="fa-solid fa-wand-magic-sparkles"></i>
                    </div>
                    <span>Cấu hình AI</span>
                  </button>
                  <button @click="ui.openConfig('bank'); showMoreSheet = false" class="bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 p-2.5 rounded-2xl font-bold text-[11px] hover:bg-slate-100 dark:hover:bg-slate-700 transition-all active:scale-95 flex flex-col items-center justify-center gap-1.5 border border-slate-200/60 dark:border-slate-700">
                    <div class="w-9 h-9 rounded-xl bg-cyan-50 dark:bg-cyan-950/50 text-cyan-600 dark:text-cyan-400 flex items-center justify-center text-base">
                      <i class="fa-solid fa-building-columns"></i>
                    </div>
                    <span>Ngân hàng</span>
                  </button>
                </div>
              </div>

              <!-- Group 3: Công cụ & Logs -->
              <div>
                <div class="text-[10px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-wider mb-2 pl-1">Công cụ & Logs</div>
                <div class="grid grid-cols-2 gap-2.5">
                  <button @click="ui.tab = 'test'; showMoreSheet = false" class="bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 p-2.5 rounded-2xl font-bold text-[11px] hover:bg-slate-100 dark:hover:bg-slate-700 transition-all active:scale-95 flex items-center justify-center gap-2 border border-slate-200/60 dark:border-slate-700">
                    <i class="fa-solid fa-flask text-rose-500"></i>
                    <span>Kiểm thử AI</span>
                  </button>
                  <button @click="ui.tab = 'logs'; showMoreSheet = false" class="bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 p-2.5 rounded-2xl font-bold text-[11px] hover:bg-slate-100 dark:hover:bg-slate-700 transition-all active:scale-95 flex items-center justify-center gap-2 border border-slate-200/60 dark:border-slate-700">
                    <i class="fa-solid fa-terminal text-indigo-500"></i>
                    <span>Nhật ký Log</span>
                  </button>
                </div>
              </div>
            </div>
            
          </div>
        </transition>
      </div>
    </transition>

    <!-- MOBILE BOTTOM NAV (Luôn hiển thị cố định trên mọi thiết bị di động) -->
    <nav class="flex md:hidden w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800/80 text-[10px] font-bold uppercase tracking-wider relative z-30 items-stretch shrink-0 pb-safe-bottom shadow-[0_-8px_30px_rgba(0,0,0,0.06)] dark:shadow-[0_-8px_30px_rgba(0,0,0,0.3)] select-none" aria-label="Điều hướng chính">
      <button 
        @click="ui.tab = 'dashboard'" 
        :class="['flex-grow flex-1 py-1.5 flex flex-col justify-center items-center gap-0.5 transition-all duration-200 select-none min-h-[52px] touch-target-48 active:scale-95', ui.tab === 'dashboard' ? 'text-blue-600 dark:text-blue-400 font-black' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300']"
        aria-label="Tổng quan"
      >
        <div class="relative flex items-center justify-center w-8 h-8 rounded-full transition-all" :class="ui.tab === 'dashboard' ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 scale-105' : ''">
          <i class="fa-solid fa-gauge-high text-base"></i>
        </div>
        <span class="text-[10px] font-extrabold tracking-tight">Tổng quan</span>
      </button>
      <button 
        @click="ui.tab = 'create'" 
        :class="['flex-grow flex-1 py-1.5 flex flex-col justify-center items-center gap-0.5 transition-all duration-200 select-none min-h-[52px] touch-target-48 active:scale-95', ui.tab === 'create' ? 'text-blue-600 dark:text-blue-400 font-black' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300']"
        aria-label="Tạo phiếu"
      >
        <div class="relative flex items-center justify-center w-8 h-8 rounded-full transition-all" :class="ui.tab === 'create' ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 scale-105' : ''">
          <i class="fa-solid fa-plus text-base"></i>
        </div>
        <span class="text-[10px] font-extrabold tracking-tight">Tạo</span>
      </button>
      <button 
        @click="ui.tab = 'timeline'; appStore.loadHistory(false)" 
        :class="['flex-grow flex-1 py-1.5 flex flex-col justify-center items-center gap-0.5 transition-all duration-200 select-none min-h-[52px] touch-target-48 active:scale-95', ui.tab === 'timeline' ? 'text-blue-600 dark:text-blue-400 font-black' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300']"
        aria-label="Lịch đặt bàn"
      >
        <div class="relative flex items-center justify-center w-8 h-8 rounded-full transition-all" :class="ui.tab === 'timeline' ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 scale-105' : ''">
          <i class="fa-solid fa-calendar-days text-base"></i>
        </div>
        <span class="text-[10px] font-extrabold tracking-tight">Lịch</span>
      </button>
      <button 
        @click="ui.tab = 'preview'" 
        :class="['flex-grow flex-1 py-1.5 flex flex-col justify-center items-center gap-0.5 transition-all duration-200 select-none min-h-[52px] touch-target-48 active:scale-95', ui.tab === 'preview' ? 'text-blue-600 dark:text-blue-400 font-black' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300']"
        aria-label="Xem phiếu"
      >
        <div class="relative flex items-center justify-center w-8 h-8 rounded-full transition-all" :class="ui.tab === 'preview' ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 scale-105' : ''">
          <i class="fa-solid fa-eye text-base"></i>
        </div>
        <span class="text-[10px] font-extrabold tracking-tight">Phiếu</span>
      </button>
      <button 
        @click="showMoreSheet = true" 
        :class="['flex-grow flex-1 py-1.5 flex flex-col justify-center items-center gap-0.5 transition-all duration-200 select-none min-h-[52px] touch-target-48 active:scale-95', showMoreSheet ? 'text-blue-600 dark:text-blue-400 font-black' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300']"
        aria-label="Danh mục thêm"
      >
        <div class="relative flex items-center justify-center w-8 h-8 rounded-full transition-all" :class="showMoreSheet ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 scale-105' : ''">
          <i class="fa-solid fa-ellipsis text-base"></i>
        </div>
        <span class="text-[10px] font-extrabold tracking-tight">Thêm</span>
      </button>
    </nav>
  </div>
</template>

<style scoped>
.pb-safe-bottom {
  padding-bottom: env(safe-area-inset-bottom, 12px);
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}
.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

</style>
