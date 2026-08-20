<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
    <div class="w-full max-w-3xl rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
      <!-- Header -->
      <div class="flex items-center justify-between pb-3 border-b border-slate-800">
        <div class="flex items-center gap-2">
          <span class="p-2 rounded-xl bg-amber-500/20 text-amber-400 text-lg">💡</span>
          <div>
            <h2 class="text-base font-extrabold text-white">BỘ TỐI ƯU GIẢM TRỪ TIỀN MÓN</h2>
            <p class="text-xs text-slate-400">Tự động tính toán các phương án giảm trừ ngân sách thực đơn thông minh</p>
          </div>
        </div>
        <button @click="$emit('close')" class="p-2 rounded-full text-slate-400 hover:text-white bg-slate-800">✕</button>
      </div>

      <!-- Current Bill & Reduction Input -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-2xl border border-slate-800 bg-slate-800/40">
        <div>
          <div class="text-xs text-slate-400 font-bold uppercase">Tổng tiền bill hiện tại:</div>
          <div class="text-xl font-black text-white mt-0.5">{{ formatMoney(currentTotal) }}</div>
        </div>
        <div>
          <label class="text-xs text-amber-400 font-bold uppercase block">Số tiền muốn giảm trừ (VND):</label>
          <input 
            type="number"
            v-model.number="reductionTarget"
            placeholder="VD: 2000000"
            class="w-full mt-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-bold text-sm focus:border-amber-500 outline-none"
          />
        </div>
      </div>

      <!-- Optimization Options Grid -->
      <div v-if="optimizationOptions.length > 0" class="space-y-3">
        <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">
          Chọn phương án tối ưu phù hợp:
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div 
            v-for="opt in optimizationOptions" 
            :key="opt.strategy"
            @click="selectedStrategy = opt.strategy"
            class="p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between"
            :class="selectedStrategy === opt.strategy ? 'bg-amber-950/20 border-amber-500 shadow-lg shadow-amber-500/10' : 'bg-slate-800/60 border-slate-700/60 hover:border-slate-600'"
          >
            <div>
              <div class="flex items-center justify-between gap-1 mb-1">
                <span class="text-xs font-extrabold text-white">{{ opt.title }}</span>
                <span v-if="selectedStrategy === opt.strategy" class="text-amber-400 text-xs">✓ Chọn</span>
              </div>
              <p class="text-[11px] text-slate-400 leading-relaxed mb-3">{{ opt.description }}</p>

              <div class="space-y-1 text-xs pt-2 border-t border-slate-700/60">
                <div class="flex justify-between">
                  <span class="text-slate-400">Giảm trừ:</span>
                  <span class="font-bold text-rose-400">-{{ formatMoney(opt.actualReduction) }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-slate-400">Tổng bill mới:</span>
                  <span class="font-black text-emerald-300">{{ formatMoney(opt.newTotal) }}</span>
                </div>
                <div class="flex justify-between text-[11px]">
                  <span class="text-slate-400">Lệch mục tiêu:</span>
                  <span class="text-slate-300">{{ formatMoney(opt.differenceFromTarget) }}</span>
                </div>
              </div>
            </div>

            <!-- Deltas list preview -->
            <div class="mt-3 pt-2 border-t border-slate-700/60 space-y-1">
              <div v-for="d in opt.deltas" :key="d.id" class="text-[10px] text-slate-300 flex justify-between">
                <span class="truncate">{{ d.name }}:</span>
                <span class="font-bold shrink-0">{{ d.beforeQuantity }} → {{ d.afterQuantity }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Action Footer -->
      <div class="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
        <button 
          @click="$emit('close')"
          class="px-4 py-2 rounded-xl text-xs font-bold text-slate-300 bg-slate-800 hover:bg-slate-700"
        >
          Hủy bỏ
        </button>
        <button 
          v-if="selectedOption"
          @click="applyOptimization"
          class="px-5 py-2 rounded-xl text-xs font-extrabold text-slate-950 bg-amber-500 hover:bg-amber-400 shadow-md flex items-center gap-1.5"
        >
          <span>✨ Áp dụng phương án này vào Menu</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { optimizePriceReduction, OptimizationOption } from '@/domain/menu/priceOptimizer'
import { safeCalculateTotal } from '@/utils/money'

const props = defineProps<{
  items: Array<{ id: string; name: string; quantity: number; unit_price?: number; price?: number; isProtected?: boolean }>
}>()

const emit = defineEmits(['close', 'apply-optimized-menu'])

const reductionTarget = ref<number>(1000000)
const selectedStrategy = ref<'CLOSEST' | 'LEAST_CHANGES' | 'BALANCED'>('CLOSEST')

const currentTotal = computed(() => {
  return safeCalculateTotal(props.items)
})

const optimizationOptions = computed<OptimizationOption[]>(() => {
  if (!props.items || props.items.length === 0 || reductionTarget.value <= 0) return []

  const formattedItems = props.items.map((it, idx) => ({
    id: it.id || `item_${idx}`,
    name: it.name,
    quantity: it.quantity,
    unitPrice: it.unit_price ?? it.price ?? 0,
    isProtected: it.isProtected || false
  }))

  return optimizePriceReduction({
    currentTotal: currentTotal.value,
    reductionTarget: reductionTarget.value,
    items: formattedItems
  })
})

const selectedOption = computed(() => {
  return optimizationOptions.value.find(o => o.strategy === selectedStrategy.value)
})

function formatMoney(amount: number): string {
  return `${(amount || 0).toLocaleString('vi-VN')}đ`
}

function applyOptimization() {
  if (!selectedOption.value) return
  emit('apply-optimized-menu', selectedOption.value)
}
</script>
