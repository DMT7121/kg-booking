<script setup lang="ts">
import { useUIStore } from '@/stores/useUIStore'
import { useAppStore } from '@/stores/useAppStore'
import { useFormStore } from '@/stores/useFormStore'

const ui = useUIStore()
const appStore = useAppStore()
const formStore = useFormStore()

function selectStaff(staff: { name: string; phone: string }) {
  formStore.staff.name = staff.name
  formStore.staff.phone = staff.phone
}
</script>

<template>
  <div v-if="ui.showStaffConfig" class="fixed inset-0 bg-black/60 z-50 flex justify-center items-center p-4 backdrop-blur-sm" @click.self="ui.showStaffConfig = false">
    <div class="bg-white rounded-3xl shadow-2xl p-6 max-w-md w-full border-t-8 border-orange-500 max-h-[85vh] overflow-y-auto custom-scrollbar">
      <div class="flex justify-between items-center mb-6">
        <h3 class="text-xl font-black text-slate-800 uppercase tracking-tighter"><i class="fa-solid fa-users-gear text-orange-500 mr-2"></i>Nhân Viên</h3>
        <button @click="ui.showStaffConfig = false" class="text-gray-400 hover:text-red-500 p-2 min-h-[44px]"><i class="fa-solid fa-circle-xmark text-3xl"></i></button>
      </div>

      <!-- Existing Staff -->
      <div class="space-y-2 mb-6">
        <div v-for="(s, idx) in appStore.staffList" :key="idx" class="flex items-center justify-between p-3 bg-gray-50 rounded-2xl border border-gray-100 hover:bg-blue-50 transition-colors">
          <button @click="selectStaff(s)" class="flex-grow text-left flex items-center gap-3 min-h-[44px]">
            <i class="fa-solid fa-user-check text-lg" :class="formStore.staff.name === s.name ? 'text-blue-600' : 'text-gray-300'"></i>
            <div>
              <div class="font-black text-sm text-slate-700">{{ s.name }}</div>
              <div class="text-[10px] font-mono text-gray-400">{{ s.phone }}</div>
            </div>
          </button>
          <button @click="appStore.removeStaff(idx)" class="text-red-400 hover:text-red-600 p-2 min-h-[44px] min-w-[44px]"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>

      <!-- Add -->
      <div class="flex gap-2">
        <input v-model="appStore.newStaff.name" placeholder="Họ tên" class="flex-1 p-3 rounded-xl border-2 border-gray-200 font-bold text-sm">
        <input v-model="appStore.newStaff.phone" placeholder="SĐT" class="w-32 p-3 rounded-xl border-2 border-gray-200 font-bold text-sm">
        <button @click="appStore.addStaff()" class="px-4 py-3 bg-orange-500 text-white rounded-xl font-black text-xs uppercase hover:bg-orange-600 active:scale-95 min-h-[44px] active-effect"><i class="fa-solid fa-plus"></i></button>
      </div>
    </div>
  </div>
</template>
