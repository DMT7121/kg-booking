<script setup lang="ts">
import { ref, computed } from 'vue'
import { useUIStore } from '@/stores/useUIStore'
import { useAppStore } from '@/stores/useAppStore'
import { useForm } from '@/composables/useForm'
import { formatVND } from '@/utils'
import * as api from '@/services/api'
import { usePullToRefresh, haptic } from '@/composables/useGestures'
import HistoryTimeline from './HistoryTimeline.vue'

const ui = useUIStore()
const appStore = useAppStore()
const { editHistoricOrder, resetForm } = useForm()

const currentView = ref<'list' | 'timeline'>('timeline')

// --- Stats Calculation ---
const stats = computed(() => {
  const groups = appStore.groupedHistory
  const keys = Object.keys(groups)
  const totalBookings = keys.length
  let totalPax = 0
  let waitingTables = 0
  let depositedCount = 0

  keys.forEach(key => {
    const order = groups[key].latest
    totalPax += Number(order.parsedCustomer?.pax) || 0
    if (!order.parsedCustomer?.tables || order.parsedCustomer?.tables === '---' || order.parsedCustomer?.tables.toLowerCase().includes('chưa')) {
      waitingTables++
    }
    if (order.isDeposited) {
      depositedCount++
    }
  })

  const depositRate = totalBookings > 0 ? Math.round((depositedCount / totalBookings) * 100) : 0

  return {
    totalBookings,
    totalPax,
    waitingTables,
    depositRate
  }
})

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
  <div class="flex-grow flex flex-col overflow-hidden text-[13px] bg-slate-50">
    <!-- Header Title -->
    <div class="bg-white px-5 py-4 border-b border-slate-100 flex justify-between items-center z-10 shadow-sm shrink-0">
      <h2 class="font-black text-xl text-[#1A237E] uppercase tracking-wider flex items-center gap-2" style="font-family: 'Be Vietnam Pro', sans-serif;">
        <i class="fa-solid fa-arrow-left text-slate-400 cursor-pointer lg:hidden" @click="ui.tab = 'create'"></i>
        Lịch Đặt Bàn
      </h2>
      <div class="flex bg-slate-100 p-1 rounded-xl">
        <button @click="currentView = 'list'" :class="['px-4 py-1.5 rounded-lg text-xs font-bold transition-all', currentView === 'list' ? 'bg-white text-[#1A237E] shadow-sm' : 'text-slate-500 hover:text-slate-700']">Danh sách</button>
        <button @click="currentView = 'timeline'" :class="['px-4 py-1.5 rounded-lg text-xs font-bold transition-all', currentView === 'timeline' ? 'bg-white text-[#1A237E] shadow-sm' : 'text-slate-500 hover:text-slate-700']">Timeline</button>
      </div>
    </div>

    <!-- TIMELINE VIEW -->
    <HistoryTimeline v-if="currentView === 'timeline'" />

    <!-- LIST VIEW -->
    <div v-else class="flex-grow flex flex-col overflow-hidden">

    <!-- Stats Cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-white border-b border-slate-100 shadow-sm z-10">
      <div class="bg-slate-50 p-3 rounded-2xl border border-slate-100 flex flex-col justify-center items-center">
        <div class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Tổng Booking</div>
        <div class="text-2xl font-black text-[#1A237E]">{{ stats.totalBookings }}</div>
      </div>
      <div class="bg-slate-50 p-3 rounded-2xl border border-slate-100 flex flex-col justify-center items-center">
        <div class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Tổng Khách</div>
        <div class="text-2xl font-black text-[#1A237E]">{{ stats.totalPax }}</div>
      </div>
      <div class="bg-orange-50 p-3 rounded-2xl border border-orange-100 flex flex-col justify-center items-center">
        <div class="text-[10px] font-bold text-orange-600 uppercase tracking-widest mb-1">Chờ Xếp Bàn</div>
        <div class="text-2xl font-black text-orange-600">{{ stats.waitingTables }}</div>
      </div>
      <div class="bg-emerald-50 p-3 rounded-2xl border border-emerald-100 flex flex-col justify-center items-center">
        <div class="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">Tỷ Lệ Cọc</div>
        <div class="text-2xl font-black text-emerald-600">{{ stats.depositRate }}%</div>
      </div>
    </div>

    <!-- Search & Actions Bar -->
    <div class="p-4 bg-white border-b border-slate-100 space-y-3 z-10 shadow-sm">
      <div class="flex gap-2">
        <div class="relative flex-grow">
          <i class="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
          <input v-model="ui.historySearch" placeholder="Tìm tên, SĐT, ngày, số tiền..." class="w-full py-3 pl-11 pr-4 rounded-xl bg-slate-100 text-sm font-bold text-slate-700 border-none outline-none focus:ring-2 focus:ring-[#1A237E]/20 transition-all">
        </div>
        <button @click="appStore.loadHistory(false)" class="w-12 h-12 bg-slate-100 text-[#1A237E] rounded-xl font-black text-sm shadow-sm hover:bg-slate-200 active:scale-95 transition-all"><i class="fa-solid fa-arrows-rotate"></i></button>
        <button @click="resetForm" class="px-5 h-12 bg-[#22C55E] text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-md hover:bg-green-600 active:scale-95 transition-all flex items-center justify-center gap-2"><i class="fa-solid fa-plus"></i> Tạo</button>
      </div>

      <div class="flex gap-2 justify-between items-center">
        <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">
          <span v-if="ui.isBatchMode" class="text-[#1A237E]">Đang chọn {{ ui.selectedIds.length }} phiếu</span>
          <span v-else>Tất cả danh sách</span>
        </div>
        <div class="flex gap-2">
          <button @click="ui.toggleBatchMode()" :class="['px-3 py-1.5 rounded-lg font-black text-[10px] uppercase transition-all', ui.isBatchMode ? 'bg-red-600 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200']">
            <i class="fa-solid fa-layer-group mr-1"></i> {{ ui.isBatchMode ? 'HỦY CHỌN' : 'CHỌN NHIỀU' }}
          </button>
          <button v-if="ui.isBatchMode && ui.selectedIds.length > 0" @click="deleteBatchOrders" class="px-3 py-1.5 rounded-lg font-black text-[10px] uppercase bg-red-600 text-white shadow-md active:scale-95 transition-all">
            <i class="fa-solid fa-trash mr-1"></i> XÓA BỘ
          </button>
        </div>
      </div>
    </div>

    <!-- Pull-to-refresh indicator -->
    <div class="relative overflow-hidden bg-slate-50" :style="{ height: pullDistance > 0 ? pullDistance + 'px' : '0px', transition: isRefreshing ? 'none' : 'height 0.3s ease' }">
      <div class="flex items-center justify-center h-full">
        <div v-if="isRefreshing" class="w-6 h-6 border-2 border-slate-200 border-t-[#1A237E] rounded-full animate-spin"></div>
        <div v-else class="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
          <i class="fa-solid fa-arrow-down" :style="{ transform: pullDistance >= 80 ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }"></i>
          {{ pullDistance >= 80 ? 'Thả để làm mới' : 'Kéo xuống để làm mới' }}
        </div>
      </div>
    </div>

    <!-- History List -->
    <div
      ref="scrollContainer"
      class="flex-grow overflow-y-auto p-4 space-y-4 pb-28 md:pb-6 custom-scrollbar"
      @touchstart="(e: TouchEvent) => scrollContainer && onPullStart(e, scrollContainer)"
      @touchmove="onPullMove"
      @touchend="onPullEnd"
    >
      <div v-if="Object.keys(appStore.filteredHistory).length === 0" class="text-center py-20 text-slate-400">
        <i class="fa-solid fa-folder-open text-6xl mb-4 text-slate-300"></i>
        <p class="font-black text-sm uppercase tracking-widest">Chưa có lịch sử</p>
      </div>

      <div v-for="(group, key) in appStore.filteredHistory" :key="key"
        class="bg-white rounded-3xl shadow-sm border overflow-hidden transition-all duration-200 relative group"
        :class="[
          expandedKey === String(key) ? 'ring-2 ring-[#1A237E] border-[#1A237E] shadow-xl' : 'border-slate-100 hover:shadow-md hover:border-slate-200',
          ui.isBatchMode && ui.selectedIds.includes(String(key)) ? 'ring-2 ring-blue-500 bg-blue-50' : ''
        ]"
        @click="ui.isBatchMode ? ui.toggleSelection(group) : toggleExpand(String(key))"
      >
        <!-- Card Content -->
        <div class="p-4 md:p-5">
          <!-- Top Row: Date/Time + Checkbox -->
          <div class="flex justify-between items-start mb-4">
            <div class="flex items-center gap-3">
              <!-- Batch checkbox -->
              <div v-if="ui.isBatchMode" class="flex-shrink-0 mr-1">
                <div class="w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors" :class="ui.selectedIds.includes(String(key)) ? 'bg-blue-600 border-blue-600' : 'border-slate-300'">
                  <i v-if="ui.selectedIds.includes(String(key))" class="fa-solid fa-check text-white text-xs"></i>
                </div>
              </div>
              
              <!-- Time Block -->
              <div class="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-center shadow-inner">
                <div class="text-lg font-black text-[#1A237E] leading-none">{{ group.latest.parsedCustomer?.time || '--:--' }}</div>
                <div class="text-[10px] font-bold text-slate-400 mt-1">{{ group.latest.parsedCustomer?.date || '--/--' }}</div>
              </div>
              
              <!-- Customer info -->
              <div class="min-w-0">
                <div class="font-black text-slate-800 text-base uppercase tracking-tight truncate">{{ group.latest.parsedCustomer?.name || 'KHÁCH HÀNG' }}</div>
                <div class="text-sm text-slate-500 font-bold mt-0.5 flex items-center gap-1.5">
                  <i class="fa-solid fa-phone text-[10px] text-slate-400"></i> {{ group.latest.parsedCustomer?.phone || '---' }}
                </div>
              </div>
            </div>
            
            <!-- Amount + Status -->
            <div class="text-right flex-shrink-0 flex flex-col items-end gap-1.5">
              <div class="text-sm md:text-base font-black text-[#1A237E] bg-blue-50 px-2 py-0.5 rounded-lg">{{ formatVND(group.latest.totalAmount || 0) }}</div>
              <div class="text-[10px] font-bold px-2 py-0.5 rounded-md border" :class="group.latest.isDeposited ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-orange-50 text-orange-600 border-orange-200'">
                {{ group.latest.isDeposited ? '✓ Đã Cọc' : '⏳ Chờ Cọc' }}
              </div>
            </div>
          </div>

          <!-- Bottom Info Grid -->
          <div class="grid grid-cols-3 gap-2 bg-slate-50 rounded-xl p-2.5 border border-slate-100 mb-3">
            <div class="flex flex-col">
              <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Số khách</span>
              <span class="text-sm font-black text-slate-700">{{ group.latest.parsedCustomer?.pax || '0' }} <span class="text-xs font-bold text-slate-400">người</span></span>
            </div>
            <div class="flex flex-col border-l border-slate-200 pl-3">
              <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Bàn</span>
              <span class="text-sm font-black truncate" :class="group.latest.parsedCustomer?.tables && group.latest.parsedCustomer.tables !== '---' && !group.latest.parsedCustomer.tables.toLowerCase().includes('chưa') ? 'text-[#1A237E]' : 'text-orange-500'">{{ group.latest.parsedCustomer?.tables || 'Chưa xếp' }}</span>
            </div>
            <div class="flex flex-col border-l border-slate-200 pl-3">
              <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Loại tiệc</span>
              <span class="text-sm font-black text-slate-700 truncate">{{ group.latest.parsedCustomer?.type || 'Thường' }}</span>
            </div>
          </div>

          <!-- Expand indicator (shows when not expanded) -->
          <div class="flex justify-center -mb-2 opacity-50 group-hover:opacity-100 transition-opacity">
            <i class="fa-solid fa-chevron-down text-slate-300 text-xs transition-transform duration-300" :class="{ 'rotate-180 text-[#1A237E]': expandedKey === String(key) }"></i>
          </div>
        </div>

        <!-- ═══ EXPANDABLE ACTIONS PANEL ═══ -->
        <div
          class="overflow-hidden transition-all duration-300 ease-in-out bg-slate-50 border-t border-slate-100"
          :style="{ maxHeight: expandedKey === String(key) ? '300px' : '0px', opacity: expandedKey === String(key) ? 1 : 0 }"
        >
          <div class="p-4 space-y-3">
            <!-- Tags row -->
            <div class="flex gap-2 flex-wrap">
              <span class="text-[10px] bg-white border border-slate-200 text-slate-600 px-2 py-1 rounded-lg font-bold shadow-sm"><i class="fa-solid fa-utensils mr-1.5 text-slate-400"></i>{{ group.latest.menuItems?.length || 0 }} món</span>
              <span v-if="group.latest.aiEngine" class="text-[10px] bg-white border border-slate-200 text-indigo-600 px-2 py-1 rounded-lg font-bold shadow-sm"><i class="fa-solid fa-microchip mr-1.5 text-indigo-400"></i>{{ group.latest.aiEngine }}</span>
              <span v-if="group.versions.length > 1" class="text-[10px] bg-amber-50 border border-amber-200 text-amber-700 px-2 py-1 rounded-lg font-bold shadow-sm"><i class="fa-solid fa-clock-rotate-left mr-1.5 text-amber-500"></i>{{ group.versions.length }} lần sửa</span>
            </div>

            <!-- Version Diff -->
            <div v-if="group.versions.length > 1" class="p-3 bg-white rounded-xl border border-amber-100 shadow-sm">
              <div class="text-[9px] font-black text-amber-600 uppercase mb-2 tracking-widest flex items-center gap-1"><i class="fa-solid fa-clock-rotate-left"></i> Lịch sử sửa đổi gần nhất:</div>
              <div class="text-xs text-slate-600 leading-relaxed" v-html="appStore.computeDiff(group.latest, group.versions[group.versions.length - 2])"></div>
            </div>

            <!-- Action Buttons -->
            <div class="grid grid-cols-4 gap-2 pt-1" @click.stop>
              <button @click="editHistoricOrder(group.latest)"
                class="py-3 bg-[#1A237E] text-white rounded-xl font-black text-[10px] uppercase shadow-md active:scale-95 transition-all flex flex-col items-center justify-center gap-1 hover:bg-blue-900">
                <i class="fa-solid fa-pen-to-square text-lg mb-0.5"></i> Sửa
              </button>
              <button @click="shareBillLink(group.latest.id, group.latest.parsedCustomer?.name)"
                class="py-3 bg-cyan-500 text-white rounded-xl font-black text-[10px] uppercase shadow-md active:scale-95 transition-all flex flex-col items-center justify-center gap-1 hover:bg-cyan-600">
                <i class="fa-solid fa-share-nodes text-lg mb-0.5"></i> Link
              </button>
              <a v-if="group.latest.billUrl" :href="group.latest.billUrl" target="_blank"
                class="py-3 bg-white border-2 border-indigo-100 text-indigo-600 rounded-xl font-black text-[10px] text-center uppercase active:scale-95 transition-all flex flex-col items-center justify-center gap-1 hover:border-indigo-300 hover:bg-indigo-50 shadow-sm">
                <i class="fa-solid fa-receipt text-lg mb-0.5"></i> Xem Bill
              </a>
              <button v-else class="py-3 bg-slate-100 text-slate-400 rounded-xl font-black text-[10px] uppercase flex flex-col items-center justify-center gap-1 cursor-not-allowed border border-slate-200">
                <i class="fa-solid fa-eye-slash text-lg mb-0.5"></i> N/A
              </button>
              <button @click="deleteHistoricOrder(group.latest.id)"
                class="py-3 bg-white border-2 border-red-100 text-red-500 rounded-xl font-black text-[10px] uppercase hover:bg-red-50 active:scale-95 transition-all flex flex-col items-center justify-center gap-1 shadow-sm hover:border-red-300">
                <i class="fa-solid fa-trash-can text-lg mb-0.5"></i> Xóa
              </button>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  </div>
</template>
