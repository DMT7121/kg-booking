<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useUIStore } from '@/stores/useUIStore'
import { useFormStore } from '@/stores/useFormStore'
import { useAppStore } from '@/stores/useAppStore'
import { useConfigStore } from '@/stores/useConfigStore'
import { useBillRender } from '@/composables/useBillRender'
import { useForm } from '@/composables/useForm'
import { formatVND } from '@/utils'

const ui = useUIStore()
const formStore = useFormStore()
const appStore = useAppStore()
const configStore = useConfigStore()
const { 
  mobileScaleStyles, 
  wrapperScaleStyles, 
  triggerSave, 
  updatePreviewScale,
  zoomMode,
  zoomScale,
  isFullscreen,
  setZoomMode,
  adjustZoom
} = useBillRender()
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
const previewContainerRef = ref<HTMLElement | null>(null)

function handleKeyDown(e: KeyboardEvent) {
  // ESC to exit fullscreen
  if (e.key === 'Escape' && isFullscreen.value) {
    isFullscreen.value = false
    updatePreviewScale()
    e.preventDefault()
  }
  
  // Ctrl/Cmd shortcuts for zoom
  if (e.ctrlKey || e.metaKey) {
    if (e.key === '=' || e.key === '+') {
      adjustZoom(0.1)
      e.preventDefault()
    } else if (e.key === '-') {
      adjustZoom(-0.1)
      e.preventDefault()
    } else if (e.key === '0') {
      setZoomMode('manual', 1.0)
      e.preventDefault()
    }
  }
}

onMounted(() => {
  currentTimestamp.value = new Date().toLocaleString('vi-VN')
  _timestampTimer = setInterval(() => {
    currentTimestamp.value = new Date().toLocaleString('vi-VN')
  }, 1000)

  // Watch for container resizes to scale the bill
  if (previewContainerRef.value) {
    _ro = new ResizeObserver(() => {
      updatePreviewScale()
    })
    _ro.observe(previewContainerRef.value)
  }
  window.addEventListener('resize', updatePreviewScale)
  window.addEventListener('keydown', handleKeyDown)
  setTimeout(updatePreviewScale, 150)
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
  window.removeEventListener('keydown', handleKeyDown)
})

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

