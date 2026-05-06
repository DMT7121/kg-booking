const fs = require('fs');

const filePath = 'src/components/modals/MenuManagerModal.vue';
let content = fs.readFileSync(filePath, 'utf-8');

const scriptUpdate = `const originalDishState = ref('')

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
}`;

content = content.replace(/const activeTab = ref\('manage'\) \/\/ 'manage' \| 'add'/, '');
content = content.replace(/function close\(\) \{[\s\S]*?\}/, '');
content = content.replace(/function selectDish\(dish: any\) \{[\s\S]*?\}/, scriptUpdate);
content = content.replace(/selectedDish\.value = null;/g, "selectedDish.value = null;\n  originalDishState.value = '';");

const uploadFunc = `async function handleDishImageUpload(event: Event) {
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
}`;
content = content.replace(/function handleDishImageUpload\(event: Event\) \{[\s\S]*?reader\.readAsDataURL\(file\)\n\}/, uploadFunc);

content = content.replace(/<!-- Tabs -->[\s\S]*?<!-- Scrollable Content Area -->/, '<!-- Scrollable Content Area -->');

const unifiedView = `
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
`;

content = content.replace(/<!-- TAB 1: QUẢN LÝ THỰC ĐƠN -->[\s\S]*?<!-- Right Side: Edit Panel -->/, unifiedView + "\n        <!-- Right Side: Edit Panel -->");

const uploadBoxNew = `
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
`;
content = content.replace(/<!-- Upload Box -->[\s\S]*?<!-- Form Fields -->/, uploadBoxNew + "\n            <!-- Form Fields -->");

content = content.replace(/@click="selectedDish = null"/g, '@click="selectDish(null)"');

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Success');
