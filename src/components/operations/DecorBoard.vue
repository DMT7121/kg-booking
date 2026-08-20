<template>
  <div class="space-y-4">
    <!-- Header Controls -->
    <div class="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl border border-slate-800 bg-slate-900/80 backdrop-blur-md">
      <div class="flex items-center gap-2">
        <span class="p-2 rounded-xl bg-purple-500/20 text-purple-400 text-lg">🎈</span>
        <div>
          <h2 class="text-base font-extrabold text-white">BẢNG THEO DÕI TRANG TRÍ & TIỆC</h2>
          <p class="text-xs text-slate-400">Checklist hoa tươi, bóng bay, bảng tên mừng và bánh kem</p>
        </div>
      </div>

      <div class="text-xs text-slate-300 font-bold px-3 py-1.5 rounded-xl bg-purple-950/30 border border-purple-500/30">
        {{ decorTickets.length }} đơn tiệc cần decor
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="decorTickets.length === 0" class="py-16 text-center rounded-2xl border border-slate-800 bg-slate-900/40 text-slate-400 text-sm">
      <span class="text-3xl block mb-2">✨</span>
      Hôm nay không có đơn đặt tiệc sinh nhật hoặc sự kiện yêu cầu trang trí.
    </div>

    <!-- Tickets Grid -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div 
        v-for="ticket in decorTickets" 
        :key="ticket.ticketId"
        class="p-4 rounded-2xl border border-slate-800 bg-slate-900/90 backdrop-blur-md shadow-xl flex flex-col justify-between"
      >
        <div>
          <!-- Top Info: Time, Table, Party Type -->
          <div class="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-800">
            <div>
              <div class="flex items-center gap-2">
                <span class="px-2.5 py-0.5 rounded-lg text-xs font-black bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  🎉 {{ ticket.partyType }}
                </span>
                <span class="text-sm font-black text-white">⏰ {{ ticket.eventTime }}</span>
              </div>
              <div class="text-xs text-slate-300 font-bold mt-1">
                {{ ticket.partyOwnerName ? `Chủ tiệc: ${ticket.partyOwnerName}` : `Khách: ${ticket.customerName}` }}
                <span v-if="ticket.tableCode" class="text-slate-400 font-normal"> (Bàn {{ ticket.tableCode }})</span>
              </div>
            </div>

            <!-- Theme Color Pill -->
            <span v-if="ticket.themeColor" class="px-2.5 py-1 rounded-lg text-xs font-bold bg-pink-500/20 text-pink-300 border border-pink-500/30">
              🎨 {{ ticket.themeColor }}
            </span>
          </div>

          <!-- Interactive Checklist -->
          <div class="space-y-2 mb-3">
            <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">Hạng mục chuẩn bị:</div>
            <div 
              v-for="item in ticket.checklist" 
              :key="item.id"
              @click="item.completed = !item.completed"
              class="p-2.5 rounded-xl border transition cursor-pointer flex items-start gap-2.5 text-xs"
              :class="item.completed ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-200' : 'bg-slate-800/80 border-slate-700/60 text-slate-300 hover:border-purple-500/40'"
            >
              <span class="text-base shrink-0">{{ item.completed ? '✅' : '⬜' }}</span>
              <div class="space-y-0.5">
                <div class="font-bold flex items-center gap-1.5" :class="item.completed ? 'line-through opacity-80' : 'text-white'">
                  {{ item.label }}
                </div>
                <div class="text-[11px] text-slate-400" :class="item.completed ? 'line-through opacity-60' : ''">
                  {{ item.detail }}
                </div>
              </div>
            </div>
          </div>

          <!-- Notes -->
          <div v-if="ticket.notes" class="p-2 rounded-xl bg-slate-800/60 border border-slate-700 text-slate-300 text-xs mb-3">
            <span class="font-bold text-amber-400">📝 Ghi chú:</span> {{ ticket.notes }}
          </div>
        </div>

        <!-- Card Footer -->
        <div class="pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>Tiến độ: {{ getCompletedCount(ticket) }} / {{ ticket.checklist.length }}</span>
          <span v-if="getCompletedCount(ticket) === ticket.checklist.length && ticket.checklist.length > 0" class="text-emerald-400 font-bold">
            ✨ Đã hoàn tất trang trí
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { createDecorTicketFromBooking, DecorTicket } from '@/domain/party/decorTicket'

const props = defineProps<{
  allBookings: any[]
}>()

const decorTickets = computed<DecorTicket[]>(() => {
  if (!props.allBookings) return []
  return props.allBookings
    .map(b => createDecorTicketFromBooking(b))
    .filter(t => t.status !== 'NOT_REQUIRED')
})

function getCompletedCount(ticket: DecorTicket): number {
  return ticket.checklist.filter(c => c.completed).length
}
</script>
