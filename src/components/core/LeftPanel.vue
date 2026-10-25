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
import BillPreview from './BillPreview.vue'
import { formatVND } from '@/utils'

// Tab components (Async loaded on demand to minimize initial bundle)
const HistoryList = defineAsyncComponent(() => import('@/components/history/HistoryList.vue'))
const QuickDashboard = defineAsyncComponent(() => import('@/components/history/QuickDashboard.vue'))
const HistoryTimeline = defineAsyncComponent(() => import('@/components/history/HistoryTimeline.vue'))
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
    { name: 'Khách & SĐT', short: 'Khách', targetId: 'cust-name', done: !!(formStore.customer.name && formStore.customer.phone) },
    { name: 'Ngày & Giờ tiệc', short: 'Ngày/Giờ', targetId: 'cust-date', done: !!(formStore.customer.date && formStore.customer.time) },
    { name: 'Số lượng khách', short: 'Số khách', targetId: 'cust-pax', done: !!formStore.customer.pax },
    { name: 'Khu & Số bàn', short: 'Bàn', targetId: 'cust-tables', done: !!formStore.customer.tables },
    { name: 'Thực đơn món ăn', short: 'Thực đơn', targetId: 'menu-editor-card', done: formStore.items.length > 0 && formStore.items.some(i => i.name && i.qty > 0) },
    { name: 'Thông tin cọc', short: 'Tiền cọc', targetId: 'deposit-manager-card', done: formStore.deposit.amount > 0 || formStore.deposit.isPaid }
  ]
})

const activeReceiptItems = computed(() => {
  return formStore.items.filter(i => i.name && i.name.trim() !== '' && Number(i.qty || 0) > 0)
})

function scrollToChecklistTarget(targetId: string) {
  haptic('light')
  const el = document.getElementById(targetId)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      setTimeout(() => (el as HTMLElement).focus(), 180)
    }
  }
}

function openShiftStaffSwitcher() {
  haptic('light')
  ui.pendingAction = null
  ui.showStaffSelector = true
}

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
const showNavMore = ref(false)
const showActionSheet = ref(false)
const showMoreSheet = ref(false)
const showMobileNavModal = ref(false)
const isHeaderCompact = ref(false)

const currentModuleMeta = computed(() => {
  switch (ui.tab) {
    case 'dashboard': return { label: 'Tổng quan', icon: 'fa-solid fa-gauge-high text-teal-400' }
    case 'create': return { label: 'Tạo phiếu', icon: 'fa-solid fa-plus text-blue-400' }
    case 'timeline': return { label: 'Lịch bàn', icon: 'fa-solid fa-calendar-days text-emerald-400' }
    case 'preview': return { label: 'Xem phiếu', icon: 'fa-solid fa-eye text-cyan-400' }
    case 'history': return { label: 'Lịch sử', icon: 'fa-solid fa-list-ul text-purple-400' }
    case 'analytics': return { label: 'Báo cáo', icon: 'fa-solid fa-chart-pie text-indigo-400' }
    case 'test': return { label: 'Kiểm thử', icon: 'fa-solid fa-flask text-rose-400' }
    case 'logs': return { label: 'Logs', icon: 'fa-solid fa-terminal text-amber-400' }
    default: return { label: 'Tạo phiếu', icon: 'fa-solid fa-plus text-blue-400' }
  }
})

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
  const defaultCustomerUrl = 'https://datban-kingsgrill.pages.dev'
  const configuredUrl = ((import.meta.env.VITE_CUSTOMER_BOOKING_URL as string) || '').trim()
  const url = configuredUrl || defaultCustomerUrl

  navigator.clipboard.writeText(url).then(() => {
    ui.showToast(`📋 Đã copy link đặt bàn: ${url}`, 'success')
  }).catch(() => {
    prompt('Link đặt bàn gửi cho khách:', url)
  })
}

// --- Quick Actions ---
function handleCreateNewForm() {
  haptic('light')
  if (formStore.isEditingHistoric) {
    formStore.cancelHistoricEdit()
  } else {
    formStore.$reset()
    ui.showToast('Đã khởi tạo phiếu mới!', 'success')
  }
  ui.tab = 'create'
  showActionSheet.value = false
}

function handleCancelHistoricEdit() {
  haptic('light')
  formStore.cancelHistoricEdit()
}

