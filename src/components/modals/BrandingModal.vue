<script setup lang="ts">
import { ref } from 'vue'
import { useUIStore } from '@/stores/useUIStore'
import { useConfigStore } from '@/stores/useConfigStore'

const ui = useUIStore()
const configStore = useConfigStore()
const logoInput = ref<HTMLInputElement>()

const themes = [
  { id: 'blue', color: '#1A237E', name: 'Mặc định' },
  { id: 'red', color: '#dc2626', name: 'Đỏ' },
  { id: 'green', color: '#16a34a', name: 'Xanh lá' },
  { id: 'orange', color: '#d97706', name: 'Cam' },
  { id: 'purple', color: '#9333ea', name: 'Tím' }
]
</script>

<template>
  <div v-if="ui.activeSettingModal === 'branding'" class="flex-1 h-full flex justify-center items-center p-4 bg-slate-50 relative z-[1000] lg:z-10 w-full" @click.self="ui.closeConfig()">
    <div class="bg-white rounded-3xl shadow-2xl p-6 md:p-8 max-w-sm w-[95%] md:w-full flex flex-col relative overflow-hidden border border-slate-200">
      
      <!-- Header BG Decoration -->
      <div class="absolute top-0 left-0 right-0 h-24 bg-gradient-to-r from-blue-600 to-blue-900 rounded-t-3xl opacity-10"></div>

      <div class="flex justify-between items-center mb-6 relative z-10">
        <h3 class="text-2xl font-black text-blue-900 uppercase tracking-tighter flex items-center gap-3">
          <div class="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
            <i class="fa-solid fa-palette"></i>
          </div>
          Giao Diện
        </h3>
        <button @click="ui.closeConfig()" class="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl hover:bg-red-50 hover:text-red-500 transition-all flex items-center justify-center shrink-0 shadow-sm border border-slate-100">
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
            <button @click="logoInput?.click()" class="px-5 py-3 bg-white border border-blue-100 text-blue-900 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-50 active:scale-95 transition-all shadow-sm">TẢI LOGO LÊN</button>
            <input type="file" ref="logoInput" @change="configStore.handleLogoUpload" class="hidden" accept="image/*">
          </div>
        </div>

        <!-- Brand Color Theme -->
        <div class="bg-slate-50 p-5 rounded-2xl border border-slate-100 shadow-sm">
          <label class="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-3">Màu chủ đạo giao diện</label>
          <div class="flex flex-wrap gap-3">
            <button v-for="t in themes" :key="t.id"
              @click="configStore.branding.theme = t.id"
              class="flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all active:scale-95 group"
              :class="configStore.branding.theme === t.id ? 'bg-white shadow-sm border border-slate-200' : 'hover:bg-slate-100 border border-transparent'">
              <div class="w-8 h-8 rounded-full shadow-inner border-2 flex items-center justify-center transition-all"
                :class="configStore.branding.theme === t.id ? 'border-slate-800 scale-110' : 'border-white'"
                :style="{ backgroundColor: t.color }">
                <i v-if="configStore.branding.theme === t.id" class="fa-solid fa-check text-white text-[10px]"></i>
              </div>
              <span class="text-[9px] font-black text-slate-600 uppercase tracking-wider">{{ t.name }}</span>
            </button>
          </div>
          <p class="text-[10px] font-bold text-slate-400 mt-3 pl-1 flex items-center gap-1"><i class="fa-solid fa-palette text-slate-300"></i> Màu sẽ thay đổi toàn bộ nút bấm & giao diện.</p>
        </div>

        <button @click="configStore.saveBranding()" class="w-full py-4 bg-blue-900 text-white rounded-xl font-black uppercase tracking-widest text-[11px] shadow-lg shadow-blue-900/20 active:scale-95 transition-all flex items-center justify-center gap-2 mt-2">
          <i class="fa-solid fa-floppy-disk text-lg text-white/80"></i> LƯU GIAO DIỆN
        </button>
      </div>
    </div>
  </div>
</template>
