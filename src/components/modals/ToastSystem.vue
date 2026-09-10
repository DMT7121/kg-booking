<script setup lang="ts">
import { ref, computed } from 'vue'
import { useUIStore } from '@/stores/useUIStore'
import { useAppStore } from '@/stores/useAppStore'

const ui = useUIStore()
const appStore = useAppStore()

// De-duplicate & limit transient toasts when persistent offline/reconnecting banner is active to prevent stacking
const activeToasts = computed(() => {
  const isPersistentBannerActive = ui.connectionStatus === 'offline' || 
                                   ui.connectionStatus === 'error' || 
                                   ui.connectionStatus === 'reconnecting' || 
                                   ui.connectionStatus === 'syncing'
  if (isPersistentBannerActive) {
    return ui.toasts.slice(-1)
  }
  return ui.toasts
})

// Touch swipe to dismiss
const touchStartX = ref(0)
const touchCurrentX = ref(0)
const swipingId = ref<number | null>(null)

function onTouchStart(e: TouchEvent, id: number) {
  touchStartX.value = e.touches[0].clientX
  touchCurrentX.value = e.touches[0].clientX
  swipingId.value = id
}

function onTouchMove(e: TouchEvent) {
  if (swipingId.value !== null) {
    touchCurrentX.value = e.touches[0].clientX
  }
}

function onTouchEnd(id: number) {
  if (swipingId.value === id) {
    const diff = touchCurrentX.value - touchStartX.value
    if (Math.abs(diff) > 75) {
      ui.removeToast(id)
    }
  }
  swipingId.value = null
  touchStartX.value = 0
  touchCurrentX.value = 0
}
</script>

<template>
  <div class="fixed bottom-20 sm:bottom-auto sm:top-4 left-4 right-4 sm:left-auto sm:right-4 z-[11000] space-y-2.5 max-w-sm ml-auto pointer-events-none pb-safe">
    
    <!-- Persistent Connectivity Banner (P1-01 / P0-03) - Sleek 44-48px non-obstructive indicator -->
    <transition name="fade">
      <div v-if="ui.connectionStatus === 'offline' || ui.connectionStatus === 'error'" 
           id="persistent-offline-banner"
           class="pointer-events-auto bg-rose-600/95 text-white font-bold text-xs px-3.5 py-2 min-h-[44px] max-h-[48px] rounded-xl shadow-lg border border-rose-500/80 flex items-center gap-2.5 backdrop-blur-md">
        <i class="fa-solid fa-wifi-slash text-xs animate-pulse text-rose-200 shrink-0"></i>
        <div class="flex-1 text-[11px] leading-tight min-w-0 truncate">
          <span class="font-black uppercase tracking-wider mr-1.5">Ngoại tuyến:</span>
          <span class="opacity-90 font-normal">{{ appStore.offlineQueueCount > 0 ? `${appStore.offlineQueueCount} thay đổi chờ đồng bộ` : 'Dữ liệu lưu an toàn trên máy' }}</span>
        </div>
      </div>
      <div v-else-if="ui.connectionStatus === 'reconnecting' || ui.connectionStatus === 'syncing'" 
           id="persistent-reconnecting-banner"
           class="pointer-events-auto bg-amber-500 text-slate-950 font-bold text-xs px-3.5 py-2 min-h-[44px] max-h-[48px] rounded-xl shadow-lg border border-amber-400/80 flex items-center gap-2.5 backdrop-blur-md">
        <i class="fa-solid fa-rotate text-xs animate-spin text-slate-900 shrink-0"></i>
        <div class="flex-1 text-[11px] leading-tight min-w-0 truncate">
          <span class="font-black uppercase tracking-wider mr-1.5">{{ ui.connectionStatus === 'reconnecting' ? 'Đang kết nối lại' : 'Đang đồng bộ' }}</span>
          <span class="opacity-90 font-normal">Kiểm tra dữ liệu máy chủ...</span>
        </div>
      </div>
    </transition>

    <!-- Transient Toasts -->
    <transition-group name="toast">
      <div 
        v-for="t in activeToasts" 
        :key="t.id" 
        @touchstart="onTouchStart($event, t.id)"
        @touchmove="onTouchMove"
        @touchend="onTouchEnd(t.id)"
        :class="[
          'pointer-events-auto rounded-[20px] shadow-2xl p-4 border-l-[6px] relative overflow-hidden backdrop-blur-2xl transition-all', 
          { 
            'border-emerald-500 bg-white/95 text-slate-800': t.type === 'success', 
            'border-rose-500 bg-white/95 text-slate-800': t.type === 'error', 
            'border-amber-400 bg-white/95 text-slate-800': t.type === 'warning', 
            'border-blue-500 bg-white/95 text-slate-800': t.type === 'info' 
          }
        ]"
      >
        <button 
          @click="ui.removeToast(t.id)" 
          aria-label="Đóng thông báo"
          class="absolute top-2 right-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all rounded-full text-xs w-9 h-9 min-h-[36px] min-w-[36px] flex items-center justify-center active:scale-90 cursor-pointer"
        >
          <i class="fa-solid fa-xmark text-sm"></i>
        </button>
        <div class="flex items-start gap-3">
          <div class="text-xl flex-shrink-0 mt-0.5" :class="{ 'text-emerald-500': t.type === 'success', 'text-rose-500': t.type === 'error', 'text-amber-500': t.type === 'warning', 'text-blue-500': t.type === 'info' }">
            <i :class="{ 'fa-solid fa-circle-check': t.type === 'success', 'fa-solid fa-circle-exclamation': t.type === 'error', 'fa-solid fa-triangle-exclamation': t.type === 'warning', 'fa-solid fa-circle-info': t.type === 'info' }"></i>
          </div>
          <div class="pr-6">
            <div class="font-black text-xs uppercase tracking-widest text-blue-900 mb-0.5 leading-none mt-1">{{ t.title }}</div>
            <div class="text-[11px] text-slate-600 font-bold leading-snug">{{ t.msg }}</div>
          </div>
        </div>
        <div class="absolute bottom-0 left-0 h-1 transition-all" :class="{ 'bg-emerald-400': t.type === 'success', 'bg-rose-400': t.type === 'error', 'bg-amber-400': t.type === 'warning', 'bg-blue-400': t.type === 'info' }" :style="{ width: t.progress + '%' }"></div>
      </div>
    </transition-group>
  </div>
</template>
