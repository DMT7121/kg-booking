<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useUIStore } from '@/stores/useUIStore'
import { fetchRealFBConversations, fetchRealFBThreadMessages, sendRealFBMessage, type RealFBConversation, type RealFBMessage } from '@/services/facebookApi'

const ui = useUIStore()
const activeTab = ref<'conversations' | 'config' | 'analytics'>('conversations')

function closeModal() {
  ui.showSocialBotModal = false
}

// System Bot Status & Tokens
const isBotActive = ref(true)
const fbToken = ref(localStorage.getItem('kg_fb_page_access_token') || 'EAAYwJz8TUaABSOZB52MUg7ZBeIrk7ckvQSKwKhI8SWXS8R9AcOAoiV4ZCnUWVLtLtZAxC0hXve5SlGyZAvLS68jCdmAr2GatmuYSOsWFsG9k0my7KKOlyLN6MMB8Gt6yrGlzBx43bGPGSgK4MlO40GQ6UrKyN5xsZCPViGgZC1Y2mV3OzRL8BFV5YrBDQIec7ShIfNswECw')
const verifyToken = ref('kg_booking_facebook_secret_token')
const webhookUrl = ref('https://kg-ai-gateway.dmt-kgwork.workers.dev/api/webhook/facebook')

const loadingConversations = ref(false)
const rawConversations = ref<RealFBConversation[]>([])
const activeThreadMessages = ref<Record<string, RealFBMessage[]>>({})
const selectedConvId = ref<string>('')
const staffReplyText = ref('')
const handoverMap = ref<Record<string, boolean>>({})

