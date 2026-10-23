<script setup lang="ts">
import { ref, computed } from 'vue'
import { useUIStore } from '@/stores/useUIStore'
import { useFormStore } from '@/stores/useFormStore'
import { useAppStore } from '@/stores/useAppStore'
import { useForm } from '@/composables/useForm'
import { formatVND, mergeSetComponentNote } from '@/utils'
import { SETS } from '@/utils/constants'
import { CANONICAL_SET_AND_COMBO_ITEMS, normalizeSetOrComboName, resolveSetMenuDescription } from '@/domain/menu/menuMatcher'

const ui = useUIStore()
const formStore = useFormStore()
const appStore = useAppStore()
const { handleInputFocus, handleInputBlur, addNewItem, onSearchInput, selectMenuItem, handleItemBlur, itemSuggestions, fillSampleMenu } = useForm()

const draggedIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)
const expandedNotes = ref<Record<number, boolean>>({})
const expandedItems = ref<Record<number, boolean>>({})
const showQuickSetPicker = ref(false)
const quickSetTab = ref<'set' | 'combo'>('set')

const QUICK_NOTE_CHIPS = [
  'Không cay',
  'Ít cay',
  'Không hành',
  'Ra món trước',
  'Lên cùng lúc',
  'Làm kỹ cho bé'
]

function toggleItemExpand(index: number) {
  expandedItems.value[index] = !expandedItems.value[index]
}

function isSetOrComboItem(item: any): boolean {
  if (!item?.name) return false
  const norm = normalizeSetOrComboName(item.name)
  return /^(?:Set menu|Combo couple)\s+\d+$/i.test(norm) || Boolean(SETS[norm])
}

function parseItemNoteStructure(noteStr?: string): { components: string[]; customNotes: string[] } {
  if (!noteStr || !noteStr.trim()) return { components: [], customNotes: [] }
  const lines = noteStr.split('\n').map(l => l.trim()).filter(Boolean)
  const components: string[] = []
  const customNotes: string[] = []
  for (const line of lines) {
    if (/^\d{1,2}\s*\/\s*\S+/.test(line)) {
      components.push(line)
    } else {
      customNotes.push(line)
    }
  }
  return { components, customNotes }
}

function restoreCanonicalSetNote(index: number) {
  const item = formStore.items[index]
  if (!item?.name) return
  const normName = normalizeSetOrComboName(item.name)
  const canonicalDesc = resolveSetMenuDescription(normName, appStore.menuList, appStore.menuDetails || {}) || SETS[normName] || ''
  if (!canonicalDesc) return
  const { customNotes } = parseItemNoteStructure(item.note)
  item.note = mergeSetComponentNote(customNotes.join('\n'), canonicalDesc)
  ui.showToast(`✅ Đã khôi phục danh sách món chuẩn cho ${normName}`, 'success')
}

function promptSwapSetDish(index: number, componentLine: string) {
  const item = formStore.items[index]
  if (!item) return
  const dishTitle = componentLine.replace(/^\d{1,2}\s*\/\s*/, '').replace(/\s*\[\d+\]\s*$/, '').trim()
  const swapPrefix = `🔄 Đổi [${dishTitle}] sang: `
  expandedItems.value[index] = true
  expandedNotes.value[index] = true
  if (!item.note?.includes(swapPrefix)) {
    item.note = swapPrefix + '\n' + (item.note || '')
  }
}

function toggleQuickNoteChip(index: number, chip: string) {
  const item = formStore.items[index]
  if (!item) return
  const current = (item.note || '').trim()
  if (!current) {
    item.note = chip
    return
  }
  const { components, customNotes } = parseItemNoteStructure(current)
  const existingCustom = customNotes.join(', ')
  if (existingCustom.toLowerCase().includes(chip.toLowerCase())) {
    const cleanedCustom = customNotes
      .map(line => line.split(',').map(p => p.trim()).filter(p => p.toLowerCase() !== chip.toLowerCase()).join(', '))
      .filter(Boolean)
    item.note = [...cleanedCustom, ...components].join('\n')
  } else {
    const updatedCustom = customNotes.length > 0
      ? [customNotes[0] + `, ${chip}`, ...customNotes.slice(1)]
      : [`📝 Yêu cầu: ${chip}`]
    item.note = [...updatedCustom, ...components].join('\n')
  }
}

function quickAddSetOrCombo(preset: any) {
  const emptyIdx = formStore.items.findIndex(i => !i.name || !i.name.trim())
  const formattedNote = mergeSetComponentNote('', preset.desc || SETS[preset.name] || '')
  if (emptyIdx !== -1) {
    formStore.items[emptyIdx].name = preset.name
    formStore.items[emptyIdx].price = preset.price
    formStore.items[emptyIdx].qty = formStore.items[emptyIdx].qty || 1
    formStore.items[emptyIdx].note = formattedNote
  } else {
    formStore.items.push({
      name: preset.name,
      qty: 1,
      price: preset.price,
      note: formattedNote
    })
  }
  showQuickSetPicker.value = false
  ui.showToast(`🍽️ Đã thêm ${preset.name} (${formatVND(preset.price)})`, 'success')
}

const quickSetOptions = computed(() => {
  const prefix = quickSetTab.value === 'set' ? 'Set menu ' : 'Combo couple '
  return CANONICAL_SET_AND_COMBO_ITEMS.filter(item => item.name.startsWith(prefix)).map(preset => {
    const liveItem = appStore.menuList.find((m: any) => m.name.toLowerCase() === preset.name.toLowerCase())
    return {
      ...preset,
      price: liveItem?.price || preset.price,
      dishCount: (preset.desc || '').split('\n').filter(Boolean).length
    }
  })
})

function triggerCreateMenu() {
  ui.activeSettingModal = 'menu'
  ui.showMenuUploadModal = true
}

function triggerPasteMenu() {
  ui.activeSettingModal = 'menu'
  ui.showMenuUploadModal = true
}

function triggerUploadMenuImg() {
  ui.activeSettingModal = 'menu'
  ui.showMenuUploadModal = true
}

async function useSampleMenu() {
  ui.loading.is = true
  ui.loading.msg = 'ĐANG TẠO MENU MẪU...'
  try {
    appStore.newMenuName = 'Menu thường'
    fillSampleMenu() // fills appStore.newMenuContent with SAMPLE_MENU
    await appStore.uploadNewMenu()
  } finally {
    ui.loading.is = false
  }
}

