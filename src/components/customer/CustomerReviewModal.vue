<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { RESTAURANT_NAME } from '@/domain/customerBooking/types'
import type { CustomerBookingDraft } from '@/domain/customerBooking/types'

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

// Keyboard trap: đóng bằng Escape
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && !props.submitting) {
    emit('close')
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
    class="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
    role="dialog"
    aria-modal="true"
    aria-labelledby="review-modal-title"
    @click.self="!submitting && emit('close')"
  >
    <div
      ref="modalRef"
      class="relative w-full max-w-lg overflow-hidden bg-white border border-slate-200 rounded-3xl shadow-2xl flex flex-col max-h-[92vh]"
    >
      <!-- Top Decorative Accent -->
      <div class="h-1.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600"></div>

      <!-- Header with Official Logo -->
      <div class="px-5 py-4 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-2xl bg-white border border-slate-200 flex items-center justify-center p-1.5 shrink-0 shadow-sm">
            <img src="/favicon.svg" alt="KG Logo" class="w-full h-full object-contain" />
          </div>
          <div>
            <h3 id="review-modal-title" class="text-sm sm:text-base font-black text-slate-800 uppercase tracking-wide font-display">
              Xác nhận yêu cầu đặt bàn
            </h3>
            <p class="text-[11px] text-blue-700 font-bold uppercase tracking-wider">{{ RESTAURANT_NAME }}</p>
          </div>
        </div>

        <button
          v-if="!submitting"
          type="button"
          class="text-slate-400 hover:text-slate-700 p-2 rounded-xl hover:bg-slate-100 transition min-w-[36px] min-h-[36px] flex items-center justify-center cursor-pointer"
          aria-label="Đóng modal"
          @click="emit('close')"
        >
          <i class="fa-solid fa-xmark text-lg"></i>
        </button>
      </div>

      <!-- Content Scrollable -->
      <div class="p-5 sm:p-6 space-y-4 overflow-y-auto custom-scrollbar text-sm">
        <!-- Thông báo quan trọng -->
        <div class="p-3.5 bg-blue-50 border border-blue-200 rounded-2xl flex items-start gap-2.5 text-blue-900 text-xs leading-relaxed">
          <i class="fa-solid fa-circle-info text-blue-600 mt-0.5 shrink-0 text-sm"></i>
          <span>
            Thông tin gửi qua form là <strong>yêu cầu đặt chỗ</strong>. Nhân viên nhà hàng sẽ kiểm tra tình trạng bàn và liên hệ lại quý khách để xác nhận.
          </span>
        </div>

        <!-- Khối chi tiết thông tin -->
        <div class="bg-slate-50 border border-slate-200 rounded-2xl divide-y divide-slate-200/80">
          <!-- Người đặt -->
          <div class="p-3.5 flex justify-between items-center gap-2">
            <span class="text-slate-500 text-xs font-bold">Người đặt:</span>
            <span class="font-bold text-slate-900 text-right uppercase">{{ form.bookerName }}</span>
          </div>

          <!-- Chủ tiệc -->
          <div v-if="form.hostName" class="p-3.5 flex justify-between items-center gap-2">
            <span class="text-slate-500 text-xs font-bold">Chủ tiệc:</span>
            <span class="font-bold text-blue-700 text-right uppercase">{{ form.hostName }}</span>
          </div>

          <!-- SĐT -->
          <div class="p-3.5 flex justify-between items-center gap-2">
            <span class="text-slate-500 text-xs font-bold">Số điện thoại / Zalo:</span>
            <span class="font-bold text-emerald-600 font-mono text-base">{{ form.phone }}</span>
          </div>

          <!-- Thời gian -->
          <div class="p-3.5 flex justify-between items-center gap-2">
            <span class="text-slate-500 text-xs font-bold">Thời gian đến:</span>
            <span class="font-bold text-slate-900 text-right">
              {{ form.time }} · {{ displayDate }}
            </span>
          </div>

          <!-- Lượng khách (TÍNH TỔNG KHÁCH LỚN + TRẺ EM) -->
          <div class="p-3.5 flex justify-between items-center gap-2">
            <span class="text-slate-500 text-xs font-bold">Tổng lượng khách:</span>
            <div class="text-right">
              <span class="font-black text-blue-700 text-base">
                {{ Number(form.guestCount || 0) + (form.hasChildren ? Number(form.childrenCount || 0) : 0) }} người
              </span>
              <span v-if="form.hasChildren && Number(form.childrenCount) > 0" class="block text-[11px] text-slate-500 font-normal">
                ({{ form.guestCount }} lớn + {{ form.childrenCount }} trẻ em)
              </span>
            </div>
          </div>

          <!-- Loại tiệc -->
          <div class="p-3.5 flex justify-between items-center gap-2">
            <span class="text-slate-500 text-xs font-bold">Loại tiệc:</span>
            <span class="font-bold text-slate-900">
              {{ form.partyType === 'Khác' ? form.customPartyType : form.partyType }}
            </span>
          </div>

          <!-- Tông màu -->
          <div v-if="form.colorTone" class="p-3.5 flex justify-between items-center gap-2">
            <span class="text-slate-500 text-xs font-bold">Tông màu trang trí:</span>
            <span class="text-xs px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold border border-blue-200">
              {{ form.colorTone }}
            </span>
          </div>

          <!-- Ghi chú -->
          <div v-if="form.note" class="p-3.5 space-y-1">
            <span class="text-slate-500 text-xs font-bold block">Ghi chú của quý khách:</span>
            <p class="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed bg-white p-2.5 rounded-xl border border-slate-200">
              {{ form.note }}
            </p>
          </div>
        </div>
      </div>

      <!-- Action Footer -->
      <div class="p-4 sm:p-5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3 shrink-0">
        <button
          type="button"
          :disabled="submitting"
          class="px-5 py-3 rounded-2xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold transition disabled:opacity-50 min-h-[46px] cursor-pointer shadow-sm"
          @click="emit('edit')"
        >
          <i class="fa-solid fa-pen-to-square mr-1"></i>
          Chỉnh sửa lại
        </button>

        <button
          type="button"
          :disabled="submitting"
          class="flex-1 sm:flex-initial px-6 py-3 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-blue-600/25 transition disabled:opacity-60 flex items-center justify-center gap-2 min-h-[46px] cursor-pointer"
          @click="emit('confirm')"
        >
          <span v-if="submitting" class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
          <span v-if="submitting">Đang gửi yêu cầu...</span>
          <span v-else>Xác nhận gửi yêu cầu</span>
          <i v-if="!submitting" class="fa-solid fa-check text-xs"></i>
        </button>
      </div>
    </div>
  </div>
</template>
