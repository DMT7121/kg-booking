<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useUIStore } from '@/stores/useUIStore'
import { useFormStore } from '@/stores/useFormStore'
import { formatVND } from '@/utils'
import { auditBookingCompleteness, type BookingCompletenessAudit } from '@/domain/booking/bookingCompletenessGate'

const ui = useUIStore()
const formStore = useFormStore()

// Local editable clone of payload
const editCustomer = ref<any>({
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
const editDeposit = ref<any>({
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
        pax: payload.customer?.pax ?? formStore.customer.pax ?? 0,
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

// 1-Click "Approve All"
function approveAll() {
  verifiedSections.value = {
    contact: true,
    dateTimeGuest: true,
    seating: true,
    menu: true,
    depositAndNotes: true
  }
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
  formStore.customer.name = editCustomer.value.name
  formStore.customer.phone = editCustomer.value.phone
  formStore.customer.date = editCustomer.value.date
  formStore.customer.time = editCustomer.value.time
  formStore.customer.pax = editCustomer.value.pax
  formStore.customer.tables = editCustomer.value.tables
  formStore.customer.type = editCustomer.value.type
  formStore.customer.note = editCustomer.value.note

  formStore.items = JSON.parse(JSON.stringify(editItems.value))

  if (editDeposit.value.amount !== formStore.deposit.amount) {
    formStore.deposit.isManualAmount = true
  }

  formStore.deposit.amount = editDeposit.value.amount
  formStore.deposit.isPaid = editDeposit.value.isPaid

  ui.resolveBookingConfirmation(true)
}

function cancel() {
  ui.resolveBookingConfirmation(false)
}
</script>

<template>
  <div
    v-if="ui.showBookingConfirmationModal"
    class="fixed inset-0 z-[1000] flex items-center justify-center p-3 md:p-6 bg-slate-950/80 backdrop-blur-md overflow-y-auto animate-fade-in"
  >
    <div
      class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-4xl w-full flex flex-col max-h-[92vh] overflow-hidden relative text-slate-800 dark:text-slate-100 font-sans"
    >
      <!-- Top Decorative Accent -->
      <div class="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600"></div>

      <!-- Header -->
      <div class="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
        <div class="flex items-center gap-3.5">
          <div class="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xl shadow-sm">
            <i class="fa-solid fa-clipboard-check"></i>
          </div>
          <div>
            <h3 class="text-lg font-black tracking-tight text-slate-900 dark:text-white uppercase flex items-center gap-2">
              Xác Nhận Thông Tin Đặt Tiệc
              <span
                :class="[
                  'text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider',
                  auditResult.riskLevel === 'low'
                    ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                    : auditResult.riskLevel === 'medium'
                    ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                    : 'bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                ]"
              >
                {{ auditResult.summary }}
              </span>
            </h3>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Rà soát và xác nhận từng mục trước khi hoàn tất lưu phiếu / xuất bill / đồng bộ
            </p>
          </div>
        </div>

        <button
          @click="cancel"
          class="w-9 h-9 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center justify-center transition-all"
        >
          <i class="fa-solid fa-xmark text-lg"></i>
        </button>
      </div>

      <!-- Modal Body -->
      <div class="p-6 overflow-y-auto space-y-5 flex-1 bg-slate-50/30 dark:bg-slate-900/30">
        <!-- AI Completeness & Missing Content Warning Banner -->
        <div
          v-if="auditResult.warnings.length > 0"
          class="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 space-y-1.5"
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
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- CARD 1: Khách hàng & Liên hệ -->
          <div
            :class="[
              'p-4 rounded-2xl border transition-all duration-200 bg-white dark:bg-slate-800/80 shadow-sm relative',
              verifiedSections.contact
                ? 'border-emerald-500/50 shadow-emerald-500/5 ring-1 ring-emerald-500/20'
                : 'border-slate-200 dark:border-slate-700'
            ]"
          >
            <div class="flex items-center justify-between mb-3">
              <span class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <i class="fa-solid fa-user text-amber-500"></i>
                1. Khách Hàng & Liên Hệ
              </span>
              <label class="flex items-center gap-2 cursor-pointer text-xs font-bold select-none">
                <input
                  type="checkbox"
                  v-model="verifiedSections.contact"
                  class="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 accent-emerald-600 cursor-pointer"
                />
                <span :class="verifiedSections.contact ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'">
                  {{ verifiedSections.contact ? 'Đã xác nhận' : 'Chưa duyệt' }}
                </span>
              </label>
            </div>

            <div class="space-y-2.5">
              <div>
                <label class="block text-[11px] font-bold text-slate-500 mb-1">Tên khách / Người đặt</label>
                <input
                  type="text"
                  v-model="editCustomer.name"
                  @input="onFieldEdit('contact')"
                  placeholder="Nhập tên khách..."
                  class="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none font-bold"
                />
              </div>
              <div>
                <label class="block text-[11px] font-bold text-slate-500 mb-1">Số điện thoại</label>
                <input
                  type="text"
                  v-model="editCustomer.phone"
                  @input="onFieldEdit('contact')"
                  placeholder="09xxx..."
                  class="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none font-mono"
                />
              </div>
            </div>
          </div>

          <!-- CARD 2: Thời gian & Số khách -->
          <div
            :class="[
              'p-4 rounded-2xl border transition-all duration-200 bg-white dark:bg-slate-800/80 shadow-sm relative',
              verifiedSections.dateTimeGuest
                ? 'border-emerald-500/50 shadow-emerald-500/5 ring-1 ring-emerald-500/20'
                : 'border-slate-200 dark:border-slate-700'
            ]"
          >
            <div class="flex items-center justify-between mb-3">
              <span class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <i class="fa-solid fa-calendar-clock text-amber-500"></i>
                2. Thời Gian & Số Lượng Khách
              </span>
              <label class="flex items-center gap-2 cursor-pointer text-xs font-bold select-none">
                <input
                  type="checkbox"
                  v-model="verifiedSections.dateTimeGuest"
                  class="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 accent-emerald-600 cursor-pointer"
                />
                <span :class="verifiedSections.dateTimeGuest ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'">
                  {{ verifiedSections.dateTimeGuest ? 'Đã xác nhận' : 'Chưa duyệt' }}
                </span>
              </label>
            </div>

            <div class="grid grid-cols-3 gap-2">
              <div>
                <label class="block text-[11px] font-bold text-slate-500 mb-1">Ngày tiệc</label>
                <input
                  type="text"
                  v-model="editCustomer.date"
                  @input="onFieldEdit('dateTimeGuest')"
                  placeholder="DD/MM/YYYY"
                  class="w-full px-2.5 py-2 text-sm bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:border-amber-500 outline-none font-mono"
                />
              </div>
              <div>
                <label class="block text-[11px] font-bold text-slate-500 mb-1">Giờ tiệc</label>
                <input
                  type="text"
                  v-model="editCustomer.time"
                  @input="onFieldEdit('dateTimeGuest')"
                  placeholder="HH:mm"
                  class="w-full px-2.5 py-2 text-sm bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:border-amber-500 outline-none font-mono"
                />
              </div>
              <div>
                <label class="block text-[11px] font-bold text-slate-500 mb-1">Số khách</label>
                <input
                  type="number"
                  v-model.number="editCustomer.pax"
                  @input="onFieldEdit('dateTimeGuest')"
                  min="1"
                  class="w-full px-2.5 py-2 text-sm bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:border-amber-500 outline-none font-bold"
                />
              </div>
            </div>
          </div>

          <!-- CARD 3: Vị trí bàn & Loại tiệc -->
          <div
            :class="[
              'p-4 rounded-2xl border transition-all duration-200 bg-white dark:bg-slate-800/80 shadow-sm relative',
              verifiedSections.seating
                ? 'border-emerald-500/50 shadow-emerald-500/5 ring-1 ring-emerald-500/20'
                : 'border-slate-200 dark:border-slate-700'
            ]"
          >
            <div class="flex items-center justify-between mb-3">
              <span class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <i class="fa-solid fa-chair text-amber-500"></i>
                3. Bàn / Phòng & Loại Tiệc
              </span>
              <label class="flex items-center gap-2 cursor-pointer text-xs font-bold select-none">
                <input
                  type="checkbox"
                  v-model="verifiedSections.seating"
                  class="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 accent-emerald-600 cursor-pointer"
                />
                <span :class="verifiedSections.seating ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'">
                  {{ verifiedSections.seating ? 'Đã xác nhận' : 'Chưa duyệt' }}
                </span>
              </label>
            </div>

            <div class="grid grid-cols-2 gap-2.5">
              <div>
                <label class="block text-[11px] font-bold text-slate-500 mb-1">Bàn / Phòng</label>
                <input
                  type="text"
                  v-model="editCustomer.tables"
                  @input="onFieldEdit('seating')"
                  placeholder="VD: VIP1, Bàn 12..."
                  class="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:border-amber-500 outline-none font-bold"
                />
              </div>
              <div>
                <label class="block text-[11px] font-bold text-slate-500 mb-1">Loại tiệc</label>
                <select
                  v-model="editCustomer.type"
                  @change="onFieldEdit('seating')"
                  class="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:border-amber-500 outline-none font-bold"
                >
                  <option value="Ăn thường">Ăn thường</option>
                  <option value="Sinh nhật">Sinh nhật</option>
                  <option value="Thôi nôi (1st)">Thôi nôi (1st)</option>
                  <option value="Đầy tháng">Đầy tháng</option>
                  <option value="Liên hoan">Liên hoan</option>
                  <option value="Công ty">Công ty</option>
                </select>
              </div>
            </div>
          </div>

          <!-- CARD 5: Tiền cọc & Dặn dò chi tiết -->
          <div
            :class="[
              'p-4 rounded-2xl border transition-all duration-200 bg-white dark:bg-slate-800/80 shadow-sm relative',
              verifiedSections.depositAndNotes
                ? 'border-emerald-500/50 shadow-emerald-500/5 ring-1 ring-emerald-500/20'
                : 'border-slate-200 dark:border-slate-700'
            ]"
          >
            <div class="flex items-center justify-between mb-3">
              <span class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <i class="fa-solid fa-money-bill-transfer text-amber-500"></i>
                4. Tiền Cọc & Ghi Chú Tiệc
              </span>
              <label class="flex items-center gap-2 cursor-pointer text-xs font-bold select-none">
                <input
                  type="checkbox"
                  v-model="verifiedSections.depositAndNotes"
                  class="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 accent-emerald-600 cursor-pointer"
                />
                <span :class="verifiedSections.depositAndNotes ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'">
                  {{ verifiedSections.depositAndNotes ? 'Đã xác nhận' : 'Chưa duyệt' }}
                </span>
              </label>
            </div>

            <div class="space-y-2.5">
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="block text-[11px] font-bold text-slate-500 mb-1">Tiền cọc (VNĐ)</label>
                  <input
                    type="number"
                    v-model.number="editDeposit.amount"
                    @input="onFieldEdit('depositAndNotes')"
                    step="50000"
                    class="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:border-amber-500 outline-none font-bold text-amber-600 dark:text-amber-400"
                  />
                </div>
                <div>
                  <label class="block text-[11px] font-bold text-slate-500 mb-1">Trạng thái cọc</label>
                  <select
                    v-model="editDeposit.isPaid"
                    @change="onFieldEdit('depositAndNotes')"
                    class="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:border-amber-500 outline-none font-bold"
                  >
                    <option :value="false">Chờ cọc</option>
                    <option :value="true">Đã nhận cọc</option>
                  </select>
                </div>
              </div>

              <div>
                <label class="block text-[11px] font-bold text-slate-500 mb-1">Dặn dò khẩu vị / Trang trí / Bảng tên</label>
                <textarea
                  v-model="editCustomer.note"
                  @input="onFieldEdit('depositAndNotes')"
                  rows="2"
                  placeholder="Ghi chú khẩu vị, tone màu trang trí, nội dung bảng chữ..."
                  class="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:border-amber-500 outline-none resize-none"
                ></textarea>
              </div>
            </div>
          </div>
        </div>

        <!-- CARD 4 (Full Width): Thực đơn đã đặt -->
        <div
          :class="[
            'p-4 rounded-2xl border transition-all duration-200 bg-white dark:bg-slate-800/80 shadow-sm relative',
            verifiedSections.menu
              ? 'border-emerald-500/50 shadow-emerald-500/5 ring-1 ring-emerald-500/20'
              : 'border-slate-200 dark:border-slate-700'
          ]"
        >
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <i class="fa-solid fa-utensils text-amber-500"></i>
                5. Thực Đơn Đặt Trước ({{ editItems.length }} món)
              </span>
              <span v-if="editItems.length > 0" class="text-xs font-black text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded-lg border border-amber-200 dark:border-amber-800">
                Tạm tính: {{ formatVND(totalFoodPrice) }}
              </span>
            </div>

            <label class="flex items-center gap-2 cursor-pointer text-xs font-bold select-none">
              <input
                type="checkbox"
                v-model="verifiedSections.menu"
                class="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 accent-emerald-600 cursor-pointer"
              />
              <span :class="verifiedSections.menu ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'">
                {{ verifiedSections.menu ? 'Đã xác nhận' : 'Chưa duyệt' }}
              </span>
            </label>
          </div>

          <div v-if="editItems.length === 0" class="py-6 text-center text-xs text-slate-400 italic">
            Chưa có món ăn nào trong thực đơn
          </div>

          <div v-else class="space-y-2 max-h-48 overflow-y-auto pr-1">
            <div
              v-for="(item, idx) in editItems"
              :key="idx"
              class="flex items-center gap-2 p-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 text-xs"
            >
              <span class="w-5 text-center font-bold text-slate-400">{{ idx + 1 }}</span>
              <input
                type="text"
                v-model="item.name"
                @input="onFieldEdit('menu')"
                placeholder="Tên món..."
                class="flex-1 px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-bold"
              />
              <div class="flex items-center gap-1">
                <span class="text-slate-400 font-bold">x</span>
                <input
                  type="number"
                  v-model.number="item.qty"
                  @input="onFieldEdit('menu')"
                  min="1"
                  class="w-12 px-1.5 py-1 text-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-bold"
                />
              </div>
              <input
                type="number"
                v-model.number="item.price"
                @input="onFieldEdit('menu')"
                placeholder="Đơn giá..."
                class="w-24 px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-mono text-right"
              />
              <input
                type="text"
                v-model="item.note"
                @input="onFieldEdit('menu')"
                placeholder="Ghi chú món..."
                class="w-32 px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px]"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Footer Actions -->
      <div class="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900">
        <!-- 1-Click Approve All Button -->
        <button
          @click="approveAll"
          type="button"
          class="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2 transition-all active:scale-95 shadow-sm"
        >
          <i class="fa-solid fa-check-double text-emerald-500"></i>
          Xác Nhận Tất Cả
        </button>

        <div class="flex items-center gap-3">
          <button
            @click="cancel"
            type="button"
            class="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-400 transition-all active:scale-95"
          >
            Hủy Bỏ
          </button>
          <button
            @click="confirmAndProceed"
            type="button"
            :disabled="!isAllVerified"
            :class="[
              'px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all active:scale-95 shadow-lg',
              isAllVerified
                ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-amber-500/20 cursor-pointer'
                : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed opacity-60 shadow-none'
            ]"
          >
            <i class="fa-solid fa-floppy-disk"></i>
            Xác Nhận & Tiếp Tục
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.15s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: scale(0.98);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
