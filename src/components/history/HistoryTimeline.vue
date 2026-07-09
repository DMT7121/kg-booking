<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
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

const selectedDateStr = computed({
  get: () => ui.selectedTimelineDate,
  set: (val) => { ui.selectedTimelineDate = val }
})

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

const dateTextVal = ref(selectedDateStr.value)
watch(selectedDateStr, (newVal) => {
  dateTextVal.value = newVal
})

function formatInputDate(value: string): string {
  const digits = value.replace(/\D/g, '').substring(0, 8)
  if (digits.length <= 2) {
    return digits
  } else if (digits.length <= 4) {
    return `${digits.substring(0, 2)}/${digits.substring(2)}`
  } else {
    return `${digits.substring(0, 2)}/${digits.substring(2, 4)}/${digits.substring(4)}`
  }
}

async function onDateTextInput(e: Event) {
  const target = e.target as HTMLInputElement
  const rawValue = target.value
  const selectionStart = target.selectionStart || 0
  
  const formatted = formatInputDate(rawValue)
  
  // Count prefix digits before the cursor in raw value
  const prefixRaw = rawValue.substring(0, selectionStart)
  const prefixDigitsCount = prefixRaw.replace(/\D/g, '').length
  
  // Find where that many digits end in formatted string
  let formattedSelectionStart = 0
  let digitsFound = 0
  for (let i = 0; i < formatted.length; i++) {
    if (digitsFound === prefixDigitsCount) {
      break
    }
    if (formatted[i] !== '/') {
      digitsFound++
    }
    formattedSelectionStart++
  }
  
  // If the next character in formatted is a slash, and the user typed a digit
  // that triggered the slash auto-insertion, step the cursor over the slash.
  if (formatted[formattedSelectionStart] === '/' && rawValue[selectionStart - 1] !== '/') {
    formattedSelectionStart++
  }
  
  dateTextVal.value = formatted
  
  await nextTick()
  target.setSelectionRange(formattedSelectionStart, formattedSelectionStart)
  
  if (formatted.length === 10) {
    const parts = formatted.split('/')
    const day = parseInt(parts[0], 10)
    const month = parseInt(parts[1], 10)
    const year = parseInt(parts[2], 10)
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1000) {
      selectedDateStr.value = formatted
    }
  }
}

function onDateTextBlur() {
  const parts = dateTextVal.value.split('/')
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10)
    const month = parseInt(parts[1], 10)
    const year = parseInt(parts[2], 10)
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1000) {
      selectedDateStr.value = dateTextVal.value
      return
    }
  }
  dateTextVal.value = selectedDateStr.value
}

function triggerDatePicker() {
  if (dateInputRef.value) {
    if (typeof dateInputRef.value.showPicker === 'function') {
      dateInputRef.value.showPicker()
    } else {
      dateInputRef.value.click()
    }
  }
}

const activeZone = ref('A')
const activeZoneTables = computed(() => {
  const count = activeZone.value === 'A' ? 22 : activeZone.value === 'C' ? 16 : activeZone.value === 'B' ? 10 : 8
  return Array.from({ length: count }, (_, i) => `${activeZone.value}${i + 1}`)
})

