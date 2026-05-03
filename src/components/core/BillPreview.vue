<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useUIStore } from '@/stores/useUIStore'
import { useFormStore } from '@/stores/useFormStore'
import { useAppStore } from '@/stores/useAppStore'
import { useConfigStore } from '@/stores/useConfigStore'
import { useBillRender } from '@/composables/useBillRender'
import { useForm } from '@/composables/useForm'
import { formatVND } from '@/utils'
import { PARTY_TYPES } from '@/utils/constants'

const ui = useUIStore()
const formStore = useFormStore()
const appStore = useAppStore()
const configStore = useConfigStore()
const { mobileScaleStyles, wrapperScaleStyles } = useBillRender()
const { depositTransferContent, qrImageUrl } = useForm()

const currentTimestamp = ref('')
let _timestampTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  currentTimestamp.value = new Date().toLocaleString('vi-VN')
  _timestampTimer = setInterval(() => {
    currentTimestamp.value = new Date().toLocaleString('vi-VN')
  }, 1000)
})

onUnmounted(() => {
  if (_timestampTimer) {
    clearInterval(_timestampTimer)
    _timestampTimer = null
  }
})

// --- KDS Vertical Slider ---
const MODES = ['full', 'kitchen', 'bar'] as const
const ITEM_HEIGHT = 72 // px per slider item

const sliderIndicatorTop = computed(() => {
  const idx = MODES.indexOf(formStore.billMode as any)
  return `${idx * ITEM_HEIGHT}px`
})

let touchStartY = 0
function onSliderTouchStart(e: TouchEvent) {
  touchStartY = e.touches[0].clientY
}
function onSliderTouchMove(e: TouchEvent) {
  e.preventDefault()
}
function onSliderTouchEnd(e: TouchEvent) {
  const deltaY = touchStartY - e.changedTouches[0].clientY
  if (Math.abs(deltaY) < 30) return
const idx = MODES.indexOf(formStore.billMode as any)
  if (deltaY > 0 && idx < MODES.length - 1) {
    formStore.billMode = MODES[idx + 1]
    haptic('light')
  } else if (deltaY < 0 && idx > 0) {
    formStore.billMode = MODES[idx - 1]
    haptic('light')
  }
}

import { haptic } from '@/composables/useGestures'
import paidStampImg from '@/assets/paid-stamp.png'

// --- Parallax Effect for Stamp ---
const stampParallax = ref({ x: 0, y: 0 })
function handleMouseMove(e: MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const x = (e.clientX - rect.left) / rect.width - 0.5
  const y = (e.clientY - rect.top) / rect.height - 0.5
  stampParallax.value = { x: x * 15, y: y * 15 }
}
function resetParallax() {
  stampParallax.value = { x: 0, y: 0 }
}
</script>

