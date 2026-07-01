<script setup lang="ts">
import { ref, onUnmounted, watch } from 'vue'
import { useUIStore } from '@/stores/useUIStore'
import { useConfigStore } from '@/stores/useConfigStore'
import { useAppStore } from '@/stores/useAppStore'
import { PLATFORMS, AI_MODELS } from '@/utils/constants'
import { getActiveCooldowns, clearAllCooldowns } from '@/services/ai/circuitBreaker'

const ui = useUIStore()
const configStore = useConfigStore()
const appStore = useAppStore()

const newAliasText = ref('')
const selectedAliasDish = ref('')
const vaultPassword = ref('')

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text)
  ui.showToast('Đã copy API Key', 'success')
}

async function initVault(mode: 'device' | 'passphrase') {
  if (mode === 'device') {
    try {
      await configStore.initializeVault('device')
    } catch (e: any) {
      ui.showToast(e.message, 'error')
    }
  } else {
    const pin = await ui.showPrompt('Thiết lập Passphrase', 'Nhập mã PIN hoặc Passphrase để bảo vệ két sắt (tối thiểu 4 ký tự):')
    if (pin && pin.trim().length >= 4) {
      try {
        await configStore.initializeVault('passphrase', pin.trim())
      } catch (e: any) {
        ui.showToast(e.message, 'error')
      }
    } else if (pin) {
      ui.showToast('Mật khẩu quá ngắn (tối thiểu 4 ký tự)', 'warning')
    }
  }
}

async function unlockVault() {
  if (configStore.vaultUnlockMode === 'device') {
    try {
      await configStore.unlockVault()
    } catch (e: any) {
      ui.showToast(e.message, 'error')
    }
  } else {
    if (!vaultPassword.value) {
      ui.showToast('Vui lòng nhập mật khẩu mở khóa', 'warning')
      return
    }
    try {
      await configStore.unlockVault(vaultPassword.value)
      vaultPassword.value = ''
    } catch (e: any) {
      ui.showToast(e.message, 'error')
    }
  }
}

async function handlePlatformOptions(pId: string) {
  if (pId === 'pollinations') {
    ui.showToast('Pollinations là miễn phí, không cần key!', 'info')
    return
  }
  if (!configStore.isVaultUnlocked) {
    ui.showToast('Vui lòng mở khóa két sắt bảo mật trước!', 'warning')
    return
  }
  const isAdmin = await appStore.verifyAdminSession()
  if (!isAdmin) return

  const newKey = await ui.showPrompt(`Thêm API Key`, `Dán API Key cho ${PLATFORMS[pId].name} vào đây:`)
  if (newKey) {
    configStore.tempKeys[pId] = newKey.trim()
    await configStore.saveApiKey(pId)
  }
}

async function handleKeyClick(pId: string, idx: number) {
  if (!configStore.isVaultUnlocked) {
    ui.showToast('Vui lòng mở khóa két sắt để xóa key!', 'warning')
    return
  }
  const isAdmin = await appStore.verifyAdminSession()
  if (!isAdmin) return

  const confirmed = await ui.showConfirm('Xóa Key', 'Bạn có chắc chắn muốn XÓA API key này?')
  if (confirmed) {
    await configStore.deleteApiKey(pId, idx)
  }
}

async function handleTextModelChange(e: Event) {
  const target = e.target as HTMLSelectElement
  const val = target.value
  const isAdmin = await appStore.verifyAdminSession()
  if (isAdmin) {
    configStore.defaults.text = val
    ui.showToast('Đã cập nhật mô hình LLM', 'success')
  } else {
    target.value = configStore.defaults.text
  }
}

async function handleVisionModelChange(e: Event) {
  const target = e.target as HTMLSelectElement
  const val = target.value
  const isAdmin = await appStore.verifyAdminSession()
  if (isAdmin) {
    configStore.defaults.vision = val
    ui.showToast('Đã cập nhật mô hình Vision', 'success')
  } else {
    target.value = configStore.defaults.vision
  }
}

async function handleWorkflowModeChange(e: Event) {
  const target = e.target as HTMLSelectElement
  const val = target.value
  const isAdmin = await appStore.verifyAdminSession()
  if (isAdmin) {
    configStore.defaults.aiWorkflowMode = val
    ui.showToast(`Đã cập nhật quy trình AI thành: ${val === 'direct' ? 'Điền trực tiếp' : 'Xem lại trước khi điền'}`, 'success')
  } else {
    target.value = configStore.defaults.aiWorkflowMode
  }
}

