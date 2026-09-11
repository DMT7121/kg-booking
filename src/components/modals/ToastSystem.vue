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
        class="pointer-events-auto rounded-2xl shadow-xl p-3.5 border border-slate-200/90 dark:border-slate-800/90 bg-white/95 dark:bg-slate-900/95 text-slate-800 dark:text-slate-100 relative overflow-hidden backdrop-blur-2xl transition-all"
        :class="{
          'border-l-4 border-l-emerald-500': t.type === 'success',
          'border-l-4 border-l-rose-500': t.type === 'error',
          'border-l-4 border-l-amber-500': t.type === 'warning',
          'border-l-4 border-l-blue-500': t.type === 'info'
        }"
      >
        <button 
          @click="ui.removeToast(t.id)" 
          aria-label="Đóng thông báo"
          class="absolute top-2 right-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200 transition-all rounded-full text-xs w-7 h-7 flex items-center justify-center active:scale-90 cursor-pointer"
        >
          <i class="fa-solid fa-xmark text-xs"></i>
        </button>
        <div class="flex items-start gap-3">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0 mt-0.5 shadow-xs"
               :class="{
                 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/40': t.type === 'success',
                 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400 border border-rose-100 dark:border-rose-900/40': t.type === 'error',
                 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400 border border-amber-100 dark:border-amber-900/40': t.type === 'warning',
                 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400 border border-blue-100 dark:border-blue-900/40': t.type === 'info'
               }">
            <i :class="{
              'fa-solid fa-circle-check': t.type === 'success',
              'fa-solid fa-circle-exclamation': t.type === 'error',
              'fa-solid fa-triangle-exclamation': t.type === 'warning',
              'fa-solid fa-circle-info': t.type === 'info'
            }"></i>
          </div>
          <div class="pr-5 min-w-0 flex-1">
            <div class="font-black text-xs uppercase tracking-wider text-slate-900 dark:text-slate-100 leading-tight">{{ t.title }}</div>
            <div class="text-[11px] text-slate-600 dark:text-slate-300 font-medium leading-snug mt-0.5 break-words">{{ t.msg }}</div>
          </div>
        </div>
        <div class="absolute bottom-0 left-0 h-0.5 transition-all rounded-full" 
             :class="{
               'bg-emerald-500': t.type === 'success',
               'bg-rose-500': t.type === 'error',
               'bg-amber-500': t.type === 'warning',
               'bg-blue-500': t.type === 'info'
             }" 
             :style="{ width: t.progress + '%' }">
        </div>
      </div>
    </transition-group>
  </div>
</template>
