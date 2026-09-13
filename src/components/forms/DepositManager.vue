<script setup lang="ts">
import { ref, watch } from 'vue'
import { useUIStore } from '@/stores/useUIStore'
import { useFormStore } from '@/stores/useFormStore'
import { useForm } from '@/composables/useForm'
import { useAI } from '@/composables/useAI'
import { formatVND, formatShortVND, formatCurrentDepositTime } from '@/utils'

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
  const oldNum = formStore.deposit.amount
  formStore.deposit.amount = cleanNum
  formStore.deposit.isManualAmount = true
  displayAmount.value = formatDeposit(cleanNum)
  handleInputBlur()

  // If already paid and amount changed, record change
  if (formStore.deposit.isPaid && cleanNum !== oldNum) {
    const delta = cleanNum - oldNum
    const nowTime = formatCurrentDepositTime()
    formStore.deposit.time = nowTime
    if (!Array.isArray(formStore.deposit.history)) {
      formStore.deposit.history = []
    }
    // If history was empty, ensure first round exists
    if (formStore.deposit.history.length === 0 && oldNum > 0) {
      formStore.deposit.history.push({
        time: formStore.deposit.time || nowTime,
        amount: oldNum,
        delta: oldNum,
        note: 'Cọc ban đầu',
        type: 'initial'
      })
    }
    formStore.deposit.history.push({
      time: nowTime,
      amount: cleanNum,
      delta: delta,
      note: delta > 0 ? `Bổ sung cọc (Lần ${formStore.deposit.history.length + 1})` : `Giảm cọc (Lần ${formStore.deposit.history.length + 1})`,
      type: delta > 0 ? 'increase' : 'decrease'
    })
    ui.showToast(`Đã ghi nhận thay đổi cọc: [${formatShortVND(delta)}]`, 'success')
  }
}

