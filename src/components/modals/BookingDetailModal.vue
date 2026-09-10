<script setup lang="ts">
import { useUIStore } from '@/stores/useUIStore'
import { useForm } from '@/composables/useForm'
import { useAppStore } from '@/stores/useAppStore'
import * as api from '@/services/api'
import { haptic } from '@/composables/useGestures'
import { isIOS, isAndroid, isDesktop, formatVND } from '@/utils'

const ui = useUIStore()
const appStore = useAppStore()
const { editHistoricOrder } = useForm()

function close() {
  ui.showBookingDetailModal = false
  ui.selectedBooking = null
}

function handleEdit() {
  if (!ui.selectedBooking) return
  editHistoricOrder(ui.selectedBooking)
  ui.tab = 'create'
  close()
}

async function handleDelete() {
  if (!ui.selectedBooking) return
  const confirmed = await ui.showConfirm('Xác Nhận Xóa', 'Bạn có chắc chắn muốn xóa bản ghi này?')
  if (!confirmed) return
  
  const canDelete = await appStore.verifySession('booking:delete')
  if (!canDelete) return
  const token = appStore.adminToken

  ui.loading.is = true
  ui.loading.msg = 'ĐANG XÓA...'
  haptic('medium')
  try {
    const res = await appStore.deleteOrder(ui.selectedBooking.id, undefined, token)
    if (res.ok) {
      appStore.historyList = appStore.historyList.filter((i: any) => i.id !== ui.selectedBooking.id)
      ui.showToast('Đã xóa!', 'success')
      close()
    } else {
      ui.showToast(res.message || 'Lỗi khi xóa', 'error')
    }
  } catch (e: any) { ui.showToast(e.message, 'error') }
  finally { ui.loading.is = false }
}

async function handlePending() {
  if (!ui.selectedBooking) return
  const confirmed = await ui.showConfirm('Xác Nhận', 'Chuyển đơn này sang trạng thái Tạm Hoãn? Bàn sẽ được giải phóng khỏi lịch.')
  if (!confirmed) return
  
  ui.loading.is = true
  ui.loading.msg = 'ĐANG CẬP NHẬT...'
  haptic('medium')
  
  try {
    const o = ui.selectedBooking
    // Copy the original string back to parsedCustomer
    const updateData = JSON.parse(o.data || '{}')
    updateData.customer = updateData.customer || {}
    updateData.customer.tables = 'Tạm hoãn'
    updateData.customer.note = ((updateData.customer.note || '') + ' [TẠM HOÃN]').trim()
    
    const payload = {
      ...o,
      data: JSON.stringify(updateData),
      customerTable: 'Tạm hoãn'
    }

    const res = await appStore.saveOrder(payload)
    if (res.ok) {
      ui.showToast('Đã chuyển sang hàng chờ!', 'success')
      // Update local state without reloading everything
      o.parsedCustomer.tables = 'Tạm hoãn'
      o.parsedCustomer.note = updateData.customer.note
      o.customerTable = 'Tạm hoãn'
      o.data = payload.data
      close()
    } else {
      ui.showToast(res.message || 'Lỗi cập nhật', 'error')
    }
  } catch (e: any) {
    ui.showToast(e.message, 'error')
  } finally {
    ui.loading.is = false
  }
}

function handleViewBill() {
  if (!ui.selectedBooking) return
  const url = `${window.location.origin}${window.location.pathname}?id=${ui.selectedBooking.id}`
  if ((isIOS || isAndroid) && navigator.share) {
    navigator.share({
      title: 'Bill - ' + (ui.selectedBooking.parsedCustomer?.name || ''),
      url: url
    }).catch(() => ui.showAlert('Link Bill', url))
  } else {
    navigator.clipboard.writeText(url)
    ui.showAlert('Đã copy Link Bill', url)
  }
}

async function handleSyncCalendar() {
  if (!ui.selectedBooking) return
  haptic('medium')
  const res = await appStore.syncBookingCalendar(ui.selectedBooking.id)
  if (res && res.ok) {
    close()
  }
}
</script>

