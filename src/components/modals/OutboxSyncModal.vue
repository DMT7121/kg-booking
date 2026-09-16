<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useUIStore } from '@/stores/useUIStore'
import { useAppStore } from '@/stores/useAppStore'
import { formatVNDCurrency } from '@/utils/money'

const ui = useUIStore()
const appStore = useAppStore()

const isSyncing = ref(false)
const syncingItemId = ref<string | null>(null)

const outboxList = computed(() => appStore.outboxDetailsList || [])
const pendingCount = computed(() => outboxList.value.length)

const pgSyncedCount = computed(() => {
  return outboxList.value.filter((item: any) => item.syncedToPg).length
})

const sheetsSyncedCount = computed(() => {
  return outboxList.value.filter((item: any) => item.syncedToSheets).length
})

const isOnline = computed(() => {
  return typeof navigator !== 'undefined' ? navigator.onLine : true
})

async function refreshData() {
  if (typeof appStore.loadOutboxDetails === 'function') {
    await appStore.loadOutboxDetails()
  }
}

watch(() => ui.showOutboxModal, (isOpen) => {
  if (isOpen) {
    refreshData()
  }
})

async function handleSyncAll() {
  if (isSyncing.value) return
  isSyncing.value = true
  try {
    if (typeof appStore.forceSyncAllOutbox === 'function') {
      await appStore.forceSyncAllOutbox()
    }
  } finally {
    isSyncing.value = false
    await refreshData()
  }
}

async function handleRetryItem(item: any) {
  if (syncingItemId.value) return
  syncingItemId.value = item.id
  try {
    if (typeof appStore.retrySingleOutboxItem === 'function') {
      await appStore.retrySingleOutboxItem(item.id, item.action)
    }
  } finally {
    syncingItemId.value = null
    await refreshData()
  }
}

async function handleRemoveItem(item: any) {
  const confirmed = confirm(
    `Bạn có chắc chắn muốn xóa đơn "${item.payload?.customer?.name || item.payload?.name || item.id}" khỏi hàng đợi đồng bộ?\n\nLưu ý: Đơn hàng này sẽ không được gửi lên Cloud nữa.`
  )
  if (!confirmed) return

  if (typeof appStore.removeSingleOutboxItem === 'function') {
    await appStore.removeSingleOutboxItem(item.id, item.action)
  }
  await refreshData()
}

function getItemCustomerName(item: any): string {
  if (!item.payload) return `Đơn ID: ${item.id.slice(0, 8)}`
  return item.payload.customer?.name || item.payload.customer_name || item.payload.name || 'Khách hàng'
}

function getItemPhone(item: any): string {
  if (!item.payload) return ''
  return item.payload.customer?.phone || item.payload.customer_phone || item.payload.phone || ''
}

function getItemDetails(item: any): string {
  if (!item.payload) return ''
  const c = item.payload.customer || item.payload
  const parts = []
  if (c.date) parts.push(c.date)
  if (c.time) parts.push(c.time)
  if (c.tables) parts.push(`Bàn ${c.tables}`)
  if (c.pax) parts.push(`${c.pax} khách`)
  return parts.join(' • ')
}

function getItemTotal(item: any): number {
  if (!item.payload) return 0
  return Number(item.payload.total || item.payload.totalAmount || 0)
}