function handleDoubleClick() {
  if (zoomMode.value === 'fit-width') {
    setZoomMode('manual', 1.0)
  } else {
    setZoomMode('fit-width')
  }
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
  <div ref="previewContainerRef" :class="[
    'flex flex-col relative w-full h-full select-none transition-all duration-300',
    isFullscreen ? 'fixed inset-0 z-[200] bg-slate-900/95 backdrop-blur-md h-[100dvh] overflow-hidden' : 'bg-slate-50'
  ]">
    
    <!-- ZOOM / ACTION TOOLBAR -->
    <div :class="[
      'px-3 py-2 md:px-4 md:py-2.5 border-b flex items-center justify-between gap-2 shrink-0 z-20 shadow-sm transition-colors duration-250',
      isFullscreen ? 'bg-slate-900/90 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-700'
    ]">
      <!-- Left: Status Badge -->
      <div class="flex items-center gap-2">
        <span :class="[
          'px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm',
          formStore.deposit.isPaid 
            ? 'bg-emerald-500/10 text-emerald-550 border border-emerald-500/20' 
            : 'bg-amber-500/10 text-amber-550 border border-amber-500/20'
        ]">
          {{ formStore.deposit.isPaid ? 'Đã đặt cọc' : 'Yêu cầu cọc' }}
        </span>
        <span v-if="isFullscreen" class="hidden sm:inline text-xs font-bold text-slate-400">Xem toàn màn hình</span>
      </div>

      <!-- Center: Zoom Controls -->
      <div class="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-full border border-slate-200/50">
        <!-- Zoom Out -->
        <button @click="adjustZoom(-0.1)" class="w-7 h-7 rounded-full flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-350" title="Thu nhỏ (Ctrl + -)">
          <i class="fa-solid fa-minus text-xs"></i>
        </button>

        <!-- Current Percentage -->
        <span class="text-[11px] font-black w-14 text-center select-none text-slate-700 dark:text-slate-300">
          {{ Math.round(zoomScale * 100) }}%
        </span>

        <!-- Zoom In -->
        <button @click="adjustZoom(0.1)" class="w-7 h-7 rounded-full flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-350" title="Phóng to (Ctrl + +)">
          <i class="fa-solid fa-plus text-xs"></i>
        </button>

        <!-- Separator -->
        <div class="w-[1px] h-4 bg-slate-300 dark:bg-slate-700 mx-1"></div>

        <!-- Fit Width -->
        <button @click="setZoomMode('fit-width')" :class="[
          'px-2.5 py-1 rounded-full text-[10px] font-black transition-all',
          zoomMode === 'fit-width' ? 'bg-blue-600 text-white shadow-sm' : 'hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400'
        ]" title="Vừa chiều ngang">
          Rộng
        </button>

        <!-- Fit Screen -->
        <button @click="setZoomMode('fit-screen')" :class="[
          'px-2.5 py-1 rounded-full text-[10px] font-black transition-all',
          zoomMode === 'fit-screen' ? 'bg-blue-600 text-white shadow-sm' : 'hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400'
        ]" title="Vừa màn hình">
          Cao
        </button>
      </div>

      <!-- Right: Fullscreen / Exit -->
      <div class="flex items-center gap-1.5">
        <!-- Fullscreen Button -->
        <button @click="isFullscreen = !isFullscreen; updatePreviewScale()" class="w-8 h-8 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all text-slate-650" :title="isFullscreen ? 'Thoát toàn màn hình' : 'Xem toàn màn hình'">
          <i class="fa-solid" :class="isFullscreen ? 'fa-compress text-blue-600' : 'fa-expand'"></i>
        </button>

        <!-- Save Actions inside Fullscreen -->
        <template v-if="isFullscreen">
          <button @click="triggerSave('image')" class="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-md transition-all active:scale-95">
            <i class="fa-solid fa-image"></i> <span class="hidden sm:inline">Tải ảnh</span>
          </button>
          <button @click="triggerSave('pdf')" class="bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-md transition-all active:scale-95">
            <i class="fa-solid fa-file-pdf"></i> <span class="hidden sm:inline">Tải PDF</span>
          </button>
          <button @click="isFullscreen = false; updatePreviewScale()" class="w-8 h-8 rounded-xl bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center border border-slate-700 transition-colors">
            <i class="fa-solid fa-xmark text-sm"></i>
          </button>
        </template>
      </div>
    </div>

    <!-- Scrollable container for Bill -->
    <div :class="[
      'flex-1 overflow-y-auto custom-scrollbar relative',
      isFullscreen ? 'bg-slate-950/20' : 'bg-slate-50'
    ]">
      <div :class="[
        'flex gap-0 md:gap-4 justify-center min-h-full',
        isFullscreen ? 'p-4 md:p-8' : 'p-4 md:p-8 pb-32 md:pb-8'
      ]">
        <!-- Scaled wrapper -->
        <div class="w-full max-w-[800px] relative transition-all duration-250 ease-out" :style="wrapperScaleStyles">

          <div id="bill-render" :style="mobileScaleStyles" class="bill-preview-container w-[800px] p-10 md:p-14 bg-white rounded-none md:rounded-3xl relative mx-auto shadow-xl select-text border border-slate-200/50" @mousemove="handleMouseMove" @mouseleave="resetParallax" @dblclick="handleDoubleClick">

            <!-- HEADER -->
            <div class="text-center mb-6 mt-0">
              <div class="flex justify-center mb-2">
                <img :src="configStore.branding.logo || '/favicon.svg'" class="h-[200px] object-contain print-no-shadow" alt="Logo" loading="lazy">
              </div>
              <h1 class="font-black tracking-widest text-blue-900 uppercase text-3xl mb-1" style="font-family: 'Be Vietnam Pro', sans-serif;">KING'S GRILL</h1>
              <p class="text-slate-500 text-xs font-semibold mb-2" style="font-family: 'Inter', sans-serif;">ĐC: Số 34, Đường Hoàng Văn Thụ, Phường Thủ Dầu Một, Thành phố Hồ Chí Minh</p>
              <h2 class="font-bold tracking-widest text-slate-500 uppercase text-xl" style="font-family: 'Inter', sans-serif;">PHIẾU ĐẶT BÀN</h2>
              <div class="w-24 h-1 mx-auto mt-4 rounded-full bg-yellow-400"></div>
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
              <div class="absolute -top-12 right-0 z-20 pointer-events-none" :style="{ transform: `rotate(-4deg) translate(${stampParallax.x}px, ${stampParallax.y}px)` }">
                <div class="relative w-[220px] flex flex-col items-center justify-center">
                  <img :src="formStore.deposit.isPaid ? '/images/stamps/paid.png' : '/images/stamps/pending.png'" class="w-full object-contain filter drop-shadow-lg" alt="Stamp" />
                  <div v-if="formStore.deposit.isPaid" class="mt-2 w-full text-center text-[#d11124] font-black tracking-widest whitespace-nowrap" style="font-family: 'Cal Sans', sans-serif; font-size: 16px;">
                    {{ formatDepositTime(formStore.deposit.time) }}
                  </div>
                </div>
              </div>
            </div>

            <!-- MENU TABLE -->
            <div class="overflow-x-auto w-full mb-8">
              <table class="w-full border-collapse min-w-[500px]">
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
            </div>

            <!-- TOTALS -->
            <div class="space-y-4 mb-10 w-full md:w-1/2 ml-auto">
              <div class="flex justify-between items-center text-lg">
                <span class="font-bold text-slate-500 uppercase">TẠM TÍNH</span>
                <span class="font-black text-slate-800">{{ formatVND(formStore.calculatedTotals.sub) }}</span>
              </div>
              
              <template v-if="formStore.taxEnabled">
                 <div v-if="formStore.calculatedTotals.vat8 > 0" class="flex justify-between items-center text-md text-slate-500">
                   <span class="font-bold uppercase">VAT (8%)</span>
                   <span class="font-bold">{{ formatVND(formStore.calculatedTotals.vat8) }}</span>
                 </div>
                 <div v-if="formStore.calculatedTotals.vat10 > 0" class="flex justify-between items-center text-md text-slate-500">
                   <span class="font-bold uppercase">VAT (10%)</span>
                   <span class="font-bold">{{ formatVND(formStore.calculatedTotals.vat10) }}</span>
                 </div>
              </template>

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
              <div v-if="formStore.calculatedTotals.final - formStore.deposit.amount > 0" class="flex justify-between items-center pt-4 border-t-2 border-slate-200">
                <span class="text-xl font-black text-slate-800 uppercase">CÒN LẠI</span>
                <span class="text-2xl font-black text-rose-600">{{ formatVND(formStore.calculatedTotals.final - formStore.deposit.amount) }}</span>
              </div>
            </div>

            <!-- QR BANK TRANSFER (Full Bill only) -->
            <div v-if="appStore.currentBank && !formStore.deposit.isPaid" class="bg-slate-50 border-2 border-slate-100 rounded-3xl p-6 mb-8 w-full">
              <h3 class="font-black text-sm text-slate-800 uppercase tracking-widest mb-6 text-center">THÔNG TIN CHUYỂN KHOẢN</h3>
              
              <div class="flex gap-4 md:gap-8 items-center justify-center flex-wrap md:flex-nowrap">
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
                <div class="space-y-4 flex-grow w-full max-w-sm">
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
              <div class="mb-4 text-slate-600 font-bold text-[13px] uppercase tracking-wider flex items-center justify-center gap-2">
                <i class="fa-solid fa-headset text-blue-600 text-sm"></i>
                <span>Nhân viên hỗ trợ: {{ formStore.staff.name || '---' }}</span>
                <span v-if="formStore.staff.phone" class="text-blue-600 font-black ml-1">({{ formStore.staff.phone }})</span>
              </div>
              <p class="text-slate-500 font-bold mb-2">❤ Cảm ơn quý khách đã tin tưởng lựa chọn King's Grill!</p>
              <p class="text-slate-400 font-medium italic">Hẹn gặp lại!</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Fullscreen Sticky Bottom Action bar -->
    <div v-if="isFullscreen" class="bg-slate-900 border-t border-slate-800 p-4 shrink-0 flex items-center justify-center gap-4 z-20 safe-area-pb">
      <button @click="triggerSave('print')" class="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs uppercase flex items-center gap-2 border border-slate-700 transition-all active:scale-95">
        <i class="fa-solid fa-print"></i> In Phiếu
      </button>
      <button @click="shareCurrentBill" class="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs uppercase flex items-center gap-2 border border-slate-700 transition-all active:scale-95">
        <i class="fa-solid fa-share-nodes"></i> Chia sẻ link
      </button>
      <button @click="openZaloChat" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs uppercase flex items-center gap-2 border border-blue-500 transition-all active:scale-95">
        <i class="fa-solid fa-comment-dots"></i> Nhắn Zalo
      </button>
    </div>
  </div>
</template>
