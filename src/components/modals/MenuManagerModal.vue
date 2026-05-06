<script setup lang="ts">
import { ref, computed } from 'vue'
import { useUIStore } from '@/stores/useUIStore'
import { useAppStore } from '@/stores/useAppStore'
import { formatVND } from '@/utils'
import { useForm } from '@/composables/useForm'
import { useAI } from '@/composables/useAI'
import MenuListItem from './MenuListItem.vue'
import MenuGridItem from './MenuGridItem.vue'

const ui = useUIStore()
const appStore = useAppStore()
const { fillSampleMenu, prepareUpdate } = useForm()
const { parseMenuAI } = useAI()

// Tabs


// Manage Tab States
const showAllMenus = ref(false)
const showUploadModal = ref(false)

// Add/Edit Dish States
const viewMode = ref('grid') // 'list' | 'grid'
const selectedCategory = ref('')
const selectedDish = ref<any>(null)

// Mock data for UI presentation
const mockCategories = ['Khai vị', 'Súp', 'Món chính', 'Tráng miệng', 'Đồ uống']

const mockMenus = [
  { id: 1, name: 'Thực đơn tiệc cưới', date: '10/05/2025', count: 25, icon: 'fa-bell-concierge', color: 'text-blue-500', bg: 'bg-blue-50' },
  { id: 2, name: 'Thực đơn tiệc công ty', date: '02/05/2025', count: 18, icon: 'fa-utensils', color: 'text-green-500', bg: 'bg-green-50' },
  { id: 3, name: 'Thực đơn gọi món', date: '15/04/2025', count: 42, icon: 'fa-bowl-food', color: 'text-orange-500', bg: 'bg-orange-50' }
]

// Enhance menuList with mock images and categories
const enhancedMenuList = computed(() => {
  return appStore.menuList.map((item, index) => {
    const cat = mockCategories[index % mockCategories.length]
    return {
      ...item,
      category: cat,
      // Priority: dishImage from store > fallback placeholder
      image: appStore.dishImages[item.cleanName] || `https://picsum.photos/seed/${item.cleanName || index}/200/200`,
      inUse: index % 3 === 0
    }
  })
})



const originalDishState = ref('')

const isDishModified = computed(() => {
  if (!selectedDish.value) return false
  return JSON.stringify(selectedDish.value) !== originalDishState.value
})

async function close() {
  if (isDishModified.value) {
    const confirmed = await ui.showConfirm('Chưa lưu', 'Bạn có thay đổi chưa lưu! Đóng ngay sẽ làm mất dữ liệu. Vẫn đóng?')
    if (confirmed) ui.showMenuManager = false
  } else {
    ui.showMenuManager = false
  }
}

async function selectDish(dish: any) {
  if (isDishModified.value && dish && selectedDish.value && dish.cleanName !== selectedDish.value.cleanName) {
    const confirmed = await ui.showConfirm('Chưa lưu', 'Bạn có thay đổi chưa lưu, chuyển sang món khác sẽ mất dữ liệu. Tiếp tục?')
    if (!confirmed) return
  }
  
  if (dish) {
    selectedDish.value = { ...dish }
    originalDishState.value = JSON.stringify(selectedDish.value)
  } else {
    if (isDishModified.value) {
      const confirmed = await ui.showConfirm('Chưa lưu', 'Bạn có muốn ĐÓNG mà KHÔNG LƯU thay đổi không?')
      if (!confirmed) return
    }
    selectedDish.value = null
    originalDishState.value = ''
  }
}

function cropAndResizeImage(file: File): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const size = 800
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      
      const min = Math.min(img.width, img.height)
      const sx = (img.width - min) / 2
      const sy = (img.height - min) / 2
      
      ctx?.drawImage(img, sx, sy, min, min, 0, 0, size, size)
      resolve(canvas.toDataURL('image/jpeg', 0.8))
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      img.src = e.target?.result as string
    }
    reader.readAsDataURL(file)
  })
}

function openUploadModal() {
  ui.isUpdateMode = false
  appStore.newMenuName = ''
  appStore.newMenuContent = ''
  showUploadModal.value = true
}

