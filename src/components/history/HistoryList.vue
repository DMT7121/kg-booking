<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { useUIStore } from '@/stores/useUIStore'
import { useAppStore } from '@/stores/useAppStore'
import { useForm } from '@/composables/useForm'
import { formatVND } from '@/utils'
import * as api from '@/services/api'
import { usePullToRefresh, haptic } from '@/composables/useGestures'
const ui = useUIStore()
const appStore = useAppStore()
const { editHistoricOrder, resetForm, copyToClipboard } = useForm()

// --- Debounced Search ---
const localSearch = ref(ui.historySearch)
let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(localSearch, (val) => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { ui.historySearch = val }, 300)
})
onUnmounted(() => { if (searchTimer) clearTimeout(searchTimer) })

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

// --- Edit ---
function handleEditOrder(order: any) {
  editHistoricOrder(order)
}

// --- Delete ---
async function deleteHistoricOrder(id: string) {
  const confirmed = await ui.showConfirm('Xác Nhận Xóa', 'Bạn có chắc chắn muốn xóa bản ghi này?')
  if (!confirmed) return
  
  const canDelete = await appStore.verifySession('booking:delete')
  if (!canDelete) return
  const token = appStore.adminToken

  ui.loading.is = true
  ui.loading.msg = 'ĐANG XÓA...'
  haptic('medium')
  try {
    const res = await appStore.deleteOrder(id, undefined, token)
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

  const canDelete = await appStore.verifySession('booking:delete')
  if (!canDelete) return
  const token = appStore.adminToken

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
    await Promise.all(chunk.map(id => appStore.deleteOrder(id, undefined, token).catch(() => false)))
    processed += chunk.length
    ui.loading.subMsg = `Processing ${processed}/${idsToDelete.length}`
  }

  appStore.historyList = appStore.historyList.filter((h: any) => !idsToDelete.includes(h.id))
  ui.selectedIds = []
  ui.isBatchMode = false
  ui.loading.is = false
  ui.showToast(`Đã xóa ${idsToDelete.length} bản ghi lịch sử.`, 'success')
}

// Check cared status from localStorage
function isOrderCared(id: string) {
  const caredStatus = JSON.parse(localStorage.getItem('kg_cared_status') || '{}')
  return !!caredStatus[id]
}
</script>

