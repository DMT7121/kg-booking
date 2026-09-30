<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useUIStore } from '@/stores/useUIStore'
import { useFormStore } from '@/stores/useFormStore'
import { useAppStore } from '@/stores/useAppStore'
import { useConfigStore } from '@/stores/useConfigStore'
import { useBillRender } from '@/composables/useBillRender'
import { useForm } from '@/composables/useForm'
import { formatVND, formatShortVND, isIOS, isAndroid, isDesktop } from '@/utils'

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
      return `${datePart} - ${timePart}`
    }
    return timeStr
  } catch (e) {
    return timeStr
  }
}

const getDayOfWeek = (dateStr?: string): string => {
  if (!dateStr) return ''
  try {
    const parts = dateStr.split('/')
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10)
      const month = parseInt(parts[1], 10) - 1
      const year = parseInt(parts[2], 10)
      const date = new Date(year, month, day)
      if (!isNaN(date.getTime())) {
        const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']
        return days[date.getDay()]
      }
    }
    return ''
  } catch (e) {
    return ''
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

watch(() => ui.tab, (tab) => {
  if (tab === 'preview') {
    nextTick(() => {
      updatePreviewScale()
      setTimeout(updatePreviewScale, 100)
      setTimeout(updatePreviewScale, 300)
    })
  }
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
  
  if ((isIOS || isAndroid) && navigator.share) {
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

function copyBillImageUrl() {
  const url = formStore.billUrl
  if (!url) {
    ui.showToast('Chưa có link ảnh online!', 'warning')
    return
  }
  navigator.clipboard.writeText(url).then(() => {
    ui.showToast('📤 Đã copy link ảnh phiếu đặt!', 'success')
  }).catch(() => ui.showAlert('Link Ảnh', url))
}

const showMoreMenu = ref(false)

function openZaloChat() {
  if (formStore.customer.phone) {
    window.open(`https://zalo.me/${formStore.customer.phone.replace(/[^0-9]/g, '')}`, '_blank')
  } else {
    ui.showToast('Không có số điện thoại khách hàng!', 'warning')
  }
}

import BillTemplateModern from '@/components/bills/templates/BillTemplateModern.vue'
import BillTemplateLuxury from '@/components/bills/templates/BillTemplateLuxury.vue'
import BillTemplateTicket from '@/components/bills/templates/BillTemplateTicket.vue'

const showQualityMenu = ref(false)
const qualities = [
  { id: 'standard', name: 'Tiêu chuẩn', scale: '1.5x', tag: '~350KB', desc: 'Gửi nhanh Zalo/3G', icon: 'fa-bolt' },
  { id: 'hd', name: 'Sắc nét HD', scale: '2.0x', tag: '~800KB', desc: 'Chuẩn Retina / 2K', icon: 'fa-star' },
  { id: 'ultra', name: 'Siêu nét Ultra', scale: '3.0x', tag: '~1.8MB', desc: 'Lưu trữ & In ấn 4K', icon: 'fa-gem' }
] as const

const templates = [
  { id: 'modern', name: 'Tối giản', icon: 'fa-newspaper', desc: 'Editorial' },
  { id: 'luxury', name: 'Hoàng gia', icon: 'fa-crown', desc: 'Royal VIP' },
  { id: 'ticket', name: 'Vé sự kiện', icon: 'fa-ticket', desc: 'Boarding Pass' }
] as const

function selectQuality(qId: 'standard' | 'hd' | 'ultra') {
  configStore.billPreferences.quality = qId
  showQualityMenu.value = false
  ui.showToast(`Đã chọn chất lượng ảnh: ${qualities.find(q => q.id === qId)?.name}`, 'info')
}

function selectTemplate(tId: 'modern' | 'luxury' | 'ticket') {
  configStore.billPreferences.template = tId
  nextTick(() => {
    updatePreviewScale()
  })
}

function toggleHidePrice() {
  configStore.billPreferences.hidePrice = !configStore.billPreferences.hidePrice
  if (configStore.billPreferences.hidePrice) {
    ui.showToast('Đã bật chế độ thiệp mời (Ẩn giá tiền)', 'info')
  } else {
    ui.showToast('Đã hiển thị đầy đủ giá tiền', 'info')
  }
}
</script>

<template>
  <div ref="previewContainerRef" :class="[
    'flex flex-col relative w-full h-full select-none transition-all duration-300',
    isFullscreen ? 'fixed inset-0 z-50 bg-slate-950' : 'bg-slate-100/50 dark:bg-slate-900/50'
  ]">
    <!-- ZOOM / ACTION TOOLBAR -->
    <!-- DESKTOP TOOLBAR (md:flex, hidden on mobile) -->
    <div :class="[
      'hidden md:flex px-4 py-2.5 border-b items-center justify-between gap-2.5 shrink-0 z-20 shadow-sm transition-colors duration-250 w-full',
      isFullscreen ? 'bg-surface-canvas border-border-default text-white' : 'bg-white dark:bg-surface-2 border-slate-200 dark:border-border-subtle text-slate-700 dark:text-slate-200'
    ]">
      <!-- Left: Navigation / Page Info & Status -->
      <div class="flex items-center gap-2 shrink-0">
        <button @click="ui.tab = 'create'" class="w-8 h-8 rounded-xl bg-slate-100 dark:bg-surface-3 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-surface-4 transition-colors text-slate-700 dark:text-slate-200 cursor-pointer" title="Quay lại">
          <i class="fa-solid fa-arrow-left"></i>
        </button>
        <span :class="[
          'px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm',
          formStore.deposit.isPaid 
            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' 
            : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
        ]">
          {{ formStore.deposit.isPaid ? 'Đã cọc' : 'Yêu cầu cọc' }}
        </span>
      </div>

      <!-- Center: 3 Template Presets & Guest Mode Toggle -->
      <div class="flex items-center gap-2">
        <!-- 3 Template Presets Segmented Bar -->
        <div class="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 gap-1 shadow-2xs">
          <button 
            v-for="tpl in templates" 
            :key="tpl.id"
            @click="selectTemplate(tpl.id)"
            :class="[
              'px-2.5 py-1 rounded-xl text-[11px] font-black transition-all flex items-center gap-1.5 cursor-pointer',
              configStore.billPreferences.template === tpl.id 
                ? 'bg-white dark:bg-slate-900 text-blue-900 dark:text-blue-400 shadow-xs border border-slate-200/80 dark:border-slate-700' 
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            ]"
            :title="`Chuyển sang mẫu phiếu ${tpl.name} (${tpl.desc})`"
          >
            <i class="fa-solid" :class="tpl.icon"></i>
            <span>{{ tpl.name }}</span>
          </button>
        </div>

        <!-- Hide Price Toggle (Chế độ thiệp mời) -->
        <button 
          @click="toggleHidePrice"
          :class="[
            'px-2.5 py-1.5 rounded-xl text-[11px] font-black transition-all flex items-center gap-1.5 border cursor-pointer active:scale-95 shadow-2xs',
            configStore.billPreferences.hidePrice 
              ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border-amber-300' 
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-200'
          ]"
          :title="configStore.billPreferences.hidePrice ? 'Đang bật chế độ thiệp mời (Bấm để hiện giá)' : 'Bấm để ẩn giá gửi khách (Chế độ thiệp mời)'"
        >
          <i class="fa-solid" :class="configStore.billPreferences.hidePrice ? 'fa-eye-slash text-amber-600' : 'fa-eye text-slate-400'"></i>
          <span>{{ configStore.billPreferences.hidePrice ? 'Đang ẩn giá' : 'Hiện giá' }}</span>
        </button>
      </div>

      <!-- Right Actions: Zoom + Cọc + Export with Quality Selector -->
      <div class="flex items-center gap-1.5 shrink-0">
        <!-- Zoom Controls -->
        <div class="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-full border border-slate-200/50 dark:border-slate-700/50">
          <button @click="adjustZoom(-0.1)" class="w-6 h-6 rounded-full flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-300 cursor-pointer" title="Thu nhỏ">
            <i class="fa-solid fa-minus text-[10px]"></i>
          </button>
          <button @click="setZoomMode('fit-width')" class="px-2 py-0.5 rounded text-[10px] font-black hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer" title="Vừa màn hình">
            {{ Math.round(zoomScale * 100) }}%
          </button>
          <button @click="adjustZoom(0.1)" class="w-6 h-6 rounded-full flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-300 cursor-pointer" title="Phóng to">
            <i class="fa-solid fa-plus text-[10px]"></i>
          </button>
        </div>

        <!-- Confirm Deposit -->
        <button @click="toggleDepositState" :class="[
          'px-2.5 py-1.5 rounded-xl font-black text-[10px] uppercase flex items-center gap-1 shadow-sm transition-all active:scale-95 border cursor-pointer',
          formStore.deposit.isPaid 
            ? 'bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/60' 
            : 'bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60'
        ]">
          <i class="fa-solid" :class="formStore.deposit.isPaid ? 'fa-xmark' : 'fa-check'"></i>
          <span>{{ formStore.deposit.isPaid ? 'Hủy cọc' : 'Đã cọc' }}</span>
        </button>

        <!-- Copy Link -->
        <button @click="shareCurrentBill" class="bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-2.5 py-1.5 rounded-xl font-black text-[10px] uppercase flex items-center gap-1 border border-slate-200 dark:border-slate-700 transition-all active:scale-95 shadow-sm cursor-pointer" title="Copy link bill">
          <i class="fa-solid fa-link text-blue-600 dark:text-blue-400"></i> <span>Link</span>
        </button>

        <!-- DOWNLOAD PNG WITH QUALITY SELECTOR -->
        <div class="relative flex items-center">
          <button 
            @click="triggerSave('image')" 
            class="bg-indigo-600 hover:bg-indigo-700 text-white pl-3 pr-2 py-1.5 rounded-l-xl font-black text-[10px] uppercase flex items-center gap-1 shadow-md transition-all active:scale-95 cursor-pointer"
            title="Tải ảnh phiếu đặt bàn"
          >
            <i class="fa-solid fa-image"></i>
            <span>Tải Ảnh ({{ qualities.find(q => q.id === configStore.billPreferences.quality)?.scale || '2x' }})</span>
          </button>
          <button 
            @click="showQualityMenu = !showQualityMenu" 
            class="bg-indigo-700 hover:bg-indigo-800 text-white px-2 py-1.5 rounded-r-xl border-l border-indigo-500 font-bold text-[10px] transition-all cursor-pointer"
            title="Tùy chọn độ phân giải ảnh"
          >
            <i class="fa-solid fa-chevron-down text-[9px]"></i>
          </button>

          <!-- Backdrop for closing dropdown on click outside -->
          <div v-if="showQualityMenu" class="fixed inset-0 z-40" @click="showQualityMenu = false"></div>

          <!-- Quality Dropdown Popover -->
          <div 
            v-if="showQualityMenu" 
            class="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-50 p-2 text-left space-y-1 animate-in fade-in slide-in-from-top-2 duration-150"
          >
            <div class="px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800">
              Độ phân giải & Chất lượng ảnh:
            </div>
            <button 
              v-for="q in qualities" 
              :key="q.id"
              @click="selectQuality(q.id)"
              :class="[
                'w-full p-2 rounded-xl text-left flex items-start gap-2.5 transition-all cursor-pointer',
                configStore.billPreferences.quality === q.id 
                  ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-900 dark:text-indigo-300 font-bold' 
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
              ]"
            >
              <div class="w-6 h-6 rounded-lg bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 mt-0.5">
                <i class="fa-solid text-xs" :class="q.icon"></i>
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between text-xs">
                  <span class="font-extrabold">{{ q.name }}</span>
                  <span class="text-[10px] font-mono opacity-70">{{ q.tag }}</span>
                </div>
                <div class="text-[10px] text-slate-400 mt-0.5 leading-snug">{{ q.desc }}</div>
              </div>
              <i v-if="configStore.billPreferences.quality === q.id" class="fa-solid fa-check text-indigo-600 text-xs self-center"></i>
            </button>
          </div>
        </div>

        <!-- Download PDF -->
        <button @click="triggerSave('pdf')" class="bg-rose-600 hover:bg-rose-700 text-white px-2.5 py-1.5 rounded-xl font-black text-[10px] uppercase flex items-center gap-1 shadow-md transition-all active:scale-95 cursor-pointer" title="Tải file PDF">
          <i class="fa-solid fa-file-pdf"></i> <span>PDF</span>
        </button>

        <!-- Fullscreen Button -->
        <button @click="isFullscreen = !isFullscreen; updatePreviewScale()" class="w-8 h-8 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all text-slate-600 dark:text-slate-300 cursor-pointer" :title="isFullscreen ? 'Thoát toàn màn hình' : 'Xem toàn màn hình'">
          <i class="fa-solid" :class="isFullscreen ? 'fa-compress text-blue-600' : 'fa-expand'"></i>
        </button>
      </div>
    </div>

    <!-- MOBILE TOOLBAR (block md:hidden) -->
    <div :class="[
      'flex md:hidden flex-col border-b shrink-0 z-[120] shadow-sm transition-colors duration-250 w-full relative',
      isFullscreen ? 'bg-surface-canvas border-border-default text-white' : 'bg-white dark:bg-surface-2 border-slate-200 dark:border-border-subtle text-slate-700 dark:text-slate-200'
    ]">
      <!-- Row 1: Back, Status, Fit Width, More button -->
      <div class="px-3 py-2 flex items-center justify-between gap-2 border-b border-slate-100/60 dark:border-border-subtle">
        <div class="flex items-center gap-2">
          <button @click="ui.tab = 'create'" class="w-9 h-9 rounded-xl bg-slate-100 dark:bg-surface-3 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-surface-4 transition-colors text-slate-700 dark:text-slate-200 active:scale-95" aria-label="Quay lại tạo đơn">
            <i class="fa-solid fa-arrow-left text-xs"></i>
          </button>
          <span :class="[
            'px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider shadow-xs',
            formStore.deposit.isPaid 
              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25' 
              : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25'
          ]">
            {{ formStore.deposit.isPaid ? '✓ Đã cọc' : 'Chưa cọc' }}
          </span>
        </div>
        
        <div class="relative flex items-center gap-1.5">
          <button @click="setZoomMode('fit-width')" class="px-2.5 py-1.5 rounded-xl text-[10px] font-black text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-surface-3 hover:bg-slate-200 dark:hover:bg-surface-4 transition-all active:scale-95 min-h-[36px] flex items-center gap-1 cursor-pointer" title="Vừa chiều ngang">
            <i class="fa-solid fa-arrows-left-right text-xs"></i> Vừa ngang
          </button>
          <button @click="showMoreMenu = !showMoreMenu" class="w-9 h-9 rounded-xl bg-slate-100 dark:bg-surface-3 hover:bg-slate-200 dark:hover:bg-surface-4 text-slate-700 dark:text-slate-200 flex items-center justify-center transition-all active:scale-95 cursor-pointer" aria-label="Menu thêm">
            <i class="fa-solid fa-ellipsis-vertical text-sm"></i>
          </button>
          
          <!-- Backdrop for closing dropdown on click outside -->
          <div v-if="showMoreMenu" class="fixed inset-0 z-40" @click="showMoreMenu = false"></div>

          <!-- Dropdown Menu -->
          <div v-show="showMoreMenu" class="absolute right-0 top-full mt-2 w-60 bg-white dark:bg-surface-4 border border-slate-200 dark:border-border-default rounded-2xl shadow-2xl z-50 py-2 animate-in fade-in slide-in-from-top-2 duration-150 text-slate-700 dark:text-slate-200">
            <!-- Mobile Quality Selector -->
            <div class="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
              <div class="text-[10px] font-black uppercase text-slate-400 mb-1.5 flex items-center justify-between">
                <span>Chất lượng ảnh xuất:</span>
                <span class="font-mono text-indigo-600 dark:text-indigo-400">{{ qualities.find(q => q.id === configStore.billPreferences.quality)?.scale }}</span>
              </div>
              <div class="grid grid-cols-3 gap-1">
                <button
                  v-for="q in qualities"
                  :key="q.id"
                  @click="selectQuality(q.id); showMoreMenu = false"
                  :class="[
                    'py-1 text-[10px] font-black rounded-lg border text-center transition-all cursor-pointer',
                    configStore.billPreferences.quality === q.id
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs font-extrabold'
                      : 'bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  ]"
                >
                  {{ q.scale }}
                </button>
              </div>
            </div>

            <button @click="copyBookingConfirmation(); showMoreMenu = false" class="w-full px-4 py-3 text-left text-xs font-black uppercase tracking-wider hover:bg-slate-50 dark:hover:bg-slate-800 active:bg-slate-100 flex items-center gap-2.5 min-h-[44px]">
              <i class="fa-solid fa-copy text-slate-400 w-4 text-center text-sm"></i> Copy tin nhắn
            </button>
            <button @click="shareCurrentBill(); showMoreMenu = false" class="w-full px-4 py-3 text-left text-xs font-black uppercase tracking-wider hover:bg-slate-50 dark:hover:bg-slate-800 active:bg-slate-100 flex items-center gap-2.5 min-h-[44px]">
              <i class="fa-solid fa-link text-slate-400 w-4 text-center text-sm"></i> Chia sẻ link
            </button>
            <button v-if="formStore.billUrl" @click="copyBillImageUrl(); showMoreMenu = false" class="w-full px-4 py-3 text-left text-xs font-black uppercase tracking-wider hover:bg-slate-50 dark:hover:bg-slate-800 active:bg-slate-100 flex items-center gap-2.5 text-indigo-700 dark:text-indigo-300 min-h-[44px]">
              <i class="fa-solid fa-image text-indigo-500 w-4 text-center text-sm"></i> Copy Link Ảnh
            </button>
            <button @click="openZaloChat(); showMoreMenu = false" class="w-full px-4 py-3 text-left text-xs font-black uppercase tracking-wider hover:bg-slate-50 dark:hover:bg-slate-800 active:bg-slate-100 flex items-center gap-2.5 min-h-[44px]">
              <i class="fa-solid fa-comment-dots text-slate-400 w-4 text-center text-sm"></i> Nhắn Zalo
            </button>
            <div class="h-[1px] bg-slate-100 dark:bg-slate-800 my-1"></div>
            <button @click="toggleDepositState(); showMoreMenu = false" class="w-full px-4 py-3 text-left text-xs font-black uppercase tracking-wider flex items-center gap-2.5 min-h-[44px]" :class="formStore.deposit.isPaid ? 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30' : 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'">
              <i class="fa-solid w-4 text-center text-sm" :class="formStore.deposit.isPaid ? 'fa-arrow-rotate-left' : 'fa-circle-check'"></i>
              {{ formStore.deposit.isPaid ? 'Hủy trạng thái cọc' : 'Xác nhận cọc' }}
            </button>
            <div class="h-[1px] bg-slate-100 dark:bg-slate-800 my-1"></div>
            <button @click="isFullscreen = !isFullscreen; updatePreviewScale(); showMoreMenu = false" class="w-full px-4 py-3 text-left text-xs font-black uppercase tracking-wider hover:bg-slate-50 dark:hover:bg-slate-800 active:bg-slate-100 flex items-center gap-2.5 min-h-[44px]">
              <i class="fa-solid text-slate-400 w-4 text-center text-sm" :class="isFullscreen ? 'fa-compress text-blue-600' : 'fa-expand'"></i> 
              {{ isFullscreen ? 'Thoát Tràn Viền' : 'Xem Tràn Viền' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Row 2: Template Presets Segmented Bar (Mobile) -->
      <div class="px-3 py-1.5 flex items-center justify-between gap-1.5 border-b border-slate-100/60 dark:border-slate-800/60 bg-slate-50/70 dark:bg-slate-900/60">
        <div class="flex items-center gap-1 bg-slate-200/60 dark:bg-slate-800 p-0.5 rounded-xl flex-1">
          <button 
            v-for="tpl in templates" 
            :key="tpl.id"
            @click="selectTemplate(tpl.id)"
            :class="[
              'flex-1 py-1 text-[10px] font-black rounded-lg transition-all text-center truncate cursor-pointer',
              configStore.billPreferences.template === tpl.id 
                ? 'bg-white dark:bg-slate-900 text-blue-900 dark:text-blue-400 shadow-2xs font-extrabold' 
                : 'text-slate-500 dark:text-slate-400'
            ]"
          >
            {{ tpl.name }}
          </button>
        </div>

        <button 
          @click="toggleHidePrice"
          :class="[
            'px-2 py-1 rounded-xl text-[10px] font-black transition-all flex items-center gap-1 border cursor-pointer shrink-0',
            configStore.billPreferences.hidePrice 
              ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border-amber-300' 
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
          ]"
        >
          <i class="fa-solid" :class="configStore.billPreferences.hidePrice ? 'fa-eye-slash text-amber-600' : 'fa-eye text-slate-400'"></i>
          <span>{{ configStore.billPreferences.hidePrice ? 'Ẩn giá' : 'Hiện giá' }}</span>
        </button>
      </div>

      <!-- Row 3: Clean Export Actions (PNG, PDF, Share) with Quality Tag -->
      <div class="px-3 py-2 flex items-center justify-between gap-2 border-b border-slate-100/50 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-900/60">
        <!-- PNG -->
        <button @click="triggerSave('image')" class="flex-1 min-h-[44px] bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer">
          <i class="fa-solid fa-image text-xs"></i> <span>Tải PNG ({{ qualities.find(q => q.id === configStore.billPreferences.quality)?.scale || '2x' }})</span>
        </button>

        <!-- PDF -->
        <button @click="triggerSave('pdf')" class="flex-1 min-h-[44px] bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer">
          <i class="fa-solid fa-file-pdf text-xs"></i> <span>Tải PDF</span>
        </button>

        <!-- Share Link -->
        <button @click="shareCurrentBill" class="min-h-[44px] px-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer">
          <i class="fa-solid fa-share-nodes text-xs text-blue-600 dark:text-blue-400"></i> <span>Gửi link</span>
        </button>
      </div>

      <!-- Row 4: Compact Zoom Controls -->
      <div class="px-3 py-1.5 flex items-center justify-center gap-4 bg-slate-50/70 dark:bg-slate-900/80 border-t border-slate-100/40 dark:border-slate-800/40">
        <button @click="adjustZoom(-0.1)" class="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-650 dark:text-slate-300 transition-colors active:scale-90" aria-label="Thu nhỏ">
          <i class="fa-solid fa-minus text-xs"></i>
        </button>
        <span class="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest font-tabular">
          {{ Math.round(zoomScale * 100) }}%
        </span>
        <button @click="adjustZoom(0.1)" class="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-650 dark:text-slate-300 transition-colors active:scale-90" aria-label="Phóng to">
          <i class="fa-solid fa-plus text-xs"></i>
        </button>
      </div>
    </div>


    <!-- Scrollable container for Bill -->
    <div :class="[
      'flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar relative',
      isFullscreen ? 'bg-slate-950/20' : 'bg-slate-50 dark:bg-slate-950'
    ]">
      <div :class="[
        'flex gap-0 md:gap-4 justify-center min-h-full',
        isFullscreen ? 'p-4 md:p-8' : 'p-4 md:p-8 pb-32 md:pb-8'
      ]">
        <!-- Scaled wrapper -->
        <div class="w-full max-w-[800px] relative transition-all duration-250 ease-out" :style="wrapperScaleStyles">

          <!-- #bill-render CONTAINER (Dynamically Renders Chosen Template) -->
          <div 
            id="bill-render" 
            :style="mobileScaleStyles" 
            class="bill-preview-container w-[800px] relative mx-auto select-text shadow-xl rounded-none md:rounded-3xl overflow-hidden bg-white border border-slate-200/50" 
            @mousemove="handleMouseMove" 
            @mouseleave="resetParallax" 
            @dblclick="handleDoubleClick"
          >
            <!-- 1. Modern Minimalist / Clean Editorial Template -->
            <BillTemplateModern 
              v-if="configStore.billPreferences.template === 'modern'"
              :formStore="formStore"
              :configStore="configStore"
              :appStore="appStore"
              :qrImageUrl="qrImageUrl"
              :depositTransferContent="depositTransferContent"
              :stampParallax="stampParallax"
              :hidePrice="configStore.billPreferences.hidePrice"
            />

            <!-- 2. Royal Luxury / Fine Dining Template -->
            <BillTemplateLuxury 
              v-else-if="configStore.billPreferences.template === 'luxury'"
              :formStore="formStore"
              :configStore="configStore"
              :appStore="appStore"
              :qrImageUrl="qrImageUrl"
              :depositTransferContent="depositTransferContent"
              :stampParallax="stampParallax"
              :hidePrice="configStore.billPreferences.hidePrice"
            />

            <!-- 3. Smart Ticket / Boarding Pass Template -->
            <BillTemplateTicket 
              v-else
              :formStore="formStore"
              :configStore="configStore"
              :appStore="appStore"
              :qrImageUrl="qrImageUrl"
              :depositTransferContent="depositTransferContent"
              :stampParallax="stampParallax"
              :hidePrice="configStore.billPreferences.hidePrice"
            />
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
