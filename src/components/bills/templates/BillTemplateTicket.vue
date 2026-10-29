<script setup lang="ts">
import { computed } from 'vue'
import { formatVND, formatShortVND, getDayOfWeek, formatDepositTime, parseBillItemNote, useVerificationQr } from '../billHelpers'

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

const verificationQrUrl = useVerificationQr(() => qrLink.value || 'https://kg-booking.pages.dev', 240)
</script>

<template>
  <div class="w-full p-6 bg-slate-100 relative mx-auto text-slate-800 font-sans select-text">
    
    <!-- MAIN TICKET CARD CONTAINER -->
    <div class="bg-white rounded-3xl shadow-md border border-slate-200 overflow-hidden relative">
      
      <!-- TOP BANNER (Header Stripe) -->
      <div class="bg-blue-950 text-white px-8 py-4.5 flex items-center justify-between">
        <div class="flex items-center gap-3.5">
          <img 
            :src="configStore?.branding?.logo || '/images/brand-logo.svg'" 
            class="h-12 w-12 object-contain invert brightness-0 shrink-0" 
            alt="Logo"
          >
          <div>
            <div class="font-black text-base tracking-[0.14em] uppercase">KING'S GRILL RESTAURANT</div>
            <div class="text-[11px] font-bold text-amber-300 tracking-[0.14em] uppercase mt-0.5">PHIẾU ĐẶT BÀN • VIP BOARDING PASS</div>
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
            <div class="w-20 shrink-0 relative" :style="stampParallax ? { transform: `translate(${stampParallax.x}px, ${stampParallax.y}px)` } : {}">
              <img 
                :src="formStore?.deposit?.isPaid ? '/images/stamps/paid.png?v=2' : '/images/stamps/pending.png?v=2'" 
                class="w-full object-contain" 
                style="filter: contrast(1.06) saturate(1.1) drop-shadow(0 3px 8px rgba(15, 23, 42, 0.12));"
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

          <!-- Compact 2-column or full-width Set/Combo list view -->
          <div v-else class="grid grid-cols-2 gap-x-5 gap-y-2.5 text-xs">
            <div 
              v-for="(item, i) in formStore?.filteredBillItems" 
              :key="i"
              :class="[
                'flex items-start justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200/80',
                parseBillItemNote(item.note).parsedComponents.length > 0 ? 'col-span-2' : 'col-span-1'
              ]"
            >
              <div class="flex items-start gap-2.5 min-w-0 flex-1">
                <span class="w-5 h-5 rounded-md bg-blue-950 text-white text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5 tabular-nums">
                  {{ i + 1 }}
                </span>
                <div class="min-w-0 flex-1">
                  <div class="font-extrabold text-slate-900 uppercase leading-snug text-[12.5px]">
                    {{ item.name }}
                  </div>
                  <div v-if="item.note" class="mt-1.5 space-y-1.5">
                    <div
                      v-for="(cNote, cnIdx) in parseBillItemNote(item.note).customNotes"
                      :key="'cn-' + cnIdx"
                      class="text-[11px] text-rose-700 font-bold bg-rose-50 border-l-2 border-rose-400 px-2 py-0.5 rounded-r whitespace-pre-line leading-snug"
                    >
                      {{ cNote }}
                    </div>
                    <div
                      v-if="parseBillItemNote(item.note).parsedComponents.length > 0"
                      class="rounded-lg border border-blue-200 bg-white overflow-hidden"
                      style="background-color: #ffffff; border-color: #bfdbfe; border-left: 3px solid #172554;"
                    >
                      <div class="px-2.5 py-1 bg-blue-50 border-b border-blue-100 text-[9.5px] font-black uppercase tracking-wider text-blue-950">
                        • Chi tiết món trong gói ({{ parseBillItemNote(item.note).parsedComponents.length }} món)
                      </div>
                      <div class="flex flex-col divide-y divide-slate-100 px-2.5 py-0.5">
                        <div
                          v-for="(comp, cpIdx) in parseBillItemNote(item.note).parsedComponents"
                          :key="'cp-' + cpIdx"
                          class="py-1 flex items-center justify-between gap-3"
                        >
                          <div class="flex items-center gap-2 min-w-0 flex-1">
                            <span class="w-4 h-4 rounded bg-blue-950 text-white text-[9.5px] font-black inline-flex items-center justify-center shrink-0 tabular-nums">{{ comp.index }}</span>
                            <span class="text-[12px] font-bold text-slate-900 leading-snug">{{ comp.name }}</span>
                          </div>
                          <span v-if="comp.qty" class="px-1.5 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-950 font-mono font-black text-[10.5px] shrink-0 whitespace-nowrap tabular-nums">SL: {{ comp.qty }}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="text-right shrink-0 pl-3">
                <span class="px-2 py-0.5 rounded bg-white border border-slate-200 font-black text-slate-900 text-xs tabular-nums">
                  x{{ item.qty }}
                </span>
                <div v-if="!hidePrice" class="font-mono text-[11.5px] font-black text-blue-900 mt-1 tabular-nums whitespace-nowrap">
                  {{ formatVND(item.price * item.qty) }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Settlement Row -->
        <div class="grid grid-cols-12 gap-5 items-center pt-4 border-t border-slate-200">
          
          <!-- Left: Policy / Check-in QR -->
          <div class="col-span-5 flex items-center gap-3.5 text-xs text-slate-500">
            <img 
              v-if="verificationQrUrl"
              :src="verificationQrUrl" 
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
          <div v-if="!hidePrice" class="col-span-7 p-4 rounded-2xl bg-blue-50/60 border border-blue-200 space-y-2 text-xs">
            <div class="grid grid-cols-[1fr_auto] items-center gap-4 text-slate-600 leading-normal">
              <span class="font-bold text-[11px] uppercase whitespace-nowrap">TẠM TÍNH THỰC ĐƠN:</span>
              <span class="font-mono font-bold text-slate-800 text-xs tabular-nums whitespace-nowrap">{{ formatVND(formStore?.calculatedTotals?.sub || 0) }}</span>
            </div>
            <div class="grid grid-cols-[1fr_auto] items-center gap-4 pt-1 border-t border-dashed border-blue-200 leading-normal">
              <span class="font-black text-[12px] text-blue-950 uppercase whitespace-nowrap">TỔNG CỘNG:</span>
              <span class="font-mono font-black text-blue-950 text-[17px] tabular-nums whitespace-nowrap">{{ formatVND(formStore?.calculatedTotals?.final || 0) }}</span>
            </div>
            <div class="grid grid-cols-[1fr_auto] items-center gap-4 leading-normal" :class="formStore?.deposit?.isPaid ? 'text-emerald-700' : 'text-amber-700'">
              <span class="font-black text-[11px] uppercase whitespace-nowrap">{{ formStore?.deposit?.isPaid ? '✓ ĐÃ ĐẶT CỌC:' : '⏳ YÊU CẦU CỌC:' }}</span>
              <span class="font-mono font-black text-[15px] tabular-nums whitespace-nowrap">{{ formatVND(formStore?.deposit?.amount || 0) }}</span>
            </div>
            <div v-if="formStore?.deposit?.isPaid && formStore?.deposit?.time" class="grid grid-cols-[1fr_auto] items-center gap-4 text-[10px] text-slate-600 font-deposit-meta leading-normal" style="font-family: 'Google Sans Flex', 'Be Vietnam Pro', sans-serif;">
              <span class="font-semibold whitespace-nowrap">Thời gian nhận cọc:</span>
              <span class="font-bold tabular-nums whitespace-nowrap">{{ formatDepositTime(formStore.deposit.time) }}</span>
            </div>
            <div v-if="formStore?.deposit?.history?.length > 1" class="pt-1 border-t border-blue-200/70 space-y-0.5 text-[10px] text-slate-700 font-deposit-meta" style="font-family: 'Google Sans Flex', 'Be Vietnam Pro', sans-serif;">
              <div v-for="(h, idx) in formStore.deposit.history" :key="idx" class="flex justify-between items-center gap-3 leading-normal">
                <span class="font-medium">{{ h.note || `Cọc lần ${Number(idx) + 1}` }} <span v-if="h.time" class="text-[9px] text-slate-500">({{ formatDepositTime(h.time) }})</span>:</span>
                <span class="font-bold text-emerald-700 tabular-nums whitespace-nowrap">+{{ formatVND(h.amount) }}</span>
              </div>
            </div>
            <div v-if="((formStore?.calculatedTotals?.final || 0) - (formStore?.deposit?.amount || 0)) > 0" class="pt-2 border-t border-blue-200 grid grid-cols-[1fr_auto] items-center gap-4 text-rose-600 leading-normal">
              <span class="font-black text-[11.5px] uppercase whitespace-nowrap">CÒN LẠI THANH TOÁN:</span>
              <span class="font-mono font-black text-[17px] tabular-nums whitespace-nowrap">{{ formatVND((formStore?.calculatedTotals?.final || 0) - (formStore?.deposit?.amount || 0)) }}</span>
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
