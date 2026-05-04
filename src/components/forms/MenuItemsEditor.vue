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
  <div class="bg-white rounded-3xl shadow-xl shadow-blue-900/5 border border-slate-100 p-5 md:p-6">
    <div class="flex justify-between items-center mb-6">
      <h3 class="font-black text-blue-900 text-xs uppercase tracking-widest flex items-center gap-3">
        <div class="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
          <i class="fa-solid fa-list-check"></i>
        </div>
        Danh sách món
        <span class="bg-red-500 text-white w-5 h-5 flex items-center justify-center rounded-full text-[10px] shadow-sm ml-1">{{ formStore.items.length }}</span>
      </h3>
      <button @click="ui.showMenuManager = true" class="text-[10px] bg-slate-50 px-3 py-1.5 rounded-lg text-slate-500 font-black border border-slate-200 hover:bg-slate-100 active:scale-95 transition-all uppercase tracking-widest flex items-center gap-2">
        <i class="fa-solid fa-book-open"></i> {{ appStore.activeSheet }}
      </button>
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
             'relative bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing group',
             draggedIndex === index ? 'opacity-40 scale-[0.98]' : '',
             dragOverIndex === index && draggedIndex !== index ? 'border-t-4 border-t-blue-900 pt-6 scale-[1.02] shadow-lg' : ''
           ]">
        <div class="flex flex-col gap-4">
          <!-- Name & Suggestions (with Drag/Move helpers) -->
          <div class="relative w-full flex items-center gap-3">
            <div class="flex flex-col gap-1 p-2 bg-slate-50 rounded-xl text-slate-400 border border-slate-100 -ml-2 opacity-50 group-hover:opacity-100 transition-opacity">
              <button @click="swapItem(index, index - 1)" :disabled="index === 0" class="hover:text-blue-900 disabled:opacity-20 active:scale-90 transition-transform"><i class="fa-solid fa-chevron-up text-[10px]"></i></button>
              <button @click="swapItem(index, index + 1)" :disabled="index === formStore.items.length - 1" class="hover:text-blue-900 disabled:opacity-20 active:scale-90 transition-transform"><i class="fa-solid fa-chevron-down text-[10px]"></i></button>
            </div>
            
            <div class="relative flex-grow">
              <input v-model="item.name" @input="onSearchInput(index)" @blur="handleItemBlur" @focus="handleInputFocus" class="w-full font-black text-blue-900 text-base md:text-sm border-b-2 border-slate-100 focus:border-blue-900 outline-none pb-2 uppercase placeholder-slate-300 transition-colors" placeholder="NHẬP TÊN MÓN...">
              <ul v-if="ui.focusIdx === index && itemSuggestions.length > 0" class="absolute top-full left-0 right-0 bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-60 overflow-y-auto z-50 mt-2 p-2 scroll-smooth custom-scrollbar">
                <li v-for="s in itemSuggestions" :key="s.id" @mousedown.prevent="selectMenuItem(s, index)" class="p-3 hover:bg-blue-50 cursor-pointer flex justify-between items-center rounded-xl transition-colors border-b last:border-0 border-slate-50 min-h-[44px]">
                  <span class="font-black text-slate-700 text-xs md:text-sm uppercase">{{ s.name }}</span>
                  <span class="text-[11px] text-blue-600 font-black tracking-tighter bg-blue-50/50 px-2 py-1 rounded-md">{{ formatVND(s.price) }}</span>
                </li>
              </ul>
            </div>
          </div>

          <!-- Note -->
          <div class="w-full">
            <textarea v-model="item.note" @focus="handleInputFocus" @blur="handleInputBlur"
              :rows="item.note ? Math.min(item.note.split('\n').length + 1, 8) : 1"
              class="w-full text-xs text-rose-600 font-bold bg-rose-50/30 rounded-xl p-3 border border-rose-100 focus:border-rose-300 focus:bg-rose-50 outline-none resize-none transition-all placeholder-rose-300"
              placeholder="Ghi chú / Yêu cầu thêm..."></textarea>
          </div>

          <!-- Qty, Price, Delete -->
          <div class="flex gap-3 items-center justify-end">
            <div class="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200 flex-grow md:flex-grow-0 justify-center shadow-inner">
              <input type="number" v-model="item.qty" @focus="handleInputFocus" @blur="handleInputBlur" class="w-12 text-center font-black border-none bg-transparent text-base md:text-sm outline-none text-slate-700 placeholder-slate-400" placeholder="SL">
              <div class="h-6 w-[1px] bg-slate-200"></div>
              <input type="number" v-model="item.price" @focus="handleInputFocus" @blur="handleInputBlur" class="w-28 text-right font-black text-blue-900 bg-transparent text-base md:text-sm outline-none placeholder-slate-400" placeholder="Giá">
            </div>
            <button @click="formStore.items.splice(index, 1)" class="w-12 h-12 bg-white border border-rose-200 text-rose-400 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-300 transition-colors rounded-xl flex items-center justify-center active:scale-95 shadow-sm"><i class="fa-solid fa-trash-can"></i></button>
          </div>
        </div>
      </div>
    </div>
    
    <button @click="addNewItem" class="mt-5 w-full bg-blue-50/50 border-2 border-dashed border-blue-200 text-blue-600 py-4 rounded-2xl font-black hover:bg-blue-50 hover:border-blue-400 transition-all active:scale-95 uppercase tracking-widest min-h-[50px] flex items-center justify-center gap-2">
      <i class="fa-solid fa-plus text-lg"></i> THÊM MÓN
    </button>

    <!-- TAX CONFIG -->
    <div class="mt-6 border-t border-slate-100 pt-5 flex justify-between items-center px-2">
      <label class="flex items-center cursor-pointer select-none min-h-[44px] group">
        <div class="relative">
          <input type="checkbox" v-model="formStore.taxEnabled" class="sr-only toggle-checkbox">
          <div class="block bg-slate-200 group-hover:bg-slate-300 w-11 h-6 rounded-full transition-colors" :class="{'!bg-green-500': formStore.taxEnabled}"></div>
          <div class="dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform duration-300 ease-in-out transform shadow-sm" :class="{'translate-x-5': formStore.taxEnabled}"></div>
        </div>
        <span class="ml-3 text-[10px] font-black text-slate-500 uppercase tracking-widest group-hover:text-slate-700 transition-colors">Bao gồm VAT (8% - 10%)</span>
      </label>
      <div class="text-sm font-black text-blue-900 bg-blue-50 px-3 py-1 rounded-lg" v-if="formStore.taxEnabled">{{ formatVND(formStore.calculatedTotals.tax) }}</div>
    </div>
  </div>
</template>