async function handleBorrowKeys() {
  if (!configStore.isVaultUnlocked) {
    ui.showToast('Vui lòng mở khóa két sắt trước khi tải keys!', 'warning')
    return
  }
  const pass = await ui.showPrompt('Nhập mật khẩu Admin', 'Nhập mật khẩu để tải API Key từ Cloud:')
  if (pass) {
    await configStore.borrowKeys(pass)
  }
}

async function handleAddAlias() {
  if (!newAliasText.value.trim() || !selectedAliasDish.value) {
    ui.showToast('Vui lòng nhập từ viết tắt và chọn món ăn!', 'warning')
    return
  }
  const isAdmin = await appStore.verifyAdminSession()
  if (!isAdmin) return

  const alias = newAliasText.value.trim().toLowerCase()
  const dishName = selectedAliasDish.value

  ui.loading.is = true
  ui.loading.msg = 'ĐANG LƯU TỪ VIẾT TẮT...'
  try {
    const res = await appStore.saveAlias(alias, dishName)
    if (res.ok) {
      newAliasText.value = ''
      selectedAliasDish.value = ''
    }
  } finally {
    ui.loading.is = false
  }
}

async function handleDeleteAlias(alias: string) {
  const confirmed = await ui.showConfirm('Xóa từ viết tắt', `Bạn có chắc muốn xóa từ viết tắt "${alias}"?`)
  if (!confirmed) return

  const isAdmin = await appStore.verifyAdminSession()
  if (!isAdmin) return

  ui.loading.is = true
  ui.loading.msg = 'ĐANG XÓA TỪ VIẾT TẮT...'
  try {
    await appStore.deleteAlias(alias)
  } finally {
    ui.loading.is = false
  }
}

const cooldownList = ref<any[]>([])

function updateCooldowns() {
  cooldownList.value = getActiveCooldowns()
}

let cooldownInterval: any = null
watch(() => ui.activeSettingModal, (newVal) => {
  if (newVal === 'ai') {
    updateCooldowns()
    if (!cooldownInterval) {
      cooldownInterval = setInterval(updateCooldowns, 1000)
    }
  } else {
    if (cooldownInterval) {
      clearInterval(cooldownInterval)
      cooldownInterval = null
    }
  }
}, { immediate: true })

onUnmounted(() => {
  if (cooldownInterval) clearInterval(cooldownInterval)
})

function getModelName(modelId: string) {
  const model = AI_MODELS.find(m => m.id === modelId)
  return model ? model.name : modelId
}

function handleClearCooldowns() {
  clearAllCooldowns()
  updateCooldowns()
  ui.showToast('Đã kích hoạt lại toàn bộ các mô hình!', 'success')
}
</script>

