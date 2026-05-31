<script setup lang="ts">
import { ref, computed } from 'vue'
import { useUIStore } from '@/stores/useUIStore'
import { haptic } from '@/composables/useGestures'

const ui = useUIStore()

// Local storage for cared status to avoid backend changes
const caredStatus = ref<Record<string, boolean>>(JSON.parse(localStorage.getItem('kg_cared_status') || '{}'))

interface MessageTemplate {
  id: string
  name: string
  icon: string
  color: string
  getMessage: (info: any) => string
}

const templates = ref<MessageTemplate[]>([
  {
    id: 'confirm',
    name: 'Xác nhận đặt bàn',
    icon: 'fa-calendar-check',
    color: 'text-green-600 bg-green-50',
    getMessage: (info) => {
      const name = info.name || 'anh/chị'
      const time = info.time || 'hôm nay'
      const date = info.date || ''
      const tables = info.tables || ''
      const pax = info.pax || ''
      return `Kính chào ${name}, nhà hàng King's Grill xác nhận thông tin đặt bàn của anh/chị:\n- Ngày: ${date}\n- Giờ: ${time}\n- Số khách: ${pax} người\n- Khu/Bàn: ${tables}\n\nNhà hàng rất mong được đón tiếp anh/chị. Chúc ${name} một ngày vui vẻ!\n- King's Grill -`
    }
  },
  {
    id: 'deposit_reminder',
    name: 'Nhắc cọc',
    icon: 'fa-hourglass-half',
    color: 'text-amber-600 bg-amber-50',
    getMessage: (info) => {
      const name = info.name || 'anh/chị'
      const amount = info.depositAmount || '500.000đ'
      return `Dạ chào ${name}, để hoàn tất giữ bàn đặt tại King's Grill, anh/chị vui lòng chuyển khoản đặt cọc tối thiểu là ${amount} qua thông tin sau:\n- Ngân hàng: ...\n- Số tài khoản: ...\n- Chủ tài khoản: ...\n- Nội dung chuyển khoản: ${info.transferContent || ''}\n\nSau khi chuyển khoản, anh/chị chụp màn hình gửi lại để nhà hàng xác nhận nhé. Xin cảm ơn anh/chị!\n- King's Grill -`
    }
  },
  {
    id: 'deposit_received',
    name: 'Xác nhận nhận cọc',
    icon: 'fa-money-bill-wave',
    color: 'text-emerald-600 bg-emerald-50',
    getMessage: (info) => {
      const name = info.name || 'anh/chị'
      const amount = info.depositAmount || ''
      return `Dạ chào ${name}, King's Grill xác nhận đã nhận được khoản cọc ${amount} của anh/chị cho lịch đặt bàn ngày ${info.date || ''} lúc ${info.time || ''}.\n\nBàn của anh/chị đã được xác nhận chính thức trên hệ thống. Rất mong được tiếp đón anh/chị và quý khách hàng!\n- King's Grill -`
    }
  },
  {
    id: 'reminder_1day',
    name: 'Nhắc lịch trước 1 ngày',
    icon: 'fa-bell',
    color: 'text-blue-600 bg-blue-50',
    getMessage: (info) => {
      const name = info.name || 'anh/chị'
      return `Kính chào ${name}, King's Grill xin phép nhắc lịch hẹn đặt bàn của anh/chị vào ngày mai (${info.date || ''}) lúc ${info.time || ''}.\n\nNhà hàng đã chuẩn bị bàn sẵn sàng. Nếu có bất kỳ thay đổi nào về giờ giấc hoặc số lượng khách, anh/chị vui lòng báo lại nhà hàng sớm nhé. Hẹn gặp anh/chị ngày mai!\n- King's Grill -`
    }
  },
  {
    id: 'preorder_bill',
    name: 'Gửi phiếu món đặt trước',
    icon: 'fa-file-invoice',
    color: 'text-purple-600 bg-purple-50',
    getMessage: (info) => {
      const name = info.name || 'anh/chị'
      const itemsList = info.menuItems ? info.menuItems.map((item: any) => `- ${item.name} x ${item.quantity}`).join('\n') : ''
      return `Dạ chào ${name}, King's Grill gửi anh/chị danh sách các món ăn đã được chọn đặt trước:\n${itemsList || '- Thực đơn đặt theo set/yêu cầu'}\n\nNhà hàng sẽ chuẩn bị nguyên liệu phục vụ tươi ngon nhất cho tiệc của mình. Cảm ơn anh/chị!\n- King's Grill -`
    }
  },
  {
    id: 'feedback',
    name: 'Xin feedback sau tiệc',
    icon: 'fa-star',
    color: 'text-rose-600 bg-rose-50',
    getMessage: (info) => {
      const name = info.name || 'anh/chị'
      return `Kính chào ${name}, cảm ơn anh/chị đã tin tưởng và dùng bữa tại King's Grill. \n\nĐể cải thiện chất lượng phục vụ, nhà hàng rất mong nhận được những phản hồi, đóng góp ý kiến của anh/chị về món ăn và dịch vụ hôm nay ạ. \n\nChúc anh/chị luôn dồi dào sức khỏe và hạnh phúc! Hẹn gặp lại anh/chị.\n- King's Grill -`
    }
  },
  {
    id: 'missing_info',
    name: 'Báo thiếu thông tin',
    icon: 'fa-circle-exclamation',
    color: 'text-red-600 bg-red-50',
    getMessage: (info) => {
      const name = info.name || 'anh/chị'
      return `Dạ chào ${name}, King's Grill đang chuẩn bị sắp xếp lịch cho tiệc của mình nhưng còn thiếu một số thông tin (Số khách / Giờ đến / Món ăn...). \n\nAnh/chị vui lòng bổ sung sớm giúp nhà hàng để chuẩn bị đón tiếp chu đáo nhất nhé. Xin cảm ơn anh/chị!\n- King's Grill -`
    }
  }
])

