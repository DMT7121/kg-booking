<script setup lang="ts">
import { sound } from '@/utils/audio'
import { useUIStore } from '@/stores/useUIStore'
import { useFormStore } from '@/stores/useFormStore'
import { useAppStore } from '@/stores/useAppStore'
import { useConfigStore } from '@/stores/useConfigStore'
import { useBillRender } from '@/composables/useBillRender'
import { useForm } from '@/composables/useForm'
import { isIOS, formatVND } from '@/utils'
import { CANONICAL_SET_AND_COMBO_ITEMS } from '@/domain/menu/menuMatcher'
import { onMounted, onUnmounted, ref, computed, watch, nextTick, defineAsyncComponent } from 'vue'
import LeftPanel from './LeftPanel.vue'

// Lazy-loaded Modals (only fetched when user opens them → ~40% smaller initial bundle)
const AiConfigModal = defineAsyncComponent(() => import('@/components/modals/AiConfigModal.vue'))
const StaffModal = defineAsyncComponent(() => import('@/components/modals/StaffModal.vue'))
const MenuManagerModal = defineAsyncComponent(() => import('@/components/modals/MenuManagerModal.vue'))
const BankConfigModal = defineAsyncComponent(() => import('@/components/modals/BankConfigModal.vue'))
const BrandingModal = defineAsyncComponent(() => import('@/components/modals/BrandingModal.vue'))
const VerifyTransferModal = defineAsyncComponent(() => import('@/components/modals/VerifyTransferModal.vue'))
const WebhookConfigModal = defineAsyncComponent(() => import('@/components/modals/WebhookConfigModal.vue'))
const BookingDetailModal = defineAsyncComponent(() => import('@/components/modals/BookingDetailModal.vue'))
const FloorPlanModal = defineAsyncComponent(() => import('@/components/modals/FloorPlanModal.vue'))
const CustomerCareModal = defineAsyncComponent(() => import('@/components/modals/CustomerCareModal.vue'))
const GuideConfigModal = defineAsyncComponent(() => import('@/components/modals/GuideConfigModal.vue'))
const ConflictResolutionModal = defineAsyncComponent(() => import('@/components/modals/ConflictResolutionModal.vue'))
const VersionReleaseModal = defineAsyncComponent(() => import('@/components/modals/VersionReleaseModal.vue'))
const SocialBotModal = defineAsyncComponent(() => import('@/components/modals/SocialBotModal.vue'))
const OutboxSyncModal = defineAsyncComponent(() => import('@/components/modals/OutboxSyncModal.vue'))
const BookingConfirmationModal = defineAsyncComponent(() => import('@/components/modals/BookingConfirmationModal.vue'))

const ui = useUIStore()


const formStore = useFormStore()
const appStore = useAppStore()
const configStore = useConfigStore()
const { updatePreviewScale, confirmStaffAndSave, triggerSave } = useBillRender()
const { handleInputFocus, handleInputBlur, copyToClipboard, copyBookingConfirmation } = useForm()

const confirmActionVerb = computed(() => {
  const msg = (ui.modal.confirm.msg || '').toLowerCase()
  const title = (ui.modal.confirm.title || '').toLowerCase()
  if (msg.includes('xóa') || title.includes('xóa')) return 'XÓA PHIẾU'
  if (msg.includes('hủy cọc') || title.includes('hủy cọc')) return 'HỦY CỌC'
  if (msg.includes('hủy') || title.includes('hủy')) return 'XÁC NHẬN HỦY'
  return 'XÁC NHẬN'
})

// --- Inactivity Session Timeout ---
let inactivityTimer: any = null
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes
const activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'visibilitychange']

function resetInactivityTimer() {
  if (inactivityTimer) clearTimeout(inactivityTimer)
  inactivityTimer = setTimeout(() => {
    appStore.handleInactivityTimeout()
  }, INACTIVITY_TIMEOUT_MS)
}

async function handleOpenConfig(type: string) {
  if (type === 'webhook') {
    const hasPerm = await appStore.verifySession('settings:update')
    if (!hasPerm) return
  }
  ui.openConfig(type)
}

// --- Watchers ---
watch(() => ui.tempTable, (val) => {
  formStore.customer.tables = val.number ? `${val.zone}${val.number}` : ''
}, { deep: true })

watch(() => ui.tab, (v) => {
  if (v === 'preview') {
    nextTick(() => {
      updatePreviewScale()
      // Re-calc after layout settles
      setTimeout(() => updatePreviewScale(), 100)
      setTimeout(() => updatePreviewScale(), 300)
    })
  }
})

// --- Mounted ---
function setAppHeight() {
  const height = window.visualViewport?.height || window.innerHeight
  document.documentElement.style.setProperty('--app-height', `${height}px`)
}

function handleGlobalPaste(e: ClipboardEvent) {
  if (ui.tab !== 'create') return
  const activeEl = document.activeElement
  const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.hasAttribute('contenteditable'))
  if (isInput) return
  
  const items = e.clipboardData?.items
  if (!items) return
  for (const item of items) {
    if (item.type.indexOf('image') !== -1) {
      e.preventDefault()
      const f = item.getAsFile()
      if (f) {
        const event = new CustomEvent('global-image-paste', { detail: { file: f } })
        window.dispatchEvent(event)
        ui.showToast('📸 Đã nhận diện ảnh chụp màn hình từ Clipboard toàn trang!', 'info')
      }
      break
    }
  }
}

// Lifecycle Listeners Management
let maxViewportHeight = 0
function handleViewportResize() {
  if (window.visualViewport) {
    if (window.visualViewport.height > maxViewportHeight) {
      maxViewportHeight = window.visualViewport.height
    }
    ui.isKeyboardOpen = window.visualViewport.height < maxViewportHeight * 0.85
  }
}

function handlePreviewResize() {
  if (ui.tab === 'preview') updatePreviewScale()
}

let billResizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (!formStore.id) formStore.id = crypto.randomUUID()
  ui.isVoiceSupported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window

  // Critical first-paint hydration: Menu and AI runtime config (needed immediately for active form)
  appStore.fetchMenu()
  configStore.hydrateAiRuntimeConfig()

  // Non-blocking secondary hydration: History sync, Sheets list, Remote config
  // Staggered to prevent Startup Storm and Google Script concurrency quota bursts
  setTimeout(() => {
    appStore.loadHistory(true)
    appStore.fetchSheets()
    appStore.fetchRemoteConfig()
  }, 150)

  // Keyboard detection via visualViewport
  if (window.visualViewport) {
    maxViewportHeight = window.visualViewport.height
    window.visualViewport.addEventListener('resize', handleViewportResize)
  }

  // Visual Viewport height setup
  window.visualViewport?.addEventListener('resize', setAppHeight)
  window.visualViewport?.addEventListener('scroll', setAppHeight)
  window.addEventListener('resize', setAppHeight)
  setAppHeight()

  // Global paste handler
  window.addEventListener('paste', handleGlobalPaste)

  // Preview scaling
  window.addEventListener('resize', handlePreviewResize)

  setTimeout(() => {
    const observerTarget = document.getElementById('bill-render')
    if (observerTarget && window.ResizeObserver) {
      billResizeObserver = new ResizeObserver(() => {
        if (ui.tab === 'preview') updatePreviewScale()
      })
      billResizeObserver.observe(observerTarget)
    }
  }, 500)

  window.addEventListener('keydown', handleGlobalKeydown)

  // Inactivity listeners
  activityEvents.forEach(evt => {
    window.addEventListener(evt, resetInactivityTimer, { passive: true })
  })
  resetInactivityTimer()

  // Check if session was logged out due to inactivity
  const logoutReason = sessionStorage.getItem('kg_logout_reason')
  if (logoutReason === 'inactivity') {
    sessionStorage.removeItem('kg_logout_reason')
    ui.showToast('Phiên làm việc đã hết hạn do không hoạt động. Vui lòng đăng nhập lại.', 'info', 6000)
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.visualViewport?.removeEventListener('resize', handleViewportResize)
  window.visualViewport?.removeEventListener('resize', setAppHeight)
  window.visualViewport?.removeEventListener('scroll', setAppHeight)
  window.removeEventListener('resize', setAppHeight)
  window.removeEventListener('resize', handlePreviewResize)
  window.removeEventListener('paste', handleGlobalPaste)

  if (billResizeObserver) {
    billResizeObserver.disconnect()
    billResizeObserver = null
  }

  // Remove inactivity listeners
  activityEvents.forEach(evt => {
    window.removeEventListener(evt, resetInactivityTimer)
  })
  if (inactivityTimer) clearTimeout(inactivityTimer)
})

const searchQuery = ref('')
const paletteFilter = ref<'all' | 'orders' | 'menu' | 'commands'>('all')
const paletteSelectedIndex = ref(0)

watch([searchQuery, paletteFilter], () => {
  paletteSelectedIndex.value = 0
})

