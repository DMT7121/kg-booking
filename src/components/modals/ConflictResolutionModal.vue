<script setup lang="ts">
import { computed } from 'vue'
import { useUIStore } from '@/stores/useUIStore'
import { useAppStore } from '@/stores/useAppStore'
import { formatVND } from '@/utils'
import { haptic } from '@/composables/useGestures'

const ui = useUIStore()
const appStore = useAppStore()

const currentConflict = computed(() => {
  if (!appStore.activeConflicts || appStore.activeConflicts.length === 0) return null
  return appStore.activeConflicts[0]
})

function handleResolve(resolution: 'keep_server' | 'keep_local' | 'cancel_local') {
  if (!currentConflict.value) return
  haptic('medium')
  appStore.resolveConflict(currentConflict.value.localBookingId, resolution)
  ui.showToast('Đã ghi nhận lựa chọn giải quyết xung đột!', 'success')
}

function closeConflictModal() {
  // Can close only if no conflicts remaining
  if (appStore.activeConflicts.length === 0) {
    ui.activeSettingModal = null
  }
}
</script>

<template>
  <div v-if="currentConflict" class="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm select-text">
    <div class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 text-slate-800 dark:text-slate-100">
      
      <!-- Modal Header -->
      <div class="px-6 py-4 bg-amber-500/10 border-b border-amber-500/20 flex items-center gap-3 shrink-0">
        <div class="w-10 h-10 rounded-2xl bg-amber-500/20 flex items-center justify-center text-amber-600 text-lg">
          <i class="fa-solid fa-triangle-exclamation"></i>
        </div>
        <div>
          <h3 class="font-black text-slate-900 dark:text-white uppercase tracking-wider text-sm">Xung đột đồng bộ offline</h3>
          <p class="text-[10px] font-bold text-amber-700 dark:text-amber-500 uppercase tracking-widest mt-0.5">
            Xử lý xung đột {{ appStore.activeConflicts.length }} đơn đặt chỗ
          </p>
        </div>
      </div>

      <!-- Scrollable Divergence Details -->
      <div class="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar min-h-0">
        <div class="text-xs font-bold leading-relaxed text-slate-500 dark:text-slate-400">
          Hệ thống phát hiện dữ liệu đặt chỗ được tạo hoặc chỉnh sửa offline của khách hàng <span class="font-extrabold text-slate-800 dark:text-slate-200">{{ currentConflict.localSnapshot?.customer?.name }}</span> có sự khác biệt (trùng bàn, trùng giờ, hoặc phiên bản mới hơn) so với dữ liệu hiện tại trên Google Sheets. Vui lòng chọn cách giải quyết:
        </div>

        <!-- Split View comparison -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          <!-- Column Local (Offline Draft) -->
          <div class="bg-blue-50/50 dark:bg-blue-950/10 border border-blue-100 dark:border-blue-900/40 rounded-2xl p-4 space-y-3">
            <h4 class="font-black text-blue-800 dark:text-blue-400 text-[10px] uppercase tracking-widest flex items-center gap-1.5 border-b border-blue-100 dark:border-blue-900/40 pb-2">
              <i class="fa-solid fa-mobile-screen"></i> 1. Bản cục bộ (Local Offline)
            </h4>
            
            <div class="space-y-2 text-xs">
              <div class="grid grid-cols-3 gap-1">
                <span class="text-slate-450 uppercase font-black text-[9px] tracking-wider">Khách hàng</span>
                <span class="col-span-2 font-black text-slate-800 dark:text-slate-200 truncate">{{ currentConflict.localSnapshot?.customer?.name }}</span>
              </div>
              <div class="grid grid-cols-3 gap-1">
                <span class="text-slate-450 uppercase font-black text-[9px] tracking-wider">SĐT</span>
                <span class="col-span-2 font-black text-slate-800 dark:text-slate-200">{{ currentConflict.localSnapshot?.customer?.phone }}</span>
              </div>
              <div class="grid grid-cols-3 gap-1">
                <span class="text-slate-450 uppercase font-black text-[9px] tracking-wider">Thời gian</span>
                <span class="col-span-2 font-black text-blue-700 dark:text-blue-400">{{ currentConflict.localSnapshot?.customer?.date }} • {{ currentConflict.localSnapshot?.customer?.time }}</span>
              </div>
              <div class="grid grid-cols-3 gap-1">
                <span class="text-slate-450 uppercase font-black text-[9px] tracking-wider">Bàn đặt</span>
                <span class="col-span-2 font-black text-slate-800 dark:text-slate-200">{{ currentConflict.localSnapshot?.customer?.tables || '---' }}</span>
              </div>
              <div class="grid grid-cols-3 gap-1">
                <span class="text-slate-450 uppercase font-black text-[9px] tracking-wider">Số khách</span>
                <span class="col-span-2 font-black text-slate-800 dark:text-slate-200">{{ currentConflict.localSnapshot?.customer?.pax || 0 }} người</span>
              </div>
              <div class="grid grid-cols-3 gap-1">
                <span class="text-slate-450 uppercase font-black text-[9px] tracking-wider">Tổng tiền</span>
                <span class="col-span-2 font-black text-slate-800 dark:text-slate-200">{{ formatVND(currentConflict.localSnapshot?.total || 0) }}</span>
              </div>
              <div class="grid grid-cols-3 gap-1">
                <span class="text-slate-450 uppercase font-black text-[9px] tracking-wider">Đặt cọc</span>
                <span class="col-span-2 font-black text-slate-800 dark:text-slate-200">{{ formatVND(currentConflict.localSnapshot?.deposit?.amount || 0) }} ({{ currentConflict.localSnapshot?.deposit?.isPaid ? 'Đã cọc' : 'Chờ cọc' }})</span>
              </div>
              <div class="pt-2 border-t border-blue-100 dark:border-blue-900/40">
                <span class="text-slate-400 uppercase font-black text-[9px] tracking-wider block mb-1">Ghi chú</span>
                <p class="font-medium text-slate-700 dark:text-slate-300 italic whitespace-pre-wrap leading-relaxed">{{ currentConflict.localSnapshot?.customer?.note || 'Không có' }}</p>
              </div>
            </div>
          </div>

          <!-- Column Server (Online Booking) -->
          <div class="bg-amber-50/50 dark:bg-amber-950/10 border border-amber-100 dark:border-amber-900/40 rounded-2xl p-4 space-y-3">
            <h4 class="font-black text-amber-800 dark:text-amber-400 text-[10px] uppercase tracking-widest flex items-center gap-1.5 border-b border-amber-100 dark:border-amber-900/40 pb-2">
              <i class="fa-solid fa-cloud"></i> 2. Bản trực tuyến (Server Online)
            </h4>
            
            <div v-if="currentConflict.serverSnapshot" class="space-y-2 text-xs">
              <div class="grid grid-cols-3 gap-1">
                <span class="text-slate-450 uppercase font-black text-[9px] tracking-wider">Khách hàng</span>
                <span class="col-span-2 font-black text-slate-800 dark:text-slate-200 truncate">{{ currentConflict.serverSnapshot?.parsedCustomer?.name }}</span>
              </div>
              <div class="grid grid-cols-3 gap-1">
                <span class="text-slate-450 uppercase font-black text-[9px] tracking-wider">SĐT</span>
                <span class="col-span-2 font-black text-slate-800 dark:text-slate-200">{{ currentConflict.serverSnapshot?.parsedCustomer?.phone }}</span>
              </div>
              <div class="grid grid-cols-3 gap-1">
                <span class="text-slate-450 uppercase font-black text-[9px] tracking-wider">Thời gian</span>
                <span class="col-span-2 font-black text-amber-700 dark:text-amber-400">{{ currentConflict.serverSnapshot?.parsedCustomer?.date }} • {{ currentConflict.serverSnapshot?.parsedCustomer?.time }}</span>
              </div>
              <div class="grid grid-cols-3 gap-1">
                <span class="text-slate-450 uppercase font-black text-[9px] tracking-wider">Bàn đặt</span>
                <span class="col-span-2 font-black text-slate-800 dark:text-slate-200">{{ currentConflict.serverSnapshot?.parsedCustomer?.tables || '---' }}</span>
              </div>
              <div class="grid grid-cols-3 gap-1">
                <span class="text-slate-450 uppercase font-black text-[9px] tracking-wider">Số khách</span>
                <span class="col-span-2 font-black text-slate-800 dark:text-slate-200">{{ currentConflict.serverSnapshot?.parsedCustomer?.pax || 0 }} người</span>
              </div>
              <div class="grid grid-cols-3 gap-1">
                <span class="text-slate-450 uppercase font-black text-[9px] tracking-wider">Tổng tiền</span>
                <span class="col-span-2 font-black text-slate-800 dark:text-slate-200">{{ formatVND(currentConflict.serverSnapshot?.totalAmount || 0) }}</span>
              </div>
              <div class="grid grid-cols-3 gap-1">
                <span class="text-slate-450 uppercase font-black text-[9px] tracking-wider">Đặt cọc</span>
                <span class="col-span-2 font-black text-slate-800 dark:text-slate-200">{{ formatVND(currentConflict.serverSnapshot?.depositAmount || 0) }} ({{ currentConflict.serverSnapshot?.isDeposited ? 'Đã cọc' : 'Chờ cọc' }})</span>
              </div>
              <div class="pt-2 border-t border-amber-100 dark:border-amber-900/40">
                <span class="text-slate-400 uppercase font-black text-[9px] tracking-wider block mb-1">Ghi chú</span>
                <p class="font-medium text-slate-700 dark:text-slate-300 italic whitespace-pre-wrap leading-relaxed">{{ currentConflict.serverSnapshot?.parsedCustomer?.note || 'Không có' }}</p>
              </div>
            </div>

            <div v-else class="h-full flex items-center justify-center py-10 text-slate-400 italic text-[11px]">
              Không tìm thấy bản ghi tương ứng trên server (Có thể là trùng số bàn hoặc trùng khoảng thời gian với một khách hàng khác hoàn toàn).
            </div>
          </div>
          
        </div>
      </div>

      <!-- Action Panel -->
      <div class="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex flex-col md:flex-row gap-2 shrink-0 justify-end">
        <button 
          @click="handleResolve('cancel_local')" 
          class="px-4 py-2.5 bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/30 rounded-xl font-black text-xs uppercase tracking-wider transition-all active:scale-95 cursor-pointer"
        >
          Xóa đơn offline này
        </button>
        <button 
          @click="handleResolve('keep_server')" 
          class="px-4 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-250 dark:hover:bg-slate-600 rounded-xl font-black text-xs uppercase tracking-wider transition-all active:scale-95 cursor-pointer"
        >
          Giữ bản Online
        </button>
        <button 
          @click="handleResolve('keep_local')" 
          class="px-4 py-2.5 bg-blue-600 text-white hover:bg-blue-700 rounded-xl font-black text-xs uppercase tracking-wider transition-all active:scale-95 flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/10 cursor-pointer"
        >
          <i class="fa-solid fa-cloud-arrow-up"></i> Ghi đè lên Server
        </button>
      </div>

    </div>
  </div>
</template>
