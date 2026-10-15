<script setup lang="ts">
import { ref, reactive, onUnmounted, watch, nextTick } from 'vue'
import { useUIStore } from '@/stores/useUIStore'
import { useConfigStore } from '@/stores/useConfigStore'
import { useAppStore } from '@/stores/useAppStore'
import { PLATFORMS, AI_MODELS } from '@/utils/constants'
import { getActiveCooldowns, clearAllCooldowns } from '@/services/ai/circuitBreaker'
import { testProviderApiKey } from '@/services/ai/aiProviderClient'

const ui = useUIStore()
const configStore = useConfigStore()
const appStore = useAppStore()

const newAliasText = ref('')
const selectedAliasDish = ref('')
const vaultPassword = ref('')
const showVaultPassword = ref(false)
const vaultPassInputRef = ref<HTMLInputElement | null>(null)

// Inline PIN setup state
const showPinSetupForm = ref(false)
const newPinInput = ref('')
const showNewPin = ref(false)

// Inline API Key add state per provider
const activeAddProvider = ref<string | null>(null)
const showProviderKeyInput = reactive<Record<string, boolean>>({})
const expandedProviderKeys = reactive<Record<string, boolean>>({})

// Cloud borrow password visibility
const showBorrowPass = ref(false)

const providerDiagnostics = ref<Record<string, {
  loading: boolean
  ok?: boolean
  latencyMs?: number
  modelUsed?: string
  error?: string
}>>({})
const isTestingAll = ref(false)

function getPlatformIconClass(icon: string) {
  const brandIcons = ['fa-google', 'fa-meta', 'fa-github']
  return brandIcons.includes(icon) ? ['fa-brands', icon] : ['fa-solid', icon]
}

async function handleTestProvider(pId: string) {
  providerDiagnostics.value[pId] = { loading: true }
  try {
    const res = await testProviderApiKey(pId)
    providerDiagnostics.value[pId] = {
      loading: false,
      ok: res.ok,
      latencyMs: res.latencyMs,
      modelUsed: res.modelName,
      error: res.ok ? undefined : res.message
    }
    if (res.ok) {
      ui.showToast(`${PLATFORMS[pId]?.name || pId}: ${res.message}`, 'success')
    } else {
      ui.showToast(`${PLATFORMS[pId]?.name || pId}: ${res.message}`, 'error')
    }
  } catch (e: any) {
    providerDiagnostics.value[pId] = {
      loading: false,
      ok: false,
      error: e?.message || 'Lỗi kiểm tra kết nối'
    }
  }
}

async function handleTestAllProviders() {
  if (isTestingAll.value) return
  isTestingAll.value = true
  try {
    await configStore.ensureVaultReadyForWrite()
    const configuredProviders = Object.keys(PLATFORMS).filter(
      pId => pId === 'pollinations' || configStore.getKeyCount(pId) > 0
    )
    await Promise.all(configuredProviders.map(pId => handleTestProvider(pId)))
  } finally {
    isTestingAll.value = false
  }
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text)
  ui.showToast('Đã copy vào bộ nhớ tạm', 'success')
}

async function initVault(mode: 'device' | 'passphrase') {
  if (mode === 'device') {
    try {
      await configStore.initializeVault('device')
      showPinSetupForm.value = false
    } catch (e: any) {
      ui.showToast(e.message, 'error')
    }
  } else {
    showPinSetupForm.value = true
  }
}

async function handleConfirmPinSetup() {
  const pin = newPinInput.value.trim()
  if (pin.length < 4) {
    ui.showToast('Mật khẩu PIN cần tối thiểu 4 ký tự!', 'warning')
    return
  }
  try {
    if (configStore.isVaultInitialized) {
      await configStore.resetVault('passphrase', pin)
    } else {
      await configStore.initializeVault('passphrase', pin)
    }
    newPinInput.value = ''
    showPinSetupForm.value = false
  } catch (e: any) {
    ui.showToast(e.message, 'error')
  }
}

async function unlockVault() {
  if (configStore.vaultUnlockMode === 'device' && !vaultPassword.value.trim()) {
    try {
      await configStore.unlockVault()
      return
    } catch (e: any) {
      ui.showToast(e.message, 'error')
      return
    }
  }

  if (!vaultPassword.value.trim()) {
    // Try device unlock if mode was not yet resolved
    if (!configStore.vaultUnlockMode) {
      try {
        await configStore.unlockVault()
        return
      } catch {
        // Fall through to password warning
      }
    }
    ui.showToast('Vui lòng nhập mật khẩu mở khóa vào ô bên cạnh!', 'warning')
    nextTick(() => vaultPassInputRef.value?.focus())
    return
  }

  try {
    await configStore.unlockVault(vaultPassword.value.trim())
    vaultPassword.value = ''
  } catch (e: any) {
    ui.showToast(e.message, 'error')
  }
}

