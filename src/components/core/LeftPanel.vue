<script setup lang="ts">
import { computed, ref } from 'vue'
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
import HistoryTimeline from '@/components/history/HistoryTimeline.vue'
import AnalyticsDashboard from '@/components/history/AnalyticsDashboard.vue'
import QuickDashboard from '@/components/history/QuickDashboard.vue'
import BillPreview from './BillPreview.vue'
import { formatVND } from '@/utils'

const showChecklist = ref(true)

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
function reloadApp() {
  window.location.reload()
}

// --- Tab Swipe (mobile only) ---
const mobileTabs = ['dashboard', 'timeline', 'history', 'analytics', 'create', 'preview']
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
    class="w-full h-full flex-1 bg-white flex flex-col shadow-2xl z-20 text-[13px] safe-area-pt"
    @touchstart="onSwipeStart"
    @touchend="onSwipeEnd"
  >
    <!-- HEADER -->
    <div class="flex-shrink-0 bg-blue-900 text-white px-3 md:px-5 py-4 flex flex-wrap justify-between items-center gap-2 relative z-20 box-border w-full">
      <div class="absolute inset-0 bg-gradient-to-r from-blue-400/20 to-transparent pointer-events-none"></div>
      <div class="flex items-center gap-3 relative z-10 min-w-0">
        <div class="bg-white p-1.5 rounded-2xl shadow-xl flex items-center justify-center overflow-hidden w-12 h-12 border-2 border-white/20 backdrop-blur-sm">
          <img :src="configStore.branding.logo || '/favicon.svg'" class="w-full h-full object-contain" alt="KG Logo" loading="lazy" />
        </div>
        <div>
          <h1 class="font-black text-xl tracking-wider leading-none text-white uppercase flex items-center gap-2 drop-shadow-md" style="font-family: 'Be Vietnam Pro', sans-serif;">
            KING'S GRILL
            <span class="w-2 h-2 rounded-full bg-green-400 animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.8)]"></span>
          </h1>
          <div class="flex items-center gap-2 mt-1.5">
            <span class="text-[9px] px-2.5 py-0.5 rounded-md font-black uppercase tracking-widest inline-block text-blue-900 bg-white shadow-sm border border-blue-100">AI MANAGER v6.0</span>
          </div>
        </div>
      </div>
      <div class="flex items-center gap-3 relative z-10">
        <div class="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-xl border border-white/10 hover:bg-white/20 transition-all cursor-default shadow-inner">
          <div class="w-2 h-2 rounded-full transition-colors" 
               :class="{
                 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]': ui.connectionStatus === 'online' && appStore.offlineQueueCount === 0, 
                 'bg-yellow-400 animate-pulse shadow-[0_0_8px_rgba(250,204,21,0.8)]': ui.connectionStatus === 'syncing', 
                 'bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.8)]': ui.connectionStatus === 'online' && appStore.offlineQueueCount > 0,
                 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.8)]': ui.connectionStatus === 'error'
               }"></div>
          <span class="text-[10px] font-black text-blue-50 uppercase tracking-widest">
            {{ 
              ui.connectionStatus === 'syncing' ? 'Đang đồng bộ' : 
              ui.connectionStatus === 'error' ? 'Ngoại tuyến' : 
              appStore.offlineQueueCount > 0 ? `${appStore.offlineQueueCount} đơn chờ` : 'Trực tuyến'
            }}
          </span>
        </div>
        
        <!-- Search Button (Ctrl+K Command Palette trigger) -->
        <button @click="ui.showCommandPalette = true" class="w-11 h-11 rounded-xl bg-white/10 hover:bg-white/25 flex items-center justify-center border border-white/10 transition-all active:scale-95 group relative shadow-sm text-blue-100 hover:text-white" title="Tìm kiếm & Phím tắt (Ctrl+K)">
          <i class="fa-solid fa-magnifying-glass text-lg"></i>
        </button>

        <div class="relative">
          <button @click="showDropdown = !showDropdown" class="w-11 h-11 rounded-xl bg-white/10 hover:bg-white/25 flex items-center justify-center border border-white/10 transition-all active:scale-95 group relative shadow-sm">
            <i class="fa-solid fa-ellipsis-vertical text-blue-100 group-hover:text-white transition-colors text-lg"></i>
            <span v-if="configStore.totalKeysHasData" class="absolute -top-1 -right-1 flex h-4 w-4">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-4 w-4 bg-red-500 border-2 border-blue-900"></span>
            </span>
          </button>
          
          <div v-if="showDropdown" @click="showDropdown = false" class="fixed inset-0 z-[100]"></div>

          <transition enter-active-class="transition ease-out duration-100" enter-from-class="transform opacity-0 scale-95" enter-to-class="transform opacity-100 scale-100" leave-active-class="transition ease-in duration-75" leave-from-class="transform opacity-100 scale-100" leave-to-class="transform opacity-0 scale-95">
            <div v-if="showDropdown" class="absolute top-full right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-[101]">
              <button @click="reloadApp" class="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors">
                <div class="w-6 text-center"><i class="fa-solid fa-rotate-right text-slate-400"></i></div>
                <span class="font-bold text-[13px] text-slate-700">Tải lại (Refresh)</span>
              </button>
              <button @click="appStore.loadHistory(false); showDropdown = false" class="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors">
                <div class="w-6 text-center"><i class="fa-solid fa-cloud-arrow-down text-slate-400"></i></div>
                <span class="font-bold text-[13px] text-slate-700">Đồng bộ Cloud</span>
              </button>
              <div class="h-[1px] bg-slate-100 my-1"></div>
              <button @click="ui.showSettingsHub = true; showDropdown = false" class="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors group">
                <div class="w-6 text-center"><i class="fa-solid fa-layer-group text-slate-400 group-hover:text-blue-500 transition-colors"></i></div>
                <span class="font-bold text-[13px] text-slate-700">Cài đặt hệ thống</span>
              </button>
            </div>
          </transition>
        </div>
      </div>
    </div>

    <!-- TABS (Desktop only, hidden on mobile for bottom nav style) -->
    <div class="hidden md:flex w-full bg-white text-[8px] sm:text-[10px] md:text-xs font-black border-b border-slate-200 uppercase tracking-widest shadow-sm relative z-10 items-stretch shrink-0">
      <button @click="ui.tab = 'dashboard'" :class="['flex-grow flex-1 py-2 md:py-4 flex flex-col md:flex-row justify-center items-center gap-1 md:gap-2 transition-all min-h-[54px] md:min-h-[56px] border-b-[3px] px-1 md:px-4 text-center leading-tight whitespace-normal', ui.tab === 'dashboard' ? 'text-blue-700 border-blue-600 bg-blue-50/80' : 'text-slate-400 border-transparent hover:text-slate-600 hover:bg-slate-50']">
        <i class="fa-solid fa-gauge-high text-sm md:text-base"></i> <span>Điều Khiển</span>
      </button>
      <button @click="ui.tab = 'timeline'; appStore.loadHistory(false)" :class="['flex-grow flex-1 py-2 md:py-4 flex flex-col md:flex-row justify-center items-center gap-1 md:gap-2 transition-all min-h-[54px] md:min-h-[56px] border-b-[3px] px-1 md:px-4 text-center leading-tight whitespace-normal', ui.tab === 'timeline' ? 'text-blue-700 border-blue-600 bg-blue-50/80' : 'text-slate-400 border-transparent hover:text-slate-600 hover:bg-slate-50']">
        <i class="fa-solid fa-calendar-days text-sm md:text-base"></i> <span>Lịch Đặt Bàn</span>
      </button>
      <button @click="ui.tab = 'history'; appStore.loadHistory(false)" :class="['flex-grow flex-1 py-2 md:py-4 flex flex-col md:flex-row justify-center items-center gap-1 md:gap-2 transition-all min-h-[54px] md:min-h-[56px] border-b-[3px] px-1 md:px-4 text-center leading-tight whitespace-normal', ui.tab === 'history' ? 'text-blue-700 border-blue-600 bg-blue-50/80' : 'text-slate-400 border-transparent hover:text-slate-600 hover:bg-slate-50']">
        <i class="fa-solid fa-list-ul text-sm md:text-base"></i> <span>Lịch Sử</span>
      </button>
      <button @click="ui.tab = 'analytics'; appStore.loadHistory(false)" :class="['flex-grow flex-1 py-2 md:py-4 flex flex-col md:flex-row justify-center items-center gap-1 md:gap-2 transition-all min-h-[54px] md:min-h-[56px] border-b-[3px] px-1 md:px-4 text-center leading-tight whitespace-normal', ui.tab === 'analytics' ? 'text-blue-700 border-blue-600 bg-blue-50/80' : 'text-slate-400 border-transparent hover:text-slate-600 hover:bg-slate-50']">
        <i class="fa-solid fa-chart-pie text-sm md:text-base"></i> <span>Báo Cáo</span>
      </button>
      <button @click="ui.tab = 'create'" :class="['flex-grow flex-1 py-2 md:py-4 flex flex-col md:flex-row justify-center items-center gap-1 md:gap-2 transition-all min-h-[54px] md:min-h-[56px] border-b-[3px] px-1 md:px-4 text-center leading-tight whitespace-normal', ui.tab === 'create' ? 'text-blue-700 border-blue-600 bg-blue-50/80' : 'text-slate-400 border-transparent hover:text-slate-600 hover:bg-slate-50']">
        <i class="fa-solid fa-plus text-sm md:text-base"></i> <span>Tạo Phiếu</span>
      </button>
      <button v-if="formStore.customer.name || formStore.id" @click="ui.tab = 'preview'" :class="['flex-grow flex-1 py-2 md:py-4 flex flex-col md:flex-row justify-center items-center gap-1 md:gap-2 transition-all min-h-[54px] md:min-h-[56px] border-b-[3px] px-1 md:px-4 text-center leading-tight whitespace-normal', ui.tab === 'preview' ? 'text-blue-700 border-blue-600 bg-blue-50/80' : 'text-slate-400 border-transparent hover:text-slate-600 hover:bg-slate-50']">
        <i class="fa-solid fa-eye text-sm md:text-base"></i> <span>Xem Phiếu</span>
      </button>
    </div>

    <!-- TAB CONTENT WRAPPER -->
    <div class="flex-grow relative overflow-hidden flex flex-col lg:flex-row bg-slate-50 z-0 min-h-0 h-full w-full">
      <!-- Left side: active tab content -->
      <div class="flex-grow flex flex-col overflow-hidden relative min-h-0 h-full w-full lg:w-[55%] lg:border-r lg:border-slate-200">
        <transition name="tab-fade" mode="out-in">
          <KeepAlive>
            <QuickDashboard v-if="ui.tab === 'dashboard'" key="dashboard" />
            <HistoryTimeline v-else-if="ui.tab === 'timeline'" key="timeline" />
            <HistoryList v-else-if="ui.tab === 'history'" key="history" />
            <AnalyticsDashboard v-else-if="ui.tab === 'analytics'" key="analytics" />
            <div v-else-if="ui.tab === 'create'" key="create" class="flex-grow flex flex-col overflow-hidden relative min-h-0 h-full">
              <div class="flex-grow overflow-y-auto p-3 md:p-4 space-y-3 pb-6 bg-gray-50/30 scroll-smooth custom-scrollbar">
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
                  
                  <div v-show="showChecklist" class="space-y-2 pt-2 border-t border-slate-100 transition-all duration-350">
                    <!-- Progress Bar -->
                    <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div class="bg-gradient-to-r from-blue-500 to-indigo-600 h-full transition-all duration-500" :style="{ width: `${checklistPercent}%` }"></div>
                    </div>
                    
                    <div class="grid grid-cols-2 gap-2 text-xs pt-1">
                      <div v-for="item in checklistItems" :key="item.name" class="flex items-center gap-2 p-2 rounded-xl border transition-all" :class="item.done ? 'bg-green-50/40 border-green-100 text-green-750 font-bold' : 'bg-slate-50/45 border-slate-100 text-slate-400 font-semibold'">
                        <i class="fa-solid" :class="item.done ? 'fa-circle-check text-green-500' : 'fa-circle text-slate-300'"></i>
                        <span>{{ item.name }}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Smart Warning Widget -->
                <div v-if="hasSoftWarning" class="bg-amber-50/90 border border-amber-300 rounded-2xl p-4 shadow-sm space-y-2">
                  <div class="flex items-center gap-2 text-amber-850 font-black uppercase text-xs">
                    <i class="fa-solid fa-triangle-exclamation text-amber-500 text-sm"></i>
                    Cảnh báo phân tích AI
                  </div>
                  <ul class="list-disc pl-4 text-xs text-amber-700 space-y-1">
                    <li v-if="formStore.aiMetadata && typeof formStore.aiMetadata.confidence_score === 'number' && formStore.aiMetadata.confidence_score < 0.8">
                      Đo độ tin cậy AI thấp ({{ Math.round(formStore.aiMetadata.confidence_score * 100) }}%). Vui lòng kiểm tra lại.
                    </li>
                    <li v-for="(warn, idx) in formStore.warnings" :key="idx">
                      {{ warn }}
                    </li>
                  </ul>
                </div>

                <div class="space-y-4">
                  <CustomerForm />
                  <DepositManager />
                  <MenuItemsEditor />
                </div>
              </div>

              <!-- Sticky bottom bar -->
              <div class="bg-white border-t border-slate-200 p-4 shrink-0 shadow-[0_-4px_16px_rgba(0,0,0,0.05)] flex items-center justify-between gap-4 z-10 safe-area-pb">
                <div class="min-w-0">
                  <div class="text-[9px] font-black uppercase tracking-wider text-slate-400">Tổng tạm tính</div>
                  <div class="text-base font-black text-slate-800 tracking-tight leading-none mt-1">
                    {{ formatVND(formStore.calculatedTotals.final) }}
                  </div>
                </div>
                <div class="flex-grow max-w-[200px]">
                  <button v-if="formStore.id" @click="doSave('save')" class="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-2xl py-3 px-4 font-black text-xs uppercase shadow-[0_4px_12px_rgba(37,99,235,0.25)] flex items-center justify-center gap-1.5 transition-all active:scale-95 border border-blue-500">
                    <i class="fa-solid fa-cloud-arrow-up text-sm text-blue-200"></i> Cập Nhật
                  </button>
                  <button v-else-if="formStore.customer.name" @click="doSave('save')" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl py-3 px-4 font-black text-xs uppercase shadow-[0_4px_12px_rgba(5,150,105,0.25)] flex items-center justify-center gap-1.5 transition-all active:scale-95 border border-emerald-500">
                    <i class="fa-solid fa-check-double text-sm text-emerald-200"></i> Tạo Đơn
                  </button>
                </div>
              </div>
            </div>
          </KeepAlive>
        </transition>
      </div>

      <!-- Bill Preview (Right side on desktop, overlay on mobile under preview tab) -->
      <div 
        :class="[
          'bg-slate-100 flex-col shrink-0 border-l border-slate-200 overflow-y-auto custom-scrollbar',
          ui.tab === 'preview' ? 'absolute inset-0 z-10 flex w-full' : 'hidden lg:flex lg:w-[45%]'
        ]"
      >
        <BillPreview />
      </div>
    </div>

    <!-- FLOATING ACTION BUTTON -->
    <div v-show="!ui.isKeyboardOpen && ['create', 'preview'].includes(ui.tab)" class="absolute bottom-6 right-6 z-[100] safe-area-pb">
      <button @click="showActionSheet = true" class="w-14 h-14 bg-blue-600 rounded-full shadow-xl shadow-blue-600/30 flex items-center justify-center text-white text-xl active:scale-90 transition-transform">
        <i class="fa-solid fa-layer-group"></i>
      </button>
    </div>

    <!-- ACTION MENU BOTTOM SHEET -->
    <transition name="fade">
      <div v-if="showActionSheet" class="absolute inset-0 z-[110] flex flex-col justify-end">
        <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" @click="showActionSheet = false"></div>
        <transition name="slide-up" appear>
          <div v-if="showActionSheet" class="bg-white rounded-t-3xl p-5 md:p-6 relative z-10 shadow-2xl pb-safe max-h-[85vh] overflow-y-auto">
            <div class="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-4"></div>
            
            <h3 class="text-center font-black text-slate-800 text-base mb-5 uppercase tracking-widest">Thao tác nhanh</h3>
            
            <div class="space-y-4">
              <!-- Nhóm 1: Quản lý Phiếu -->
              <div class="space-y-2">
                <div class="text-[10px] font-black uppercase text-slate-400 tracking-wider">Quản lý phiếu đặt</div>
                <div class="grid grid-cols-4 gap-2">
                  <button @click="handleCreateNewForm" class="bg-slate-50 text-slate-700 p-2.5 rounded-xl font-bold text-[10px] hover:bg-slate-100 transition-all active:scale-95 flex flex-col items-center justify-center gap-1.5 border border-slate-100">
                    <i class="fa-solid fa-file-circle-plus text-lg text-slate-500"></i>
                    <span>Tạo mới</span>
                  </button>
                  <button @click="toggleDepositPaid" class="p-2.5 rounded-xl font-bold text-[10px] transition-all active:scale-95 flex flex-col items-center justify-center gap-1.5 border"
                    :class="formStore.deposit.isPaid ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-slate-50 border-slate-100 text-slate-700 hover:bg-slate-100'">
                    <i class="fa-solid text-lg" :class="formStore.deposit.isPaid ? 'fa-circle-check text-amber-500' : 'fa-circle text-slate-400'"></i>
                    <span>Đã cọc</span>
                  </button>
                  <button @click="copyBookingConfirmation(); showActionSheet = false" class="bg-slate-50 text-slate-700 p-2.5 rounded-xl font-bold text-[10px] hover:bg-slate-100 transition-all active:scale-95 flex flex-col items-center justify-center gap-1.5 border border-slate-100">
                    <i class="fa-solid fa-copy text-lg text-slate-500"></i>
                    <span>Copy xác nhận</span>
                  </button>
                  <button @click="openCareForCurrentForm" class="bg-slate-50 text-slate-700 p-2.5 rounded-xl font-bold text-[10px] hover:bg-slate-100 transition-all active:scale-95 flex flex-col items-center justify-center gap-1.5 border border-slate-100">
                    <i class="fa-solid fa-paper-plane text-lg text-slate-500"></i>
                    <span>Gửi phiếu</span>
                  </button>
                </div>
              </div>

              <!-- Nhóm 2: Xuất bản & Tải về -->
              <div class="space-y-2">
                <div class="text-[10px] font-black uppercase text-slate-400 tracking-wider">Xuất bản & Tải về</div>
                <div class="grid grid-cols-4 gap-2">
                  <button @click="doSave('save')" class="bg-emerald-50 text-emerald-700 p-2.5 rounded-xl font-bold text-[10px] hover:bg-emerald-100 transition-all active:scale-95 flex flex-col items-center justify-center gap-1.5 border border-emerald-100">
                    <i class="fa-solid fa-cloud-arrow-up text-lg"></i>
                    <span>Lưu Cloud</span>
                  </button>
                  <button @click="doSave('print')" class="bg-gray-800 text-white p-2.5 rounded-xl font-bold text-[10px] hover:bg-gray-900 transition-all active:scale-95 flex flex-col items-center justify-center gap-1.5 shadow-sm">
                    <i class="fa-solid fa-print text-lg"></i>
                    <span>In Phiếu</span>
                  </button>
                  <button @click="doSave('image')" class="bg-indigo-50 text-indigo-700 p-2.5 rounded-xl font-bold text-[10px] hover:bg-indigo-100 transition-all active:scale-95 flex flex-col items-center justify-center gap-1.5 border border-indigo-100">
                    <i class="fa-solid fa-file-image text-lg"></i>
                    <span>Tải ảnh (PNG)</span>
                  </button>
                  <button @click="doSave('pdf')" class="bg-rose-50 text-rose-700 p-2.5 rounded-xl font-bold text-[10px] hover:bg-rose-100 transition-all active:scale-95 flex flex-col items-center justify-center gap-1.5 border border-rose-100">
                    <i class="fa-solid fa-file-pdf text-lg"></i>
                    <span>Tải PDF</span>
                  </button>
                </div>
              </div>

              <!-- Nhóm 3: Xem & Điều hướng -->
              <div class="space-y-2">
                <div class="text-[10px] font-black uppercase text-slate-400 tracking-wider">Lịch đặt bàn & Điều hướng</div>
                <div class="grid grid-cols-3 gap-2">
                  <button @click="goToTodayTimeline" class="bg-blue-50 text-blue-700 p-2.5 rounded-xl font-bold text-[10px] hover:bg-blue-100 transition-all active:scale-95 flex flex-col items-center justify-center gap-1.5 border border-blue-100">
                    <i class="fa-solid fa-calendar-day text-lg"></i>
                    <span>Lịch hôm nay</span>
                  </button>
                  <button @click="goToTomorrowTimeline" class="bg-blue-50 text-blue-700 p-2.5 rounded-xl font-bold text-[10px] hover:bg-blue-100 transition-all active:scale-95 flex flex-col items-center justify-center gap-1.5 border border-blue-100">
                    <i class="fa-solid fa-calendar-plus text-lg"></i>
                    <span>Lịch ngày mai</span>
                  </button>
                  <button @click="shareCurrentBill(); showActionSheet = false" class="bg-cyan-50 text-cyan-700 p-2.5 rounded-xl font-bold text-[10px] hover:bg-cyan-100 transition-all active:scale-95 flex flex-col items-center justify-center gap-1.5 border border-cyan-100">
                    <i class="fa-solid fa-share-nodes text-lg"></i>
                    <span>Chia sẻ link</span>
                  </button>
                </div>
              </div>
            </div>
            
          </div>
        </transition>
      </div>
    </transition>

    <!-- MOBILE BOTTOM NAV -->
    <div v-show="!ui.isKeyboardOpen" class="flex md:hidden w-full bg-white border-t border-slate-200/85 text-[9px] font-black uppercase tracking-wider relative z-20 items-stretch shrink-0 pb-safe-bottom shadow-[0_-4px_16px_rgba(0,0,0,0.03)] bg-white/95 backdrop-blur-md">
      <button @click="ui.tab = 'dashboard'" :class="['flex-grow flex-1 py-2 flex flex-col justify-center items-center gap-1 transition-all', ui.tab === 'dashboard' ? 'text-blue-700 bg-blue-50/40' : 'text-slate-400']">
        <i class="fa-solid fa-gauge-high text-sm"></i> <span>Điều khiển</span>
      </button>
      <button @click="ui.tab = 'timeline'; appStore.loadHistory(false)" :class="['flex-grow flex-1 py-2 flex flex-col justify-center items-center gap-1 transition-all', ui.tab === 'timeline' ? 'text-blue-700 bg-blue-50/40' : 'text-slate-400']">
        <i class="fa-solid fa-calendar-days text-sm"></i> <span>Lịch</span>
      </button>
      <button @click="ui.tab = 'create'" :class="['flex-grow flex-1 py-2 flex flex-col justify-center items-center gap-1 transition-all', ui.tab === 'create' ? 'text-blue-700 bg-blue-50/40' : 'text-slate-400']">
        <i class="fa-solid fa-plus text-sm"></i> <span>Tạo Phiếu</span>
      </button>
      <button @click="ui.tab = 'history'; appStore.loadHistory(false)" :class="['flex-grow flex-1 py-2 flex flex-col justify-center items-center gap-1 transition-all', ui.tab === 'history' ? 'text-blue-700 bg-blue-50/40' : 'text-slate-400']">
        <i class="fa-solid fa-list-ul text-sm"></i> <span>Lịch sử</span>
      </button>
      <button @click="ui.tab = 'analytics'; appStore.loadHistory(false)" :class="['flex-grow flex-1 py-2 flex flex-col justify-center items-center gap-1 transition-all', ui.tab === 'analytics' ? 'text-blue-700 bg-blue-50/40' : 'text-slate-400']">
        <i class="fa-solid fa-chart-pie text-sm"></i> <span>Báo cáo</span>
      </button>
    </div>
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
