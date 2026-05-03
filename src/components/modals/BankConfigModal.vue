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
  <div v-if="ui.showBankConfig" class="fixed inset-0 bg-[#0D1658]/80 z-[12000] flex justify-center items-center p-4 backdrop-blur-md" @click.self="ui.showBankConfig = false">
    <div class="bg-white rounded-3xl shadow-2xl p-6 md:p-8 max-w-md w-[95%] md:w-full flex flex-col relative overflow-hidden border border-white/20 max-h-[90vh]">
      
      <!-- Header BG Decoration -->
      <div class="absolute top-0 left-0 right-0 h-24 bg-gradient-to-r from-blue-600 to-[#1A237E] rounded-t-3xl opacity-10"></div>

      <div class="flex justify-between items-center mb-6 relative z-10">
        <h3 class="text-2xl font-black text-[#1A237E] uppercase tracking-tighter flex items-center gap-3">
          <div class="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center text-purple-500">
            <i class="fa-solid fa-building-columns"></i>
          </div>
          Ngân Hàng
        </h3>
        <button @click="ui.showBankConfig = false" class="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl hover:bg-red-50 hover:text-red-500 transition-all flex items-center justify-center shrink-0 shadow-sm border border-slate-100">
          <i class="fa-solid fa-xmark text-xl"></i>
        </button>
      </div>

      <div class="overflow-y-auto custom-scrollbar pr-1 relative z-10 flex-grow">
        <!-- Existing Banks -->
        <div class="space-y-3 mb-6">
          <div v-for="(b, idx) in appStore.bankList" :key="idx"
            :class="['p-4 rounded-2xl border transition-all cursor-pointer group', idx === appStore.selectedBankIndex ? 'border-[#1A237E] bg-blue-50/50 shadow-md' : 'border-slate-100 bg-slate-50 hover:border-blue-200 hover:bg-white']"
            @click="appStore.selectBank(idx)">
            <div class="flex justify-between items-center">
              <div class="flex items-center gap-4">
                <div :class="['w-10 h-10 rounded-xl flex items-center justify-center text-lg transition-colors shadow-sm', idx === appStore.selectedBankIndex ? 'bg-[#1A237E] text-white' : 'bg-white text-slate-300 group-hover:text-blue-400 border border-slate-100']">
                  <i class="fa-solid fa-building-columns"></i>
                </div>
                <div>
                  <div :class="['font-black text-sm uppercase', idx === appStore.selectedBankIndex ? 'text-[#1A237E]' : 'text-slate-700']">{{ b.name }}</div>
                  <div class="text-[11px] font-mono font-bold text-slate-400 tracking-wider mt-0.5">{{ b.number }} &bull; {{ b.owner }}</div>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <button @click.stop="appStore.removeBank(idx)" class="w-10 h-10 bg-white border border-rose-100 text-rose-400 rounded-xl hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-all flex items-center justify-center active:scale-95 shadow-sm opacity-50 group-hover:opacity-100">
                  <i class="fa-solid fa-trash-can"></i>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Add New Bank -->
        <div class="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-3">
          <label class="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Thêm Ngân Hàng</label>
          <div class="flex flex-col gap-3">
            <select v-model="appStore.newBank.bankId" @change="updateNewBankName" class="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white font-black text-slate-800 text-sm focus:border-[#1A237E] focus:ring-4 focus:ring-blue-50 outline-none transition-all">
              <option value="" disabled selected class="text-slate-400">-- CHỌN NGÂN HÀNG --</option>
              <option v-for="bank in BANKS" :key="bank.bin" :value="bank.bin">{{ bank.shortName }} ({{ bank.name }})</option>
            </select>
            <input v-model="appStore.newBank.number" placeholder="Số tài khoản..." class="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white font-mono font-bold text-slate-800 text-sm focus:border-[#1A237E] focus:ring-4 focus:ring-blue-50 outline-none transition-all placeholder-slate-300">
            <input v-model="appStore.newBank.owner" placeholder="Chủ tài khoản..." class="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white font-black uppercase text-slate-800 text-sm focus:border-[#1A237E] focus:ring-4 focus:ring-blue-50 outline-none transition-all placeholder-slate-300">
            <button @click="appStore.addBank()" class="w-full py-4 bg-[#1A237E] text-white rounded-xl font-black text-sm uppercase shadow-lg shadow-blue-900/20 active:scale-95 transition-all flex items-center justify-center gap-2 mt-2">
              <i class="fa-solid fa-plus text-lg text-white/80"></i> THÊM NGÂN HÀNG
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
