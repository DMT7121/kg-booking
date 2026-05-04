<script setup lang="ts">
import { ref, computed } from 'vue'
import { useUIStore } from '@/stores/useUIStore'
import { useFormStore } from '@/stores/useFormStore'
import { useAppStore } from '@/stores/useAppStore'
import { haptic } from '@/composables/useGestures'

const ui = useUIStore()
const formStore = useFormStore()
const appStore = useAppStore()

// Floor Plan Layout Definition
const floorPlan = [
  {
    name: 'Tầng 1 (Trong Nhà)',
    zone: 'A',
    tables: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8']
  },
  {
    name: 'Sân Vườn (Ngoài Trời)',
    zone: 'B',
    tables: ['B1', 'B2', 'B3', 'B4', 'B5', 'B6']
  },
  {
    name: 'Tầng 2 (Phòng Lạnh / VIP)',
    zone: 'V',
    tables: ['V1', 'V2', 'V3', 'V4', 'V5']
  }
]

// Current date string to filter today's bookings
const todayStr = computed(() => {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
})

// Calculate Table Status
function getTableStatus(tableName: string) {
  if (!appStore.historyList) return 'available'
  
  // Find orders for today that include this table
  const todayOrders = appStore.historyList.filter(o => 
    o.parsedCustomer?.date === todayStr.value && 
    o.parsedCustomer?.tables?.includes(tableName)
  )

  if (todayOrders.length === 0) return 'available'

  // If there is an order, check the time to determine if it's 'reserved' or 'occupied'
  // For simplicity, we just mark it as reserved or occupied based on current time
  const now = new Date()
  
  for (const order of todayOrders) {
    const time = order.parsedCustomer?.time
    if (!time) continue
    
    const [hh, mm] = time.split(':').map(Number)
    const orderTime = new Date()
    orderTime.setHours(hh, mm, 0, 0)
    
    const diffMs = orderTime.getTime() - now.getTime()
    const diffMins = diffMs / (1000 * 60)

    // If within past 2 hours and future 1 hour, it's occupied or reserved
    if (diffMins > -120 && diffMins <= 0) {
      return 'occupied' // They are probably eating right now
    } else if (diffMins > 0 && diffMins < 120) {
      return 'reserved' // They are coming soon
    }
  }

  return 'available'
}

function handleTableSelect(table: string) {
  haptic('light')
  
  let currentTables = formStore.customer.tables ? formStore.customer.tables.split(',').map(t => t.trim()).filter(Boolean) : []
  
  if (currentTables.includes(table)) {
    // Deselect
    currentTables = currentTables.filter(t => t !== table)
  } else {
    // Select
    currentTables.push(table)
  }
  
  formStore.customer.tables = currentTables.join(', ')
}

function closeFloorPlan() {
  ui.showFloorPlan = false
}

function isSelected(table: string) {
  const currentTables = formStore.customer.tables ? formStore.customer.tables.split(',').map(t => t.trim()) : []
  return currentTables.includes(table)
}

</script>

