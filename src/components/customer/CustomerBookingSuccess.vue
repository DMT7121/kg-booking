<script setup lang="ts">
import { ref, computed } from 'vue'
import html2canvas from 'html2canvas'
import {
  RESTAURANT_NAME,
  RESTAURANT_HOTLINE,
  RESTAURANT_ZALO_URL
} from '@/domain/customerBooking/types'
import { stripAccents } from '@/utils'

const props = defineProps<{
  bookingId: string
  submittedData: any
  submittedAt: string
}>()

const emit = defineEmits<{
  (e: 'new-booking'): void
}>()

const isDownloading = ref(false)
const copiedZaloText = ref(false)

const customerInfo = computed(() => props.submittedData?.customer || {})
const rawDetails = computed(() => props.submittedData?.meta?.rawDetails || {})

const formattedSubmitTime = computed(() => {
  if (!props.submittedAt) return ''
  try {
    const d = new Date(props.submittedAt)
    return d.toLocaleString('vi-VN', {
      hour12: false,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return props.submittedAt
  }
})

// Tải phiếu dạng ảnh PNG chất lượng cao (Retina 3x, Căn chỉnh đẹp mắt)
async function downloadTicketImage() {
  const el = document.getElementById('booking-ticket-card')
  if (!el || isDownloading.value) return

  isDownloading.value = true
  try {
    await document.fonts?.ready
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))

    const canvas = await html2canvas(el, {
      scale: 3,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#0a0f1d',
      onclone: (clonedDoc) => {
        const clonedEl = clonedDoc.getElementById('booking-ticket-card')
        if (clonedEl) {
          clonedEl.style.width = '640px'
          clonedEl.style.maxWidth = '640px'
          clonedEl.style.margin = '0 auto'
          clonedEl.style.borderRadius = '24px'
        }
      }
    })

    const dataUrl = canvas.toDataURL('image/png')
    const link = document.createElement('a')
    const safeName = stripAccents(rawDetails.value.bookerName || customerInfo.value.name || 'Khach').replace(/[^a-zA-Z0-9]/g, '_')
    link.download = `KingsGrill_YeuCauDatBan_${safeName}_${props.bookingId.slice(0, 8)}.png`
    link.href = dataUrl
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  } catch (err) {
    console.error('[CustomerSuccess] Lỗi xuất ảnh phiếu:', err)
    window.print()
  } finally {
    isDownloading.value = false
  }
}

// In phiếu (Print / Save as PDF)
function printTicket() {
  window.print()
}

// Copy tin nhắn gửi Zalo cho nhân viên
function copyForZalo() {
  const paxDisplay = rawDetails.value.totalGuests
    ? `${rawDetails.value.totalGuests} người (${rawDetails.value.adultCount} lớn + ${rawDetails.value.childrenCount || 0} trẻ em)`
    : `${customerInfo.value.pax} người`

  const text = `Xin chào ${RESTAURANT_NAME}, tôi vừa gửi Yêu cầu đặt bàn online mã #${props.bookingId.slice(0, 8).toUpperCase()}:
- Người đặt: ${rawDetails.value.bookerName || customerInfo.value.name}
- SĐT: ${customerInfo.value.phone}
- Thời gian: ${customerInfo.value.time} ngày ${customerInfo.value.date}
- Số lượng: ${paxDisplay}
Nhờ nhà hàng kiểm tra và xác nhận giúp tôi nhé!`

  navigator.clipboard.writeText(text).then(() => {
    copiedZaloText.value = true
    setTimeout(() => {
      copiedZaloText.value = false
    }, 3000)
  })
}
</script>

