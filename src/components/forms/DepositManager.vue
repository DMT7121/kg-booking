<script setup lang="ts">
import { ref, watch } from 'vue'
import { useUIStore } from '@/stores/useUIStore'
import { useFormStore } from '@/stores/useFormStore'
import { useForm } from '@/composables/useForm'
import { useAI } from '@/composables/useAI'
import { formatVND } from '@/utils'

const ui = useUIStore()
const formStore = useFormStore()
const { handleInputFocus, handleInputBlur, autoCalcDeposit, clearDeposit, handleTransferUpload } = useForm()
const { verifyTransferImage } = useAI()
const payImgIn = ref<HTMLInputElement>()
const isDragging = ref(false)

const displayAmount = ref('')
const isFocused = ref(false)

watch(() => formStore.deposit.amount, (newVal) => {
  if (!isFocused.value) {
    displayAmount.value = formatDeposit(newVal)
  }
}, { immediate: true })

function formatDeposit(val: number): string {
  if (!val) return ''
  return val.toLocaleString('vi-VN') + 'đ'
}

function onFocus() {
  isFocused.value = true
  displayAmount.value = String(formStore.deposit.amount || '')
  handleInputFocus()
}

function onBlur() {
  isFocused.value = false
  const cleanNum = parseInt(displayAmount.value.replace(/\D/g, '')) || 0
  formStore.deposit.amount = cleanNum
  displayAmount.value = formatDeposit(cleanNum)
  handleInputBlur()
}

async function handleTogglePaid(targetPaid: boolean) {
  if (targetPaid === formStore.deposit.isPaid) return
  
  if (targetPaid) {
    if (!formStore.customer.name) {
      ui.showAlert('Thiếu thông tin bắt buộc', 'Chưa có tên khách hàng. Vui lòng nhập tên khách hoặc nạp lại dữ liệu trước khi xuất/xác nhận phiếu.')
      return
    }
    const note = await ui.showPrompt('Xác Nhận Đặt Cọc', 'Nhập lý do/ghi chú (VD: CK Thành công):', 'CK Thành công')
    if (note !== null) {
      formStore.deposit.isPaid = true
      formStore.deposit.note = note || 'Confirmed'
      if (!formStore.deposit.time) {
        formStore.deposit.time = new Date().toLocaleString('vi-VN')
      }
    }
  } else {
    const confirmed = await ui.showConfirm('Hủy trạng thái cọc?', 'Bạn có chắc chắn muốn hủy trạng thái đã cọc?')
    if (confirmed) {
      formStore.deposit.isPaid = false
      formStore.deposit.image = null
      formStore.deposit.note = ''
      formStore.deposit.time = ''
    }
  }
}

function onTransferUpload(e: Event) {
  handleTransferUpload(e)
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) processTransferFile(file)
}

function processTransferFile(file: File) {
  if (!file.type.startsWith('image/')) {
    ui.showToast('Vui lòng chỉ tải lên tệp hình ảnh!', 'error')
    return
  }
  const reader = new FileReader()
  reader.onload = (ev) => verifyTransferImage(ev.target?.result as string)
  reader.readAsDataURL(file)
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
  isDragging.value = true
}
function onDragLeave() {
  isDragging.value = false
}
function onDrop(e: DragEvent) {
  e.preventDefault()
  isDragging.value = false
  const f = e.dataTransfer?.files?.[0]
  if (f) processTransferFile(f)
}
</script>

