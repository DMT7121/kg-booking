<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAI } from '@/composables/useAI'
import { useUIStore } from '@/stores/useUIStore'
import { useFormStore } from '@/stores/useFormStore'
import { useAppStore } from '@/stores/useAppStore'
import { haptic } from '@/composables/useGestures'

const uiStore = useUIStore()
const formStore = useFormStore()
const appStore = useAppStore()
const { processAI, extractByRules, preNormalizeInput, classifyInputType, validateParsedFields } = useAI()

const testCases = ref([
  {
    id: 1,
    name: 'Kịch bản 1: Nhiều số điện thoại & Nhiễu thông tin',
    rawInput: 'Anh Minh muốn đặt bàn ăn gia đình ngày 10/6 lúc 18h30. ĐT liên hệ 0912345678 hoặc số phụ 0987654321. Đi tầm 6 người nhé.',
    expected: {
      phone: '0912345678',
      date: '10/06/2026',
      time: '18:30',
      pax: 6
    },
    status: 'idle', // 'idle' | 'running' | 'passed' | 'failed'
    result: null as any,
    latency: null as number | null,
    modelUsed: '',
    error: ''
  },
  {
    id: 2,
    name: 'Kịch bản 2: Mã bàn đặt ngay cạnh tên khách',
    rawInput: 'Chị Vy bàn VIP2 đặt tiệc thôi nôi cho con gái bé Cát Tường ngày kia tầm 7h tối, khoảng 20 pax. Yêu cầu trang trí bong bóng màu hồng.',
    expected: {
      name: 'Chị Vy',
      tables: 'VIP2',
      date: (() => {
        const d = new Date()
        d.setDate(d.getDate() + 2) // "ngày kia" = today + 2
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
      })(),
      time: '19:00',
      pax: 20
    },
    status: 'idle',
    result: null as any,
    latency: null as number | null,
    modelUsed: '',
    error: ''
  },
  {
    id: 3,
    name: 'Kịch bản 3: Từ ngày tương đối sang tuyệt đối',
    rawInput: 'Đặt bàn ăn thường tối mai 7h 8 người',
    expected: {
      date: (() => {
        const d = new Date()
        d.setDate(d.getDate() + 1) // "tối mai" = tomorrow
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
      })(),
      time: '19:00',
      pax: 8
    },
    status: 'idle',
    result: null as any,
    latency: null as number | null,
    modelUsed: '',
    error: ''
  },
  {
    id: 4,
    name: 'Kịch bản 4: Tách biệt tên chủ tiệc và người liên hệ',
    rawInput: 'Anh Nam đặt tiệc sinh nhật cho vợ là chị Lan vào ngày kia lúc 18h. Liên hệ anh Nam 0912345678.',
    expected: {
      name: 'Anh Nam',
      phone: '0912345678',
      date: (() => {
        const d = new Date()
        d.setDate(d.getDate() + 2)
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
      })(),
      time: '18:00'
    },
    status: 'idle',
    result: null as any,
    latency: null as number | null,
    modelUsed: '',
    error: ''
  },
  {
    id: 5,
    name: 'Kịch bản 5: Đơn món có ghi chú đặc biệt',
    rawInput: 'Đặt bàn tối nay lúc 19h 4 người ăn lẩu thái, 1 dĩa sườn nướng khổng lồ ít cay, và 4 lon coca. SĐT 0912345678',
    expected: {
      date: (() => {
        const d = new Date()
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
      })(),
      time: '19:00',
      pax: 4,
      phone: '0912345678'
    },
    status: 'idle',
    result: null as any,
    latency: null as number | null,
    modelUsed: '',
    error: ''
  }
])

const isRunningAll = ref(false)
const selectedCaseIndex = ref<number | null>(null)

const stats = computed(() => {
  const total = testCases.value.length
  const passed = testCases.value.filter(c => c.status === 'passed').length
  const failed = testCases.value.filter(c => c.status === 'failed').length
  const running = testCases.value.filter(c => c.status === 'running').length
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0
  
  const latencies = testCases.value.filter(c => c.latency !== null).map(c => c.latency as number)
  const avgLatency = latencies.length > 0 ? (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2) : '0.00'

  return { total, passed, failed, running, passRate, avgLatency }
})

