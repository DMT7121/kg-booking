<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useAppStore } from '@/stores/useAppStore'
import { useUIStore } from '@/stores/useUIStore'
import { formatVND } from '@/utils'

const appStore = useAppStore()
const ui = useUIStore()

// Tab Navigation
const activeTab = ref('overview')
const tabs = [
  { id: 'overview', name: 'Tổng Quan', icon: 'fa-chart-pie' },
  { id: 'dishes', name: 'Báo Cáo Món Ăn', icon: 'fa-bowl-food' },
  { id: 'kitchen', name: 'Màn Bếp & Bar', icon: 'fa-kitchen-set' },
  { id: 'crm', name: 'CRM & Xuất File', icon: 'fa-file-excel' }
]

// Today's date helper
const todayStr = () => {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

// Kitchen Date Selector & Sync
const selectedKitchenDate = ref(ui.selectedTimelineDate || todayStr())
watch(() => ui.selectedTimelineDate, (val) => {
  if (val) selectedKitchenDate.value = val
})

// Kitchen prepared local checkboxes
const preparedItems = ref<Record<string, boolean>>(JSON.parse(localStorage.getItem('kg_kitchen_prepared') || '{}'))
function togglePrepared(key: string) {
  preparedItems.value[key] = !preparedItems.value[key]
  localStorage.setItem('kg_kitchen_prepared', JSON.stringify(preparedItems.value))
}

// Filters for Dish Report
const dishCategoryFilter = ref<'all' | 'food' | 'drink' | 'set'>('all')
const dishSearchQuery = ref('')

// Filters for CRM List
const crmSearchQuery = ref('')
const crmClassFilter = ref<'all' | 'VIP' | 'Khách quen' | 'Khách mới'>('all')

// --- GENERAL STATS ---
const stats = computed(() => {
  const groups = appStore.groupedHistory
  const keys = Object.keys(groups)
  let totalRevenue = 0
  let totalPax = 0
  let totalBookings = keys.length
  let depositedCount = 0
  const dishCounts: Record<string, { qty: number, revenue: number }> = {}
  const staffKPIs: Record<string, { bookings: number, revenue: number, pax: number }> = {}

  const last7Days: { date: string, display: string, revenue: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const isoDate = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0]
    last7Days.push({
      date: isoDate,
      display: `${d.getDate()}/${d.getMonth()+1}`,
      revenue: 0
    })
  }

  keys.forEach(key => {
    const order = groups[key].latest
    totalPax += Number(order.parsedCustomer?.pax) || 0
    totalRevenue += order.totalAmount || 0
    if (order.isDeposited) {
      depositedCount++
    }
    
    if (order.timestamp) {
      const orderDate = new Date(new Date(order.timestamp).getTime() - (new Date(order.timestamp).getTimezoneOffset() * 60000)).toISOString().split('T')[0]
      const dayStat = last7Days.find(d => d.date === orderDate)
      if (dayStat) {
        dayStat.revenue += (order.totalAmount || 0)
      }
    }

    if (order.menuItems && Array.isArray(order.menuItems)) {
      order.menuItems.forEach((item: any) => {
        const name = item.name
        if (!name) return
        if (!dishCounts[name]) dishCounts[name] = { qty: 0, revenue: 0 }
        const qty = Number(item.qty) || 0
        const price = Number(item.price) || 0
        dishCounts[name].qty += qty
        dishCounts[name].revenue += (qty * price)
      })
    }
    
    const staffName = order.staff?.name || 'Admin'
    if (!staffKPIs[staffName]) staffKPIs[staffName] = { bookings: 0, revenue: 0, pax: 0 }
    staffKPIs[staffName].bookings++
    staffKPIs[staffName].revenue += order.totalAmount || 0
    staffKPIs[staffName].pax += Number(order.parsedCustomer?.pax) || 0
  })
  
  const maxRevenue = Math.max(...last7Days.map(d => d.revenue), 1)

  const topDishes = Object.keys(dishCounts).map(name => ({
    name,
    qty: dishCounts[name].qty,
    revenue: dishCounts[name].revenue
  })).sort((a, b) => b.qty - a.qty).slice(0, 5)

  const leaderboard = Object.keys(staffKPIs).map(name => ({
    name,
    ...staffKPIs[name]
  })).sort((a, b) => b.revenue - a.revenue)

  return {
    totalRevenue,
    totalPax,
    totalBookings,
    depositRate: totalBookings ? Math.round((depositedCount / totalBookings) * 100) : 0,
    topDishes,
    leaderboard,
    last7Days,
    maxRevenue
  }
})