<template>
  <div class="flex-grow flex flex-col overflow-hidden text-[13px] bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 min-h-0">
    <!-- Header Title -->
    <div class="bg-slate-50 dark:bg-slate-950 px-4 py-4 flex items-center justify-between sticky top-0 z-20 shadow-sm border-b border-slate-200/60 dark:border-slate-800">
      <button @click="ui.tab = 'create'" class="w-10 h-10 flex items-center justify-center text-blue-900 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-xl active:scale-95 transition-transform">
        <i class="fa-solid fa-arrow-left"></i>
      </button>
      <div class="text-center flex-1">
        <h2 class="text-xl font-black text-blue-900 dark:text-blue-400">Lịch sử tạo phiếu</h2>
        <p class="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-0.5">Tất cả lịch/phiếu đã tạo của nhà hàng</p>
      </div>
      
      <div class="w-10"></div> <!-- Placeholder to balance header -->
    </div>

    <!-- LIST VIEW -->
    <div class="flex-grow flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-950 min-h-0">

      <!-- Search & Filters -->
      <div class="p-4 bg-slate-50 dark:bg-slate-950 space-y-3 z-10 shrink-0 border-b border-slate-200/40 dark:border-slate-800/80">
        <div class="flex gap-2">
          <div class="relative flex-grow">
            <input v-model="localSearch" type="text" class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold text-slate-700 dark:text-slate-200 text-[13px] focus:border-blue-600 dark:focus:border-blue-400 outline-none transition-all placeholder-slate-400 dark:placeholder-slate-500" placeholder="Tìm kiếm theo tên, SĐT, mã phiếu...">
            <i class="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"></i>
          </div>
          <button @click="ui.isBatchMode = !ui.isBatchMode" class="px-4 py-2.5 rounded-xl border font-bold text-[13px] flex items-center gap-2 active:scale-95 transition-all whitespace-nowrap shadow-sm" :class="ui.isBatchMode ? 'border-red-200 dark:border-red-800/60 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400' : 'border-blue-200 dark:border-blue-800/60 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'">
            <i class="fa-solid" :class="ui.isBatchMode ? 'fa-trash' : 'fa-filter'"></i> {{ ui.isBatchMode ? 'Xóa Nhiều' : 'Bộ lọc' }}
          </button>
        </div>
        
        <!-- Filter Dropdowns -->
        <div class="flex gap-2 overflow-x-auto custom-scrollbar pb-1 no-scrollbar">
          <select v-model="ui.historyFilters.time" class="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs font-bold shrink-0 outline-none appearance-none pr-8">
            <option value="all">Tất cả thời gian</option>
            <option value="today">Hôm nay</option>
          </select>
          <select v-model="ui.historyFilters.status" class="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs font-bold shrink-0 outline-none appearance-none pr-8">
            <option value="all">Tất cả trạng thái</option>
            <option value="synced">Đã đồng bộ</option>
            <option value="syncing">Đang chờ</option>
          </select>
          <select v-model="ui.historyFilters.deposit" class="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs font-bold shrink-0 outline-none appearance-none pr-8">
            <option value="all">Tất cả cọc</option>
            <option value="paid">Đã cọc</option>
            <option value="unpaid">Chưa cọc</option>
          </select>
        </div>
        
        <!-- Compact Summary Chip Bar -->
        <div class="flex items-center gap-2 py-1 overflow-x-auto no-scrollbar font-tabular">
          <span class="px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-black text-xs shrink-0 shadow-xs border border-blue-100/50">
            {{ stats.totalBookings }} booking
          </span>
          <span class="px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-black text-xs shrink-0 shadow-xs border border-indigo-100/50">
            {{ stats.totalPax }} khách
          </span>
          <span class="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-black text-xs shrink-0 shadow-xs border border-emerald-100/50">
            {{ stats.depositRate }}% đã cọc
          </span>
          <span v-if="stats.waitingTables > 0" class="px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-black text-xs shrink-0 shadow-xs border border-rose-100/50">
            {{ stats.waitingTables }} chờ bàn
          </span>
        </div>
        
        <!-- Batch Delete Action -->
        <div v-if="ui.isBatchMode && ui.selectedIds.length > 0" class="flex justify-between items-center bg-red-50 dark:bg-red-950/40 p-3 rounded-xl border border-red-200 dark:border-red-800/60">
           <span class="text-xs font-bold text-red-600 dark:text-red-400 font-tabular">Đã chọn {{ ui.selectedIds.length }} phiếu</span>
           <button @click="deleteBatchOrders" class="px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-black uppercase shadow-sm active:scale-95">Xóa ngay</button>
        </div>
      </div>

      <!-- Pull-to-refresh indicator -->
      <div class="relative overflow-hidden bg-slate-50 dark:bg-slate-950" :style="{ height: pullDistance > 0 ? pullDistance + 'px' : '0px', transition: isRefreshing ? 'none' : 'height 0.3s ease' }">
        <div class="flex items-center justify-center h-full">
          <div v-if="isRefreshing" class="w-6 h-6 border-2 border-slate-200 dark:border-slate-700 border-t-blue-900 dark:border-t-blue-400 rounded-full animate-spin"></div>
          <div v-else class="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
            <i class="fa-solid fa-arrow-down" :style="{ transform: pullDistance >= 80 ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }"></i>
            {{ pullDistance >= 80 ? 'Thả để làm mới' : 'Kéo xuống để làm mới' }}
          </div>
        </div>
      </div>

      <!-- History List -->
      <div
        ref="scrollContainer"
        class="flex-grow overflow-y-auto px-4 pb-28 md:pb-6 space-y-4 custom-scrollbar bg-slate-50 dark:bg-slate-950"
        @touchstart="(e: TouchEvent) => scrollContainer && onPullStart(e, scrollContainer)"
        @touchmove="onPullMove"
        @touchend="onPullEnd"
      >
        <div v-if="Object.keys(appStore.filteredHistory).length === 0" class="text-center py-20 text-slate-400 dark:text-slate-500">
          <i class="fa-solid fa-folder-open text-6xl mb-4 text-slate-300 dark:text-slate-600"></i>
          <p class="font-black text-sm uppercase tracking-widest">Chưa có lịch sử</p>
        </div>

        <div v-for="(group, key) in appStore.filteredHistory" :key="key"
          class="bg-white dark:bg-slate-900 rounded-3xl shadow-[0_2px_12px_rgba(0,0,0,0.04)] dark:shadow-none border border-slate-100 dark:border-slate-800 p-4 transition-all duration-200 relative group overflow-hidden"
          :class="[
            ui.isBatchMode && ui.selectedIds.includes(String(key)) ? 'ring-2 ring-red-500 bg-red-50 dark:bg-red-950/20' : ''
          ]"
          @click="ui.isBatchMode ? ui.toggleSelection(group) : toggleExpand(String(key))"
        >
          <!-- Top row -->
          <div class="flex justify-between items-start mb-4">
            <div class="flex items-start gap-3">
              <div v-if="ui.isBatchMode" class="mt-1">
                <div class="w-5 h-5 rounded border-2 flex items-center justify-center transition-colors" :class="ui.selectedIds.includes(String(key)) ? 'bg-red-600 border-red-600' : 'border-slate-300 dark:border-slate-600'">
                  <i v-if="ui.selectedIds.includes(String(key))" class="fa-solid fa-check text-white text-[10px]"></i>
                </div>
              </div>

              <!-- Type Icon -->
              <div class="w-10 h-10 rounded-2xl flex items-center justify-center text-lg shrink-0"
                   :class="group.latest.parsedCustomer?.type === 'Mang về' ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-500' : 'bg-purple-50 dark:bg-purple-950/50 text-purple-500'">
                <i class="fa-solid" :class="group.latest.parsedCustomer?.type === 'Mang về' ? 'fa-bag-shopping' : 'fa-calendar-days'"></i>
              </div>
              
              <div>
                <div class="font-black text-[14px] text-blue-900 dark:text-blue-400 leading-tight cursor-pointer font-tabular" @click.stop="copyToClipboard(String(key))">#{{ String(key).substring(0, 11) }}</div>
                <div class="flex gap-1.5 mt-1.5 flex-wrap">
                  <span class="text-[9px] font-black bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 px-2 py-0.5 rounded border border-purple-100 dark:border-purple-800/40">{{ group.latest.parsedCustomer?.type || 'Đặt bàn' }}</span>
                  <span class="text-[9px] font-black px-2 py-0.5 rounded border font-tabular" :class="group.latest.isDeposited ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800/40' : 'bg-orange-50 dark:bg-orange-950/50 text-orange-600 dark:text-orange-400 border-orange-100 dark:border-orange-800/40'">{{ group.latest.isDeposited ? 'Đã xác nhận' : 'Chờ đặt cọc' }}</span>
                  <span v-if="isOrderCared(group.latest.id)" class="text-[9px] font-black bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 px-2 py-0.5 rounded border border-rose-100 dark:border-rose-800/40"><i class="fa-solid fa-heart mr-0.5"></i> Đã CSKH</span>
                </div>
              </div>
            </div>
            <div class="flex flex-col items-end gap-1.5 shrink-0">
              <span class="text-[10px] font-bold text-slate-500 dark:text-slate-400 font-tabular">{{ group.latest.parsedCustomer?.date }} • {{ group.latest.parsedCustomer?.time }}</span>
              <button class="text-slate-300 dark:text-slate-600 hover:text-blue-900 dark:hover:text-blue-400 p-1 min-h-[36px] min-w-[36px] flex items-center justify-center"><i class="fa-solid fa-ellipsis-vertical"></i></button>
            </div>
          </div>

          <!-- Info Grid -->
          <div class="grid grid-cols-3 gap-2 mb-4">
            <!-- Col 1 -->
            <div class="space-y-2 border-r border-slate-100 dark:border-slate-800 pr-1">
              <div class="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                <i class="fa-regular fa-user text-[10px] shrink-0 w-3 text-center"></i>
                <span class="text-[11px] font-bold truncate text-slate-700 dark:text-slate-200">{{ group.latest.parsedCustomer?.name || '---' }}</span>
              </div>
              <div class="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                <i class="fa-solid fa-phone text-[10px] shrink-0 w-3 text-center"></i>
                <span class="text-[11px] font-bold truncate text-slate-700 dark:text-slate-200 font-tabular">{{ group.latest.parsedCustomer?.phone || '---' }}</span>
              </div>
            </div>
            <!-- Col 2 -->
            <div class="space-y-2 border-r border-slate-100 dark:border-slate-800 pr-1 pl-1">
              <div class="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                <i class="fa-solid fa-utensils text-[10px] shrink-0 w-3 text-center"></i>
                <span class="text-[11px] font-bold truncate text-slate-700 dark:text-slate-200 font-tabular">{{ group.latest.menuItems?.length || 0 }} món</span>
              </div>
              <div class="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                <i class="fa-solid fa-money-bill text-[10px] shrink-0 w-3 text-center"></i>
                <span class="text-[11px] font-bold truncate text-slate-700 dark:text-slate-200 font-tabular">{{ formatVND(group.latest.totalAmount || 0) }}</span>
              </div>
            </div>
            <!-- Col 3 -->
            <div class="space-y-2 pl-1">
              <div class="flex items-center gap-2" :class="group.latest.isDeposited ? 'text-emerald-500' : 'text-orange-500'">
                <i class="fa-regular" :class="group.latest.isDeposited ? 'fa-circle-check text-[10px]' : 'fa-clock text-[10px]'"></i>
                <span class="text-[10px] font-black">{{ group.latest.isDeposited ? 'Đã đặt cọc' : 'Chờ đặt cọc' }}</span>
              </div>
              <div class="text-[11px] font-black text-slate-800 dark:text-slate-100 truncate font-tabular" :class="!group.latest.isDeposited ? 'text-slate-400 dark:text-slate-500' : ''">
                {{ formatVND(group.latest.depositAmount || 0) }} <span class="text-[9px] text-slate-400 dark:text-slate-500" v-if="group.latest.depositAmount">({{ Math.round((group.latest.depositAmount / (group.latest.totalAmount || 1)) * 100) }}%)</span>
              </div>
            </div>
          </div>

          <div class="h-[1px] bg-slate-100 dark:bg-slate-800 w-full mb-2"></div>

          <!-- Actions Bottom Bar (min 40-44px touch targets) -->
          <div class="flex justify-between items-center gap-1" @click.stop>
            <button @click="ui.activeOrderForCare = group.latest; ui.showCustomerCareModal = true" class="min-h-[40px] px-2.5 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center gap-1 text-xs font-black text-rose-500 hover:text-rose-700 dark:hover:text-rose-400 transition-colors active:scale-95">
              <i class="fa-solid fa-heart text-[11px]"></i> CSKH
            </button>
            <button @click="handleEditOrder(group.latest)" class="min-h-[40px] px-2.5 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-950/30 flex items-center gap-1 text-xs font-black text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors active:scale-95">
              <i class="fa-solid fa-pen text-[11px]"></i> Sửa
            </button>
            <button @click="shareBillLink(group.latest.id, group.latest.parsedCustomer?.name)" class="min-h-[40px] px-2.5 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-950/30 flex items-center gap-1 text-xs font-black text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors active:scale-95">
              <i class="fa-solid fa-link text-[11px]"></i> Link
            </button>
            <button @click="ui.selectedBooking = group.latest; ui.showBookingDetailModal = true" class="min-h-[40px] px-2.5 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-950/30 flex items-center gap-1 text-xs font-black text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors active:scale-95">
              <i class="fa-solid fa-eye text-[11px]"></i> Xem
            </button>
            <button @click="deleteHistoricOrder(group.latest.id)" class="min-h-[40px] px-2.5 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-1 text-xs font-black text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors active:scale-95">
              <i class="fa-solid fa-trash-can text-[11px]"></i> Xóa
            </button>
          </div>
          
          <!-- Dropdown/expand area if needed -->
          <div v-if="expandedKey === String(key)" class="mt-4 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl text-[10px] text-slate-600 dark:text-slate-300 border border-slate-100 dark:border-slate-700 shadow-inner">
            <div class="font-bold mb-1">Ghi chú:</div>
            <p>{{ group.latest.parsedCustomer?.note || 'Không có ghi chú' }}</p>
          </div>

        </div>
      </div>
    </div>
  </div>
</template>
