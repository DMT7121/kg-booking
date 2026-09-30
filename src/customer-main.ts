import { createApp } from 'vue'
import { createPinia } from 'pinia'
import CustomerApp from './CustomerApp.vue'
import './styles/main.css'

const app = createApp(CustomerApp)
const pinia = createPinia()

app.use(pinia)
app.mount('#app')

// Console branding
try {
  console.log(
    `%c 👑 KING'S GRILL %c Đặt Bàn Trực Tuyến `,
    'background: #0f172a; color: #fbbf24; font-weight: 900; font-size: 13px; padding: 4px 10px; border-radius: 6px 0 0 6px;',
    'background: #d97706; color: #ffffff; font-weight: 700; font-size: 13px; padding: 4px 10px; border-radius: 0 6px 6px 0;'
  )
} catch (_) {}
