<template>
  <div 
    class="relative rounded-2xl border transition-all duration-200 p-4 bg-slate-900/80 backdrop-blur-md shadow-lg flex flex-col justify-between"
    :class="[
      statusSummary.derived === 'READY' ? 'border-emerald-500/40 hover:border-emerald-500' :
      statusSummary.derived === 'NEEDS_ATTENTION' ? 'border-amber-500/50 hover:border-amber-500 bg-amber-950/10' :
      statusSummary.derived === 'BLOCKED' ? 'border-rose-500/60 hover:border-rose-500 bg-rose-950/20' :
      statusSummary.derived === 'IN_SERVICE' ? 'border-blue-500/50 hover:border-blue-500 bg-blue-950/10' :
      statusSummary.derived === 'COMPLETED' ? 'border-slate-700/60 opacity-80' :
      'border-slate-800'
    ]"
  >
    <!-- Top Header: Time, Guest Count & Table -->
    <div>
      <div class="flex items-center justify-between gap-2 mb-2">
        <div class="flex items-center gap-2">
          <span class="text-xl font-black tracking-tight text-white flex items-center gap-1.5">
            <span class="text-amber-400">⏰</span> {{ bookingTime }}
          </span>
          <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-800 text-slate-200 border border-slate-700">
            👥 {{ guestCount }} khách
          </span>
        </div>

        <!-- Derived Status Badge -->
        <span 
          class="px-2.5 py-1 rounded-lg text-xs font-extrabold tracking-wide uppercase border flex items-center gap-1"
          :class="derivedBadgeClass"
        >
          <span class="w-2 h-2 rounded-full animate-pulse" :class="derivedDotClass"></span>
          {{ derivedStatusLabel }}
        </span>
      </div>

      <!-- Customer & Party Info -->
      <div class="mb-3">
        <div class="text-base font-bold text-white flex items-center justify-between">
          <span class="truncate">{{ customerName || 'Chưa có tên khách' }}</span>
          <span v-if="tableCode" class="px-2 py-0.5 rounded-md text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-500/30">
            🪑 {{ tableCode }}
          </span>
          <span v-else class="px-2 py-0.5 rounded-md text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
            ⚠️ Chưa gán bàn
          </span>
        </div>
        <div class="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
          <span>📞 {{ phone || '---' }}</span>
          <span v-if="partyType" class="text-amber-400/90 font-medium">🎉 {{ partyType }}</span>
        </div>
      </div>

      <!-- Composite Status Matrix Pills -->
      <div class="grid grid-cols-3 sm:grid-cols-6 gap-1.5 mb-3 text-[11px] font-semibold">
        <!-- Deposit -->
        <div class="px-2 py-1 rounded-md text-center border" :class="statusSummary.deposit === 'PAID' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'">
          Cọc: <span class="font-bold">{{ statusSummary.deposit === 'PAID' ? 'Đã cọc' : 'Chưa' }}</span>
        </div>
        <!-- Menu -->
        <div class="px-2 py-1 rounded-md text-center border" :class="statusSummary.menu === 'CONFIRMED' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'">
          Món: <span class="font-bold">{{ statusSummary.menu === 'CONFIRMED' ? 'Đã chốt' : 'Chưa' }}</span>
        </div>
        <!-- Decor -->
        <div class="px-2 py-1 rounded-md text-center border" :class="statusSummary.decor === 'CONFIRMED' ? 'bg-purple-500/10 text-purple-300 border-purple-500/30' : statusSummary.decor === 'PENDING_DETAILS' ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'">
          Decor: <span class="font-bold">{{ statusSummary.decor === 'CONFIRMED' ? 'Đã chốt' : statusSummary.decor === 'PENDING_DETAILS' ? 'Thiếu' : 'Ko' }}</span>
        </div>
        <!-- Table -->
        <div class="px-2 py-1 rounded-md text-center border" :class="statusSummary.table === 'ASSIGNED' || statusSummary.table === 'OCCUPIED' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-rose-500/10 text-rose-300 border-rose-500/30'">
          Bàn: <span class="font-bold">{{ statusSummary.table === 'ASSIGNED' ? 'Đã xếp' : statusSummary.table === 'OCCUPIED' ? 'Đang ngồi' : 'Chưa' }}</span>
        </div>
        <!-- Kitchen -->
        <div class="px-2 py-1 rounded-md text-center border" :class="statusSummary.kitchen === 'ACKNOWLEDGED' || statusSummary.kitchen === 'PREPARING' ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'">
          Bếp: <span class="font-bold">{{ statusSummary.kitchen === 'ACKNOWLEDGED' ? 'Đã nhận' : 'Chờ' }}</span>
        </div>
        <!-- Payment -->
        <div class="px-2 py-1 rounded-md text-center border" :class="statusSummary.payment === 'PAID' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'">
          Bill: <span class="font-bold">{{ statusSummary.payment === 'PAID' ? 'Xong' : 'Chưa' }}</span>
        </div>
      </div>

      <!-- Attention or Blocking Alert Message -->
      <div 
        v-if="statusSummary.attentionReasons.length > 0 || statusSummary.blockingReasons.length > 0"
        class="mb-3 p-2.5 rounded-xl text-xs flex items-start gap-2"
        :class="statusSummary.blockingReasons.length > 0 ? 'bg-rose-950/40 border border-rose-500/40 text-rose-200' : 'bg-amber-950/40 border border-amber-500/40 text-amber-200'"
      >
        <span class="text-sm shrink-0">⚠️</span>
        <div class="space-y-0.5">
          <div v-for="(reason, idx) in [...statusSummary.blockingReasons, ...statusSummary.attentionReasons]" :key="idx" class="leading-tight">
            {{ reason }}
          </div>
        </div>
      </div>
    </div>

    <!-- Bottom Quick Action Buttons -->
    <div class="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
      <button 
        @click="$emit('view-detail', booking)"
        class="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition"
      >
        Chi tiết
      </button>

      <div class="flex items-center gap-1.5">
        <button 
          v-if="statusSummary.derived !== 'IN_SERVICE' && statusSummary.derived !== 'COMPLETED'"
          @click="$emit('quick-seat', booking)"
          class="px-3 py-1.5 rounded-lg text-xs font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center gap-1 shadow-sm"
        >
          <span>🍽️ Đón khách</span>
        </button>
        <button 
          v-if="statusSummary.derived === 'IN_SERVICE'"
          @click="$emit('quick-complete', booking)"
          class="px-3 py-1.5 rounded-lg text-xs font-extrabold bg-blue-600 hover:bg-blue-500 text-white transition flex items-center gap-1 shadow-sm"
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
