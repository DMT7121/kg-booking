import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './styles/main.css'

import { registerSW } from 'virtual:pwa-register'

const app = createApp(App)

// Tự động update Service Worker khi có phiên bản mới
registerSW({ immediate: true })
app.use(createPinia())
app.mount('#app')
