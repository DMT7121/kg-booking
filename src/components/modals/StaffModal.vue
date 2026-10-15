<script setup lang="ts">
import { ref, reactive, computed, nextTick } from 'vue'
import { useUIStore } from '@/stores/useUIStore'
import { useAppStore } from '@/stores/useAppStore'
import { CACHE_KEYS } from '@/utils/constants'

const ui = useUIStore()
const appStore = useAppStore()

const searchQuery = ref('')
const showStaffForm = ref(false)
const editingStaffIndex = ref<number | null>(null)
const staffNameInputRef = ref<HTMLInputElement | null>(null)

const staffForm = reactive({
  name: '',
  phone: '',
  role: 'Quản lý',
  isActive: true
})

const displayedStaff = computed(() => {
  return appStore.staffList.filter((s: any) => s.isActive !== false)
})

const otherStaff = computed(() => {
  const list = appStore.staffList.filter((s: any) => s.isActive === false)
  if (searchQuery.value) {
    return list.filter((s: any) =>
      s.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      (s.phone || '').includes(searchQuery.value)
    )
  }
  return list
})

async function toggleStaffActive(staff: any) {
  staff.isActive = staff.isActive === false ? true : false
  localStorage.setItem(CACHE_KEYS.STAFF, JSON.stringify(appStore.staffList))
  ui.showToast('Đang đồng bộ trạng thái hiển thị...', 'info')
  await appStore.updateRemoteConfig('staff')
}

function openAddStaffForm(defaultActive = true) {
  editingStaffIndex.value = null
  staffForm.name = ''
  staffForm.phone = ''
  staffForm.role = defaultActive ? 'Quản lý' : 'Nhân viên'
  staffForm.isActive = defaultActive
  showStaffForm.value = true
  nextTick(() => staffNameInputRef.value?.focus())
}

function openEditStaffForm(staff: any) {
  const idx = appStore.staffList.indexOf(staff)
  if (idx === -1) return
  editingStaffIndex.value = idx
  staffForm.name = staff.name || ''
  staffForm.phone = staff.phone || ''
  staffForm.role = staff.role || 'Nhân viên'
  staffForm.isActive = staff.isActive !== false
  showStaffForm.value = true
  nextTick(() => staffNameInputRef.value?.focus())
}

async function handleSubmitStaffForm() {
  const name = staffForm.name.trim()
  const phone = staffForm.phone.trim()
  if (!name || !phone) {
    ui.showToast('Vui lòng nhập đầy đủ Tên và Số điện thoại nhân viên!', 'warning')
    return
  }

  if (editingStaffIndex.value !== null && appStore.staffList[editingStaffIndex.value]) {
    const target = appStore.staffList[editingStaffIndex.value]
    target.name = name
    target.phone = phone
    target.role = staffForm.role.trim() || 'Nhân viên'
    target.isActive = staffForm.isActive
    ui.showToast('Đã cập nhật thông tin nhân viên', 'success')
  } else {
    appStore.staffList.push({
      name,
      phone,
      role: staffForm.role.trim() || 'Nhân viên',
      isActive: staffForm.isActive
    })
    ui.showToast('Đã thêm nhân viên mới', 'success')
  }

  showStaffForm.value = false
  editingStaffIndex.value = null
  localStorage.setItem(CACHE_KEYS.STAFF, JSON.stringify(appStore.staffList))
  await appStore.updateRemoteConfig('staff')
}

async function handleDeleteStaff(staff: any) {
  if (appStore.staffList.length <= 1) {
    ui.showToast('Phải giữ lại ít nhất 1 nhân viên!', 'warning')
    return
  }
  const confirmed = await ui.showConfirm('Xác nhận xóa', `Bạn có chắc chắn muốn xóa nhân viên "${staff.name}"?`)
  if (!confirmed) return

  const idx = appStore.staffList.indexOf(staff)
  if (idx !== -1) {
    appStore.staffList.splice(idx, 1)
    ui.showToast('Đã xóa nhân viên', 'success')
    localStorage.setItem(CACHE_KEYS.STAFF, JSON.stringify(appStore.staffList))
    await appStore.updateRemoteConfig('staff')
  }
}

