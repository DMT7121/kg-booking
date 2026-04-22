<script setup lang="ts">
import { computed } from 'vue'
import { useUIStore } from '@/stores/useUIStore'
import { useFormStore } from '@/stores/useFormStore'
import { useForm } from '@/composables/useForm'
import { PARTY_TYPES } from '@/utils/constants'

const ui = useUIStore()
const formStore = useFormStore()
const { handleInputFocus, handleInputBlur, formatDate, checkCRM, crmStatus } = useForm()

const selectedIcon = computed(() => {
  const found = PARTY_TYPES.find(p => p.name === formStore.customer.type)
  return found?.icon || 'fa-utensils'
})
</script>

<template>
  <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
    <div class="flex items-center gap-2 border-b border-gray-100 pb-2 mb-1">
      <i class="fa-solid fa-user-tag text-blue-500"></i>
      <h3 class="font-black text-slate-800 text-[10px] uppercase tracking-widest">Thông tin khách hàng</h3>
      <div v-if="formStore.customer.phone && crmStatus" :class="['crm-badge', crmStatus === 'VIP' ? 'crm-vip' : 'crm-new']">
        <i class="fa-solid" :class="crmStatus === 'VIP' ? 'fa-crown' : 'fa-seedling'"></i> {{ crmStatus }}
      </div>
    </div>
    <div class="grid grid-cols-2 gap-4">
      <div class="space-y-1"><label class="text-[9px] font-black text-slate-400 uppercase ml-1 tracking-wider">Người đặt <span class="text-red-500">*</span></label><input v-model="formStore.customer.name" @focus="handleInputFocus" @blur="handleInputBlur" class="w-full border-2 border-slate-100 rounded-xl px-4 py-3 text-base md:text-sm font-black focus:border-blue-500 outline-none transition-colors" placeholder="Tên khách"></div>
      <div class="space-y-1"><label class="text-[9px] font-black text-slate-400 uppercase ml-1 tracking-wider">SĐT/Zalo <span class="text-red-500">*</span></label><input v-model="formStore.customer.phone" @focus="handleInputFocus" @blur="(e) => { handleInputBlur(); checkCRM(); }" class="w-full border-2 border-slate-100 rounded-xl px-4 py-3 text-base md:text-sm font-black focus:border-blue-500 outline-none transition-colors" placeholder="09xxxxxxx"></div>
    </div>
    <div class="grid grid-cols-3 gap-3">
      <div class="space-y-1 text-center"><label class="text-[9px] font-black text-slate-400 uppercase tracking-wider">Ngày <span class="text-red-500">*</span></label><input v-model="formStore.customer.date" @focus="handleInputFocus" @blur="(e) => { handleInputBlur(); formatDate(); }" class="w-full border-2 border-slate-100 rounded-xl px-2 py-3 text-base md:text-sm text-center font-black focus:border-blue-500 outline-none transition-colors" placeholder="dd/mm/yyyy"></div>
      <div class="space-y-1 text-center"><label class="text-[9px] font-black text-slate-400 uppercase tracking-wider">Giờ <span class="text-red-500">*</span></label><input v-model="formStore.customer.time" @focus="handleInputFocus" @blur="handleInputBlur" class="w-full border-2 border-slate-100 rounded-xl px-2 py-3 text-base md:text-sm text-center font-black focus:border-blue-500 outline-none transition-colors" placeholder="18:30"></div>
      <div class="space-y-1 text-center"><label class="text-[9px] font-black text-slate-400 uppercase tracking-wider">Khách <span class="text-red-500">*</span></label><input v-model="formStore.customer.pax" @focus="handleInputFocus" @blur="handleInputBlur" class="w-full border-2 border-slate-100 rounded-xl px-2 py-3 text-base md:text-sm text-center font-black focus:border-blue-500 outline-none transition-colors" placeholder="SL"></div>
    </div>
    <div class="grid grid-cols-2 gap-4">
      <div class="space-y-1">
        <label class="text-[9px] font-black text-slate-400 uppercase ml-1 tracking-wider">Loại tiệc <span class="text-red-500">*</span></label>
        <div class="relative">
          <i class="fa-solid absolute left-3 top-1/2 -translate-y-1/2 text-blue-500 text-sm pointer-events-none" :class="selectedIcon"></i>
          <select v-model="formStore.customer.type" class="w-full border-2 border-slate-100 rounded-xl pl-9 pr-4 py-3 text-base md:text-sm font-black text-blue-600 focus:border-blue-500 outline-none transition-colors appearance-none bg-white cursor-pointer min-h-[44px]">
            <option v-for="pt in PARTY_TYPES" :key="pt.name" :value="pt.name">{{ pt.name }}</option>
          </select>
          <i class="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 text-xs pointer-events-none"></i>
        </div>
      </div>
      <div class="space-y-1">
        <label class="text-[9px] font-black text-slate-400 uppercase ml-1 tracking-wider">Khu / Bàn <span class="text-red-500">*</span></label>
        <div class="flex gap-2 items-center">
          <!-- Zone Pills -->
          <div class="flex gap-1">
            <button 
              v-for="z in ['A','B','C','D','E']" :key="z"
              @click="ui.tempTable.zone = z"
              :class="[
                'w-9 h-10 rounded-lg font-black text-sm transition-all duration-200 border-2',
                ui.tempTable.zone === z 
                  ? 'bg-blue-500 text-white border-blue-500 shadow-md shadow-blue-200 scale-105' 
                  : 'bg-slate-50 text-slate-400 border-slate-100 hover:border-blue-200 hover:text-blue-400'
              ]"
            >{{ z }}</button>
          </div>
          <!-- Table Number Input -->
          <input 
            v-model="ui.tempTable.number" 
            @focus="handleInputFocus" 
            @blur="handleInputBlur" 
            class="flex-1 border-2 border-slate-100 rounded-xl px-3 py-2.5 text-base md:text-sm font-black text-center bg-yellow-50 focus:bg-white focus:border-blue-500 outline-none transition-all min-w-0" 
            placeholder="1,2,3..."
          >
        </div>
      </div>
    </div>
    <div class="space-y-1"><label class="text-[9px] font-black text-slate-400 uppercase ml-1 tracking-wider">Ghi chú yêu cầu</label><textarea v-model="formStore.customer.note" @focus="handleInputFocus" @blur="handleInputBlur" class="w-full border-2 border-slate-100 rounded-xl px-4 py-3 text-base md:text-sm font-medium resize-none focus:border-blue-500 outline-none transition-colors" rows="2" placeholder="VD: Trang trí sinh nhật, không lấy đá..."></textarea></div>
  </div>
</template>