async function runTestCase(index: number) {
  const tc = testCases.value[index]
  tc.status = 'running'
  tc.error = ''
  tc.result = null
  tc.latency = null
  tc.modelUsed = ''

  const startTime = Date.now()

  try {
    // We will call the AI processing engine.
    // Temporary back up rawInput in formStore to simulate user typing
    const oldRawInput = formStore.rawInput
    formStore.rawInput = tc.rawInput
    
    // Call processAI directly. It returns nothing but sets values in formStore
    // Or we can invoke it and then capture the parsed results
    await processAI()

    const latencySec = (Date.now() - startTime) / 1000
    tc.latency = latencySec
    
    // Retrieve the parsed results from the formStore
    const parsed = formStore.parsedAiResult
    const routing = formStore.aiMetadata
    
    tc.result = parsed
    tc.modelUsed = routing?.model_used || 'Local Bypass'

    // Compare fields
    let pass = true
    const exp = tc.expected as any
    
    if (exp.phone && cleanPhone(parsed?.customer?.phone) !== cleanPhone(exp.phone)) pass = false
    if (exp.date && cleanDate(parsed?.booking?.event_date) !== cleanDate(exp.date)) pass = false
    if (exp.time && cleanTime(parsed?.booking?.event_time) !== cleanTime(exp.time)) pass = false
    if (exp.pax !== undefined && parsed?.booking?.guest_count !== exp.pax) pass = false
    if (exp.name && !String(parsed?.customer?.name).toLowerCase().includes(exp.name.toLowerCase())) pass = false
    if (exp.tables && !String(parsed?.booking?.table_number).toUpperCase().includes(exp.tables.toUpperCase())) pass = false

    tc.status = pass ? 'passed' : 'failed'

    // Restore old rawInput
    formStore.rawInput = oldRawInput
  } catch (err: any) {
    tc.status = 'failed'
    tc.error = err.message || 'Lỗi không xác định'
    tc.latency = (Date.now() - startTime) / 1000
  }
}

async function runAllTests() {
  haptic('medium')
  isRunningAll.value = true
  
  for (let i = 0; i < testCases.value.length; i++) {
    await runTestCase(i)
    // small sleep between requests to avoid rate limits
    await new Promise(r => setTimeout(r, 800))
  }
  
  isRunningAll.value = false
  uiStore.showToast(`Đã chạy xong ${testCases.value.length} kịch bản kiểm thử!`, 'info')
}

function resetTests() {
  haptic('light')
  testCases.value.forEach(tc => {
    tc.status = 'idle'
    tc.result = null
    tc.latency = null
    tc.modelUsed = ''
    tc.error = ''
  })
}

function cleanPhone(val: any) {
  return String(val || '').replace(/\D/g, '')
}

function cleanDate(val: any) {
  return String(val || '').trim()
}

function cleanTime(val: any) {
  return String(val || '').trim()
}
</script>