<template>
  <div class="w-full max-w-2xl mx-auto py-4 sm:py-6 px-3 sm:px-4 space-y-6 animate-fade-in">
    <!-- Banner Thành Công -->
    <div class="bg-gradient-to-br from-emerald-950/70 via-slate-900 to-slate-950 border border-emerald-500/40 rounded-3xl p-5 sm:p-7 text-center shadow-2xl relative overflow-hidden">
      <div class="absolute -right-10 -bottom-10 w-44 h-44 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

      <!-- Icon & Logo Success -->
      <div class="flex items-center justify-center gap-3 mb-3">
        <div class="w-12 h-12 bg-emerald-500/20 border border-emerald-400/50 rounded-2xl flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/20">
          <i class="fa-solid fa-check text-2xl"></i>
        </div>
        <div class="w-12 h-12 bg-amber-500/15 border border-amber-500/30 rounded-2xl flex items-center justify-center p-2 shadow-lg shadow-amber-500/10">
          <img src="/favicon.svg" alt="KG Logo" class="w-full h-full object-contain" />
        </div>
      </div>

      <h2 class="text-lg sm:text-2xl font-black text-slate-100 uppercase tracking-wide font-display">
        Yêu cầu đặt bàn đã được gửi
      </h2>
      <p class="text-xs sm:text-sm text-amber-300/90 font-semibold mt-1">
        {{ RESTAURANT_NAME }} đã tiếp nhận thông tin của quý khách
      </p>

      <div class="mt-4 p-3.5 bg-slate-950/80 border border-amber-500/25 rounded-2xl text-xs text-slate-300 leading-relaxed max-w-lg mx-auto">
        <p class="text-amber-400 font-bold mb-1 flex items-center justify-center gap-1.5">
          <i class="fa-solid fa-circle-exclamation text-amber-400"></i> Lưu ý quan trọng:
        </p>
        Thông tin gửi qua form là <strong>yêu cầu đặt chỗ online</strong>. Nhân viên nhà hàng sẽ kiểm tra tình trạng bàn thực tế và liên hệ lại với quý khách trong thời gian sớm nhất để xác nhận.
      </div>
    </div>

    <!-- PHIẾU YÊU CẦU ĐẶT BÀN (Printable / Downloadable Card) -->
    <div
      id="booking-ticket-card"
      class="bg-gradient-to-b from-[#0e1629] via-[#090e1a] to-[#0a0f1d] border-2 border-amber-500/40 rounded-3xl p-5 sm:p-8 shadow-2xl relative overflow-hidden text-slate-100"
    >
      <!-- Khung viền mạ vàng kép tinh tế -->
      <div class="absolute inset-1.5 border border-amber-500/20 rounded-[22px] pointer-events-none"></div>

      <!-- Watermark Logo -->
      <div class="absolute right-4 bottom-4 opacity-5 w-48 h-48 pointer-events-none select-none flex items-center justify-center">
        <img src="/favicon.svg" alt="Watermark" class="w-full h-full object-contain filter grayscale" />
      </div>

      <!-- Ticket Header -->
      <div class="border-b border-amber-500/30 pb-5 mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
        <div class="flex items-center gap-3.5">
          <div class="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/40 p-2 flex items-center justify-center shrink-0 shadow-md">
            <img src="/favicon.svg" alt="Logo" class="w-full h-full object-contain" />
          </div>
          <div>
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-[11px] font-black uppercase tracking-widest text-amber-400 bg-amber-500/15 px-2.5 py-0.5 rounded-full border border-amber-500/30">
                {{ RESTAURANT_NAME }}
              </span>
              <span class="text-xs text-slate-400 font-mono font-bold tracking-wider">#{{ bookingId.slice(0, 8).toUpperCase() }}</span>
            </div>
            <h3 class="text-xl sm:text-2xl font-black text-slate-50 mt-1 uppercase tracking-tight font-display">
              Phiếu yêu cầu đặt bàn
            </h3>
            <p class="text-xs text-slate-400 mt-0.5">
              Thời gian gửi: <span class="text-slate-200 font-medium">{{ formattedSubmitTime }}</span>
            </p>
          </div>
        </div>

        <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-400/40 text-amber-300 text-xs font-bold shrink-0 self-start sm:self-center shadow-sm">
          <span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
          <span>Đang chờ nhà hàng xác nhận</span>
        </div>
      </div>

      <!-- Ticket Details Grid (2 Cột Căn Chỉnh Cân Đối) -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-sm relative z-10">
        <!-- Người đặt -->
        <div class="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
          <span class="text-[11px] text-slate-400 font-medium block mb-1">Người đặt bàn:</span>
          <span class="font-bold text-slate-100 uppercase text-base tracking-wide">{{ rawDetails.bookerName || customerInfo.name }}</span>
        </div>

        <!-- Chủ tiệc -->
        <div class="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
          <span class="text-[11px] text-slate-400 font-medium block mb-1">Chủ tiệc:</span>
          <span class="font-bold text-amber-300 uppercase text-base tracking-wide">
            {{ rawDetails.hostName || '—' }}
          </span>
        </div>

        <!-- SĐT / Zalo -->
        <div class="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
          <span class="text-[11px] text-slate-400 font-medium block mb-1">SĐT / Zalo liên hệ:</span>
          <span class="font-bold text-emerald-400 font-mono tracking-wider text-base">{{ customerInfo.phone }}</span>
        </div>

        <!-- Thời gian đặt tiệc -->
        <div class="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
          <span class="text-[11px] text-slate-400 font-medium block mb-1">Thời gian đón tiệc:</span>
          <span class="font-bold text-slate-100 text-base">
            <i class="fa-regular fa-clock text-amber-400 mr-1"></i>{{ customerInfo.time }}
            <span class="text-slate-500 mx-1.5">•</span>
            <i class="fa-regular fa-calendar text-amber-400 mr-1"></i>{{ customerInfo.date }}
          </span>
        </div>

        <!-- Số lượng khách (Tính rõ người lớn + trẻ em) -->
        <div class="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
          <span class="text-[11px] text-slate-400 font-medium block mb-1">Tổng lượng khách phục vụ:</span>
          <div>
            <span class="font-black text-amber-300 text-lg">
              {{ rawDetails.totalGuests || customerInfo.pax }}
            </span>
            <span v-if="rawDetails.hasChildren && Number(rawDetails.childrenCount) > 0" class="block text-[11px] text-slate-400 font-normal mt-0.5">
              ({{ rawDetails.adultCount }} người lớn + {{ rawDetails.childrenCount }} trẻ em)
            </span>
          </div>
        </div>

        <!-- Loại tiệc & Tông màu -->
        <div class="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
          <span class="text-[11px] text-slate-400 font-medium block mb-1">Nhu cầu / Tông màu:</span>
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="font-bold text-slate-100">
              {{ customerInfo.type }}
            </span>
            <span v-if="rawDetails.colorTone" class="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-medium border border-amber-500/30">
              Tone: {{ rawDetails.colorTone }}
            </span>
          </div>
        </div>

        <!-- Ghi chú nếu có (TUYỆT ĐỐI ẨN KHU A) -->
        <div v-if="rawDetails.rawNote" class="sm:col-span-2 bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
          <span class="text-[11px] text-slate-400 font-medium block mb-1">Ghi chú của quý khách:</span>
          <p class="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
            {{ rawDetails.rawNote }}
          </p>
        </div>
      </div>

      <!-- Ticket Footer (Đồng nhất tên NHÀ HÀNG KING's GRILL) -->
      <div class="mt-6 pt-4 border-t border-amber-500/30 text-center text-xs text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-2 relative z-10">
        <span class="font-medium text-slate-300">{{ RESTAURANT_NAME }} · Hotline: {{ RESTAURANT_HOTLINE }}</span>
        <span class="italic text-amber-400/90 font-display">Kính chúc quý khách một bữa tiệc ấm cúng & trọn vẹn!</span>
      </div>
    </div>

    <!-- Actions: Tải phiếu / In / Gửi Zalo -->
    <div class="flex flex-wrap items-center justify-center gap-3 pt-2">
      <!-- Tải phiếu ảnh (Retina) -->
      <button
        type="button"
        :disabled="isDownloading"
        class="flex-1 sm:flex-initial px-5 py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black shadow-lg shadow-amber-500/20 transition flex items-center justify-center gap-2 text-sm disabled:opacity-50 min-h-[48px]"
        @click="downloadTicketImage"
      >
        <span v-if="isDownloading" class="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></span>
        <i v-else class="fa-solid fa-download text-slate-950"></i>
        <span>{{ isDownloading ? 'Đang xuất ảnh HD...' : 'Tải phiếu yêu cầu' }}</span>
      </button>

      <!-- In phiếu -->
      <button
        type="button"
        class="px-5 py-3.5 rounded-2xl bg-slate-850 hover:bg-slate-800 text-slate-100 font-semibold border border-slate-700 shadow-md transition flex items-center justify-center gap-2 text-sm min-h-[48px]"
        @click="printTicket"
      >
        <i class="fa-solid fa-print text-blue-400"></i>
        <span>In phiếu / PDF</span>
      </button>

      <!-- Mở Zalo -->
      <a
        :href="RESTAURANT_ZALO_URL"
        target="_blank"
        rel="noopener noreferrer"
        class="flex-1 sm:flex-initial px-5 py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold shadow-lg shadow-blue-500/25 transition flex items-center justify-center gap-2 text-sm min-h-[48px]"
      >
        <i class="fa-solid fa-comment-dots text-white"></i>
        <span>Liên hệ nhân viên qua Zalo</span>
      </a>
    </div>

    <!-- Khối hướng dẫn gửi lại Zalo -->
    <div class="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 text-center space-y-3">
      <p class="text-xs text-slate-300 leading-relaxed">
        Thông tin của quý khách đang được nhà hàng tiếp nhận và xử lý.
        Quý khách có thể gửi lại <strong>Phiếu yêu cầu</strong> này hoặc mã <strong class="text-amber-400 font-mono">#{{ bookingId.slice(0, 8).toUpperCase() }}</strong> cho nhân viên qua Zalo để được sắp bàn nhanh nhất.
      </p>

      <div class="flex items-center justify-center gap-2 flex-wrap">
        <button
          type="button"
          class="px-4 py-2 rounded-xl bg-slate-850 hover:bg-slate-800 text-slate-200 text-xs font-semibold border border-slate-700 flex items-center gap-1.5 transition min-h-[38px]"
          @click="copyForZalo"
        >
          <i :class="copiedZaloText ? 'fa-solid fa-check text-emerald-400' : 'fa-regular fa-copy'"></i>
          <span>{{ copiedZaloText ? 'Đã sao chép nội dung!' : 'Sao chép tin nhắn gửi Zalo' }}</span>
        </button>

        <span class="text-slate-400 text-xs font-mono">Hotline/Zalo: {{ RESTAURANT_HOTLINE }}</span>
      </div>

      <div class="pt-2 border-t border-slate-850">
        <button
          type="button"
          class="text-xs text-slate-400 hover:text-amber-400 font-medium transition inline-flex items-center gap-1.5 py-1"
          @click="emit('new-booking')"
        >
          <i class="fa-solid fa-rotate-left"></i>
          Gửi yêu cầu đặt bàn khác
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
@media print {
  body * {
    visibility: hidden;
  }
  #booking-ticket-card,
  #booking-ticket-card * {
    visibility: visible;
  }
  #booking-ticket-card {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    margin: 0;
    padding: 24px;
    background: #ffffff !important;
    color: #000000 !important;
    border: 2px solid #000000 !important;
    box-shadow: none !important;
  }
}
</style>
