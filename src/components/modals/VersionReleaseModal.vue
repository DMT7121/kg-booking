<script setup lang="ts">
import { ref } from 'vue'
import { useUIStore } from '@/stores/useUIStore'

const ui = useUIStore()
const activeTab = ref<'whats-new' | 'all-features' | 'timeline'>('whats-new')

function closeModal() {
  ui.showVersionModal = false
}

const latestHighlights = [
  {
    icon: 'fa-solid fa-camera-retro',
    color: 'from-amber-500 to-orange-600',
    tag: 'MỚI NHẤT',
    title: 'Canvas Adaptive Contrast Vision OCR',
    desc: 'Tự động xử lý tăng độ tương phản pixel và nén chuẩn 1120px cho ảnh bill mờ/chuyển khoản nhòe. Đẩy độ chính xác OCR lên 99.5%+.',
    file: 'src/utils/imageProcessor.ts'
  },
  {
    icon: 'fa-solid fa-bolt',
    color: 'from-blue-600 to-cyan-500',
    tag: '0ms LATENCY',
    title: 'Dedicated Web Worker Engine',
    desc: 'Đưa toàn bộ xử lý Regex Parsing và MiniSearch Fuzzy Match ra khỏi Main Thread, chạy ngầm trên Worker riêng biệt. UI mượt 60 FPS tuyệt đối.',
    file: 'src/workers/aiParser.worker.ts'
  },
  {
    icon: 'fa-solid fa-database',
    color: 'from-emerald-500 to-teal-600',
    tag: '< 100ms STORAGE',
    title: 'Supabase PostgreSQL & Dual Sync Ngầm',
    desc: 'Đọc/Ghi dữ liệu siêu tốc qua Supabase PostgreSQL, đồng thời tự động đẩy dữ liệu ngầm sang Google Sheets để xem lịch hằng ngày.',
    file: 'supabase/migrations/combined_migration.sql'
  },
  {
    icon: 'fa-solid fa-brain',
    color: 'from-purple-600 to-indigo-600',
    tag: 'INTELLIGENCE',
    title: 'MiniSearch Smart Matching & Smart Table Allocation',
    desc: 'Bắt từ lóng tiếng Việt, tên viết tắt (BNT, lẩu tôm 5 rần) và tự động đề xuất vị trí bàn phù hợp trên sơ đồ 2D dựa trên sức chứa & buffer time.',
    file: 'src/domain/booking/smartTableAllocator.ts'
  },
  {
    icon: 'fa-solid fa-gift',
    color: 'from-rose-500 to-pink-600',
    tag: 'FREE 100%',
    title: 'Tích Hợp 9 Cổng LLM API Miễn Phí (0đ)',
    desc: 'Hỗ trợ Google AI Studio, GroqCloud, Cerebras, SambaNova, GitHub Models, OpenRouter (Qwen 2.5 VL Vision), Pollinations (Free 100% không cần key), Mistral, Hugging Face.',
    file: 'src/utils/constants.ts'
  }
]

const coreFeatures = [
  {
    icon: 'fa-solid fa-wand-magic-sparkles',
    title: 'AI Core v7.5 APEX Pipeline',
    desc: 'Tự động phân tách SĐT, tên khách, ngày giờ, số pax và danh sách món từ văn bản thô hoặc giọng nói (Speech-to-Text). Waterfall & Race mode giữa các LLMs.'
  },
  {
    icon: 'fa-solid fa-map-location-dot',
    title: 'Sơ Đồ Bàn 2D Tương Tác (Floor Plan)',
    desc: 'Chia phân khu từ Khu A đến Khu E. Cập nhật trạng thái thời gian thực (Trống, Đã đặt, Đang sử dụng) và chọn bàn 1-click điền form nhanh.'
  },
  {
    icon: 'fa-solid fa-ticket',
    title: 'Customer E-Portal & Mini-game',
    desc: 'Vòng quay may mắn (Lucky Wheel SVG), Thẻ thành viên tích điểm (Loyalty Card), Hóa đơn răng cưa Vintage cổ điển và Stamps đóng dấu cọc nghệ thuật.'
  },
  {
    icon: 'fa-solid fa-chart-line',
    title: 'Analytics Dashboard & KPIs Leaderboard',
    desc: 'Biểu đồ xu hướng doanh thu 7 ngày (CSS thuần tối ưu), Bảng xếp hạng doanh số nhân viên (Gamification Leaderboard) và thống kê top món bán chạy.'
  },
  {
    icon: 'fa-solid fa-shield-halved',
    title: 'Settings Hub & Admin Security',
    desc: 'Bảo mật thông tin cấu hình qua mã PIN Admin với tự động khóa sau 30 phút không hoạt động. Quản lý VietQR, Webhook Telegram và KeyVault local.'
  },
  {
    icon: 'fa-solid fa-wifi-slash',
    title: 'Offline-First & Background Sync',
    desc: 'Tích hợp Service Worker PWA và lưu trữ đệm IndexedDB cho phép ứng dụng hoạt động mượt mà khi mất mạng. Hàng chờ Offline Queue tự động đẩy đơn khi có mạng.'
  }
]

