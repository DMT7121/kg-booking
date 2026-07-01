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
  { name: 'Khu A', zone: 'A', tables: Array.from({length: 22}, (_, i) => `A${i+1}`) },
  { name: 'Khu B', zone: 'B', tables: Array.from({length: 10}, (_, i) => `B${i+1}`) },
  { name: 'Khu C', zone: 'C', tables: Array.from({length: 16}, (_, i) => `C${i+1}`) },
  { name: 'Khu D', zone: 'D', tables: Array.from({length: 8}, (_, i) => `D${i+1}`) },
  { name: 'Khu E', zone: 'E', tables: Array.from({length: 8}, (_, i) => `E${i+1}`) }
]

// Current date string to filter today's bookings
const todayStr = computed(() => {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
})

// Parse table string to array
function parseTables(tablesStr: string | undefined): string[] {
  if (!tablesStr) return []
  return tablesStr.split(/[\s,]+/).map(t => t.trim().toUpperCase()).filter(Boolean)
}

// Check if a table matches exactly in a comma/space separated list of tables
function isTableMatch(tablesStr: string | undefined, tableName: string): boolean {
  if (!tablesStr) return false
  const tables = parseTables(tablesStr)
  return tables.includes(tableName.toUpperCase())
}

// Calculate Table Status
function getTableStatus(tableName: string) {
  if (!appStore.historyList) return 'available'
  
  // Find orders for today that include this table (excluding the booking currently being edited)
  const todayOrders = appStore.historyList.filter(o => 
    o.id !== formStore.id &&
    o.parsedCustomer?.date === todayStr.value && 
    isTableMatch(o.parsedCustomer?.tables, tableName)
  )

  if (todayOrders.length === 0) return 'available'

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

// Get occupying customer details (name and time)
function getOccupyingDetails(tableName: string): string | null {
  if (!appStore.historyList) return null
  const todayOrders = appStore.historyList.filter(o => 
    o.id !== formStore.id &&
    o.parsedCustomer?.date === todayStr.value && 
    isTableMatch(o.parsedCustomer?.tables, tableName)
  )
  if (todayOrders.length > 0) {
    const order = todayOrders[0]
    return `${order.parsedCustomer?.name || 'Khách'} (${order.parsedCustomer?.time || ''})`
  }
  return null
}

// Get the original tables of the booking before editing
const originalTables = computed(() => {
  if (!formStore.originalState) return []
  try {
    const parsed = JSON.parse(formStore.originalState)
    const tablesStr = parsed.customer?.tables || parsed.parsedCustomer?.tables || ''
    return parseTables(tablesStr)
  } catch {
    return []
  }
})

function isOriginalTable(table: string): boolean {
  return originalTables.value.includes(table.toUpperCase())
}

// Get zone prefix from table name (e.g. "A12" -> "A")
function getTableZone(table: string): string {
  const m = table.match(/^([A-Z]+)/i)
  return m ? m[1].toUpperCase() : ''
}

// Find first empty table in the same zone
function findFirstEmptyTableInZone(zoneCode: string, currentSelections: string[]): string | null {
  const zone = floorPlan.find(z => z.zone === zoneCode)
  if (!zone) return null
  for (const t of zone.tables) {
    if (getTableStatus(t) === 'available' && !currentSelections.includes(t)) {
      return t
    }
  }
  return null
}

function handleTableSelect(table: string) {
  haptic('light')
  
  const status = getTableStatus(table)
  let currentTables = formStore.customer.tables ? parseTables(formStore.customer.tables) : []
  
  if (status === 'occupied' || status === 'reserved') {
    // Bàn đã có khách khác đặt: tự động chọn bàn trống khác cùng khu
    const zoneCode = getTableZone(table)
    const emptyTable = findFirstEmptyTableInZone(zoneCode, currentTables)
    if (emptyTable) {
      ui.showToast(`Bàn ${table} đã bận. Đã tự động chọn bàn trống ${emptyTable}!`, 'info', 4500)
      if (!currentTables.includes(emptyTable)) {
        currentTables.push(emptyTable)
      }
      formStore.customer.tables = currentTables.join(', ')
    } else {
      ui.showToast(`Bàn ${table} đã bận và Khu ${zoneCode} không còn bàn trống!`, 'warning', 4500)
    }
    return
  }

  // Toggle selection
  if (currentTables.includes(table.toUpperCase())) {
    currentTables = currentTables.filter(t => t !== table.toUpperCase())
  } else {
    currentTables.push(table.toUpperCase())
  }
  
  formStore.customer.tables = currentTables.join(', ')
}

function closeFloorPlan() {
  ui.showFloorPlan = false
}

function isSelected(table: string) {
  const currentTables = formStore.customer.tables ? parseTables(formStore.customer.tables) : []
  return currentTables.includes(table.toUpperCase())
}

// --- Drag & Drop xếp bàn ---
const todayBookings = computed(() => {
  if (!appStore.historyList) return []
  const groups = appStore.groupedHistory
  const result: any[] = []
  Object.values(groups).forEach((group: any) => {
    const order = group.latest
    if (!order.parsedCustomer) return
    const date = (order.parsedCustomer.date || '').trim()
    if (date === todayStr.value) {
      result.push(order)
    }
  })
  // Xếp đơn chưa xếp bàn lên đầu, sau đó sắp xếp theo thời gian
  result.sort((a, b) => {
    const hasTableA = !!a.parsedCustomer.tables && a.parsedCustomer.tables !== 'Chưa xếp'
    const hasTableB = !!b.parsedCustomer.tables && b.parsedCustomer.tables !== 'Chưa xếp'
    if (hasTableA !== hasTableB) {
      return hasTableA ? 1 : -1
    }
    const timeA = a.parsedCustomer.time || '00:00'
    const timeB = b.parsedCustomer.time || '00:00'
    return timeA.localeCompare(timeB)
  })
  return result
})

const draggedBookingInFloorPlan = ref<string | null>(null)
const activeTableDragTarget = ref<string | null>(null)

function handleBookingDragStart(e: DragEvent, booking: any) {
  if (!booking) return
  draggedBookingInFloorPlan.value = booking.id
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', booking.id)
  }
}

