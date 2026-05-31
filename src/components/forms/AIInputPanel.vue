<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useUIStore } from '@/stores/useUIStore'
import { useFormStore } from '@/stores/useFormStore'
import { useConfigStore } from '@/stores/useConfigStore'
import { useAI } from '@/composables/useAI'
import { useForm } from '@/composables/useForm'

const ui = useUIStore()
const formStore = useFormStore()
const configStore = useConfigStore()
const { processAI, ocrExtractText } = useAI()
const { handleInputFocus, handleInputBlur, toggleVoiceMode } = useForm()
const aiFileIn = ref<HTMLInputElement>()
const isDragging = ref(false)
const showAiReview = ref(false)
const isProcessing = ref(false)

const hasWarnings = computed(() => {
  const confs = formStore.aiMetadata?.confidences
  if (!confs) return false
  return Object.values(confs).some((c: any) => c && c.needs_review)
})

async function handleAnalyze() {
  if (isProcessing.value) return
  isProcessing.value = true
  try {
    ui.showToast('Đang phân tích dữ liệu...', 'info')
    await processAI()
  } catch (err: any) {
    ui.showToast('Lỗi phân tích: ' + err.message, 'error')
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

    <button @click="handleAnalyze" :disabled="isProcessing" class="w-full mt-3 bg-white text-blue-700 py-3 rounded-xl font-black text-sm hover:bg-slate-50 shadow-lg border border-white/50 flex justify-center items-center gap-2 active:scale-95 transition-all min-h-[48px] active-effect disabled:opacity-85 disabled:cursor-not-allowed">
      <i v-if="isProcessing" class="fa-solid fa-spinner animate-spin text-blue-600"></i>
      <i v-else class="fa-solid fa-rocket"></i>
      {{ isProcessing ? 'ĐANG PHÂN TÍCH...' : 'PHÂN TÍCH (QUICK EXTRACT)' }}
    </button>
  </div>

  <!-- Parsed Fields Review Card -->
  <transition name="fade">
    <div v-if="showAiReview && formStore.originalAiValues" class="mt-4 bg-white border border-slate-200 rounded-3xl p-5 shadow-xl text-slate-800 space-y-4 relative z-10">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <i class="fa-solid fa-wand-sparkles text-blue-600 text-sm animate-pulse"></i>
          <span class="font-black text-slate-800 text-[11px] uppercase tracking-widest">Xác nhận kết quả AI</span>
        </div>
        <span class="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-[9px] font-black uppercase tracking-wider border border-blue-100">
          Độ tin cậy: {{ Math.round((formStore.aiMetadata?.confidence_score || 0) * 100) }}%
        </span>
      </div>

      <!-- Warning Alert Box -->
      <div v-if="hasWarnings" class="p-3 bg-amber-50/80 border border-amber-300 rounded-2xl flex items-start gap-2.5 text-amber-800 text-[11px] font-bold">
        <i class="fa-solid fa-triangle-exclamation text-base text-amber-500 shrink-0 mt-0.5 animate-bounce"></i>
        <div>
          <div class="font-black text-slate-900 uppercase">Cần Kiểm Tra Lại</div>
          <div class="text-slate-600 mt-0.5 leading-relaxed font-semibold">Một số thông tin AI trích xuất có độ tin cậy thấp hoặc nghi ngờ sai lệch. Vui lòng kiểm tra kỹ các ô màu vàng bên dưới!</div>
        </div>
      </div>

      <!-- Grid of fields -->
      <div class="grid grid-cols-2 gap-2.5">
        <!-- Name -->
        <div class="p-3 rounded-2xl border transition-all" :class="formStore.aiMetadata?.confidences?.name?.needs_review ? 'bg-amber-50 border-amber-400 ring-4 ring-amber-500/10' : 'bg-slate-50/50 border-slate-100'">
          <div class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Tên khách</div>
          <div class="text-xs font-black text-slate-800 mt-1.5 flex items-center justify-between">
            <span class="truncate">{{ formStore.originalAiValues.name || '---' }}</span>
            <i v-if="formStore.aiMetadata?.confidences?.name?.needs_review" class="fa-solid fa-triangle-exclamation text-amber-500 text-xs ml-1 shrink-0 animate-bounce"></i>
          </div>
        </div>

        <!-- Phone -->
        <div class="p-3 rounded-2xl border transition-all" :class="formStore.aiMetadata?.confidences?.phone?.needs_review ? 'bg-amber-50 border-amber-400 ring-4 ring-amber-500/10' : 'bg-slate-50/50 border-slate-100'">
          <div class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Số điện thoại</div>
          <div class="text-xs font-black text-slate-800 mt-1.5 flex items-center justify-between">
            <span class="truncate">{{ formStore.originalAiValues.phone || '---' }}</span>
            <i v-if="formStore.aiMetadata?.confidences?.phone?.needs_review" class="fa-solid fa-triangle-exclamation text-amber-500 text-xs ml-1 shrink-0 animate-bounce"></i>
          </div>
        </div>

        <!-- Date -->
        <div class="p-3 rounded-2xl border transition-all" :class="formStore.aiMetadata?.confidences?.date?.needs_review ? 'bg-amber-50 border-amber-400 ring-4 ring-amber-500/10' : 'bg-slate-50/50 border-slate-100'">
          <div class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Ngày tiệc</div>
          <div class="text-xs font-black text-slate-800 mt-1.5 flex items-center justify-between">
            <span>{{ formStore.originalAiValues.date || '---' }}</span>
            <i v-if="formStore.aiMetadata?.confidences?.date?.needs_review" class="fa-solid fa-triangle-exclamation text-amber-500 text-xs ml-1 shrink-0 animate-bounce"></i>
          </div>
        </div>

        <!-- Time -->
        <div class="p-3 rounded-2xl border transition-all" :class="formStore.aiMetadata?.confidences?.time?.needs_review ? 'bg-amber-50 border-amber-400 ring-4 ring-amber-500/10' : 'bg-slate-50/50 border-slate-100'">
          <div class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Giờ tiệc</div>
          <div class="text-xs font-black text-slate-800 mt-1.5 flex items-center justify-between">
            <span>{{ formStore.originalAiValues.time || '---' }}</span>
            <i v-if="formStore.aiMetadata?.confidences?.time?.needs_review" class="fa-solid fa-triangle-exclamation text-amber-500 text-xs ml-1 shrink-0 animate-bounce"></i>
          </div>
        </div>

        <!-- Pax -->
        <div class="p-3 rounded-2xl border transition-all" :class="formStore.aiMetadata?.confidences?.pax?.needs_review ? 'bg-amber-50 border-amber-400 ring-4 ring-amber-500/10' : 'bg-slate-50/50 border-slate-100'">
          <div class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Số khách</div>
          <div class="text-xs font-black text-slate-800 mt-1.5 flex items-center justify-between">
            <span>{{ formStore.originalAiValues.pax || '---' }}</span>
            <i v-if="formStore.aiMetadata?.confidences?.pax?.needs_review" class="fa-solid fa-triangle-exclamation text-amber-500 text-xs ml-1 shrink-0 animate-bounce"></i>
          </div>
        </div>

        <!-- Table -->
        <div class="p-3 rounded-2xl border transition-all" :class="formStore.aiMetadata?.confidences?.tables?.needs_review ? 'bg-amber-50 border-amber-400 ring-4 ring-amber-500/10' : 'bg-slate-50/50 border-slate-100'">
          <div class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Số bàn</div>
          <div class="text-xs font-black text-slate-800 mt-1.5 flex items-center justify-between">
            <span class="truncate">{{ formStore.originalAiValues.tables || '---' }}</span>
            <i v-if="formStore.aiMetadata?.confidences?.tables?.needs_review" class="fa-solid fa-triangle-exclamation text-amber-500 text-xs ml-1 shrink-0 animate-bounce"></i>
          </div>
        </div>
      </div>

      <button @click.prevent="showAiReview = false" class="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-2xl py-3.5 font-black text-xs uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 border border-emerald-500">
        <i class="fa-solid fa-check-double text-sm text-emerald-100"></i> ÁP DỤNG VÀO PHIẾU
      </button>
    </div>
  </transition>
</template>
