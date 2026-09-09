<template>
  <div 
    class="relative rounded-2xl border transition-all duration-200 p-4 bg-slate-900/85 dark:bg-slate-900/95 backdrop-blur-md shadow-lg flex flex-col justify-between gap-3 text-slate-100"
    :class="[
      statusSummary.derived === 'READY' ? 'border-emerald-500/40 hover:border-emerald-500' :
      statusSummary.derived === 'NEEDS_ATTENTION' ? 'border-amber-500/50 hover:border-amber-500 bg-amber-950/15' :
      statusSummary.derived === 'BLOCKED' ? 'border-rose-500/60 hover:border-rose-500 bg-rose-950/25' :
      statusSummary.derived === 'IN_SERVICE' ? 'border-blue-500/50 hover:border-blue-500 bg-blue-950/15' :
      statusSummary.derived === 'COMPLETED' ? 'border-slate-700/60 opacity-80' :
      'border-slate-800'
    ]"
  >
    <!-- TOP HIERARCHY: TIME, GUEST COUNT & TABLE -->
    <div>
      <div class="flex items-center justify-between gap-2 mb-1.5">
        <div class="flex items-center gap-2">
          <span class="text-xl font-black tracking-tight text-white flex items-center gap-1.5 tabular-nums">
            <span class="text-amber-400 text-base">⏰</span> {{ bookingTime }}
          </span>
          <span class="px-2.5 py-1 rounded-lg text-xs font-black bg-slate-800 text-slate-200 border border-slate-700 tabular-nums">
            👥 {{ guestCount }} khách
          </span>
        </div>

        <!-- Derived Status Badge -->
        <span 
          class="px-2.5 py-1 rounded-lg text-[11px] font-extrabold tracking-wider uppercase border flex items-center gap-1.5 shrink-0"
          :class="derivedBadgeClass"
        >
          <span class="w-2 h-2 rounded-full animate-pulse" :class="derivedDotClass"></span>
          {{ derivedStatusLabel }}
        </span>
      </div>

      <!-- CUSTOMER & TABLE -->
      <div class="mb-2">
        <div class="text-base font-black text-white flex items-center justify-between gap-2">
          <span class="truncate">{{ customerName || 'Khách chưa có tên' }}</span>
          <span v-if="tableCode" class="px-2.5 py-1 rounded-lg text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
            🪑 Bàn {{ tableCode }}
          </span>
          <span v-else class="px-2.5 py-1 rounded-lg text-xs font-black bg-rose-500/20 text-rose-300 border border-rose-500/30 shrink-0 animate-pulse">
            ⚠️ Chưa xếp bàn
          </span>
        </div>
        <div class="text-xs text-slate-400 flex items-center gap-3 mt-1 tabular-nums">
          <span>📞 {{ phone || '---' }}</span>
          <span v-if="partyType" class="text-amber-400 font-bold">🎉 {{ partyType }}</span>
        </div>
      </div>

      <!-- EXCEPTION-FIRST STATUS DISPLAY -->
      <!-- Case 1: Quiet completed state if ready or fully covered -->
      <div 
        v-if="isQuietCompleted" 
        class="mb-2 py-1.5 px-3 rounded-xl bg-emerald-950/30 border border-emerald-500/25 text-emerald-300 text-xs font-bold flex items-center justify-between"
      >
        <div class="flex items-center gap-2">
          <i class="fa-solid fa-circle-check text-emerald-400"></i>
          <span>✓ Cọc · ✓ Món · ✓ Bàn {{ tableCode }}</span>
        </div>
        <span class="text-[10px] text-emerald-400/80 uppercase font-mono">Chuẩn bị sẵn</span>
      </div>

      <!-- Case 2: Dominant Incomplete / Exception Pills -->
      <div v-else class="space-y-1.5 mb-2">
        <div class="flex flex-wrap gap-1.5 text-xs font-black">
          <!-- Critical Exception 1: CHƯA CỌC -->
          <span 
            v-if="statusSummary.deposit !== 'PAID'" 
            class="px-2.5 py-1 rounded-lg bg-amber-500/25 text-amber-300 border border-amber-400/40 flex items-center gap-1 shadow-sm"
          >
            <i class="fa-solid fa-triangle-exclamation text-amber-400 text-xs"></i>
            CHƯA CỌC
          </span>

          <!-- Critical Exception 2: CHƯA XẾP BÀN -->
          <span 
            v-if="!(statusSummary.table === 'ASSIGNED' || statusSummary.table === 'OCCUPIED')" 
            class="px-2.5 py-1 rounded-lg bg-rose-500/25 text-rose-300 border border-rose-400/40 flex items-center gap-1 shadow-sm animate-pulse"
          >
            <i class="fa-solid fa-circle-xmark text-rose-400 text-xs"></i>
            CHƯA XẾP BÀN
          </span>

          <!-- Critical Exception 3: BẾP CHƯA XÁC NHẬN -->
          <span 
            v-if="statusSummary.kitchen !== 'ACKNOWLEDGED' && statusSummary.kitchen !== 'PREPARING'" 
            class="px-2.5 py-1 rounded-lg bg-cyan-500/25 text-cyan-300 border border-cyan-400/40 flex items-center gap-1 shadow-sm"
          >
            <i class="fa-solid fa-utensils text-cyan-400 text-xs"></i>
            BẾP CHƯA XÁC NHẬN
          </span>

          <!-- Normal completed items as quiet subtle pills -->
          <span 
            v-if="statusSummary.deposit === 'PAID'" 
            class="px-2 py-1 rounded-lg bg-slate-800/80 text-slate-400 border border-slate-700 text-[11px] font-semibold"
          >
            ✓ Đã cọc
          </span>
          <span 
            v-if="statusSummary.menu === 'CONFIRMED'" 
            class="px-2 py-1 rounded-lg bg-slate-800/80 text-slate-400 border border-slate-700 text-[11px] font-semibold"
          >
            ✓ Đã chốt món
          </span>
        </div>

        <!-- Attention or Blocking Alert Message -->
        <div 
          v-if="statusSummary.attentionReasons.length > 0 || statusSummary.blockingReasons.length > 0"
          class="p-2.5 rounded-xl text-xs flex items-start gap-2"
          :class="statusSummary.blockingReasons.length > 0 ? 'bg-rose-950/50 border border-rose-500/50 text-rose-200' : 'bg-amber-950/50 border border-amber-500/50 text-amber-200'"
        >
          <span class="text-sm shrink-0">⚠️</span>
          <div class="space-y-0.5 min-w-0">
            <div v-for="(reason, idx) in [...statusSummary.blockingReasons, ...statusSummary.attentionReasons]" :key="idx" class="leading-tight font-semibold">
              {{ reason }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- BOTTOM ACTIONS: THUMB-ZONE OPTIMIZED (>= 48px HIT TARGET) -->
    <div class="pt-2.5 border-t border-slate-800/80 flex items-center justify-between gap-2.5">
      <button 
        @click="$emit('view-detail', booking)"
        class="touch-target-48 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-750 transition-all active:scale-95 border border-slate-700/60"
        aria-label="Xem chi tiết phiếu"
      >
        <span>Chi tiết</span>
      </button>

      <div class="flex items-center gap-2">
        <button 
          v-if="statusSummary.derived !== 'IN_SERVICE' && statusSummary.derived !== 'COMPLETED'"
          @click="$emit('quick-seat', booking)"
          class="touch-target-48 px-4 py-2.5 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white transition-all active:scale-95 flex items-center gap-1.5 shadow-md shadow-emerald-950/50"
          aria-label="Đón khách vào bàn"
        >
          <span>🍽️ Đón khách</span>
        </button>
        <button 
          v-if="statusSummary.derived === 'IN_SERVICE'"
          @click="$emit('quick-complete', booking)"
          class="touch-target-48 px-4 py-2.5 rounded-xl text-xs font-black bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white transition-all active:scale-95 flex items-center gap-1.5 shadow-md shadow-blue-950/50"
          aria-label="Hoàn tất phục vụ"
        >
          <span>💳 Hoàn tất</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { calculateCompositeStatus } from '@/domain/booking/statusCalculator'
import type { CompositeStatusSummary } from '@/domain/booking/statusTypes'

const props = defineProps<{
  booking: any
  allBookings?: any[]
}>()

defineEmits(['view-detail', 'quick-seat', 'quick-complete'])

const customerName = computed(() => props.booking.customer?.name || props.booking.customer_name || '')
const phone = computed(() => props.booking.customer?.phone || props.booking.phone || '')
const bookingTime = computed(() => props.booking.booking?.event_time || props.booking.time || '18:00')
const guestCount = computed(() => props.booking.booking?.guest_count ?? props.booking.guest_count ?? 2)
const tableCode = computed(() => props.booking.booking?.table_number || props.booking.table_number || props.booking.tables || '')
const partyType = computed(() => props.booking.party?.type || props.booking.booking?.need || '')

const statusSummary = computed<CompositeStatusSummary>(() => {
  return calculateCompositeStatus(props.booking)
})

const isQuietCompleted = computed(() => {
  const hasDeposit = statusSummary.value.deposit === 'PAID'
  const hasMenu = statusSummary.value.menu === 'CONFIRMED'
  const hasTable = statusSummary.value.table === 'ASSIGNED' || statusSummary.value.table === 'OCCUPIED'
  const hasNoAlerts = statusSummary.value.blockingReasons.length === 0 && statusSummary.value.attentionReasons.length === 0
  return hasDeposit && hasMenu && hasTable && hasNoAlerts
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
    case 'READY': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
    case 'NEEDS_ATTENTION': return 'bg-amber-500/20 text-amber-300 border-amber-500/40'
    case 'BLOCKED': return 'bg-rose-500/20 text-rose-300 border-rose-500/40'
    case 'IN_SERVICE': return 'bg-blue-500/20 text-blue-300 border-blue-500/40'
    case 'COMPLETED': return 'bg-slate-700/40 text-slate-300 border-slate-600'
    case 'CANCELLED': return 'bg-slate-800 text-slate-500 border-slate-700'
    default: return 'bg-slate-800 text-slate-400 border-slate-700'
  }
})

const derivedDotClass = computed(() => {
  switch (statusSummary.value.derived) {
    case 'READY': return 'bg-emerald-400'
    case 'NEEDS_ATTENTION': return 'bg-amber-400'
    case 'BLOCKED': return 'bg-rose-400'
    case 'IN_SERVICE': return 'bg-blue-400'
    default: return 'bg-slate-500'
  }
})
</script>
