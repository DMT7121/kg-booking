<script setup lang="ts">
import { useUIStore } from '@/stores/useUIStore'
import { useConfigStore } from '@/stores/useConfigStore'
import { PLATFORMS, AI_MODELS } from '@/utils/constants'

const ui = useUIStore()
const configStore = useConfigStore()
</script>

<template>
  <div v-if="ui.showAiConfig" class="fixed inset-0 bg-black/70 z-50 flex justify-center items-start p-4 md:pt-10 backdrop-blur-sm overflow-y-auto" @click.self="ui.showAiConfig = false">
    <div class="bg-white rounded-3xl shadow-2xl p-6 max-w-2xl w-full my-8 border-t-8 border-indigo-600 max-h-[85vh] overflow-y-auto custom-scrollbar">
      <div class="flex justify-between items-center mb-6">
        <h3 class="text-xl font-black text-slate-800 uppercase tracking-tighter"><i class="fa-solid fa-microchip text-indigo-600 mr-2"></i>AI Core v6.0 Config</h3>
        <button @click="ui.showAiConfig = false" class="text-gray-400 hover:text-red-500 p-2 min-h-[44px]"><i class="fa-solid fa-circle-xmark text-3xl"></i></button>
      </div>

      <!-- Default Model Selection -->
      <div class="mb-6 p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
        <label class="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-2 block">Default Text Model</label>
        <select v-model="configStore.defaults.text" class="w-full p-3 rounded-xl border-2 border-indigo-200 font-bold text-sm bg-white">
          <option v-for="m in configStore.textModels" :key="m.id" :value="m.id">{{ m.name }} (Tier {{ m.tier }})</option>
        </select>
        <label class="text-[10px] font-black text-indigo-600 uppercase tracking-widest mt-4 mb-2 block">Default Vision Model</label>
        <select v-model="configStore.defaults.vision" class="w-full p-3 rounded-xl border-2 border-indigo-200 font-bold text-sm bg-white">
          <option v-for="m in configStore.visionModels" :key="m.id" :value="m.id">{{ m.name }} (Tier {{ m.tier }})</option>
        </select>
      </div>

      <!-- Borrow Keys -->
      <div class="mb-6 p-4 bg-amber-50 rounded-2xl border border-amber-200">
        <label class="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-2 block"><i class="fa-solid fa-key mr-1"></i> Mượn API Keys (Admin)</label>
        <div class="flex gap-2">
          <input v-model="configStore.borrowPass" type="password" class="flex-grow p-3 rounded-xl border-2 border-amber-200 font-bold text-sm" placeholder="Nhập mật khẩu Admin...">
          <button @click="configStore.borrowKeys()" class="px-6 py-3 bg-amber-500 text-white rounded-xl font-black text-xs uppercase shadow-lg hover:bg-amber-600 active:scale-95 min-h-[44px] active-effect">TẢI</button>
        </div>
      </div>

      <!-- Platform Keys -->
      <div class="space-y-4">
        <div v-for="(platform, pId) in PLATFORMS" :key="pId" class="p-4 bg-gray-50 rounded-2xl border border-gray-100">
          <div class="flex justify-between items-center mb-3">
            <div class="flex items-center gap-2">
              <i :class="['fa-brands text-lg', platform.icon, platform.color]"></i>
              <span class="font-black text-sm text-slate-700">{{ platform.name }}</span>
              <span class="text-[9px] bg-slate-200 px-2 py-0.5 rounded-full font-bold text-slate-500">{{ configStore.getKeyCount(pId) }} keys</span>
            </div>
            <a :href="platform.getUrl" target="_blank" class="text-[9px] text-blue-500 font-bold hover:underline">Get Key →</a>
          </div>

          <!-- Existing Keys -->
          <div class="flex flex-wrap gap-1 mb-3" v-if="configStore.keys[pId]?.length > 0">
            <span v-for="(key, idx) in configStore.keys[pId]" :key="idx" class="key-tag">
              <span v-if="configStore.visibleKeys[`${pId}_${idx}`]" class="font-mono text-[10px]">{{ key }}</span>
              <span v-else>{{ key.substring(0, 6) }}...{{ key.slice(-4) }}</span>
              <i class="fa-solid fa-eye cursor-pointer" @click="configStore.toggleKeyVisibility(pId, idx)"></i>
              <i class="fa-solid fa-trash-can cursor-pointer text-red-400 hover:text-red-600" @click="configStore.deleteApiKey(pId, idx)"></i>
            </span>
          </div>

          <!-- Add Key -->
          <div v-if="pId !== 'pollinations'" class="flex gap-2">
            <input v-model="configStore.tempKeys[pId]" type="text" class="flex-grow p-2 rounded-lg border border-gray-200 text-xs font-mono" :placeholder="`Paste ${platform.name} API Key...`">
            <button @click="configStore.saveApiKey(pId)" class="px-4 py-2 bg-blue-600 text-white rounded-lg font-black text-[10px] uppercase hover:bg-blue-700 active:scale-95 min-h-[36px] active-effect">LƯU</button>
          </div>
        </div>
      </div>

      <div class="mt-6 text-center text-[10px] text-gray-400 font-bold">Total: {{ configStore.totalKeyCount }} keys across {{ Object.keys(PLATFORMS).length }} platforms</div>
    </div>
  </div>
</template>
