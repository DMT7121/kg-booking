<script setup lang="ts">
import { ref } from 'vue'
import { useUIStore } from '@/stores/useUIStore'
import { useConfigStore } from '@/stores/useConfigStore'

const ui = useUIStore()
const configStore = useConfigStore()
const logoInput = ref<HTMLInputElement>()
</script>

<template>
  <div v-if="ui.showBrandingConfig" class="fixed inset-0 bg-[#0D1658]/80 z-[12000] flex justify-center items-center p-4 backdrop-blur-md" @click.self="ui.showBrandingConfig = false">
    <div class="bg-white rounded-3xl shadow-2xl p-6 md:p-8 max-w-sm w-[95%] md:w-full flex flex-col relative overflow-hidden border border-white/20">
      
      <!-- Header BG Decoration -->
      <div class="absolute top-0 left-0 right-0 h-24 bg-gradient-to-r from-blue-600 to-[#1A237E] rounded-t-3xl opacity-10"></div>

      <div class="flex justify-between items-center mb-6 relative z-10">
        <h3 class="text-2xl font-black text-[#1A237E] uppercase tracking-tighter flex items-center gap-3">
          <div class="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
            <i class="fa-solid fa-palette"></i>
          </div>
          Giao Diện
        </h3>
        <button @click="ui.showBrandingConfig = false" class="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl hover:bg-red-50 hover:text-red-500 transition-all flex items-center justify-center shrink-0 shadow-sm border border-slate-100">
          <i class="fa-solid fa-xmark text-xl"></i>
        </button>
      </div>

      <div class="space-y-6 relative z-10">
        <!-- Logo -->
        <div class="bg-slate-50 p-5 rounded-2xl border border-slate-100 shadow-sm">
          <label class="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-3">Logo thương hiệu</label>
          <div class="flex items-center gap-4">
            <div class="w-16 h-16 rounded-2xl border-2 border-dashed border-blue-200 flex items-center justify-center overflow-hidden bg-white shadow-inner">
              <img v-if="configStore.branding.logo" :src="configStore.branding.logo" class="w-full h-full object-contain p-1">
              <i v-else class="fa-solid fa-image text-2xl text-blue-200"></i>
            </div>
            <button @click="logoInput?.click()" class="px-5 py-3 bg-white border border-blue-100 text-[#1A237E] rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-50 active:scale-95 transition-all shadow-sm">TẢI LOGO LÊN</button>
            <input type="file" ref="logoInput" @change="configStore.handleLogoUpload" class="hidden" accept="image/*">
          </div>
        </div>

        <!-- Brand Color -->
        <div class="bg-slate-50 p-5 rounded-2xl border border-slate-100 shadow-sm">
          <label class="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-3">Màu chủ đạo</label>
          <div class="flex items-center gap-4">
            <div class="relative w-14 h-14 rounded-2xl overflow-hidden border-4 border-white shadow-md flex-shrink-0 cursor-pointer">
              <input type="color" v-model="configStore.branding.color" class="absolute -top-4 -left-4 w-24 h-24 cursor-pointer">
            </div>
            <div class="flex flex-wrap gap-2.5">
              <button v-for="c in ['#1A237E','#eab308','#ef4444','#10b981','#8b5cf6','#f97316','#ec4899','#1e293b']" :key="c"
                @click="configStore.branding.color = c"
                class="w-7 h-7 rounded-full shadow-sm border-2 transition-all active:scale-90"
                :class="configStore.branding.color === c ? 'border-slate-800 scale-125 shadow-md' : 'border-white hover:scale-110'"
                :style="{ backgroundColor: c }"></button>
            </div>
          </div>
        </div>

        <button @click="configStore.saveBranding()" class="w-full py-4 bg-[#1A237E] text-white rounded-xl font-black uppercase tracking-widest text-[11px] shadow-lg shadow-blue-900/20 active:scale-95 transition-all flex items-center justify-center gap-2 mt-2">
          <i class="fa-solid fa-floppy-disk text-lg text-white/80"></i> LƯU GIAO DIỆN
        </button>
      </div>
    </div>
  </div>
</template>