function getCategoryColor(category: string) {
  switch (category) {
    case 'Khai vị': return 'text-violet-600 border-violet-200 bg-white'
    case 'Món chính': return 'text-emerald-600 border-emerald-200 bg-white'
    case 'Tráng miệng': return 'text-orange-500 border-orange-200 bg-white'
    case 'Đồ uống': return 'text-blue-600 border-blue-200 bg-white'
    case 'Súp': return 'text-violet-500 border-violet-200 bg-white'
    default: return 'text-slate-600 border-slate-200 bg-white'
  }
}

async function saveSelectedDish() {
  if (!selectedDish.value) return;
  
  // Update local state
  const index = appStore.menuList.findIndex(m => m.cleanName === selectedDish.value.cleanName);
  if (index !== -1) {
    appStore.menuList[index].name = selectedDish.value.name;
    appStore.menuList[index].price = selectedDish.value.price;
  }
  
  // Convert to raw text
  const rawText = appStore.menuList.map(m => `${m.name} - ${m.price}`).join('\n');
  
  // Trigger upload
  appStore.newMenuName = appStore.activeSheet;
  appStore.newMenuContent = rawText;
  ui.isUpdateMode = true;
  
  await appStore.uploadNewMenu();
  selectedDish.value = null;
  originalDishState.value = '';
}

async function deleteSelectedDish() {
  if (!selectedDish.value) return;
  
  const confirmed = await ui.showConfirm('Xóa món', `Bạn có chắc chắn muốn xóa món "${selectedDish.value.name}" khỏi thực đơn?`);
  if (!confirmed) return;

  const index = appStore.menuList.findIndex(m => m.cleanName === selectedDish.value.cleanName);
  if (index !== -1) {
    appStore.menuList.splice(index, 1);
  }
  
  const rawText = appStore.menuList.map(m => `${m.name} - ${m.price}`).join('\n');
  appStore.newMenuName = appStore.activeSheet;
  appStore.newMenuContent = rawText;
  ui.isUpdateMode = true;
  
  await appStore.uploadNewMenu();
  selectedDish.value = null;
  originalDishState.value = '';
}

async function handleParseAI() {
  if (!appStore.newMenuContent) {
    return ui.showToast('Vui lòng nhập/dán văn bản vào ô dưới để AI phân tích!', 'warning')
  }
  appStore.newMenuContent = await parseMenuAI(appStore.newMenuContent)
}

function handleMenuImageUpload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return

  if (file.size > 5 * 1024 * 1024) {
    ui.showToast('Ảnh quá lớn, vui lòng chọn ảnh < 5MB', 'warning')
    return
  }

  const reader = new FileReader()
  reader.onload = async (e) => {
    const base64 = e.target?.result as string
    await appStore.uploadMenuImageStore(base64)
  }
  reader.readAsDataURL(file)
}

async function handleDishImageUpload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return

  if (file.size > 5 * 1024 * 1024) {
    ui.showToast('Ảnh quá lớn, vui lòng chọn ảnh < 5MB', 'warning')
    return
  }

  const base64 = await cropAndResizeImage(file)
  if (selectedDish.value) {
    await appStore.uploadDishImageStore(selectedDish.value.cleanName, base64)
    selectedDish.value.image = appStore.dishImages[selectedDish.value.cleanName]
    originalDishState.value = JSON.stringify(selectedDish.value)
  }
}
</script>

