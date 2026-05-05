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
const { mobileScaleStyles, wrapperScaleStyles, triggerSave, updatePreviewScale } = useBillRender()
const { depositTransferContent, qrImageUrl } = useForm()

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

const currentTimestamp = ref('')
let _timestampTimer: ReturnType<typeof setInterval> | null = null

let _ro: ResizeObserver | null = null

onMounted(() => {
  currentTimestamp.value = new Date().toLocaleString('vi-VN')
  _timestampTimer = setInterval(() => {
    currentTimestamp.value = new Date().toLocaleString('vi-VN')
  }, 1000)

  // Watch for container resizes to scale the bill
  const wrapper = document.querySelector('.bill-preview-wrapper')
  if (wrapper) {
    _ro = new ResizeObserver(() => {
      updatePreviewScale()
    })
    _ro.observe(wrapper)
  }
  window.addEventListener('resize', updatePreviewScale)
  setTimeout(updatePreviewScale, 100)
})

onUnmounted(() => {
  if (_timestampTimer) {
    clearInterval(_timestampTimer)
    _timestampTimer = null
  }
  if (_ro) {
    _ro.disconnect()
    _ro = null
  }
  window.removeEventListener('resize', updatePreviewScale)
})

// Removed KDS slider variables
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

function shareCurrentBill() {
  const id = formStore.id
  if (!id || !formStore.customer.name) {
    ui.showToast('Vui lòng nhập thông tin đơn hàng trước!', 'warning')
    return
  }
  const url = `${window.location.origin}${window.location.pathname}#/bill/${id}`
  
  if (navigator.share) {
    navigator.share({
      title: 'Phiếu Đặt Bàn - King\'s Grill',
      text: `Phiếu đặt bàn của ${formStore.customer.name}`,
      url: url
    }).catch(err => {
      console.log('Share failed:', err)
      navigator.clipboard.writeText(url).then(() => {
        ui.showToast(`📤 Đã copy link bill!`, 'success')
      })
    })
  } else {
    navigator.clipboard.writeText(url).then(() => {
      ui.showToast(`📤 Đã copy link bill!`, 'success')
    }).catch(() => ui.showAlert('Link Bill', url))
  }
}

function openZaloChat() {
  if (formStore.customer.phone) {
    window.open(`https://zalo.me/${formStore.customer.phone.replace(/[^0-9]/g, '')}`, '_blank')
  } else {
    ui.showToast('Không có số điện thoại khách hàng!', 'warning')
  }
}
</script>

