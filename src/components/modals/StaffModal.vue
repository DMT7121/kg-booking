<script setup lang="ts">
import { ref, computed } from 'vue'
import { useUIStore } from '@/stores/useUIStore'
import { useAppStore } from '@/stores/useAppStore'

const ui = useUIStore()
const appStore = useAppStore()

const searchQuery = ref('')

const displayedStaff = computed(() => {
  return appStore.staffList.filter((s: any) => s.isActive !== false)
})

const otherStaff = computed(() => {
  const list = appStore.staffList.filter((s: any) => s.isActive === false)
  if (searchQuery.value) {
    return list.filter((s: any) => s.name.toLowerCase().includes(searchQuery.value.toLowerCase()))
  }
  return list
})

function toggleStaffActive(staff: any) {
  staff.isActive = staff.isActive === false ? true : false
}

async function handleAddNewStaff() {
  const name = await ui.showPrompt('Thêm Nhân Viên', 'Nhập Tên nhân viên:')
  if (!name) return
  const phone = await ui.showPrompt('Thêm Nhân Viên', 'Nhập Số điện thoại:')
  if (!phone) return
  appStore.staffList.push({ name, phone, isActive: false, role: 'Nhân viên' })
  ui.showToast('Đã thêm nhân viên mới', 'success')
}

async function handleStaffOptions(staff: any, idx: number) {
  const confirmed = await ui.showConfirm('Tùy chọn', `Xóa nhân viên ${staff.name}?`)
  if (confirmed) {
    appStore.staffList.splice(idx, 1)
  }
}

function handleSave() {
  ui.showToast('Đã lưu thay đổi!', 'success')
  ui.closeConfig()
}
</script>