async function handleSave() {
  localStorage.setItem(CACHE_KEYS.STAFF, JSON.stringify(appStore.staffList))
  ui.showToast('Đang lưu thay đổi cấu hình nhân sự...', 'info')
  await appStore.updateRemoteConfig('staff')
  ui.closeConfig()
}
</script>

<template>
  <div v-if="ui.activeSettingModal === 'staff'" class="flex flex-col h-full bg-slate-50 dark:bg-slate-950 md:bg-white dark:md:bg-slate-900 overflow-hidden w-full relative z-[1000] lg:z-10">
    
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3.5 border-b border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 shadow-xs relative z-20">
      <button @click="ui.closeConfig()" class="w-10 h-10 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors active:scale-95 cursor-pointer">
        <i class="fa-solid fa-arrow-left text-lg"></i>
      </button>
      <div class="text-center flex-1">
        <h2 class="text-base md:text-lg font-black text-slate-900 dark:text-slate-100">Danh sách nhân sự</h2>
        <p class="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-0.5 uppercase tracking-wider">Quản lý & Hiển thị trên phiếu</p>
      </div>
      <button
        @click="openAddStaffForm(true)"
        class="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-[11px] flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-xs"
      >
        <i class="fa-solid fa-plus text-[10px]"></i>
        <span class="hidden sm:inline">Thêm mới</span>
      </button>
    </div>

    <!-- Scrollable Content -->
    <div class="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/70 dark:bg-slate-950/60">
      <div class="p-4 md:p-6 lg:p-8 max-w-2xl mx-auto w-full space-y-6 pb-8">

        <!-- Inline Add / Edit Staff Form -->
        <div v-if="showStaffForm" class="bg-white dark:bg-slate-900 rounded-2xl shadow-md border border-blue-200 dark:border-blue-800/70 p-4 md:p-5 space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-black text-blue-700 dark:text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
              <i :class="['fa-solid', editingStaffIndex !== null ? 'fa-user-pen' : 'fa-user-plus']"></i>
              <span>{{ editingStaffIndex !== null ? 'Chỉnh sửa thông tin nhân viên' : 'Thêm nhân viên mới' }}</span>
            </h3>
            <button @click="showStaffForm = false" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div class="space-y-1">
              <label class="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">Tên nhân viên *</label>
              <input
                ref="staffNameInputRef"
                v-model="staffForm.name"
                type="text"
                placeholder="VD: Nguyễn Văn A"
                class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-100 focus:border-blue-600 outline-none"
                @keydown.enter="handleSubmitStaffForm"
              >
            </div>
            <div class="space-y-1">
              <label class="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">Số điện thoại *</label>
              <input
                v-model="staffForm.phone"
                type="tel"
                placeholder="VD: 0901234567"
                class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-100 focus:border-blue-600 outline-none"
                @keydown.enter="handleSubmitStaffForm"
              >
            </div>
            <div class="space-y-1">
              <label class="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">Chức vụ</label>
              <select
                v-model="staffForm.role"
                class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-100 focus:border-blue-600 outline-none"
              >
                <option value="Quản lý">Quản lý</option>
                <option value="Nhân viên">Nhân viên</option>
                <option value="Lễ tân">Lễ tân</option>
                <option value="CSKH">CSKH</option>
              </select>
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-3 pt-1">
            <label class="flex items-center gap-2 cursor-pointer select-none">
              <input v-model="staffForm.isActive" type="checkbox" class="w-4 h-4 rounded text-blue-600 focus:ring-blue-500">
              <span class="text-xs font-bold text-slate-700 dark:text-slate-300">Hiển thị trực tiếp trên phiếu đặt bàn</span>
            </label>
            <div class="flex items-center gap-2">
              <button
                type="button"
                @click="showStaffForm = false"
                class="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-xs transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                @click="handleSubmitStaffForm"
                class="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs active:scale-95 transition-all cursor-pointer shadow-xs"
              >
                {{ editingStaffIndex !== null ? 'Lưu cập nhật' : 'Thêm nhân viên' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Section: Displayed Staff -->
        <div class="space-y-3">
          <div class="flex justify-between items-center px-1">
            <h4 class="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Hiển thị trên phiếu đặt bàn ({{ displayedStaff.length }})</h4>
          </div>
          
          <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 p-2 space-y-1">
            <div v-for="(s, idx) in displayedStaff" :key="`d-${idx}`" class="flex items-center gap-3 p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors rounded-xl">
              <div class="flex flex-col items-center justify-center text-slate-400 w-5 shrink-0">
                <span class="text-[11px] font-black">{{ idx + 1 }}</span>
              </div>
              
              <div class="flex items-center gap-3 flex-1 min-w-0">
                <img :src="`https://ui-avatars.com/api/?name=${encodeURIComponent(s.name)}&background=e0e7ff&color=1e40af&bold=true`" class="w-10 h-10 rounded-full object-cover border border-slate-100 dark:border-slate-700 shrink-0">
                <div class="min-w-0">
                  <div class="font-black text-xs md:text-[13px] text-slate-900 dark:text-slate-100 truncate">{{ s.name }}</div>
                  <div class="flex items-center gap-2 mt-0.5">
                    <span class="inline-block bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 text-[9px] font-bold px-2 py-0.5 rounded-md">{{ s.role || 'Quản lý' }}</span>
                    <span class="text-[11px] font-mono font-bold text-slate-500 dark:text-slate-400"><i class="fa-solid fa-phone text-[9px] mr-1"></i>{{ s.phone }}</span>
                  </div>
                </div>
              </div>
              
              <div class="flex items-center gap-2 shrink-0">
                <button @click="toggleStaffActive(s)" class="w-11 h-6 rounded-full relative transition-colors shadow-inner cursor-pointer" :class="s.isActive !== false ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'" title="Bật/tắt hiển thị trên phiếu">
                  <div class="w-4 h-4 rounded-full bg-white absolute top-1 transition-all shadow-sm" :class="s.isActive !== false ? 'right-1' : 'left-1'"></div>
                </button>
                <button @click="openEditStaffForm(s)" class="w-8 h-8 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 flex items-center justify-center transition-colors cursor-pointer" title="Sửa nhân viên">
                  <i class="fa-regular fa-pen-to-square text-xs"></i>
                </button>
                <button @click="handleDeleteStaff(s)" class="w-8 h-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center transition-colors cursor-pointer" title="Xóa nhân viên">
                  <i class="fa-regular fa-trash-can text-xs"></i>
                </button>
              </div>
            </div>
            
            <button @click="openAddStaffForm(true)" class="w-full mt-2 py-3 flex items-center justify-center gap-2 border border-dashed border-blue-200 dark:border-blue-800/60 text-blue-600 dark:text-blue-400 bg-blue-50/30 dark:bg-blue-950/20 rounded-xl font-black text-xs hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors active:scale-98 cursor-pointer">
              <i class="fa-solid fa-plus"></i> Thêm nhân viên hiển thị
            </button>
          </div>
        </div>

        <!-- Section: Inactive / Other Staff -->
        <div class="space-y-3">
          <h4 class="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest px-1">Nhân viên dự phòng / Đang ẩn ({{ otherStaff.length }})</h4>
          
          <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 overflow-hidden p-3 space-y-2">
            <div class="relative">
              <input v-model="searchQuery" type="text" class="w-full pl-3.5 pr-9 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-200 text-xs focus:border-blue-600 outline-none transition-all placeholder-slate-400" placeholder="Tìm kiếm nhân viên theo tên hoặc SĐT...">
              <i class="fa-solid fa-magnifying-glass absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
            </div>

            <div v-if="otherStaff.length > 0" class="divide-y divide-slate-100 dark:divide-slate-800">
              <div v-for="(s, idx) in otherStaff" :key="`o-${idx}`" class="flex items-center gap-3 py-2.5 px-2 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors rounded-xl">
                <div class="flex items-center gap-3 flex-1 min-w-0">
                  <img :src="`https://ui-avatars.com/api/?name=${encodeURIComponent(s.name)}&background=f1f5f9&color=64748b&bold=true`" class="w-10 h-10 rounded-full object-cover border border-slate-100 dark:border-slate-700 opacity-80 shrink-0">
                  <div class="min-w-0">
                    <div class="font-black text-xs md:text-[13px] text-slate-800 dark:text-slate-200 truncate">{{ s.name }}</div>
                    <div class="flex items-center gap-2 mt-0.5">
                      <span class="inline-block bg-slate-100 dark:bg-slate-800 text-slate-500 text-[9px] font-bold px-2 py-0.5 rounded-md">{{ s.role || 'Nhân viên' }}</span>
                      <span class="text-[11px] font-mono font-bold text-slate-500"><i class="fa-solid fa-phone text-[9px] mr-1"></i>{{ s.phone }}</span>
                    </div>
                  </div>
                </div>
                
                <div class="flex items-center gap-2 shrink-0">
                  <button @click="toggleStaffActive(s)" class="w-11 h-6 rounded-full relative transition-colors shadow-inner cursor-pointer" :class="s.isActive !== false ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'">
                    <div class="w-4 h-4 rounded-full bg-white absolute top-1 transition-all shadow-sm" :class="s.isActive !== false ? 'right-1' : 'left-1'"></div>
                  </button>
                  <button @click="openEditStaffForm(s)" class="w-8 h-8 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 flex items-center justify-center transition-colors cursor-pointer" title="Sửa nhân viên">
                    <i class="fa-regular fa-pen-to-square text-xs"></i>
                  </button>
                  <button @click="handleDeleteStaff(s)" class="w-8 h-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center transition-colors cursor-pointer" title="Xóa nhân viên">
                    <i class="fa-regular fa-trash-can text-xs"></i>
                  </button>
                </div>
              </div>
            </div>
            
            <button @click="openAddStaffForm(false)" class="w-full py-3 flex items-center justify-center gap-2 border border-dashed border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 bg-slate-50/50 dark:bg-slate-800/30 rounded-xl font-black text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors active:scale-98 cursor-pointer">
              <i class="fa-solid fa-plus"></i> Thêm vào danh sách dự phòng
            </button>
          </div>
        </div>
        
        <!-- Info Note -->
        <div class="bg-blue-50/70 dark:bg-blue-950/30 rounded-2xl p-4 flex items-start gap-3 border border-blue-200/70 dark:border-blue-800/50">
          <i class="fa-solid fa-circle-info text-blue-600 dark:text-blue-400 mt-0.5"></i>
          <div>
            <div class="font-black text-blue-700 dark:text-blue-300 text-xs mb-0.5">Lưu ý hiển thị</div>
            <p class="text-[11px] font-medium text-slate-600 dark:text-slate-400 leading-relaxed">Chỉ các nhân viên đang bật công tắc màu xanh mới xuất hiện trên mẫu phiếu đặt bàn K80 để khách hàng liên hệ.</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Bottom Footer -->
    <div class="p-4 bg-white dark:bg-slate-900 border-t border-slate-200/80 dark:border-slate-800 shrink-0 z-20 flex justify-center">
      <div class="max-w-2xl w-full">
        <button @click="handleSave" class="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-md active:scale-[0.98] transition-all flex justify-center items-center gap-2 cursor-pointer">
          <i class="fa-regular fa-floppy-disk"></i> Lưu & Đồng bộ danh sách nhân sự
        </button>
      </div>
    </div>
  </div>
</template>
