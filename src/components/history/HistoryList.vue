<script setup lang="ts">
import { ref, computed } from 'vue'
import { useUIStore } from '@/stores/useUIStore'
import { useAppStore } from '@/stores/useAppStore'
import { useForm } from '@/composables/useForm'
import { formatVND } from '@/utils'
import * as api from '@/services/api'
import { usePullToRefresh, haptic } from '@/composables/useGestures'
const ui = useUIStore()
const appStore = useAppStore()
const { editHistoricOrder, resetForm } = useForm()

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
  <div class="flex-grow flex flex-col overflow-hidden text-[13px] bg-slate-50 min-h-0 h-full">
    <!-- Header Title -->
    <div class="bg-slate-50 px-4 py-4 flex items-center justify-between sticky top-0 z-20 shadow-sm border-b border-slate-100">
      <button @click="ui.tab = 'create'" class="w-10 h-10 flex items-center justify-center text-blue-900 text-xl active:scale-95 transition-transform">
        <i class="fa-solid fa-arrow-left"></i>
      </button>
      <div class="text-center flex-1">
        <h2 class="text-xl font-black text-blue-900">Lịch sử tạo phiếu</h2>
        <p class="text-[10px] font-bold text-slate-400 mt-0.5">Tất cả lịch/phiếu đã tạo của nhà hàng</p>
      </div>
      
      <div class="w-10"></div> <!-- Placeholder to balance header -->
    </div>

    <!-- LIST VIEW -->
    <div class="flex-grow flex flex-col overflow-hidden bg-slate-50 min-h-0 h-full">
      
      <!-- Search & Filters -->
      <div class="p-4 bg-slate-50 space-y-3 z-10 shrink-0">
        <div class="flex gap-2">
          <div class="relative flex-grow">
            <input v-model="ui.historySearch" type="text" class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white font-bold text-slate-700 text-[13px] focus:border-blue-900 outline-none transition-all placeholder-slate-400" placeholder="Tìm kiếm theo tên, SĐT, mã phiếu...">
            <i class="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"></i>
          </div>
          <button @click="ui.isBatchMode = !ui.isBatchMode" class="px-4 py-2.5 rounded-xl border font-bold text-[13px] flex items-center gap-2 active:scale-95 transition-all whitespace-nowrap" :class="ui.isBatchMode ? 'border-red-200 bg-red-50 text-red-600' : 'border-blue-200 bg-blue-50 text-blue-600'">
            <i class="fa-solid" :class="ui.isBatchMode ? 'fa-trash' : 'fa-filter'"></i> {{ ui.isBatchMode ? 'Xóa Nhiều' : 'Bộ lọc' }}
          </button>
        </div>
        
        <!-- Filter Dropdowns -->
        <div class="flex gap-2 overflow-x-auto custom-scrollbar pb-1" style="scrollbar-width: none;">
          <select v-model="ui.historyFilters.time" class="px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-[11px] font-bold shrink-0 outline-none appearance-none pr-8 relative">
            <option value="all">Tất cả thời gian</option>
            <option value="today">Hôm nay</option>
          </select>
          <select v-model="ui.historyFilters.status" class="px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-[11px] font-bold shrink-0 outline-none appearance-none pr-8 relative">
            <option value="all">Tất cả trạng thái</option>
            <option value="synced">Đã đồng bộ</option>
            <option value="syncing">Đang chờ</option>
          </select>
          <select v-model="ui.historyFilters.deposit" class="px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-[11px] font-bold shrink-0 outline-none appearance-none pr-8 relative">
            <option value="all">Tất cả đặt cọc</option>
            <option value="paid">Đã đặt cọc</option>
            <option value="unpaid">Chưa cọc</option>
          </select>
        </div>
        
        <!-- Total & Sort -->
        <div class="flex justify-between items-center pt-1">
          <div class="text-[12px] font-bold text-slate-500">Tổng số: <span class="text-slate-800">{{ stats.totalBookings }} phiếu</span></div>
          <div class="flex items-center gap-1.5 text-slate-500 text-[12px] font-bold">
            <i class="fa-solid fa-arrow-down-up-across-line text-[10px]"></i>
            <select v-model="ui.historyFilters.sort" class="bg-transparent border-none outline-none font-bold text-slate-600 appearance-none text-right">
              <option value="newest">Mới nhất</option>
              <option value="oldest">Cũ nhất</option>
            </select>
            <i class="fa-solid fa-chevron-down text-[8px] ml-0.5"></i>
          </div>
        </div>
        
        <!-- Batch Delete Action -->
        <div v-if="ui.isBatchMode && ui.selectedIds.length > 0" class="flex justify-between items-center bg-red-50 p-3 rounded-xl border border-red-100">
           <span class="text-xs font-bold text-red-600">Đã chọn {{ ui.selectedIds.length }} phiếu</span>
           <button @click="deleteBatchOrders" class="px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-black uppercase shadow-sm active:scale-95">Xóa ngay</button>
        </div>
      </div>

      <!-- Pull-to-refresh indicator -->
      <div class="relative overflow-hidden bg-slate-50" :style="{ height: pullDistance > 0 ? pullDistance + 'px' : '0px', transition: isRefreshing ? 'none' : 'height 0.3s ease' }">
        <div class="flex items-center justify-center h-full">
          <div v-if="isRefreshing" class="w-6 h-6 border-2 border-slate-200 border-t-blue-900 rounded-full animate-spin"></div>
          <div v-else class="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
            <i class="fa-solid fa-arrow-down" :style="{ transform: pullDistance >= 80 ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }"></i>
            {{ pullDistance >= 80 ? 'Thả để làm mới' : 'Kéo xuống để làm mới' }}
          </div>
        </div>
      </div>

      <!-- History List -->
      <div
        ref="scrollContainer"
        class="flex-grow overflow-y-auto px-4 pb-28 md:pb-6 space-y-4 custom-scrollbar bg-slate-50"
        @touchstart="(e: TouchEvent) => scrollContainer && onPullStart(e, scrollContainer)"
        @touchmove="onPullMove"
        @touchend="onPullEnd"
      >
        <div v-if="Object.keys(appStore.filteredHistory).length === 0" class="text-center py-20 text-slate-400">
          <i class="fa-solid fa-folder-open text-6xl mb-4 text-slate-300"></i>
          <p class="font-black text-sm uppercase tracking-widest">Chưa có lịch sử</p>
        </div>

        <div v-for="(group, key) in appStore.filteredHistory" :key="key"
          class="bg-white rounded-3xl shadow-[0_2px_12px_rgba(0,0,0,0.04)] border border-slate-100 p-4 transition-all duration-200 relative group overflow-hidden"
          :class="[
            ui.isBatchMode && ui.selectedIds.includes(String(key)) ? 'ring-2 ring-red-500 bg-red-50' : ''
          ]"
          @click="ui.isBatchMode ? ui.toggleSelection(group) : toggleExpand(String(key))"
        >
          <!-- Top row -->
          <div class="flex justify-between items-start mb-4">
            <div class="flex items-start gap-3">
              <div v-if="ui.isBatchMode" class="mt-1">
                <div class="w-5 h-5 rounded border-2 flex items-center justify-center transition-colors" :class="ui.selectedIds.includes(String(key)) ? 'bg-red-600 border-red-600' : 'border-slate-300'">
                  <i v-if="ui.selectedIds.includes(String(key))" class="fa-solid fa-check text-white text-[10px]"></i>
                </div>
              </div>

              <!-- Type Icon -->
              <div class="w-10 h-10 rounded-2xl flex items-center justify-center text-lg shrink-0"
                   :class="group.latest.parsedCustomer?.type === 'Mang về' ? 'bg-amber-50 text-amber-500' : 'bg-purple-50 text-purple-500'">
                <i class="fa-solid" :class="group.latest.parsedCustomer?.type === 'Mang về' ? 'fa-bag-shopping' : 'fa-calendar-days'"></i>
              </div>
              
              <div>
                <div class="font-black text-[14px] text-blue-900 leading-tight cursor-pointer" @click.stop="copyToClipboard(String(key))">#{{ String(key).substring(0, 11) }}</div>
                <div class="flex gap-1.5 mt-1.5 flex-wrap">
                  <span class="text-[9px] font-black bg-purple-50 text-purple-600 px-2 py-0.5 rounded border border-purple-100">{{ group.latest.parsedCustomer?.type || 'Đặt bàn' }}</span>
                  <span class="text-[9px] font-black px-2 py-0.5 rounded border" :class="group.latest.isDeposited ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-orange-50 text-orange-600 border-orange-100'">{{ group.latest.isDeposited ? 'Đã xác nhận' : 'Chờ đặt cọc' }}</span>
                </div>
              </div>
            </div>
            <div class="flex flex-col items-end gap-1.5 shrink-0">
              <span class="text-[10px] font-bold text-slate-500">{{ group.latest.parsedCustomer?.date }} • {{ group.latest.parsedCustomer?.time }}</span>
              <button class="text-slate-300 hover:text-blue-900 p-1"><i class="fa-solid fa-ellipsis-vertical"></i></button>
            </div>
          </div>

          <!-- Info Grid -->
          <div class="grid grid-cols-3 gap-2 mb-4">
            <!-- Col 1 -->
            <div class="space-y-2 border-r border-slate-100 pr-1">
              <div class="flex items-center gap-2 text-slate-500">
                <i class="fa-regular fa-user text-[10px] shrink-0 w-3 text-center"></i>
                <span class="text-[11px] font-bold truncate text-slate-700">{{ group.latest.parsedCustomer?.name || '---' }}</span>
              </div>
              <div class="flex items-center gap-2 text-slate-500">
                <i class="fa-solid fa-phone text-[10px] shrink-0 w-3 text-center"></i>
                <span class="text-[11px] font-bold truncate text-slate-700">{{ group.latest.parsedCustomer?.phone || '---' }}</span>
              </div>
            </div>
            <!-- Col 2 -->
            <div class="space-y-2 border-r border-slate-100 pr-1 pl-1">
              <div class="flex items-center gap-2 text-slate-500">
                <i class="fa-solid fa-utensils text-[10px] shrink-0 w-3 text-center"></i>
                <span class="text-[11px] font-bold truncate text-slate-700">{{ group.latest.menuItems?.length || 0 }} món</span>
              </div>
              <div class="flex items-center gap-2 text-slate-500">
                <i class="fa-solid fa-money-bill text-[10px] shrink-0 w-3 text-center"></i>
                <span class="text-[11px] font-bold truncate text-slate-700">{{ formatVND(group.latest.totalAmount || 0) }}</span>
              </div>
            </div>
            <!-- Col 3 -->
            <div class="space-y-2 pl-1">
              <div class="flex items-center gap-2" :class="group.latest.isDeposited ? 'text-emerald-500' : 'text-orange-500'">
                <i class="fa-regular" :class="group.latest.isDeposited ? 'fa-circle-check text-[10px]' : 'fa-clock text-[10px]'"></i>
                <span class="text-[10px] font-black">{{ group.latest.isDeposited ? 'Đã đặt cọc' : 'Chờ đặt cọc' }}</span>
              </div>
              <div class="text-[11px] font-black text-slate-800 truncate" :class="!group.latest.isDeposited ? 'text-slate-400' : ''">
                {{ formatVND(group.latest.depositAmount || 0) }} <span class="text-[9px] text-slate-400" v-if="group.latest.depositAmount">({{ Math.round((group.latest.depositAmount / (group.latest.totalAmount || 1)) * 100) }}%)</span>
              </div>
            </div>
          </div>

          <div class="h-[1px] bg-slate-100 w-full mb-3"></div>

          <!-- Actions Bottom Bar -->
          <div class="flex justify-between items-center px-1" @click.stop>
            <button @click="editHistoricOrder(group.latest)" class="flex items-center gap-1.5 text-[11px] font-black text-blue-600 hover:text-blue-800 transition-colors active:scale-95">
              <i class="fa-solid fa-pen"></i> Chỉnh sửa
            </button>
            <button @click="shareBillLink(group.latest.id, group.latest.parsedCustomer?.name)" class="flex items-center gap-1.5 text-[11px] font-black text-blue-600 hover:text-blue-800 transition-colors active:scale-95">
              <i class="fa-solid fa-link"></i> Lấy liên kết
            </button>
            <button @click="ui.selectedBooking = group.latest; ui.showBookingDetailModal = true" class="flex items-center gap-1.5 text-[11px] font-black text-blue-600 hover:text-blue-800 transition-colors active:scale-95">
              <i class="fa-solid fa-eye"></i> Xem preview
            </button>
            <button @click="deleteHistoricOrder(group.latest.id)" class="flex items-center gap-1.5 text-[11px] font-black text-rose-500 hover:text-rose-700 transition-colors active:scale-95">
              <i class="fa-solid fa-trash-can"></i> Xóa
            </button>
          </div>
          
          <!-- Dropdown/expand area if needed -->
          <div v-if="expandedKey === String(key)" class="mt-4 p-3 bg-slate-50 rounded-xl text-[10px] text-slate-600 border border-slate-100 shadow-inner">
            <div class="font-bold mb-1">Ghi chú:</div>
            <p>{{ group.latest.parsedCustomer?.note || 'Không có ghi chú' }}</p>
          </div>

        </div>
      </div>
    </div>
  </div>
</template>