function handleTableDragOver(e: DragEvent, tableName: string) {
  e.preventDefault()
  const status = getTableStatus(tableName)
  if (status === 'occupied' || status === 'reserved') return
  activeTableDragTarget.value = tableName
}

function handleTableDragLeave(tableName: string) {
  if (activeTableDragTarget.value === tableName) {
    activeTableDragTarget.value = null
  }
}

async function handleTableDrop(e: DragEvent, tableName: string) {
  e.preventDefault()
  activeTableDragTarget.value = null
  
  const bookingId = e.dataTransfer?.getData('text/plain') || draggedBookingInFloorPlan.value
  draggedBookingInFloorPlan.value = null
  if (!bookingId) return
  
  const order = appStore.historyList.find(o => o.id === bookingId)
  if (!order) return
  
  const status = getTableStatus(tableName)
  if (status === 'occupied' || status === 'reserved') {
    ui.showToast(`Bàn ${tableName} đã bận!`, 'warning')
    return
  }
  
  ui.loading.is = true
  ui.loading.msg = `Đang xếp khách ${order.parsedCustomer?.name} vào bàn ${tableName}...`
  
  try {
    const updatedCustomer = {
      ...order.parsedCustomer,
      tables: tableName
    }
    
    const rawData = JSON.parse((order as any).data || '{}')
    const originalMetadata = order.aiEngine ? { model_used: order.aiEngine } : null
    
    const payload = {
      id: order.id,
      customer: updatedCustomer,
      items: order.menuItems || [],
      staff: order.staff || { name: 'Admin', phone: '' },
      deposit: order.deposit || { amount: order.depositAmount, isPaid: order.isDeposited },
      total: order.totalAmount,
      activeMenuSheet: rawData.activeMenuSheet || appStore.activeSheet || '',
      aiMetadata: rawData.aiMetadata || originalMetadata,
      warnings: rawData.warnings || [],
      unresolvedItems: rawData.unresolvedItems || [],
      version: (order.version || 1) + 1,
      baseServerVersion: order.version || 1
    }
    
    const optimisticOrder = {
      ...order,
      parsedCustomer: updatedCustomer,
      version: payload.version,
      isSyncing: true
    }
    appStore.setOptimisticOrder(optimisticOrder)
    
    const res = await appStore.saveOrder(payload)
    if (res && res.ok) {
      appStore.markOrderSynced(order.id, { version: payload.version })
      ui.showToast(`Đã xếp ${order.parsedCustomer?.name} vào Bàn ${tableName}!`, 'success')
      await appStore.loadHistory(true)
      
      if (order.id === formStore.id) {
        formStore.customer.tables = tableName
        const zone = tableName.match(/^([A-Z]+)/i)?.[1]?.toUpperCase() || ''
        const number = tableName.replace(zone, '')
        ui.tempTable.zone = zone
        ui.tempTable.number = number
      }
    } else {
      throw new Error(res?.message || 'Save failed')
    }
  } catch (err: any) {
    appStore.markOrderFailed(order.id)
    ui.showToast(`Lỗi xếp bàn: ${err.message}`, 'error')
    await appStore.loadHistory(true)
  } finally {
    ui.loading.is = false
  }
}
</script>

