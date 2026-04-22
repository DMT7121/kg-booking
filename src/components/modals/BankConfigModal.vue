<script setup lang="ts">
import { useUIStore } from '@/stores/useUIStore'
import { useAppStore } from '@/stores/useAppStore'
import { BANKS } from '@/utils/constants'

const ui = useUIStore()
const appStore = useAppStore()

function updateNewBankName() {
  const b = BANKS.find(x => x.bin === appStore.newBank.bankId)
  if (b) appStore.newBank.name = b.shortName
}
</script>

<template>
  <div v-if="ui.showBankConfig" class="fixed inset-0 bg-black/60 z-50 flex justify-center items-center p-4 backdrop-blur-sm" @click.self="ui.showBankConfig = false">
    <div class="bg-white rounded-3xl shadow-2xl p-6 max-w-md w-full border-t-8 border-purple-500 max-h-[85vh] overflow-y-auto custom-scrollbar">
      <div class="flex justify-between items-center mb-6">
        <h3 class="text-xl font-black text-slate-800 uppercase tracking-tighter"><i class="fa-solid fa-building-columns text-purple-500 mr-2"></i>Ngân Hàng</h3>
        <button @click="ui.showBankConfig = false" class="text-gray-400 hover:text-red-500 p-2 min-h-[44px]"><i class="fa-solid fa-circle-xmark text-3xl"></i></button>
      </div>

      <!-- Existing Banks -->
      <div class="space-y-2 mb-6">
        <div v-for="(b, idx) in appStore.bankList" :key="idx"
          :class="['p-4 rounded-2xl border-2 cursor-pointer transition-all', idx === appStore.selectedBankIndex ? 'border-purple-500 bg-purple-50' : 'border-gray-100 hover:border-purple-200']"
          @click="appStore.selectBank(idx)">
          <div class="flex justify-between items-center">
            <div>
              <div class="font-black text-sm text-slate-700">{{ b.name }}</div>
              <div class="text-[10px] font-mono text-gray-500 mt-1">{{ b.number }} &bull; {{ b.owner }}</div>
            </div>
            <div class="flex items-center gap-2">
              <i v-if="idx === appStore.selectedBankIndex" class="fa-solid fa-check-circle text-purple-500 text-xl"></i>
              <button @click.stop="appStore.removeBank(idx)" class="text-red-400 hover:text-red-600 p-1 min-h-[44px] min-w-[44px]"><i class="fa-solid fa-trash"></i></button>
            </div>
          </div>
        </div>
      </div>

      <!-- Add New Bank -->
      <div class="bg-gray-50 rounded-2xl p-4 border border-gray-100 space-y-3">
        <label class="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Thêm Ngân Hàng</label>
        <select v-model="appStore.newBank.bankId" @change="updateNewBankName" class="w-full p-3 rounded-xl border-2 border-gray-200 font-bold text-sm bg-white min-h-[44px]">
          <option value="">-- Chọn ngân hàng --</option>
          <option v-for="bank in BANKS" :key="bank.bin" :value="bank.bin">{{ bank.shortName }} ({{ bank.name }})</option>
        </select>
        <input v-model="appStore.newBank.number" placeholder="Số tài khoản" class="w-full p-3 rounded-xl border-2 border-gray-200 font-bold text-sm font-mono">
        <input v-model="appStore.newBank.owner" placeholder="Chủ tài khoản" class="w-full p-3 rounded-xl border-2 border-gray-200 font-bold text-sm uppercase">
        <button @click="appStore.addBank()" class="w-full py-3 bg-purple-600 text-white rounded-xl font-black text-xs uppercase shadow-lg hover:bg-purple-700 active:scale-95 min-h-[44px] active-effect"><i class="fa-solid fa-plus mr-1"></i> Thêm</button>
      </div>
    </div>
  </div>
</template>