<template>
  <div v-if="ui.activeSettingModal === 'menu'" class="flex flex-col h-full bg-slate-50 md:bg-white overflow-hidden w-full relative z-[1000] lg:z-10">
    
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-white shrink-0 shadow-sm relative z-20">
      <button @click="ui.closeConfig()" class="w-10 h-10 flex items-center justify-center text-blue-900 hover:bg-slate-50 rounded-full transition-colors active:scale-95">
        <i class="fa-solid fa-arrow-left text-xl"></i>
      </button>
      <div class="text-center flex-1">
        <h2 class="text-lg font-black text-blue-900">Cấu hình Thực đơn</h2>
        <p class="text-[10px] font-bold text-slate-400 mt-0.5 uppercase tracking-wider">Quản lý & Cập nhật</p>
      </div>
      <button class="w-10 h-10 flex items-center justify-center text-blue-900 hover:bg-slate-50 rounded-full transition-colors">
        <i class="fa-regular fa-circle-question text-xl"></i>
      </button>
    </div>

    <!-- Scrollable Content Area -->
    <div class="flex-1 overflow-y-auto custom-scrollbar relative z-0">
      
      
      <div class="flex flex-col lg:flex-row h-full max-w-7xl mx-auto w-full relative overflow-hidden">
        
        <!-- Left Side: Menu Selector & Dish List -->
        <div class="flex-1 p-4 md:p-6 flex flex-col h-full bg-slate-50 overflow-hidden">
          
          <!-- Unified Menu Selector & Actions Toolbar -->
          <div class="bg-white rounded-2xl border border-slate-200 p-4 mb-5 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-center relative z-10 shrink-0">
            <div class="flex items-center gap-3 w-full md:w-auto">
              <div class="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-xl shrink-0">
                <i class="fa-solid fa-book-open"></i>
              </div>
              <div class="flex-1 min-w-[200px]">
                <p class="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-0.5">Thực đơn hiện tại</p>
                <select v-model="appStore.activeSheet" @change="appStore.switchMenu(appStore.activeSheet)" class="text-base font-black text-blue-900 bg-transparent outline-none cursor-pointer w-full appearance-none pr-6 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGZpbGw9Im5vbmUiIHZpZXdCb3g9IjAgMCAyNCAyNCIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2U9IiMxZTNhOGEiPjxwYXRoIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIgZD0iTTE5IDlsLTcgNy03LTciLz48L3N2Zz4=')] bg-[length:16px_16px] bg-[right_center] bg-no-repeat">
                  <option v-if="appStore.menuSheets.length === 0" value="">-- Trống --</option>
                  <option v-for="sheet in appStore.menuSheets" :key="sheet" :value="sheet">{{ sheet }}</option>
                </select>
              </div>
            </div>
            
            <div class="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <button v-if="appStore.activeSheet" @click="prepareUpdate(appStore.activeSheet); showUploadModal = true" class="flex-1 md:flex-none px-4 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-bold rounded-xl hover:bg-slate-50 transition-colors flex items-center justify-center gap-2 shadow-sm">
                <i class="fa-solid fa-pen text-blue-500"></i> <span class="hidden sm:inline">Sửa</span>
              </button>
              <button v-if="appStore.activeSheet" @click="appStore.deleteMenu(appStore.activeSheet)" class="flex-1 md:flex-none px-4 py-2 bg-white border border-red-100 text-red-600 text-sm font-bold rounded-xl hover:bg-red-50 transition-colors flex items-center justify-center gap-2 shadow-sm">
                <i class="fa-solid fa-trash-can"></i>
              </button>
              <button @click="openUploadModal" class="flex-1 md:flex-none px-4 py-2 bg-blue-900 text-white text-sm font-bold rounded-xl hover:bg-blue-800 transition-colors flex items-center justify-center gap-2 shadow-md shadow-blue-900/20">
                <i class="fa-solid fa-plus"></i> <span class="hidden sm:inline">Thêm Menu mới</span>
              </button>
            </div>
          </div>

          <!-- Dish List Header & Toolbar -->
          <div class="flex flex-wrap items-center gap-3 mb-5 shrink-0">
            <div class="flex-1 min-w-[200px] relative">
              <i class="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"></i>
              <input type="text" placeholder="Tìm kiếm món ăn..." class="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:outline-none focus:border-blue-500 shadow-sm transition-all">
            </div>
            <div class="flex gap-2 shrink-0">
              <select v-model="selectedCategory" class="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 focus:outline-none focus:border-blue-500 shadow-sm appearance-none pr-8 relative bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGZpbGw9Im5vbmUiIHZpZXdCb3g9IjAgMCAyNCAyNCIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2U9IiM2NDc0OGIiPjxwYXRoIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIgZD0iTTE5IDlsLTcgNy03LTciLz48L3N2Zz4=')] bg-[length:16px_16px] bg-[right_10px_center] bg-no-repeat">
                <option value="">Loại món</option>
                <option v-for="cat in mockCategories" :key="cat" :value="cat">{{ cat }}</option>
              </select>
            </div>
          </div>

          <div class="flex justify-between items-center mb-4 shrink-0">
            <h4 class="text-xs font-black text-slate-500 uppercase tracking-widest">Danh sách món ({{ enhancedMenuList.length }})</h4>
            <div class="flex bg-slate-200 p-1 rounded-xl shadow-inner">
              <button @click="viewMode = 'list'" :class="['px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all', viewMode === 'list' ? 'bg-white shadow-sm text-blue-900' : 'text-slate-500 hover:text-slate-700']">
                <i class="fa-solid fa-list"></i> <span class="hidden sm:inline">Danh sách</span>
              </button>
              <button @click="viewMode = 'grid'" :class="['px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all', viewMode === 'grid' ? 'bg-[#2D4FE0] text-white shadow-md' : 'text-slate-500 hover:text-slate-700']">
                <i class="fa-solid fa-border-all"></i> <span class="hidden sm:inline">Lưới</span>
              </button>
            </div>
          </div>

          <!-- Dish List Content (Scrollable) -->
          <div class="flex-1 overflow-y-auto custom-scrollbar pr-1 pb-32 lg:pb-8">
            <div v-if="enhancedMenuList.length === 0" class="text-center py-12 bg-white rounded-2xl border border-slate-200 border-dashed">
              <i class="fa-solid fa-plate-wheat text-4xl text-slate-200 mb-3"></i>
              <p class="text-slate-500 font-bold text-sm">Chưa có món ăn nào trong thực đơn này</p>
            </div>
            
            <div v-else-if="viewMode === 'grid'" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              <MenuGridItem 
                v-for="dish in enhancedMenuList" 
                :key="dish.name"
                :dish="dish"
                :getCategoryColor="getCategoryColor"
                :isSelected="selectedDish?.name === dish.name"
                @select="selectDish"
              />
            </div>
            
            <div v-else class="space-y-3">
              <MenuListItem 
                v-for="dish in enhancedMenuList" 
                :key="dish.name"
                :dish="dish"
                :getCategoryColor="getCategoryColor"
                :isSelected="selectedDish?.name === dish.name"
                @select="selectDish"
              />
            </div>
          </div>
        </div>

        <!-- Right Side: Edit Panel -->
        <div v-if="selectedDish" class="w-full lg:w-[400px] bg-white shrink-0 flex flex-col h-[75vh] lg:h-full border-t lg:border-t-0 lg:border-l absolute lg:static bottom-0 left-0 right-0 z-50 rounded-t-3xl lg:rounded-none shadow-[0_-20px_50px_-10px_rgba(0,0,0,0.15)] lg:shadow-[-5px_0_15px_rgba(0,0,0,0.03)] transition-transform duration-300">
          
          <div class="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-white rounded-t-3xl lg:rounded-none sticky top-0 z-10 shadow-sm">
            <h3 class="font-black text-slate-700 uppercase text-[13px] tracking-widest flex items-center gap-2">
              <i class="fa-solid fa-pen-to-square text-blue-500"></i> Chỉnh sửa ảnh món
            </h3>
            <button @click="selectDish(null)" class="w-8 h-8 flex lg:hidden items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 rounded-full transition-colors bg-slate-50">
              <i class="fa-solid fa-chevron-down"></i>
            </button>
            <button class="text-xs font-black text-blue-600 hidden lg:flex items-center gap-1.5 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors" @click="selectDish(null)">
              Đóng <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
          
          <div class="p-5 overflow-y-auto custom-scrollbar flex-1 pb-24 lg:pb-5">
            <!-- Large Image Preview -->
            <div class="relative rounded-2xl overflow-hidden bg-slate-100 mb-5 group border border-slate-200 shadow-sm">
              <a :href="selectedDish.image" target="_blank" class="block w-full h-full cursor-zoom-in">
                <img :src="selectedDish.image" alt="dish" class="w-full aspect-square object-cover transition-transform duration-500 group-hover:scale-105">
                <div class="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                  <div class="w-12 h-12 bg-black/50 text-white rounded-full flex items-center justify-center backdrop-blur-md opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100 transition-all shadow-lg">
                    <i class="fa-solid fa-expand text-xl"></i>
                  </div>
                </div>
              </a>
            </div>
            
            
            <!-- Upload Box -->
            <div class="flex gap-3 mb-6">
              <label class="flex-1 border-2 border-dashed border-blue-200 bg-blue-50/50 rounded-2xl p-4 text-center cursor-pointer hover:bg-blue-50 hover:border-blue-400 transition-all group">
                <input type="file" class="hidden" accept="image/*" @change="handleDishImageUpload">
                <div class="w-10 h-10 bg-white rounded-xl shadow-sm text-blue-500 flex items-center justify-center text-lg mx-auto mb-2 group-hover:scale-110 transition-all">
                  <i class="fa-regular fa-image"></i>
                </div>
                <h4 class="font-bold text-blue-700 text-[11px] uppercase tracking-wide">Tải ảnh lên</h4>
              </label>
              
              <label class="flex-1 border-2 border-dashed border-emerald-200 bg-emerald-50/50 rounded-2xl p-4 text-center cursor-pointer hover:bg-emerald-50 hover:border-emerald-400 transition-all group">
                <input type="file" class="hidden" accept="image/*" capture="environment" @change="handleDishImageUpload">
                <div class="w-10 h-10 bg-white rounded-xl shadow-sm text-emerald-500 flex items-center justify-center text-lg mx-auto mb-2 group-hover:scale-110 transition-all">
                  <i class="fa-solid fa-camera"></i>
                </div>
                <h4 class="font-bold text-emerald-700 text-[11px] uppercase tracking-wide">Chụp ảnh (1:1)</h4>
              </label>
            </div>

            <!-- Form Fields -->
            <div class="space-y-4 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
              <div>
                <label class="block text-[11px] font-black text-slate-500 uppercase mb-1.5 tracking-wider">Tên món</label>
                <input v-model="selectedDish.name" type="text" class="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 shadow-sm transition-all">
              </div>
              
              <div>
                <label class="block text-[11px] font-black text-slate-500 uppercase mb-1.5 tracking-wider">Giá</label>
                <div class="relative">
                  <input v-model="selectedDish.price" type="number" class="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 shadow-sm transition-all">
                  <span class="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold bg-slate-100 px-2 py-0.5 rounded text-xs">đ</span>
                </div>
              </div>

              <div>
                <label class="block text-[11px] font-black text-slate-500 uppercase mb-1.5 tracking-wider">Loại món</label>
                <select v-model="selectedDish.category" class="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 appearance-none shadow-sm transition-all pr-10 relative bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGZpbGw9Im5vbmUiIHZpZXdCb3g9IjAgMCAyNCAyNCIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2U9IiM2NDc0OGIiPjxwYXRoIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIgZD0iTTE5IDlsLTcgNy03LTciLz48L3N2Zz4=')] bg-[length:16px_16px] bg-[right_12px_center] bg-no-repeat">
                  <option v-for="cat in mockCategories" :key="cat" :value="cat">{{ cat }}</option>
                </select>
              </div>

              <!-- Current Images list -->
              <div class="pt-2">
                <label class="block text-[11px] font-black text-slate-500 uppercase mb-2 tracking-wider">Ảnh hiện tại</label>
                <div class="flex gap-3 overflow-x-auto pb-2 custom-scrollbar pr-1">
                  <div class="relative w-20 h-20 shrink-0 rounded-xl overflow-hidden border-2 border-blue-500 shadow-md">
                    <img :src="selectedDish.image" class="w-full h-full object-cover">
                    <div class="absolute top-1 right-1 w-5 h-5 bg-blue-500 text-white rounded-full flex items-center justify-center text-[10px] shadow-sm">
                      <i class="fa-solid fa-check"></i>
                    </div>
                  </div>
                  <div class="w-20 h-20 shrink-0 rounded-xl border-2 border-dashed border-slate-200 bg-white flex flex-col items-center justify-center text-slate-400 hover:text-blue-500 hover:border-blue-300 hover:bg-blue-50 transition-all cursor-pointer">
                    <i class="fa-solid fa-plus mb-1"></i>
                    <span class="text-[10px] font-bold uppercase tracking-widest">Thêm ảnh</span>
                  </div>
                </div>
                <p class="text-[10px] text-slate-400 mt-1 italic flex items-center gap-1.5"><i class="fa-solid fa-circle-info"></i> Ảnh đầu tiên sẽ được hiển thị làm ảnh đại diện.</p>
              </div>
            </div>
            
            <!-- Actions -->
            <div class="mt-6 flex gap-3 pb-4 lg:pb-0">
              <button @click="deleteSelectedDish" class="px-4 py-3.5 bg-red-50 text-red-600 rounded-xl text-sm font-black flex items-center justify-center gap-2 hover:bg-red-100 transition-colors shrink-0 border border-red-100">
                <i class="fa-regular fa-trash-can"></i> <span class="hidden sm:inline">Xóa món</span>
              </button>
              <button @click="saveSelectedDish" class="flex-1 py-3.5 bg-blue-900 text-white rounded-xl text-sm font-black shadow-lg shadow-blue-900/20 hover:bg-blue-900 active:scale-95 transition-all uppercase tracking-wider">
                Lưu thay đổi
              </button>
            </div>
          </div>
        </div>

      </div>

    </div>
    
    <!-- Legacy Upload Modal (Overlay on top of MenuManager) -->
    <div v-if="showUploadModal" class="fixed inset-0 bg-blue-950/80 z-[1100] flex justify-center items-center p-4 backdrop-blur-sm" @click.self="showUploadModal = false">
      <div class="bg-white rounded-3xl shadow-2xl p-6 md:p-8 max-w-lg w-[95%] md:w-full flex flex-col relative overflow-hidden border border-white/20">
        <!-- Header -->
        <div class="flex justify-between items-center mb-6 relative z-10">
          <h3 class="text-xl font-black text-blue-900 uppercase tracking-tight flex items-center gap-3">
            <div class="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
              <i class="fa-solid fa-cloud-arrow-up"></i>
            </div>
            {{ ui.isUpdateMode ? 'Cập nhật Menu' : 'Tạo Menu Mới' }}
          </h3>
          <button @click="showUploadModal = false" class="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl hover:bg-red-50 hover:text-red-500 transition-all flex items-center justify-center shrink-0">
            <i class="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>

        <div class="space-y-5 pb-2 relative z-10">
          <div class="space-y-2">
            <label class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Tên Menu</label>
            <input v-model="appStore.newMenuName" class="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-black text-slate-800 text-sm focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none transition-all" :placeholder="ui.isUpdateMode ? 'Tên sheet đang sửa' : 'VD: Menu Tết 2025'">
          </div>
          <div class="space-y-2">
            <div class="flex justify-between items-center">
              <label class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nội dung (Text)</label>
              <div class="flex gap-2">
                <button @click="handleParseAI" class="text-[10px] bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg font-black uppercase hover:bg-indigo-100 active:scale-95 transition-all flex items-center gap-1">
                  <i class="fa-solid fa-wand-magic-sparkles"></i> AI PHÂN TÍCH
                </button>
                <button @click="fillSampleMenu" class="text-[10px] bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg font-black uppercase hover:bg-blue-100 active:scale-95 transition-all">
                  {{ appStore.menuList.length > 0 ? 'LẤY TỪ MENU HIỆN TẠI' : 'TẠO MẪU' }}
                </button>
              </div>
            </div>
            <textarea v-model="appStore.newMenuContent" rows="10" class="w-full p-4 rounded-xl border border-slate-200 bg-slate-50 font-mono text-[13px] leading-relaxed text-slate-800 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none transition-all resize-none custom-scrollbar" placeholder="Dán văn bản lộn xộn vào đây rồi nhấn AI PHÂN TÍCH, hoặc nhập theo mẫu:&#10;Tên món - Giá&#10;VD:&#10;Bò nướng tảng - 250k"></textarea>
          </div>
          <button @click="appStore.uploadNewMenu(); showUploadModal = false" class="w-full h-14 bg-blue-900 text-white rounded-xl font-black text-sm uppercase shadow-lg shadow-blue-900/20 active:scale-95 transition-all flex items-center justify-center gap-2">
            <i class="fa-solid fa-cloud-arrow-up text-lg text-white/80"></i> {{ ui.isUpdateMode ? 'CẬP NHẬT MENU' : 'TẠO MENU MỚI' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Ensure custom scrollbar looks good on webkit */
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #cbd5e1;
  border-radius: 10px;
}
</style>