// --- DETAILED DISHES DATA ---
const detailedDishes = computed(() => {
  const dishCounts: Record<string, { name: string, qty: number, price: number, revenue: number, category: 'food' | 'drink' | 'set' }> = {}
  
  appStore.historyList.forEach(order => {
    if (order.menuItems && Array.isArray(order.menuItems)) {
      order.menuItems.forEach((item: any) => {
        const name = item.name
        if (!name) return
        if (!dishCounts[name]) {
          let category: 'food' | 'drink' | 'set' = 'food'
          const norm = name.toLowerCase()
          if (/set|combo|goi|phan/i.test(norm)) {
            category = 'set'
          } else {
            const isDrink = ['bia', 'nuoc', 'nước', 'rượu', 'ruou', 'coca', 'pepsi', 'sprite', 'fanta', 'suoi', 'sữa', 'sua', 'tiger', 'heineken', 'sai gon', 'hanoi', 'trà', 'tra'].some(k => norm.includes(k))
            if (isDrink) category = 'drink'
          }
          
          dishCounts[name] = {
            name,
            qty: 0,
            price: Number(item.price) || 0,
            revenue: 0,
            category
          }
        }
        
        const qty = Number(item.qty) || 0
        dishCounts[name].qty += qty
        dishCounts[name].revenue += (qty * dishCounts[name].price)
      })
    }
  })
  
  let list = Object.values(dishCounts)

  // Apply search
  if (dishSearchQuery.value.trim()) {
    const q = dishSearchQuery.value.toLowerCase()
    list = list.filter(d => d.name.toLowerCase().includes(q))
  }

  // Apply category filter
  if (dishCategoryFilter.value !== 'all') {
    list = list.filter(d => d.category === dishCategoryFilter.value)
  }

  return list.sort((a, b) => b.qty - a.qty)
})

// --- KITCHEN/BAR PREP GROUPING ---
const kitchenBarItems = computed(() => {
  const targetDate = selectedKitchenDate.value
  // Filter for unique latest version of bookings
  const groups = appStore.groupedHistory
  const activeOrders = Object.values(groups).map(g => g.latest).filter(o => o.parsedCustomer?.date === targetDate)
  
  const kitchen: Record<string, { name: string, qty: number, tables: string[], notes: string[] }> = {}
  const bar: Record<string, { name: string, qty: number, tables: string[], notes: string[] }> = {}
  
  activeOrders.forEach(order => {
    const table = order.parsedCustomer?.tables || 'Bàn ?'
    if (order.menuItems && Array.isArray(order.menuItems)) {
      order.menuItems.forEach((item: any) => {
        const name = item.name
        if (!name) return
        const qty = Number(item.qty) || 0
        const note = item.note || item.notes || ''
        
        const norm = name.toLowerCase()
        const isDrink = ['bia', 'nuoc', 'nước', 'rượu', 'ruou', 'coca', 'pepsi', 'sprite', 'fanta', 'suoi', 'sữa', 'sua', 'tiger', 'heineken', 'sai gon', 'hanoi', 'trà', 'tra'].some(k => norm.includes(k))
        
        const targetGroup = isDrink ? bar : kitchen
        if (!targetGroup[name]) {
          targetGroup[name] = { name, qty: 0, tables: [], notes: [] }
        }
        
        targetGroup[name].qty += qty
        if (!targetGroup[name].tables.includes(table)) {
          targetGroup[name].tables.push(table)
        }
        if (note && !targetGroup[name].notes.includes(note)) {
          targetGroup[name].notes.push(note)
        }
      })
    }
  })
  
  return {
    kitchen: Object.values(kitchen).sort((a, b) => b.qty - a.qty),
    bar: Object.values(bar).sort((a, b) => b.qty - a.qty)
  }
})

// --- CRM PROFILES ---
const crmProfiles = computed(() => {
  const profiles: Record<string, {
    name: string
    phone: string
    visits: number
    spend: number
    noshows: number
    vipStatus: 'VIP' | 'Khách quen' | 'Khách mới'
    lastDate: string
  }> = {}

  // Filter groups
  const groups = appStore.groupedHistory
  const activeOrders = Object.values(groups).map(g => g.latest)

  activeOrders.forEach(order => {
    if (!order.parsedCustomer || !order.parsedCustomer.phone) return
    const phone = order.parsedCustomer.phone
    if (!profiles[phone]) {
      const vip = appStore.getCrmStatus(phone)
      profiles[phone] = {
        name: order.parsedCustomer.name,
        phone,
        visits: 0,
        spend: 0,
        noshows: 0,
        vipStatus: vip as any || 'Khách mới',
        lastDate: order.parsedCustomer.date || ''
      }
    }
    
    const p = profiles[phone]
    p.visits++
    p.spend += order.totalAmount || 0
    
    const note = (order.parsedCustomer.note || '').toLowerCase()
    if (note.includes('huy') || note.includes('hủy') || note.includes('cancel') || note.includes('no show') || note.includes('noshow') || note.includes('bom')) {
      p.noshows++
    }
    
    if (order.parsedCustomer.date) {
      const d1 = new Date(order.parsedCustomer.date.split('/').reverse().join('-')).getTime()
      const d2 = p.lastDate ? new Date(p.lastDate.split('/').reverse().join('-')).getTime() : 0
      if (d1 > d2) p.lastDate = order.parsedCustomer.date
    }
  })

  let list = Object.values(profiles)

  // Apply search
  if (crmSearchQuery.value.trim()) {
    const q = crmSearchQuery.value.toLowerCase()
    list = list.filter(p => p.name.toLowerCase().includes(q) || p.phone.includes(q))
  }

  // Apply filter
  if (crmClassFilter.value !== 'all') {
    list = list.filter(p => p.vipStatus === crmClassFilter.value)
  }

  return list.sort((a, b) => b.spend - a.spend)
})

