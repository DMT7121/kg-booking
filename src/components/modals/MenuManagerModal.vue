<script setup lang="ts">
import { useUIStore } from '@/stores/useUIStore'
import { useAppStore } from '@/stores/useAppStore'
import { useForm } from '@/composables/useForm'

const ui = useUIStore()
const appStore = useAppStore()
const { fillSampleMenu, prepareUpdate } = useForm()
</script>

<template>
  <div v-if="ui.showMenuManager" class="fixed inset-0 bg-[#0D1658]/80 z-[12000] flex justify-center items-center p-4 backdrop-blur-md" @click.self="ui.showMenuManager = false">
    <div class="bg-white rounded-3xl shadow-2xl p-6 md:p-8 max-w-lg w-[95%] md:w-full flex flex-col relative overflow-hidden border border-white/20 max-h-[90vh]">
      
      <!-- Header BG Decoration -->
      <div class="absolute top-0 left-0 right-0 h-24 bg-gradient-to-r from-blue-600 to-[#1A237E] rounded-t-3xl opacity-10"></div>
      
      <!-- Header -->
      <div class="flex justify-between items-center mb-6 relative z-10">
        <h3 class="text-2xl font-black text-[#1A237E] uppercase tracking-tighter flex items-center gap-3">
          <div class="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
            <i class="fa-solid fa-utensils"></i>
          </div>
          Quản Lý Menu
        </h3>
        <button @click="ui.showMenuManager = false" class="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl hover:bg-red-50 hover:text-red-500 transition-all flex items-center justify-center shrink-0 shadow-sm border border-slate-100">
          <i class="fa-solid fa-xmark text-xl"></i>
        </button>
      </div>

      <!-- Tabs -->
      <div class="flex bg-slate-100 p-1.5 rounded-2xl mb-6 relative z-10">
        <button @click="ui.menuTab = 'select'" :class="['flex-1 py-3 rounded-xl font-black text-xs uppercase transition-all', ui.menuTab === 'select' ? 'bg-white text-[#1A237E] shadow-sm' : 'text-slate-500 hover:text-slate-700']">CHỌN MENU</button>
        <button @click="ui.menuTab = 'upload'; ui.isUpdateMode = false" :class="['flex-1 py-3 rounded-xl font-black text-xs uppercase transition-all', ui.menuTab === 'upload' ? 'bg-white text-[#1A237E] shadow-sm' : 'text-slate-500 hover:text-slate-700']">TẠO / CẬP NHẬT</button>
      </div>

      <div class="overflow-y-auto custom-scrollbar pr-1 relative z-10 flex-grow">
        <!-- Select Tab -->
        <div v-if="ui.menuTab === 'select'" class="space-y-3 pb-4">
          <div v-for="sheet in appStore.menuSheets" :key="sheet"
            :class="['p-4 rounded-2xl border-2 flex justify-between items-center transition-all cursor-pointer group', sheet === appStore.activeSheet ? 'border-[#1A237E] bg-blue-50/50 shadow-md' : 'border-slate-100 hover:border-blue-200 hover:bg-slate-50']"
            @click="appStore.switchMenu(sheet)">
            <div class="flex items-center gap-3">
              <i :class="['fa-solid text-xl transition-all', sheet === appStore.activeSheet ? 'fa-circle-check text-[#1A237E]' : 'fa-circle text-slate-200 group-hover:text-blue-300']"></i>
              <span class="font-black text-sm" :class="sheet === appStore.activeSheet ? 'text-[#1A237E]' : 'text-slate-700'">{{ sheet }}</span>
            </div>
            <button @click.stop="prepareUpdate(sheet)" class="w-10 h-10 bg-white border border-slate-200 text-slate-500 rounded-xl hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all flex items-center justify-center active:scale-95 shadow-sm">
              <i class="fa-solid fa-pen"></i>
            </button>
          </div>
          <div v-if="appStore.menuSheets.length === 0" class="text-center py-10 bg-slate-50 rounded-2xl border border-slate-100">
            <i class="fa-solid fa-folder-open text-4xl mb-3 text-slate-300"></i>
            <p class="font-black text-slate-500 text-xs uppercase tracking-widest">Chưa có menu nào</p>
          </div>
        </div>

        <!-- Upload / Update Tab -->
        <div v-if="ui.menuTab === 'upload'" class="space-y-5 pb-4">
          <div class="space-y-2">
            <label class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Tên Menu</label>
            <input v-model="appStore.newMenuName" class="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-black text-slate-800 text-sm focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50 outline-none transition-all" :placeholder="ui.isUpdateMode ? 'Tên sheet đang sửa' : 'VD: Menu Tết 2025'">
          </div>
          <div class="space-y-2">
            <div class="flex justify-between items-center">
              <label class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nội dung (Text)</label>
              <button @click="fillSampleMenu" class="text-[10px] bg-blue-50 text-blue-600 px-3 py-1 rounded-lg font-black uppercase hover:bg-blue-100 active:scale-95 transition-all">
                {{ appStore.menuList.length > 0 ? 'LẤY TỪ MENU HIỆN TẠI' : 'TẠO MẪU' }}
              </button>
            </div>
            <textarea v-model="appStore.newMenuContent" rows="12" class="w-full p-4 rounded-xl border border-slate-200 bg-slate-50 font-mono text-[13px] leading-relaxed text-slate-800 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50 outline-none transition-all resize-none custom-scrollbar" placeholder="Tên món - Giá&#10;VD:&#10;Bò nướng tảng - 250k&#10;Bia Tiger - 25k"></textarea>
          </div>
          <button @click="appStore.uploadNewMenu()" class="w-full h-14 bg-[#1A237E] text-white rounded-xl font-black text-sm uppercase shadow-lg shadow-blue-900/20 active:scale-95 transition-all flex items-center justify-center gap-2">
            <i class="fa-solid fa-cloud-arrow-up text-lg text-white/80"></i> {{ ui.isUpdateMode ? 'CẬP NHẬT MENU' : 'TẠO MENU MỚI' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
