<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
    <div class="w-full max-w-2xl rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
      <!-- Header -->
      <div class="flex items-center justify-between pb-3 border-b border-slate-800">
        <div class="flex items-center gap-2">
          <span class="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 text-lg">💳</span>
          <div>
            <h2 class="text-base font-extrabold text-white">ĐỐI SOÁT CỌC TỰ ĐỘNG (VIETQR)</h2>
            <p class="text-xs text-slate-400">Khớp giao dịch chuyển khoản ngân hàng với đơn đặt bàn</p>
          </div>
        </div>
        <button @click="$emit('close')" class="p-2 rounded-full text-slate-400 hover:text-white bg-slate-800">✕</button>
      </div>

      <!-- Selected Booking Info -->
      <div class="p-4 rounded-2xl border border-slate-800 bg-slate-800/40 space-y-2">
        <div class="flex items-center justify-between text-xs">
          <span class="text-slate-400">Khách hàng:</span>
          <span class="font-bold text-white">{{ booking.customer?.name || booking.customer_name || 'Khách' }} (📞 {{ booking.customer?.phone || booking.phone }})</span>
        </div>
        <div class="flex items-center justify-between text-xs">
          <span class="text-slate-400">Tiền cọc yêu cầu:</span>
          <span class="font-black text-amber-400 text-sm">{{ formatMoney(bookingAmount) }}</span>
        </div>
      </div>

      <!-- Reconciliation Result Status -->
      <div v-if="matchResult" class="p-4 rounded-2xl border" :class="getMatchCardClass(matchResult.status)">
        <div class="flex items-center justify-between gap-2 mb-2">
          <span class="font-black text-xs uppercase tracking-wider flex items-center gap-1.5">
            <span>{{ matchResult.status === 'MATCHED' ? '✅' : matchResult.status === 'PROBABLE_MATCH' ? '⚡' : '⚠️' }}</span>
            <span>Trạng thái: {{ matchResult.status }}</span>
          </span>
          <span class="text-xs font-bold px-2 py-0.5 rounded bg-slate-900/60">
            Độ tin cậy: {{ Math.round(matchResult.confidence * 100) }}%
          </span>
        </div>

        <!-- Matching Explanations -->
        <div class="space-y-1 text-xs">
          <div v-for="(reason, idx) in matchResult.reasons" :key="idx" class="flex items-center gap-1.5">
            <span class="text-emerald-400">✓</span> {{ reason }}
          </div>
        </div>

        <div v-if="matchResult.transactionId" class="mt-3 pt-2 border-t border-slate-700/60 text-xs flex items-center justify-between">
          <span class="text-slate-400">Mã giao dịch: {{ matchResult.transactionId }}</span>
          <span class="font-bold text-emerald-300">Đã nhận: {{ formatMoney(matchResult.transactionAmount) }}</span>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
        <button 
          @click="$emit('close')"
          class="px-4 py-2 rounded-xl text-xs font-bold text-slate-300 bg-slate-800 hover:bg-slate-700"
        >
          Đóng
        </button>
        <button 
          v-if="matchResult && (matchResult.status === 'MATCHED' || matchResult.status === 'PROBABLE_MATCH')"
          @click="confirmDeposit"
          class="px-4 py-2 rounded-xl text-xs font-extrabold text-white bg-emerald-600 hover:bg-emerald-500 shadow-md flex items-center gap-1.5"
        >
          <span>✅ Xác nhận đã cọc thành công</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { matchBookingDeposit, BankTransactionRecord, DepositReconciliationMatch } from '@/domain/deposit/reconciliationEngine'

const props = defineProps<{
  booking: any
  transactions?: BankTransactionRecord[]
}>()

const emit = defineEmits(['close', 'confirm-reconciled'])

const bookingAmount = computed(() => props.booking.deposit?.amount ?? props.booking.deposit_amount ?? 0)

const matchResult = computed<DepositReconciliationMatch | null>(() => {
  const txs = props.transactions || []
  return matchBookingDeposit(props.booking, txs)
})

function formatMoney(amount: number): string {
  return `${(amount || 0).toLocaleString('vi-VN')}đ`
}

function getMatchCardClass(status: string): string {
  switch (status) {
    case 'MATCHED': return 'bg-emerald-950/20 border-emerald-500/40 text-emerald-200'
    case 'PROBABLE_MATCH': return 'bg-amber-950/20 border-amber-500/40 text-amber-200'
    case 'AMBIGUOUS': return 'bg-yellow-950/20 border-yellow-500/40 text-yellow-200'
    default: return 'bg-slate-800/80 border-slate-700 text-slate-300'
  }
}

function confirmDeposit() {
  emit('confirm-reconciled', {
    bookingId: props.booking.id || props.booking.order_id,
    amount: matchResult.value?.transactionAmount || bookingAmount.value,
    transactionId: matchResult.value?.transactionId
  })
}
</script>
