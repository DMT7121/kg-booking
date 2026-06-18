import { defineStore } from 'pinia'
import { ref, reactive, computed, watch } from 'vue'
import { PLATFORMS, AI_MODELS, CACHE_KEYS } from '@/utils/constants'
import { useUIStore } from './useUIStore'
import * as api from '@/services/api'
import { useAppStore } from './useAppStore'

export const useConfigStore = defineStore('config', () => {
  const uiStore = useUIStore()

  // --- Branding ---
  const branding = reactive(
    JSON.parse(localStorage.getItem(CACHE_KEYS.BRANDING) || '{"logo": null, "theme": "blue"}')
  )

  // Apply theme on load & live preview
  watch(() => branding.theme, (newTheme) => {
    if (newTheme && newTheme !== 'blue') {
      document.documentElement.setAttribute('data-theme', newTheme)
    } else {
      document.documentElement.removeAttribute('data-theme')
    }
  }, { immediate: true })

  // --- AI Keys (Platform-Centric) ---
  const savedKeys = JSON.parse(localStorage.getItem(CACHE_KEYS.KEYS) || '{}') as Record<string, string[]>
  Object.keys(PLATFORMS).forEach(pId => {
    if (!savedKeys[pId]) savedKeys[pId] = pId === 'pollinations' ? ['free'] : []
  })

  const keys = reactive<Record<string, string[]>>(savedKeys)
  const keysStatus = reactive<Record<string, { configured: boolean, count: number, maskedList: string[] }>>({})
  const defaultsObj = JSON.parse(localStorage.getItem(CACHE_KEYS.DEFAULTS) || '{"text":"llama-3.3-70b-versatile", "vision":"gemini-2.0-flash","aiWorkflowMode":"direct"}')
  if (!defaultsObj.aiWorkflowMode) defaultsObj.aiWorkflowMode = 'direct'

  // Validate and sanitize active model selections
  const validTextIds = AI_MODELS.filter(m => m.type === 'text').map(m => m.id)
  const validVisionIds = AI_MODELS.filter(m => m.type === 'vision').map(m => m.id)
  if (!validTextIds.includes(defaultsObj.text)) {
    defaultsObj.text = 'llama-3.3-70b-versatile'
  }
  if (!validVisionIds.includes(defaultsObj.vision)) {
    defaultsObj.vision = 'gemini-2.0-flash'
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

  // --- API Key Management ---
  async function saveApiKey(pId: string) {
    const keyVal = tempKeys[pId]?.trim()
    if (!keyVal) return

    if (!keys[pId]) keys[pId] = []
    if (keys[pId].includes(keyVal)) {
      tempKeys[pId] = ''
      uiStore.showToast('Key này đã tồn tại trên thiết bị, đã bỏ qua lưu mới!', 'info')
      return
    }

    const appStore = useAppStore()
    const isAuth = await appStore.verifyAdminSession()
    if (!isAuth) {
      uiStore.showToast('Chỉ lưu cấu hình trên máy này (Chưa đồng bộ Cloud)', 'warning')
      return
    }

    try {
      tempKeys[pId] = ''
      const data = await api.saveApiKeyToCloud(pId, keyVal, '', appStore.adminToken)
      if (data.ok) {
        uiStore.showToast(`Đã lưu & đồng bộ API Key ${PLATFORMS[pId].name} lên Server!`, 'success')
        await hydrateAiRuntimeConfig()
      } else {
        if (data.message?.toLowerCase().includes('trùng')) {
          uiStore.showToast('Key đã có sẵn trên Cloud, bỏ qua lưu trùng.', 'info')
        } else {
          uiStore.showToast(`Lỗi lưu API Key: ${data.message}`, 'error')
        }
      }
    } catch (e: any) {
      uiStore.showToast(`Lỗi đồng bộ API Key: ${e.message}`, 'error')
    }
  }

  async function deleteApiKey(pId: string, idx: number) {
    const appStore = useAppStore()
    const isAdmin = await appStore.verifyAdminSession()
    if (!isAdmin) return

    try {
      const data = await api.deleteApiKeyFromCloud(pId, idx, appStore.adminToken)
      if (data.ok) {
        uiStore.showToast('Đã xóa API Key thành công!', 'success')
        await hydrateAiRuntimeConfig()
      } else {
        uiStore.showToast(data.message || 'Xóa API Key thất bại', 'error')
      }
    } catch (e: any) {
      uiStore.showToast(`Lỗi: ${e.message}`, 'error')
    }
  }

  async function borrowKeys(pass?: string) {
    const actualPass = pass || borrowPass.value
    if (!actualPass) return uiStore.showToast('Nhập pass Admin hoặc Password Truy cập!', 'warning')
    try {
      const data = await api.borrowApiKeys(actualPass)
      if (data.ok) {
        let addedCount = 0
        data.keys.forEach((k: any) => {
          let pId = k.provider === 'gemini' ? 'google' : k.provider
          if (PLATFORMS[pId]) {
            if (!keys[pId]) keys[pId] = []
            if (!keys[pId].includes(k.key)) {
              keys[pId].push(k.key)
              addedCount++
            }
          }
        })
        localStorage.setItem(CACHE_KEYS.KEYS, JSON.stringify(keys))
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
      if (data.ok && data.keysStatus) {
        Object.keys(keysStatus).forEach(k => delete keysStatus[k])
        Object.keys(data.keysStatus).forEach(provider => {
          keysStatus[provider] = data.keysStatus[provider]
        })
        if (data.defaults) {
          defaults.text = data.defaults.text || defaults.text
          defaults.vision = data.defaults.vision || defaults.vision
        }
      }
    } catch (e) {
      console.error('Failed to load AI runtime config:', e)
    }
  }

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
    keys, keysStatus, defaults, visibleKeys, tempKeys, borrowPass,
    textModels, visionModels, totalKeyCount, totalKeysHasData,
    getKeyCount, toggleKeyVisibility,
    saveApiKey, deleteApiKey, borrowKeys: borrowKeys, hydrateAiRuntimeConfig,
    saveBranding, handleLogoUpload
  }
})
