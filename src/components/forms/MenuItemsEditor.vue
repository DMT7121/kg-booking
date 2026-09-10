<script setup lang="ts">
import { ref, computed } from 'vue'
import { useUIStore } from '@/stores/useUIStore'
import { useFormStore } from '@/stores/useFormStore'
import { useAppStore } from '@/stores/useAppStore'
import { useForm } from '@/composables/useForm'
import { formatVND } from '@/utils'

const ui = useUIStore()
const formStore = useFormStore()
const appStore = useAppStore()
const { handleInputFocus, handleInputBlur, addNewItem, onSearchInput, selectMenuItem, handleItemBlur, itemSuggestions, fillSampleMenu } = useForm()

const draggedIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)
const expandedNotes = ref<Record<number, boolean>>({})
const expandedItems = ref<Record<number, boolean>>({})

function toggleItemExpand(index: number) {
  expandedItems.value[index] = !expandedItems.value[index]
}

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
      ).slice(0, 15)
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

function handleNameInput(index: number, e: Event) {
  onSearchInput(index)
  const target = e.target as HTMLTextAreaElement
  if (target) {
    target.style.height = 'auto'
    target.style.height = `${Math.max(target.scrollHeight, 36)}px`
  }
}

function onSelectSuggestion(s: any, index: number) {
  selectMenuItem(s, index)
}
</script>