function onDragStart(e: DragEvent, index: number) {
  draggedIndex.value = index
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', index.toString())
  }
}

function onDrop(e: DragEvent, index: number) {
  e.preventDefault()
  if (draggedIndex.value !== null && draggedIndex.value !== index) {
    const items = formStore.items
    const draggedItem = items.splice(draggedIndex.value, 1)[0]
    items.splice(index, 0, draggedItem)
  }
  draggedIndex.value = null
  dragOverIndex.value = null
}

function swapItem(idx1: number, idx2: number) {
  if (idx2 < 0 || idx2 >= formStore.items.length) return
  const items = formStore.items
  const temp = items[idx1]
  items[idx1] = items[idx2]
  items[idx2] = temp
}

const hasSoftWarning = computed(() => {
  const meta = formStore.aiMetadata
  const score = meta && typeof meta.confidence_score === 'number' ? meta.confidence_score : 1.0
  return score < 0.80 || (formStore.warnings && formStore.warnings.length > 0)
})

const partyPortionHint = computed(() => {
  const pax = parseInt(formStore.customer.pax || '0', 10)
  if (!pax || pax < 10) return null
  const totalPortions = formStore.items.reduce((sum, item) => sum + (Number(item.qty) || 1), 0)
  const dishTypesCount = formStore.items.filter(i => i.name && i.name.trim()).length
  if (dishTypesCount === 0) return null
  const avgPortionPerDish = (totalPortions / dishTypesCount).toFixed(1)
  const guestsPerPortion = (pax / (totalPortions / dishTypesCount)).toFixed(1)
  return `Tiệc ${pax} khách · ${dishTypesCount} món · TB ${avgPortionPerDish} phần/món (~${guestsPerPortion} khách/phần)`
})

const smartSetAdvisor = computed(() => {
  const pax = parseInt(formStore.customer.pax || '0', 10)
  if (!pax || pax <= 0) return null

  const setItemIndex = formStore.items.findIndex(i => /^set\s*menu\s+\d+$/i.test(normalizeSetOrComboName(i.name || '')))
  if (setItemIndex !== -1 && pax >= 16) {
    const recommendedSets = Math.max(2, Math.round(pax / 10))
    const currentQty = Number(formStore.items[setItemIndex].qty) || 1
    if (currentQty < recommendedSets) {
      return {
        type: 'scale_set' as const,
        itemIndex: setItemIndex,
        recommendedQty: recommendedSets,
        text: `Đoàn ${pax} khách đang chọn ${currentQty} ${formStore.items[setItemIndex].name} (chuẩn ~10 khách/set).`,
        cta: `Tăng lên x${recommendedSets} Set`
      }
    }
  }

  const hasComboCouple = formStore.items.some(i => /^combo\s*couple\s+\d+$/i.test(normalizeSetOrComboName(i.name || '')))
  if (pax >= 2 && pax <= 3 && !hasComboCouple && setItemIndex === -1) {
    return {
      type: 'suggest_couple' as const,
      text: `Bàn ${pax} khách rất phù hợp với các gói Combo Couple (399k - 599k).`,
      cta: 'Xem 11 Combo Couple'
    }
  }
  return null
})

function applySmartSetAdvisor() {
  const adv = smartSetAdvisor.value
  if (!adv) return
  if (adv.type === 'scale_set' && typeof adv.itemIndex === 'number') {
    formStore.items[adv.itemIndex].qty = adv.recommendedQty
    ui.showToast(`✅ Đã cập nhật số lượng thành x${adv.recommendedQty} ${formStore.items[adv.itemIndex].name}`, 'success')
  } else if (adv.type === 'suggest_couple') {
    quickSetTab.value = 'combo'
    showQuickSetPicker.value = true
  }
}

function formatPriceWithDots(val: any): string {
  if (val === undefined || val === null || val === '') return ''
  const cleanStr = String(val).replace(/\./g, '')
  const num = parseInt(cleanStr, 10)
  if (isNaN(num)) return ''
  return num.toLocaleString('de-DE')
}

function updateItemPrice(index: number, valStr: string) {
  const cleanStr = valStr.replace(/\./g, '')
  const num = cleanStr ? parseInt(cleanStr, 10) : 0
  formStore.items[index].price = isNaN(num) ? 0 : num
}
const selectedCategory = ref('TẤT CẢ')

const CATEGORIES = [
  { name: 'TẤT CẢ', keywords: [] },
  { name: 'SET MENU', keywords: ['set menu'] },
  { name: 'COMBO COUPLE', keywords: ['combo couple'] },
  { name: 'NƯỚNG/THỊT', keywords: ['nướng', 'tảng', 'ba chỉ', 'bò', 'heo', 'gà', 'thịt', 'dẻ sườn', 'sườn', 'chim', 'khay'] },
  { name: 'LẨU/SÚP', keywords: ['lẩu', 'súp', 'canh', 'mì', 'miến', 'cháo', 'tokbokki'] },
  { name: 'ĐỒ UỐNG', keywords: ['bia', 'nước', 'cola', 'sprite', 'sữa', 'trà', 'rượu', 'chanh', 'tiger', 'heineken'] }
]

const popularMenuItems = computed(() => {
  if (!appStore.historyList) return []
  const counts: Record<string, number> = {}
  appStore.historyList.forEach((order: any) => {
    if (order.menuItems) {
      order.menuItems.forEach((item: any) => {
        const name = item.name.toUpperCase().trim()
        counts[name] = (counts[name] || 0) + (item.qty || 1)
      })
    }
  })
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name]) => {
      const match = appStore.menuList.find((i: any) => i.name.toUpperCase().trim() === name)
      return match || { name, price: 0 }
    })
})

const filteredSuggestions = computed(() => {
  let list = itemSuggestions.value
  
  const q = ui.focusIdx !== null ? (formStore.items[ui.focusIdx]?.name || '') : ''
  if (!q) {
    if (selectedCategory.value === 'TẤT CẢ') {
      return popularMenuItems.value
    }
    const cat = CATEGORIES.find(c => c.name === selectedCategory.value)
    if (cat) {
      return appStore.menuList.filter((item: any) => 
        cat.keywords.some(kw => item.name.toLowerCase().includes(kw))
      ).slice(0, 20)
    }
  }
  
  if (selectedCategory.value !== 'TẤT CẢ') {
    const cat = CATEGORIES.find(c => c.name === selectedCategory.value)
    if (cat) {
      list = list.filter((item: any) => 
        cat.keywords.some(kw => item.name.toLowerCase().includes(kw))
      )
    }
  }
  return list
})

