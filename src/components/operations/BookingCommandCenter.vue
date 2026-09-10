<template>
  <div class="space-y-4">
    <!-- 1. DATE & SHIFT OPERATIONAL CONTROLLER (RẤT QUAN TRỌNG: Quản lý theo ngày rõ ràng, không bị loạn) -->
    <div class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm space-y-4">
      
      <!-- Row 1: Date Bar Header & Quick Selectors -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
        <!-- Date Display with Day of Week -->
        <div class="flex items-center gap-3">
          <div class="w-11 h-11 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center text-lg border border-blue-100 dark:border-blue-900/50 shrink-0">
            <i class="fa-solid fa-calendar-day"></i>
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight" style="font-family: 'Be Vietnam Pro', sans-serif;">
                {{ dateMode === 'all' ? 'Tất cả các ngày' : formattedDayOfWeek }}
              </h2>
              <span v-if="dateMode !== 'all'" class="px-2.5 py-0.5 rounded-full text-xs font-black bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60 font-tabular">
                {{ selectedDateStr }}
              </span>
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
              {{ dateMode === 'all' ? `Đang hiển thị toàn bộ ${allBookingsCount} đơn trong hệ thống` : `Có ${bookingsForDate.length} lượt đặt bàn (${totalGuestsForDate} khách) trong ngày` }}
            </p>
          </div>
        </div>

        <!-- Date Quick Actions & Mode Switcher -->
        <div class="flex flex-wrap items-center gap-1.5 self-start md:self-auto">
          <!-- Quick Date Pills -->
          <button 
            @click="setDateToToday"
            class="px-3 py-1.5 min-h-[36px] rounded-xl text-xs font-black uppercase tracking-wider transition-all border cursor-pointer active:scale-95"
            :class="dateMode === 'selected' && isTodaySelected ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'"
          >
            Hôm nay
          </button>
          <button 
            @click="setDateToTomorrow"
            class="px-3 py-1.5 min-h-[36px] rounded-xl text-xs font-black uppercase tracking-wider transition-all border cursor-pointer active:scale-95"
            :class="dateMode === 'selected' && isTomorrowSelected ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'"
          >
            Ngày mai
          </button>

          <!-- Native Date Picker Input -->
          <div class="relative inline-flex">
            <input 
              ref="datePickerInputRef"
              type="date"
              v-model="nativeDateInput"
              class="absolute -z-10 opacity-0 w-0 h-0 pointer-events-none"
            >
            <button 
              @click="openDatePicker"
              class="px-3 py-1.5 min-h-[36px] rounded-xl text-xs font-black uppercase tracking-wider transition-all border cursor-pointer active:scale-95 flex items-center gap-1.5"
              :class="dateMode === 'selected' && !isTodaySelected && !isTomorrowSelected ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'"
              title="Chọn ngày trên lịch"
            >
              <i class="fa-solid fa-calendar-days text-[11px]"></i>
              <span>Chọn ngày</span>
            </button>
          </div>

          <!-- Toggle: All vs Selected Date -->
          <button 
            @click="dateMode = dateMode === 'all' ? 'selected' : 'all'"
            class="px-3 py-1.5 min-h-[36px] rounded-xl text-xs font-black uppercase tracking-wider transition-all border cursor-pointer active:scale-95 flex items-center gap-1.5"
            :class="dateMode === 'all' ? 'bg-purple-600 text-white border-purple-600 shadow-sm' : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'"
            title="Xem toàn bộ không giới hạn ngày"
          >
            <i class="fa-solid" :class="dateMode === 'all' ? 'fa-filter-circle-xmark' : 'fa-list-check'"></i>
            <span>{{ dateMode === 'all' ? 'Đang xem tất cả' : 'Xem tất cả ngày' }}</span>
          </button>
        </div>
      </div>

      <!-- Row 2: Shift (Ca Trực) Selector & Zone/Search Controls -->
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <!-- Shift Selector Tabs -->
        <div class="inline-flex p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700 overflow-x-auto no-scrollbar shrink-0">
          <button 
            v-for="s in SHIFT_OPTIONS" 
            :key="s.id"
            @click="activeShift = s.id"
            class="px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap active:scale-95"
            :class="activeShift === s.id ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'"
          >
            <span>{{ s.icon }}</span>
            <span>{{ s.label }}</span>
            <span class="px-1.5 py-0.2 rounded-full text-[10px] font-black font-tabular" :class="activeShift === s.id ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'">
              {{ getShiftBookingCount(s.id) }}
            </span>
          </button>
        </div>

        <!-- Search input & Zone quick filter -->
        <div class="flex items-center gap-2 flex-grow max-w-lg">
          <div class="relative flex-grow">
            <input 
              v-model="searchQuery"
              type="text"
              placeholder="Tìm theo tên khách, SĐT, số bàn..."
              class="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 font-bold text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 transition-colors"
            >
            <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
            <button v-if="searchQuery" @click="searchQuery = ''" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <i class="fa-solid fa-xmark text-xs"></i>
            </button>
          </div>

          <!-- Zone filter select -->
          <select 
            v-model="selectedZone"
            class="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 font-bold text-xs text-slate-700 dark:text-slate-200 outline-none shrink-0"
          >
            <option value="all">Tất cả khu</option>
            <option value="A">Khu A</option>
            <option value="B">Khu B</option>
            <option value="C">Khu C</option>
            <option value="D">Khu D</option>
            <option value="VIP">Phòng VIP</option>
          </select>
        </div>
      </div>
    </div>

    <!-- 2. SCOPED OPERATIONAL KPI BAR (Tính toán chính xác theo Ngày & Ca đang chọn) -->
    <div class="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
      <!-- Total Bookings -->
      <div class="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div class="text-[10px] sm:text-[11px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-wider">
          {{ dateMode === 'all' ? 'Tổng Đơn' : 'Bàn Đặt Ca Này' }}
        </div>
        <div class="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 mt-1 font-tabular">
          {{ scopedBookings.length }} <span class="text-xs text-slate-400 font-normal">bàn</span>
        </div>
      </div>

      <!-- Total Guests -->
      <div class="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div class="text-[10px] sm:text-[11px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-wider">Tổng Lượng Khách</div>
        <div class="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400 mt-1 font-tabular">
          {{ scopedGuestsCount }} <span class="text-xs text-slate-400 font-normal">khách</span>
        </div>
      </div>

      <!-- Ready Bookings -->
      <div class="p-3.5 rounded-2xl border border-emerald-200/80 dark:border-emerald-800/50 bg-emerald-50/40 dark:bg-emerald-950/20 shadow-sm">
        <div class="text-[10px] sm:text-[11px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Sẵn Sàng Đón</div>
        <div class="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-300 mt-1 font-tabular">
          {{ readyCount }} <span class="text-xs text-emerald-500 font-normal">bàn</span>
        </div>
      </div>

      <!-- Needs Attention -->
      <div class="p-3.5 rounded-2xl border border-amber-200/80 dark:border-amber-800/50 bg-amber-50/40 dark:bg-amber-950/20 shadow-sm">
        <div class="text-[10px] sm:text-[11px] font-black text-amber-700 dark:text-amber-400 uppercase tracking-wider">Cần Xử Lý Ngay</div>
        <div class="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-300 mt-1 font-tabular">
          {{ attentionCount }} <span class="text-xs text-amber-500 font-normal">đơn</span>
        </div>
      </div>

      <!-- In Service -->
      <div class="p-3.5 rounded-2xl border border-blue-200/80 dark:border-blue-800/50 bg-blue-50/40 dark:bg-blue-950/20 shadow-sm col-span-2 sm:col-span-1">
        <div class="text-[10px] sm:text-[11px] font-black text-blue-700 dark:text-blue-400 uppercase tracking-wider">Đang Ăn Tại Bàn</div>
        <div class="text-xl sm:text-2xl font-black text-blue-600 dark:text-blue-300 mt-1 font-tabular">
          {{ inServiceCount }} <span class="text-xs text-blue-500 font-normal">bàn</span>
        </div>
      </div>
    </div>

    <!-- 3. MAIN CONTENT LAYOUT: Left Grid of Bookings, Right Risk Center Widget -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <!-- Left 2 Cols: Cards List with Status Filter Controls -->
      <div class="lg:col-span-2 space-y-3.5">
        
        <!-- Status Filter Tabs -->
        <div class="flex items-center justify-between gap-2 overflow-x-auto pb-1 scrollbar-none">
          <div class="flex items-center gap-1.5 shrink-0">
            <button 
              v-for="filter in filterOptions" 
              :key="filter.value"
              @click="activeStatusFilter = filter.value"
              class="px-3.5 py-2 min-h-[40px] rounded-xl text-xs font-black transition-all border active:scale-95 cursor-pointer whitespace-nowrap"
              :class="activeStatusFilter === filter.value 
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white shadow-sm' 
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'"
            >
              {{ filter.label }}
            </button>
          </div>

          <span class="text-xs text-slate-500 dark:text-slate-400 font-bold shrink-0 tabular-nums">
            {{ filteredBookings.length }} đơn
          </span>
        </div>

        <!-- Empty State -->
        <div v-if="filteredBookings.length === 0" class="py-14 text-center rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 text-slate-400 dark:text-slate-500 text-sm">
          <i class="fa-solid fa-calendar-xmark text-4xl mb-3 text-slate-300 dark:text-slate-600 block"></i>
          <p class="font-bold text-slate-600 dark:text-slate-300 text-sm">Không có đơn đặt bàn nào phù hợp</p>
          <p class="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-sm mx-auto">
            Không tìm thấy bàn tiệc cho ngày {{ selectedDateStr }} theo bộ lọc hiện tại.
          </p>
          <div class="mt-4 flex justify-center gap-2">
            <button @click="dateMode = 'all'" class="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-xs uppercase cursor-pointer hover:bg-slate-200">
              Xem tất cả các ngày
            </button>
            <button @click="activeStatusFilter = 'all'; activeShift = 'all'; searchQuery = ''" class="px-3.5 py-2 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-300 rounded-xl font-bold text-xs uppercase cursor-pointer hover:bg-blue-100">
              Xóa bộ lọc
            </button>
          </div>
        </div>

        <!-- Bookings Cards Grid -->
        <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <CommandCenterCard 
            v-for="booking in filteredBookings"
            :key="booking.id || booking.order_id"
            :booking="booking"
            :all-bookings="allBookings"
            @view-detail="$emit('view-detail', $event)"
            @quick-seat="$emit('quick-seat', $event)"
            @quick-complete="$emit('quick-complete', $event)"
            @edit-booking="$emit('edit-booking', $event)"
          />
        </div>
      </div>

      <!-- Right 1 Col: Operational Risk Widget (Scoped to Date) -->
      <div class="space-y-4">
        <OperationalRiskWidget :issues="dateRiskIssues" />
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
import { useUIStore } from '@/stores/useUIStore'

const props = defineProps<{
  allBookings: any[]
}>()

const emit = defineEmits(['view-detail', 'quick-seat', 'quick-complete', 'edit-booking'])

const ui = useUIStore()

// --- 1. Date Management ---
function getOffsetDateStr(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

const todayStr = computed(() => getOffsetDateStr(0))
const tomorrowStr = computed(() => getOffsetDateStr(1))

// Synchronize with ui store or default to today
const selectedDateStr = computed({
  get: () => ui.selectedTimelineDate || todayStr.value,
  set: (val: string) => { ui.selectedTimelineDate = val }
})

const dateMode = ref<'selected' | 'all'>('selected')

const isTodaySelected = computed(() => selectedDateStr.value === todayStr.value)
const isTomorrowSelected = computed(() => selectedDateStr.value === tomorrowStr.value)

function setDateToToday() {
  dateMode.value = 'selected'
  selectedDateStr.value = todayStr.value
}

function setDateToTomorrow() {
  dateMode.value = 'selected'
  selectedDateStr.value = tomorrowStr.value
}

// Native date picker helper
const datePickerInputRef = ref<HTMLInputElement | null>(null)

const nativeDateInput = computed({
  get: () => {
    const parts = selectedDateStr.value.split('/')
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`
    return ''
  },
  set: (val: string) => {
    if (!val) return
    const parts = val.split('-')
    if (parts.length === 3) {
      selectedDateStr.value = `${parts[2]}/${parts[1]}/${parts[0]}`
      dateMode.value = 'selected'
    }
  }
})

function openDatePicker() {
  if (datePickerInputRef.value) {
    if (typeof datePickerInputRef.value.showPicker === 'function') {
      datePickerInputRef.value.showPicker()
    } else {
      datePickerInputRef.value.click()
    }
  }
}

// Vietnamese Day of Week formatting
const formattedDayOfWeek = computed(() => {
  const parts = selectedDateStr.value.split('/')
  if (parts.length !== 3) return 'Lịch Vận Hành'
  const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]))
  if (isNaN(d.getTime())) return 'Lịch Vận Hành'
  
  const weekdays = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']
  return weekdays[d.getDay()]
})

// --- 2. Shift (Ca Trực) Definition ---
type ShiftType = 'all' | 'lunch' | 'dinner'

const SHIFT_OPTIONS = [
  { id: 'all' as ShiftType, label: 'Tất cả ca', icon: '⏰' },
  { id: 'lunch' as ShiftType, label: 'Ca Trưa (10h30-14h30)', icon: '☀️' },
  { id: 'dinner' as ShiftType, label: 'Ca Tối (17h00-22h30)', icon: '🌙' }
]

const activeShift = ref<ShiftType>('all')

function getBookingShift(bookingTime: string): 'lunch' | 'dinner' | 'other' {
  if (!bookingTime) return 'dinner'
  const parts = bookingTime.split(':')
  const hour = parseInt(parts[0], 10)
  if (isNaN(hour)) return 'dinner'
  if (hour >= 10 && hour <= 15) return 'lunch'
  if (hour >= 16 && hour <= 23) return 'dinner'
  return 'other'
}

// --- 3. Status Filters & Search ---
type StatusFilterType = 'all' | 'attention' | 'ready' | 'in_service' | 'completed'

const activeStatusFilter = ref<StatusFilterType>('all')

const filterOptions: { label: string; value: StatusFilterType }[] = [
  { label: 'Tất cả', value: 'all' },
  { label: '⚠️ Cần xử lý', value: 'attention' },
  { label: '✅ Sẵn sàng', value: 'ready' },
  { label: '🍽️ Đang ăn', value: 'in_service' },
  { label: '✓ Hoàn tất', value: 'completed' }
]

const searchQuery = ref('')
const selectedZone = ref('all')

// --- 4. Bookings Scoping Logic ---
const allBookingsCount = computed(() => props.allBookings?.length || 0)

// Bookings filtered by date
const bookingsForDate = computed(() => {
  if (!props.allBookings) return []
  if (dateMode.value === 'all') return props.allBookings

  const targetDate = selectedDateStr.value.trim()
  return props.allBookings.filter(b => {
    const bDate = (b.date || b.booking?.event_date || b.booking?.booking_date || '').trim()
    return bDate === targetDate
  })
})

const totalGuestsForDate = computed(() => {
  return bookingsForDate.value.reduce((sum, b) => sum + (b.booking?.guest_count ?? b.guest_count ?? 0), 0)
})

function getShiftBookingCount(shiftId: ShiftType): number {
  if (shiftId === 'all') return bookingsForDate.value.length
  return bookingsForDate.value.filter(b => {
    const time = b.time || b.booking?.event_time || b.booking?.booking_time || ''
    return getBookingShift(time) === shiftId
  }).length
}

// Scoped by Date AND Shift
const scopedBookings = computed(() => {
  let list = bookingsForDate.value
  if (activeShift.value !== 'all') {
    list = list.filter(b => {
      const time = b.time || b.booking?.event_time || b.booking?.booking_time || ''
      return getBookingShift(time) === activeShift.value
    })
  }
  return list
})

const scopedGuestsCount = computed(() => {
  return scopedBookings.value.reduce((sum, b) => sum + (b.booking?.guest_count ?? b.guest_count ?? 0), 0)
})

const readyCount = computed(() => {
  return scopedBookings.value.filter(b => calculateCompositeStatus(b).derived === 'READY').length
})

const attentionCount = computed(() => {
  return scopedBookings.value.filter(b => {
    const d = calculateCompositeStatus(b).derived
    return d === 'NEEDS_ATTENTION' || d === 'BLOCKED'
  }).length
})

const inServiceCount = computed(() => {
  return scopedBookings.value.filter(b => calculateCompositeStatus(b).derived === 'IN_SERVICE').length
})

// Final filtered bookings for display (applying status filter, zone and search)
const filteredBookings = computed(() => {
  let list = scopedBookings.value

  // Status filter
  if (activeStatusFilter.value !== 'all') {
    list = list.filter(b => {
      const summary = calculateCompositeStatus(b)
      if (activeStatusFilter.value === 'attention') return summary.derived === 'NEEDS_ATTENTION' || summary.derived === 'BLOCKED'
      if (activeStatusFilter.value === 'ready') return summary.derived === 'READY'
      if (activeStatusFilter.value === 'in_service') return summary.derived === 'IN_SERVICE'
      if (activeStatusFilter.value === 'completed') return summary.derived === 'COMPLETED'
      return true
    })
  }

  // Zone filter
  if (selectedZone.value !== 'all') {
    list = list.filter(b => {
      const table = (b.booking?.table_number || b.table_number || b.tables || '').toUpperCase()
      return table.includes(selectedZone.value)
    })
  }

  // Search filter
  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    const cleanQ = q.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    list = list.filter(b => {
      const name = (b.customer?.name || b.customer_name || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      const phone = (b.customer?.phone || b.phone || '').replace(/\D/g, '')
      const table = (b.booking?.table_number || b.table_number || b.tables || '').toLowerCase()
      return name.includes(cleanQ) || phone.includes(cleanQ) || table.includes(cleanQ)
    })
  }

  // Sort by arrival time ascending
  return list.sort((a, b) => {
    const timeA = a.booking?.event_time || a.booking?.booking_time || a.time || '00:00'
    const timeB = b.booking?.event_time || b.booking?.booking_time || b.time || '00:00'
    return timeA.localeCompare(timeB)
  })
})

// Scoped risk issues for the selected date
const dateRiskIssues = computed<OperationalRiskIssue[]>(() => {
  if (!bookingsForDate.value || bookingsForDate.value.length === 0) return []
  const issues: OperationalRiskIssue[] = []
  for (const b of bookingsForDate.value) {
    issues.push(...detectBookingRisks(b, bookingsForDate.value))
  }
  return issues
})
</script>
