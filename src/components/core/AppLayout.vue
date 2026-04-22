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
    <div v-if="ui.modal.alert.show" class="fixed inset-0 bg-black/60 z-[12000] flex justify-center items-center p-4 backdrop-blur-sm">
      <div class="bg-white rounded-3xl shadow-2xl p-6 max-w-sm w-full border-t-8 border-blue-500">
        <h3 class="text-lg font-black text-slate-800 mb-2 uppercase">{{ ui.modal.alert.title }}</h3>
        <p class="text-sm text-gray-600 mb-6 font-medium whitespace-pre-line">{{ ui.modal.alert.msg }}</p>
        <button @click="ui.resolveModal('alert')" class="w-full py-3 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest min-h-[44px] active-effect">Đã Hiểu</button>
      </div>
    </div>
    </transition>

    <!-- Confirm -->
    <transition name="modal">
    <div v-if="ui.modal.confirm.show" class="fixed inset-0 bg-black/60 z-[12000] flex justify-center items-center p-4 backdrop-blur-sm">
      <div class="bg-white rounded-3xl shadow-2xl p-6 max-w-sm w-full border-t-8 border-red-500">
        <h3 class="text-lg font-black text-slate-800 mb-2 uppercase">{{ ui.modal.confirm.title }}</h3>
        <p class="text-sm text-gray-600 mb-6 font-medium whitespace-pre-line">{{ ui.modal.confirm.msg }}</p>
        <div class="grid grid-cols-2 gap-3">
          <button @click="ui.resolveModal('confirm', false)" class="py-3 bg-gray-100 text-gray-600 rounded-xl font-black uppercase min-h-[44px] active-effect">Hủy</button>
          <button @click="ui.resolveModal('confirm', true)" class="py-3 bg-red-600 text-white rounded-xl font-black uppercase min-h-[44px] active-effect shadow-lg shadow-red-200">Đồng Ý</button>
        </div>
      </div>
    </div>
    </transition>

    <!-- Prompt -->
    <transition name="modal">
    <div v-if="ui.modal.prompt.show" class="fixed inset-0 bg-black/60 z-[12000] flex justify-center items-center p-4 backdrop-blur-sm">
      <div class="bg-white rounded-3xl shadow-2xl p-6 max-w-sm w-full border-t-8 border-purple-500">
        <h3 class="text-lg font-black text-slate-800 mb-2 uppercase">{{ ui.modal.prompt.title }}</h3>
        <p class="text-xs text-gray-500 mb-3 font-bold uppercase">{{ ui.modal.prompt.msg }}</p>
        <input v-model="ui.modal.prompt.value" class="w-full border-2 border-gray-200 rounded-xl p-3 mb-6 font-bold text-slate-800 focus:border-purple-500 outline-none" placeholder="Nhập nội dung...">
        <div class="grid grid-cols-2 gap-3">
          <button @click="ui.resolveModal('prompt', null)" class="py-3 bg-gray-100 text-gray-600 rounded-xl font-black uppercase min-h-[44px] active-effect">Hủy</button>
          <button @click="ui.resolveModal('prompt', ui.modal.prompt.value)" class="py-3 bg-purple-600 text-white rounded-xl font-black uppercase min-h-[44px] active-effect shadow-lg shadow-purple-200">Xác Nhận</button>
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
    <div v-if="ui.showSettingsHub" class="fixed inset-0 bg-black/60 z-50 flex justify-center items-center p-4 backdrop-blur-sm" @click.self="ui.showSettingsHub = false">
      <div class="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-[95%] md:w-full flex flex-col">
        <div class="flex justify-between items-center mb-6">
          <h3 class="text-2xl font-black text-slate-800 uppercase tracking-tighter"><i class="fa-solid fa-gear text-slate-600 mr-2"></i>Cài Đặt Hệ Thống</h3>
          <button @click="ui.showSettingsHub = false" class="text-gray-400 hover:text-red-500 transition-colors p-2 min-h-[44px] min-w-[44px]"><i class="fa-solid fa-circle-xmark text-3xl"></i></button>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <button @click="ui.openConfig('branding')" class="p-6 bg-blue-50 border-2 border-blue-100 rounded-2xl flex flex-col items-center justify-center gap-2 hover:bg-blue-100 hover:border-blue-300 transition-all active:scale-95 group min-h-[120px]">
            <i class="fa-solid fa-palette text-3xl text-blue-500 group-hover:scale-110 transition-transform"></i>
            <span class="font-black text-xs uppercase text-slate-600 tracking-wide">Giao Diện</span>
          </button>
          <button @click="ui.openConfig('menu')" class="p-6 bg-green-50 border-2 border-green-100 rounded-2xl flex flex-col items-center justify-center gap-2 hover:bg-green-100 hover:border-green-300 transition-all active:scale-95 group min-h-[120px]">
            <i class="fa-solid fa-utensils text-3xl text-green-500 group-hover:scale-110 transition-transform"></i>
            <span class="font-black text-xs uppercase text-slate-600 tracking-wide">Thực Đơn</span>
          </button>
          <button @click="ui.openConfig('bank')" class="p-6 bg-purple-50 border-2 border-purple-100 rounded-2xl flex flex-col items-center justify-center gap-2 hover:bg-purple-100 hover:border-purple-300 transition-all active:scale-95 group min-h-[120px]">
            <i class="fa-solid fa-building-columns text-3xl text-purple-500 group-hover:scale-110 transition-transform"></i>
            <span class="font-black text-xs uppercase text-slate-600 tracking-wide">Ngân Hàng</span>
          </button>
          <button @click="ui.openConfig('staff')" class="p-6 bg-orange-50 border-2 border-orange-100 rounded-2xl flex flex-col items-center justify-center gap-2 hover:bg-orange-100 hover:border-orange-300 transition-all active:scale-95 group min-h-[120px]">
            <i class="fa-solid fa-users-gear text-3xl text-orange-500 group-hover:scale-110 transition-transform"></i>
            <span class="font-black text-xs uppercase text-slate-600 tracking-wide">Nhân Viên</span>
          </button>
          <button @click="ui.openConfig('ai')" class="p-4 bg-slate-100 border-2 border-slate-200 rounded-2xl flex items-center justify-center gap-3 hover:bg-slate-200 hover:border-slate-300 transition-all active:scale-95 min-h-[60px]">
            <i class="fa-solid fa-microchip text-xl text-slate-600"></i>
            <span class="font-black text-xs uppercase text-slate-600 tracking-wide">AI Core v6.0</span>
          </button>
          <button @click="ui.openConfig('webhook')" class="p-4 bg-cyan-50 border-2 border-cyan-200 rounded-2xl flex items-center justify-center gap-3 hover:bg-cyan-100 hover:border-cyan-300 transition-all active:scale-95 min-h-[60px]">
            <i class="fa-solid fa-bell text-xl text-cyan-600"></i>
            <span class="font-black text-xs uppercase text-slate-600 tracking-wide">Thông Báo</span>
          </button>
        </div>
      </div>
    </div>

    <!-- STAFF SELECTOR MODAL (ON SAVE) -->
    <div v-if="ui.showStaffSelector" class="fixed inset-0 bg-black/80 z-[10002] flex justify-center items-center p-4 backdrop-blur-sm" @click.self="ui.showStaffSelector = false">
      <div class="bg-white rounded-3xl shadow-2xl p-6 max-w-sm w-full border-4 border-slate-900">
        <h3 class="text-xl font-black text-center mb-6 text-slate-800 uppercase tracking-tighter">NHÂN VIÊN TẠO PHIẾU</h3>
        <div class="grid grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto custom-scrollbar p-1">
          <button v-for="(staff, idx) in appStore.staffList" :key="idx"
            @click="confirmStaffAndSave(staff)"
            class="p-4 rounded-2xl border-2 border-slate-100 hover:border-blue-500 hover:bg-blue-50 transition-all active:scale-95 flex flex-col items-center justify-center gap-1 shadow-sm group min-h-[80px]">
            <i class="fa-solid fa-user-check text-2xl text-slate-300 group-hover:text-blue-500 mb-1"></i>
            <span class="font-black text-xs uppercase text-slate-700 text-center leading-tight">{{ staff.name }}</span>
            <span class="text-[9px] font-mono font-bold text-slate-400">{{ staff.phone }}</span>
          </button>
        </div>
        <button @click="ui.showStaffSelector = false" class="w-full mt-4 py-3 bg-gray-100 text-gray-500 font-black rounded-xl uppercase text-xs hover:bg-gray-200 min-h-[44px] active-effect">Hủy Bỏ</button>
      </div>
    </div>

    <!-- ALL CONFIG MODALS -->
    <VerifyTransferModal />
    <StaffModal />
    <AiConfigModal />
    <BrandingModal />
    <MenuManagerModal />
    <BankConfigModal />
    <WebhookConfigModal />

    <!-- DESKTOP SIDEBAR -->
    <aside class="hidden lg:flex w-20 bg-slate-950 flex-col items-center py-8 gap-8 border-r border-white/5 z-30 shadow-2xl">
      <div class="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20 active:scale-95 transition-transform cursor-pointer">
        <i class="fa-solid fa-crown text-white text-xl"></i>
      </div>
      
      <nav class="flex-1 flex flex-col gap-6 w-full px-4">
        <button @click="ui.tab = 'create'" :class="['w-12 h-12 rounded-2xl flex items-center justify-center transition-all group', ui.tab === 'create' ? 'bg-white/10 text-white shadow-inner' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5']">
          <i class="fa-solid fa-house-chimney text-lg group-hover:scale-110 transition-transform"></i>
        </button>
        <button @click="appStore.loadHistory(false)" :class="['w-12 h-12 rounded-2xl flex items-center justify-center transition-all group', ui.tab === 'history' ? 'bg-white/10 text-white shadow-inner' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5']">
          <i class="fa-solid fa-calendar-days text-lg group-hover:scale-110 transition-transform"></i>
        </button>
        <button @click="ui.showSettingsHub = true" class="w-12 h-12 rounded-2xl flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-all group">
          <i class="fa-solid fa-sliders text-lg group-hover:scale-110 transition-transform"></i>
        </button>
      </nav>

      <div class="mt-auto flex flex-col gap-6">
        <div class="w-10 h-10 rounded-full border-2 border-slate-800 overflow-hidden cursor-pointer hover:border-blue-500 transition-colors">
          <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Admin" alt="Admin">
        </div>
      </div>
    </aside>

    <!-- MAIN PANELS -->
    <LeftPanel />
    <BillPreview />

  </div>
</template>