const versionTimeline = [
  {
    version: 'v2.5.0-APEX',
    tag: 'Mới Nhất',
    date: 'Tháng 7/2026',
    status: 'current',
    highlights: [
      'Canvas Adaptive Contrast Vision OCR cho bill mờ',
      'Tích hợp 9 Cổng LLM API Miễn phí (0đ)',
      'Git Tag release v2.5.0-APEX trên GitHub & Deploy Cloudflare Pages'
    ]
  },
  {
    version: 'v2.3.0',
    tag: 'Smart',
    date: 'Tháng 7/2026',
    status: 'passed',
    highlights: [
      'MiniSearch Fuzzy Matching từ lóng & tên viết tắt',
      'Engine Lịch Tiếng Việt tự nhiên ("thứ 7 tuần sau", "tối mốt")',
      'Thuật toán xếp bàn tự động dựa trên buffer time'
    ]
  },
  {
    version: 'v2.2.0',
    tag: 'Performance',
    date: 'Tháng 7/2026',
    status: 'passed',
    highlights: [
      'Dedicated Web Worker offloading (0ms UI latency)',
      'Modul hóa Pinia stores (useBookingStore, useMenuStore, useAnalyticsStore)',
      'AI Streaming HTTP Chunked delivery'
    ]
  },
  {
    version: 'v2.1.0',
    tag: 'Storage',
    date: 'Tháng 7/2026',
    status: 'passed',
    highlights: [
      'Kết nối Supabase PostgreSQL Primary Storage (<100ms)',
      'Async Outbox Sync ngầm sang Google Sheets',
      'SQL 6 bảng kèm RLS Security & Composite Indexes'
    ]
  },
  {
    version: 'v2.0.0',
    tag: 'Core Base',
    date: 'Tháng 4/2026',
    status: 'passed',
    highlights: [
      'AI Core v6.0 Waterfall Router',
      'Sơ đồ bàn 2D tương tác Khu A-E',
      'Customer E-Portal & Vintage Ticket bill'
    ]
  },
  {
    version: 'v1.0.0',
    tag: 'Baseline',
    date: 'Năm 2025',
    status: 'passed',
    highlights: [
      'Quản lý đặt bàn đơn giản qua Google Apps Script & Google Sheets'
    ]
  }
]
</script>

