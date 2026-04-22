<script setup lang="ts">
import { ref, watch } from 'vue'
import { useUIStore } from '@/stores/useUIStore'

const ui = useUIStore()

const webhookUrl = ref('')
const telegramChatId = ref('')
const saving = ref(false)
const showGuide = ref(false)

// Load saved values when modal opens — try localStorage first, then fetch from server
watch(() => ui.showWebhookConfig, async (show) => {
  if (show) {
    showGuide.value = false
    // Try localStorage first
    webhookUrl.value = localStorage.getItem('kg_v400_webhookUrl') || ''
    telegramChatId.value = localStorage.getItem('kg_v400_telegramChatId') || ''
    
    // If empty, fetch from server (config may have been saved from another device)
    if (!webhookUrl.value) {
      try {
        const { getConfig } = await import('@/services/api')
        const res = await getConfig()
        if (res?.ok && res.data) {
          if (res.data.webhookUrl) {
            webhookUrl.value = String(res.data.webhookUrl)
            localStorage.setItem('kg_v400_webhookUrl', webhookUrl.value)
          }
          if (res.data.telegramChatId) {
            telegramChatId.value = String(res.data.telegramChatId)
            localStorage.setItem('kg_v400_telegramChatId', telegramChatId.value)
          }
        }
      } catch { /* offline, use empty */ }
    }
  }
})

async function saveWebhook() {
  if (!webhookUrl.value.trim()) {
    ui.showToast('Vui lòng nhập Webhook URL!', 'warning')
    return
  }

  const pass = await ui.showPrompt('Bảo mật', 'Nhập mật khẩu Admin:')
  if (pass === null) return

  saving.value = true
  try {
    const { saveConfig } = await import('@/services/api')
    const res = await saveConfig('', '', pass, webhookUrl.value.trim(), telegramChatId.value.trim())
    if (res.ok || res.message === 'Config Saved') {
      localStorage.setItem('kg_v400_webhookUrl', webhookUrl.value.trim())
      localStorage.setItem('kg_v400_telegramChatId', telegramChatId.value.trim())
      ui.showToast('✅ Đã lưu cấu hình thông báo!', 'success')
      ui.showWebhookConfig = false
    } else {
      ui.showToast(res.message || 'Lỗi khi lưu', 'error')
    }
  } catch (e: any) {
    ui.showToast('Lỗi: ' + e.message, 'error')
  } finally {
    saving.value = false
  }
}

function clearWebhook() {
  webhookUrl.value = ''
  telegramChatId.value = ''
  localStorage.removeItem('kg_v400_webhookUrl')
  localStorage.removeItem('kg_v400_telegramChatId')
  ui.showToast('Đã xóa cấu hình Webhook', 'info')
}
</script>

