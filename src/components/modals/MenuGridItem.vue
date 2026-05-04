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
       :class="['bg-white rounded-2xl overflow-hidden cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 flex flex-col border', isSelected ? 'border-blue-500 shadow-md shadow-blue-500/20 ring-1 ring-blue-500' : 'border-slate-200 shadow-sm']">
    <div class="relative pt-[100%] bg-slate-100">
      <img :src="dish.image" alt="dish" class="absolute inset-0 w-full h-full object-cover">
      <div v-if="isSelected" class="absolute top-2 right-2 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs shadow-md border-2 border-white">
        <i class="fa-solid fa-check"></i>
      </div>
    </div>
    <div class="p-3 text-center flex-1 flex flex-col justify-center items-center bg-white">
      <h4 class="font-bold text-slate-800 text-sm mb-1 line-clamp-2 leading-tight">{{ dish.name }}</h4>
      <div class="font-black text-blue-900 text-[13px] mb-2">{{ formatVND(dish.price) }}</div>
      <span :class="['inline-block border px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider', getCategoryColor(dish.category)]">{{ dish.category }}</span>
    </div>
  </div>
</template>
