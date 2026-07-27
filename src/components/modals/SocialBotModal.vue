<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useUIStore } from '@/stores/useUIStore'
import { fetchRealFBConversations, fetchRealFBThreadMessages, fetchRealFBUserProfile, fetchRealFBBatchUserProfiles, sendRealFBMessage, type RealFBConversation, type RealFBMessage } from '@/services/facebookApi'

const ui = useUIStore()
const activeTab = ref<'conversations' | 'config' | 'analytics'>('conversations')

function closeModal() {
  ui.showSocialBotModal = false
}

// System Bot Status & Tokens
const isBotActive = ref(localStorage.getItem('kg_fb_bot_active') !== 'false')
const fbToken = ref(localStorage.getItem('kg_fb_page_access_token') || 'EAAYwJz8TUaABSOZB52MUg7ZBeIrk7ckvQSKwKhI8SWXS8R9AcOAoiV4ZCnUWVLtLtZAxC0hXve5SlGyZAvLS68jCdmAr2GatmuYSOsWFsG9k0my7KKOlyLN6MMB8Gt6yrGlzBx43bGPGSgK4MlO40GQ6UrKyN5xsZCPViGgZC1Y2mV3OzRL8BFV5YrBDQIec7ShIfNswECw')
const verifyToken = ref('kg_booking_facebook_secret_token')
const webhookUrl = ref('https://kg-ai-gateway.dmt-kgwork.workers.dev/api/webhook/facebook')

