<script setup lang="ts">
import { ref, onMounted, computed, onUnmounted } from 'vue'
import { getOrderById } from '@/services/api'
import LuckyWheel from './LuckyWheel.vue'

const showLuckyWheel = ref(false)

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

// --- Countdown Logic ---
const countdownText = ref('')
let timer: any = null

function updateCountdown() {
  if (!order.value?.customer?.date || !order.value?.customer?.time) return
  
  const [d, m, y] = order.value.customer.date.split('/')
  const [hh, mm] = order.value.customer.time.split(':')
  if (!d || !m || !y || !hh || !mm) return

  const eventDate = new Date(Number(y), Number(m)-1, Number(d), Number(hh), Number(mm))
  const diff = eventDate.getTime() - Date.now()
  
  if (diff <= 0) {
    countdownText.value = 'Hân hạnh được phục vụ!'
    return
  }
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24)
  const mins = Math.floor((diff / 1000 / 60) % 60)
  
  if (days > 0) countdownText.value = `Còn ${days} ngày ${hours} giờ`
  else if (hours > 0) countdownText.value = `Còn ${hours} tiếng ${mins} phút`
  else countdownText.value = `Còn ${mins} phút nữa`
}

onMounted(async () => {
  if (!orderId.value) { error.value = 'Không tìm thấy mã đơn hàng'; loading.value = false; return }
  try {
    const res = await getOrderById(orderId.value)
    if (res.ok) { 
      order.value = res.data
      updateCountdown()
      timer = setInterval(updateCountdown, 60000)
    }
    else { error.value = res.message || 'Không tìm thấy đơn hàng' }
  } catch (e: any) { error.value = 'Lỗi kết nối: ' + e.message }
  finally { loading.value = false }
})

onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<template>
  <div class="min-h-screen bg-slate-50 flex items-start justify-center p-4 md:p-8">
    <!-- LOADING -->
    <div v-if="loading" class="flex flex-col items-center justify-center py-32">
      <div class="w-14 h-14 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin mb-6"></div>
      <p class="text-blue-500 font-bold text-sm uppercase tracking-widest animate-pulse">Đang chuẩn bị Portal...</p>
    </div>

    <!-- ERROR -->
    <div v-else-if="error" class="bg-white rounded-3xl shadow-sm border border-slate-100 p-10 max-w-md w-full text-center">
      <div class="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center text-4xl mx-auto mb-4">
        <i class="fa-solid fa-circle-exclamation"></i>
      </div>
      <h2 class="text-xl font-black text-slate-800 uppercase mb-3">Không tìm thấy</h2>
      <p class="text-sm text-slate-500 mb-6">{{ error }}</p>
    </div>

    <!-- PUBLIC PORTAL -->
    <div v-else-if="order" class="w-full max-w-[400px]">
      
      <!-- Greeting & Countdown -->
      <div class="text-center mb-5 pt-2">
        <div class="inline-flex justify-center mb-4 bg-white p-3 rounded-full border border-slate-100 shadow-[0_4px_15px_rgba(0,0,0,0.05)]">
          <img src="/favicon.svg" class="h-12 w-12" alt="Logo">
        </div>
        <h1 class="text-[22px] font-black text-slate-800 mb-1 tracking-tight">Xin chào, {{ order.customer?.name }}!</h1>
        <p class="text-slate-500 text-[11px] mb-4">Cảm ơn bạn đã chọn King's Grill cho bữa tiệc của mình.</p>
        
        <div v-if="countdownText" class="inline-block bg-amber-50 border border-amber-100 px-5 py-2.5 rounded-[20px]">
          <div class="text-[9px] text-amber-600 font-black uppercase tracking-widest mb-0.5">Thời gian đếm ngược</div>
          <div class="text-lg font-black text-amber-500">{{ countdownText }}</div>
        </div>
      </div>

      <!-- Minigame Banner -->
      <div class="mb-5 bg-white border border-rose-100 rounded-3xl shadow-[0_8px_30px_rgba(225,29,72,0.08)] cursor-pointer active:scale-95 transition-transform overflow-hidden" @click="showLuckyWheel = true">
        <div class="px-5 py-4 flex items-center justify-between">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center text-xl animate-bounce">
              <i class="fa-solid fa-gift"></i>
            </div>
            <div>
              <h3 class="text-slate-800 font-black uppercase tracking-widest text-[13px] mb-0.5">
                Quà tặng chờ bạn!
              </h3>
              <p class="text-slate-500 text-[10px] font-bold">Chơi Vòng Quay May Mắn ngay</p>
            </div>
          </div>
          <div class="w-8 h-8 bg-slate-50 rounded-full flex items-center justify-center text-slate-400">
            <i class="fa-solid fa-chevron-right text-xs"></i>
          </div>
        </div>
      </div>

      <!-- Digital Loyalty Card -->
      <div class="mb-5 relative rounded-3xl overflow-hidden bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 shadow-2xl p-5">
        <!-- Shine effect -->
        <div class="absolute top-0 right-0 -mr-12 -mt-12 w-24 h-24 bg-white/10 blur-2xl rounded-full"></div>
        <div class="absolute bottom-0 left-0 -ml-12 -mb-12 w-32 h-32 bg-blue-500/20 blur-3xl rounded-full"></div>
        
        <div class="relative z-10 flex justify-between items-start mb-4">
          <div>
            <div class="text-[9px] text-amber-400 font-black uppercase tracking-widest mb-0.5">Thẻ Thành Viên</div>
            <div class="text-lg font-black text-white" style="font-family: 'Be Vietnam Pro', sans-serif;">KING'S GRILL VIP</div>
          </div>
          <img src="/favicon.svg" class="h-8 w-8 opacity-80" alt="Logo">
        </div>

        <div class="relative z-10 bg-slate-950/50 rounded-2xl p-3 flex items-center justify-between border border-slate-700/50 backdrop-blur-md">
          <div>
            <div class="text-[10px] font-bold text-slate-400 mb-0.5">Khách Hàng</div>
            <div class="text-sm font-black text-white uppercase tracking-wider">{{ order.customer?.name || 'KHÁCH HÀNG' }}</div>
            <div class="text-[9px] font-bold text-slate-500 mt-1.5">Hạng: <span class="text-amber-400">VIP MEMBER</span></div>
          </div>
          <div class="bg-white p-1 rounded-xl shrink-0">
            <img :src="'https://quickchart.io/qr?text=' + order.id + '&size=60&margin=0'" alt="QR" class="w-14 h-14 rounded-lg">
          </div>
        </div>
        
        <div class="relative z-10 mt-3 text-center">
          <p class="text-[8px] font-black uppercase tracking-widest text-slate-500">Đưa mã QR này cho nhân viên để tích điểm</p>
        </div>
      </div>
      <!-- Quick Actions -->
      <div class="grid grid-cols-2 gap-3 mb-5">
        <a href="https://maps.app.goo.gl/search/kings+grill" target="_blank" class="bg-white border border-slate-100 hover:bg-slate-50 text-slate-700 rounded-3xl py-4 flex flex-col items-center justify-center gap-1.5 transition-all active:scale-95 shadow-[0_4px_15px_rgba(0,0,0,0.03)]">
          <div class="w-10 h-10 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-1">
            <i class="fa-solid fa-location-dot text-lg"></i>
          </div>
          <span class="text-[10px] font-black uppercase tracking-wider">Chỉ đường</span>
        </a>
        <a href="#" @click.prevent="() => {}" class="bg-white border border-slate-100 hover:bg-slate-50 text-slate-700 rounded-3xl py-4 flex flex-col items-center justify-center gap-1.5 transition-all active:scale-95 shadow-[0_4px_15px_rgba(0,0,0,0.03)]">
          <div class="w-10 h-10 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mb-1">
            <i class="fa-solid fa-book-open text-lg"></i>
          </div>
          <span class="text-[10px] font-black uppercase tracking-wider">Xem Menu</span>
        </a>
      </div>

      <div class="bg-white rounded-[2rem] shadow-sm border border-slate-100 p-6 md:p-8 relative overflow-hidden">
        <!-- HEADER -->
        <div class="text-center mb-6">
          <h2 class="font-bold tracking-[0.2em] text-slate-400 uppercase mt-1 text-xs" style="font-family: 'Freeman', sans-serif;">THÔNG TIN ĐẶT CHỖ</h2>
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
        <p class="text-slate-500 font-bold text-xs mb-1">&copy; 2024 King's Grill Manager</p>
        <p class="text-slate-600 font-bold text-[10px] uppercase tracking-widest">Hệ thống công nghệ nhà hàng</p>
      </div>
    </div>
    
    <LuckyWheel v-if="showLuckyWheel" :orderId="order.id" :customerName="order.customer?.name" @close="showLuckyWheel = false" />
  </div>
</template>
