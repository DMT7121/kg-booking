<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import {
  RESTAURANT_NAME,
  COLOR_TONES,
  RESTAURANT_HOTLINE,
  RESTAURANT_ZALO_URL
} from '@/domain/customerBooking/types'
import { useCustomerBooking } from '@/composables/useCustomerBooking'
import CustomerReviewModal from './CustomerReviewModal.vue'
import CustomerBookingSuccess from './CustomerBookingSuccess.vue'

const {
  form,
  submissionState,
  errors,
  draftRestored,
  createdBookingId,
  submittedData,
  submittedAt,
  errorMessage,
  totalGuestsCount,
  validateForm,
  submitBooking,
  retrySubmit,
  resetForm,
  convertIsoToDisplayDate,
  getTodayIsoDate
} = useCustomerBooking()

const minDate = computed(() => getTodayIsoDate())
const displayDate = computed(() => convertIsoToDisplayDate(form.date))

// Party types with icons
const PARTY_TYPE_OPTIONS = [
  { label: 'Sinh nhật', icon: '🎂' },
  { label: 'Thôi nôi', icon: '👶' },
  { label: 'Liên hoan', icon: '🍻' },
  { label: 'Ăn thường', icon: '🍽️' },
  { label: 'Công ty', icon: '🏢' },
  { label: 'Tiệc chia tay', icon: '🥂' },
  { label: 'Kỉ niệm', icon: '💐' },
  { label: 'Khác', icon: '✏️' }
]

// Quick Date Options
function setQuickDate(offsetDays: number) {
  const target = new Date()
  target.setDate(target.getDate() + offsetDays)
  form.date = target.toISOString().split('T')[0]
  delete errors.date
}

// Quick Weekend
function setQuickDateWeekend(dayOfWeek: number) { // 6 = Sat, 0 = Sun
  const target = new Date()
  const currentDay = target.getDay()
  let diff = (dayOfWeek - currentDay + 7) % 7
  if (diff === 0) diff = 7
  target.setDate(target.getDate() + diff)
  form.date = target.toISOString().split('T')[0]
  delete errors.date
}

// Quick Times & Pax
const QUICK_TIMES = ['11:30', '12:00', '18:00', '18:30', '19:00', '19:30', '20:00']
const QUICK_PAX = [2, 4, 6, 8, 10, 12, 15, 20]

// Guest adjustments (+ / -)
function adjustGuests(delta: number) {
  const current = Number(form.guestCount) || 0
  const next = Math.max(1, Math.min(200, current + delta))
  form.guestCount = next
  delete errors.guestCount
}

function adjustChildren(delta: number) {
  const current = Number(form.childrenCount) || 0
  const next = Math.max(0, Math.min(100, current + delta))
  form.childrenCount = next
  delete errors.childrenCount
}

// Đảm bảo mở khóa cuộn trang tự do (scrollable) trên mọi thiết bị và đánh dấu guest mode
onMounted(() => {
  try {
    sessionStorage.setItem('kg_guest_mode', '1')
    document.documentElement.classList.add('customer-booking-mode')
    document.body.classList.add('customer-booking-mode')
    document.body.classList.remove('overflow-hidden')
  } catch {}
})

onUnmounted(() => {
  try {
    document.documentElement.classList.remove('customer-booking-mode')
    document.body.classList.remove('customer-booking-mode')
  } catch {}
})


