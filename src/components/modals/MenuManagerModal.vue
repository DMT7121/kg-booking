<script setup lang="ts">
import { useUIStore } from '@/stores/useUIStore'
import { useAppStore } from '@/stores/useAppStore'
import { useForm } from '@/composables/useForm'

const ui = useUIStore()
const appStore = useAppStore()
const { fillSampleMenu, prepareUpdate } = useForm()
</script>

<template>
  <div v-if="ui.showMenuManager" class="fixed inset-0 bg-black/70 z-50 flex justify-center items-start p-4 md:pt-10 backdrop-blur-sm overflow-y-auto" @click.self="ui.showMenuManager = false">
    <div class="bg-white rounded-3xl shadow-2xl p-6 max-w-lg w-full my-8 border-t-8 border-green-500 max-h-[85vh] overflow-y-auto custom-scrollbar">
      <div class="flex justify-between items-center mb-6">
        <h3 class="text-xl font-black text-slate-800 uppercase tracking-tighter"><i class="fa-solid fa-utensils text-green-500 mr-2"></i>Quản Lý Menu</h3>
        <button @click="ui.showMenuManager = false" class="text-gray-400 hover:text-red-500 p-2 min-h-[44px]"><i class="fa-solid fa-circle-xmark text-3xl"></i></button>
      </div>

      <!-- Tabs -->
      <div class="flex gap-2 mb-6">
        <button @click="ui.menuTab = 'select'" :class="['flex-1 py-3 rounded-xl font-black text-xs uppercase transition-all min-h-[44px]', ui.menuTab === 'select' ? 'bg-green-600 text-white shadow-lg' : 'bg-gray-100 text-gray-500']">Chọn Menu</button>
        <button @click="ui.menuTab = 'upload'; ui.isUpdateMode = false" :class="['flex-1 py-3 rounded-xl font-black text-xs uppercase transition-all min-h-[44px]', ui.menuTab === 'upload' ? 'bg-green-600 text-white shadow-lg' : 'bg-gray-100 text-gray-500']">Tạo / Cập nhật</button>
      </div>

      <!-- Select Tab -->
      <div v-if="ui.menuTab === 'select'" class="space-y-3">
        <div v-for="sheet in appStore.menuSheets" :key="sheet"
          :class="['p-4 rounded-2xl border-2 flex justify-between items-center transition-all cursor-pointer min-h-[56px]', sheet === appStore.activeSheet ? 'border-green-500 bg-green-50' : 'border-gray-100 hover:border-green-200']"
          @click="appStore.switchMenu(sheet)">
          <div class="flex items-center gap-3">
            <i :class="['fa-solid fa-check-circle text-xl', sheet === appStore.activeSheet ? 'text-green-500' : 'text-gray-200']"></i>
            <span class="font-black text-sm text-slate-700">{{ sheet }}</span>
          </div>
          <button @click.stop="prepareUpdate(sheet)" class="px-3 py-1 bg-blue-100 text-blue-600 rounded-lg font-bold text-[10px] uppercase hover:bg-blue-200 active:scale-95 min-h-[30px]">Sửa</button>
        </div>
        <div v-if="appStore.menuSheets.length === 0" class="text-center py-10 text-gray-400"><i class="fa-solid fa-folder-open text-4xl mb-3"></i><p class="font-bold">Chưa có menu nào</p></div>
      </div>

      <!-- Upload / Update Tab -->
      <div v-if="ui.menuTab === 'upload'" class="space-y-4">
        <div class="space-y-1">
          <label class="text-[10px] font-black text-slate-500 uppercase">Tên Menu</label>
          <input v-model="appStore.newMenuName" class="w-full p-3 rounded-xl border-2 border-gray-200 font-bold text-sm" :placeholder="ui.isUpdateMode ? 'Tên sheet đang sửa' : 'VD: Menu Tết 2025'">
        </div>
        <div class="space-y-1">
          <div class="flex justify-between items-center">
            <label class="text-[10px] font-black text-slate-500 uppercase">Nội dung (Text)</label>
            <button @click="fillSampleMenu" class="text-[9px] text-blue-500 font-bold hover:underline">{{ appStore.menuList.length > 0 ? 'Fill từ menu hiện tại' : 'Fill mẫu' }}</button>
          </div>
          <textarea v-model="appStore.newMenuContent" rows="12" class="w-full p-3 rounded-xl border-2 border-gray-200 font-mono text-xs resize-none" placeholder="Tên món - Giá&#10;VD:&#10;Bò nướng tảng - 250k&#10;Bia Tiger - 25k"></textarea>
        </div>
        <button @click="appStore.uploadNewMenu()" class="w-full py-4 bg-green-600 text-white rounded-2xl font-black text-sm uppercase shadow-xl hover:bg-green-700 active:scale-95 min-h-[50px] active-effect">
          <i class="fa-solid fa-cloud-arrow-up mr-2"></i> {{ ui.isUpdateMode ? 'CẬP NHẬT MENU' : 'TẠO MENU MỚI' }}
        </button>
      </div>
    </div>
  </div>
</template>