<template>
  <transition name="modal">
    <div v-if="ui.showFloorPlan" class="fixed inset-0 z-[10005] flex justify-center items-end sm:items-center bg-blue-950/80 backdrop-blur-md" @click.self="closeFloorPlan">
      <div class="bg-slate-50 rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-lg lg:max-w-4xl h-[85vh] sm:h-[80vh] flex flex-col relative overflow-hidden border border-white/20 pb-safe">
        
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

        <!-- Content (Split Layout for desktop) -->
        <div class="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
          
          <!-- Left side: Interactive Floor Plan -->
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
                  @dragover.prevent="handleTableDragOver($event, table)"
                  @dragleave="handleTableDragLeave(table)"
                  @drop="handleTableDrop($event, table)"
                  class="relative h-16 rounded-2xl flex flex-col items-center justify-center gap-0.5 font-black transition-all active:scale-95 shadow-sm overflow-hidden"
                  :class="{
                    'bg-blue-500 text-white border-b-4 border-blue-700 shadow-blue-500/30 scale-105': isSelected(table),
                    'bg-emerald-50 text-emerald-700 border-b-4 border-emerald-200 hover:bg-emerald-100': !isSelected(table) && getTableStatus(table) === 'available',
                    'bg-amber-100 text-amber-700 border-b-4 border-amber-300': !isSelected(table) && getTableStatus(table) === 'reserved',
                    'bg-rose-100 text-rose-700 border-b-4 border-rose-300': !isSelected(table) && getTableStatus(table) === 'occupied',
                    'border-2 border-dashed border-blue-600 ring-2 ring-blue-100': isOriginalTable(table) && !isSelected(table),
                    'scale-110 ring-4 ring-yellow-400 bg-yellow-100 border-yellow-500 text-yellow-800': activeTableDragTarget === table
                  }"
                >
                  <!-- Selection indicator -->
                  <div v-if="isSelected(table)" class="absolute top-1 right-1 w-3 h-3 bg-white rounded-full flex items-center justify-center shadow-sm">
                    <i class="fa-solid fa-check text-[8px] text-blue-600"></i>
                  </div>
                  <!-- Original table indicator -->
                  <div v-else-if="isOriginalTable(table)" class="absolute top-1 right-1 px-1.5 bg-blue-600 text-white text-[7px] font-black rounded uppercase scale-90">
                    Cũ
                  </div>
                  
                  <span class="text-base tracking-tight" :class="isSelected(table) ? 'text-white' : 'text-slate-800'">{{ table }}</span>
                  <span class="text-[9px] uppercase tracking-widest leading-none" :class="{
                    'text-blue-100': isSelected(table),
                    'text-emerald-500': !isSelected(table) && getTableStatus(table) === 'available',
                    'text-amber-500': !isSelected(table) && getTableStatus(table) === 'reserved',
                    'text-rose-500': !isSelected(table) && getTableStatus(table) === 'occupied',
                  }">
                    {{ isSelected(table) ? 'ĐÃ CHỌN' : (getTableStatus(table) === 'available' ? 'TRỐNG' : (getTableStatus(table) === 'reserved' ? 'SẮP ĐẾN' : 'ĐANG DÙNG')) }}
                  </span>

                  <!-- Occupying details -->
                  <span v-if="!isSelected(table) && getTableStatus(table) !== 'available' && getOccupyingDetails(table)" class="text-[7px] text-slate-500 truncate max-w-full px-1 font-semibold leading-none mt-0.5">
                    {{ getOccupyingDetails(table) }}
                  </span>
                </button>
              </div>
            </div>
          </div>

          <!-- Right side: Draggable Bookings Queue -->
          <div class="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-slate-200 bg-white flex flex-col shrink-0">
            <div class="p-3 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center shrink-0">
              <span class="font-black text-slate-800 text-[10px] uppercase tracking-widest flex items-center gap-1"><i class="fa-solid fa-list-check text-blue-500"></i> Hàng đợi xếp bàn (Hôm nay)</span>
              <span class="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-[9px] font-black">{{ todayBookings.length }} đơn</span>
            </div>
            
            <div class="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2 max-h-[25vh] lg:max-h-none bg-slate-50/30">
              <div v-if="todayBookings.length === 0" class="text-center py-8 text-slate-400 text-xs italic font-semibold">
                Không có đơn đặt bàn hôm nay
              </div>
              <div 
                v-for="bk in todayBookings" 
                :key="bk.id"
                draggable="true"
                @dragstart="handleBookingDragStart($event, bk)"
                class="bg-white hover:bg-slate-50 p-2.5 rounded-xl border cursor-grab active:cursor-grabbing flex flex-col gap-1 transition-all select-none hover:shadow-sm"
                :class="[!bk.parsedCustomer.tables || bk.parsedCustomer.tables === 'Chưa xếp' ? 'border-amber-300 bg-amber-50/30 ring-2 ring-amber-300/10' : 'border-slate-200']"
              >
                <div class="flex justify-between items-center gap-2">
                  <span class="font-black text-slate-800 text-xs truncate flex-1 min-w-0">{{ bk.parsedCustomer.name }}</span>
                  <span class="px-1.5 py-0.5 rounded text-[8px] font-black uppercase shrink-0" :class="bk.parsedCustomer.tables && bk.parsedCustomer.tables !== 'Chưa xếp' ? 'bg-emerald-150 text-emerald-700 border border-emerald-200' : 'bg-amber-100 text-amber-700 border border-amber-200'">
                    {{ bk.parsedCustomer.tables && bk.parsedCustomer.tables !== 'Chưa xếp' ? bk.parsedCustomer.tables : 'Chưa xếp' }}
                  </span>
                </div>
                <div class="flex items-center justify-between text-[9px] text-slate-500 font-bold mt-1">
                  <span><i class="fa-solid fa-clock mr-1 text-blue-500/80"></i>{{ bk.parsedCustomer.time || '--:--' }}</span>
                  <span><i class="fa-solid fa-users mr-1 text-indigo-500/80"></i>{{ bk.parsedCustomer.pax || '0' }} khách</span>
                </div>
              </div>
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