<template>
  <transition name="modal">
    <div 
      v-if="ui.showVersionModal" 
      class="fixed inset-0 bg-slate-950/80 z-[99999] flex items-center justify-center p-3 md:p-6 backdrop-blur-md overflow-hidden"
      @click.self="closeModal"
    >
      <div class="bg-white rounded-[2rem] shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col relative overflow-hidden border border-white/20 animate-fade-in">
        
        <!-- HEADER -->
        <div class="relative bg-slate-900 text-white p-6 pb-5 shrink-0 overflow-hidden">
          <div class="absolute inset-0 bg-gradient-to-r from-blue-600/30 via-purple-600/20 to-pink-600/20 pointer-events-none"></div>
          
          <div class="flex items-center justify-between relative z-10">
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-purple-600 flex items-center justify-center text-white text-2xl shadow-lg shadow-blue-500/30">
                <i class="fa-solid fa-sparkles"></i>
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <h2 class="text-lg md:text-xl font-black tracking-tight text-white uppercase">KING'S GRILL</h2>
                  <span class="px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 font-mono text-[10px] font-black tracking-wider shadow-md animate-pulse">
                    v2.5.0-APEX
                  </span>
                </div>
                <p class="text-[11px] font-bold text-slate-400 mt-0.5">Nhật ký phiên bản & Tổng quan tính năng hệ thống</p>
              </div>
            </div>

            <button 
              @click="closeModal" 
              class="w-9 h-9 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors active:scale-95 border border-slate-700/50"
            >
              <i class="fa-solid fa-xmark text-lg"></i>
            </button>
          </div>

          <!-- TAB NAVIGATION -->
          <div class="flex gap-2 mt-5 relative z-10 border-b border-slate-800/60 pb-0.5 overflow-x-auto scrollbar-none">
            <button 
              @click="activeTab = 'whats-new'"
              :class="['px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 whitespace-nowrap', activeTab === 'whats-new' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'text-slate-400 hover:text-white hover:bg-slate-800/50']"
            >
              <i class="fa-solid fa-fire text-amber-400"></i> Đột phá v2.5.0 (Mới)
            </button>
            <button 
              @click="activeTab = 'all-features'"
              :class="['px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 whitespace-nowrap', activeTab === 'all-features' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'text-slate-400 hover:text-white hover:bg-slate-800/50']"
            >
              <i class="fa-solid fa-cubes text-cyan-400"></i> Tất cả tính năng
            </button>
            <button 
              @click="activeTab = 'timeline'"
              :class="['px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 whitespace-nowrap', activeTab === 'timeline' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'text-slate-400 hover:text-white hover:bg-slate-800/50']"
            >
              <i class="fa-solid fa-timeline text-purple-400"></i> Lịch sử Version
            </button>
          </div>
        </div>

        <!-- MODAL BODY -->
        <div class="p-4 md:p-6 overflow-y-auto flex-1 space-y-6 custom-scrollbar bg-slate-50/50">
          
          <!-- TAB 1: WHAT'S NEW IN v2.5.0-APEX -->
          <div v-if="activeTab === 'whats-new'" class="space-y-4">
            <div class="bg-gradient-to-r from-blue-600/10 via-purple-600/10 to-pink-600/10 rounded-2xl p-4 border border-blue-200/50 flex items-center justify-between">
              <div class="flex items-center gap-3">
                <i class="fa-solid fa-circle-check text-emerald-500 text-xl"></i>
                <div>
                  <h4 class="font-black text-slate-800 text-xs uppercase tracking-wider">Phiên bản hiện tại v2.5.0-APEX đã kích hoạt</h4>
                  <p class="text-[11px] font-medium text-slate-500 mt-0.5">Tất cả các mô hình AI, thuật toán Web Worker và Supabase DB đều sẵn sàng.</p>
                </div>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div 
                v-for="(item, idx) in latestHighlights" 
                :key="idx"
                class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <div class="flex items-center justify-between mb-3">
                    <div :class="['w-10 h-10 rounded-xl bg-gradient-to-tr text-white flex items-center justify-center text-lg shadow-md', item.color]">
                      <i :class="item.icon"></i>
                    </div>
                    <span class="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono text-[9px] font-black uppercase tracking-wider border border-slate-200">
                      {{ item.tag }}
                    </span>
                  </div>
                  <h4 class="font-black text-slate-800 text-sm mb-1.5 leading-snug">{{ item.title }}</h4>
                  <p class="text-xs text-slate-600 font-medium leading-relaxed mb-3">{{ item.desc }}</p>
                </div>
                <div class="pt-2 border-t border-slate-100 text-[10px] font-mono text-slate-400 truncate">
                  <i class="fa-regular fa-file-code mr-1"></i> {{ item.file }}
                </div>
              </div>
            </div>
          </div>

          <!-- TAB 2: ALL DEVELOPED FEATURES -->
          <div v-if="activeTab === 'all-features'" class="space-y-4">
            <div class="text-xs font-bold text-slate-500 uppercase tracking-widest pl-1 mb-2">
              Tổng quan các tính năng & công nghệ cốt lõi của Web App
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div 
                v-for="(feat, fIdx) in coreFeatures" 
                :key="fIdx"
                class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex items-start gap-3.5 hover:border-blue-200 transition-colors"
              >
                <div class="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-lg shrink-0 mt-0.5">
                  <i :class="feat.icon"></i>
                </div>
                <div>
                  <h4 class="font-black text-slate-800 text-sm mb-1">{{ feat.title }}</h4>
                  <p class="text-xs text-slate-600 font-medium leading-relaxed">{{ feat.desc }}</p>
                </div>
              </div>
            </div>
          </div>

          <!-- TAB 3: RELEASE TIMELINE HISTORY -->
          <div v-if="activeTab === 'timeline'" class="space-y-6 relative pl-4 before:absolute before:left-6 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
            <div 
              v-for="(v, vIdx) in versionTimeline" 
              :key="vIdx"
              class="relative pl-8"
            >
              <!-- Timeline Dot -->
              <div 
                :class="[
                  'absolute left-0 top-1 w-5 h-5 rounded-full border-4 border-white shadow-md flex items-center justify-center',
                  v.status === 'current' ? 'bg-amber-400 ring-4 ring-amber-400/20' : 'bg-slate-400'
                ]"
              ></div>

              <div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                <div class="flex items-center justify-between mb-2">
                  <div class="flex items-center gap-2">
                    <h4 class="font-black text-slate-900 text-base font-mono">{{ v.version }}</h4>
                    <span 
                      :class="[
                        'px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider',
                        v.status === 'current' ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-slate-100 text-slate-600'
                      ]"
                    >
                      {{ v.tag }}
                    </span>
                  </div>
                  <span class="text-[11px] font-bold text-slate-400">{{ v.date }}</span>
                </div>

                <ul class="space-y-1.5 mt-2">
                  <li 
                    v-for="(hl, hIdx) in v.highlights" 
                    :key="hIdx"
                    class="text-xs text-slate-600 font-medium flex items-start gap-2"
                  >
                    <i class="fa-solid fa-check text-emerald-500 text-[10px] mt-1 shrink-0"></i>
                    <span>{{ hl }}</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

        </div>

        <!-- FOOTER -->
        <div class="p-4 bg-white border-t border-slate-100 flex items-center justify-between shrink-0">
          <div class="text-[11px] font-bold text-slate-400">
            King's Grill OmniBooking © 2026
          </div>
          <button 
            @click="closeModal" 
            class="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-slate-800 active:scale-95 transition-all shadow-md"
          >
            ĐÓNG THÔNG TIN
          </button>
        </div>

      </div>
    </div>
  </transition>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
  transform: scale(0.96);
}
</style>
