<script setup lang="ts">
import { ref } from 'vue'
import { useUIStore } from '@/stores/useUIStore'
import { useAppStore } from '@/stores/useAppStore'
import { useForm } from '@/composables/useForm'
import { formatVND } from '@/utils'
import * as api from '@/services/api'
import { usePullToRefresh, haptic } from '@/composables/useGestures'

const ui = useUIStore()
const appStore = useAppStore()
const { editHistoricOrder, resetForm } = useForm()

// --- Click-to-Expand ---
const expandedKey = ref<string | null>(null)

function toggleExpand(key: string) {
  if (ui.isBatchMode) return
  haptic('light')
  expandedKey.value = expandedKey.value === key ? null : key
}

// --- Pull-to-Refresh ---
const scrollContainer = ref<HTMLElement | null>(null)
const { pullDistance, isRefreshing, onPullStart, onPullMove, onPullEnd } = usePullToRefresh(
  () => appStore.loadHistory(false)
)

// --- Share Link ---
function shareBillLink(orderId: string, name: string) {
  const url = `${window.location.origin}${window.location.pathname}#/bill/${orderId}`
  navigator.clipboard.writeText(url).then(() => {
    haptic('light')
    ui.showToast(`📤 Đã copy link bill "${name}"!`, 'success')
  }).catch(() => {
    ui.showAlert('Link Bill', url)
  })
}

// --- Delete ---
async function deleteHistoricOrder(id: string) {
  const confirmed = await ui.showConfirm('Xác Nhận Xóa', 'Bạn có chắc chắn muốn xóa bản ghi này?')
  if (!confirmed) return
  
  const pass = await ui.showPrompt('Bảo mật', 'Nhập Password Quản Trị để xóa đơn:')
  if (pass === null) return

  ui.loading.is = true
  ui.loading.msg = 'ĐANG XÓA...'
  haptic('medium')
  try {
    const res = await api.deleteOrder(id, pass)
    if (res.ok) {
      appStore.historyList = appStore.historyList.filter((i: any) => i.id !== id)
      expandedKey.value = null
      ui.showToast('Đã xóa!', 'success')
    } else {
      ui.showToast(res.message || 'Lỗi khi xóa', 'error')
    }
  } catch (e: any) { ui.showToast(e.message, 'error') }
  finally { ui.loading.is = false }
}

async function deleteBatchOrders() {
  if (ui.selectedIds.length === 0) return
  const confirmed = await ui.showConfirm('Xóa Nhiều Đơn', `Bạn có chắc chắn muốn xóa vĩnh viễn ${ui.selectedIds.length} phiếu đã chọn?\nHành động này không thể hoàn tác.`)
  if (!confirmed) return

  const pass = await ui.showPrompt('Bảo mật', 'Nhập Password Quản Trị để xóa hàng loạt:')
  if (pass === null) return

  ui.loading.is = true
  ui.loading.msg = 'ĐANG XÓA...'
  ui.loading.subMsg = `Processing 0/${ui.selectedIds.length}`
  haptic('heavy')

  const idsToDelete: string[] = []
  const groups = appStore.groupedHistory
  ui.selectedIds.forEach((key: string) => {
    const group = groups[key]
    if (group?.versions) group.versions.forEach((v: any) => { if (v.id) idsToDelete.push(v.id) })
  })

  const CHUNK_SIZE = 3
  let processed = 0
  for (let i = 0; i < idsToDelete.length; i += CHUNK_SIZE) {
    const chunk = idsToDelete.slice(i, i + CHUNK_SIZE)
    await Promise.all(chunk.map(id => api.deleteOrder(id, pass).catch(() => false)))
    processed += chunk.length
    ui.loading.subMsg = `Processing ${processed}/${idsToDelete.length}`
  }

  appStore.historyList = appStore.historyList.filter((h: any) => !idsToDelete.includes(h.id))
  ui.selectedIds = []
  ui.isBatchMode = false
  ui.loading.is = false
  ui.showToast(`Đã xóa ${idsToDelete.length} bản ghi lịch sử.`, 'success')
}
</script>

