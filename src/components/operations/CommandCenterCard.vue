<template>
  <div 
    class="relative rounded-3xl border transition-all duration-200 p-4 sm:p-5 bg-white dark:bg-slate-900 shadow-sm hover:shadow-md flex flex-col justify-between gap-3 text-slate-800 dark:text-slate-100"
    :class="[
      statusSummary.derived === 'READY' ? 'border-emerald-300 dark:border-emerald-700/60 bg-emerald-50/15 dark:bg-emerald-950/10' :
      statusSummary.derived === 'NEEDS_ATTENTION' ? 'border-amber-300 dark:border-amber-700/60 bg-amber-50/25 dark:bg-amber-950/15' :
      statusSummary.derived === 'BLOCKED' ? 'border-rose-300 dark:border-rose-700/60 bg-rose-50/25 dark:bg-rose-950/20' :
      statusSummary.derived === 'IN_SERVICE' ? 'border-blue-300 dark:border-blue-700/60 bg-blue-50/25 dark:bg-blue-950/15' :
      statusSummary.derived === 'COMPLETED' ? 'border-slate-200 dark:border-slate-800 opacity-85' :
      'border-slate-200 dark:border-slate-800'
    ]"
  >
    <!-- TOP HIERARCHY: TIME, GUEST COUNT & STATUS BADGE -->
    <div>
      <div class="flex items-center justify-between gap-2 mb-2">
        <div class="flex items-center gap-2">
          <span class="text-base sm:text-lg font-black tracking-tight text-blue-900 dark:text-blue-300 flex items-center gap-1.5 tabular-nums">
            <span class="text-amber-500 text-sm sm:text-base">⏰</span> {{ bookingTime }}
          </span>
          <span class="px-2.5 py-1 rounded-xl text-xs font-black bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200/60 dark:border-slate-700 tabular-nums">
            👥 {{ guestCount }} khách
          </span>
        </div>

        <!-- Derived Status Badge -->
        <span 
          class="px-2.5 py-1 rounded-xl text-[10px] sm:text-[11px] font-black tracking-wider uppercase border flex items-center gap-1.5 shrink-0"
          :class="derivedBadgeClass"
        >
          <span class="w-2 h-2 rounded-full animate-pulse" :class="derivedDotClass"></span>
          {{ derivedStatusLabel }}
        </span>
      </div>

      <!-- CUSTOMER & TABLE INFO -->
      <div class="mb-2.5">
        <div class="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100 flex items-center justify-between gap-2">
          <span class="truncate">{{ customerName || 'Khách chưa có tên' }}</span>
          <span v-if="tableCode" class="px-2.5 py-1 rounded-xl text-xs font-black bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 shrink-0 font-tabular">
            🪑 Bàn {{ tableCode }}
          </span>
          <span v-else class="px-2.5 py-1 rounded-xl text-xs font-black bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60 shrink-0 animate-pulse">
            ⚠️ Chưa xếp bàn
          </span>
        </div>

        <div class="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-3 mt-1 tabular-nums font-semibold">
          <a v-if="phone" :href="`tel:${phone}`" class="hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex items-center gap-1">
            <i class="fa-solid fa-phone text-[10px]"></i> {{ phone }}
          </a>
          <span v-else>📞 Chưa có SĐT</span>
          <span v-if="partyType" class="text-amber-600 dark:text-amber-400 font-bold">🎉 {{ partyType }}</span>
        </div>
      </div>

      <!-- MENU ITEMS PREVIEW: Full Clarity & No Truncation -->
      <div class="mb-3 p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-750 text-xs">
        <div class="flex items-center justify-between text-[10px] font-black uppercase text-slate-400 dark:text-slate-400 tracking-wider mb-1.5">
          <span class="flex items-center gap-1">
            <i class="fa-solid fa-utensils text-blue-600 dark:text-blue-400"></i>
            Thực đơn món ăn ({{ menuItems.length }} món)
          </span>
          <span v-if="props.booking.total_amount" class="text-blue-700 dark:text-blue-300 font-black font-tabular">
            {{ formatVND(props.booking.total_amount) }}
          </span>
        </div>

        <!-- If has menu items -->
        <div v-if="menuItems.length > 0" class="space-y-1 max-h-[96px] overflow-y-auto pr-1 custom-scrollbar">
          <div 
            v-for="(item, idx) in menuItems" 
            :key="idx"
            class="flex items-center justify-between gap-2 text-[11px] font-bold text-slate-700 dark:text-slate-200"
          >
            <span class="truncate flex-1">• {{ item.name }}</span>
            <span class="text-blue-600 dark:text-blue-400 font-black shrink-0 font-tabular">x{{ item.qty || item.quantity || 1 }}</span>
          </div>
        </div>

        <!-- If no pre-ordered dishes -->
        <div v-else class="text-[11px] text-slate-400 dark:text-slate-500 italic py-0.5">
          Chưa đặt trước món (Khách gọi trực tiếp tại bàn)
        </div>
      </div>

      <!-- EXCEPTION & STATUS PILLS -->
      <div class="flex flex-wrap gap-1.5 text-xs font-black mb-2">
        <!-- Critical Exception 1: CHƯA CỌC -->
        <span 
          v-if="statusSummary.deposit !== 'PAID'" 
          class="px-2.5 py-1 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 flex items-center gap-1 shadow-2xs"
        >
          <i class="fa-solid fa-triangle-exclamation text-amber-500 text-xs"></i>
          CHƯA CỌC
        </span>

        <!-- Completed Deposit Pill -->
        <span 
          v-else 
          class="px-2.5 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 text-xs font-black flex items-center gap-1"
        >
          <i class="fa-solid fa-circle-check text-emerald-500 text-xs"></i>
          Đã cọc <span v-if="props.booking.deposit_amount" class="font-tabular font-bold">({{ formatVND(props.booking.deposit_amount) }})</span>
        </span>

        <!-- Table status -->
        <span 
          v-if="!(statusSummary.table === 'ASSIGNED' || statusSummary.table === 'OCCUPIED')" 
          class="px-2.5 py-1 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60 flex items-center gap-1 shadow-2xs animate-pulse"
        >
          <i class="fa-solid fa-circle-xmark text-rose-500 text-xs"></i>
          CHƯA XẾP BÀN
        </span>

        <!-- Kitchen Status Pill -->
        <span 
          v-if="menuItems.length > 0"
          class="px-2.5 py-1 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60 text-[11px] font-bold"
        >
          ✓ Bếp sẵn sàng
        </span>
      </div>

      <!-- Attention or Blocking Alert Message -->
      <div 
        v-if="statusSummary.attentionReasons.length > 0 || statusSummary.blockingReasons.length > 0"
        class="p-2.5 rounded-2xl text-xs flex items-start gap-2 mb-2"
        :class="statusSummary.blockingReasons.length > 0 ? 'bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-200' : 'bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-200'"
      >
        <span class="text-sm shrink-0">⚠️</span>
        <div class="space-y-0.5 min-w-0">
          <div v-for="(reason, idx) in [...statusSummary.blockingReasons, ...statusSummary.attentionReasons]" :key="idx" class="leading-tight font-bold">
            {{ reason }}
          </div>
        </div>
      </div>
    </div>

    <!-- BOTTOM ACTIONS: Ergonomic, 44px+ touch targets -->
    <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
      <div class="flex items-center gap-1.5">
        <button 
          @click="$emit('view-detail', booking)"
          class="min-h-[40px] px-3.5 rounded-xl text-xs font-black text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 transition-all active:scale-95 border border-slate-200/60 dark:border-slate-700 cursor-pointer"
          aria-label="Xem chi tiết phiếu"
          title="Xem chi tiết và thực đơn"
        >
          <i class="fa-solid fa-eye text-xs text-blue-600 dark:text-blue-400 mr-1"></i>
          <span>Chi tiết</span>
        </button>

        <button 
          @click="$emit('edit-booking', booking)"
          class="min-h-[40px] px-3 rounded-xl text-xs font-black text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-750 transition-all active:scale-95 border border-slate-200/60 dark:border-slate-700 cursor-pointer"
          aria-label="Chỉnh sửa đơn"
          title="Chỉnh sửa đơn trên form tạo"
        >
          <i class="fa-solid fa-pen text-[10px]"></i>
          <span class="hidden sm:inline ml-1">Sửa</span>
        </button>
      </div>

      <div class="flex items-center gap-2">
        <button 
          v-if="statusSummary.derived !== 'IN_SERVICE' && statusSummary.derived !== 'COMPLETED'"
          @click="$emit('quick-seat', booking)"
          class="min-h-[40px] px-4 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white transition-all active:scale-95 flex items-center gap-1.5 shadow-sm shadow-emerald-600/20 cursor-pointer"
          aria-label="Đón khách vào bàn"
        >
          <span>🍽️ Đón khách</span>
        </button>

        <button 
          v-if="statusSummary.derived === 'IN_SERVICE'"
          @click="$emit('quick-complete', booking)"
          class="min-h-[40px] px-4 rounded-xl text-xs font-black bg-blue-600 hover:bg-blue-700 text-white transition-all active:scale-95 flex items-center gap-1.5 shadow-sm shadow-blue-600/20 cursor-pointer"
          aria-label="Hoàn tất phục vụ"
        >
          <span>✓ Hoàn tất</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { calculateCompositeStatus } from '@/domain/booking/statusCalculator'
