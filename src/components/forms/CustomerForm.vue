<script setup lang="ts">
import { ref, computed } from 'vue'
import { useUIStore } from '@/stores/useUIStore'
import { useFormStore } from '@/stores/useFormStore'
import { useForm } from '@/composables/useForm'
import { PARTY_TYPES } from '@/utils/constants'

import { useAppStore } from '@/stores/useAppStore'
import { cleanPhoneNumber } from '@/utils'

const ui = useUIStore()
const formStore = useFormStore()
const appStore = useAppStore()
const { handleInputFocus, handleInputBlur, formatDate, checkCRM, crmStatus } = useForm()

const selectedIcon = computed(() => {
  const found = PARTY_TYPES.find(p => p.name === formStore.customer.type)
  return found?.icon || 'fa-utensils'
})

const hasSoftWarning = computed(() => {
  const meta = formStore.aiMetadata
  const score = meta && typeof meta.confidence_score === 'number' ? meta.confidence_score : 1.0
  return score < 0.80 || (formStore.warnings && formStore.warnings.length > 0)
})

const customerCrmProfile = computed(() => {
  const phone = formStore.customer.phone
  if (!phone) return null
  const cleaned = cleanPhoneNumber(phone)
  const orders = appStore.historyList.filter(h => cleanPhoneNumber(h.parsedCustomer.phone) === cleaned)
  if (orders.length === 0) return null

  const vipStatus = appStore.getCrmStatus(phone)
  const totalVisits = orders.length
  
  const sorted = [...orders].sort((a, b) => {
    const dateA = a.parsedCustomer.date ? new Date(a.parsedCustomer.date.split('/').reverse().join('-')).getTime() : 0
    const dateB = b.parsedCustomer.date ? new Date(b.parsedCustomer.date.split('/').reverse().join('-')).getTime() : 0
    return dateB - dateA
  })
  
  const lastOrder = sorted[0]
  const noShowCount = orders.filter(o => {
    const note = (o.parsedCustomer.note || '').toLowerCase()
    return note.includes('huy') || note.includes('hủy') || note.includes('cancel') || note.includes('no show') || note.includes('noshow') || note.includes('bom')
  }).length

  let greeting = `Chào anh/chị ${lastOrder.parsedCustomer.name || 'Khách'}, rất vui được đón tiếp anh/chị quay lại Kings Grill!`
  let promo = ''
  if (vipStatus === 'VIP') {
    greeting = `Chào mừng Thượng khách VIP ${lastOrder.parsedCustomer.name || 'Khách'} trở lại! Đặc biệt chuẩn bị bàn tiếp đón tốt nhất.`
    promo = 'Ưu đãi VIP: Giảm 10% tổng hóa đơn & Tặng 1 đĩa trái cây decor.'
  } else if (vipStatus === 'Khách quen') {
    greeting = `Chào mừng anh/chị ${lastOrder.parsedCustomer.name || 'Khách'} quay lại! Rất vui vì anh/chị tiếp tục ủng hộ nhà hàng.`
    promo = 'Ưu đãi Khách quen: Tặng nước ngọt/bia miễn phí cho cả bàn.'
  }

  return {
    name: lastOrder.parsedCustomer.name,
    vipStatus,
    totalVisits,
    lastDate: lastOrder.parsedCustomer.date,
    noShowCount,
    greeting,
    promo
  }
})

