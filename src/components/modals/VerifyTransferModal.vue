<script setup lang="ts">
import { useUIStore } from '@/stores/useUIStore'
import { useForm } from '@/composables/useForm'
import { formatVND } from '@/utils'

const ui = useUIStore()
const { confirmVerification } = useForm()
</script>

<template>
  <div v-if="ui.verifyModal.show" class="fixed inset-0 bg-blue-950/80 z-[1000] flex justify-center items-center p-4 backdrop-blur-md">
    <div class="bg-white rounded-3xl shadow-2xl p-6 md:p-8 max-w-sm w-[95%] md:w-full flex flex-col relative overflow-hidden border border-white/20">
      
      <!-- Header BG Decoration -->
      <div class="absolute top-0 left-0 right-0 h-24 bg-gradient-to-r from-amber-500 to-orange-500 rounded-t-3xl opacity-10"></div>

      <div class="flex justify-center items-center mb-6 relative z-10 flex-col gap-3">
        <div class="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500 text-2xl shadow-sm border border-amber-100">
          <i class="fa-solid fa-triangle-exclamation"></i>
        </div>
        <h3 class="text-xl font-black text-blue-900 uppercase tracking-tighter text-center">Số Tiền Không Khớp</h3>
      </div>
      
      <div class="space-y-4 mb-8 relative z-10">
        <div class="p-5 bg-rose-50/50 rounded-2xl border border-rose-100 shadow-sm relative overflow-hidden">
          <div class="absolute right-0 top-0 bottom-0 w-1 bg-rose-400"></div>
          <div class="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-1">Số tiền yêu cầu</div>
          <div class="text-2xl font-black text-rose-600">{{ formatVND(ui.verifyModal.expected.amount) }}</div>
        </div>
        <div class="p-5 bg-blue-50/50 rounded-2xl border border-blue-100 shadow-sm relative overflow-hidden">
          <div class="absolute right-0 top-0 bottom-0 w-1 bg-blue-900"></div>
          <div class="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">AI đọc được</div>
          <div class="text-2xl font-black text-blue-900">{{ formatVND(ui.verifyModal.scanned.amount) }}</div>
          <div v-if="ui.verifyModal.scanned.content" class="text-[11px] text-slate-500 font-bold mt-2 bg-white px-3 py-1.5 rounded-lg border border-blue-50 break-words">ND: {{ ui.verifyModal.scanned.content }}</div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3 relative z-10">
        <button @click="confirmVerification(false)" class="py-4 bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700 rounded-xl font-black uppercase tracking-widest text-[10px] active:scale-95 transition-all shadow-sm">BỎ QUA</button>
        <button @click="confirmVerification(true)" class="py-4 bg-blue-900 text-white rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-blue-900/20 hover:bg-blue-800 active:scale-95 transition-all flex items-center justify-center gap-1.5"><i class="fa-solid fa-check"></i> DÙNG SỐ AI</button>
      </div>
    </div>
  </div>
</template>