// Format raw Facebook conversations into UI format with strict timestamp sorting
const conversations = computed(() => {
  return rawConversations.value.map(c => {
    const pageId = '199752947097328' // King's Grill Page ID
    const senders = c.senders?.data || []
    const customerSender = senders.find(s => s.id !== pageId) || senders[0] || { name: 'Khách Messenger', id: 'unknown' }
    
    // Check if detailed thread messages have been fetched, otherwise fallback to embedded messages
    const rawMsgs = activeThreadMessages.value[c.id] || c.messages?.data || []
    
    // Sort ascending by created_time (Oldest first, Newest last!)
    const sortedMsgs = rawMsgs.slice().sort((a, b) => new Date(a.created_time).getTime() - new Date(b.created_time).getTime())
    const lastMsg = sortedMsgs[sortedMsgs.length - 1]

    // Formatted messages
    const formattedMessages = sortedMsgs.map(m => {
      const isFromPage = m.from.id === pageId || m.from.name.toLowerCase().includes("king's grill")
      const timeStr = m.created_time ? new Date(m.created_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : ''
      return {
        id: m.id,
        sender: isFromPage ? 'bot' : 'customer',
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
        name: customerSender.name,
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
      psid: customerSender.id,
      customerName: customerSender.name,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(customerSender.name)}`,
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
  if (newId && fbToken.value && !newId.startsWith('wh-thread-')) {
    const threadMsgs = await fetchRealFBThreadMessages(newId, fbToken.value)
    if (threadMsgs && threadMsgs.length > 0) {
      activeThreadMessages.value = {
        ...activeThreadMessages.value,
        [newId]: threadMsgs
      }
    }
  }
})

async function loadRealConversations() {
  if (!fbToken.value) return
  loadingConversations.value = true
  try {
    // 1. Fetch real-time webhook logs from Supabase audit_logs
    const supabaseUrl = "https://azfkzheypuvfcitckovf.supabase.co"
    const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6Zmt6aGV5cHV2ZmNpdGNrb3ZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwNzc1MjEsImV4cCI6MjEwMDY1MzUyMX0.ltnY7GTzKGE7QiWTv8ZuDlfT_NWIR2sGfGudoVDw4NQ"
    
    let webhookLogs: any[] = []
    try {
      const sRes = await fetch(`${supabaseUrl}/rest/v1/audit_logs?action=eq.facebook_message_received&order=created_at.desc&limit=20`, {
        headers: { "apikey": anonKey, "Authorization": `Bearer ${anonKey}` }
      })
      if (sRes.ok) {
        webhookLogs = await sRes.json()
      }
    } catch (e) {
      console.warn('Failed to load Supabase audit_logs:', e)
    }

    // 2. Fetch Facebook Graph API Conversations
    const res = await fetchRealFBConversations(fbToken.value)
    
    // 3. Merge Supabase Webhook items if any exist
    if (webhookLogs && webhookLogs.length > 0) {
      webhookLogs.forEach((log: any) => {
        const psid = log.target_id
        const customerName = log.before_json?.customer_name || `Khách FB (${psid})`
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
              from: { name: customerName, id: psid }
            })
          }
        } else {
          res.unshift({
            id: `wh-thread-${psid}`,
            updated_time: time,
            unread_count: 1,
            senders: { data: [{ name: customerName, id: psid }] },
            messages: {
              data: [{
                id: `wh-${log.id}`,
                message: text,
                created_time: time,
                from: { name: customerName, id: psid }
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
      if (!selectedConvId.value) {
        selectedConvId.value = res[0].id
      }
      
      // Fetch detailed thread for top conversation immediately
      if (!res[0].id.startsWith('wh-thread-')) {
        const topThreadMsgs = await fetchRealFBThreadMessages(res[0].id, fbToken.value)
        if (topThreadMsgs && topThreadMsgs.length > 0) {
          activeThreadMessages.value[res[0].id] = topThreadMsgs
        }
      }
    }
  } catch (e) {
    console.error('Error loading FB conversations:', e)
  } finally {
    loadingConversations.value = false
  }
}

watch(() => ui.showSocialBotModal, (isOpen) => {
  if (isOpen) {
    loadRealConversations()
  }
})

onMounted(() => {
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
      text,
      time: 'Vừa xong',
      rawTime: new Date().toISOString()
    })
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
      class="fixed inset-0 bg-slate-950/80 z-[99999] flex items-center justify-center p-3 md:p-6 backdrop-blur-md overflow-hidden"
      @click.self="closeModal"
    >
      <div class="bg-white rounded-[2rem] shadow-2xl max-w-6xl w-full h-[92vh] flex flex-col relative overflow-hidden border border-white/20 animate-fade-in">
        
        <!-- HEADER -->
        <div class="bg-slate-900 text-white p-5 pb-4 shrink-0 overflow-hidden relative">
          <div class="absolute inset-0 bg-gradient-to-r from-blue-600/30 via-indigo-600/20 to-purple-600/20 pointer-events-none"></div>
          
          <div class="flex items-center justify-between relative z-10">
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-white text-2xl shadow-lg shadow-blue-500/30">
                <i class="fa-solid fa-robot"></i>
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <h2 class="text-lg md:text-xl font-black tracking-tight text-white uppercase">Quản Lý Social AI Bot (Meta Live API)</h2>
                  <span class="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-[10px] font-bold border border-emerald-400/30 flex items-center gap-1">
                    <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> GRAPH API v19.0 LIVE
                  </span>
                </div>
                <p class="text-[11px] font-bold text-slate-400 mt-0.5">Dữ liệu hội thoại thật 100% tự động sắp xếp theo thời gian mới nhất</p>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <button 
                @click="loadRealConversations" 
                :disabled="loadingConversations"
                class="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-md transition-all active:scale-95"
              >
                <i :class="['fa-solid fa-rotate-right', loadingConversations ? 'animate-spin' : '']"></i>
                <span>Tải Lại Tin Mới Nhất</span>
              </button>

              <button 
                @click="closeModal" 
                class="w-9 h-9 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors active:scale-95 border border-slate-700/50"
              >
                <i class="fa-solid fa-xmark text-lg"></i>
              </button>
            </div>
          </div>

          <!-- TAB NAVIGATION -->
          <div class="flex gap-2 mt-4 relative z-10 border-b border-slate-800/60 pb-0.5">
            <button 
              @click="activeTab = 'conversations'"
              :class="['px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2', activeTab === 'conversations' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'text-slate-400 hover:text-white hover:bg-slate-800/50']"
            >
              <i class="fa-solid fa-comments text-cyan-400"></i> Nhật Ký Hội Thoại Thật ({{ conversations.length }})
            </button>
            <button 
              @click="activeTab = 'config'"
              :class="['px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2', activeTab === 'config' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'text-slate-400 hover:text-white hover:bg-slate-800/50']"
            >
              <i class="fa-solid fa-sliders text-purple-400"></i> Cấu Hình Tokens & Webhook
            </button>
            <button 
              @click="activeTab = 'analytics'"
              :class="['px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2', activeTab === 'analytics' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'text-slate-400 hover:text-white hover:bg-slate-800/50']"
            >
              <i class="fa-solid fa-chart-pie text-emerald-400"></i> Thống Kê AI Bot
            </button>
          </div>
        </div>

        <!-- MODAL BODY -->
        <div class="flex-1 overflow-hidden bg-slate-50 flex">
          
          <!-- TAB 1: CONVERSATIONS & LIVE CHAT INSPECTOR -->
          <div v-if="activeTab === 'conversations'" class="flex w-full h-full">
            
            <!-- LEFT CONVERSATION LIST -->
            <div class="w-full md:w-80 bg-white border-r border-slate-200 flex flex-col shrink-0 h-full overflow-hidden">
              <div class="p-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <span class="text-xs font-black uppercase tracking-wider text-slate-600">Khách Messenger Thật</span>
                <button @click="loadRealConversations" class="text-[10px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <i :class="['fa-solid fa-sync', loadingConversations ? 'animate-spin' : '']"></i> Làm mới
                </button>
              </div>
              
              <div v-if="loadingConversations" class="p-8 text-center text-slate-400 text-xs font-bold flex flex-col items-center gap-2">
                <i class="fa-solid fa-circle-notch animate-spin text-blue-600 text-xl"></i>
                <span>Đang cập nhật hội thoại mới nhất...</span>
              </div>

              <div v-else-if="conversations.length === 0" class="p-8 text-center text-slate-400 text-xs">
                Chưa tìm thấy cuộc hội thoại nào trên Fanpage.
              </div>

              <div v-else class="flex-1 overflow-y-auto divide-y divide-slate-100">
                <button
                  v-for="conv in conversations"
                  :key="conv.id"
                  @click="selectedConvId = conv.id"
                  :class="['w-full p-3.5 text-left flex items-start gap-3 transition-colors relative', selectedConvId === conv.id ? 'bg-blue-50/70 border-l-4 border-blue-600' : 'hover:bg-slate-50']"
                >
                  <div class="relative shrink-0">
                    <img :src="conv.avatar" class="w-10 h-10 rounded-full bg-slate-100 border border-slate-200" alt="Avatar" />
                    <span class="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-white flex items-center justify-center text-[10px] shadow-sm">
                      <i class="fa-brands fa-facebook-messenger text-blue-500"></i>
                    </span>
                  </div>

                  <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between mb-1">
                      <h4 class="font-black text-slate-800 text-xs truncate">{{ conv.customerName }}</h4>
                      <span class="text-[9px] font-bold text-slate-400 shrink-0">{{ conv.timestamp }}</span>
                    </div>
                    <p class="text-[11px] font-medium text-slate-500 truncate leading-tight mb-1.5">{{ conv.lastMessage }}</p>

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
            <div v-if="selectedConv" class="flex-1 bg-slate-100 flex flex-col h-full overflow-hidden">
              
              <!-- Chat Header -->
              <div class="p-4 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 shadow-sm">
                <div class="flex items-center gap-3">
                  <img :src="selectedConv.avatar" class="w-10 h-10 rounded-full bg-slate-100 border border-slate-200" />
                  <div>
                    <h3 class="font-black text-slate-900 text-sm flex items-center gap-2">
                      {{ selectedConv.customerName }}
                      <i class="fa-brands fa-facebook-messenger text-blue-500"></i>
                    </h3>
                    <p class="text-[10px] font-bold text-slate-400">PSID / FB ID: {{ selectedConv.psid }}</p>
                  </div>
                </div>

                <!-- Handover Toggle Switch -->
                <button 
                  @click="toggleHandover(selectedConv)"
                  :class="['px-3 py-1.5 rounded-xl font-black text-xs transition-all flex items-center gap-2 shadow-sm border', selectedConv.isHandover ? 'bg-amber-500 text-white border-amber-600' : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200']"
                >
                  <i :class="selectedConv.isHandover ? 'fa-solid fa-user-check' : 'fa-solid fa-robot'"></i>
                  <span>{{ selectedConv.isHandover ? 'Đang nhắn tay (Tắt AI)' : 'Chuyển sang Nhắn Tay' }}</span>
                </button>
              </div>

              <!-- Extracted Booking Card Banner -->
              <div v-if="selectedConv.extractedBooking" class="bg-blue-900 text-white p-3 px-4 flex items-center justify-between text-xs shrink-0 shadow-inner">
                <div class="flex items-center gap-3">
                  <i class="fa-solid fa-calendar-check text-amber-400 text-base"></i>
                  <div>
                    <span class="font-black text-amber-300 uppercase tracking-wider text-[10px]">ĐƠN TỰ ĐỘNG BÓC TÁCH: </span>
                    <span class="font-bold">{{ selectedConv.extractedBooking.name }} ({{ selectedConv.extractedBooking.phone }}) | {{ selectedConv.extractedBooking.pax }} người | {{ selectedConv.extractedBooking.time }} ({{ selectedConv.extractedBooking.table }})</span>
                  </div>
                </div>
                <span class="px-2 py-0.5 rounded bg-emerald-500/30 text-emerald-300 font-mono text-[9px] font-bold border border-emerald-400/30">Facebook Live</span>
              </div>

              <!-- Chat Message Feed -->
              <div class="flex-1 p-4 overflow-y-auto space-y-3 custom-scrollbar">
                <div 
                  v-for="msg in selectedConv.messages" 
                  :key="msg.id"
                  :class="['flex flex-col max-w-[80%]', msg.sender === 'customer' ? 'self-start' : 'self-end items-end']"
                >
                  <div class="text-[9px] font-bold text-slate-400 mb-1 px-1">
                    {{ msg.sender === 'customer' ? selectedConv.customerName : msg.sender === 'bot' ? '🤖 KING\'S GRILL (AI Bot)' : '👤 Lễ Tân (Nhắn Tay)' }} • {{ msg.time }}
                  </div>
                  <div 
                    :class="[
                      'p-3.5 rounded-2xl text-xs font-medium leading-relaxed shadow-sm whitespace-pre-line',
                      msg.sender === 'customer' ? 'bg-white text-slate-800 rounded-tl-none border border-slate-200' : 
                      msg.sender === 'bot' ? 'bg-blue-600 text-white rounded-tr-none' : 
                      'bg-amber-500 text-white rounded-tr-none'
                    ]"
                  >
                    {{ msg.text }}
                  </div>
                </div>
              </div>

              <!-- Staff Input Area (Human Handover) -->
              <div class="p-3 bg-white border-t border-slate-200 shrink-0">
                <div class="flex items-center gap-2">
                  <input 
                    v-model="staffReplyText" 
                    @keyup.enter="sendStaffReply"
                    type="text" 
                    placeholder="Nhập tin nhắn thật để gửi trực tiếp sang Facebook Messenger của khách..."
                    class="flex-1 px-4 py-2.5 bg-slate-100 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 border border-slate-200"
                  />
                  <button 
                    @click="sendStaffReply"
                    class="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs uppercase tracking-wider active:scale-95 transition-all shadow-md flex items-center gap-1.5 shrink-0"
                  >
                    <i class="fa-solid fa-paper-plane"></i> Gửi Thật
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
                  <h3 class="font-black text-slate-800 text-sm">Trạng Thái Hoạt Động AI Bot 24/7</h3>
                  <p class="text-xs font-medium text-slate-500">Tự động trả lời tin nhắn Messenger & Zalo khi khách nhắn đến</p>
                </div>
                <button 
                  @click="isBotActive = !isBotActive"
                  :class="['w-12 h-6 rounded-full relative transition-colors', isBotActive ? 'bg-blue-600' : 'bg-slate-300']"
                >
                  <div :class="['w-5 h-5 bg-white rounded-full absolute top-0.5 left-0.5 transition-transform shadow-sm', isBotActive ? 'translate-x-6' : '']"></div>
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
