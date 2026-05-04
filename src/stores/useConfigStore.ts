import { defineStore } from 'pinia'
import { ref, reactive, computed, watch } from 'vue'
import { PLATFORMS, AI_MODELS, CACHE_KEYS } from '@/utils/constants'
import { useUIStore } from './useUIStore'
import * as api from '@/services/api'

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
  const defaults = reactive(
    JSON.parse(localStorage.getItem(CACHE_KEYS.DEFAULTS) || '{"text":"openai/gpt-oss-120b", "vision":"gemini-2.5-flash"}')
  )
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
  const totalKeyCount = computed(() => Object.values(keys).reduce((a, b) => a + (b?.length || 0), 0))
  const totalKeysHasData = computed(() => totalKeyCount.value > 1)

  function getKeyCount(pId: string): number {
    return keys[pId]?.length || 0
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

    const adminPass = await uiStore.showPrompt('Đồng bộ Cloud', 'Nhập Pass Admin để đồng bộ Key lên hệ thống (để trống nếu chỉ muốn lưu trên trình duyệt này):')

    uiStore.loading.is = true
    uiStore.loading.msg = adminPass ? 'ĐANG ĐỒNG BỘ LÊN MÁY CHỦ...' : 'ĐANG LƯU CỤC BỘ...'
    try {
      keys[pId].push(keyVal)
      tempKeys[pId] = ''
      localStorage.setItem(CACHE_KEYS.KEYS, JSON.stringify(keys))

      if (adminPass) {
        const data = await api.saveApiKeyToCloud(pId, keyVal, adminPass)
        if (data.ok) {
          uiStore.showToast(`Đã lưu & đồng bộ API Key ${PLATFORMS[pId].name} lên Server!`, 'success')
        } else {
          if (data.message?.toLowerCase().includes('trùng')) {
            uiStore.showToast('Key đã có sẵn trên Cloud, bỏ qua lưu trùng.', 'info')
          } else {
            uiStore.showToast(`Lưu cục bộ OK nhưng đồng bộ Cloud bị lỗi: ${data.message}`, 'warning')
          }
        }
      } else {
        uiStore.showToast('Đã lưu cục bộ an toàn (Chưa đồng bộ lên Cloud).', 'success')
      }
    } catch {
      uiStore.showToast('Lưu hoàn tất (Có lỗi mạng trong quá trình đồng bộ)', 'warning')
    } finally {
      uiStore.loading.is = false
    }
  }

  function deleteApiKey(pId: string, idx: number) {
    keys[pId].splice(idx, 1)
    localStorage.setItem(CACHE_KEYS.KEYS, JSON.stringify(keys))
  }

  async function borrowKeys() {
    if (!borrowPass.value) return uiStore.showToast('Nhập pass Admin hoặc Password Truy cập!', 'warning')
    uiStore.loading.is = true
    uiStore.loading.msg = 'ĐANG KẾT NỐI SERVER TẢI KEYS...'
    try {
      const data = await api.borrowApiKeys(borrowPass.value)
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
    } catch {
      uiStore.showToast('Lỗi kết nối máy chủ', 'error')
    } finally {
      uiStore.loading.is = false
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
    keys, defaults, visibleKeys, tempKeys, borrowPass,
    textModels, visionModels, totalKeyCount, totalKeysHasData,
    getKeyCount, toggleKeyVisibility,
    saveApiKey, deleteApiKey, borrowKeys: borrowKeys,
    saveBranding, handleLogoUpload
  }
})
