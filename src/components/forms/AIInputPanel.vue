<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useUIStore } from '@/stores/useUIStore'
import { useFormStore } from '@/stores/useFormStore'
import { useConfigStore } from '@/stores/useConfigStore'
import { useAI } from '@/composables/useAI'
import { useForm } from '@/composables/useForm'
import { abortActiveAIRequest } from '@/services/api'
import { formatVND } from '@/utils'

const ui = useUIStore()
const formStore = useFormStore()
const configStore = useConfigStore()
const { processAI, ocrExtractText, fillBookingFormSafely } = useAI()
const { handleInputFocus, handleInputBlur, toggleVoiceMode } = useForm()
const aiFileIn = ref<HTMLInputElement>()
const isDragging = ref(false)
const showAiReview = ref(false)
const isProcessing = ref(false)
const isEditing = ref(false)

const hasWarnings = computed(() => {
  const confs = formStore.aiMetadata?.confidences
  if (!confs) return false
  return Object.values(confs).some((c: any) => c && c.needs_review)
})

async function handleAnalyze() {
  if (isProcessing.value) {
    abortActiveAIRequest()
    ui.showToast('Đã hủy yêu cầu phân tích AI!', 'warning')
    isProcessing.value = false
    return
  }
  isProcessing.value = true
  try {
    ui.showToast('Đang phân tích dữ liệu...', 'info')
    await processAI()
  } catch (err: any) {
    if (err.name === 'AbortError') {
      ui.showToast('Đã hủy phân tích!', 'warning')
    } else {
      ui.showToast('Lỗi phân tích: ' + err.message, 'error')
    }
  } finally {
    isProcessing.value = false
  }
}

watch(() => formStore.aiMetadata, (newVal) => {
  if (newVal) {
    showAiReview.value = true
  } else {
    showAiReview.value = false
  }
})

function applyAll() {
  if (!formStore.parsedAiResult) return
  fillBookingFormSafely(formStore.parsedAiResult, { mode: 'all' })
  closeReviewCard()
  ui.showToast('✅ Đã áp dụng toàn bộ thông tin AI!', 'success')
}

function applyCustomerOnly() {
  if (!formStore.parsedAiResult) return
  fillBookingFormSafely(formStore.parsedAiResult, { mode: 'customer' })
  closeReviewCard()
  ui.showToast('👤 Đã áp dụng thông tin khách hàng!', 'success')
}

function applyMenuOnly() {
  if (!formStore.parsedAiResult) return
  fillBookingFormSafely(formStore.parsedAiResult, { mode: 'menu' })
  closeReviewCard()
  ui.showToast('🍽️ Đã áp dụng danh sách món!', 'success')
}

function closeReviewCard() {
  showAiReview.value = false
  formStore.aiMetadata = null
  formStore.parsedAiResult = null
  formStore.originalAiValues = null
  isEditing.value = false
}

function ignoreResult() {
  closeReviewCard()
  ui.showToast('⚠️ Đã bỏ qua kết quả AI!', 'warning')
}

function getConfidenceColorClass(val: number) {
  if (val >= 0.8) return 'text-emerald-600 bg-emerald-50 border-emerald-200'
  if (val >= 0.5) return 'text-amber-605 bg-amber-50 border-amber-250 ring-2 ring-amber-300/40'
  return 'text-rose-600 bg-rose-50 border-rose-200 ring-2 ring-rose-300/40'
}

function getFieldClass(fieldKey: string, confVal: number) {
  const isDirty = formStore.parsedAiResult?.needs_review_fields?.includes(fieldKey) || confVal < 0.75
  if (isDirty) {
    return 'border-amber-400 bg-amber-50/50 ring-4 ring-amber-500/10 animate-pulse-subtle'
  }
  return 'border-slate-100 bg-slate-50/50'
}

function clearText() {
  formStore.rawInput = ''
}