function getTodayStr() {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function getTomorrowStr() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function getDayAfterTomorrowStr() {
  const d = new Date()
  d.setDate(d.getDate() + 2)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}
</script>

<template>
  <div class="bg-white rounded-2xl shadow-[0_2px_10px_rgba(0,0,0,0.04)] border p-5 space-y-5 transition-all duration-300"
       :class="hasSoftWarning ? 'border-amber-300 bg-amber-50/10' : 'border-slate-100'">
    <!-- Header -->
    <div class="flex items-center gap-2 mb-2">
      <i class="fa-solid fa-user text-blue-600 text-lg"></i>
      <h3 class="font-black text-slate-800 text-[11px] uppercase tracking-widest">Thông tin khách hàng</h3>
      <div v-if="formStore.customer.phone && crmStatus" :class="['crm-badge', crmStatus === 'VIP' ? 'crm-vip' : 'crm-new']">
        <i class="fa-solid" :class="crmStatus === 'VIP' ? 'fa-crown' : 'fa-seedling'"></i> {{ crmStatus }}
      </div>
    </div>

    <!-- Row 1: Name -->
    <div class="space-y-1.5 w-full">
      <label class="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1 flex items-center">
        Người đặt <span class="text-red-500 ml-0.5">*</span>
        <span v-if="formStore.aiMetadata?.confidences?.name?.needs_review" class="text-amber-600 text-[9px] font-bold bg-amber-100/60 px-1.5 py-0.5 rounded ml-2 animate-pulse"><i class="fa-solid fa-triangle-exclamation"></i> Cần kiểm tra</span>
      </label>
      <div class="relative">
        <i class="fa-regular fa-user absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
        <input v-model="formStore.customer.name" @focus="handleInputFocus" @blur="handleInputBlur" class="w-full border rounded-xl pl-10 pr-4 py-3 text-[16px] font-semibold text-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all" :class="formStore.aiMetadata?.confidences?.name?.needs_review ? 'border-amber-400 bg-amber-50/10 focus:border-amber-500 focus:ring-amber-100' : 'border-slate-200'" placeholder="Nhập tên khách hàng">
      </div>
    </div>

    <!-- Row 2: Phone -->
    <div class="space-y-1.5 w-full">
      <label class="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1 flex items-center">
        SĐT / Zalo <span class="text-red-500 ml-0.5">*</span>
        <span v-if="formStore.aiMetadata?.confidences?.phone?.needs_review" class="text-amber-600 text-[9px] font-bold bg-amber-100/60 px-1.5 py-0.5 rounded ml-2 animate-pulse"><i class="fa-solid fa-triangle-exclamation"></i> Cần kiểm tra</span>
      </label>
      <div class="relative">
        <i class="fa-solid fa-phone absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
        <input v-model="formStore.customer.phone" inputmode="tel" @focus="handleInputFocus" @blur="(e) => { handleInputBlur(); checkCRM(); }" class="w-full border rounded-xl pl-10 pr-4 py-3 text-[16px] font-semibold text-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all" :class="formStore.aiMetadata?.confidences?.phone?.needs_review ? 'border-amber-400 bg-amber-50/10 focus:border-amber-500 focus:ring-amber-100' : 'border-slate-200'" placeholder="09xxxxxxx">
      </div>
    </div>

    <!-- CRM Profile Panel (Show when phone has history) -->
    <div v-if="customerCrmProfile" class="bg-gradient-to-br from-blue-50 to-indigo-50/50 border border-blue-100 rounded-xl p-3.5 space-y-2 text-xs transition-all duration-300">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span :class="['px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider', 
            customerCrmProfile.vipStatus === 'VIP' ? 'bg-amber-100 text-amber-800 border border-amber-200' : 
            customerCrmProfile.vipStatus === 'Khách quen' ? 'bg-blue-100 text-blue-800 border border-blue-200' : 'bg-slate-100 text-slate-800 border border-slate-200']">
            {{ customerCrmProfile.vipStatus }}
          </span>
          <span class="font-black text-slate-700">Lịch sử: <span class="text-blue-700 font-extrabold">{{ customerCrmProfile.totalVisits }} lần</span></span>
          <span v-if="customerCrmProfile.noShowCount > 0" class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-50 text-rose-700 border border-rose-100 flex items-center gap-1 animate-pulse">
            <i class="fa-solid fa-triangle-exclamation"></i> Hủy/No-show: {{ customerCrmProfile.noShowCount }} lần
          </span>
        </div>
        <span class="text-[10px] font-bold text-slate-400">Gần nhất: {{ customerCrmProfile.lastDate }}</span>
      </div>

      <!-- Quick Suggestion / Greeting -->
      <div class="bg-white rounded-lg p-2.5 border border-slate-100 space-y-1">
        <div class="text-[10px] font-black text-blue-800 uppercase tracking-wider flex items-center gap-1">
          <i class="fa-regular fa-comment-dots"></i> Gợi ý câu chào:
        </div>
        <p class="text-slate-600 font-semibold italic text-[11px] leading-relaxed">
          "{{ customerCrmProfile.greeting }}"
        </p>
        <div v-if="customerCrmProfile.promo" class="mt-1 text-[10px] font-bold text-emerald-600 flex items-center gap-1">
          <i class="fa-solid fa-gift"></i> {{ customerCrmProfile.promo }}
        </div>
      </div>
    </div>

    <!-- Row 3: Date & Time -->
    <div class="flex gap-4 w-full">
      <!-- Ngày (60%) -->
      <div class="w-[60%] space-y-1.5 flex flex-col">
        <label class="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1 flex items-center">
          Ngày <span class="text-red-500 ml-0.5">*</span>
          <span v-if="formStore.aiMetadata?.confidences?.date?.needs_review" class="text-amber-600 text-[9px] font-bold bg-amber-100/60 px-1.5 py-0.5 rounded ml-2 animate-pulse"><i class="fa-solid fa-triangle-exclamation"></i> Cần kiểm tra</span>
        </label>
        <div class="relative">
          <i class="fa-regular fa-calendar absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
          <input v-model="formStore.customer.date" @focus="handleInputFocus" @blur="(e) => { handleInputBlur(); formatDate(); }" class="w-full border rounded-xl pl-9 pr-2 py-3 text-[16px] font-semibold text-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all" :class="formStore.aiMetadata?.confidences?.date?.needs_review ? 'border-amber-400 bg-amber-50/10 focus:border-amber-500 focus:ring-amber-100' : 'border-slate-200'" placeholder="dd/mm/yyyy">
        </div>
        <!-- Quick Chips for Date -->
        <div class="flex gap-1 mt-1.5 flex-wrap">
          <button @click.prevent="formStore.customer.date = getTodayStr()" class="px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider rounded bg-slate-50 border border-slate-200 text-slate-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 active:scale-95 transition-all">Hôm nay</button>
          <button @click.prevent="formStore.customer.date = getTomorrowStr()" class="px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider rounded bg-slate-50 border border-slate-200 text-slate-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 active:scale-95 transition-all">Mai</button>
        </div>
      </div>
      <!-- Giờ (40%) -->
      <div class="w-[40%] space-y-1.5 flex flex-col">
        <label class="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1 flex items-center">
          Giờ <span class="text-red-500 ml-0.5">*</span>
          <span v-if="formStore.aiMetadata?.confidences?.time?.needs_review" class="text-amber-600 text-[9px] font-bold bg-amber-100/60 px-1.5 py-0.5 rounded ml-2 animate-pulse"><i class="fa-solid fa-triangle-exclamation"></i> Cần kiểm tra</span>
        </label>
        <div class="relative">
          <i class="fa-regular fa-clock absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
          <input v-model="formStore.customer.time" @focus="handleInputFocus" @blur="handleInputBlur" class="w-full border rounded-xl pl-9 pr-2 py-3 text-[16px] font-semibold text-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all" :class="formStore.aiMetadata?.confidences?.time?.needs_review ? 'border-amber-400 bg-amber-50/10 focus:border-amber-500 focus:ring-amber-100' : 'border-slate-200'" placeholder="18:30">
        </div>
        <!-- Quick Chips for Time -->
        <div class="flex gap-1 mt-1.5 flex-wrap">
          <button @click.prevent="formStore.customer.time = '11:30'" class="px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider rounded bg-slate-50 border border-slate-200 text-slate-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 active:scale-95 transition-all">11:30</button>
          <button @click.prevent="formStore.customer.time = '18:00'" class="px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider rounded bg-slate-50 border border-slate-200 text-slate-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 active:scale-95 transition-all">18:00</button>
          <button @click.prevent="formStore.customer.time = '19:00'" class="px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider rounded bg-slate-50 border border-slate-200 text-slate-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 active:scale-95 transition-all">19:00</button>
        </div>
      </div>
    </div>

    <!-- Row 4: Pax & Tables -->
    <div class="flex gap-4 w-full">
      <!-- Số khách (45%) -->
      <div class="w-[45%] space-y-1.5 flex flex-col">
        <label class="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1 flex items-center">
          Khách <span class="text-red-500 ml-0.5">*</span>
          <span v-if="formStore.aiMetadata?.confidences?.pax?.needs_review" class="text-amber-600 text-[9px] font-bold bg-amber-100/60 px-1.5 py-0.5 rounded ml-2 animate-pulse"><i class="fa-solid fa-triangle-exclamation"></i> Cần kiểm tra</span>
        </label>
        <div class="relative">
          <i class="fa-solid fa-user-group absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
          <input v-model="formStore.customer.pax" inputmode="numeric" @focus="handleInputFocus" @blur="handleInputBlur" class="w-full border rounded-xl pl-9 pr-2 py-3 text-[16px] font-semibold text-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all" :class="formStore.aiMetadata?.confidences?.pax?.needs_review ? 'border-amber-400 bg-amber-50/10 focus:border-amber-500 focus:ring-amber-100' : 'border-slate-200'" placeholder="SL">
        </div>
        <!-- Quick Chips for Pax -->
        <div class="flex gap-1 mt-1.5 flex-wrap">
          <button @click.prevent="formStore.customer.pax = '2'" class="px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider rounded bg-slate-50 border border-slate-200 text-slate-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 active:scale-95 transition-all">2</button>
          <button @click.prevent="formStore.customer.pax = '4'" class="px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider rounded bg-slate-50 border border-slate-200 text-slate-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 active:scale-95 transition-all">4</button>
          <button @click.prevent="formStore.customer.pax = '10'" class="px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider rounded bg-slate-50 border border-slate-200 text-slate-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 active:scale-95 transition-all">10</button>
        </div>
      </div>
      <!-- Khu / Bàn (55%) -->
      <div class="w-[55%] space-y-1.5">
        <label class="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1 flex items-center">
          Khu / Bàn <span class="text-red-500 ml-0.5">*</span>
          <span v-if="formStore.aiMetadata?.confidences?.tables?.needs_review" class="text-amber-600 text-[9px] font-bold bg-amber-100/60 px-1.5 py-0.5 rounded ml-2 animate-pulse"><i class="fa-solid fa-triangle-exclamation"></i> Cần kiểm tra</span>
        </label>
        <div class="relative flex items-center gap-1.5">
          <div class="relative flex-1">
            <i class="fa-solid fa-map-location-dot absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
            <input v-model="formStore.customer.tables" @focus="handleInputFocus" @blur="handleInputBlur" class="w-full border rounded-xl pl-9 pr-2 py-3 text-[16px] font-semibold text-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all bg-white" :class="formStore.aiMetadata?.confidences?.tables?.needs_review ? 'border-amber-400 bg-amber-50/10 focus:border-amber-500 focus:ring-amber-100' : 'border-slate-200'" placeholder="VD: A1, B2, Sảnh...">
          </div>
          <button @click.prevent="ui.showFloorPlan = true" class="w-10 h-10 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-xl border border-blue-100 flex items-center justify-center transition-colors active:scale-95 shrink-0" title="Mở sơ đồ bàn">
            <i class="fa-solid fa-border-all text-lg"></i>
          </button>
        </div>
      </div>
    </div>

    <!-- Row 5: Party Type -->
    <div class="space-y-1.5 w-full">
      <label class="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">Loại tiệc <span class="text-red-500">*</span></label>
      <div class="relative">
        <i class="fa-solid absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" :class="selectedIcon"></i>
        <select v-model="formStore.customer.type" class="w-full border border-slate-200 rounded-xl pl-10 pr-10 py-3 text-[16px] font-semibold text-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all appearance-none bg-white">
          <option v-for="pt in PARTY_TYPES" :key="pt.name" :value="pt.name">{{ pt.name }}</option>
        </select>
        <i class="fa-solid fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"></i>
      </div>
      <!-- Quick Chips for Party Type -->
      <div class="flex gap-1 mt-1.5 flex-wrap">
        <button @click.prevent="formStore.customer.type = 'Ăn thường'" class="px-2 py-0.5 text-[8px] font-black uppercase tracking-wider rounded bg-slate-50 border border-slate-200 text-slate-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 active:scale-95 transition-all">Ăn thường</button>
        <button @click.prevent="formStore.customer.type = 'Sinh nhật'" class="px-2 py-0.5 text-[8px] font-black uppercase tracking-wider rounded bg-slate-50 border border-slate-200 text-slate-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 active:scale-95 transition-all">Sinh nhật</button>
        <button @click.prevent="formStore.customer.type = 'Liên hoan'" class="px-2 py-0.5 text-[8px] font-black uppercase tracking-wider rounded bg-slate-50 border border-slate-200 text-slate-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 active:scale-95 transition-all">Liên hoan</button>
        <button @click.prevent="formStore.customer.type = 'Công ty'" class="px-2 py-0.5 text-[8px] font-black uppercase tracking-wider rounded bg-slate-50 border border-slate-200 text-slate-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 active:scale-95 transition-all">Công ty</button>
        <button @click.prevent="formStore.customer.type = 'Gia đình'" class="px-2 py-0.5 text-[8px] font-black uppercase tracking-wider rounded bg-slate-50 border border-slate-200 text-slate-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 active:scale-95 transition-all">Gia đình</button>
        <button @click.prevent="formStore.customer.type = 'Khác'" class="px-2 py-0.5 text-[8px] font-black uppercase tracking-wider rounded bg-slate-50 border border-slate-200 text-slate-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 active:scale-95 transition-all">Khác</button>
      </div>
    </div>

    <!-- Notes -->
    <div class="space-y-1.5 w-full">
      <label class="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">Ghi chú yêu cầu</label>
      <div class="relative">
        <i class="fa-solid fa-pen absolute left-4 top-3.5 text-slate-400"></i>
        <textarea v-model="formStore.customer.note" @focus="handleInputFocus" @blur="handleInputBlur" class="w-full border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-[16px] font-semibold text-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all resize-none" rows="2" placeholder="VD: Trang trí sinh nhật, không lấy đá..."></textarea>
      </div>
    </div>
  </div>
</template>
