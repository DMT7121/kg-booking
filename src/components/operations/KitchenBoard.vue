<template>
  <div class="space-y-4">
    <!-- Header Controls: Station Filter & Stats -->
    <div class="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl border border-slate-800 bg-slate-900/80 backdrop-blur-md">
      <div class="flex items-center gap-2">
        <span class="p-2 rounded-xl bg-amber-500/20 text-amber-400 text-lg">👨‍🍳</span>
        <div>
          <h2 class="text-base font-extrabold text-white">BẢNG ĐIỀU PHỐI BẾP (KDS)</h2>
          <p class="text-xs text-slate-400">Quản lý và chuẩn bị món ăn theo ca và trạm nấu</p>
        </div>
      </div>

      <!-- Station Filter Buttons -->
      <div class="flex flex-wrap items-center gap-1.5">
        <button 
          v-for="station in stationFilters" 
          :key="station.value"
          @click="activeStation = station.value"
          class="px-3 py-1.5 rounded-xl text-xs font-bold transition border"
          :class="activeStation === station.value ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'"
        >
          {{ station.label }}
        </button>
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="kitchenTickets.length === 0" class="py-16 text-center rounded-2xl border border-slate-800 bg-slate-900/40 text-slate-400 text-sm">
      <span class="text-3xl block mb-2">🍽️</span>
      Hiện chưa có đơn đặt món nào cần chuẩn bị.
    </div>

    <!-- Tickets Grid -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      <div 
        v-for="ticket in kitchenTickets" 
        :key="ticket.ticketId"
        class="p-4 rounded-2xl border bg-slate-900/90 backdrop-blur-md shadow-xl flex flex-col justify-between transition-all"
        :class="ticket.status === 'READY' ? 'border-emerald-500/50 bg-emerald-950/10' : 'border-slate-800 hover:border-slate-700'"
      >
        <div>
          <!-- Card Header: Time, Table, Status -->
          <div class="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-800">
            <div>
              <div class="flex items-center gap-2">
                <span class="px-2.5 py-0.5 rounded-lg text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  🪑 {{ ticket.tableCode }}
                </span>
                <span class="text-sm font-black text-white">⏰ {{ ticket.eventTime }}</span>
              </div>
              <div class="text-xs text-slate-400 mt-0.5">👥 {{ ticket.guestCount }} khách</div>
            </div>

            <!-- Status Pill -->
            <span 
              class="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border"
              :class="ticket.status === 'READY' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-amber-500/20 text-amber-300 border-amber-500/40'"
            >
              {{ ticket.status === 'READY' ? 'SẴN SÀNG' : 'ĐANG LÀM' }}
            </span>
          </div>

          <!-- Dishes List -->
          <div class="space-y-2 mb-3">
            <div 
              v-for="dish in getFilteredDishes(ticket)" 
              :key="dish.id"
              class="p-2 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-between gap-2 text-xs"
            >
              <div class="space-y-0.5">
                <div class="font-bold text-white flex items-center gap-1.5">
                  <span class="px-1.5 py-0.5 rounded bg-slate-700 text-amber-300 text-[10px] font-black">
                    x{{ dish.quantity }}
                  </span>
                  <span>{{ dish.name }}</span>
                </div>
                <div v-if="dish.portion" class="text-[11px] text-amber-400/90 font-medium">
                  Khẩu phần: {{ dish.portion }}
                </div>
                <div v-if="dish.notes" class="text-[10px] text-slate-400 italic">
                  Ghi chú: {{ dish.notes }}
                </div>
              </div>

              <!-- Station Tag -->
              <span class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase shrink-0" :class="getStationBadgeClass(dish.station)">
                {{ getStationLabel(dish.station) }}
              </span>
            </div>
          </div>

          <!-- Special Service Dặn Dò -->
          <div v-if="ticket.specialInstructions" class="p-2 rounded-xl bg-amber-950/20 border border-amber-500/30 text-amber-300 text-xs mb-3">
            <span class="font-bold">⚠️ Dặn dò:</span> {{ ticket.specialInstructions }}
          </div>
        </div>

        <!-- Card Footer Actions -->
        <div class="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
          <button 
            @click="toggleTicketReady(ticket)"
            class="w-full py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm"
            :class="ticket.status === 'READY' ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-emerald-600 hover:bg-emerald-500 text-white'"
          >
            <span>{{ ticket.status === 'READY' ? '↩️ Đang chuẩn bị lại' : '✅ Báo bếp đã xong món' }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { createKitchenTicketFromBooking, KitchenStation, KitchenOrderTicket } from '@/domain/party/kitchenTicket'

const props = defineProps<{
  allBookings: any[]
}>()

type StationFilterType = 'all' | KitchenStation

const activeStation = ref<StationFilterType>('all')

const stationFilters: { label: string; value: StationFilterType }[] = [
  { label: 'Tất cả trạm', value: 'all' },
  { label: '🔥 Bếp Nướng / BBQ', value: 'grill' },
  { label: '🍲 Lẩu & Món Xào', value: 'hotpot_stir' },
  { label: '🥗 Khai vị & Hải sản', value: 'cold_seafood' },
  { label: '🍚 Món chính & Khác', value: 'general' }
]

const kitchenTickets = computed<KitchenOrderTicket[]>(() => {
  if (!props.allBookings) return []
  return props.allBookings
    .filter(b => (b.menu_items?.length || 0) > 0 || (b.items?.length || 0) > 0)
    .map(b => createKitchenTicketFromBooking(b))
})

function getFilteredDishes(ticket: KitchenOrderTicket) {
  if (activeStation.value === 'all') return ticket.dishes
  return ticket.dishes.filter(d => d.station === activeStation.value)
}

function getStationLabel(station: KitchenStation): string {
  switch (station) {
    case 'grill': return 'Nướng'
    case 'hotpot_stir': return 'Lẩu/Xào'
    case 'cold_seafood': return 'Khai vị'
    case 'general': return 'Khác'
  }
}

function getStationBadgeClass(station: KitchenStation): string {
  switch (station) {
    case 'grill': return 'bg-rose-500/20 text-rose-300'
    case 'hotpot_stir': return 'bg-amber-500/20 text-amber-300'
    case 'cold_seafood': return 'bg-cyan-500/20 text-cyan-300'
    case 'general': return 'bg-slate-700 text-slate-300'
  }
}

function toggleTicketReady(ticket: KitchenOrderTicket) {
  ticket.status = ticket.status === 'READY' ? 'PREPARING' : 'READY'
}
</script>
