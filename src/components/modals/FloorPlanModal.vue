<script setup lang="ts">
import { ref, computed } from 'vue'
import { useUIStore } from '@/stores/useUIStore'
import { useFormStore } from '@/stores/useFormStore'
import { useAppStore } from '@/stores/useAppStore'
import { haptic } from '@/composables/useGestures'
import { allocateSmartTables } from '@/domain/booking/smartTableAllocator'

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

// Dynamic date string of the booking, fallback to today if empty or invalid format
const bookingDate = computed(() => {
  const d = formStore.customer.date?.trim()
  if (d && /^\d{2}\/\d{2}\/\d{4}$/.test(d)) {
    return d
  }
  return todayStr.value
})

// Interactive Time-Slot Scrubber for Floor Plan 2.0
const TIME_SCRUBBER_SLOTS = [
  { id: 'FORM', label: 'Theo giờ đơn' },
  { id: 'NOW', label: 'Hiện tại' },
  { id: '11:30', label: '11:30' },
  { id: '12:30', label: '12:30' },
  { id: '17:30', label: '17:30' },
  { id: '18:00', label: '18:00' },
  { id: '18:30', label: '18:30' },
  { id: '19:00', label: '19:00' },
  { id: '19:30', label: '19:30' },
  { id: '20:00', label: '20:00' }
]
const inspectTimeMode = ref<string>('FORM')
const activeZoneFilter = ref<string>('ALL')

const effectiveInspectTime = computed(() => {
  if (inspectTimeMode.value === 'NOW') {
    const now = new Date()
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  }
  if (inspectTimeMode.value === 'FORM') {
    const formTime = (formStore.customer.time || '').trim()
    if (/^\d{1,2}:\d{2}$/.test(formTime)) return formTime
    const now = new Date()
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  }
  return inspectTimeMode.value
})

