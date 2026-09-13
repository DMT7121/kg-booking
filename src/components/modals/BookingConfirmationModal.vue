<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useUIStore } from '@/stores/useUIStore'
import { useFormStore } from '@/stores/useFormStore'
import { formatVND } from '@/utils'
import { sound } from '@/utils/audio'
import { haptic } from '@/composables/useGestures'
import { auditBookingCompleteness, type BookingCompletenessAudit } from '@/domain/booking/bookingCompletenessGate'

const ui = useUIStore()
const formStore = useFormStore()

// Local editable clone of payload
const editCustomer = ref<{
  name: string
  phone: string
  date: string
  time: string
  pax: number
  tables: string
  type: string
  note: string
}>({
  name: '',
  phone: '',
  date: '',
  time: '',
  pax: 0,
  tables: '',
  type: 'Ăn thường',
  note: ''
})

const editItems = ref<any[]>([])
const editDeposit = ref<{
  amount: number
  isPaid: boolean
}>({
  amount: 0,
  isPaid: false
})

const rawInput = ref('')

// Verification checklist state
const verifiedSections = ref({
  contact: false,
  dateTimeGuest: false,
  seating: false,
  menu: false,
  depositAndNotes: false
})

// Initialize payload when modal opens
watch(
  () => ui.showBookingConfirmationModal,
  (show) => {
    if (show) {
      const payload = ui.bookingConfirmationPayload || {}
      editCustomer.value = {
        name: payload.customer?.name ?? formStore.customer.name ?? '',
        phone: payload.customer?.phone ?? formStore.customer.phone ?? '',
        date: payload.customer?.date ?? formStore.customer.date ?? '',
        time: payload.customer?.time ?? formStore.customer.time ?? '',
        pax: Number(payload.customer?.pax ?? formStore.customer.pax ?? 0),
        tables: payload.customer?.tables ?? formStore.customer.tables ?? '',
        type: payload.customer?.type ?? formStore.customer.type ?? 'Ăn thường',
        note: payload.customer?.note ?? formStore.customer.note ?? ''
      }

      const sourceItems = payload.items ?? formStore.items ?? []
      editItems.value = JSON.parse(JSON.stringify(sourceItems))

      editDeposit.value = {
        amount: payload.deposit?.amount ?? formStore.deposit.amount ?? 0,
        isPaid: payload.deposit?.isPaid ?? formStore.deposit.isPaid ?? false
      }

      rawInput.value = payload.rawInput ?? formStore.rawInput ?? ''

      // Reset verification state
      verifiedSections.value = {
        contact: false,
        dateTimeGuest: false,
        seating: false,
        menu: false,
        depositAndNotes: false
      }
    }
  }
)

// Auto-tick handler on user input edit
function onFieldEdit(section: keyof typeof verifiedSections.value) {
  verifiedSections.value[section] = true
}

// Toggle individual section verification
function toggleSection(section: keyof typeof verifiedSections.value) {
  verifiedSections.value[section] = !verifiedSections.value[section]
  if (verifiedSections.value[section]) {
    sound.playPop()
    haptic('light')
  }
}

// 1-Click "Approve All"
function approveAll() {
  verifiedSections.value = {
    contact: true,
    dateTimeGuest: true,
    seating: true,
    menu: true,
    depositAndNotes: true
  }
  sound.playSuccess()
  haptic('medium')
}

// Adjust pax with stepper
function adjustPax(delta: number) {
  const current = Number(editCustomer.value.pax || 0)
  editCustomer.value.pax = Math.max(1, current + delta)
  onFieldEdit('dateTimeGuest')
  haptic('light')
}

const quickPaxOptions = [2, 4, 6, 8, 10, 15, 20]
function setPax(val: number) {
  editCustomer.value.pax = val
  onFieldEdit('dateTimeGuest')
  haptic('light')
}

// Price formatting helpers
function formatPrice(val: number | string) {
  const num = Number(val) || 0
  return num.toLocaleString('vi-VN')
}

function handleItemPriceInput(index: number, e: Event) {
  const target = e.target as HTMLInputElement
  const clean = target.value.replace(/\D/g, '')
  const num = parseInt(clean, 10) || 0
  if (editItems.value[index]) {
    editItems.value[index].price = num
    target.value = num > 0 ? num.toLocaleString('vi-VN') : ''
    onFieldEdit('menu')
  }
}

function handleDepositInput(e: Event) {
  const target = e.target as HTMLInputElement
  const clean = target.value.replace(/\D/g, '')
  const num = parseInt(clean, 10) || 0
  editDeposit.value.amount = num
  target.value = num > 0 ? num.toLocaleString('vi-VN') : ''
  onFieldEdit('depositAndNotes')
}

// Add item to menu list
function addItem() {
  editItems.value.push({
    name: '',
    qty: 1,
    price: 0,
    note: ''
  })
  onFieldEdit('menu')
  haptic('light')
}

// Remove item from menu list
function removeItem(index: number) {
  editItems.value.splice(index, 1)
  onFieldEdit('menu')
  haptic('light')
}

// Adjust item quantity
function adjustItemQty(idx: number, delta: number) {
  if (!editItems.value[idx]) return
  const current = Number(editItems.value[idx].qty || 1)
  const next = Math.max(1, current + delta)
  editItems.value[idx].qty = next
  onFieldEdit('menu')
}

// Audit computation
const auditResult = computed<BookingCompletenessAudit>(() => {
  return auditBookingCompleteness(
    {
      customer: editCustomer.value,
      items: editItems.value,
      deposit: editDeposit.value
    },
    rawInput.value
  )
})