<template>
  <!-- RIGHT PANEL (BILL PREVIEW) -->
  <div v-show="ui.tab === 'preview' || true" :class="['w-full md:w-7/12 flex-1 overflow-y-auto bill-preview-wrapper bg-slate-100', ui.tab !== 'preview' ? 'hidden md:block' : '']" class="custom-scrollbar">
    <div class="p-4 md:p-8 flex gap-0 md:gap-4 justify-center">

      <!-- Scaled wrapper -->
      <div class="w-full max-w-[800px] relative" :style="wrapperScaleStyles">

        <div id="bill-render" :style="mobileScaleStyles" class="bill-preview-container p-10 md:p-14 bg-white rounded-none md:rounded-3xl relative mx-auto" @mousemove="handleMouseMove" @mouseleave="resetParallax">

          <!-- HEADER -->
          <div class="text-center mb-10">
            <div class="flex justify-center mb-4">
              <img :src="configStore.branding.logo || '/favicon.svg'" class="h-32 object-contain print-no-shadow" alt="Logo" loading="lazy">
            </div>
            <h1 class="font-black tracking-widest text-[#1A237E] uppercase text-4xl mb-2" style="font-family: 'Be Vietnam Pro', sans-serif;">KING'S GRILL</h1>
            <h2 class="font-bold tracking-widest text-slate-500 uppercase text-xl" style="font-family: 'Inter', sans-serif;">PHIẾU ĐẶT BÀN</h2>
            <div class="w-24 h-1 mx-auto mt-6 rounded-full bg-yellow-400"></div>
          </div>

          <!-- INFO & STAMP SECTION -->
          <div class="relative mb-10">
            <!-- Customer Info Grid -->
            <div class="grid grid-cols-[140px_1fr] gap-y-4 text-[17px] w-3/4">
              <div class="flex items-center gap-3 text-slate-500 font-bold"><i class="fa-solid fa-user w-5 text-center"></i> Khách hàng</div>
              <div class="font-black text-[#1A237E]">{{ formStore.customer.name || '---' }}</div>
              
              <div class="flex items-center gap-3 text-slate-500 font-bold"><i class="fa-solid fa-phone w-5 text-center"></i> SĐT / Zalo</div>
              <div class="font-black text-[#1A237E]">{{ formStore.customer.phone || '---' }}</div>
              
              <div class="flex items-center gap-3 text-slate-500 font-bold"><i class="fa-regular fa-calendar w-5 text-center"></i> Thời gian</div>
              <div class="font-black text-slate-800">{{ formStore.customer.date || 'dd/mm/yyyy' }} • {{ formStore.customer.time || '--:--' }}</div>
              
              <div class="flex items-center gap-3 text-slate-500 font-bold"><i class="fa-solid fa-users w-5 text-center"></i> Số khách</div>
              <div class="font-black text-slate-800">{{ formStore.customer.pax || '0' }} người</div>
              
              <div class="flex items-center gap-3 text-slate-500 font-bold"><i class="fa-solid fa-chair w-5 text-center"></i> Bàn</div>
              <div class="font-black text-slate-800">{{ formStore.customer.tables || '---' }}</div>
              
              <div class="flex items-center gap-3 text-slate-500 font-bold"><i class="fa-solid fa-wine-glass w-5 text-center"></i> Loại tiệc</div>
              <div class="font-black text-slate-800">{{ formStore.customer.type || '---' }}</div>
            </div>

            <!-- Stamp -->
            <div class="absolute top-0 right-0 z-20" :style="{ transform: `rotate(-4deg) translate(${stampParallax.x}px, ${stampParallax.y}px)` }">
              <div v-if="formStore.deposit.isPaid" class="border-4 border-green-600 text-green-600 p-4 rounded-xl text-center transform bg-white/90 backdrop-blur-sm shadow-xl">
                <div class="font-black text-3xl uppercase tracking-widest border-b-2 border-green-600 pb-2 mb-2">ĐÃ ĐẶT CỌC</div>
                <div class="font-mono font-bold text-sm">{{ formStore.deposit.time }}</div>
              </div>
              <div v-else class="border-4 border-[#1A237E] text-[#1A237E] p-4 rounded-xl text-center transform bg-white/90 backdrop-blur-sm shadow-xl flex flex-col items-center justify-center opacity-80">
                <img :src="configStore.branding.logo || '/favicon.svg'" class="h-20 opacity-90 mb-2 filter drop-shadow-sm" style="filter: brightness(0) saturate(100%) invert(13%) sepia(85%) saturate(3025%) hue-rotate(227deg) brightness(85%) contrast(106%);">
                <div class="font-black text-4xl uppercase tracking-widest" style="font-family: 'Praise', cursive;">Chờ cọc</div>
              </div>
            </div>
          </div>

          <!-- MENU TABLE -->
          <table class="w-full mb-8 border-collapse">
            <thead>
              <tr class="bg-[#1A237E] text-white">
                <th class="py-3 px-4 text-left font-bold text-[15px] rounded-tl-xl w-12">#</th>
                <th class="py-3 px-4 text-left font-bold text-[15px]">TÊN MÓN</th>
                <th class="py-3 px-4 text-center font-bold text-[15px] w-20">SL</th>
                <th class="py-3 px-4 text-right font-bold text-[15px] w-32">ĐƠN GIÁ</th>
                <th class="py-3 px-4 text-right font-bold text-[15px] rounded-tr-xl w-36">THÀNH TIỀN</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!formStore.filteredBillItems.length">
                <td colspan="5" class="py-8 text-center text-slate-400 font-semibold bg-slate-50 border-b border-slate-200">
                  <i class="fa-regular fa-bell mb-2 text-xl block"></i>
                  Chưa có món nào được thêm
                </td>
              </tr>
              <tr v-for="(item, i) in formStore.filteredBillItems" :key="i" class="border-b border-slate-100">
                <td class="py-4 px-4 font-bold text-slate-400">{{ i + 1 }}</td>
                <td class="py-4 px-4">
                  <div class="font-bold text-slate-800 text-[16px]">{{ item.name || 'Chưa đặt tên' }}</div>
                  <div v-if="item.note" class="text-[13px] text-red-500 font-medium mt-1 italic">{{ item.note }}</div>
                </td>
                <td class="py-4 px-4 text-center font-black text-slate-800">{{ item.qty }}</td>
                <td class="py-4 px-4 text-right font-bold text-slate-600">{{ formatVND(item.price) }}</td>
                <td class="py-4 px-4 text-right font-black text-[#1A237E]">{{ formatVND(item.price * item.qty) }}</td>
              </tr>
            </tbody>
          </table>

          <!-- TOTALS -->
          <div class="space-y-4 mb-10 w-full md:w-1/2 ml-auto">
            <div class="flex justify-between items-center text-lg">
              <span class="font-bold text-slate-500 uppercase">TẠM TÍNH</span>
              <span class="font-black text-slate-800">{{ formatVND(formStore.calculatedTotals.sub) }}</span>
            </div>
            <div class="flex justify-between items-center pt-4 border-t-2 border-dashed border-slate-200">
              <span class="text-2xl font-black text-[#1A237E] uppercase">TỔNG CỘNG</span>
              <span class="text-3xl font-black text-[#1A237E]">{{ formatVND(formStore.calculatedTotals.final) }}</span>
            </div>
            <div class="flex justify-between items-center pt-2">
              <span class="text-lg font-bold flex items-center gap-2" :class="formStore.deposit.isPaid ? 'text-green-600' : 'text-red-500'">
                <i class="fa-solid" :class="formStore.deposit.isPaid ? 'fa-check' : 'fa-hourglass-half'"></i> 
                {{ formStore.deposit.isPaid ? 'ĐÃ ĐẶT CỌC' : 'YÊU CẦU ĐẶT CỌC' }}
              </span>
              <span class="text-2xl font-black" :class="formStore.deposit.isPaid ? 'text-green-600' : 'text-red-500'">
                {{ formatVND(formStore.deposit.amount) }}
              </span>
            </div>
          </div>

          <!-- QR BANK TRANSFER (Full Bill only) -->
          <div v-if="appStore.currentBank && !formStore.deposit.isPaid" class="bg-slate-50 border-2 border-slate-100 rounded-3xl p-6 mb-8 w-full">
            <h3 class="font-black text-sm text-slate-800 uppercase tracking-widest mb-6 text-center">THÔNG TIN CHUYỂN KHOẢN</h3>
            
            <div class="flex gap-8 items-center justify-center">
              <!-- QR Code -->
              <div class="flex-shrink-0 bg-white p-3 rounded-2xl shadow-sm border border-slate-200 relative">
                <img :src="qrImageUrl" class="w-40 h-40 object-contain rounded-xl" alt="QR Code" crossorigin="anonymous" loading="lazy">
                <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div class="bg-white rounded-full p-1 shadow-md">
                    <i class="fa-solid fa-shield-check text-green-500 text-2xl"></i>
                  </div>
                </div>
              </div>
              
              <!-- Bank Details -->
              <div class="space-y-4 flex-grow max-w-sm">
                <div class="flex justify-between items-center border-b border-slate-200 pb-2">
                  <span class="text-sm font-bold text-slate-500 uppercase">Ngân hàng</span>
                  <span class="font-black text-slate-800 text-right">{{ appStore.currentBank.name }}</span>
                </div>
                <div class="flex justify-between items-center border-b border-slate-200 pb-2">
                  <span class="text-sm font-bold text-slate-500 uppercase">Số tài khoản</span>
                  <span class="font-black text-blue-600 text-lg tracking-wider text-right">{{ appStore.currentBank.number }}</span>
                </div>
                <div class="flex justify-between items-center border-b border-slate-200 pb-2">
                  <span class="text-sm font-bold text-slate-500 uppercase">Chủ tài khoản</span>
                  <span class="font-black text-slate-800 text-right">{{ appStore.currentBank.owner }}</span>
                </div>
                <div class="flex justify-between items-center pt-1">
                  <span class="text-sm font-bold text-slate-500 uppercase">Nội dung CK</span>
                  <span class="font-black text-blue-600 text-right">{{ depositTransferContent }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- FOOTER -->
          <div class="pt-8 text-center mt-12 border-t border-slate-100">
            <p class="text-slate-500 font-bold mb-2">❤ Cảm ơn quý khách đã tin tưởng lựa chọn King's Grill!</p>
            <p class="text-slate-400 font-medium italic">Hẹn gặp lại!</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