// Timeline Data Mapping
// A booking belongs to a cell if its date matches and its time starts with the hour, and its tables match.
const timelineData = computed(() => {
  const grid: Record<string, Record<string, any>> = {} // grid[hour][table] = booking
  HOURS.forEach(h => {
    grid[h] = {}
    const allTables: string[] = []
    ;['A', 'B', 'C', 'D', 'E'].forEach(z => {
      const count = z === 'A' ? 22 : z === 'C' ? 16 : z === 'B' ? 10 : 8
      for (let i = 1; i <= count; i++) {
        allTables.push(`${z}${i}`)
      }
    })
    allTables.forEach((t: string) => {
      grid[h][t] = null
    })
  })

  const groups = appStore.groupedHistory
  Object.values(groups).forEach((group: any) => {
    const order = group.latest
    if (!order.parsedCustomer) return
    
    const date = (order.parsedCustomer.date || '').trim()
    if (date !== selectedDateStr.value) return

    const time = (order.parsedCustomer.time || '').trim()
    const tablesStr = (order.parsedCustomer.tables || '').trim()
    if (!tablesStr) return

    const tables = tablesStr.split(/[\s,]+/).map((t: string) => t.trim().toUpperCase()).filter(Boolean)

    // Find closest hour slot
    const hourPrefix = time ? time.split(':')[0].padStart(2, '0') : ''
    let matchHour = HOURS.find(h => h.startsWith(hourPrefix))
    if (!matchHour) return

    tables.forEach((t: string) => {
      if (grid[matchHour]) {
        grid[matchHour][t] = order
      }
    })
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

function prefillBooking(table: string, time: string) {
  formStore.customer.time = time
  formStore.customer.date = selectedDateStr.value
  const zone = table.match(/^([A-Z]+)/i)?.[1]?.toUpperCase() || ''
  ui.tempTable.zone = zone
  const number = table.replace(zone, '')
  ui.tempTable.number = number
  formStore.customer.tables = table
  ui.tab = 'create'
  ui.showToast(`Đã điền sẵn bàn ${table} lúc ${time}`, 'success')
}

function getStaff(order: any) {
  try {
    const data = JSON.parse(order.data || '{}')
    return data.staff?.name || ''
  } catch {
    return ''
  }
}

// --- Drag & Drop handlers ---
const activeDragTarget = ref<{ hour: string; table: string } | null>(null)
const draggedBookingId = ref<string | null>(null)

function isDropTarget(hour: string, table: string): boolean {
  return activeDragTarget.value?.hour === hour && activeDragTarget.value?.table === table
}

function handleDragStart(e: DragEvent, booking: any) {
  if (!booking) return
  draggedBookingId.value = booking.id
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', booking.id)
  }
}

function handleDragOver(e: DragEvent, hour: string, table: string) {
  e.preventDefault()
  if (timelineData.value[hour][table]) return
  activeDragTarget.value = { hour, table }
}

function handleDragLeave(e: DragEvent, hour: string, table: string) {
  if (activeDragTarget.value?.hour === hour && activeDragTarget.value?.table === table) {
    activeDragTarget.value = null
  }
}

async function handleDrop(e: DragEvent, hour: string, table: string) {
  e.preventDefault()
  activeDragTarget.value = null
  
  const bookingId = e.dataTransfer?.getData('text/plain') || draggedBookingId.value
  draggedBookingId.value = null
  if (!bookingId) return
  
  const order = appStore.historyList.find(o => o.id === bookingId)
  if (!order) return
  
  if (timelineData.value[hour][table]) {
    ui.showToast('Vị trí bàn này đã có khách đặt vào giờ này!', 'warning')
    return
  }
  
  ui.loading.is = true
  ui.loading.msg = `Đang chuyển bàn của ${order.parsedCustomer?.name}...`
  ui.loading.subMsg = `${order.parsedCustomer?.time || ''} (${order.parsedCustomer?.tables || ''}) → ${hour} (Bàn ${table})`
  
  try {
    const updatedCustomer = {
      ...order.parsedCustomer,
      time: hour,
      tables: table
    }
    
    const rawData = JSON.parse((order as any).data || '{}')
    const originalMetadata = order.aiEngine ? { model_used: order.aiEngine } : null
    
    const payload = {
      id: order.id,
      customer: updatedCustomer,
      items: order.menuItems || [],
      staff: order.staff || { name: 'Admin', phone: '' },
      deposit: order.deposit || { amount: order.depositAmount, isPaid: order.isDeposited },
      total: order.totalAmount,
      activeMenuSheet: rawData.activeMenuSheet || appStore.activeSheet || '',
      aiMetadata: rawData.aiMetadata || originalMetadata,
      warnings: rawData.warnings || [],
      unresolvedItems: rawData.unresolvedItems || [],
      version: (order.version || 1) + 1,
      baseServerVersion: order.version || 1
    }
    
    const optimisticOrder = {
      ...order,
      parsedCustomer: updatedCustomer,
      version: payload.version,
      isSyncing: true
    }
    appStore.setOptimisticOrder(optimisticOrder)
    
    const res = await appStore.saveOrder(payload)
    if (res && res.ok) {
      appStore.markOrderSynced(order.id, { version: payload.version })
      ui.showToast(`Đã xếp ${order.parsedCustomer?.name} vào Bàn ${table} lúc ${hour}!`, 'success')
      await appStore.loadHistory(true)
    } else {
      throw new Error(res?.message || 'Save failed')
    }
  } catch (err: any) {
    appStore.markOrderFailed(order.id)
    ui.showToast(`Lỗi chuyển bàn: ${err.message}`, 'error')
    await appStore.loadHistory(true)
  } finally {
    ui.loading.is = false
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
      <div class="relative flex-grow border border-slate-200 rounded-xl px-3 py-2 flex flex-col hover:border-blue-400 transition-colors group">
        <input 
          ref="dateInputRef" 
          type="date" 
          v-model="selectedDateInput" 
          class="absolute -z-10 opacity-0 w-0 h-0 pointer-events-none"
        >
        <label class="text-[10px] font-bold text-slate-500 uppercase pointer-events-none group-hover:text-blue-500 transition-colors">Chọn ngày</label>
        <div class="font-black text-slate-800 text-sm flex justify-between items-center">
          <input 
            type="text" 
            v-model="dateTextVal" 
            @input="onDateTextInput" 
            @blur="onDateTextBlur"
            class="bg-transparent border-none font-black text-slate-800 text-sm outline-none w-full p-0"
            placeholder="DD/MM/YYYY"
          >
          <button 
            type="button"
            @click.stop="triggerDatePicker" 
            class="text-blue-600/70 hover:text-blue-800 transition-colors cursor-pointer shrink-0 ml-2"
          >
            <i class="fa-solid fa-calendar-days text-sm"></i>
          </button>
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

    <!-- Zone Selector Tabs -->
    <div class="px-4 py-2.5 bg-white border-b border-slate-200 flex flex-wrap gap-2 shrink-0 z-10 shadow-sm">
      <button 
        v-for="z in ['A', 'B', 'C', 'D', 'E']" 
        :key="z"
        @click="activeZone = z"
        class="px-4 py-2 rounded-xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer"
        :class="activeZone === z ? 'bg-blue-900 text-white shadow-md shadow-blue-900/10' : 'bg-slate-50 text-slate-500 border border-slate-200 hover:bg-slate-100'"
      >
        Khu {{ z }}
      </button>
    </div>

    <!-- Timeline Grid Container -->
    <div class="flex-grow w-full overflow-auto bg-slate-50 relative custom-scrollbar p-0 md:p-2 box-border">
      <div class="min-w-[1200px] bg-white shadow-sm border border-slate-100 flex flex-col rounded-xl">
        
        <!-- Header Row -->
        <div class="flex bg-blue-950 text-white sticky top-0 z-30 shadow-md">
          <div class="w-20 flex-shrink-0 py-3 text-center font-bold text-xs uppercase tracking-widest border-r border-white/10 sticky left-0 bg-blue-950 z-40">Bàn</div>
          <div v-for="h in HOURS" :key="h" class="flex-1 py-3 text-center font-bold text-xs border-r border-white/10 last:border-0 min-w-[100px]">{{ h }}</div>
        </div>

        <!-- Table Rows -->
        <div class="flex flex-col relative z-10">
          <div v-for="t in activeZoneTables" :key="t" class="flex border-b border-slate-100 last:border-0">
            <!-- Table Name Column -->
            <div class="w-20 flex-shrink-0 flex flex-col items-center justify-center py-4 border-r border-slate-100 bg-slate-50/95 backdrop-blur-md sticky left-0 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
              <span class="font-black text-slate-800 text-sm">{{ t }}</span>
            </div>
            
            <!-- Hour Columns -->
            <div 
              v-for="h in HOURS" 
              :key="h" 
              class="flex-1 p-1.5 border-r border-slate-100 last:border-0 flex items-center justify-center min-w-[100px] min-h-[90px] transition-all duration-200"
              :class="{'border-2 border-dashed border-blue-500 bg-blue-50/40 scale-95 shadow-inner rounded-xl': isDropTarget(h, t)}"
              @dragover.prevent="handleDragOver($event, h, t)"
              @dragleave="handleDragLeave($event, h, t)"
              @drop="handleDrop($event, h, t)"
            >
              <template v-if="timelineData[h][t]">
                <!-- Booked Slot -->
                <div 
                  @click="openBookingDetail(timelineData[h][t])"
                  draggable="true"
                  @dragstart="handleDragStart($event, timelineData[h][t])"
                  class="w-full h-full rounded-xl flex flex-col items-center justify-start p-1.5 text-center shadow-sm border cursor-pointer active:scale-95 transition-transform relative overflow-hidden select-none hover:shadow-md cursor-grab active:cursor-grabbing"
                  :class="timelineData[h][t].isDeposited ? 'bg-blue-50 border-blue-200 text-blue-900 hover:bg-blue-100' : 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'"
                >
                  <!-- Table Badge -->
                  <div v-if="timelineData[h][t].parsedCustomer?.tables" class="absolute top-1 right-1 px-1.5 py-0.5 rounded-full text-[8.5px] font-black shadow-[0_2px_4px_rgba(0,0,0,0.05)] border bg-white text-slate-700 border-slate-200">
                    {{ t }}
                  </div>

                  <!-- Customer Name -->
                  <div class="font-black text-[11px] leading-tight line-clamp-1 break-all w-full pr-4 mt-1">{{ timelineData[h][t].parsedCustomer?.name }}</div>
                  
                  <!-- Phone Number -->
                  <div v-if="timelineData[h][t].parsedCustomer?.phone" class="text-[9px] font-bold opacity-75 mt-0.5">
                    {{ timelineData[h][t].parsedCustomer?.phone }}
                  </div>

                  <!-- Pax & Party Type -->
                  <div class="text-[10px] font-bold opacity-80 mt-1 flex flex-col items-center">
                    <span>{{ timelineData[h][t].parsedCustomer?.pax }} người</span>
                    <span v-if="timelineData[h][t].parsedCustomer?.type" class="text-[8.5px] font-semibold opacity-70 mt-0.5 px-1.5 py-[1px] bg-black/5 rounded text-inherit">
                      {{ timelineData[h][t].parsedCustomer?.type }}
                    </span>
                  </div>
                  
                  <!-- Staff Received -->
                  <div v-if="getStaff(timelineData[h][t])" class="mt-auto pt-1 border-t w-full text-center" :class="timelineData[h][t].isDeposited ? 'border-blue-200/50' : 'border-rose-200/50'">
                    <div class="text-[8.5px] font-bold opacity-75 truncate w-full flex items-center justify-center gap-1">
                      <i class="fa-solid fa-user-tag opacity-70"></i> {{ getStaff(timelineData[h][t]) }}
                    </div>
                  </div>
                </div>
              </template>
              <template v-else>
                <!-- Empty Slot -->
                <div @click="prefillBooking(t, h)" class="w-8 h-8 rounded-lg bg-emerald-50/50 border border-emerald-100 flex items-center justify-center text-emerald-400 opacity-60 cursor-pointer hover:bg-emerald-100 transition-colors">
                  <i class="fa-solid fa-chair text-sm"></i>
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