function highlightMatch(name: string, index: number): string {
  const query = formStore.items[index]?.name || ''
  if (!query) return name
  const escapedQuery = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
  const reg = new RegExp(`(${escapedQuery})`, 'gi')
  return name.replace(reg, '<mark class="bg-yellow-200 text-slate-900 rounded px-0.5 font-black">$1</mark>')
}

function clearItemName(index: number) {
  formStore.items[index].name = ''
  onSearchInput(index)
}

function handleNameInput(index: number, e?: Event) {
  onSearchInput(index)
  if (e && e.target) {
    const target = e.target as HTMLTextAreaElement
    target.style.height = 'auto'
    target.style.height = `${Math.max(target.scrollHeight, 42)}px`
  }
}

function onSelectSuggestion(s: any, index: number) {
  selectMenuItem(s, index)
}

const viewMode = ref<'cards' | 'compact'>((localStorage.getItem('kg_menu_view_mode') as 'cards' | 'compact') || 'cards')

function setViewMode(mode: 'cards' | 'compact') {
  viewMode.value = mode
  try {
    localStorage.setItem('kg_menu_view_mode', mode)
  } catch {}
}

const totalPortions = computed(() => {
  return formStore.items.reduce((sum, i) => sum + (Number(i.qty) || 0), 0)
})