<template>
  <!-- BILL PREVIEW TAB CONTENT -->
  <div class="w-full h-full flex-1 overflow-y-auto bill-preview-wrapper bg-slate-50 flex flex-col relative custom-scrollbar pb-24">
    
    <div class="p-4 md:p-8 flex gap-0 md:gap-4 justify-center flex-1 pb-28 md:pb-8">

      <!-- Scaled wrapper -->
      <div class="w-full max-w-[800px] relative" :style="wrapperScaleStyles">

        <div id="bill-render" :style="mobileScaleStyles" class="bill-preview-container p-10 md:p-14 bg-white rounded-none md:rounded-3xl relative mx-auto" @mousemove="handleMouseMove" @mouseleave="resetParallax">

          <!-- HEADER -->
          <div class="text-center mb-10">
            <div class="flex justify-center mb-4">
              <img :src="configStore.branding.logo || '/favicon.svg'" class="h-32 object-contain print-no-shadow" alt="Logo" loading="lazy">
            </div>
            <h1 class="font-black tracking-widest text-blue-900 uppercase text-4xl mb-2" style="font-family: 'Be Vietnam Pro', sans-serif;">KING'S GRILL</h1>
            <h2 class="font-bold tracking-widest text-slate-500 uppercase text-xl" style="font-family: 'Inter', sans-serif;">PHIẾU ĐẶT BÀN</h2>
            <div class="w-24 h-1 mx-auto mt-6 rounded-full bg-yellow-400"></div>
          </div>

          <!-- INFO & STAMP SECTION -->
          <div class="relative mb-10">
            <!-- Customer Info Grid -->
            <div class="grid grid-cols-[130px_1fr] gap-y-3.5 text-[15px] w-full lg:w-[70%]">
              <div class="flex items-center gap-3 text-slate-500 font-bold uppercase text-[11px] tracking-wider"><i class="fa-solid fa-user-tie w-4 text-center text-[13px]"></i> Khách hàng</div>
              <div class="font-black text-blue-950 text-[14px]">{{ formStore.customer.name || '---' }}</div>
              
              <div class="flex items-center gap-3 text-slate-500 font-bold uppercase text-[11px] tracking-wider"><i class="fa-solid fa-phone w-4 text-center text-[13px]"></i> SĐT / Zalo</div>
              <div class="font-black text-blue-950 text-[14px]">{{ formStore.customer.phone || '---' }}</div>
              
              <div class="flex items-center gap-3 text-slate-500 font-bold uppercase text-[11px] tracking-wider"><i class="fa-regular fa-calendar-days w-4 text-center text-[13px]"></i> Thời gian</div>
              <div class="font-black text-blue-950 text-[14px]">{{ formStore.customer.date || 'dd/mm/yyyy' }} • {{ formStore.customer.time || '--:--' }}</div>
              
              <div class="flex items-center gap-3 text-slate-500 font-bold uppercase text-[11px] tracking-wider"><i class="fa-solid fa-users w-4 text-center text-[13px]"></i> Số khách</div>
              <div class="font-black text-blue-950 text-[14px]">{{ formStore.customer.pax || '0' }} người</div>
              
              <div class="flex items-center gap-3 text-slate-500 font-bold uppercase text-[11px] tracking-wider"><i class="fa-solid fa-border-all w-4 text-center text-[13px]"></i> Bàn</div>
              <div class="font-black text-blue-950 text-[14px]">{{ formStore.customer.tables || '---' }}</div>
              
              <div class="flex items-center gap-3 text-slate-500 font-bold uppercase text-[11px] tracking-wider"><i class="fa-solid fa-utensils w-4 text-center text-[13px]"></i> Loại tiệc</div>
              <div class="font-black text-blue-950 text-[14px]">{{ formStore.customer.type || '---' }}</div>
            </div>

            <!-- Stamp -->
            <div class="absolute top-4 right-0 z-20 pointer-events-none" :style="{ transform: `rotate(-4deg) translate(${stampParallax.x}px, ${stampParallax.y}px)` }">
              <div class="relative w-[260px] h-[260px] flex flex-col items-center justify-center">
                <img :src="formStore.deposit.isPaid ? '/images/stamps/paid.png' : '/images/stamps/pending.png'" class="absolute inset-0 w-full h-full object-contain filter drop-shadow-lg" alt="Stamp" />
                <div v-if="formStore.deposit.isPaid" class="absolute bottom-[23%] left-0 w-full text-center text-[#d11124] font-black tracking-widest whitespace-nowrap" style="font-family: 'Cal Sans', sans-serif; font-size: 18px;">
                  {{ formatDepositTime(formStore.deposit.time) }}
                </div>
              </div>
            </div>
          </div>

          <!-- MENU TABLE -->
          <table class="w-full mb-8 border-collapse">
            <thead>
              <tr class="bg-blue-950 text-white">
                <th class="py-3 px-4 text-left font-bold text-[13px] rounded-tl-xl w-12">#</th>
                <th class="py-3 px-4 text-left font-bold text-[13px]">TÊN MÓN</th>
                <th class="py-3 px-4 text-center font-bold text-[13px] w-16">SL</th>
                <th class="py-3 px-4 text-right font-bold text-[13px] w-28">ĐƠN GIÁ</th>
                <th class="py-3 px-4 text-right font-bold text-[13px] rounded-tr-xl w-32">THÀNH TIỀN</th>
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
                <td class="py-4 px-4 text-right font-black text-blue-900">{{ formatVND(item.price * item.qty) }}</td>
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
              <span class="text-2xl font-black text-blue-900 uppercase">TỔNG CỘNG</span>
              <span class="text-3xl font-black text-blue-900">{{ formatVND(formStore.calculatedTotals.final) }}</span>
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
