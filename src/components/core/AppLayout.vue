<script setup lang="ts">
import { useUIStore } from '@/stores/useUIStore'
import { useFormStore } from '@/stores/useFormStore'
import { useAppStore } from '@/stores/useAppStore'
import { useConfigStore } from '@/stores/useConfigStore'
import { useBillRender } from '@/composables/useBillRender'
import { useForm } from '@/composables/useForm'
import { isIOS } from '@/utils'
import { onMounted, watch, nextTick, defineAsyncComponent } from 'vue'
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

const ui = useUIStore()
const formStore = useFormStore()
const appStore = useAppStore()
const configStore = useConfigStore()
const { updatePreviewScale, confirmStaffAndSave, triggerSave } = useBillRender()
const { handleInputFocus, handleInputBlur, copyToClipboard, copyBookingConfirmation } = useForm()


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
onMounted(() => {
  if (!formStore.id) formStore.id = crypto.randomUUID()
  ui.isVoiceSupported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window

  appStore.fetchSheets()
  appStore.fetchMenu()
  appStore.loadHistory(true)
  appStore.fetchRemoteConfig()

  // Keyboard detection via visualViewport
  if (window.visualViewport) {
    const initialViewportHeight = window.visualViewport.height
    window.visualViewport.addEventListener('resize', () => {
      ui.isKeyboardOpen = window.visualViewport!.height < initialViewportHeight * 0.85
    })
  }

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
})
</script>