<template>
  <div 
    class="bg-white p-5 rounded-2xl border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.04)] relative overflow-hidden transition-all" 
    :class="{'ring-4 ring-emerald-500/20 bg-emerald-50/30': formStore.deposit.isPaid, 'ring-8 ring-indigo-500/20 bg-indigo-50/50 scale-[1.02]': isDragging}"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <!-- Drag Overlay -->
    <div v-if="isDragging" class="absolute inset-0 bg-indigo-600/40 backdrop-blur-sm z-50 flex flex-col items-center justify-center text-white pointer-events-none border-4 border-dashed border-indigo-400 m-2 rounded-xl">
      <i class="fa-solid fa-file-invoice-dollar text-4xl animate-bounce mb-2"></i>
      <div class="font-black text-xs uppercase tracking-widest text-center px-4">Thả Bill Chuyển Khoản Vào Đây</div>
    </div>
    
    <!-- Title & Auto buttons -->
    <div class="flex justify-between items-center mb-4">
      <label class="font-black text-[10px] uppercase text-slate-500 tracking-widest"><i class="fa-solid fa-vault text-emerald-600 mr-1"></i> Quản lý Tiền Cọc</label>
      <div class="flex gap-2">
        <div class="text-[9px] font-black bg-slate-100 px-3 py-1 rounded text-slate-500 border border-slate-200 uppercase tracking-tighter" title="Nhân viên trực">{{ formStore.staff.name }}</div>
        <button @click="autoCalcDeposit" class="text-[9px] bg-indigo-50 px-3 py-1 rounded text-indigo-700 font-black hover:bg-indigo-100 transition active:scale-95 min-h-[30px]">AUTO 1/3</button>
      </div>
    </div>

    <!-- Main Entry Container: Amount Input and Toggle Inline -->
    <div class="bg-slate-50/60 p-3 rounded-2xl border border-slate-100 space-y-3">
      <div class="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <!-- Amount input with currency symbol inside -->
        <div class="relative flex-1">
          <input 
            type="text" 
            v-model="displayAmount" 
            inputmode="numeric" 
            @focus="onFocus" 
            @blur="onBlur" 
            class="w-full h-12 border border-slate-200 rounded-xl px-3 font-black text-red-600 text-xl bg-white focus:border-red-400 focus:ring-4 focus:ring-red-50 outline-none shadow-sm text-left"
            placeholder="0đ"
          >
        </div>
        
        <!-- Toggle button segment -->
        <div class="flex bg-slate-200/60 p-0.5 rounded-xl items-center select-none shrink-0">
          <button 
            @click.prevent="handleTogglePaid(false)" 
            :class="['px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all min-h-[36px] min-w-[76px]', !formStore.deposit.isPaid ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700']"
          >
            Chưa cọc
          </button>
          <button 
            @click.prevent="handleTogglePaid(true)" 
            :class="['px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all min-h-[36px] min-w-[76px]', formStore.deposit.isPaid ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700']"
          >
            Đã cọc
          </button>
        </div>
      </div>

      <!-- Warning info if deposit is lower than 500k recommendation -->
      <div v-if="formStore.deposit.amount > 0 && formStore.deposit.amount < 500000" class="text-[10px] text-amber-600 font-bold bg-amber-50 border border-amber-100 rounded-xl p-2.5 flex items-center gap-1.5 transition-all">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <span>Tiền cọc thấp hơn mức khuyến nghị 500.000đ.</span>
      </div>

      <!-- Paid detail message -->
      <div v-if="formStore.deposit.isPaid" class="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl p-2.5 flex items-center justify-between transition-all">
        <div class="flex items-center gap-1.5">
          <i class="fa-solid fa-circle-check"></i>
          <span class="font-bold">Đã cọc: {{ formStore.deposit.note }}</span>
        </div>
        <span class="text-[9px] font-mono text-emerald-600 font-bold shrink-0">{{ formStore.deposit.time }}</span>
      </div>
    </div>

    <!-- Default table deposit instructions -->
    <div v-if="!formStore.items.length || !formStore.items.some(i => i.name?.trim() && i.qty > 0)" class="mt-3 text-xs text-amber-700 bg-amber-50/50 border border-amber-100/70 rounded-xl p-3 flex items-start gap-2">
      <i class="fa-solid fa-circle-info mt-0.5 text-amber-500"></i>
      <div>
        <div class="font-black text-[10px] uppercase tracking-wider">Mặc định giữ bàn (Chưa đặt món)</div>
        <div class="text-[10px] mt-0.5 leading-relaxed font-semibold">
           Quy định: cọc <span class="font-black text-red-600">500.000đ</span> (dưới 20 khách) hoặc <span class="font-black text-red-600">1.000.000đ</span> (từ 20 khách trở lên).
        </div>
      </div>
    </div>

    <!-- AI Scan Section -->
    <div v-if="!formStore.deposit.isPaid" class="mt-3">
      <button @click="payImgIn?.click()" class="w-full h-12 bg-indigo-600 text-white rounded-2xl font-black text-xs flex items-center justify-center gap-2 hover:bg-indigo-700 shadow-xl transition-all active:scale-95 min-h-[50px]"><i class="fa-solid fa-magnifying-glass-dollar text-yellow-300"></i> AI SCAN BILL CHUYỂN KHOẢN</button>
      <input type="file" ref="payImgIn" @change="onTransferUpload" class="hidden" accept="image/*">
    </div>
    
    <div v-if="formStore.deposit.image" class="mt-4 relative group">
      <img :src="formStore.deposit.image" class="w-full h-32 object-contain rounded-2xl border-2 border-slate-100 bg-white shadow-md" crossorigin="anonymous" referrerpolicy="no-referrer">
      <button @click="clearDeposit" class="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-8 h-8 flex items-center justify-center shadow-xl hover:bg-red-600 transition-colors min-h-[44px] min-w-[44px]"><i class="fa-solid fa-xmark"></i></button>
    </div>
  </div>
</template>
