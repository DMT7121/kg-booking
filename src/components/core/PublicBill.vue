<script setup lang="ts">
import { ref, onMounted, computed, onUnmounted } from 'vue'
import { getOrderById, getConfig } from '@/services/api'
import LuckyWheel from './LuckyWheel.vue'
import { stripAccents } from '@/utils'
import { ALCOHOL_KEYS } from '@/utils/constants'
import html2canvas from 'html2canvas'

const showLuckyWheel = ref(false)
const showPortalMinigames = ref(localStorage.getItem('showPortalMinigames') === 'true')

const order = ref<any>(null)
const loading = ref(true)
const error = ref('')
const activeBank = ref<any>(null)
const downloading = ref(false)

async function downloadBillImage() {
  const el = document.getElementById('bill-render')
  if (!el) return
  downloading.value = true
  try {
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
    
    // Inline images if any to avoid CORS taint (like favicon.svg)
    const imgs = Array.from(el.querySelectorAll('img'))
    await Promise.all(imgs.map(async (img) => {
      if (!img.src || img.src.startsWith('data:')) return
      try {
        const r = await fetch(img.src)
        const blob = await r.blob()
        const base64 = await new Promise<string>((res) => {
          const reader = new FileReader()
          reader.onloadend = () => res(reader.result as string)
          reader.readAsDataURL(blob)
        })
        img.src = base64
      } catch (e) {
        // Silently skip image inline if CORS blocked
      }
    }))

    const originalStyle = el.getAttribute('style') || ''
    el.style.width = '600px'
    el.style.maxWidth = 'none'
    await new Promise(r => setTimeout(r, 100))

    const canvas = await html2canvas(el, {
      scale: 3,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      ignoreElements: (element: Element) => element.classList.contains('no-print')
    })
    
    el.setAttribute('style', originalStyle)
    
    const dataUrl = canvas.toDataURL('image/png')
    const link = document.createElement('a')
    const customerName = order.value?.customer?.name || 'Phieu_Dat_Ban'
    const fileName = `KingsGrill_PhieuDat_${stripAccents(customerName).replace(/\s+/g, '_')}.png`
    link.download = fileName
    link.href = dataUrl
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  } catch (err: any) {
    console.error('Failed to download bill image:', err)
    alert('Lỗi tải phiếu: ' + err.message)
  } finally {
    downloading.value = false
  }
}

