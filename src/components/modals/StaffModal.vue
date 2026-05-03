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
  <div v-if="ui.showStaffConfig" class="fixed inset-0 bg-[#0D1658]/80 z-[12000] flex justify-center items-center p-4 backdrop-blur-md" @click.self="ui.showStaffConfig = false">
    <div class="bg-white rounded-3xl shadow-2xl p-6 md:p-8 max-w-md w-[95%] md:w-full flex flex-col relative overflow-hidden border border-white/20 max-h-[90vh]">
      
      <!-- Header BG Decoration -->
      <div class="absolute top-0 left-0 right-0 h-24 bg-gradient-to-r from-blue-600 to-[#1A237E] rounded-t-3xl opacity-10"></div>

      <div class="flex justify-between items-center mb-6 relative z-10">
        <h3 class="text-2xl font-black text-[#1A237E] uppercase tracking-tighter flex items-center gap-3">
          <div class="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center text-orange-500">
            <i class="fa-solid fa-users-gear"></i>
          </div>
          Nhân Viên
        </h3>
        <button @click="ui.showStaffConfig = false" class="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl hover:bg-red-50 hover:text-red-500 transition-all flex items-center justify-center shrink-0 shadow-sm border border-slate-100">
          <i class="fa-solid fa-xmark text-xl"></i>
        </button>
      </div>

      <div class="overflow-y-auto custom-scrollbar pr-1 relative z-10 flex-grow">
        <!-- Existing Staff -->
        <div class="space-y-3 mb-6">
          <div v-for="(s, idx) in appStore.staffList" :key="idx" 
               :class="['flex items-center justify-between p-4 rounded-2xl border transition-all cursor-pointer group', formStore.staff.name === s.name ? 'border-[#1A237E] bg-blue-50/50 shadow-md' : 'border-slate-100 bg-slate-50 hover:border-blue-200 hover:bg-white']"
               @click="selectStaff(s)">
            <div class="flex-grow flex items-center gap-4">
              <div :class="['w-10 h-10 rounded-xl flex items-center justify-center text-lg transition-colors shadow-sm', formStore.staff.name === s.name ? 'bg-[#1A237E] text-white' : 'bg-white text-slate-300 group-hover:text-blue-400 border border-slate-100']">
                <i class="fa-solid fa-user-check"></i>
              </div>
              <div>
                <div :class="['font-black text-sm uppercase', formStore.staff.name === s.name ? 'text-[#1A237E]' : 'text-slate-700']">{{ s.name }}</div>
                <div class="text-[11px] font-mono font-bold text-slate-400 tracking-wider mt-0.5">{{ s.phone }}</div>
              </div>
            </div>
            <button @click.stop="appStore.removeStaff(idx)" class="w-10 h-10 bg-white border border-rose-100 text-rose-400 rounded-xl hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-all flex items-center justify-center active:scale-95 shadow-sm opacity-50 group-hover:opacity-100">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </div>

        <!-- Add -->
        <div class="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-3">
          <label class="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Thêm Nhân Viên</label>
          <div class="flex flex-col gap-3">
            <input v-model="appStore.newStaff.name" placeholder="Họ và tên..." class="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white font-black text-slate-800 text-sm focus:border-[#1A237E] focus:ring-4 focus:ring-blue-50 outline-none transition-all uppercase placeholder-slate-300">
            <div class="flex gap-3">
              <input v-model="appStore.newStaff.phone" placeholder="Số điện thoại..." class="flex-grow px-4 py-3 rounded-xl border border-slate-200 bg-white font-mono font-bold text-slate-800 text-sm focus:border-[#1A237E] focus:ring-4 focus:ring-blue-50 outline-none transition-all placeholder-slate-300">
              <button @click="appStore.addStaff()" class="px-6 bg-[#1A237E] text-white rounded-xl font-black text-sm shadow-lg shadow-blue-900/20 active:scale-95 transition-all flex items-center justify-center">
                <i class="fa-solid fa-plus"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