async function handleResetVaultToDevice() {
  const confirmed = await ui.showConfirm(
    'Đặt lại Két sắt bảo mật',
    'Két sắt sẽ được chuyển về chế độ Tự động mở khóa (Device Local) và tự động nạp lại các API Key mặc định đang hoạt động. Bạn có muốn tiếp tục?'
  )
  if (!confirmed) return
  try {
    await configStore.resetVault('device')
    vaultPassword.value = ''
    showPinSetupForm.value = false
  } catch (e: any) {
    ui.showToast(e.message || 'Không thể đặt lại két sắt', 'error')
  }
}

function toggleAddKeyPanel(pId: string) {
  if (pId === 'pollinations') {
    ui.showToast('Pollinations hoàn toàn miễn phí, không cần nhập API Key!', 'info')
    return
  }
  if (activeAddProvider.value === pId) {
    activeAddProvider.value = null
  } else {
    activeAddProvider.value = pId
    nextTick(() => {
      const el = document.getElementById(`key-input-${pId}`) as HTMLInputElement | null
      el?.focus()
    })
  }
}

async function pasteProviderKey(pId: string) {
  try {
    const text = await navigator.clipboard.readText()
    if (text && text.trim()) {
      configStore.tempKeys[pId] = text.trim()
      ui.showToast('Đã dán API Key từ bộ nhớ tạm!', 'info')
    } else {
      ui.showToast('Bộ nhớ tạm đang trống!', 'warning')
    }
  } catch {
    ui.showToast('Vui lòng nhấn Ctrl+V vào ô nhập Key', 'info')
  }
}

async function handleSaveInlineKey(pId: string) {
  const rawKey = (configStore.tempKeys[pId] || '').trim()
  if (!rawKey) {
    ui.showToast(`Vui lòng dán hoặc nhập API Key cho ${PLATFORMS[pId]?.name || pId}!`, 'warning')
    return
  }

  // If user typed vault password in the top box while vault was locked, unlock it first
  if (!configStore.isVaultUnlocked && vaultPassword.value.trim()) {
    try {
      await configStore.unlockVault(vaultPassword.value.trim())
      vaultPassword.value = ''
    } catch (e: any) {
      ui.showToast(e.message, 'error')
      return
    }
  }

  const ready = await configStore.ensureVaultReadyForWrite()
  if (!ready) {
    ui.showToast('Két sắt đang khóa bằng mật khẩu. Vui lòng nhập mật khẩu mở khóa ở mục Két sắt bảo mật phía trên!', 'warning', 4500)
    nextTick(() => {
      vaultPassInputRef.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      vaultPassInputRef.value?.focus()
    })
    return
  }

  await configStore.saveApiKey(pId)
  activeAddProvider.value = null
  await handleTestProvider(pId)
}

async function handleKeyDelete(pId: string, idx: number, maskedKey: string) {
  const ready = await configStore.ensureVaultReadyForWrite()
  if (!ready) {
    ui.showToast('Vui lòng mở khóa két sắt bảo mật ở phía trên trước khi xóa Key!', 'warning')
    nextTick(() => {
      vaultPassInputRef.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      vaultPassInputRef.value?.focus()
    })
    return
  }

  const confirmed = await ui.showConfirm('Xóa API Key', `Bạn có chắc chắn muốn xóa API key (${maskedKey}) khỏi ${PLATFORMS[pId]?.name || pId}?`)
  if (confirmed) {
    await configStore.deleteApiKey(pId, idx)
    delete providerDiagnostics.value[pId]
  }
}

function handleTextModelChange(e: Event) {
  const target = e.target as HTMLSelectElement
  configStore.defaults.text = target.value
  ui.showToast('Đã cập nhật mô hình ngôn ngữ (LLM)', 'success')
}

function handleVisionModelChange(e: Event) {
  const target = e.target as HTMLSelectElement
  configStore.defaults.vision = target.value
  ui.showToast('Đã cập nhật mô hình xử lý ảnh (Vision)', 'success')
}

function handleWorkflowModeChange(e: Event) {
  const target = e.target as HTMLSelectElement
  const val = target.value
  configStore.defaults.aiWorkflowMode = val
  ui.showToast(`Đã cập nhật quy trình AI: ${val === 'direct' ? 'Điền trực tiếp' : 'Xem lại trước khi điền'}`, 'success')
}

async function handleBorrowKeysInline() {
  // If user typed vault password in the top box while vault was locked, unlock it first
  if (!configStore.isVaultUnlocked && vaultPassword.value.trim()) {
    try {
      await configStore.unlockVault(vaultPassword.value.trim())
      vaultPassword.value = ''
    } catch (e: any) {
      ui.showToast(e.message, 'error')
      return
    }
  }

  const ready = await configStore.ensureVaultReadyForWrite()
  if (!ready) {
    ui.showToast('Vui lòng mở khóa két sắt bảo mật ở phía trên trước khi tải Keys!', 'warning')
    nextTick(() => {
      vaultPassInputRef.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      vaultPassInputRef.value?.focus()
    })
    return
  }

  const pass = configStore.borrowPass.trim()
  if (!pass) {
    ui.showToast('Vui lòng nhập mật khẩu Admin vào ô bên cạnh để tải API Keys từ Cloud!', 'warning')
    return
  }
  await configStore.borrowKeys(pass)
}

