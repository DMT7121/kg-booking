<script setup lang="ts">
import { useUIStore } from '@/stores/useUIStore'

const ui = useUIStore()
</script>

<template>
  <div class="fixed top-4 right-4 z-[11000] space-y-3 max-w-sm w-full pointer-events-none" style="pointer-events: none;">
    <transition-group name="toast">
      <div v-for="t in ui.toasts" :key="t.id" :class="['pointer-events-auto rounded-[24px] shadow-2xl p-5 border-l-[6px] relative overflow-hidden backdrop-blur-2xl transition-all', { 'border-emerald-500 bg-white/95': t.type === 'success', 'border-rose-500 bg-white/95': t.type === 'error', 'border-amber-400 bg-white/95': t.type === 'warning', 'border-blue-500 bg-white/95': t.type === 'info' }]">
        <button @click="ui.removeToast(t.id)" class="absolute top-2 right-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all rounded-full text-sm w-8 h-8 flex items-center justify-center active:scale-95"><i class="fa-solid fa-xmark"></i></button>
        <div class="flex items-start gap-3">
          <div class="text-2xl flex-shrink-0 mt-0.5" :class="{ 'text-emerald-500': t.type === 'success', 'text-rose-500': t.type === 'error', 'text-amber-500': t.type === 'warning', 'text-blue-500': t.type === 'info' }">
            <i :class="{ 'fa-solid fa-circle-check': t.type === 'success', 'fa-solid fa-circle-exclamation': t.type === 'error', 'fa-solid fa-triangle-exclamation': t.type === 'warning', 'fa-solid fa-circle-info': t.type === 'info' }"></i>
          </div>
          <div class="pr-6">
            <div class="font-black text-[13px] uppercase tracking-widest text-blue-900 mb-1 leading-none mt-1">{{ t.title }}</div>
            <div class="text-[11px] text-slate-500 font-bold leading-snug" v-html="t.msg"></div>
          </div>
        </div>
        <div class="absolute bottom-0 left-0 h-1.5 transition-all" :class="{ 'bg-emerald-400': t.type === 'success', 'bg-rose-400': t.type === 'error', 'bg-amber-400': t.type === 'warning', 'bg-blue-400': t.type === 'info' }" :style="{ width: t.progress + '%' }"></div>
      </div>
    </transition-group>
  </div>
</template>
