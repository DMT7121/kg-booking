<script setup lang="ts">
import { useUIStore } from '@/stores/useUIStore'
import { useForm } from '@/composables/useForm'
import { useAppStore } from '@/stores/useAppStore'
import * as api from '@/services/api'
import { haptic } from '@/composables/useGestures'

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
  
  const pass = await ui.showPrompt('Bảo mật', 'Nhập Password Quản Trị để xóa đơn:')
  if (pass === null) return

  ui.loading.is = true
  ui.loading.msg = 'ĐANG XÓA...'
  haptic('medium')
  try {
    const res = await api.deleteOrder(ui.selectedBooking.id, pass)
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

    const res = await api.saveOrder(payload)
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
  if (navigator.share) {
    navigator.share({
      title: 'Bill - ' + (ui.selectedBooking.parsedCustomer?.name || ''),
      url: url
    }).catch(() => ui.showAlert('Link Bill', url))
  } else {
    navigator.clipboard.writeText(url)
    ui.showAlert('Đã copy Link Bill', url)
  }
}
</script>

<template>
  <div v-if="ui.showBookingDetailModal && ui.selectedBooking" class="fixed inset-0 bg-[#0D1658]/80 z-[12000] flex justify-center items-center p-4 backdrop-blur-md" @click.self="close">
    <div class="bg-white rounded-3xl shadow-2xl p-6 md:p-8 max-w-md w-[95%] md:w-full flex flex-col relative overflow-hidden border border-white/20">
      
      <!-- Header BG Decoration -->
      <div class="absolute top-0 left-0 right-0 h-24 bg-gradient-to-r from-blue-600 to-[#1A237E] rounded-t-3xl opacity-10"></div>
      
      <!-- Header -->
      <div class="flex justify-between items-start mb-6 relative z-10">
        <div>
          <h3 class="text-2xl font-black text-[#1A237E] uppercase tracking-tighter leading-tight">{{ ui.selectedBooking.parsedCustomer?.name || 'KHÁCH HÀNG' }}</h3>
          <div class="text-sm font-bold text-slate-500 mt-1 flex items-center gap-2">
            <i class="fa-solid fa-phone text-xs"></i> {{ ui.selectedBooking.parsedCustomer?.phone || 'Chưa cung cấp' }}
          </div>
        </div>
        <button @click="close" class="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl hover:bg-red-50 hover:text-red-500 transition-all flex items-center justify-center shrink-0 shadow-sm border border-slate-100">
          <i class="fa-solid fa-xmark text-xl"></i>
        </button>
      </div>

      <!-- Content -->
      <div class="space-y-4 relative z-10 mb-6">
        <!-- Date & Time -->
        <div class="bg-blue-50 p-4 rounded-2xl flex items-center gap-4 border border-blue-100">
          <div class="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm text-blue-600 border border-blue-100 shrink-0">
            <i class="fa-solid fa-calendar-days text-xl"></i>
          </div>
          <div>
            <div class="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-0.5">Thời gian nhận bàn</div>
            <div class="font-black text-slate-800 text-lg">
              <span class="text-blue-600">{{ ui.selectedBooking.parsedCustomer?.time || '--:--' }}</span> • {{ ui.selectedBooking.parsedCustomer?.date || '--/--' }}
            </div>
          </div>
        </div>

        <!-- Info Grid -->
        <div class="grid grid-cols-2 gap-3">
          <div class="bg-slate-50 p-3 rounded-2xl border border-slate-100">
            <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Số lượng khách</div>
            <div class="font-black text-slate-800 flex items-center gap-2"><i class="fa-solid fa-users text-slate-300"></i> {{ ui.selectedBooking.parsedCustomer?.pax || '0' }} người</div>
          </div>
          <div class="bg-slate-50 p-3 rounded-2xl border border-slate-100">
            <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Khu / Bàn</div>
            <div class="font-black flex items-center gap-2" :class="ui.selectedBooking.parsedCustomer?.tables && !ui.selectedBooking.parsedCustomer.tables.toLowerCase().includes('chưa') && !ui.selectedBooking.parsedCustomer.tables.toLowerCase().includes('hoãn') ? 'text-[#1A237E]' : 'text-orange-500'">
              <i class="fa-solid fa-chair text-slate-300"></i> {{ ui.selectedBooking.parsedCustomer?.tables || 'Chưa xếp' }}
            </div>
          </div>
        </div>

        <!-- Deposit Status -->
        <div class="p-3 rounded-2xl flex items-center justify-between border" :class="ui.selectedBooking.isDeposited ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'">
          <div class="flex items-center gap-2">
            <i class="fa-solid" :class="ui.selectedBooking.isDeposited ? 'fa-check-circle text-emerald-500' : 'fa-hourglass-half text-rose-500'"></i>
            <span class="font-black text-sm" :class="ui.selectedBooking.isDeposited ? 'text-emerald-700' : 'text-rose-700'">
              {{ ui.selectedBooking.isDeposited ? 'Đã thanh toán cọc' : 'Chưa đặt cọc (Đang giữ)' }}
            </span>
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="grid grid-cols-2 gap-3 mt-auto relative z-10">
        <button @click="handleEdit" class="py-3.5 bg-[#1A237E] text-white rounded-xl font-black text-xs uppercase shadow-lg shadow-blue-900/20 active:scale-95 transition-all flex justify-center items-center gap-2">
          <i class="fa-solid fa-pen-to-square"></i> Sửa / Đổi lịch
        </button>
        <button @click="handlePending" class="py-3.5 bg-amber-100 text-amber-700 border border-amber-200 rounded-xl font-black text-xs uppercase shadow-sm hover:bg-amber-200 active:scale-95 transition-all flex justify-center items-center gap-2">
          <i class="fa-solid fa-pause"></i> Tạm hoãn
        </button>
        <button @click="handleViewBill" class="py-3.5 bg-slate-100 text-slate-600 border border-slate-200 rounded-xl font-black text-xs uppercase shadow-sm hover:bg-slate-200 active:scale-95 transition-all flex justify-center items-center gap-2">
          <i class="fa-solid fa-receipt"></i> Xem Bill
        </button>
        <button @click="handleDelete" class="py-3.5 bg-red-50 text-red-600 border border-red-100 rounded-xl font-black text-xs uppercase shadow-sm hover:bg-red-100 active:scale-95 transition-all flex justify-center items-center gap-2">
          <i class="fa-solid fa-trash-can"></i> Xóa phiếu
        </button>
      </div>

    </div>
  </div>
</template>