<template>
  <div id="app-root" class="h-screen min-h-[100dvh] flex flex-col md:flex-row" v-cloak>

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
    <div v-if="ui.showSettingsHub" class="fixed inset-0 bg-slate-50 z-[12000] overflow-y-auto custom-scrollbar flex flex-col">
      <!-- Top Header -->
      <div class="bg-white px-4 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <button @click="ui.showSettingsHub = false" class="w-10 h-10 flex items-center justify-center text-slate-800 text-xl active:scale-95 transition-transform">
          <i class="fa-solid fa-arrow-left"></i>
        </button>
        <div class="text-center flex-1">
          <h2 class="text-xl font-black text-blue-900">Cài đặt</h2>
          <p class="text-[10px] font-bold text-slate-400 mt-0.5">Quản lý thông tin và thiết lập hệ thống</p>
        </div>
        <div class="w-10 h-10"></div> <!-- Placeholder for balance -->
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
            <button @click="ui.openConfig('menu')" class="w-full px-4 py-4 flex items-center gap-4 hover:bg-slate-50 active:bg-slate-100 transition-colors border-b border-slate-50 group">
              <div class="w-12 h-12 rounded-2xl bg-blue-50 text-blue-500 flex items-center justify-center text-xl shrink-0 group-hover:scale-110 transition-transform">
                <i class="fa-solid fa-bell-concierge"></i>
              </div>
              <div class="flex-1 text-left">
                <div class="font-black text-slate-800 text-[13px] mb-0.5">Thêm thực đơn</div>
                <div class="text-[10px] font-bold text-slate-400 leading-tight">Quản lý và cập nhật các món ăn, đồ uống<br>hiển thị trên phiếu đặt bàn</div>
              </div>
              <i class="fa-solid fa-chevron-right text-slate-300 text-sm"></i>
            </button>
            
            <!-- AI -->
            <button @click="ui.openConfig('ai')" class="w-full px-4 py-4 flex items-center gap-4 hover:bg-slate-50 active:bg-slate-100 transition-colors border-b border-slate-50 group">
              <div class="w-12 h-12 rounded-2xl bg-purple-50 text-purple-500 flex items-center justify-center text-xl shrink-0 group-hover:scale-110 transition-transform">
                <i class="fa-solid fa-wand-magic-sparkles"></i>
              </div>
              <div class="flex-1 text-left">
                <div class="font-black text-slate-800 text-[13px] mb-0.5">Thêm cấu hình AI</div>
                <div class="text-[10px] font-bold text-slate-400 leading-tight">Thiết lập và tùy chỉnh AI hỗ trợ gợi ý số bàn,<br>phân tích và nhắc nhở</div>
              </div>
              <i class="fa-solid fa-chevron-right text-slate-300 text-sm"></i>
            </button>

            <!-- Staff -->
            <button @click="ui.openConfig('staff')" class="w-full px-4 py-4 flex items-center gap-4 hover:bg-slate-50 active:bg-slate-100 transition-colors border-b border-slate-50 group">
              <div class="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center text-xl shrink-0 group-hover:scale-110 transition-transform">
                <i class="fa-regular fa-user"></i>
              </div>
              <div class="flex-1 text-left">
                <div class="font-black text-slate-800 text-[13px] mb-0.5">Thêm nhân viên nhận bàn</div>
                <div class="text-[10px] font-bold text-slate-400 leading-tight">Thêm và quản lý nhân viên nhận bàn.<br>Thông tin sẽ hiển thị trên phiếu để khách hàng<br>liên hệ khi cần</div>
              </div>
              <i class="fa-solid fa-chevron-right text-slate-300 text-sm"></i>
            </button>

            <!-- Bank -->
            <button @click="ui.openConfig('bank')" class="w-full px-4 py-4 flex items-center gap-4 hover:bg-slate-50 active:bg-slate-100 transition-colors group">
              <div class="w-12 h-12 rounded-2xl bg-cyan-50 text-cyan-500 flex items-center justify-center text-xl shrink-0 group-hover:scale-110 transition-transform">
                <i class="fa-solid fa-building-columns"></i>
              </div>
              <div class="flex-1 text-left">
                <div class="font-black text-slate-800 text-[13px] mb-0.5">Thêm ngân hàng</div>
                <div class="text-[10px] font-bold text-slate-400 leading-tight">Quản lý thông tin tài khoản ngân hàng<br>hiển thị trên phiếu đặt bàn</div>
              </div>
              <i class="fa-solid fa-chevron-right text-slate-300 text-sm"></i>
            </button>
          </div>
        </div>

        <!-- Section: UI -->
        <div class="space-y-3">
          <h4 class="text-[11px] font-black text-slate-400 uppercase tracking-widest pl-2">Tùy chỉnh giao diện</h4>
          <div class="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <button @click="ui.openConfig('branding')" class="w-full px-4 py-4 flex items-center gap-4 hover:bg-slate-50 active:bg-slate-100 transition-colors group">
              <div class="w-12 h-12 rounded-2xl bg-orange-50 text-orange-500 flex items-center justify-center text-xl shrink-0 group-hover:scale-110 transition-transform">
                <i class="fa-solid fa-pen-nib"></i>
              </div>
              <div class="flex-1 text-left">
                <div class="font-black text-slate-800 text-[13px] mb-0.5">Tinh chỉnh giao diện</div>
                <div class="text-[10px] font-bold text-slate-400 leading-tight">Tùy chỉnh logo, màu sắc, font chữ và<br>các yếu tố hiển thị trên phiếu đặt bàn</div>
              </div>
              <i class="fa-solid fa-chevron-right text-slate-300 text-sm"></i>
            </button>
          </div>
        </div>

        <!-- Section: Other -->
        <div class="space-y-3">
          <h4 class="text-[11px] font-black text-slate-400 uppercase tracking-widest pl-2">Khác</h4>
          <div class="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <button @click="ui.openConfig('webhook')" class="w-full px-4 py-4 flex items-center gap-4 hover:bg-slate-50 active:bg-slate-100 transition-colors group">
              <div class="w-12 h-12 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center text-xl shrink-0 group-hover:scale-110 transition-transform">
                <i class="fa-solid fa-gear"></i>
              </div>
              <div class="flex-1 text-left">
                <div class="font-black text-slate-800 text-[13px] mb-0.5">Cài đặt hệ thống</div>
                <div class="text-[10px] font-bold text-slate-400 leading-tight">Quản lý thông báo Telegram, cấu hình chung<br>và các thiết lập khác</div>
              </div>
              <i class="fa-solid fa-chevron-right text-slate-300 text-sm"></i>
            </button>
          </div>
        </div>

        <!-- Logout Button -->
        <button @click="appStore.logout()" class="w-full py-4 bg-white border border-rose-100 text-rose-500 rounded-2xl font-black text-sm shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2 hover:bg-rose-50">
          <i class="fa-solid fa-arrow-right-from-bracket"></i> Đăng xuất
        </button>
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
    <StaffModal />
    <AiConfigModal />
    <BrandingModal />
    <MenuManagerModal />
    <BankConfigModal />
    <WebhookConfigModal />
    <BookingDetailModal />

    <!-- DESKTOP SIDEBAR -->
    <aside class="hidden lg:flex w-20 bg-blue-950 flex-col items-center py-8 gap-8 border-r border-white/5 z-30 shadow-[4px_0_24px_rgba(0,0,0,0.1)]">
      <div class="w-12 h-12 bg-blue-500 rounded-2xl flex items-center justify-center shadow-[0_4px_12px_rgba(59,130,246,0.3)] active:scale-95 transition-transform cursor-pointer border border-blue-400/30 relative overflow-hidden">
        <div class="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent pointer-events-none"></div>
        <i class="fa-solid fa-crown text-white text-xl relative z-10"></i>
      </div>
      
      <nav class="flex-1 flex flex-col gap-6 w-full px-4">
        <button @click="ui.tab = 'timeline'; appStore.loadHistory(false)" :class="['w-12 h-12 rounded-2xl flex items-center justify-center transition-all group', ui.tab === 'timeline' ? 'bg-white/10 text-white shadow-inner border border-white/10' : 'text-blue-200 hover:text-white hover:bg-white/5']" title="Lịch Đặt Bàn">
          <i class="fa-solid fa-calendar-days text-lg group-hover:scale-110 transition-transform"></i>
        </button>
        <button @click="ui.tab = 'history'; appStore.loadHistory(false)" :class="['w-12 h-12 rounded-2xl flex items-center justify-center transition-all group', ui.tab === 'history' ? 'bg-white/10 text-white shadow-inner border border-white/10' : 'text-blue-200 hover:text-white hover:bg-white/5']" title="Lịch Sử Tạo Phiếu">
          <i class="fa-solid fa-list-ul text-lg group-hover:scale-110 transition-transform"></i>
        </button>
        <button @click="ui.tab = 'create'" :class="['w-12 h-12 rounded-2xl flex items-center justify-center transition-all group', ui.tab === 'create' ? 'bg-white/10 text-white shadow-inner border border-white/10' : 'text-blue-200 hover:text-white hover:bg-white/5']" title="Tạo Phiếu Đặt">
          <i class="fa-solid fa-house-chimney text-lg group-hover:scale-110 transition-transform"></i>
        </button>
        <button @click="ui.showSettingsHub = true" class="w-12 h-12 rounded-2xl flex items-center justify-center text-blue-200 hover:text-white hover:bg-white/5 transition-all group mt-auto" title="Cài đặt">
          <i class="fa-solid fa-sliders text-lg group-hover:scale-110 transition-transform"></i>
        </button>
      </nav>

      <div class="mt-auto flex flex-col gap-6 w-full px-4 items-center">
        <div class="w-10 h-10 rounded-full border-2 border-blue-900 overflow-hidden cursor-pointer hover:border-blue-400 transition-colors shadow-lg">
          <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Admin" alt="Admin">
        </div>
      </div>
    </aside>

    <!-- MAIN PANELS -->
    <LeftPanel />
    <BillPreview />

  </div>
</template>
