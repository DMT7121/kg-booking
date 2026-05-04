<script setup lang="ts">
import { ref } from 'vue'
import { useUIStore } from '@/stores/useUIStore'
import { useAppStore } from '@/stores/useAppStore'
import { BANKS, CACHE_KEYS } from '@/utils/constants'

const ui = useUIStore()
const appStore = useAppStore()

const isEditing = ref(false)
const editIndex = ref(-1)

// Initialize form
function resetForm() {
  appStore.newBank = {
    bankId: '',
    name: '',
    number: '',
    owner: ''
  }
  isEditing.value = false
  editIndex.value = -1
}

function updateNewBankName() {
  const b = BANKS.find(x => x.bin === appStore.newBank.bankId)
  if (b) appStore.newBank.name = b.shortName
}

function saveBank() {
  if (!appStore.newBank.bankId || !appStore.newBank.number || !appStore.newBank.owner) {
    ui.showAlert('Lỗi', 'Vui lòng điền đầy đủ thông tin bắt buộc.')
    return
  }
  if (isEditing.value && editIndex.value >= 0) {
    appStore.bankList[editIndex.value] = { ...appStore.newBank }
    localStorage.setItem(CACHE_KEYS.BANK, JSON.stringify(appStore.bankList))
  } else {
    appStore.addBank()
  }
  appStore.updateRemoteConfig()
  resetForm()
}

function editBank(idx: number) {
  const bank = appStore.bankList[idx]
  appStore.newBank = { ...bank }
  isEditing.value = true
  editIndex.value = idx
}

function deleteBank(idx: number) {
  ui.showConfirm('Xóa ngân hàng', 'Bạn có chắc chắn muốn xóa tài khoản ngân hàng này?').then(yes => {
    if (yes) appStore.removeBank(idx)
  })
}

// Generate simple colors based on bin to mimic logos
function getBankLogoColor(bin: string) {
  if (!bin) return 'text-slate-400 bg-slate-50'
  const num = parseInt(bin.substring(bin.length - 2))
  const colors = [
    'text-emerald-500 bg-emerald-50',
    'text-blue-500 bg-blue-50',
    'text-rose-500 bg-rose-50',
    'text-amber-500 bg-amber-50',
    'text-purple-500 bg-purple-50',
    'text-cyan-500 bg-cyan-50'
  ]
  return colors[num % colors.length]
}
</script>

