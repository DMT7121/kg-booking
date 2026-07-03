<script setup lang="ts">
import { ref, watch } from 'vue'
import { useUIStore } from '@/stores/useUIStore'
import { useAppStore } from '@/stores/useAppStore'
import * as api from '@/services/api'

const ui = useUIStore()
const appStore = useAppStore()

const activeTab = ref('notifications') // 'notifications' | 'backup' | 'audit'

const webhookUrl = ref('')
const telegramChatId = ref('')
const showPortalMinigames = ref(false)
const saving = ref(false)
const showGuide = ref(false)

// Backup/Restore
const backups = ref<any[]>([])
const backupReason = ref('')
const loadingBackup = ref(false)

// Audit Log
const logs = ref<any[]>([])
const loadingLogs = ref(false)

// Load values on open
watch(() => ui.activeSettingModal, async (modal) => {
  if (modal === 'webhook') {
    activeTab.value = 'notifications'
    showGuide.value = false
    webhookUrl.value = localStorage.getItem('kg_v400_webhookUrl') || ''
    telegramChatId.value = localStorage.getItem('kg_v400_telegramChatId') || ''
    showPortalMinigames.value = localStorage.getItem('showPortalMinigames') === 'true'
    
    // Fetch values from server if needed
    fetchServerConfig()
    loadBackups()
    loadAuditLogs()
  }
})

async function fetchServerConfig() {
  try {
    const res = await api.getConfig()
    if (res?.ok && res.data) {
      if (res.data.webhookUrl) {
        webhookUrl.value = String(res.data.webhookUrl)
        localStorage.setItem('kg_v400_webhookUrl', webhookUrl.value)
      }
      if (res.data.telegramChatId) {
        telegramChatId.value = String(res.data.telegramChatId)
        localStorage.setItem('kg_v400_telegramChatId', telegramChatId.value)
      }
      if (res.data.showPortalMinigames !== undefined) {
        showPortalMinigames.value = String(res.data.showPortalMinigames) === 'true'
        localStorage.setItem('showPortalMinigames', String(showPortalMinigames.value))
      }
    }
  } catch { /* offline, use cache */ }
}

async function togglePortalMinigames() {
  const isAdmin = await appStore.verifyAdminSession()
  if (!isAdmin) return
  showPortalMinigames.value = !showPortalMinigames.value
}

async function loadBackups() {
  loadingBackup.value = true
  try {
    const res = await api.getSystemConfigBackups(appStore.adminToken)
    if (res.ok && res.backups) {
      backups.value = res.backups
    }
  } catch (e) {
    console.error('Lỗi tải backup:', e)
  } finally {
    loadingBackup.value = false
  }
}

async function loadAuditLogs() {
  loadingLogs.value = true
  try {
    const res = await api.getSystemConfigAuditLogs(appStore.adminToken)
    if (res.ok && res.logs) {
      logs.value = res.logs
    }
  } catch (e) {
    console.error('Lỗi tải nhật ký:', e)
  } finally {
    loadingLogs.value = false
  }
}

