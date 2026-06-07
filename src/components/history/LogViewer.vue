<script setup lang="ts">
import { ref, computed } from 'vue'
import { useLogStore } from '@/stores/useLogStore'
import { useUIStore } from '@/stores/useUIStore'

const logStore = useLogStore()
const uiStore = useUIStore()

const copied = ref(false)

async function copyLatestLogs() {
  if (!logStore.latestSessionLogsText) {
    uiStore.showToast('Không có nhật ký nào trong phiên này để sao chép!', 'warning')
    return
  }
  try {
    await navigator.clipboard.writeText(logStore.latestSessionLogsText)
    copied.value = true
    uiStore.showToast('📋 Đã sao chép nhật ký phiên mới nhất!', 'success')
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch (err: any) {
    uiStore.showToast('Không thể sao chép: ' + err.message, 'error')
  }
}

function getLogTypeClass(type: string) {
  switch (type) {
    case 'success':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/50'
    case 'warning':
      return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/50'
    case 'error':
      return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900/50'
    default:
      return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900/50'
  }
}

function getLogIcon(type: string) {
  switch (type) {
    case 'success':
      return 'fa-circle-check text-emerald-500'
    case 'warning':
      return 'fa-triangle-exclamation text-amber-500'
    case 'error':
      return 'fa-circle-xmark text-rose-500'
    default:
      return 'fa-circle-info text-blue-500'
  }
}
</script>

<template>
  <div class="space-y-4 box-border w-full max-w-full">
    <!-- Header Controls -->
    <div class="flex flex-wrap items-center justify-between gap-3 p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-150 dark:border-slate-800 shadow-sm box-border w-full">
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
          <i class="fa-solid fa-terminal text-lg"></i>
        </div>
        <div class="min-w-0">
          <h2 class="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider truncate m-0">Nhật Ký Xử Lý</h2>
          <p class="text-[10px] text-slate-500 dark:text-slate-400 m-0 mt-0.5 truncate font-semibold">Ghi nhận tiến trình chạy AI & So khớp dữ liệu</p>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="flex flex-wrap items-center gap-2 shrink-0">
        <button
          @click="copyLatestLogs"
          :disabled="!logStore.latestSessionLogs.length"
          class="flex items-center gap-1.5 px-3 py-2 text-[11px] font-black uppercase tracking-wider rounded-xl transition-all border shadow-sm cursor-pointer select-none min-h-[38px] active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
          :class="copied ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-slate-800 dark:bg-slate-700 border-slate-900 dark:border-slate-600 text-white hover:bg-slate-700'"
        >
          <i class="fa-solid" :class="copied ? 'fa-check animate-ping-once' : 'fa-copy'"></i>
          {{ copied ? 'Đã sao chép!' : 'Copy phiên mới nhất' }}
        </button>

        <button
          @click="logStore.clearLogs()"
          :disabled="!logStore.logs.length"
          class="flex items-center gap-1.5 px-3 py-2 text-[11px] font-black uppercase tracking-wider bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-all cursor-pointer select-none min-h-[38px] active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
        >
          <i class="fa-solid fa-trash-can"></i>
          Xóa hết
        </button>
      </div>
    </div>

    <!-- Active Session Details -->
    <div v-if="logStore.currentSessionId" class="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-200 dark:border-slate-800/80 text-[11px] font-bold text-slate-600 dark:text-slate-400 w-full box-border">
      <div class="flex items-center gap-2 truncate">
        <span class="w-2 h-2 rounded-full bg-blue-500 animate-pulse shrink-0"></span>
        <span class="text-slate-400">Phiên hiện tại:</span>
        <span class="text-slate-800 dark:text-slate-200 uppercase tracking-wider">{{ logStore.currentSessionName }}</span>
      </div>
      <div class="flex items-center gap-3 font-semibold text-slate-500">
        <span>ID: <code class="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded font-mono text-[10px]">{{ logStore.currentSessionId }}</code></span>
        <span>Tổng số dòng: <strong class="text-slate-800 dark:text-slate-200 font-extrabold">{{ logStore.latestSessionLogs.length }}</strong></span>
      </div>
    </div>

    <!-- Log List -->
    <div class="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-2xl shadow-sm p-4 min-h-[250px] max-h-[550px] overflow-y-auto w-full box-border custom-scrollbar">
      <div v-if="logStore.latestSessionLogs.length === 0" class="flex flex-col items-center justify-center py-16 text-center text-slate-400 dark:text-slate-500">
        <i class="fa-solid fa-terminal text-4xl mb-3 opacity-40 animate-pulse"></i>
        <h3 class="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">Chưa có nhật ký xử lý</h3>
        <p class="text-[10px] font-semibold max-w-sm mt-1 leading-relaxed px-4">Hãy nhập thông tin đặt bàn hoặc phân tích bill chuyển khoản ở màn hình "Tạo" để bắt đầu ghi nhận nhật ký.</p>
      </div>

      <div v-else class="space-y-2.5 w-full box-border">
        <div
          v-for="log in logStore.latestSessionLogs"
          :key="log.id"
          class="flex items-start gap-2.5 p-3 rounded-xl border transition-all text-xs w-full box-border bg-slate-50/30 dark:bg-slate-900/30"
          :class="getLogTypeClass(log.type)"
        >
          <!-- Level Icon -->
          <i class="fa-solid shrink-0 mt-0.5" :class="getLogIcon(log.type)"></i>

          <!-- Content Box -->
          <div class="flex-1 min-w-0 space-y-0.5">
            <div class="flex items-center justify-between gap-2">
              <span class="text-[9px] font-black uppercase tracking-widest text-slate-400">{{ log.type }}</span>
              <span class="text-[9px] font-mono text-slate-400 dark:text-slate-500">{{ log.timestamp }}</span>
            </div>
            <div class="text-[11px] font-bold leading-relaxed break-words whitespace-pre-wrap text-slate-800 dark:text-slate-200">
              {{ log.message }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-ping-once {
  animation: ping 0.5s cubic-bezier(0, 0, 0.2, 1) 1;
}
@keyframes ping {
  75%, 100% {
    transform: scale(1.5);
    opacity: 0;
  }
}
</style>