<template>
  <div class="flex-grow flex flex-col overflow-hidden bg-slate-900 text-slate-100 font-sans">
    <!-- HEADER -->
    <div class="p-4 border-b border-slate-800 bg-slate-950 shrink-0 flex items-center justify-between">
      <div>
        <h2 class="text-base font-black uppercase tracking-wider text-white flex items-center gap-2">
          <i class="fa-solid fa-flask text-rose-500"></i> Golden Test Suite
        </h2>
        <p class="text-[10px] text-slate-400 font-semibold mt-0.5">Hệ thống giám sát chất lượng và tính đúng đắn của AI Engine V7.0</p>
      </div>
      <div class="flex items-center gap-2">
        <button 
          @click="runAllTests" 
          :disabled="isRunningAll"
          class="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 disabled:bg-rose-800/40 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all active:scale-95 flex items-center gap-1.5 shadow-[0_4px_12px_rgba(244,63,94,0.3)]"
        >
          <i class="fa-solid" :class="isRunningAll ? 'fa-spinner animate-spin' : 'fa-play'"></i>
          <span>{{ isRunningAll ? 'Đang chạy...' : 'Chạy toàn bộ' }}</span>
        </button>
        <button 
          @click="resetTests" 
          :disabled="isRunningAll"
          class="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all active:scale-95"
          title="Đặt lại kịch bản"
        >
          <i class="fa-solid fa-arrow-rotate-left"></i>
        </button>
      </div>
    </div>

    <!-- STATS PANEL -->
    <div class="p-4 bg-slate-950/50 border-b border-slate-800/60 shrink-0 grid grid-cols-3 gap-2">
      <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 flex flex-col justify-between">
        <span class="text-[9px] font-black uppercase tracking-widest text-slate-400">Tỷ lệ chính xác</span>
        <div class="flex items-baseline gap-1 mt-1">
          <span class="text-2xl font-black tracking-tight" :class="stats.passRate === 100 ? 'text-emerald-400' : 'text-amber-400'">
            {{ stats.passRate }}%
          </span>
          <span class="text-[9px] text-slate-500 font-bold">({{ stats.passed }}/{{ stats.total }})</span>
        </div>
      </div>
      <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 flex flex-col justify-between">
        <span class="text-[9px] font-black uppercase tracking-widest text-slate-400">Độ trễ trung bình</span>
        <div class="flex items-baseline gap-1 mt-1">
          <span class="text-2xl font-black text-blue-400 tracking-tight">{{ stats.avgLatency }}s</span>
          <span class="text-[9px] text-slate-500 font-bold">/ req</span>
        </div>
      </div>
      <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 flex flex-col justify-between">
        <span class="text-[9px] font-black uppercase tracking-widest text-slate-400">Trạng thái</span>
        <div class="flex items-baseline gap-1 mt-1">
          <span class="text-xs font-black tracking-widest uppercase" :class="stats.running > 0 ? 'text-yellow-400 animate-pulse' : 'text-slate-400'">
            {{ stats.running > 0 ? 'Running' : 'Sẵn sàng' }}
          </span>
        </div>
      </div>
    </div>

    <!-- TEST LIST -->
    <div class="flex-grow overflow-y-auto p-4 space-y-3 custom-scrollbar">
      <div 
        v-for="(tc, index) in testCases" 
        :key="tc.id"
        class="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden transition-all duration-300 hover:border-slate-700"
      >
        <!-- Card Header -->
        <div 
          @click="selectedCaseIndex = selectedCaseIndex === index ? null : index"
          class="p-4 flex items-center justify-between cursor-pointer select-none"
        >
          <div class="flex items-center gap-3 min-w-0">
            <span class="w-6 h-6 rounded-lg bg-slate-800 flex items-center justify-center font-black text-xs text-slate-400 shrink-0">
              #{{ tc.id }}
            </span>
            <div class="min-w-0">
              <h3 class="font-bold text-xs text-white truncate">{{ tc.name }}</h3>
              <p class="text-[10px] text-slate-400 mt-0.5 truncate font-medium">Input: "{{ tc.rawInput }}"</p>
            </div>
          </div>
          <div class="flex items-center gap-3 shrink-0">
            <!-- Badge Status -->
            <span 
              v-if="tc.status === 'idle'" 
              class="px-2 py-0.5 bg-slate-800 text-slate-400 rounded-full font-black text-[9px] uppercase tracking-wider"
            >
              Chờ chạy
            </span>
            <span 
              v-else-if="tc.status === 'running'" 
              class="px-2 py-0.5 bg-yellow-950 border border-yellow-800/30 text-yellow-400 rounded-full font-black text-[9px] uppercase tracking-wider animate-pulse flex items-center gap-1"
            >
              <i class="fa-solid fa-spinner animate-spin text-[8px]"></i> Chạy
            </span>
            <span 
              v-else-if="tc.status === 'passed'" 
              class="px-2 py-0.5 bg-emerald-950 border border-emerald-800/30 text-emerald-400 rounded-full font-black text-[9px] uppercase tracking-wider flex items-center gap-1"
            >
              <i class="fa-solid fa-circle-check"></i> Đạt (Pass)
            </span>
            <span 
              v-else-if="tc.status === 'failed'" 
              class="px-2 py-0.5 bg-rose-950 border border-rose-800/30 text-rose-400 rounded-full font-black text-[9px] uppercase tracking-wider flex items-center gap-1"
            >
              <i class="fa-solid fa-circle-xmark"></i> Lỗi (Fail)
            </span>

            <button 
              @click.stop="runTestCase(index)"
              :disabled="isRunningAll || tc.status === 'running'"
              class="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-xs text-slate-300 transition-all active:scale-90"
              title="Chạy kịch bản này"
            >
              <i class="fa-solid fa-play"></i>
            </button>
          </div>
        </div>

        <!-- Card Body (Details) -->
        <div v-show="selectedCaseIndex === index" class="px-4 pb-4 border-t border-slate-800/40 bg-slate-950/20 space-y-3 pt-3">
          <!-- Text Input -->
          <div class="space-y-1">
            <span class="text-[9px] font-black uppercase tracking-wider text-slate-400 block">Dữ liệu thô (Raw Input)</span>
            <div class="bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs font-semibold leading-relaxed text-slate-350 select-text">
              {{ tc.rawInput }}
            </div>
          </div>

          <!-- Comparison Table -->
          <div class="space-y-1.5">
            <span class="text-[9px] font-black uppercase tracking-wider text-slate-400 block">So sánh kết quả thực tế</span>
            <div class="border border-slate-800 rounded-xl overflow-hidden bg-slate-900 text-xs">
              <table class="w-full text-left border-collapse">
                <thead>
                  <tr class="bg-slate-950 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-800">
                    <th class="p-2">Trường tin</th>
                    <th class="p-2">Kỳ vọng</th>
                    <th class="p-2">AI trích xuất</th>
                    <th class="p-2 text-right">Trạng thái</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-800 font-semibold">
                  <!-- Name Check -->
                  <tr v-if="tc.expected.name !== undefined">
                    <td class="p-2 text-slate-400 text-[10px]">Tên khách</td>
                    <td class="p-2 text-blue-300 font-mono">{{ tc.expected.name }}</td>
                    <td class="p-2 font-mono" :class="tc.result ? 'text-white' : 'text-slate-650'">
                      {{ tc.result?.customer?.name || 'N/A' }}
                    </td>
                    <td class="p-2 text-right">
                      <span v-if="!tc.result" class="text-slate-500 font-mono">-</span>
                      <span v-else-if="String(tc.result.customer?.name || '').toLowerCase().includes(tc.expected.name.toLowerCase())" class="text-emerald-400"><i class="fa-solid fa-check"></i></span>
                      <span v-else class="text-rose-400"><i class="fa-solid fa-xmark"></i> Mismatch</span>
                    </td>
                  </tr>
                  <!-- Phone Check -->
                  <tr v-if="tc.expected.phone !== undefined">
                    <td class="p-2 text-slate-400 text-[10px]">Số điện thoại</td>
                    <td class="p-2 text-blue-300 font-mono">{{ tc.expected.phone }}</td>
                    <td class="p-2 font-mono" :class="tc.result ? 'text-white' : 'text-slate-650'">
                      {{ tc.result?.customer?.phone || 'N/A' }}
                    </td>
                    <td class="p-2 text-right">
                      <span v-if="!tc.result" class="text-slate-500 font-mono">-</span>
                      <span v-else-if="cleanPhone(tc.result.customer?.phone) === cleanPhone(tc.expected.phone)" class="text-emerald-400"><i class="fa-solid fa-check"></i></span>
                      <span v-else class="text-rose-400"><i class="fa-solid fa-xmark"></i> Mismatch</span>
                    </td>
                  </tr>
                  <!-- Date Check -->
                  <tr v-if="tc.expected.date !== undefined">
                    <td class="p-2 text-slate-400 text-[10px]">Ngày tiệc</td>
                    <td class="p-2 text-blue-300 font-mono">{{ tc.expected.date }}</td>
                    <td class="p-2 font-mono" :class="tc.result ? 'text-white' : 'text-slate-650'">
                      {{ tc.result?.booking?.event_date || 'N/A' }}
                    </td>
                    <td class="p-2 text-right">
                      <span v-if="!tc.result" class="text-slate-500 font-mono">-</span>
                      <span v-else-if="cleanDate(tc.result.booking?.event_date) === cleanDate(tc.expected.date)" class="text-emerald-400"><i class="fa-solid fa-check"></i></span>
                      <span v-else class="text-rose-400"><i class="fa-solid fa-xmark"></i> Mismatch</span>
                    </td>
                  </tr>
                  <!-- Time Check -->
                  <tr v-if="tc.expected.time !== undefined">
                    <td class="p-2 text-slate-400 text-[10px]">Giờ tiệc</td>
                    <td class="p-2 text-blue-300 font-mono">{{ tc.expected.time }}</td>
                    <td class="p-2 font-mono" :class="tc.result ? 'text-white' : 'text-slate-650'">
                      {{ tc.result?.booking?.event_time || 'N/A' }}
                    </td>
                    <td class="p-2 text-right">
                      <span v-if="!tc.result" class="text-slate-500 font-mono">-</span>
                      <span v-else-if="cleanTime(tc.result.booking?.event_time) === cleanTime(tc.expected.time)" class="text-emerald-400"><i class="fa-solid fa-check"></i></span>
                      <span v-else class="text-rose-400"><i class="fa-solid fa-xmark"></i> Mismatch</span>
                    </td>
                  </tr>
                  <!-- Pax Check -->
                  <tr v-if="tc.expected.pax !== undefined">
                    <td class="p-2 text-slate-400 text-[10px]">Số lượng khách</td>
                    <td class="p-2 text-blue-300 font-mono">{{ tc.expected.pax }} người</td>
                    <td class="p-2 font-mono" :class="tc.result ? 'text-white' : 'text-slate-650'">
                      {{ tc.result?.booking?.guest_count || 'N/A' }}
                    </td>
                    <td class="p-2 text-right">
                      <span v-if="!tc.result" class="text-slate-500 font-mono">-</span>
                      <span v-else-if="tc.result.booking?.guest_count === tc.expected.pax" class="text-emerald-400"><i class="fa-solid fa-check"></i></span>
                      <span v-else class="text-rose-400"><i class="fa-solid fa-xmark"></i> Mismatch</span>
                    </td>
                  </tr>
                  <!-- Tables Check -->
                  <tr v-if="tc.expected.tables !== undefined">
                    <td class="p-2 text-slate-400 text-[10px]">Mã bàn / VIP</td>
                    <td class="p-2 text-blue-300 font-mono">{{ tc.expected.tables }}</td>
                    <td class="p-2 font-mono" :class="tc.result ? 'text-white' : 'text-slate-650'">
                      {{ tc.result?.booking?.table_number || 'N/A' }}
                    </td>
                    <td class="p-2 text-right">
                      <span v-if="!tc.result" class="text-slate-500 font-mono">-</span>
                      <span v-else-if="String(tc.result.booking?.table_number || '').toUpperCase().includes(tc.expected.tables.toUpperCase())" class="text-emerald-400"><i class="fa-solid fa-check"></i></span>
                      <span v-else class="text-rose-400"><i class="fa-solid fa-xmark"></i> Mismatch</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Metadata & Debug Info -->
          <div v-if="tc.result || tc.error" class="grid grid-cols-2 gap-2 text-[10px]">
            <div class="bg-slate-900 border border-slate-800 p-2.5 rounded-xl space-y-1">
              <span class="text-slate-500 font-bold uppercase tracking-wider block">Thông tin định tuyến</span>
              <div class="font-semibold text-slate-300">Model: <span class="text-rose-400 font-bold">{{ tc.modelUsed }}</span></div>
              <div class="font-semibold text-slate-300">Độ trễ: <span class="text-blue-400 font-bold">{{ tc.latency ? tc.latency.toFixed(2) + 's' : 'N/A' }}</span></div>
            </div>
            <div class="bg-slate-900 border border-slate-800 p-2.5 rounded-xl space-y-1">
              <span class="text-slate-500 font-bold uppercase tracking-wider block">Báo cáo kiểm thử</span>
              <div v-if="tc.error" class="text-rose-450 font-bold leading-tight">{{ tc.error }}</div>
              <div v-else class="font-semibold text-slate-300 leading-tight">
                Confidence: <span class="text-emerald-400 font-bold">{{ tc.result?.confidence?.overall ? Math.round(tc.result.confidence.overall * 100) + '%' : 'N/A' }}</span>
                <div class="text-[9px] text-slate-500 mt-0.5">Checklist trúng tuyển và kiểm tra thực thi thành công.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 99px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}
</style>
