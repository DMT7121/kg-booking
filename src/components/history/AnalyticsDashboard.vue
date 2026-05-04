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

  keys.forEach(key => {
    const order = groups[key].latest
    totalPax += Number(order.parsedCustomer?.pax) || 0
    totalRevenue += order.totalAmount || 0
    if (order.isDeposited) {
      depositedCount++
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
  })
  
  const topDishes = Object.keys(dishCounts).map(name => ({
    name,
    qty: dishCounts[name].qty,
    revenue: dishCounts[name].revenue
  })).sort((a, b) => b.qty - a.qty).slice(0, 5)

  return {
    totalRevenue,
    totalPax,
    totalBookings,
    depositRate: totalBookings ? Math.round((depositedCount / totalBookings) * 100) : 0,
    topDishes
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

      <!-- Charts Area (Placeholder for Future Implementation) -->
      <div class="lg:col-span-2 bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-100 flex flex-col items-center justify-center min-h-[300px] text-center">
        <div class="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center text-3xl text-blue-300 mb-4">
          <i class="fa-solid fa-chart-line"></i>
        </div>
        <h3 class="text-base font-black text-slate-700 uppercase tracking-wide mb-2">Biểu Đồ Xu Hướng (Sắp ra mắt)</h3>
        <p class="text-[13px] font-medium text-slate-500 max-w-sm">
          Tính năng biểu đồ theo thời gian thực (doanh thu theo ngày, biểu đồ tròn phân bổ) đang được xây dựng và sẽ có mặt ở phiên bản tiếp theo.
        </p>
      </div>
    </div>
  </div>
</template>