// --- EXPORT TO CSV HELPERS ---
function downloadCSV(filename: string, headers: string[], rows: any[][]) {
  const BOM = '\uFEFF'
  const csvContent = BOM + [
    headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n')
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  ui.showToast(`Đã tải xuống file ${filename}!`, 'success')
}

function exportDishesCSV() {
  const headers = ['Tên Món', 'Phân Loại', 'Số Lượng Đã Bán', 'Đơn Giá', 'Doanh Thu']
  const rows = detailedDishes.value.map(d => [
    d.name,
    d.category === 'set' ? 'Combo/Set' : d.category === 'drink' ? 'Đồ uống' : 'Món ăn',
    d.qty,
    d.price,
    d.revenue
  ])
  downloadCSV('Bao_Cao_Mon_An_Kings_Grill.csv', headers, rows)
}

function exportCRMCSV() {
  const headers = ['Tên Khách Hàng', 'Số Điện Thoại', 'Phân Hạng', 'Số Lần Đặt', 'Tổng Chi Tiêu', 'Số Lần Hủy/No-show', 'Ngày Đặt Gần Nhất']
  const rows = crmProfiles.value.map(p => [
    p.name,
    p.phone,
    p.vipStatus,
    p.visits,
    p.spend,
    p.noshows,
    p.lastDate
  ])
  downloadCSV('Danh_Sach_CRM_Khach_Hang.csv', headers, rows)
}

function exportBookingsCSV() {
  const headers = ['Mã Đơn', 'Tên Khách Hàng', 'Số Điện Thoại', 'Ngày Đặt', 'Giờ Đặt', 'Số Khách', 'Bàn Xếp', 'Tổng Tiền', 'Tiền Cọc', 'Trạng Thái Cọc', 'Ghi Chú']
  const rows = appStore.historyList.map(o => [
    o.id,
    o.parsedCustomer?.name || '',
    o.parsedCustomer?.phone || '',
    o.parsedCustomer?.date || '',
    o.parsedCustomer?.time || '',
    o.parsedCustomer?.pax || '',
    o.parsedCustomer?.tables || '',
    o.totalAmount || 0,
    o.depositAmount || 0,
    o.isDeposited ? 'Đã cọc' : 'Chưa cọc',
    o.parsedCustomer?.note || ''
  ])
  downloadCSV('Danh_Sach_Toan_Bo_Booking.csv', headers, rows)
}

function triggerKitchenPrint() {
  window.print()
}

</script>

<template>
  <div class="flex-grow flex flex-col min-h-0 bg-slate-50 text-[13px] relative z-0">
    
    <!-- Tab Controls Header -->
    <div class="flex border-b border-slate-200 bg-white px-4 md:px-6 shrink-0 relative z-10 shadow-sm overflow-x-auto scrollbar-none gap-2">
      <button 
        v-for="t in tabs" 
        :key="t.id"
        @click="activeTab = t.id"
        :class="['py-3.5 px-4 font-black text-xs uppercase tracking-wider border-b-[3px] transition-all flex items-center gap-2 active:scale-95 shrink-0', 
          activeTab === t.id ? 'border-blue-600 text-blue-700 bg-blue-50/20' : 'border-transparent text-slate-500 hover:text-slate-700']"
      >
        <i class="fa-solid" :class="t.icon"></i>
        <span>{{ t.name }}</span>
      </button>
    </div>

    <!-- Main View Panel Scroll Area -->
    <div class="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 space-y-6 custom-scrollbar print:p-0">
      
      <!-- TAB 1: OVERVIEW -->
      <div v-if="activeTab === 'overview'" class="space-y-6">
        <div class="text-center md:text-left flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h2 class="text-2xl font-black text-blue-900 uppercase tracking-tight">Thống Kê Tổng Quan</h2>
            <p class="text-xs font-bold text-slate-500 mt-1">Phân tích dữ liệu doanh thu và năng suất hoạt động</p>
          </div>
          <button @click="exportBookingsCSV" class="bg-blue-600 hover:bg-blue-700 text-white font-black text-xs px-4 py-2.5 rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-1.5 border border-blue-500">
            <i class="fa-solid fa-file-csv"></i> XUẤT TOÀN BỘ BOOKING
          </button>
        </div>

        <!-- Quick Stats Grid -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-col items-center md:items-start">
            <div class="w-10 h-10 rounded-xl bg-blue-50 text-blue-500 flex items-center justify-center text-lg mb-3"><i class="fa-solid fa-money-bill-trend-up"></i></div>
            <div class="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">Tổng Doanh Thu</div>
            <div class="text-lg md:text-xl font-black text-blue-900">{{ formatVND(stats.totalRevenue) }}</div>
          </div>
          
          <div class="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-col items-center md:items-start">
            <div class="w-10 h-10 rounded-xl bg-purple-50 text-purple-500 flex items-center justify-center text-lg mb-3"><i class="fa-solid fa-users"></i></div>
            <div class="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">Tổng Khách</div>
            <div class="text-lg md:text-xl font-black text-slate-800">{{ stats.totalPax }} <span class="text-xs font-bold text-slate-400 normal-case">khách</span></div>
          </div>
          
          <div class="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-col items-center md:items-start">
            <div class="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-500 flex items-center justify-center text-lg mb-3"><i class="fa-solid fa-file-invoice"></i></div>
            <div class="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">Tổng Đơn</div>
            <div class="text-lg md:text-xl font-black text-slate-800">{{ stats.totalBookings }} <span class="text-xs font-bold text-slate-400 normal-case">phiếu</span></div>
          </div>
          
          <div class="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-col items-center md:items-start">
            <div class="w-10 h-10 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center text-lg mb-3"><i class="fa-solid fa-percent"></i></div>
            <div class="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">Tỷ Lệ Chốt Cọc</div>
            <div class="text-lg md:text-xl font-black text-slate-800">{{ stats.depositRate }}%</div>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          <!-- Top Dishes -->
          <div class="lg:col-span-1 bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col">
            <h3 class="text-sm font-black text-slate-700 uppercase tracking-wide mb-4 flex items-center gap-2">
              <i class="fa-solid fa-fire text-orange-500"></i> Top 5 Món Bán Chạy
            </h3>
            
            <div v-if="stats.topDishes.length > 0" class="space-y-4 flex-1">
              <div v-for="(dish, index) in stats.topDishes" :key="dish.name" class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full flex items-center justify-center font-black text-xs shrink-0" 
                     :class="index === 0 ? 'bg-amber-100 text-amber-600' : index === 1 ? 'bg-slate-100 text-slate-500' : index === 2 ? 'bg-orange-50 text-orange-400' : 'bg-slate-50 text-slate-400'">
                  {{ index + 1 }}
                </div>
                <div class="flex-1 min-w-0">
                  <div class="font-bold text-[13px] text-slate-800 truncate">{{ dish.name }}</div>
                  <div class="text-[10px] font-bold text-slate-400">{{ dish.qty }} phần</div>
                </div>
                <div class="text-right shrink-0">
                  <div class="font-black text-blue-900 text-[13px]">{{ formatVND(dish.revenue) }}</div>
                </div>
              </div>
            </div>
            <div v-else class="flex-1 flex flex-col items-center justify-center text-center py-8">
              <i class="fa-solid fa-plate-wheat text-3xl text-slate-200 mb-2"></i>
              <p class="text-xs font-bold text-slate-400">Chưa có dữ liệu món ăn</p>
            </div>
          </div>

          <!-- Charts Area -->
          <div class="lg:col-span-2 bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-100 flex flex-col min-h-[300px]">
            <h3 class="text-sm font-black text-slate-700 uppercase tracking-wide mb-8 flex items-center gap-2">
              <i class="fa-solid fa-chart-simple text-blue-500"></i> Xu hướng doanh thu 7 ngày qua
            </h3>
            
            <div class="flex-1 flex items-end gap-2 md:gap-4 h-[200px] mt-auto">
              <div v-for="day in stats.last7Days" :key="day.date" class="flex-1 flex flex-col items-center gap-2 group h-full">
                <div class="relative w-full flex justify-center flex-1 items-end">
                  <div class="absolute -top-10 bg-blue-900 text-white text-[10px] font-bold py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10 shadow-lg after:content-[''] after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:border-4 after:border-transparent after:border-t-blue-900">
                    {{ formatVND(day.revenue) }}
                  </div>
                  <div class="w-full max-w-[40px] bg-slate-100 group-hover:bg-blue-100 rounded-t-lg transition-all duration-500 relative overflow-hidden" 
                       :style="{ height: `${(day.revenue / stats.maxRevenue) * 100}%`, minHeight: day.revenue > 0 ? '4px' : '2px' }">
                    <div class="absolute bottom-0 w-full bg-blue-500 rounded-t-lg shadow-[inset_0_2px_4px_rgba(255,255,255,0.3)] transition-all duration-500 group-hover:bg-blue-600" :style="{ height: '100%' }"></div>
                  </div>
                </div>
                <div class="text-[10px] font-bold text-slate-400 group-hover:text-blue-900 transition-colors">{{ day.display }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Leaderboard -->
        <div class="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-100">
          <h3 class="text-sm font-black text-slate-700 uppercase tracking-wide mb-6 flex items-center gap-2">
            <i class="fa-solid fa-trophy text-yellow-500"></i> Bảng Xếp Hạng KPIs (Nhân Viên)
          </h3>
          <div v-if="stats.leaderboard.length > 0" class="overflow-x-auto w-full custom-scrollbar pb-2">
            <table class="w-full text-left border-collapse min-w-[500px]">
              <thead>
                <tr class="border-b border-slate-200">
                  <th class="py-3 px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">Hạng</th>
                  <th class="py-3 px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">Nhân Viên</th>
                  <th class="py-3 px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Số Phiếu</th>
                  <th class="py-3 px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Số Khách</th>
                  <th class="py-3 px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Doanh Thu</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                <tr v-for="(staff, index) in stats.leaderboard" :key="staff.name" class="hover:bg-slate-50 transition-colors group">
                  <td class="py-3 px-2">
                    <div class="w-8 h-8 rounded-xl flex items-center justify-center font-black text-[13px] shadow-sm"
                         :class="index === 0 ? 'bg-gradient-to-br from-yellow-300 to-yellow-500 text-white' : index === 1 ? 'bg-gradient-to-br from-slate-300 to-slate-400 text-white' : index === 2 ? 'bg-gradient-to-br from-orange-300 to-orange-400 text-white' : 'bg-slate-100 text-slate-500'">
                      <i v-if="index < 3" class="fa-solid fa-medal mr-0.5 text-[10px]"></i>{{ index + 1 }}
                    </div>
                  </td>
                  <td class="py-3 px-2">
                    <div class="font-bold text-sm text-slate-800">{{ staff.name }}</div>
                    <div class="text-[10px] text-slate-400 font-medium mt-0.5">Rank: <span class="font-black text-blue-500" v-if="index === 0">KIM CƯƠNG</span><span class="font-black text-yellow-500" v-else-if="index === 1">VÀNG</span><span class="font-black text-slate-500" v-else-if="index === 2">BẠC</span><span class="font-bold text-slate-400" v-else>ĐỒNG</span></div>
                  </td>
                  <td class="py-3 px-2 text-center font-black text-slate-600 text-[13px]">{{ staff.bookings }}</td>
                  <td class="py-3 px-2 text-center font-bold text-slate-500">{{ staff.pax }} <i class="fa-solid fa-user text-[9px] text-slate-300 ml-0.5"></i></td>
                  <td class="py-3 px-2 text-right">
                    <div class="font-black text-blue-900 text-sm">{{ formatVND(staff.revenue) }}</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- TAB 2: DETAILED DISHES -->
      <div v-if="activeTab === 'dishes'" class="space-y-6">
        <div class="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
          <div>
            <h2 class="text-2xl font-black text-blue-900 uppercase tracking-tight">Chi Tiết Món Ăn & Đồ Uống</h2>
            <p class="text-xs font-bold text-slate-500 mt-1">Xếp hạng và doanh số chi tiết theo từng món thực đơn</p>
          </div>
          <button @click="exportDishesCSV" class="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs px-4 py-2.5 rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-1.5 border border-emerald-500 shrink-0 self-start md:self-auto">
            <i class="fa-solid fa-file-excel"></i> XUẤT CSV MÓN ĂN
          </button>
        </div>

        <!-- Filter Bar -->
        <div class="flex flex-col sm:flex-row gap-3 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
          <div class="relative flex-1">
            <i class="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"></i>
            <input v-model="dishSearchQuery" type="text" placeholder="Tìm tên món ăn/đồ uống..." class="w-full pl-10 pr-4 py-2 text-xs font-bold border border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all">
          </div>
          <div class="flex gap-2">
            <button 
              v-for="cat in [
                { id: 'all', name: 'Tất cả' },
                { id: 'food', name: 'Món ăn' },
                { id: 'drink', name: 'Đồ uống' },
                { id: 'set', name: 'Set/Combo' }
              ]" 
              :key="cat.id"
              @click="dishCategoryFilter = cat.id as any"
              :class="['px-3 py-2 rounded-xl text-xs font-bold border transition-all active:scale-95', 
                dishCategoryFilter === cat.id ? 'bg-blue-900 border-blue-900 text-white' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100']"
            >
              {{ cat.name }}
            </button>
          </div>
        </div>

        <!-- Table -->
        <div class="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
          <div class="overflow-x-auto w-full custom-scrollbar">
            <table class="w-full text-left border-collapse min-w-[500px]">
              <thead>
                <tr class="border-b border-slate-200">
                  <th class="py-3 px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">Tên Món Ăn</th>
                  <th class="py-3 px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Phân Loại</th>
                  <th class="py-3 px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Số Lượng Đã Bán</th>
                  <th class="py-3 px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Đơn Giá</th>
                  <th class="py-3 px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Tổng Doanh Thu</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                <tr v-for="dish in detailedDishes" :key="dish.name" class="hover:bg-slate-50 transition-colors">
                  <td class="py-3 px-2 font-bold text-slate-800">{{ dish.name }}</td>
                  <td class="py-3 px-2 text-center">
                    <span :class="['px-2.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider', 
                      dish.category === 'set' ? 'bg-purple-100 text-purple-700' :
                      dish.category === 'drink' ? 'bg-cyan-100 text-cyan-700' : 'bg-emerald-100 text-emerald-700']">
                      {{ dish.category === 'set' ? 'Combo/Set' : dish.category === 'drink' ? 'Đồ uống' : 'Món ăn' }}
                    </span>
                  </td>
                  <td class="py-3 px-2 text-center font-black text-slate-700">{{ dish.qty }}</td>
                  <td class="py-3 px-2 text-right text-slate-500 font-bold">{{ formatVND(dish.price) }}</td>
                  <td class="py-3 px-2 text-right font-black text-blue-900">{{ formatVND(dish.revenue) }}</td>
                </tr>
                <tr v-if="detailedDishes.length === 0">
                  <td colspan="5" class="py-10 text-center text-slate-400 font-bold">Không tìm thấy món ăn nào khớp với bộ lọc</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- TAB 3: KITCHEN/BAR PREPARATION -->
      <div v-if="activeTab === 'kitchen'" class="space-y-6 print:space-y-4">
        <div class="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 print:hidden">
          <div>
            <h2 class="text-2xl font-black text-blue-900 uppercase tracking-tight">Màn Hình Tổng Hợp Bếp & Bar</h2>
            <p class="text-xs font-bold text-slate-500 mt-1">Gom nhóm toàn bộ thực đơn cần phục vụ theo ngày đặt</p>
          </div>
          <div class="flex items-center gap-2">
            <input v-model="selectedKitchenDate" type="text" placeholder="DD/MM/YYYY" class="w-32 text-center py-2.5 border border-slate-200 rounded-xl outline-none text-xs font-bold bg-white focus:border-blue-500">
            <button @click="triggerKitchenPrint" class="bg-gray-800 hover:bg-gray-900 text-white font-black text-xs px-4 py-2.5 rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-1.5 shrink-0">
              <i class="fa-solid fa-print"></i> IN DANH SÁCH
            </button>
          </div>
        </div>

        <!-- Print Header -->
        <div class="hidden print:block border-b-2 border-slate-900 pb-3 mb-4">
          <h1 class="text-xl font-black text-center uppercase">DANH SÁCH CHUẨN BỊ MÓN ĂN / ĐỒ UỐNG</h1>
          <p class="text-xs font-black text-center mt-1">NGÀY PHỤC VỤ: {{ selectedKitchenDate }}</p>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 print:grid-cols-1">
          
          <!-- KITCHEN SECTION -->
          <div class="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col print:border-none print:shadow-none print:p-0">
            <h3 class="text-sm font-black text-emerald-700 uppercase tracking-wider mb-4 pb-2 border-b border-emerald-50 flex items-center justify-between">
              <span class="flex items-center gap-2"><i class="fa-solid fa-fire-burner"></i> Bếp Nấu (Món ăn / Set)</span>
              <span class="text-xs text-slate-400 normal-case font-bold">{{ kitchenBarItems.kitchen.length }} món</span>
            </h3>

            <div class="space-y-3 flex-grow divide-y divide-slate-100">
              <div v-for="item in kitchenBarItems.kitchen" :key="item.name" class="pt-3 flex items-start justify-between gap-3 group">
                <div class="flex items-start gap-3 flex-1 min-w-0">
                  <!-- Custom checkbox for prepared status -->
                  <button @click="togglePrepared('kitchen-' + selectedKitchenDate + '-' + item.name)" 
                          class="w-5 h-5 rounded border flex items-center justify-center shrink-0 mt-0.5 transition-colors print:hidden"
                          :class="preparedItems['kitchen-' + selectedKitchenDate + '-' + item.name] ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 hover:border-slate-400 bg-white'">
                    <i class="fa-solid fa-check text-[10px]"></i>
                  </button>
                  <div class="min-w-0 flex-1">
                    <div class="font-extrabold text-[13px] text-slate-800" 
                         :class="{ 'line-through text-slate-400 decoration-slate-400': preparedItems['kitchen-' + selectedKitchenDate + '-' + item.name] }">
                      {{ item.name }}
                    </div>
                    <div class="text-[10px] font-bold text-slate-400 mt-1 flex flex-wrap gap-1.5 items-center">
                      <span class="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                        <i class="fa-solid fa-chair text-[8px]"></i> Bàn: {{ item.tables.join(', ') }}
                      </span>
                      <span v-for="(note, idx) in item.notes" :key="idx" class="bg-rose-50 text-rose-700 border border-rose-100 px-1.5 py-0.5 rounded font-black italic">
                        ⭐ {{ note }}
                      </span>
                    </div>
                  </div>
                </div>
                <div class="text-right shrink-0">
                  <div class="font-black text-lg text-emerald-600" :class="{ 'text-slate-300 line-through': preparedItems['kitchen-' + selectedKitchenDate + '-' + item.name] }">
                    x{{ item.qty }}
                  </div>
                </div>
              </div>
              <div v-if="kitchenBarItems.kitchen.length === 0" class="py-8 text-center text-slate-400 font-bold">
                Không có món ăn nào cho ngày đã chọn
              </div>
            </div>
          </div>

          <!-- BAR SECTION -->
          <div class="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col print:border-none print:shadow-none print:p-0">
            <h3 class="text-sm font-black text-blue-700 uppercase tracking-wider mb-4 pb-2 border-b border-blue-50 flex items-center justify-between">
              <span class="flex items-center gap-2"><i class="fa-solid fa-beer-mug-empty"></i> Quầy Bar / Đồ Uống</span>
              <span class="text-xs text-slate-400 normal-case font-bold">{{ kitchenBarItems.bar.length }} loại</span>
            </h3>

            <div class="space-y-3 flex-grow divide-y divide-slate-100">
              <div v-for="item in kitchenBarItems.bar" :key="item.name" class="pt-3 flex items-start justify-between gap-3 group">
                <div class="flex items-start gap-3 flex-1 min-w-0">
                  <button @click="togglePrepared('bar-' + selectedKitchenDate + '-' + item.name)" 
                          class="w-5 h-5 rounded border flex items-center justify-center shrink-0 mt-0.5 transition-colors print:hidden"
                          :class="preparedItems['bar-' + selectedKitchenDate + '-' + item.name] ? 'bg-blue-500 border-blue-500 text-white' : 'border-slate-300 hover:border-slate-400 bg-white'">
                    <i class="fa-solid fa-check text-[10px]"></i>
                  </button>
                  <div class="min-w-0 flex-1">
                    <div class="font-extrabold text-[13px] text-slate-800" 
                         :class="{ 'line-through text-slate-400 decoration-slate-400': preparedItems['bar-' + selectedKitchenDate + '-' + item.name] }">
                      {{ item.name }}
                    </div>
                    <div class="text-[10px] font-bold text-slate-400 mt-1 flex flex-wrap gap-1.5 items-center">
                      <span class="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                        <i class="fa-solid fa-chair text-[8px]"></i> Bàn: {{ item.tables.join(', ') }}
                      </span>
                      <span v-for="(note, idx) in item.notes" :key="idx" class="bg-rose-50 text-rose-700 border border-rose-100 px-1.5 py-0.5 rounded font-black italic">
                        ⭐ {{ note }}
                      </span>
                    </div>
                  </div>
                </div>
                <div class="text-right shrink-0">
                  <div class="font-black text-lg text-blue-600" :class="{ 'text-slate-300 line-through': preparedItems['bar-' + selectedKitchenDate + '-' + item.name] }">
                    x{{ item.qty }}
                  </div>
                </div>
              </div>
              <div v-if="kitchenBarItems.bar.length === 0" class="py-8 text-center text-slate-400 font-bold">
                Không có đồ uống nào cho ngày đã chọn
              </div>
            </div>
          </div>

        </div>
      </div>

      <!-- TAB 4: CRM & EXPORTS -->
      <div v-if="activeTab === 'crm'" class="space-y-6">
        <div class="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
          <div>
            <h2 class="text-2xl font-black text-blue-900 uppercase tracking-tight">Hồ Sơ Khách Hàng (CRM)</h2>
            <p class="text-xs font-bold text-slate-500 mt-1">Danh sách thông tin chăm sóc khách hàng và các công cụ xuất báo cáo Excel</p>
          </div>
          <div class="flex flex-wrap gap-2 shrink-0">
            <button @click="exportCRMCSV" class="bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs px-4 py-2.5 rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-1.5 border border-indigo-500">
              <i class="fa-solid fa-file-csv"></i> XUẤT CSV KHÁCH HÀNG
            </button>
            <button @click="exportBookingsCSV" class="bg-blue-600 hover:bg-blue-700 text-white font-black text-xs px-4 py-2.5 rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-1.5 border border-blue-500">
              <i class="fa-solid fa-file-excel"></i> XUẤT DATABASE BOOKING
            </button>
          </div>
        </div>

        <!-- Filter CRM Bar -->
        <div class="flex flex-col sm:flex-row gap-3 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
          <div class="relative flex-1">
            <i class="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"></i>
            <input v-model="crmSearchQuery" type="text" placeholder="Tìm tên khách hàng hoặc số điện thoại..." class="w-full pl-10 pr-4 py-2 text-xs font-bold border border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all">
          </div>
          <div class="flex gap-2">
            <button 
              v-for="cl in [
                { id: 'all', name: 'Tất cả' },
                { id: 'VIP', name: 'VIP' },
                { id: 'Khách quen', name: 'Khách quen' },
                { id: 'Khách mới', name: 'Khách mới' }
              ]" 
              :key="cl.id"
              @click="crmClassFilter = cl.id as any"
              :class="['px-3 py-2 rounded-xl text-xs font-bold border transition-all active:scale-95', 
                crmClassFilter === cl.id ? 'bg-blue-900 border-blue-900 text-white' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100']"
            >
              {{ cl.name }}
            </button>
          </div>
        </div>

        <!-- CRM Table -->
        <div class="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
          <div class="overflow-x-auto w-full custom-scrollbar">
            <table class="w-full text-left border-collapse min-w-[500px]">
              <thead>
                <tr class="border-b border-slate-200">
                  <th class="py-3 px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">Họ & Tên</th>
                  <th class="py-3 px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">Số Điện Thoại</th>
                  <th class="py-3 px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Phân Hạng</th>
                  <th class="py-3 px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Số Lượt Đặt</th>
                  <th class="py-3 px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Hủy/No-show</th>
                  <th class="py-3 px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Tổng Chi Tiêu</th>
                  <th class="py-3 px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Gần Nhất</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                <tr v-for="profile in crmProfiles" :key="profile.phone" class="hover:bg-slate-50 transition-colors">
                  <td class="py-3 px-2 font-black text-slate-800">{{ profile.name }}</td>
                  <td class="py-3 px-2 font-bold text-slate-600">{{ profile.phone }}</td>
                  <td class="py-3 px-2 text-center">
                    <span :class="['px-2.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider', 
                      profile.vipStatus === 'VIP' ? 'bg-amber-100 text-amber-800 border border-amber-200' : 
                      profile.vipStatus === 'Khách quen' ? 'bg-blue-100 text-blue-800 border border-blue-200' : 'bg-slate-100 text-slate-800 border border-slate-200']">
                      {{ profile.vipStatus }}
                    </span>
                  </td>
                  <td class="py-3 px-2 text-center font-black text-slate-700">{{ profile.visits }}</td>
                  <td class="py-3 px-2 text-center">
                    <span v-if="profile.noshows > 0" class="bg-rose-50 text-rose-700 border border-rose-100 px-2 py-0.5 rounded font-black">
                      {{ profile.noshows }} lần
                    </span>
                    <span v-else class="text-slate-300 font-bold text-xs">-</span>
                  </td>
                  <td class="py-3 px-2 text-right font-black text-blue-900">{{ formatVND(profile.spend) }}</td>
                  <td class="py-3 px-2 text-right font-bold text-slate-400">{{ profile.lastDate }}</td>
                </tr>
                <tr v-if="crmProfiles.length === 0">
                  <td colspan="7" class="py-10 text-center text-slate-400 font-bold">Không tìm thấy khách hàng nào khớp với bộ lọc</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
@media print {
  body * {
    visibility: hidden;
  }
  .print\:block,
  .print\:block * {
    visibility: visible;
  }
  .print\:block {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
  }
  .print\:p-0 {
    padding: 0 !important;
  }
  .print\:border-none {
    border: none !important;
  }
  .print\:shadow-none {
    box-shadow: none !important;
  }
}
</style>