function addNewItemAndFocus() {
  addNewItem()
  setTimeout(() => {
    const newIdx = formStore.items.length - 1
    const el = document.getElementById(`pos-dish-name-${newIdx}`) || document.getElementById(`card-dish-name-${newIdx}`)
    if (el) {
      el.focus()
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, 60)
}
</script>

<template>
  <div id="menu-editor-card" class="bg-surface-2 dark:bg-surface-2 rounded-2xl shadow-sm border p-4 sm:p-5 transition-all duration-200 relative overflow-hidden"
       :class="hasSoftWarning ? 'border-amber-300 dark:border-amber-700/60 bg-amber-50/10' : 'border-border-default dark:border-border-subtle'">

    <div class="flex flex-wrap justify-between items-center gap-2 mb-4 border-b border-border-subtle pb-3">
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-sm shadow-xs border border-emerald-500/20 shrink-0">
          <i class="fa-solid fa-bell-concierge"></i>
        </div>
        <div>
          <h3 class="font-bold text-text-primary text-xs uppercase tracking-wider flex items-center gap-1.5">
            <span>3. Danh Sách Món Ăn & Đồ Uống</span>
            <span class="bg-emerald-600 text-white px-2 py-0.5 rounded-full text-[10px] font-black font-tabular shadow-2xs">{{ formStore.items.length }} món · {{ totalPortions }} phần</span>
          </h3>
          <p class="text-[11px] font-medium text-text-secondary">Chọn từ thực đơn hoặc nhập tự do</p>
          <div v-if="partyPortionHint" class="flex items-center gap-1 mt-1">
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[10px] font-bold">
              <i class="fa-solid fa-calculator text-[9px] text-amber-500"></i>
              {{ partyPortionHint }}
            </span>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-1.5 flex-wrap">
        <!-- View Mode Toggle: Card View vs POS Compact Table -->
        <div class="inline-flex items-center bg-surface-3 dark:bg-surface-3 p-0.5 rounded-xl border border-border-subtle">
          <button
            type="button"
            @click="setViewMode('cards')"
            class="px-2.5 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer"
            :class="viewMode === 'cards' ? 'bg-surface-2 dark:bg-surface-4 text-text-primary shadow-2xs' : 'text-text-tertiary hover:text-text-primary'"
            title="Chế độ Thẻ chi tiết"
          >
            <i class="fa-solid fa-grip-lines text-[10px]"></i>
            <span>Thẻ</span>
          </button>
          <button
            type="button"
            @click="setViewMode('compact')"
            class="px-2.5 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer"
            :class="viewMode === 'compact' ? 'bg-apex-primary text-white shadow-2xs' : 'text-text-tertiary hover:text-text-primary'"
            title="Chế độ Bảng POS gọn (1 dòng/món - tối ưu đơn đông món)"
          >
            <i class="fa-solid fa-table-list text-[10px]"></i>
            <span>Bảng POS</span>
          </button>
        </div>

        <button
          type="button"
          @click="showQuickSetPicker = !showQuickSetPicker"
          class="text-[10px] px-3 py-2 rounded-xl font-black border transition-all uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-2xs min-h-[36px] active:scale-95"
          :class="showQuickSetPicker ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/50 hover:bg-emerald-100'"
          title="Chọn nhanh Set Menu 1..15 hoặc Combo Couple 1..11"
        >
          <i class="fa-solid fa-layer-group text-[10px]"></i>
          <span>Chọn Set / Combo</span>
        </button>

        <button @click="ui.showMenuManager = true" class="text-[10px] bg-surface-3 px-3 py-2 rounded-xl text-text-secondary font-black border border-border-subtle hover:bg-surface-hover active:scale-95 transition-all uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-2xs min-h-[36px]">
          <i class="fa-solid fa-book-open text-apex-primary"></i> {{ appStore.activeSheet }}
        </button>
      </div>
    </div>

    <!-- High-Volume Party Suggestion Banner -->
    <div
      v-if="viewMode === 'cards' && formStore.items.length >= 6"
      class="mb-3 px-3 py-2 rounded-xl bg-blue-500/10 border border-blue-500/25 flex items-center justify-between gap-2 text-xs"
    >
      <div class="flex items-center gap-2 text-text-primary font-medium text-[11px]">
        <i class="fa-solid fa-table-list text-apex-primary"></i>
        <span>Đơn có <strong>{{ formStore.items.length }} món</strong> — Bật <strong>Chế độ Bảng POS gọn</strong> để nhìn toàn bộ món không cần cuộn dài!</span>
      </div>
      <button
        type="button"
        @click="setViewMode('compact')"
        class="px-2.5 py-1 rounded-lg bg-apex-primary hover:bg-apex-primary-hover text-white text-[10px] font-bold uppercase tracking-wider shrink-0 cursor-pointer active:scale-95 transition-all"
      >
        Chuyển Bảng POS
      </button>
    </div>

    <!-- Smart Set & Portion Advisor Banner -->
    <div v-if="smartSetAdvisor" class="mb-3.5 p-2.5 rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 flex items-center justify-between gap-2 text-xs">
      <div class="flex items-center gap-2 min-w-0">
        <i class="fa-solid fa-wand-magic-sparkles text-indigo-600 dark:text-indigo-400 shrink-0"></i>
        <span class="font-bold text-indigo-900 dark:text-indigo-200 text-[11px] leading-snug">{{ smartSetAdvisor.text }}</span>
      </div>
      <button
        type="button"
        @click="applySmartSetAdvisor"
        class="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shrink-0 active:scale-95 transition-all cursor-pointer shadow-xs"
      >
        {{ smartSetAdvisor.cta }}
      </button>
    </div>

    <!-- Collapsible 1-Click Set Menu & Combo Couple Picker -->
    <transition name="fade">
      <div v-if="showQuickSetPicker" class="mb-4 p-3.5 rounded-2xl bg-slate-50 dark:bg-surface-3 border border-slate-200 dark:border-border-subtle space-y-3">
        <div class="flex items-center justify-between gap-2">
          <div class="flex gap-1.5">
            <button
              type="button"
              @click="quickSetTab = 'set'"
              class="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
              :class="quickSetTab === 'set' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'"
            >
              🍽️ Set Menu 1 → 15 (Tiệc 10 người)
            </button>
            <button
              type="button"
              @click="quickSetTab = 'combo'"
              class="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
              :class="quickSetTab === 'combo' ? 'bg-rose-600 text-white shadow-xs' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'"
            >
              💑 Combo Couple 1 → 11 (2 người)
            </button>
          </div>
          <button type="button" @click="showQuickSetPicker = false" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs px-1.5 cursor-pointer">✕</button>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 max-h-[230px] overflow-y-auto custom-scrollbar pr-1">
          <button
            v-for="preset in quickSetOptions"
            :key="preset.name"
            type="button"
            @click="quickAddSetOrCombo(preset)"
            class="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 hover:shadow-sm text-left transition-all active:scale-95 cursor-pointer flex flex-col justify-between gap-1 group"
          >
            <div class="flex items-center justify-between gap-1">
              <span class="font-black text-slate-800 dark:text-slate-100 text-[11px] group-hover:text-emerald-600 dark:group-hover:text-emerald-400">{{ preset.name }}</span>
              <span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300">{{ preset.dishCount }} món</span>
            </div>
            <div class="text-[11px] font-black text-blue-600 dark:text-blue-400 font-tabular">{{ formatVND(preset.price) }}</div>
          </button>
        </div>
      </div>
    </transition>

    <!-- Alert when no menu is available -->
    <div v-if="appStore.menuSheets.length === 0 || appStore.menuList.length === 0" class="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-2xl p-4 sm:p-5 mb-4 text-center flex flex-col items-center justify-center">
      <div class="w-12 h-12 bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 rounded-full flex items-center justify-center text-xl mb-3 shadow-inner">
        <i class="fa-solid fa-triangle-exclamation"></i>
      </div>
      <h4 class="font-black text-amber-900 dark:text-amber-200 text-sm uppercase tracking-wide mb-1">Chưa có menu trong hệ thống</h4>
      <p class="text-xs text-amber-700 dark:text-amber-300 max-w-md mb-4 leading-relaxed font-medium">
        Vui lòng tạo menu trước để hệ thống nhận diện món, tự động dò thực đơn và tính tiền chính xác.
      </p>
      <div class="flex flex-wrap justify-center gap-2">
        <button @click="triggerCreateMenu" class="px-4 py-2.5 bg-blue-900 dark:bg-blue-600 text-white text-[11px] font-black rounded-xl uppercase tracking-wider active:scale-95 transition-all shadow-sm min-h-[44px]">
          <i class="fa-solid fa-plus mr-1"></i> Tạo menu mới
        </button>
        <button @click="triggerPasteMenu" class="px-4 py-2.5 bg-white dark:bg-surface-3 border border-slate-200 dark:border-border-subtle text-slate-700 dark:text-slate-200 text-[11px] font-black rounded-xl uppercase tracking-wider active:scale-95 transition-all shadow-sm min-h-[44px]">
          <i class="fa-solid fa-paste mr-1"></i> Dán menu text
        </button>
        <button @click="triggerUploadMenuImg" class="px-4 py-2.5 bg-white dark:bg-surface-3 border border-slate-200 dark:border-border-subtle text-slate-700 dark:text-slate-200 text-[11px] font-black rounded-xl uppercase tracking-wider active:scale-95 transition-all shadow-sm min-h-[44px]">
          <i class="fa-solid fa-image mr-1"></i> Tải ảnh menu (AI)
        </button>
        <button @click="useSampleMenu" class="px-4 py-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-300 text-[11px] font-black rounded-xl uppercase tracking-wider active:scale-95 transition-all shadow-sm min-h-[44px]">
          <i class="fa-solid fa-circle-play mr-1"></i> Dùng menu mẫu
        </button>
      </div>
    </div>

    <!-- COMPACT POS TABLE VIEW (1 Line Per Dish - Ultra Fast High-Density Mode) -->
    <div v-if="viewMode === 'compact'" class="border border-border-default dark:border-border-subtle rounded-2xl bg-surface-1 dark:bg-surface-3/40 overflow-visible shadow-xs">
      <!-- Table Header -->
      <div class="hidden sm:grid sm:grid-cols-12 gap-2 px-3 py-2 bg-surface-3 dark:bg-surface-3 border-b border-border-subtle text-[10px] font-bold uppercase tracking-wider text-text-secondary rounded-t-2xl">
        <div class="col-span-5">Tên món ăn / Đồ uống</div>
        <div class="col-span-2 text-center">Số lượng</div>
        <div class="col-span-2 text-right">Đơn giá</div>
        <div class="col-span-2 text-right">Thành tiền</div>
        <div class="col-span-1 text-right">Xóa</div>
      </div>

      <div class="divide-y divide-border-subtle">
        <div
          v-for="(item, index) in formStore.items"
          :key="`pos-${index}`"
          class="p-2.5 sm:px-3 sm:py-2 hover:bg-surface-2/80 dark:hover:bg-surface-3/70 transition-colors relative"
        >
          <div class="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
            <!-- Col 1: # + Dish Name Input + Autocomplete -->
            <div class="sm:col-span-5 flex items-center gap-2 relative min-w-0">
              <span class="w-5 h-5 rounded-md bg-primary/10 text-apex-primary text-[10px] font-black flex items-center justify-center shrink-0 font-tabular">
                {{ index + 1 }}
              </span>
              <div class="relative flex-1 min-w-0">
                <input
                  :id="`pos-dish-name-${index}`"
                  type="text"
                  v-model="item.name"
                  @input="onSearchInput(index)"
                  @focus="handleInputFocus"
                  @blur="handleItemBlur"
                  @keydown.enter.prevent="(index === formStore.items.length - 1 && item.name.trim()) ? addNewItemAndFocus() : undefined"
                  placeholder="Gõ tên món (Enter thêm dòng)..."
                  class="w-full px-2.5 py-1.5 rounded-lg bg-surface-input border border-border-default focus:border-border-focus outline-none text-xs font-bold text-text-primary uppercase placeholder:normal-case placeholder:font-normal placeholder:text-text-tertiary"
                />
                <!-- Compact Suggestion Dropdown -->
                <div v-if="ui.focusIdx === index" class="absolute top-full left-0 right-0 sm:w-[380px] bg-surface-2 dark:bg-surface-4 border border-border-default rounded-xl shadow-2xl max-h-[260px] overflow-y-auto z-50 mt-1 p-1 custom-scrollbar">
                  <div
                    v-for="s in filteredSuggestions"
                    :key="s.name"
                    @mousedown.prevent="onSelectSuggestion(s, index)"
                    class="px-2.5 py-2 hover:bg-primary/10 rounded-lg cursor-pointer flex items-center justify-between gap-2 text-xs"
                  >
                    <span class="font-bold text-text-primary uppercase truncate" v-html="highlightMatch(s.name, index)"></span>
                    <span class="font-mono font-bold text-apex-primary shrink-0">{{ formatVND(s.price) }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Col 2: Quantity Stepper -->
            <div class="sm:col-span-2 flex items-center justify-between sm:justify-center gap-1">
              <span class="sm:hidden text-[10px] font-bold text-text-tertiary uppercase">Số lượng:</span>
              <div class="inline-flex items-center bg-surface-input rounded-lg border border-border-default p-0.5">
                <button
                  type="button"
                  @click.prevent="item.qty > 1 ? item.qty-- : formStore.items.splice(index, 1)"
                  class="w-6 h-6 rounded hover:bg-surface-3 text-text-secondary font-bold text-xs flex items-center justify-center cursor-pointer"
                >-</button>
                <input
                  type="number"
                  v-model.number="item.qty"
                  @keydown.enter.prevent="index === formStore.items.length - 1 ? addNewItemAndFocus() : undefined"
                  class="w-8 text-center bg-transparent border-none outline-none font-mono font-black text-xs text-text-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button
                  type="button"
                  @click.prevent="item.qty++"
                  class="w-6 h-6 rounded hover:bg-surface-3 text-text-secondary font-bold text-xs flex items-center justify-center cursor-pointer"
                >+</button>
              </div>
            </div>

            <!-- Col 3: Unit Price -->
            <div class="sm:col-span-2 flex items-center justify-between sm:justify-end gap-1">
              <span class="sm:hidden text-[10px] font-bold text-text-tertiary uppercase">Đơn giá:</span>
              <div class="relative w-28 sm:w-full">
                <input
                  type="text"
                  inputmode="numeric"
                  :value="formatPriceWithDots(item.price)"
                  @input="updateItemPrice(index, ($event.target as HTMLInputElement).value)"
                  placeholder="0"
                  class="w-full px-2 py-1.5 pr-5 rounded-lg bg-surface-input border border-border-default focus:border-border-focus outline-none text-right font-mono font-bold text-xs text-apex-primary tabular-nums"
                />
                <span class="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-text-tertiary font-bold pointer-events-none">đ</span>
              </div>
            </div>

            <!-- Col 4: Subtotal -->
            <div class="sm:col-span-2 flex items-center justify-between sm:justify-end">
              <span class="sm:hidden text-[10px] font-bold text-text-tertiary uppercase">Thành tiền:</span>
              <span class="font-mono font-black text-xs text-emerald-600 dark:text-emerald-400 tabular-nums">
                {{ formatVND((item.price || 0) * (item.qty || 1)) }}
              </span>
            </div>

            <!-- Col 5: Note Toggle & Delete -->
            <div class="sm:col-span-1 flex items-center justify-end gap-1">
              <button
                type="button"
                @click="toggleItemExpand(index)"
                class="w-7 h-7 rounded-lg border flex items-center justify-center transition-colors cursor-pointer"
                :class="item.note ? 'bg-amber-500/15 border-amber-500/40 text-amber-500' : 'bg-surface-input border-border-subtle text-text-tertiary hover:text-text-primary'"
                :title="item.note ? `Ghi chú: ${item.note}` : 'Thêm ghi chú bếp cho món này'"
              >
                <i class="fa-solid fa-comment-medical text-[10px]"></i>
              </button>
              <button
                type="button"
                @click="formStore.items.splice(index, 1)"
                class="w-7 h-7 rounded-lg bg-surface-input hover:bg-rose-500/15 border border-border-subtle hover:border-rose-500/40 text-text-tertiary hover:text-rose-500 flex items-center justify-center transition-colors cursor-pointer"
                title="Xóa món"
              >
                <i class="fa-solid fa-trash-can text-[10px]"></i>
              </button>
            </div>
          </div>

          <!-- Inline Note Input in Compact Mode when toggled or when note exists -->
          <div v-if="expandedItems[index] || item.note" class="mt-1.5 pl-7 flex items-center gap-1.5">
            <input
              type="text"
              v-model="item.note"
              @keydown.enter.prevent="index === formStore.items.length - 1 ? addNewItemAndFocus() : undefined"
              placeholder="Ghi chú bếp (ít cay, không hành, lên trước...)"
              class="flex-1 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] font-semibold text-amber-800 dark:text-amber-200 outline-none"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Items List: Full-width Name with Wrapping + Clear Multi-Line View -->
    <div v-else class="space-y-3.5">
      <div v-for="(item, index) in formStore.items" :key="index" 
           draggable="true"
           @dragstart="onDragStart($event, index)"
           @dragover.prevent="dragOverIndex = index"
           @dragleave="dragOverIndex = null"
           @drop="onDrop($event, index)"
           @dragend="draggedIndex = null; dragOverIndex = null"
           :class="[
             'relative bg-white dark:bg-surface-3/80 border rounded-2xl p-3 sm:p-4 shadow-sm hover:shadow-md transition-all group',
             draggedIndex === index ? 'opacity-40 scale-[0.98]' : '',
             dragOverIndex === index && draggedIndex !== index ? 'border-t-4 border-t-blue-600 pt-5 scale-[1.02] shadow-lg' : 'border-slate-200 dark:border-border-subtle',
             item.note ? 'border-rose-200 dark:border-rose-900/60 bg-rose-50/10' : ''
           ]">
        <div class="flex flex-col gap-3">
          
          <!-- Row 1: Full-Width Dish Name Area with Reorder Badge & Clear (X) -->
          <div class="flex items-start gap-2.5 relative">
            <!-- Order Handle & Number Badge -->
            <div class="flex items-center gap-1 shrink-0 pt-0.5">
              <span class="w-6 h-6 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-[11px] font-black flex items-center justify-center border border-blue-200/60 dark:border-blue-800/60 font-tabular shadow-2xs">
                #{{ index + 1 }}
              </span>
              <div class="flex flex-col gap-0.5 bg-slate-50 dark:bg-slate-800 rounded-lg p-0.5 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 shrink-0">
                <button @click="swapItem(index, index - 1)" :disabled="index === 0" aria-label="Di chuyển món lên" class="w-6 h-4 flex items-center justify-center hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-20 active:scale-90 transition-transform cursor-pointer">
                  <i class="fa-solid fa-chevron-up text-[9px]"></i>
                </button>
                <button @click="swapItem(index, index + 1)" :disabled="index === formStore.items.length - 1" aria-label="Di chuyển món xuống" class="w-6 h-4 flex items-center justify-center hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-20 active:scale-90 transition-transform cursor-pointer">
                  <i class="fa-solid fa-chevron-down text-[9px]"></i>
                </button>
              </div>
            </div>

            <!-- Full-Width Auto-Wrapping Dish Name Input with Zero Clipping -->
            <div class="relative flex-grow min-w-0">
              <div class="grid w-full relative min-h-[42px]">
                <!-- Invisible mirror span forcing grid cell to grow to full text height -->
                <span 
                  class="col-start-1 row-start-1 invisible break-words whitespace-pre-wrap font-black text-[16px] sm:text-sm uppercase leading-normal pt-1.5 pb-2.5 pr-8 select-none pointer-events-none" 
                  aria-hidden="true"
                >
                  {{ (item.name ? item.name : 'NHẬP HOẶC CHỌN TÊN MÓN...') + ' ' }}
                </span>
                <!-- Real textarea occupying exact height with no clipping -->
                <textarea
                  v-model="item.name"
                  @input="handleNameInput(index, $event)"
                  @blur="handleItemBlur"
                  @focus="handleInputFocus"
                  class="col-start-1 row-start-1 w-full h-full font-black text-slate-900 dark:text-slate-100 text-[16px] sm:text-sm border-b-2 border-slate-200 dark:border-slate-700 focus:border-blue-600 dark:focus:border-blue-400 outline-none pt-1.5 pb-2.5 pr-8 uppercase placeholder-slate-400 dark:placeholder-slate-500 bg-transparent resize-none leading-normal transition-colors overflow-hidden custom-scrollbar"
                  placeholder="NHẬP HOẶC CHỌN TÊN MÓN..."
                  rows="1"
                ></textarea>
                <button 
                  v-if="item.name" 
                  @click.prevent="clearItemName(index)" 
                  aria-label="Xóa tên món"
                  class="absolute right-0 top-1.5 w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all active:scale-90 cursor-pointer"
                >
                  <i class="fa-solid fa-circle-xmark text-sm"></i>
                </button>
              </div>

              <!-- Suggestion Dropdown: Generous full width, non-truncated -->
              <div v-if="ui.focusIdx === index" class="absolute top-full left-0 right-0 bg-white dark:bg-surface-4 border border-slate-200 dark:border-border-default rounded-2xl shadow-2xl max-h-[340px] overflow-hidden z-50 mt-1.5 flex flex-col">
                <!-- Category Tabs inside Dropdown with Right Fade Indicator -->
                <div class="relative shrink-0 border-b border-slate-100 dark:border-border-subtle bg-slate-50 dark:bg-surface-canvas">
                  <div class="flex gap-1.5 p-2 overflow-x-auto no-scrollbar pr-7">
                    <button
                      v-for="cat in CATEGORIES"
                      :key="cat.name"
                      @mousedown.prevent="selectedCategory = cat.name"
                      class="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer min-h-[32px] whitespace-nowrap"
                      :class="selectedCategory === cat.name ? 'bg-blue-600 text-white shadow-sm' : 'bg-white dark:bg-surface-3 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-border-subtle hover:bg-slate-100 dark:hover:bg-surface-4'"
                    >
                      {{ cat.name }}
                    </button>
                  </div>
                  <div class="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-slate-50 dark:from-surface-canvas to-transparent pointer-events-none"></div>
                </div>
                
                <!-- Suggestions List: Full dish names, no clipping -->
                <ul class="flex-grow overflow-y-auto p-1.5 scroll-smooth custom-scrollbar">
                  <div v-if="filteredSuggestions.length === 0" class="text-center py-6 text-slate-400 text-xs italic font-semibold">
                    Không tìm thấy món phù hợp...
                  </div>
                  
                  <li 
                    v-for="s in filteredSuggestions" 
                    :key="s.name" 
                    @mousedown.prevent="onSelectSuggestion(s, index)" 
                    class="p-2.5 hover:bg-blue-50 dark:hover:bg-surface-3/80 cursor-pointer flex justify-between items-center rounded-xl transition-colors border-b last:border-0 border-slate-100 dark:border-border-subtle min-h-[48px] gap-2"
                  >
                    <div class="flex flex-col min-w-0 flex-1 pr-2">
                      <span class="font-black text-slate-800 dark:text-slate-100 text-xs uppercase leading-snug whitespace-normal break-words" v-html="highlightMatch(s.name, index)"></span>
                      <span v-if="s.desc" class="text-[9.5px] font-medium text-slate-400 dark:text-slate-400 line-clamp-2 mt-0.5 leading-tight">{{ s.desc }}</span>
                    </div>
                    <span class="text-xs text-blue-600 dark:text-blue-400 font-black tracking-tight bg-blue-50/80 dark:bg-blue-950/60 px-2.5 py-1 rounded-lg font-tabular shrink-0 border border-blue-100 dark:border-blue-900/50">
                      {{ formatVND(s.price) }}
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <!-- Row 2: Stepper & Price (Adaptive full-width, zero clipping on mobile) -->
          <div class="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <!-- Left Group: Stepper + Quick Steppers -->
            <div class="flex items-center bg-slate-50 dark:bg-slate-800/70 rounded-xl border border-slate-200 dark:border-slate-700 p-0.5 shadow-inner shrink-0">
              <button 
                @click.prevent="if (item.qty > 1) item.qty--; else formStore.items.splice(index, 1)" 
                class="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold active:scale-90 transition-transform cursor-pointer select-none shrink-0"
                title="Giảm số lượng"
                aria-label="Giảm số lượng"
              >
                <i class="fa-solid fa-minus text-xs"></i>
              </button>
              
              <input 
                type="number" 
                inputmode="numeric"
                v-model="item.qty" 
                @focus="handleInputFocus" 
                @blur="handleInputBlur" 
                class="w-[34px] sm:w-10 min-w-[34px] px-0.5 text-center font-black border-none bg-transparent text-[15px] sm:text-sm outline-none text-slate-800 dark:text-slate-100 placeholder-slate-400 font-tabular [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" 
                placeholder="SL"
              >
              
              <button 
                @click.prevent="item.qty++" 
                class="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold active:scale-90 transition-transform cursor-pointer select-none shrink-0"
                title="Tăng số lượng"
                aria-label="Tăng số lượng"
              >
                <i class="fa-solid fa-plus text-xs"></i>
              </button>

              <!-- Quick Portion Steppers (+1, +2, +5) on Desktop -->
              <div class="hidden sm:flex items-center gap-0.5 ml-1 pl-1 border-l border-slate-200 dark:border-slate-700">
                <button 
                  type="button"
                  @click.prevent="item.qty = (Number(item.qty) || 0) + 1"
                  class="px-1.5 py-0.5 text-[10px] font-bold text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 rounded hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 transition-all cursor-pointer"
                  title="Thêm 1 phần"
                >+1</button>
                <button 
                  type="button"
                  @click.prevent="item.qty = (Number(item.qty) || 0) + 2"
                  class="px-1.5 py-0.5 text-[10px] font-bold text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 rounded hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 transition-all cursor-pointer"
                  title="Thêm 2 phần"
                >+2</button>
                <button 
                  type="button"
                  @click.prevent="item.qty = (Number(item.qty) || 0) + 5"
                  class="px-1.5 py-0.5 text-[10px] font-bold text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 rounded hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 transition-all cursor-pointer"
                  title="Thêm 5 phần"
                >+5</button>
              </div>
            </div>

            <!-- Price Input with currency label (Full remaining width on mobile, zero clipping) -->
            <div class="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 sm:px-3 py-1.5 flex-1 min-w-0 sm:flex-initial sm:w-auto">
              <span class="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase shrink-0">Giá:</span>
              <input 
                type="text" 
                inputmode="numeric"
                :value="formatPriceWithDots(item.price)" 
                @input="updateItemPrice(index, ($event.target as HTMLInputElement).value)" 
                @focus="handleInputFocus" 
                @blur="handleInputBlur" 
                class="w-full sm:w-24 text-right font-black text-blue-700 dark:text-blue-300 bg-transparent text-[15px] sm:text-sm outline-none placeholder-slate-400 font-tabular p-0" 
                placeholder="0"
              >
              <span class="text-[10px] font-bold text-slate-400 shrink-0">đ</span>
            </div>

            <!-- Subtotal: Desktop Badge (hidden on mobile to ensure zero cramping) -->
            <div class="hidden sm:flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200/60 dark:border-emerald-800/40 text-xs font-black text-emerald-700 dark:text-emerald-300 font-tabular shrink-0 ml-auto" title="Thành tiền món này">
              <span class="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">Thành tiền:</span>
              <span class="whitespace-nowrap">{{ formatVND((item.price || 0) * (item.qty || 1)) }}</span>
            </div>
          </div>

          <!-- Row 3: Note Action, Mobile Subtotal & Delete Button -->
          <div class="flex items-center justify-between gap-2 pt-1 border-t border-dashed border-slate-100 dark:border-slate-800">
            <!-- Note toggle / preview button -->
            <button 
              type="button" 
              @click="toggleItemExpand(index)" 
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all min-h-[38px] flex-1 min-w-0 max-w-[200px] sm:max-w-[340px] truncate cursor-pointer active:scale-95"
              :class="item.note ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800' : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 border border-slate-200 dark:border-slate-700'"
              aria-label="Ghi chú món ăn"
            >
              <i class="fa-solid fa-pen-to-square text-[11px] shrink-0 text-amber-500"></i>
              <span class="truncate">{{ item.note || '+ Thêm ghi chú' }}</span>
            </button>

            <!-- Subtotal: Mobile Badge (Clean, prominent center position, zero overlap) -->
            <div class="flex sm:hidden items-center gap-1 px-2.5 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200/60 dark:border-emerald-800/40 text-[11px] font-black text-emerald-700 dark:text-emerald-300 font-tabular shrink-0 shadow-2xs" title="Thành tiền món này">
              <span class="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">=</span>
              <span class="whitespace-nowrap">{{ formatVND((item.price || 0) * (item.qty || 1)) }}</span>
            </div>

            <!-- Delete Button with guaranteed touch-target >=44x44px -->
            <button 
              @click="formStore.items.splice(index, 1)" 
              aria-label="Xóa món"
              title="Xóa món này khỏi thực đơn"
              class="h-9 px-3 min-w-[40px] bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-800/60 text-rose-500 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 hover:border-rose-300 transition-all rounded-xl flex items-center justify-center gap-1 active:scale-90 shadow-2xs shrink-0 cursor-pointer text-xs font-bold"
            >
              <i class="fa-solid fa-trash-can text-xs"></i>
              <span class="text-[11px]">Xóa</span>
            </button>
          </div>

          <!-- Interactive Set / Combo Component Viewer -->
          <div
            v-if="isSetOrComboItem(item) || parseItemNoteStructure(item.note).components.length > 0"
            class="w-full pt-2 border-t border-dashed border-emerald-200 dark:border-emerald-800/50 space-y-2"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                <i class="fa-solid fa-list-check text-emerald-500"></i>
                <span>Chi tiết món trong {{ normalizeSetOrComboName(item.name) }} ({{ parseItemNoteStructure(item.note).components.length }} món)</span>
              </span>
              <button
                v-if="isSetOrComboItem(item)"
                type="button"
                @click.prevent="restoreCanonicalSetNote(index)"
                class="px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95"
                title="Khôi phục danh sách món mặc định của Set/Combo"
              >
                <i class="fa-solid fa-rotate-left mr-0.5"></i> Chuẩn hóa Set
              </button>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              <div
                v-for="(compLine, cIdx) in parseItemNoteStructure(item.note).components"
                :key="cIdx"
                class="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-800/40 text-[11px] font-bold text-slate-700 dark:text-slate-200"
              >
                <span class="truncate">{{ compLine }}</span>
                <button
                  type="button"
                  @click.prevent="promptSwapSetDish(index, compLine)"
                  class="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 hover:bg-amber-50 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60 text-[9px] font-black uppercase shrink-0 cursor-pointer active:scale-95"
                  title="Ghi chú đổi món này sang món khác"
                >
                  Đổi món
                </button>
              </div>
            </div>
          </div>

          <!-- Expanded Note Editor (on demand or when note exists) -->
          <div v-if="expandedItems[index] || (item.note && expandedItems[index] !== false)" class="w-full pt-1.5 border-t border-dashed border-slate-200 dark:border-slate-800 space-y-2">
            <!-- 1-Click Kitchen Quick-Note Chips -->
            <div class="flex flex-wrap items-center gap-1">
              <span class="text-[9px] font-black text-slate-400 uppercase tracking-wider mr-1">Ghi chú nhanh:</span>
              <button
                v-for="chip in QUICK_NOTE_CHIPS"
                :key="chip"
                type="button"
                @click.prevent="toggleQuickNoteChip(index, chip)"
                class="px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer active:scale-95 border"
                :class="(item.note || '').toLowerCase().includes(chip.toLowerCase()) ? 'bg-rose-600 text-white border-rose-600 shadow-2xs' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-rose-300'"
              >
                + {{ chip }}
              </button>
            </div>

            <div class="relative">
              <textarea 
                v-model="item.note" 
                @focus="handleInputFocus" 
                @blur="handleInputBlur"
                :rows="expandedNotes[index] || isSetOrComboItem(item) ? Math.max(item.note ? item.note.split('\n').length + 1 : 2, 4) : 2"
                class="w-full text-[16px] sm:text-xs text-rose-600 dark:text-rose-300 font-bold bg-rose-50/40 dark:bg-rose-950/20 rounded-xl p-2.5 pb-7 border border-rose-200 dark:border-rose-800/60 focus:border-rose-400 focus:bg-rose-50 dark:focus:bg-rose-950/40 outline-none resize-none transition-all placeholder-rose-300 dark:placeholder-rose-500 custom-scrollbar leading-relaxed"
                placeholder="Ghi chú món: cay, không hành, làm chín kĩ, phục vụ trước..."
              ></textarea>
              
              <div class="absolute bottom-2 right-2 z-10 flex gap-1">
                <button 
                  v-if="item.note && item.note.split('\n').length > 2" 
                  @click.prevent="expandedNotes[index] = !expandedNotes[index]" 
                  :aria-label="expandedNotes[index] ? 'Thu gọn ghi chú' : 'Xem thêm ghi chú'"
                  class="px-2 py-1 bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-[9px] font-black rounded-lg uppercase tracking-wider active:scale-95 transition-all shadow-sm cursor-pointer"
                >
                  {{ expandedNotes[index] ? 'Thu gọn' : 'Xem thêm' }}
                </button>
                <button 
                  @click.prevent="expandedItems[index] = false" 
                  aria-label="Đóng ô ghi chú"
                  class="px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-[9px] font-black rounded-lg uppercase tracking-wider active:scale-95 transition-all shadow-sm cursor-pointer"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Add Item Button: 48px height -->
    <button @click="addNewItemAndFocus" class="mt-3.5 w-full bg-primary/10 hover:bg-primary/15 border-2 border-dashed border-primary/30 hover:border-primary text-apex-primary py-3 rounded-xl font-bold text-xs transition-all active:scale-98 uppercase tracking-wider min-h-[46px] flex items-center justify-center gap-2 cursor-pointer shadow-2xs">
      <i class="fa-solid fa-plus text-sm"></i>
      <span>Thêm Món Mới</span>
    </button>

    <!-- STICKY MENU SUMMARY & TAX FOOTER -->
    <div class="mt-4 pt-3.5 border-t border-border-subtle flex flex-wrap items-center justify-between gap-3 px-1">
      <label class="flex items-center cursor-pointer select-none min-h-[40px] group">
        <div class="relative">
          <input type="checkbox" v-model="formStore.taxEnabled" class="sr-only toggle-checkbox">
          <div class="block bg-slate-200 dark:bg-slate-700 group-hover:bg-slate-300 w-10 h-5 rounded-full transition-colors" :class="{'!bg-emerald-500': formStore.taxEnabled}"></div>
          <div class="dot absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full transition-transform duration-200 ease-in-out transform shadow-xs" :class="{'translate-x-5': formStore.taxEnabled}"></div>
        </div>
        <span class="ml-2.5 text-xs font-bold text-text-secondary group-hover:text-text-primary transition-colors">Tính thuế VAT (8% - 10%)</span>
        <span v-if="formStore.taxEnabled" class="ml-2 text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
          +{{ formatVND(formStore.calculatedTotals.tax) }}
        </span>
      </label>

      <div class="flex items-center gap-3 ml-auto text-xs">
        <div class="text-text-secondary font-medium">
          Tạm tính: <strong class="font-mono text-text-primary tabular-nums">{{ formatVND(formStore.calculatedTotals.sub) }}</strong>
        </div>
        <div class="px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/25 font-black text-apex-primary font-mono tabular-nums">
          Tổng: {{ formatVND(formStore.calculatedTotals.final) }}
        </div>
      </div>
    </div>
  </div>
</template>