<template>
  <div v-if="ui.showWebhookConfig" class="fixed inset-0 bg-black/60 z-[10001] flex justify-center items-center p-3 backdrop-blur-sm" @click.self="ui.showWebhookConfig = false">
    <div class="bg-white rounded-2xl shadow-2xl w-[95%] max-w-[420px] overflow-hidden flex flex-col max-h-[90vh]">
      
      <!-- Header (compact) -->
      <div class="bg-gradient-to-r from-cyan-600 to-blue-600 px-5 py-4 text-white flex justify-between items-center flex-shrink-0">
        <div class="flex items-center gap-2">
          <i class="fa-solid fa-bell text-lg"></i>
          <div>
            <h3 class="text-base font-black uppercase tracking-tight leading-none">Thông Báo Telegram</h3>
            <p class="text-cyan-200 text-[9px] font-bold mt-0.5">Tự động gửi khi có đơn mới</p>
          </div>
        </div>
        <button @click="ui.showWebhookConfig = false" class="text-white/70 hover:text-white p-1"><i class="fa-solid fa-xmark text-lg"></i></button>
      </div>

      <!-- Body (scrollable) -->
      <div class="overflow-y-auto flex-grow p-5 space-y-4">
        
        <!-- Collapsible Guide -->
        <button @click="showGuide = !showGuide" class="w-full flex items-center justify-between px-3 py-2 bg-blue-50 rounded-xl text-blue-600 font-bold text-[11px] uppercase tracking-wider hover:bg-blue-100 transition-colors">
          <span><i class="fa-brands fa-telegram mr-1.5"></i>Hướng dẫn cài đặt</span>
          <i class="fa-solid fa-chevron-down text-[10px] transition-transform duration-200" :class="{ 'rotate-180': showGuide }"></i>
        </button>
        <div v-if="showGuide" class="bg-blue-50/50 border border-blue-100 rounded-xl p-3 space-y-1.5 text-[11px] text-blue-700 font-semibold">
          <div class="flex gap-2"><span class="bg-blue-200 text-blue-700 rounded-full w-5 h-5 flex items-center justify-center text-[9px] font-black flex-shrink-0">1</span><span>Mở Telegram → tìm <a href="https://t.me/BotFather" target="_blank" class="underline font-black">@BotFather</a> → tạo Bot mới → copy Token</span></div>
          <div class="flex gap-2"><span class="bg-blue-200 text-blue-700 rounded-full w-5 h-5 flex items-center justify-center text-[9px] font-black flex-shrink-0">2</span><span>Thêm Bot vào Group nhận thông báo</span></div>
          <div class="flex gap-2"><span class="bg-blue-200 text-blue-700 rounded-full w-5 h-5 flex items-center justify-center text-[9px] font-black flex-shrink-0">3</span><span>Truy cập <code class="bg-blue-100 px-1 rounded text-[10px]">api.telegram.org/bot{TOKEN}/getUpdates</code> → tìm <code class="bg-blue-100 px-1 rounded text-[10px]">chat.id</code></span></div>
          <div class="flex gap-2"><span class="bg-blue-200 text-blue-700 rounded-full w-5 h-5 flex items-center justify-center text-[9px] font-black flex-shrink-0">4</span><span>Dán URL bên dưới dạng: <code class="bg-blue-100 px-1 rounded text-[10px] break-all">https://api.telegram.org/bot{TOKEN}/sendMessage</code></span></div>
        </div>

        <!-- Webhook URL -->
        <div>
          <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1 block">Webhook URL <span class="text-red-400">*</span></label>
          <input v-model="webhookUrl" 
            class="w-full border-2 border-slate-100 rounded-xl px-3.5 py-2.5 text-[13px] font-bold focus:border-cyan-500 outline-none transition-colors placeholder:text-slate-300"
            placeholder="https://api.telegram.org/bot.../sendMessage">
        </div>

        <!-- Chat ID -->
        <div>
          <label class="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1 block">Telegram Chat ID</label>
          <input v-model="telegramChatId"
            class="w-full border-2 border-slate-100 rounded-xl px-3.5 py-2.5 text-[13px] font-bold focus:border-cyan-500 outline-none transition-colors placeholder:text-slate-300"
            placeholder="-1001234567890 (Group ID hoặc User ID)">
        </div>

        <!-- Status indicator -->
        <div class="flex items-center gap-2 px-1">
          <div class="w-2 h-2 rounded-full" :class="webhookUrl ? 'bg-emerald-500' : 'bg-slate-300'"></div>
          <span class="text-[10px] font-bold" :class="webhookUrl ? 'text-emerald-600' : 'text-slate-400'">
            {{ webhookUrl ? (webhookUrl.includes('telegram') ? '🤖 Telegram Bot' : '🔗 Custom Webhook') : 'Chưa cấu hình' }}
          </span>
          <button v-if="webhookUrl" @click="clearWebhook" class="ml-auto text-[9px] text-red-400 font-black uppercase hover:text-red-600 transition-colors">
            <i class="fa-solid fa-trash-can mr-0.5"></i> Xóa
          </button>
        </div>
      </div>

      <!-- Footer Buttons (fixed) -->
      <div class="px-5 pb-5 pt-3 border-t border-slate-100 flex-shrink-0">
        <button @click="saveWebhook" :disabled="saving || !webhookUrl.trim()"
          class="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-xl font-black uppercase tracking-widest text-[11px] shadow-lg hover:from-cyan-700 hover:to-blue-700 active:scale-[0.98] transition-all min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed">
          <i class="fa-solid fa-cloud-arrow-up mr-1.5"></i>
          {{ saving ? 'Đang lưu...' : 'Lưu & Đồng bộ' }}
        </button>
        <p class="text-[9px] text-center text-slate-400 font-bold mt-2">Cấu hình sẽ lưu trên Cloud • Có thể mượn lại bằng mật khẩu Admin</p>
      </div>
    </div>
  </div>
</template>