const activeTemplateId = ref('confirm')

const order = computed(() => ui.activeOrderForCare)
const isCared = computed({
  get: () => {
    if (!order.value) return false
    return caredStatus.value[order.value.id] || false
  },
  set: (val: boolean) => {
    if (!order.value) return
    caredStatus.value[order.value.id] = val
    localStorage.setItem('kg_cared_status', JSON.stringify(caredStatus.value))
    haptic('light')
  }
})

const customerInfo = computed(() => order.value?.parsedCustomer || {})

const templateMessage = computed(() => {
  const current = templates.value.find(t => t.id === activeTemplateId.value)
  if (!current) return ''
  
  // Format transfer content prefix
  let n = (customerInfo.value.name || 'KH').substring(0, 20).toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim()
  const p = customerInfo.value.phone ? customerInfo.value.phone.replace(/\D/g, '').slice(-4) : ''
  const idSuf = (order.value?.id || '').replace(/-/g, '').substring(0, 4).toUpperCase()
  const transferContent = `${n} DAT COC ${p} ${idSuf}`.trim()

  const info = {
    name: customerInfo.value.name,
    phone: customerInfo.value.phone,
    date: customerInfo.value.date,
    time: customerInfo.value.time,
    pax: customerInfo.value.pax,
    tables: customerInfo.value.tables,
    depositAmount: order.value?.depositAmount ? `${(order.value.depositAmount).toLocaleString('vi-VN')}đ` : '500.000đ',
    menuItems: order.value?.menuItems || [],
    transferContent
  }
  
  return current.getMessage(info)
})

function close() {
  ui.showCustomerCareModal = false
  ui.activeOrderForCare = null
}

function copyMessage() {
  navigator.clipboard.writeText(templateMessage.value).then(() => {
    ui.showToast('Đã copy tin nhắn CSKH!', 'success')
    haptic('light')
  })
}

function openChannel(channel: 'zalo' | 'sms' | 'email' | 'messenger') {
  copyMessage()
  let url = ''
  let phone = customerInfo.value.phone || ''
  
  phone = phone.replace(/\s+/g, '')
  if (phone.startsWith('+84')) phone = '0' + phone.substring(3)
  
  if (channel === 'zalo') {
    url = `https://zalo.me/${phone}`
  } else if (channel === 'sms') {
    url = `sms:${phone}`
  } else if (channel === 'email') {
    url = `mailto:?subject=Xác nhận đặt bàn King's Grill&body=${encodeURIComponent(templateMessage.value)}`
  } else if (channel === 'messenger') {
    url = `https://m.me/`
  }
  
  if (url) {
    window.open(url, '_blank')
  }
}

</script>