<template>
  <div class="flex-grow flex flex-col overflow-hidden text-[13px]">
    <!-- Search & Actions Bar -->
    <div class="p-4 border-b border-gray-100 space-y-3 bg-white">
      <div class="flex gap-2">
        <input v-model="ui.historySearch" placeholder="🔍 Tìm tên, SĐT, ngày, số tiền..." class="flex-grow py-3 px-4 rounded-2xl bg-gray-100 text-base md:text-sm font-bold text-slate-700 border-none outline-none focus:ring-2 focus:ring-blue-200">
        <button @click="appStore.loadHistory(false)" class="px-4 py-3 bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-wider shadow-lg hover:bg-blue-700 active:scale-95 min-h-[44px] active-effect hover-effect"><i class="fa-solid fa-arrows-rotate"></i></button>
        <button @click="resetForm" class="px-4 py-3 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-wider shadow-lg hover:bg-emerald-700 active:scale-95 min-h-[44px] active-effect hover-effect"><i class="fa-solid fa-plus"></i></button>
      </div>

      <div class="flex gap-2">
        <button @click="ui.toggleBatchMode()" :class="['px-3 py-2 rounded-xl font-black text-[9px] uppercase transition-all min-h-[34px]', ui.isBatchMode ? 'bg-red-600 text-white shadow-lg' : 'bg-gray-100 text-gray-500 hover:bg-gray-200']">
          <i class="fa-solid fa-layer-group mr-1"></i> {{ ui.isBatchMode ? 'TẮT CHỌN' : 'CHỌN NHIỀU' }}
        </button>
        <button v-if="ui.isBatchMode && ui.selectedIds.length > 0" @click="deleteBatchOrders" class="px-3 py-2 rounded-xl font-black text-[9px] uppercase bg-red-600 text-white shadow-lg active:scale-95 min-h-[34px] active-effect">
          <i class="fa-solid fa-trash mr-1"></i> XÓA ({{ ui.selectedIds.length }})
        </button>
      </div>
    </div>

    <!-- Pull-to-refresh indicator -->
    <div class="relative overflow-hidden bg-gray-50" :style="{ height: pullDistance > 0 ? pullDistance + 'px' : '0px', transition: isRefreshing ? 'none' : 'height 0.3s ease' }">
      <div class="flex items-center justify-center h-full">
        <div v-if="isRefreshing" class="w-6 h-6 border-2 border-gray-200 border-t-blue-600 rounded-full animate-spin"></div>
        <div v-else class="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
          <i class="fa-solid fa-arrow-down" :style="{ transform: pullDistance >= 80 ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }"></i>
          {{ pullDistance >= 80 ? 'Thả để làm mới' : 'Kéo xuống để làm mới' }}
        </div>
      </div>
    </div>

    <!-- History List -->
    <div
      ref="scrollContainer"
      class="flex-grow overflow-y-auto p-4 space-y-3 pb-28 md:pb-6 bg-gray-50 custom-scrollbar"
      @touchstart="(e: TouchEvent) => scrollContainer && onPullStart(e, scrollContainer)"
      @touchmove="onPullMove"
      @touchend="onPullEnd"
    >
      <div v-if="Object.keys(appStore.filteredHistory).length === 0" class="text-center py-20 text-gray-400">
        <i class="fa-solid fa-folder-open text-6xl mb-4"></i>
        <p class="font-black text-sm uppercase tracking-widest">Chưa có lịch sử</p>
      </div>

      <div v-for="(group, key) in appStore.filteredHistory" :key="key"
        class="bg-white rounded-2xl shadow-sm border overflow-hidden transition-all duration-200"
        :class="[
          expandedKey === String(key) ? 'ring-2 ring-blue-400 border-blue-200 shadow-lg' : 'border-gray-100 hover:shadow-md',
          ui.isBatchMode && ui.selectedIds.includes(String(key)) ? 'ring-2 ring-blue-500 border-blue-300' : ''
        ]"
        @click="ui.isBatchMode ? ui.toggleSelection(group) : toggleExpand(String(key))"
      >
        <div class="p-4">
          <!-- Card header -->
          <div class="flex justify-between items-start mb-2">
            <div class="flex items-center gap-2 flex-grow min-w-0">
              <!-- Batch checkbox -->
              <div v-if="ui.isBatchMode" class="flex-shrink-0">
                <div class="w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors" :class="ui.selectedIds.includes(String(key)) ? 'bg-blue-600 border-blue-600' : 'border-gray-300'">
                  <i v-if="ui.selectedIds.includes(String(key))" class="fa-solid fa-check text-white text-xs"></i>
                </div>
              </div>
              <!-- Customer info -->
              <div class="min-w-0 flex-grow">
                <div class="font-black text-slate-800 text-sm uppercase tracking-tight truncate">{{ group.latest.parsedCustomer?.name }}</div>
                <div class="text-[10px] text-gray-500 font-mono font-bold mt-0.5">{{ group.latest.parsedCustomer?.phone }}</div>
              </div>
            </div>
            <!-- Amount + Status -->
            <div class="text-right flex-shrink-0 flex items-center gap-3">
              <div>
                <div class="text-sm font-black text-blue-600">{{ formatVND(group.latest.totalAmount || 0) }}</div>
                <div class="text-[10px] font-bold" :class="group.latest.isDeposited ? 'text-emerald-600' : 'text-red-500'">
                  {{ group.latest.isDeposited ? '✓ Đã Cọc' : '✗ Chờ Cọc' }}
                </div>
              </div>
              <!-- Expand indicator -->
              <i v-if="!ui.isBatchMode" class="fa-solid fa-chevron-down text-[10px] text-slate-300 transition-transform duration-200"
                :class="{ 'rotate-180 text-blue-500': expandedKey === String(key) }"></i>
            </div>
          </div>

          <!-- Tags row -->
          <div class="flex gap-1.5 flex-wrap">
            <span class="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-lg font-bold"><i class="fa-solid fa-calendar mr-1"></i>{{ group.latest.parsedCustomer?.date }}</span>
            <span class="text-[10px] bg-purple-50 text-purple-600 px-2 py-0.5 rounded-lg font-bold"><i class="fa-solid fa-utensils mr-1"></i>{{ group.latest.menuItems?.length || 0 }} món</span>
            <span v-if="group.latest.aiEngine" class="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-lg font-bold"><i class="fa-solid fa-microchip mr-1"></i>{{ group.latest.aiEngine }}</span>
            <span v-if="group.versions.length > 1" class="text-[10px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded-lg font-bold"><i class="fa-solid fa-code-branch mr-1"></i>v{{ group.latest.version || group.versions.length }}</span>
          </div>
        </div>

        <!-- ═══ EXPANDABLE ACTIONS PANEL ═══ -->
        <div
          class="overflow-hidden transition-all duration-250 ease-out"
          :style="{ maxHeight: expandedKey === String(key) ? '200px' : '0px', opacity: expandedKey === String(key) ? 1 : 0 }"
        >
          <!-- Version Diff (inside expanded area) -->
          <div v-if="group.versions.length > 1" class="mx-4 mb-3 p-2 bg-amber-50 rounded-lg border border-amber-100">
            <div class="text-[9px] font-black text-amber-700 uppercase mb-1">Thay đổi gần nhất:</div>
            <div class="text-[10px]" v-html="appStore.computeDiff(group.latest, group.versions[group.versions.length - 2])"></div>
          </div>

          <!-- Action Buttons -->
          <div class="px-4 pb-4 grid grid-cols-4 gap-2" @click.stop>
            <button @click="editHistoricOrder(group.latest)"
              class="py-2.5 bg-blue-600 text-white rounded-xl font-black text-[9px] uppercase shadow-md active:scale-95 min-h-[40px] flex flex-col items-center justify-center gap-0.5 active-effect hover-effect">
              <i class="fa-solid fa-pen-to-square text-sm"></i> Sửa
            </button>
            <button @click="shareBillLink(group.latest.id, group.latest.parsedCustomer?.name)"
              class="py-2.5 bg-cyan-500 text-white rounded-xl font-black text-[9px] uppercase shadow-md active:scale-95 min-h-[40px] flex flex-col items-center justify-center gap-0.5 active-effect hover-effect">
              <i class="fa-solid fa-share-nodes text-sm"></i> Link
            </button>
            <a v-if="group.latest.billUrl" :href="group.latest.billUrl" target="_blank"
              class="py-2.5 bg-indigo-100 text-indigo-600 rounded-xl font-black text-[9px] text-center uppercase active:scale-95 min-h-[40px] flex flex-col items-center justify-center gap-0.5 hover-effect">
              <i class="fa-solid fa-eye text-sm"></i> Bill
            </a>
            <button v-else class="py-2.5 bg-gray-100 text-gray-400 rounded-xl font-black text-[9px] uppercase min-h-[40px] flex flex-col items-center justify-center gap-0.5 cursor-not-allowed">
              <i class="fa-solid fa-eye-slash text-sm"></i> N/A
            </button>
            <button @click="deleteHistoricOrder(group.latest.id)"
              class="py-2.5 bg-red-50 text-red-500 rounded-xl font-black text-[9px] uppercase hover:bg-red-100 active:scale-95 min-h-[40px] flex flex-col items-center justify-center gap-0.5 active-effect hover-effect">
              <i class="fa-solid fa-trash text-sm"></i> Xóa
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