<template>
  <div v-if="ui.activeSettingModal === 'ai'" class="flex flex-col h-full bg-slate-50 md:bg-white overflow-hidden w-full relative z-[1000] lg:z-10">
    
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-white shrink-0 shadow-sm relative z-20">
      <button @click="ui.closeConfig()" class="w-10 h-10 flex items-center justify-center text-blue-900 hover:bg-slate-50 rounded-full transition-colors active:scale-95">
        <i class="fa-solid fa-arrow-left text-xl"></i>
      </button>
      <div class="text-center flex-1">
        <h2 class="text-lg font-black text-blue-900">Cấu hình AI</h2>
        <p class="text-[10px] font-bold text-slate-400 mt-0.5 uppercase tracking-wider">Quản lý & Thiết lập</p>
      </div>
      <button class="w-10 h-10 flex items-center justify-center text-blue-900 hover:bg-slate-50 rounded-full transition-colors">
        <i class="fa-regular fa-circle-question text-xl"></i>
      </button>
    </div>

    <!-- Scrollable Content -->
    <div class="flex-1 overflow-y-auto custom-scrollbar bg-slate-50 md:bg-white">
      <div class="text-center px-6 py-6 pb-2">
        <p class="text-xs font-bold text-slate-500 leading-relaxed">Thiết lập và quản lý các mô hình AI giúp bạn phân tích<br>thực đơn và gợi ý số bàn thông minh.</p>
      </div>

      <!-- Key Vault Security Card -->
      <div class="space-y-3">
        <h4 class="text-[11px] font-black text-slate-400 uppercase tracking-widest pl-2 flex items-center gap-1.5">
          <i class="fa-solid fa-vault text-blue-900"></i> Két sắt bảo mật (Local Vault)
        </h4>
        <div class="bg-white rounded-3xl shadow-sm border border-slate-100 p-4 space-y-4">
          <!-- Uninitialized state -->
          <div v-if="!configStore.isVaultInitialized" class="space-y-3">
            <div class="bg-blue-50 border border-blue-200 rounded-2xl p-3 text-[11px] font-bold text-blue-800 leading-relaxed">
              <i class="fa-solid fa-circle-info"></i> Hệ thống đã nâng cấp lên két sắt cục bộ mã hóa. Vui lòng thiết lập két sắt để lưu trữ API key của bạn.
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button @click="initVault('device')" class="p-3 bg-slate-50 border border-slate-200 hover:border-blue-900 rounded-2xl text-left transition-all active:scale-95">
                <div class="text-xs font-black text-slate-800"><i class="fa-solid fa-mobile-screen-button"></i> Device Local</div>
                <div class="text-[10px] text-slate-500 mt-1 font-semibold leading-relaxed">Mở khóa tự động. Khóa ngẫu nhiên lưu trong trình duyệt.</div>
              </button>
              <button @click="initVault('passphrase')" class="p-3 bg-slate-50 border border-slate-200 hover:border-blue-900 rounded-2xl text-left transition-all active:scale-95">
                <div class="text-xs font-black text-slate-800"><i class="fa-solid fa-key"></i> PIN / Passphrase</div>
                <div class="text-[10px] text-slate-500 mt-1 font-semibold leading-relaxed">Mã hóa bằng mật khẩu. Nhập mật khẩu để mở khóa khi sử dụng.</div>
              </button>
            </div>
          </div>

          <!-- Initialized but Locked -->
          <div v-else-if="!configStore.isVaultUnlocked" class="space-y-3">
            <div class="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-[11px] font-bold text-amber-800 leading-relaxed">
              <i class="fa-solid fa-lock"></i> Két sắt đang KHÓA. Hãy mở khóa để quản lý và sử dụng API Keys.
            </div>
            <div class="flex gap-2">
              <input v-if="configStore.vaultUnlockMode === 'passphrase'" v-model="vaultPassword" type="password" placeholder="Nhập PIN hoặc Passphrase..." class="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:border-blue-900 outline-none" @keyup.enter="unlockVault">
              <button @click="unlockVault" class="px-5 py-2.5 bg-blue-900 hover:bg-blue-800 text-white rounded-xl font-black text-[11px] active:scale-95 transition-all">
                <i class="fa-solid fa-unlock-keyhole"></i> Mở khóa
              </button>
            </div>
          </div>

          <!-- Unlocked -->
          <div v-else class="space-y-3">
            <div class="flex items-center justify-between">
              <div>
                <div class="text-xs font-black text-emerald-600 flex items-center gap-1.5"><i class="fa-solid fa-circle-check"></i> Két sắt đã MỞ KHÓA</div>
                <div class="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Chế độ: {{ configStore.vaultUnlockMode === 'device' ? 'Thiết bị cục bộ' : 'Mật khẩu PIN' }}</div>
              </div>
              <button @click="configStore.lockVault" class="px-4 py-2 border border-slate-200 hover:bg-rose-50 text-rose-500 rounded-xl font-black text-[10px] active:scale-95 transition-all">
                <i class="fa-solid fa-lock"></i> Khóa két sắt
              </button>
            </div>
          </div>

          <!-- Threat Model details -->
          <details class="text-[9px] font-bold text-slate-400 cursor-pointer pl-1">
            <summary class="hover:text-blue-900 transition-colors">Tìm hiểu thêm về Mô hình bảo mật (Threat Model)</summary>
            <div class="mt-2 pl-3 border-l-2 border-slate-200 space-y-1.5 text-justify leading-relaxed">
              <p><b>Device Local:</b> Sử dụng khóa AES-GCM 256-bit được sinh ngẫu nhiên trên trình duyệt với cờ <code>extractable: false</code>. Khóa này không thể bị xuất ra khỏi trình duyệt qua lệnh JS thông thường, giúp chống mã độc sao chép key. Tuy nhiên, nếu website bị lỗi XSS, kẻ tấn công có thể chạy lệnh trực tiếp trong origin này khi trình duyệt đang mở.</p>
              <p><b>PIN/Passphrase:</b> Khóa AES được sinh thông qua hàm phái sinh PBKDF2 (100.000 vòng băm SHA-256) từ mật khẩu của bạn. Keys chỉ được giải mã và lưu trên bộ nhớ RAM tạm thời của trình duyệt, tự động xóa sạch (khóa lại) khi đóng tab, đăng xuất hoặc sau 30 phút không hoạt động.</p>
            </div>
          </details>
        </div>
      </div>

      <!-- General Config -->
      <div class="space-y-3">
        <h4 class="text-[11px] font-black text-slate-400 uppercase tracking-widest pl-2">Cấu hình chung</h4>
        <div class="bg-white rounded-3xl shadow-sm border border-slate-100 p-4 space-y-4">
          
          <!-- LLM Model -->
          <div class="flex items-center justify-between">
            <label class="text-xs font-black text-slate-800">Mô hình ngôn ngữ (LLM)</label>
            <div class="relative w-44 md:w-56">
              <select :value="configStore.defaults.text" @change="handleTextModelChange" class="w-full pl-3 pr-8 py-2 rounded-xl border border-slate-200 bg-white font-bold text-slate-800 text-[11px] focus:border-blue-900 focus:ring-2 focus:ring-blue-50 outline-none transition-all appearance-none text-right">
                <option v-for="m in configStore.textModels" :key="m.id" :value="m.id">{{ m.name }} (Tier {{ m.tier }})</option>
              </select>
              <i class="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] pointer-events-none"></i>
            </div>
          </div>
          
          <!-- Vision Model -->
          <div class="flex items-center justify-between">
            <label class="text-xs font-black text-slate-800 flex items-center gap-1.5">Mô hình xử lý hình ảnh (Vision) <i class="fa-solid fa-circle-info text-slate-300"></i></label>
            <div class="relative w-44 md:w-56">
              <select :value="configStore.defaults.vision" @change="handleVisionModelChange" class="w-full pl-3 pr-8 py-2 rounded-xl border border-slate-200 bg-white font-bold text-slate-800 text-[11px] focus:border-blue-900 focus:ring-2 focus:ring-blue-50 outline-none transition-all appearance-none text-right">
                <option v-for="m in configStore.visionModels" :key="m.id" :value="m.id">{{ m.name }} (Tier {{ m.tier }})</option>
              </select>
              <i class="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] pointer-events-none"></i>
            </div>
          </div>

          <!-- AI Workflow Mode Selection -->
          <div class="flex items-center justify-between">
            <label class="text-xs font-black text-slate-800">Quy trình xử lý AI</label>
            <div class="relative w-44 md:w-56">
              <select :value="configStore.defaults.aiWorkflowMode || 'direct'" @change="handleWorkflowModeChange" class="w-full pl-3 pr-8 py-2 rounded-xl border border-slate-200 bg-white font-bold text-slate-800 text-[11px] focus:border-blue-900 focus:ring-2 focus:ring-blue-50 outline-none transition-all appearance-none text-right">
                <option value="direct">Điền trực tiếp (V6 style)</option>
                <option value="review">Xem lại trước khi điền (V7 style)</option>
              </select>
              <i class="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] pointer-events-none"></i>
            </div>
          </div>

          <div class="h-[1px] bg-slate-100 my-2"></div>

          <!-- MOI Key -->
          <div class="bg-[#FFF8ED] border border-amber-200 rounded-2xl p-4">
            <label class="text-[11px] font-black text-amber-600 mb-2 flex items-center gap-1.5"><i class="fa-solid fa-key"></i> Tải API Key từ Cloud (Admin)</label>
            <div class="flex gap-4 justify-between items-center">
              <p class="text-[10px] font-bold text-slate-500 leading-relaxed">Tự động tải danh sách các API Keys được lưu trữ trên Cloud về trình duyệt này.</p>
              <button @click="handleBorrowKeys" class="px-5 py-2.5 bg-[#F59E0B] text-white rounded-xl font-black text-[11px] hover:bg-amber-600 active:scale-95 transition-all shrink-0">Tải về</button>
            </div>
          </div>
          
          <p class="text-[10px] font-bold text-slate-400 flex items-center gap-1.5 pl-1"><i class="fa-solid fa-lock text-slate-300"></i> API Key được mã hóa và lưu trữ an toàn.</p>
        </div>
      </div>

      <!-- Circuit Breaker / Cooldown Status -->
      <div v-if="cooldownList.length > 0" class="space-y-3">
        <h4 class="text-[11px] font-black text-slate-400 uppercase tracking-widest pl-2">Hệ thống tự động bỏ qua (Cooldown)</h4>
        <div class="bg-white rounded-3xl shadow-sm border border-slate-100 p-4 space-y-3">
          <p class="text-[10px] font-bold text-slate-500 leading-relaxed">
            Các mô hình sau đây bị lỗi liên tục (Rate Limit / Lỗi cấu hình) và tạm thời bị hệ thống tự động bỏ qua để đảm bảo tốc độ phản hồi nhanh nhất:
          </p>
          <div class="space-y-2">
            <div v-for="c in cooldownList" :key="c.modelId" class="flex items-center justify-between bg-rose-50 border border-rose-100 px-3 py-2 rounded-xl">
              <div class="flex items-center gap-2">
                <i class="fa-solid fa-triangle-exclamation text-rose-500 text-xs animate-pulse"></i>
                <div>
                  <div class="text-[11px] font-black text-slate-800">{{ getModelName(c.modelId) }}</div>
                  <div class="text-[9px] font-bold text-rose-500">{{ c.reason }}</div>
                </div>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <span class="text-[9px] font-mono font-bold text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">Còn {{ c.remainingSeconds }}s</span>
              </div>
            </div>
          </div>
          <div class="flex justify-end pt-1">
            <button @click="handleClearCooldowns" class="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-black text-[10px] active:scale-95 transition-all">Thử lại toàn bộ</button>
          </div>
        </div>
      </div>

      <!-- Providers List -->
      <div class="space-y-3">
        <h4 class="text-[11px] font-black text-slate-400 uppercase tracking-widest pl-2">Danh sách nhà cung cấp AI</h4>
        
        <div class="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden divide-y divide-slate-100">
          
          <div v-for="(platform, pId) in PLATFORMS" :key="pId" class="p-4 hover:bg-slate-50 transition-colors">
            <div class="flex justify-between items-start mb-3">
              <div class="flex items-center gap-3">
                <div :class="['w-9 h-9 rounded-xl flex items-center justify-center text-xl bg-white shadow-sm border border-slate-100 shrink-0', platform.color]">
                  <i :class="['fa-brands', platform.icon]"></i>
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <span class="font-black text-[13px] text-slate-800">{{ platform.name }}</span>
                    <span class="text-[9px] font-bold text-slate-400">{{ pId === 'pollinations' ? '1 key' : configStore.getKeyCount(pId) + ' keys' }}</span>
                    <!-- Active badge condition -->
                    <span v-if="configStore.defaults.text.startsWith(pId as string) || configStore.defaults.vision.startsWith(pId as string) || (pId === 'gemini' && configStore.getKeyCount(pId) > 0)" class="text-[9px] font-black text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">Đang dùng</span>
                    <!-- Free badge condition -->
                    <span v-if="pId === 'pollinations'" class="text-[9px] font-black text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">Miễn phí</span>
                  </div>
                </div>
              </div>
              
              <div class="flex items-center gap-3 mt-1">
                <a :href="platform.getUrl" target="_blank" class="text-[11px] font-black text-blue-600 hover:text-blue-700 transition-colors flex items-center gap-1">Get Key <i class="fa-solid fa-arrow-up-right-from-square text-[9px]"></i></a>
                <button class="text-slate-400 hover:text-blue-900 transition-colors p-1" @click="handlePlatformOptions(pId as string)"><i class="fa-solid fa-ellipsis-vertical"></i></button>
              </div>
            </div>

            <!-- Key Pills -->
            <div class="flex flex-wrap gap-2 pl-12" v-if="configStore.keysStatus[pId]?.configured">
              <div v-for="(maskedKey, idx) in configStore.keysStatus[pId]?.maskedList.slice(0, 3)" :key="idx" class="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-md group">
                <span @click="handleKeyClick(pId as string, idx)" class="font-mono text-[10px] font-bold text-slate-600 cursor-pointer hover:text-rose-500 transition-colors" title="Nhấn để xóa">{{ maskedKey }}</span>
                <i class="fa-regular fa-copy cursor-pointer text-slate-400 hover:text-blue-900 transition-colors text-[10px]" @click="copyToClipboard(maskedKey)"></i>
              </div>
              <div v-if="(configStore.keysStatus[pId]?.count || 0) > 3" class="flex items-center px-2 py-1 rounded-md text-[10px] font-bold text-slate-400">
                +{{ configStore.keysStatus[pId].count - 3 }} keys
              </div>
            </div>
            <!-- Free pill for pollinations -->
            <div class="flex flex-wrap gap-2 pl-12" v-if="pId === 'pollinations'">
               <div class="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-md">
                <span class="font-mono text-[10px] font-bold text-slate-600">free...free</span>
                <i class="fa-regular fa-copy cursor-pointer text-slate-400 hover:text-blue-900 transition-colors text-[10px]" @click="copyToClipboard('free')"></i>
              </div>
            </div>

          </div>

        </div>
      </div>
      <!-- Menu Aliases Manager -->
      <div class="space-y-3">
        <h4 class="text-[11px] font-black text-slate-400 uppercase tracking-widest pl-2 flex items-center justify-between">
          <span>Từ viết tắt món ăn (Menu Aliases)</span>
          <span class="text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{{ appStore.menuAliases?.length || 0 }} từ</span>
        </h4>
        
        <div class="bg-white rounded-3xl shadow-sm border border-slate-100 p-4 space-y-4">
          <!-- Add Alias Form -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <label class="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">Từ viết tắt (Ví dụ: mxhs)</label>
              <input v-model="newAliasText" class="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:border-blue-900 focus:ring-2 focus:ring-blue-50 outline-none transition-all" placeholder="Viết tắt">
            </div>
            <div class="space-y-1.5">
              <label class="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">Món ăn trong thực đơn</label>
              <div class="relative">
                <select v-model="selectedAliasDish" class="w-full pl-3 pr-8 py-2 rounded-xl border border-slate-200 bg-white font-bold text-slate-800 text-[11px] focus:border-blue-900 focus:ring-2 focus:ring-blue-50 outline-none transition-all appearance-none">
                  <option value="">-- Chọn món ăn --</option>
                  <option v-for="m in appStore.menuList" :key="m.name" :value="m.name">{{ m.name }}</option>
                </select>
                <i class="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] pointer-events-none"></i>
              </div>
            </div>
          </div>
          <div class="flex justify-end">
            <button @click="handleAddAlias" class="px-5 py-2.5 bg-blue-900 hover:bg-blue-800 text-white rounded-xl font-black text-[11px] hover:bg-amber-600 active:scale-95 transition-all shrink-0">Thêm từ viết tắt</button>
          </div>

          <div class="h-[1px] bg-slate-100 my-2"></div>

          <!-- Aliases Table/List -->
          <div v-if="appStore.menuAliases && appStore.menuAliases.length > 0" class="max-h-48 overflow-y-auto custom-scrollbar divide-y divide-slate-100">
            <div v-for="item in appStore.menuAliases" :key="item.alias" class="flex items-center justify-between py-2 px-2 hover:bg-slate-50 rounded-lg transition-all">
              <div class="flex items-center gap-2">
                <span class="font-mono text-xs font-bold text-blue-900 bg-blue-50 px-2 py-1 rounded">{{ item.alias }}</span>
                <i class="fa-solid fa-arrow-right text-[10px] text-slate-400"></i>
                <span class="text-xs font-bold text-slate-700">{{ item.dishName }}</span>
              </div>
              <button @click="handleDeleteAlias(item.alias)" class="w-8 h-8 text-rose-500 hover:bg-rose-50 rounded-full flex items-center justify-center transition-colors active:scale-95" title="Xóa từ viết tắt">
                <i class="fa-regular fa-trash-can text-sm"></i>
              </button>
            </div>
          </div>
          <div v-else class="text-center py-4">
            <p class="text-[11px] font-bold text-slate-400">Chưa có từ viết tắt nào được cấu hình</p>
          </div>
        </div>
      </div>
      
      <div class="mt-6 text-center text-[10px] font-bold text-slate-400 flex items-center justify-center gap-1.5 pb-4">
        <i class="fa-solid fa-circle-info"></i> Tổng cộng: {{ configStore.totalKeyCount + 1 }} keys across {{ Object.keys(PLATFORMS).length }} platforms
      </div>
    </div>
  </div>
</template>
