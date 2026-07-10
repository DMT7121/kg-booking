import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './styles/main.css'

import { registerSW } from 'virtual:pwa-register'

const app = createApp(App)

// Tự động update Service Worker khi có phiên bản mới
registerSW({ immediate: true })

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