// Number of verified sections (0..5)
const verifiedCount = computed(() => {
  return Object.values(verifiedSections.value).filter(Boolean).length
})

const verifiedPercent = computed(() => {
  return Math.round((verifiedCount.value / 5) * 100)
})

// Check if all 5 sections are verified
const isAllVerified = computed(() => {
  return (
    verifiedSections.value.contact &&
    verifiedSections.value.dateTimeGuest &&
    verifiedSections.value.seating &&
    verifiedSections.value.menu &&
    verifiedSections.value.depositAndNotes
  )
})

// Total food estimate
const totalFoodPrice = computed(() => {
  return editItems.value.reduce((sum, i) => sum + (Number(i.price || 0) * Number(i.qty || 1)), 0)
})

// Save changes back to formStore and resolve
function confirmAndProceed() {
  if (!isAllVerified.value) return

  formStore.customer.name = editCustomer.value.name
  formStore.customer.phone = editCustomer.value.phone
  formStore.customer.date = editCustomer.value.date
  formStore.customer.time = editCustomer.value.time
  formStore.customer.pax = String(editCustomer.value.pax || '')
  formStore.customer.tables = editCustomer.value.tables
  formStore.customer.type = editCustomer.value.type
  formStore.customer.note = editCustomer.value.note

  formStore.items = JSON.parse(JSON.stringify(editItems.value))

  if (editDeposit.value.amount !== formStore.deposit.amount) {
    formStore.deposit.isManualAmount = true
  }

  formStore.deposit.amount = editDeposit.value.amount
  formStore.deposit.isPaid = editDeposit.value.isPaid

  sound.playSuccess()
  ui.resolveBookingConfirmation(true)
}

function cancel() {
  ui.resolveBookingConfirmation(false)
}

