import { defineStore } from 'pinia'
import { ref, reactive, computed, watch } from 'vue'
import { PLATFORMS, AI_MODELS, CACHE_KEYS } from '@/utils/constants'
import { useUIStore } from './useUIStore'
import * as api from '@/services/api'
import { useAppStore } from './useAppStore'
import * as localKeyVault from '@/services/security/localKeyVault'

export const useConfigStore = defineStore('config', () => {
  const uiStore = useUIStore()

  // --- Branding ---
  const branding = reactive({
    logo: null,
    theme: 'blue',
    glassEnabled: true,
    animations: 'normal',
    buttonHaptic: 'standard',
    glowEffects: true,
    soundEffects: false,
    ...JSON.parse(localStorage.getItem(CACHE_KEYS.BRANDING) || '{}')
  })

  // Apply theme on load & live preview
  watch(() => branding.theme, (newTheme) => {
    if (newTheme && newTheme !== 'blue') {
      document.documentElement.setAttribute('data-theme', newTheme)
    } else {
      document.documentElement.removeAttribute('data-theme')
    }
  }, { immediate: true })

  // Apply other branding options
  watch(() => branding.glassEnabled, (val) => {
    if (val === false) {
      document.documentElement.classList.add('no-glass')
    } else {
      document.documentElement.classList.remove('no-glass')
    }
  }, { immediate: true })

  watch(() => branding.animations, (val) => {
    document.documentElement.classList.remove('anim-none', 'anim-fast')
    if (val === 'none') {
      document.documentElement.classList.add('anim-none')
    } else if (val === 'fast') {
      document.documentElement.classList.add('anim-fast')
    }
  }, { immediate: true })

  watch(() => branding.glowEffects, (val) => {
    if (val) {
      document.documentElement.classList.add('glow-active')
    } else {
      document.documentElement.classList.remove('glow-active')
    }
  }, { immediate: true })

  watch(() => branding.buttonHaptic, (val) => {
    document.documentElement.classList.remove('haptic-extra', 'haptic-none')
    if (val === 'extra') {
      document.documentElement.classList.add('haptic-extra')
    } else if (val === 'none') {
      document.documentElement.classList.add('haptic-none')
    }
  }, { immediate: true })

  // Global click sound listener for micro-interactions
  if (typeof window !== 'undefined') {
    window.addEventListener('click', (e) => {
      if (branding.soundEffects) {
        const target = e.target as HTMLElement
        const isInteractive = target.closest('button') || 
                              target.closest('a') || 
                              target.closest('.cursor-pointer') || 
                              target.closest('input[type="checkbox"]') ||
                              target.closest('select') ||
                              target.closest('.interactive-item')
        if (isInteractive) {
          import('@/utils/audio').then(m => m.sound.playPop())
        }
      }
    })
  }

  // --- AI Keys (Decoupled & Encrypted Local Vault) ---
  const keysStatus = reactive<Record<string, { configured: boolean, count: number, maskedList: string[] }>>({})
  const gatewayProviderStatus = reactive<Record<string, { configured: boolean }>>({})
  
  const isVaultInitialized = ref(false)
  const isVaultUnlocked = ref(false)
  const vaultUnlockMode = ref<'device' | 'passphrase' | null>(null)

  const defaultsObj = JSON.parse(localStorage.getItem(CACHE_KEYS.DEFAULTS) || '{"text":"gemini-2.5-flash", "vision":"gemini-2.5-flash","aiWorkflowMode":"direct"}')
  if (!defaultsObj.aiWorkflowMode) defaultsObj.aiWorkflowMode = 'direct'

  // Validate and sanitize active model selections
  const validTextIds = AI_MODELS.filter(m => m.type === 'text').map(m => m.id)
  const validVisionIds = AI_MODELS.filter(m => m.type === 'vision').map(m => m.id)
  if (!validTextIds.includes(defaultsObj.text)) {
    defaultsObj.text = 'gemini-2.5-flash'
  }
  if (!validVisionIds.includes(defaultsObj.vision)) {
    defaultsObj.vision = 'gemini-2.5-flash'
  }

  const defaults = reactive(defaultsObj)
  const visibleKeys = reactive<Record<string, boolean>>({})
  const tempKeys = reactive<Record<string, string>>({})
  const borrowPass = ref('')

  // Init temp keys
  Object.keys(PLATFORMS).forEach(pId => { tempKeys[pId] = '' })

  // Auto-save defaults
  watch(() => defaults, (val) => {
    localStorage.setItem(CACHE_KEYS.DEFAULTS, JSON.stringify(val))
  }, { deep: true })

  async function refreshVaultState() {
    await localKeyVault.tryAutoUnlockFromSession()
    isVaultInitialized.value = await localKeyVault.isVaultInitialized()
    isVaultUnlocked.value = localKeyVault.isUnlocked()
    vaultUnlockMode.value = localKeyVault.getUnlockMode()

    // Run legacy keys migration if unlocked
    if (isVaultUnlocked.value) {
      try {
        const { migrateLegacyKeys } = await import('@/services/security/localKeyVaultMigration')
        const migrationRes = await migrateLegacyKeys()
        if (migrationRes.migrated && migrationRes.count > 0) {
          uiStore.showToast(`Đã tự động chuyển đổi thành công ${migrationRes.count} keys cũ sang két sắt bảo mật!`, 'success')
        }
      } catch (e) {
        console.error('Auto migration failed:', e)
      }
    }

    const meta = await localKeyVault.getMetadata()
    Object.keys(PLATFORMS).forEach(pId => {
      if (pId === 'pollinations') {
        keysStatus[pId] = { configured: true, count: 1, maskedList: ['free'] }
      } else {
        const providerMeta = meta[pId]
        keysStatus[pId] = {
          configured: !!(providerMeta && providerMeta.count > 0),
          count: providerMeta ? providerMeta.count : 0,
          maskedList: providerMeta ? providerMeta.maskedList : []
        }
      }
    })
  }

  // --- Computed ---
  const textModels = computed(() => AI_MODELS.filter(m => m.type === 'text').sort((a, b) => a.tier - b.tier))
  const visionModels = computed(() => AI_MODELS.filter(m => m.type === 'vision').sort((a, b) => a.tier - b.tier))
  const totalKeyCount = computed(() => {
    return Object.values(keysStatus).reduce((a, b) => a + (b?.count || 0), 0)
  })
  const totalKeysHasData = computed(() => {
    return Object.values(keysStatus).some(status => status.configured)
  })

  function getKeyCount(pId: string): number {
    return keysStatus[pId]?.count || 0
  }

  function toggleKeyVisibility(pId: string, idx: number) {
    visibleKeys[`${pId}_${idx}`] = !visibleKeys[`${pId}_${idx}`]
  }

  // --- Vault Lifecycle Actions ---
  async function initializeVault(mode: 'device' | 'passphrase', credential?: string) {
    await localKeyVault.initialize(mode, credential)
    await refreshVaultState()
    uiStore.showToast('Két sắt bảo mật đã được khởi tạo!', 'success')
  }

  async function unlockVault(credential?: string) {
    await localKeyVault.unlock(credential)
    await refreshVaultState()
    uiStore.showToast('Két sắt đã được mở khóa!', 'success')
  }

  function lockVault() {
    localKeyVault.lock()
    refreshVaultState()
    uiStore.showToast('Két sắt đã khóa!', 'info')
  }

  // --- API Key Management ---
  async function saveApiKey(pId: string) {
    const keyVal = tempKeys[pId]?.trim()
    if (!keyVal) return

    if (!localKeyVault.isUnlocked()) {
      uiStore.showToast('Vui lòng mở khóa két sắt trước khi lưu key!', 'warning')
      return
    }

    try {
      await localKeyVault.addKey(pId, keyVal)
      tempKeys[pId] = ''
      uiStore.showToast(`Đã lưu cục bộ API Key ${PLATFORMS[pId].name} vào két sắt!`, 'success')
      await refreshVaultState()
    } catch (e: any) {
      uiStore.showToast(`Không thể lưu key: ${e.message}`, 'error')
    }
  }

  async function deleteApiKey(pId: string, idx: number) {
    if (!localKeyVault.isUnlocked()) {
      uiStore.showToast('Vui lòng mở khóa két sắt để xóa key!', 'warning')
      return
    }

    try {
      await localKeyVault.removeKey(pId, idx)
      uiStore.showToast('Đã xóa API Key khỏi két sắt!', 'success')
      await refreshVaultState()
    } catch (e: any) {
      uiStore.showToast(`Không thể xóa key: ${e.message}`, 'error')
    }
  }

  async function borrowKeys(pass?: string) {
    const actualPass = pass || borrowPass.value
    if (!actualPass) return uiStore.showToast('Nhập pass Admin hoặc Password Truy cập!', 'warning')
    
    if (!localKeyVault.isUnlocked()) {
      return uiStore.showToast('Vui lòng mở khóa két sắt để nhập keys!', 'warning')
    }

    try {
      const data = await api.borrowApiKeys(actualPass)
      if (data.ok && Array.isArray(data.keys)) {
        let addedCount = 0
        for (const k of data.keys) {
          let pId = k.provider === 'gemini' ? 'google' : k.provider
          if (PLATFORMS[pId]) {
            const currentKeys = await localKeyVault.getKeysForProvider(pId)
            if (!currentKeys.includes(k.key)) {
              await localKeyVault.addKey(pId, k.key)
              addedCount++
            }
          }
        }
        await refreshVaultState()
        uiStore.showToast(`Đã tải thành công ${data.keys.length} Keys từ hệ thống! (Mới: ${addedCount})`, 'success', 5000)
        borrowPass.value = ''
      } else {
        uiStore.showToast(data.message || 'Mật khẩu không đúng hoặc quyền bị từ chối!', 'error')
      }
    } catch (e: any) {
      console.error(e)
    }
  }

  async function hydrateAiRuntimeConfig() {
    try {
      const data = await api.getAiRuntimeConfig()
      if (data.ok) {
        if (data.keysStatus) {
          Object.keys(gatewayProviderStatus).forEach(k => delete gatewayProviderStatus[k])
          Object.keys(data.keysStatus).forEach(provider => {
            gatewayProviderStatus[provider] = {
              configured: !!data.keysStatus[provider]?.configured
            }
          })
        }
        if (data.defaults) {
          defaults.text = data.defaults.text || defaults.text
          defaults.vision = data.defaults.vision || defaults.vision
        }
      }
    } catch (e) {
      console.error('Failed to load AI runtime config:', e)
    }
  }

  async function autoImportKeys() {
    try {
      const isInit = await localKeyVault.isVaultInitialized()
      if (!isInit) {
        console.log('[Vault] Auto-initializing vault in device mode...')
        await localKeyVault.initialize('device')
      }
      
      await localKeyVault.tryAutoUnlockFromSession()
      
      if (localKeyVault.isUnlocked()) {
        const meta = await localKeyVault.getMetadata()
        const totalKeys = Object.values(meta).reduce((sum, p) => sum + (p?.count || 0), 0)
        
        if (totalKeys === 0) {
          console.log('[Vault] Auto-importing keys from server...')
          const data = await api.getSharedApiKeysWithoutPassword()
          if (data.ok && Array.isArray(data.keys)) {
            let addedCount = 0
            for (const k of data.keys) {
              let pId = k.provider === 'gemini' ? 'google' : k.provider
              if (PLATFORMS[pId]) {
                const currentKeys = await localKeyVault.getKeysForProvider(pId)
                if (!currentKeys.includes(k.key)) {
                  await localKeyVault.addKey(pId, k.key)
                  addedCount++
                }
              }
            }
            if (addedCount > 0) {
              console.log(`[Vault] Successfully auto-imported ${addedCount} keys!`)
              await refreshVaultState()
            }
          }
        }
      }
    } catch (e) {
      console.warn('[Vault] Auto key import failed:', e)
    }
  }

  // Tải trạng thái ban đầu của Vault và tự động nạp keys
  refreshVaultState().then(() => {
    autoImportKeys()
  })

  // --- Branding ---
  function saveBranding() {
    try {
      localStorage.setItem(CACHE_KEYS.BRANDING, JSON.stringify(branding))
      uiStore.showToast('Đã lưu giao diện!', 'success')
      uiStore.showBrandingConfig = false
    } catch (e) {
      uiStore.showToast('Dung lượng ảnh vượt quá giới hạn trình duyệt. Thử cập nhật ảnh nhỏ hơn!', 'error')
      console.error('Storage limit exceeded:', e)
    }
  }

  function handleLogoUpload(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0]
    if (f) {
      const r = new FileReader()
      r.onload = (ev) => { 
        const result = ev.target?.result as string
        const img = new Image()
        img.onload = () => {
          const MAX_HEIGHT = 400
          let width = img.width
          let height = img.height

          if (height > MAX_HEIGHT) {
            width = Math.floor(width * (MAX_HEIGHT / height))
            height = MAX_HEIGHT
          }

          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height)
            branding.logo = canvas.toDataURL('image/webp', 0.8)
          } else {
            branding.logo = result
          }
        }
        img.src = result
      }
      r.readAsDataURL(f)
    }
  }

  return {
    branding,
    keysStatus, gatewayProviderStatus, defaults, visibleKeys, tempKeys, borrowPass,
    isVaultInitialized, isVaultUnlocked, vaultUnlockMode,
    initializeVault, unlockVault, lockVault, refreshVaultState,
    textModels, visionModels, totalKeyCount, totalKeysHasData,
    getKeyCount, toggleKeyVisibility,
    saveApiKey, deleteApiKey, borrowKeys: borrowKeys, hydrateAiRuntimeConfig,
    saveBranding, handleLogoUpload
  }
})