async function pasteClipboard() {
  try {
    const text = await navigator.clipboard.readText()
    if (text) {
      formStore.rawInput = (formStore.rawInput ? formStore.rawInput + '\n' : '') + text
      ui.showToast('📋 Đã dán nội dung từ Clipboard!', 'success')
    } else {
      ui.showToast('Không có nội dung dạng văn bản trong clipboard!', 'warning')
    }
  } catch (err: any) {
    ui.showToast('Không thể đọc clipboard: ' + err.message, 'error')
  }
}

async function processImage(f: File) {
  if (!f.type.startsWith('image/')) {
    ui.showToast('Vui lòng chỉ tải lên tệp hình ảnh!', 'error')
    return
  }
  
  const r = new FileReader()
  r.onload = async (ev) => {
    const base64 = ev.target?.result as string
    formStore.aiImage = base64 // Show thumbnail temporarily
    try {
      const text = await ocrExtractText(base64)
      if (text) {
        formStore.rawInput = (formStore.rawInput ? formStore.rawInput + '\n\n' : '') + text
        formStore.aiImage = null // Clear image so processAI focuses purely on text
      }
    } catch (err: any) {
      ui.showToast('Lỗi OCR: ' + err.message, 'error')
    }
    if (aiFileIn.value) aiFileIn.value.value = '' // Reset input
  }
  r.readAsDataURL(f)
}

function onImageSelect(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) processImage(f)
}

function onPaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return
  for (const item of items) {
    if (item.type.indexOf('image') !== -1) {
      e.preventDefault()
      const f = item.getAsFile()
      if (f) processImage(f)
      break
    }
  }
}

// --- Drag & Drop ---
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
  if (f) processImage(f)
}
</script>

