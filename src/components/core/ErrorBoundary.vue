<script setup lang="ts">
/**
 * ErrorBoundary.vue — Catches runtime errors in child components
 * Displays a friendly fallback UI with retry functionality instead of a blank screen.
 */
import { ref, onErrorCaptured } from 'vue'

const hasError = ref(false)
const errorMessage = ref('')
const errorInfo = ref('')

function retry() {
  hasError.value = false
  errorMessage.value = ''
  errorInfo.value = ''
}

function copyError() {
  const text = `[KG-BOOKING Error]\n${errorMessage.value}\n\nContext: ${errorInfo.value}\nTime: ${new Date().toISOString()}\nUA: ${navigator.userAgent}`
  navigator.clipboard.writeText(text).catch(() => {})
}

function hardReload() {
  window.location.reload()
}

onErrorCaptured((err: Error, _instance, info) => {
  console.error('[ErrorBoundary]', err, info)
  hasError.value = true
  errorMessage.value = err.message || 'Unknown error'
  errorInfo.value = info || ''
  return false // prevent propagation
})
</script>

<template>
  <div v-if="hasError" class="fixed inset-0 z-[99999] bg-white flex items-center justify-center p-6">
    <div class="max-w-md w-full text-center">
      <!-- Icon -->
      <div class="w-20 h-20 mx-auto mb-6 rounded-full bg-red-50 flex items-center justify-center">
        <i class="fa-solid fa-triangle-exclamation text-4xl text-red-500"></i>
      </div>

      <!-- Title -->
      <h2 class="text-2xl font-black text-slate-800 mb-2 uppercase tracking-tight">Đã xảy ra lỗi</h2>
      <p class="text-sm text-slate-500 mb-6 font-medium">Ứng dụng gặp sự cố. Bạn có thể thử tải lại hoặc gửi báo cáo lỗi.</p>

      <!-- Error Details (collapsible) -->
      <details class="text-left mb-6 bg-red-50 rounded-2xl border border-red-100 overflow-hidden">
        <summary class="px-4 py-3 text-xs font-bold text-red-600 uppercase tracking-wider cursor-pointer hover:bg-red-100 transition-colors">
          Chi tiết lỗi
        </summary>
        <div class="px-4 pb-4">
          <pre class="text-xs font-mono text-red-700 whitespace-pre-wrap break-words bg-red-100/50 p-3 rounded-xl mt-2 max-h-32 overflow-y-auto">{{ errorMessage }}</pre>
          <p v-if="errorInfo" class="text-[10px] text-red-400 mt-2 font-mono">Context: {{ errorInfo }}</p>
        </div>
      </details>

      <!-- Actions -->
      <div class="flex gap-3">
        <button
          @click="copyError"
          class="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors active:scale-95 min-h-[48px]">
          <i class="fa-solid fa-copy mr-2"></i>Copy Log
        </button>
        <button
          @click="retry"
          class="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200 active:scale-95 min-h-[48px]">
          <i class="fa-solid fa-rotate-right mr-2"></i>Thử Lại
        </button>
      </div>

      <!-- Hard reload -->
      <button
        @click="hardReload()"
        class="mt-3 w-full py-2.5 text-xs font-bold text-slate-400 hover:text-red-500 transition-colors uppercase tracking-widest min-h-[40px]">
        <i class="fa-solid fa-power-off mr-1"></i> Tải lại toàn bộ trang
      </button>
    </div>
  </div>

  <!-- Normal content when no error -->
  <slot v-else />
</template>
