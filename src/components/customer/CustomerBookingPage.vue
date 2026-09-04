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
function setQuickDateWeekend(dayOfWeek: number) {
  const target = new Date()
  const currentDay = target.getDay()
  let diff = (dayOfWeek - currentDay + 7) % 7
  if (diff === 0) diff = 7
  target.setDate(target.getDate() + diff)
  form.date = target.toISOString().split('T')[0]
  delete errors.date
}

// Quick Times & Pax
const QUICK_TIMES = ['17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30']
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

// Ensure smooth independent scrolling & guest isolation
onMounted(() => {
  try {
    sessionStorage.setItem('kg_guest_mode', '1')
    document.documentElement.classList.add('customer-booking-mode')
    document.body.classList.add('customer-booking-mode')
    document.body.classList.remove('overflow-hidden')
    document.body.style.overflow = 'auto'
    document.documentElement.style.overflow = 'auto'
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
  const scrollContainer = document.getElementById('booking-scroll-container')
  if (scrollContainer) scrollContainer.scrollTo({ top: 0, behavior: 'smooth' })
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
  <!-- FIXED ROOT CONTAINER ENABLES NATIVE, INDEPENDENT SCROLLING ON ALL PLATFORMS -->
  <div
    id="booking-scroll-container"
    class="fixed inset-0 w-full h-full overflow-y-auto overflow-x-hidden bg-slate-100 font-sans text-slate-800 antialiased selection:bg-blue-600 selection:text-white"
    style="-webkit-overflow-scrolling: touch; touch-action: pan-y;"
  >
    <!-- TOP DECORATIVE GRADIENT ACCENT -->
    <div class="h-1.5 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 sticky top-0 z-40"></div>

    <!-- MAIN WRAPPER -->
    <div class="min-h-full flex flex-col justify-between">
      <main class="w-full max-w-xl mx-auto px-3.5 sm:px-5 py-5 sm:py-7 flex-1 flex flex-col space-y-4 sm:space-y-5">
        <!-- MÀN HÌNH THÀNH CÔNG -->
        <CustomerBookingSuccess
          v-if="submissionState === 'SUCCESS'"
          :booking-id="createdBookingId"
          :submitted-data="submittedData"
          :submitted-at="submittedAt"
          @new-booking="onStartNewBooking"
        />

        <!-- FORM NHẬP THÔNG TIN (DRAFT / REVIEWING / SUBMITTING / FAILED) -->
        <div v-else class="space-y-4 sm:space-y-5">
          <!-- BRANDING HEADER WITH OFFICIAL WEBAPP LOGO & STYLE -->
          <header class="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200/80 text-center space-y-3 relative overflow-hidden">
            <!-- Subtle background orb -->
            <div class="absolute -top-10 -right-10 w-36 h-36 bg-blue-500/10 rounded-full blur-2xl pointer-events-none"></div>

            <!-- Logo Webapp Chính Thức -->
            <div class="flex justify-center">
              <div class="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white border border-slate-200 p-2 shadow-md flex items-center justify-center transform hover:scale-105 transition duration-300">
                <img src="/favicon.svg" :alt="RESTAURANT_NAME" class="w-full h-full object-contain" />
              </div>
            </div>

            <!-- Restaurant Name Badge -->
            <div class="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-black tracking-widest uppercase shadow-sm">
              <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>{{ RESTAURANT_NAME }}</span>
            </div>

            <h1 class="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 uppercase font-display">
              Đặt bàn online
            </h1>

            <p class="text-xs sm:text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
              Quý khách chỉ mất 1 phút gửi thông tin. Nhân viên <strong class="text-blue-700">{{ RESTAURANT_NAME }}</strong> sẽ kiểm tra bàn và gọi lại xác nhận ngay!
            </p>

            <!-- Step Progress Indicator -->
            <div class="flex items-center justify-center gap-2 pt-2 text-[11px] text-slate-500">
              <span class="flex items-center gap-1.5 text-blue-600 font-bold">
                <span class="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-black">1</span>
                Điền thông tin
              </span>
              <span class="text-slate-300">———</span>
              <span class="flex items-center gap-1.5">
                <span class="w-5 h-5 rounded-full bg-slate-100 border border-slate-200 text-slate-500 flex items-center justify-center text-[10px] font-bold">2</span>
                Xem lại
              </span>
              <span class="text-slate-300">———</span>
              <span class="flex items-center gap-1.5">
                <span class="w-5 h-5 rounded-full bg-slate-100 border border-slate-200 text-slate-500 flex items-center justify-center text-[10px] font-bold">3</span>
                Nhận phiếu
              </span>
            </div>
          </header>

          <!-- THÔNG BÁO KHÔI PHỤC BẢN NHÁP -->
          <div
            v-if="draftRestored"
            class="p-3.5 bg-blue-50 border border-blue-200 rounded-2xl flex items-center justify-between text-blue-800 text-xs shadow-sm animate-fade-in"
          >
            <div class="flex items-center gap-2.5">
              <i class="fa-solid fa-clock-rotate-left text-blue-600 text-sm"></i>
              <span>Đã tự động khôi phục dữ liệu quý khách nhập trước đó.</span>
            </div>
            <button
              type="button"
              class="text-blue-600 hover:text-blue-900 font-semibold p-1.5 rounded-lg"
              aria-label="Ẩn thông báo"
              @click="draftRestored = false"
            >
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <!-- THÔNG BÁO LỖI NẾU SUBMIT THẤT BẠI -->
          <div
            v-if="submissionState === 'FAILED'"
            class="p-4 bg-rose-50 border border-rose-200 rounded-2xl space-y-3 animate-shake shadow-sm"
          >
            <div class="flex items-start gap-2.5 text-rose-800 text-sm font-medium">
              <i class="fa-solid fa-triangle-exclamation text-rose-500 mt-0.5 shrink-0 text-base"></i>
              <div>
                <p class="font-bold text-rose-900">Chưa thể gửi yêu cầu đặt bàn</p>
                <p class="text-xs text-rose-700 mt-0.5">
                  {{ errorMessage || 'Kết nối mạng gián đoạn. Dữ liệu đã nhập vẫn an toàn trên máy. Quý khách vui lòng bấm thử lại.' }}
                </p>
              </div>
            </div>

            <div class="flex items-center gap-3 pt-1">
              <button
                type="button"
                class="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                @click="retrySubmit"
              >
                <i class="fa-solid fa-rotate-right"></i>
                Thử gửi lại
              </button>
              <a
                :href="RESTAURANT_ZALO_URL"
                target="_blank"
                rel="noopener noreferrer"
                class="text-xs text-slate-600 hover:text-slate-900 underline font-medium"
              >
                Zalo hỗ trợ: {{ RESTAURANT_HOTLINE }}
              </a>
            </div>
          </div>

          <!-- FORM CHÍNH (THEME TRẮNG / SLATE CHUẨN WEBAPP CHÍNH THỨC) -->
          <form class="space-y-4 sm:space-y-5" @submit.prevent="onContinueToReview">
            <!-- BƯỚC 1: THÔNG TIN LIÊN HỆ -->
            <section class="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200/90 space-y-4 relative overflow-hidden">
              <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500"></div>

              <div class="flex items-center gap-2.5 pb-2 border-b border-slate-100">
                <div class="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-sm shadow-sm border border-blue-100 shrink-0">
                  <i class="fa-solid fa-user-tag"></i>
                </div>
                <div>
                  <h2 class="font-black text-slate-800 text-xs uppercase tracking-widest">
                    1. Thông tin người đặt & liên hệ
                  </h2>
                  <p class="text-[10px] font-bold text-slate-400">Tên người đặt và số điện thoại nhận xác nhận</p>
                </div>
              </div>

              <!-- Người đặt & Chủ tiệc -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <!-- Người đặt (Bắt buộc) -->
                <div class="space-y-1.5">
                  <label for="field-bookerName" class="block text-xs font-bold text-slate-700">
                    Tên người đặt bàn <span class="text-rose-500">*</span>
                  </label>
                  <input
                    id="field-bookerName"
                    v-model="form.bookerName"
                    type="text"
                    placeholder="Ví dụ: Anh Nam, Chị Linh..."
                    maxlength="80"
                    autocomplete="name"
                    class="w-full px-4 py-3 rounded-2xl bg-slate-50 border text-slate-800 placeholder-slate-400 text-[16px] sm:text-sm focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-600 transition min-h-[50px]"
                    :class="errors.bookerName ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-100' : 'border-slate-200'"
                  />
                  <p v-if="errors.bookerName" class="text-xs text-rose-500 flex items-center gap-1 mt-1 font-medium">
                    <i class="fa-solid fa-circle-exclamation"></i>{{ errors.bookerName }}
                  </p>
                </div>

                <!-- Chủ tiệc (Không bắt buộc) -->
                <div class="space-y-1.5">
                  <label for="field-hostName" class="block text-xs font-bold text-slate-700">
                    Chủ tiệc <span class="text-slate-400 font-normal text-[11px]">(nếu đặt hộ người thân)</span>
                  </label>
                  <input
                    id="field-hostName"
                    v-model="form.hostName"
                    type="text"
                    placeholder="Ví dụ: Bé Bún, Anh Tuấn..."
                    maxlength="80"
                    class="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 text-[16px] sm:text-sm focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-600 transition min-h-[50px]"
                  />
                </div>
              </div>

              <!-- SĐT / Zalo (Bắt buộc) -->
              <div class="space-y-1.5">
                <label for="field-phone" class="block text-xs font-bold text-slate-700">
                  Số điện thoại / Zalo nhận xác nhận <span class="text-rose-500">*</span>
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
                    class="w-full pl-11 pr-4 py-3 rounded-2xl bg-slate-50 border text-slate-800 placeholder-slate-400 text-[16px] sm:text-sm focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-600 transition font-mono min-h-[50px]"
                    :class="errors.phone ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-100' : 'border-slate-200'"
                  />
                </div>
                <p v-if="errors.phone" class="text-xs text-rose-500 flex items-center gap-1 mt-1 font-medium">
                  <i class="fa-solid fa-circle-exclamation"></i>{{ errors.phone }}
                </p>
                <p v-else class="text-[11px] text-slate-400 font-medium">
                  Nhà hàng sẽ liên hệ số này để xác nhận bàn trống và tiếp đón chu đáo.
                </p>
              </div>
            </section>

            <!-- BƯỚC 2: THỜI GIAN & SỐ LƯỢNG KHÁCH -->
            <section class="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200/90 space-y-4 relative overflow-hidden">
              <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500"></div>

              <div class="flex items-center gap-2.5 pb-2 border-b border-slate-100">
                <div class="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-sm shadow-sm border border-indigo-100 shrink-0">
                  <i class="fa-solid fa-calendar-check"></i>
                </div>
                <div>
                  <h2 class="font-black text-slate-800 text-xs uppercase tracking-widest">
                    2. Thời gian đón tiệc & Số lượng khách
                  </h2>
                  <p class="text-[10px] font-bold text-slate-400">Chọn ngày, giờ và số lượng khách phục vụ</p>
                </div>
              </div>

              <!-- Ngày & Giờ -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <!-- Ngày -->
                <div class="space-y-1.5">
                  <label for="field-date" class="block text-xs font-bold text-slate-700">
                    Ngày đặt tiệc <span class="text-rose-500">*</span>
                  </label>
                  <input
                    id="field-date"
                    v-model="form.date"
                    type="date"
                    :min="minDate"
                    class="w-full px-4 py-3 rounded-2xl bg-slate-50 border text-slate-800 text-[16px] sm:text-sm focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-600 transition cursor-pointer min-h-[50px]"
                    :class="errors.date ? 'border-rose-400 focus:border-rose-500' : 'border-slate-200'"
                  />
                  <!-- Quick Date Chips -->
                  <div class="flex items-center gap-1.5 flex-wrap pt-1">
                    <button
                      type="button"
                      class="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-700 hover:border-blue-400 hover:text-blue-600 shadow-sm transition active:scale-95 min-h-[34px]"
                      @click="setQuickDate(0)"
                    >
                      Hôm nay
                    </button>
                    <button
                      type="button"
                      class="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-700 hover:border-blue-400 hover:text-blue-600 shadow-sm transition active:scale-95 min-h-[34px]"
                      @click="setQuickDate(1)"
                    >
                      Ngày mai
                    </button>
                    <button
                      type="button"
                      class="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-700 hover:border-blue-400 hover:text-blue-600 shadow-sm transition active:scale-95 min-h-[34px]"
                      @click="setQuickDate(2)"
                    >
                      Ngày kia
                    </button>
                    <button
                      type="button"
                      class="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-700 hover:border-blue-400 hover:text-blue-600 shadow-sm transition active:scale-95 min-h-[34px]"
                      @click="setQuickDateWeekend(6)"
                    >
                      Thứ 7
                    </button>
                    <button
                      type="button"
                      class="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-700 hover:border-blue-400 hover:text-blue-600 shadow-sm transition active:scale-95 min-h-[34px]"
                      @click="setQuickDateWeekend(0)"
                    >
                      Chủ Nhật
                    </button>
                  </div>
                  <p v-if="errors.date" class="text-xs text-rose-500 flex items-center gap-1 mt-1 font-medium">
                    <i class="fa-solid fa-circle-exclamation"></i>{{ errors.date }}
                  </p>
                </div>

                <!-- Giờ -->
                <div class="space-y-1.5">
                  <label for="field-time" class="block text-xs font-bold text-slate-700">
                    Giờ đến dự kiến <span class="text-rose-500">*</span>
                  </label>
                  <input
                    id="field-time"
                    v-model="form.time"
                    type="time"
                    step="900"
                    class="w-full px-4 py-3 rounded-2xl bg-slate-50 border text-slate-800 text-[16px] sm:text-sm focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-600 transition cursor-pointer min-h-[50px]"
                    :class="errors.time ? 'border-rose-400 focus:border-rose-500' : 'border-slate-200'"
                  />
                  <!-- Quick Time Chips -->
                  <div class="flex items-center gap-1.5 flex-wrap pt-1">
                    <button
                      v-for="qt in QUICK_TIMES"
                      :key="qt"
                      type="button"
                      class="px-2.5 py-1.5 rounded-xl text-xs font-mono font-bold transition active:scale-95 min-h-[34px]"
                      :class="form.time === qt ? 'bg-blue-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:border-blue-300'"
                      @click="form.time = qt; delete errors.time"
                    >
                      {{ qt }}
                    </button>
                  </div>
                  <p v-if="errors.time" class="text-xs text-rose-500 flex items-center gap-1 mt-1 font-medium">
                    <i class="fa-solid fa-circle-exclamation"></i>{{ errors.time }}
                  </p>
                </div>
              </div>

              <!-- Số lượng khách & Checkbox Trẻ em (QUY TẮC CỘNG TRẺ EM) -->
              <div class="space-y-3 pt-2">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <!-- Số lượng khách lớn -->
                  <div class="space-y-1.5">
                    <label for="field-guestCount" class="block text-xs font-bold text-slate-700">
                      Số lượng khách lớn <span class="text-rose-500">*</span>
                    </label>
                    <div class="flex items-center gap-2">
                      <!-- Nút giảm -->
                      <button
                        type="button"
                        class="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900 flex items-center justify-center text-lg active:scale-90 transition shrink-0 cursor-pointer"
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
                        class="w-full text-center px-2 py-3 rounded-2xl bg-slate-50 border text-slate-900 placeholder-slate-400 text-[18px] sm:text-base focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-600 transition font-mono font-bold min-h-[50px]"
                        :class="errors.guestCount ? 'border-rose-400' : 'border-slate-200'"
                      />
                      <!-- Nút tăng -->
                      <button
                        type="button"
                        class="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900 flex items-center justify-center text-lg active:scale-90 transition shrink-0 cursor-pointer"
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
                        class="px-2.5 py-1 rounded-xl text-xs font-mono transition active:scale-95 min-h-[30px]"
                        :class="form.guestCount === qp ? 'bg-blue-600 text-white font-bold shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:border-blue-300'"
                        @click="form.guestCount = qp; delete errors.guestCount"
                      >
                        {{ qp }}
                      </button>
                    </div>
                    <p v-if="errors.guestCount" class="text-xs text-rose-500 flex items-center gap-1 mt-1 font-medium">
                      <i class="fa-solid fa-circle-exclamation"></i>{{ errors.guestCount }}
                    </p>
                  </div>

                  <!-- Có trẻ em (Switch Toggle iOS) -->
                  <div class="flex flex-col justify-between space-y-2 pt-1">
                    <div
                      class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 hover:border-slate-300 transition flex items-center justify-between cursor-pointer select-none"
                      @click="form.hasChildren = !form.hasChildren"
                    >
                      <div class="flex flex-col">
                        <span class="text-xs font-bold text-slate-800">
                          Đoàn có trẻ em đi kèm
                        </span>
                        <span class="text-[11px] text-slate-500 font-medium">
                          Nhà hàng chuẩn bị ghế trẻ em
                        </span>
                      </div>

                      <!-- iOS Switch -->
                      <div
                        class="w-12 h-7 rounded-full transition-colors duration-300 p-0.5 flex items-center relative"
                        :class="form.hasChildren ? 'bg-blue-600' : 'bg-slate-300'"
                      >
                        <div
                          class="w-6 h-6 rounded-full bg-white shadow-md transform transition-transform duration-300"
                          :class="form.hasChildren ? 'translate-x-5' : 'translate-x-0'"
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Input Số trẻ em (Hiển thị khi tick) -->
                <div
                  v-if="form.hasChildren"
                  class="p-4 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-2 animate-fade-in"
                >
                  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <label for="field-childrenCount" class="block text-xs font-bold text-amber-900">
                      Số lượng trẻ em <span class="text-rose-500">*</span>
                    </label>
                    <span class="text-[11px] text-amber-800 font-medium">
                      Trẻ em được cộng thêm vào tổng lượng khách
                    </span>
                  </div>

                  <div class="flex items-center gap-2 max-w-xs">
                    <button
                      type="button"
                      class="w-11 h-11 rounded-xl bg-white border border-amber-200 text-amber-900 hover:bg-amber-100 flex items-center justify-center text-base active:scale-90 transition shrink-0 cursor-pointer shadow-sm"
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
                      class="w-full text-center px-2 py-2.5 rounded-xl bg-white border border-amber-300 text-amber-950 text-[18px] sm:text-base focus:outline-none focus:ring-4 focus:ring-amber-100 focus:border-amber-500 transition font-mono font-bold min-h-[46px]"
                      :class="errors.childrenCount ? 'border-rose-500' : ''"
                    />
                    <button
                      type="button"
                      class="w-11 h-11 rounded-xl bg-white border border-amber-200 text-amber-900 hover:bg-amber-100 flex items-center justify-center text-base active:scale-90 transition shrink-0 cursor-pointer shadow-sm"
                      @click="adjustChildren(1)"
                    >
                      <i class="fa-solid fa-plus"></i>
                    </button>
                  </div>

                  <p v-if="errors.childrenCount" class="text-xs text-rose-500 flex items-center gap-1 mt-1 font-medium">
                    <i class="fa-solid fa-circle-exclamation"></i>{{ errors.childrenCount }}
                  </p>
                </div>

                <!-- HIỂN THỊ TỔNG LƯỢNG KHÁCH TRỰC QUAN -->
                <div
                  v-if="form.guestCount"
                  class="p-4 bg-blue-50/80 border border-blue-200 rounded-2xl flex items-center justify-between gap-2 text-xs shadow-sm"
                >
                  <div class="flex items-center gap-2">
                    <i class="fa-solid fa-users text-blue-600 text-sm"></i>
                    <span class="text-slate-700 font-bold">Tổng khách phục vụ:</span>
                    <span class="font-black text-blue-700 text-base font-mono">
                      {{ totalGuestsCount }} người
                    </span>
                  </div>
                  <div v-if="form.hasChildren && Number(form.childrenCount) > 0" class="text-[11px] text-slate-500 text-right font-medium">
                    ({{ form.guestCount }} lớn + {{ form.childrenCount }} trẻ em)
                  </div>
                </div>
              </div>
            </section>

            <!-- BƯỚC 3: NHU CẦU / LOẠI TIỆC & TÔNG MÀU -->
            <section class="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200/90 space-y-4 relative overflow-hidden">
              <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500"></div>

              <div class="flex items-center gap-2.5 pb-2 border-b border-slate-100">
                <div class="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center text-sm shadow-sm border border-purple-100 shrink-0">
                  <i class="fa-solid fa-cake-candles"></i>
                </div>
                <div>
                  <h2 class="font-black text-slate-800 text-xs uppercase tracking-widest">
                    3. Nhu cầu tiệc & Tông màu
                  </h2>
                  <p class="text-[10px] font-bold text-slate-400">Chọn tính chất buổi tiệc và phong cách trang trí</p>
                </div>
              </div>

              <!-- Loại tiệc (Cards có icon) -->
              <div class="space-y-2">
                <label class="block text-xs font-bold text-slate-700">
                  Nhu cầu / Loại tiệc <span class="text-rose-500">*</span>
                </label>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    v-for="party in PARTY_TYPE_OPTIONS"
                    :key="party.label"
                    type="button"
                    class="p-3 rounded-2xl text-xs font-bold border transition text-center select-none min-h-[48px] flex items-center justify-center gap-2 active:scale-95 cursor-pointer shadow-sm"
                    :class="form.partyType === party.label
                      ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20 font-black'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'"
                    @click="selectPartyType(party.label)"
                  >
                    <span class="text-base">{{ party.icon }}</span>
                    <span>{{ party.label }}</span>
                  </button>
                </div>
                <p v-if="errors.partyType" class="text-xs text-rose-500 flex items-center gap-1 mt-1 font-medium">
                  <i class="fa-solid fa-circle-exclamation"></i>{{ errors.partyType }}
                </p>

                <!-- Ô nhập Loại tiệc khác -->
                <div v-if="form.partyType === 'Khác'" class="pt-2 animate-fade-in">
                  <label for="field-customPartyType" class="block text-xs font-bold text-blue-700 mb-1">
                    Ghi rõ loại tiệc của quý khách <span class="text-rose-500">*</span>
                  </label>
                  <input
                    id="field-customPartyType"
                    v-model="form.customPartyType"
                    type="text"
                    placeholder="Ví dụ: Họp lớp, Báo hỷ, Tiệc gia đình..."
                    maxlength="50"
                    class="w-full px-4 py-3 rounded-2xl bg-slate-50 border text-slate-800 placeholder-slate-400 text-[16px] sm:text-sm focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-600 transition min-h-[50px]"
                    :class="errors.customPartyType ? 'border-rose-400' : 'border-slate-200'"
                  />
                  <p v-if="errors.customPartyType" class="text-xs text-rose-500 flex items-center gap-1 mt-1 font-medium">
                    <i class="fa-solid fa-circle-exclamation"></i>{{ errors.customPartyType }}
                  </p>
                </div>
              </div>

              <!-- Tông màu mong muốn (Chấm màu trực quan) -->
              <div class="space-y-2 pt-2">
                <label class="block text-xs font-bold text-slate-700">
                  Tông màu trang trí tiệc <span class="text-slate-400 font-normal text-[11px]">(tùy chọn)</span>
                </label>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    v-for="color in COLOR_TONES"
                    :key="color.name"
                    type="button"
                    class="px-3 py-2.5 rounded-2xl text-xs font-bold border flex items-center justify-center gap-2 transition select-none min-h-[44px] active:scale-95 cursor-pointer shadow-sm"
                    :class="form.colorTone === color.name
                      ? 'bg-blue-50 text-blue-700 border-blue-500 ring-2 ring-blue-500/20'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'"
                    @click="selectColorTone(color.name)"
                  >
                    <span
                      class="w-4 h-4 rounded-full shrink-0 shadow-inner"
                      :style="{ backgroundColor: color.hex, border: color.border ? `1px solid ${color.border}` : '1px solid rgba(0,0,0,0.1)' }"
                    ></span>
                    <span>{{ color.name }}</span>
                  </button>
                </div>
              </div>
            </section>

            <!-- BƯỚC 4: GHI CHÚ KHÁC -->
            <section class="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200/90 space-y-2 relative overflow-hidden">
              <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500"></div>

              <div class="flex items-center gap-2.5 pb-2 border-b border-slate-100">
                <div class="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-sm shadow-sm border border-emerald-100 shrink-0">
                  <i class="fa-solid fa-pen-to-square"></i>
                </div>
                <div>
                  <h2 class="font-black text-slate-800 text-xs uppercase tracking-widest">
                    4. Ghi chú thêm
                  </h2>
                  <p class="text-[10px] font-bold text-slate-400">Món ăn dự kiến, trang trí, vị trí ngồi mong muốn...</p>
                </div>
              </div>

              <textarea
                id="field-note"
                v-model="form.note"
                rows="3"
                maxlength="500"
                placeholder="Quý khách có thể ghi món dự kiến, yêu cầu trang trí hoặc những lưu ý khác cho buổi tiệc..."
                class="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 text-[16px] sm:text-sm focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-600 transition leading-relaxed resize-y"
              ></textarea>
              <div class="flex justify-between text-[11px] text-slate-400 font-medium">
                <span>{{ RESTAURANT_NAME }} sẽ nỗ lực chuẩn bị tốt nhất theo mong muốn của quý khách.</span>
                <span>{{ (form.note || '').length }}/500</span>
              </div>
              <p v-if="errors.note" class="text-xs text-rose-500 flex items-center gap-1 mt-1 font-medium">
                <i class="fa-solid fa-circle-exclamation"></i>{{ errors.note }}
              </p>
            </section>

            <!-- THÔNG TIN HỖ TRỢ TRỰC TIẾP ZALO -->
            <div class="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white rounded-3xl p-5 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg shadow-blue-500/20 text-center sm:text-left">
              <div class="flex items-center gap-3.5">
                <div class="w-12 h-12 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center text-white shrink-0 shadow-inner">
                  <i class="fa-solid fa-headset text-xl"></i>
                </div>
                <div class="space-y-0.5">
                  <p class="font-black text-white text-sm uppercase tracking-wide">Cần hỗ trợ trực tiếp?</p>
                  <p class="text-xs text-blue-100">
                    Hotline nhà hàng: <strong class="text-white font-mono text-sm underline">{{ RESTAURANT_HOTLINE }}</strong>
                  </p>
                </div>
              </div>

              <a
                :href="RESTAURANT_ZALO_URL"
                target="_blank"
                rel="noopener noreferrer"
                class="px-5 py-2.5 rounded-xl bg-white text-blue-700 hover:bg-blue-50 text-xs font-black transition flex items-center justify-center gap-2 shadow-md shrink-0 min-h-[44px]"
              >
                <i class="fa-solid fa-comment-dots text-blue-600"></i>
                <span>Nhắn Zalo Ngay</span>
              </a>
            </div>

            <!-- NÚT TIẾP TỤC KIỂM TRA (STICKY ACTION BAR WITH LIVE SUMMARY) -->
            <div class="sticky bottom-3 z-30 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              <div class="bg-white/95 border border-slate-200/90 rounded-3xl p-3 sm:p-4 shadow-2xl backdrop-blur-xl flex flex-col gap-2">
                <!-- Live Summary Bar -->
                <div class="flex items-center justify-between px-2 text-xs text-slate-600 font-medium">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span class="font-black text-blue-700">{{ totalGuestsCount || '—' }} khách</span>
                    <span class="text-slate-300">•</span>
                    <span>{{ form.time || 'Chưa chọn giờ' }}</span>
                    <span class="text-slate-300">•</span>
                    <span>{{ displayDate || 'Chưa chọn ngày' }}</span>
                  </div>
                  <span class="text-[11px] text-slate-400 font-bold">Bước 1 / 3</span>
                </div>

                <!-- Button CTA -->
                <button
                  type="submit"
                  class="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-base uppercase tracking-wider shadow-xl shadow-blue-600/25 active:scale-[0.98] transition flex items-center justify-center gap-2 border border-blue-400/40 cursor-pointer min-h-[54px]"
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
      <footer class="w-full border-t border-slate-200 bg-white py-6 px-4 text-center text-xs text-slate-500 space-y-1.5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <p class="font-black text-slate-700 tracking-wide font-display uppercase">
          © {{ RESTAURANT_NAME }}
        </p>
        <p class="text-[11px] text-slate-500 font-medium">
          Hotline đặt tiệc: <span class="text-blue-600 font-mono font-bold">{{ RESTAURANT_HOTLINE }}</span> · Giờ đón khách: 15:00 – 23:30 hàng ngày
        </p>
      </footer>
    </div>

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
