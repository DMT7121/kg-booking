<script setup lang="ts">
import { ref } from 'vue'
import { useUIStore } from '@/stores/useUIStore'
import { useConfigStore } from '@/stores/useConfigStore'

const ui = useUIStore()
const configStore = useConfigStore()
const logoInput = ref<HTMLInputElement>()
</script>

<template>
  <div v-if="ui.showBrandingConfig" class="fixed inset-0 bg-black/60 z-50 flex justify-center items-center p-4 backdrop-blur-sm" @click.self="ui.showBrandingConfig = false">
    <div class="bg-white rounded-3xl shadow-2xl p-6 max-w-sm w-full border-t-8 border-blue-500">
      <div class="flex justify-between items-center mb-6">
        <h3 class="text-xl font-black text-slate-800 uppercase tracking-tighter"><i class="fa-solid fa-palette text-blue-500 mr-2"></i>Giao Diện</h3>
        <button @click="ui.showBrandingConfig = false" class="text-gray-400 hover:text-red-500 p-2 min-h-[44px]"><i class="fa-solid fa-circle-xmark text-3xl"></i></button>
      </div>

      <div class="space-y-4">
        <!-- Logo -->
        <div>
          <label class="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Logo</label>
          <div class="flex items-center gap-4">
            <div class="w-16 h-16 rounded-2xl border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden bg-gray-50">
              <img v-if="configStore.branding.logo" :src="configStore.branding.logo" class="w-full h-full object-contain">
              <i v-else class="fa-solid fa-image text-2xl text-gray-300"></i>
            </div>
            <button @click="logoInput?.click()" class="px-4 py-2 bg-blue-100 text-blue-600 rounded-xl font-bold text-xs hover:bg-blue-200 active:scale-95 min-h-[44px] active-effect">Upload Logo</button>
            <input type="file" ref="logoInput" @change="configStore.handleLogoUpload" class="hidden" accept="image/*">
          </div>
        </div>

        <!-- Brand Color -->
        <div>
          <label class="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Màu chủ đạo</label>
          <div class="flex items-center gap-4">
            <input type="color" v-model="configStore.branding.color" class="w-12 h-12 rounded-xl border-2 border-gray-200 cursor-pointer">
            <div class="flex flex-wrap gap-2">
              <button v-for="c in ['#eab308','#ef4444','#3b82f6','#10b981','#8b5cf6','#f97316','#ec4899','#1e293b']" :key="c"
                @click="configStore.branding.color = c"
                class="w-8 h-8 rounded-full shadow-md border-2 transition-transform active:scale-90"
                :class="configStore.branding.color === c ? 'border-slate-800 scale-110' : 'border-white'"
                :style="{ backgroundColor: c }"></button>
            </div>
          </div>
        </div>

        <button @click="configStore.saveBranding()" class="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-sm uppercase shadow-xl hover:bg-blue-700 active:scale-95 min-h-[50px] active-effect"><i class="fa-solid fa-floppy-disk mr-2"></i> LƯU GIAO DIỆN</button>
      </div>
    </div>
  </div>
</template>
