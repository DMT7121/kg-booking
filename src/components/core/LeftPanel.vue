<script setup lang="ts">
import { computed } from 'vue'
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

const ui = useUIStore()
const formStore = useFormStore()
const configStore = useConfigStore()
const appStore = useAppStore()
const { triggerSave } = useBillRender()
const { copyBookingConfirmation, validateForm } = useForm()

const doSave = (type: string) => { haptic('light'); triggerSave(type, validateForm) }

// --- Tab Swipe (mobile only) ---
const mobileTabs = ['timeline', 'create', 'history', 'preview']
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
    :class="['w-full md:w-5/12 bg-white flex flex-col shadow-2xl z-20 border-r border-gray-100 text-[13px] safe-area-pt', ui.tab === 'preview' ? 'h-auto shrink-0 md:h-full md:shrink' : 'h-full flex-1 md:flex-none']"
    @touchstart="onSwipeStart"
    @touchend="onSwipeEnd"
  >
    <!-- HEADER -->
    <div class="flex-shrink-0 bg-blue-900 text-white px-3 md:px-5 py-4 flex flex-wrap justify-between items-center gap-2 relative overflow-hidden box-border w-full">
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
        <button @click="ui.showSettingsHub = true" class="w-11 h-11 rounded-xl bg-white/10 hover:bg-white/25 flex items-center justify-center border border-white/10 transition-all active:scale-95 group relative shadow-sm">
          <i class="fa-solid fa-layer-group text-blue-100 group-hover:text-white transition-colors text-lg"></i>
          <span v-if="configStore.totalKeysHasData" class="absolute -top-1 -right-1 flex h-4 w-4">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-4 w-4 bg-red-500 border-2 border-blue-900"></span>
          </span>
        </button>
      </div>
    </div>

    <!-- TABS -->
    <div class="flex flex-nowrap overflow-x-auto w-full bg-white text-[10px] font-black border-b border-slate-100 uppercase tracking-widest shadow-sm relative z-10" style="scrollbar-width: none;">
      <button @click="ui.tab = 'timeline'; appStore.loadHistory(false)" :class="['flex-1 py-3.5 flex justify-center items-center gap-2 transition-all min-h-[46px] border-b-[3px] whitespace-nowrap px-2', ui.tab === 'timeline' ? 'text-blue-900 border-blue-900 bg-blue-50/50' : 'text-slate-400 border-transparent hover:text-slate-600 hover:bg-slate-50']"><i class="fa-solid fa-calendar-days text-sm"></i> Lịch Đặt Bàn</button>
      <button @click="ui.tab = 'create'" :class="['flex-1 py-3.5 flex justify-center items-center gap-2 transition-all min-h-[46px] border-b-[3px] whitespace-nowrap px-2', ui.tab === 'create' ? 'text-blue-900 border-blue-900 bg-blue-50/50' : 'text-slate-400 border-transparent hover:text-slate-600 hover:bg-slate-50']"><i class="fa-solid fa-plus text-sm"></i> Tạo Phiếu</button>
      <button @click="ui.tab = 'history'; appStore.loadHistory(false)" :class="['flex-1 py-3.5 flex justify-center items-center gap-2 transition-all min-h-[46px] border-b-[3px] whitespace-nowrap px-2', ui.tab === 'history' ? 'text-blue-900 border-blue-900 bg-blue-50/50' : 'text-slate-400 border-transparent hover:text-slate-600 hover:bg-slate-50']"><i class="fa-solid fa-list-ul text-sm"></i> Lịch Sử</button>
      <button @click="ui.tab = 'preview'" class="md:hidden flex-1 py-3.5 flex justify-center items-center gap-2 transition-all min-h-[46px] border-b-[3px] border-transparent text-slate-500 bg-slate-50 hover:bg-slate-100 whitespace-nowrap px-2"><i class="fa-solid fa-eye text-sm"></i> Preview</button>
    </div>

    <!-- CREATE TAB -->
    <div v-show="ui.tab === 'create'" class="flex-grow overflow-y-auto p-3 md:p-4 space-y-3 pb-28 md:pb-6 bg-gray-50/30 scroll-smooth custom-scrollbar">
      <AIInputPanel />
      <div class="space-y-4">
        <CustomerForm />
        <DepositManager />
        <MenuItemsEditor />
      </div>
    </div>

    <!-- DESKTOP FOOTER ACTIONS -->
    <div v-show="ui.tab === 'create' && !ui.isKeyboardOpen" class="hidden md:grid grid-cols-5 gap-3 p-4 border-t bg-white z-20 shadow-[0_-10px_20px_rgba(0,0,0,0.02)]">
      <button @click="doSave('save')" class="bg-emerald-600 text-white py-3.5 rounded-2xl font-black text-[10px] hover:bg-emerald-700 shadow-lg shadow-emerald-100 transition-all hover:-translate-y-1 active:scale-95 flex flex-col items-center gap-1.5 uppercase tracking-wide min-h-[50px]">
        <i class="fa-solid fa-cloud-arrow-up text-lg"></i> LƯU & DỮ LIỆU
      </button>
      <button @click="doSave('image')" class="bg-indigo-600 text-white py-3.5 rounded-2xl font-black text-[10px] hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all hover:-translate-y-1 active:scale-95 flex flex-col items-center gap-1.5 uppercase tracking-wide min-h-[50px]"><i class="fa-solid fa-file-image text-lg"></i> XUẤT ẢNH</button>
      <button @click="doSave('pdf')" class="bg-rose-600 text-white py-3.5 rounded-2xl font-black text-[10px] hover:bg-rose-700 shadow-lg shadow-rose-100 transition-all hover:-translate-y-1 active:scale-95 flex flex-col items-center gap-1.5 uppercase tracking-wide min-h-[50px]"><i class="fa-solid fa-file-pdf text-lg"></i> XUẤT PDF</button>
      <button @click="copyBookingConfirmation" class="bg-amber-500 text-white py-3.5 rounded-2xl font-black text-[10px] hover:bg-amber-600 shadow-lg shadow-amber-100 transition-all hover:-translate-y-1 active:scale-95 flex flex-col items-center gap-1.5 uppercase tracking-wide min-h-[50px]"><i class="fa-solid fa-copy text-lg"></i> SAO CHÉP</button>
      <button @click="shareCurrentBill" class="bg-cyan-500 text-white py-3.5 rounded-2xl font-black text-[10px] hover:bg-cyan-600 shadow-lg shadow-cyan-100 transition-all hover:-translate-y-1 active:scale-95 flex flex-col items-center gap-1.5 uppercase tracking-wide min-h-[50px]"><i class="fa-solid fa-share-nodes text-lg"></i> CHIA SẺ</button>
    </div>

    <!-- TIMELINE TAB -->
    <HistoryTimeline v-show="ui.tab === 'timeline'" />

    <!-- HISTORY TAB -->
    <HistoryList v-show="ui.tab === 'history'" />

    <!-- MOBILE FOOTER (Glassmorphism) -->
    <div v-if="ui.tab === 'create' && !ui.isKeyboardOpen" class="md:hidden fixed bottom-4 left-4 right-4 p-2.5 bg-blue-950/90 backdrop-blur-2xl border border-white/10 z-40 grid grid-cols-5 gap-2 shadow-[0_20px_50px_rgba(0,0,0,0.4)] rounded-2xl safe-area-pb">
      <button @click="doSave('save')" class="bg-emerald-500/10 text-emerald-400 py-3 rounded-xl font-black flex flex-col items-center text-[7px] gap-1 active:scale-90 transition-all uppercase tracking-widest border border-emerald-500/20 active-effect"><i class="fa-solid fa-cloud-arrow-up text-lg"></i> LƯU</button>
      <button @click="doSave('image')" class="bg-indigo-500/10 text-indigo-400 py-3 rounded-xl font-black flex flex-col items-center text-[7px] gap-1 active:scale-90 transition-all uppercase tracking-widest border border-indigo-500/20 active-effect"><i class="fa-solid fa-file-image text-lg"></i> ẢNH</button>
      <button @click="doSave('pdf')" class="bg-rose-500/10 text-rose-400 py-3 rounded-xl font-black flex flex-col items-center text-[7px] gap-1 active:scale-90 transition-all uppercase tracking-widest border border-rose-500/20 active-effect"><i class="fa-solid fa-file-pdf text-lg"></i> PDF</button>
      <button @click="copyBookingConfirmation" class="bg-amber-500/10 text-amber-400 py-3 rounded-xl font-black flex flex-col items-center text-[7px] gap-1 active:scale-90 transition-all uppercase tracking-widest border border-amber-500/20 active-effect"><i class="fa-solid fa-copy text-lg"></i> CHÉP</button>
      <button @click="shareCurrentBill" class="bg-cyan-500/10 text-cyan-400 py-3 rounded-xl font-black flex flex-col items-center text-[7px] gap-1 active:scale-90 transition-all uppercase tracking-widest border border-cyan-500/20 active-effect"><i class="fa-solid fa-share-nodes text-lg"></i> SHARE</button>
    </div>
  </div>
</template>