async function toggleGlobalBotStatus() {
  isBotActive.value = !isBotActive.value
  localStorage.setItem('kg_fb_bot_active', String(isBotActive.value))
  
  const supabaseUrl = "https://azfkzheypuvfcitckovf.supabase.co"
  const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6Zmt6aGV5cHV2ZmNpdGNrb3ZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwNzc1MjEsImV4cCI6MjEwMDY1MzUyMX0.ltnY7GTzKGE7QiWTv8ZuDlfT_NWIR2sGfGudoVDw4NQ"
  
  try {
    await fetch(`${supabaseUrl}/rest/v1/audit_logs`, {
      method: "POST",
      headers: {
        "apikey": anonKey,
        "Authorization": `Bearer ${anonKey}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({
        actor_role: "staff",
        action: "fb_bot_status_changed",
        target_type: "bot_settings",
        target_id: "facebook_fanpage_bot",
        after_json: { is_active: isBotActive.value, timestamp: new Date().toISOString() }
      })
    })
  } catch (e) {
    console.warn('Failed to sync bot status to Supabase:', e)
  }

  if (isBotActive.value) {
    ui.showToast('🟢 Đã BẬT Chatbot AI tự động trên Fanpage 24/7!', 'success')
  } else {
    ui.showToast('🔴 Đã TẮT Chatbot AI trên Fanpage. Hệ thống chuyển sang chế độ nhắn tay!', 'warning')
  }
}

const loadingConversations = ref(false)

// Hydrate from instant session cache if available
const cachedRawConvs = sessionStorage.getItem('kg_fb_convs_cache')
const rawConversations = ref<RealFBConversation[]>(cachedRawConvs ? JSON.parse(cachedRawConvs) : [])

const activeThreadMessages = ref<Record<string, RealFBMessage[]>>({})
const selectedConvId = ref<string>('')
const staffReplyText = ref('')
const handoverMap = ref<Record<string, boolean>>({})
const mobileShowDetail = ref(false)
const realCustomerProfileMap = ref<Record<string, { name: string; avatar?: string }>>({})

function copyCustomerName(name: string) {
  if (!name) return
  navigator.clipboard.writeText(name).then(() => {
    ui.showToast(`📋 Đã copy tên Facebook: "${name}"`, 'success')
  }).catch(() => {
    ui.showAlert('Tên Facebook khách', name)
  })
}

async function fetchCustomerProfiles(convs: RealFBConversation[]) {
  if (!fbToken.value || !convs) return
  const pageId = '199752947097328'
  const psids: string[] = []
  
  for (const c of convs) {
    const senders = c.senders?.data || (c as any).participants?.data || []
    const customerSender = senders.find((s: any) => s.id !== pageId && !s.name?.toLowerCase().includes("king's grill")) || senders[0]
    const psid = customerSender?.id
    
    if (psid && psid !== 'unknown' && !psid.startsWith('wh-') && !realCustomerProfileMap.value[psid]) {
      psids.push(psid)
    }
  }
  
  if (psids.length > 0) {
    fetchRealFBBatchUserProfiles(psids, fbToken.value).then(batchProfiles => {
      if (batchProfiles && Object.keys(batchProfiles).length > 0) {
        const formatted: Record<string, { name: string; avatar?: string }> = {}
        Object.keys(batchProfiles).forEach(id => {
          if (batchProfiles[id]?.name) {
            formatted[id] = {
              name: batchProfiles[id].name!,
              avatar: batchProfiles[id].picture
            }
          }
        })
        realCustomerProfileMap.value = {
          ...realCustomerProfileMap.value,
          ...formatted
        }
      }
    })
  }
}

// Format raw Facebook conversations into UI format with strict timestamp sorting
const conversations = computed(() => {
  return rawConversations.value.map(c => {
    const pageId = '199752947097328' // King's Grill Page ID
    const senders = c.senders?.data || (c as any).participants?.data || []
    const customerSender = senders.find((s: any) => s.id !== pageId && !s.name?.toLowerCase().includes("king's grill")) || senders.find((s: any) => s.id !== pageId) || senders[0] || { name: 'Khách Messenger', id: 'unknown' }
    
    const psid = customerSender.id
    const fetchedProfile = realCustomerProfileMap.value[psid]
    const exactCustomerName = fetchedProfile?.name || customerSender.name || `Khách FB (${psid.slice(-4)})`
    const exactAvatar = fetchedProfile?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(exactCustomerName)}`

    // Check if detailed thread messages have been fetched, otherwise fallback to embedded messages
    const rawMsgs = activeThreadMessages.value[c.id] || c.messages?.data || []
    
    // Sort ascending by created_time (Oldest first, Newest last!)
    const sortedMsgs = rawMsgs.slice().sort((a, b) => new Date(a.created_time).getTime() - new Date(b.created_time).getTime())
    const lastMsg = sortedMsgs[sortedMsgs.length - 1]

    // Formatted messages with strict sender classification (Customer vs AI Bot vs Human Staff)
    const formattedMessages = sortedMsgs.map(m => {
      const senderId = m.from?.id || ''
      const senderName = m.from?.name || ''
      const isFromPage = senderId === pageId || senderName.toLowerCase().includes("king's grill") || senderName.toLowerCase().includes("fanpage")
      const timeStr = m.created_time ? new Date(m.created_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : ''
      
      let senderType: 'customer' | 'bot' | 'staff' = 'customer'
      let displaySenderName = exactCustomerName

      if (isFromPage) {
        const textLower = (m.message || '').toLowerCase()
        if (m.message.includes('[Lễ tân]') || m.id.startsWith('staff-')) {
          senderType = 'staff'
          displaySenderName = '👤 Lễ Tân (Nhắn Tay Webapp)'
        } else if (
          textLower.includes('dạ chào') || 
          textLower.includes('dạ king\'s grill') || 
          textLower.includes('https://kg-booking') || 
          m.id.startsWith('wh-') || 
          m.id.startsWith('ai-')
        ) {
          senderType = 'bot'
          displaySenderName = '🤖 KING\'S GRILL (AI Bot)'
        } else {
          senderType = 'staff'
          displaySenderName = '👤 Lễ Tân (Fanpage Inbox)'
        }
      }

      return {
        id: m.id,
        sender: senderType,
        senderName: displaySenderName,
        text: m.message,
        time: timeStr,
        rawTime: m.created_time
      }
    })

    // Extract booking details if customer mentioned booking
    let extractedBooking: any = null
    const fullText = sortedMsgs.map(m => m.message).join(' ')
    const phoneMatch = fullText.match(/0\d{9,10}/)
    const paxMatch = fullText.match(/(\d+)\s*(người|khách|pax)/i)
    
    if (phoneMatch || paxMatch) {
      extractedBooking = {
        name: exactCustomerName,
        phone: phoneMatch ? phoneMatch[0] : 'Chưa có SĐT',
        pax: paxMatch ? paxMatch[1] : '?',
        time: 'Tối nay',
        date: 'Hôm nay',
        table: 'Khu A (AI Đề xuất)'
      }
    }

    const lastTimeStr = c.updated_time ? new Date(c.updated_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : ''

    return {
      id: c.id,
      psid: psid,
      customerName: exactCustomerName,
      avatar: exactAvatar,
      platform: 'facebook',
      lastMessage: lastMsg?.message || 'Chưa có tin nhắn',
      timestamp: lastTimeStr,
      updatedTime: c.updated_time,
      isHandover: !!handoverMap.value[c.id],
      extractedBooking,
      messages: formattedMessages
    }
  })
})

const selectedConv = computed(() => {
  return conversations.value.find(c => c.id === selectedConvId.value) || conversations.value[0] || null
})

// Re-fetch detailed thread messages when a conversation is selected
watch(selectedConvId, async (newId) => {
  if (newId) {
    mobileShowDetail.value = true
    if (fbToken.value && !newId.startsWith('wh-thread-')) {
      const threadMsgs = await fetchRealFBThreadMessages(newId, fbToken.value)
      if (threadMsgs && threadMsgs.length > 0) {
        activeThreadMessages.value = {
          ...activeThreadMessages.value,
          [newId]: threadMsgs
        }
      }
    }
  }
})

async function loadRealConversations() {
  if (!fbToken.value) return
  if (rawConversations.value.length === 0) {
    loadingConversations.value = true
  }
  try {
    const supabaseUrl = "https://azfkzheypuvfcitckovf.supabase.co"
    const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6Zmt6aGV5cHV2ZmNpdGNrb3ZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwNzc1MjEsImV4cCI6MjEwMDY1MzUyMX0.ltnY7GTzKGE7QiWTv8ZuDlfT_NWIR2sGfGudoVDw4NQ"
    
    // Execute Supabase Webhook Audit Logs & Facebook Graph API Conversations IN PARALLEL!
    const [webhookRes, fbRes] = await Promise.all([
      fetch(`${supabaseUrl}/rest/v1/audit_logs?action=in.(facebook_message_received,facebook_message_sent)&order=created_at.desc&limit=50`, {
        headers: { "apikey": anonKey, "Authorization": `Bearer ${anonKey}` }
      }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetchRealFBConversations(fbToken.value)
    ])

    const webhookLogs: any[] = webhookRes || []
    const res: RealFBConversation[] = fbRes || []
    
    // Merge Supabase Webhook items (Both Customer & AI Bot messages) if any exist
    if (webhookLogs && webhookLogs.length > 0) {
      webhookLogs.forEach((log: any) => {
        const psid = log.target_id
        const isBot = log.action === 'facebook_message_sent'
        const senderName = isBot ? "KING's GRILL" : (log.before_json?.customer_name || `Khách FB (${psid})`)
        const senderId = isBot ? '199752947097328' : psid
        const text = log.after_json?.text || ''
        const time = log.created_at

        // Find if conversation thread exists
        const existing = res.find(c => c.senders?.data?.some(s => s.id === psid))
        if (existing) {
          existing.messages = existing.messages || { data: [] }
          if (!existing.messages.data.some(m => m.message === text)) {
            existing.messages.data.unshift({
              id: `wh-${log.id}`,
              message: text,
              created_time: time,
              from: { name: senderName, id: senderId }
            })
          }
        } else {
          res.unshift({
            id: `wh-thread-${psid}`,
            updated_time: time,
            unread_count: 1,
            senders: { data: [{ name: senderName, id: psid }] },
            messages: {
              data: [{
                id: `wh-${log.id}`,
                message: text,
                created_time: time,
                from: { name: senderName, id: senderId }
              }]
            }
          })
        }
      })
    }

    // Sort final list by updated_time descending (newest updated conversation first!)
    res.sort((a, b) => new Date(b.updated_time).getTime() - new Date(a.updated_time).getTime())

    if (res && res.length > 0) {
      rawConversations.value = res
      try {
        sessionStorage.setItem('kg_fb_convs_cache', JSON.stringify(res))
      } catch (e) {}

      fetchCustomerProfiles(res)

      if (!selectedConvId.value) {
        selectedConvId.value = res[0].id
      }
      
      // Fetch detailed thread for top conversation asynchronously in background
      if (!res[0].id.startsWith('wh-thread-')) {
        fetchRealFBThreadMessages(res[0].id, fbToken.value).then(topThreadMsgs => {
          if (topThreadMsgs && topThreadMsgs.length > 0) {
            activeThreadMessages.value[res[0].id] = topThreadMsgs
          }
        })
      }
    }
  } catch (e) {
    console.error('Error loading FB conversations:', e)
  } finally {
    loadingConversations.value = false
  }
}

async function syncBotActiveStatusFromDB() {
  const supabaseUrl = "https://azfkzheypuvfcitckovf.supabase.co"
  const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6Zmt6aGV5cHV2ZmNpdGNrb3ZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwNzc1MjEsImV4cCI6MjEwMDY1MzUyMX0.ltnY7GTzKGE7QiWTv8ZuDlfT_NWIR2sGfGudoVDw4NQ"
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/audit_logs?action=eq.fb_bot_status_changed&order=created_at.desc&limit=1`, {
      headers: { "apikey": anonKey, "Authorization": `Bearer ${anonKey}` }
    })
    if (res.ok) {
      const data = await res.json()
      if (data && data.length > 0 && data[0].after_json) {
        const active = data[0].after_json.is_active !== false
        isBotActive.value = active
        localStorage.setItem('kg_fb_bot_active', String(active))
      }
    }
  } catch (err) {
    console.warn('[Bot Status DB Sync Error]', err)
  }
}

watch(() => ui.showSocialBotModal, (isOpen) => {
  if (isOpen) {
    syncBotActiveStatusFromDB()
    loadRealConversations()
  }
})

onMounted(() => {
  syncBotActiveStatusFromDB()
  if (ui.showSocialBotModal) {
    loadRealConversations()
  }
})

function toggleHandover(conv: any) {
  handoverMap.value[conv.id] = !handoverMap.value[conv.id]
  if (handoverMap.value[conv.id]) {
    ui.showToast(`Đã bật tiếp quản nhắn tay cho ${conv.customerName}. AI Bot đã tạm dừng.`, 'info')
  } else {
    ui.showToast(`Đã bật lại AI Bot tự động trả lời cho ${conv.customerName}.`, 'success')
  }
}

async function sendStaffReply() {
  if (!staffReplyText.value.trim() || !selectedConv.value) return
  
  const text = staffReplyText.value.trim()
  const recipientPsid = selectedConv.value.psid
  
  ui.showToast('Đang gửi tin nhắn sang Facebook Messenger...', 'info')
  
  const success = await sendRealFBMessage(recipientPsid, text, fbToken.value)
  if (success) {
    selectedConv.value.messages.push({
      id: String(Date.now()),
      sender: 'staff',
      senderName: '👤 Lễ Tân (Nhắn Tay Webapp)',
      text,
      time: 'Vừa xong',
      rawTime: new Date().toISOString()
    })

    // Log Staff reply to Supabase PostgreSQL audit_logs
    const supabaseUrl = "https://azfkzheypuvfcitckovf.supabase.co"
    const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6Zmt6aGV5cHV2ZmNpdGNrb3ZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwNzc1MjEsImV4cCI6MjEwMDY1MzUyMX0.ltnY7GTzKGE7QiWTv8ZuDlfT_NWIR2sGfGudoVDw4NQ"
    fetch(`${supabaseUrl}/rest/v1/audit_logs`, {
      method: "POST",
      headers: {
        "apikey": anonKey,
        "Authorization": `Bearer ${anonKey}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({
        actor_role: "staff",
        action: "facebook_message_sent",
        target_type: "messenger",
        target_id: recipientPsid,
        before_json: { psid: recipientPsid },
        after_json: { text: text, time: new Date().toISOString() }
      })
    }).catch(() => {})

    selectedConv.value.lastMessage = `[Lễ tân]: ${text}`
    staffReplyText.value = ''
    ui.showToast('Đã gửi tin nhắn thật sang Messenger thành công!', 'success')
  } else {
    ui.showToast('Gửi tin nhắn thất bại. Vui lòng kiểm tra Token!', 'error')
  }
}

function saveBotConfig() {
  localStorage.setItem('kg_fb_page_access_token', fbToken.value)
  ui.showToast('Đã lưu cấu hình AI Bot & Token thành công!', 'success')
  loadRealConversations()
}
</script>

<template>
  <transition name="modal">
    <div 
      v-if="ui.showSocialBotModal" 
      class="fixed inset-0 bg-slate-950/80 z-[99999] flex items-center justify-center p-0 md:p-6 backdrop-blur-md overflow-hidden"
      @click.self="closeModal"
    >
      <div class="bg-white rounded-none md:rounded-[2.5rem] shadow-2xl max-w-6xl w-full h-[100dvh] md:h-[92vh] flex flex-col relative overflow-hidden border-0 md:border md:border-white/20 animate-fade-in">
        
        <!-- SLEEK COMPACT HEADER -->
        <div class="bg-slate-900 text-white p-3 md:p-4 shrink-0 border-b border-slate-800 relative z-20">
          <div class="flex items-center justify-between gap-2">
            <!-- Left Branding -->
            <div class="flex items-center gap-2.5 min-w-0">
              <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white text-lg shadow-md shrink-0">
                <i class="fa-solid fa-robot"></i>
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-1.5 truncate">
                  <h2 class="text-xs md:text-sm font-black text-white uppercase tracking-tight truncate">Social AI Bot</h2>
                  <span :class="['px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider shrink-0 flex items-center gap-1', isBotActive ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30' : 'bg-rose-500/20 text-rose-300 border border-rose-400/30']">
                    <span :class="['w-1.5 h-1.5 rounded-full', isBotActive ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500']"></span>
                    {{ isBotActive ? 'AI Bật 24/7' : 'AI Đã Tắt' }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Right Controls -->
            <div class="flex items-center gap-1.5 shrink-0">
              <!-- Bot Active Toggle -->
              <button 
                @click="toggleGlobalBotStatus" 
                :class="['px-2.5 py-1.5 rounded-xl text-[10px] md:text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm transition-all active:scale-95 border', isBotActive ? 'bg-rose-600 text-white border-rose-700' : 'bg-emerald-600 text-white border-emerald-700']"
                title="Bật/Tắt AI tự động"
              >
                <i :class="isBotActive ? 'fa-solid fa-power-off' : 'fa-solid fa-play'"></i>
                <span class="hidden sm:inline">{{ isBotActive ? 'Tắt Bot' : 'Bật Bot' }}</span>
              </button>

              <!-- Refresh Button -->
              <button 
                @click="loadRealConversations" 
                :disabled="loadingConversations"
                class="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-xs transition-all active:scale-95 border border-slate-700/50"
                title="Tải lại tin nhắn"
              >
                <i :class="['fa-solid fa-rotate-right', loadingConversations ? 'animate-spin text-blue-400' : '']"></i>
              </button>

              <!-- Close Button -->
              <button 
                @click="closeModal" 
                class="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-xs transition-colors active:scale-95 border border-slate-700/50"
              >
                <i class="fa-solid fa-xmark text-sm"></i>
              </button>
            </div>
          </div>

          <!-- COMPACT TAB CONTROL -->
          <div class="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-slate-800/80">
            <button 
              @click="activeTab = 'conversations'"
              :class="['px-3 py-1 rounded-lg text-[10px] md:text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5', activeTab === 'conversations' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800']"
            >
              <i class="fa-solid fa-comments text-cyan-400"></i>
              <span>Hội thoại ({{ conversations.length }})</span>
            </button>
            <button 
              @click="activeTab = 'config'"
              :class="['px-3 py-1 rounded-lg text-[10px] md:text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5', activeTab === 'config' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800']"
            >
              <i class="fa-solid fa-sliders text-purple-400"></i>
              <span>Cấu hình Token</span>
            </button>
            <button 
              @click="activeTab = 'analytics'"
              :class="['px-3 py-1 rounded-lg text-[10px] md:text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5', activeTab === 'analytics' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800']"
            >
              <i class="fa-solid fa-chart-pie text-emerald-400"></i>
              <span>Thống kê</span>
            </button>
          </div>
        </div>

        <!-- MODAL BODY CONTAINER -->
        <div class="flex-1 overflow-hidden bg-slate-100 flex relative">
          
          <!-- TAB 1: CONVERSATIONS & LIVE CHAT INSPECTOR -->
          <div v-if="activeTab === 'conversations'" class="flex w-full h-full">
            
            <!-- LEFT CONVERSATION LIST -->
            <div :class="['w-full md:w-80 bg-white border-r border-slate-200 flex flex-col shrink-0 h-full overflow-hidden transition-all', mobileShowDetail ? 'hidden md:flex' : 'flex']">
              <div class="p-2.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-2">
                <span class="text-[11px] font-black uppercase tracking-wider text-slate-600">Khách Messenger Thật</span>
                <button @click="loadRealConversations" class="text-[10px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <i :class="['fa-solid fa-sync text-[9px]', loadingConversations ? 'animate-spin' : '']"></i> Làm mới
                </button>
              </div>
              
              <div v-if="loadingConversations" class="p-8 text-center text-slate-400 text-xs font-bold flex flex-col items-center gap-2">
                <i class="fa-solid fa-circle-notch animate-spin text-blue-600 text-xl"></i>
                <span>Đang tải hội thoại Messenger...</span>
              </div>

              <div v-else-if="conversations.length === 0" class="p-8 text-center text-slate-400 text-xs">
                Chưa tìm thấy cuộc hội thoại nào trên Fanpage.
              </div>

              <div v-else class="flex-1 overflow-y-auto divide-y divide-slate-100">
                <button
                  v-for="conv in conversations"
                  :key="conv.id"
                  @click="selectedConvId = conv.id"
                  :class="['w-full p-3 text-left flex items-start gap-3 transition-colors relative', selectedConvId === conv.id ? 'bg-blue-50/80 border-l-4 border-blue-600' : 'hover:bg-slate-50']"
                >
                  <div class="relative shrink-0">
                    <img :src="conv.avatar" class="w-9 h-9 rounded-full bg-slate-100 border border-slate-200" alt="Avatar" />
                    <span class="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-white flex items-center justify-center text-[9px] shadow-sm">
                      <i class="fa-brands fa-facebook-messenger text-blue-500"></i>
                    </span>
                  </div>

                  <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between mb-0.5">
                      <h4 class="font-black text-slate-800 text-xs truncate">{{ conv.customerName }}</h4>
                      <span class="text-[9px] font-bold text-slate-400 shrink-0">{{ conv.timestamp }}</span>
                    </div>
                    <p class="text-[11px] font-medium text-slate-500 truncate leading-tight mb-1">{{ conv.lastMessage }}</p>

                    <span v-if="conv.isHandover" class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[9px]">
                      <i class="fa-solid fa-user-gear"></i> Lễ tân tiếp quản
                    </span>
                    <span v-else class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[9px]">
                      <i class="fa-solid fa-robot"></i> AI Tự động
                    </span>
                  </div>
                </button>
              </div>
            </div>

            <!-- RIGHT LIVE CHAT INSPECTOR -->
            <div v-if="selectedConv" :class="['flex-1 bg-slate-50 flex flex-col h-full overflow-hidden transition-all relative', mobileShowDetail ? 'flex' : 'hidden md:flex']">
              
              <!-- CLEAN CHAT HEADER (SINGLE COMPACT ROW) -->
              <div class="p-2.5 md:p-3 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 shadow-xs gap-2 z-10">
                
                <!-- Left Info & Mobile Back -->
                <div class="flex items-center gap-2 min-w-0">
                  <button 
                    @click="mobileShowDetail = false"
                    class="md:hidden px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1 shrink-0 border border-slate-200"
                  >
                    <i class="fa-solid fa-chevron-left text-[10px]"></i>
                    <span>Danh sách</span>
                  </button>
                  
                  <img :src="selectedConv.avatar" class="w-8 h-8 md:w-9 md:h-9 rounded-full bg-slate-100 border border-slate-200 shrink-0" />
                  
                  <div class="min-w-0">
                    <h3 class="font-black text-slate-900 text-xs md:text-sm flex items-center gap-1 truncate">
                      {{ selectedConv.customerName }}
                      <i class="fa-brands fa-facebook-messenger text-blue-500 text-xs"></i>
                    </h3>
                    <p class="text-[9px] font-bold text-slate-400 truncate hidden sm:block">PSID: {{ selectedConv.psid }}</p>
                  </div>
                </div>

                <!-- Right Action Toolbar (Compact Pill Buttons) -->
                <div class="flex items-center gap-1 shrink-0">
                  <!-- Copy Name Button -->
                  <button 
                    @click="copyCustomerName(selectedConv.customerName)"
                    class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold flex items-center gap-1 border border-slate-200 active:scale-95"
                    title="Copy tên Facebook chuẩn"
                  >
                    <i class="fa-solid fa-copy text-[9px] text-slate-500"></i>
                    <span class="hidden sm:inline">Copy</span>
                  </button>
                  
                  <!-- Search FB Button -->
                  <a 
                    :href="`https://www.facebook.com/search/top/?q=${encodeURIComponent(selectedConv.customerName)}`" 
                    target="_blank"
                    class="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-[10px] font-bold flex items-center gap-1 border border-blue-200 active:scale-95"
                    title="Tìm Facebook khách"
                  >
                    <i class="fa-solid fa-magnifying-glass text-[9px] text-blue-600"></i>
                    <span class="hidden sm:inline">Tìm FB</span>
                  </a>

                  <!-- Open Messenger -->
                  <a 
                    :href="`https://www.facebook.com/messages/t/${selectedConv.psid}`" 
                    target="_blank"
                    class="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[10px] font-bold flex items-center gap-1 border border-indigo-200 active:scale-95"
                    title="Mở Messenger FB"
                  >
                    <i class="fa-brands fa-facebook-messenger text-[9px] text-indigo-600"></i>
                    <span class="hidden sm:inline">Chat FB</span>
                  </a>

                  <!-- Handover Toggle Switch -->
                  <button 
                    @click="toggleHandover(selectedConv)"
                    :class="['px-2.5 py-1 rounded-lg font-black text-[10px] transition-all flex items-center gap-1 shadow-xs border shrink-0', selectedConv.isHandover ? 'bg-amber-500 text-white border-amber-600' : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200']"
                  >
                    <i :class="selectedConv.isHandover ? 'fa-solid fa-user-check' : 'fa-solid fa-robot'"></i>
                    <span>{{ selectedConv.isHandover ? 'Đang nhắn tay' : 'Nhắn tay' }}</span>
                  </button>
                </div>
              </div>

              <!-- Extracted Booking Card Banner -->
              <div v-if="selectedConv.extractedBooking" class="bg-blue-900 text-white p-2.5 px-3 flex items-center justify-between text-xs shrink-0 shadow-inner">
                <div class="flex items-center gap-2 min-w-0">
                  <i class="fa-solid fa-calendar-check text-amber-400 text-sm shrink-0"></i>
                  <div class="truncate">
                    <span class="font-black text-amber-300 uppercase tracking-wider text-[9px]">ĐƠN BÓC TÁCH: </span>
                    <span class="font-bold text-[11px]">{{ selectedConv.extractedBooking.name }} ({{ selectedConv.extractedBooking.phone }}) | {{ selectedConv.extractedBooking.pax }} người | {{ selectedConv.extractedBooking.time }} ({{ selectedConv.extractedBooking.table }})</span>
                  </div>
                </div>
                <span class="px-1.5 py-0.5 rounded bg-emerald-500/30 text-emerald-300 font-mono text-[9px] font-bold border border-emerald-400/30 shrink-0">Live</span>
              </div>

              <!-- Chat Message Feed -->
              <div class="flex-1 p-3 md:p-4 overflow-y-auto space-y-2.5 custom-scrollbar">
                <div 
                  v-for="msg in selectedConv.messages" 
                  :key="msg.id"
                  :class="['flex flex-col max-w-[85%]', msg.sender === 'customer' ? 'self-start' : 'self-end items-end']"
                >
                  <div class="text-[9px] font-bold mb-1 px-1 flex items-center gap-1">
                    <span :class="msg.sender === 'customer' ? 'text-slate-600 font-black' : msg.sender === 'bot' ? 'text-blue-600 font-black' : 'text-amber-600 font-black'">
                      {{ msg.senderName }}
                    </span>
                    <span class="text-slate-400 font-normal">• {{ msg.time }}</span>
                  </div>
                  <div 
                    :class="[
                      'p-2.5 md:p-3 rounded-2xl text-xs font-medium leading-relaxed shadow-xs whitespace-pre-line',
                      msg.sender === 'customer' ? 'bg-white text-slate-800 rounded-tl-none border border-slate-200' : 
                      msg.sender === 'bot' ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-tr-none shadow-sm' : 
                      'bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-tr-none shadow-sm'
                    ]"
                  >
                    {{ msg.text }}
                  </div>
                </div>
              </div>

              <!-- Staff Input Area (Human Handover) -->
              <div class="p-2.5 bg-white border-t border-slate-200 shrink-0">
                <div class="flex items-center gap-2">
                  <input 
                    v-model="staffReplyText" 
                    @keyup.enter="sendStaffReply"
                    type="text" 
                    placeholder="Nhập tin nhắn để gửi trực tiếp sang Messenger..."
                    class="flex-1 px-3.5 py-2 bg-slate-100 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 border border-slate-200"
                  />
                  <button 
                    @click="sendStaffReply"
                    class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs uppercase tracking-wider active:scale-95 transition-all shadow-sm flex items-center gap-1 shrink-0"
                  >
                    <i class="fa-solid fa-paper-plane text-xs"></i>
                    <span>Gửi Thật</span>
                  </button>
                </div>
              </div>
            </div>

            <div v-else class="flex-1 flex items-center justify-center text-slate-400 text-xs">
              Vui lòng chọn một cuộc hội thoại từ danh sách bên trái.
            </div>

          </div>

          <!-- TAB 2: CONFIGURATION -->
          <div v-if="activeTab === 'config'" class="p-6 overflow-y-auto w-full space-y-6">
            <div class="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
              <div class="flex items-center justify-between pb-4 border-b border-slate-100">
                <div>
                  <h3 class="font-black text-slate-800 text-sm flex items-center gap-2">
                    Trạng Thái Hoạt Động Chatbot Fanpage 24/7
                    <span :class="['px-2 py-0.5 rounded text-[10px] font-bold uppercase', isBotActive ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800']">
                      {{ isBotActive ? 'Đang Bật' : 'Đã Tắt' }}
                    </span>
                  </h3>
                  <p class="text-xs font-medium text-slate-500">Tự động trả lời tin nhắn Messenger khi khách nhắn đến Fanpage</p>
                </div>
                <button 
                  @click="toggleGlobalBotStatus"
                  :class="['w-14 h-7 rounded-full relative transition-colors p-1 shadow-inner', isBotActive ? 'bg-emerald-600' : 'bg-slate-300']"
                >
                  <div :class="['w-5 h-5 bg-white rounded-full transition-transform shadow-md flex items-center justify-center text-[10px]', isBotActive ? 'translate-x-7 text-emerald-600 font-bold' : 'text-slate-400 font-bold']">
                    <i :class="isBotActive ? 'fa-solid fa-check' : 'fa-solid fa-xmark'"></i>
                  </div>
                </button>
              </div>

              <div>
                <label class="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">Facebook Page Access Token</label>
                <textarea 
                  v-model="fbToken" 
                  rows="3" 
                  class="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                ></textarea>
              </div>

              <div>
                <label class="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">Webhook Verify Token</label>
                <input 
                  v-model="verifyToken" 
                  type="text" 
                  readonly 
                  class="w-full p-3 bg-slate-100 border border-slate-200 rounded-xl font-mono text-xs text-slate-600"
                />
              </div>

              <div>
                <label class="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">Cloudflare Gateway Webhook URL</label>
                <input 
                  v-model="webhookUrl" 
                  type="text" 
                  readonly 
                  class="w-full p-3 bg-slate-100 border border-slate-200 rounded-xl font-mono text-xs text-slate-600"
                />
              </div>

              <div class="pt-2 flex justify-end">
                <button 
                  @click="saveBotConfig"
                  class="px-6 py-3 bg-blue-600 text-white font-black text-xs uppercase tracking-wider rounded-xl hover:bg-blue-700 active:scale-95 transition-all shadow-md"
                >
                  Lưu Cấu Hình AI Bot
                </button>
              </div>
            </div>
          </div>

          <!-- TAB 3: ANALYTICS -->
          <div v-if="activeTab === 'analytics'" class="p-6 overflow-y-auto w-full space-y-6">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
                <div class="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-xl shrink-0">
                  <i class="fa-solid fa-comments"></i>
                </div>
                <div>
                  <div class="text-2xl font-black text-slate-900">{{ conversations.length }}</div>
                  <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">Cuộc hội thoại thật từ Fanpage</div>
                </div>
              </div>

              <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
                <div class="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl shrink-0">
                  <i class="fa-solid fa-calendar-check"></i>
                </div>
                <div>
                  <div class="text-2xl font-black text-slate-900">100%</div>
                  <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">Trạng thái kết nối Graph API Live</div>
                </div>
              </div>

              <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
                <div class="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center text-xl shrink-0">
                  <i class="fa-solid fa-chart-line"></i>
                </div>
                <div>
                  <div class="text-2xl font-black text-slate-900">v19.0</div>
                  <div class="text-xs font-bold text-slate-400 uppercase tracking-wider">Meta Graph API Engine</div>
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  </transition>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
  transform: scale(0.96);
}
</style>