async function saveWebhook() {
  if (!webhookUrl.value.trim()) {
    ui.showToast('Vui lòng nhập Webhook URL!', 'warning')
    return
  }

  const isAdmin = await appStore.verifyAdminSession()
  if (!isAdmin) return

  saving.value = true
  try {
    const res = await api.saveConfig(
      undefined,
      undefined,
      undefined,
      webhookUrl.value.trim(),
      telegramChatId.value.trim(),
      appStore.adminToken,
      showPortalMinigames.value
    )
    if (res.ok || res.message === 'Config Saved') {
      localStorage.setItem('kg_v400_webhookUrl', webhookUrl.value.trim())
      localStorage.setItem('kg_v400_telegramChatId', telegramChatId.value.trim())
      localStorage.setItem('showPortalMinigames', String(showPortalMinigames.value))
      appStore.showPortalMinigames = showPortalMinigames.value
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

async function handleCreateBackup() {
  const isAdmin = await appStore.verifyAdminSession()
  if (!isAdmin) return

  loadingBackup.value = true
  try {
    const res = await api.backupSystemConfig(backupReason.value.trim() || 'Manual backup', appStore.adminToken)
    if (res.ok) {
      ui.showToast('✅ Đã tạo bản sao lưu cấu hình!', 'success')
      backupReason.value = ''
      await loadBackups()
    } else {
      ui.showToast(res.message || 'Lỗi tạo backup', 'error')
    }
  } catch (e: any) {
    ui.showToast('Lỗi: ' + e.message, 'error')
  } finally {
    loadingBackup.value = false
  }
}

async function handleRestore(backupId: string) {
  const confirmed = await ui.showConfirm('Xác nhận Khôi phục', `Bạn có chắc chắn muốn khôi phục cấu hình từ bản sao lưu ${backupId}?\nToàn bộ cấu hình hiện tại sẽ bị ghi đè.`)
  if (!confirmed) return

  const isAdmin = await appStore.verifyAdminSession()
  if (!isAdmin) return

  ui.loading.is = true
  ui.loading.msg = 'ĐANG KHÔI PHỤC CẤU HÌNH...'
  try {
    const res = await api.restoreSystemConfigBackup(backupId, appStore.adminToken)
    if (res.ok) {
      ui.showToast('✅ Khôi phục cấu hình thành công! Đang đồng bộ lại...', 'success')
      await appStore.fetchRemoteConfig()
    } else {
      ui.showToast(res.message || 'Lỗi khi khôi phục', 'error')
    }
  } catch (e: any) {
    ui.showToast('Lỗi: ' + e.message, 'error')
  } finally {
    ui.loading.is = false
  }
}

function formatTime(isoStr: string) {
  if (!isoStr) return ''
  try {
    const d = new Date(isoStr)
    return d.toLocaleString('vi-VN')
  } catch {
    return isoStr
  }
}
</script>

<template>
  <div v-if="ui.activeSettingModal === 'webhook'" class="flex flex-col h-full bg-slate-50 md:bg-white overflow-hidden w-full relative z-[1000] lg:z-10">
    
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-white shrink-0 shadow-sm relative z-20">
      <button @click="ui.closeConfig()" class="w-10 h-10 flex items-center justify-center text-blue-900 hover:bg-slate-50 rounded-full transition-colors active:scale-95">
        <i class="fa-solid fa-arrow-left text-xl"></i>
      </button>
      <div class="text-center flex-1">
        <h2 class="text-lg font-black text-blue-900">Cài đặt hệ thống</h2>
        <p class="text-[10px] font-bold text-slate-400 mt-0.5 uppercase tracking-wider">Cấu hình & Quản trị</p>
      </div>
      <button class="w-10 h-10 flex items-center justify-center text-blue-900 hover:bg-slate-50 rounded-full transition-colors">
        <i class="fa-regular fa-circle-question text-xl"></i>
      </button>
    </div>

    <!-- Navigation Tabs -->
    <div class="flex border-b border-slate-100 bg-white shrink-0">
      <button 
        @click="activeTab = 'notifications'" 
        :class="['flex-1 py-3 text-xs font-black uppercase tracking-wider text-center border-b-2 transition-all', activeTab === 'notifications' ? 'border-blue-900 text-blue-900 bg-blue-50/20' : 'border-transparent text-slate-400 hover:text-slate-600']"
      >
        <i class="fa-solid fa-bell mr-1"></i> Thông báo
      </button>
      <button 
        @click="activeTab = 'backup'" 
        :class="['flex-1 py-3 text-xs font-black uppercase tracking-wider text-center border-b-2 transition-all', activeTab === 'backup' ? 'border-blue-900 text-blue-900 bg-blue-50/20' : 'border-transparent text-slate-400 hover:text-slate-600']"
      >
        <i class="fa-solid fa-database mr-1"></i> Sao lưu
      </button>
      <button 
        @click="activeTab = 'audit'" 
        :class="['flex-1 py-3 text-xs font-black uppercase tracking-wider text-center border-b-2 transition-all', activeTab === 'audit' ? 'border-blue-900 text-blue-900 bg-blue-50/20' : 'border-transparent text-slate-400 hover:text-slate-600']"
      >
        <i class="fa-solid fa-clock-rotate-left mr-1"></i> Nhật ký
      </button>
    </div>

    <!-- Scrollable Content -->
    <div class="flex-1 overflow-y-auto custom-scrollbar bg-slate-50 md:bg-white p-4">
      <div class="max-w-2xl mx-auto w-full space-y-6 pb-20">
        
        <!-- TAB 1: Notifications -->
        <div v-if="activeTab === 'notifications'" class="space-y-6">
          <div class="text-center px-4 py-2">
            <p class="text-xs font-bold text-slate-500 leading-relaxed">Cấu hình Webhook gửi thông báo Telegram khi có khách hàng đặt bàn hoặc khi cập nhật đơn hàng.</p>
          </div>

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

          <div class="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-4">
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

            <!-- Portal Settings (Minigames & VIP card) -->
            <div class="space-y-2 pt-2 border-t border-slate-100">
              <label class="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Tính năng Portal khách hàng</label>
              <div class="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100">
                <div>
                  <div class="text-xs font-black text-slate-800">Vòng quay & Thẻ VIP</div>
                  <div class="text-[9px] text-slate-400 font-semibold mt-0.5">Hiển thị minigame Vòng quay may mắn và Thẻ thành viên trên Portal khách hàng</div>
                </div>
                <div class="w-12 flex justify-end">
                  <button @click="togglePortalMinigames" class="w-10 h-6 bg-slate-200 rounded-full relative transition-colors" :class="{'!bg-blue-500': showPortalMinigames}">
                    <div class="w-5 h-5 bg-white rounded-full absolute top-0.5 left-0.5 transition-transform shadow-sm" :class="{'translate-x-4': showPortalMinigames}"></div>
                  </button>
                </div>
              </div>
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

          <!-- Action Buttons -->
          <div class="flex gap-3 pt-4">
            <button @click="ui.closeConfig()" class="flex-1 py-3.5 bg-slate-100 text-slate-600 rounded-xl text-[15px] font-black active:scale-95 transition-all hover:bg-slate-200">
              Hủy
            </button>
            <button @click="saveWebhook" :disabled="saving || !webhookUrl.trim()"
              class="flex-[2] py-3.5 bg-blue-950 text-white rounded-xl text-[15px] font-black shadow-lg shadow-blue-900/20 active:scale-95 transition-all flex justify-center items-center gap-2 disabled:opacity-50">
              <i class="fa-solid fa-cloud-arrow-up text-lg text-white/80"></i>
              {{ saving ? 'Đang lưu...' : 'Lưu & Đồng bộ' }}
            </button>
          </div>
        </div>

        <!-- TAB 2: Backup & Restore -->
        <div v-if="activeTab === 'backup'" class="space-y-6">
          <div class="text-center px-4 py-2">
            <p class="text-xs font-bold text-slate-500 leading-relaxed">Tạo bản sao lưu và khôi phục cấu hình hệ thống một cách an toàn.</p>
          </div>

          <!-- Create Backup Form -->
          <div class="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-4">
            <h3 class="text-xs font-black text-slate-500 uppercase tracking-widest">Tạo sao lưu mới</h3>
            <div class="flex gap-2">
              <input v-model="backupReason" 
                class="flex-1 px-4 py-3 rounded-xl border border-slate-200 bg-white font-bold text-slate-800 text-sm focus:border-blue-900 outline-none transition-all placeholder-slate-300"
                placeholder="Nhập lý do sao lưu (VD: Trước khi đổi API Key)...">
              <button @click="handleCreateBackup" :disabled="loadingBackup"
                class="px-5 py-3.5 bg-blue-900 text-white rounded-xl font-black text-xs uppercase hover:bg-blue-800 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50">
                <i class="fa-solid fa-plus"></i> Sao lưu
              </button>
            </div>
          </div>

          <!-- Backups List -->
          <div class="space-y-3">
            <div class="flex justify-between items-center px-2">
              <h4 class="text-[11px] font-black text-slate-400 uppercase tracking-widest">Lịch sử bản sao lưu</h4>
              <button @click="loadBackups" class="text-blue-600 hover:underline text-xs font-bold flex items-center gap-1">
                <i class="fa-solid fa-rotate-right" :class="{'animate-spin': loadingBackup}"></i> Làm mới
              </button>
            </div>

            <div class="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden divide-y divide-slate-100">
              <div v-for="b in backups" :key="b.backupId" class="p-4 flex justify-between items-center hover:bg-slate-50/50 transition-colors">
                <div class="min-w-0 flex-1 pr-4">
                  <div class="flex items-center gap-2 mb-1">
                    <span class="font-mono text-xs font-black text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">{{ b.backupId }}</span>
                    <span class="text-[10px] font-bold text-slate-400">{{ formatTime(b.timestamp) }}</span>
                  </div>
                  <p class="text-[13px] font-bold text-slate-600 truncate">{{ b.reason }}</p>
                </div>
                <button @click="handleRestore(b.backupId)" class="px-3.5 py-2 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl text-xs font-black hover:bg-rose-100 transition-colors active:scale-95">
                  Khôi phục
                </button>
              </div>

              <div v-if="backups.length === 0" class="text-center py-10 text-slate-400">
                <i class="fa-solid fa-database text-3xl mb-2 text-slate-200"></i>
                <p class="text-xs font-bold">Chưa có bản sao lưu nào</p>
              </div>
            </div>
          </div>
        </div>

        <!-- TAB 3: Audit Log -->
        <div v-if="activeTab === 'audit'" class="space-y-6">
          <div class="flex justify-between items-center px-2">
            <h4 class="text-[11px] font-black text-slate-400 uppercase tracking-widest">Nhật ký thay đổi</h4>
            <button @click="loadAuditLogs" class="text-blue-600 hover:underline text-xs font-bold flex items-center gap-1">
              <i class="fa-solid fa-rotate-right" :class="{'animate-spin': loadingLogs}"></i> Làm mới
            </button>
          </div>

          <!-- Audit Log Table with proper anti-overflow scroll wrappers -->
          <div class="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div class="overflow-x-auto w-full custom-scrollbar">
              <table class="w-full text-left border-collapse min-w-[600px]">
                <thead>
                  <tr class="bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    <th class="px-4 py-3">Thời gian</th>
                    <th class="px-4 py-3">Người sửa</th>
                    <th class="px-4 py-3">Hành động</th>
                    <th class="px-4 py-3">Tham số/Khóa</th>
                    <th class="px-4 py-3">Trạng thái</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-50 text-slate-700 text-xs">
                  <tr v-for="(log, idx) in logs" :key="idx" class="hover:bg-slate-50/30 transition-colors">
                    <td class="px-4 py-3 font-medium whitespace-nowrap text-slate-400">{{ formatTime(log.timestamp) }}</td>
                    <td class="px-4 py-3"><span class="bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded border border-blue-100">{{ log.actor }}</span></td>
                    <td class="px-4 py-3"><span class="font-black" :class="log.action === 'upsert' ? 'text-blue-600' : 'text-slate-600'">{{ log.action }}</span></td>
                    <td class="px-4 py-3 font-mono text-[10px] text-slate-600">{{ log.targetKey }}</td>
                    <td class="px-4 py-3">
                      <span class="text-[10px] font-black uppercase px-2 py-0.5 rounded border" 
                        :class="log.status === 'SUCCESS' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'">
                        {{ log.status }}
                      </span>
                    </td>
                  </tr>
                  <tr v-if="logs.length === 0">
                    <td colspan="5" class="text-center py-10 text-slate-400">
                      <i class="fa-solid fa-clock-rotate-left text-3xl mb-2 text-slate-200 block"></i>
                      <span class="text-xs font-bold">Chưa có nhật ký ghi nhận</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
/* Ensure custom scrollbar looks good on webkit */
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #cbd5e1;
  border-radius: 10px;
}
</style>