<template>
  <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border p-4 sm:p-5 md:p-6 transition-all duration-300 relative overflow-hidden"
       :class="hasSoftWarning ? 'border-amber-300 dark:border-amber-700/60 bg-amber-50/10' : 'border-slate-100 dark:border-slate-800'">
    <!-- Top Decorative Line -->
    <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500"></div>

    <div class="flex justify-between items-center mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-sm shadow-sm border border-emerald-100 dark:border-emerald-800/40 shrink-0">
          <i class="fa-solid fa-bell-concierge"></i>
        </div>
        <div>
          <h3 class="font-black text-slate-800 dark:text-slate-100 text-xs uppercase tracking-widest flex items-center gap-1.5">
            Danh Sách Món Ăn & Đồ Uống
            <span class="bg-red-500 text-white px-2 py-0.5 rounded-full text-[10px] font-black font-tabular shadow-xs">{{ formStore.items.length }}</span>
          </h3>
          <p class="text-[10px] font-bold text-slate-400 dark:text-slate-500">Chọn từ thực đơn hoặc nhập tự do</p>
        </div>
      </div>
      <button @click="ui.showMenuManager = true" class="text-[10px] bg-slate-50 dark:bg-slate-800 px-3 py-2 rounded-xl text-slate-600 dark:text-slate-300 font-black border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750 active:scale-95 transition-all uppercase tracking-widest flex items-center gap-1.5 cursor-pointer shadow-xs min-h-[36px]">
        <i class="fa-solid fa-book-open text-blue-600 dark:text-blue-400"></i> {{ appStore.activeSheet }}
      </button>
    </div>

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
        <button @click="triggerPasteMenu" class="px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-black rounded-xl uppercase tracking-wider active:scale-95 transition-all shadow-sm min-h-[44px]">
          <i class="fa-solid fa-paste mr-1"></i> Dán menu text
        </button>
        <button @click="triggerUploadMenuImg" class="px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-black rounded-xl uppercase tracking-wider active:scale-95 transition-all shadow-sm min-h-[44px]">
          <i class="fa-solid fa-image mr-1"></i> Tải ảnh menu (AI)
        </button>
        <button @click="useSampleMenu" class="px-4 py-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-300 text-[11px] font-black rounded-xl uppercase tracking-wider active:scale-95 transition-all shadow-sm min-h-[44px]">
          <i class="fa-solid fa-circle-play mr-1"></i> Dùng menu mẫu
        </button>
      </div>
    </div>

    <!-- Items List: Full-width Name with Wrapping + Clear Multi-Line View -->
    <div class="space-y-3.5">
      <div v-for="(item, index) in formStore.items" :key="index" 
           draggable="true"
           @dragstart="onDragStart($event, index)"
           @dragover.prevent="dragOverIndex = index"
           @dragleave="dragOverIndex = null"
           @drop="onDrop($event, index)"
           @dragend="draggedIndex = null; dragOverIndex = null"
           :class="[
             'relative bg-white dark:bg-slate-900 border rounded-2xl p-3 sm:p-4 shadow-sm hover:shadow-md transition-all group',
             draggedIndex === index ? 'opacity-40 scale-[0.98]' : '',
             dragOverIndex === index && draggedIndex !== index ? 'border-t-4 border-t-blue-600 pt-5 scale-[1.02] shadow-lg' : 'border-slate-200 dark:border-slate-800',
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
              <div class="flex flex-col gap-0.5 bg-slate-50 dark:bg-slate-800 rounded-lg p-0.5 text-slate-400 dark:text-slate-500 border border-slate-150 dark:border-slate-700 shrink-0">
                <button @click="swapItem(index, index - 1)" :disabled="index === 0" aria-label="Di chuyển món lên" class="w-6 h-4 flex items-center justify-center hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-20 active:scale-90 transition-transform cursor-pointer">
                  <i class="fa-solid fa-chevron-up text-[9px]"></i>
                </button>
                <button @click="swapItem(index, index + 1)" :disabled="index === formStore.items.length - 1" aria-label="Di chuyển món xuống" class="w-6 h-4 flex items-center justify-center hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-20 active:scale-90 transition-transform cursor-pointer">
                  <i class="fa-solid fa-chevron-down text-[9px]"></i>
                </button>
              </div>
            </div>

            <!-- Full-Width Auto-Wrapping Dish Name Input -->
            <div class="relative flex-grow min-w-0">
              <div class="relative w-full">
                <textarea
                  v-model="item.name"
                  @input="handleNameInput(index, $event)"
                  @blur="handleItemBlur"
                  @focus="handleInputFocus"
                  rows="1"
                  class="w-full font-black text-slate-900 dark:text-slate-100 text-sm md:text-sm border-b-2 border-slate-200 dark:border-slate-700 focus:border-blue-600 dark:focus:border-blue-400 outline-none pb-1.5 pr-8 uppercase placeholder-slate-400 dark:placeholder-slate-500 bg-transparent resize-none leading-snug transition-colors overflow-hidden custom-scrollbar"
                  placeholder="NHẬP HOẶC CHỌN TÊN MÓN..."
                  style="min-height: 36px;"
                ></textarea>
                <button 
                  v-if="item.name" 
                  @click.prevent="clearItemName(index)" 
                  aria-label="Xóa tên món"
                  class="absolute right-0 top-0.5 w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all active:scale-90"
                >
                  <i class="fa-solid fa-circle-xmark text-sm"></i>
                </button>
              </div>

              <!-- Suggestion Dropdown: Generous full width, non-truncated -->
              <div v-if="ui.focusIdx === index" class="absolute top-full left-0 right-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-h-[340px] overflow-hidden z-50 mt-1.5 flex flex-col">
                <!-- Category Tabs inside Dropdown -->
                <div class="flex gap-1.5 p-2 bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800 overflow-x-auto no-scrollbar shrink-0">
                  <button
                    v-for="cat in CATEGORIES"
                    :key="cat.name"
                    @mousedown.prevent="selectedCategory = cat.name"
                    class="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer min-h-[32px] whitespace-nowrap"
                    :class="selectedCategory === cat.name ? 'bg-blue-600 text-white shadow-sm' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'"
                  >
                    {{ cat.name }}
                  </button>
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
                    class="p-2.5 hover:bg-blue-50 dark:hover:bg-slate-800/80 cursor-pointer flex justify-between items-center rounded-xl transition-colors border-b last:border-0 border-slate-100 dark:border-slate-800 min-h-[48px] gap-2"
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

          <!-- Row 2: Stepper, Price & Subtotal, Note Toggle & Delete -->
          <div class="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            <!-- Left Group: Stepper & Price -->
            <div class="flex items-center gap-2.5 flex-wrap">
              <!-- Stepper with >=40px hit targets -->
              <div class="flex items-center bg-slate-50 dark:bg-slate-800/70 rounded-xl border border-slate-200 dark:border-slate-700 p-0.5 shadow-inner">
                <button 
                  @click.prevent="if (item.qty > 1) item.qty--; else formStore.items.splice(index, 1)" 
                  class="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold active:scale-90 transition-transform cursor-pointer select-none shrink-0"
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
                  class="w-9 sm:w-10 text-center font-black border-none bg-transparent text-sm outline-none text-slate-800 dark:text-slate-100 placeholder-slate-400 font-tabular" 
                  placeholder="SL"
                >
                
                <button 
                  @click.prevent="item.qty++" 
                  class="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold active:scale-90 transition-transform cursor-pointer select-none shrink-0"
                  title="Tăng số lượng"
                  aria-label="Tăng số lượng"
                >
                  <i class="fa-solid fa-plus text-xs"></i>
                </button>
              </div>

              <!-- Price Input with currency label -->
              <div class="flex items-center gap-1 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5">
                <span class="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Đơn giá:</span>
                <input 
                  type="text" 
                  inputmode="numeric"
                  :value="formatPriceWithDots(item.price)" 
                  @input="updateItemPrice(index, ($event.target as HTMLInputElement).value)" 
                  @focus="handleInputFocus" 
                  @blur="handleInputBlur" 
                  class="w-20 sm:w-24 text-right font-black text-blue-700 dark:text-blue-300 bg-transparent text-xs sm:text-sm outline-none placeholder-slate-400 font-tabular" 
                  placeholder="0"
                >
                <span class="text-[10px] font-bold text-slate-400">đ</span>
              </div>

              <!-- Line Subtotal Display Badge -->
              <div class="hidden sm:flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200/60 dark:border-emerald-800/40 text-[11px] font-black text-emerald-700 dark:text-emerald-300 font-tabular" title="Thành tiền món này">
                <span class="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">Thành tiền:</span>
                <span>{{ formatVND((item.price || 0) * (item.qty || 1)) }}</span>
              </div>
            </div>

            <!-- Right Group: Note toggle & Delete button -->
            <div class="flex items-center gap-2 ml-auto">
              <!-- Note preview pill / toggle button -->
              <button 
                type="button" 
                @click="toggleItemExpand(index)" 
                class="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all min-h-[40px] max-w-[180px] sm:max-w-[220px] truncate cursor-pointer active:scale-95"
                :class="item.note ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800' : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 border border-slate-200 dark:border-slate-700'"
                aria-label="Ghi chú món ăn"
              >
                <i class="fa-solid fa-pen-to-square text-[10px] shrink-0"></i>
                <span class="truncate">{{ item.note || '+ Ghi chú' }}</span>
              </button>

              <!-- Delete Button with guaranteed touch-target >=44x44px -->
              <button 
                @click="formStore.items.splice(index, 1)" 
                aria-label="Xóa món"
                title="Xóa món này khỏi thực đơn"
                class="w-10 h-10 min-w-[40px] min-h-[40px] bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-800/60 text-rose-500 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 hover:border-rose-300 transition-all rounded-xl flex items-center justify-center active:scale-90 shadow-2xs shrink-0 cursor-pointer"
              >
                <i class="fa-solid fa-trash-can text-sm"></i>
              </button>
            </div>
          </div>

          <!-- Mobile subtotal pill if on narrow screen -->
          <div class="flex sm:hidden justify-end pt-1">
            <span class="text-[11px] font-black text-emerald-700 dark:text-emerald-300 font-tabular bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-0.5 rounded-lg border border-emerald-200/60 dark:border-emerald-800/40">
              Thành tiền: {{ formatVND((item.price || 0) * (item.qty || 1)) }}
            </span>
          </div>

          <!-- Expanded Note Editor (on demand or when note exists) -->
          <div v-if="expandedItems[index] || (item.note && expandedItems[index] !== false)" class="w-full pt-1.5 border-t border-dashed border-slate-150 dark:border-slate-800">
            <div class="relative">
              <textarea 
                v-model="item.note" 
                @focus="handleInputFocus" 
                @blur="handleInputBlur"
                :rows="expandedNotes[index] ? Math.max(item.note ? item.note.split('\n').length + 1 : 1, 4) : 2"
                class="w-full text-xs text-rose-600 dark:text-rose-300 font-bold bg-rose-50/40 dark:bg-rose-950/20 rounded-xl p-2.5 pb-7 border border-rose-200 dark:border-rose-800/60 focus:border-rose-400 focus:bg-rose-50 dark:focus:bg-rose-950/40 outline-none resize-none transition-all placeholder-rose-300 dark:placeholder-rose-500 custom-scrollbar leading-relaxed"
                placeholder="Ghi chú món: cay, không hành, làm chín kĩ, phục vụ trước..."
              ></textarea>
              
              <div class="absolute bottom-2 right-2 z-10 flex gap-1">
                <button 
                  v-if="item.note && item.note.split('\n').length > 2" 
                  @click.prevent="expandedNotes[index] = !expandedNotes[index]" 
                  class="px-2 py-1 bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-[9px] font-black rounded-lg uppercase tracking-wider active:scale-95 transition-all shadow-sm"
                >
                  {{ expandedNotes[index] ? 'Thu gọn' : 'Xem thêm' }}
                </button>
                <button 
                  @click.prevent="expandedItems[index] = false" 
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
    
    <!-- Add Item Button: 50px height -->
    <button @click="addNewItem" class="mt-4 w-full bg-blue-50/70 dark:bg-blue-950/40 border-2 border-dashed border-blue-200 dark:border-blue-800/60 text-blue-700 dark:text-blue-300 py-3.5 rounded-2xl font-black hover:bg-blue-100/60 dark:hover:bg-blue-900/40 hover:border-blue-400 dark:hover:border-blue-700 transition-all active:scale-95 uppercase tracking-widest min-h-[50px] flex items-center justify-center gap-2 cursor-pointer shadow-xs">
      <i class="fa-solid fa-plus text-base"></i> THÊM MÓN
    </button>

    <!-- TAX CONFIG -->
    <div class="mt-5 border-t border-slate-100 dark:border-slate-800 pt-4 flex justify-between items-center px-1">
      <label class="flex items-center cursor-pointer select-none min-h-[44px] group">
        <div class="relative">
          <input type="checkbox" v-model="formStore.taxEnabled" class="sr-only toggle-checkbox">
          <div class="block bg-slate-200 dark:bg-slate-700 group-hover:bg-slate-300 w-11 h-6 rounded-full transition-colors" :class="{'!bg-green-500': formStore.taxEnabled}"></div>
          <div class="dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform duration-300 ease-in-out transform shadow-sm" :class="{'translate-x-5': formStore.taxEnabled}"></div>
        </div>
        <span class="ml-3 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest group-hover:text-slate-700 dark:group-hover:text-slate-300 transition-colors">Bao gồm VAT (8% - 10%)</span>
      </label>
      <div class="text-sm font-black text-blue-900 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 px-3 py-1.5 rounded-lg font-tabular border border-blue-100 dark:border-blue-900/50" v-if="formStore.taxEnabled">{{ formatVND(formStore.calculatedTotals.tax) }}</div>
    </div>
  </div>
</template>
