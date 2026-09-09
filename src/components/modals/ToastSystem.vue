<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useUIStore } from '@/stores/useUIStore'

const ui = useUIStore()

// Offline Status Monitor
const isOnline = ref(typeof navigator !== 'undefined' ? navigator.onLine : true)

function handleOnline() {
  isOnline.value = true
  ui.showToast('🟢 Đã khôi phục kết nối mạng!', 'success')
}

function handleOffline() {
  isOnline.value = false
}

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

onMounted(() => {
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
})

onUnmounted(() => {
  window.removeEventListener('online', handleOnline)
  window.removeEventListener('offline', handleOffline)
})
</script>

<template>
  <div class="fixed bottom-20 sm:bottom-auto sm:top-4 left-4 right-4 sm:left-auto sm:right-4 z-[11000] space-y-2.5 max-w-sm ml-auto pointer-events-none pb-safe">
    
    <!-- Persistent Offline Banner (Spec #25) -->
    <transition name="fade">
      <div v-if="!isOnline" class="pointer-events-auto bg-amber-500 text-slate-950 font-black text-xs px-4 py-2.5 rounded-2xl shadow-xl border border-amber-400 flex items-center gap-2.5">
        <i class="fa-solid fa-wifi-slash text-sm animate-pulse"></i>
        <div class="flex-1 text-[11px] leading-tight">
          <span class="font-black uppercase tracking-wider block">MẤT KẾT NỐI INTERNET</span>
          <span class="font-bold opacity-90">Hệ thống chuyển sang chế độ lưu tạm offline.</span>
        </div>
      </div>
    </transition>

    <!-- Transient Toasts -->
    <transition-group name="toast">
      <div 
        v-for="t in ui.toasts" 
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