const filteredFloorPlan = computed(() => {
  if (activeZoneFilter.value === 'ALL') return floorPlan
  return floorPlan.filter(z => z.zone === activeZoneFilter.value)
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

// Pre-indexed O(1) Table Status & Occupant Map for bookingDate + effectiveInspectTime
// Eliminates 200+ full historyList scans + Date allocations on every render / time-scrubber click
const tableInspectionMap = computed(() => {
  const map = new Map<string, { status: 'available' | 'occupied' | 'reserved'; details: string | null }>()
  const list = appStore.historyList
  if (!Array.isArray(list) || list.length === 0) return map

  const targetDate = bookingDate.value
  const currentEditId = formStore.id
  const ordersByTable = new Map<string, any[]>()

  for (let i = 0; i < list.length; i++) {
    const o = list[i]
    if (!o || o.id === currentEditId || o.parsedCustomer?.date !== targetDate) continue
    const tablesStr = o.parsedCustomer?.tables
    if (!tablesStr) continue
    const tables = parseTables(tablesStr)
    for (let j = 0; j < tables.length; j++) {
      const t = tables[j]
      let arr = ordersByTable.get(t)
      if (!arr) {
        arr = []
        ordersByTable.set(t, arr)
      }
      arr.push(o)
    }
  }

  if (ordersByTable.size === 0) return map

  const [refH, refM] = effectiveInspectTime.value.split(':').map(Number)
  const refTotalMins = (Number.isFinite(refH) ? refH : 18) * 60 + (Number.isFinite(refM) ? refM : 0)

  ordersByTable.forEach((todayOrders, tableKey) => {
    const first = todayOrders[0]
    const details = first ? `${first.parsedCustomer?.name || 'Khách'} (${first.parsedCustomer?.time || ''})` : null
    let status: 'available' | 'occupied' | 'reserved' = 'available'

    for (let k = 0; k < todayOrders.length; k++) {
      const time = todayOrders[k].parsedCustomer?.time
      if (!time) continue
      const [hh, mm] = time.split(':').map(Number)
      if (!Number.isFinite(hh)) continue
      const diffMins = (hh * 60 + (Number.isFinite(mm) ? mm : 0)) - refTotalMins

      // If within past 2 hours and future 2 hours around reference time
      if (diffMins > -120 && diffMins <= 15) {
        status = 'occupied'
        break
      } else if (diffMins > 15 && diffMins < 120) {
        status = 'reserved'
        break
      }
    }

    map.set(tableKey, { status, details })
  })

  return map
})

// Calculate Table Status at effectiveInspectTime (O(1) Map lookup)
function getTableStatus(tableName: string) {
  return tableInspectionMap.value.get(tableName.toUpperCase())?.status || 'available'
}

function getZoneAvailableCount(tables: string[]): number {
  let count = 0
  for (let i = 0; i < tables.length; i++) {
    if (getTableStatus(tables[i]) === 'available') count++
  }
  return count
}

// Get occupying customer details (name and time) (O(1) Map lookup)
function getOccupyingDetails(tableName: string): string | null {
  return tableInspectionMap.value.get(tableName.toUpperCase())?.details || null
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

const originalTablesSet = computed(() => new Set(originalTables.value))
const selectedTablesSet = computed(() => new Set(formStore.customer.tables ? parseTables(formStore.customer.tables) : []))

function isOriginalTable(table: string): boolean {
  return originalTablesSet.value.has(table.toUpperCase())
}

// Get zone prefix from table name (e.g. "A12" -> "A")
function getTableZone(table: string): string {
  const m = table.match(/^([A-Z]+)/i)
  return m ? m[1].toUpperCase() : ''
}

function formatTableLabel(t: string): string {
  const m = t.match(/^([A-Z]+)(\d+)$/i)
  if (m) {
    return `${m[1].toUpperCase()}${m[2].padStart(2, '0')}`
  }
  return t
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
  return selectedTablesSet.value.has(table.toUpperCase())
}

// --- Drag & Drop xếp bàn ---
const targetDateBookings = computed(() => {
  if (!appStore.historyList) return []
  const groups = appStore.groupedHistory
  const result: any[] = []
  Object.values(groups).forEach((group: any) => {
    const order = group.latest
    if (!order.parsedCustomer) return
    const date = (order.parsedCustomer.date || '').trim()
    if (date === bookingDate.value) {
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

function applySmartAllocation() {
  const pax = parseInt(formStore.customer.pax || '4', 10)
  const time = formStore.customer.time || '18:00'
  const date = bookingDate.value

  const existingBookings = appStore.historyList
    .filter(o => o.id !== formStore.id && o.parsedCustomer?.date === date)
    .map(o => {
      const isCancelled = (o.parsedCustomer?.note || '').toLowerCase().includes('hủy') || (o.parsedCustomer?.note || '').toLowerCase().includes('cancel')
      return {
        tables: parseTables(o.parsedCustomer?.tables),
        bookingTime: o.parsedCustomer?.time || '',
        status: isCancelled ? 'cancelled' : 'confirmed'
      }
    })

  const res = allocateSmartTables({
    guestCount: pax,
    preferredZone: 'A',
    bookingTime: time,
    existingBookings
  })

  if (res.recommendedTables.length > 0) {
    formStore.customer.tables = res.recommendedTables.join(', ')
    const firstTable = res.recommendedTables[0]
    const zone = firstTable.match(/^([A-Z]+)/i)?.[1]?.toUpperCase() || ''
    const number = firstTable.replace(zone, '')
    ui.tempTable.zone = zone
    ui.tempTable.number = number
    ui.showToast(`✨ Đã gợi ý ${res.recommendedTables.join(', ')} (${res.reason})`, 'success')
  } else {
    ui.showToast('Không tìm được bàn khả dụng cho khung giờ này.', 'warning')
  }
}
</script>

<template>
  <transition name="modal">
    <div v-if="ui.showFloorPlan" class="fixed inset-0 z-[10005] flex justify-center items-end sm:items-center bg-blue-950/80 backdrop-blur-md" @click.self="closeFloorPlan">
      <div class="bg-slate-50 dark:bg-surface-4 rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-lg lg:max-w-4xl h-[85vh] sm:h-[80vh] flex flex-col relative overflow-hidden border border-white/20 dark:border-border-default pb-safe">
        
        <!-- Header -->
        <div class="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-border-subtle bg-white dark:bg-surface-3 shrink-0 relative z-20 shadow-sm">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-blue-50 dark:bg-blue-950/50 rounded-xl flex items-center justify-center text-blue-600 dark:text-blue-400 shadow-inner">
              <i class="fa-solid fa-map"></i>
            </div>
            <div>
              <h2 class="text-lg font-black text-blue-900 dark:text-slate-100 uppercase tracking-tighter">Sơ đồ bàn</h2>
              <p class="text-[10px] font-bold text-slate-400 dark:text-text-secondary mt-0.5 uppercase tracking-wider">Thời gian thực - Ngày {{ bookingDate }}</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button 
              @click="applySmartAllocation" 
              class="px-3 py-1.5 text-xs font-bold rounded-xl bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/60 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-sm"
              title="Tự động tính toán và chọn bàn tối ưu dựa trên số khách và giờ tiệc"
            >
              <i class="fa-solid fa-wand-magic-sparkles text-xs text-blue-500"></i>
              <span class="hidden sm:inline">Gợi ý bàn</span>
            </button>
            <button @click="closeFloorPlan" class="w-10 h-10 flex items-center justify-center text-slate-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 rounded-full transition-colors active:scale-95 shadow-sm border border-slate-100 dark:border-border-subtle bg-white dark:bg-surface-2">
              <i class="fa-solid fa-xmark text-xl"></i>
            </button>
          </div>
        </div>

        <!-- Interactive Time-Slot Scrubber & Zone Filter Bar -->
        <div class="px-4 py-2.5 bg-surface-2 dark:bg-surface-3 border-b border-border-subtle shrink-0 space-y-2 relative z-10">
          <!-- Row 1: Time Scrubber Chips -->
          <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <span class="text-[10px] font-bold uppercase tracking-wider text-text-tertiary shrink-0 mr-1 flex items-center gap-1">
              <i class="fa-regular fa-clock text-apex-primary"></i>
              <span>Khung giờ ({{ effectiveInspectTime }}):</span>
            </span>
            <button
              v-for="slot in TIME_SCRUBBER_SLOTS"
              :key="slot.id"
              type="button"
              @click="inspectTimeMode = slot.id"
              class="px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all shrink-0 cursor-pointer border"
              :class="inspectTimeMode === slot.id ? 'bg-apex-primary text-white border-apex-primary shadow-2xs' : 'bg-surface-1 dark:bg-surface-4 text-text-secondary border-border-subtle hover:text-text-primary'"
            >
              {{ slot.label }}
            </button>
          </div>

          <!-- Row 2: Zone Filter Pills + Legend -->
          <div class="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border-subtle/60">
            <div class="flex items-center gap-1 overflow-x-auto no-scrollbar">
              <button
                type="button"
                @click="activeZoneFilter = 'ALL'"
                class="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer"
                :class="activeZoneFilter === 'ALL' ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900' : 'text-text-secondary hover:bg-surface-3'"
              >Tất cả khu</button>
              <button
                v-for="z in floorPlan"
                :key="z.zone"
                type="button"
                @click="activeZoneFilter = z.zone"
                class="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer"
                :class="activeZoneFilter === z.zone ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900' : 'text-text-secondary hover:bg-surface-3'"
              >{{ z.name }} ({{ getZoneAvailableCount(z.tables) }}/{{ z.tables.length }})</button>
            </div>

            <div class="flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider">
              <div class="flex items-center gap-1"><div class="w-2.5 h-2.5 rounded bg-emerald-500/20 border border-emerald-500"></div> <span class="text-emerald-600 dark:text-emerald-400">Trống</span></div>
              <div class="flex items-center gap-1"><div class="w-2.5 h-2.5 rounded bg-amber-500/20 border border-amber-500"></div> <span class="text-amber-600 dark:text-amber-400">Sắp đến</span></div>
              <div class="flex items-center gap-1"><div class="w-2.5 h-2.5 rounded bg-rose-500/20 border border-rose-500"></div> <span class="text-rose-600 dark:text-rose-400">Đang dùng</span></div>
              <div class="flex items-center gap-1"><div class="w-2.5 h-2.5 rounded bg-blue-600"></div> <span class="text-blue-600 dark:text-blue-400">Đang chọn</span></div>
            </div>
          </div>
        </div>

        <!-- Content (Split Layout for desktop) -->
        <div class="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
          
          <!-- Left side: Interactive Floor Plan -->
          <div class="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-5 space-y-5 bg-slate-100/50 dark:bg-surface-canvas/60">
            <div v-for="zone in filteredFloorPlan" :key="zone.zone" class="bg-white dark:bg-surface-2 p-4 rounded-2xl shadow-xs border border-slate-200 dark:border-border-subtle relative overflow-hidden">
              <div class="flex items-center justify-between mb-3">
                <h3 class="text-xs font-black text-text-primary uppercase tracking-wider flex items-center gap-2">
                  <i class="fa-solid fa-layer-group text-apex-primary"></i>
                  <span>{{ zone.name }}</span>
                </h3>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  Trống {{ getZoneAvailableCount(zone.tables) }}/{{ zone.tables.length }} bàn
                </span>
              </div>
              
              <div class="grid grid-cols-4 gap-3 md:gap-4 ml-2">
                <button 
                  v-for="table in zone.tables" 
                  :key="table"
                  @click="handleTableSelect(table)"
                  @dragover.prevent="handleTableDragOver($event, table)"
                  @dragleave="handleTableDragLeave(table)"
                  @drop="handleTableDrop($event, table)"
                  class="relative h-15 rounded-xl flex flex-col items-center justify-center gap-0.5 font-black overflow-hidden transition-all border"
                  :class="{
                    'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-500/30 scale-[1.03] ring-2 ring-blue-400/40': isSelected(table),
                    'bg-white dark:bg-surface-3 text-slate-700 dark:text-slate-200 border-slate-200/80 dark:border-border-subtle hover:border-emerald-400 dark:hover:border-emerald-500/50 shadow-2xs': !isSelected(table) && getTableStatus(table) === 'available',
                    'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800/60 shadow-2xs': !isSelected(table) && getTableStatus(table) === 'reserved',
                    'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-800/60 shadow-2xs': !isSelected(table) && getTableStatus(table) === 'occupied',
                    'border-2 border-dashed border-blue-500 ring-2 ring-blue-100 dark:ring-blue-900/50': isOriginalTable(table) && !isSelected(table),
                    'scale-105 ring-4 ring-yellow-400 bg-yellow-100 dark:bg-yellow-950/50 border-yellow-500 text-yellow-800 dark:text-yellow-300': activeTableDragTarget === table
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
                  
                  <span class="text-base tracking-tight font-tabular" :class="isSelected(table) ? 'text-white' : 'text-slate-800 dark:text-slate-100'">{{ formatTableLabel(table) }}</span>
                  <span class="text-[9px] uppercase tracking-widest leading-none" :class="{
                    'text-blue-100': isSelected(table),
                    'text-emerald-600 dark:text-emerald-400': !isSelected(table) && getTableStatus(table) === 'available',
                    'text-amber-600 dark:text-amber-400': !isSelected(table) && getTableStatus(table) === 'reserved',
                    'text-rose-600 dark:text-rose-400': !isSelected(table) && getTableStatus(table) === 'occupied',
                  }">
                    {{ isSelected(table) ? 'ĐÃ CHỌN' : (getTableStatus(table) === 'available' ? 'TRỐNG' : (getTableStatus(table) === 'reserved' ? 'SẮP ĐẾN' : 'ĐANG DÙNG')) }}
                  </span>

                  <!-- Occupying details -->
                  <span v-if="!isSelected(table) && getTableStatus(table) !== 'available' && getOccupyingDetails(table)" class="text-[7px] text-slate-500 dark:text-text-secondary truncate max-w-full px-1 font-semibold leading-none mt-0.5">
                    {{ getOccupyingDetails(table) }}
                  </span>
                </button>
              </div>
            </div>
          </div>

          <!-- Right side: Draggable Bookings Queue -->
          <div class="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-border-subtle bg-white dark:bg-surface-3 flex flex-col shrink-0">
            <div class="p-3 border-b border-slate-100 dark:border-border-subtle bg-slate-50/50 dark:bg-surface-2 flex justify-between items-center shrink-0">
              <span class="font-black text-slate-800 dark:text-slate-200 text-[10px] uppercase tracking-widest flex items-center gap-1"><i class="fa-solid fa-list-check text-blue-500"></i> Hàng đợi xếp bàn (Ngày {{ bookingDate }})</span>
              <span class="px-2 py-0.5 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 rounded-full text-[9px] font-black">{{ targetDateBookings.length }} đơn</span>
            </div>
            
            <div class="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2 max-h-[25vh] lg:max-h-none bg-slate-50/30 dark:bg-surface-canvas/40">
              <div v-if="targetDateBookings.length === 0" class="text-center py-8 text-slate-400 dark:text-slate-500 text-xs italic font-semibold">
                Không có đơn đặt bàn ngày {{ bookingDate }}
              </div>
              <div 
                v-for="bk in targetDateBookings" 
                :key="bk.id"
                draggable="true"
                @dragstart="handleBookingDragStart($event, bk)"
                class="bg-white dark:bg-surface-2 hover:bg-slate-50 dark:hover:bg-surface-3 p-2.5 rounded-xl border cursor-grab active:cursor-grabbing flex flex-col gap-1 transition-all select-none hover:shadow-sm"
                :class="[!bk.parsedCustomer.tables || bk.parsedCustomer.tables === 'Chưa xếp' ? 'border-amber-300 dark:border-amber-800/80 bg-amber-50/30 dark:bg-amber-950/30 ring-2 ring-amber-300/10' : 'border-slate-200 dark:border-border-subtle']"
              >
                <div class="flex justify-between items-center gap-2">
                  <span class="font-black text-slate-800 dark:text-slate-100 text-xs truncate flex-1 min-w-0">{{ bk.parsedCustomer.name }}</span>
                  <span class="px-1.5 py-0.5 rounded text-[8px] font-black uppercase shrink-0" :class="bk.parsedCustomer.tables && bk.parsedCustomer.tables !== 'Chưa xếp' ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'">
                    {{ bk.parsedCustomer.tables && bk.parsedCustomer.tables !== 'Chưa xếp' ? bk.parsedCustomer.tables : 'Chưa xếp' }}
                  </span>
                </div>
                <div class="flex items-center justify-between text-[9px] text-slate-500 dark:text-slate-400 font-bold mt-1">
                  <span><i class="fa-solid fa-clock mr-1 text-blue-500/80"></i>{{ bk.parsedCustomer.time || '--:--' }}</span>
                  <span><i class="fa-solid fa-users mr-1 text-indigo-500/80"></i>{{ bk.parsedCustomer.pax || '0' }} khách</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-5 py-3.5 border-t border-slate-200 dark:border-border-subtle bg-white dark:bg-surface-3 shrink-0 shadow-[0_-4px_20px_rgba(0,0,0,0.02)] flex items-center gap-2.5">
          <button
            v-if="formStore.customer.tables"
            type="button"
            @click="formStore.customer.tables = ''"
            class="px-4 py-3.5 rounded-xl bg-surface-2 hover:bg-rose-500/10 text-text-secondary hover:text-rose-500 border border-border-default font-bold text-xs uppercase tracking-wider transition-all active:scale-95 cursor-pointer shrink-0"
            title="Xóa toàn bộ bàn đã chọn"
          >
            Xóa chọn
          </button>
          <button @click="closeFloorPlan" class="flex-1 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-md shadow-blue-600/20 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer">
            <i class="fa-solid fa-check"></i>
            <span>XÁC NHẬN BÀN: {{ formStore.customer.tables || 'CHƯA CHỌN' }}</span>
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