<template>
  <div v-if="ui.showBookingDetailModal && ui.selectedBooking" class="fixed inset-0 bg-blue-950/80 z-[1000] flex justify-center items-center p-4 backdrop-blur-md" @click.self="close">
    <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-6 md:p-8 max-w-md w-[95%] md:w-full flex flex-col relative overflow-hidden max-h-[90vh] overflow-y-auto custom-scrollbar border border-white/20 dark:border-slate-800">
      
      <!-- Header BG Decoration -->
      <div class="absolute top-0 left-0 right-0 h-24 bg-gradient-to-r from-blue-600 to-blue-900 rounded-t-3xl opacity-10 dark:opacity-20"></div>
      
      <!-- Header -->
      <div class="flex justify-between items-start mb-6 relative z-10">
        <div>
          <h3 class="text-2xl font-black text-blue-900 dark:text-slate-100 uppercase tracking-tighter leading-tight">{{ ui.selectedBooking.parsedCustomer?.name || 'KHÁCH HÀNG' }}</h3>
          <div class="text-sm font-bold text-slate-500 dark:text-slate-300 mt-1 flex items-center gap-2">
            <i class="fa-solid fa-phone text-xs"></i> {{ ui.selectedBooking.parsedCustomer?.phone || 'Chưa cung cấp' }}
          </div>
        </div>
        <button @click="close" class="w-10 h-10 bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-300 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/50 hover:text-rose-500 dark:hover:text-rose-400 transition-all flex items-center justify-center shrink-0 shadow-sm border border-slate-100 dark:border-slate-700">
          <i class="fa-solid fa-xmark text-xl"></i>
        </button>
      </div>

      <!-- Content -->
      <div class="space-y-4 relative z-10 mb-6">
        <!-- Date & Time -->
        <div class="bg-blue-50 dark:bg-blue-950/40 p-4 rounded-2xl flex items-center gap-4 border border-blue-100 dark:border-blue-900/50">
          <div class="w-12 h-12 bg-white dark:bg-slate-800 rounded-xl flex items-center justify-center shadow-sm text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/40 shrink-0">
            <i class="fa-solid fa-calendar-days text-xl"></i>
          </div>
          <div>
            <div class="text-[10px] font-bold text-blue-400 dark:text-blue-300 uppercase tracking-widest mb-0.5">Thời gian nhận bàn</div>
            <div class="font-black text-slate-800 dark:text-slate-100 text-lg">
              <span class="text-blue-600 dark:text-blue-400">{{ ui.selectedBooking.parsedCustomer?.time || '--:--' }}</span> • {{ ui.selectedBooking.parsedCustomer?.date || '--/--' }}
            </div>
          </div>
        </div>

        <!-- Info Grid -->
        <div class="grid grid-cols-2 gap-3">
          <div class="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-100 dark:border-slate-750">
            <div class="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-widest mb-1">Số lượng khách</div>
            <div class="font-black text-slate-800 dark:text-slate-100 flex items-center gap-2"><i class="fa-solid fa-users text-slate-400 dark:text-slate-500"></i> {{ ui.selectedBooking.parsedCustomer?.pax || '0' }} người</div>
          </div>
          <div class="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-100 dark:border-slate-750">
            <div class="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-widest mb-1">Khu / Bàn</div>
            <div class="font-black flex items-center gap-2" :class="ui.selectedBooking.parsedCustomer?.tables && !ui.selectedBooking.parsedCustomer.tables.toLowerCase().includes('chưa') && !ui.selectedBooking.parsedCustomer.tables.toLowerCase().includes('hoãn') ? 'text-blue-900 dark:text-blue-400' : 'text-orange-500 dark:text-amber-400'">
              <i class="fa-solid fa-chair text-slate-400 dark:text-slate-500"></i> {{ ui.selectedBooking.parsedCustomer?.tables || 'Chưa xếp' }}
            </div>
          </div>
        </div>

        <!-- Booking ID & Menu Sheet/Version -->
        <div class="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-100 dark:border-slate-750 space-y-1.5 text-xs text-slate-500 dark:text-slate-400 font-bold">
          <div class="flex justify-between">
            <span>Mã phiếu (ID):</span>
            <span class="text-slate-800 dark:text-slate-200 font-black truncate max-w-[200px]" :title="ui.selectedBooking.id">{{ ui.selectedBooking.id }}</span>
          </div>
          <div class="flex justify-between" v-if="ui.selectedBooking.activeMenuSheet">
            <span>Thực đơn (Version):</span>
            <span class="text-slate-800 dark:text-slate-200 font-black">{{ ui.selectedBooking.activeMenuSheet }}</span>
          </div>
        </div>

        <!-- Deposit Status -->
        <div class="p-3 rounded-2xl flex items-center justify-between border" :class="ui.selectedBooking.isDeposited ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-100 dark:border-emerald-800/60' : 'bg-rose-50 dark:bg-rose-950/40 border-rose-100 dark:border-rose-800/60'">
          <div class="flex items-center gap-2">
            <i class="fa-solid" :class="ui.selectedBooking.isDeposited ? 'fa-check-circle text-emerald-500 dark:text-emerald-400' : 'fa-hourglass-half text-rose-500 dark:text-rose-400'"></i>
            <span class="font-black text-sm" :class="ui.selectedBooking.isDeposited ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'">
              {{ ui.selectedBooking.isDeposited ? 'Đã thanh toán cọc' : 'Chưa đặt cọc (Đang giữ)' }}
            </span>
          </div>
          <span v-if="ui.selectedBooking.depositAmount" class="font-black text-xs text-slate-700 dark:text-slate-200 font-tabular">
            {{ formatVND(ui.selectedBooking.depositAmount) }}
          </span>
        </div>

        <!-- Menu Items Section -->
        <div class="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-750 space-y-2.5">
          <div class="flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-300 border-b border-slate-200/70 dark:border-slate-700 pb-1.5">
            <span class="flex items-center gap-1.5">
              <i class="fa-solid fa-utensils text-blue-600 dark:text-blue-400"></i>
              Thực đơn đã chọn ({{ (ui.selectedBooking.menuItems || []).length }} món)
            </span>
            <span v-if="ui.selectedBooking.totalAmount" class="text-blue-900 dark:text-blue-400 font-tabular font-black">
              Tổng: {{ formatVND(ui.selectedBooking.totalAmount) }}
            </span>
          </div>

          <div v-if="!ui.selectedBooking.menuItems || ui.selectedBooking.menuItems.length === 0" class="text-xs text-slate-400 dark:text-slate-500 italic py-2 text-center">
            Chưa đặt trước món (Khách gọi món trực tiếp tại nhà hàng)
          </div>

          <div v-else class="space-y-1.5 max-h-[180px] overflow-y-auto pr-1 custom-scrollbar">
            <div v-for="(item, idx) in ui.selectedBooking.menuItems" :key="idx" class="p-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 flex items-start justify-between gap-2 shadow-2xs">
              <div class="min-w-0 flex-1">
                <div class="font-black text-xs text-slate-800 dark:text-slate-100 uppercase leading-snug whitespace-normal break-words">
                  {{ item.name }}
                  <span class="text-blue-600 dark:text-blue-400 font-black text-[10px] ml-1 shrink-0 font-tabular">x{{ item.qty || item.quantity || 1 }}</span>
                </div>
                <div v-if="item.note" class="text-[10px] text-rose-600 dark:text-rose-400 font-semibold italic mt-0.5 leading-tight whitespace-pre-line">
                  {{ item.note }}
                </div>
              </div>
              <div class="text-xs font-black text-blue-900 dark:text-blue-300 shrink-0 font-tabular text-right">
                {{ formatVND((item.price || 0) * (item.qty || item.quantity || 1)) }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Action Buttons Hierarchy (Spec #23) -->
      <div class="flex flex-col gap-2.5 mt-auto relative z-10">
        <!-- Primary Action: Edit / Update (Min 48px height) -->
        <button @click="handleEdit" class="min-h-[48px] w-full bg-blue-900 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-blue-900/25 active:scale-95 transition-all flex justify-center items-center gap-2 cursor-pointer">
          <i class="fa-solid fa-pen-to-square text-sm"></i> Chỉnh sửa đơn / Đổi lịch
        </button>

        <!-- Secondary Actions Row (Min 48px height) -->
        <div class="grid grid-cols-2 gap-2.5">
          <button @click="handleViewBill" class="min-h-[48px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl font-black text-xs uppercase shadow-xs active:scale-95 transition-all flex justify-center items-center gap-2 cursor-pointer">
            <i class="fa-solid fa-receipt text-blue-600 dark:text-blue-400"></i> Xem Bill
          </button>
          <button @click="handlePending" class="min-h-[48px] bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 rounded-xl font-black text-xs uppercase shadow-xs active:scale-95 transition-all flex justify-center items-center gap-2 cursor-pointer">
            <i class="fa-solid fa-pause text-amber-600 dark:text-amber-400"></i> Tạm hoãn
          </button>
        </div>

        <button @click="handleSyncCalendar" class="min-h-[44px] w-full bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60 rounded-xl font-black text-xs uppercase tracking-wider shadow-xs active:scale-95 transition-all flex justify-center items-center gap-2 cursor-pointer">
          <i class="fa-solid fa-rotate text-indigo-600 dark:text-indigo-400"></i> Đồng bộ lịch bàn (Spreadsheet)
        </button>

        <!-- Destructive Action: Segregated with confirm barrier -->
        <div class="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-center">
          <button @click="handleDelete" class="min-h-[44px] px-4 text-rose-500 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl font-black text-xs uppercase tracking-wider transition-colors active:scale-95 flex items-center gap-1.5 cursor-pointer">
            <i class="fa-solid fa-trash-can text-xs"></i> Xóa phiếu đặt bàn
          </button>
        </div>
      </div>

    </div>
  </div>
</template>