function formatTimeAgo(timestamp?: number): string {
  if (!timestamp) return ''
  const diff = Math.floor((Date.now() - timestamp) / 1000)
  if (diff < 60) return 'Vừa tạo'
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`
  return `${Math.floor(diff / 3600)} giờ trước`
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && ui.showOutboxModal) {
    ui.showOutboxModal = false
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <div 
    v-if="ui.showOutboxModal"
    class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in"
    @click.self="ui.showOutboxModal = false"
    role="dialog"
    aria-modal="true"
    aria-labelledby="outbox-modal-title"
  >
    <div class="w-full max-w-xl bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
      
      <!-- Modal Header -->
      <div class="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <i class="fa-solid fa-cloud-arrow-up text-lg"></i>
          </div>
          <div>
            <h2 id="outbox-modal-title" class="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              Hàng đợi Đồng bộ Cloud
              <span 
                v-if="pendingCount > 0"
                class="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30"
              >
                {{ pendingCount }} đơn
              </span>
            </h2>
            <div class="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
              <span class="flex items-center gap-1.5">
                <span 
                  class="w-2 h-2 rounded-full" 
                  :class="isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'"
                ></span>
                {{ isOnline ? 'Thiết bị đang trực tuyến' : 'Thiết bị mất kết nối mạng' }}
              </span>
              <span>•</span>
              <span>Dual-Write Engine</span>
            </div>
          </div>
        </div>

        <button 
          @click="ui.showOutboxModal = false"
          class="w-8 h-8 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          title="Đóng (Esc)"
          aria-label="Đóng cửa sổ"
        >
          <i class="fa-solid fa-xmark text-base"></i>
        </button>
      </div>

      <!-- Quick Health KPI Banner -->
      <div class="grid grid-cols-3 gap-2 px-5 py-3 bg-slate-950/40 border-b border-slate-800 text-xs">
        <div class="p-2.5 rounded-xl bg-slate-800/50 border border-slate-800">
          <div class="text-slate-400 font-medium">Tổng hàng đợi</div>
          <div class="text-base font-bold text-amber-400 mt-0.5">{{ pendingCount }} đơn</div>
        </div>
        <div class="p-2.5 rounded-xl bg-slate-800/50 border border-slate-800">
          <div class="text-slate-400 font-medium">Supabase DB</div>
          <div class="text-base font-bold text-emerald-400 mt-0.5 flex items-center gap-1">
            <span>{{ pgSyncedCount }}/{{ pendingCount }}</span>
            <i class="fa-solid fa-circle-check text-xs"></i>
          </div>
        </div>
        <div class="p-2.5 rounded-xl bg-slate-800/50 border border-slate-800">
          <div class="text-slate-400 font-medium">Google Sheets</div>
          <div class="text-base font-bold text-sky-400 mt-0.5 flex items-center gap-1">
            <span>{{ sheetsSyncedCount }}/{{ pendingCount }}</span>
            <i class="fa-solid fa-table text-xs"></i>
          </div>
        </div>
      </div>

      <!-- Modal Body (List of Outbox Items) -->
      <div class="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 min-h-[160px]">
        
        <!-- Empty State -->
        <div v-if="pendingCount === 0" class="py-12 flex flex-col items-center justify-center text-center">
          <div class="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-3 shadow-[0_0_20px_rgba(16,185,129,0.15)]">
            <i class="fa-solid fa-cloud-check text-3xl"></i>
          </div>
          <h3 class="text-base font-bold text-white">Tất cả dữ liệu đã đồng bộ an toàn!</h3>
          <p class="text-xs text-slate-400 max-w-sm mt-1">
            Không còn đơn hàng nào bị kẹt trên thiết bị. Mọi thay đổi đã được cập nhật thành công lên Cloud.
          </p>
        </div>

        <!-- Item Cards -->
        <div 
          v-for="item in outboxList" 
          :key="item.id + item.action"
          class="p-4 rounded-xl bg-slate-800/70 border border-slate-700/50 hover:border-slate-600 transition-all flex flex-col gap-3 group"
        >
          <!-- Card Header: Customer Info & Action Type -->
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-bold text-white text-sm truncate">
                  {{ getItemCustomerName(item) }}
                </span>
                <span 
                  class="px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider"
                  :class="item.action === 'delete' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'"
                >
                  {{ item.action === 'delete' ? 'Xóa đơn' : 'Lưu đơn' }}
                </span>
                <span v-if="getItemPhone(item)" class="text-xs text-slate-400">
                  ({{ getItemPhone(item) }})
                </span>
              </div>
              <div class="text-xs text-slate-400 mt-1 flex items-center gap-1.5 flex-wrap">
                <span>{{ getItemDetails(item) }}</span>
                <span v-if="getItemTotal(item) > 0" class="font-bold text-amber-400">
                  • {{ formatVNDCurrency(getItemTotal(item)) }}
                </span>
              </div>
            </div>

            <!-- Creation Time -->
            <span class="text-[11px] text-slate-400 whitespace-nowrap">
              {{ formatTimeAgo(item.createdAt) }}
            </span>
          </div>

          <!-- Dual Target Status Indicators -->
          <div class="grid grid-cols-2 gap-2 text-xs pt-1">
            <!-- PostgreSQL Status -->
            <div 
              class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px]"
              :class="item.syncedToPg ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-slate-900/60 border-slate-700 text-slate-400'"
            >
              <i class="fa-solid" :class="item.syncedToPg ? 'fa-circle-check text-emerald-400' : 'fa-hourglass-half text-amber-400'"></i>
              <span class="font-medium">PostgreSQL:</span>
              <span>{{ item.syncedToPg ? 'Đã lưu an toàn' : 'Chờ gửi' }}</span>
            </div>

            <!-- Google Sheets Status -->
            <div 
              class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px]"
              :class="item.syncedToSheets ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-slate-900/60 border-slate-700 text-slate-400'"
            >
              <i class="fa-solid" :class="item.syncedToSheets ? 'fa-circle-check text-emerald-400' : 'fa-hourglass-half text-amber-400'"></i>
              <span class="font-medium">Sheets:</span>
              <span>{{ item.syncedToSheets ? 'Đã lưu' : 'Chờ đồng bộ' }}</span>
            </div>
          </div>

          <!-- Last Error Diagnostic (if any) -->
          <div 
            v-if="item.lastError" 
            class="px-2.5 py-1.5 rounded-lg bg-rose-950/40 border border-rose-900/40 text-[11px] text-rose-300 flex items-start gap-1.5"
          >
            <i class="fa-solid fa-triangle-exclamation text-rose-400 mt-0.5"></i>
            <span class="flex-1 break-all">
              <span class="font-semibold">Lần thử {{ item.attempts }}/5:</span> {{ item.lastError }}
            </span>
          </div>

          <!-- Per-item Action Buttons -->
          <div class="flex items-center justify-end gap-2 pt-1 border-t border-slate-700/40">
            <button 
              @click="handleRemoveItem(item)"
              class="px-2.5 py-1 rounded-lg text-xs text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
              title="Loại bỏ đơn này khỏi hàng đợi"
            >
              <i class="fa-solid fa-trash-can mr-1"></i> Bỏ qua
            </button>
            <button 
              @click="handleRetryItem(item)"
              :disabled="syncingItemId === item.id || isSyncing"
              class="px-3 py-1 rounded-lg text-xs font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition-all active:scale-95 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
            >
              <i 
                class="fa-solid" 
                :class="syncingItemId === item.id ? 'fa-circle-notch animate-spin' : 'fa-rotate'"
              ></i>
              <span>{{ syncingItemId === item.id ? 'Đang gửi...' : 'Thử lại' }}</span>
            </button>
          </div>

        </div>

      </div>

      <!-- Modal Footer -->
      <div class="px-5 py-3.5 border-t border-slate-800 bg-slate-900/95 flex items-center justify-between gap-3">
        <button 
          @click="refreshData()"
          class="px-3 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <i class="fa-solid fa-rotate-right text-xs"></i>
          <span>Làm mới</span>
        </button>

        <div class="flex items-center gap-2">
          <button 
            @click="ui.showOutboxModal = false"
            class="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Đóng
          </button>
          <button 
            v-if="pendingCount > 0"
            @click="handleSyncAll()"
            :disabled="isSyncing || !isOnline"
            class="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
          >
            <i class="fa-solid" :class="isSyncing ? 'fa-circle-notch animate-spin' : 'fa-bolt'"></i>
            <span>{{ isSyncing ? 'Đang đồng bộ...' : '⚡ Đồng bộ tất cả ngay' }}</span>
          </button>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.98); }
  to { opacity: 1; transform: scale(1); }
}
</style>
