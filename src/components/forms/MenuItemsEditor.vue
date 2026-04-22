<script setup lang="ts">
import { ref } from 'vue'
import { useUIStore } from '@/stores/useUIStore'
import { useFormStore } from '@/stores/useFormStore'
import { useAppStore } from '@/stores/useAppStore'
import { useForm } from '@/composables/useForm'
import { formatVND } from '@/utils'

const ui = useUIStore()
const formStore = useFormStore()
const appStore = useAppStore()
const { handleInputFocus, handleInputBlur, addNewItem, onSearchInput, selectMenuItem, handleItemBlur, itemSuggestions } = useForm()

const draggedIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)

function onDragStart(e: DragEvent, index: number) {
  draggedIndex.value = index
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', index.toString())
  }
}

function onDrop(e: DragEvent, index: number) {
  e.preventDefault()
  if (draggedIndex.value !== null && draggedIndex.value !== index) {
    const items = formStore.items
    const draggedItem = items.splice(draggedIndex.value, 1)[0]
    items.splice(index, 0, draggedItem)
  }
  draggedIndex.value = null
  dragOverIndex.value = null
}

function swapItem(idx1: number, idx2: number) {
  if (idx2 < 0 || idx2 >= formStore.items.length) return
  const items = formStore.items
  const temp = items[idx1]
  items[idx1] = items[idx2]
  items[idx2] = temp
}
</script>

<template>
  <div class="bg-white rounded-2xl border border-slate-200 p-4">
    <div class="flex justify-between items-center mb-6">
      <h3 class="font-black text-slate-800 text-[10px] uppercase tracking-widest flex items-center gap-2">
        <span class="bg-red-500 text-white w-5 h-5 flex items-center justify-center rounded-full text-[11px] shadow-lg">{{ formStore.items.length }}</span>
        <span>Danh sách món gọi</span>
        <span class="text-[9px] bg-slate-100 px-2 py-0.5 rounded-full text-slate-500 font-bold border border-slate-200">{{ appStore.activeSheet }}</span>
      </h3>
    </div>
    <div class="space-y-4">
      <div v-for="(item, index) in formStore.items" :key="index" 
           draggable="true"
           @dragstart="onDragStart($event, index)"
           @dragover.prevent="dragOverIndex = index"
           @dragleave="dragOverIndex = null"
           @drop="onDrop($event, index)"
           @dragend="draggedIndex = null; dragOverIndex = null"
           :class="[
             'relative bg-white border border-slate-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing',
             draggedIndex === index ? 'opacity-40 scale-[0.98]' : '',
             dragOverIndex === index && draggedIndex !== index ? 'border-t-4 border-t-blue-500 pt-6 scale-[1.02] shadow-lg' : ''
           ]">
        <div class="flex flex-col gap-4">
          <!-- Name & Suggestions (with Drag/Move helpers) -->
          <div class="relative w-full flex items-center gap-3">
            <div class="flex flex-col gap-1 p-2 bg-slate-50 rounded-xl text-slate-400 border border-slate-100 -ml-2">
              <button @click="swapItem(index, index - 1)" :disabled="index === 0" class="hover:text-blue-500 disabled:opacity-20 active:scale-90 transition-transform"><i class="fa-solid fa-chevron-up"></i></button>
              <button @click="swapItem(index, index + 1)" :disabled="index === formStore.items.length - 1" class="hover:text-blue-500 disabled:opacity-20 active:scale-90 transition-transform"><i class="fa-solid fa-chevron-down"></i></button>
            </div>
            
            <div class="relative flex-grow">
              <input v-model="item.name" @input="onSearchInput(index)" @blur="handleItemBlur" @focus="handleInputFocus" class="w-full font-black text-slate-800 text-base md:text-sm border-b-2 border-slate-100 focus:border-blue-500 outline-none pb-2 uppercase placeholder-slate-200" placeholder="NHẬP TÊN MÓN...">
              <ul v-if="ui.focusIdx === index && itemSuggestions.length > 0" class="absolute top-full left-0 right-0 bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-60 overflow-y-auto z-50 mt-2 p-2 scroll-smooth">
                <li v-for="s in itemSuggestions" :key="s.id" @mousedown.prevent="selectMenuItem(s, index)" class="p-3 hover:bg-blue-50 cursor-pointer flex justify-between rounded-xl transition-colors border-b last:border-0 border-gray-50 min-h-[44px]">
                  <span class="font-black text-slate-700 text-sm uppercase">{{ s.name }}</span>
                  <span class="text-[11px] text-blue-500 font-black tracking-tighter">{{ formatVND(s.price) }}</span>
                </li>
              </ul>
            </div>
          </div>

          <!-- Note -->
          <div class="w-full">
            <textarea v-model="item.note" @focus="handleInputFocus" @blur="handleInputBlur"
              :rows="item.note ? Math.min(item.note.split('\n').length + 1, 8) : 1"
              class="w-full text-[13px] text-red-600 font-semibold bg-slate-50 rounded-lg p-3 border border-slate-100 focus:border-blue-300 outline-none resize-none transition-all font-sans leading-snug"
              placeholder="Ghi chú / Thành phần set..."></textarea>
          </div>

          <!-- Qty, Price, Delete -->
          <div class="flex gap-4 items-center justify-end">
            <div class="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-100 flex-grow md:flex-grow-0 justify-center">
              <input type="number" v-model="item.qty" @focus="handleInputFocus" @blur="handleInputBlur" class="w-12 text-center font-black border-none bg-transparent text-base md:text-sm outline-none" placeholder="SL">
              <div class="h-6 w-[1px] bg-slate-200"></div>
              <input type="number" v-model="item.price" @focus="handleInputFocus" @blur="handleInputBlur" class="w-28 text-right font-black text-blue-600 bg-transparent text-base md:text-sm outline-none" placeholder="Giá">
            </div>
            <button @click="formStore.items.splice(index, 1)" class="bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 transition-colors p-3 rounded-xl min-w-[44px] flex items-center justify-center"><i class="fa-solid fa-trash-can text-lg"></i></button>
          </div>
        </div>
      </div>
    </div>
    
    <!-- ADD BUTTON MOVED HERE -->
    <button @click="addNewItem" class="mt-5 w-full bg-slate-50 border-2 border-dashed border-slate-200 text-slate-600 py-4 rounded-2xl font-black hover:bg-slate-100 transition active:scale-95 uppercase tracking-widest min-h-[50px] active-effect hover-effect flex items-center justify-center gap-2">
      <i class="fa-solid fa-plus text-lg"></i> THÊM MÓN MỚI
    </button>

    <!-- TAX CONFIG -->
    <div class="mt-6 border-t border-slate-100 pt-4 flex justify-between items-center px-2">
      <label class="flex items-center cursor-pointer select-none min-h-[44px]">
        <div class="relative">
          <input type="checkbox" v-model="formStore.taxEnabled" class="sr-only toggle-checkbox">
          <div class="block bg-slate-200 w-10 h-6 rounded-full transition-colors"></div>
          <div class="dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform duration-300 ease-in-out transform shadow-sm" :class="{'translate-x-4': formStore.taxEnabled}"></div>
        </div>
        <span class="ml-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">Bao gồm VAT (8% - 10%)</span>
      </label>
      <div class="text-sm font-black text-slate-900" v-if="formStore.taxEnabled">{{ formatVND(formStore.calculatedTotals.tax) }}</div>
    </div>
  </div>
</template>
