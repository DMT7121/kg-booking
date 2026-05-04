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
  <div v-if="ui.showWebhookConfig" class="fixed inset-0 bg-blue-950/80 z-[12000] flex justify-center items-center p-4 backdrop-blur-md" @click.self="ui.showWebhookConfig = false">
    <div class="bg-white rounded-3xl shadow-2xl p-6 md:p-8 max-w-md w-[95%] md:w-full flex flex-col relative overflow-hidden border border-white/20 max-h-[90vh]">
      
      <!-- Header BG Decoration -->
      <div class="absolute top-0 left-0 right-0 h-24 bg-gradient-to-r from-blue-600 to-blue-900 rounded-t-3xl opacity-10"></div>

      <div class="flex justify-between items-center mb-6 relative z-10">
        <h3 class="text-2xl font-black text-blue-900 uppercase tracking-tighter flex items-center gap-3">
          <div class="w-10 h-10 bg-cyan-50 rounded-xl flex items-center justify-center text-cyan-600">
            <i class="fa-solid fa-bell"></i>
          </div>
          Thông Báo
        </h3>
        <button @click="ui.showWebhookConfig = false" class="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl hover:bg-red-50 hover:text-red-500 transition-all flex items-center justify-center shrink-0 shadow-sm border border-slate-100">
          <i class="fa-solid fa-xmark text-xl"></i>
        </button>
      </div>

      <div class="overflow-y-auto custom-scrollbar pr-1 relative z-10 flex-grow space-y-5">
        
        <!-- Collapsible Guide -->
        <button @click="showGuide = !showGuide" class="w-full flex items-center justify-between px-4 py-3 bg-blue-50 rounded-2xl text-blue-600 font-black text-xs uppercase tracking-wider hover:bg-blue-100 transition-colors shadow-sm">
          <span><i class="fa-brands fa-telegram mr-2"></i>Hướng dẫn cài đặt Telegram</span>
          <i class="fa-solid fa-chevron-down text-[10px] transition-transform duration-200" :class="{ 'rotate-180': showGuide }"></i>
        </button>
        <div v-if="showGuide" class="bg-blue-50/50 border border-blue-100 rounded-2xl p-4 space-y-2 text-[11px] text-blue-800 font-bold">
          <div class="flex gap-3"><span class="bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[9px] font-black flex-shrink-0 shadow-sm">1</span><span class="mt-0.5">Mở Telegram → tìm <a href="https://t.me/BotFather" target="_blank" class="underline font-black text-blue-900">@BotFather</a> → tạo Bot mới → copy Token</span></div>
          <div class="flex gap-3"><span class="bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[9px] font-black flex-shrink-0 shadow-sm">2</span><span class="mt-0.5">Thêm Bot vào Group nhận thông báo</span></div>
          <div class="flex gap-3"><span class="bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[9px] font-black flex-shrink-0 shadow-sm">3</span><span class="mt-0.5">Truy cập <code class="bg-white border border-blue-200 px-1.5 py-0.5 rounded text-[10px] shadow-sm">api.telegram.org/bot{TOKEN}/getUpdates</code> → tìm <code class="bg-white border border-blue-200 px-1.5 py-0.5 rounded text-[10px] shadow-sm">chat.id</code></span></div>
          <div class="flex gap-3"><span class="bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[9px] font-black flex-shrink-0 shadow-sm">4</span><span class="mt-0.5">Dán URL bên dưới dạng: <code class="bg-white border border-blue-200 px-1.5 py-0.5 rounded text-[10px] break-all shadow-sm">https://api.telegram.org/bot{TOKEN}/sendMessage</code></span></div>
        </div>

        <div class="bg-slate-50 rounded-2xl p-5 border border-slate-100 shadow-sm space-y-4">
          <!-- Webhook URL -->
          <div class="space-y-2">
            <label class="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Webhook URL <span class="text-rose-500">*</span></label>
            <input v-model="webhookUrl" 
              class="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white font-mono font-bold text-slate-800 text-sm focus:border-blue-900 focus:ring-4 focus:ring-blue-50 outline-none transition-all placeholder-slate-300"
              placeholder="https://api.telegram.org/bot.../sendMessage">
          </div>

          <!-- Chat ID -->
          <div class="space-y-2">
            <label class="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Telegram Chat ID</label>
            <input v-model="telegramChatId"
              class="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white font-mono font-bold text-slate-800 text-sm focus:border-blue-900 focus:ring-4 focus:ring-blue-50 outline-none transition-all placeholder-slate-300"
              placeholder="-1001234567890 (Group ID hoặc User ID)">
          </div>

          <!-- Status indicator -->
          <div class="flex items-center gap-2 pt-2 border-t border-slate-200/50 mt-2">
            <div class="w-2.5 h-2.5 rounded-full shadow-sm" :class="webhookUrl ? 'bg-emerald-500' : 'bg-slate-300'"></div>
            <span class="text-[10px] font-black uppercase tracking-widest" :class="webhookUrl ? 'text-emerald-600' : 'text-slate-400'">
              {{ webhookUrl ? (webhookUrl.includes('telegram') ? '🤖 Telegram Bot' : '🔗 Custom Webhook') : 'Chưa cấu hình' }}
            </span>
            <button v-if="webhookUrl" @click="clearWebhook" class="ml-auto text-[10px] text-rose-400 font-black uppercase hover:text-rose-600 transition-colors bg-white px-3 py-1 rounded-lg border border-rose-100 shadow-sm">
              <i class="fa-solid fa-trash-can mr-1"></i> Xóa
            </button>
          </div>
        </div>

        <button @click="saveWebhook" :disabled="saving || !webhookUrl.trim()"
          class="w-full py-4 bg-blue-900 text-white rounded-xl font-black uppercase tracking-widest text-[11px] shadow-lg shadow-blue-900/20 active:scale-95 transition-all flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
          <i class="fa-solid fa-cloud-arrow-up text-lg text-white/80"></i>
          {{ saving ? 'ĐANG LƯU...' : 'LƯU & ĐỒNG BỘ' }}
        </button>
        <p class="text-[10px] text-center text-slate-400 font-bold tracking-wide">Cấu hình sẽ lưu trên Cloud • Có thể lấy lại bằng mật khẩu Admin</p>
      </div>
    </div>
  </div>
</template>
