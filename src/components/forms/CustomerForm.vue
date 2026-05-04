<script setup lang="ts">
import { ref, computed } from 'vue'
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
  <div class="bg-white rounded-2xl shadow-[0_2px_10px_rgba(0,0,0,0.04)] border border-slate-100 p-5 space-y-5">
    <!-- Header -->
    <div class="flex items-center gap-2 mb-2">
      <i class="fa-solid fa-user text-blue-600 text-lg"></i>
      <h3 class="font-black text-slate-800 text-[11px] uppercase tracking-widest">Thông tin khách hàng</h3>
      <div v-if="formStore.customer.phone && crmStatus" :class="['crm-badge', crmStatus === 'VIP' ? 'crm-vip' : 'crm-new']">
        <i class="fa-solid" :class="crmStatus === 'VIP' ? 'fa-crown' : 'fa-seedling'"></i> {{ crmStatus }}
      </div>
    </div>

    <!-- Row 1: Name & Phone -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="space-y-1.5">
        <label class="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">Người đặt <span class="text-red-500">*</span></label>
        <div class="relative">
          <i class="fa-regular fa-user absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
          <input v-model="formStore.customer.name" @focus="handleInputFocus" @blur="handleInputBlur" class="w-full border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm font-semibold text-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all" placeholder="Tên khách">
        </div>
      </div>
      <div class="space-y-1.5">
        <label class="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">SĐT / Zalo <span class="text-red-500">*</span></label>
        <div class="relative">
          <i class="fa-solid fa-phone absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
          <input v-model="formStore.customer.phone" @focus="handleInputFocus" @blur="(e) => { handleInputBlur(); checkCRM(); }" class="w-full border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm font-semibold text-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all" placeholder="09xxxxxxx">
        </div>
      </div>
    </div>

    <!-- Row 2: Date, Time, Pax -->
    <div class="grid grid-cols-3 gap-3 md:gap-4">
      <div class="space-y-1.5">
        <label class="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">Ngày <span class="text-red-500">*</span></label>
        <div class="relative">
          <i class="fa-regular fa-calendar absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
          <input v-model="formStore.customer.date" @focus="handleInputFocus" @blur="(e) => { handleInputBlur(); formatDate(); }" class="w-full border border-slate-200 rounded-xl pl-9 pr-2 py-3 text-sm font-semibold text-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all" placeholder="dd/mm/yyyy">
        </div>
      </div>
      <div class="space-y-1.5">
        <label class="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">Giờ <span class="text-red-500">*</span></label>
        <div class="relative">
          <i class="fa-regular fa-clock absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
          <input v-model="formStore.customer.time" @focus="handleInputFocus" @blur="handleInputBlur" class="w-full border border-slate-200 rounded-xl pl-9 pr-2 py-3 text-sm font-semibold text-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all" placeholder="18:30">
        </div>
      </div>
      <div class="space-y-1.5">
        <label class="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">Khách <span class="text-red-500">*</span></label>
        <div class="relative">
          <i class="fa-solid fa-user-group absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
          <input v-model="formStore.customer.pax" @focus="handleInputFocus" @blur="handleInputBlur" class="w-full border border-slate-200 rounded-xl pl-9 pr-2 py-3 text-sm font-semibold text-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all" placeholder="SL">
        </div>
      </div>
    </div>

    <!-- Row 3: Type & Table -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="space-y-1.5">
        <label class="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">Loại tiệc <span class="text-red-500">*</span></label>
        <div class="relative">
          <i class="fa-solid absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" :class="selectedIcon"></i>
          <select v-model="formStore.customer.type" class="w-full border border-slate-200 rounded-xl pl-10 pr-10 py-3 text-sm font-semibold text-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all appearance-none bg-white">
            <option v-for="pt in PARTY_TYPES" :key="pt.name" :value="pt.name">{{ pt.name }}</option>
          </select>
          <i class="fa-solid fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"></i>
        </div>
      </div>
      <div class="space-y-1.5">
        <label class="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">Khu / Bàn <span class="text-red-500">*</span></label>
        <div class="relative">
          <i class="fa-solid fa-map-location-dot absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
          <input v-model="formStore.customer.tables" @focus="handleInputFocus" @blur="handleInputBlur" class="w-full border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm font-semibold text-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all bg-white" placeholder="Nhập hoặc AI tự điền (VD: A1, B2)">
        </div>
      </div>
    </div>

    <!-- Notes -->
    <div class="space-y-1.5">
      <label class="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">Ghi chú yêu cầu</label>
      <div class="relative">
        <i class="fa-solid fa-pen absolute left-4 top-3.5 text-slate-400"></i>
        <textarea v-model="formStore.customer.note" @focus="handleInputFocus" @blur="handleInputBlur" class="w-full border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm font-semibold text-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all resize-none" rows="2" placeholder="VD: Trang trí sinh nhật, không lấy đá..."></textarea>
      </div>
    </div>
  </div>
</template>