<template>
  <div v-if="ui.showBankConfig" class="fixed inset-0 bg-slate-50 md:bg-white z-[12000] flex flex-col overflow-hidden">
    
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-white shrink-0 shadow-sm relative z-20">
      <button @click="ui.showBankConfig = false" class="w-10 h-10 flex items-center justify-center text-blue-900 hover:bg-slate-50 rounded-full transition-colors active:scale-95">
        <i class="fa-solid fa-arrow-left text-xl"></i>
      </button>
      <div class="text-center flex-1">
        <h2 class="text-lg font-black text-blue-900">Quản lý ngân hàng</h2>
        <p class="text-[10px] font-bold text-slate-400 mt-0.5 uppercase tracking-wider">Tài khoản & Thanh toán</p>
      </div>
      <button class="w-10 h-10 flex items-center justify-center text-blue-900 hover:bg-slate-50 rounded-full transition-colors">
        <i class="fa-regular fa-circle-question text-xl"></i>
      </button>
    </div>

    <!-- Scrollable Content -->
    <div class="flex-1 overflow-y-auto custom-scrollbar bg-slate-50 md:bg-white">
      <div class="p-4 md:p-6 lg:p-8 max-w-2xl mx-auto space-y-6 md:space-y-8">
        
        <!-- Subtitle -->
        <p class="text-center text-[13px] text-slate-500 font-bold px-4 leading-relaxed max-w-sm mx-auto">
          Quản lý thông tin tài khoản ngân hàng để nhận tiền đặt cọc và in lên phiếu đặt bàn.
        </p>

        <!-- List Section -->
        <div>
          <div class="flex justify-between items-center mb-4">
            <h4 class="text-xs font-black text-slate-500 uppercase tracking-widest">Danh sách ngân hàng</h4>
            <button @click="resetForm" class="px-3 py-1.5 border border-blue-200 text-blue-600 rounded-lg text-[13px] font-bold flex items-center gap-1.5 hover:bg-blue-50 transition-all active:scale-95 bg-white shadow-sm">
              <i class="fa-solid fa-plus"></i> Thêm ngân hàng
            </button>
          </div>
          
          <div class="space-y-3">
            <div v-for="(b, idx) in appStore.bankList" :key="idx"
                 class="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 hover:border-blue-200 transition-colors group">
              
              <div class="w-12 h-12 rounded-full flex items-center justify-center shrink-0 overflow-hidden bg-white border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-2 relative group-hover:border-blue-200 transition-colors">
                 <img :src="`https://api.vietqr.io/img/${b.bankId}.png`" @error="$event.target.style.display='none'; $event.target.nextElementSibling.style.display='block'" class="w-full h-full object-contain" :alt="b.name">
                 <i class="fa-solid fa-building-columns text-slate-300 hidden text-lg"></i>
              </div>
              
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-0.5">
                  <h5 class="font-black text-blue-900 text-[15px] truncate">{{ b.name }}</h5>
                  <span v-if="idx === appStore.selectedBankIndex" class="bg-blue-100 text-blue-600 text-[10px] font-black uppercase px-2 py-0.5 rounded tracking-wider shrink-0 border border-blue-200">Mặc định</span>
                </div>
                <div class="font-bold text-slate-800 text-[15px] tracking-wide mb-1">{{ b.number }}</div>
                <div class="text-[11px] font-bold text-slate-400 uppercase">Chủ tài khoản: <span class="font-black text-slate-600">{{ b.owner }}</span></div>
              </div>
              
              <div class="flex items-center gap-2 shrink-0">
                <button @click.stop="editBank(idx)" class="w-9 h-9 rounded-xl border border-blue-100 text-blue-500 flex items-center justify-center hover:bg-blue-50 transition-colors active:scale-95">
                  <i class="fa-regular fa-pen-to-square"></i>
                </button>
                <button @click.stop="deleteBank(idx)" class="w-9 h-9 rounded-xl border border-rose-100 text-rose-500 flex items-center justify-center hover:bg-rose-50 transition-colors active:scale-95">
                  <i class="fa-regular fa-trash-can"></i>
                </button>
              </div>
            </div>

            <div v-if="appStore.bankList.length === 0" class="text-center py-10 bg-white rounded-2xl border border-slate-200 border-dashed">
              <i class="fa-solid fa-building-columns text-4xl text-slate-200 mb-3"></i>
              <p class="text-slate-500 font-bold text-sm">Chưa có ngân hàng nào</p>
            </div>
          </div>
        </div>

        <!-- Form Section -->
        <div class="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden" id="bank-form">
          <div class="absolute top-0 left-0 w-1.5 h-full bg-blue-900 rounded-l-3xl"></div>
          
          <h4 class="text-xs font-black text-slate-500 uppercase tracking-widest mb-5 ml-2">{{ isEditing ? 'Chỉnh sửa ngân hàng' : 'Thêm ngân hàng' }}</h4>
          
          <div class="space-y-4 ml-2">
            <div>
              <label class="block text-xs font-bold text-slate-600 mb-1.5">Ngân hàng <span class="text-rose-500">*</span></label>
              <select v-model="appStore.newBank.bankId" @change="updateNewBankName" class="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 shadow-sm appearance-none pr-10 relative bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGZpbGw9Im5vbmUiIHZpZXdCb3g9IjAgMCAyNCAyNCIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2U9IiM2NDc0OGIiPjxwYXRoIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIgZD0iTTE5IDlsLTcgNy03LTciLz48L3N2Zz4=')] bg-[length:16px_16px] bg-[right_12px_center] bg-no-repeat transition-all">
                <option value="" disabled selected class="text-slate-400">Chọn ngân hàng</option>
                <option v-for="bank in BANKS" :key="bank.bin" :value="bank.bin">{{ bank.shortName }} ({{ bank.name }})</option>
              </select>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-600 mb-1.5">Số tài khoản <span class="text-rose-500">*</span></label>
              <input v-model="appStore.newBank.number" type="text" placeholder="Nhập số tài khoản" class="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 shadow-sm transition-all placeholder-slate-400">
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-600 mb-1.5">Chủ tài khoản <span class="text-rose-500">*</span></label>
              <input v-model="appStore.newBank.owner" type="text" placeholder="Nhập chủ tài khoản" class="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold uppercase text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 shadow-sm transition-all placeholder-slate-400">
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-600 mb-1.5">Nội dung hiển thị (tùy chọn)</label>
              <input type="text" placeholder="VD: King's Grill - Đặt cọc" class="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 shadow-sm transition-all placeholder-slate-400">
            </div>

            <!-- Checkbox Default -->
            <div v-if="!isEditing || editIndex !== appStore.selectedBankIndex" class="flex items-center gap-2 pt-2">
              <input type="checkbox" id="defaultBank" :checked="isEditing && editIndex === appStore.selectedBankIndex" @change="appStore.selectedBankIndex = (isEditing ? editIndex : appStore.bankList.length)" class="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 cursor-pointer">
              <label for="defaultBank" class="text-[13px] font-bold text-blue-600 cursor-pointer flex items-center gap-1.5 select-none">
                <span class="w-5 h-5 bg-blue-600 text-white flex items-center justify-center rounded-[4px] text-[10px]">
                  <i class="fa-solid fa-check"></i>
                </span>
                Đặt làm tài khoản mặc định
                <i class="fa-regular fa-circle-question text-slate-400"></i>
              </label>
            </div>
            
            <!-- Actions -->
            <div class="flex gap-3 pt-4">
              <button @click="resetForm" class="flex-1 py-3.5 bg-slate-100 text-slate-600 rounded-xl text-[15px] font-black active:scale-95 transition-all hover:bg-slate-200">
                Hủy
              </button>
              <button @click="saveBank" class="flex-[2] py-3.5 bg-blue-950 text-white rounded-xl text-[15px] font-black shadow-lg shadow-blue-900/20 hover:bg-blue-900 active:scale-95 transition-all">
                Lưu ngân hàng
              </button>
            </div>
          </div>
        </div>
        
        <!-- Notice -->
        <div class="bg-blue-50 border border-blue-100 rounded-xl p-4 mt-4">
          <div class="flex items-center gap-2 mb-1">
            <i class="fa-solid fa-circle-info text-blue-600"></i>
            <span class="font-black text-blue-800 text-sm">Lưu ý</span>
          </div>
          <p class="text-[13px] text-slate-600 font-medium leading-relaxed mt-1">
            Tài khoản mặc định sẽ được hiển thị đầu tiên khi tạo phiếu đặt bàn.
          </p>
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
/* Custom Checkbox styles hidden to match design if needed, but native works */
</style>