<template>
  <transition name="modal">
    <div v-if="ui.showFloorPlan" class="fixed inset-0 z-[10005] flex justify-center items-end sm:items-center bg-blue-950/80 backdrop-blur-md" @click.self="closeFloorPlan">
      <div class="bg-slate-50 rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-lg h-[85vh] sm:h-[80vh] flex flex-col relative overflow-hidden border border-white/20 pb-safe">
        
        <!-- Header -->
        <div class="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white shrink-0 relative z-20 shadow-sm">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 shadow-inner">
              <i class="fa-solid fa-map"></i>
            </div>
            <div>
              <h2 class="text-lg font-black text-blue-900 uppercase tracking-tighter">Sơ đồ bàn</h2>
              <p class="text-[10px] font-bold text-slate-400 mt-0.5 uppercase tracking-wider">Thời gian thực</p>
            </div>
          </div>
          <button @click="closeFloorPlan" class="w-10 h-10 flex items-center justify-center text-slate-400 hover:bg-rose-50 hover:text-rose-500 rounded-full transition-colors active:scale-95 shadow-sm border border-slate-100 bg-white">
            <i class="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>

        <!-- Legend -->
        <div class="flex justify-center gap-4 py-3 bg-white border-b border-slate-200 shrink-0 text-[10px] font-black uppercase tracking-widest shadow-sm relative z-10">
          <div class="flex items-center gap-1.5"><div class="w-3 h-3 rounded bg-emerald-50 border border-emerald-200"></div> <span class="text-emerald-600">Trống</span></div>
          <div class="flex items-center gap-1.5"><div class="w-3 h-3 rounded bg-amber-100 border border-amber-300"></div> <span class="text-amber-600">Sắp đến</span></div>
          <div class="flex items-center gap-1.5"><div class="w-3 h-3 rounded bg-rose-100 border border-rose-300"></div> <span class="text-rose-600">Đang dùng</span></div>
          <div class="flex items-center gap-1.5"><div class="w-3 h-3 rounded bg-blue-500 border border-blue-600 shadow-inner"></div> <span class="text-blue-700">Đang chọn</span></div>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 space-y-6">
          <div v-for="zone in floorPlan" :key="zone.zone" class="bg-white p-4 md:p-5 rounded-3xl shadow-sm border border-slate-200 relative overflow-hidden">
            <div class="absolute top-0 left-0 w-1.5 h-full bg-slate-200 rounded-l-3xl"></div>
            
            <h3 class="text-xs font-black text-slate-500 uppercase tracking-widest mb-4 ml-2 flex items-center gap-2">
              <i class="fa-solid fa-layer-group text-slate-300"></i> {{ zone.name }}
            </h3>
            
            <div class="grid grid-cols-4 gap-3 md:gap-4 ml-2">
              <button 
                v-for="table in zone.tables" 
                :key="table"
                @click="handleTableSelect(table)"
                class="relative h-16 rounded-2xl flex flex-col items-center justify-center gap-1 font-black transition-all active:scale-95 shadow-sm overflow-hidden"
                :class="{
                  'bg-blue-500 text-white border-b-4 border-blue-700 shadow-blue-500/30 scale-105': isSelected(table),
                  'bg-emerald-50 text-emerald-700 border-b-4 border-emerald-200 hover:bg-emerald-100': !isSelected(table) && getTableStatus(table) === 'available',
                  'bg-amber-100 text-amber-700 border-b-4 border-amber-300': !isSelected(table) && getTableStatus(table) === 'reserved',
                  'bg-rose-100 text-rose-700 border-b-4 border-rose-300': !isSelected(table) && getTableStatus(table) === 'occupied',
                }"
              >
                <!-- Selection indicator -->
                <div v-if="isSelected(table)" class="absolute top-1 right-1 w-3 h-3 bg-white rounded-full flex items-center justify-center shadow-sm">
                  <i class="fa-solid fa-check text-[8px] text-blue-600"></i>
                </div>
                
                <span class="text-base tracking-tight" :class="isSelected(table) ? 'text-white' : 'text-slate-800'">{{ table }}</span>
                <span class="text-[9px] uppercase tracking-widest" :class="{
                  'text-blue-100': isSelected(table),
                  'text-emerald-500': !isSelected(table) && getTableStatus(table) === 'available',
                  'text-amber-500': !isSelected(table) && getTableStatus(table) === 'reserved',
                  'text-rose-500': !isSelected(table) && getTableStatus(table) === 'occupied',
                }">
                  {{ isSelected(table) ? 'ĐÃ CHỌN' : (getTableStatus(table) === 'available' ? 'TRỐNG' : (getTableStatus(table) === 'reserved' ? 'SẮP ĐẾN' : 'ĐANG DÙNG')) }}
                </span>
              </button>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-5 py-4 border-t border-slate-200 bg-white shrink-0 shadow-[0_-4px_20px_rgba(0,0,0,0.02)]">
          <button @click="closeFloorPlan" class="w-full py-4 bg-blue-900 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-blue-900/20 active:scale-95 transition-all flex items-center justify-center gap-2">
            <i class="fa-solid fa-check"></i> XÁC NHẬN BÀN: {{ formStore.customer.tables || 'CHƯA CHỌN' }}
          </button>
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
