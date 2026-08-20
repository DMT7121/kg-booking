<template>
  <div class="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-sm">
    <div class="w-full max-w-md h-full bg-slate-900 border-l border-slate-800 shadow-2xl p-6 space-y-5 overflow-y-auto">
      <!-- Header -->
      <div class="flex items-center justify-between pb-3 border-b border-slate-800">
        <div class="flex items-center gap-2">
          <span class="p-2 rounded-xl bg-blue-500/20 text-blue-400 text-lg">👤</span>
          <div>
            <h2 class="text-base font-extrabold text-white">HỒ SƠ KHÁCH HÀNG 360</h2>
            <p class="text-xs text-slate-400">Lịch sử chi tiêu & hành vi đặt bàn</p>
          </div>
        </div>
        <button @click="$emit('close')" class="p-2 rounded-full text-slate-400 hover:text-white bg-slate-800">✕</button>
      </div>

      <!-- Customer Overview Card -->
      <div class="p-4 rounded-2xl border border-slate-800 bg-slate-800/40 space-y-3">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-lg font-black text-white">{{ profile.name }}</div>
            <div class="text-xs text-slate-400 mt-0.5">📞 {{ profile.phone }}</div>
          </div>
          <!-- Tier Badge -->
          <span class="px-3 py-1 rounded-xl text-xs font-black uppercase border" :class="getTierBadgeClass(profile.tier)">
            {{ profile.tier }}
          </span>
        </div>

        <!-- Tags -->
        <div v-if="profile.tags.length > 0" class="flex flex-wrap gap-1.5 pt-1">
          <span 
            v-for="tag in profile.tags" 
            :key="tag"
            class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-700 text-slate-200"
          >
            {{ tag }}
          </span>
        </div>
      </div>

      <!-- Key Metrics KPI Grid -->
      <div class="grid grid-cols-2 gap-2.5">
        <div class="p-3 rounded-2xl border border-slate-800 bg-slate-800/30">
          <div class="text-[10px] font-bold text-slate-400 uppercase">Tổng Chi Tiêu (LTV)</div>
          <div class="text-base font-black text-emerald-400 mt-1">{{ formatMoney(profile.lifetimeValue) }}</div>
        </div>

        <div class="p-3 rounded-2xl border border-slate-800 bg-slate-800/30">
          <div class="text-[10px] font-bold text-slate-400 uppercase">Chi Tiêu Trung Bình / Lần</div>
          <div class="text-base font-black text-amber-400 mt-1">{{ formatMoney(profile.averageSpend) }}</div>
        </div>

        <div class="p-3 rounded-2xl border border-slate-800 bg-slate-800/30">
          <div class="text-[10px] font-bold text-slate-400 uppercase">Tổng Số Lần Đặt Bàn</div>
          <div class="text-base font-black text-white mt-1">{{ profile.totalBookings }} <span class="text-xs text-slate-400 font-normal">lần</span></div>
        </div>

        <div class="p-3 rounded-2xl border border-slate-800 bg-slate-800/30">
          <div class="text-[10px] font-bold text-slate-400 uppercase">Tỷ Lệ Hoàn Tất</div>
          <div class="text-base font-black text-blue-400 mt-1">
            {{ profile.totalBookings > 0 ? Math.round((profile.completedBookings / profile.totalBookings) * 100) : 100 }}%
          </div>
        </div>
      </div>

      <!-- Favorite Tables & Areas -->
      <div v-if="profile.favoriteTables.length > 0" class="space-y-2">
        <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">Bàn & Khu Vực Thường Ngồi:</div>
        <div class="flex flex-wrap gap-2">
          <span 
            v-for="t in profile.favoriteTables" 
            :key="t.name"
            class="px-2.5 py-1 rounded-xl text-xs font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30 flex items-center gap-1"
          >
            🪑 Bàn {{ t.name }} <span class="text-[10px] opacity-75">({{ t.count }} lần)</span>
          </span>
        </div>
      </div>

      <!-- Favorite Dishes -->
      <div v-if="profile.favoriteDishes.length > 0" class="space-y-2">
        <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">Món Ăn Yêu Thích / Gọi Nhiều:</div>
        <div class="space-y-1.5">
          <div 
            v-for="d in profile.favoriteDishes" 
            :key="d.name"
            class="p-2 rounded-xl bg-slate-800/60 border border-slate-700/60 text-xs flex justify-between items-center"
          >
            <span class="font-bold text-slate-200">{{ d.name }}</span>
            <span class="text-[11px] text-amber-400 font-bold">x{{ d.count }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { aggregateCustomer360Profile, CustomerProfile360, CustomerTier } from '@/domain/customer/customer360'

const props = defineProps<{
  phone: string
  allBookings?: any[]
}>()

defineEmits(['close'])

const profile = computed<CustomerProfile360>(() => {
  return aggregateCustomer360Profile(props.phone, props.allBookings || [])
})

function formatMoney(amount: number): string {
  return `${(amount || 0).toLocaleString('vi-VN')}đ`
}

function getTierBadgeClass(tier: CustomerTier): string {
  switch (tier) {
    case 'VIP': return 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-black'
    case 'GOLD': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40'
    case 'SILVER': return 'bg-slate-500/20 text-slate-300 border-slate-500/40'
    default: return 'bg-slate-800 text-slate-400 border-slate-700'
  }
}
</script>