<template>
  <div v-if="ui.activeSettingModal === 'staff'" class="flex flex-col h-full bg-slate-50 md:bg-white overflow-hidden w-full relative z-[1000] lg:z-10">
    
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-white shrink-0 shadow-sm relative z-20">
      <button @click="ui.closeConfig()" class="w-10 h-10 flex items-center justify-center text-blue-900 hover:bg-slate-50 rounded-full transition-colors active:scale-95">
        <i class="fa-solid fa-arrow-left text-xl"></i>
      </button>
      <div class="text-center flex-1">
        <h2 class="text-lg font-black text-blue-900">Danh sách nhân sự</h2>
        <p class="text-[10px] font-bold text-slate-400 mt-0.5 uppercase tracking-wider">Quản lý & Thiết lập</p>
      </div>
      <button class="w-10 h-10 flex items-center justify-center text-blue-900 hover:bg-slate-50 rounded-full transition-colors">
        <i class="fa-regular fa-circle-question text-xl"></i>
      </button>
    </div>

    <!-- Scrollable Content -->
    <div class="flex-1 overflow-y-auto custom-scrollbar bg-slate-50 md:bg-white">
      <div class="text-center px-6 mt-6 mb-4 max-w-sm mx-auto">
        <p class="text-[13px] font-bold text-slate-500 leading-relaxed">Danh sách nhân viên sẽ hiển thị trên phiếu đặt bàn để khách hàng liên hệ khi cần.</p>
      </div>

      <div class="p-4 md:p-6 lg:p-8 max-w-2xl mx-auto w-full space-y-8 pb-32">
      <!-- Section: Displayed Staff -->
      <div class="space-y-4">
        <div class="flex justify-between items-center pl-2">
          <h4 class="text-[11px] font-black text-slate-400 uppercase tracking-widest">Hiển thị trên phiếu đặt bàn</h4>
          <span class="text-[11px] font-black text-blue-600 cursor-pointer hover:text-blue-700">Sắp xếp</span>
        </div>
        
        <div class="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden divide-y divide-slate-50 p-2 space-y-2">
          
          <!-- Staff Item -->
          <div v-for="(s, idx) in displayedStaff" :key="`d-${idx}`" class="flex items-center gap-3 p-2 hover:bg-slate-50 transition-colors rounded-2xl">
            <!-- Drag handle -->
            <div class="flex flex-col items-center justify-center text-slate-300 w-6">
              <i class="fa-solid fa-grip-vertical text-xs"></i>
              <span class="text-[10px] font-black mt-1">{{ idx + 1 }}</span>
            </div>
            
            <!-- Avatar & Info -->
            <div class="flex items-center gap-3 flex-1">
              <img :src="`https://ui-avatars.com/api/?name=${encodeURIComponent(s.name)}&background=e0e7ff&color=1e40af&bold=true`" class="w-12 h-12 rounded-full object-cover border border-slate-100">
              <div>
                <div class="font-black text-[13px] text-blue-900 mb-0.5">{{ s.name }}</div>
                <div class="inline-block bg-blue-50 text-blue-600 text-[9px] font-bold px-2 py-0.5 rounded-md">{{ s.role || 'Quản lý' }}</div>
              </div>
            </div>
            
            <!-- Contact Info -->
            <div class="text-[10px] font-bold text-slate-500 space-y-1.5 hidden sm:block">
              <div class="flex items-center gap-2"><i class="fa-solid fa-phone text-slate-400"></i> {{ s.phone }}</div>
              <div class="flex items-center gap-2"><i class="fa-brands fa-rocketchat text-slate-400"></i> {{ s.phone }}</div>
            </div>
            
            <!-- Controls -->
            <div class="flex items-center gap-3">
              <!-- Mobile Contact Info (Icon only) -->
              <div class="flex flex-col gap-1 sm:hidden">
                <i class="fa-solid fa-phone text-slate-300 text-xs"></i>
              </div>
              
              <button @click="toggleStaffActive(s)" class="w-12 h-7 rounded-full relative transition-colors shadow-inner" :class="s.isActive !== false ? 'bg-blue-600' : 'bg-slate-200'">
                <div class="w-5 h-5 rounded-full bg-white absolute top-1 transition-all shadow-sm" :class="s.isActive !== false ? 'right-1' : 'left-1'"></div>
              </button>
              <button @click="handleStaffOptions(s, appStore.staffList.indexOf(s))" class="text-slate-300 hover:text-slate-600 p-1 w-6 text-center"><i class="fa-solid fa-ellipsis-vertical"></i></button>
            </div>
          </div>
          
          <button @click="handleAddNewStaff" class="w-full mt-2 py-4 flex items-center justify-center gap-2 border border-dashed border-blue-200 text-blue-600 bg-blue-50/30 rounded-2xl font-black text-xs hover:bg-blue-50 transition-colors active:scale-95">
            <i class="fa-solid fa-plus"></i> Thêm nhân viên hiển thị
          </button>
        </div>
      </div>

      <!-- Section: All Staff -->
      <div class="space-y-4">
        <h4 class="text-[11px] font-black text-slate-400 uppercase tracking-widest pl-2">Tất cả nhân viên</h4>
        
        <div class="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden p-2">
          
          <!-- Search -->
          <div class="px-2 pt-2 pb-4">
            <div class="relative">
              <input v-model="searchQuery" type="text" class="w-full pl-4 pr-10 py-3 rounded-xl border border-slate-100 bg-slate-50 font-bold text-slate-700 text-xs focus:border-blue-900 focus:bg-white outline-none transition-all placeholder-slate-400" placeholder="Tìm kiếm nhân viên...">
              <i class="fa-solid fa-magnifying-glass absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
            </div>
          </div>

          <div class="space-y-2">
            <!-- Inactive Staff Item -->
            <div v-for="(s, idx) in otherStaff" :key="`o-${idx}`" class="flex items-center gap-3 p-2 hover:bg-slate-50 transition-colors rounded-2xl">
              
              <!-- Avatar & Info -->
              <div class="flex items-center gap-3 flex-1 pl-2">
                <img :src="`https://ui-avatars.com/api/?name=${encodeURIComponent(s.name)}&background=f1f5f9&color=64748b&bold=true`" class="w-12 h-12 rounded-full object-cover border border-slate-100 opacity-80">
                <div>
                  <div class="font-black text-[13px] text-blue-900 mb-0.5">{{ s.name }}</div>
                  <div class="inline-block bg-slate-100 text-slate-500 text-[9px] font-bold px-2 py-0.5 rounded-md">{{ s.role || 'Nhân viên' }}</div>
                </div>
              </div>
              
              <!-- Contact Info -->
              <div class="text-[10px] font-bold text-slate-500 space-y-1.5 hidden sm:block opacity-70">
                <div class="flex items-center gap-2"><i class="fa-solid fa-phone text-slate-400"></i> {{ s.phone }}</div>
                <div class="flex items-center gap-2"><i class="fa-brands fa-rocketchat text-slate-400"></i> {{ s.phone }}</div>
              </div>
              
              <!-- Controls -->
              <div class="flex items-center gap-3">
                <!-- Mobile Contact Info (Icon only) -->
                <div class="flex flex-col gap-1 sm:hidden">
                  <i class="fa-solid fa-phone text-slate-300 text-xs"></i>
                </div>
                
                <button @click="toggleStaffActive(s)" class="w-12 h-7 rounded-full relative transition-colors shadow-inner" :class="s.isActive !== false ? 'bg-blue-600' : 'bg-slate-200'">
                  <div class="w-5 h-5 rounded-full bg-white absolute top-1 transition-all shadow-sm" :class="s.isActive !== false ? 'right-1' : 'left-1'"></div>
                </button>
                <button @click="handleStaffOptions(s, appStore.staffList.indexOf(s))" class="text-slate-300 hover:text-slate-600 p-1 w-6 text-center"><i class="fa-solid fa-ellipsis-vertical"></i></button>
              </div>
            </div>
          </div>
          
          <button @click="handleAddNewStaff" class="w-full mt-2 py-4 flex items-center justify-center gap-2 border border-dashed border-blue-200 text-blue-600 bg-blue-50/30 rounded-2xl font-black text-xs hover:bg-blue-50 transition-colors active:scale-95">
            <i class="fa-solid fa-plus"></i> Thêm nhân viên mới
          </button>
        </div>
      </div>
      
      <!-- Info Note -->
      <div class="bg-[#F0F5FF] rounded-2xl p-4 flex items-start gap-3 border border-[#E0EBFF]">
        <i class="fa-solid fa-circle-info text-blue-600 mt-0.5"></i>
        <div>
          <div class="font-black text-blue-600 text-xs mb-1">Lưu ý</div>
          <p class="text-[11px] font-bold text-slate-500 leading-relaxed">Chỉ các nhân viên được bật hiển thị mới xuất hiện trên phiếu đặt bàn và khách hàng có thể liên hệ.</p>
        </div>
      </div>
    </div>

    </div>

    <!-- Fixed Bottom Footer -->
    <div class="fixed bottom-0 left-0 right-0 p-4 md:p-6 bg-slate-50 border-t border-slate-200 z-20 flex justify-center">
      <div class="max-w-2xl w-full">
        <button @click="handleSave" class="w-full py-4 bg-blue-950 text-white rounded-2xl font-black text-[13px] shadow-lg shadow-blue-900/20 hover:bg-blue-900 active:scale-[0.98] transition-all flex justify-center items-center gap-2">
          <i class="fa-regular fa-floppy-disk"></i> Lưu thay đổi
        </button>
      </div>
    </div>
  </div>
</template>
