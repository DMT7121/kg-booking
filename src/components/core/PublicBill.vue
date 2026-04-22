<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { getOrderById } from '@/services/api'

const order = ref<any>(null)
const loading = ref(true)
const error = ref('')

const orderId = computed(() => {
  const hash = window.location.hash
  const match = hash.match(/#\/bill\/(.+)/)
  return match ? match[1] : null
})

const formatVND = (v: number): string =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(v || 0)

const depositTransferContent = computed(() => {
  if (!order.value) return ''
  const c = order.value.customer || {}
  const n = (c.name || 'KH').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toUpperCase().substring(0, 20).replace(/[^A-Z0-9 ]/g, '').trim()
  const p = c.phone ? c.phone.replace(/\D/g, '').slice(-4) : ''
  const idSuf = (order.value.id || '').replace(/-/g, '').substring(0, 4).toUpperCase()
  return `${n} DAT COC ${p} ${idSuf}`.trim()
})

onMounted(async () => {
  if (!orderId.value) { error.value = 'Không tìm thấy mã đơn hàng'; loading.value = false; return }
  try {
    const res = await getOrderById(orderId.value)
    if (res.ok) { order.value = res.data }
    else { error.value = res.message || 'Không tìm thấy đơn hàng' }
  } catch (e: any) { error.value = 'Lỗi kết nối: ' + e.message }
  finally { loading.value = false }
})
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-100 flex items-start justify-center p-4 md:p-8">
    <!-- LOADING -->
    <div v-if="loading" class="flex flex-col items-center justify-center py-32">
      <div class="w-14 h-14 border-4 border-gray-100 border-t-blue-600 rounded-full animate-spin mb-6"></div>
      <p class="text-slate-500 font-bold text-sm uppercase tracking-widest">Đang tải phiếu đặt...</p>
    </div>

    <!-- ERROR -->
    <div v-else-if="error" class="bg-white rounded-3xl shadow-2xl p-10 max-w-md w-full text-center border-t-8 border-red-500">
      <i class="fa-solid fa-circle-exclamation text-6xl text-red-400 mb-4"></i>
      <h2 class="text-xl font-black text-slate-800 uppercase mb-3">Không tìm thấy</h2>
      <p class="text-sm text-gray-500 mb-6">{{ error }}</p>
      <a href="/" class="inline-block px-6 py-3 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-widest">← Trang chủ</a>
    </div>

    <!-- PUBLIC BILL -->
    <div v-else-if="order" class="w-full max-w-[600px]">
      <div class="bill-preview-container p-8 md:p-10 rounded-3xl shadow-2xl border border-white/60">
        <!-- HEADER -->
        <div class="text-center mb-6">
          <div class="flex justify-center mb-2"><img src="/favicon.svg" class="h-20 w-auto" alt="Logo"></div>
          <h1 class="font-black tracking-widest text-slate-900 uppercase text-2xl" style="font-family: 'Freeman', sans-serif;">KING'S GRILL</h1>
          <h2 class="font-bold tracking-[0.3em] text-slate-500 uppercase mt-1 text-sm" style="font-family: 'Freeman', sans-serif;">PHIẾU ĐẶT CHỖ</h2>
          <div class="w-32 h-1 mx-auto mt-3 rounded-full bg-amber-500"></div>
        </div>

        <!-- INFO CARD -->
        <div class="relative mb-6">
          <div class="info-card">
            <div class="info-row"><span class="info-label">Khách hàng</span><span class="info-value font-black text-lg">{{ order.customer?.name || '---' }}</span></div>
            <div class="info-row"><span class="info-label">SĐT/Zalo</span><span class="info-value highlight">{{ order.customer?.phone || '---' }}</span></div>
            <div class="info-row"><span class="info-label">Thời gian</span><span class="info-value">{{ order.customer?.time || '--:--' }} — {{ order.customer?.date || '' }}</span></div>
            <div class="info-row"><span class="info-label">Số khách</span><span class="info-value">{{ order.customer?.pax || '0' }} người</span></div>
            <div class="info-row"><span class="info-label">Bàn</span><span class="info-value highlight">{{ order.customer?.tables || '---' }}</span></div>
            <div v-if="order.customer?.type" class="info-row"><span class="info-label">Loại tiệc</span><span class="info-value">{{ order.customer?.type }}</span></div>
            <div v-if="order.customer?.note" class="info-row"><span class="info-label">Ghi chú</span><span class="info-value text-red-600 font-bold italic">{{ order.customer?.note }}</span></div>
          </div>

          <!-- STAMP -->
          <div class="stamp-overlay">
            <div class="rubber-stamp" :class="order.isDeposited ? 'rubber-stamp-paid' : 'rubber-stamp-pending'">
              <span class="rubber-stamp-text">{{ order.isDeposited ? 'Đã Nhận Cọc' : 'Chờ Cọc' }}</span>
              <span class="rubber-stamp-time">{{ order.isDeposited ? (order.deposit?.time || '✓') : 'PENDING' }}</span>
            </div>
          </div>
        </div>

        <!-- MENU TABLE -->
        <table v-if="order.items?.length" class="bill-table">
          <thead><tr><th class="w-8 text-center">#</th><th>Tên món</th><th class="text-center w-14">SL</th><th class="text-right w-24">Đơn giá</th><th class="text-right w-28">Thành tiền</th></tr></thead>
          <tbody>
            <tr v-for="(item, i) in order.items" :key="i">
              <td class="text-center font-bold text-slate-400">{{ i + 1 }}</td>
              <td>
                <div class="font-bold text-[14px]">{{ item.name }}</div>
                <div v-if="item.note || item.notes" class="text-[11px] text-red-600 font-semibold mt-0.5 whitespace-pre-line italic">{{ item.note || item.notes }}</div>
              </td>
              <td class="text-center font-black text-base">{{ item.qty }}</td>
              <td class="text-right font-bold text-slate-600 text-[13px]">{{ formatVND(item.price || 0) }}</td>
              <td class="text-right font-black text-blue-700 text-[14px]">{{ formatVND(Number(item.price || 0) * Number(item.qty || 1)) }}</td>
            </tr>
          </tbody>
        </table>

        <!-- TOTALS -->
        <div class="border-t-4 border-slate-900 pt-5 space-y-3 mb-8">
          <div class="flex justify-between items-center pt-3">
            <span class="text-xl font-black text-slate-900 uppercase tracking-tighter">TỔNG CỘNG</span>
            <span class="text-3xl font-black text-amber-500">{{ formatVND(order.totalAmount) }}</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-base font-bold uppercase" :class="order.isDeposited ? 'text-emerald-600' : 'text-red-600'">
              {{ order.isDeposited ? '✓ Đã đặt cọc' : '⏳ Yêu cầu đặt cọc' }}
            </span>
            <span class="text-xl font-black" :class="order.isDeposited ? 'text-emerald-600' : 'text-red-600'">{{ formatVND(order.depositAmount) }}</span>
          </div>
        </div>

        <!-- QR TRANSFER (only if not paid) -->
        <div v-if="!order.isDeposited && order.depositAmount > 0" class="bg-slate-50 border border-slate-200 rounded-2xl p-5 mb-6">
          <h3 class="font-black text-xs text-slate-700 uppercase tracking-widest mb-4 text-center">CHUYỂN KHOẢN ĐẶT CỌC</h3>
          <div class="flex flex-col items-center gap-4">
            <div class="bg-white p-3 rounded-2xl shadow-lg border border-slate-100">
              <img :src="`https://img.vietqr.io/image/970457-104029411095-compact.png?amount=${order.depositAmount}&addInfo=${encodeURIComponent(depositTransferContent)}&accountName=${encodeURIComponent('TRAN LE DUY')}`"
                class="w-48 h-48 object-contain rounded-xl" alt="QR Code" loading="lazy">
            </div>
            <div class="bg-yellow-50 border border-yellow-300 p-3 rounded-xl w-full text-center">
              <span class="text-[10px] font-bold text-red-500 uppercase block mb-1"><i class="fa-solid fa-triangle-exclamation mr-1"></i> Nội dung CK</span>
              <span class="font-black text-indigo-700 text-sm tracking-wider uppercase">{{ depositTransferContent }}</span>
            </div>
          </div>
        </div>

        <!-- FOOTER -->
        <div class="border-t-2 border-slate-100 pt-5 text-center space-y-2">
          <p class="text-xs text-slate-400 font-bold">Nhân viên: <span class="text-slate-600 font-black">{{ order.staff?.name || 'Admin' }}</span></p>
          <p class="text-[10px] text-slate-300 font-mono">King's Grill Manager AI v2.0 | {{ order.timestamp ? new Date(order.timestamp).toLocaleString('vi-VN') : '' }}</p>
        </div>
      </div>

      <!-- BACK BUTTON -->
      <div class="text-center mt-6">
        <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-2">Powered by KG-BOOKING</p>
      </div>
    </div>
  </div>
</template>
