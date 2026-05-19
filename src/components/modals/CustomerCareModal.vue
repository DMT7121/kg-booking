<script setup lang="ts">
import { ref, computed } from 'vue'
import { useUIStore } from '@/stores/useUIStore'
import { haptic } from '@/composables/useGestures'

const ui = useUIStore()

// Local storage for cared status to avoid backend changes
const caredStatus = ref<Record<string, boolean>>(JSON.parse(localStorage.getItem('kg_cared_status') || '{}'))

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
  const name = customerInfo.value.name || 'anh/chị'
  const time = customerInfo.value.time || 'hôm nay'
  const date = customerInfo.value.date || ''
  
  return `Kính chào ${name}, cảm ơn anh/chị đã đặt bàn tại King's Grill lúc ${time} ${date}. \n\nNhà hàng rất mong được đón tiếp anh/chị. Nếu cần hỗ trợ thêm thông tin hoặc thay đổi lịch, anh/chị vui lòng phản hồi lại tin nhắn này nhé!\n\nChúc ${name} một ngày vui vẻ! \n- King's Grill -`
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
  
  // Clean phone number: remove spaces, +84 -> 0
  phone = phone.replace(/\s+/g, '')
  if (phone.startsWith('+84')) phone = '0' + phone.substring(3)
  
  if (channel === 'zalo') {
    url = `https://zalo.me/${phone}`
  } else if (channel === 'sms') {
    url = `sms:${phone}`
  } else if (channel === 'email') {
    // Assuming we don't have email in customerInfo, fallback to general mailto
    url = `mailto:?subject=Xác nhận đặt bàn King's Grill&body=${encodeURIComponent(templateMessage.value)}`
  } else if (channel === 'messenger') {
    // Messenger usually requires an ID, but we can open the app
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
          
          <!-- Message Preview -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <label class="text-[10px] font-black uppercase tracking-widest text-slate-500">Mẫu Tin Nhắn</label>
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