function handleDiscardDraft() {
  haptic('light')
  formStore.discardNewDraft()
  ui.showToast('🗑️ Đã hủy phiếu nháp tạo mới!', 'info')
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
            <button 
              v-if="appStore.offlineQueueCount > 0"
              @click="ui.showOutboxModal = true; appStore.loadOutboxDetails()"
              class="text-[9px] font-bold uppercase tracking-wider tabular-nums transition-colors text-amber-400 hover:text-amber-300 underline cursor-pointer"
              title="Bấm để xem danh sách đơn chờ đồng bộ"
            >
              {{ appStore.offlineQueueCount }} đơn chờ
            </button>
            <span v-else class="text-[9px] font-bold uppercase tracking-wider tabular-nums transition-colors"
                  :class="(ui.connectionStatus === 'offline' || ui.connectionStatus === 'error') ? 'text-rose-400' : (ui.connectionStatus === 'reconnecting' || ui.connectionStatus === 'syncing') ? 'text-amber-400' : 'text-slate-400'">
              {{ 
                ui.connectionStatus === 'syncing' ? 'Đang đồng bộ...' : 
                ui.connectionStatus === 'reconnecting' ? 'Đang kết nối lại...' :
                (ui.connectionStatus === 'offline' || ui.connectionStatus === 'error') ? 'Ngoại tuyến' : 'Trực tuyến'
              }}
            </span>
          </div>
        </div>
      </div>

      <!-- MOBILE & TABLET QUICK MODULE SWITCHER (Top Bar direct 1-tap launcher) -->
      <button 
        @click="showMobileNavModal = true" 
        class="lg:hidden flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700/90 text-slate-200 border border-slate-700/60 active:scale-95 transition-all text-xs font-bold cursor-pointer shrink-0 shadow-xs ml-auto mr-1"
        title="Mở nhanh thanh chuyển module"
        aria-label="Mở nhanh thanh chuyển module"
      >
        <i :class="currentModuleMeta.icon" class="text-xs"></i>
        <span class="max-w-[76px] truncate font-black text-[11px] uppercase tracking-tight">{{ currentModuleMeta.label }}</span>
        <i class="fa-solid fa-chevron-down text-[9px] text-slate-400"></i>
      </button>

      <!-- CENTER: NAVIGATION TABS (DESKTOP >= 1024px) - 3 Phân Hệ Workspace Vận Hành Chuyên Nghiệp -->
      <div class="hidden lg:flex items-center gap-1.5 bg-slate-800/60 dark:bg-slate-900/60 p-1.5 rounded-2xl border border-slate-700/40 mx-2 flex-1 justify-center relative z-10 overflow-x-auto scrollbar-none flex-nowrap backdrop-blur-md">
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
        <div class="flex items-center gap-1 bg-slate-900/80 dark:bg-slate-950/70 p-1 rounded-xl border border-purple-500/25 shadow-sm relative">
          <button @click="ui.tab = 'history'; appStore.loadHistory(false)" :class="['px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 min-h-[32px] whitespace-nowrap cursor-pointer', ui.tab === 'history' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-300 hover:text-white hover:bg-slate-800/60']" title="Danh sách lịch sử đặt bàn">
            <i class="fa-solid fa-list-ul text-xs text-purple-300"></i>
            <span>Lịch Sử</span>
          </button>
          <button @click="ui.tab = 'analytics'; appStore.loadHistory(false)" :class="['hidden lg:flex px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all items-center gap-1.5 min-h-[32px] whitespace-nowrap cursor-pointer', ui.tab === 'analytics' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-300 hover:text-white hover:bg-slate-800/60']" title="Báo cáo doanh số & phân tích">
            <i class="fa-solid fa-chart-pie text-xs text-indigo-300"></i>
            <span>Báo Cáo</span>
          </button>
          <button @click="ui.showSocialBotModal = true" class="hidden xl:flex px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all items-center gap-1.5 min-h-[32px] whitespace-nowrap text-amber-300 hover:text-white hover:bg-amber-500/20 cursor-pointer" title="Quản lý Live Chat Fanpage AI">
            <i class="fa-solid fa-robot text-amber-400 animate-pulse text-xs"></i>
            <span>Social Bot</span>
          </button>
          <button @click="copyCustomerBookingLink" class="hidden xl:flex px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all items-center gap-1.5 min-h-[32px] whitespace-nowrap text-emerald-300 hover:text-white hover:bg-emerald-500/20 cursor-pointer" title="Sao chép link Đặt bàn Online gửi cho khách hàng">
            <i class="fa-solid fa-link text-emerald-400 text-xs"></i>
            <span>Link Khách</span>
          </button>

          <!-- Overflow Popover for Medium / Compact Screens (Tablet & Laptops < 1280px) -->
          <div class="relative xl:hidden">
            <button 
              @click.stop="showNavMore = !showNavMore" 
              class="px-2 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 min-h-[32px] text-slate-300 hover:text-white hover:bg-slate-800/60 cursor-pointer"
              title="Thêm công cụ tiện ích"
              aria-label="Thêm công cụ tiện ích"
            >
              <i class="fa-solid fa-ellipsis text-xs"></i>
            </button>
            <div v-if="showNavMore" @click="showNavMore = false" class="fixed inset-0 z-40"></div>
            <transition enter-active-class="transition ease-out duration-100" enter-from-class="transform opacity-0 scale-95" enter-to-class="transform opacity-100 scale-100" leave-active-class="transition ease-in duration-75" leave-from-class="transform opacity-100 scale-100" leave-to-class="transform opacity-0 scale-95">
              <div v-if="showNavMore" class="absolute top-full right-0 mt-2 w-48 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl p-1.5 z-50 flex flex-col gap-1 backdrop-blur-xl">
                <button @click="ui.tab = 'analytics'; appStore.loadHistory(false); showNavMore = false" class="lg:hidden w-full text-left px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-slate-800 text-slate-200 hover:text-white transition-colors">
                  <i class="fa-solid fa-chart-pie text-xs text-indigo-400"></i>
                  <span>Báo Cáo Doanh Số</span>
                </button>
                <button @click="ui.showSocialBotModal = true; showNavMore = false" class="w-full text-left px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-slate-800 text-amber-300 hover:text-amber-200 transition-colors">
                  <i class="fa-solid fa-robot text-xs text-amber-400"></i>
                  <span>Social Bot Fanpage</span>
                </button>
                <button @click="copyCustomerBookingLink(); showNavMore = false" class="w-full text-left px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-slate-800 text-emerald-300 hover:text-emerald-200 transition-colors">
                  <i class="fa-solid fa-link text-xs text-emerald-400"></i>
                  <span>Copy Link Đặt Bàn</span>
                </button>
              </div>
            </transition>
          </div>
        </div>
      </div>

      <!-- RIGHT: QUICK ACTIONS / SYSTEM -->
      <div class="flex items-center gap-1 relative z-10 shrink-0">
        <!-- Search Command Palette (Mobile & Tablet 48px hit target) -->
        <button 
          @click="ui.showCommandPalette = true" 
          class="touch-target-48 rounded-xl bg-slate-800/80 hover:bg-slate-700 flex items-center justify-center border border-slate-700/40 transition-all active:scale-95 text-slate-300 hover:text-white"
          title="Tìm kiếm nhanh (Ctrl+K)"
          aria-label="Tìm kiếm nhanh"
        >
          <i class="fa-solid fa-magnifying-glass text-sm"></i>
        </button>

        <!-- Outbox Offline Queue Sync Badge (Desktop & Mobile) -->
        <button 
          v-if="appStore.offlineQueueCount > 0"
          @click="ui.showOutboxModal = true; appStore.loadOutboxDetails()" 
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-medium transition-all active:scale-95 animate-pulse cursor-pointer"
          :title="'Có ' + appStore.offlineQueueCount + ' đơn chờ đồng bộ Cloud. Bấm để xem chi tiết và gửi ngay!'"
          aria-label="Đồng bộ đơn ngoại tuyến"
        >
          <i class="fa-solid fa-cloud-arrow-up text-xs"></i>
          <span class="font-bold">{{ appStore.offlineQueueCount }}</span>
          <span class="hidden sm:inline text-[11px] text-amber-200/90">chờ gửi</span>
        </button>

        <!-- Active Shift Staff Pill (Desktop 1-Click Switcher) -->
        <button
          @click="openShiftStaffSwitcher"
          class="hidden xl:flex items-center gap-1.5 px-2.5 h-9 rounded-xl border transition-all active:scale-95 cursor-pointer text-xs font-bold"
          :class="ui.activeShiftStaff?.name ? 'bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/35 text-emerald-300' : 'bg-slate-800 hover:bg-slate-700 border-slate-700/40 text-slate-300 hover:text-white'"
          :title="ui.activeShiftStaff?.name ? `Nhân viên đang trực ca: ${ui.activeShiftStaff.name} (${ui.activeShiftStaff.phone}) — Bấm để đổi ca` : 'Chọn và ghim Nhân viên trực ca hiện tại'"
        >
          <i class="fa-solid fa-user-check text-[11px]" :class="ui.activeShiftStaff?.name ? 'text-emerald-400' : 'text-slate-400'"></i>
          <span class="max-w-[96px] truncate">{{ ui.activeShiftStaff?.name || 'Chọn NV ca' }}</span>
        </button>

        <!-- Sync Button (Desktop) -->
        <button @click="appStore.loadHistory(false)" class="hidden lg:flex w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 items-center justify-center border border-slate-700/40 transition-all active:scale-95 text-slate-300 hover:text-white" title="Đồng bộ dữ liệu Cloud">
          <i class="fa-solid fa-rotate text-xs" :class="{'animate-spin text-blue-400': ui.isFetchingAPI}"></i>
        </button>

        <!-- Dark/Light Mode Toggle (Desktop Direct 1-Click) -->
        <button @click="ui.toggleDarkMode()" class="hidden lg:flex w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 items-center justify-center border border-slate-700/40 transition-all active:scale-95 text-slate-300 hover:text-white" :title="ui.isDarkMode ? 'Chuyển giao diện Sáng' : 'Chuyển giao diện Tối'">
          <i class="fa-solid text-xs" :class="ui.isDarkMode ? 'fa-sun text-amber-400' : 'fa-moon text-slate-300'"></i>
        </button>

        <!-- Settings Button (Desktop) -->
        <button @click="ui.showSettingsHub = true" class="hidden lg:flex w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 items-center justify-center border border-slate-700/40 transition-all active:scale-95 text-slate-300 hover:text-white" title="Cài đặt hệ thống">
          <i class="fa-solid fa-gear text-xs"></i>
        </button>

        <!-- Logout Button (Desktop) -->
        <button @click="appStore.logout()" class="hidden lg:flex w-9 h-9 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 items-center justify-center border border-rose-900/30 transition-all active:scale-95 text-rose-300 hover:text-rose-100" title="Đăng xuất">
          <i class="fa-solid fa-arrow-right-from-bracket text-xs"></i>
        </button>

        <!-- More Menu for Mobile & Tablet (48px hit target) -->
        <div class="relative lg:hidden">
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
                <!-- 1. Historic Edit Warning / Status Bar (Chỉ hiển thị khi ĐANG SỬA phiếu từ lịch sử) -->
                <div v-if="formStore.isEditingHistoric" class="bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/30 rounded-2xl p-3 md:p-3.5 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 animate-fade-in">
                  <div class="flex items-center gap-2.5 min-w-0">
                    <div class="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 text-sm font-black border border-amber-500/30">
                      <i class="fa-solid fa-clock-rotate-left"></i>
                    </div>
                    <div class="min-w-0">
                      <div class="font-black text-amber-800 dark:text-amber-300 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                        <span>Đang sửa phiếu lịch sử</span>
                        <span class="font-mono text-[10px] opacity-75">#{{ formStore.id }}</span>
                      </div>
                      <div class="text-xs text-slate-700 dark:text-slate-200 font-semibold truncate mt-0.5">
                        Khách: <span class="font-bold text-slate-900 dark:text-slate-100">{{ formStore.customer.name || 'Khách lịch sử' }}</span>
                        <span v-if="formStore.customer.phone" class="opacity-80"> ({{ formStore.customer.phone }})</span>
                        <span v-if="formStore.customer.time || formStore.customer.date" class="opacity-80"> • {{ formStore.customer.time }} {{ formStore.customer.date }}</span>
                      </div>
                    </div>
                  </div>
                  <div class="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                    <button 
                      @click="handleCancelHistoricEdit" 
                      class="px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 text-slate-700 dark:text-slate-200 hover:text-rose-600 dark:hover:text-rose-400 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 shadow-2xs cursor-pointer"
                      title="Hủy sửa và quay lại tạo phiếu mới"
                    >
                      <i class="fa-solid fa-xmark text-slate-400"></i> Hủy sửa
                    </button>
                  </div>
                </div>

                <!-- 2. Smart Draft Banner ("Đang xử lý tạo mới") -->
                <div v-if="formStore.savedNewBookingDraft" class="bg-blue-500/10 dark:bg-blue-500/15 border border-blue-500/30 rounded-2xl p-3 md:p-3.5 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 animate-fade-in">
                  <div class="flex items-center gap-2.5 min-w-0">
                    <div class="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 text-sm font-black border border-blue-500/30">
                      <i class="fa-solid fa-bookmark"></i>
                    </div>
                    <div class="min-w-0">
                      <div class="font-black text-blue-700 dark:text-blue-300 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                        <span>Đang xử lý tạo mới</span>
                        <span class="text-[9px] opacity-75 font-normal">({{ formStore.savedNewBookingDraft.savedAt }})</span>
                      </div>
                      <div class="text-xs font-bold text-slate-800 dark:text-slate-100 truncate mt-0.5">
                        {{ formStore.savedNewBookingDraft.displaySummary }}
                      </div>
                    </div>
                  </div>
                  <div class="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                    <button 
                      @click="formStore.restoreNewDraft()" 
                      class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl font-black text-xs transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                      title="Khôi phục phiếu đang xử lý tạo mới này"
                    >
                      <i class="fa-solid fa-arrow-rotate-left text-xs"></i>
                      <span>Tiếp tục tạo mới</span>
                    </button>
                    <button 
                      @click="handleDiscardDraft" 
                      class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-rose-500 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                      title="Hủy bỏ bản nháp này"
                      aria-label="Hủy bản nháp"
                    >
                      <i class="fa-solid fa-trash-can text-xs"></i>
                    </button>
                  </div>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                  <!-- Left side: AI Input, Compact Checklist & Live Split-Screen Bill Studio -->
                  <div class="lg:col-span-5 space-y-3 lg:sticky lg:top-1">
                    <AIInputPanel />

                    <!-- Compact Interactive Progress Strip -->
                    <div class="bg-surface-2 dark:bg-surface-2 border border-border-default dark:border-border-subtle rounded-2xl p-3 shadow-xs space-y-2">
                      <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                          <i class="fa-solid fa-list-check text-apex-primary text-xs"></i>
                          <span class="font-bold text-text-primary text-xs tracking-tight">Tiến độ hoàn thiện phiếu</span>
                        </div>
                        <div class="flex items-center gap-1.5">
                          <span class="px-2 py-0.5 rounded-full text-[10px] font-black font-tabular" :class="checklistPercent === 100 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' : 'bg-primary/10 text-apex-primary border border-primary/25'">
                            {{ checklistPercent }}%
                          </span>
                          <button
                            type="button"
                            @click="showChecklist = !showChecklist"
                            class="w-6 h-6 rounded-lg hover:bg-surface-3 flex items-center justify-center text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
                            :title="showChecklist ? 'Thu gọn tiến độ' : 'Mở rộng tiến độ'"
                          >
                            <i class="fa-solid text-[10px]" :class="showChecklist ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
                          </button>
                        </div>
                      </div>

                      <!-- Sleek Progress Bar -->
                      <div class="w-full bg-surface-3 dark:bg-surface-4 h-1.5 rounded-full overflow-hidden">
                        <div class="bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500 h-full transition-all duration-300" :style="{ width: `${checklistPercent}%` }"></div>
                      </div>

                      <!-- 6 Interactive Jump Pills -->
                      <div v-show="showChecklist" class="flex flex-wrap gap-1.5 pt-0.5">
                        <button
                          v-for="item in checklistItems"
                          :key="item.name"
                          type="button"
                          @click="scrollToChecklistTarget(item.targetId)"
                          class="px-2.5 py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                          :class="item.done ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300' : 'bg-surface-1 dark:bg-surface-3 border-border-subtle text-text-secondary hover:border-primary/40 hover:text-text-primary'"
                          :title="`Bấm để chuyển nhanh tới mục: ${item.name}`"
                        >
                          <i class="fa-solid text-[10px]" :class="item.done ? 'fa-circle-check text-emerald-500' : 'fa-regular fa-circle text-text-tertiary'"></i>
                          <span>{{ item.short }}</span>
                        </button>
                      </div>
                    </div>

                    <!-- Smart Warning Widget -->
                    <div v-if="hasSoftWarning" class="bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/60 rounded-2xl p-3.5 shadow-xs space-y-1.5">
                      <div class="flex items-center gap-2 text-amber-800 dark:text-amber-200 font-bold uppercase text-xs">
                        <i class="fa-solid fa-triangle-exclamation text-amber-500 text-xs"></i>
                        Cảnh báo phân tích AI
                      </div>
                      <ul class="list-disc pl-4 text-xs text-amber-700 dark:text-amber-300 space-y-1 font-medium">
                        <li v-if="formStore.aiMetadata && typeof formStore.aiMetadata.confidence_score === 'number' && formStore.aiMetadata.confidence_score < 0.8">
                          Độ tin cậy AI thấp ({{ Math.round(formStore.aiMetadata.confidence_score * 100) }}%). Vui lòng kiểm tra lại.
                        </li>
                        <li v-for="(warn, idx) in formStore.warnings" :key="idx">
                          {{ warn }}
                        </li>
                      </ul>
                    </div>

                    <!-- LIVE SPLIT-SCREEN BILL STUDIO DOCK (Desktop >= 1024px) -->
                    <div class="hidden lg:block bg-surface-2 dark:bg-surface-2 border border-border-default dark:border-border-subtle rounded-2xl shadow-sm overflow-hidden transition-all">
                      <!-- Studio Header -->
                      <div class="px-3.5 py-2.5 bg-surface-3/70 dark:bg-surface-3 border-b border-border-subtle flex items-center justify-between gap-2">
                        <div class="flex items-center gap-2 min-w-0">
                          <div class="w-6 h-6 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-600 dark:text-cyan-400 flex items-center justify-center text-xs shrink-0">
                            <i class="fa-solid fa-receipt"></i>
                          </div>
                          <span class="font-bold text-xs text-text-primary tracking-tight truncate">Live Bill Studio</span>
                          <span
                            class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border shrink-0"
                            :class="formStore.deposit.isPaid ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'"
                          >
                            {{ formStore.deposit.isPaid ? 'ĐÃ CỌC' : 'CHỜ CỌC' }}
                          </span>
                        </div>
                        <div class="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            @click="ui.tab = 'preview'"
                            class="px-2 py-1 rounded-lg bg-surface-2 hover:bg-surface-hover text-text-secondary hover:text-apex-primary border border-border-subtle text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer"
                            title="Mở chế độ Xem Phiếu toàn màn hình (F2)"
                          >
                            <i class="fa-solid fa-expand text-[9px]"></i>
                            <span>Phóng to</span>
                          </button>
                          <button
                            type="button"
                            @click="ui.toggleLiveBillDock()"
                            class="w-6 h-6 rounded-lg hover:bg-surface-hover text-text-tertiary hover:text-text-primary flex items-center justify-center transition-colors cursor-pointer"
                            :title="ui.showLiveBillDock ? 'Thu gọn bản xem trước trực tiếp' : 'Mở rộng bản xem trước trực tiếp'"
                          >
                            <i class="fa-solid text-[10px]" :class="ui.showLiveBillDock ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
                          </button>
                        </div>
                      </div>

                      <!-- Live Receipt Paper Mirror -->
                      <div v-show="ui.showLiveBillDock" class="p-3 space-y-2.5 bg-surface-1/60 dark:bg-surface-1/40">
                        <div class="bg-white text-slate-900 rounded-xl border border-slate-200/90 shadow-xs p-3.5 space-y-2.5 text-xs relative overflow-hidden">
                          <!-- Top Dashed Hospitality Header -->
                          <div class="flex items-start justify-between gap-2 pb-2 border-b border-dashed border-slate-300">
                            <div class="min-w-0">
                              <div class="text-[10px] font-black uppercase tracking-widest text-slate-400">PHIẾU XÁC NHẬN ĐẶT BÀN</div>
                              <div class="text-sm font-black text-slate-900 truncate mt-0.5">
                                {{ formStore.customer.name || 'Chưa nhập tên khách' }}
                              </div>
                              <div class="text-[11px] font-mono font-bold text-slate-600 flex items-center gap-2 mt-0.5">
                                <span><i class="fa-solid fa-phone text-[9px] text-slate-400 mr-1"></i>{{ formStore.customer.phone || '---' }}</span>
                                <span v-if="formStore.customer.type" class="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-sans text-[10px] font-bold">{{ formStore.customer.type }}</span>
                              </div>
                            </div>
                            <div class="text-right shrink-0">
                              <span
                                class="inline-block px-2 py-0.5 rounded-md font-black text-[11px] border"
                                :class="formStore.customer.tables ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-400 border-slate-200'"
                              >
                                {{ formStore.customer.tables ? `Bàn ${formStore.customer.tables}` : 'Chưa xếp bàn' }}
                              </span>
                              <div class="text-[11px] font-mono font-bold text-slate-600 mt-1">
                                {{ formStore.customer.time || '--:--' }} • {{ formStore.customer.date || '--/--/----' }}
                              </div>
                              <div class="text-[10px] font-bold text-slate-500">
                                {{ formStore.customer.pax ? `${formStore.customer.pax} khách` : '0 khách' }}
                              </div>
                            </div>
                          </div>

                          <!-- Live Dishes List -->
                          <div v-if="activeReceiptItems.length > 0" class="space-y-1 max-h-[168px] overflow-y-auto custom-scrollbar pr-1 border-b border-dashed border-slate-200 pb-2">
                            <div class="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                              <span>Thực đơn ({{ activeReceiptItems.length }} món)</span>
                              <span>Thành tiền</span>
                            </div>
                            <div
                              v-for="(item, rIdx) in activeReceiptItems"
                              :key="rIdx"
                              class="flex items-start justify-between gap-2 text-[11.5px] py-0.5"
                            >
                              <div class="min-w-0 flex-1">
                                <span class="font-mono font-black text-blue-700 mr-1">{{ item.qty }}x</span>
                                <span class="font-semibold text-slate-800">{{ item.name }}</span>
                                <span v-if="item.note" class="block text-[10px] text-slate-500 italic truncate pl-4">↳ {{ item.note }}</span>
                              </div>
                              <span class="font-mono font-bold text-slate-800 shrink-0 tabular-nums">
                                {{ formatVND(Number(item.price || 0) * Number(item.qty || 1)) }}
                              </span>
                            </div>
                          </div>
                          <div v-else class="py-2.5 text-center text-[11px] text-slate-400 border-b border-dashed border-slate-200 italic">
                            Chưa chọn món trước (Gọi món tại nhà hàng)
                          </div>

                          <!-- Customer Note Preview -->
                          <div v-if="formStore.customer.note" class="px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200/70 text-[11px] text-amber-900 leading-snug">
                            <span class="font-bold">Ghi chú:</span> {{ formStore.customer.note }}
                          </div>

                          <!-- Financial Totals Breakdown -->
                          <div class="space-y-1 text-[11.5px] pt-0.5">
                            <div class="flex justify-between text-slate-600">
                              <span>Tạm tính thực đơn:</span>
                              <span class="font-mono font-bold tabular-nums">{{ formatVND(formStore.calculatedTotals.sub) }}</span>
                            </div>
                            <div v-if="formStore.taxEnabled && formStore.calculatedTotals.tax > 0" class="flex justify-between text-slate-500 text-[11px]">
                              <span>Thuế VAT (8% - 10%):</span>
                              <span class="font-mono font-semibold tabular-nums">+{{ formatVND(formStore.calculatedTotals.tax) }}</span>
                            </div>
                            <div class="flex justify-between text-slate-900 font-black text-xs pt-0.5 border-t border-slate-100">
                              <span>Tổng cộng:</span>
                              <span class="font-mono tabular-nums text-blue-700">{{ formatVND(formStore.calculatedTotals.final) }}</span>
                            </div>
                            <div v-if="formStore.deposit.amount > 0" class="flex justify-between text-[11px]" :class="formStore.deposit.isPaid ? 'text-emerald-700 font-bold' : 'text-amber-700 font-semibold'">
                              <span>{{ formStore.deposit.isPaid ? 'Đã nhận cọc:' : 'Yêu cầu đặt cọc:' }}</span>
                              <span class="font-mono tabular-nums">{{ formatVND(formStore.deposit.amount) }}</span>
                            </div>
                            <div v-if="formStore.deposit.amount > 0 && formStore.calculatedTotals.final > 0" class="flex justify-between text-slate-700 font-bold text-[11px]">
                              <span>Còn lại thanh toán:</span>
                              <span class="font-mono tabular-nums">{{ formatVND(Math.max(0, formStore.calculatedTotals.final - (formStore.deposit.amount || 0))) }}</span>
                            </div>
                          </div>

                          <!-- Staff Attribution Footer -->
                          <div class="pt-2 border-t border-dashed border-slate-200 flex items-center justify-between text-[10.5px] text-slate-500">
                            <button
                              type="button"
                              @click="openShiftStaffSwitcher"
                              class="hover:text-blue-600 font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                              title="Bấm để chọn hoặc đổi Nhân viên trực ca ký phiếu"
                            >
                              <i class="fa-solid fa-user-pen text-[9px] text-blue-500"></i>
                              <span>NV: <strong class="text-slate-700">{{ ui.activeShiftStaff?.name || formStore.staff.name || 'Chọn NV trực' }}</strong></span>
                            </button>
                            <span class="font-mono text-[9.5px] text-slate-400">#{{ (formStore.id || '').slice(0, 8).toUpperCase() }}</span>
                          </div>
                        </div>

                        <!-- 1-Click Express Export Bar inside Live Studio -->
                        <div class="grid grid-cols-4 gap-1.5">
                          <button
                            type="button"
                            @click="doSave('copy')"
                            class="py-2 px-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] flex items-center justify-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer"
                            title="Lưu & Copy ảnh phiếu độ nét cao vào Clipboard để dán ngay vào Zalo/Messenger"
                          >
                            <i class="fa-solid fa-copy text-[10px]"></i>
                            <span>Copy Ảnh</span>
                          </button>
                          <button
                            type="button"
                            @click="doSave('image')"
                            class="py-2 px-2 rounded-xl bg-surface-3 hover:bg-surface-hover text-text-primary border border-border-default font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                            title="Lưu & Tải xuống file ảnh PNG sắc nét"
                          >
                            <i class="fa-solid fa-download text-[10px] text-apex-primary"></i>
                            <span>Tải PNG</span>
                          </button>
                          <button
                            type="button"
                            @click="doSave('pdf')"
                            class="py-2 px-2 rounded-xl bg-surface-3 hover:bg-surface-hover text-text-primary border border-border-default font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                            title="Lưu & Xuất file PDF vector sắc nét"
                          >
                            <i class="fa-solid fa-file-pdf text-[10px] text-rose-500"></i>
                            <span>Tải PDF</span>
                          </button>
                          <button
                            type="button"
                            @click="copyBookingConfirmation(formStore.deposit.isPaid ? 'deposit_confirmed' : 'quote_deposit')"
                            class="py-2 px-2 rounded-xl bg-surface-3 hover:bg-surface-hover text-text-primary border border-border-default font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                            title="Copy mẫu tin nhắn xác nhận / báo giá gửi Zalo khách"
                          >
                            <i class="fa-solid fa-comment-dots text-[10px] text-emerald-500"></i>
                            <span>Tin Zalo</span>
                          </button>
                        </div>
                      </div>
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
              <div class="bg-surface-2/95 dark:bg-surface-2/95 backdrop-blur-md border-t border-border-default dark:border-border-subtle px-3 py-2.5 sm:px-4 sm:py-3 shrink-0 shadow-[0_-4px_16px_rgba(0,0,0,0.04)] dark:shadow-[0_-4px_16px_rgba(0,0,0,0.3)] flex items-center justify-between gap-2.5 sm:gap-3 z-10 transition-colors duration-200">
                <!-- Left: Tổng tạm tính & Nhân viên trực -->
                <div class="min-w-0 flex items-center gap-3">
                  <div class="min-w-0 flex flex-col justify-center">
                    <div class="text-[10px] font-bold uppercase tracking-wider text-text-tertiary leading-none">Tổng tạm tính</div>
                    <div class="text-[15px] sm:text-base font-black text-text-primary tracking-tight leading-tight mt-1 font-tabular whitespace-nowrap">
                      {{ formatVND(formStore.calculatedTotals.final) }}
                    </div>
                  </div>
                  <button
                    type="button"
                    @click="openShiftStaffSwitcher"
                    class="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-surface-3 hover:bg-surface-hover border border-border-subtle text-[11px] font-bold text-text-secondary hover:text-text-primary transition-all cursor-pointer shrink-0"
                    title="Đổi nhân viên trực ca ký phiếu"
                  >
                    <i class="fa-solid fa-user-check text-[10px] text-emerald-500"></i>
                    <span class="max-w-[110px] truncate">{{ ui.activeShiftStaff?.name || 'Chọn NV ca' }}</span>
                  </button>
                </div>

                <!-- Right: Action Buttons -->
                <div class="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  <!-- Nút 1: Thao tác nhanh (Sleek Squircle) -->
                  <button 
                    @click="showActionSheet = !showActionSheet" 
                    title="Mở menu thao tác nhanh"
                    aria-label="Mở menu thao tác nhanh"
                    class="h-10 w-10 sm:w-auto px-2.5 sm:px-3.5 bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white rounded-xl font-bold text-xs uppercase shadow-sm transition-all active:scale-95 border border-amber-400/50 hover:border-amber-400 flex items-center justify-center gap-1.5 shrink-0 quick-action-btn cursor-pointer"
                  >
                    <i class="fa-solid fa-bolt-lightning text-amber-400 text-xs bolt-icon"></i>
                    <span class="hidden sm:inline font-extrabold text-[11px] tracking-wide">Thao tác</span>
                  </button>

                  <!-- Nút 2: Tạo lịch mới (Secondary Clean Button) -->
                  <button 
                    @click="handleCreateNewForm" 
                    :title="formStore.isEditingHistoric ? 'Hủy sửa phiếu lịch sử & quay lại tạo mới' : 'Tạo lịch mới (Làm mới form)'"
                    aria-label="Tạo lịch mới"
                    class="h-10 px-2.5 sm:px-3.5 bg-surface-3 hover:bg-surface-hover text-text-primary rounded-xl font-bold text-xs uppercase flex items-center justify-center gap-1.5 transition-all active:scale-95 border border-border-default shrink-0 shadow-2xs cursor-pointer"
                  >
                    <i class="fa-solid fa-file-circle-plus text-text-tertiary text-xs"></i>
                    <span class="hidden sm:inline font-extrabold text-[11px] tracking-wide">{{ formStore.isEditingHistoric ? 'Hủy sửa' : 'Lịch mới' }}</span>
                    <span class="sm:hidden font-extrabold text-[11px]">{{ formStore.isEditingHistoric ? 'Hủy' : 'Mới' }}</span>
                  </button>

                  <!-- Nút Phụ Desktop: Xuất PNG Nhanh -->
                  <button
                    type="button"
                    @click="doSave('image')"
                    class="hidden md:flex h-10 px-3.5 bg-blue-600/10 hover:bg-blue-600/20 text-blue-600 dark:text-blue-400 border border-blue-500/30 rounded-xl font-black text-xs uppercase tracking-wider items-center justify-center gap-1.5 transition-all active:scale-95 shrink-0 cursor-pointer"
                    title="Lưu đơn và tải ngay file ảnh PNG độ nét cao"
                  >
                    <i class="fa-solid fa-image text-xs"></i>
                    <span>Tải PNG</span>
                  </button>

                  <!-- Nút 3: Cập nhật / Tạo đơn (Dominant Primary CTA) -->
                  <button 
                    v-if="formStore.isEditingHistoric" 
                    @click="doSave('save')" 
                    class="h-10 px-3.5 sm:px-4.5 bg-rose-600 hover:bg-rose-700 dark:bg-rose-600 dark:hover:bg-rose-700 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-md hover:shadow-lg flex items-center justify-center gap-1.5 transition-all active:scale-95 shrink-0 cursor-pointer"
                    title="Cập nhật phiếu đặt bàn lịch sử"
                    aria-label="Cập nhật phiếu"
                  >
                    <i class="fa-solid fa-cloud-arrow-up text-xs text-rose-200"></i>
                    <span class="font-black text-xs tracking-wider">Cập Nhật</span>
                  </button>
                  <button 
                    v-else 
                    @click="doSave('save')" 
                    class="h-10 px-3.5 sm:px-5 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-md hover:shadow-lg flex items-center justify-center gap-1.5 transition-all active:scale-95 shrink-0 cursor-pointer"
                    title="Tạo đơn đặt bàn mới"
                    aria-label="Tạo đơn đặt bàn"
                  >
                    <i class="fa-solid fa-check-double text-xs text-emerald-200"></i>
                    <span class="font-black text-xs tracking-wider">Tạo Đơn</span>
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

    <!-- ACTION MENU BOTTOM SHEET & DIALOG -->
    <transition name="fade">
      <div v-if="showActionSheet" class="fixed inset-0 z-[110] flex flex-col justify-end md:justify-center md:items-center p-0 md:p-4">
        <div class="fixed inset-0 bg-slate-950/60 backdrop-blur-sm" @click="showActionSheet = false"></div>
        <transition name="slide-up" appear>
          <div v-if="showActionSheet" class="bg-white dark:bg-slate-900 border-t md:border border-slate-200/90 dark:border-slate-800 rounded-t-3xl md:rounded-2xl p-5 md:p-6 relative z-10 shadow-2xl pb-safe max-h-[85vh] md:max-w-xl w-full overflow-y-auto">
            <!-- Mobile drag indicator: 36x4px sleek pill -->
            <div class="md:hidden w-9 h-1 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-3.5"></div>
            
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

    <!-- MORE CATEGORIES & UTILITIES DRAWER (MOBILE & TABLET) -->
    <transition name="fade">
      <div v-if="showMoreSheet" class="fixed inset-0 z-[110] flex flex-col justify-end md:justify-center md:items-center p-0 md:p-4">
        <div class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" @click="showMoreSheet = false"></div>
        <transition name="slide-up" appear>
          <div v-if="showMoreSheet" class="bg-white dark:bg-slate-900 border-t md:border border-slate-200 dark:border-slate-800 rounded-t-3xl md:rounded-2xl p-5 md:p-6 relative z-10 shadow-2xl pb-safe max-h-[85vh] md:max-w-lg w-full overflow-y-auto">
            <!-- Mobile drag indicator: 36x4px sleek pill -->
            <div class="md:hidden w-9 h-1 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-3.5"></div>
            
            <h3 class="text-center font-black text-slate-800 dark:text-slate-100 text-base mb-4 uppercase tracking-widest">Danh Mục & Tiện Ích</h3>
            
            <div class="space-y-4">
              <!-- Pending Outbox Sync (When offline items exist) -->
              <button 
                v-if="appStore.offlineQueueCount > 0"
                @click="ui.showOutboxModal = true; appStore.loadOutboxDetails(); showMoreSheet = false"
                class="bg-amber-950/40 dark:bg-amber-950/60 text-amber-200 p-3.5 rounded-2xl font-bold text-xs hover:opacity-95 transition-all active:scale-95 flex items-center justify-between w-full border border-amber-500/50 shadow-lg shadow-amber-500/10 cursor-pointer"
              >
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-xl shrink-0 border border-amber-400/40">
                    <i class="fa-solid fa-cloud-arrow-up animate-pulse"></i>
                  </div>
                  <div class="text-left">
                    <div class="font-black text-amber-300 uppercase tracking-wider text-xs">Hàng đợi Cloud: {{ appStore.offlineQueueCount }} đơn chờ</div>
                    <div class="text-[10px] text-amber-200/80 font-normal mt-0.5">Bấm để kiểm tra chi tiết & đồng bộ ngay</div>
                  </div>
                </div>
                <i class="fa-solid fa-chevron-right text-amber-400 text-xs"></i>
              </button>

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

    <!-- QUICK MODULE SWITCHER MODAL / SHEET (MOBILE ONLY - Lối tắt chuyển phân hệ tức thì) -->
    <transition name="fade">
      <div v-if="showMobileNavModal" class="fixed inset-0 z-[115] flex flex-col justify-end md:justify-center md:items-center p-0 md:p-4">
        <div class="fixed inset-0 bg-slate-950/65 backdrop-blur-sm" @click="showMobileNavModal = false"></div>
        <transition name="slide-up" appear>
          <div v-if="showMobileNavModal" class="bg-white dark:bg-slate-900 border-t md:border border-slate-200/90 dark:border-slate-800 rounded-t-3xl md:rounded-2xl p-5 md:p-6 relative z-10 shadow-2xl pb-safe max-h-[85vh] md:max-w-md w-full overflow-y-auto">
            <!-- Mobile drag indicator: 36x4px sleek pill -->
            <div class="md:hidden w-9 h-1 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-3.5"></div>
            
            <div class="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div class="flex items-center gap-2.5">
                <div class="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/40 text-sm">
                  <i class="fa-solid fa-compass"></i>
                </div>
                <div>
                  <h3 class="font-black text-slate-900 dark:text-slate-100 text-sm uppercase tracking-wider">Chuyển Phân Hệ</h3>
                  <p class="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Chọn nhanh module làm việc tức thì</p>
                </div>
              </div>
              <button @click="showMobileNavModal = false" aria-label="Đóng" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <i class="fa-solid fa-xmark text-sm"></i>
              </button>
            </div>

            <!-- Grid 6 Main Modules (Thứ tự chuẩn hóa: Tạo - Phiếu - Tổng quan - Lịch - Lịch sử - Sơ đồ) -->
            <div class="grid grid-cols-2 gap-2.5">
              <button 
                @click="ui.tab = 'create'; showMobileNavModal = false" 
                class="p-3.5 rounded-2xl flex flex-col items-center justify-center gap-2 border transition-all active:scale-95 text-center cursor-pointer min-h-[84px]"
                :class="ui.tab === 'create' ? 'bg-blue-500/15 border-blue-500/50 text-blue-600 dark:text-blue-400 font-black shadow-sm' : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'"
              >
                <div class="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center text-lg">
                  <i class="fa-solid fa-plus"></i>
                </div>
                <span class="text-xs font-black uppercase tracking-tight">Tạo Phiếu</span>
              </button>

              <button 
                @click="ui.tab = 'preview'; showMobileNavModal = false" 
                class="p-3.5 rounded-2xl flex flex-col items-center justify-center gap-2 border transition-all active:scale-95 text-center cursor-pointer min-h-[84px]"
                :class="ui.tab === 'preview' ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-600 dark:text-cyan-400 font-black shadow-sm' : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'"
              >
                <div class="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 flex items-center justify-center text-lg">
                  <i class="fa-solid fa-eye"></i>
                </div>
                <span class="text-xs font-black uppercase tracking-tight">Xem Phiếu</span>
              </button>

              <button 
                @click="ui.tab = 'dashboard'; showMobileNavModal = false" 
                class="p-3.5 rounded-2xl flex flex-col items-center justify-center gap-2 border transition-all active:scale-95 text-center cursor-pointer min-h-[84px]"
                :class="ui.tab === 'dashboard' ? 'bg-teal-500/15 border-teal-500/50 text-teal-600 dark:text-teal-400 font-black shadow-sm' : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'"
              >
                <div class="w-10 h-10 rounded-xl bg-teal-500/20 text-teal-600 dark:text-teal-400 flex items-center justify-center text-lg">
                  <i class="fa-solid fa-gauge-high"></i>
                </div>
                <span class="text-xs font-black uppercase tracking-tight">Tổng Quan</span>
              </button>

              <button 
                @click="ui.tab = 'timeline'; appStore.loadHistory(false); showMobileNavModal = false" 
                class="p-3.5 rounded-2xl flex flex-col items-center justify-center gap-2 border transition-all active:scale-95 text-center cursor-pointer min-h-[84px]"
                :class="ui.tab === 'timeline' ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-600 dark:text-emerald-400 font-black shadow-sm' : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'"
              >
                <div class="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-lg">
                  <i class="fa-solid fa-calendar-days"></i>
                </div>
                <span class="text-xs font-black uppercase tracking-tight">Lịch Bàn</span>
              </button>

              <button 
                @click="ui.tab = 'history'; appStore.loadHistory(false); showMobileNavModal = false" 
                class="p-3.5 rounded-2xl flex flex-col items-center justify-center gap-2 border transition-all active:scale-95 text-center cursor-pointer min-h-[84px]"
                :class="ui.tab === 'history' ? 'bg-purple-500/15 border-purple-500/50 text-purple-600 dark:text-purple-400 font-black shadow-sm' : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'"
              >
                <div class="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center text-lg">
                  <i class="fa-solid fa-list-ul"></i>
                </div>
                <span class="text-xs font-black uppercase tracking-tight">Lịch Sử</span>
              </button>

              <button 
                @click="ui.showFloorPlan = true; showMobileNavModal = false" 
                class="p-3.5 rounded-2xl flex flex-col items-center justify-center gap-2 border border-slate-200/80 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all active:scale-95 text-center cursor-pointer min-h-[84px]"
              >
                <div class="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center text-lg">
                  <i class="fa-solid fa-map"></i>
                </div>
                <span class="text-xs font-black uppercase tracking-tight">Sơ Đồ Bàn</span>
              </button>
            </div>
          </div>
        </transition>
      </div>
    </transition>

    <!-- MOBILE & TABLET BOTTOM NAV (Thứ tự: Tạo - Phiếu - Tổng quan - Lịch - Thêm) -->
    <nav class="flex lg:hidden w-full bg-white/95 dark:bg-[#0D1422]/95 backdrop-blur-xl border-t border-slate-200/80 dark:border-slate-800/80 text-[10px] font-bold uppercase tracking-wider sticky bottom-0 z-40 items-stretch shrink-0 pb-safe-bottom shadow-[0_-8px_30px_rgba(0,0,0,0.06)] dark:shadow-[0_-8px_30px_rgba(0,0,0,0.4)] select-none" aria-label="Điều hướng chính">
      <!-- 1. Tạo -->
      <button 
        @click="ui.tab = 'create'" 
        :class="['flex-grow flex-1 py-1.5 flex flex-col justify-center items-center gap-0.5 transition-all duration-200 select-none min-h-[52px] touch-target-48 active:scale-95', ui.tab === 'create' ? 'text-blue-600 dark:text-[#62A5FF] font-black' : 'text-slate-500 dark:text-[#64748B] hover:text-slate-700 dark:hover:text-[#94A3B8]']"
        aria-label="Tạo phiếu"
      >
        <div class="relative flex items-center justify-center w-8 h-8 rounded-full transition-all" :class="ui.tab === 'create' ? 'bg-blue-500/15 dark:bg-[#2F67E8]/20 text-blue-600 dark:text-[#62A5FF] scale-105 shadow-xs' : ''">
          <i class="fa-solid fa-plus text-base"></i>
        </div>
        <span class="text-[10px] font-extrabold tracking-tight">Tạo</span>
      </button>

      <!-- 2. Phiếu -->
      <button 
        @click="ui.tab = 'preview'" 
        :class="['flex-grow flex-1 py-1.5 flex flex-col justify-center items-center gap-0.5 transition-all duration-200 select-none min-h-[52px] touch-target-48 active:scale-95', ui.tab === 'preview' ? 'text-blue-600 dark:text-[#62A5FF] font-black' : 'text-slate-500 dark:text-[#64748B] hover:text-slate-700 dark:hover:text-[#94A3B8]']"
        aria-label="Xem phiếu"
      >
        <div class="relative flex items-center justify-center w-8 h-8 rounded-full transition-all" :class="ui.tab === 'preview' ? 'bg-blue-500/15 dark:bg-[#2F67E8]/20 text-blue-600 dark:text-[#62A5FF] scale-105 shadow-xs' : ''">
          <i class="fa-solid fa-eye text-base"></i>
        </div>
        <span class="text-[10px] font-extrabold tracking-tight">Phiếu</span>
      </button>

      <!-- 3. Tổng quan -->
      <button 
        @click="ui.tab = 'dashboard'" 
        :class="['flex-grow flex-1 py-1.5 flex flex-col justify-center items-center gap-0.5 transition-all duration-200 select-none min-h-[52px] touch-target-48 active:scale-95', ui.tab === 'dashboard' ? 'text-blue-600 dark:text-[#62A5FF] font-black' : 'text-slate-500 dark:text-[#64748B] hover:text-slate-700 dark:hover:text-[#94A3B8]']"
        aria-label="Tổng quan"
      >
        <div class="relative flex items-center justify-center w-8 h-8 rounded-full transition-all" :class="ui.tab === 'dashboard' ? 'bg-blue-500/15 dark:bg-[#2F67E8]/20 text-blue-600 dark:text-[#62A5FF] scale-105 shadow-xs' : ''">
          <i class="fa-solid fa-gauge-high text-base"></i>
        </div>
        <span class="text-[10px] font-extrabold tracking-tight">Tổng quan</span>
      </button>

      <!-- 4. Lịch -->
      <button 
        @click="ui.tab = 'timeline'; appStore.loadHistory(false)" 
        :class="['flex-grow flex-1 py-1.5 flex flex-col justify-center items-center gap-0.5 transition-all duration-200 select-none min-h-[52px] touch-target-48 active:scale-95', ui.tab === 'timeline' ? 'text-blue-600 dark:text-[#62A5FF] font-black' : 'text-slate-500 dark:text-[#64748B] hover:text-slate-700 dark:hover:text-[#94A3B8]']"
        aria-label="Lịch đặt bàn"
      >
        <div class="relative flex items-center justify-center w-8 h-8 rounded-full transition-all" :class="ui.tab === 'timeline' ? 'bg-blue-500/15 dark:bg-[#2F67E8]/20 text-blue-600 dark:text-[#62A5FF] scale-105 shadow-xs' : ''">
          <i class="fa-solid fa-calendar-days text-base"></i>
        </div>
        <span class="text-[10px] font-extrabold tracking-tight">Lịch</span>
      </button>

      <!-- 5. Thêm -->
      <button 
        @click="showMoreSheet = true" 
        :class="['flex-grow flex-1 py-1.5 flex flex-col justify-center items-center gap-0.5 transition-all duration-200 select-none min-h-[52px] touch-target-48 active:scale-95', showMoreSheet ? 'text-blue-600 dark:text-[#62A5FF] font-black' : 'text-slate-500 dark:text-[#64748B] hover:text-slate-700 dark:hover:text-[#94A3B8]']"
        aria-label="Danh mục thêm"
      >
        <div class="relative flex items-center justify-center w-8 h-8 rounded-full transition-all" :class="showMoreSheet ? 'bg-blue-500/15 dark:bg-[#2F67E8]/20 text-blue-600 dark:text-[#62A5FF] scale-105 shadow-xs' : ''">
          <i class="fa-solid fa-ellipsis text-base"></i>
        </div>
        <span class="text-[10px] font-extrabold tracking-tight">Thêm</span>
      </button>
    </nav>
  </div>
</template>

<style scoped>
.pb-safe-bottom {
  padding-bottom: max(env(safe-area-inset-bottom, 0px), 8px);
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

/* Nút Thao tác nhanh: Viền vàng hổ phách tinh tế, hover glow nhẹ nhàng không gây mất tập trung */
.quick-action-btn {
  border-color: rgba(245, 158, 11, 0.5);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.quick-action-btn:hover {
  border-color: rgba(245, 158, 11, 0.9);
  box-shadow: 0 0 12px rgba(245, 158, 11, 0.25);
}

.bolt-icon {
  display: inline-block;
  color: #fbbf24;
  transition: transform 0.2s ease, filter 0.2s ease;
}
.quick-action-btn:hover .bolt-icon {
  transform: scale(1.15);
  filter: drop-shadow(0 0 4px rgba(251, 191, 36, 0.8));
}
</style>
