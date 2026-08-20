<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
    <div class="w-full max-w-3xl rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
      <!-- Header -->
      <div class="flex items-center justify-between pb-3 border-b border-slate-800">
        <div class="flex items-center gap-2">
          <span class="p-2 rounded-xl bg-purple-500/20 text-purple-400 text-lg">🤖</span>
          <div>
            <h2 class="text-base font-extrabold text-white">AI OPERATIONS & TELEMETRY CENTER</h2>
            <p class="text-xs text-slate-400">Giám sát hiệu năng AI, độ trễ và tỷ lệ chỉnh sửa của con người</p>
          </div>
        </div>
        <button @click="$emit('close')" class="p-2 rounded-full text-slate-400 hover:text-white bg-slate-800">✕</button>
      </div>

      <!-- Telemetry Stats Bar -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="p-3.5 rounded-2xl border border-slate-800 bg-slate-800/40">
          <div class="text-[10px] font-bold text-slate-400 uppercase">Tổng Lượt Request AI</div>
          <div class="text-xl font-black text-white mt-1">{{ report.totalRequests }}</div>
        </div>

        <div class="p-3.5 rounded-2xl border border-slate-800 bg-slate-800/40">
          <div class="text-[10px] font-bold text-slate-400 uppercase">Tỷ Lệ Cache Hit (L1/L2)</div>
          <div class="text-xl font-black text-emerald-400 mt-1">{{ report.cacheHitRate }}%</div>
        </div>

        <div class="p-3.5 rounded-2xl border border-slate-800 bg-slate-800/40">
          <div class="text-[10px] font-bold text-slate-400 uppercase">Độ Trễ Trung Bình</div>
          <div class="text-xl font-black text-cyan-400 mt-1">{{ report.averageLatencyMs }} ms</div>
        </div>

        <div class="p-3.5 rounded-2xl border border-slate-800 bg-slate-800/40">
          <div class="text-[10px] font-bold text-slate-400 uppercase">Circuit Breaker Cooldowns</div>
          <div class="text-xl font-black text-amber-400 mt-1">{{ report.circuitBreakerTrips }}</div>
        </div>
      </div>

      <!-- Human Correction Rate by Field -->
      <div class="p-4 rounded-2xl border border-slate-800 bg-slate-800/30 space-y-3">
        <div class="flex items-center justify-between">
          <div class="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
            <span>🎯</span> Tỷ Lệ Nhân Viên Chỉnh Sửa Dữ Liệu AI (Human Correction Rate)
          </div>
          <span class="text-[11px] text-slate-400">Tổng {{ report.totalCorrections }} lượt sửa</span>
        </div>

        <div v-if="Object.keys(report.fieldCorrectionRates).length === 0" class="py-6 text-center text-xs text-slate-400">
          ✨ Chưa có ghi nhận sai sót nào từ nhân viên. AI đang hoạt động với độ chính xác cao.
        </div>

        <div v-else class="space-y-2">
          <div 
            v-for="(stat, field) in report.fieldCorrectionRates" 
            :key="field"
            class="p-2.5 rounded-xl bg-slate-900/60 border border-slate-700/60 flex items-center justify-between text-xs"
          >
            <div>
              <span class="font-bold text-slate-200 uppercase">{{ getFieldDisplayName(String(field)) }}</span>
              <span class="text-slate-400 text-[11px] ml-2">({{ stat.corrected }} / {{ stat.total }} lượt)</span>
            </div>
            <span class="px-2 py-0.5 rounded text-xs font-bold" :class="stat.errorRate > 20 ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'">
              {{ stat.errorRate }}% lỗi
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { aiOperationsTracker, AiTelemetryReport } from '@/domain/ai/aiOperations'

defineEmits(['close'])

const report = computed<AiTelemetryReport>(() => {
  return aiOperationsTracker.getTelemetryReport()
})

function getFieldDisplayName(field: string): string {
  const map: Record<string, string> = {
    customerName: 'Tên khách hàng',
    phone: 'Số điện thoại',
    guestCount: 'Số lượng khách',
    eventDate: 'Ngày đặt bàn',
    eventTime: 'Giờ đặt bàn',
    tableNumber: 'Số bàn',
    menuItems: 'Danh sách món ăn',
    decorColor: 'Tông màu decor'
  }
  return map[field] || field
}
</script>