import type { CompositeStatusSummary } from '@/domain/booking/statusTypes'
import { formatVND } from '@/utils'

const props = defineProps<{
  booking: any
  allBookings?: any[]
}>()

defineEmits(['view-detail', 'quick-seat', 'quick-complete', 'edit-booking'])

const customerName = computed(() => props.booking.customer?.name || props.booking.customer_name || '')
const phone = computed(() => props.booking.customer?.phone || props.booking.phone || '')
const bookingTime = computed(() => props.booking.booking?.event_time || props.booking.booking?.booking_time || props.booking.time || '18:00')
const guestCount = computed(() => props.booking.booking?.guest_count ?? props.booking.guest_count ?? 2)
const tableCode = computed(() => props.booking.booking?.table_number || props.booking.table_number || props.booking.tables || '')
const partyType = computed(() => props.booking.party?.type || props.booking.booking?.need || '')
const menuItems = computed(() => props.booking.menu_items || props.booking.rawOrder?.menuItems || [])

const statusSummary = computed<CompositeStatusSummary>(() => {
  return calculateCompositeStatus(props.booking)
})

const derivedStatusLabel = computed(() => {
  switch (statusSummary.value.derived) {
    case 'READY': return 'Sẵn Sàng'
    case 'NEEDS_ATTENTION': return 'Cần Xử Lý'
    case 'BLOCKED': return 'Tắc Nghẽn'
    case 'IN_SERVICE': return 'Đang Phục Vụ'
    case 'COMPLETED': return 'Hoàn Tất'
    case 'CANCELLED': return 'Đã Hủy'
    default: return 'Chờ'
  }
})

const derivedBadgeClass = computed(() => {
  switch (statusSummary.value.derived) {
    case 'READY': return 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60'
    case 'NEEDS_ATTENTION': return 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60'
    case 'BLOCKED': return 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60'
    case 'IN_SERVICE': return 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/60'
    case 'COMPLETED': return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
    case 'CANCELLED': return 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
    default: return 'bg-slate-100 dark:bg-slate-800 text-slate-600 border-slate-200 dark:border-slate-700'
  }
})

const derivedDotClass = computed(() => {
  switch (statusSummary.value.derived) {
    case 'READY': return 'bg-emerald-500'
    case 'NEEDS_ATTENTION': return 'bg-amber-500'
    case 'BLOCKED': return 'bg-rose-500'
    case 'IN_SERVICE': return 'bg-blue-500'
    default: return 'bg-slate-400'
  }
})
</script>
