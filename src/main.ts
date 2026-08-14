import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './styles/main.css'

import { registerSW } from 'virtual:pwa-register'

const app = createApp(App)

// Tự động update Service Worker khi có phiên bản mới
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log('%c🔄 Phiên bản mới đã sẵn sàng! Đang cập nhật...', 'color: #f59e0b; font-weight: bold; font-size: 14px;')
    updateSW(true)
  },
  onOfflineReady() {
    console.log('%c✅ App sẵn sàng hoạt động offline', 'color: #22c55e; font-weight: bold;')
  }
})

if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload()
  })
}

const pinia = createPinia()
app.use(pinia)
app.mount('#app')

if (typeof window !== 'undefined') {
  (window as any).pinia = pinia
}

// === BUILD VERSION BANNER ===
// Hiện thông tin build mỗi khi tải trang — dùng DevTools Console để xác nhận phiên bản
try {
  const ts = typeof __BUILD_TIMESTAMP__ !== 'undefined' ? __BUILD_TIMESTAMP__ : 'dev'
  const hash = typeof __BUILD_HASH__ !== 'undefined' ? __BUILD_HASH__ : 'local'
  const buildDate = ts !== 'dev' ? new Date(ts) : null
  const formatted = buildDate
    ? buildDate.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : 'Development'

  console.log(
    `%c 🔥 KING'S GRILL v2.5.0-APEX %c Build: ${hash} %c ${formatted} `,
    'background: #0f172a; color: #fbbf24; font-weight: 900; font-size: 14px; padding: 6px 12px; border-radius: 8px 0 0 8px; font-family: monospace;',
    'background: #1e40af; color: #93c5fd; font-weight: 700; font-size: 12px; padding: 7px 10px; font-family: monospace;',
    'background: #059669; color: #d1fae5; font-weight: 700; font-size: 12px; padding: 7px 12px; border-radius: 0 8px 8px 0; font-family: monospace;'
  );

  // Expose cho kiểm tra nhanh: gõ __APP_BUILD trong Console
  (window as any).__APP_BUILD = { version: 'v2.5.0-APEX', timestamp: ts, hash, formatted }
} catch (_) { /* ignore in test */ }
