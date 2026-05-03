<script setup lang="ts">
import { useUIStore } from '@/stores/useUIStore'
import { useConfigStore } from '@/stores/useConfigStore'
import { PLATFORMS, AI_MODELS } from '@/utils/constants'

const ui = useUIStore()
const configStore = useConfigStore()
</script>

<template>
  <div v-if="ui.showAiConfig" class="fixed inset-0 bg-[#0D1658]/80 z-[12000] flex justify-center items-center p-4 backdrop-blur-md" @click.self="ui.showAiConfig = false">
    <div class="bg-white rounded-3xl shadow-2xl p-6 md:p-8 max-w-2xl w-[95%] md:w-full flex flex-col relative overflow-hidden border border-white/20 max-h-[90vh]">
      
      <!-- Header BG Decoration -->
      <div class="absolute top-0 left-0 right-0 h-24 bg-gradient-to-r from-blue-600 to-[#1A237E] rounded-t-3xl opacity-10"></div>
      
      <!-- Header -->
      <div class="flex justify-between items-center mb-6 relative z-10">
        <h3 class="text-2xl font-black text-[#1A237E] uppercase tracking-tighter flex items-center gap-3">
          <div class="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
            <i class="fa-solid fa-microchip"></i>
          </div>
          AI Core v6.0 Config
        </h3>
        <button @click="ui.showAiConfig = false" class="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl hover:bg-red-50 hover:text-red-500 transition-all flex items-center justify-center shrink-0 shadow-sm border border-slate-100">
          <i class="fa-solid fa-xmark text-xl"></i>
        </button>
      </div>

      <div class="overflow-y-auto custom-scrollbar pr-1 relative z-10 flex-grow">
        <!-- Default Model Selection -->
        <div class="mb-6 p-5 bg-indigo-50/50 rounded-2xl border border-indigo-100/50 shadow-sm">
          <label class="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-2 block">Default Text Model</label>
          <select v-model="configStore.defaults.text" class="w-full px-4 py-3 rounded-xl border border-indigo-200/50 bg-white font-black text-slate-800 text-sm focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none transition-all">
            <option v-for="m in configStore.textModels" :key="m.id" :value="m.id">{{ m.name }} (Tier {{ m.tier }})</option>
          </select>
          <label class="text-[10px] font-black text-indigo-600 uppercase tracking-widest mt-4 mb-2 block">Default Vision Model</label>
          <select v-model="configStore.defaults.vision" class="w-full px-4 py-3 rounded-xl border border-indigo-200/50 bg-white font-black text-slate-800 text-sm focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none transition-all">
            <option v-for="m in configStore.visionModels" :key="m.id" :value="m.id">{{ m.name }} (Tier {{ m.tier }})</option>
          </select>
        </div>

        <!-- Borrow Keys -->
        <div class="mb-6 p-5 bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl border border-amber-200/50 shadow-sm">
          <label class="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-2 block"><i class="fa-solid fa-key mr-1"></i> Mượn API Keys (Admin)</label>
          <div class="flex gap-2">
            <input v-model="configStore.borrowPass" type="password" class="flex-grow px-4 py-3 rounded-xl border border-amber-200 bg-white font-black text-slate-800 text-sm focus:border-amber-500 focus:ring-4 focus:ring-amber-50 outline-none transition-all" placeholder="Nhập mật khẩu Admin...">
            <button @click="configStore.borrowKeys()" class="px-6 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-black text-xs uppercase shadow-lg shadow-orange-500/20 hover:from-amber-600 hover:to-orange-600 active:scale-95 transition-all min-h-[44px]">TẢI KEY</button>
          </div>
        </div>

        <!-- Platform Keys -->
        <div class="space-y-4">
          <div v-for="(platform, pId) in PLATFORMS" :key="pId" class="p-5 bg-slate-50 rounded-2xl border border-slate-100 shadow-sm transition-all hover:border-blue-200 hover:bg-white group">
            <div class="flex justify-between items-center mb-4">
              <div class="flex items-center gap-3">
                <div :class="['w-8 h-8 rounded-lg flex items-center justify-center text-lg bg-white shadow-sm border border-slate-100', platform.color]">
                  <i :class="['fa-brands', platform.icon]"></i>
                </div>
                <span class="font-black text-sm text-[#1A237E]">{{ platform.name }}</span>
                <span class="text-[9px] bg-blue-50 border border-blue-100 text-blue-600 px-2.5 py-0.5 rounded-full font-black tracking-wider shadow-sm">{{ configStore.getKeyCount(pId) }} keys</span>
              </div>
              <a :href="platform.getUrl" target="_blank" class="text-[10px] bg-slate-100 text-slate-500 px-3 py-1.5 rounded-lg font-black hover:bg-blue-50 hover:text-blue-600 transition-colors uppercase tracking-widest">Get Key <i class="fa-solid fa-arrow-up-right-from-square ml-1 text-[9px]"></i></a>
            </div>

            <!-- Existing Keys -->
            <div class="flex flex-wrap gap-2 mb-4" v-if="configStore.keys[pId]?.length > 0">
              <span v-for="(key, idx) in configStore.keys[pId]" :key="idx" class="flex items-center gap-2 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm">
                <span v-if="configStore.visibleKeys[`${pId}_${idx}`]" class="font-mono text-[11px] font-bold text-slate-700">{{ key }}</span>
                <span v-else class="font-mono text-[11px] font-bold text-slate-500 tracking-widest">{{ key.substring(0, 6) }}••••••••{{ key.slice(-4) }}</span>
                <div class="w-[1px] h-3 bg-slate-200 mx-1"></div>
                <i class="fa-solid fa-eye cursor-pointer text-slate-400 hover:text-[#1A237E] transition-colors" @click="configStore.toggleKeyVisibility(pId, idx)"></i>
                <i class="fa-solid fa-trash-can cursor-pointer text-rose-400 hover:text-rose-600 transition-colors" @click="configStore.deleteApiKey(pId, idx)"></i>
              </span>
            </div>

            <!-- Add Key -->
            <div v-if="pId !== 'pollinations'" class="flex gap-2">
              <input v-model="configStore.tempKeys[pId]" type="text" class="flex-grow px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-mono font-bold text-slate-700 focus:border-[#1A237E] focus:ring-4 focus:ring-blue-50 outline-none transition-all placeholder-slate-300" :placeholder="`Paste ${platform.name} API Key...`">
              <button @click="configStore.saveApiKey(pId)" class="px-5 bg-[#1A237E] text-white rounded-xl font-black text-[10px] uppercase shadow-lg shadow-blue-900/20 active:scale-95 transition-all">LƯU</button>
            </div>
          </div>
        </div>

        <div class="mt-6 text-center">
          <span class="inline-flex items-center gap-2 bg-slate-50 border border-slate-100 px-4 py-2 rounded-xl text-[10px] font-black text-slate-500 tracking-widest uppercase">
            <i class="fa-solid fa-key text-blue-400"></i> Total: {{ configStore.totalKeyCount }} keys / {{ Object.keys(PLATFORMS).length }} platforms
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
