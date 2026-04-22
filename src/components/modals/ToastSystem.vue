<script setup lang="ts">
import { useUIStore } from '@/stores/useUIStore'

const ui = useUIStore()
</script>

<template>
  <div class="fixed top-4 right-4 z-[11000] space-y-3 max-w-sm w-full pointer-events-none" style="pointer-events: none;">
    <transition-group name="toast">
      <div v-for="t in ui.toasts" :key="t.id" :class="['pointer-events-auto rounded-2xl shadow-2xl p-4 border-l-[6px] relative overflow-hidden backdrop-blur-xl', { 'border-emerald-500 bg-white': t.type === 'success', 'border-red-500 bg-white': t.type === 'error', 'border-yellow-400 bg-white': t.type === 'warning', 'border-blue-400 bg-white': t.type === 'info' }]">
        <button @click="ui.removeToast(t.id)" class="absolute top-2 right-3 text-gray-300 hover:text-gray-600 transition-colors text-sm min-h-[44px] min-w-[44px] flex items-center justify-center"><i class="fa-solid fa-xmark"></i></button>
        <div class="flex items-start gap-3">
          <div class="text-xl flex-shrink-0 mt-0.5" :class="{ 'text-emerald-500': t.type === 'success', 'text-red-500': t.type === 'error', 'text-yellow-500': t.type === 'warning', 'text-blue-500': t.type === 'info' }">
            <i :class="{ 'fa-solid fa-check-circle': t.type === 'success', 'fa-solid fa-exclamation-circle': t.type === 'error', 'fa-solid fa-triangle-exclamation': t.type === 'warning', 'fa-solid fa-info-circle': t.type === 'info' }"></i>
          </div>
          <div class="pr-6">
            <div class="font-black text-xs uppercase tracking-widest text-slate-800 mb-0.5">{{ t.title }}</div>
            <div class="text-[11px] text-gray-600 font-medium leading-snug" v-html="t.msg"></div>
          </div>
        </div>
        <div class="absolute bottom-0 left-0 h-1 transition-all" :class="{ 'bg-emerald-400': t.type === 'success', 'bg-red-400': t.type === 'error', 'bg-yellow-400': t.type === 'warning', 'bg-blue-400': t.type === 'info' }" :style="{ width: t.progress + '%' }"></div>
      </div>
    </transition-group>
  </div>
</template>
