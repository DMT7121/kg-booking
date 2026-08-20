<template>
  <div class="space-y-4">
    <!-- Top Operations KPI Bar -->
    <div class="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
      <!-- Total Bookings -->
      <div class="p-3 rounded-2xl border border-slate-800 bg-slate-900/80 backdrop-blur-md">
        <div class="text-[11px] font-bold text-slate-400 uppercase">Tổng Booking Hôm Nay</div>
        <div class="text-2xl font-black text-white mt-1">{{ totalBookingsCount }}</div>
      </div>

      <!-- Total Guests -->
      <div class="p-3 rounded-2xl border border-slate-800 bg-slate-900/80 backdrop-blur-md">
        <div class="text-[11px] font-bold text-slate-400 uppercase">Tổng Lượng Khách</div>
        <div class="text-2xl font-black text-amber-400 mt-1">{{ totalGuestsCount }} <span class="text-xs text-slate-400 font-normal">khách</span></div>
      </div>

      <!-- Ready Bookings -->
      <div class="p-3 rounded-2xl border border-emerald-500/30 bg-emerald-950/20 backdrop-blur-md">
        <div class="text-[11px] font-bold text-emerald-400 uppercase">Sẵn Sàng Phục Vụ</div>
        <div class="text-2xl font-black text-emerald-300 mt-1">{{ readyCount }}</div>
      </div>

      <!-- Needs Attention -->
      <div class="p-3 rounded-2xl border border-amber-500/30 bg-amber-950/20 backdrop-blur-md">
        <div class="text-[11px] font-bold text-amber-400 uppercase">Cần Xử Lý Ngay</div>
        <div class="text-2xl font-black text-amber-300 mt-1">{{ attentionCount }}</div>
      </div>

      <!-- In Service -->
      <div class="p-3 rounded-2xl border border-blue-500/30 bg-blue-950/20 backdrop-blur-md col-span-2 sm:col-span-1">
        <div class="text-[11px] font-bold text-blue-400 uppercase">Đang Phục Vụ</div>
        <div class="text-2xl font-black text-blue-300 mt-1">{{ inServiceCount }}</div>
      </div>
    </div>

    <!-- Main Content Layout: Left Grid of Bookings, Right Risk Center Widget -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <!-- Left 2 Cols: Cards List with Filter Controls -->
      <div class="lg:col-span-2 space-y-3">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <button 
              v-for="filter in filterOptions" 
              :key="filter.value"
              @click="activeFilter = filter.value"
              class="px-3 py-1.5 rounded-xl text-xs font-bold transition border"
              :class="activeFilter === filter.value ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md' : 'bg-slate-900/80 text-slate-300 border-slate-800 hover:bg-slate-800'"
            >
              {{ filter.label }}
            </button>
          </div>

          <span class="text-xs text-slate-400 font-medium">
            Hiển thị {{ filteredBookings.length }} đơn
          </span>
        </div>

        <!-- Bookings Grid -->
        <div v-if="filteredBookings.length === 0" class="py-12 text-center rounded-2xl border border-slate-800 bg-slate-900/40 text-slate-400 text-sm">
          Không có đơn đặt bàn nào phù hợp với bộ lọc hiện tại.
        </div>

        <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <CommandCenterCard 
            v-for="booking in filteredBookings"
            :key="booking.id || booking.order_id"
            :booking="booking"
            :all-bookings="allBookings"
            @view-detail="$emit('view-detail', $event)"
            @quick-seat="$emit('quick-seat', $event)"
            @quick-complete="$emit('quick-complete', $event)"
          />
        </div>
      </div>

      <!-- Right 1 Col: Operational Risk Widget -->
      <div class="space-y-4">
        <OperationalRiskWidget :issues="allRiskIssues" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import CommandCenterCard from './CommandCenterCard.vue'
import OperationalRiskWidget from './OperationalRiskWidget.vue'
import { calculateCompositeStatus } from '@/domain/booking/statusCalculator'
import { detectBookingRisks, OperationalRiskIssue } from '@/domain/booking/conflictEngine'

const props = defineProps<{
  allBookings: any[]
}>()

defineEmits(['view-detail', 'quick-seat', 'quick-complete'])

type FilterType = 'all' | 'attention' | 'ready' | 'in_service'

const activeFilter = ref<FilterType>('all')

const filterOptions: { label: string; value: FilterType }[] = [
  { label: 'Tất cả', value: 'all' },
  { label: '⚠️ Cần xử lý', value: 'attention' },
  { label: '✅ Sẵn sàng', value: 'ready' },
  { label: '🍽️ Đang ăn', value: 'in_service' }
]

const totalBookingsCount = computed(() => props.allBookings?.length || 0)

const totalGuestsCount = computed(() => {
  if (!props.allBookings) return 0
  return props.allBookings.reduce((sum, b) => sum + (b.booking?.guest_count ?? b.guest_count ?? 0), 0)
})

const readyCount = computed(() => {
  if (!props.allBookings) return 0
  return props.allBookings.filter(b => calculateCompositeStatus(b).derived === 'READY').length
})

const attentionCount = computed(() => {
  if (!props.allBookings) return 0
  return props.allBookings.filter(b => {
    const d = calculateCompositeStatus(b).derived
    return d === 'NEEDS_ATTENTION' || d === 'BLOCKED'
  }).length
})

const inServiceCount = computed(() => {
  if (!props.allBookings) return 0
  return props.allBookings.filter(b => calculateCompositeStatus(b).derived === 'IN_SERVICE').length
})

const filteredBookings = computed(() => {
  if (!props.allBookings) return []
  if (activeFilter.value === 'all') return props.allBookings
  return props.allBookings.filter(b => {
    const summary = calculateCompositeStatus(b)
    if (activeFilter.value === 'attention') return summary.derived === 'NEEDS_ATTENTION' || summary.derived === 'BLOCKED'
    if (activeFilter.value === 'ready') return summary.derived === 'READY'
    if (activeFilter.value === 'in_service') return summary.derived === 'IN_SERVICE'
    return true
  })
})

const allRiskIssues = computed<OperationalRiskIssue[]>(() => {
  if (!props.allBookings) return []
  const issues: OperationalRiskIssue[] = []
  for (const b of props.allBookings) {
    issues.push(...detectBookingRisks(b, props.allBookings))
  }
  return issues
})
</script>
