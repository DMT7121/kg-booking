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
import TestDashboard from '@/components/history/TestDashboard.vue'
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
const showMoreSheet = ref(false)
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
    <div class="flex-shrink-0 bg-slate-900 text-white px-4 py-3 flex items-center justify-between gap-3 relative z-20 box-border w-full border-b border-slate-800">
      <div class="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-transparent pointer-events-none"></div>
      
      <!-- LEFT: LOGO / APP NAME -->
      <div class="flex items-center gap-3 relative z-10 min-w-0">
        <div class="bg-white p-1 rounded-xl shadow-xl flex items-center justify-center overflow-hidden w-9 h-9 border border-white/10 shrink-0">
          <img :src="configStore.branding.logo || '/favicon.svg'" class="w-full h-full object-contain" alt="KG Logo" loading="lazy" />
        </div>
        <div class="min-w-0">
          <h1 class="font-black text-sm tracking-widest leading-none text-white uppercase flex items-center gap-1.5 drop-shadow-sm" style="font-family: 'Be Vietnam Pro', sans-serif;">
            KING'S GRILL
            <span class="w-2 h-2 rounded-full bg-green-400 animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.8)] shrink-0"></span>
          </h1>
          <div class="flex items-center gap-1.5 mt-1">
            <span class="text-[8px] font-black text-slate-400 uppercase tracking-widest">
              {{ 
                ui.connectionStatus === 'syncing' ? 'Đang đồng bộ' : 
                ui.connectionStatus === 'error' ? 'Ngoại tuyến' : 
                appStore.offlineQueueCount > 0 ? `${appStore.offlineQueueCount} đơn chờ` : 'Trực tuyến'
              }}
            </span>
          </div>
        </div>
      </div>

      <!-- CENTER: NAVIGATION TABS (DESKTOP) -->
      <div class="hidden md:flex items-center gap-1 bg-slate-800/40 p-1 rounded-2xl border border-slate-700/30 mx-4 max-w-xl flex-1 justify-center relative z-10 overflow-x-auto overflow-y-hidden scrollbar-none flex-nowrap">
        <button @click="ui.tab = 'dashboard'" :class="['px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 min-h-[36px] whitespace-nowrap', ui.tab === 'dashboard' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/50']">
          <i class="fa-solid fa-gauge-high"></i>
          <span>Tổng Quan</span>
        </button>
        <button @click="ui.tab = 'create'" :class="['px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 min-h-[36px] whitespace-nowrap', ui.tab === 'create' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/50']">
          <i class="fa-solid fa-plus"></i>
          <span>Tạo</span>
        </button>
        <button @click="ui.tab = 'timeline'; appStore.loadHistory(false)" :class="['px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 min-h-[36px] whitespace-nowrap', ui.tab === 'timeline' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/50']">
          <i class="fa-solid fa-calendar-days"></i>
          <span>Lịch</span>
        </button>
        <button @click="ui.tab = 'history'; appStore.loadHistory(false)" :class="['px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 min-h-[36px] whitespace-nowrap', ui.tab === 'history' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/50']">
          <i class="fa-solid fa-list-ul"></i>
          <span>Lịch Sử</span>
        </button>
        <button @click="ui.tab = 'analytics'; appStore.loadHistory(false)" :class="['px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 min-h-[36px] whitespace-nowrap', ui.tab === 'analytics' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/50']">
          <i class="fa-solid fa-chart-pie"></i>
          <span>Báo Cáo</span>
        </button>
        <button v-if="formStore.customer.name || formStore.id" @click="ui.tab = 'preview'" :class="['px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 min-h-[36px] whitespace-nowrap', ui.tab === 'preview' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/50']">
          <i class="fa-solid fa-eye"></i>
          <span>Phiếu</span>
        </button>
        <button @click="ui.tab = 'test'" :class="['px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 min-h-[36px] whitespace-nowrap', ui.tab === 'test' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/50']">
          <i class="fa-solid fa-flask"></i>
          <span>Kiểm Thử</span>
        </button>
      </div>

      <!-- RIGHT: QUICK ACTIONS / SYSTEM -->
      <div class="flex items-center gap-2 relative z-10 shrink-0">
        <!-- Online/Offline Status Indicator (Mobile Only) -->
        <div class="md:hidden w-8 h-8 rounded-xl bg-slate-800/60 flex items-center justify-center border border-slate-700/40"
             :title="ui.connectionStatus === 'online' ? 'Trực tuyến' : 'Ngoại tuyến'">
          <span class="w-2.5 h-2.5 rounded-full" 
                :class="{
                  'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.8)]': ui.connectionStatus === 'online' && appStore.offlineQueueCount === 0, 
                  'bg-yellow-400 animate-pulse': ui.connectionStatus === 'syncing', 
                  'bg-amber-400 animate-pulse': ui.connectionStatus === 'online' && appStore.offlineQueueCount > 0,
                  'bg-red-400': ui.connectionStatus === 'error'
                }"></span>
        </div>

        <!-- Search Command Palette -->
        <button @click="ui.showCommandPalette = true" class="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center border border-slate-700/30 transition-all active:scale-95 text-slate-300 hover:text-white min-h-[36px]" title="Tìm kiếm nhanh (Ctrl+K)">
          <i class="fa-solid fa-magnifying-glass text-sm"></i>
        </button>

        <!-- Sync Button (Desktop) -->
        <button @click="appStore.loadHistory(false)" class="hidden md:flex w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 items-center justify-center border border-slate-700/30 transition-all active:scale-95 text-slate-300 hover:text-white min-h-[36px]" title="Đồng bộ dữ liệu Cloud">
          <i class="fa-solid fa-rotate text-sm"></i>
        </button>

        <!-- Settings Button -->
        <button @click="ui.showSettingsHub = true" class="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center border border-slate-700/30 transition-all active:scale-95 text-slate-300 hover:text-white min-h-[36px]" title="Cài đặt hệ thống">
          <i class="fa-solid fa-gear text-sm"></i>
        </button>

        <!-- Logout Button (Desktop) -->
        <button @click="appStore.logout()" class="hidden md:flex w-9 h-9 rounded-xl bg-red-950/40 hover:bg-red-900/60 items-center justify-center border border-red-900/20 transition-all active:scale-95 text-red-300 hover:text-red-100 min-h-[36px]" title="Đăng xuất">
          <i class="fa-solid fa-arrow-right-from-bracket text-sm"></i>
        </button>

        <!-- Dropdown Menu for Mobile -->
        <div class="relative md:hidden">
          <button @click="showDropdown = !showDropdown" class="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center border border-slate-700/30 transition-all active:scale-95 text-slate-300 hover:text-white min-h-[36px]">
            <i class="fa-solid fa-ellipsis-vertical text-sm"></i>
          </button>
          
          <div v-if="showDropdown" @click="showDropdown = false" class="fixed inset-0 z-[100]"></div>

          <transition enter-active-class="transition ease-out duration-100" enter-from-class="transform opacity-0 scale-95" enter-to-class="transform opacity-100 scale-100" leave-active-class="transition ease-in duration-75" leave-from-class="transform opacity-100 scale-100" leave-to-class="transform opacity-0 scale-95">
            <div v-if="showDropdown" class="absolute top-full right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-[101] text-slate-800">
              <button @click="reloadApp" class="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-slate-50 transition-colors">
                <i class="fa-solid fa-rotate-right text-slate-400"></i>
                <span class="font-bold text-xs text-slate-700">Tải lại (Refresh)</span>
              </button>
              <button @click="appStore.loadHistory(false); showDropdown = false" class="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-slate-50 transition-colors">
                <i class="fa-solid fa-cloud-arrow-down text-slate-400"></i>
                <span class="font-bold text-xs text-slate-700">Đồng bộ Cloud</span>
              </button>
              <div class="h-[1px] bg-slate-100 my-1"></div>
              <button @click="appStore.logout()" class="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-rose-50 text-rose-650 transition-colors">
                <i class="fa-solid fa-arrow-right-from-bracket"></i>
                <span class="font-bold text-xs">Đăng xuất</span>
              </button>
            </div>
          </transition>
        </div>
      </div>
    </div>

    <!-- TAB CONTENT WRAPPER -->
    <div class="flex-grow relative overflow-hidden flex flex-col bg-slate-50 z-0 min-h-0 w-full">
      <!-- Active tab content (Always 100% width) -->
      <div class="flex-grow flex flex-col overflow-hidden relative min-h-0 w-full">
        <transition name="tab-fade" mode="out-in">
          <KeepAlive>
            <QuickDashboard v-if="ui.tab === 'dashboard'" key="dashboard" />
            <HistoryTimeline v-else-if="ui.tab === 'timeline'" key="timeline" />
            <HistoryList v-else-if="ui.tab === 'history'" key="history" />
            <AnalyticsDashboard v-else-if="ui.tab === 'analytics'" key="analytics" />
            <TestDashboard v-else-if="ui.tab === 'test'" key="test" />
            <div v-else-if="ui.tab === 'create'" key="create" class="flex-grow flex flex-col overflow-hidden relative min-h-0">
              <div class="flex-grow overflow-y-auto p-3 md:p-4 space-y-3 pb-6 bg-gray-50/30 scroll-smooth custom-scrollbar">
                <!-- Mode Edit Warning Banner -->
                <div v-if="formStore.id" class="bg-blue-50 border border-blue-200 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 animate-fade-in">
                  <div class="flex items-center gap-2.5">
                    <div class="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                      <i class="fa-solid fa-pen-to-square"></i>
                    </div>
                    <div>
                      <div class="font-black text-slate-800 text-xs uppercase tracking-wider">Đang chỉnh sửa phiếu đặt</div>
                      <div class="text-[11px] text-slate-500 font-semibold mt-0.5">Khách: <span class="text-blue-700 font-black">{{ formStore.customer.name || 'Chưa có tên' }}</span> <span v-if="formStore.customer.phone">(SĐT: {{ formStore.customer.phone }})</span></div>
                    </div>
                  </div>
                  <button @click="handleCreateNewForm" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs uppercase transition-all active:scale-95 flex items-center justify-center gap-1.5 shadow-sm shrink-0">
                    <i class="fa-solid fa-file-circle-plus"></i> Tạo lịch mới
                  </button>
                </div>

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
                <div v-if="hasSoftWarning" class="bg-amber-50/90 border border-amber-300 rounded-2xl p-4 shadow-sm space-y-2">
                  <div class="flex items-center gap-2 text-amber-800 font-black uppercase text-xs">
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
              <div class="bg-white border-t border-slate-200 p-4 shrink-0 shadow-[0_-4px_16px_rgba(0,0,0,0.05)] flex flex-wrap items-center justify-between gap-3 z-10 safe-area-pb">
                <div class="min-w-0">
                  <div class="text-[9px] font-black uppercase tracking-wider text-slate-400">Tổng tạm tính</div>
                  <div class="text-base font-black text-slate-800 tracking-tight leading-none mt-1">
                    {{ formatVND(formStore.calculatedTotals.final) }}
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <button v-if="formStore.id" @click="handleCreateNewForm" class="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl py-3 px-3.5 font-black text-xs uppercase flex items-center justify-center gap-1.5 transition-all active:scale-95 border border-slate-200">
                    <i class="fa-solid fa-file-circle-plus text-slate-500"></i> Tạo lịch mới
                  </button>
                  <button v-if="formStore.id" @click="doSave('save')" class="bg-blue-600 hover:bg-blue-700 text-white rounded-2xl py-3 px-4 font-black text-xs uppercase shadow-[0_4px_12px_rgba(37,99,235,0.25)] flex items-center justify-center gap-1.5 transition-all active:scale-95 border border-blue-500">
                    <i class="fa-solid fa-cloud-arrow-up text-sm text-blue-200"></i> Cập Nhật
                  </button>
                  <button v-else-if="formStore.customer.name" @click="doSave('save')" class="bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl py-3 px-6 font-black text-xs uppercase shadow-[0_4px_12px_rgba(5,150,105,0.25)] flex items-center justify-center gap-1.5 transition-all active:scale-95 border border-emerald-500">
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
        class="absolute inset-0 z-[110] bg-slate-100 flex flex-col w-full h-full overflow-hidden animate-fade-in"
      >
        <BillPreview />
      </div>
    </div>

    <!-- FLOATING ACTION BUTTON -->
    <div v-show="!ui.isKeyboardOpen && ui.tab === 'create'" class="absolute bottom-[84px] md:bottom-6 right-6 z-[100] safe-area-pb">
      <button @click="showActionSheet = true" class="w-14 h-14 bg-amber-500 hover:bg-amber-600 rounded-full shadow-xl shadow-amber-500/30 flex items-center justify-center text-white text-xl active:scale-90 transition-transform quick-action-fab">
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

    <!-- MORE MENU BOTTOM SHEET (MOBILE) -->
    <transition name="fade">
      <div v-if="showMoreSheet" class="absolute inset-0 z-[110] flex flex-col justify-end">
        <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" @click="showMoreSheet = false"></div>
        <transition name="slide-up" appear>
          <div v-if="showMoreSheet" class="bg-white rounded-t-3xl p-5 relative z-10 shadow-2xl pb-safe max-h-[85vh] overflow-y-auto">
            <div class="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-4"></div>
            
            <h3 class="text-center font-black text-slate-800 text-base mb-5 uppercase tracking-widest">Tiện ích khác</h3>
            
            <div class="grid grid-cols-3 gap-3">
              <!-- Báo cáo -->
              <button @click="ui.tab = 'analytics'; appStore.loadHistory(false); showMoreSheet = false" class="bg-slate-50 text-slate-700 p-3 rounded-2xl font-bold text-[11px] hover:bg-slate-100 transition-all active:scale-95 flex flex-col items-center justify-center gap-2 border border-slate-100">
                <div class="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center text-lg">
                  <i class="fa-solid fa-chart-pie"></i>
                </div>
                <span>Báo cáo</span>
              </button>
              
              <!-- Lịch sử -->
              <button @click="ui.tab = 'history'; appStore.loadHistory(false); showMoreSheet = false" class="bg-slate-50 text-slate-700 p-3 rounded-2xl font-bold text-[11px] hover:bg-slate-100 transition-all active:scale-95 flex flex-col items-center justify-center gap-2 border border-slate-100">
                <div class="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-lg">
                  <i class="fa-solid fa-list-ul"></i>
                </div>
                <span>Lịch sử</span>
              </button>

              <!-- Cài đặt -->
              <button @click="ui.showSettingsHub = true; showMoreSheet = false" class="bg-slate-50 text-slate-700 p-3 rounded-2xl font-bold text-[11px] hover:bg-slate-100 transition-all active:scale-95 flex flex-col items-center justify-center gap-2 border border-slate-100">
                <div class="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center text-lg">
                  <i class="fa-solid fa-gear"></i>
                </div>
                <span>Cài đặt</span>
              </button>

              <!-- Ngân hàng -->
              <button @click="ui.openConfig('bank'); showMoreSheet = false" class="bg-slate-50 text-slate-700 p-3 rounded-2xl font-bold text-[11px] hover:bg-slate-100 transition-all active:scale-95 flex flex-col items-center justify-center gap-2 border border-slate-100">
                <div class="w-10 h-10 rounded-xl bg-cyan-50 text-cyan-650 flex items-center justify-center text-lg">
                  <i class="fa-solid fa-building-columns"></i>
                </div>
                <span>Ngân hàng</span>
              </button>

              <!-- Thực đơn -->
              <button @click="ui.openConfig('menu'); showMoreSheet = false" class="bg-slate-50 text-slate-700 p-3 rounded-2xl font-bold text-[11px] hover:bg-slate-100 transition-all active:scale-95 flex flex-col items-center justify-center gap-2 border border-slate-100">
                <div class="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-650 flex items-center justify-center text-lg">
                  <i class="fa-solid fa-bell-concierge"></i>
                </div>
                <span>Thực đơn</span>
              </button>

              <!-- AI -->
              <button @click="ui.openConfig('ai'); showMoreSheet = false" class="bg-slate-50 text-slate-700 p-3 rounded-2xl font-bold text-[11px] hover:bg-slate-100 transition-all active:scale-95 flex flex-col items-center justify-center gap-2 border border-slate-100">
                <div class="w-10 h-10 rounded-xl bg-pink-50 text-pink-650 flex items-center justify-center text-lg">
                  <i class="fa-solid fa-wand-magic-sparkles"></i>
                </div>
                <span>AI</span>
              </button>

              <!-- Kiểm thử -->
              <button @click="ui.tab = 'test'; showMoreSheet = false" class="bg-slate-50 text-slate-700 p-3 rounded-2xl font-bold text-[11px] hover:bg-slate-100 transition-all active:scale-95 flex flex-col items-center justify-center gap-2 border border-slate-100">
                <div class="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center text-lg">
                  <i class="fa-solid fa-flask"></i>
                </div>
                <span>Kiểm thử</span>
              </button>

              <!-- Kiểm tra hệ thống -->
              <button @click="ui.openConfig('webhook'); showMoreSheet = false" class="bg-slate-50 text-slate-700 p-3 rounded-2xl font-bold text-[11px] hover:bg-slate-100 transition-all active:scale-95 flex flex-col items-center justify-center gap-2 border border-slate-100 col-span-3">
                <div class="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center text-lg">
                  <i class="fa-solid fa-shield-halved"></i>
                </div>
                <span>Kiểm tra hệ thống (Webhooks / Telegram)</span>
              </button>
            </div>
            
          </div>
        </transition>
      </div>
    </transition>

    <!-- MOBILE BOTTOM NAV -->
    <div v-show="ui.tab !== 'preview'" class="flex md:hidden w-full bg-slate-900 border-t border-slate-800 text-[10px] font-bold uppercase tracking-wider relative z-20 items-stretch shrink-0 pb-safe-bottom shadow-[0_-8px_30px_rgba(0,0,0,0.3)]">
      <button @click="ui.tab = 'dashboard'" :class="['flex-grow flex-1 py-2 flex flex-col justify-center items-center gap-0.5 transition-all duration-200 select-none min-h-[48px]', ui.tab === 'dashboard' ? 'text-blue-400 bg-slate-800/50' : 'text-slate-400 hover:text-slate-300']">
        <div class="relative flex items-center justify-center w-8 h-8 rounded-full transition-all" :class="ui.tab === 'dashboard' ? 'bg-blue-500/15 text-blue-400 scale-105' : ''">
          <i class="fa-solid fa-gauge-high text-base"></i>
        </div>
        <span class="text-[9px] font-extrabold tracking-tight">Tổng quan</span>
      </button>
      <button @click="ui.tab = 'create'" :class="['flex-grow flex-1 py-2 flex flex-col justify-center items-center gap-0.5 transition-all duration-200 select-none min-h-[48px]', ui.tab === 'create' ? 'text-blue-400 bg-slate-800/50' : 'text-slate-400 hover:text-slate-300']">
        <div class="relative flex items-center justify-center w-8 h-8 rounded-full transition-all" :class="ui.tab === 'create' ? 'bg-blue-500/15 text-blue-400 scale-105' : ''">
          <i class="fa-solid fa-plus text-base"></i>
        </div>
        <span class="text-[9px] font-extrabold tracking-tight">Tạo</span>
      </button>
      <button @click="ui.tab = 'timeline'; appStore.loadHistory(false)" :class="['flex-grow flex-1 py-2 flex flex-col justify-center items-center gap-0.5 transition-all duration-200 select-none min-h-[48px]', ui.tab === 'timeline' ? 'text-blue-400 bg-slate-800/50' : 'text-slate-400 hover:text-slate-300']">
        <div class="relative flex items-center justify-center w-8 h-8 rounded-full transition-all" :class="ui.tab === 'timeline' ? 'bg-blue-500/15 text-blue-400 scale-105' : ''">
          <i class="fa-solid fa-calendar-days text-base"></i>
        </div>
        <span class="text-[9px] font-extrabold tracking-tight">Lịch</span>
      </button>
      <button @click="ui.tab = 'preview'" :class="['flex-grow flex-1 py-2 flex flex-col justify-center items-center gap-0.5 transition-all duration-200 select-none min-h-[48px]', ui.tab === 'preview' ? 'text-blue-400 bg-slate-800/50' : 'text-slate-400 hover:text-slate-300']">
        <div class="relative flex items-center justify-center w-8 h-8 rounded-full transition-all" :class="ui.tab === 'preview' ? 'bg-blue-500/15 text-blue-400 scale-105' : ''">
          <i class="fa-solid fa-eye text-base"></i>
        </div>
        <span class="text-[9px] font-extrabold tracking-tight">Phiếu</span>
      </button>
      <button @click="showMoreSheet = true" :class="['flex-grow flex-1 py-2 flex flex-col justify-center items-center gap-0.5 transition-all duration-200 select-none min-h-[48px]', showMoreSheet ? 'text-blue-400 bg-slate-800/50' : 'text-slate-400 hover:text-slate-300']">
        <div class="relative flex items-center justify-center w-8 h-8 rounded-full transition-all" :class="showMoreSheet ? 'bg-blue-500/15 text-blue-400 scale-105' : ''">
          <i class="fa-solid fa-ellipsis text-base"></i>
        </div>
        <span class="text-[9px] font-extrabold tracking-tight">Thêm</span>
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

.quick-action-fab {
  animation: fab-pulse 2s infinite;
}
@keyframes fab-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.6);
  }
  70% {
    box-shadow: 0 0 0 12px rgba(245, 158, 11, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(245, 158, 11, 0);
  }
}
</style>
