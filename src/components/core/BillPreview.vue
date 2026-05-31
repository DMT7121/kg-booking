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
const { depositTransferContent, qrImageUrl, copyBookingConfirmation, toggleDepositState } = useForm()

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

const showMoreMenu = ref(false)

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
    <!-- DESKTOP TOOLBAR (md:flex, hidden on mobile) -->
    <div :class="[
      'hidden md:flex px-4 py-2.5 border-b items-center justify-between gap-3 shrink-0 z-20 shadow-sm transition-colors duration-250 w-full',
      isFullscreen ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-700'
    ]">
      <!-- Left: Navigation / Page Info -->
      <div class="flex items-center gap-2">
        <button @click="ui.tab = 'create'" class="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors text-slate-700" title="Quay lại">
          <i class="fa-solid fa-arrow-left"></i>
        </button>
        <h3 class="font-black text-slate-800 text-xs">Xem trước phiếu đặt bàn</h3>
        <span :class="[
          'px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm',
          formStore.deposit.isPaid 
            ? 'bg-emerald-500/10 text-emerald-550 border border-emerald-500/20' 
            : 'bg-amber-500/10 text-amber-550 border border-amber-500/20'
        ]">
          {{ formStore.deposit.isPaid ? 'Đã đặt cọc' : 'Yêu cầu cọc' }}
        </span>
      </div>

      <!-- Center: Zoom Controls -->
      <div class="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-full border border-slate-200/50">
        <!-- Zoom Out -->
        <button @click="adjustZoom(-0.1)" class="w-7 h-7 rounded-full flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-slate-600" title="Thu nhỏ">
          <i class="fa-solid fa-minus text-xs"></i>
        </button>

        <!-- 100% -->
        <button @click="setZoomMode('manual', 1.0)" class="px-2 py-0.5 rounded text-[10px] font-black hover:bg-slate-200 text-slate-700">
          100%
        </button>

        <!-- Current Percentage -->
        <span class="text-[10px] font-black w-10 text-center select-none text-slate-500">
          {{ Math.round(zoomScale * 100) }}%
        </span>

        <!-- Zoom In -->
        <button @click="adjustZoom(0.1)" class="w-7 h-7 rounded-full flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-slate-600" title="Phóng to">
          <i class="fa-solid fa-plus text-xs"></i>
        </button>

        <div class="w-[1px] h-4 bg-slate-300 dark:bg-slate-700 mx-1"></div>

        <!-- Fit Width -->
        <button @click="setZoomMode('fit-width')" :class="[
          'px-2.5 py-1 rounded-full text-[10px] font-black transition-all',
          zoomMode === 'fit-width' ? 'bg-blue-600 text-white shadow-sm' : 'hover:bg-slate-200 text-slate-500'
        ]" title="Vừa chiều ngang">
          Vừa màn hình
        </button>
      </div>

      <!-- Right Actions -->
      <div class="flex items-center gap-1.5">
        <!-- Confirm Deposit -->
        <button @click="toggleDepositState" :class="[
          'px-3 py-1.5 rounded-xl font-black text-[10px] uppercase flex items-center gap-1 shadow-sm transition-all active:scale-95 border',
          formStore.deposit.isPaid 
            ? 'bg-red-50 hover:bg-red-100 text-red-700 border-red-200' 
            : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
        ]">
          <i class="fa-solid" :class="formStore.deposit.isPaid ? 'fa-xmark' : 'fa-check'"></i>
          <span>{{ formStore.deposit.isPaid ? 'Hủy cọc' : 'Xác nhận cọc' }}</span>
        </button>

        <!-- Copy Message -->
        <button @click="copyBookingConfirmation" class="bg-slate-50 hover:bg-slate-100 text-slate-700 px-3 py-1.5 rounded-xl font-black text-[10px] uppercase flex items-center gap-1 border border-slate-200 transition-all active:scale-95 shadow-sm">
          <i class="fa-solid fa-copy"></i> <span>Tin nhắn</span>
        </button>

        <!-- Copy Link -->
        <button @click="shareCurrentBill" class="bg-slate-50 hover:bg-slate-100 text-slate-700 px-3 py-1.5 rounded-xl font-black text-[10px] uppercase flex items-center gap-1 border border-slate-200 transition-all active:scale-95 shadow-sm">
          <i class="fa-solid fa-link"></i> <span>Copy link</span>
        </button>

        <!-- Download PNG -->
        <button @click="triggerSave('image')" class="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-xl font-black text-[10px] uppercase flex items-center gap-1 shadow-md transition-all active:scale-95">
          <i class="fa-solid fa-image"></i> <span>PNG</span>
        </button>

        <!-- Download PDF -->
        <button @click="triggerSave('pdf')" class="bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 rounded-xl font-black text-[10px] uppercase flex items-center gap-1 shadow-md transition-all active:scale-95">
          <i class="fa-solid fa-file-pdf"></i> <span>PDF</span>
        </button>

        <!-- Fullscreen Button -->
        <button @click="isFullscreen = !isFullscreen; updatePreviewScale()" class="w-8 h-8 rounded-xl flex items-center justify-center bg-slate-100 hover:bg-slate-200 transition-all text-slate-600" :title="isFullscreen ? 'Thoát toàn màn hình' : 'Xem toàn màn hình'">
          <i class="fa-solid" :class="isFullscreen ? 'fa-compress text-blue-600' : 'fa-expand'"></i>
        </button>
      </div>
    </div>

    <!-- MOBILE TOOLBAR (block md:hidden) -->
    <div :class="[
      'flex md:hidden flex-col border-b shrink-0 z-[120] shadow-sm transition-colors duration-250 w-full relative',
      isFullscreen ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-700'
    ]">
      <!-- Row 1: Back, Title, Status, More button -->
      <div class="px-3 py-2 flex items-center justify-between gap-2 border-b border-slate-100/50">
        <div class="flex items-center gap-2">
          <button @click="ui.tab = 'create'" class="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors text-slate-700">
            <i class="fa-solid fa-arrow-left text-sm"></i>
          </button>
          <span class="font-black text-slate-800 text-[11px] uppercase tracking-wider">Phiếu đặt</span>
          <span :class="[
            'px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider shadow-sm',
            formStore.deposit.isPaid 
              ? 'bg-emerald-500/10 text-emerald-550 border border-emerald-500/20' 
              : 'bg-amber-500/10 text-amber-550 border border-amber-500/20'
          ]">
            {{ formStore.deposit.isPaid ? 'Đã cọc' : 'Chưa cọc' }}
          </span>
        </div>
        
        <!-- More Actions Dropdown Toggle -->
        <div class="relative">
          <button @click="showMoreMenu = !showMoreMenu" class="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-650 flex items-center justify-center transition-all">
            <i class="fa-solid fa-ellipsis-vertical text-sm"></i>
          </button>
          
          <!-- Dropdown Menu -->
          <div v-show="showMoreMenu" class="absolute right-0 top-full mt-2 w-48 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 py-2 animate-in fade-in slide-in-from-top-2 duration-150 text-slate-700">
            <button @click="copyBookingConfirmation(); showMoreMenu = false" class="w-full px-4 py-2.5 text-left text-xs font-black uppercase tracking-wider hover:bg-slate-50 active:bg-slate-100 flex items-center gap-2">
              <i class="fa-solid fa-copy text-slate-400 w-4 text-center text-xs"></i> Copy tin nhắn
            </button>
            <button @click="shareCurrentBill(); showMoreMenu = false" class="w-full px-4 py-2.5 text-left text-xs font-black uppercase tracking-wider hover:bg-slate-50 active:bg-slate-100 flex items-center gap-2">
              <i class="fa-solid fa-link text-slate-400 w-4 text-center text-xs"></i> Chia sẻ link
            </button>
            <button @click="openZaloChat(); showMoreMenu = false" class="w-full px-4 py-2.5 text-left text-xs font-black uppercase tracking-wider hover:bg-slate-50 active:bg-slate-100 flex items-center gap-2">
              <i class="fa-solid fa-comment-dots text-slate-400 w-4 text-center text-xs"></i> Nhắn Zalo
            </button>
            <div class="h-[1px] bg-slate-105 my-1"></div>
            <button @click="isFullscreen = !isFullscreen; updatePreviewScale(); showMoreMenu = false" class="w-full px-4 py-2.5 text-left text-xs font-black uppercase tracking-wider hover:bg-slate-50 active:bg-slate-100 flex items-center gap-2">
              <i class="fa-solid text-slate-400 w-4 text-center text-xs" :class="isFullscreen ? 'fa-compress text-blue-600' : 'fa-expand'"></i> 
              {{ isFullscreen ? 'Thoát Tràn Viền' : 'Xem Tràn Viền' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Row 2: Main action buttons grid -->
      <div class="px-3 py-1.5 flex items-center justify-between gap-1.5 border-b border-slate-100/50 bg-slate-550/5">
        <!-- Confirm/Cancel Deposit -->
        <button @click="toggleDepositState" :class="[
          'flex-grow py-2 rounded-xl font-black text-[9px] uppercase tracking-wider flex items-center justify-center gap-1 shadow-sm active:scale-95 border transition-all',
          formStore.deposit.isPaid 
            ? 'bg-red-50 hover:bg-red-100 text-red-700 border-red-200' 
            : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
        ]">
          <i class="fa-solid text-[9px]" :class="formStore.deposit.isPaid ? 'fa-xmark' : 'fa-check'"></i>
          <span>{{ formStore.deposit.isPaid ? 'Hủy cọc' : 'Xác nhận cọc' }}</span>
        </button>

        <!-- PNG -->
        <button @click="triggerSave('image')" class="px-3 py-2 bg-indigo-600 text-white rounded-xl font-black text-[9px] uppercase tracking-wider flex items-center justify-center gap-1 shadow-md active:scale-95 transition-all">
          <i class="fa-solid fa-image text-[9px]"></i> <span>PNG</span>
        </button>

        <!-- PDF -->
        <button @click="triggerSave('pdf')" class="px-3 py-2 bg-rose-600 text-white rounded-xl font-black text-[9px] uppercase tracking-wider flex items-center justify-center gap-1 shadow-md active:scale-95 transition-all">
          <i class="fa-solid fa-file-pdf text-[9px]"></i> <span>PDF</span>
        </button>

        <!-- Fit Width -->
        <button @click="setZoomMode('fit-width')" :class="[
          'px-2.5 py-2 rounded-xl font-black text-[9px] uppercase tracking-wider flex items-center justify-center gap-1 transition-all active:scale-95 border',
          zoomMode === 'fit-width' ? 'bg-blue-600 text-white border-blue-650 shadow-sm' : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-500'
        ]">
          <span>Vừa màn hình</span>
        </button>
      </div>

      <!-- Row 3: Zoom Controls -->
      <div class="px-3 py-1 flex items-center justify-center gap-4 bg-slate-50/50">
        <button @click="adjustZoom(-0.1)" class="w-6 h-6 rounded-full flex items-center justify-center hover:bg-slate-200 text-slate-650 transition-colors">
          <i class="fa-solid fa-minus text-[10px]"></i>
        </button>
        <span class="text-[9px] font-black text-slate-500 uppercase tracking-widest">
          Zoom: {{ Math.round(zoomScale * 100) }}%
        </span>
        <button @click="adjustZoom(0.1)" class="w-6 h-6 rounded-full flex items-center justify-center hover:bg-slate-200 text-slate-650 transition-colors">
          <i class="fa-solid fa-plus text-[10px]"></i>
        </button>
      </div>
    </div>


    <!-- Scrollable container for Bill -->
    <div :class="[
      'flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar relative',
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

            <!-- GHI CHÚ TIỆC / LƯU Ý PHỤC VỤ -->
            <div v-if="formStore.customer.note && formStore.customer.note.trim()" class="mb-8 p-4 bg-amber-50/60 border border-amber-200/80 rounded-2xl text-left">
              <div class="flex items-center gap-2 text-amber-950 font-black uppercase text-[11px] tracking-wider mb-2">
                <i class="fa-solid fa-triangle-exclamation text-amber-600 text-sm animate-pulse"></i>
                LƯU Ý PHỤC VỤ / GHI CHÚ TIỆC
              </div>
              <p class="text-amber-900 text-[14px] font-bold leading-relaxed whitespace-pre-line">{{ formStore.customer.note }}</p>
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
                      <i class="fa-regular fa-bell mb-2 text-xl block text-slate-300"></i>
                      Chưa có món đặt trước (Món ăn gọi trực tiếp tại nhà hàng)
                      <div class="mt-3 text-[11px] text-amber-700 font-black bg-amber-50 px-4 py-2 rounded-xl border border-amber-100 inline-block leading-relaxed max-w-[95%]">
                        <i class="fa-solid fa-circle-info mr-1 text-amber-500"></i>
                        Cọc giữ bàn mặc định: {{ formatVND(formStore.deposit.amount) }} <br>
                        <span class="text-[9px] font-bold text-slate-400">
                          (Áp dụng cho bàn chưa đặt món trước {{ (parseInt(formStore.customer.pax) || 0) >= 20 ? 'từ 20 khách trở lên' : 'dưới 20 khách' }})
                        </span>
                      </div>
                    </td>
                  </tr>
                  <tr v-for="(item, i) in formStore.filteredBillItems" :key="i" class="border-b border-slate-100">
                    <td class="py-4 px-4 font-bold text-slate-400">{{ i + 1 }}</td>
                    <td class="py-4 px-4 text-left">
                      <div class="font-black text-slate-800 text-[15px] uppercase tracking-wide whitespace-normal break-words overflow-wrap-anywhere">{{ item.name || 'Chưa đặt tên' }}</div>
                      <div v-if="item.note" class="text-[12px] text-rose-600 font-bold mt-1.5 whitespace-pre-line leading-relaxed text-left border-l-2 border-rose-200 pl-2">
                        {{ item.note }}
                      </div>
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