// Keyboard shortcuts (Esc to close)
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && ui.showBookingConfirmationModal) {
    cancel()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div
    v-if="ui.showBookingConfirmationModal"
    class="fixed inset-0 z-[1000] flex items-center justify-center p-2 sm:p-4 md:p-6 bg-slate-950/80 backdrop-blur-md overflow-hidden animate-fade-in"
    @click.self="cancel"
  >
    <div
      class="bg-white dark:bg-surface-4 border border-slate-200/90 dark:border-border-default rounded-2xl sm:rounded-3xl shadow-2xl max-w-4xl w-full flex flex-col max-h-[94dvh] sm:max-h-[92vh] overflow-hidden relative text-slate-800 dark:text-slate-100 font-sans"
    >
      <!-- Top Decorative Accent Line -->
      <div class="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 z-20"></div>

      <!-- Header Area -->
      <div class="px-3.5 sm:px-6 py-2.5 sm:py-4 border-b border-slate-100 dark:border-border-subtle flex items-center justify-between bg-slate-50/80 dark:bg-surface-3/80 shrink-0">
        <div class="flex items-center gap-2.5 sm:gap-3.5 min-w-0 pr-2">
          <!-- Responsive Icon Badge -->
          <div class="w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center text-base sm:text-xl shadow-xs shrink-0">
            <i class="fa-solid fa-clipboard-check"></i>
          </div>

          <div class="min-w-0">
            <div class="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <h3 class="text-sm sm:text-lg font-black tracking-tight text-slate-900 dark:text-white uppercase leading-snug break-words">
                Xác Nhận Đặt Tiệc
              </h3>
              <span
                :class="[
                  'inline-flex items-center gap-1 text-[9px] sm:text-[10px] px-2 sm:px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider shadow-2xs shrink-0',
                  auditResult.riskLevel === 'low'
                    ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                    : auditResult.riskLevel === 'medium'
                    ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                    : 'bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                ]"
              >
                <i :class="auditResult.riskLevel === 'low' ? 'fa-solid fa-circle-check text-emerald-500' : 'fa-solid fa-triangle-exclamation'"></i>
                <span>{{ auditResult.summary }}</span>
              </span>
            </div>
            <p class="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-snug truncate">
              Rà soát và xác nhận từng mục trước khi hoàn tất phiếu
            </p>
          </div>
        </div>

        <button
          @click="cancel"
          type="button"
          aria-label="Đóng modal"
          title="Đóng (Esc)"
          class="w-8 h-8 sm:w-9 sm:h-9 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/50 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 flex items-center justify-center transition-all shrink-0 border border-slate-200/60 dark:border-slate-800"
        >
          <i class="fa-solid fa-xmark text-base sm:text-lg"></i>
        </button>
      </div>

      <!-- Verification Progress Bar & Quick Stats -->
      <div class="px-3.5 sm:px-6 py-2 bg-slate-100/70 dark:bg-slate-800/50 border-b border-slate-200/80 dark:border-slate-800/80 flex flex-col gap-1.5 text-xs shrink-0">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5 text-[11px] sm:text-xs truncate">
              <i class="fa-solid fa-list-check text-amber-500 text-xs shrink-0"></i>
              Tiến độ kiểm duyệt:
              <span :class="isAllVerified ? 'text-emerald-600 dark:text-emerald-400 font-black' : 'text-amber-600 dark:text-amber-400 font-black'">
                {{ verifiedCount }}/5 mục ({{ verifiedPercent }}%)
              </span>
            </span>
          </div>

          <div class="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              v-if="!isAllVerified"
              @click="approveAll"
              type="button"
              class="text-[11px] font-black text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 flex items-center gap-1 transition-all cursor-pointer active:scale-95 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-lg border border-emerald-200 dark:border-emerald-800/50"
            >
              <i class="fa-solid fa-check-double text-[10px]"></i>
              <span>Duyệt tất cả</span>
            </button>
            <span v-else class="text-[11px] font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-lg border border-emerald-300 dark:border-emerald-700">
              <i class="fa-solid fa-circle-check text-xs"></i>
              <span>Sẵn sàng lưu</span>
            </span>
          </div>
        </div>

        <!-- Sleek Responsive Progress Bar -->
        <div class="w-full bg-slate-200/80 dark:bg-slate-700/80 h-1.5 sm:h-2 rounded-full overflow-hidden">
          <div
            class="h-full bg-gradient-to-r from-amber-500 via-orange-500 to-emerald-500 transition-all duration-300 rounded-full"
            :style="{ width: `${verifiedPercent}%` }"
          ></div>
        </div>
      </div>

      <!-- Modal Body (Scrollable Review Cards with extra bottom padding for footer) -->
      <div class="p-3 sm:p-5 md:p-6 overflow-y-auto space-y-3 sm:space-y-4 flex-1 bg-slate-50/40 dark:bg-slate-900/30 ios-smooth-scroll pb-10 sm:pb-12">
        <!-- AI Completeness & Missing Content Warning Banner -->
        <div
          v-if="auditResult.warnings.length > 0"
          class="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-900 dark:text-amber-200 space-y-1.5 shadow-2xs"
        >
          <div class="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-amber-700 dark:text-amber-400">
            <i class="fa-solid fa-triangle-exclamation"></i>
            Lưu ý cần bổ sung hoặc kiểm tra:
          </div>
          <ul class="list-disc list-inside text-xs space-y-1 text-slate-700 dark:text-slate-300">
            <li v-for="(warn, idx) in auditResult.warnings" :key="idx" class="leading-relaxed">
              {{ warn }}
            </li>
          </ul>
        </div>

        <!-- 5 Review Cards Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          <!-- CARD 1: Khách hàng & Liên hệ -->
          <div
            :class="[
              'p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border transition-all duration-200 bg-white dark:bg-slate-800/80 shadow-xs relative',
              verifiedSections.contact
                ? 'border-emerald-500/50 shadow-emerald-500/5 ring-1 ring-emerald-500/20'
                : 'border-slate-200 dark:border-slate-700/80'
            ]"
          >
            <!-- Card Header -->
            <div class="flex items-center justify-between mb-2.5">
              <div class="flex items-center gap-2 min-w-0">
                <div class="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xs shrink-0">
                  <i class="fa-solid fa-user"></i>
                </div>
                <span class="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200 truncate">
                  1. Khách Hàng & Liên Hệ
                </span>
              </div>

              <!-- Interactive Status Pill -->
              <button
                type="button"
                @click="toggleSection('contact')"
                :class="[
                  'px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[10px] sm:text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none active:scale-95 border shrink-0',
                  verifiedSections.contact
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 shadow-2xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-emerald-400 hover:text-emerald-600'
                ]"
              >
                <i :class="verifiedSections.contact ? 'fa-solid fa-circle-check text-emerald-500 text-xs' : 'fa-regular fa-circle text-[9px]'"></i>
                <span>{{ verifiedSections.contact ? 'Đã duyệt' : 'Chưa duyệt' }}</span>
              </button>
            </div>

            <!-- Card Inputs -->
            <div class="space-y-2.5">
              <div>
                <label class="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                  Tên khách / Người đặt <span class="text-rose-500">*</span>
                </label>
                <div class="relative">
                  <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-xs">
                    <i class="fa-regular fa-user"></i>
                  </div>
                  <input
                    type="text"
                    v-model="editCustomer.name"
                    @input="onFieldEdit('contact')"
                    placeholder="Nhập tên khách hàng..."
                    class="w-full pl-8 pr-3 py-2 text-[15px] sm:text-sm bg-slate-50/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700/80 rounded-xl focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none font-bold text-slate-800 dark:text-slate-100 transition-all placeholder:text-slate-400 placeholder:font-normal"
                  />
                </div>
              </div>

              <div>
                <label class="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                  Số điện thoại <span class="text-rose-500">*</span>
                </label>
                <div class="relative">
                  <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-xs">
                    <i class="fa-solid fa-phone"></i>
                  </div>
                  <input
                    type="text"
                    inputmode="tel"
                    v-model="editCustomer.phone"
                    @input="onFieldEdit('contact')"
                    placeholder="09xxxxxxx..."
                    class="w-full pl-8 pr-3 py-2 text-[15px] sm:text-sm bg-slate-50/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700/80 rounded-xl focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none font-mono font-bold text-slate-800 dark:text-slate-100 transition-all placeholder:text-slate-400 placeholder:font-normal"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- CARD 2: Thời gian & Số lượng khách -->
          <div
            :class="[
              'p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border transition-all duration-200 bg-white dark:bg-slate-800/80 shadow-xs relative',
              verifiedSections.dateTimeGuest
                ? 'border-emerald-500/50 shadow-emerald-500/5 ring-1 ring-emerald-500/20'
                : 'border-slate-200 dark:border-slate-700/80'
            ]"
          >
            <!-- Card Header -->
            <div class="flex items-center justify-between mb-2.5">
              <div class="flex items-center gap-2 min-w-0">
                <div class="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xs shrink-0">
                  <i class="fa-solid fa-calendar-days"></i>
                </div>
                <span class="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200 truncate">
                  2. Thời Gian & Khách
                </span>
              </div>

              <!-- Interactive Status Pill -->
              <button
                type="button"
                @click="toggleSection('dateTimeGuest')"
                :class="[
                  'px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[10px] sm:text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none active:scale-95 border shrink-0',
                  verifiedSections.dateTimeGuest
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 shadow-2xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-emerald-400 hover:text-emerald-600'
                ]"
              >
                <i :class="verifiedSections.dateTimeGuest ? 'fa-solid fa-circle-check text-emerald-500 text-xs' : 'fa-regular fa-circle text-[9px]'"></i>
                <span>{{ verifiedSections.dateTimeGuest ? 'Đã duyệt' : 'Chưa duyệt' }}</span>
              </button>
            </div>

            <!-- Card Inputs: Responsive layout - Date & Time row + Guest count row -->
            <div class="space-y-2.5">
              <!-- Row 1: Ngày tiệc & Giờ tiệc -->
              <div class="flex gap-2">
                <!-- Ngày tiệc (60%) -->
                <div class="w-[60%] min-w-0">
                  <label class="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 truncate">
                    Ngày tiệc <span class="text-rose-500">*</span>
                  </label>
                  <div class="relative">
                    <div class="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400 text-xs">
                      <i class="fa-regular fa-calendar-days"></i>
                    </div>
                    <input
                      type="text"
                      v-model="editCustomer.date"
                      @input="onFieldEdit('dateTimeGuest')"
                      placeholder="DD/MM/YYYY"
                      class="w-full pl-7 pr-2 py-2 text-[15px] sm:text-sm bg-slate-50/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700/80 rounded-xl focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none font-mono font-bold text-slate-800 dark:text-slate-100 transition-all placeholder:text-slate-400"
                    />
                  </div>
                </div>

                <!-- Giờ tiệc (40%) -->
                <div class="w-[40%] min-w-0">
                  <label class="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 truncate">
                    Giờ tiệc <span class="text-rose-500">*</span>
                  </label>
                  <div class="relative">
                    <div class="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400 text-xs">
                      <i class="fa-regular fa-clock"></i>
                    </div>
                    <input
                      type="text"
                      v-model="editCustomer.time"
                      @input="onFieldEdit('dateTimeGuest')"
                      placeholder="HH:mm"
                      class="w-full pl-7 pr-2 py-2 text-[15px] sm:text-sm bg-slate-50/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700/80 rounded-xl focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none font-mono font-bold text-slate-800 dark:text-slate-100 transition-all text-center placeholder:text-slate-400"
                    />
                  </div>
                </div>
              </div>

              <!-- Row 2: Số khách with Comfortable Stepper & Quick Pills -->
              <div class="p-2 rounded-xl bg-slate-50/60 dark:bg-slate-900/50 border border-slate-150 dark:border-slate-800/80 space-y-1.5">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
                    <i class="fa-solid fa-users text-amber-500 text-xs"></i>
                    <span>Số lượng khách <span class="text-rose-500">*</span>:</span>
                  </div>

                  <div class="flex items-center h-[34px]">
                    <button
                      type="button"
                      @click="adjustPax(-1)"
                      title="Giảm 1 khách"
                      class="w-8 h-full rounded-l-lg border border-r-0 border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center text-xs font-bold transition-all active:scale-95"
                    >
                      <i class="fa-solid fa-minus text-[10px]"></i>
                    </button>
                    <input
                      type="number"
                      v-model.number="editCustomer.pax"
                      @input="onFieldEdit('dateTimeGuest')"
                      min="1"
                      class="w-12 h-full text-center text-[15px] sm:text-sm bg-white dark:bg-slate-800 border-y border-slate-200 dark:border-slate-700/80 focus:border-amber-500 outline-none font-bold text-slate-800 dark:text-slate-100 px-1 font-mono"
                    />
                    <button
                      type="button"
                      @click="adjustPax(1)"
                      title="Tăng 1 khách"
                      class="w-8 h-full rounded-r-lg border border-l-0 border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center text-xs font-bold transition-all active:scale-95"
                    >
                      <i class="fa-solid fa-plus text-[10px]"></i>
                    </button>
                  </div>
                </div>

                <!-- Quick Pax Selection Chips -->
                <div class="flex items-center gap-1 overflow-x-auto no-scrollbar pt-0.5">
                  <span class="text-[9px] font-bold text-slate-400 uppercase mr-1 shrink-0">Nhanh:</span>
                  <button
                    v-for="p in quickPaxOptions"
                    :key="'pax-' + p"
                    type="button"
                    @click="setPax(p)"
                    class="px-2 py-0.5 rounded-md text-[10px] font-bold transition-all shrink-0 active:scale-95 border"
                    :class="editCustomer.pax === p ? 'bg-amber-500 text-white border-amber-500' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'"
                  >
                    {{ p }}k
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- CARD 3: Vị trí bàn & Loại tiệc -->
          <div
            :class="[
              'p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border transition-all duration-200 bg-white dark:bg-slate-800/80 shadow-xs relative',
              verifiedSections.seating
                ? 'border-emerald-500/50 shadow-emerald-500/5 ring-1 ring-emerald-500/20'
                : 'border-slate-200 dark:border-slate-700/80'
            ]"
          >
            <!-- Card Header -->
            <div class="flex items-center justify-between mb-2.5">
              <div class="flex items-center gap-2 min-w-0">
                <div class="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xs shrink-0">
                  <i class="fa-solid fa-chair"></i>
                </div>
                <span class="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200 truncate">
                  3. Bàn & Loại Tiệc
                </span>
              </div>

              <!-- Interactive Status Pill -->
              <button
                type="button"
                @click="toggleSection('seating')"
                :class="[
                  'px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[10px] sm:text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none active:scale-95 border shrink-0',
                  verifiedSections.seating
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 shadow-2xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-emerald-400 hover:text-emerald-600'
                ]"
              >
                <i :class="verifiedSections.seating ? 'fa-solid fa-circle-check text-emerald-500 text-xs' : 'fa-regular fa-circle text-[9px]'"></i>
                <span>{{ verifiedSections.seating ? 'Đã duyệt' : 'Chưa duyệt' }}</span>
              </button>
            </div>

            <!-- Card Inputs -->
            <div class="grid grid-cols-2 gap-2.5">
              <div>
                <label class="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                  Bàn / Phòng
                </label>
                <div class="relative">
                  <div class="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400 text-xs">
                    <i class="fa-solid fa-chair"></i>
                  </div>
                  <input
                    type="text"
                    v-model="editCustomer.tables"
                    @input="onFieldEdit('seating')"
                    placeholder="VD: VIP1, A9..."
                    class="w-full pl-7 pr-2.5 py-2 text-[15px] sm:text-sm bg-slate-50/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700/80 rounded-xl focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none font-bold text-slate-800 dark:text-slate-100 transition-all placeholder:text-slate-400 placeholder:font-normal"
                  />
                </div>
              </div>

              <div>
                <label class="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                  Loại tiệc
                </label>
                <div class="relative">
                  <div class="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400 text-xs">
                    <i class="fa-solid fa-champagne-glasses"></i>
                  </div>
                  <select
                    v-model="editCustomer.type"
                    @change="onFieldEdit('seating')"
                    class="w-full pl-7 pr-7 py-2 text-[15px] sm:text-sm bg-slate-50/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700/80 rounded-xl focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none font-bold text-slate-800 dark:text-slate-100 transition-all appearance-none cursor-pointer"
                  >
                    <option value="Ăn thường">Ăn thường</option>
                    <option value="Sinh nhật">Sinh nhật</option>
                    <option value="Thôi nôi (1st)">Thôi nôi (1st)</option>
                    <option value="Đầy tháng">Đầy tháng</option>
                    <option value="Liên hoan">Liên hoan</option>
                    <option value="Công ty">Công ty</option>
                  </select>
                  <div class="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none text-slate-400 text-xs">
                    <i class="fa-solid fa-chevron-down"></i>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- CARD 4: Tiền cọc & Dặn dò chi tiết -->
          <div
            :class="[
              'p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border transition-all duration-200 bg-white dark:bg-slate-800/80 shadow-xs relative',
              verifiedSections.depositAndNotes
                ? 'border-emerald-500/50 shadow-emerald-500/5 ring-1 ring-emerald-500/20'
                : 'border-slate-200 dark:border-slate-700/80'
            ]"
          >
            <!-- Card Header -->
            <div class="flex items-center justify-between mb-2.5">
              <div class="flex items-center gap-2 min-w-0">
                <div class="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xs shrink-0">
                  <i class="fa-solid fa-money-bill-transfer"></i>
                </div>
                <span class="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200 truncate">
                  4. Tiền Cọc & Ghi Chú
                </span>
              </div>

              <!-- Interactive Status Pill -->
              <button
                type="button"
                @click="toggleSection('depositAndNotes')"
                :class="[
                  'px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[10px] sm:text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none active:scale-95 border shrink-0',
                  verifiedSections.depositAndNotes
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 shadow-2xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-emerald-400 hover:text-emerald-600'
                ]"
              >
                <i :class="verifiedSections.depositAndNotes ? 'fa-solid fa-circle-check text-emerald-500 text-xs' : 'fa-regular fa-circle text-[9px]'"></i>
                <span>{{ verifiedSections.depositAndNotes ? 'Đã duyệt' : 'Chưa duyệt' }}</span>
              </button>
            </div>

            <!-- Card Inputs -->
            <div class="space-y-2.5">
              <div class="grid grid-cols-2 gap-2.5">
                <div>
                  <div class="flex items-center justify-between mb-1">
                    <label class="text-[11px] font-bold text-slate-500 dark:text-slate-400 truncate">
                      Tiền cọc (đ)
                    </label>
                    <span
                      v-if="editDeposit.amount > 0 && totalFoodPrice > 0"
                      class="text-[9px] sm:text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-1 py-0.2 rounded border border-amber-200 dark:border-amber-800/60 font-mono truncate"
                    >
                      {{ Math.round((editDeposit.amount / totalFoodPrice) * 100) }}%
                    </span>
                  </div>
                  <div class="relative">
                    <div class="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400 text-xs">
                      <i class="fa-solid fa-hand-holding-dollar"></i>
                    </div>
                    <input
                      type="text"
                      :value="formatPrice(editDeposit.amount)"
                      @input="handleDepositInput"
                      placeholder="0"
                      class="w-full pl-7 pr-2 py-2 text-[15px] sm:text-sm bg-slate-50/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700/80 rounded-xl focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none font-mono font-black text-amber-600 dark:text-amber-400 transition-all placeholder:text-slate-400"
                    />
                  </div>
                </div>

                <div>
                  <label class="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 truncate">
                    Trạng thái cọc
                  </label>
                  <div class="relative">
                    <div class="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-xs" :class="editDeposit.isPaid ? 'text-emerald-500' : 'text-amber-500'">
                      <i :class="editDeposit.isPaid ? 'fa-solid fa-circle-check' : 'fa-solid fa-hourglass-half'"></i>
                    </div>
                    <select
                      v-model="editDeposit.isPaid"
                      @change="onFieldEdit('depositAndNotes')"
                      class="w-full pl-7 pr-6 py-2 text-[15px] sm:text-sm bg-slate-50/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700/80 rounded-xl focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none font-bold transition-all appearance-none cursor-pointer"
                      :class="editDeposit.isPaid ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'"
                    >
                      <option :value="false">Chờ cọc</option>
                      <option :value="true">Đã nhận cọc</option>
                    </select>
                    <div class="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none text-slate-400 text-xs">
                      <i class="fa-solid fa-chevron-down"></i>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label class="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                  Dặn dò khẩu vị / Trang trí / Bảng tên
                </label>
                <textarea
                  v-model="editCustomer.note"
                  @input="onFieldEdit('depositAndNotes')"
                  rows="2"
                  placeholder="Ghi chú khẩu vị, tone màu trang trí, nội dung bảng chữ..."
                  class="w-full px-3 py-2 text-[14px] sm:text-xs bg-slate-50/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700/80 rounded-xl focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none text-slate-800 dark:text-slate-100 resize-none transition-all placeholder:text-slate-400 custom-scrollbar"
                ></textarea>
              </div>
            </div>
          </div>

          <!-- CARD 5 (Full Width on md+): Thực đơn đã đặt (RESPONSIVE DUAL MODE) -->
          <div
            :class="[
              'p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border transition-all duration-200 bg-white dark:bg-slate-800/80 shadow-xs relative md:col-span-2',
              verifiedSections.menu
                ? 'border-emerald-500/50 shadow-emerald-500/5 ring-1 ring-emerald-500/20'
                : 'border-slate-200 dark:border-slate-700/80'
            ]"
          >
            <!-- Card Header -->
            <div class="flex items-center justify-between mb-2.5">
              <div class="flex items-center gap-1.5 sm:gap-2.5 flex-wrap min-w-0">
                <div class="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xs shrink-0">
                  <i class="fa-solid fa-utensils"></i>
                </div>
                <span class="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
                  5. Thực Đơn ({{ editItems.length }} món)
                </span>
                <span
                  v-if="editItems.length > 0"
                  class="text-[10px] sm:text-xs font-black text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded-lg border border-amber-200 dark:border-amber-800/60 font-mono shadow-2xs"
                >
                  Tạm tính: {{ formatVND(totalFoodPrice) }}
                </span>
              </div>

              <!-- Interactive Status Pill -->
              <button
                type="button"
                @click="toggleSection('menu')"
                :class="[
                  'px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[10px] sm:text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none active:scale-95 border shrink-0',
                  verifiedSections.menu
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 shadow-2xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-emerald-400 hover:text-emerald-600'
                ]"
              >
                <i :class="verifiedSections.menu ? 'fa-solid fa-circle-check text-emerald-500 text-xs' : 'fa-regular fa-circle text-[9px]'"></i>
                <span>{{ verifiedSections.menu ? 'Đã duyệt' : 'Chưa duyệt' }}</span>
              </button>
            </div>

            <!-- Empty State -->
            <div v-if="editItems.length === 0" class="py-6 text-center text-xs text-slate-400 dark:text-slate-500 flex flex-col items-center gap-2">
              <div class="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                <i class="fa-solid fa-utensils"></i>
              </div>
              <span>Chưa có món ăn nào trong thực đơn đặt trước</span>
              <button
                type="button"
                @click="addItem"
                class="mt-1 px-3 py-1.5 rounded-lg border border-dashed border-amber-400 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95"
              >
                <i class="fa-solid fa-plus text-[10px]"></i> Thêm món vào thực đơn
              </button>
            </div>

            <!-- Items List -->
            <div v-else class="space-y-2">
              <div class="max-h-64 sm:max-h-60 overflow-y-auto pr-1 space-y-2.5 custom-scrollbar">
                <!-- Mobile Item Card (block sm:hidden) -->
                <div
                  v-for="(item, idx) in editItems"
                  :key="'mobile-' + idx"
                  class="block sm:hidden p-3 rounded-xl bg-slate-50/90 dark:bg-slate-900/80 border border-slate-200/90 dark:border-slate-800 space-y-2 transition-all shadow-2xs"
                >
                  <!-- Row 1: Index Badge + Dish Name (100% width) + Remove Button -->
                  <div class="flex items-center gap-2">
                    <span class="w-5 text-center font-bold text-slate-400 text-xs shrink-0">#{{ idx + 1 }}</span>
                    <input
                      type="text"
                      v-model="item.name"
                      @input="onFieldEdit('menu')"
                      placeholder="Tên món ăn..."
                      class="flex-1 px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-black text-slate-800 dark:text-slate-100 focus:border-amber-500 outline-none text-xs"
                    />
                    <button
                      type="button"
                      @click="removeItem(idx)"
                      title="Xóa món này"
                      class="w-7 h-7 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/50 text-slate-400 hover:text-rose-600 transition-all flex items-center justify-center shrink-0 active:scale-95"
                    >
                      <i class="fa-regular fa-trash-can text-xs"></i>
                    </button>
                  </div>

                  <!-- Row 2: Quantity Stepper + Unit Price + Subtotal Badge -->
                  <div class="flex items-center gap-2 pl-7 flex-wrap">
                    <!-- Qty Stepper -->
                    <div class="flex items-center shrink-0 h-7 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                      <button
                        type="button"
                        @click="adjustItemQty(idx, -1)"
                        class="w-7 h-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center text-xs font-bold active:scale-95 transition-all"
                      >
                        -
                      </button>
                      <span class="w-8 h-full flex items-center justify-center font-black text-xs text-slate-800 dark:text-slate-100 font-mono border-x border-slate-200 dark:border-slate-700">
                        {{ item.qty }}
                      </span>
                      <button
                        type="button"
                        @click="adjustItemQty(idx, 1)"
                        class="w-7 h-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center text-xs font-bold active:scale-95 transition-all"
                      >
                        +
                      </button>
                    </div>

                    <!-- Price Input with Formatted Thousands -->
                    <div class="flex items-center gap-1 bg-white dark:bg-slate-800 rounded-lg px-2 h-7 border border-slate-200 dark:border-slate-700 shrink-0">
                      <span class="text-[10px] text-slate-400 font-bold">GIÁ:</span>
                      <input
                        type="text"
                        :value="formatPrice(item.price)"
                        @input="handleItemPriceInput(idx, $event)"
                        placeholder="0"
                        class="w-16 bg-transparent border-none p-0 text-xs font-bold font-mono text-blue-600 dark:text-blue-400 focus:outline-none text-right"
                      />
                      <span class="text-[10px] font-bold text-slate-400">đ</span>
                    </div>

                    <!-- Calculated Subtotal Badge -->
                    <div class="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-black text-[11px] rounded-md border border-emerald-200 dark:border-emerald-800/50 font-mono whitespace-nowrap shrink-0 ml-auto">
                      = {{ formatPrice(Number(item.price || 0) * Number(item.qty || 1)) }} đ
                    </div>
                  </div>

                  <!-- Row 3: Note Input (Full Width for comfortable editing) -->
                  <div class="pl-7 flex items-center gap-1.5">
                    <i class="fa-regular fa-comment-dots text-[11px] text-slate-400 shrink-0"></i>
                    <input
                      type="text"
                      v-model="item.note"
                      @input="onFieldEdit('menu')"
                      placeholder="Ghi chú món ăn (chín vừa, ướp lạnh, không cay...)"
                      class="flex-1 px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-lg text-[11px] text-slate-700 dark:text-slate-300 focus:border-amber-500 outline-none h-7 placeholder:text-slate-400"
                    />
                  </div>
                </div>

                <!-- Desktop Item Row (hidden sm:flex) -->
                <div
                  v-for="(item, idx) in editItems"
                  :key="'desktop-' + idx"
                  class="hidden sm:flex items-center gap-2 p-2 rounded-xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 text-xs transition-all hover:border-slate-300 dark:hover:border-slate-700"
                >
                  <span class="w-5 text-center font-bold text-slate-400 shrink-0">{{ idx + 1 }}</span>

                  <!-- Dish Name -->
                  <input
                    type="text"
                    v-model="item.name"
                    @input="onFieldEdit('menu')"
                    placeholder="Tên món ăn..."
                    class="flex-1 min-w-[120px] px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-bold text-slate-800 dark:text-slate-100 focus:border-amber-500 outline-none text-xs"
                  />

                  <!-- Quantity with stepper -->
                  <div class="flex items-center shrink-0">
                    <button
                      type="button"
                      @click="adjustItemQty(idx, -1)"
                      class="w-6 h-7 rounded-l-lg border border-r-0 border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 flex items-center justify-center text-[10px] font-bold active:scale-95"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      v-model.number="item.qty"
                      @input="onFieldEdit('menu')"
                      min="1"
                      class="w-10 h-7 text-center bg-white dark:bg-slate-800 border-y border-slate-200 dark:border-slate-700 font-bold text-slate-800 dark:text-slate-100 focus:border-amber-500 outline-none text-xs font-mono"
                    />
                    <button
                      type="button"
                      @click="adjustItemQty(idx, 1)"
                      class="w-6 h-7 rounded-r-lg border border-l-0 border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 flex items-center justify-center text-[10px] font-bold active:scale-95"
                    >
                      +
                    </button>
                  </div>

                  <!-- Unit Price -->
                  <div class="relative shrink-0 w-28">
                    <input
                      type="text"
                      :value="formatPrice(item.price)"
                      @input="handleItemPriceInput(idx, $event)"
                      placeholder="0"
                      class="w-full px-2.5 py-1.5 pr-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-mono font-bold text-right text-slate-800 dark:text-slate-100 focus:border-amber-500 outline-none text-xs"
                    />
                    <span class="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 pointer-events-none">đ</span>
                  </div>

                  <!-- Calculated Subtotal Badge Desktop -->
                  <div class="px-2 py-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold text-xs rounded-lg border border-emerald-200 dark:border-emerald-800/50 font-mono whitespace-nowrap shrink-0">
                    = {{ formatPrice(Number(item.price || 0) * Number(item.qty || 1)) }} đ
                  </div>

                  <!-- Note -->
                  <input
                    type="text"
                    v-model="item.note"
                    @input="onFieldEdit('menu')"
                    placeholder="Ghi chú món..."
                    class="w-32 hidden md:block px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] text-slate-700 dark:text-slate-300 focus:border-amber-500 outline-none"
                  />

                  <!-- Delete Item Button -->
                  <button
                    type="button"
                    @click="removeItem(idx)"
                    title="Xóa món này"
                    class="w-7 h-7 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/50 text-slate-400 hover:text-rose-600 transition-all flex items-center justify-center shrink-0 active:scale-95"
                  >
                    <i class="fa-regular fa-trash-can text-xs"></i>
                  </button>
                </div>
              </div>

              <!-- Quick Add Item Button -->
              <div class="pt-1.5 flex justify-end">
                <button
                  type="button"
                  @click="addItem"
                  class="text-xs font-bold text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-amber-300 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-all active:scale-95 cursor-pointer"
                >
                  <i class="fa-solid fa-plus text-[10px]"></i> Thêm món mới
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer Actions Bar (iPhone Safe Area Aware) -->
      <div class="px-3.5 sm:px-6 py-2.5 sm:py-3.5 border-t border-slate-100 dark:border-border-subtle bg-white/95 dark:bg-surface-4/95 backdrop-blur-md shrink-0 pb-safe shadow-[0_-8px_30px_rgba(0,0,0,0.06)] dark:shadow-[0_-8px_30px_rgba(0,0,0,0.3)]">
        <!-- MOBILE LAYOUT (< sm) -->
        <div class="flex sm:hidden flex-col gap-2 w-full">
          <!-- Primary CTA Button (Full Width, Prominent) -->
          <button
            @click="confirmAndProceed"
            type="button"
            :disabled="!isAllVerified"
            class="w-full h-11 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-md transition-all active:scale-95"
            :class="[
              isAllVerified
                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/30 cursor-pointer active:scale-95'
                : 'bg-slate-100 dark:bg-surface-3 text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-75 border border-slate-200 dark:border-border-subtle'
            ]"
          >
            <i :class="isAllVerified ? 'fa-solid fa-circle-check text-sm' : 'fa-solid fa-lock text-xs'"></i>
            <span>Xác Nhận & Tiếp Tục</span>
            <span v-if="!isAllVerified" class="text-[10px] font-normal normal-case opacity-80">
              ({{ 5 - verifiedCount }} mục chưa duyệt)
            </span>
          </button>

          <!-- Secondary Actions Row (Duyệt Tất Cả + Hủy Bỏ) -->
          <div class="flex items-center gap-2 w-full">
            <button
              @click="approveAll"
              type="button"
              class="flex-1 h-9 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-2xs"
              :class="[
                isAllVerified
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                  : 'bg-slate-50 dark:bg-surface-3 border-slate-200 dark:border-border-subtle text-slate-700 dark:text-slate-300'
              ]"
            >
              <i class="fa-solid fa-check-double text-emerald-500 text-[10px]"></i>
              <span>{{ isAllVerified ? 'Đã Duyệt Đủ (5/5)' : 'Duyệt Tất Cả (5/5)' }}</span>
            </button>

            <button
              @click="cancel"
              type="button"
              class="w-24 h-9 rounded-xl border border-slate-200 dark:border-border-subtle hover:bg-slate-100 dark:hover:bg-surface-3 text-[11px] font-bold text-slate-600 dark:text-slate-400 transition-all active:scale-95 text-center"
            >
              Hủy Bỏ
            </button>
          </div>
        </div>

        <!-- DESKTOP LAYOUT (>= sm) -->
        <div class="hidden sm:flex items-center justify-between gap-3 w-full">
          <!-- 1-Click Approve All Button -->
          <button
            @click="approveAll"
            type="button"
            :class="[
              'px-4 py-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all active:scale-95 shadow-2xs cursor-pointer',
              isAllVerified
                ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                : 'bg-slate-50 dark:bg-surface-3 border-slate-200 dark:border-border-subtle hover:bg-slate-100 dark:hover:bg-surface-2 text-slate-700 dark:text-slate-300'
            ]"
          >
            <i class="fa-solid fa-check-double text-emerald-500"></i>
            <span>{{ isAllVerified ? 'Đã Duyệt Toàn Bộ (5/5)' : 'Xác Nhận Tất Cả' }}</span>
          </button>

          <!-- Right Side Action Buttons -->
          <div class="flex items-center gap-2.5 sm:gap-3 justify-end">
            <button
              @click="cancel"
              type="button"
              class="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-border-subtle hover:bg-slate-100 dark:hover:bg-surface-3 text-xs font-bold text-slate-600 dark:text-slate-400 transition-all active:scale-95 cursor-pointer"
            >
              Hủy Bỏ
            </button>

            <button
              @click="confirmAndProceed"
              type="button"
              :disabled="!isAllVerified"
              :class="[
                'px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md',
                isAllVerified
                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/30 cursor-pointer active:scale-95'
                  : 'bg-slate-100 dark:bg-surface-3 text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-70 shadow-none border border-slate-200 dark:border-border-subtle'
              ]"
            >
              <i :class="isAllVerified ? 'fa-solid fa-circle-check' : 'fa-solid fa-lock'"></i>
              <span>Xác Nhận & Tiếp Tục</span>
              <span v-if="!isAllVerified" class="text-[10px] font-normal normal-case opacity-80">
                ({{ 5 - verifiedCount }} mục chưa duyệt)
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pb-safe {
  padding-bottom: max(0.75rem, env(safe-area-inset-bottom, 12px));
}

.ios-smooth-scroll {
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}

.animate-fade-in {
  animation: fadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: scale(0.97);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
