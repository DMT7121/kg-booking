<script setup lang="ts">
import { onMounted, onUnmounted, ref, nextTick, computed } from 'vue'
import type { CustomerBookingDraft } from '@/domain/customerBooking/types'
import { RESTAURANT_NAME } from '@/domain/customerBooking/types'

const props = defineProps<{
  form: CustomerBookingDraft
  displayDate: string
  submitting: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'edit'): void
  (e: 'confirm'): void
}>()

const modalRef = ref<HTMLElement | null>(null)
const confirmBtnRef = ref<HTMLButtonElement | null>(null)

const totalGuests = computed(() => {
  const adult = Number(props.form.guestCount) || 0
  const child = (props.form.hasChildren && Number(props.form.childrenCount) > 0) ? Number(props.form.childrenCount) : 0
  return adult + child
})

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && !props.submitting) {
    emit('close')
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
  nextTick(() => {
    confirmBtnRef.value?.focus()
  })
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md animate-fade-in"
    role="dialog"
    aria-modal="true"
    aria-labelledby="review-modal-title"
    @click.self="!submitting && emit('close')"
  >
    <div
      ref="modalRef"
      class="relative w-full max-w-lg overflow-hidden bg-slate-900/95 border border-amber-500/40 rounded-3xl shadow-2xl flex flex-col max-h-[92vh]"
    >
      <!-- Header with Official Logo -->
      <div class="px-5 py-4 border-b border-slate-800/80 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center p-1.5 shrink-0 shadow-sm">
            <img src="/favicon.svg" alt="KG Logo" class="w-full h-full object-contain" />
          </div>
          <div>
            <h3 id="review-modal-title" class="text-sm sm:text-base font-black text-slate-100 uppercase tracking-wide font-display">
              Xác nhận yêu cầu đặt bàn
            </h3>

            <p class="text-[11px] text-amber-400/90 font-medium">{{ RESTAURANT_NAME }}</p>
          </div>
        </div>

        <button
          v-if="!submitting"
          type="button"
          class="text-slate-400 hover:text-slate-200 p-2 rounded-xl hover:bg-slate-800 transition min-w-[36px] min-h-[36px] flex items-center justify-center"
          aria-label="Đóng modal"
          @click="emit('close')"
        >
          <i class="fa-solid fa-xmark text-lg"></i>
        </button>
      </div>

      <!-- Content Scrollable -->
      <div class="p-5 sm:p-6 space-y-4 overflow-y-auto custom-scrollbar text-sm">
        <!-- Thông báo quan trọng -->
        <div class="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-start gap-2.5 text-amber-200 text-xs leading-relaxed">
          <i class="fa-solid fa-circle-info text-amber-400 mt-0.5 shrink-0 text-sm"></i>
          <span>
            Thông tin gửi qua form là <strong>yêu cầu đặt chỗ</strong>. Nhân viên nhà hàng sẽ kiểm tra tình trạng bàn và liên hệ lại quý khách để xác nhận.
          </span>
        </div>

        <!-- Khối chi tiết thông tin -->
        <div class="bg-slate-950/70 border border-slate-800 rounded-2xl divide-y divide-slate-850">
          <!-- Người đặt -->
          <div class="p-3.5 flex justify-between items-center gap-2">
            <span class="text-slate-400 text-xs font-medium">Người đặt:</span>
            <span class="font-bold text-slate-100 text-right uppercase">{{ form.bookerName }}</span>
          </div>

          <!-- Chủ tiệc -->
          <div v-if="form.hostName" class="p-3.5 flex justify-between items-center gap-2">
            <span class="text-slate-400 text-xs font-medium">Chủ tiệc:</span>
            <span class="font-bold text-amber-300 text-right uppercase">{{ form.hostName }}</span>
          </div>

          <!-- SĐT liên hệ -->
          <div class="p-3.5 flex justify-between items-center gap-2">
            <span class="text-slate-400 text-xs font-medium">SĐT / Zalo:</span>
            <span class="font-bold text-emerald-400 tracking-wider text-right font-mono text-base">{{ form.phone }}</span>
          </div>

          <!-- Thời gian -->
          <div class="p-3.5 flex justify-between items-center gap-2">
            <span class="text-slate-400 text-xs font-medium">Thời gian tiệc:</span>
            <span class="font-bold text-slate-100 text-right">
              <i class="fa-regular fa-clock text-amber-400 mr-1"></i>{{ form.time }} —
              <i class="fa-regular fa-calendar text-amber-400 mr-1 ml-1"></i>{{ displayDate }}
            </span>
          </div>

          <!-- Số lượng khách (Tính tổng lớn + trẻ em) -->
          <div class="p-3.5 flex justify-between items-center gap-2">
            <span class="text-slate-400 text-xs font-medium">Tổng lượng khách:</span>
            <div class="text-right">
              <span class="font-black text-amber-300 text-base">
                {{ totalGuests }} người
              </span>
              <span v-if="form.hasChildren && Number(form.childrenCount) > 0" class="block text-[11px] text-slate-400 font-normal mt-0.5">
                ({{ form.guestCount }} người lớn + {{ form.childrenCount }} trẻ em)
              </span>
            </div>
          </div>

          <!-- Loại tiệc -->
          <div class="p-3.5 flex justify-between items-center gap-2">
            <span class="text-slate-400 text-xs font-medium">Nhu cầu / Loại tiệc:</span>
            <span class="font-bold text-slate-100 text-right">
              {{ form.partyType === 'Khác' ? form.customPartyType : form.partyType }}
            </span>
          </div>

          <!-- Tông màu -->
          <div v-if="form.colorTone" class="p-3.5 flex justify-between items-center gap-2">
            <span class="text-slate-400 text-xs font-medium">Tông màu tiệc:</span>
            <span class="font-bold text-amber-300 text-right">{{ form.colorTone }}</span>
          </div>

          <!-- Ghi chú -->
          <div v-if="form.note" class="p-3.5 flex flex-col gap-1.5">
            <span class="text-slate-400 text-xs font-medium">Ghi chú của quý khách:</span>
            <p class="text-slate-200 text-xs bg-slate-900 p-3 rounded-xl border border-slate-800 whitespace-pre-wrap leading-relaxed">
              {{ form.note }}
            </p>
          </div>
        </div>
      </div>

      <!-- Footer Buttons (Mobile optimized) -->
      <div class="p-4 border-t border-slate-800 bg-slate-950/90 flex items-center justify-end gap-3">
        <button
          type="button"
          :disabled="submitting"
          class="flex-1 sm:flex-initial px-4 py-3 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed min-h-[46px] flex items-center justify-center gap-1.5"
          @click="emit('edit')"
        >
          <i class="fa-solid fa-pen-to-square"></i>
          <span>Chỉnh sửa</span>
        </button>

        <button
          ref="confirmBtnRef"
          type="button"
          :disabled="submitting"
          class="flex-1 sm:flex-initial px-5 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black shadow-lg shadow-amber-500/25 active:scale-[0.98] transition flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed min-h-[46px]"
          @click="emit('confirm')"
        >
          <span v-if="submitting" class="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></span>
          <i v-else class="fa-solid fa-paper-plane"></i>
          <span>{{ submitting ? 'Đang gửi...' : 'Gửi yêu cầu đặt bàn' }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
