<script setup lang="ts">
import { useUIStore } from '@/stores/useUIStore'
import { useForm } from '@/composables/useForm'
import { formatVND } from '@/utils'

const ui = useUIStore()
const { confirmVerification } = useForm()
</script>

<template>
  <div v-if="ui.verifyModal.show" class="fixed inset-0 bg-black/80 z-[10001] flex justify-center items-center p-4 backdrop-blur-sm">
    <div class="bg-white rounded-3xl shadow-2xl p-6 max-w-sm w-full border-t-8 border-amber-500">
      <h3 class="text-lg font-black text-slate-800 mb-4 text-center uppercase"><i class="fa-solid fa-triangle-exclamation text-amber-500 mr-2"></i>Số Tiền Không Khớp</h3>
      <div class="space-y-3 mb-6">
        <div class="p-4 bg-red-50 rounded-2xl border border-red-100">
          <div class="text-[10px] font-black text-red-600 uppercase tracking-wider mb-1">Số tiền yêu cầu</div>
          <div class="text-2xl font-black text-red-600">{{ formatVND(ui.verifyModal.expected.amount) }}</div>
        </div>
        <div class="p-4 bg-blue-50 rounded-2xl border border-blue-100">
          <div class="text-[10px] font-black text-blue-600 uppercase tracking-wider mb-1">AI đọc được</div>
          <div class="text-2xl font-black text-blue-600">{{ formatVND(ui.verifyModal.scanned.amount) }}</div>
          <div v-if="ui.verifyModal.scanned.content" class="text-xs text-blue-500 font-bold mt-1">ND: {{ ui.verifyModal.scanned.content }}</div>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <button @click="confirmVerification(false)" class="py-3 bg-gray-100 text-gray-600 rounded-xl font-black uppercase text-xs min-h-[44px] active-effect">Bỏ qua</button>
        <button @click="confirmVerification(true)" class="py-3 bg-blue-600 text-white rounded-xl font-black uppercase text-xs shadow-lg shadow-blue-200 min-h-[44px] active-effect">Dùng số AI</button>
      </div>
    </div>
  </div>
</template>
