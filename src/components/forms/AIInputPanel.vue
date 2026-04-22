<script setup lang="ts">
import { ref } from 'vue'
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
      <span class="text-[8px] px-2 py-0.5 bg-white/20 text-white rounded-full font-black uppercase backdrop-blur-md border border-white/20" :class="{'animate-pulse': ui.listening}">{{ ui.listening ? 'LISTENING...' : 'SMART ROUTING ON' }}</span>
    </div>

    <div class="space-y-2 relative z-10 text-white">
      <div class="relative">
        <textarea v-model="formStore.rawInput" @focus="handleInputFocus" @blur="handleInputBlur" @paste="onPaste" rows="3" class="w-full p-3 border-none rounded-xl text-sm bg-white/95 text-slate-800 font-medium focus:ring-4 focus:ring-yellow-400 outline-none shadow-xl placeholder-slate-400 transition-all custom-scrollbar" placeholder="Dán nội dung đặt bàn, nói 'Hey King', hoặc kéo thả ảnh Bill vào đây..."></textarea>
        <div class="absolute bottom-2 right-2 flex gap-1.5">
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

    <button @click="processAI" class="w-full mt-3 bg-yellow-400 text-slate-900 py-3 rounded-xl font-black text-xs hover:bg-yellow-300 shadow-xl flex justify-center items-center gap-2 active:scale-95 transition-all min-h-[44px] active-effect" :style="{ backgroundColor: configStore.branding.color }">
      <i class="fa-solid fa-rocket animate-bounce"></i> PHÂN TÍCH (QUICK EXTRACT)
    </button>
  </div>
</template>