<template>
  <transition name="modal">
    <div v-if="ui.showCustomerCareModal" class="fixed inset-0 z-[10005] flex justify-center items-end sm:items-center bg-blue-950/80 backdrop-blur-md" @click.self="close">
      <div class="bg-slate-50 rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-md flex flex-col relative overflow-hidden border border-white/20 pb-safe">
        
        <!-- Header -->
        <div class="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white shrink-0 relative z-20 shadow-sm">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-gradient-to-br from-pink-50 to-rose-100 rounded-xl flex items-center justify-center text-rose-500 shadow-inner">
              <i class="fa-solid fa-heart"></i>
            </div>
            <div>
              <h2 class="text-lg font-black text-blue-900 uppercase tracking-tighter">CSKH</h2>
              <p class="text-[10px] font-bold text-slate-400 mt-0.5 uppercase tracking-wider">{{ customerInfo.name || 'Khách Hàng' }}</p>
            </div>
          </div>
          <button @click="close" class="w-10 h-10 flex items-center justify-center text-slate-400 hover:bg-rose-50 hover:text-rose-500 rounded-full transition-colors active:scale-95 shadow-sm border border-slate-100 bg-white">
            <i class="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>

        <!-- Content -->
        <div class="p-5 space-y-5 bg-slate-50 flex-1 overflow-y-auto custom-scrollbar">
          
          <!-- Template Selection Pills -->
          <div class="space-y-2">
            <label class="text-[10px] font-black uppercase tracking-widest text-slate-500">Chọn mẫu tin nhắn</label>
            <div class="flex gap-2 overflow-x-auto pb-1.5 scrollbar-none -mx-1 px-1">
              <button 
                v-for="t in templates" 
                :key="t.id" 
                @click="activeTemplateId = t.id"
                :class="['px-3 py-2 rounded-xl border text-[11px] font-bold whitespace-nowrap transition-all flex items-center gap-1.5 active:scale-95 shrink-0', 
                  activeTemplateId === t.id ? 'bg-blue-900 border-blue-900 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300']"
              >
                <i class="fa-solid" :class="t.icon"></i>
                {{ t.name }}
              </button>
            </div>
          </div>

          <!-- Message Preview -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <label class="text-[10px] font-black uppercase tracking-widest text-slate-500">Nội dung gửi</label>
              <button @click="copyMessage" class="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded hover:bg-blue-100 transition-colors">
                <i class="fa-regular fa-copy"></i> Copy
              </button>
            </div>
            <div class="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
              {{ templateMessage }}
            </div>
          </div>

          <!-- Channel Selection -->
          <div class="space-y-3">
            <label class="text-[10px] font-black uppercase tracking-widest text-slate-500">Chọn Kênh Liên Hệ (Tự động copy)</label>
            <div class="grid grid-cols-4 gap-2">
              <button @click="openChannel('zalo')" class="flex flex-col items-center gap-2 p-3 bg-white rounded-2xl border border-slate-200 shadow-sm hover:border-blue-400 active:scale-95 transition-all group">
                <div class="w-10 h-10 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center text-xl group-hover:bg-blue-500 group-hover:text-white transition-colors">
                  <i class="fa-solid fa-comment-dots"></i>
                </div>
                <span class="text-[9px] font-black uppercase">Zalo</span>
              </button>
              
              <button @click="openChannel('sms')" class="flex flex-col items-center gap-2 p-3 bg-white rounded-2xl border border-slate-200 shadow-sm hover:border-emerald-400 active:scale-95 transition-all group">
                <div class="w-10 h-10 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center text-xl group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                  <i class="fa-solid fa-message"></i>
                </div>
                <span class="text-[9px] font-black uppercase">SMS</span>
              </button>

              <button @click="openChannel('email')" class="flex flex-col items-center gap-2 p-3 bg-white rounded-2xl border border-slate-200 shadow-sm hover:border-amber-400 active:scale-95 transition-all group">
                <div class="w-10 h-10 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center text-xl group-hover:bg-amber-500 group-hover:text-white transition-colors">
                  <i class="fa-solid fa-envelope"></i>
                </div>
                <span class="text-[9px] font-black uppercase">Email</span>
              </button>

              <button @click="openChannel('messenger')" class="flex flex-col items-center gap-2 p-3 bg-white rounded-2xl border border-slate-200 shadow-sm hover:border-purple-400 active:scale-95 transition-all group">
                <div class="w-10 h-10 rounded-full bg-purple-50 text-purple-500 flex items-center justify-center text-xl group-hover:bg-purple-500 group-hover:text-white transition-colors">
                  <i class="fa-brands fa-facebook-messenger"></i>
                </div>
                <span class="text-[9px] font-black uppercase">Mess</span>
              </button>
            </div>
          </div>

          <!-- Status Checkbox -->
          <div class="pt-4 border-t border-slate-200">
            <label class="flex items-center gap-3 p-3 bg-white rounded-2xl border border-slate-200 shadow-sm cursor-pointer hover:bg-slate-50 transition-colors">
              <input type="checkbox" v-model="isCared" class="w-5 h-5 rounded text-rose-500 focus:ring-rose-500">
              <div class="flex-1">
                <div class="text-sm font-black text-slate-800">Đã CSKH Thành Công</div>
                <div class="text-[10px] font-medium text-slate-500 mt-0.5">Đánh dấu nếu khách đã xác nhận qua liên hệ</div>
              </div>
            </label>
          </div>

        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}
.modal-enter-active .bg-slate-50,
.modal-leave-active .bg-slate-50 {
  transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from .bg-slate-50,
.modal-leave-to .bg-slate-50 {
  transform: translateY(100%);
}
</style>
