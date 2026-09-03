<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  RESTAURANT_NAME,
  RESTAURANT_HOTLINE,
  RESTAURANT_ZALO_URL
} from '@/domain/customerBooking/types'
import type { SubmittedCustomerDetails } from '@/domain/customerBooking/types'
import html2canvas from 'html2canvas'

const props = defineProps<{
  bookingId: string
  submittedData: any
  submittedAt: string | null
}>()

const emit = defineEmits<{
  (e: 'newBooking'): void
}>()

const isDownloading = ref(false)
const copiedZaloText = ref(false)

// Trích xuất dữ liệu an toàn
const customerInfo = computed(() => {
  if (!props.submittedData) return {}
  return props.submittedData.parsedCustomer || props.submittedData.customer || props.submittedData
})

const rawDetails = computed<Partial<SubmittedCustomerDetails>>(() => {
  return customerInfo.value.rawCustomerDetails || {}
})

// Format thời gian gửi
const formattedSubmitTime = computed(() => {
  if (!props.submittedAt) return 'Vừa xong'
  try {
    const d = new Date(props.submittedAt)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ngày ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  } catch {
    return props.submittedAt
  }
})

// Xuất phiếu ảnh sắc nét
async function downloadTicketImage() {
  const el = document.getElementById('booking-ticket-card')
  if (!el) return

  isDownloading.value = true
  try {
    const canvas = await html2canvas(el, {
      scale: 3,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      onclone: (clonedDoc) => {
        const clonedEl = clonedDoc.getElementById('booking-ticket-card')
        if (clonedEl) {
          clonedEl.style.width = '640px'
          clonedEl.style.maxWidth = '640px'
          clonedEl.style.margin = '0 auto'
          clonedEl.style.borderRadius = '24px'
          clonedEl.style.boxShadow = 'none'
        }
      }
    })

    const link = document.createElement('a')
    link.download = `Phieu-Dat-Ban-Kings-Grill-${props.bookingId.slice(0, 8).toUpperCase()}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  } catch (err) {
    console.error('Lỗi khi tải ảnh phiếu:', err)
  } finally {
    isDownloading.value = false
  }
}

// Copy nội dung gửi nhanh Zalo
function copyZaloSummary() {
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
  <div class="w-full max-w-2xl mx-auto py-2 sm:py-4 px-1 sm:px-2 space-y-5 animate-fade-in text-slate-800">
    <!-- Banner Thành Công -->
    <div class="bg-white border border-emerald-200 rounded-3xl p-5 sm:p-7 text-center shadow-sm relative overflow-hidden">
      <!-- Top Decorative Accent -->
      <div class="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-blue-500"></div>

      <!-- Icon & Logo Success -->
      <div class="flex items-center justify-center gap-3 mb-3 pt-1">
        <div class="w-12 h-12 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-center text-emerald-600 shadow-sm">
          <i class="fa-solid fa-check text-2xl"></i>
        </div>
        <div class="w-12 h-12 bg-white border border-slate-200 rounded-2xl flex items-center justify-center p-2 shadow-sm">
          <img src="/favicon.svg" alt="KG Logo" class="w-full h-full object-contain" />
        </div>
      </div>

      <h2 class="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-wide font-display">
        Yêu cầu đặt bàn đã gửi thành công
      </h2>
      <p class="text-xs sm:text-sm text-emerald-700 font-bold mt-1">
        {{ RESTAURANT_NAME }} đã tiếp nhận thông tin của quý khách
      </p>

      <div class="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-600 leading-relaxed max-w-lg mx-auto text-left">
        <p class="text-amber-800 font-bold mb-1 flex items-center gap-1.5">
          <i class="fa-solid fa-circle-info text-amber-600"></i> Quy trình xác nhận:
        </p>
        Thông tin gửi qua form là <strong>yêu cầu đặt chỗ online</strong>. Nhân viên nhà hàng sẽ kiểm tra tình trạng bàn thực tế và liên hệ lại qua số điện thoại của quý khách để xác nhận chính thức.
      </div>
    </div>

    <!-- PHIẾU YÊU CẦU ĐẶT BÀN (Printable / Downloadable Card) -->
    <div
      id="booking-ticket-card"
      class="bg-white border-2 border-slate-200 rounded-3xl p-5 sm:p-8 shadow-xl relative overflow-hidden text-slate-800"
    >
      <!-- Khung viền kép tinh tế -->
      <div class="absolute inset-1.5 border border-slate-100 rounded-[22px] pointer-events-none"></div>

      <!-- Ticket Header -->
      <div class="border-b border-slate-200 pb-5 mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
        <div class="flex items-center gap-3.5">
          <div class="w-14 h-14 rounded-2xl bg-white border border-slate-200 p-2 flex items-center justify-center shrink-0 shadow-sm">
            <img src="/favicon.svg" alt="Logo" class="w-full h-full object-contain" />
          </div>
          <div>
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-[11px] font-black uppercase tracking-widest text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                {{ RESTAURANT_NAME }}
              </span>
              <span class="text-xs text-slate-500 font-mono font-bold tracking-wider">#{{ bookingId.slice(0, 8).toUpperCase() }}</span>
            </div>
            <h3 class="text-xl sm:text-2xl font-black text-slate-900 mt-1 uppercase tracking-tight font-display">
              Phiếu yêu cầu đặt bàn
            </h3>
            <p class="text-xs text-slate-500 mt-0.5 font-medium">
              Thời gian gửi: <span class="text-slate-800 font-bold">{{ formattedSubmitTime }}</span>
            </p>
          </div>
        </div>

        <div class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold shrink-0 self-start sm:self-center shadow-sm">
          <span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
          <span>Đang chờ nhà hàng xác nhận</span>
        </div>
      </div>

      <!-- Ticket Details Grid (2 Cột Căn Chỉnh Cân Đối) -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-sm relative z-10">
        <!-- Người đặt -->
        <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
          <span class="text-[11px] text-slate-500 font-bold block mb-1">Người đặt bàn:</span>
          <span class="font-black text-slate-900 uppercase text-base tracking-wide">{{ rawDetails.bookerName || customerInfo.name }}</span>
        </div>

        <!-- Chủ tiệc -->
        <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
          <span class="text-[11px] text-slate-500 font-bold block mb-1">Chủ tiệc:</span>
          <span class="font-black text-blue-700 uppercase text-base tracking-wide">
            {{ rawDetails.hostName || '—' }}
          </span>
        </div>

        <!-- SĐT / Zalo -->
        <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
          <span class="text-[11px] text-slate-500 font-bold block mb-1">SĐT / Zalo liên hệ:</span>
          <span class="font-black text-emerald-600 font-mono tracking-wider text-base">{{ customerInfo.phone }}</span>
        </div>

        <!-- Thời gian đặt tiệc -->
        <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
          <span class="text-[11px] text-slate-500 font-bold block mb-1">Thời gian đón tiệc:</span>
          <span class="font-bold text-slate-900 text-base">
            <i class="fa-regular fa-clock text-blue-600 mr-1"></i>{{ customerInfo.time }}
            <span class="text-slate-300 mx-1.5">•</span>
            <i class="fa-regular fa-calendar text-blue-600 mr-1"></i>{{ customerInfo.date }}
          </span>
        </div>

        <!-- Số lượng khách (Tính rõ người lớn + trẻ em) -->
        <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
          <span class="text-[11px] text-slate-500 font-bold block mb-1">Tổng lượng khách phục vụ:</span>
          <div>
            <span class="font-black text-blue-700 text-lg">
              {{ rawDetails.totalGuests || customerInfo.pax }}
            </span>
            <span v-if="rawDetails.hasChildren && Number(rawDetails.childrenCount) > 0" class="block text-[11px] text-slate-500 font-medium mt-0.5">
              ({{ rawDetails.adultCount }} người lớn + {{ rawDetails.childrenCount }} trẻ em)
            </span>
          </div>
        </div>

        <!-- Loại tiệc & Tông màu -->
        <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
          <span class="text-[11px] text-slate-500 font-bold block mb-1">Nhu cầu / Tông màu:</span>
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="font-bold text-slate-900">
              {{ customerInfo.type }}
            </span>
            <span v-if="rawDetails.colorTone" class="text-xs px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold border border-blue-200">
              Tone: {{ rawDetails.colorTone }}
            </span>
          </div>
        </div>

        <!-- Ghi chú nếu có -->
        <div v-if="rawDetails.rawNote" class="sm:col-span-2 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
          <span class="text-[11px] text-slate-500 font-bold block mb-1">Ghi chú của quý khách:</span>
          <p class="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
            {{ rawDetails.rawNote }}
          </p>
        </div>
      </div>

      <!-- Ticket Footer -->
      <div class="mt-6 pt-4 border-t border-slate-200 text-center text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2 relative z-10">
        <span class="font-bold text-slate-700">{{ RESTAURANT_NAME }} · Hotline: {{ RESTAURANT_HOTLINE }}</span>
        <span class="italic text-blue-700 font-display">Kính chúc quý khách một bữa tiệc ấm cúng & trọn vẹn!</span>
      </div>
    </div>

    <!-- Actions: Tải phiếu / Gửi Zalo / Đặt mới -->
    <div class="flex flex-wrap items-center justify-center gap-3 pt-2">
      <!-- Tải phiếu ảnh (Retina) -->
      <button
        type="button"
        :disabled="isDownloading"
        class="flex-1 sm:flex-initial px-5 py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 text-white font-black shadow-lg shadow-blue-500/20 transition flex items-center justify-center gap-2 text-sm disabled:opacity-50 min-h-[48px] cursor-pointer"
        @click="downloadTicketImage"
      >
        <span v-if="isDownloading" class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
        <i v-else class="fa-solid fa-download text-white"></i>
        <span>{{ isDownloading ? 'Đang xuất ảnh...' : 'Lưu ảnh phiếu về máy' }}</span>
      </button>

      <!-- Nhắn Zalo -->
      <a
        :href="RESTAURANT_ZALO_URL"
        target="_blank"
        rel="noopener noreferrer"
        class="flex-1 sm:flex-initial px-5 py-3.5 rounded-2xl bg-white border border-slate-200 hover:bg-slate-50 text-blue-700 font-bold transition flex items-center justify-center gap-2 text-sm min-h-[48px] shadow-sm"
        @click="copyZaloSummary"
      >
        <i class="fa-solid fa-comment-dots text-blue-600"></i>
        <span>{{ copiedZaloText ? 'Đã copy thông tin!' : 'Nhắn Zalo xác nhận' }}</span>
      </a>

      <!-- Đặt bàn mới -->
      <button
        type="button"
        class="w-full sm:w-auto px-5 py-3.5 rounded-2xl bg-slate-100 border border-slate-200 hover:bg-slate-200 text-slate-700 font-bold transition flex items-center justify-center gap-2 text-sm min-h-[48px] cursor-pointer"
        @click="emit('newBooking')"
      >
        <i class="fa-solid fa-plus"></i>
        <span>Gửi yêu cầu đặt bàn khác</span>
      </button>
    </div>
  </div>
</template>