function getTodayStr() {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function getTomorrowStr() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

const commands = [
  { label: 'Tạo phiếu đặt bàn mới', cmd: '/create', desc: 'Xóa form và chuyển sang tab Tạo Phiếu', icon: 'fa-plus text-emerald-500' },
  { label: 'Xem trước & Xuất ảnh Phiếu', cmd: '/preview', desc: 'Mở màn hình xem phiếu và tải ảnh/PDF gửi khách', icon: 'fa-eye text-cyan-500' },
  { label: 'Mở Sơ đồ bàn nhà hàng (F3)', cmd: '/floor', desc: 'Xem trực quan sơ đồ bàn trống / đã đặt', icon: 'fa-map-location-dot text-orange-500' },
  { label: 'Lịch đặt bàn hôm nay (F4)', cmd: '/today', desc: 'Xem timeline đặt bàn ngày hôm nay', icon: 'fa-calendar-day text-blue-500' },
  { label: 'Lịch đặt bàn ngày mai', cmd: '/tomorrow', desc: 'Xem timeline đặt bàn ngày mai', icon: 'fa-calendar-plus text-indigo-500' },
  { label: 'Xem phiếu chưa cọc', cmd: '/unpaid', desc: 'Lọc lịch sử các phiếu chưa cọc', icon: 'fa-hourglass-half text-amber-500' },
  { label: 'Copy Báo giá & Xin cọc (Zalo/FB)', cmd: '/copy-quote', desc: 'Copy nhanh kịch bản báo giá kèm STK nhận cọc', icon: 'fa-file-invoice-dollar text-amber-600' },
  { label: 'Copy Xác nhận Đã cọc (Zalo/FB)', cmd: '/copy-paid', desc: 'Copy nhanh tin nhắn báo đã nhận cọc giữ bàn', icon: 'fa-circle-check text-emerald-600' },
  { label: 'Đổi giao diện Sáng / Tối', cmd: '/dark', desc: 'Bật/Tắt chế độ ban đêm (Dark Mode)', icon: 'fa-moon text-indigo-400' },
  { label: 'Cài đặt hệ thống', cmd: '/settings', desc: 'Mở cửa sổ cài đặt AI, Ngân hàng, Thực đơn', icon: 'fa-gear text-slate-500' },
  { label: 'Đồng bộ dữ liệu Cloud', cmd: '/sync', desc: 'Tải lại lịch sử đặt bàn từ server', icon: 'fa-rotate text-purple-500' }
]

const filteredCommands = computed(() => {
  if (paletteFilter.value !== 'all' && paletteFilter.value !== 'commands') return []
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return commands
  const cleanQ = q.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  return commands.filter(c => {
    const cleanLabel = c.label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    const cleanDesc = c.desc.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    return c.cmd.includes(q) || cleanLabel.includes(cleanQ) || cleanDesc.includes(cleanQ)
  })
})

const searchResults = computed(() => {
  if (paletteFilter.value !== 'all' && paletteFilter.value !== 'orders') return []
  const q = searchQuery.value.trim().toLowerCase()
  if (!q && paletteFilter.value !== 'orders') return []
  if (q.startsWith('/')) return []
  
  const cleanQ = q.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  const list = !cleanQ ? appStore.historyList : appStore.historyList.filter(o => {
    if (!o.parsedCustomer) return false
    const name = (o.parsedCustomer.name || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    const phone = (o.parsedCustomer.phone || '').replace(/\D/g, '')
    const id = (o.id || '').toLowerCase()
    const table = (o.parsedCustomer.tables || '').toLowerCase()
    return name.includes(cleanQ) || phone.includes(cleanQ) || id.includes(cleanQ) || table.includes(cleanQ)
  })
  return list.slice(0, 6)
})

const menuSearchResults = computed(() => {
  if (paletteFilter.value !== 'all' && paletteFilter.value !== 'menu') return []
  const q = searchQuery.value.trim().toLowerCase()
  if (!q && paletteFilter.value !== 'menu') return []
  if (q.startsWith('/')) return []

  const cleanQ = q.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase()
  const mergedMap = new Map<string, any>()
  for (const item of CANONICAL_SET_AND_COMBO_ITEMS) {
    mergedMap.set(item.name.toLowerCase(), item)
  }
  for (const item of appStore.menuList || []) {
    const key = String(item.name || '').toLowerCase()
    if (key && !mergedMap.has(key)) {
      mergedMap.set(key, item)
    }
  }
  const allItems = Array.from(mergedMap.values())
  if (!cleanQ) return allItems.slice(0, 8)

  return allItems.filter(item => {
    const nameClean = String(item.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase()
    const noteClean = String(item.note || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase()
    return nameClean.includes(cleanQ) || noteClean.includes(cleanQ)
  }).slice(0, 6)
})

function quickAddDishFromPalette(dish: any) {
  if (
    formStore.items.length === 1 &&
    !formStore.items[0].name.trim() &&
    Number(formStore.items[0].price || 0) === 0
  ) {
    formStore.items.splice(0, 1)
  }
  const existing = formStore.items.find(
    (i: any) => i.name.trim().toLowerCase() === String(dish.name || '').trim().toLowerCase() && (i.note || '') === (dish.note || '')
  )
  if (existing) {
    existing.qty = (Number(existing.qty) || 1) + 1
  } else {
    formStore.items.push({
      name: dish.name,
      qty: 1,
      price: Number(dish.price || 0),
      note: dish.note || ''
    })
  }
  if (ui.tab !== 'create' && ui.tab !== 'preview') {
    ui.tab = 'create'
  }
  ui.showCommandPalette = false
  searchQuery.value = ''
  ui.showToast(`➕ Đã thêm "${dish.name}" vào thực đơn phiếu hiện tại`, 'success')
}

function handlePaletteKeydown(e: KeyboardEvent) {
  const total = searchResults.value.length + menuSearchResults.value.length + filteredCommands.value.length
  if (total === 0) return

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    paletteSelectedIndex.value = (paletteSelectedIndex.value + 1) % total
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    paletteSelectedIndex.value = (paletteSelectedIndex.value - 1 + total) % total
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const idx = paletteSelectedIndex.value
    const orderLen = searchResults.value.length
    const menuLen = menuSearchResults.value.length

    if (idx < orderLen) {
      handleResultClick(searchResults.value[idx])
    } else if (idx < orderLen + menuLen) {
      quickAddDishFromPalette(menuSearchResults.value[idx - orderLen])
    } else {
      const cmdItem = filteredCommands.value[idx - orderLen - menuLen]
      if (cmdItem) executeCommand(cmdItem.cmd)
    }
  }
}

function executeCommand(cmd: string) {
  ui.showCommandPalette = false
  searchQuery.value = ''
  
  if (cmd === '/create') {
    formStore.$reset()
    ui.tab = 'create'
    ui.showToast('Đã khởi tạo phiếu mới!', 'success')
  } else if (cmd === '/preview') {
    ui.tab = 'preview'
  } else if (cmd === '/floor') {
    ui.showFloorPlan = true
  } else if (cmd === '/today') {
    ui.selectedTimelineDate = getTodayStr()
    ui.tab = 'timeline'
    appStore.loadHistory(false)
  } else if (cmd === '/tomorrow') {
    ui.selectedTimelineDate = getTomorrowStr()
    ui.tab = 'timeline'
    appStore.loadHistory(false)
  } else if (cmd === '/unpaid') {
    ui.tab = 'history'
    ui.historyFilters.deposit = 'unpaid'
    appStore.loadHistory(false)
  } else if (cmd === '/copy-quote') {
    copyBookingConfirmation('quote_deposit')
  } else if (cmd === '/copy-paid') {
    copyBookingConfirmation('deposit_confirmed')
  } else if (cmd === '/dark') {
    ui.toggleDarkMode()
  } else if (cmd === '/settings') {
    ui.showSettingsHub = true
  } else if (cmd === '/sync') {
    appStore.loadHistory(false)
  }
}

// --- Voice Recognition Setup ---
const isListening = ref(false)
const voiceStatus = ref('')
let recognition: any = null

if (typeof window !== 'undefined') {
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  if (SpeechRecognition) {
    recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.lang = 'vi-VN'
    recognition.interimResults = false

    recognition.onstart = () => {
      isListening.value = true
      voiceStatus.value = 'Đang lắng nghe giọng nói của bạn...'
    }

    recognition.onerror = (e: any) => {
      console.error('[Speech] Error:', e.error)
      isListening.value = false
      voiceStatus.value = ''
      ui.showToast('Không nghe rõ hoặc trình duyệt chặn mic!', 'warning')
    }

    recognition.onend = () => {
      isListening.value = false
    }

    recognition.onresult = (event: any) => {
      const resultText = event.results[0][0].transcript
      voiceStatus.value = `Đã nhận diện: "${resultText}"`
      searchQuery.value = resultText
      
      // Parse Voice Commands
      parseVoiceCommand(resultText)
    }
  }
}

function toggleVoiceSearch() {
  if (!recognition) {
    ui.showToast('Trình duyệt không hỗ trợ nhận diện giọng nói!', 'warning')
    return
  }
  if (isListening.value) {
    recognition.stop()
  } else {
    recognition.start()
  }
}

function stopListening() {
  if (recognition) {
    recognition.stop()
  }
  isListening.value = false
  voiceStatus.value = ''
}

function parseVoiceCommand(text: string) {
  const lowerText = text.toLowerCase().trim()
  
  // 1. Navigation Commands
  if (lowerText.includes('đi tới') || lowerText.includes('chuyển sang') || lowerText.includes('mở tab')) {
    if (lowerText.includes('bảng điều khiển') || lowerText.includes('dashboard')) {
      ui.tab = 'dashboard'
      ui.showToast('Đã chuyển sang Bảng điều khiển', 'success')
      ui.showCommandPalette = false
      return
    }
    if (lowerText.includes('lịch biểu') || lowerText.includes('timeline') || lowerText.includes('lịch trình')) {
      ui.tab = 'timeline'
      ui.showToast('Đã chuyển sang Lịch biểu', 'success')
      ui.showCommandPalette = false
      return
    }
    if (lowerText.includes('danh sách') || lowerText.includes('lịch sử') || lowerText.includes('history')) {
      ui.tab = 'history'
      ui.showToast('Đã chuyển sang Danh sách lịch sử', 'success')
      ui.showCommandPalette = false
      return
    }
    if (lowerText.includes('tạo phiếu') || lowerText.includes('tạo đơn') || lowerText.includes('lịch mới')) {
      ui.tab = 'create'
      formStore.$reset()
      ui.showToast('Đã mở form Tạo lịch mới', 'success')
      ui.showCommandPalette = false
      return
    }
    if (lowerText.includes('cài đặt') || lowerText.includes('settings')) {
      ui.showSettingsHub = true
      ui.showToast('Đã mở menu Cài đặt', 'success')
      ui.showCommandPalette = false
      return
    }
  }

  // 2. Prefill Booking Form Commands
  // Pattern: "xếp bàn VIP1 cho khách Nguyễn Văn A lúc 7 giờ tối"
  if (lowerText.includes('xếp bàn') || lowerText.includes('đặt bàn') || lowerText.includes('chọn bàn')) {
    // Find table name (e.g. VIP1, A12, B3)
    const tableMatch = text.match(/\b([a-zA-Z]+\d+)\b/)
    if (tableMatch) {
      const tableVal = tableMatch[1].toUpperCase()
      formStore.customer.tables = tableVal
      const zone = tableVal.match(/^([A-Z]+)/i)?.[1]?.toUpperCase() || ''
      const number = tableVal.replace(zone, '')
      ui.tempTable.zone = zone
      ui.tempTable.number = number
    }
    
    // Find time name (e.g. 19:30 or 19h30)
    const timeMatch = text.match(/\b(\d{1,2})[:h](\d{2})\b/)
    if (timeMatch) {
      const hh = timeMatch[1].padStart(2, '0')
      const mm = timeMatch[2].padStart(2, '0')
      formStore.customer.time = `${hh}:${mm}`
    } else {
      // e.g. "7 giờ tối" -> 19:00, "8 giờ sáng" -> 08:00
      const hourMatch = text.match(/\b(\d{1,2})\s*giờ\b/)
      if (hourMatch) {
        let hr = parseInt(hourMatch[1])
        if (lowerText.includes('tối') || lowerText.includes('chiều')) {
          if (hr < 12) hr += 12
        }
        formStore.customer.time = `${String(hr).padStart(2, '0')}:00`
      }
    }

    // Find pax number
    const paxMatch = text.match(/\b(\d+)\s*người\b/) || text.match(/\b(\d+)\s*khách\b/)
    if (paxMatch) {
      formStore.customer.pax = paxMatch[1]
    }

    // Navigate to create tab
    ui.tab = 'create'
    ui.showCommandPalette = false
    ui.showToast('🎙️ Đã điền sẵn thông tin từ giọng nói!', 'success', 4000)
  }
}

function handleResultClick(order: any) {
  ui.showCommandPalette = false
  searchQuery.value = ''
  
  const form = useForm()
  form.editHistoricOrder(order)
  ui.showToast(`Đang chỉnh sửa đơn của ${order.parsedCustomer.name}`, 'info')
}

const promptInputRef = ref<HTMLInputElement | null>(null)
const showPromptPassword = ref(false)

const isPasswordPrompt = computed(() => {
  const text = `${ui.modal.prompt.title || ''} ${ui.modal.prompt.msg || ''}`.toLowerCase()
  return text.includes('mật khẩu') || text.includes('password') || text.includes('pin') || text.includes('passphrase')
})

async function pasteIntoPrompt() {
  try {
    const text = await navigator.clipboard.readText()
    if (text) {
      ui.modal.prompt.value = text.trim()
      promptInputRef.value?.focus()
    }
  } catch {
    ui.showToast('Vui lòng nhấn Ctrl+V để dán nội dung', 'info')
  }
}

const alertSeverity = computed<'danger' | 'warning' | 'success' | 'info'>(() => {
  const t = (ui.modal.alert.title || '').toLowerCase()
  const m = (ui.modal.alert.msg || '').toLowerCase()
  if (t.includes('lỗi') || t.includes('thất bại') || t.includes('error') || t.includes('xóa')) {
    return 'danger'
  }
  if (t.includes('thiếu') || t.includes('cảnh báo') || t.includes('chú ý') || t.includes('warning') || t.includes('chưa') || t.includes('hủy')) {
    return 'warning'
  }
  if (t.includes('thành công') || t.includes('đã') || t.includes('hoàn tất') || t.includes('success')) {
    return 'success'
  }
  return 'info'
})

watch(() => [ui.modal.prompt.show, ui.modal.prompt.title, ui.modal.prompt.msg], ([show]) => {
  if (show) {
    showPromptPassword.value = false
    nextTick(() => {
      promptInputRef.value?.focus()
      promptInputRef.value?.select()
    })
    setTimeout(() => {
      if (ui.modal.prompt.show) {
        promptInputRef.value?.focus()
      }
    }, 60)
  }
})

function handleGlobalKeydown(e: KeyboardEvent) {
  // Modal keyboard shortcuts (Escape to dismiss/cancel, Enter to confirm/acknowledge)
  if (ui.modal.alert.show) {
    if (e.key === 'Escape' || e.key === 'Enter') {
      e.preventDefault()
      ui.resolveModal('alert')
      return
    }
  } else if (ui.modal.confirm.show) {
    if (e.key === 'Escape') {
      e.preventDefault()
      ui.resolveModal('confirm', false)
      return
    } else if (e.key === 'Enter') {
      e.preventDefault()
      ui.resolveModal('confirm', true)
      return
    }
  } else if (ui.modal.prompt.show) {
    if (e.key === 'Escape') {
      e.preventDefault()
      ui.resolveModal('prompt', null)
      return
    }
  }

  // Handle Escape key for all open modals, drawers, and command palette
  if (e.key === 'Escape') {
    if (ui.showCommandPalette) {
      e.preventDefault()
      ui.showCommandPalette = false
      return
    }
    if (ui.activeSettingModal) {
      e.preventDefault()
      ui.closeConfig()
      return
    }
    if (ui.showSettingsHub) {
      e.preventDefault()
      ui.showSettingsHub = false
      return
    }
    if (ui.showFloorPlan) {
      e.preventDefault()
      ui.showFloorPlan = false
      return
    }
    if (ui.showMenuManager) {
      e.preventDefault()
      ui.showMenuManager = false
      return
    }
    if (ui.showBookingDetailModal) {
      e.preventDefault()
      ui.showBookingDetailModal = false
      return
    }
    if (ui.showCustomerCareModal) {
      e.preventDefault()
      ui.showCustomerCareModal = false
      return
    }
    if (ui.showVersionModal) {
      e.preventDefault()
      ui.showVersionModal = false
      return
    }
    if (ui.showSocialBotModal) {
      e.preventDefault()
      ui.showSocialBotModal = false
      return
    }
    if (ui.showOutboxModal) {
      e.preventDefault()
      ui.showOutboxModal = false
      return
    }
    if (ui.showBookingConfirmationModal) {
      e.preventDefault()
      ui.resolveBookingConfirmation(false)
      return
    }
    if (ui.showStaffSelector) {
      e.preventDefault()
      ui.showStaffSelector = false
      return
    }
  }

  // Desktop quick tab switcher (Alt + 1..5) - Đồng bộ thứ tự: Tạo - Phiếu - Tổng quan - Lịch - Lịch sử
  if (e.altKey && !e.ctrlKey && !e.metaKey) {
    if (e.key === '1') { e.preventDefault(); ui.tab = 'create' }
    else if (e.key === '2') { e.preventDefault(); ui.tab = 'preview' }
    else if (e.key === '3') { e.preventDefault(); ui.tab = 'dashboard' }
    else if (e.key === '4') { e.preventDefault(); ui.tab = 'timeline' }
    else if (e.key === '5') { e.preventDefault(); ui.tab = 'history' }
  }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    ui.showCommandPalette = !ui.showCommandPalette
    if (ui.showCommandPalette) {
      nextTick(() => {
        const inp = document.getElementById('palette-search')
        if (inp) inp.focus()
      })
    }
    return
  }

  // POS Standard F-Keys (F1-F4)
  if (e.key === 'F1') {
    e.preventDefault()
    ui.tab = 'create'
    ui.showToast('📋 Chuyển sang Tạo Phiếu (F1)', 'info', 2000)
    return
  }

  if (e.key === 'F2') {
    e.preventDefault()
    ui.showCommandPalette = true
    return
  }

  if (e.key === 'F3') {
    e.preventDefault()
    ui.showFloorPlan = true
    return
  }

  if (e.key === 'F4') {
    e.preventDefault()
    ui.tab = 'timeline'
    appStore.loadHistory(false)
    ui.showToast('📅 Chuyển sang Lịch Bàn (F4)', 'info', 2000)
    return
  }
}
watch(() => ui.tab, () => {
  sound.playPop()
})

watch(() => ui.activeSettingModal, (val) => {
  if (val) sound.playPop()
})

const ambientTheme = computed(() => {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 9) return 'ambient-dawn'
  if (hour >= 9 && hour < 17) return 'ambient-day'
  if (hour >= 17 && hour < 20) return 'ambient-dusk'
  return 'ambient-night'
})
</script>

<template>
  <div class="w-full h-full min-h-screen h-[100dvh] overflow-hidden bg-[var(--bg-app)] text-[var(--text-primary)] flex flex-col relative z-0 transition-colors duration-200">
    <div id="app-root" class="w-full h-full flex-1 flex flex-col relative z-10 overflow-hidden" v-cloak>

    <!-- GLOBAL PROGRESS BAR -->
    <div class="fixed top-0 left-0 h-[3px] bg-blue-600 z-[999999] transition-all duration-300 ease-out shadow-[0_0_10px_rgba(37,99,235,0.4)]" 
         :class="{'opacity-100 w-[85%]': ui.isFetchingAPI, 'opacity-0 w-full': !ui.isFetchingAPI}">
    </div>

    <!-- LOADING OVERLAY -->
    <div v-if="ui.loading.is" class="fixed inset-0 bg-white/90 dark:bg-slate-950/90 z-[9999] flex flex-col justify-center items-center backdrop-blur-sm text-center p-6">
      <div class="w-12 h-12 border-3 border-slate-200 dark:border-slate-800 border-t-blue-600 rounded-full animate-spin mb-4"></div>
      <div class="text-slate-800 dark:text-slate-100 font-extrabold text-lg tracking-tight whitespace-pre-line">{{ ui.loading.msg }}</div>
      <div v-if="ui.loading.subMsg" class="mt-1 text-xs text-blue-600 dark:text-blue-400 font-bold uppercase tracking-widest">{{ ui.loading.subMsg }}</div>
    </div>

    <!-- PROMISE-BASED MODALS -->
    <!-- Alert -->
    <transition name="modal">
    <div v-if="ui.modal.alert.show" class="fixed inset-0 bg-slate-950/60 z-[99999] flex justify-center items-center p-4 backdrop-blur-sm" @click.self="ui.resolveModal('alert')">
      <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-5 md:p-6 max-w-[420px] w-[95%] md:w-full flex flex-col relative overflow-hidden border border-slate-200/90 dark:border-slate-800/90 animate-scale-up">
        <div class="flex items-start gap-3.5 mb-3">
          <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-lg shadow-sm"
               :class="alertSeverity === 'danger' ? 'bg-rose-50 text-rose-600 border border-rose-100 dark:bg-rose-950/50 dark:text-rose-400 dark:border-rose-900/40' :
                       alertSeverity === 'warning' ? 'bg-amber-50 text-amber-600 border border-amber-100 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-900/40' :
                       alertSeverity === 'success' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-900/40' :
                       'bg-blue-50 text-blue-600 border border-blue-100 dark:bg-blue-950/50 dark:text-blue-400 dark:border-blue-900/40'">
            <i :class="alertSeverity === 'danger' ? 'fa-solid fa-circle-exclamation' :
                       alertSeverity === 'warning' ? 'fa-solid fa-triangle-exclamation' :
                       alertSeverity === 'success' ? 'fa-solid fa-circle-check' :
                       'fa-solid fa-circle-info'"></i>
          </div>
          <div class="flex-1 min-w-0 pt-0.5">
            <h3 class="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">{{ ui.modal.alert.title }}</h3>
            <p class="mt-1.5 text-xs text-slate-600 dark:text-slate-300 font-medium leading-relaxed whitespace-pre-line text-left">{{ ui.modal.alert.msg }}</p>
          </div>
          <button @click="ui.resolveModal('alert')" aria-label="Đóng" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0">
            <i class="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>
        <div class="flex justify-end pt-3 border-t border-slate-100 dark:border-slate-800/80">
          <button @click="ui.resolveModal('alert')" class="py-2.5 px-5 bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 active:scale-95 text-white rounded-xl font-bold uppercase tracking-wider text-xs shadow-sm transition-all flex items-center gap-1.5">
            <span>Đã hiểu</span>
            <span class="text-[10px] opacity-60 font-mono hidden sm:inline">↵</span>
          </button>
        </div>
      </div>
    </div>
    </transition>

    <!-- Confirm -->
    <transition name="modal">
    <div v-if="ui.modal.confirm.show" 
         class="fixed inset-0 bg-slate-950/60 z-[99999] flex justify-center items-center p-4 backdrop-blur-sm" 
         role="dialog"
         aria-modal="true"
         aria-labelledby="confirm-dialog-title"
         @click.self="ui.resolveModal('confirm', false)">
      <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-5 md:p-6 max-w-[420px] w-[95%] md:w-full flex flex-col relative overflow-hidden border border-slate-200/90 dark:border-slate-800/90 animate-scale-up">
        <div class="flex items-start gap-3.5 mb-3">
          <div class="w-10 h-10 bg-rose-50 dark:bg-rose-950/50 rounded-xl flex items-center justify-center text-rose-600 dark:text-rose-400 text-lg shadow-sm border border-rose-100 dark:border-rose-900/50 shrink-0">
            <i class="fa-solid fa-triangle-exclamation"></i>
          </div>
          <div class="flex-1 min-w-0 pt-0.5">
            <h3 id="confirm-dialog-title" class="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">{{ ui.modal.confirm.title }}</h3>
            <p class="mt-1.5 text-xs text-slate-600 dark:text-slate-300 font-medium leading-relaxed whitespace-pre-line text-left">{{ ui.modal.confirm.msg }}</p>
          </div>
          <button @click="ui.resolveModal('confirm', false)" aria-label="Đóng" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0">
            <i class="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>
        <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800/80">
          <button @click="ui.resolveModal('confirm', false)" class="py-2.5 px-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold uppercase tracking-wider text-xs active:scale-95 transition-all border border-slate-200 dark:border-slate-700 flex items-center gap-1.5">
            <span>Quay lại</span>
            <span class="text-[10px] opacity-60 font-mono hidden sm:inline">Esc</span>
          </button>
          <button @click="ui.resolveModal('confirm', true)" class="py-2.5 px-4 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-xl font-bold uppercase tracking-wider text-xs shadow-md transition-all flex items-center justify-center gap-1.5">
            <span>{{ confirmActionVerb }}</span>
            <span class="text-[10px] opacity-60 font-mono hidden sm:inline">↵</span>
          </button>
        </div>
      </div>
    </div>
    </transition>

    <!-- Draft Protection Conflict Modal (Xử lý phiếu đang tạo mới khi sửa phiếu lịch sử) -->
    <transition name="modal">
    <div v-if="ui.draftConflictModal.show" 
         class="fixed inset-0 bg-slate-950/70 z-[99999] flex justify-center items-center p-4 backdrop-blur-sm" 
         role="dialog"
         aria-modal="true"
         @click.self="ui.resolveDraftConflict('cancel')">
      <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-5 md:p-6 max-w-[440px] w-[95%] md:w-full flex flex-col relative overflow-hidden border border-slate-200/90 dark:border-slate-800/90 animate-scale-up">
        <div class="flex items-start gap-3.5 mb-3.5">
          <div class="w-11 h-11 bg-amber-500/15 text-amber-600 dark:text-amber-400 rounded-2xl flex items-center justify-center text-xl shadow-xs border border-amber-500/30 shrink-0">
            <i class="fa-solid fa-bookmark"></i>
          </div>
          <div class="flex-1 min-w-0 pt-0.5">
            <h3 class="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">Xử lý phiếu đang tạo mới</h3>
            <p class="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">Phát hiện dữ liệu đang nhập dở ở màn hình Tạo</p>
          </div>
          <button @click="ui.resolveDraftConflict('cancel')" aria-label="Đóng" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer">
            <i class="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>

        <!-- Card chi tiết phiếu đang tạo dở -->
        <div class="p-3 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/50 rounded-2xl mb-4 text-xs">
          <div class="font-black text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-300 flex items-center gap-1.5 mb-1">
            <i class="fa-solid fa-file-pen"></i> Đang tạo dở:
          </div>
          <div class="font-bold text-slate-800 dark:text-slate-100 leading-snug break-words">
            {{ ui.draftConflictModal.draftSummary }}
          </div>
          <div class="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 pt-1.5 border-t border-amber-200/50 dark:border-amber-800/30">
            Chuẩn bị chuyển sang sửa: <span class="font-bold text-slate-700 dark:text-slate-200">{{ ui.draftConflictModal.historicName }}</span>
          </div>
        </div>

        <!-- Action buttons -->
        <div class="flex flex-col gap-2">
          <button 
            @click="ui.resolveDraftConflict('save')" 
            class="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <i class="fa-solid fa-bookmark text-sm"></i>
            <span>Lưu tạm đơn mới & Chỉnh sửa</span>
          </button>

          <button 
            @click="ui.resolveDraftConflict('discard')" 
            class="w-full py-2.5 px-4 bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 rounded-xl font-bold text-xs uppercase tracking-wider active:scale-98 transition-all border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-2 cursor-pointer"
          >
            <i class="fa-solid fa-trash-can text-xs"></i>
            <span>Hủy phiếu mới & Sửa phiếu này</span>
          </button>

          <button 
            @click="ui.resolveDraftConflict('cancel')" 
            class="w-full py-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-semibold cursor-pointer"
          >
            Quay lại (Không sửa)
          </button>
        </div>
      </div>
    </div>
    </transition>

    <!-- Prompt -->
    <transition name="modal">
    <div v-if="ui.modal.prompt.show" class="fixed inset-0 bg-slate-950/60 z-[100000] flex justify-center items-center p-4 backdrop-blur-sm" @click.self="ui.resolveModal('prompt', null)">
      <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-5 md:p-6 max-w-[420px] w-[95%] md:w-full flex flex-col relative overflow-hidden border border-slate-200/90 dark:border-slate-800/90 animate-scale-up">
        <div class="flex items-start gap-3.5 mb-3">
          <div class="w-10 h-10 bg-purple-50 dark:bg-purple-950/50 rounded-xl flex items-center justify-center text-purple-600 dark:text-purple-400 text-lg shadow-sm border border-purple-100 dark:border-purple-900/50 shrink-0">
            <i :class="isPasswordPrompt ? 'fa-solid fa-key' : 'fa-solid fa-keyboard'"></i>
          </div>
          <div class="flex-1 min-w-0 pt-0.5">
            <h3 class="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">{{ ui.modal.prompt.title }}</h3>
            <p class="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400 leading-relaxed">{{ ui.modal.prompt.msg }}</p>
          </div>
          <button @click="ui.resolveModal('prompt', null)" aria-label="Đóng" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0">
            <i class="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>
        <div class="mb-4 relative flex items-center">
          <input 
            v-model="ui.modal.prompt.value" 
            ref="promptInputRef"
            :type="isPasswordPrompt && !showPromptPassword ? 'password' : 'text'"
            @keydown.enter="ui.resolveModal('prompt', ui.modal.prompt.value)"
            class="w-full pl-3.5 pr-20 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 shadow-sm transition-all" 
            :placeholder="isPasswordPrompt ? 'Nhập mật khẩu...' : 'Nhập nội dung...'"
            autocomplete="off"
          >
          <div class="absolute right-2 flex items-center gap-1">
            <button
              v-if="isPasswordPrompt"
              type="button"
              @click="showPromptPassword = !showPromptPassword"
              class="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
              :title="showPromptPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'"
            >
              <i :class="['fa-regular text-xs', showPromptPassword ? 'fa-eye-slash' : 'fa-eye']"></i>
            </button>
            <button
              type="button"
              @click="pasteIntoPrompt"
              class="px-2 py-1 rounded-lg text-[10px] font-black text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/60 hover:bg-purple-100 dark:hover:bg-purple-900/60 border border-purple-200/70 dark:border-purple-800/60 transition-colors"
              title="Dán từ bộ nhớ tạm"
            >
              Dán
            </button>
          </div>
        </div>
        <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800/80">
          <button @click="ui.resolveModal('prompt', null)" class="py-2.5 px-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold uppercase tracking-wider text-xs active:scale-95 transition-all border border-slate-200 dark:border-slate-700 flex items-center gap-1.5">
            <span>Hủy bỏ</span>
            <span class="text-[10px] opacity-60 font-mono hidden sm:inline">Esc</span>
          </button>
          <button @click="ui.resolveModal('prompt', ui.modal.prompt.value)" class="py-2.5 px-4 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white rounded-xl font-bold uppercase tracking-wider text-xs shadow-md transition-all flex items-center gap-1.5">
            <span>Xác nhận</span>
            <span class="text-[10px] opacity-60 font-mono hidden sm:inline">↵</span>
          </button>
        </div>
      </div>
    </div>
    </transition>

    <!-- ERROR MODAL -->
    <div v-if="ui.error.show" class="fixed inset-0 bg-slate-950/60 z-[100000] flex justify-center items-center p-4 backdrop-blur-sm" @click.self="ui.error.show = false">
      <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 max-w-sm w-[95%] md:w-full border-l-4 border-rose-500 border-slate-200 dark:border-slate-800">
        <h3 class="text-xl font-black text-red-600 mb-4 flex items-center gap-2"><i class="fa-solid fa-bolt-lightning"></i> AI Error</h3>
        <div class="bg-red-50 dark:bg-rose-950/40 p-4 rounded-xl text-xs font-mono mb-4 max-h-40 overflow-y-auto border border-red-100 dark:border-rose-900/50 text-slate-800 dark:text-slate-200">{{ ui.error.msg }}</div>
        <div class="flex gap-3">
          <button @click="copyToClipboard(ui.error.msg)" class="flex-1 py-3 bg-gray-100 dark:bg-slate-800 rounded-xl font-bold text-gray-600 dark:text-slate-300 min-h-[44px]">Copy log</button>
          <button @click="ui.error.show = false" class="px-6 py-3 bg-red-600 text-white rounded-xl font-bold shadow-lg shadow-red-200 dark:shadow-none min-h-[44px]">Đóng</button>
        </div>
      </div>
    </div>

    <!-- SETTINGS HUB MODAL -->
    <div v-if="ui.showSettingsHub" class="absolute inset-0 bg-slate-50 dark:bg-slate-950 z-[12000] flex flex-col md:flex-row overflow-hidden text-slate-800 dark:text-slate-100">
      <!-- Left Sidebar (Menu) -->
      <div class="w-full md:w-80 bg-slate-50 dark:bg-slate-900 flex flex-col h-full shrink-0 shadow-[4px_0_24px_rgba(0,0,0,0.02)] z-20 overflow-y-auto custom-scrollbar md:border-r md:border-slate-200 dark:md:border-slate-800" :class="{'hidden md:flex': ui.activeSettingModal, 'flex': !ui.activeSettingModal}">
        <!-- Top Header -->
        <div class="bg-white dark:bg-slate-900 px-4 py-3.5 flex items-center justify-between sticky top-0 z-10 shadow-sm border-b border-slate-200 dark:border-slate-800">
          <button @click="ui.showSettingsHub = false; ui.closeConfig()" class="w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-800 dark:text-slate-200 text-lg active:scale-95 transition-all cursor-pointer" title="Quay lại" aria-label="Quay lại giao diện chính">
            <i class="fa-solid fa-arrow-left"></i>
          </button>
          <div class="text-center flex-1">
            <h2 class="text-base font-black text-slate-900 dark:text-slate-100">Cài đặt</h2>
            <p class="text-[10px] font-bold text-slate-400 mt-0.5">Quản lý hệ thống</p>
          </div>
          <div class="w-9 h-9"></div>
        </div>

      <div class="p-4 md:p-6 max-w-2xl mx-auto w-full space-y-5 pb-20">
        <!-- Brand Card -->
        <div @click="ui.openConfig('branding')" class="bg-white dark:bg-slate-850 rounded-2xl p-4 flex items-center justify-between shadow-sm border border-slate-200 dark:border-slate-800 active:scale-[0.98] transition-all cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
          <div class="flex items-center gap-3.5">
            <div class="w-12 h-12 bg-slate-50 dark:bg-slate-800 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 p-1 flex items-center justify-center">
              <img :src="configStore.branding.logo || 'https://ui-avatars.com/api/?name=King+Grill&background=1e293b&color=fff'" alt="Logo" class="w-full h-full object-contain rounded-lg">
            </div>
            <div>
              <h3 class="font-extrabold text-slate-900 dark:text-slate-100 text-sm">King's Grill</h3>
              <p class="text-[11px] font-semibold text-slate-400 mt-0.5">Nhà hàng / Quản trị viên</p>
            </div>
          </div>
          <i class="fa-solid fa-chevron-right text-slate-300 dark:text-slate-600 text-xs"></i>
        </div>

        <!-- Section 1: Quản lý Thực Đơn & Dịch Vụ -->
        <div class="space-y-2.5">
          <h4 class="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider pl-1">Thực đơn & Nhân sự</h4>
          <div class="bg-white dark:bg-slate-850 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
            <!-- Menu -->
            <button @click="ui.openConfig('menu')" :class="['w-full px-4 py-3.5 flex items-center gap-3.5 transition-colors border-b border-slate-100 dark:border-slate-800 group text-left', ui.activeSettingModal === 'menu' ? 'bg-blue-50/70 dark:bg-blue-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60']">
              <div class="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center text-lg shrink-0">
                <i class="fa-solid fa-bell-concierge"></i>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-slate-900 dark:text-slate-100 text-xs mb-0.5">Quản lý thực đơn</div>
                <div class="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">Danh mục món ăn, đồ uống, giá niêm yết</div>
              </div>
              <i class="fa-solid fa-chevron-right text-xs" :class="ui.activeSettingModal === 'menu' ? 'text-blue-500' : 'text-slate-300 dark:text-slate-600'"></i>
            </button>
            
            <!-- Staff -->
            <button @click="ui.openConfig('staff')" :class="['w-full px-4 py-3.5 flex items-center gap-3.5 transition-colors border-b border-slate-100 dark:border-slate-800 group text-left', ui.activeSettingModal === 'staff' ? 'bg-blue-50/70 dark:bg-blue-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60']">
              <div class="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-lg shrink-0">
                <i class="fa-regular fa-user"></i>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-slate-900 dark:text-slate-100 text-xs mb-0.5">Nhân viên nhận bàn</div>
                <div class="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">Danh sách nhân viên trực ca nhận bàn</div>
              </div>
              <i class="fa-solid fa-chevron-right text-xs" :class="ui.activeSettingModal === 'staff' ? 'text-blue-500' : 'text-slate-300 dark:text-slate-600'"></i>
            </button>

            <!-- Bank -->
            <button @click="ui.openConfig('bank')" :class="['w-full px-4 py-3.5 flex items-center gap-3.5 transition-colors group text-left', ui.activeSettingModal === 'bank' ? 'bg-blue-50/70 dark:bg-blue-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60']">
              <div class="w-10 h-10 rounded-xl bg-cyan-50 dark:bg-cyan-950/50 text-cyan-600 dark:text-cyan-400 flex items-center justify-center text-lg shrink-0">
                <i class="fa-solid fa-building-columns"></i>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-slate-900 dark:text-slate-100 text-xs mb-0.5">Tài khoản ngân hàng & QR Cọc</div>
                <div class="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">VietQR / SeAPay tự động tạo mã QR trên phiếu</div>
              </div>
              <i class="fa-solid fa-chevron-right text-xs" :class="ui.activeSettingModal === 'bank' ? 'text-blue-500' : 'text-slate-300 dark:text-slate-600'"></i>
            </button>
          </div>
        </div>

        <!-- Section 2: Trí Tuệ Nhân Tạo & Live Chat -->
        <div class="space-y-2.5">
          <h4 class="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider pl-1">Trí tuệ nhân tạo (AI)</h4>
          <div class="bg-white dark:bg-slate-850 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
            <!-- AI Config -->
            <button @click="handleOpenConfig('ai')" :class="['w-full px-4 py-3.5 flex items-center gap-3.5 transition-colors border-b border-slate-100 dark:border-slate-800 group text-left', ui.activeSettingModal === 'ai' ? 'bg-blue-50/70 dark:bg-blue-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60']">
              <div class="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 flex items-center justify-center text-lg shrink-0">
                <i class="fa-solid fa-wand-magic-sparkles"></i>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-slate-900 dark:text-slate-100 text-xs mb-0.5">Cấu hình AI & Prompt</div>
                <div class="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">Mô hình AI, phân tích tin nhắn và quy tắc nghiệp vụ</div>
              </div>
              <i class="fa-solid fa-chevron-right text-xs" :class="ui.activeSettingModal === 'ai' ? 'text-blue-500' : 'text-slate-300 dark:text-slate-600'"></i>
            </button>

            <!-- Social AI Bot -->
            <button @click="ui.showSocialBotModal = true; ui.showSettingsHub = false" class="w-full px-4 py-3.5 flex items-center gap-3.5 transition-colors group hover:bg-slate-50 dark:hover:bg-slate-800/60 text-left">
              <div class="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-lg shrink-0">
                <i class="fa-solid fa-robot"></i>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-slate-900 dark:text-slate-100 text-xs mb-0.5">Quản lý Social AI Bot (Fanpage)</div>
                <div class="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">Lịch sử tin nhắn thật & bật/tắt AI Messenger</div>
              </div>
              <i class="fa-solid fa-chevron-right text-xs text-slate-300 dark:text-slate-600"></i>
            </button>
          </div>
        </div>

        <!-- Section 3: Giao Diện & Hệ Thống -->
        <div class="space-y-2.5">
          <h4 class="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider pl-1">Giao diện & Hệ thống</h4>
          <div class="bg-white dark:bg-slate-850 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
            <button @click="ui.openConfig('branding')" :class="['w-full px-4 py-3.5 flex items-center gap-3.5 transition-colors border-b border-slate-100 dark:border-slate-800 group text-left', ui.activeSettingModal === 'branding' ? 'bg-blue-50/70 dark:bg-blue-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60']">
              <div class="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-950/50 text-orange-600 dark:text-orange-400 flex items-center justify-center text-lg shrink-0">
                <i class="fa-solid fa-pen-nib"></i>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-slate-900 dark:text-slate-100 text-xs mb-0.5">Thương hiệu & Mẫu in K80</div>
                <div class="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">Logo nhà hàng, màu sắc và mẫu phiếu xuất</div>
              </div>
              <i class="fa-solid fa-chevron-right text-xs" :class="ui.activeSettingModal === 'branding' ? 'text-blue-500' : 'text-slate-300 dark:text-slate-600'"></i>
            </button>

            <button @click="ui.toggleDarkMode()" class="w-full px-4 py-3.5 flex items-center gap-3.5 transition-colors border-b border-slate-100 dark:border-slate-800 group hover:bg-slate-50 dark:hover:bg-slate-800/60 text-left">
              <div class="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0" :class="ui.isDarkMode ? 'bg-slate-800 text-yellow-400' : 'bg-slate-100 text-slate-600'">
                <i class="fa-solid" :class="ui.isDarkMode ? 'fa-moon' : 'fa-sun'"></i>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-slate-900 dark:text-slate-100 text-xs mb-0.5">Chế độ ban đêm (Dark Mode)</div>
                <div class="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">Giao diện tối giúp làm việc ban đêm dịu mắt</div>
              </div>
              <div class="w-10 flex justify-end">
                <div class="w-9 h-5 bg-slate-200 dark:bg-slate-700 rounded-full relative transition-colors" :class="{'!bg-blue-600': ui.isDarkMode}">
                  <div class="w-4 h-4 bg-white rounded-full absolute top-0.5 left-0.5 transition-transform shadow-sm" :class="{'translate-x-4': ui.isDarkMode}"></div>
                </div>
              </div>
            </button>

            <button @click="handleOpenConfig('webhook')" :class="['w-full px-4 py-3.5 flex items-center gap-3.5 transition-colors group text-left', ui.activeSettingModal === 'webhook' ? 'bg-blue-50/70 dark:bg-blue-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60']">
              <div class="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center justify-center text-lg shrink-0">
                <i class="fa-solid fa-gear"></i>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-slate-900 dark:text-slate-100 text-xs mb-0.5">Cài đặt hệ thống & Webhook</div>
                <div class="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">Telegram Bot, Cloudflare Worker và đồng bộ DB</div>
              </div>
              <i class="fa-solid fa-chevron-right text-xs" :class="ui.activeSettingModal === 'webhook' ? 'text-blue-500' : 'text-slate-300 dark:text-slate-600'"></i>
            </button>
          </div>
        </div>

        <!-- Section 4: Kỹ Thuật & Kiểm Thử -->
        <div class="space-y-2.5">
          <h4 class="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider pl-1">Kỹ thuật & Hỗ trợ</h4>
          <div class="bg-white dark:bg-slate-850 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
            <!-- Test Dashboard -->
            <button @click="ui.tab = 'test'; ui.showSettingsHub = false" class="w-full px-4 py-3.5 flex items-center gap-3.5 transition-colors border-b border-slate-100 dark:border-slate-800 group hover:bg-slate-50 dark:hover:bg-slate-800/60 text-left">
              <div class="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center text-lg shrink-0">
                <i class="fa-solid fa-flask"></i>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-slate-900 dark:text-slate-100 text-xs mb-0.5">Kiểm thử AI & Parser (Benchmark)</div>
                <div class="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">Bộ kiểm thử tự động đánh giá độ chính xác</div>
              </div>
              <i class="fa-solid fa-arrow-up-right-from-square text-xs text-slate-300 dark:text-slate-600"></i>
            </button>

            <!-- Logs Viewer -->
            <button @click="ui.tab = 'logs'; ui.showSettingsHub = false" class="w-full px-4 py-3.5 flex items-center gap-3.5 transition-colors border-b border-slate-100 dark:border-slate-800 group hover:bg-slate-50 dark:hover:bg-slate-800/60 text-left">
              <div class="w-10 h-10 rounded-xl bg-slate-800 text-slate-200 flex items-center justify-center text-lg shrink-0">
                <i class="fa-solid fa-terminal"></i>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-slate-900 dark:text-slate-100 text-xs mb-0.5">Nhật ký hoạt động (System Logs)</div>
                <div class="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">Tiến trình đồng bộ ngoại tuyến và lỗi mạng</div>
              </div>
              <i class="fa-solid fa-arrow-up-right-from-square text-xs text-slate-300 dark:text-slate-600"></i>
            </button>

            <!-- User Guide -->
            <button @click="ui.openConfig('guide')" :class="['w-full px-4 py-3.5 flex items-center gap-3.5 transition-colors group text-left', ui.activeSettingModal === 'guide' ? 'bg-blue-50/70 dark:bg-blue-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60']">
              <div class="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-lg shrink-0">
                <i class="fa-solid fa-book-open"></i>
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-bold text-slate-900 dark:text-slate-100 text-xs mb-0.5">Hướng dẫn sử dụng</div>
                <div class="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">Cẩm nang vận hành quy trình tạo phiếu</div>
              </div>
              <i class="fa-solid fa-chevron-right text-xs" :class="ui.activeSettingModal === 'guide' ? 'text-blue-500' : 'text-slate-300 dark:text-slate-600'"></i>
            </button>
          </div>
        </div>

        <button @click="appStore.logout()" class="w-full py-3.5 bg-white dark:bg-slate-850 border border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-400 rounded-xl font-bold text-xs shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2 hover:bg-rose-50 dark:hover:bg-rose-950/30 mb-8">
          <i class="fa-solid fa-arrow-right-from-bracket"></i> Đăng xuất
        </button>
      </div>
      </div> <!-- Closes Sidebar -->

      <!-- Right Content Area (Modals) -->
      <div class="flex-1 h-full overflow-hidden relative bg-white dark:bg-slate-900 flex flex-col" :class="{'hidden md:flex': !ui.activeSettingModal, 'flex': ui.activeSettingModal}">
        <div v-if="!ui.activeSettingModal" class="hidden md:flex flex-col items-center justify-center h-full text-slate-400 p-8 text-center bg-slate-50/50 dark:bg-slate-950/50">
          <i class="fa-solid fa-gear text-4xl mb-3 text-slate-300 dark:text-slate-600"></i>
          <h3 class="font-black text-slate-700 dark:text-slate-300 text-xs uppercase tracking-wider">Cấu hình hệ thống</h3>
          <p class="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 max-w-xs leading-relaxed">Chọn một danh mục cài đặt bên trái để bắt đầu cấu hình các tính năng.</p>
        </div>
        <AiConfigModal />
        <BankConfigModal />
        <BrandingModal />
        <MenuManagerModal />
        <StaffModal />
        <WebhookConfigModal />
        <GuideConfigModal />
      </div>
    </div>

    <!-- STAFF SELECTOR MODAL (ON SAVE / SHIFT SWITCH) -->
    <transition name="modal">
    <div v-if="ui.showStaffSelector" class="fixed inset-0 bg-slate-950/60 z-[10002] flex justify-center items-center p-4 backdrop-blur-sm" @click.self="ui.showStaffSelector = false; ui.pendingAction = null">
      <div class="bg-surface-2 dark:bg-surface-3 rounded-2xl shadow-2xl p-6 max-w-md w-[95%] md:w-full flex flex-col relative overflow-hidden border border-border-default">
        <div class="flex justify-center items-center mb-4 flex-col gap-2">
          <div class="w-11 h-11 bg-primary/10 rounded-2xl flex items-center justify-center text-apex-primary text-lg shadow-xs border border-primary/20">
            <i class="fa-solid fa-user-tag"></i>
          </div>
          <h3 class="text-base font-black text-text-primary uppercase tracking-tight text-center">
            {{ ui.pendingAction ? 'CHỌN NGƯỜI TẠO PHIẾU' : 'CHỌN NHÂN VIÊN TRỰC CA' }}
          </h3>
          <p class="text-[11px] font-medium text-text-secondary text-center">
            Chọn tên nhân viên để ký tên lên phiếu & đồng bộ lịch sử
          </p>
        </div>

        <!-- Shift Staff Pinning Option -->
        <label class="mb-3.5 px-3 py-2.5 rounded-xl bg-surface-3 dark:bg-surface-4 border border-border-subtle flex items-center justify-between gap-2.5 cursor-pointer select-none hover:border-primary/40 transition-colors">
          <div class="flex items-center gap-2 min-w-0">
            <i class="fa-solid fa-thumbtack text-xs text-apex-primary shrink-0"></i>
            <div class="min-w-0">
              <div class="text-xs font-bold text-text-primary leading-tight">Ghim làm nhân viên trực ca</div>
              <div class="text-[10px] text-text-tertiary leading-tight mt-0.5">Tự động chọn cho các đơn tiếp theo (không hỏi lại)</div>
            </div>
          </div>
          <input
            type="checkbox"
            v-model="ui.pinShiftStaff"
            @change="ui.setActiveShiftStaff(ui.activeShiftStaff, ui.pinShiftStaff)"
            class="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
          />
        </label>

        <div class="grid grid-cols-2 gap-2.5 max-h-[46vh] overflow-y-auto custom-scrollbar p-0.5">
          <button v-for="(staff, idx) in appStore.staffList.filter((s: any) => s.isActive !== false)" :key="idx"
            @click="confirmStaffAndSave(staff)"
            :class="[
              'p-3 rounded-xl border transition-all active:scale-95 flex flex-col items-center justify-center gap-1 group min-h-[76px] relative cursor-pointer',
              ui.activeShiftStaff?.name === staff.name
                ? 'bg-primary/10 border-primary text-text-primary ring-1 ring-primary/30'
                : 'bg-surface-1 dark:bg-surface-2 border-border-default hover:border-primary hover:bg-primary/5'
            ]">
            <span v-if="ui.activeShiftStaff?.name === staff.name" class="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full bg-apex-primary text-white text-[8px] font-black uppercase tracking-wider">Đang trực</span>
            <i class="fa-solid fa-user-check text-lg transition-colors mb-0.5" :class="ui.activeShiftStaff?.name === staff.name ? 'text-apex-primary' : 'text-text-tertiary group-hover:text-apex-primary'"></i>
            <span class="font-bold text-xs uppercase text-text-primary text-center leading-tight">{{ staff.name }}</span>
            <span class="text-[10px] font-mono font-semibold text-text-secondary">{{ staff.phone }}</span>
          </button>
        </div>

        <div class="mt-4 flex items-center gap-2">
          <button
            v-if="ui.activeShiftStaff"
            @click="ui.setActiveShiftStaff(null, false); ui.showToast('Đã bỏ ghim nhân viên trực ca', 'info')"
            type="button"
            class="px-3.5 py-2.5 bg-surface-3 hover:bg-rose-500/10 text-text-secondary hover:text-apex-danger rounded-xl font-bold text-xs transition-all border border-border-subtle cursor-pointer shrink-0"
            title="Bỏ ghim nhân viên đang trực"
          >
            Bỏ ghim
          </button>
          <button @click="ui.showStaffSelector = false; ui.pendingAction = null" class="flex-1 py-2.5 bg-surface-3 hover:bg-surface-hover text-text-secondary rounded-xl font-bold uppercase tracking-wider text-xs active:scale-98 transition-all border border-border-subtle cursor-pointer">Đóng</button>
        </div>
      </div>
    </div>
    </transition>

    <!-- ALL CONFIG MODALS -->
    <VerifyTransferModal />
    <BookingDetailModal />
    <FloorPlanModal />
    <CustomerCareModal />
    <ConflictResolutionModal />
    <VersionReleaseModal />
    <SocialBotModal />
    <OutboxSyncModal />
    <BookingConfirmationModal />

    <!-- COMMAND PALETTE MODAL -->
    <transition name="fade">
      <div v-if="ui.showCommandPalette" class="fixed inset-0 z-[99999] flex items-start justify-center pt-[8vh] px-4 backdrop-blur-sm bg-slate-950/60" @click.self="ui.showCommandPalette = false">
        <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-xl flex flex-col overflow-hidden max-h-[80vh] transition-all transform duration-200">
          <!-- Search Header -->
          <div class="p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3 bg-slate-50 dark:bg-slate-950">
            <i class="fa-solid fa-magnifying-glass text-indigo-500 text-base"></i>
            <input
              id="palette-search"
              v-model="searchQuery"
              @keydown="handlePaletteKeydown"
              type="search"
              enterkeyhint="search"
              class="flex-1 bg-transparent border-none outline-none font-bold text-slate-800 dark:text-slate-100 text-[16px] md:text-sm placeholder-slate-400 min-h-[44px]"
              placeholder="Gõ tên khách, SĐT, 'Set 3', 'Combo 2', tên món hoặc lệnh '/...'..."
              autocomplete="off"
            >
            <button
              @click="toggleVoiceSearch"
              class="w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer shadow-sm border border-slate-200 dark:border-slate-700"
              :class="isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-white dark:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'"
              title="Điều khiển bằng giọng nói"
            >
              <i class="fa-solid fa-microphone text-xs"></i>
            </button>
            <kbd class="hidden md:inline-flex items-center gap-0.5 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[10px] font-bold text-slate-400 shadow-sm">ESC</kbd>
          </div>

          <!-- Filter Tabs -->
          <div class="px-3 py-1.5 bg-slate-100/80 dark:bg-slate-900/90 border-b border-slate-200/70 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <button
              v-for="tabItem in [
                { id: 'all', label: 'Tất cả', icon: 'fa-layer-group' },
                { id: 'orders', label: 'Đơn đặt bàn', icon: 'fa-receipt' },
                { id: 'menu', label: 'Thêm Set / Món', icon: 'fa-utensils' },
                { id: 'commands', label: 'Lệnh nhanh', icon: 'fa-bolt' }
              ]"
              :key="tabItem.id"
              type="button"
              @click="paletteFilter = tabItem.id as any"
              :class="[
                'px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shrink-0 cursor-pointer',
                paletteFilter === tabItem.id
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800'
              ]"
            >
              <i class="fa-solid text-[9px]" :class="tabItem.icon"></i>
              <span>{{ tabItem.label }}</span>
            </button>
          </div>

          <!-- Voice Status Bar -->
          <div v-if="voiceStatus" class="px-4 py-2 bg-blue-50 dark:bg-blue-950/50 border-b border-blue-100 dark:border-blue-900/50 text-[10px] font-black text-blue-700 dark:text-blue-300 uppercase tracking-widest flex items-center justify-between">
            <span class="animate-pulse">🎙️ {{ voiceStatus }}</span>
            <button @click="stopListening" class="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-200 font-bold uppercase tracking-widest text-[9px] cursor-pointer">Dừng nghe</button>
          </div>

          <!-- Content Area -->
          <div class="flex-grow overflow-y-auto p-2 custom-scrollbar space-y-3 max-h-[52vh]">
            <!-- 1. Booking Search Results -->
            <div v-if="searchResults.length > 0" class="space-y-1">
              <div class="px-3 py-1 text-[10px] font-black uppercase text-slate-400 tracking-wider flex items-center justify-between">
                <span>Đơn đặt bàn khớp kết quả</span>
                <span class="text-[9px] font-mono">{{ searchResults.length }} đơn</span>
              </div>
              <button
                v-for="(order, oIdx) in searchResults"
                :key="order.id"
                @click="handleResultClick(order)"
                :class="[
                  'w-full text-left px-3 py-2.5 rounded-xl transition-colors flex items-center justify-between border cursor-pointer',
                  paletteSelectedIndex === oIdx
                    ? 'bg-indigo-50/90 dark:bg-indigo-950/50 border-indigo-200 dark:border-indigo-800/70'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800/70 border-transparent hover:border-slate-200 dark:hover:border-slate-700'
                ]"
              >
                <div class="min-w-0">
                  <div class="font-bold text-slate-800 dark:text-slate-100 text-xs flex items-center gap-2 flex-wrap">
                    <span>{{ order.parsedCustomer.name }}</span>
                    <span v-if="order.parsedCustomer.tables" class="px-1.5 py-0.5 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded text-[9px] font-black border border-blue-200 dark:border-blue-800">Bàn {{ order.parsedCustomer.tables }}</span>
                    <span v-if="order.parsedCustomer.pax" class="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded text-[9px] font-bold">{{ order.parsedCustomer.pax }} khách</span>
                    <span :class="[
                      'px-1.5 py-0.5 rounded text-[9px] font-black uppercase',
                      (order.isDeposited || order.deposit?.isPaid)
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                        : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                    ]">
                      {{ (order.isDeposited || order.deposit?.isPaid) ? 'Đã cọc' : 'Chưa cọc' }}
                    </span>
                  </div>
                  <div class="text-[10px] text-slate-400 font-medium mt-0.5 flex items-center gap-3">
                    <span><i class="fa-solid fa-phone text-[8px]"></i> {{ order.parsedCustomer.phone }}</span>
                    <span><i class="fa-solid fa-calendar text-[8px]"></i> {{ order.parsedCustomer.date }} ({{ order.parsedCustomer.time }})</span>
                  </div>
                </div>
                <i class="fa-solid fa-chevron-right text-slate-300 dark:text-slate-600 text-xs pr-1"></i>
              </button>
            </div>

            <!-- 2. 1-Click Add Set Menu / Combo Couple / Dish -->
            <div v-if="menuSearchResults.length > 0" class="space-y-1">
              <div class="px-3 py-1 text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400 tracking-wider flex items-center justify-between">
                <span><i class="fa-solid fa-utensils mr-1"></i> Thêm nhanh Set / Combo / Món vào đơn hiện tại</span>
                <span class="text-[9px] font-mono">1-chạm</span>
              </div>
              <button
                v-for="(dish, mIdx) in menuSearchResults"
                :key="dish.name"
                @click="quickAddDishFromPalette(dish)"
                :class="[
                  'w-full text-left px-3 py-2 rounded-xl transition-colors flex items-center justify-between gap-3 border cursor-pointer',
                  paletteSelectedIndex === searchResults.length + mIdx
                    ? 'bg-emerald-50/90 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-800/70'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800/70 border-transparent hover:border-slate-200 dark:hover:border-slate-700'
                ]"
              >
                <div class="min-w-0 flex-1">
                  <div class="font-extrabold text-slate-800 dark:text-slate-100 text-xs flex items-center gap-2">
                    <span class="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[9px] font-black">+ THÊM</span>
                    <span class="truncate">{{ dish.name }}</span>
                  </div>
                  <div v-if="dish.note" class="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">
                    {{ String(dish.note).replace(/\n+/g, ' • ') }}
                  </div>
                </div>
                <div class="shrink-0 font-mono text-xs font-black text-emerald-600 dark:text-emerald-400">
                  {{ formatVND(dish.price || 0) }}đ
                </div>
              </button>
            </div>

            <!-- 3. Commands -->
            <div v-if="filteredCommands.length > 0" class="space-y-1">
              <div class="px-3 py-1 text-[10px] font-black uppercase text-slate-400 tracking-wider">Lệnh điều hành nhanh</div>
              <button
                v-for="(cmd, cIdx) in filteredCommands"
                :key="cmd.cmd"
                @click="executeCommand(cmd.cmd)"
                :class="[
                  'w-full text-left px-3 py-2.5 rounded-xl transition-colors flex items-center gap-3 border min-h-[46px] cursor-pointer',
                  paletteSelectedIndex === searchResults.length + menuSearchResults.length + cIdx
                    ? 'bg-indigo-50/90 dark:bg-indigo-950/50 border-indigo-200 dark:border-indigo-800/70'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800/70 border-transparent hover:border-slate-200 dark:hover:border-slate-700'
                ]"
              >
                <div class="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-700 shrink-0">
                  <i class="fa-solid" :class="cmd.icon"></i>
                </div>
                <div class="flex-grow min-w-0">
                  <div class="font-bold text-slate-800 dark:text-slate-100 text-xs flex items-center justify-between">
                    <span>{{ cmd.label }}</span>
                    <span class="hidden sm:inline-block text-[9px] font-mono font-bold text-slate-400 bg-slate-150 dark:bg-slate-800 px-1.5 py-0.5 rounded">{{ cmd.cmd }}</span>
                  </div>
                  <div class="text-[10px] text-slate-400 mt-0.5 leading-tight truncate">{{ cmd.desc }}</div>
                </div>
              </button>
            </div>

            <!-- No results -->
            <div v-if="searchQuery && searchResults.length === 0 && menuSearchResults.length === 0 && filteredCommands.length === 0" class="text-center py-6 text-slate-400 font-semibold text-xs">
               Không tìm thấy kết quả phù hợp cho "{{ searchQuery }}"
            </div>
          </div>

          <!-- Footer Shortcut Hints -->
          <div class="px-4 py-2 bg-slate-50 dark:bg-slate-950 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-[10px] font-bold text-slate-400">
            <div class="flex items-center gap-3">
              <span><kbd class="px-1.5 py-0.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-[9px] font-mono">↑↓</kbd> Di chuyển</span>
              <span><kbd class="px-1.5 py-0.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-[9px] font-mono">↵</kbd> Chọn</span>
              <span><kbd class="px-1.5 py-0.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-[9px] font-mono">Ctrl+K</kbd> Mở nhanh</span>
            </div>
            <span class="hidden sm:inline text-indigo-500 dark:text-indigo-400">Mẹo: Gõ "Set 5" để thêm nhanh Set 5</span>
          </div>
        </div>
      </div>
    </transition>

    <!-- MAIN PANELS -->
    <LeftPanel />
  </div>
  </div>
</template>
