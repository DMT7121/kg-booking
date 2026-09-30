<script setup lang="ts">
import { computed } from 'vue'
import { formatVND, formatShortVND, getDayOfWeek, formatDepositTime } from '../billHelpers'

const props = defineProps<{
  formStore: any
  configStore: any
  appStore: any
  qrImageUrl?: string
  depositTransferContent?: string
  stampParallax?: { x: number; y: number }
  hidePrice?: boolean
}>()

const dayOfWeek = computed(() => getDayOfWeek(props.formStore?.customer?.date))

const qrLink = computed(() => {
  if (typeof window === 'undefined') return ''
  const id = props.formStore?.id
  return id ? `${window.location.origin}${window.location.pathname}#/bill/${id}` : ''
})
</script>

<template>
  <div class="w-full p-6 bg-slate-100 relative mx-auto text-slate-800 font-sans select-text">
    
    <!-- MAIN TICKET CARD CONTAINER -->
    <div class="bg-white rounded-3xl shadow-md border border-slate-200 overflow-hidden relative">
      
      <!-- TOP BANNER (Header Stripe) -->
      <div class="bg-blue-950 text-white px-8 py-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <img 
            :src="configStore?.branding?.logo || '/images/brand-logo.svg'" 
            class="h-10 w-10 object-contain invert brightness-0 shrink-0" 
            alt="Logo"
          >
          <div>
            <div class="font-black text-sm tracking-widest uppercase">KING'S GRILL RESTAURANT</div>
            <div class="text-[10px] text-blue-200">THẺ XÁC NHẬN BÀN TIỆC • VIP PASS</div>
          </div>
        </div>

        <!-- Simulated Barcode Header -->
        <div class="text-right">
          <div class="font-mono text-xs tracking-widest text-slate-300 select-none">
            ||| | |||| | |||||| || | ||| |||| |
          </div>
          <div class="text-[9px] font-mono text-blue-200 mt-0.5">
            #{{ formStore?.id ? formStore.id.slice(-8).toUpperCase() : 'KG-PASS' }}
          </div>
        </div>
      </div>

      <!-- TICKET TOP STUB (Cuống Vé: Thông Tin Đón Khách) -->
      <div class="p-8 pb-4 relative">
        <div class="flex items-start justify-between gap-6">
          
          <!-- Flight / Event Style Big Time & Date -->
          <div class="flex items-baseline gap-4">
            <div>
              <div class="text-[10px] font-black uppercase tracking-wider text-slate-400">GIỜ CHECK-IN:</div>
              <div class="text-4xl font-black font-mono tracking-tight text-blue-950">
                {{ formStore?.customer?.time || '--:--' }}
              </div>
            </div>
            <div class="text-xs font-bold text-slate-600 pl-4 border-l border-slate-200">
              <div>{{ dayOfWeek ? dayOfWeek + ', ' : '' }}{{ formStore?.customer?.date || 'dd/mm/yyyy' }}</div>
              <div class="text-[11px] text-blue-700 font-black mt-0.5">BÀN: {{ formStore?.customer?.tables || 'Xếp tại quầy' }}</div>
            </div>
          </div>

          <!-- Guest Info & Stamp -->
          <div class="flex items-center gap-4 text-right">
            <div>
              <div class="text-[10px] font-black uppercase tracking-wider text-slate-400">KHÁCH HÀNG:</div>
              <div class="text-lg font-black text-slate-900 uppercase">
                {{ formStore?.customer?.name || 'QUÝ KHÁCH' }}
              </div>
              <div class="text-xs font-mono font-bold text-slate-500">
                {{ formStore?.customer?.phone || '---' }} • {{ formStore?.customer?.pax || 0 }} khách
              </div>
            </div>

            <!-- Stamp on Stub -->
            <div class="w-16 shrink-0 relative" :style="stampParallax ? { transform: `translate(${stampParallax.x}px, ${stampParallax.y}px)` } : {}">
              <img 
                :src="formStore?.deposit?.isPaid ? '/images/stamps/paid.png' : '/images/stamps/pending.png'" 
                class="w-full object-contain filter drop-shadow-sm" 
                alt="Stamp"
              />
            </div>
          </div>
        </div>

        <!-- Special Event Note (if any) -->
        <div v-if="formStore?.customer?.note" class="mt-4 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-950 flex items-center gap-2">
          <i class="fa-solid fa-bell text-amber-600"></i>
          <span>Lưu ý: {{ formStore.customer.note }}</span>
        </div>
      </div>

      <!-- PERFORATED TEAR-OFF LINE (Đường đứt đoạn vết cắt vé) -->
      <div class="relative py-2 my-1">
        <div class="border-b-2 border-dashed border-slate-300"></div>
        <!-- Left Notch Cutout -->
        <div class="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-100 border-r border-slate-200"></div>
        <!-- Right Notch Cutout -->
        <div class="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-100 border-l border-slate-200"></div>
      </div>

      <!-- TICKET MAIN BODY (Thực Đơn & Chi Tiết Thanh Toán) -->
      <div class="p-8 pt-4">
        
        <!-- Menu Items: Compact Two-Column List -->
        <div class="mb-6">
          <div class="flex items-center justify-between text-xs font-black uppercase tracking-wider text-slate-400 pb-2 border-b border-slate-200 mb-3">
            <span>DANH SÁCH THỰC ĐƠN ĐÃ ĐẶT</span>
            <span>{{ formStore?.filteredBillItems?.length || 0 }} MÓN</span>
          </div>

          <!-- Empty state -->
          <div v-if="!formStore?.filteredBillItems?.length" class="py-6 text-center text-slate-400 text-xs font-semibold bg-slate-50 rounded-xl">
            Khách chọn món trực tiếp tại nhà hàng • Đã giữ bàn
          </div>

          <!-- Compact 2-column or list view -->
          <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-xs">
            <div 
              v-for="(item, i) in formStore?.filteredBillItems" 
              :key="i"
              class="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-150"
            >
              <div class="flex items-center gap-2 min-w-0 flex-1">
                <span class="w-5 h-5 rounded-md bg-blue-950 text-white text-[10px] font-black flex items-center justify-center shrink-0">
                  {{ i + 1 }}
                </span>
                <div class="min-w-0">
                  <div class="font-bold text-slate-800 uppercase truncate text-[12px]">
                    {{ item.name }}
                  </div>
                  <div v-if="item.note" class="text-[10px] text-rose-600 font-medium truncate">
                    {{ item.note }}
                  </div>
                </div>
              </div>

              <div class="text-right shrink-0 pl-2">
                <span class="px-2 py-0.5 rounded bg-white border border-slate-200 font-black text-slate-900 text-xs">
                  x{{ item.qty }}
                </span>
                <div v-if="!hidePrice" class="font-mono text-[11px] font-bold text-blue-900 mt-0.5">
                  {{ formatShortVND(item.price * item.qty) }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Settlement Row -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 items-center pt-4 border-t border-slate-200">
          
          <!-- Left: Policy / Check-in QR -->
          <div class="flex items-center gap-4 text-xs text-slate-500">
            <img 
              :src="`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrLink || 'https://kg-booking.pages.dev')}`" 
              class="w-16 h-16 object-contain rounded-xl border border-slate-200 p-1 shrink-0" 
              alt="Check-in QR"
            />
            <div>
              <div class="font-black text-slate-800 text-[11px] uppercase tracking-wider">CHECK-IN NHANH TẠI QUẦY</div>
              <p class="text-[10px] text-slate-400 mt-0.5 leading-snug">
                Đưa mã này cho nhân viên lễ tân khi đến King's Grill để vào bàn ngay lập tức.
              </p>
              <div class="text-[10px] font-bold text-blue-600 mt-1">
                Nhân viên đón tiếp: {{ formStore?.staff?.name || 'King\'s Grill Team' }}
              </div>
            </div>
          </div>

          <!-- Right: Totals Box (Only if not hidePrice) -->
          <div v-if="!hidePrice" class="p-4 rounded-2xl bg-blue-50/60 border border-blue-200 space-y-1.5 text-xs text-right">
            <div class="flex justify-between items-center text-slate-600">
              <span class="font-bold text-[10px] uppercase">TỔNG TIỆC:</span>
              <span class="font-mono font-black text-slate-900 text-sm">{{ formatVND(formStore?.calculatedTotals?.final || 0) }}</span>
            </div>
            <div class="flex justify-between items-center" :class="formStore?.deposit?.isPaid ? 'text-emerald-700' : 'text-amber-700'">
              <span class="font-bold text-[10px] uppercase">TIỀN CỌC:</span>
              <span class="font-mono font-black text-sm">{{ formatVND(formStore?.deposit?.amount || 0) }} ({{ formStore?.deposit?.isPaid ? 'ĐÃ CỌC' : 'CHỜ CỌC' }})</span>
            </div>
            <div class="pt-1.5 border-t border-blue-200 flex justify-between items-center text-rose-600">
              <span class="font-black text-[10px] uppercase">CÒN LẠI:</span>
              <span class="font-mono font-black text-base">{{ formatVND((formStore?.calculatedTotals?.final || 0) - (formStore?.deposit?.amount || 0)) }}</span>
            </div>
          </div>

          <div v-else class="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center text-xs font-semibold text-slate-600">
            ❤ Chúc Quý khách có một buổi tiệc trọn vẹn và ngon miệng tại King's Grill!
          </div>
        </div>

        <!-- Quick VietQR Payment Strip (If unpaid and not hidePrice) -->
        <div v-if="!hidePrice && appStore?.currentBank && !formStore?.deposit?.isPaid" class="mt-6 p-4 rounded-2xl bg-slate-900 text-white flex items-center justify-between gap-4">
          <div class="text-left text-xs space-y-1 flex-1">
            <div class="text-[10px] font-black uppercase text-amber-400">CHUYỂN KHOẢN GIỮ BÀN NHANH (VIETQR)</div>
            <div class="font-mono font-bold text-sm">{{ appStore.currentBank.name }} • {{ appStore.currentBank.number }}</div>
            <div class="text-[11px] text-slate-300">Chủ TK: {{ appStore.currentBank.owner }} • ND: <span class="text-cyan-300 font-mono font-bold">{{ depositTransferContent }}</span></div>
          </div>
          <img :src="qrImageUrl" class="w-24 h-24 object-contain rounded-xl bg-white p-1 shrink-0" alt="VietQR" />
        </div>

      </div>

      <!-- TICKET FOOTER -->
      <div class="bg-slate-50 px-8 py-3 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-400 font-mono">
        <div v-if="formStore?.staff?.phone">
          KING'S GRILL • NV HỖ TRỢ: {{ formStore.staff.name || '---' }} ({{ formStore.staff.phone }})
        </div>
        <div v-else>
          KING'S GRILL RESTAURANT • HÂN HẠNH PHỤC VỤ
        </div>
        <div>WWW.KINGSGRILL.VN</div>
      </div>

    </div>
  </div>
</template>
