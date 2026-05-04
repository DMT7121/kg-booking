<script setup lang="ts">
import { defineProps, defineEmits } from 'vue'
import { formatVND } from '@/utils'

const props = defineProps<{
  dish: any
  getCategoryColor: (cat: string) => string
  isSelected?: boolean
}>()

const emit = defineEmits(['select'])
</script>

<template>
  <div @click="emit('select', dish)"
       :class="['bg-white p-3 rounded-2xl border flex items-center gap-4 cursor-pointer transition-all hover:shadow-md group', isSelected ? 'border-blue-500 bg-blue-50/20 shadow-md ring-1 ring-blue-500' : 'border-slate-200 shadow-sm']">
    <div class="relative shrink-0">
      <img :src="dish.image" alt="dish" class="w-16 h-16 rounded-xl object-cover bg-slate-100">
      <div v-if="isSelected" class="absolute -top-2 -right-2 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs shadow-md border-2 border-white">
        <i class="fa-solid fa-check"></i>
      </div>
    </div>
    <div class="flex-1 min-w-0">
      <h4 class="font-bold text-slate-800 text-sm mb-1 truncate group-hover:text-blue-900 transition-colors">{{ dish.name }}</h4>
      <span :class="['px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border', getCategoryColor(dish.category)]">{{ dish.category }}</span>
    </div>
    <div class="font-black text-blue-900 text-sm shrink-0">{{ formatVND(dish.price) }}</div>
  </div>
</template>
