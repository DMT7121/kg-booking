<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
    <div class="w-full max-w-4xl rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
      <!-- Header -->
      <div class="flex items-center justify-between pb-3 border-b border-slate-800">
        <div class="flex items-center gap-2">
          <span class="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 text-lg">📊</span>
          <div>
            <h2 class="text-base font-extrabold text-white">BÁO CÁO VẬN HÀNH & DOANH THU</h2>
            <p class="text-xs text-slate-400">Chỉ số hoạt động nhà hàng thời gian thực</p>
          </div>
        </div>
        <button @click="$emit('close')" class="p-2 rounded-full text-slate-400 hover:text-white bg-slate-800">✕</button>
      </div>

      <!-- Top KPI Bar -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="p-4 rounded-2xl border border-slate-800 bg-slate-800/40">
          <div class="text-[11px] font-bold text-slate-400 uppercase">Doanh Thu Dự Kiến</div>
          <div class="text-xl font-black text-emerald-400 mt-1">{{ formatMoney(dailyKPI.projectedRevenue) }}</div>
          <div class="text-[10px] text-slate-400 mt-0.5">TB: {{ formatMoney(dailyKPI.averageSpendPerGuest) }} / khách</div>
        </div>

        <div class="p-4 rounded-2xl border border-slate-800 bg-slate-800/40">
          <div class="text-[11px] font-bold text-slate-400 uppercase">Tiền Cọc Đã Nhận</div>
          <div class="text-xl font-black text-amber-400 mt-1">{{ formatMoney(dailyKPI.depositReceived) }}</div>
          <div class="text-[10px] text-rose-400 mt-0.5">Còn thiếu: {{ formatMoney(dailyKPI.depositOutstanding) }}</div>
        </div>

        <div class="p-4 rounded-2xl border border-slate-800 bg-slate-800/40">
          <div class="text-[11px] font-bold text-slate-400 uppercase">Tổng Lượng Khách Hôm Nay</div>
          <div class="text-xl font-black text-white mt-1">{{ dailyKPI.totalGuests }} <span class="text-xs text-slate-400 font-normal">khách</span></div>
          <div class="text-[10px] text-slate-400 mt-0.5">Trên {{ dailyKPI.totalBookings }} đơn đặt bàn</div>
        </div>

        <div class="p-4 rounded-2xl border border-slate-800 bg-slate-800/40">
          <div class="text-[11px] font-bold text-slate-400 uppercase">Tỷ Lệ Lấp Đầy Bàn</div>
          <div class="text-xl font-black text-blue-400 mt-1">{{ dailyKPI.tableOccupancyRate }}%</div>
          <div class="text-[10px] text-slate-400 mt-0.5">Công suất bàn hiện tại</div>
        </div>
      </div>

      <!-- Trend & Analytics Section -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- Top Dishes -->
        <div class="p-4 rounded-2xl border border-slate-800 bg-slate-800/30 space-y-3">
          <div class="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
            <span>🍲</span> Top Món Ăn Bán Chạy Nhất
          </div>
          <div v-if="trends.topDishes.length === 0" class="text-xs text-slate-400 py-4 text-center">
            Chưa có dữ liệu món ăn.
          </div>
          <div v-else class="space-y-2">
            <div 
              v-for="(dish, idx) in trends.topDishes" 
              :key="dish.name"
              class="p-2.5 rounded-xl bg-slate-900/60 border border-slate-700/50 flex items-center justify-between text-xs"
            >
              <div class="flex items-center gap-2">
                <span class="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center font-bold text-[10px] text-amber-400">
                  {{ idx + 1 }}
                </span>
                <span class="font-bold text-slate-200">{{ dish.name }}</span>
              </div>
              <span class="font-extrabold text-amber-300">x{{ dish.quantity }} đĩa</span>
            </div>
          </div>
        </div>

        <!-- Peak Arrival Hours -->
        <div class="p-4 rounded-2xl border border-slate-800 bg-slate-800/30 space-y-3">
          <div class="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
            <span>⏰</span> Khung Giờ Đón Khách Cao Điểm
          </div>
          <div v-if="trends.peakArrivalHours.length === 0" class="text-xs text-slate-400 py-4 text-center">
            Chưa có dữ liệu khung giờ.
          </div>
          <div v-else class="space-y-2">
            <div 
              v-for="hour in trends.peakArrivalHours" 
              :key="hour.hour"
              class="p-2.5 rounded-xl bg-slate-900/60 border border-slate-700/50 flex items-center justify-between text-xs"
            >
              <span class="font-bold text-slate-200">Khung {{ hour.hour }}</span>
              <span class="font-black text-blue-400">{{ hour.count }} lượt tiệc</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { calculateDailyOperationsKPI, calculateOperationsTrends, OperationsDailyKPI, OperationsTrendMetrics } from '@/domain/analytics/operationsAnalytics'
import { formatRestaurantDate, getRestaurantNow } from '@/utils/time'

const props = defineProps<{
  allBookings?: any[]
}>()

defineEmits(['close'])

const todayStr = computed(() => formatRestaurantDate(getRestaurantNow()))

const dailyKPI = computed<OperationsDailyKPI>(() => {
  return calculateDailyOperationsKPI(todayStr.value, props.allBookings || [])
})

const trends = computed<OperationsTrendMetrics>(() => {
  return calculateOperationsTrends(props.allBookings || [])
})

function formatMoney(amount: number): string {
  return `${(amount || 0).toLocaleString('vi-VN')}đ`
}
</script>
