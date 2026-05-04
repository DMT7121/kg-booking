<script setup lang="ts">
import { ref } from 'vue'
import { useUIStore } from '@/stores/useUIStore'
import { useConfigStore } from '@/stores/useConfigStore'
import { PLATFORMS } from '@/utils/constants'

const ui = useUIStore()
const configStore = useConfigStore()

const showAdminKey = ref(false)

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text)
  ui.showToast('Đã copy API Key', 'success')
}

async function handlePlatformOptions(pId: string) {
  if (pId === 'pollinations') {
    ui.showToast('Pollinations là miễn phí, không cần key!', 'info')
    return
  }
  const newKey = await ui.showPrompt(`Thêm API Key`, `Dán API Key cho ${PLATFORMS[pId].name} vào đây:`)
  if (newKey) {
    configStore.tempKeys[pId] = newKey.trim()
    configStore.saveApiKey(pId)
  }
}

async function handleKeyClick(pId: string, idx: number) {
  const confirmed = await ui.showConfirm('Xóa Key', 'Bạn có chắc chắn muốn XÓA API key này?')
  if (confirmed) {
    configStore.deleteApiKey(pId, idx)
  }
}
</script>

<template>
  <div v-if="ui.showAiConfig" class="fixed inset-0 bg-slate-50 md:bg-white z-[12000] flex flex-col overflow-hidden">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-white shrink-0 shadow-sm relative z-20">
      <button @click="ui.showAiConfig = false" class="w-10 h-10 flex items-center justify-center text-blue-900 hover:bg-slate-50 rounded-full transition-colors active:scale-95">
        <i class="fa-solid fa-arrow-left text-xl"></i>
      </button>
      <div class="text-center flex-1">
        <h2 class="text-lg font-black text-blue-900">Cấu hình AI</h2>
        <p class="text-[10px] font-bold text-slate-400 mt-0.5 uppercase tracking-wider">Quản lý & Thiết lập</p>
      </div>
      <button class="w-10 h-10 flex items-center justify-center text-blue-900 hover:bg-slate-50 rounded-full transition-colors">
        <i class="fa-regular fa-circle-question text-xl"></i>
      </button>
    </div>

    <!-- Scrollable Content -->
    <div class="flex-1 overflow-y-auto custom-scrollbar bg-slate-50 md:bg-white">
      <div class="text-center px-6 py-6 pb-2">
        <p class="text-xs font-bold text-slate-500 leading-relaxed">Thiết lập và quản lý các mô hình AI giúp bạn phân tích<br>thực đơn và gợi ý số bàn thông minh.</p>
      </div>

    <div class="p-4 md:p-6 max-w-2xl mx-auto w-full space-y-6 pb-20">
      <!-- General Config -->
      <div class="space-y-3">
        <h4 class="text-[11px] font-black text-slate-400 uppercase tracking-widest pl-2">Cấu hình chung</h4>
        <div class="bg-white rounded-3xl shadow-sm border border-slate-100 p-4 space-y-4">
          
          <!-- LLM Model -->
          <div class="flex items-center justify-between">
            <label class="text-xs font-black text-slate-800">Mô hình ngôn ngữ (LLM)</label>
            <div class="relative w-44 md:w-56">
              <select v-model="configStore.defaults.text" class="w-full pl-3 pr-8 py-2 rounded-xl border border-slate-200 bg-white font-bold text-slate-800 text-[11px] focus:border-blue-900 focus:ring-2 focus:ring-blue-50 outline-none transition-all appearance-none text-right">
                <option v-for="m in configStore.textModels" :key="m.id" :value="m.id">{{ m.name }} (Tier {{ m.tier }})</option>
              </select>
              <i class="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] pointer-events-none"></i>
            </div>
          </div>
          
          <!-- Vision Model -->
          <div class="flex items-center justify-between">
            <label class="text-xs font-black text-slate-800 flex items-center gap-1.5">Mô hình xử lý hình ảnh (Vision) <i class="fa-solid fa-circle-info text-slate-300"></i></label>
            <div class="relative w-44 md:w-56">
              <select v-model="configStore.defaults.vision" class="w-full pl-3 pr-8 py-2 rounded-xl border border-slate-200 bg-white font-bold text-slate-800 text-[11px] focus:border-blue-900 focus:ring-2 focus:ring-blue-50 outline-none transition-all appearance-none text-right">
                <option v-for="m in configStore.visionModels" :key="m.id" :value="m.id">{{ m.name }} (Tier {{ m.tier }})</option>
              </select>
              <i class="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] pointer-events-none"></i>
            </div>
          </div>

          <div class="h-[1px] bg-slate-100 my-2"></div>

          <!-- MOI Key -->
          <div class="bg-[#FFF8ED] border border-amber-200 rounded-2xl p-4">
            <label class="text-[11px] font-black text-amber-600 mb-2 flex items-center gap-1.5"><i class="fa-solid fa-key"></i> MOI Key (Admin)</label>
            <div class="flex gap-2 relative">
              <input v-model="configStore.borrowPass" :type="showAdminKey ? 'text' : 'password'" class="flex-grow pl-3 pr-10 py-2.5 rounded-xl border border-amber-200 bg-white font-mono text-xs text-slate-700 focus:border-amber-400 outline-none transition-all" placeholder="Nhập mật khẩu Admin...">
              <i class="fa-solid cursor-pointer absolute right-20 top-1/2 -translate-y-1/2 text-slate-400 hover:text-amber-600 transition-colors" :class="showAdminKey ? 'fa-eye-slash' : 'fa-eye'" @click="showAdminKey = !showAdminKey"></i>
              <button @click="configStore.borrowKeys()" class="px-5 bg-[#F59E0B] text-white rounded-xl font-black text-[11px] hover:bg-amber-600 active:scale-95 transition-all">Lưu</button>
            </div>
          </div>
          
          <p class="text-[10px] font-bold text-slate-400 flex items-center gap-1.5 pl-1"><i class="fa-solid fa-lock text-slate-300"></i> API Key được mã hóa và lưu trữ an toàn.</p>
        </div>
      </div>

      <!-- Providers List -->
      <div class="space-y-3">
        <h4 class="text-[11px] font-black text-slate-400 uppercase tracking-widest pl-2">Danh sách nhà cung cấp AI</h4>
        
        <div class="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden divide-y divide-slate-100">
          
          <div v-for="(platform, pId) in PLATFORMS" :key="pId" class="p-4 hover:bg-slate-50 transition-colors">
            <div class="flex justify-between items-start mb-3">
              <div class="flex items-center gap-3">
                <div :class="['w-9 h-9 rounded-xl flex items-center justify-center text-xl bg-white shadow-sm border border-slate-100 shrink-0', platform.color]">
                  <i :class="['fa-brands', platform.icon]"></i>
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <span class="font-black text-[13px] text-slate-800">{{ platform.name }}</span>
                    <span class="text-[9px] font-bold text-slate-400">{{ pId === 'pollinations' ? '1 key' : configStore.getKeyCount(pId) + ' keys' }}</span>
                    <!-- Active badge condition -->
                    <span v-if="configStore.defaults.text.startsWith(pId as string) || configStore.defaults.vision.startsWith(pId as string) || (pId === 'gemini' && configStore.getKeyCount(pId) > 0)" class="text-[9px] font-black text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">Đang dùng</span>
                    <!-- Free badge condition -->
                    <span v-if="pId === 'pollinations'" class="text-[9px] font-black text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">Miễn phí</span>
                  </div>
                </div>
              </div>
              
              <div class="flex items-center gap-3 mt-1">
                <a :href="platform.getUrl" target="_blank" class="text-[11px] font-black text-blue-600 hover:text-blue-700 transition-colors flex items-center gap-1">Get Key <i class="fa-solid fa-arrow-up-right-from-square text-[9px]"></i></a>
                <button class="text-slate-400 hover:text-blue-900 transition-colors p-1" @click="handlePlatformOptions(pId as string)"><i class="fa-solid fa-ellipsis-vertical"></i></button>
              </div>
            </div>

            <!-- Key Pills -->
            <div class="flex flex-wrap gap-2 pl-12" v-if="configStore.keys[pId]?.length > 0">
              <div v-for="(key, idx) in configStore.keys[pId].slice(0, 3)" :key="idx" class="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-md group">
                <span @click="handleKeyClick(pId as string, idx)" class="font-mono text-[10px] font-bold text-slate-600 cursor-pointer hover:text-rose-500 transition-colors" title="Nhấn để xóa">{{ key.substring(0, 6) }}...{{ key.slice(-4) }}</span>
                <i class="fa-regular fa-copy cursor-pointer text-slate-400 hover:text-blue-900 transition-colors text-[10px]" @click="copyToClipboard(key)"></i>
              </div>
              <div v-if="configStore.keys[pId].length > 3" class="flex items-center px-2 py-1 rounded-md text-[10px] font-bold text-slate-400">
                +{{ configStore.keys[pId].length - 3 }} keys
              </div>
            </div>
            <!-- Free pill for pollinations -->
            <div class="flex flex-wrap gap-2 pl-12" v-if="pId === 'pollinations'">
               <div class="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-md">
                <span class="font-mono text-[10px] font-bold text-slate-600">free...free</span>
                <i class="fa-regular fa-copy cursor-pointer text-slate-400 hover:text-blue-900 transition-colors text-[10px]" @click="copyToClipboard('free')"></i>
              </div>
            </div>

          </div>

        </div>
      </div>
      
      <div class="mt-6 text-center text-[10px] font-bold text-slate-400 flex items-center justify-center gap-1.5 pb-4">
        <i class="fa-solid fa-circle-info"></i> Tổng cộng: {{ configStore.totalKeyCount + 1 }} keys across {{ Object.keys(PLATFORMS).length }} platforms
      </div>
    </div>
    </div>
  </div>
</template>