// Mở review modal
function onContinueToReview() {
  if (validateForm()) {
    submissionState.value = 'REVIEWING'
  } else {
    const firstErrorKey = Object.keys(errors)[0]
    if (firstErrorKey) {
      const el = document.getElementById(`field-${firstErrorKey}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.focus()
      }
    }
  }
}

// Xác nhận gửi từ Review Modal
async function onConfirmSubmit() {
  await submitBooking()
}

// Quay lại chỉnh sửa
function onBackToEdit() {
  submissionState.value = 'DRAFT'
}

// Bắt đầu đơn đặt bàn mới
function onStartNewBooking() {
  resetForm()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// Chọn loại tiệc
function selectPartyType(type: string) {
  form.partyType = type
  if (type !== 'Khác') {
    form.customPartyType = ''
    delete errors.customPartyType
  }
}

// Chọn tông màu
function selectColorTone(name: string) {
  form.colorTone = form.colorTone === name ? '' : name
}
</script>

<template>
  <div class="min-h-screen w-full bg-[#070b14] text-slate-100 flex flex-col justify-between selection:bg-amber-500 selection:text-slate-950 font-sans antialiased overflow-y-auto overscroll-y-auto pb-12">

    <!-- Top Ambient Glow -->
    <div class="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-56 bg-gradient-to-b from-amber-500/15 via-amber-600/5 to-transparent blur-3xl pointer-events-none z-0"></div>

    <!-- MAIN CONTAINER -->
    <main class="relative z-10 w-full max-w-xl mx-auto px-3.5 sm:px-5 py-5 sm:py-8 flex-1 flex flex-col">
      <!-- MÀN HÌNH THÀNH CÔNG -->
      <CustomerBookingSuccess
        v-if="submissionState === 'SUCCESS'"
        :booking-id="createdBookingId"
        :submitted-data="submittedData"
        :submitted-at="submittedAt"
        @new-booking="onStartNewBooking"
      />

      <!-- FORM NHẬP THÔNG TIN (DRAFT / REVIEWING / SUBMITTING / FAILED) -->
      <div v-else class="space-y-5">
        <!-- BRANDING HEADER WITH OFFICIAL LOGO -->
        <header class="text-center space-y-3 pb-1">
          <!-- Logo chính thức -->
          <div class="flex justify-center">
            <div class="w-16 h-16 sm:w-20 sm:h-20 rounded-3xl bg-slate-900/90 border-2 border-amber-500/40 p-2.5 shadow-2xl shadow-amber-500/20 flex items-center justify-center transform hover:scale-105 transition duration-300">
              <img src="/favicon.svg" :alt="RESTAURANT_NAME" class="w-full h-full object-contain drop-shadow" />
            </div>
          </div>

          <!-- Restaurant Name Badge -->
          <div class="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-black tracking-widest uppercase shadow-sm">
            <i class="fa-solid fa-crown text-amber-400"></i>
            <span>{{ RESTAURANT_NAME }}</span>
          </div>

          <h1 class="text-2xl sm:text-3xl font-black tracking-tight text-white uppercase font-display">
            Yêu cầu đặt bàn online
          </h1>

          <p class="text-xs sm:text-sm text-slate-300 max-w-md mx-auto leading-relaxed">
            Quý khách chỉ mất 1 phút gửi yêu cầu. Nhân viên <strong class="text-amber-300">{{ RESTAURANT_NAME }}</strong> sẽ kiểm tra bàn và gọi lại xác nhận ngay!
          </p>

          <!-- Step Indicators -->
          <div class="flex items-center justify-center gap-2 pt-2 text-[11px] text-slate-400">
            <span class="flex items-center gap-1 text-amber-300 font-bold">
              <span class="w-5 h-5 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center text-[10px] font-black">1</span>
              Điền thông tin
            </span>
            <span class="text-slate-600">———</span>
            <span class="flex items-center gap-1">
              <span class="w-5 h-5 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center text-[10px] font-bold">2</span>
              Xem lại
            </span>
            <span class="text-slate-600">———</span>
            <span class="flex items-center gap-1">
              <span class="w-5 h-5 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center text-[10px] font-bold">3</span>
              Nhận phiếu
            </span>
          </div>
        </header>

        <!-- THÔNG BÁO KHÔI PHỤC BẢN NHÁP -->
        <div
          v-if="draftRestored"
          class="p-3.5 bg-blue-950/60 border border-blue-500/40 rounded-2xl flex items-center justify-between text-blue-200 text-xs animate-fade-in shadow-md"
        >
          <div class="flex items-center gap-2.5">
            <i class="fa-solid fa-clock-rotate-left text-blue-400 text-sm"></i>
            <span>Đã khôi phục thông tin quý khách nhập trước đó.</span>
          </div>
          <button
            type="button"
            class="text-blue-400 hover:text-blue-200 font-semibold p-1.5 rounded-lg"
            aria-label="Ẩn thông báo"
            @click="draftRestored = false"
          >
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <!-- THÔNG BÁO LỖI NẾU SUBMIT THẤT BẠI -->
        <div
          v-if="submissionState === 'FAILED'"
          class="p-4 bg-rose-950/60 border border-rose-500/40 rounded-2xl space-y-3 animate-shake shadow-lg"
        >
          <div class="flex items-start gap-2.5 text-rose-300 text-sm font-medium">
            <i class="fa-solid fa-triangle-exclamation text-rose-400 mt-0.5 shrink-0 text-base"></i>
            <div>
              <p class="font-bold text-rose-200">Chưa thể gửi yêu cầu đặt bàn</p>
              <p class="text-xs text-rose-300/90 mt-0.5">
                {{ errorMessage || 'Kết nối mạng đang gián đoạn. Dữ liệu đã nhập vẫn an toàn trên máy của quý khách. Vui lòng bấm thử lại.' }}
              </p>
            </div>
          </div>

          <div class="flex items-center gap-3 pt-1">
            <button
              type="button"
              class="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-rose-900/20"
              @click="retrySubmit"
            >
              <i class="fa-solid fa-rotate-right"></i>
              Thử gửi lại
            </button>
            <a
              :href="RESTAURANT_ZALO_URL"
              target="_blank"
              rel="noopener noreferrer"
              class="text-xs text-slate-300 hover:text-white underline font-medium"
            >
              Nhắn Zalo hỗ trợ: {{ RESTAURANT_HOTLINE }}
            </a>
          </div>
        </div>

        <!-- FORM CHÍNH -->
        <form class="space-y-4 sm:space-y-5" @submit.prevent="onContinueToReview">
          <!-- BƯỚC 1: THÔNG TIN LIÊN HỆ -->
          <section class="bg-slate-900/90 border border-slate-800/90 rounded-3xl p-4 sm:p-6 shadow-xl space-y-4">
            <div class="flex items-center gap-2.5 pb-2.5 border-b border-slate-800 text-amber-400">
              <i class="fa-solid fa-user-check text-base"></i>
              <h2 class="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-200">
                1. Thông tin người đặt & liên hệ
              </h2>
            </div>

            <!-- Người đặt & Chủ tiệc -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <!-- Người đặt (Bắt buộc) -->
              <div class="space-y-1.5">
                <label for="field-bookerName" class="block text-xs font-semibold text-slate-300">
                  Tên người đặt bàn <span class="text-amber-400">*</span>
                </label>
                <input
                  id="field-bookerName"
                  v-model="form.bookerName"
                  type="text"
                  placeholder="Ví dụ: Nguyễn Văn A"
                  maxlength="80"
                  autocomplete="name"
                  class="w-full px-4 py-3 rounded-2xl bg-slate-950/80 border text-slate-100 placeholder-slate-500 text-[16px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition min-h-[48px]"
                  :class="errors.bookerName ? 'border-rose-500 focus:border-rose-500' : 'border-slate-800 focus:border-amber-500'"
                />
                <p v-if="errors.bookerName" class="text-xs text-rose-400 flex items-center gap-1 mt-1">
                  <i class="fa-solid fa-circle-exclamation"></i>{{ errors.bookerName }}
                </p>
              </div>

              <!-- Chủ tiệc (Không bắt buộc) -->
              <div class="space-y-1.5">
                <label for="field-hostName" class="block text-xs font-semibold text-slate-300">
                  Chủ tiệc <span class="text-slate-400 font-normal text-[11px]">(nếu đặt hộ người thân)</span>
                </label>
                <input
                  id="field-hostName"
                  v-model="form.hostName"
                  type="text"
                  placeholder="Ví dụ: Bé Bún, Chị Lan..."
                  maxlength="80"
                  class="w-full px-4 py-3 rounded-2xl bg-slate-950/80 border border-slate-800 text-slate-100 placeholder-slate-500 text-[16px] sm:text-sm focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40 transition min-h-[48px]"
                />
              </div>
            </div>

            <!-- SĐT / Zalo (Bắt buộc) -->
            <div class="space-y-1.5">
              <label for="field-phone" class="block text-xs font-semibold text-slate-300">
                Số điện thoại / Zalo nhận xác nhận <span class="text-amber-400">*</span>
              </label>
              <div class="relative">
                <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                  <i class="fa-solid fa-phone text-xs"></i>
                </div>
                <input
                  id="field-phone"
                  v-model="form.phone"
                  type="tel"
                  placeholder="0901 234 567"
                  maxlength="15"
                  autocomplete="tel"
                  class="w-full pl-11 pr-4 py-3 rounded-2xl bg-slate-950/80 border text-slate-100 placeholder-slate-500 text-[16px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition font-mono tracking-wide min-h-[48px]"
                  :class="errors.phone ? 'border-rose-500 focus:border-rose-500' : 'border-slate-800 focus:border-amber-500'"
                />
              </div>
              <p v-if="errors.phone" class="text-xs text-rose-400 flex items-center gap-1 mt-1">
                <i class="fa-solid fa-circle-exclamation"></i>{{ errors.phone }}
              </p>
              <p v-else class="text-[11px] text-slate-400">
                Nhân viên sẽ liên hệ số này để xác nhận bàn trống và chuẩn bị tiệc.
              </p>
            </div>
          </section>

          <!-- BƯỚC 2: THỜI GIAN & SỐ LƯỢNG KHÁCH -->
          <section class="bg-slate-900/90 border border-slate-800/90 rounded-3xl p-4 sm:p-6 shadow-xl space-y-4">
            <div class="flex items-center gap-2.5 pb-2.5 border-b border-slate-800 text-amber-400">
              <i class="fa-solid fa-calendar-days text-base"></i>
              <h2 class="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-200">
                2. Thời gian & Số lượng khách
              </h2>
            </div>

            <!-- Ngày & Giờ -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <!-- Ngày -->
              <div class="space-y-1.5">
                <label for="field-date" class="block text-xs font-semibold text-slate-300">
                  Ngày đặt tiệc <span class="text-amber-400">*</span>
                </label>
                <input
                  id="field-date"
                  v-model="form.date"
                  type="date"
                  :min="minDate"
                  class="w-full px-4 py-3 rounded-2xl bg-slate-950/80 border text-slate-100 text-[16px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition cursor-pointer min-h-[48px]"
                  :class="errors.date ? 'border-rose-500 focus:border-rose-500' : 'border-slate-800 focus:border-amber-500'"
                />
                <!-- Quick Date Chips -->
                <div class="flex items-center gap-1.5 flex-wrap pt-1">
                  <button
                    type="button"
                    class="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-300 hover:text-amber-300 hover:border-amber-500/50 transition active:scale-95"
                    @click="setQuickDate(0)"
                  >
                    Hôm nay
                  </button>
                  <button
                    type="button"
                    class="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-300 hover:text-amber-300 hover:border-amber-500/50 transition active:scale-95"
                    @click="setQuickDate(1)"
                  >
                    Ngày mai
                  </button>
                  <button
                    type="button"
                    class="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-300 hover:text-amber-300 hover:border-amber-500/50 transition active:scale-95"
                    @click="setQuickDate(2)"
                  >
                    Ngày kia
                  </button>
                  <button
                    type="button"
                    class="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-300 hover:text-amber-300 hover:border-amber-500/50 transition active:scale-95"
                    @click="setQuickDateWeekend(6)"
                  >
                    Thứ 7
                  </button>
                  <button
                    type="button"
                    class="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-300 hover:text-amber-300 hover:border-amber-500/50 transition active:scale-95"
                    @click="setQuickDateWeekend(0)"
                  >
                    Chủ Nhật
                  </button>
                </div>
                <p v-if="errors.date" class="text-xs text-rose-400 flex items-center gap-1 mt-1">
                  <i class="fa-solid fa-circle-exclamation"></i>{{ errors.date }}
                </p>
              </div>

              <!-- Giờ -->
              <div class="space-y-1.5">
                <label for="field-time" class="block text-xs font-semibold text-slate-300">
                  Giờ đến dự kiến <span class="text-amber-400">*</span>
                </label>
                <input
                  id="field-time"
                  v-model="form.time"
                  type="time"
                  step="900"
                  class="w-full px-4 py-3 rounded-2xl bg-slate-950/80 border text-slate-100 text-[16px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition cursor-pointer min-h-[48px]"
                  :class="errors.time ? 'border-rose-500 focus:border-rose-500' : 'border-slate-800 focus:border-amber-500'"
                />
                <!-- Quick Time Chips -->
                <div class="flex items-center gap-1.5 flex-wrap pt-1">
                  <button
                    v-for="qt in QUICK_TIMES"
                    :key="qt"
                    type="button"
                    class="px-2.5 py-1.5 rounded-xl bg-slate-950 border text-[11px] transition font-mono active:scale-95"
                    :class="form.time === qt ? 'border-amber-500 text-amber-300 bg-slate-900 font-bold' : 'border-slate-800 text-slate-300 hover:text-white'"
                    @click="form.time = qt; delete errors.time"
                  >
                    {{ qt }}
                  </button>
                </div>
                <p v-if="errors.time" class="text-xs text-rose-400 flex items-center gap-1 mt-1">
                  <i class="fa-solid fa-circle-exclamation"></i>{{ errors.time }}
                </p>
              </div>
            </div>

            <!-- Số lượng khách & Checkbox Trẻ em (QUY TẮC CỘNG TRẺ EM) -->
            <div class="space-y-3 pt-2">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <!-- Số lượng khách lớn -->
                <div class="space-y-1.5">
                  <label for="field-guestCount" class="block text-xs font-semibold text-slate-300">
                    Số lượng khách lớn <span class="text-amber-400">*</span>
                  </label>
                  <div class="flex items-center gap-2">
                    <!-- Nút giảm -->
                    <button
                      type="button"
                      class="w-12 h-12 rounded-2xl bg-slate-950 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 flex items-center justify-center text-lg active:scale-90 transition shrink-0"
                      @click="adjustGuests(-1)"
                      aria-label="Giảm 1 khách"
                    >
                      <i class="fa-solid fa-minus"></i>
                    </button>
                    <input
                      id="field-guestCount"
                      v-model.number="form.guestCount"
                      type="number"
                      min="1"
                      max="200"
                      placeholder="Số khách"
                      class="w-full text-center px-2 py-3 rounded-2xl bg-slate-950/80 border text-slate-100 placeholder-slate-500 text-[18px] sm:text-base focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition font-mono font-bold min-h-[48px]"
                      :class="errors.guestCount ? 'border-rose-500 focus:border-rose-500' : 'border-slate-800 focus:border-amber-500'"
                    />
                    <!-- Nút tăng -->
                    <button
                      type="button"
                      class="w-12 h-12 rounded-2xl bg-slate-950 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 flex items-center justify-center text-lg active:scale-90 transition shrink-0"
                      @click="adjustGuests(1)"
                      aria-label="Tăng 1 khách"
                    >
                      <i class="fa-solid fa-plus"></i>
                    </button>
                  </div>

                  <!-- Quick Pax Chips -->
                  <div class="flex items-center gap-1 flex-wrap pt-1">
                    <button
                      v-for="qp in QUICK_PAX"
                      :key="qp"
                      type="button"
                      class="px-2.5 py-1 rounded-xl bg-slate-950 border text-[11px] font-mono transition active:scale-95"
                      :class="form.guestCount === qp ? 'border-amber-500 text-amber-300 bg-slate-900 font-bold' : 'border-slate-800 text-slate-400 hover:text-white'"
                      @click="form.guestCount = qp; delete errors.guestCount"
                    >
                      {{ qp }}
                    </button>
                  </div>
                  <p v-if="errors.guestCount" class="text-xs text-rose-400 flex items-center gap-1 mt-1">
                    <i class="fa-solid fa-circle-exclamation"></i>{{ errors.guestCount }}
                  </p>
                </div>

                <!-- Có trẻ em (Switch Toggle phong cách iOS) -->
                <div class="flex flex-col justify-between space-y-2 pt-1">
                  <div
                    class="p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800 hover:border-slate-700 transition flex items-center justify-between cursor-pointer select-none"
                    @click="form.hasChildren = !form.hasChildren"
                  >
                    <div class="flex flex-col">
                      <span class="text-xs font-bold text-slate-200">
                        Đoàn có trẻ em đi kèm
                      </span>
                      <span class="text-[11px] text-slate-400">
                        Nhà hàng chuẩn bị ghế trẻ em
                      </span>
                    </div>

                    <!-- iOS Switch Indicator -->
                    <div
                      class="w-12 h-7 rounded-full transition-colors duration-300 p-0.5 flex items-center relative"
                      :class="form.hasChildren ? 'bg-amber-500' : 'bg-slate-800'"
                    >
                      <div
                        class="w-6 h-6 rounded-full bg-white shadow-md transform transition-transform duration-300"
                        :class="form.hasChildren ? 'translate-x-5' : 'translate-x-0'"
                      ></div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Input Số trẻ em (Hiển thị khi bật HasChildren) -->
              <div
                v-if="form.hasChildren"
                class="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl space-y-2 animate-fade-in"
              >
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <label for="field-childrenCount" class="block text-xs font-bold text-amber-300">
                    Số lượng trẻ em <span class="text-amber-400">*</span>
                  </label>
                  <span class="text-[11px] text-amber-200/80">
                    Trẻ em được cộng thêm vào tổng khách
                  </span>
                </div>

                <div class="flex items-center gap-2 max-w-xs">
                  <button
                    type="button"
                    class="w-11 h-11 rounded-xl bg-slate-950 border border-amber-500/30 text-amber-300 hover:text-white flex items-center justify-center text-base active:scale-90 transition shrink-0"
                    @click="adjustChildren(-1)"
                  >
                    <i class="fa-solid fa-minus"></i>
                  </button>
                  <input
                    id="field-childrenCount"
                    v-model.number="form.childrenCount"
                    type="number"
                    min="0"
                    max="100"
                    placeholder="Số lượng bé"
                    class="w-full text-center px-2 py-2.5 rounded-xl bg-slate-950 border text-slate-100 text-[18px] sm:text-base focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition font-mono font-bold min-h-[44px]"
                    :class="errors.childrenCount ? 'border-rose-500' : 'border-amber-500/40 focus:border-amber-400'"
                  />
                  <button
                    type="button"
                    class="w-11 h-11 rounded-xl bg-slate-950 border border-amber-500/30 text-amber-300 hover:text-white flex items-center justify-center text-base active:scale-90 transition shrink-0"
                    @click="adjustChildren(1)"
                  >
                    <i class="fa-solid fa-plus"></i>
                  </button>
                </div>

                <p v-if="errors.childrenCount" class="text-xs text-rose-400 flex items-center gap-1 mt-1">
                  <i class="fa-solid fa-circle-exclamation"></i>{{ errors.childrenCount }}
                </p>
              </div>

              <!-- HIỂN THỊ TỔNG LƯỢNG KHÁCH TRỰC QUAN -->
              <div
                v-if="form.guestCount"
                class="p-3.5 bg-slate-950 border border-amber-500/40 rounded-2xl flex items-center justify-between gap-2 text-xs shadow-inner"
              >
                <div class="flex items-center gap-2">
                  <i class="fa-solid fa-users text-amber-400 text-sm"></i>
                  <span class="text-slate-300">Tổng khách phục vụ:</span>
                  <span class="font-black text-amber-300 text-base font-mono">
                    {{ totalGuestsCount }} người
                  </span>
                </div>
                <div v-if="form.hasChildren && Number(form.childrenCount) > 0" class="text-[11px] text-slate-400 text-right">
                  ({{ form.guestCount }} lớn + {{ form.childrenCount }} trẻ em)
                </div>
              </div>
            </div>
          </section>

          <!-- BƯỚC 3: NHU CẦU / LOẠI TIỆC & TÔNG MÀU -->
          <section class="bg-slate-900/90 border border-slate-800/90 rounded-3xl p-4 sm:p-6 shadow-xl space-y-4">
            <div class="flex items-center gap-2.5 pb-2.5 border-b border-slate-800 text-amber-400">
              <i class="fa-solid fa-cake-candles text-base"></i>
              <h2 class="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-200">
                3. Nhu cầu tiệc & Tông màu
              </h2>
            </div>

            <!-- Loại tiệc (Cards có icon) -->
            <div class="space-y-2">
              <label class="block text-xs font-semibold text-slate-300">
                Nhu cầu / Loại tiệc <span class="text-amber-400">*</span>
              </label>
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  v-for="party in PARTY_TYPE_OPTIONS"
                  :key="party.label"
                  type="button"
                  class="p-3 rounded-2xl text-xs font-semibold border transition text-center select-none min-h-[48px] flex items-center justify-center gap-2 active:scale-95"
                  :class="form.partyType === party.label
                    ? 'bg-amber-500 text-slate-950 font-black border-amber-400 shadow-md shadow-amber-500/20'
                    : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:bg-slate-850 hover:text-white'"
                  @click="selectPartyType(party.label)"
                >
                  <span class="text-base">{{ party.icon }}</span>
                  <span>{{ party.label }}</span>
                </button>
              </div>
              <p v-if="errors.partyType" class="text-xs text-rose-400 flex items-center gap-1 mt-1">
                <i class="fa-solid fa-circle-exclamation"></i>{{ errors.partyType }}
              </p>

              <!-- Ô nhập Loại tiệc khác -->
              <div v-if="form.partyType === 'Khác'" class="pt-2 animate-fade-in">
                <label for="field-customPartyType" class="block text-xs font-semibold text-amber-300 mb-1">
                  Ghi rõ loại tiệc của quý khách <span class="text-amber-400">*</span>
                </label>
                <input
                  id="field-customPartyType"
                  v-model="form.customPartyType"
                  type="text"
                  placeholder="Ví dụ: Họp lớp, Báo hỷ, Tiệc gia đình..."
                  maxlength="50"
                  class="w-full px-4 py-3 rounded-2xl bg-slate-950/80 border text-slate-100 placeholder-slate-500 text-[16px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition min-h-[48px]"
                  :class="errors.customPartyType ? 'border-rose-500' : 'border-slate-800 focus:border-amber-500'"
                />
                <p v-if="errors.customPartyType" class="text-xs text-rose-400 flex items-center gap-1 mt-1">
                  <i class="fa-solid fa-circle-exclamation"></i>{{ errors.customPartyType }}
                </p>
              </div>
            </div>

            <!-- Tông màu mong muốn (Chấm màu trực quan) -->
            <div class="space-y-2 pt-2">
              <label class="block text-xs font-semibold text-slate-300">
                Tông màu trang trí tiệc <span class="text-slate-400 font-normal text-[11px]">(tùy chọn)</span>
              </label>
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  v-for="color in COLOR_TONES"
                  :key="color.name"
                  type="button"
                  class="px-3 py-2.5 rounded-2xl text-xs font-medium border flex items-center justify-center gap-2 transition select-none min-h-[44px] active:scale-95"
                  :class="form.colorTone === color.name
                    ? 'bg-slate-850 text-amber-300 border-amber-400 shadow-md font-bold'
                    : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:bg-slate-850 hover:text-slate-100'"
                  @click="selectColorTone(color.name)"
                >
                  <span
                    class="w-4 h-4 rounded-full shrink-0 shadow-inner"
                    :style="{ backgroundColor: color.hex, border: color.border ? `1px solid ${color.border}` : 'none' }"
                  ></span>
                  <span>{{ color.name }}</span>
                </button>
              </div>
            </div>
          </section>

          <!-- BƯỚC 4: GHI CHÚ KHÁC -->
          <section class="bg-slate-900/90 border border-slate-800/90 rounded-3xl p-4 sm:p-6 shadow-xl space-y-2">
            <label for="field-note" class="block text-xs font-semibold text-slate-300">
              Ghi chú thêm <span class="text-slate-400 font-normal text-[11px]">(món ăn dự kiến, trang trí, vị trí ngồi...)</span>
            </label>
            <textarea
              id="field-note"
              v-model="form.note"
              rows="3"
              maxlength="500"
              placeholder="Quý khách có thể ghi món dự kiến, yêu cầu trang trí hoặc những lưu ý khác cho buổi tiệc..."
              class="w-full px-4 py-3 rounded-2xl bg-slate-950/80 border border-slate-800 text-slate-100 placeholder-slate-500 text-[16px] sm:text-sm focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/40 transition leading-relaxed resize-y"
            ></textarea>
            <div class="flex justify-between text-[11px] text-slate-400">
              <span>{{ RESTAURANT_NAME }} sẽ nỗ lực chuẩn bị tốt nhất theo mong muốn của quý khách.</span>
              <span>{{ (form.note || '').length }}/500</span>
            </div>
            <p v-if="errors.note" class="text-xs text-rose-400 flex items-center gap-1 mt-1">
              <i class="fa-solid fa-circle-exclamation"></i>{{ errors.note }}
            </p>
          </section>

          <!-- THÔNG TIN HỖ TRỢ TRỰC TIẾP ZALO -->
          <div class="bg-gradient-to-r from-slate-950 via-blue-950/25 to-slate-950 border border-blue-500/30 rounded-3xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left shadow-lg">
            <div class="flex items-center gap-3">
              <div class="w-11 h-11 rounded-2xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 shrink-0 shadow-inner">
                <i class="fa-solid fa-comments text-xl"></i>
              </div>
              <div class="text-xs text-slate-300 space-y-0.5">
                <p class="font-bold text-slate-100 text-sm">Cần hỗ trợ trực tiếp nhanh?</p>
                <p class="text-slate-400">
                  Hotline nhân viên: <strong class="text-blue-400 font-mono text-sm">{{ RESTAURANT_HOTLINE }}</strong>
                </p>
              </div>
            </div>

            <a
              :href="RESTAURANT_ZALO_URL"
              target="_blank"
              rel="noopener noreferrer"
              class="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition flex items-center justify-center gap-2 shadow-md shadow-blue-600/30 shrink-0 min-h-[44px]"
            >
              <i class="fa-solid fa-comment-dots"></i>
              <span>Nhắn Zalo</span>
            </a>
          </div>

          <!-- NÚT TIẾP TỤC KIỂM TRA (STICKY ACTION BAR WITH LIVE SUMMARY) -->
          <div class="sticky bottom-3 z-30 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <div class="bg-slate-950/95 border border-amber-500/40 rounded-3xl p-3 shadow-2xl backdrop-blur-xl flex flex-col gap-2">
              <!-- Live Summary Bar -->
              <div class="flex items-center justify-between px-2 text-xs text-slate-300">
                <div class="flex items-center gap-2">
                  <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span class="font-bold text-amber-300">{{ totalGuestsCount || '—' }} khách</span>
                  <span class="text-slate-500">•</span>
                  <span>{{ form.time || 'Chưa chọn giờ' }}</span>
                  <span class="text-slate-500">•</span>
                  <span>{{ displayDate || 'Chưa chọn ngày' }}</span>
                </div>
                <span class="text-[11px] text-slate-400 italic">Bước 1 / 3</span>
              </div>

              <!-- Button CTA -->
              <button
                type="submit"
                class="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-base uppercase tracking-wider shadow-2xl shadow-amber-500/30 active:scale-[0.98] transition flex items-center justify-center gap-2 border border-amber-300/50 cursor-pointer min-h-[52px]"
              >
                <span>Tiếp tục kiểm tra thông tin</span>
                <i class="fa-solid fa-arrow-right text-sm"></i>
              </button>
            </div>
          </div>
        </form>
      </div>
    </main>

    <!-- FOOTER KHÁCH HÀNG (KHÔNG CÓ LINK VỀ WEBAPP NHÂN VIÊN) -->
    <footer class="relative z-10 w-full border-t border-slate-900 bg-slate-950/90 py-5 px-4 text-center text-xs text-slate-400 space-y-1.5 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <p class="font-bold text-slate-300 tracking-wide font-display">
        © {{ RESTAURANT_NAME }}
      </p>
      <p class="text-[11px] text-slate-400">
        Hotline đặt tiệc: <span class="text-amber-400 font-mono font-bold">{{ RESTAURANT_HOTLINE }}</span> · Giờ phục vụ: 10:00 – 23:00 hàng ngày
      </p>
    </footer>

    <!-- REVIEW MODAL -->
    <CustomerReviewModal
      v-if="submissionState === 'REVIEWING' || submissionState === 'SUBMITTING'"
      :form="form"
      :display-date="displayDate"
      :submitting="submissionState === 'SUBMITTING'"
      @close="onBackToEdit"
      @edit="onBackToEdit"
      @confirm="onConfirmSubmit"
    />
  </div>
</template>

<style scoped>
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
