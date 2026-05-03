<script setup lang="ts">
import { ref, computed } from 'vue'
import { useUIStore } from '@/stores/useUIStore'
import { useAppStore } from '@/stores/useAppStore'
import { useForm } from '@/composables/useForm'

const ui = useUIStore()
const appStore = useAppStore()
const { resetForm } = useForm()

// Constants based on the image
const ZONES = ['Khu A', 'Khu B', 'Khu C', 'Khu D', 'Khu E']
const HOURS = [
  '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', 
  '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00'
]

// Date selection
const selectedDateStr = ref(new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }))

// Format date for native input type="date"
const selectedDateInput = computed({
  get: () => {
    const parts = selectedDateStr.value.split('/')
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`
    return ''
  },
  set: (val) => {
    if (!val) return
    const parts = val.split('-')
    if (parts.length === 3) selectedDateStr.value = `${parts[2]}/${parts[1]}/${parts[0]}`
  }
})

// Timeline Data Mapping
// A booking belongs to a cell if its date matches and its time starts with the hour, and its zone matches.
const timelineData = computed(() => {
  const grid: Record<string, Record<string, any>> = {} // grid[time][zone] = booking
  HOURS.forEach(h => {
    grid[h] = {}
    ZONES.forEach(z => {
      grid[h][z] = null
    })
  })

  const groups = appStore.groupedHistory
  Object.values(groups).forEach((group: any) => {
    const order = group.latest
    if (!order.parsedCustomer) return
    const date = order.parsedCustomer.date
    if (date !== selectedDateStr.value) return

    const time = order.parsedCustomer.time // e.g. "09:30" or "10:00"
    const tables = order.parsedCustomer.tables || ''
    
    // Find closest hour slot
    const hourPrefix = time ? time.split(':')[0] : ''
    let matchHour = HOURS.find(h => h.startsWith(hourPrefix))
    if (!matchHour) return

    // Find zone. Simple logic: check if 'tables' contains 'A', 'B', etc.
    let matchZone = ''
    if (tables.toUpperCase().includes('A')) matchZone = 'Khu A'
    else if (tables.toUpperCase().includes('B')) matchZone = 'Khu B'
    else if (tables.toUpperCase().includes('C')) matchZone = 'Khu C'
    else if (tables.toUpperCase().includes('D')) matchZone = 'Khu D'
    else if (tables.toUpperCase().includes('E')) matchZone = 'Khu E'
    else {
      // If no explicit zone, try to fit in the first available slot? 
      // For now, if no explicit zone, we can't place it accurately on this specific grid, 
      // but let's assign it to 'Khu A' as fallback if empty, or just skip.
    }

    if (matchZone && grid[matchHour]) {
      grid[matchHour][matchZone] = order
    }
  })

  return grid
})

function getAmPm(time: string) {
  const h = parseInt(time.split(':')[0])
  return h >= 12 ? 'PM' : 'AM'
}
</script>

<template>
  <div class="flex-grow flex flex-col bg-slate-50 text-[13px] overflow-hidden">
    
    <!-- Top Controls -->
    <div class="p-4 bg-white border-b border-slate-100 flex gap-3 items-center z-10 shadow-sm">
      <div class="relative flex-grow border border-slate-200 rounded-xl px-3 py-2 flex flex-col cursor-pointer hover:border-blue-400 transition-colors">
        <label class="text-[10px] font-bold text-slate-500 uppercase">Chọn ngày</label>
        <div class="font-black text-slate-800 text-sm flex justify-between items-center">
          <span>{{ selectedDateStr }}</span>
          <i class="fa-solid fa-chevron-down text-slate-400 text-xs"></i>
        </div>
        <input type="date" v-model="selectedDateInput" class="absolute inset-0 opacity-0 cursor-pointer w-full h-full">
      </div>
      
      <button @click="resetForm" class="h-12 px-6 bg-[#1A237E] text-white rounded-xl font-black text-sm shadow-lg shadow-blue-900/20 active:scale-95 transition-all flex justify-center items-center gap-2 whitespace-nowrap">
        <i class="fa-solid fa-plus text-white/70"></i> Tạo lịch đặt mới
      </button>
    </div>

    <!-- Timeline Grid Container -->
    <div class="flex-grow overflow-auto bg-slate-50 relative custom-scrollbar p-2 md:p-4">
      <div class="min-w-[700px] bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col">
        
        <!-- Header Row -->
        <div class="flex bg-[#0D1658] text-white sticky top-0 z-20 shadow-md">
          <div class="w-20 flex-shrink-0 py-3 text-center font-bold text-xs uppercase tracking-widest border-r border-white/10">Giờ</div>
          <div v-for="z in ZONES" :key="z" class="flex-1 py-3 text-center font-bold text-xs border-r border-white/10 last:border-0">{{ z }}</div>
        </div>

        <!-- Time Rows -->
        <div class="flex flex-col relative z-10">
          <div v-for="h in HOURS" :key="h" class="flex border-b border-slate-100 last:border-0">
            <!-- Hour Column -->
            <div class="w-20 flex-shrink-0 flex flex-col items-center justify-center py-4 border-r border-slate-100 bg-slate-50/50">
              <span class="font-black text-slate-800 text-sm">{{ h }}</span>
              <span class="text-[10px] font-bold text-slate-400 uppercase">{{ getAmPm(h) }}</span>
            </div>
            
            <!-- Zone Columns -->
            <div v-for="z in ZONES" :key="z" class="flex-1 p-2 border-r border-slate-100 last:border-0 flex items-center justify-center min-h-[70px]">
              <template v-if="timelineData[h][z]">
                <!-- Booked Slot -->
                <div 
                  class="w-full h-full rounded-xl flex flex-col items-center justify-center p-1 text-center shadow-sm border"
                  :class="timelineData[h][z].isDeposited ? 'bg-blue-50 border-blue-100 text-[#1A237E]' : 'bg-rose-50 border-rose-100 text-rose-700'"
                >
                  <div class="font-black text-xs leading-tight line-clamp-1 break-all px-1">{{ timelineData[h][z].parsedCustomer?.name }}</div>
                  <div class="text-[10px] font-bold opacity-80 mt-0.5">{{ timelineData[h][z].parsedCustomer?.pax }} người</div>
                </div>
              </template>
              <template v-else>
                <!-- Empty Slot -->
                <div class="w-10 h-10 rounded-xl bg-emerald-50/50 border border-emerald-100 flex items-center justify-center text-emerald-400 opacity-60">
                  <i class="fa-solid fa-chair text-lg"></i>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Legend Footer -->
    <div class="p-4 bg-white border-t border-slate-100 flex justify-center gap-8 shadow-[0_-4px_10px_rgba(0,0,0,0.02)] z-10">
      <div class="flex items-center gap-2">
        <i class="fa-solid fa-chair text-emerald-400 text-lg"></i>
        <span class="font-bold text-xs text-slate-600">Còn trống</span>
      </div>
      <div class="flex items-center gap-2">
        <i class="fa-solid fa-chair text-blue-500 text-lg"></i>
        <span class="font-bold text-xs text-slate-600">Đã đặt</span>
      </div>
      <div class="flex items-center gap-2">
        <i class="fa-solid fa-chair text-rose-400 text-lg"></i>
        <span class="font-bold text-xs text-slate-600">Đang giữ</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Custom scrollbar for timeline specifically */
.custom-scrollbar::-webkit-scrollbar {
  height: 6px;
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #e2e8f0;
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #cbd5e1;
}
</style>
