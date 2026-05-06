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
import BillPreview from './BillPreview.vue'

const ui = useUIStore()
const formStore = useFormStore()
const configStore = useConfigStore()
const appStore = useAppStore()
const { triggerSave } = useBillRender()
const { copyBookingConfirmation, validateForm } = useForm()

const doSave = (type: string) => { haptic('light'); triggerSave(type, validateForm); showActionSheet.value = false; }

const showDropdown = ref(false)
const showActionSheet = ref(false)
function reloadApp() {
  window.location.reload()
}

// --- Tab Swipe (mobile only) ---
const mobileTabs = ['timeline', 'history', 'analytics', 'create', 'preview']
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
            <span class="text-[9px] px-2.5 py-0.5 rounded-md font-black uppercase tracking-widest inline-block text-white bg-blue-600/40 border border-blue-400/30 backdrop-blur-sm">AI MANAGER v6.0</span>
          </div>
        </div>
      </div>
      <div class="flex items-center gap-3 relative z-10">
        <div class="hidden sm:flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-xl border border-white/10 hover:bg-white/20 transition-all cursor-default shadow-inner">
          <div class="w-2 h-2 rounded-full transition-colors shadow-[0_0_8px_rgba(34,197,94,0.5)]" :class="{'bg-green-400': ui.connectionStatus === 'online', 'bg-yellow-400 animate-pulse': ui.connectionStatus === 'syncing', 'bg-red-400': ui.connectionStatus === 'error'}"></div>
          <span class="text-[10px] font-black text-blue-50 uppercase tracking-widest">{{ ui.connectionStatus }}</span>
        </div>
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

    <!-- TABS -->
    <div class="flex w-full bg-white text-[8px] sm:text-[10px] md:text-xs font-black border-b border-slate-200 uppercase tracking-widest shadow-sm relative z-10 items-stretch shrink-0">
      <button @click="ui.tab = 'timeline'; appStore.loadHistory(false)" :class="['flex-1 py-2 md:py-4 flex flex-col md:flex-row justify-center items-center gap-1 md:gap-2 transition-all min-h-[54px] md:min-h-[56px] border-b-[3px] px-1 md:px-4 text-center leading-tight whitespace-normal', ui.tab === 'timeline' ? 'text-blue-700 border-blue-600 bg-blue-50/80' : 'text-slate-400 border-transparent hover:text-slate-600 hover:bg-slate-50']">
        <i class="fa-solid fa-calendar-days text-sm md:text-base"></i> <span>Lịch Đặt Bàn</span>
      </button>
      <button @click="ui.tab = 'history'; appStore.loadHistory(false)" :class="['flex-1 py-2 md:py-4 flex flex-col md:flex-row justify-center items-center gap-1 md:gap-2 transition-all min-h-[54px] md:min-h-[56px] border-b-[3px] px-1 md:px-4 text-center leading-tight whitespace-normal', ui.tab === 'history' ? 'text-blue-700 border-blue-600 bg-blue-50/80' : 'text-slate-400 border-transparent hover:text-slate-600 hover:bg-slate-50']">
        <i class="fa-solid fa-list-ul text-sm md:text-base"></i> <span>Lịch Sử</span>
      </button>
      <button @click="ui.tab = 'analytics'; appStore.loadHistory(false)" :class="['flex-1 py-2 md:py-4 flex flex-col md:flex-row justify-center items-center gap-1 md:gap-2 transition-all min-h-[54px] md:min-h-[56px] border-b-[3px] px-1 md:px-4 text-center leading-tight whitespace-normal', ui.tab === 'analytics' ? 'text-blue-700 border-blue-600 bg-blue-50/80' : 'text-slate-400 border-transparent hover:text-slate-600 hover:bg-slate-50']">
        <i class="fa-solid fa-chart-pie text-sm md:text-base"></i> <span>Báo Cáo</span>
      </button>
      <button @click="ui.tab = 'create'" :class="['flex-1 py-2 md:py-4 flex flex-col md:flex-row justify-center items-center gap-1 md:gap-2 transition-all min-h-[54px] md:min-h-[56px] border-b-[3px] px-1 md:px-4 text-center leading-tight whitespace-normal', ui.tab === 'create' ? 'text-blue-700 border-blue-600 bg-blue-50/80' : 'text-slate-400 border-transparent hover:text-slate-600 hover:bg-slate-50']">
        <i class="fa-solid fa-plus text-sm md:text-base"></i> <span>Tạo Phiếu</span>
      </button>
      <button v-if="formStore.customer.name || formStore.id" @click="ui.tab = 'preview'" :class="['flex-1 py-2 md:py-4 flex flex-col md:flex-row justify-center items-center gap-1 md:gap-2 transition-all min-h-[54px] md:min-h-[56px] border-b-[3px] px-1 md:px-4 text-center leading-tight whitespace-normal', ui.tab === 'preview' ? 'text-blue-700 border-blue-600 bg-blue-50/80' : 'text-slate-400 border-transparent hover:text-slate-600 hover:bg-slate-50']">
        <i class="fa-solid fa-eye text-sm md:text-base"></i> <span>Xem Phiếu</span>
      </button>
    </div>

    <!-- TAB CONTENT WRAPPER -->
    <div class="flex-grow relative overflow-hidden flex flex-col bg-slate-50 z-0 min-h-0 h-full">
      <transition name="tab-fade" mode="out-in">
        <KeepAlive>
          <HistoryTimeline v-if="ui.tab === 'timeline'" key="timeline" />
          <HistoryList v-else-if="ui.tab === 'history'" key="history" />
          <AnalyticsDashboard v-else-if="ui.tab === 'analytics'" key="analytics" />
          <div v-else-if="ui.tab === 'create'" key="create" class="flex-grow flex flex-col overflow-hidden relative min-h-0 h-full">
            <div class="flex-grow overflow-y-auto p-3 md:p-4 space-y-3 pb-28 md:pb-6 bg-gray-50/30 scroll-smooth custom-scrollbar">
              <AIInputPanel />
              <div class="space-y-4">
                <CustomerForm />
                <DepositManager />
                <MenuItemsEditor />
              </div>
            </div>

          </div>
        </KeepAlive>
      </transition>

      <!-- BILL PREVIEW (Always in DOM for instant html2canvas capturing on iPhones) -->
      <div v-show="ui.tab === 'preview'" class="absolute inset-0 z-10 bg-slate-50 flex flex-col">
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
          <div v-if="showActionSheet" class="bg-white rounded-t-3xl p-5 md:p-8 relative z-10 shadow-2xl pb-safe">
            <div class="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6"></div>
            <h3 class="text-center font-black text-slate-800 text-lg mb-6 uppercase tracking-widest">Thao tác</h3>
            
            <div class="grid grid-cols-3 gap-3 md:gap-4">
              <button @click="doSave('save')" class="bg-emerald-50 text-emerald-600 py-4 rounded-2xl font-black text-[11px] hover:bg-emerald-100 transition-all active:scale-95 flex flex-col items-center justify-center gap-2 uppercase tracking-wide border border-emerald-100 shadow-sm">
                <i class="fa-solid fa-cloud-arrow-up text-2xl"></i> LƯU
              </button>
              <button @click="doSave('print')" class="bg-gray-800 text-white py-4 rounded-2xl font-black text-[11px] hover:bg-gray-900 transition-all active:scale-95 flex flex-col items-center justify-center gap-2 uppercase tracking-wide shadow-md shadow-gray-900/20">
                <i class="fa-solid fa-print text-2xl"></i> IN BILL
              </button>
              <button @click="doSave('image')" class="bg-indigo-50 text-indigo-600 py-4 rounded-2xl font-black text-[11px] hover:bg-indigo-100 transition-all active:scale-95 flex flex-col items-center justify-center gap-2 uppercase tracking-wide border border-indigo-100 shadow-sm">
                <i class="fa-solid fa-file-image text-2xl"></i> XUẤT ẢNH
              </button>
              <button @click="doSave('pdf')" class="bg-rose-50 text-rose-600 py-4 rounded-2xl font-black text-[11px] hover:bg-rose-100 transition-all active:scale-95 flex flex-col items-center justify-center gap-2 uppercase tracking-wide border border-rose-100 shadow-sm">
                <i class="fa-solid fa-file-pdf text-2xl"></i> XUẤT PDF
              </button>
              <button @click="copyBookingConfirmation(); showActionSheet = false" class="bg-amber-50 text-amber-600 py-4 rounded-2xl font-black text-[11px] hover:bg-amber-100 transition-all active:scale-95 flex flex-col items-center justify-center gap-2 uppercase tracking-wide border border-amber-100 shadow-sm">
                <i class="fa-solid fa-copy text-2xl"></i> SAO CHÉP
              </button>
              <button @click="shareCurrentBill(); showActionSheet = false" class="bg-cyan-50 text-cyan-600 py-4 rounded-2xl font-black text-[11px] hover:bg-cyan-100 transition-all active:scale-95 flex flex-col items-center justify-center gap-2 uppercase tracking-wide border border-cyan-100 shadow-sm">
                <i class="fa-solid fa-share-nodes text-2xl"></i> CHIA SẺ
              </button>
            </div>
          </div>
        </transition>
      </div>
    </transition>
  </div>
</template>

<style scoped>
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
