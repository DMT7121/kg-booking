<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAppStore } from '@/stores/useAppStore'
import { useUIStore } from '@/stores/useUIStore'
import { useFormStore } from '@/stores/useFormStore'
import { useForm } from '@/composables/useForm'
import { useAI } from '@/composables/useAI'
import { formatVND } from '@/utils'

const appStore = useAppStore()
const ui = useUIStore()
const formStore = useFormStore()
const { editHistoricOrder } = useForm()
const { processAI } = useAI()

// Input for Quick AI paste
const quickInputText = ref('')
const isAnalyzing = ref(false)

const showAllTodo = ref(false)

// Formatting dates
function getOffsetDateStr(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

const todayStr = computed(() => getOffsetDateStr(0))
const tomorrowStr = computed(() => getOffsetDateStr(1))

// Smart To-do Items
const todoItems = computed(() => {
  const list: any[] = []
  const today = todayStr.value
  const tomorrow = tomorrowStr.value

  const groups = appStore.groupedHistory
  Object.values(groups).forEach((g: any) => {
    const order = g.latest
    if (!order || !order.parsedCustomer) return
    const cust = order.parsedCustomer
    const date = (cust.date || '').trim()

    // 1. Today's booking with no deposit
    if (date === today && !order.isDeposited) {
      list.push({
        id: `nodep_today_${order.id}`,
        type: 'danger',
        title: 'Hôm nay chưa cọc',
        desc: `${cust.name} - ${cust.pax || '0'} khách - ${cust.time || '18:00'}`,
        icon: 'fa-hourglass-half',
        order,
        actionLabel: 'Xác nhận cọc',
        action: 'deposit'
      })
    }

    // 2. Tomorrow's booking with no deposit
    if (date === tomorrow && !order.isDeposited) {
      list.push({
        id: `nodep_tomorrow_${order.id}`,
        type: 'warning',
        title: 'Ngày mai chưa cọc',
        desc: `${cust.name} - ${cust.pax || '0'} khách - ${cust.time || '18:00'}`,
        icon: 'fa-calendar-minus',
        order,
        actionLabel: 'Nhắc cọc',
        action: 'reminder'
      })
    }

    // 3. Bookings with no items ordered
    if ((date === today || date === tomorrow) && (!order.menuItems || order.menuItems.length === 0)) {
      list.push({
        id: `nomenu_${order.id}`,
        type: 'info',
        title: 'Chưa đặt trước món',
        desc: `${cust.name} (${date === today ? 'Hôm nay' : 'Ngày mai'})`,
        icon: 'fa-bell-concierge',
        order,
        actionLabel: 'Thêm món',
        action: 'edit'
      })
    }
  })

  return list
})

const displayedTodoItems = computed(() => {
  if (showAllTodo.value) return todoItems.value
  return todoItems.value.slice(0, 3)
})

// Quick Calendar Summary for 7 days
const calendarSummary = computed(() => {
  const summary: any[] = []
  const weekdayNames = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']
  const shortWeekdayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
  
  for (let i = 0; i < 7; i++) {
    const dateObj = new Date()
    dateObj.setDate(dateObj.getDate() + i)
    const dateStr = `${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${dateObj.getFullYear()}`
    
    // Count bookings and pax
    let totalBookings = 0
    let totalGuests = 0
    
    Object.values(appStore.groupedHistory).forEach((g: any) => {
      const order = g.latest
      if (order && order.parsedCustomer && (order.parsedCustomer.date || '').trim() === dateStr) {
        totalBookings++
        totalGuests += parseInt(order.parsedCustomer.pax || '0') || 0
      }
    })

    let label = ''
    let shortLabel = ''
    if (i === 0) {
      label = 'Hôm nay'
      shortLabel = 'Hôm'
    } else if (i === 1) {
      label = 'Ngày mai'
      shortLabel = 'Mai'
    } else {
      label = weekdayNames[dateObj.getDay()]
      shortLabel = shortWeekdayNames[dateObj.getDay()]
    }

    summary.push({
      dateStr,
      label,
      shortLabel,
      dayOfMonth: String(dateObj.getDate()).padStart(2, '0'),
      dateShort: `${dateObj.getDate()}/${dateObj.getMonth() + 1}`,
      bookings: totalBookings,
      guests: totalGuests,
      isToday: i === 0,
      isTomorrow: i === 1
    })
  }
  
  return summary
})

// Recent operations (last 5 created/modified)
const recentOperations = computed(() => {
  if (!appStore.historyList || appStore.historyList.length === 0) return []
  // Sort by timestamp desc
  return [...appStore.historyList]
    .filter(o => o && o.parsedCustomer)
    .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
    .slice(0, 5)
})

// Quick creation action
async function handleQuickAnalyze() {
  if (!quickInputText.value.trim()) {
    ui.showToast('Vui lòng dán tin nhắn khách trước!', 'warning')
    return
  }
  isAnalyzing.value = true
  formStore.rawInput = quickInputText.value
  ui.tab = 'create'
  
  try {
    ui.showToast('Đang phân tích tin nhắn...', 'info')
    await processAI()
    quickInputText.value = ''
  } catch (err: any) {
    ui.showToast('Lỗi AI: ' + err.message, 'error')
  } finally {
    isAnalyzing.value = false
  }
}

function handleTodoAction(todo: any) {
  if (todo.action === 'edit' || todo.action === 'reminder' || todo.action === 'deposit') {
    editHistoricOrder(todo.order)
    ui.tab = 'create'
    if (todo.action === 'deposit') {
      ui.showToast('Đã mở form đặt bàn. Hãy tích chọn ĐÃ THANH TOÁN ở góc đặt cọc!', 'info')
    } else if (todo.action === 'reminder') {
      ui.showToast('Đã tải thông tin đặt bàn. Có thể copy nội dung nhắc cọc dưới footer!', 'info')
    }
  }
}

function openTimelineDate(dateStr: string) {
  ui.selectedTimelineDate = dateStr
  ui.tab = 'timeline'
}

function handleRecentClick(order: any) {
  editHistoricOrder(order)
  ui.tab = 'create'
  ui.showToast(`Đã mở đơn của ${order.parsedCustomer.name}`, 'info')
}
</script>

<template>
  <div class="flex-grow overflow-y-auto p-4 space-y-5 bg-slate-50/50 scroll-smooth custom-scrollbar">
    <!-- Top Welcoming & Quick Stats -->
    <div class="bg-gradient-to-br from-blue-900 via-indigo-900 to-slate-900 rounded-3xl p-4 text-white shadow-xl relative overflow-hidden">
      <div class="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-transparent pointer-events-none"></div>
      <div class="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <h2 class="text-base font-black tracking-tight" style="font-family: 'Be Vietnam Pro', sans-serif;">
            BẢNG ĐIỀU KHIỂN NHÀ HÀNG
          </h2>
          <p class="text-[10px] text-blue-200 mt-0.5 font-medium">Tóm tắt vận hành và việc cần xử lý hôm nay.</p>
        </div>
        <div class="flex gap-2">
          <button @click="appStore.loadHistory(false)" class="px-3 py-1.5 bg-white/10 hover:bg-white/20 active:scale-95 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5">
            <i class="fa-solid fa-rotate"></i> Cập nhật
          </button>
        </div>
      </div>
      
      <!-- Summary mini widgets (Compact 2x2 grid on mobile/tablet) -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-4 relative z-10">
        <div class="bg-white/5 rounded-2xl py-2 px-3 border border-white/5">
          <div class="text-[9px] text-blue-200 font-bold uppercase tracking-widest leading-tight">Tiệc hôm nay</div>
          <div class="text-base font-black mt-0.5">
            {{ calendarSummary[0]?.bookings || 0 }} <span class="text-[10px] text-slate-300 font-normal">bàn</span>
          </div>
        </div>
        <div class="bg-white/5 rounded-2xl py-2 px-3 border border-white/5">
          <div class="text-[9px] text-blue-200 font-bold uppercase tracking-widest leading-tight">Khách hôm nay</div>
          <div class="text-base font-black mt-0.5">
            {{ calendarSummary[0]?.guests || 0 }} <span class="text-[10px] text-slate-300 font-normal">người</span>
          </div>
        </div>
        <div class="bg-white/5 rounded-2xl py-2 px-3 border border-white/5">
          <div class="text-[9px] text-blue-200 font-bold uppercase tracking-widest leading-tight">Việc cần làm</div>
          <div class="text-base font-black mt-0.5 text-yellow-300">
            {{ todoItems.length }} <span class="text-[10px] text-slate-300 font-normal">việc</span>
          </div>
        </div>
        <div class="bg-white/5 rounded-2xl py-2 px-3 border border-white/5">
          <div class="text-[9px] text-blue-200 font-bold uppercase tracking-widest leading-tight">Tổng đơn</div>
          <div class="text-base font-black mt-0.5">
            {{ Object.keys(appStore.groupedHistory).length }} <span class="text-[10px] text-slate-300 font-normal">đơn</span>
          </div>
        </div>
      </div>

      <!-- Quick Action Chips -->
      <div class="flex items-center gap-1.5 overflow-x-auto scrollbar-none pt-3 pb-1 flex-nowrap -mx-1 border-t border-white/10 mt-3.5">
        <button @click="ui.tab = 'create'" class="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-full text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1 shrink-0 border border-white/10">
          <i class="fa-solid fa-plus text-[8px] text-blue-300"></i> Tạo nhanh
        </button>
        <button @click="ui.selectedTimelineDate = todayStr; ui.tab = 'timeline'" class="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-full text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1 shrink-0 border border-white/10">
          <i class="fa-solid fa-calendar-day text-[8px] text-indigo-300"></i> Hôm nay
        </button>
        <button @click="ui.tab = 'history'; ui.historyFilters.deposit = 'unpaid'; appStore.loadHistory(false)" class="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-full text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1 shrink-0 border border-white/10">
          <i class="fa-solid fa-hourglass-half text-[8px] text-amber-300"></i> Chưa cọc
        </button>
        <button @click="ui.tab = 'history'; ui.historyFilters.deposit = 'all'; ui.historyFilters.time = 'today'; appStore.loadHistory(false)" class="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-full text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1 shrink-0 border border-white/10">
          <i class="fa-solid fa-bell-concierge text-[8px] text-purple-300"></i> Chưa món
        </button>
        <button @click="ui.tab = 'preview'" class="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-full text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1 shrink-0 border border-white/10">
          <i class="fa-solid fa-eye text-[8px] text-emerald-300"></i> Xem phiếu
        </button>
      </div>
    </div>

    <!-- Quick Create Panel -->
    <div class="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-sm space-y-4">
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-sm shadow-sm"><i class="fa-solid fa-wand-magic-sparkles"></i></div>
        <div>
          <h3 class="font-black text-slate-800 text-sm uppercase tracking-wide">Nhập Đơn Nhanh Bằng AI</h3>
          <p class="text-[10px] text-slate-400 font-medium mt-0.5">Dán tin nhắn Zalo, Facebook hoặc Messenger để tạo đơn ngay lập tức</p>
        </div>
      </div>
      <div class="space-y-3">
        <textarea
          v-model="quickInputText"
          rows="3"
          class="w-full p-4 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-500 bg-slate-50/50 shadow-inner placeholder-slate-400 transition-all custom-scrollbar resize-none"
          placeholder="Dán tin nhắn đặt bàn của khách tại đây..."
        ></textarea>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="text-[10px] text-slate-400 font-bold">
            <span class="bg-slate-100 px-2 py-1 rounded text-slate-500">Ctrl + K</span> để tìm kiếm nhanh mọi lúc
          </div>
          <button
            @click="handleQuickAnalyze"
            :disabled="isAnalyzing"
            class="px-5 py-3 bg-blue-600 text-white rounded-xl font-black uppercase text-[10px] tracking-wider hover:bg-blue-700 active:scale-95 shadow-md shadow-blue-600/10 flex items-center gap-2 transition-all"
          >
            <i v-if="isAnalyzing" class="fa-solid fa-spinner animate-spin"></i>
            <i v-else class="fa-solid fa-bolt-lightning text-yellow-300"></i>
            {{ isAnalyzing ? 'ĐANG PHÂN TÍCH...' : 'PHÂN TÍCH NHANH' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Layout Grid: Smart To-do & Quick Calendar Summary -->
    <div class="grid grid-cols-1 md:grid-cols-12 gap-5">
      <!-- Left: Smart To-do (7 cols) -->
      <div class="md:col-span-7 bg-white border border-slate-200/80 rounded-3xl p-5 shadow-sm flex flex-col min-h-[300px]">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-lg bg-yellow-50 text-yellow-600 flex items-center justify-center text-sm shadow-sm"><i class="fa-solid fa-list-check"></i></div>
            <div>
              <h3 class="font-black text-slate-800 text-sm uppercase tracking-wide">Việc Cần Xử Lý</h3>
              <p class="text-[10px] text-slate-400 font-medium mt-0.5">Các đơn tiệc cần chăm sóc, gọi điện nhắc cọc, hoàn tất món</p>
            </div>
          </div>
          <span class="px-2.5 py-0.5 bg-yellow-50 text-yellow-700 rounded-full font-black text-[10px]">
            {{ todoItems.length }}
          </span>
        </div>

        <div class="space-y-2 pr-1">
          <div v-if="todoItems.length === 0" class="flex flex-col items-center justify-center py-12 text-slate-400">
            <i class="fa-solid fa-circle-check text-4xl text-green-300 mb-3"></i>
            <div class="font-black text-xs uppercase tracking-wider text-slate-700">Tất cả đã hoàn tất!</div>
            <div class="text-[10px] text-slate-400 mt-1">Không có công việc nào đang chờ xử lý.</div>
          </div>
          
          <div
            v-for="todo in displayedTodoItems"
            :key="todo.id"
            class="p-3 border rounded-2xl flex items-center justify-between gap-3 transition-all hover:bg-slate-50"
            :class="{
              'border-rose-100 bg-rose-50/20': todo.type === 'danger',
              'border-amber-100 bg-amber-50/20': todo.type === 'warning',
              'border-blue-100 bg-blue-50/20': todo.type === 'info'
            }"
          >
            <div class="flex items-center gap-3 min-w-0">
              <div class="w-8 h-8 rounded-xl flex items-center justify-center text-xs shrink-0"
                   :class="{
                     'bg-rose-100 text-rose-600': todo.type === 'danger',
                     'bg-amber-100 text-amber-600': todo.type === 'warning',
                     'bg-blue-100 text-blue-600': todo.type === 'info'
                   }">
                <i class="fa-solid" :class="todo.icon"></i>
              </div>
              <div class="min-w-0">
                <div class="font-black text-xs text-slate-800">{{ todo.title }}</div>
                <div class="text-[10px] text-slate-400 font-bold truncate mt-0.5">{{ todo.desc }}</div>
              </div>
            </div>
            <button
              @click="handleTodoAction(todo)"
              class="px-3 py-2 bg-white border rounded-xl font-black text-[9px] uppercase tracking-wider text-slate-700 hover:border-blue-500 hover:text-blue-600 active:scale-95 transition-all shrink-0 shadow-sm"
            >
              {{ todo.actionLabel }}
            </button>
          </div>

          <!-- Xem tất cả / Thu gọn toggle button -->
          <div v-if="todoItems.length > 3" class="pt-2 flex justify-center border-t border-slate-100 mt-2">
            <button @click="showAllTodo = !showAllTodo" class="text-[11px] font-black text-blue-600 hover:text-blue-700 flex items-center gap-1.5 uppercase tracking-wider">
              <span>{{ showAllTodo ? 'Thu gọn' : `Xem tất cả (${todoItems.length})` }}</span>
              <i class="fa-solid" :class="showAllTodo ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
            </button>
          </div>
        </div>
      </div>

      <!-- Right: Quick Calendar Summary (5 cols) -->
      <div class="md:col-span-5 bg-white border border-slate-200/80 rounded-3xl p-5 shadow-sm flex flex-col min-h-[300px]">
        <div class="flex items-center gap-2 mb-4">
          <div class="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-sm shadow-sm"><i class="fa-solid fa-calendar-days"></i></div>
          <div>
            <h3 class="font-black text-slate-800 text-sm uppercase tracking-wide">Lịch Nhanh 7 Ngày</h3>
            <p class="text-[10px] text-slate-400 font-medium mt-0.5">Số lượng bàn đặt trước trong 7 ngày tới</p>
          </div>
        </div>

        <div class="flex-grow overflow-y-auto space-y-2 max-h-[320px] custom-scrollbar pr-1">
          <div
            v-for="day in calendarSummary"
            :key="day.dateStr"
            @click="openTimelineDate(day.dateStr)"
            class="p-3 border border-slate-100 rounded-2xl flex items-center justify-between hover:bg-slate-50 transition-all cursor-pointer active:scale-[0.99]"
            :class="{
              'ring-2 ring-blue-600 ring-offset-2 bg-blue-50/10': day.isToday,
              'bg-slate-50/20': day.isTomorrow
            }"
          >
            <div class="flex items-center gap-3">
              <div class="w-11 h-11 rounded-xl flex flex-col items-center justify-center font-black shrink-0 border border-slate-200/50"
                   :class="day.isToday ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-100 text-slate-600'">
                <span class="text-xs leading-none font-black mt-1">{{ day.dayOfMonth }}</span>
                <span class="text-[9px] uppercase font-black tracking-wider leading-none mb-1 mt-0.5" :class="day.isToday ? 'text-blue-100' : 'text-slate-400'">{{ day.shortLabel }}</span>
              </div>
              <div>
                <div class="font-black text-xs text-slate-800 flex items-center gap-2">
                  <span>{{ day.label }}</span>
                  <span v-if="day.isToday" class="text-[8px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-black uppercase">Hôm nay</span>
                </div>
                <div class="text-[9px] text-slate-400 font-bold mt-0.5">{{ day.dateStr }}</div>
              </div>
            </div>
            
            <div class="flex items-center gap-2 shrink-0">
              <div v-if="day.bookings > 0" class="text-right flex flex-col items-end gap-0.5">
                <span class="px-2.5 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-lg font-black text-[10px] uppercase tracking-wide">
                  {{ day.bookings }} tiệc
                </span>
                <span class="text-[9px] font-black text-slate-500 uppercase tracking-wider pr-1">
                  {{ day.guests }} khách
                </span>
              </div>
              <div v-else class="text-[10px] text-slate-300 font-semibold italic pr-1">
                Trống
              </div>
              <i class="fa-solid fa-chevron-right text-[10px] text-slate-300"></i>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Recent Operations Section -->
    <div class="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-sm">
      <div class="flex items-center gap-2 mb-4">
        <div class="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center text-sm shadow-sm"><i class="fa-solid fa-clock-rotate-left"></i></div>
        <div>
          <h3 class="font-black text-slate-800 text-sm uppercase tracking-wide">Thao Tác Gần Đây</h3>
          <p class="text-[10px] text-slate-400 font-medium mt-0.5">Các phiếu đặt bàn vừa được tạo hoặc sửa đổi trên hệ thống</p>
        </div>
      </div>

      <div class="overflow-x-auto w-full border border-slate-100 rounded-2xl bg-slate-50/30">
        <table class="w-full text-left border-collapse min-w-[600px] text-xs">
          <thead>
            <tr class="bg-slate-100 text-slate-500 font-black uppercase tracking-wider border-b border-slate-200">
              <th class="p-3 w-36">Thời gian sửa</th>
              <th class="p-3">Khách hàng</th>
              <th class="p-3 w-28">Số bàn</th>
              <th class="p-3 w-28">Trạng thái cọc</th>
              <th class="p-3 w-32 text-right">Tổng tiền</th>
              <th class="p-3 w-20 text-center">Thao tác</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-if="recentOperations.length === 0">
              <td colspan="6" class="p-8 text-center text-slate-400 font-semibold">Chưa có thao tác nào gần đây. Hãy tạo một phiếu mới!</td>
            </tr>
            <tr v-for="order in recentOperations" :key="order.id" class="hover:bg-slate-50 transition-colors">
              <td class="p-3 text-[10px] font-mono text-slate-400 font-semibold">
                {{ new Date(order.timestamp || Date.now()).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) }}
              </td>
              <td class="p-3">
                <div class="font-black text-slate-800">{{ order.parsedCustomer.name }}</div>
                <div class="text-[10px] text-slate-400 font-bold mt-0.5 flex items-center gap-2">
                  <span>{{ order.parsedCustomer.phone }}</span>
                  <span>•</span>
                  <span>{{ order.parsedCustomer.date }} ({{ order.parsedCustomer.time || '18:00' }})</span>
                </div>
              </td>
              <td class="p-3">
                <span v-if="order.parsedCustomer.tables" class="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded text-[10px] font-black uppercase">
                  Bàn {{ order.parsedCustomer.tables }}
                </span>
                <span v-else class="text-slate-400 italic text-[10px]">Chưa xếp</span>
              </td>
              <td class="p-3">
                <span class="px-2.5 py-0.5 rounded-full font-black text-[9px] uppercase tracking-wider"
                      :class="order.isDeposited ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-rose-50 text-rose-700 border border-rose-200'">
                  {{ order.isDeposited ? 'Đã cọc' : 'Chưa cọc' }}
                </span>
              </td>
              <td class="p-3 font-black text-slate-800 text-right">
                {{ formatVND(order.totalAmount) }}
              </td>
              <td class="p-3 text-center">
                <button
                  @click="handleRecentClick(order)"
                  class="px-2.5 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg hover:border-blue-500 hover:text-blue-600 active:scale-95 transition-all text-[10px] font-bold shadow-sm"
                >
                  Sửa
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