<template>
  <div 
    class="bg-gradient-to-br from-blue-600 to-indigo-700 p-4 rounded-2xl shadow-xl relative overflow-hidden group transition-all"
    :class="{'ring-8 ring-yellow-400 ring-inset scale-[1.02]': isDragging}"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <!-- Drag Overlay -->
    <div v-if="isDragging" class="absolute inset-0 bg-blue-600/60 backdrop-blur-sm z-50 flex flex-col items-center justify-center text-white pointer-events-none border-4 border-dashed border-white/50 m-2 rounded-xl">
      <i class="fa-solid fa-cloud-arrow-up text-5xl animate-bounce mb-2"></i>
      <div class="font-black text-lg uppercase tracking-tighter">THẢ ẢNH VÀO ĐÂY</div>
      <div class="text-xs opacity-80 uppercase tracking-widest mt-1">AI Sẽ Tự Động Phân Tích</div>
    </div>

    <div class="absolute top-0 right-0 p-6 opacity-10 pointer-events-none transform translate-x-4 -translate-y-4"><i class="fa-solid fa-bolt-lightning text-7xl text-white"></i></div>
    <div class="flex justify-between items-center mb-3 relative z-10">
      <h3 class="font-black text-white text-[9px] uppercase tracking-widest flex items-center gap-2"><i class="fa-solid fa-wand-sparkles text-yellow-300"></i> AI Core v6.0</h3>
      <span class="text-[8px] px-2 py-0.5 bg-white text-blue-700 rounded-full font-black uppercase shadow-sm border border-white/50" :class="{'animate-pulse': ui.listening}">{{ ui.listening ? 'LISTENING...' : 'SMART ROUTING ON' }}</span>
    </div>

    <div class="space-y-2 relative z-10 text-white">
      <div class="relative">
        <textarea v-model="formStore.rawInput" @focus="handleInputFocus" @blur="handleInputBlur" @paste="onPaste" rows="3" class="w-full pt-10 pb-12 px-3 border-none rounded-xl text-sm bg-white/95 text-slate-800 font-medium focus:ring-4 focus:ring-yellow-400 outline-none shadow-xl placeholder-slate-400 transition-all custom-scrollbar" placeholder="Dán nội dung đặt bàn, nói 'Hey King', hoặc kéo thả ảnh Bill vào đây..."></textarea>
        
        <!-- Top Right Actions inside textarea -->
        <div class="absolute top-2 right-2 flex gap-1 z-20 bg-slate-100/80 backdrop-blur rounded-lg p-0.5 border border-slate-200 shadow-sm">
          <button @click.prevent="clearText" class="px-2 py-1 text-[9px] font-black text-slate-600 hover:text-red-600 uppercase tracking-widest rounded transition-all select-none cursor-pointer" title="Xóa hết chữ">Xóa</button>
          <div class="w-[1px] h-3 bg-slate-300 align-middle my-auto"></div>
          <button @click.prevent="pasteClipboard" class="px-2 py-1 text-[9px] font-black text-slate-600 hover:text-blue-600 uppercase tracking-widest rounded transition-all select-none cursor-pointer" title="Dán từ Clipboard">Dán nhanh</button>
        </div>

        <div class="absolute bottom-2 right-2 flex gap-1.5 z-20">
          <button v-if="ui.isVoiceSupported" @click="toggleVoiceMode" :class="['w-9 h-9 rounded-full flex items-center justify-center transition-all shadow-lg active-effect', ui.listening ? 'recording-active' : 'bg-white text-blue-600 hover-effect']" title="Voice Assistant"><i class="fa-solid fa-microphone text-sm"></i></button>
          <button @click="aiFileIn?.click()" class="w-9 h-9 rounded-full bg-white text-indigo-600 flex items-center justify-center transition-all shadow-lg active-effect hover-effect" title="Upload Image"><i class="fa-solid fa-image text-sm"></i></button>
          <input type="file" ref="aiFileIn" @change="onImageSelect" class="hidden" accept="image/*">
        </div>
      </div>

      <div v-if="formStore.aiImage" class="flex items-center p-2 bg-white/10 backdrop-blur rounded-xl gap-3 border border-white/20">
        <img :src="formStore.aiImage" class="h-12 w-12 object-cover rounded-lg shadow-md border-2 border-white">
        <div class="flex-grow">
          <div class="text-[9px] font-black text-white uppercase tracking-wider">Đã nhận diện hình ảnh</div>
          <div class="text-[8px] text-blue-100 italic">Vision OCR Ready</div>
        </div>
        <button @click="formStore.aiImage = null" class="text-white/60 hover:text-red-300 mr-2 transition-colors min-h-[44px] min-w-[44px]"><i class="fa-solid fa-trash-can"></i></button>
      </div>
    </div>

    <button @click="handleAnalyze" class="w-full mt-3 py-3 rounded-xl font-black text-sm shadow-lg border flex justify-center items-center gap-2 active:scale-95 transition-all min-h-[48px] active-effect cursor-pointer"
      :class="isProcessing ? 'bg-red-500 hover:bg-red-600 text-white border-red-600' : 'bg-white hover:bg-slate-50 text-blue-700 border-white/50'">
      <i v-if="isProcessing" class="fa-solid fa-spinner animate-spin"></i>
      <i v-else class="fa-solid fa-rocket"></i>
      {{ isProcessing ? 'HỦY PHÂN TÍCH (CANCEL)' : 'PHÂN TÍCH (QUICK EXTRACT)' }}
    </button>
  </div>

  <!-- Parsed Fields Review Card -->
  <transition name="fade">
    <div v-if="showAiReview && formStore.parsedAiResult" class="mt-4 bg-white border border-slate-200 rounded-3xl p-5 shadow-xl text-slate-800 space-y-4 relative z-10 box-border w-full">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <div class="flex items-center gap-2">
          <i class="fa-solid fa-wand-sparkles text-blue-600 text-sm animate-pulse"></i>
          <span class="font-black text-slate-800 text-[11px] uppercase tracking-widest">Xác nhận kết quả AI (v7.0)</span>
        </div>
        <span class="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-[9px] font-black uppercase tracking-wider border border-blue-100">
          Độ tin cậy: {{ Math.round((formStore.parsedAiResult.confidence?.overall || 0) * 100) }}%
        </span>
      </div>

      <!-- Warning Alert Box -->
      <div v-if="hasWarnings || formStore.unresolvedItems?.length" class="p-3 bg-amber-50/80 border border-amber-300 rounded-2xl flex items-start gap-2.5 text-amber-800 text-[11px] font-bold">
        <i class="fa-solid fa-triangle-exclamation text-base text-amber-500 shrink-0 mt-0.5 animate-bounce"></i>
        <div>
          <div class="font-black text-slate-900 uppercase">Cần Kiểm Tra Lại</div>
          <div class="text-slate-655 mt-0.5 leading-relaxed font-semibold">Một số thông tin trích xuất có độ tin cậy thấp hoặc nghi ngờ sai lệch. Vui lòng kiểm tra các ô viền vàng và cập nhật lại!</div>
        </div>
      </div>

      <!-- Unresolved Menu Warnings -->
      <div v-if="formStore.unresolvedItems?.length" class="p-3 bg-rose-50 border border-rose-250 rounded-2xl text-rose-800 text-[11px] font-bold">
        <div class="font-black text-rose-950 uppercase mb-1 flex items-center gap-1.5">
          <i class="fa-solid fa-circle-exclamation text-rose-500 shrink-0"></i> Món chưa khớp thực đơn (Đề xuất 0đ):
        </div>
        <ul class="list-disc pl-4 space-y-0.5 leading-relaxed">
          <li v-for="item in formStore.unresolvedItems" :key="item">{{ item }}</li>
        </ul>
      </div>

      <!-- Section: Customer & Booking Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <!-- Name -->
        <div class="p-3 rounded-2xl border transition-all" :class="getFieldClass('customer_name', formStore.parsedAiResult.confidence?.customer_name)">
          <div class="text-[9px] font-black text-slate-450 uppercase tracking-widest">Tên khách</div>
          <div class="mt-1 flex items-center justify-between gap-2">
            <template v-if="isEditing">
              <input type="text" v-model="formStore.parsedAiResult.customer.name" class="w-full px-2.5 py-1.5 text-xs border border-slate-250 rounded-xl focus:ring-2 focus:ring-blue-400 outline-none bg-white font-bold text-slate-800">
            </template>
            <template v-else>
              <span class="text-xs font-black text-slate-800 truncate">{{ formStore.parsedAiResult.customer.name || '---' }}</span>
              <span class="text-[8px] px-1.5 py-0.5 rounded font-black border shrink-0" :class="getConfidenceColorClass(formStore.parsedAiResult.confidence?.customer_name)">
                {{ Math.round((formStore.parsedAiResult.confidence?.customer_name || 0) * 100) }}%
              </span>
            </template>
          </div>
          <div v-if="!isEditing && (formStore.parsedAiResult.confidence?.customer_name < 0.75)" class="text-[8px] text-amber-600 font-extrabold mt-1 leading-normal">
            <i class="fa-solid fa-circle-info shrink-0"></i> Tên chứa từ khóa nghi vấn (ngày/giờ/món...)
          </div>
        </div>

        <!-- Phone -->
        <div class="p-3 rounded-2xl border transition-all" :class="getFieldClass('phone', formStore.parsedAiResult.confidence?.phone)">
          <div class="text-[9px] font-black text-slate-450 uppercase tracking-widest">Số điện thoại</div>
          <div class="mt-1 flex items-center justify-between gap-2">
            <template v-if="isEditing">
              <input type="text" v-model="formStore.parsedAiResult.customer.phone" class="w-full px-2.5 py-1.5 text-xs border border-slate-250 rounded-xl focus:ring-2 focus:ring-blue-400 outline-none bg-white font-bold text-slate-800">
            </template>
            <template v-else>
              <span class="text-xs font-black text-slate-800 truncate">{{ formStore.parsedAiResult.customer.phone || '---' }}</span>
              <span class="text-[8px] px-1.5 py-0.5 rounded font-black border shrink-0" :class="getConfidenceColorClass(formStore.parsedAiResult.confidence?.phone)">
                {{ Math.round((formStore.parsedAiResult.confidence?.phone || 0) * 100) }}%
              </span>
            </template>
          </div>
          <div v-if="!isEditing && (formStore.parsedAiResult.confidence?.phone < 0.75)" class="text-[8px] text-amber-600 font-extrabold mt-1 leading-normal">
            <i class="fa-solid fa-circle-info shrink-0"></i> SĐT không đúng định dạng VN hoặc thiếu số
          </div>
        </div>

        <!-- Date -->
        <div class="p-3 rounded-2xl border transition-all" :class="getFieldClass('event_date', formStore.parsedAiResult.confidence?.event_date)">
          <div class="text-[9px] font-black text-slate-450 uppercase tracking-widest">Ngày tổ chức</div>
          <div class="mt-1 flex items-center justify-between gap-2">
            <template v-if="isEditing">
              <input type="text" v-model="formStore.parsedAiResult.booking.event_date" class="w-full px-2.5 py-1.5 text-xs border border-slate-250 rounded-xl focus:ring-2 focus:ring-blue-400 outline-none bg-white font-bold text-slate-800" placeholder="DD/MM/YYYY">
            </template>
            <template v-else>
              <span class="text-xs font-black text-slate-800">{{ formStore.parsedAiResult.booking.event_date || '---' }}</span>
              <span class="text-[8px] px-1.5 py-0.5 rounded font-black border shrink-0" :class="getConfidenceColorClass(formStore.parsedAiResult.confidence?.event_date)">
                {{ Math.round((formStore.parsedAiResult.confidence?.event_date || 0) * 100) }}%
              </span>
            </template>
          </div>
          <div v-if="!isEditing && (formStore.parsedAiResult.confidence?.event_date < 0.75)" class="text-[8px] text-amber-600 font-extrabold mt-1 leading-normal">
            <i class="fa-solid fa-circle-info shrink-0"></i> Ngày đã qua hoặc sai định dạng DD/MM/YYYY
          </div>
        </div>

        <!-- Time -->
        <div class="p-3 rounded-2xl border transition-all" :class="getFieldClass('event_time', formStore.parsedAiResult.confidence?.event_time)">
          <div class="text-[9px] font-black text-slate-450 uppercase tracking-widest">Giờ tiệc</div>
          <div class="mt-1 flex items-center justify-between gap-2">
            <template v-if="isEditing">
              <input type="text" v-model="formStore.parsedAiResult.booking.event_time" class="w-full px-2.5 py-1.5 text-xs border border-slate-250 rounded-xl focus:ring-2 focus:ring-blue-400 outline-none bg-white font-bold text-slate-800" placeholder="HH:MM">
            </template>
            <template v-else>
              <span class="text-xs font-black text-slate-800">{{ formStore.parsedAiResult.booking.event_time || '---' }}</span>
              <span class="text-[8px] px-1.5 py-0.5 rounded font-black border shrink-0" :class="getConfidenceColorClass(formStore.parsedAiResult.confidence?.event_time)">
                {{ Math.round((formStore.parsedAiResult.confidence?.event_time || 0) * 100) }}%
              </span>
            </template>
          </div>
          <div v-if="!isEditing && (formStore.parsedAiResult.confidence?.event_time < 0.75)" class="text-[8px] text-amber-600 font-extrabold mt-1 leading-normal">
            <i class="fa-solid fa-circle-info shrink-0"></i> Giờ nằm ngoài khung hoạt động (15:00 - 23:30)
          </div>
        </div>

        <!-- Pax -->
        <div class="p-3 rounded-2xl border transition-all" :class="getFieldClass('guest_count', formStore.parsedAiResult.confidence?.guest_count)">
          <div class="text-[9px] font-black text-slate-450 uppercase tracking-widest">Số khách</div>
          <div class="mt-1 flex items-center justify-between gap-2">
            <template v-if="isEditing">
              <input type="number" v-model.number="formStore.parsedAiResult.booking.guest_count" class="w-full px-2.5 py-1.5 text-xs border border-slate-250 rounded-xl focus:ring-2 focus:ring-blue-400 outline-none bg-white font-bold text-slate-800">
            </template>
            <template v-else>
              <span class="text-xs font-black text-slate-800">{{ formStore.parsedAiResult.booking.guest_count || '---' }} pax</span>
              <span class="text-[8px] px-1.5 py-0.5 rounded font-black border shrink-0" :class="getConfidenceColorClass(formStore.parsedAiResult.confidence?.guest_count)">
                {{ Math.round((formStore.parsedAiResult.confidence?.guest_count || 0) * 100) }}%
              </span>
            </template>
          </div>
          <div v-if="!isEditing && (formStore.parsedAiResult.confidence?.guest_count < 0.75)" class="text-[8px] text-amber-600 font-extrabold mt-1 leading-normal">
            <i class="fa-solid fa-circle-info shrink-0"></i> Số lượng khách ngoài khoảng thông thường (1 - 200)
          </div>
        </div>

        <!-- Table -->
        <div class="p-3 rounded-2xl border border-slate-100 bg-slate-50/50">
          <div class="text-[9px] font-black text-slate-450 uppercase tracking-widest">Số bàn</div>
          <div class="mt-1 flex items-center justify-between gap-2">
            <template v-if="isEditing">
              <input type="text" v-model="formStore.parsedAiResult.booking.table_number" class="w-full px-2.5 py-1.5 text-xs border border-slate-250 rounded-xl focus:ring-2 focus:ring-blue-400 outline-none bg-white font-bold text-slate-800">
            </template>
            <template v-else>
              <span class="text-xs font-black text-slate-800 truncate">{{ formStore.parsedAiResult.booking.table_number || '---' }}</span>
            </template>
          </div>
        </div>

        <!-- Event Type -->
        <div class="p-3 rounded-2xl border border-slate-100 bg-slate-50/50">
          <div class="text-[9px] font-black text-slate-450 uppercase tracking-widest">Loại tiệc / Nhu cầu</div>
          <div class="mt-1 flex items-center justify-between gap-2">
            <template v-if="isEditing">
              <input type="text" v-model="formStore.parsedAiResult.booking.need" class="w-full px-2.5 py-1.5 text-xs border border-slate-250 rounded-xl focus:ring-2 focus:ring-blue-400 outline-none bg-white font-bold text-slate-800">
            </template>
            <template v-else>
              <span class="text-xs font-black text-slate-800 truncate">{{ formStore.parsedAiResult.booking.need || 'Ăn thường' }}</span>
            </template>
          </div>
        </div>

        <!-- Deposit -->
        <div class="p-3 rounded-2xl border transition-all" :class="getFieldClass('deposit', formStore.parsedAiResult.confidence?.deposit)">
          <div class="text-[9px] font-black text-slate-450 uppercase tracking-widest">Tiền đặt cọc</div>
          <div class="mt-1 flex items-center justify-between gap-2">
            <template v-if="isEditing">
              <div class="flex gap-1.5 w-full">
                <input type="number" v-model.number="formStore.parsedAiResult.deposit.amount" class="w-2/3 px-2 py-1 text-xs border border-slate-250 rounded-lg focus:ring-2 focus:ring-blue-400 outline-none bg-white font-bold text-slate-800">
                <input type="text" v-model="formStore.parsedAiResult.deposit.status" class="w-1/3 px-2 py-1 text-xs border border-slate-250 rounded-lg focus:ring-2 focus:ring-blue-400 outline-none bg-white font-bold text-slate-800 text-center" placeholder="Đã cọc">
              </div>
            </template>
            <template v-else>
              <span class="text-xs font-black text-slate-800">
                {{ formStore.parsedAiResult.deposit.amount ? formatVND(formStore.parsedAiResult.deposit.amount) : '---' }}
                <span v-if="formStore.parsedAiResult.deposit.status" class="text-[8px] px-1 py-0.5 bg-blue-100 text-blue-700 rounded font-black uppercase">{{ formStore.parsedAiResult.deposit.status }}</span>
              </span>
              <span class="text-[8px] px-1.5 py-0.5 rounded font-black border shrink-0" :class="getConfidenceColorClass(formStore.parsedAiResult.confidence?.deposit)">
                {{ Math.round((formStore.parsedAiResult.confidence?.deposit || 0) * 100) }}%
              </span>
            </template>
          </div>
        </div>
      </div>

      <!-- Decoration & Notes -->
      <div class="space-y-3.5">
        <div class="p-3 rounded-2xl border border-slate-100 bg-slate-50/50">
          <div class="text-[9px] font-black text-slate-450 uppercase tracking-widest">Nội dung bảng chữ / Trang trí</div>
          <div class="mt-1">
            <template v-if="isEditing">
              <input type="text" v-model="formStore.parsedAiResult.decoration.text_on_board" class="w-full px-2.5 py-1.5 text-xs border border-slate-250 rounded-xl focus:ring-2 focus:ring-blue-400 outline-none bg-white font-semibold text-slate-800">
            </template>
            <template v-else>
              <span class="text-xs font-bold text-slate-800 italic block">{{ formStore.parsedAiResult.decoration.text_on_board || 'Không có' }}</span>
            </template>
          </div>
        </div>

        <div class="p-3 rounded-2xl border border-slate-100 bg-slate-50/50">
          <div class="text-[9px] font-black text-slate-450 uppercase tracking-widest">Ghi chú từ khách hàng</div>
          <div class="mt-1">
            <template v-if="isEditing">
              <textarea v-model="formStore.parsedAiResult.notes.customer_note" rows="2" class="w-full px-2.5 py-2 text-xs border border-slate-250 rounded-xl focus:ring-2 focus:ring-blue-400 outline-none bg-white font-medium text-slate-800 custom-scrollbar"></textarea>
            </template>
            <template v-else>
              <span class="text-xs font-semibold text-slate-700 block whitespace-pre-line leading-relaxed">{{ formStore.parsedAiResult.notes.customer_note || 'Không có' }}</span>
            </template>
          </div>
        </div>
      </div>

      <!-- Menu Items Section -->
      <div class="space-y-2">
        <div class="flex justify-between items-center">
          <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><i class="fa-solid fa-utensils text-slate-400"></i> Thực đơn đặt món ({{ formStore.parsedAiResult.menu_items?.length || 0 }} món)</span>
          <span class="text-[8px] px-1.5 py-0.5 rounded font-black border" :class="getConfidenceColorClass(formStore.parsedAiResult.confidence?.menu_items || 0.8)">
            Match: {{ Math.round((formStore.parsedAiResult.confidence?.menu_items || 0.8) * 100) }}%
          </span>
        </div>

        <div v-if="isEditing" class="space-y-2 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
          <div v-for="(item, idx) in formStore.parsedAiResult.menu_items" :key="idx" class="flex flex-wrap items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-2xl relative">
            <div class="flex-grow min-w-0 grid grid-cols-12 gap-2 w-full">
              <div class="col-span-12 md:col-span-6">
                <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Tên món</label>
                <input type="text" v-model="item.matched_name" class="w-full px-2 py-1 text-xs border border-slate-250 rounded-lg focus:ring-2 focus:ring-blue-400 outline-none bg-white font-bold text-slate-800">
              </div>
              <div class="col-span-4 md:col-span-2">
                <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">SL</label>
                <input type="number" v-model.number="item.quantity" class="w-full px-2 py-1 text-xs border border-slate-250 rounded-lg focus:ring-2 focus:ring-blue-400 outline-none bg-white font-bold text-center text-slate-800">
              </div>
              <div class="col-span-8 md:col-span-4">
                <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Đơn giá</label>
                <input type="number" v-model.number="item.unit_price" class="w-full px-2 py-1 text-xs border border-slate-250 rounded-lg focus:ring-2 focus:ring-blue-400 outline-none bg-white font-bold text-right text-blue-650">
              </div>
              <div class="col-span-12">
                <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Ghi chú món (Set details, note...)</label>
                <input type="text" v-model="item.note" class="w-full px-2 py-1 text-xs border border-slate-250 rounded-lg focus:ring-2 focus:ring-blue-400 outline-none bg-white font-medium text-slate-600">
              </div>
            </div>
            <button @click.prevent="formStore.parsedAiResult.menu_items.splice(idx, 1)" class="w-8 h-8 rounded-full bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-100 hover:text-rose-700 flex items-center justify-center shrink-0 active:scale-90 transition-transform cursor-pointer" title="Xóa món"><i class="fa-solid fa-trash-can text-xs"></i></button>
          </div>
          
          <button @click.prevent="formStore.parsedAiResult.menu_items.push({ raw_name: '', matched_name: '', quantity: 1, unit_price: 0, note: '', needs_review: false, match_confidence: 1.0 })" class="w-full border border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50/20 text-slate-650 hover:text-blue-700 rounded-xl py-2 font-bold text-xs uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer">
            <i class="fa-solid fa-plus text-[10px]"></i> Thêm món mới
          </button>
        </div>

        <div v-else class="space-y-1.5 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
          <div v-if="!formStore.parsedAiResult.menu_items?.length" class="text-xs text-slate-400 italic text-center py-2 bg-slate-50 rounded-2xl border border-slate-100">Không nhận diện được món ăn nào</div>
          <div v-for="(item, idx) in formStore.parsedAiResult.menu_items" :key="idx" class="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 border rounded-2xl" :class="item.needs_review ? 'border-amber-300 bg-amber-50/20' : 'border-slate-100'">
            <div class="flex-grow min-w-0">
              <div class="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                <span class="truncate max-w-[200px]">{{ item.matched_name || item.raw_name }}</span>
                <span class="text-slate-400 font-extrabold text-[10px] shrink-0">x{{ item.quantity }}</span>
                <span v-if="item.needs_review" class="px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded text-[7px] font-black uppercase tracking-wider shrink-0">Check</span>
              </div>
              <div v-if="item.note" class="text-[9px] text-slate-500 italic mt-0.5 block whitespace-pre-line leading-relaxed">{{ item.note }}</div>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <span class="text-xs font-black text-blue-700">{{ formatVND(item.unit_price) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="pt-4 border-t border-slate-100 space-y-2">
        <div class="flex gap-2">
          <button @click.prevent="applyAll" class="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-2xl py-3.5 font-black text-xs uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-emerald-650/20 border border-emerald-500 cursor-pointer min-h-[44px]">
            <i class="fa-solid fa-check-double text-sm text-emerald-100"></i> ÁP DỤNG TOÀN BỘ
          </button>
          
          <button @click.prevent="isEditing = !isEditing" class="px-5 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl py-3.5 font-black text-xs uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-amber-650/20 border border-amber-550 cursor-pointer min-h-[44px]">
            <i class="fa-solid text-sm text-amber-100" :class="isEditing ? 'fa-floppy-disk' : 'fa-pen-to-square'"></i> {{ isEditing ? 'XONG' : 'SỬA NHANH' }}
          </button>
        </div>

        <div class="grid grid-cols-3 gap-2">
          <button @click.prevent="applyCustomerOnly" class="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-2xl py-3 font-bold text-[10px] uppercase tracking-wider transition-all active:scale-95 flex flex-col items-center justify-center gap-1 border border-indigo-200 cursor-pointer min-h-[48px]">
            <i class="fa-solid fa-user text-sm"></i>
            <span>Chỉ khách & bàn</span>
          </button>
          <button @click.prevent="applyMenuOnly" class="bg-cyan-50 hover:bg-cyan-100 text-cyan-700 rounded-2xl py-3 font-bold text-[10px] uppercase tracking-wider transition-all active:scale-95 flex flex-col items-center justify-center gap-1 border border-cyan-200 cursor-pointer min-h-[48px]">
            <i class="fa-solid fa-utensils text-sm"></i>
            <span>Chỉ danh sách món</span>
          </button>
          <button @click.prevent="ignoreResult" class="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl py-3 font-bold text-[10px] uppercase tracking-wider transition-all active:scale-95 flex flex-col items-center justify-center gap-1 border border-slate-200 cursor-pointer min-h-[48px]">
            <i class="fa-solid fa-xmark text-sm"></i>
            <span>Bỏ qua kết quả</span>
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
@keyframes pulse-subtle {
  0%, 100% {
    box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.05);
    border-color: rgba(245, 158, 11, 0.4);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(245, 158, 11, 0.2);
    border-color: rgba(245, 158, 11, 0.75);
  }
}
.animate-pulse-subtle {
  animation: pulse-subtle 2s infinite ease-in-out;
}
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.3);
  border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(148, 163, 184, 0.5);
}
</style>