async function addDepositInstallment(delta?: number) {
  let addVal = delta
  if (!addVal) {
    const input = await ui.showPrompt('Bổ Sung Tiền Cọc', 'Nhập số tiền cọc bổ sung (VD: 500000 hoặc 1000000):', '500000')
    if (!input) return
    addVal = parseInt(input.replace(/\D/g, '')) || 0
  }
  if (addVal <= 0) return

  const oldAmount = formStore.deposit.amount
  const newAmount = oldAmount + addVal
  formStore.deposit.amount = newAmount
  formStore.deposit.isManualAmount = true
  formStore.deposit.isPaid = true
  const nowTime = formatCurrentDepositTime()
  formStore.deposit.time = nowTime

  if (!Array.isArray(formStore.deposit.history)) {
    formStore.deposit.history = []
  }
  if (formStore.deposit.history.length === 0 && oldAmount > 0) {
    formStore.deposit.history.push({
      time: formStore.deposit.time || nowTime,
      amount: oldAmount,
      delta: oldAmount,
      note: 'Cọc ban đầu',
      type: 'initial'
    })
  }
  formStore.deposit.history.push({
    time: nowTime,
    amount: newAmount,
    delta: addVal,
    note: `Bổ sung cọc (Lần ${formStore.deposit.history.length + 1})`,
    type: 'increase'
  })
  ui.showToast(`Đã bổ sung cọc [${formatShortVND(addVal)}]! Tổng cọc: ${formatVND(newAmount)}`, 'success')
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
      const actionTime = formatCurrentDepositTime()
      formStore.deposit.time = actionTime
      if (!Array.isArray(formStore.deposit.history) || formStore.deposit.history.length === 0) {
        formStore.deposit.history = [{
          time: actionTime,
          amount: formStore.deposit.amount,
          delta: formStore.deposit.amount,
          note: note || 'Xác nhận cọc',
          type: 'initial'
        }]
      } else {
        formStore.deposit.history.push({
          time: actionTime,
          amount: formStore.deposit.amount,
          delta: formStore.deposit.amount,
          note: note || `Xác nhận cọc (Lần ${formStore.deposit.history.length + 1})`,
          type: 'increase'
        })
      }
    }
  } else {
    const confirmed = await ui.showConfirm('Hủy trạng thái cọc?', 'Bạn có chắc chắn muốn hủy trạng thái đã cọc?')
    if (confirmed) {
      formStore.deposit.isPaid = false
      formStore.deposit.image = null
      formStore.deposit.note = ''
      formStore.deposit.time = ''
      formStore.deposit.history = []
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
    class="bg-white dark:bg-surface-2 p-5 md:p-6 rounded-3xl border border-slate-100 dark:border-border-subtle shadow-sm relative overflow-hidden transition-all duration-300" 
    :class="{'ring-4 ring-emerald-500/20 bg-emerald-50/20 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40': formStore.deposit.isPaid, 'ring-8 ring-indigo-500/20 bg-indigo-50/50 dark:bg-indigo-950/40 scale-[1.02]': isDragging}"
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
    <div class="flex flex-wrap sm:flex-nowrap justify-between items-center gap-2 mb-4 border-b border-slate-100 dark:border-border-subtle pb-3">
      <div class="flex items-center gap-2 min-w-0">
        <div class="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-sm shadow-sm border border-emerald-100 dark:border-emerald-800/40 shrink-0">
          <i class="fa-solid fa-vault"></i>
        </div>
        <div class="min-w-0">
          <h3 class="font-black text-slate-800 dark:text-slate-100 text-xs uppercase tracking-widest truncate">Quản Lý Tiền Cọc</h3>
          <p class="text-[10px] font-bold text-slate-400 dark:text-slate-400 truncate">Theo dõi đặt cọc & Bill chuyển khoản</p>
        </div>
      </div>
      <div class="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <div class="text-[9px] font-black bg-slate-100 dark:bg-surface-3 px-2.5 py-1.5 rounded-xl text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-border-subtle uppercase tracking-tight flex items-center gap-1 min-h-[34px]" title="Nhân viên trực">
          <i class="fa-regular fa-user text-[10px]"></i>
          <span>{{ formStore.staff.name }}</span>
        </div>
        <button @click="autoCalcDeposit" class="text-[9px] bg-indigo-50 dark:bg-indigo-950/50 px-2.5 sm:px-3 py-1.5 rounded-xl text-indigo-700 dark:text-indigo-300 font-black hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition active:scale-95 border border-indigo-100 dark:border-indigo-800/40 min-h-[34px] cursor-pointer" aria-label="Tự động tính cọc 1/3">
          AUTO 1/3
        </button>
      </div>
    </div>

    <!-- Semantic Status Card & Amount Entry -->
    <div class="bg-slate-50/70 dark:bg-surface-canvas/60 p-3 sm:p-4 rounded-2xl border border-slate-100 dark:border-border-subtle space-y-3">
      <!-- Amount input with label and tabular font -->
      <div>
        <label for="deposit-amount-input" class="block text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-300 mb-1.5">Số tiền đặt cọc</label>
        <div class="relative">
          <input 
            id="deposit-amount-input"
            type="text" 
            v-model="displayAmount" 
            inputmode="numeric" 
            @focus="onFocus" 
            @blur="onBlur" 
            class="w-full h-12 border border-slate-200 dark:border-border-default rounded-xl px-3 font-black text-red-600 dark:text-red-400 text-lg sm:text-xl bg-white dark:bg-surface-input focus:border-red-400 dark:focus:border-red-500 focus:ring-4 focus:ring-red-50 dark:focus:ring-red-950/40 outline-none shadow-sm text-left font-tabular"
            placeholder="0đ"
          >
        </div>
      </div>

      <!-- Semantic Status Display -->
      <div v-if="!formStore.deposit.isPaid" class="bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-2xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-300 flex items-center justify-center text-sm shrink-0">
            <i class="fa-solid fa-clock-rotate-left"></i>
          </div>
          <div>
            <div class="text-[11px] font-black uppercase text-amber-800 dark:text-amber-200">Trạng thái: Chưa đặt cọc</div>
            <div class="text-[10px] text-amber-600 dark:text-amber-400 font-medium">Khách chưa xác nhận chuyển khoản hoặc tiền mặt</div>
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
      <div v-else class="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-2xl p-3 sm:p-3.5 flex flex-col gap-2.5 transition-all">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <div class="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 flex items-center justify-center text-sm shrink-0">
              <i class="fa-solid fa-check-double"></i>
            </div>
            <div class="min-w-0">
              <div class="text-[11px] font-black uppercase text-emerald-800 dark:text-emerald-200 flex flex-wrap items-center gap-1.5">
                <span>ĐÃ ĐẶT CỌC THÀNH CÔNG</span>
                <span class="bg-emerald-200/80 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 text-[10px] font-black px-1.5 py-0.5 rounded font-tabular">{{ formatVND(formStore.deposit.amount) }}</span>
              </div>
              <div class="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium truncate">{{ formStore.deposit.note || 'Chuyển khoản thành công' }}</div>
            </div>
          </div>
          <span class="text-[10px] font-mono text-emerald-700 dark:text-emerald-300 font-bold shrink-0 font-tabular bg-emerald-100/70 dark:bg-emerald-900/40 px-2 py-0.5 rounded-md border border-emerald-200/50 dark:border-emerald-800/40">{{ formStore.deposit.time }}</span>
        </div>

        <!-- Installment History Breakdown (Lần 1, Lần 2, ...) -->
        <div v-if="formStore.deposit.history && formStore.deposit.history.length > 0" class="pt-2 border-t border-emerald-200/60 dark:border-emerald-800/40 space-y-1.5">
          <div class="text-[9px] font-black uppercase text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
            <span class="flex items-center gap-1"><i class="fa-solid fa-clock-rotate-left text-[10px]"></i> Lịch sử các đợt cọc:</span>
            <span class="text-[9px] font-bold text-slate-400">({{ formStore.deposit.history.length }} lần)</span>
          </div>
          <div class="space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
            <div 
              v-for="(h, idx) in formStore.deposit.history" 
              :key="idx" 
              class="flex items-center justify-between text-[10px] font-tabular bg-white/70 dark:bg-emerald-950/60 px-2.5 py-1 rounded-lg border border-emerald-100 dark:border-emerald-800/40"
            >
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="text-[9px] font-black bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 px-1 py-0.2 rounded shrink-0">Lần {{ idx + 1 }}</span>
                <span class="text-slate-600 dark:text-slate-300 font-medium truncate">{{ h.time }}</span>
                <span class="font-black" :class="h.delta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'">
                  [{{ formatShortVND(h.delta) }}]
                </span>
              </div>
              <span class="font-bold text-slate-700 dark:text-slate-200 shrink-0 ml-2">{{ formatVND(h.amount) }}</span>
            </div>
          </div>
          <div class="pt-1 flex items-center justify-between text-[11px] font-black text-emerald-900 dark:text-emerald-200 px-1">
            <span>Tổng cọc: [{{ formatShortVND(formStore.deposit.amount) }}]</span>
            <span class="font-tabular">{{ formatVND(formStore.deposit.amount) }}</span>
          </div>
        </div>

        <!-- Action Row: Quick Add Installment & Cancel -->
        <div class="pt-2 border-t border-emerald-200/60 dark:border-emerald-800/50 flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-1.5">
            <button 
              @click.prevent="addDepositInstallment()" 
              class="min-h-[34px] px-2.5 py-1 text-[10px] font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-all active:scale-95 flex items-center gap-1 shadow-xs cursor-pointer"
              title="Bổ sung thêm đợt cọc mới"
            >
              <i class="fa-solid fa-plus text-[9px]"></i> Bổ sung cọc
            </button>
            <button 
              @click.prevent="addDepositInstallment(500000)" 
              class="min-h-[34px] px-2 py-1 text-[9px] font-bold text-emerald-800 dark:text-emerald-200 bg-emerald-100/80 dark:bg-emerald-900/40 hover:bg-emerald-200/80 dark:hover:bg-emerald-800/50 rounded-lg transition-colors cursor-pointer"
              title="Thêm nhanh 500k"
            >
              +500K
            </button>
            <button 
              @click.prevent="addDepositInstallment(1000000)" 
              class="min-h-[34px] px-2 py-1 text-[9px] font-bold text-emerald-800 dark:text-emerald-200 bg-emerald-100/80 dark:bg-emerald-900/40 hover:bg-emerald-200/80 dark:hover:bg-emerald-800/50 rounded-lg transition-colors cursor-pointer"
              title="Thêm nhanh 1 triệu"
            >
              +1TR
            </button>
          </div>
          <button 
            @click.prevent="handleTogglePaid(false)" 
            class="min-h-[34px] px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-rose-500 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
            title="Hủy xác nhận đặt cọc"
          >
            <i class="fa-solid fa-arrow-rotate-left text-[9px]"></i> Hủy cọc
          </button>
        </div>
      </div>

      <!-- Warning info if deposit is lower than 500k recommendation -->
      <div v-if="formStore.deposit.amount > 0 && formStore.deposit.amount < 500000" class="text-[10px] text-amber-600 dark:text-amber-300 font-bold bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-800/50 rounded-xl p-2.5 flex items-center gap-1.5 transition-all">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <span>Tiền cọc thấp hơn mức khuyến nghị 500.000đ.</span>
      </div>
    </div>

    <!-- Default table deposit instructions -->
    <div v-if="!formStore.items.length || !formStore.items.some(i => i.name?.trim() && i.qty > 0)" class="mt-3 text-xs text-amber-700 dark:text-amber-300 bg-amber-50/50 dark:bg-amber-950/30 border border-amber-100/70 dark:border-amber-800/40 rounded-xl p-3 flex items-start gap-2">
      <i class="fa-solid fa-circle-info mt-0.5 text-amber-500"></i>
      <div>
        <div class="font-black text-[10px] uppercase tracking-wider">Mặc định giữ bàn (Chưa đặt món)</div>
        <div class="text-[10px] mt-0.5 leading-relaxed font-semibold">
           Quy định: cọc <span class="font-black text-red-600 dark:text-red-400 font-tabular">500.000đ</span> (dưới 20 khách) hoặc <span class="font-black text-red-600 dark:text-red-400 font-tabular">1.000.000đ</span> (từ 20 khách trở lên).
        </div>
      </div>
    </div>

    <!-- AI Scan Section -->
    <div v-if="!formStore.deposit.isPaid" class="mt-3">
      <button @click="payImgIn?.click()" class="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-xs flex items-center justify-center gap-2 shadow-xl transition-all active:scale-95 min-h-[50px] cursor-pointer"><i class="fa-solid fa-magnifying-glass-dollar text-yellow-300"></i> AI SCAN BILL CHUYỂN KHOẢN</button>
      <input type="file" ref="payImgIn" @change="onTransferUpload" class="hidden" accept="image/*">
    </div>
    
    <div v-if="formStore.deposit.image" class="mt-4 relative group">
      <img :src="formStore.deposit.image" class="w-full h-32 object-contain rounded-2xl border-2 border-slate-100 dark:border-border-default bg-white dark:bg-surface-3 shadow-md" crossorigin="anonymous" referrerpolicy="no-referrer">
      <button @click="clearDeposit" aria-label="Xóa ảnh chuyển khoản" class="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-8 h-8 flex items-center justify-center shadow-xl hover:bg-red-600 transition-colors min-h-[44px] min-w-[44px] cursor-pointer"><i class="fa-solid fa-xmark"></i></button>
    </div>
  </div>
</template>