const orderId = computed(() => {
  const hash = window.location.hash
  const match = hash.match(/#\/bill\/(.+)/)
  return match ? match[1] : null
})

const formatVND = (v: number): string =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(v || 0)

const formatDepositTime = (timeStr?: string): string => {
  if (!timeStr) return '✓'
  try {
    const parts = timeStr.split(/[\s,]+/)
    let datePart = parts.find(p => p.includes('/'))
    let timePart = parts.find(p => p.includes(':'))
    if (datePart && timePart) {
      timePart = timePart.split(':').slice(0, 2).join(':')
      return `${datePart} ${timePart}`
    }
    return timeStr
  } catch (e) {
    return timeStr
  }
}

const depositTransferContent = computed(() => {
  if (!order.value) return ''
  const c = order.value.customer || {}
  let n = (c.name || 'KH').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toUpperCase().replace(/[^A-Z0-9]/g, '').trim()
  n = n.substring(0, 10)
  const p = c.phone ? c.phone.replace(/\D/g, '').slice(-4) : ''
  const idSuf = (order.value.id || '').replace(/-/g, '').substring(0, 4).toUpperCase()
  return `KG ${n} ${p} ${idSuf}`.trim()
})

const calculatedTotals = computed(() => {
  if (!order.value) return { sub: 0, vat8: 0, vat10: 0, final: 0 }
  const items = order.value.items || []
  let sub = 0
  items.forEach((i: any) => { sub += (i.price || 0) * (i.qty || 0) })
  
  let vat8 = 0
  let vat10 = 0
  const final = order.value.totalAmount || sub
  if (final > sub + 10) {
    items.forEach((i: any) => {
      const isAlc = ALCOHOL_KEYS.some(k => stripAccents(i.name || '').toLowerCase().includes(k))
      const itemTax = (i.price || 0) * (i.qty || 0) * (isAlc ? 0.1 : 0.08)
      if (isAlc) vat10 += itemTax
      else vat8 += itemTax
    })
  }
  
  return { sub, vat8, vat10, final }
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
  // Load remote config to get active bank details (dynamic QR)
  try {
    const configRes = await getConfig()
    if (configRes.ok && configRes.data) {
      const cfg = configRes.data
      const defaultBankId = String(cfg.default_bank_account_id || '')
      let banks = []
      if (typeof cfg.banks === 'string') {
        try { banks = JSON.parse(cfg.banks) } catch(e) {}
      } else if (Array.isArray(cfg.banks)) {
        banks = cfg.banks
      }
      
      const current = banks.find((b: any) => String(b.bankId) === defaultBankId) || banks[0]
      if (current) {
        activeBank.value = current
      }
      if (cfg.showPortalMinigames !== undefined) {
        showPortalMinigames.value = String(cfg.showPortalMinigames) === 'true'
        localStorage.setItem('showPortalMinigames', String(showPortalMinigames.value))
      }
    }
  } catch (e) {
    console.warn('[PublicBill] Failed to fetch bank config:', e)
  }
  
  // Dynamic fallback to user's preferred UOB account if config is empty or fails
  if (!activeBank.value) {
    activeBank.value = {
      bankId: '970458',
      name: 'UOB',
      number: '1043862117',
      owner: 'TRAN LE DUY',
      template: 'compact'
    }
  }

  // 1. Try to load data from query parameter (for fast screenshot / no deadlock)
  const hash = window.location.hash;
  const dataMatch = hash.match(/[?&]data=([^&]+)/);
  if (dataMatch) {
    try {
      const base64 = dataMatch[1].replace(/-/g, '+').replace(/_/g, '/');
      const decoded = decodeURIComponent(escape(window.atob(base64)));
      const parsed = JSON.parse(decoded);
      
      order.value = {
        id: parsed.id,
        timestamp: parsed.timestamp || new Date().toISOString(),
        customer: parsed.customer,
        totalAmount: parsed.total,
        depositAmount: parsed.deposit?.amount || 0,
        isDeposited: parsed.deposit?.isPaid || false,
        transferImage: parsed.deposit?.image || '',
        billUrl: parsed.billUrl || '',
        items: parsed.items || [],
        staff: parsed.staff || { name: 'Hệ thống' }
      };
      
      updateCountdown();
      loading.value = false;
      return;
    } catch (e) {
      console.warn('[PublicBill] Failed to parse URL data:', e);
    }
  }

  // 2. Fallback to normal GAS fetch
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
  <div class="min-h-screen bg-slate-100 flex items-center justify-center font-sans text-slate-800">
    <div class="w-full max-w-[480px] h-screen min-h-[100dvh] md:h-[95vh] md:min-h-[auto] md:rounded-[2rem] md:shadow-2xl flex flex-col relative overflow-y-auto bg-slate-50 border border-slate-200 custom-scrollbar p-4 md:p-6 pb-8">
    
    <!-- LOADING -->
    <div v-if="loading" class="flex flex-col items-center justify-center py-32 flex-1">
      <div class="w-14 h-14 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin mb-6"></div>
      <p class="text-blue-500 font-bold text-sm uppercase tracking-widest animate-pulse">Đang chuẩn bị Portal...</p>
    </div>

    <!-- ERROR -->
    <div v-else-if="error" class="bg-white rounded-3xl shadow-sm border border-slate-100 p-10 w-full text-center m-auto">
      <div class="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center text-4xl mx-auto mb-4">
        <i class="fa-solid fa-circle-exclamation"></i>
      </div>
      <h2 class="text-xl font-black text-slate-800 uppercase mb-3">Không tìm thấy</h2>
      <p class="text-sm text-slate-500 mb-6">{{ error }}</p>
    </div>

    <!-- PUBLIC PORTAL -->
    <div v-else-if="order" class="w-full flex flex-col shrink-0">
      
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
      <div v-if="showPortalMinigames" class="mb-5 bg-white border border-rose-100 rounded-3xl shadow-[0_8px_30px_rgba(225,29,72,0.08)] cursor-pointer active:scale-95 transition-transform overflow-hidden" @click="showLuckyWheel = true">
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
      <div v-if="showPortalMinigames" class="mb-5 relative rounded-3xl overflow-hidden bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 shadow-2xl p-5">
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
        <a href="https://www.google.com/maps/place/King%E2%80%99s+Grill/@10.97728,106.6661053,15z/data=!4m6!3m5!1s0x3174d12ffdb33b65:0x25ca14f40f0af9f!8m2!3d10.9760826!4d106.6646541!16s%2Fg%2F11hb8xpt7n?entry=ttu&g_ep=EgoyMDI2MDYyOS4wIKXMDSoASAFQAw%3D%3D" target="_blank" class="bg-white border border-slate-100 hover:bg-slate-50 text-slate-700 rounded-3xl py-4 flex flex-col items-center justify-center gap-1.5 transition-all active:scale-95 shadow-[0_4px_15px_rgba(0,0,0,0.03)]">
          <div class="w-10 h-10 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-1">
            <i class="fa-solid fa-location-dot text-lg"></i>
          </div>
          <span class="text-[10px] font-black uppercase tracking-wider">Chỉ đường</span>
        </a>
        <a href="https://photos.app.goo.gl/PCwtnLcN2AhvzFLz8" target="_blank" class="bg-white border border-slate-100 hover:bg-slate-50 text-slate-700 rounded-3xl py-4 flex flex-col items-center justify-center gap-1.5 transition-all active:scale-95 shadow-[0_4px_15px_rgba(0,0,0,0.03)]">
          <div class="w-10 h-10 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mb-1">
            <i class="fa-solid fa-book-open text-lg"></i>
          </div>
          <span class="text-[10px] font-black uppercase tracking-wider">Xem Menu</span>
        </a>
      </div>
      
      <!-- Download Button -->
      <div class="mb-5">
        <button @click="downloadBillImage" :disabled="downloading" class="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-3xl py-4 px-6 flex items-center justify-center gap-3 transition-all active:scale-[0.98] shadow-[0_8px_25px_rgba(37,99,235,0.2)] disabled:opacity-50 disabled:pointer-events-none">
          <template v-if="downloading">
            <div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            <span class="text-xs font-black uppercase tracking-widest">Đang tải phiếu đặt...</span>
          </template>
          <template v-else>
            <i class="fa-solid fa-cloud-arrow-down text-lg"></i>
            <span class="text-xs font-black uppercase tracking-widest">Tải phiếu đặt (Ảnh)</span>
          </template>
        </button>
      </div>

      <!-- TICKET / RECEIPT UI -->
      <div id="bill-render" class="relative bg-white shadow-sm border border-slate-200 mt-2 mb-6" style="border-radius: 16px; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.02));">
        
        <!-- Serrated top/bottom (Optional subtle CSS pattern) -->
        <div class="absolute -top-1.5 left-2 right-2 h-3 bg-slate-50" style="mask-image: radial-gradient(circle at 6px 0px, transparent 6px, black 6.5px); mask-size: 12px 12px; mask-repeat: repeat-x;"></div>
        
        <div class="p-6 md:p-7 relative overflow-hidden">
          <!-- HEADER -->
          <div class="text-center mb-6 mt-0">
            <img src="/favicon.svg" class="h-16 w-auto mx-auto mb-2 opacity-90 object-contain" alt="Logo">
            <h1 class="font-black tracking-[0.1em] text-slate-800 uppercase text-lg mb-1" style="font-family: 'Be Vietnam Pro', sans-serif;">KING'S GRILL</h1>
            <p class="text-slate-500 text-[9px] font-semibold mb-2">ĐC: Số 34, Đường Hoàng Văn Thụ, Phường Thủ Dầu Một, Thành phố Hồ Chí Minh</p>
            <h2 class="font-bold tracking-[0.2em] text-slate-400 uppercase text-[10px]" style="font-family: 'Inter', sans-serif;">PHIẾU ĐẶT BÀN</h2>
            <div class="text-[9px] font-mono text-slate-300 mt-1">ID: #{{ order.id?.split('-')[0].toUpperCase() }}</div>
          </div>

          <!-- INFO CARD -->
          <div class="relative mb-6">
            <div class="space-y-2 relative z-10">
              <div class="flex justify-between items-baseline border-b border-dashed border-slate-200 pb-2">
                <span class="text-xs font-bold text-slate-500">Khách hàng</span>
                <span class="font-black text-slate-800 text-sm">{{ order.customer?.name || '---' }}</span>
              </div>
              <div class="flex justify-between items-baseline border-b border-dashed border-slate-200 pb-2">
                <span class="text-xs font-bold text-slate-500">SĐT/Zalo</span>
                <span class="font-black text-blue-600 text-sm tracking-wider">{{ order.customer?.phone || '---' }}</span>
              </div>
              <div class="flex justify-between items-baseline border-b border-dashed border-slate-200 pb-2">
                <span class="text-xs font-bold text-slate-500">Thời gian</span>
                <span class="font-black text-slate-800 text-sm">{{ order.customer?.time || '--:--' }} &bull; {{ order.customer?.date || '' }}</span>
              </div>
              <div class="flex justify-between items-baseline border-b border-dashed border-slate-200 pb-2">
                <span class="text-xs font-bold text-slate-500">Số khách</span>
                <span class="font-black text-slate-800 text-sm">{{ order.customer?.pax || '0' }} người</span>
              </div>
              <div class="flex justify-between items-baseline border-b border-dashed border-slate-200 pb-2">
                <span class="text-xs font-bold text-slate-500">Khu vực/Bàn</span>
                <span class="font-black text-amber-600 text-sm">{{ order.customer?.tables || 'Chưa xếp' }}</span>
              </div>
              <div v-if="order.customer?.type" class="flex justify-between items-baseline border-b border-dashed border-slate-200 pb-2">
                <span class="text-xs font-bold text-slate-500">Loại tiệc</span>
                <span class="font-bold text-slate-800 text-sm">{{ order.customer?.type }}</span>
              </div>
              <div v-if="order.customer?.note" class="pt-2">
                <span class="text-xs font-bold text-slate-500 block mb-1">Ghi chú:</span>
                <span class="font-bold text-rose-600 text-xs italic">{{ order.customer?.note }}</span>
              </div>
            </div>

            <!-- STAMP -->
            <div class="absolute bottom-1 left-[48%] -translate-x-[50%] pointer-events-none origin-center z-0" style="transform: scale(0.55) rotate(-5deg);">
              <div class="relative w-[220px] flex flex-col items-center justify-center">
                <img :src="order.isDeposited ? '/images/stamps/paid.png' : '/images/stamps/pending.png'" class="w-full object-contain filter drop-shadow-md" alt="Stamp" />
                <div v-if="order.isDeposited" class="mt-2 w-full text-center text-[#d11124] font-black tracking-widest whitespace-nowrap" style="font-family: 'Cal Sans', sans-serif; font-size: 16px;">
                  {{ formatDepositTime(order.deposit?.time) }}
                </div>
              </div>
            </div>
          </div>

          <!-- MENU TABLE -->
          <div v-if="order.items?.length" class="mb-6">
            <h3 class="font-bold tracking-[0.1em] text-slate-400 uppercase text-[10px] mb-3 text-center">THỰC ĐƠN ĐÃ CHỌN</h3>
            <div class="overflow-x-auto custom-scrollbar pb-2">
              <table class="w-full min-w-[280px]">
                <thead>
                  <tr class="border-y border-dashed border-slate-300 text-[9px] text-slate-400 uppercase tracking-wider">
                    <th class="py-2 text-left font-bold w-1/2">Tên món</th>
                    <th class="py-2 text-center font-bold">SL</th>
                    <th class="py-2 text-right font-bold">Thành tiền</th>
                  </tr>
                </thead>
                <tbody class="text-xs">
                  <tr v-for="(item, i) in order.items" :key="i" class="border-b border-dashed border-slate-100 last:border-0">
                    <td class="py-2.5">
                      <div class="font-bold text-slate-800">
                        {{ item.name }} [{{ formatVND(item.price || 0).replace(/\s/g, '').replace(/₫/g, 'đ') }}]
                      </div>
                      <div v-if="item.note || item.notes" class="text-[10px] text-rose-500 font-semibold mt-0.5 whitespace-pre-line italic">{{ item.note || item.notes }}</div>
                    </td>
                    <td class="py-2.5 text-center font-black text-slate-700">{{ item.qty }}</td>
                    <td class="py-2.5 text-right font-black text-slate-700">{{ formatVND((item.price || 0) * (item.qty || 0)) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <!-- NO MENU ITEMS NOTICE -->
          <div v-else class="mb-6 bg-slate-50 border border-slate-200/60 rounded-3xl p-5 text-center shadow-inner">
            <i class="fa-solid fa-circle-info text-blue-500 text-lg mb-2 block"></i>
            <span class="text-xs font-black text-slate-800 block uppercase tracking-wide">Chưa đặt món trước</span>
            <span class="text-[10px] text-slate-400 font-bold block mt-1">Quý khách gọi món trực tiếp tại nhà hàng khi dùng tiệc.</span>
            <div class="mt-3 text-[10px] text-amber-700 font-black bg-amber-50 border border-amber-100 rounded-2xl p-3 leading-relaxed">
              Cọc giữ bàn mặc định: {{ formatVND(order.depositAmount) }} <br>
              <span class="text-[9px] font-bold text-slate-500">
                (Áp dụng cho bàn chưa đặt món trước {{ (parseInt(order.customer?.pax) || 0) >= 20 ? 'từ 20 khách trở lên' : 'dưới 20 khách' }})
              </span>
            </div>
          </div>

          <!-- TOTALS -->
          <div class="border-t-2 border-dashed border-slate-300 pt-4 space-y-2 mb-6">
            <div class="flex justify-between items-center">
              <span class="text-[10px] font-bold text-slate-500 uppercase">Tạm tính</span>
              <span class="text-sm font-black text-slate-600">{{ formatVND(calculatedTotals.sub) }}</span>
            </div>
            
            <div v-if="calculatedTotals.vat8 > 0" class="flex justify-between items-center">
              <span class="text-[10px] font-bold text-slate-500 uppercase">VAT (8%)</span>
              <span class="text-xs font-bold text-slate-600">{{ formatVND(calculatedTotals.vat8) }}</span>
            </div>
            
            <div v-if="calculatedTotals.vat10 > 0" class="flex justify-between items-center">
              <span class="text-[10px] font-bold text-slate-500 uppercase">VAT (10%)</span>
              <span class="text-xs font-bold text-slate-600">{{ formatVND(calculatedTotals.vat10) }}</span>
            </div>
            
            <div v-if="calculatedTotals.final > calculatedTotals.sub" class="flex justify-between items-center pt-2">
              <span class="text-[11px] font-bold text-slate-600 uppercase">Tổng cộng</span>
              <span class="text-base font-black text-slate-800">{{ formatVND(calculatedTotals.final) }}</span>
            </div>

            <div class="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100 mt-2">
              <span class="text-[11px] font-black uppercase tracking-wider" :class="order.isDeposited ? 'text-emerald-600' : 'text-rose-500'">
                <i class="fa-solid mr-1" :class="order.isDeposited ? 'fa-circle-check' : 'fa-hourglass-half'"></i> 
                {{ order.isDeposited ? 'TIỀN CỌC (ĐÃ NHẬN)' : 'YÊU CẦU ĐẶT CỌC' }}
              </span>
              <span class="text-lg font-black" :class="order.isDeposited ? 'text-emerald-600' : 'text-rose-600'">{{ formatVND(order.depositAmount) }}</span>
            </div>
            
            <div v-if="calculatedTotals.final - order.depositAmount > 0" class="flex justify-between items-center pt-3 border-t border-slate-100 mt-3">
              <span class="text-xs font-black text-slate-800 uppercase">CÒN LẠI</span>
              <span class="text-lg font-black text-rose-600">{{ formatVND(calculatedTotals.final - order.depositAmount) }}</span>
            </div>
          </div>

          <!-- QR TRANSFER (only if not paid) -->
          <div v-if="!order.isDeposited && order.depositAmount > 0 && activeBank" class="bg-blue-50 border border-blue-100 rounded-2xl p-4 mb-4">
            <h3 class="font-black text-[10px] text-blue-800 uppercase tracking-widest mb-3 text-center">QUÉT MÃ ĐỂ ĐẶT CỌC</h3>
            <div class="flex flex-col items-center gap-3">
              <div class="bg-white p-2 rounded-xl shadow-sm border border-blue-100">
                <img :src="`https://img.vietqr.io/image/${activeBank.bankId}-${activeBank.number}-${activeBank.template || 'compact'}.png?amount=${order.depositAmount}&addInfo=${encodeURIComponent(depositTransferContent)}&accountName=${encodeURIComponent(activeBank.owner)}`"
                  class="w-40 h-40 object-contain rounded-lg" alt="QR Code" loading="lazy">
              </div>
              <div class="w-full text-center">
                <span class="text-[9px] font-bold text-blue-600 uppercase block mb-0.5">Nội dung chuyển khoản (bắt buộc)</span>
                <div class="bg-white border border-blue-200 text-blue-700 font-black text-xs py-2 px-3 rounded-lg inline-block tracking-wider">{{ depositTransferContent }}</div>
              </div>
              
              <!-- Bank Details text copy -->
              <div class="w-full text-[11px] text-slate-500 font-bold space-y-1 mt-2 border-t border-blue-100/50 pt-2 text-left px-2">
                <div class="flex justify-between">
                  <span>Ngân hàng:</span>
                  <span class="font-black text-slate-800">{{ activeBank.name }}</span>
                </div>
                <div class="flex justify-between">
                  <span>Số tài khoản:</span>
                  <span class="font-black text-blue-600 select-all">{{ activeBank.number }}</span>
                </div>
                <div class="flex justify-between">
                  <span>Chủ tài khoản:</span>
                  <span class="font-black text-slate-800">{{ activeBank.owner }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- UNIFIED POLICY & NOTES CONTAINER -->
          <div v-if="!order.isDeposited || order.items?.length > 0" class="bg-blue-50/30 border border-blue-100 rounded-3xl p-5 mb-6 text-left space-y-4 relative overflow-hidden mt-6">
            <div class="absolute top-0 left-0 w-1.5 h-full bg-blue-500"></div>
            
            <div class="flex items-center gap-2 text-blue-950 font-black uppercase text-[10px] tracking-wider border-b border-blue-100/50 pb-2">
              <i class="fa-solid fa-circle-exclamation text-blue-600 text-sm"></i>
              Lưu ý quan trọng dành cho khách hàng
            </div>

            <!-- Subsection 1: Deposit Policy (shown only if not paid) -->
            <div v-if="!order.isDeposited" class="space-y-1.5">
              <div class="text-[9px] font-black text-blue-900 uppercase tracking-widest flex items-center gap-1.5">
                <i class="fa-solid fa-vault text-[9px]"></i> 1. Quy định về đặt cọc
              </div>
              <div class="text-blue-950 text-[12px] font-bold leading-relaxed space-y-1 pl-4">
                <p>• Mức cọc tối thiểu là <span class="bg-blue-100/80 text-blue-950 px-1.5 py-0.5 rounded font-black text-[12px]">500.000đ/bàn</span>. Với phiếu đặt có thức ăn, mức cọc bằng <span class="bg-blue-100/80 text-blue-950 px-1.5 py-0.5 rounded font-black text-[12px]">1/3 tổng tiền thức ăn đặt trước</span>.</p>
                <p>• Hình thức trả cọc: Tiền cọc sẽ được <span class="text-emerald-700 font-black underline decoration-2 underline-offset-2">trừ vào bill khi thanh toán</span> hoặc <span class="text-emerald-700 font-black underline decoration-2 underline-offset-2">hoàn lại bằng tiền mặt</span>.</p>
                <p>• Yêu cầu đặt cọc: Vui lòng chuyển khoản đặt cọc đúng theo số tiền ghi trên phiếu.</p>
              </div>
            </div>

            <!-- Divider line if both are present -->
            <div v-if="!order.isDeposited && order.items?.length > 0" class="h-[1px] bg-blue-100/50 my-2"></div>

            <!-- Subsection 2: Pre-order Notes (shown only if has pre-ordered items) -->
            <div v-if="order.items?.length > 0" class="space-y-1.5">
              <div class="text-[9px] font-black text-amber-800 uppercase tracking-widest flex items-center gap-1.5">
                <i class="fa-solid fa-utensils text-[9px]"></i> 2. Lưu ý cho món ăn đặt trước
              </div>
              <div class="text-slate-800 text-[12px] font-bold leading-relaxed space-y-1 pl-4">
                <p>• <strong>Giá món chênh lệch:</strong> Giá một số món có thể được cập nhật mới và chênh lệch so với thực đơn online.</p>
                <p>• <strong>Giá chưa bao gồm thuế:</strong> Giá trên thực đơn chưa bao gồm VAT. Thuế suất áp dụng: <span class="bg-amber-100 text-amber-950 px-1 py-0.5 rounded font-black text-[12px]">8%</span> đối với món ăn, đồ uống pha chế; <span class="bg-amber-100 text-amber-950 px-1 py-0.5 rounded font-black text-[12px]">10%</span> đối với bia, rượu và đồ uống đóng lon.</p>
                <p>• <strong>Thời gian lên món:</strong> Thời gian lên món dự kiến từ <span class="text-rose-600 font-black">10–30 phút</span> sau khi quý khách yêu cầu phục vụ.</p>
              </div>
            </div>
          </div>

          <!-- FOOTER -->
          <div class="border-t border-dashed border-slate-200 pt-4 text-center">
            <p class="text-[10px] text-slate-400 font-bold mb-0.5">
              Nhân viên hỗ trợ: <span class="text-slate-600">{{ order.staff?.name && order.staff.name !== 'Hệ thống' ? order.staff.name : 'Minh Trí' }}</span>
              <span class="text-slate-500 font-medium"> - 
                <a :href="'tel:' + (order.staff?.phone && order.staff.name !== 'Hệ thống' ? order.staff.phone : '0336667301')" class="text-blue-500 underline font-bold hover:text-blue-700">{{ order.staff?.phone && order.staff.name !== 'Hệ thống' ? order.staff.phone : '0336667301' }}</a>
              </span>
            </p>
            <p class="text-[9px] text-slate-300 font-mono">KG-SYS | {{ order.timestamp ? new Date(order.timestamp).toLocaleString('vi-VN') : '' }}</p>
          </div>
        </div>
        
        <div class="absolute -bottom-1.5 left-2 right-2 h-3 bg-slate-50" style="mask-image: radial-gradient(circle at 6px 12px, transparent 6px, black 6.5px); mask-size: 12px 12px; mask-repeat: repeat-x;"></div>
      </div>

      <!-- BACK BUTTON -->
      <div class="text-center mt-6 mb-4">
        <p class="text-slate-500 font-bold text-xs mb-1">&copy; 2024 KING's GRILL BOOKING APP</p>
        <p class="text-slate-600 font-bold text-[10px] uppercase tracking-widest">Hệ thống công nghệ nhà hàng</p>
      </div>
    </div>
    </div>
    
    <LuckyWheel v-if="showLuckyWheel" :orderId="order.id" :customerName="order.customer?.name" @close="showLuckyWheel = false" />
  </div>
</template>
