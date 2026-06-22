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

    // Save locally immediately
    keys[pId].push(keyVal)
    localStorage.setItem(CACHE_KEYS.KEYS, JSON.stringify(keys))
    tempKeys[pId] = ''
    uiStore.showToast(`Đã lưu cục bộ API Key ${PLATFORMS[pId].name}!`, 'success')

    // Asynchronously sync to cloud
    const appStore = useAppStore()
    api.saveApiKeyToCloud(pId, keyVal, '', appStore.adminToken)
      .then(data => {
        if (data.ok) {
          uiStore.showToast(`Đã đồng bộ API Key ${PLATFORMS[pId].name} lên Server!`, 'success')
          hydrateAiRuntimeConfig()
        } else if (!data.message?.toLowerCase().includes('trùng')) {
          console.warn(`Lỗi đồng bộ API Key lên Server: ${data.message}`)
        }
      })
      .catch((e: any) => {
        console.warn(`Không thể đồng bộ API Key lên Server: ${e.message}`)
      })
  }

  async function deleteApiKey(pId: string, idx: number) {
    if (keys[pId]) {
      keys[pId].splice(idx, 1)
      localStorage.setItem(CACHE_KEYS.KEYS, JSON.stringify(keys))
      uiStore.showToast('Đã xóa API Key cục bộ!', 'success')
    }

    const appStore = useAppStore()
    api.deleteApiKeyFromCloud(pId, idx, appStore.adminToken)
      .then(data => {
        if (data.ok) {
          hydrateAiRuntimeConfig()
        } else {
          console.warn(`Lỗi xóa API Key trên Server: ${data.message}`)
        }
      })
      .catch((e: any) => {
        console.warn(`Không thể đồng bộ yêu cầu xóa API Key lên Server: ${e.message}`)
      })
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

  async function autoLoadApiKeys() {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '/api'
      const sharedSecret = import.meta.env.VITE_APP_SHARED_SECRET || ''
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (sharedSecret) {
        headers['Authorization'] = `Bearer ${sharedSecret}`
      }
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'getSharedApiKeysWithoutPassword' })
      })
      if (res.ok) {
        const data = await res.json()
        if (data.ok && Array.isArray(data.keys)) {
          let updated = false
          data.keys.forEach((k: any) => {
            let pId = k.provider === 'gemini' ? 'google' : k.provider
            if (PLATFORMS[pId]) {
              if (!keys[pId]) keys[pId] = []
              if (!keys[pId].includes(k.key)) {
                keys[pId].push(k.key)
                updated = true
              }
            }
          })
          if (updated) {
            localStorage.setItem(CACHE_KEYS.KEYS, JSON.stringify(keys))
            console.log('[AI Config] Tự động tải và lưu sẵn các API Keys thành công!')
          }
        }
      }
    } catch (e) {
      console.warn('[AI Config] Không thể tự động tải API Keys từ Gateway:', e)
    }
  }

  // Tự động tải API Keys khi khởi chạy store
  autoLoadApiKeys()

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
    saveApiKey, deleteApiKey, borrowKeys: borrowKeys, hydrateAiRuntimeConfig, autoLoadApiKeys,
    saveBranding, handleLogoUpload
  }
})
