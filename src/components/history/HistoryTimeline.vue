<script setup lang="ts">
import { ref, computed } from 'vue'
import { useUIStore } from '@/stores/useUIStore'
import { useAppStore } from '@/stores/useAppStore'
import { useFormStore } from '@/stores/useFormStore'
import { useForm } from '@/composables/useForm'

const ui = useUIStore()
const appStore = useAppStore()
const formStore = useFormStore()
const { resetForm } = useForm()

const dateInputRef = ref<HTMLInputElement | null>(null)

// Constants based on the image
const ZONES = ['Khu A', 'Khu B', 'Khu C', 'Khu D', 'Khu E']

const showQuickView = ref(false)

const bookingsForSelectedDate = computed(() => {
  const result: any[] = []
  const groups = appStore.groupedHistory
  Object.values(groups).forEach((group: any) => {
    const order = group.latest
    if (!order.parsedCustomer) return
    const date = (order.parsedCustomer.date || '').trim()
    if (date === selectedDateStr.value) {
      result.push(order)
    }
  })
  result.sort((a, b) => {
    const timeA = a.parsedCustomer?.time || '00:00'
    const timeB = b.parsedCustomer?.time || '00:00'
    return timeA.localeCompare(timeB)
  })
  return result
})
const HOURS = [
  '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', 
  '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00'
]

const today = new Date()
const selectedDateStr = ref(`${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`)

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
    
    const date = (order.parsedCustomer.date || '').trim()
    if (date !== selectedDateStr.value) return

    const time = (order.parsedCustomer.time || '').trim()
    const tables = (order.parsedCustomer.tables || '').trim()
    
    // Find closest hour slot
    const hourPrefix = time ? time.split(':')[0].padStart(2, '0') : ''
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

// Auto CRM Insights for today
const crmInsights = computed(() => {
  let vipCount = 0
  let totalPax = 0
  
  const groups = appStore.groupedHistory
  Object.values(groups).forEach((group: any) => {
    const order = group.latest
    if (!order.parsedCustomer) return
    const date = (order.parsedCustomer.date || '').trim()
    if (date !== selectedDateStr.value) return
    
    totalPax += Number(order.parsedCustomer.pax) || 0
    const status = appStore.getCrmStatus(order.parsedCustomer.phone)
    if (status === 'VIP' || status === 'Khách quen') {
      vipCount++
    }
  })

  if (totalPax === 0) return null
  
  return {
    vipCount,
    totalPax,
    message: vipCount > 0 
      ? `Hôm nay dự kiến đón ${totalPax} khách, trong đó có ${vipCount} khách hàng thân thiết. Khuyến nghị chuẩn bị quà tặng/voucher VIP!` 
      : `Dự kiến đón ${totalPax} khách. Hãy cố gắng upsell các món đặc biệt nhé!`
  }
})

function getAmPm(time: string) {
  const h = parseInt(time.split(':')[0])
  return h >= 12 ? 'PM' : 'AM'
}

function openBookingDetail(booking: any) {
  ui.selectedBooking = booking
  ui.showBookingDetailModal = true
}

function prefillBooking(zone: string, time: string) {
  formStore.customer.time = time
  formStore.customer.date = selectedDateStr.value
  const cleanZone = zone.replace('Khu ', '')
  ui.tempTable.zone = cleanZone
  formStore.customer.tables = cleanZone
  ui.tab = 'create'
  ui.showToast(`Đã điền sẵn bàn ${cleanZone} lúc ${time}`, 'success')
}

function getStaff(order: any) {
  try {
    const data = JSON.parse(order.data || '{}')
    return data.staff?.name || ''
  } catch {
    return ''
  }
}
</script>