async function handleAddAlias() {
  if (!newAliasText.value.trim() || !selectedAliasDish.value) {
    ui.showToast('Vui lòng nhập từ viết tắt và chọn món ăn!', 'warning')
    return
  }

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
    configStore.refreshVaultState()
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
  <div v-if="ui.activeSettingModal === 'ai'" class="flex flex-col h-full bg-slate-50 dark:bg-slate-950 md:bg-white dark:md:bg-slate-900 overflow-hidden w-full relative z-[1000] lg:z-10">
    
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3.5 border-b border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 shadow-xs relative z-20">
      <button @click="ui.closeConfig()" class="w-10 h-10 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors active:scale-95 cursor-pointer" title="Quay lại">
        <i class="fa-solid fa-arrow-left text-lg"></i>
      </button>
      <div class="text-center flex-1">
        <h2 class="text-base md:text-lg font-black text-slate-900 dark:text-slate-100">Cấu hình AI & API Keys</h2>
        <p class="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-0.5 uppercase tracking-wider">Quản lý Mô hình & Két sắt bảo mật</p>
      </div>
      <button
        @click="handleTestAllProviders"
        :disabled="isTestingAll"
        class="px-3 py-2 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/60 rounded-xl font-black text-[11px] flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
        title="Kiểm tra kết nối tất cả các nền tảng"
      >
        <i :class="['fa-solid', isTestingAll ? 'fa-spinner fa-spin' : 'fa-stethoscope']"></i>
        <span class="hidden sm:inline">{{ isTestingAll ? 'Đang test...' : 'Test tất cả' }}</span>
      </button>
    </div>

    <!-- Scrollable Content -->
    <div class="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/70 dark:bg-slate-950/60">
      <div class="p-4 md:p-6 lg:p-8 max-w-3xl mx-auto w-full space-y-6 pb-12">

        <!-- 1. Key Vault Security Card -->
        <div class="space-y-2.5">
          <div class="flex items-center justify-between px-1">
            <h4 class="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <i class="fa-solid fa-vault text-blue-600 dark:text-blue-400"></i> Két sắt bảo mật (Local Vault)
            </h4>
            <span
              class="text-[10px] font-black px-2 py-0.5 rounded-full border"
              :class="configStore.isVaultUnlocked
                ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60'
                : 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60'"
            >
              {{ configStore.isVaultUnlocked ? 'Đang mở khóa' : 'Đang khóa' }}
            </span>
          </div>

          <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 p-4 md:p-5 space-y-4">
            <!-- Uninitialized state -->
            <div v-if="!configStore.isVaultInitialized" class="space-y-3">
              <div class="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 rounded-xl p-3 text-xs font-bold text-blue-800 dark:text-blue-300 leading-relaxed flex items-start gap-2.5">
                <i class="fa-solid fa-circle-info mt-0.5 shrink-0"></i>
                <span>Chọn chế độ bảo vệ API Key trên trình duyệt của bạn. Khuyên dùng <b>Tự động mở khóa (Device Local)</b> để thao tác nhanh nhất.</span>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button @click="initVault('device')" class="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 hover:border-blue-600 dark:hover:border-blue-500 rounded-xl text-left transition-all active:scale-98 cursor-pointer">
                  <div class="text-xs font-black text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    <i class="fa-solid fa-mobile-screen-button text-blue-600"></i> Thiết bị cục bộ (Khuyên dùng)
                  </div>
                  <div class="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-medium leading-relaxed">Mở khóa tự động bằng khóa AES-256 lưu an toàn trong trình duyệt.</div>
                </button>
                <button @click="initVault('passphrase')" class="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 hover:border-blue-600 dark:hover:border-blue-500 rounded-xl text-left transition-all active:scale-98 cursor-pointer">
                  <div class="text-xs font-black text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    <i class="fa-solid fa-key text-amber-500"></i> Mật khẩu PIN / Passphrase
                  </div>
                  <div class="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-medium leading-relaxed">Mã hóa bằng mật khẩu riêng. Yêu cầu nhập mật khẩu mỗi phiên làm việc.</div>
                </button>
              </div>
            </div>

            <!-- Initialized but Locked -->
            <div v-else-if="!configStore.isVaultUnlocked" class="space-y-3">
              <div class="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl p-3 text-xs font-bold text-amber-800 dark:text-amber-300 leading-relaxed flex items-start justify-between gap-3">
                <div class="flex items-start gap-2">
                  <i class="fa-solid fa-lock mt-0.5 shrink-0"></i>
                  <span>
                    Két sắt đang <b>KHÓA</b>
                    ({{ configStore.vaultUnlockMode === 'device' ? 'Chế độ Thiết bị cục bộ' : 'Chế độ Mật khẩu PIN' }}).
                    {{ configStore.vaultUnlockMode === 'device' ? 'Nhấn Mở khóa để kích hoạt ngay.' : 'Nhập mật khẩu mở khóa bên dưới để thêm và lưu API Keys.' }}
                  </span>
                </div>
              </div>

              <!-- Always show password input when locked in passphrase/unknown mode, or allow 1-click unlock in device mode -->
              <div class="flex flex-col sm:flex-row gap-2.5">
                <div v-if="configStore.vaultUnlockMode !== 'device'" class="relative flex-1 flex items-center">
                  <input
                    ref="vaultPassInputRef"
                    v-model="vaultPassword"
                    :type="showVaultPassword ? 'text' : 'password'"
                    placeholder="Nhập mật khẩu PIN / Passphrase mở khóa..."
                    class="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                    @keydown.enter="unlockVault"
                  >
                  <button
                    type="button"
                    @click="showVaultPassword = !showVaultPassword"
                    class="absolute right-2.5 w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg"
                    :title="showVaultPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'"
                  >
                    <i :class="['fa-regular text-xs', showVaultPassword ? 'fa-eye-slash' : 'fa-eye']"></i>
                  </button>
                </div>

                <button
                  @click="unlockVault"
                  class="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs active:scale-95 transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer shrink-0"
                >
                  <i class="fa-solid fa-unlock-keyhole"></i>
                  <span>{{ configStore.vaultUnlockMode === 'device' ? 'Mở khóa tự động' : 'Mở khóa Két sắt' }}</span>
                </button>

                <button
                  v-if="configStore.vaultUnlockMode !== 'device'"
                  @click="handleResetVaultToDevice"
                  class="px-3.5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-[11px] active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                  title="Đặt lại két sắt về chế độ tự động mở khóa nếu quên mật khẩu"
                >
                  <i class="fa-solid fa-rotate-left"></i>
                  <span>Đặt lại (Tự động mở)</span>
                </button>
              </div>
            </div>

            <!-- Unlocked -->
            <div v-else class="flex flex-wrap items-center justify-between gap-3">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-base shrink-0">
                  <i class="fa-solid fa-shield-halved"></i>
                </div>
                <div>
                  <div class="text-xs font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <i class="fa-solid fa-circle-check"></i> Két sắt đã MỞ KHÓA & Sẵn sàng lưu Key
                  </div>
                  <div class="text-[11px] text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
                    Chế độ bảo vệ: <b class="text-slate-700 dark:text-slate-200">{{ configStore.vaultUnlockMode === 'device' ? 'Thiết bị cục bộ (Tự động mở khóa)' : 'Mật khẩu PIN / Passphrase' }}</b>
                  </div>
                </div>
              </div>

              <div class="flex items-center gap-2">
                <button
                  v-if="configStore.vaultUnlockMode === 'device'"
                  @click="showPinSetupForm = !showPinSetupForm"
                  class="px-3 py-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-bold text-[11px] active:scale-95 transition-all cursor-pointer"
                >
                  <i class="fa-solid fa-key mr-1"></i> Đặt mã PIN
                </button>
                <button
                  v-else
                  @click="handleResetVaultToDevice"
                  class="px-3 py-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-bold text-[11px] active:scale-95 transition-all cursor-pointer"
                >
                  <i class="fa-solid fa-mobile-screen-button mr-1"></i> Chuyển sang Tự động mở
                </button>
                <button
                  @click="configStore.lockVault"
                  class="px-3.5 py-2 border border-rose-200 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-xl font-black text-[11px] active:scale-95 transition-all cursor-pointer"
                >
                  <i class="fa-solid fa-lock mr-1"></i> Khóa
                </button>
              </div>
            </div>

            <!-- Inline PIN Setup Form (when user clicks "Đặt mã PIN" or chooses Passphrase mode) -->
            <div v-if="showPinSetupForm" class="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2.5">
              <div class="text-xs font-black text-slate-800 dark:text-slate-100 flex items-center justify-between">
                <span><i class="fa-solid fa-key text-amber-500 mr-1.5"></i> Thiết lập mật khẩu PIN / Passphrase cho Két sắt</span>
                <button @click="showPinSetupForm = false" class="text-slate-400 hover:text-slate-600 text-xs"><i class="fa-solid fa-xmark"></i></button>
              </div>
              <div class="flex flex-col sm:flex-row gap-2">
                <div class="relative flex-1 flex items-center">
                  <input
                    v-model="newPinInput"
                    :type="showNewPin ? 'text' : 'password'"
                    placeholder="Nhập mã PIN mới (tối thiểu 4 ký tự)..."
                    class="w-full pl-3.5 pr-10 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 focus:border-blue-600 outline-none"
                    @keydown.enter="handleConfirmPinSetup"
                  >
                  <button
                    type="button"
                    @click="showNewPin = !showNewPin"
                    class="absolute right-2.5 text-slate-400 hover:text-slate-600"
                  >
                    <i :class="['fa-regular text-xs', showNewPin ? 'fa-eye-slash' : 'fa-eye']"></i>
                  </button>
                </div>
                <button
                  @click="handleConfirmPinSetup"
                  class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs active:scale-95 transition-all cursor-pointer shrink-0"
                >
                  Lưu mã PIN
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 2. Providers List (Primary Action Area) -->
        <div class="space-y-2.5">
          <div class="flex items-center justify-between px-1">
            <div>
              <h4 class="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <i class="fa-solid fa-microchip text-purple-600 dark:text-purple-400"></i> Danh sách nhà cung cấp AI ({{ Object.keys(PLATFORMS).length }} nền tảng)
              </h4>
            </div>
            <span class="text-[11px] font-bold text-slate-500 dark:text-slate-400">
              Tổng cộng: <b class="text-blue-600 dark:text-blue-400">{{ configStore.totalKeyCount }}</b> keys
            </span>
          </div>

          <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
            <div v-for="(platform, pId) in PLATFORMS" :key="pId" class="p-4 md:p-5 hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors">
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div class="flex items-start gap-3">
                  <div :class="['w-10 h-10 rounded-xl flex items-center justify-center text-lg bg-slate-50 dark:bg-slate-800 shadow-xs border border-slate-200/70 dark:border-slate-700 shrink-0', platform.color]">
                    <i :class="getPlatformIconClass(platform.icon)"></i>
                  </div>
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="font-black text-sm text-slate-900 dark:text-slate-100">{{ platform.name }}</span>
                      <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {{ pId === 'pollinations' ? 'Free API' : configStore.getKeyCount(pId as string) + ' keys' }}
                      </span>
                      <!-- Active badge -->
                      <span
                        v-if="pId === 'pollinations' || configStore.getKeyCount(pId as string) > 0"
                        class="text-[10px] font-black text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/60 px-2 py-0.5 rounded-full"
                      >
                        {{ pId === 'pollinations' ? 'Miễn phí 100%' : 'Đã nạp Key' }}
                      </span>
                      <!-- Live Diagnostic Badge -->
                      <span v-if="providerDiagnostics[pId as string]?.loading" class="text-[10px] font-black text-blue-600 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800/60 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <i class="fa-solid fa-spinner fa-spin"></i> Đang kiểm tra...
                      </span>
                      <span v-else-if="providerDiagnostics[pId as string]?.ok === true" class="text-[10px] font-black text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/60 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <i class="fa-solid fa-circle-check"></i> Kết nối tốt ({{ providerDiagnostics[pId as string]?.latencyMs }}ms)
                      </span>
                      <span v-else-if="providerDiagnostics[pId as string]?.ok === false" class="text-[10px] font-black text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/60 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <i class="fa-solid fa-circle-xmark"></i> Lỗi kết nối
                      </span>
                    </div>

                    <div v-if="providerDiagnostics[pId as string]?.ok === false && providerDiagnostics[pId as string]?.error" class="text-[11px] font-semibold text-rose-600 dark:text-rose-400 mt-1 leading-snug">
                      {{ providerDiagnostics[pId as string]?.error }}
                    </div>
                  </div>
                </div>

                <!-- Action Buttons -->
                <div class="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <button
                    v-if="pId === 'pollinations' || configStore.getKeyCount(pId as string) > 0"
                    @click="handleTestProvider(pId as string)"
                    :disabled="providerDiagnostics[pId as string]?.loading"
                    class="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/50 text-slate-700 dark:text-slate-200 hover:text-blue-700 dark:hover:text-blue-300 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-[11px] transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    title="Kiểm tra kết nối API Key"
                  >
                    <i :class="['fa-solid', providerDiagnostics[pId as string]?.loading ? 'fa-spinner fa-spin' : 'fa-plug-circle-check']"></i>
                    <span>Test</span>
                  </button>

                  <a
                    v-if="platform.getUrl"
                    :href="platform.getUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="px-2.5 py-1.5 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-xl transition-colors flex items-center gap-1"
                    title="Lấy API Key miễn phí từ nhà cung cấp"
                  >
                    <span>Lấy Key</span>
                    <i class="fa-solid fa-arrow-up-right-from-square text-[9px]"></i>
                  </a>

                  <button
                    v-if="pId !== 'pollinations'"
                    @click="toggleAddKeyPanel(pId as string)"
                    class="px-3 py-1.5 rounded-xl font-black text-[11px] transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
                    :class="activeAddProvider === pId
                      ? 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100'
                      : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'"
                  >
                    <i :class="['fa-solid text-[10px]', activeAddProvider === pId ? 'fa-minus' : 'fa-plus']"></i>
                    <span>{{ activeAddProvider === pId ? 'Đóng' : 'Thêm Key' }}</span>
                  </button>
                </div>
              </div>

              <!-- Inline Add Key Input Box (No Popup Blocking!) -->
              <div
                v-if="activeAddProvider === pId && pId !== 'pollinations'"
                class="mt-3.5 p-3.5 bg-blue-50/60 dark:bg-slate-800/70 border border-blue-200/80 dark:border-slate-700 rounded-xl space-y-2"
              >
                <div class="flex items-center justify-between">
                  <label :for="`key-input-${pId}`" class="text-[11px] font-black text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
                    <i class="fa-solid fa-key"></i> Nhập hoặc dán API Key mới cho {{ platform.name }}
                  </label>
                  <span class="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Nhấn Enter để Lưu & Test</span>
                </div>
                <div class="flex flex-col sm:flex-row gap-2">
                  <div class="relative flex-1 flex items-center">
                    <input
                      :id="`key-input-${pId}`"
                      v-model="configStore.tempKeys[pId as string]"
                      :type="showProviderKeyInput[pId as string] ? 'text' : 'password'"
                      :placeholder="`Dán API Key ${platform.name} vào đây...`"
                      class="w-full pl-3.5 pr-20 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-slate-800 dark:text-slate-100 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                      autocomplete="off"
                      @keydown.enter="handleSaveInlineKey(pId as string)"
                    >
                    <div class="absolute right-2 flex items-center gap-1">
                      <button
                        type="button"
                        @click="showProviderKeyInput[pId as string] = !showProviderKeyInput[pId as string]"
                        class="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                        :title="showProviderKeyInput[pId as string] ? 'Ẩn Key' : 'Hiện Key'"
                      >
                        <i :class="['fa-regular text-xs', showProviderKeyInput[pId as string] ? 'fa-eye-slash' : 'fa-eye']"></i>
                      </button>
                      <button
                        type="button"
                        @click="pasteProviderKey(pId as string)"
                        class="px-2 py-1 rounded-lg text-[10px] font-black text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 border border-blue-200/70 dark:border-blue-800/60 transition-colors cursor-pointer"
                      >
                        Dán
                      </button>
                    </div>
                  </div>
                  <button
                    @click="handleSaveInlineKey(pId as string)"
                    class="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer shrink-0"
                  >
                    <i class="fa-solid fa-floppy-disk"></i>
                    <span>Lưu & Kiểm tra</span>
                  </button>
                </div>
              </div>

              <!-- Configured Key Pills -->
              <div class="flex flex-wrap items-center gap-2 mt-3 sm:pl-13" v-if="configStore.keysStatus[pId]?.configured && pId !== 'pollinations'">
                <div
                  v-for="(maskedKey, idx) in (expandedProviderKeys[pId as string] ? configStore.keysStatus[pId]?.maskedList : configStore.keysStatus[pId]?.maskedList.slice(0, 4))"
                  :key="idx"
                  class="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 px-2.5 py-1 rounded-lg group"
                >
                  <span class="font-mono text-[11px] font-bold text-slate-700 dark:text-slate-300">{{ maskedKey }}</span>
                  <button
                    type="button"
                    @click="copyToClipboard(maskedKey)"
                    class="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors text-[10px] px-0.5 cursor-pointer"
                    title="Sao chép mã ẩn"
                  >
                    <i class="fa-regular fa-copy"></i>
                  </button>
                  <button
                    type="button"
                    @click="handleKeyDelete(pId as string, idx, maskedKey)"
                    class="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors text-[10px] px-0.5 cursor-pointer"
                    title="Xóa API Key này"
                  >
                    <i class="fa-solid fa-xmark"></i>
                  </button>
                </div>
                <button
                  v-if="(configStore.keysStatus[pId]?.count || 0) > 4"
                  @click="expandedProviderKeys[pId as string] = !expandedProviderKeys[pId as string]"
                  class="px-2.5 py-1 rounded-lg text-[10px] font-black text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 border border-blue-200/60 dark:border-blue-800/50 transition-colors cursor-pointer"
                >
                  {{ expandedProviderKeys[pId as string] ? 'Thu gọn' : `+${configStore.keysStatus[pId].count - 4} keys khác` }}
                </button>
              </div>

              <!-- Free pill for pollinations -->
              <div class="flex flex-wrap gap-2 mt-2.5 sm:pl-13" v-if="pId === 'pollinations'">
                <div class="flex items-center gap-1.5 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/50 px-2.5 py-1 rounded-lg">
                  <span class="font-mono text-[10px] font-bold text-emerald-700 dark:text-emerald-300">Không cần API Key — Tự động dự phòng thông minh</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 3. General AI Configuration & Cloud Key Sync -->
        <div class="space-y-2.5">
          <h4 class="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest px-1 flex items-center gap-1.5">
            <i class="fa-solid fa-sliders text-blue-600 dark:text-blue-400"></i> Cấu hình Mô hình & Đồng bộ Cloud
          </h4>

          <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 p-4 md:p-5 space-y-4">
            <!-- LLM Model -->
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <label class="text-xs font-black text-slate-800 dark:text-slate-100">Mô hình ngôn ngữ ưu tiên (Text LLM)</label>
                <p class="text-[10px] font-semibold text-slate-400 dark:text-slate-500">Tự động chuyển đổi dự phòng nếu mô hình chính quá tải</p>
              </div>
              <div class="relative w-full sm:w-64">
                <select :value="configStore.defaults.text" @change="handleTextModelChange" class="w-full pl-3.5 pr-8 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-100 text-xs focus:border-blue-600 outline-none transition-all appearance-none">
                  <option v-for="m in configStore.textModels" :key="m.id" :value="m.id">{{ m.name }} (Tier {{ m.tier }})</option>
                </select>
                <i class="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] pointer-events-none"></i>
              </div>
            </div>

            <!-- Vision Model -->
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <label class="text-xs font-black text-slate-800 dark:text-slate-100">Mô hình đọc ảnh & thực đơn (Vision)</label>
                <p class="text-[10px] font-semibold text-slate-400 dark:text-slate-500">Trích xuất ảnh chụp màn hình đặt bàn & biên lai chuyển khoản</p>
              </div>
              <div class="relative w-full sm:w-64">
                <select :value="configStore.defaults.vision" @change="handleVisionModelChange" class="w-full pl-3.5 pr-8 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-100 text-xs focus:border-blue-600 outline-none transition-all appearance-none">
                  <option v-for="m in configStore.visionModels" :key="m.id" :value="m.id">{{ m.name }} (Tier {{ m.tier }})</option>
                </select>
                <i class="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] pointer-events-none"></i>
              </div>
            </div>

            <!-- AI Workflow Mode Selection -->
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <label class="text-xs font-black text-slate-800 dark:text-slate-100">Quy trình điền dữ liệu AI</label>
                <p class="text-[10px] font-semibold text-slate-400 dark:text-slate-500">Chọn điền thẳng vào phiếu hoặc xem bảng đối chiếu trước</p>
              </div>
              <div class="relative w-full sm:w-64">
                <select :value="configStore.defaults.aiWorkflowMode || 'direct'" @change="handleWorkflowModeChange" class="w-full pl-3.5 pr-8 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-100 text-xs focus:border-blue-600 outline-none transition-all appearance-none">
                  <option value="direct">Điền trực tiếp vào phiếu (Nhanh)</option>
                  <option value="review">Xem lại trước khi điền (Chi tiết)</option>
                </select>
                <i class="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] pointer-events-none"></i>
              </div>
            </div>

            <!-- AI Auto Recognize Switch -->
            <div class="flex items-center justify-between pt-1">
              <div>
                <label class="text-xs font-black text-slate-800 dark:text-slate-100">Tự động nhận diện nhanh khi dán</label>
                <p class="text-[10px] font-semibold text-slate-400 dark:text-slate-500">Tự động kích hoạt AI ngay khi dán tin nhắn hoặc ảnh chụp</p>
              </div>
              <button 
                @click="configStore.defaults.enableAutoRecognize = !configStore.defaults.enableAutoRecognize"
                class="w-12 h-6 rounded-full transition-colors relative cursor-pointer shadow-inner shrink-0"
                :class="configStore.defaults.enableAutoRecognize ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-700'"
              >
                <div 
                  class="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform shadow-sm"
                  :class="configStore.defaults.enableAutoRecognize ? 'left-[26px]' : 'left-0.5'"
                ></div>
              </button>
            </div>

            <div class="h-[1px] bg-slate-100 dark:bg-slate-800 my-2"></div>

            <!-- Inline Cloud Key Sync -->
            <div class="bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/50 rounded-xl p-4 space-y-2.5">
              <div>
                <label class="text-xs font-black text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                  <i class="fa-solid fa-cloud-arrow-down"></i> Đồng bộ danh sách API Key từ Cloud (Admin)
                </label>
                <p class="text-[11px] font-medium text-slate-600 dark:text-slate-400 mt-0.5">
                  Nhập mật khẩu Admin để tải toàn bộ các API Key miễn phí đang hoạt động từ máy chủ về trình duyệt này.
                </p>
              </div>
              <div class="flex flex-col sm:flex-row gap-2">
                <div class="relative flex-1 flex items-center">
                  <input
                    v-model="configStore.borrowPass"
                    :type="showBorrowPass ? 'text' : 'password'"
                    placeholder="Nhập mật khẩu Admin để tải Keys..."
                    class="w-full pl-3.5 pr-10 py-2 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700/70 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 focus:border-amber-500 outline-none"
                    @keydown.enter="handleBorrowKeysInline"
                  >
                  <button
                    type="button"
                    @click="showBorrowPass = !showBorrowPass"
                    class="absolute right-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <i :class="['fa-regular text-xs', showBorrowPass ? 'fa-eye-slash' : 'fa-eye']"></i>
                  </button>
                </div>
                <button
                  @click="handleBorrowKeysInline"
                  class="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-black text-xs active:scale-95 transition-all shrink-0 cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                >
                  <i class="fa-solid fa-download"></i>
                  <span>Tải Keys về máy</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 4. Circuit Breaker / Cooldown Status -->
        <div v-if="cooldownList.length > 0" class="space-y-2.5">
          <h4 class="text-[11px] font-black text-rose-500 uppercase tracking-widest px-1 flex items-center gap-1.5">
            <i class="fa-solid fa-bolt"></i> Mô hình đang tạm nghỉ (Cooldown)
          </h4>
          <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-rose-200/80 dark:border-rose-900/50 p-4 space-y-3">
            <p class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 leading-relaxed">
              Các mô hình dưới đây vừa báo quá tải (Rate Limit) và đang được hệ thống tự động chuyển hướng sang mô hình dự phòng:
            </p>
            <div class="space-y-2">
              <div v-for="c in cooldownList" :key="c.modelId" class="flex items-center justify-between bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200/70 dark:border-rose-800/50 px-3 py-2 rounded-xl">
                <div class="flex items-center gap-2.5">
                  <i class="fa-solid fa-triangle-exclamation text-rose-500 text-xs animate-pulse"></i>
                  <div>
                    <div class="text-xs font-black text-slate-800 dark:text-slate-100">{{ getModelName(c.modelId) }}</div>
                    <div class="text-[10px] font-bold text-rose-600 dark:text-rose-400">{{ c.reason }}</div>
                  </div>
                </div>
                <span class="text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-lg">
                  Còn {{ c.remainingSeconds }}s
                </span>
              </div>
            </div>
            <div class="flex justify-end pt-1">
              <button @click="handleClearCooldowns" class="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-xl font-black text-[11px] active:scale-95 transition-all cursor-pointer">
                Kích hoạt lại toàn bộ
              </button>
            </div>
          </div>
        </div>

        <!-- 5. Menu Aliases Manager -->
        <div class="space-y-2.5">
          <div class="flex items-center justify-between px-1">
            <h4 class="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <i class="fa-solid fa-tags text-emerald-600 dark:text-emerald-400"></i> Từ viết tắt món ăn (Menu Aliases)
            </h4>
            <span class="text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-200/70 dark:bg-slate-800 px-2 py-0.5 rounded-full">
              {{ appStore.menuAliases?.length || 0 }} từ viết tắt
            </span>
          </div>
          
          <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 p-4 md:p-5 space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div class="sm:col-span-4 space-y-1.5">
                <label class="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">Từ viết tắt (VD: mxhs)</label>
                <input
                  v-model="newAliasText"
                  class="w-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 dark:text-slate-100 focus:border-blue-600 outline-none transition-all"
                  placeholder="Nhập từ viết tắt..."
                  @keydown.enter="handleAddAlias"
                >
              </div>
              <div class="sm:col-span-5 space-y-1.5">
                <label class="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">Món ăn tương ứng</label>
                <div class="relative">
                  <select v-model="selectedAliasDish" class="w-full pl-3.5 pr-8 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-100 text-xs focus:border-blue-600 outline-none transition-all appearance-none">
                    <option value="">-- Chọn món ăn --</option>
                    <option v-for="m in appStore.menuList" :key="m.name" :value="m.name">{{ m.name }}</option>
                  </select>
                  <i class="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] pointer-events-none"></i>
                </div>
              </div>
              <div class="sm:col-span-3">
                <button @click="handleAddAlias" class="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs active:scale-95 transition-all cursor-pointer shadow-xs">
                  + Thêm từ
                </button>
              </div>
            </div>

            <div v-if="appStore.menuAliases && appStore.menuAliases.length > 0" class="max-h-52 overflow-y-auto custom-scrollbar divide-y divide-slate-100 dark:divide-slate-800 border-t border-slate-100 dark:border-slate-800 pt-2">
              <div v-for="item in appStore.menuAliases" :key="item.alias" class="flex items-center justify-between py-2 px-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg transition-all">
                <div class="flex items-center gap-2.5 min-w-0">
                  <span class="font-mono text-xs font-black text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 border border-blue-200/60 dark:border-blue-800/60 px-2 py-0.5 rounded-md shrink-0">{{ item.alias }}</span>
                  <i class="fa-solid fa-arrow-right text-[10px] text-slate-400 shrink-0"></i>
                  <span class="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{{ item.dishName }}</span>
                </div>
                <button @click="handleDeleteAlias(item.alias)" class="w-8 h-8 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg flex items-center justify-center transition-colors active:scale-95 cursor-pointer shrink-0" title="Xóa từ viết tắt">
                  <i class="fa-regular fa-trash-can text-xs"></i>
                </button>
              </div>
            </div>
            <div v-else class="text-center py-3 border-t border-slate-100 dark:border-slate-800">
              <p class="text-[11px] font-semibold text-slate-400">Chưa có từ viết tắt nào được cấu hình</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>
