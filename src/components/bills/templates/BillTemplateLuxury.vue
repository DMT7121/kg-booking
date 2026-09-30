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
  <div class="w-full p-5 bg-[#FAF9F5] border-[5px] border-[#C5A059]/60 relative mx-auto text-slate-800 font-sans select-text">
    
    <!-- INNER ROYAL FRAME -->
    <div class="border-2 border-[#C5A059] p-8 md:p-10 bg-white relative shadow-sm overflow-hidden">
      
      <!-- SUBTLE WATERMARK EMBLEM (Center Background) -->
      <div class="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03] select-none">
        <img :src="configStore?.branding?.logo || '/images/brand-logo.svg'" class="w-[500px] h-[500px] object-contain" alt="Watermark">
      </div>

      <!-- CORNER ORNAMENTS (4 Góc Hoàng Gia) -->
      <div class="absolute top-2 left-2 text-[#C5A059] text-base leading-none select-none">╔</div>
      <div class="absolute top-2 right-2 text-[#C5A059] text-base leading-none select-none">╗</div>
      <div class="absolute bottom-2 left-2 text-[#C5A059] text-base leading-none select-none">╚</div>
      <div class="absolute bottom-2 right-2 text-[#C5A059] text-base leading-none select-none">╝</div>

      <!-- ROYAL HEADER -->
      <div class="text-center relative pb-6 border-b border-[#C5A059]/40 mb-6">
        <div class="flex justify-center mb-2">
          <div class="p-2 rounded-full border border-[#C5A059]/30 bg-[#FAF9F5] shadow-2xs">
            <img 
              :src="configStore?.branding?.logo || '/images/brand-logo.svg'" 
              class="h-16 w-16 object-contain" 
              alt="King's Grill Logo" 
              loading="eager"
            />
          </div>
        </div>

        <h1 class="text-3xl font-black tracking-widest text-[#0B192C] uppercase" style="font-family: 'Be Vietnam Pro', serif;">
          KING'S GRILL
        </h1>
        
        <p class="text-xs text-slate-500 font-medium mt-1">
          34 Hoàng Văn Thụ, Phường Thủ Dầu Một, TP. Hồ Chí Minh
        </p>

        <div class="text-[10px] font-mono text-slate-400 font-bold mt-2">
          MÃ ĐƠN: #{{ formStore?.id ? formStore.id.slice(-8).toUpperCase() : 'KG-VIP' }}
        </div>
      </div>

      <!-- SALUTATION & GUEST HONOR BANNER -->
      <div class="mb-6 p-4 rounded-xl bg-[#FAF9F5] border border-[#C5A059]/30 text-center relative">
        <span class="text-xs text-slate-500 font-medium">Trân trọng chào đón Quý khách:</span>
        <div class="text-lg font-black text-[#0B192C] uppercase tracking-wide mt-0.5">
          {{ formStore?.customer?.name || 'QUÝ KHÁCH' }}
        </div>
        <div class="text-[11px] font-semibold text-[#9A7B38] mt-0.5">
          Tiệc: {{ formStore?.customer?.type || 'Đặt bàn thưởng thức ẩm thực' }}
        </div>
      </div>

      <!-- MAIN SPECIFICATION CARD (2 Columns with Royal Lines) -->
      <div class="grid grid-cols-2 gap-4 mb-6 text-xs bg-[#FAF9F5]/50 p-4 rounded-xl border border-slate-200">
        <div class="space-y-2.5">
          <div class="flex items-center justify-between border-b border-slate-200/80 pb-1.5">
            <span class="text-slate-500 uppercase font-bold text-[10px] tracking-wider">Số điện thoại:</span>
            <span class="font-mono font-black text-slate-800">{{ formStore?.customer?.phone || '---' }}</span>
          </div>
          <div class="flex items-center justify-between border-b border-slate-200/80 pb-1.5">
            <span class="text-slate-500 uppercase font-bold text-[10px] tracking-wider">Thời gian tiệc:</span>
            <span class="font-bold text-slate-800">
              {{ dayOfWeek ? dayOfWeek + ', ' : '' }}{{ formStore?.customer?.date || 'dd/mm/yyyy' }} • {{ formStore?.customer?.time || '--:--' }}
            </span>
          </div>
        </div>

        <div class="space-y-2.5">
          <div class="flex items-center justify-between border-b border-slate-200/80 pb-1.5">
            <span class="text-slate-500 uppercase font-bold text-[10px] tracking-wider">Số lượng khách:</span>
            <span class="font-black text-slate-800 text-[13px]">{{ formStore?.customer?.pax || '0' }} người</span>
          </div>
          <div class="flex items-center justify-between border-b border-slate-200/80 pb-1.5">
            <span class="text-slate-500 uppercase font-bold text-[10px] tracking-wider">Khu vực / Bàn:</span>
            <span class="font-black text-[#9A7B38] text-[13px]">Bàn: {{ formStore?.customer?.tables || 'Chưa xếp' }}</span>
          </div>
        </div>
      </div>

      <!-- SPECIAL REQUIREMENTS (If any) -->
      <div v-if="formStore?.customer?.note && formStore.customer.note.trim()" class="mb-6 p-4 rounded-xl bg-amber-50/60 border border-amber-200/80 text-left">
        <div class="text-[10px] font-black uppercase tracking-wider text-amber-900 mb-1 flex items-center gap-1.5">
          <i class="fa-solid fa-crown text-[#C5A059]"></i> Yêu cầu phục vụ đặc biệt:
        </div>
        <p class="text-xs font-semibold text-amber-950 leading-relaxed whitespace-pre-line">
          {{ formStore.customer.note }}
        </p>
      </div>

      <!-- MENU TABLE (Fine Dining Gold Accent) -->
      <div class="mb-6 overflow-hidden rounded-xl border border-[#C5A059]/40 shadow-2xs">
        <div class="bg-[#0B192C] text-[#FAF9F5] px-4 py-2.5 flex items-center justify-between">
          <span class="text-[11px] font-black uppercase tracking-[0.2em] text-[#C5A059]">✦ THỰC ĐƠN ĐÃ ĐẶT ✦</span>
          <span class="text-[10px] text-slate-300 font-medium">King's Grill Special Tasting</span>
        </div>

        <table class="w-full border-collapse text-left text-xs">
          <thead>
            <tr class="bg-[#FAF9F5] text-slate-700 font-bold border-b border-slate-200 text-[10px] uppercase tracking-wider">
              <th class="py-2.5 px-4 w-12 text-center text-[#9A7B38]">STT</th>
              <th class="py-2.5 px-4">Tên Món Ẩm Thực</th>
              <th class="py-2.5 px-4 w-20 text-center">Số Lượng</th>
              <th v-if="!hidePrice" class="py-2.5 px-4 w-32 text-right">Đơn Giá</th>
              <th v-if="!hidePrice" class="py-2.5 px-4 w-36 text-right text-[#9A7B38]">Thành Tiền</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <!-- Empty state -->
            <tr v-if="!formStore?.filteredBillItems?.length">
              <td :colspan="hidePrice ? 3 : 5" class="py-8 text-center text-slate-400 font-medium bg-slate-50/50">
                <i class="fa-regular fa-bell mb-1.5 text-lg block text-[#C5A059]"></i>
                Quý khách chưa đặt món trước • Thực đơn chọn món trực tiếp tại bàn
                <div v-if="!hidePrice" class="mt-2 text-[11px] text-[#9A7B38] font-bold bg-[#FAF9F5] px-3 py-1.5 rounded-lg inline-block border border-[#C5A059]/40">
                  Phí cọc giữ chỗ tiêu chuẩn: {{ formatVND(formStore?.deposit?.amount || 0) }}
                </div>
              </td>
            </tr>

            <!-- Item rows -->
            <tr 
              v-for="(item, i) in formStore?.filteredBillItems" 
              :key="i"
              :class="i % 2 === 1 ? 'bg-[#FAF9F5]/40' : 'bg-white'"
            >
              <td class="py-3 px-4 text-center font-bold text-slate-400">{{ i + 1 }}</td>
              <td class="py-3 px-4">
                <div class="font-black text-slate-900 uppercase tracking-wide text-[13px]">
                  {{ item.name || 'Món chưa đặt tên' }}
                </div>
                <div v-if="item.note" class="text-[11px] text-rose-700 font-semibold mt-0.5 border-l-2 border-[#C5A059] pl-2 italic">
                  {{ item.note }}
                </div>
              </td>
              <td class="py-3 px-4 text-center font-black text-slate-800">
                <span class="inline-block px-2.5 py-0.5 rounded bg-[#FAF9F5] border border-[#C5A059]/30 text-slate-800 font-bold">
                  {{ item.qty }}
                </span>
              </td>
              <td v-if="!hidePrice" class="py-3 px-4 text-right font-bold text-slate-600 font-mono">
                {{ formatVND(item.price) }}
              </td>
              <td v-if="!hidePrice" class="py-3 px-4 text-right font-black text-[#0B192C] font-mono text-[13px]">
                {{ formatVND(item.price * item.qty) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- TOTALS & STAMP ROW -->
      <div class="flex flex-col md:flex-row gap-6 items-start justify-between mb-6">
        
        <!-- Left: Royal Stamp & Deposit Guarantee -->
        <div class="w-full md:w-1/2 flex flex-col items-start gap-3">
          <div class="w-full p-4 rounded-xl bg-[#FAF9F5] border border-[#C5A059]/40 flex items-center gap-4 relative overflow-hidden">
            <div class="w-20 shrink-0 relative" :style="stampParallax ? { transform: `translate(${stampParallax.x}px, ${stampParallax.y}px)` } : {}">
              <img 
                :src="formStore?.deposit?.isPaid ? '/images/stamps/paid.png' : '/images/stamps/pending.png'" 
                class="w-full object-contain filter drop-shadow" 
                alt="Stamp"
              />
            </div>
            <div class="flex-1 min-w-0 text-left">
              <div class="text-[10px] font-black uppercase tracking-widest text-[#9A7B38]">
                XÁC NHẬN TIỀN CỌC:
              </div>
              <div class="text-sm font-black mt-0.5" :class="formStore?.deposit?.isPaid ? 'text-emerald-800' : 'text-amber-800'">
                {{ formStore?.deposit?.isPaid ? 'ĐÃ ĐẶT CỌC THÀNH CÔNG' : 'CHỜ THANH TOÁN TIỀN CỌC' }}
              </div>
              <div v-if="formStore?.deposit?.isPaid && formStore?.deposit?.time" class="text-[11px] font-bold text-slate-500 font-mono mt-0.5">
                Ngày nhận: {{ formatDepositTime(formStore.deposit.time) }}
              </div>
            </div>
          </div>

          <!-- Multiple deposit breakdown -->
          <div 
            v-if="!hidePrice && formStore?.deposit?.isPaid && formStore?.deposit?.history && formStore.deposit.history.length > 1" 
            class="w-full bg-white border border-[#C5A059]/30 rounded-xl p-3 space-y-1 text-xs text-left"
          >
            <div class="font-black text-[10px] uppercase text-[#9A7B38] pb-1 border-b border-slate-100 flex items-center gap-1.5">
              <i class="fa-solid fa-list-check"></i> Các đợt ghi nhận cọc:
            </div>
            <div v-for="(h, idx) in formStore.deposit.history" :key="idx" class="flex justify-between items-center font-mono text-[11px]">
              <span class="text-slate-600">{{ h.time }} <strong class="text-emerald-700">[{{ formatShortVND(h.delta) }}]</strong></span>
              <span class="font-bold text-slate-800">{{ formatVND(h.amount) }}</span>
            </div>
          </div>

          <div v-if="hidePrice" class="w-full p-3.5 rounded-xl bg-[#FAF9F5] border border-[#C5A059]/30 text-xs text-[#0B192C] font-semibold leading-relaxed text-center">
            ✦ Kính chúc Quý khách cùng toàn thể đoàn tiệc có những trải nghiệm ẩm thực thăng hoa và đẳng cấp nhất tại King's Grill! ✦
          </div>
        </div>

        <!-- Right: Totals Box -->
        <div v-if="!hidePrice" class="w-full md:w-1/2 p-5 rounded-xl bg-[#FAF9F5] border border-[#C5A059]/40 space-y-2 text-xs">
          <div class="flex justify-between items-center text-slate-500 font-bold uppercase text-[11px]">
            <span>Tạm tính bữa tiệc</span>
            <span class="font-mono font-black text-slate-800 text-sm">{{ formatVND(formStore?.calculatedTotals?.sub || 0) }}</span>
          </div>

          <template v-if="formStore?.taxEnabled">
            <div v-if="(formStore?.calculatedTotals?.vat8 || 0) > 0" class="flex justify-between items-center text-slate-500 font-medium">
              <span>Thuế VAT (8%)</span>
              <span class="font-mono font-bold text-slate-700">{{ formatVND(formStore.calculatedTotals.vat8) }}</span>
            </div>
            <div v-if="(formStore?.calculatedTotals?.vat10 || 0) > 0" class="flex justify-between items-center text-slate-500 font-medium">
              <span>Thuế VAT (10%)</span>
              <span class="font-mono font-bold text-slate-700">{{ formatVND(formStore.calculatedTotals.vat10) }}</span>
            </div>
          </template>

          <div class="pt-2.5 border-t border-[#C5A059]/40 flex justify-between items-center">
            <span class="text-xs font-black text-[#0B192C] uppercase tracking-wider">TỔNG GIÁ TRỊ TIỆC</span>
            <span class="text-xl font-black text-[#0B192C] font-mono">{{ formatVND(formStore?.calculatedTotals?.final || 0) }}</span>
          </div>

          <div class="flex justify-between items-center pt-1 text-xs font-bold text-[#9A7B38]">
            <span>{{ formStore?.deposit?.isPaid ? 'ĐÃ ĐẶT CỌC' : 'SỐ TIỀN CỌC CẦN CHUYỂN' }}</span>
            <span class="font-mono font-black text-sm">{{ formatVND(formStore?.deposit?.amount || 0) }}</span>
          </div>

          <div v-if="((formStore?.calculatedTotals?.final || 0) - (formStore?.deposit?.amount || 0)) > 0" class="pt-2 border-t border-dashed border-slate-300 flex justify-between items-center text-xs font-black text-rose-700">
            <span class="uppercase">CÒN LẠI KHI HOÀN TẤT TIỆC</span>
            <span class="font-mono text-base font-black">{{ formatVND((formStore?.calculatedTotals?.final || 0) - (formStore?.deposit?.amount || 0)) }}</span>
          </div>
        </div>
      </div>

      <!-- BANK VIETQR SECTION (Only if unpaid and not hidePrice) -->
      <div v-if="!hidePrice && appStore?.currentBank && !formStore?.deposit?.isPaid" class="mb-6 p-5 rounded-xl bg-white border-2 border-[#C5A059] shadow-sm">
        <div class="text-center pb-3 mb-3 border-b border-slate-100">
          <div class="text-xs font-black uppercase tracking-widest text-[#0B192C]">
            ✦ CỔNG THANH TOÁN ĐẶT CỌC HOÀNG GIA (VIETQR NAPAS) ✦
          </div>
          <p class="text-[11px] text-slate-500 mt-0.5">Quét mã bằng app ngân hàng để chuyển khoản tức thì</p>
        </div>

        <div class="flex flex-col sm:flex-row items-center justify-center gap-6">
          <div class="p-2 rounded-xl bg-[#FAF9F5] border border-[#C5A059]/40 shrink-0">
            <img :src="qrImageUrl" class="w-44 h-44 object-contain rounded" alt="QR VietQR" loading="eager" />
          </div>

          <div class="space-y-2.5 flex-1 max-w-sm text-left text-xs">
            <div class="flex justify-between items-center border-b border-slate-100 pb-1.5">
              <span class="text-slate-500 uppercase font-bold text-[10px]">Ngân hàng</span>
              <span class="font-black text-slate-900">{{ appStore.currentBank.name }}</span>
            </div>
            <div class="flex justify-between items-center border-b border-slate-100 pb-1.5">
              <span class="text-slate-500 uppercase font-bold text-[10px]">Số tài khoản</span>
              <span class="font-mono text-base font-black text-[#0B192C] tracking-wider">{{ appStore.currentBank.number }}</span>
            </div>
            <div class="flex justify-between items-center border-b border-slate-100 pb-1.5">
              <span class="text-slate-500 uppercase font-bold text-[10px]">Chủ tài khoản</span>
              <span class="font-black text-[#9A7B38] uppercase">{{ appStore.currentBank.owner }}</span>
            </div>
            <div class="flex justify-between items-center pt-0.5">
              <span class="text-slate-500 uppercase font-bold text-[10px]">Cú pháp</span>
              <span class="font-mono font-black text-blue-700">{{ depositTransferContent }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- FOOTER & SIGN-OFF -->
      <div class="pt-6 border-t border-[#C5A059]/40 flex items-center justify-between text-xs text-slate-600">
        <div class="text-left">
          <div class="font-bold">
            Đại diện nhà hàng phục vụ: <span class="font-black text-[#0B192C]">{{ formStore?.staff?.name || 'Bộ phận Quản lý Khách hàng' }}</span>
            <span v-if="formStore?.staff?.phone" class="font-mono font-bold text-[#9A7B38] ml-1">({{ formStore.staff.phone }})</span>
          </div>
          <div class="text-[11px] text-slate-400 italic mt-0.5">
            Sự hài lòng của Quý khách là vinh dự và thước đo chất lượng của King's Grill.
          </div>
        </div>

        <div class="flex items-center gap-3 shrink-0 pl-4 border-l border-[#C5A059]/30">
          <div class="text-right">
            <div class="text-[9px] font-black uppercase tracking-widest text-[#9A7B38]">MÃ BẢO CHỨNG</div>
            <div class="text-[10px] font-mono font-bold text-slate-600">KG-VIP-VERIFIED</div>
          </div>
          <img 
            :src="`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(qrLink || 'https://kg-booking.pages.dev')}`" 
            class="w-10 h-10 object-contain rounded border border-[#C5A059]/40" 
            alt="QR Link" 
          />
        </div>
      </div>

    </div>
  </div>
</template>