<template>
  <div class="flex-grow flex flex-col bg-slate-50 text-[13px] overflow-hidden">
    
    <!-- Header Title -->
    <div class="bg-slate-50 px-4 py-4 flex items-center justify-between sticky top-0 z-20 shadow-sm border-b border-slate-100 shrink-0">
      <button @click="ui.tab = 'create'" class="w-10 h-10 flex items-center justify-center text-blue-900 text-xl active:scale-95 transition-transform">
        <i class="fa-solid fa-arrow-left"></i>
      </button>
      <div class="text-center flex-1">
        <h2 class="text-xl font-black text-blue-900">Lịch Đặt Bàn</h2>
        <p class="text-[10px] font-bold text-slate-400 mt-0.5">Sơ đồ tình trạng bàn theo thời gian</p>
      </div>
      <div class="w-10"></div> <!-- Placeholder to balance header -->
    </div>

    <!-- Top Controls -->
    <div class="p-4 bg-white border-b border-slate-100 flex gap-3 items-center z-10 shadow-sm">
      <div class="relative flex-grow border border-slate-200 rounded-xl px-3 py-2 flex flex-col cursor-pointer hover:border-blue-400 transition-colors overflow-hidden group">
        <input type="date" v-model="selectedDateInput" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10">
        <label class="text-[10px] font-bold text-slate-500 uppercase pointer-events-none group-hover:text-blue-500 transition-colors">Chọn ngày</label>
        <div class="font-black text-slate-800 text-sm flex justify-between items-center pointer-events-none">
          <span>{{ selectedDateStr }}</span>
          <i class="fa-solid fa-calendar-days text-blue-600/70 text-xs"></i>
        </div>
      </div>
      
      <button @click="showQuickView = true" class="h-12 w-12 bg-indigo-50 text-indigo-600 rounded-xl font-black text-xl shadow-sm hover:bg-indigo-100 active:scale-95 transition-all flex justify-center items-center shrink-0 border border-indigo-100">
        <i class="fa-solid fa-list-ul"></i>
      </button>
      
      <button @click="resetForm(); ui.tab = 'create'" class="h-12 px-6 bg-blue-900 text-white rounded-xl font-black text-sm shadow-lg shadow-blue-900/20 active:scale-95 transition-all flex justify-center items-center gap-2 whitespace-nowrap">
        <i class="fa-solid fa-plus text-white/70"></i> Tạo lịch đặt mới
      </button>
    </div>

    <!-- Auto CRM Banner -->
    <div v-if="crmInsights" class="bg-gradient-to-r from-purple-600 to-blue-600 p-3 flex items-center gap-3 text-white shadow-inner shrink-0 relative overflow-hidden">
      <div class="absolute -right-4 -top-4 w-16 h-16 bg-white/10 rounded-full blur-xl pointer-events-none"></div>
      <div class="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0 border border-white/30 shadow-sm relative z-10">
        <i class="fa-solid fa-wand-magic-sparkles text-sm animate-pulse text-yellow-300"></i>
      </div>
      <div class="flex-1 min-w-0 relative z-10">
        <div class="text-[10px] font-black uppercase tracking-widest text-blue-100 mb-0.5">AI Tự Động Gợi Ý (Auto-CRM)</div>
        <div class="text-xs font-semibold leading-tight line-clamp-2 md:line-clamp-1">{{ crmInsights.message }}</div>
      </div>
    </div>

    <!-- Timeline Grid Container -->
    <div class="flex-grow w-full overflow-auto bg-slate-50 relative custom-scrollbar p-0 md:p-2 box-border">
      <div class="min-w-[700px] bg-white shadow-sm border border-slate-100 flex flex-col rounded-xl">
        
        <!-- Header Row -->
        <div class="flex bg-blue-950 text-white sticky top-0 z-30 shadow-md">
          <div class="w-20 flex-shrink-0 py-3 text-center font-bold text-xs uppercase tracking-widest border-r border-white/10 sticky left-0 bg-blue-950 z-40">Giờ</div>
          <div v-for="z in ZONES" :key="z" class="flex-1 py-3 text-center font-bold text-xs border-r border-white/10 last:border-0">{{ z }}</div>
        </div>

        <!-- Time Rows -->
        <div class="flex flex-col relative z-10">
          <div v-for="h in HOURS" :key="h" class="flex border-b border-slate-100 last:border-0">
            <!-- Hour Column -->
            <div class="w-20 flex-shrink-0 flex flex-col items-center justify-center py-4 border-r border-slate-100 bg-slate-50/95 backdrop-blur-md sticky left-0 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
              <span class="font-black text-slate-800 text-sm">{{ h }}</span>
              <span class="text-[10px] font-bold text-slate-400 uppercase">{{ getAmPm(h) }}</span>
            </div>
            
            <!-- Zone Columns -->
            <div v-for="z in ZONES" :key="z" class="flex-1 p-2 border-r border-slate-100 last:border-0 flex items-center justify-center min-h-[110px]">
              <template v-if="timelineData[h][z]">
                <!-- Booked Slot -->
                <div 
                  @click="openBookingDetail(timelineData[h][z])"
                  class="w-full h-full rounded-xl flex flex-col items-center justify-start p-2 text-center shadow-sm border cursor-pointer active:scale-95 transition-transform relative overflow-hidden"
                  :class="timelineData[h][z].isDeposited ? 'bg-blue-50 border-blue-200 text-blue-900 hover:bg-blue-100' : 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'"
                >
                  <!-- Table Badge -->
                  <div v-if="timelineData[h][z].parsedCustomer?.tables" class="absolute top-1 right-1 px-1.5 py-0.5 rounded-full text-[8.5px] font-black shadow-[0_2px_4px_rgba(0,0,0,0.05)] border" :class="timelineData[h][z].isDeposited ? 'bg-white text-blue-700 border-blue-100' : 'bg-white text-rose-700 border-rose-100'">
                    {{ timelineData[h][z].parsedCustomer?.tables.replace('Khu ', '').replace('Khu', '') }}
                  </div>

                  <!-- Customer Name -->
                  <div class="font-black text-[11px] leading-tight line-clamp-1 break-all w-full pr-4 mt-1">{{ timelineData[h][z].parsedCustomer?.name }}</div>
                  
                  <!-- Phone Number -->
                  <div v-if="timelineData[h][z].parsedCustomer?.phone" class="text-[9px] font-bold opacity-75 mt-0.5">
                    {{ timelineData[h][z].parsedCustomer?.phone }}
                  </div>

                  <!-- Pax & Party Type -->
                  <div class="text-[10px] font-bold opacity-80 mt-1 flex flex-col items-center">
                    <span>{{ timelineData[h][z].parsedCustomer?.pax }} người</span>
                    <span v-if="timelineData[h][z].parsedCustomer?.type" class="text-[8.5px] font-semibold opacity-70 mt-0.5 px-1.5 py-[1px] bg-black/5 rounded text-inherit">
                      {{ timelineData[h][z].parsedCustomer?.type }}
                    </span>
                  </div>
                  
                  <!-- Staff Received -->
                  <div v-if="getStaff(timelineData[h][z])" class="mt-auto pt-1 border-t w-full text-center" :class="timelineData[h][z].isDeposited ? 'border-blue-200/50' : 'border-rose-200/50'">
                    <div class="text-[8.5px] font-bold opacity-75 truncate w-full flex items-center justify-center gap-1">
                      <i class="fa-solid fa-user-tag opacity-70"></i> {{ getStaff(timelineData[h][z]) }}
                    </div>
                  </div>
                </div>
              </template>
              <template v-else>
                <!-- Empty Slot -->
                <div @click="prefillBooking(z, h)" class="w-10 h-10 rounded-xl bg-emerald-50/50 border border-emerald-100 flex items-center justify-center text-emerald-400 opacity-60 cursor-pointer hover:bg-emerald-100 transition-colors">
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

    <!-- QUICK VIEW MODAL -->
    <transition name="fade">
      <div v-if="showQuickView" class="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 pb-safe">
        <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" @click="showQuickView = false"></div>
        <transition name="slide-up" appear>
          <div v-if="showQuickView" class="bg-white w-full sm:max-w-md h-[85vh] sm:h-auto sm:max-h-[85vh] rounded-t-3xl sm:rounded-3xl shadow-2xl relative z-10 flex flex-col overflow-hidden">
            <!-- Modal Header -->
            <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 class="font-black text-slate-800 text-lg uppercase tracking-wider">Xem Nhanh</h3>
                <p class="text-[11px] font-bold text-slate-500 mt-0.5">Ngày {{ selectedDateStr }} • {{ bookingsForSelectedDate.length }} Phiếu Đặt</p>
              </div>
              <button @click="showQuickView = false" class="w-8 h-8 flex items-center justify-center bg-slate-200 text-slate-600 rounded-full hover:bg-slate-300 transition-colors">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>
            
            <!-- Modal Body -->
            <div class="flex-grow overflow-y-auto p-4 custom-scrollbar bg-slate-50 space-y-3 pb-8">
              <div v-if="bookingsForSelectedDate.length === 0" class="text-center py-10 opacity-50 flex flex-col items-center">
                <div class="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center mb-3">
                  <i class="fa-solid fa-calendar-xmark text-2xl text-slate-500"></i>
                </div>
                <div class="text-sm font-bold text-slate-600">Trống lịch</div>
                <div class="text-[11px] text-slate-400 mt-1">Chưa có khách đặt bàn trong ngày này.</div>
              </div>
              
              <div 
                v-for="order in bookingsForSelectedDate" 
                :key="order.id"
                @click="openBookingDetail(order); showQuickView = false"
                class="bg-white p-3.5 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-3 cursor-pointer hover:border-blue-300 transition-all active:scale-[0.98]"
              >
                <!-- Time & Table -->
                <div class="w-14 flex flex-col items-center justify-center border-r border-slate-100 pr-3 shrink-0">
                  <span class="font-black text-blue-900 text-[15px] leading-none">{{ order.parsedCustomer?.time || '--:--' }}</span>
                  <span class="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1.5 text-center truncate w-full px-1 py-0.5 bg-slate-100 rounded" title="Bàn">
                    {{ order.parsedCustomer?.tables?.replace('Khu ', '') || '?' }}
                  </span>
                </div>
                
                <!-- Info -->
                <div class="flex-1 min-w-0 py-0.5">
                  <div class="flex items-center justify-between gap-2 mb-1.5">
                    <span class="font-black text-slate-800 text-[13px] truncate">{{ order.parsedCustomer?.name }}</span>
                    <span v-if="order.isDeposited" class="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[9px] font-bold shrink-0">CỌC</span>
                  </div>
                  <div class="flex items-center gap-3 text-[10px] text-slate-500 font-semibold mb-1">
                    <span><i class="fa-solid fa-users opacity-60 text-blue-500"></i> {{ order.parsedCustomer?.pax || '0' }} ng</span>
                    <span v-if="order.parsedCustomer?.phone"><i class="fa-solid fa-phone opacity-60 text-green-500"></i> {{ order.parsedCustomer.phone }}</span>
                  </div>
                  <!-- Items summary -->
                  <div class="text-[9.5px] text-slate-400 font-medium truncate italic w-full">
                    <span v-if="order.menuItems?.length > 0">
                      {{ order.menuItems.length }} món ({{ order.menuItems.map((i:any)=>i.name).join(', ') }})
                    </span>
                    <span v-else>Chưa chọn món</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </transition>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}
.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
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
