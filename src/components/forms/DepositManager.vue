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
  formStore.deposit.isManualAmount = true
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
      // Always update the time to the actual action time
      formStore.deposit.time = new Date().toLocaleString('vi-VN')
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
    class="bg-white p-5 md:p-6 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden transition-all duration-300" 
    :class="{'ring-4 ring-emerald-500/20 bg-emerald-50/20 border-emerald-200': formStore.deposit.isPaid, 'ring-8 ring-indigo-500/20 bg-indigo-50/50 scale-[1.02]': isDragging}"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <!-- Drag Overlay -->
    <div v-if="isDragging" class="absolute inset-0 bg-indigo-600/40 backdrop-blur-sm z-50 flex flex-col items-center justify-center text-white pointer-events-none border-4 border-dashed border-indigo-400 m-2 rounded-2xl">
      <i class="fa-solid fa-file-invoice-dollar text-4xl animate-bounce mb-2"></i>
      <div class="font-black text-xs uppercase tracking-widest text-center px-4">Thả Bill Chuyển Khoản Vào Đây</div>
    </div>
    
    <!-- Title & Auto buttons -->
    <div class="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-sm shadow-sm border border-emerald-100 shrink-0">
          <i class="fa-solid fa-vault"></i>
        </div>
        <div>
          <h3 class="font-black text-slate-800 text-xs uppercase tracking-widest">Quản Lý Tiền Cọc</h3>
          <p class="text-[10px] font-bold text-slate-400">Theo dõi đặt cọc & Bill chuyển khoản</p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <div class="text-[9px] font-black bg-slate-100 px-2.5 py-1.5 rounded-xl text-slate-500 border border-slate-200 uppercase tracking-tight flex items-center gap-1 min-h-[36px]" title="Nhân viên trực">
          <i class="fa-regular fa-user text-[10px]"></i>
          <span>{{ formStore.staff.name }}</span>
        </div>
        <button @click="autoCalcDeposit" class="text-[9px] bg-indigo-50 px-3 py-1.5 rounded-xl text-indigo-700 font-black hover:bg-indigo-100 transition active:scale-95 border border-indigo-100 min-h-[36px] cursor-pointer" aria-label="Tự động tính cọc 1/3">
          AUTO 1/3
        </button>
      </div>
    </div>

    <!-- Semantic Status Card & Amount Entry -->
    <div class="bg-slate-50/70 p-3 sm:p-4 rounded-2xl border border-slate-100 space-y-3">
      <!-- Amount input with label and tabular font -->
      <div>
        <label for="deposit-amount-input" class="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1.5">Số tiền đặt cọc</label>
        <div class="relative">
          <input 
            id="deposit-amount-input"
            type="text" 
            v-model="displayAmount" 
            inputmode="numeric" 
            @focus="onFocus" 
            @blur="onBlur" 
            class="w-full h-12 border border-slate-200 rounded-xl px-3 font-black text-red-600 text-lg sm:text-xl bg-white focus:border-red-400 focus:ring-4 focus:ring-red-50 outline-none shadow-sm text-left font-tabular"
            placeholder="0đ"
          >
        </div>
      </div>

      <!-- Semantic Status Display -->
      <div v-if="!formStore.deposit.isPaid" class="bg-amber-50/80 border border-amber-200 rounded-2xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center text-sm shrink-0">
            <i class="fa-solid fa-clock-rotate-left"></i>
          </div>
          <div>
            <div class="text-[11px] font-black uppercase text-amber-800">Trạng thái: Chưa đặt cọc</div>
            <div class="text-[10px] text-amber-600 font-medium">Khách chưa xác nhận chuyển khoản hoặc tiền mặt</div>
          </div>
        </div>
        <button 
          @click.prevent="handleTogglePaid(true)"
          class="min-h-[46px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider rounded-xl active:scale-95 transition-all shadow-sm flex items-center justify-center gap-1.5 shrink-0"
        >
          <i class="fa-solid fa-circle-check"></i> XÁC NHẬN CỌC
        </button>
      </div>

      <!-- Paid Status Card (Clear Emerald State) -->
      <div v-else class="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 flex flex-col gap-2 transition-all">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm shrink-0">
              <i class="fa-solid fa-check-double"></i>
            </div>
            <div>
              <div class="text-[11px] font-black uppercase text-emerald-800 flex items-center gap-1.5">
                ĐÃ ĐẶT CỌC THÀNH CÔNG
                <span class="bg-emerald-200/80 text-emerald-800 text-[9px] font-black px-1.5 py-0.5 rounded font-tabular">{{ formatVND(formStore.deposit.amount) }}</span>
              </div>
              <div class="text-[10px] text-emerald-700 font-medium">{{ formStore.deposit.note || 'Chuyển khoản thành công' }}</div>
            </div>
          </div>
          <span class="text-[9px] font-mono text-emerald-600 font-bold shrink-0 font-tabular">{{ formStore.deposit.time }}</span>
        </div>

        <!-- Segregated Destructive Action (Canceling Deposit) -->
        <div class="pt-2 border-t border-emerald-100 flex justify-end">
          <button 
            @click.prevent="handleTogglePaid(false)" 
            class="min-h-[38px] px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors flex items-center gap-1"
            title="Hủy xác nhận đặt cọc"
          >
            <i class="fa-solid fa-arrow-rotate-left text-[10px]"></i> HỦY TRẠNG THÁI CỌC
          </button>
        </div>
      </div>

      <!-- Warning info if deposit is lower than 500k recommendation -->
      <div v-if="formStore.deposit.amount > 0 && formStore.deposit.amount < 500000" class="text-[10px] text-amber-600 font-bold bg-amber-50 border border-amber-100 rounded-xl p-2.5 flex items-center gap-1.5 transition-all">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <span>Tiền cọc thấp hơn mức khuyến nghị 500.000đ.</span>
      </div>
    </div>

    <!-- Default table deposit instructions -->
    <div v-if="!formStore.items.length || !formStore.items.some(i => i.name?.trim() && i.qty > 0)" class="mt-3 text-xs text-amber-700 bg-amber-50/50 border border-amber-100/70 rounded-xl p-3 flex items-start gap-2">
      <i class="fa-solid fa-circle-info mt-0.5 text-amber-500"></i>
      <div>
        <div class="font-black text-[10px] uppercase tracking-wider">Mặc định giữ bàn (Chưa đặt món)</div>
        <div class="text-[10px] mt-0.5 leading-relaxed font-semibold">
           Quy định: cọc <span class="font-black text-red-600 font-tabular">500.000đ</span> (dưới 20 khách) hoặc <span class="font-black text-red-600 font-tabular">1.000.000đ</span> (từ 20 khách trở lên).
        </div>
      </div>
    </div>

    <!-- AI Scan Section -->
    <div v-if="!formStore.deposit.isPaid" class="mt-3">
      <button @click="payImgIn?.click()" class="w-full h-12 bg-indigo-600 text-white rounded-2xl font-black text-xs flex items-center justify-center gap-2 hover:bg-indigo-700 shadow-xl transition-all active:scale-95 min-h-[50px] cursor-pointer"><i class="fa-solid fa-magnifying-glass-dollar text-yellow-300"></i> AI SCAN BILL CHUYỂN KHOẢN</button>
      <input type="file" ref="payImgIn" @change="onTransferUpload" class="hidden" accept="image/*">
    </div>
    
    <div v-if="formStore.deposit.image" class="mt-4 relative group">
      <img :src="formStore.deposit.image" class="w-full h-32 object-contain rounded-2xl border-2 border-slate-100 bg-white shadow-md" crossorigin="anonymous" referrerpolicy="no-referrer">
      <button @click="clearDeposit" aria-label="Xóa ảnh chuyển khoản" class="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-8 h-8 flex items-center justify-center shadow-xl hover:bg-red-600 transition-colors min-h-[44px] min-w-[44px]"><i class="fa-solid fa-xmark"></i></button>
    </div>
  </div>
</template>
