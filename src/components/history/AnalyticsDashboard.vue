<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '@/stores/useAppStore'
import { formatVND } from '@/utils'

const appStore = useAppStore()

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
    // Avoid timezone offset issues when formatting YYYY-MM-DD
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
    
    // Add to 7-day chart if applicable
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
    
    // Calculate Staff KPIs
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
  })).sort((a, b) => b.revenue - a.revenue) // Sort by revenue by default

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
</script>

<template>
  <div class="flex-grow flex flex-col overflow-y-auto custom-scrollbar text-[13px] bg-slate-50 min-h-0 h-full p-4 md:p-6 lg:p-8 space-y-6">
    <div class="text-center md:text-left">
      <h2 class="text-2xl font-black text-blue-900 uppercase tracking-tight">Thống Kê Tổng Quan</h2>
      <p class="text-xs font-bold text-slate-500 mt-1">Phân tích dữ liệu kinh doanh của nhà hàng</p>
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
              <!-- Tooltip -->
              <div class="absolute -top-10 bg-blue-900 text-white text-[10px] font-bold py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10 shadow-lg after:content-[''] after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:border-4 after:border-transparent after:border-t-blue-900">
                {{ formatVND(day.revenue) }}
              </div>
              <!-- Bar -->
              <div class="w-full max-w-[40px] bg-slate-100 group-hover:bg-blue-100 rounded-t-lg transition-all duration-500 relative overflow-hidden" 
                   :style="{ height: `${(day.revenue / stats.maxRevenue) * 100}%`, minHeight: day.revenue > 0 ? '4px' : '2px' }">
                <div class="absolute bottom-0 w-full bg-blue-500 rounded-t-lg shadow-[inset_0_2px_4px_rgba(255,255,255,0.3)] transition-all duration-500 group-hover:bg-blue-600" :style="{ height: '100%' }"></div>
              </div>
            </div>
            <!-- Date Label -->
            <div class="text-[10px] font-bold text-slate-400 group-hover:text-blue-900 transition-colors">{{ day.display }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Leaderboard (KPIs) -->
    <div class="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-100 mt-6">
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
      <div v-else class="text-center py-10">
        <i class="fa-solid fa-ranking-star text-4xl text-slate-200 mb-3"></i>
        <p class="text-xs font-bold text-slate-400">Chưa có dữ liệu xếp hạng</p>
      </div>
    </div>
  </div>
</template>
