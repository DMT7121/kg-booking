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
  <div class="w-full p-10 md:p-12 bg-white relative mx-auto text-slate-800 font-sans select-text">
    <!-- TOP BAR / SPLIT HEADER -->
    <div class="flex items-start justify-between gap-6 pb-6 border-b border-slate-200">
      <!-- Left: Brand Identity -->
      <div class="flex items-center gap-4">
        <img 
          :src="configStore?.branding?.logo || '/images/brand-logo.svg'" 
          class="h-16 w-16 object-contain shrink-0" 
          alt="King's Grill Logo"
          loading="eager"
        >
        <div>
          <h1 class="text-2xl font-black tracking-wider text-blue-950 uppercase" style="font-family: 'Be Vietnam Pro', sans-serif;">
            KING'S GRILL
          </h1>
          <p class="text-[11px] font-semibold text-slate-500 mt-0.5 leading-snug">
            34 Hoàng Văn Thụ, P. Thủ Dầu Một, TP. Hồ Chí Minh
          </p>
          <div class="text-[10px] font-bold text-amber-700 mt-1 flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            <span v-if="formStore?.staff?.phone">Hotline: {{ formStore.staff.phone }} • Mở cửa: 10:00 - 23:00</span>
            <span v-else>Mở cửa: 10:00 - 23:00</span>
          </div>
        </div>
      </div>

      <!-- Right: Bill Meta & Status -->
      <div class="text-right flex flex-col items-end shrink-0">
        <div class="text-[11px] font-black tracking-widest text-slate-400 uppercase">
          PHIẾU ĐẶT BÀN
        </div>
        <div class="font-mono text-xs font-black text-blue-900 mt-0.5">
          #{{ formStore?.id ? formStore.id.slice(-8).toUpperCase() : 'KG-BOOKING' }}
        </div>
        
        <!-- Status Badge -->
        <div class="mt-2 flex items-center gap-1.5">
          <span 
            :class="[
              'px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider shadow-2xs border inline-flex items-center gap-1',
              formStore?.deposit?.isPaid 
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300' 
                : 'bg-amber-50 text-amber-800 border-amber-300'
            ]"
          >
            <i class="fa-solid" :class="formStore?.deposit?.isPaid ? 'fa-circle-check text-emerald-600' : 'fa-hourglass-half text-amber-600'"></i>
            <span>{{ formStore?.deposit?.isPaid ? 'ĐÃ ĐẶT CỌC' : 'CHỜ ĐẶT CỌC' }}</span>
          </span>
        </div>
      </div>
    </div>

    <!-- METRIC CARDS (4-Column Info Grid) -->
    <div class="grid grid-cols-4 gap-3 my-6">
      <!-- Card 1: Khách hàng -->
      <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-150">
        <div class="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-1">
          <i class="fa-solid fa-user-tie text-blue-600 text-xs"></i> Khách hàng
        </div>
        <div class="text-sm font-black text-slate-900 truncate" :title="formStore?.customer?.name">
          {{ formStore?.customer?.name || '---' }}
        </div>
        <div class="text-[11px] font-bold text-slate-500 font-mono mt-0.5">
          {{ formStore?.customer?.phone || '---' }}
        </div>
      </div>

      <!-- Card 2: Thời gian -->
      <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-150">
        <div class="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-1">
          <i class="fa-regular fa-clock text-blue-600 text-xs"></i> Thời gian
        </div>
        <div class="text-sm font-black text-slate-900 truncate">
          {{ formStore?.customer?.time || '--:--' }}
        </div>
        <div class="text-[11px] font-bold text-slate-500 truncate mt-0.5">
          {{ dayOfWeek ? dayOfWeek + ', ' : '' }}{{ formStore?.customer?.date || 'dd/mm/yyyy' }}
        </div>
      </div>

      <!-- Card 3: Số khách & Bàn -->
      <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-150">
        <div class="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-1">
          <i class="fa-solid fa-users text-blue-600 text-xs"></i> Quy mô tiệc
        </div>
        <div class="text-sm font-black text-slate-900">
          {{ formStore?.customer?.pax || '0' }} khách
        </div>
        <div class="text-[11px] font-bold text-blue-700 truncate mt-0.5">
          Bàn: {{ formStore?.customer?.tables || 'Chưa xếp' }}
        </div>
      </div>

      <!-- Card 4: Nhu cầu tiệc -->
      <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-150">
        <div class="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-1">
          <i class="fa-solid fa-champagne-glasses text-blue-600 text-xs"></i> Phân loại
        </div>
        <div class="text-sm font-black text-slate-900 truncate">
          {{ formStore?.customer?.type || 'Ăn thường' }}
        </div>
        <div class="text-[10px] font-bold text-slate-400 mt-0.5 uppercase tracking-wide">
          King's Grill Dining
        </div>
      </div>
    </div>

    <!-- SPECIAL NOTE / NOTICE (If exists) -->
    <div v-if="formStore?.customer?.note && formStore.customer.note.trim()" class="mb-6 p-4 rounded-2xl bg-amber-50/70 border border-amber-200/90 text-left flex items-start gap-3">
      <div class="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
        <i class="fa-solid fa-bell text-xs"></i>
      </div>
      <div class="min-w-0 flex-1">
        <div class="text-[11px] font-black uppercase tracking-wider text-amber-900 mb-0.5">
          Ghi Chú Phục Vụ & Chuẩn Bị Tiệc:
        </div>
        <div class="text-xs font-bold text-amber-950 leading-relaxed whitespace-pre-line">
          {{ formStore.customer.note }}
        </div>
      </div>
    </div>

    <!-- MENU ITEMS TABLE -->
    <div class="mb-6 overflow-hidden rounded-2xl border border-slate-200 shadow-2xs">
      <table class="w-full border-collapse text-left">
        <thead>
          <tr class="bg-slate-900 text-white text-[11px] font-black uppercase tracking-wider">
            <th class="py-3 px-4 w-12 text-center">#</th>
            <th class="py-3 px-4">Tên Món Ăn / Đồ Uống</th>
            <th class="py-3 px-4 w-20 text-center">SL</th>
            <th v-if="!hidePrice" class="py-3 px-4 w-32 text-right">Đơn Giá</th>
            <th v-if="!hidePrice" class="py-3 px-4 w-36 text-right">Thành Tiền</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 text-xs">
          <!-- Empty State -->
          <tr v-if="!formStore?.filteredBillItems?.length">
            <td :colspan="hidePrice ? 3 : 5" class="py-8 text-center text-slate-400 font-semibold bg-slate-50/60">
              <i class="fa-regular fa-bell mb-1.5 text-lg block text-slate-300"></i>
              Khách chưa đặt món trước (Khách chọn món trực tiếp tại nhà hàng)
              <div v-if="!hidePrice" class="mt-2 text-[11px] text-amber-800 font-bold bg-amber-50 px-3 py-1.5 rounded-xl inline-block border border-amber-200">
                Tiền cọc giữ bàn tiêu chuẩn: {{ formatVND(formStore?.deposit?.amount || 0) }}
              </div>
            </td>
          </tr>

          <!-- Items Rows -->
          <tr 
            v-for="(item, i) in formStore?.filteredBillItems" 
            :key="i"
            :class="i % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'"
          >
            <td class="py-3.5 px-4 text-center font-bold text-slate-400">{{ i + 1 }}</td>
            <td class="py-3.5 px-4">
              <div class="font-extrabold text-[13px] text-slate-800 uppercase tracking-wide">
                {{ item.name || 'Món chưa đặt tên' }}
              </div>
              <div v-if="item.note" class="text-[11px] text-rose-600 font-bold mt-1 border-l-2 border-rose-300 pl-2 italic">
                {{ item.note }}
              </div>
            </td>
            <td class="py-3.5 px-4 text-center">
              <span class="inline-block px-2.5 py-0.5 rounded-lg bg-slate-100 font-black text-slate-800 text-xs">
                x{{ item.qty }}
              </span>
            </td>
            <td v-if="!hidePrice" class="py-3.5 px-4 text-right font-bold text-slate-600 font-mono">
              {{ formatVND(item.price) }}
            </td>
            <td v-if="!hidePrice" class="py-3.5 px-4 text-right font-black text-blue-900 font-mono text-[13px]">
              {{ formatVND(item.price * item.qty) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- TOTALS & SETTLEMENT SECTION -->
    <div class="flex flex-col md:flex-row gap-6 items-start justify-between mb-8">
      
      <!-- Left Column: Deposit Stamp & Installments or Invitation Message -->
      <div class="w-full md:w-1/2 flex flex-col items-start gap-4">
        
        <!-- Stamp Indicator -->
        <div class="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200 w-full relative overflow-hidden">
          <div class="w-20 shrink-0 relative" :style="stampParallax ? { transform: `translate(${stampParallax.x}px, ${stampParallax.y}px)` } : {}">
            <img 
              :src="formStore?.deposit?.isPaid ? '/images/stamps/paid.png' : '/images/stamps/pending.png'" 
              class="w-full object-contain filter drop-shadow-sm" 
              alt="Deposit Stamp"
            />
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-[10px] font-black uppercase tracking-wider" :class="formStore?.deposit?.isPaid ? 'text-emerald-700' : 'text-amber-700'">
              Trạng thái đặt cọc:
            </div>
            <div class="text-sm font-black mt-0.5" :class="formStore?.deposit?.isPaid ? 'text-emerald-800' : 'text-amber-800'">
              {{ formStore?.deposit?.isPaid ? 'ĐÃ XÁC NHẬN CỌC' : 'YÊU CẦU ĐẶT CỌC' }}
            </div>
            <div v-if="formStore?.deposit?.isPaid && formStore?.deposit?.time" class="text-[11px] font-bold text-slate-500 font-mono mt-0.5">
              Thời gian: {{ formatDepositTime(formStore.deposit.time) }}
            </div>
            <div v-if="!formStore?.deposit?.isPaid" class="text-[11px] font-semibold text-slate-500 mt-0.5">
              Vui lòng chuyển khoản đúng số tiền để giữ bàn.
            </div>
          </div>
        </div>

        <!-- Deposit History Breakdown (If multiple installments) -->
        <div 
          v-if="!hidePrice && formStore?.deposit?.isPaid && formStore?.deposit?.history && formStore.deposit.history.length > 1" 
          class="w-full bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-3.5 space-y-1.5 text-xs text-left"
        >
          <div class="font-black text-[10px] uppercase tracking-wider text-emerald-800 flex items-center gap-1.5 pb-1 border-b border-emerald-200">
            <i class="fa-solid fa-clock-rotate-left text-emerald-600"></i> Lịch sử các đợt cọc:
          </div>
          <div v-for="(h, idx) in formStore.deposit.history" :key="idx" class="flex justify-between items-center font-mono text-[11px]">
            <span class="text-slate-600">
              {{ h.time }} <span class="font-black text-emerald-700">[{{ formatShortVND(h.delta) }}]</span>
            </span>
            <span class="font-bold text-slate-800">{{ formatVND(h.amount) }}</span>
          </div>
        </div>

        <!-- Invitation Mode Message -->
        <div v-if="hidePrice" class="w-full p-4 rounded-2xl bg-blue-50/60 border border-blue-200 text-blue-900 text-xs leading-relaxed font-semibold">
          <i class="fa-solid fa-gift text-blue-600 mr-1.5"></i>
          Thực đơn tiệc được lựa chọn trân trọng gửi tới Quý khách và đoàn tiệc. Chúc Quý khách có một bữa tiệc tuyệt vời và trọn vẹn tại King's Grill!
        </div>
      </div>

      <!-- Right Column: Financial Totals (Only if not hidePrice) -->
      <div v-if="!hidePrice" class="w-full md:w-1/2 bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-2.5">
        <div class="flex justify-between items-center text-xs text-slate-500 font-bold uppercase">
          <span>Tạm tính thực đơn</span>
          <span class="font-mono font-black text-slate-800 text-sm">{{ formatVND(formStore?.calculatedTotals?.sub || 0) }}</span>
        </div>

        <template v-if="formStore?.taxEnabled">
          <div v-if="(formStore?.calculatedTotals?.vat8 || 0) > 0" class="flex justify-between items-center text-xs text-slate-500">
            <span>Thuế VAT (8%)</span>
            <span class="font-mono font-bold text-slate-700">{{ formatVND(formStore.calculatedTotals.vat8) }}</span>
          </div>
          <div v-if="(formStore?.calculatedTotals?.vat10 || 0) > 0" class="flex justify-between items-center text-xs text-slate-500">
            <span>Thuế VAT (10%)</span>
            <span class="font-mono font-bold text-slate-700">{{ formatVND(formStore.calculatedTotals.vat10) }}</span>
          </div>
        </template>

        <div class="pt-3 border-t-2 border-dashed border-slate-200 flex justify-between items-center">
          <span class="text-sm font-black text-blue-950 uppercase tracking-wider">TỔNG CỘNG</span>
          <span class="text-2xl font-black text-blue-950 font-mono">{{ formatVND(formStore?.calculatedTotals?.final || 0) }}</span>
        </div>

        <div class="flex justify-between items-center pt-1 text-xs font-bold" :class="formStore?.deposit?.isPaid ? 'text-emerald-700' : 'text-amber-700'">
          <span>{{ formStore?.deposit?.isPaid ? 'ĐÃ ĐẶT CỌC' : 'TIỀN CỌC YÊU CẦU' }}</span>
          <span class="font-mono font-black text-base">{{ formatVND(formStore?.deposit?.amount || 0) }}</span>
        </div>

        <div v-if="((formStore?.calculatedTotals?.final || 0) - (formStore?.deposit?.amount || 0)) > 0" class="pt-2 border-t border-slate-200 flex justify-between items-center text-xs font-black text-rose-600">
          <span class="uppercase">CÒN LẠI KHI THANH TOÁN</span>
          <span class="font-mono text-lg font-black text-rose-600">{{ formatVND((formStore?.calculatedTotals?.final || 0) - (formStore?.deposit?.amount || 0)) }}</span>
        </div>
      </div>
    </div>

    <!-- BANK TRANSFER / VIETQR SECTION (Shown only if not paid and not hidePrice) -->
    <div v-if="!hidePrice && appStore?.currentBank && !formStore?.deposit?.isPaid" class="mb-8 rounded-3xl bg-slate-900 text-white p-6 shadow-md">
      <div class="text-center pb-4 mb-4 border-b border-slate-800">
        <h3 class="text-xs font-black uppercase tracking-widest text-amber-400">
          THÔNG TIN CHUYỂN KHOẢN ĐẶT CỌC (VIETQR NAPAS 247)
        </h3>
        <p class="text-[11px] text-slate-400 mt-0.5">Quét mã QR bằng ứng dụng ngân hàng bất kỳ để tự động điền số tiền và nội dung</p>
      </div>

      <div class="flex flex-col sm:flex-row items-center justify-center gap-6">
        <!-- QR Container -->
        <div class="bg-white p-3 rounded-2xl shrink-0 shadow-lg">
          <img :src="qrImageUrl" class="w-48 h-48 object-contain rounded-xl" alt="Mã VietQR" loading="eager" />
        </div>

        <!-- Bank Details -->
        <div class="space-y-3 flex-1 max-w-sm text-left text-xs">
          <div class="flex justify-between items-center border-b border-slate-800 pb-2">
            <span class="text-slate-400 uppercase font-bold text-[10px]">Ngân hàng</span>
            <span class="font-black text-white text-right">{{ appStore.currentBank.name }}</span>
          </div>
          <div class="flex justify-between items-center border-b border-slate-800 pb-2">
            <span class="text-slate-400 uppercase font-bold text-[10px]">Số tài khoản</span>
            <span class="font-mono text-base font-black text-amber-400 tracking-wider text-right">{{ appStore.currentBank.number }}</span>
          </div>
          <div class="flex justify-between items-center border-b border-slate-800 pb-2">
            <span class="text-slate-400 uppercase font-bold text-[10px]">Chủ tài khoản</span>
            <span class="font-black text-white text-right uppercase">{{ appStore.currentBank.owner }}</span>
          </div>
          <div class="flex justify-between items-center pt-0.5">
            <span class="text-slate-400 uppercase font-bold text-[10px]">Nội dung chuyển</span>
            <span class="font-mono font-black text-cyan-300 text-right">{{ depositTransferContent }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- POLICY & NOTES -->
    <div class="p-5 rounded-2xl bg-blue-50/40 border border-blue-100 text-left text-xs text-slate-700 leading-relaxed mb-8">
      <div class="font-black text-[11px] text-blue-950 uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <i class="fa-solid fa-circle-info text-blue-600"></i> Lưu ý phục vụ tại nhà hàng:
      </div>
      <ul class="space-y-1.5 text-[11px] text-slate-600 list-disc pl-4 font-medium">
        <li>Mức cọc tối thiểu là <strong class="text-slate-900">500.000đ/bàn</strong> hoặc <strong class="text-slate-900">1/3 tổng tiền thức ăn đặt trước</strong>. Tiền cọc được trừ trực tiếp vào hóa đơn khi thanh toán.</li>
        <li>Với món ăn đặt trước, nhà hàng ưu tiên sơ chế và chuẩn bị sẵn nguyên liệu; thời gian lên món khi quý khách ngồi bàn dự kiến từ 10 - 20 phút.</li>
        <li>Giá trên thực đơn chưa bao gồm VAT. Thuế suất: 8% đối với món ăn/đồ uống pha chế; 10% đối với rượu, bia và đồ uống đóng lon.</li>
      </ul>
    </div>

    <!-- FOOTER -->
    <div class="pt-6 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
      <div class="text-left">
        <div class="font-bold text-slate-700">
          Nhân viên tư vấn: <span class="font-black text-blue-900">{{ formStore?.staff?.name || 'Lễ tân nhà hàng' }}</span>
          <span v-if="formStore?.staff?.phone" class="font-mono font-bold text-blue-600 ml-1">({{ formStore.staff.phone }})</span>
        </div>
        <div class="text-[11px] text-slate-400 mt-0.5">
          Cảm ơn Quý khách đã tin tưởng và đồng hành cùng King's Grill!
        </div>
      </div>

      <!-- Online verification QR badge -->
      <div class="flex items-center gap-2.5 shrink-0 pl-4 border-l border-slate-200">
        <div class="text-right">
          <div class="text-[9px] font-black uppercase tracking-widest text-slate-400">Xác thực phiếu</div>
          <div class="text-[10px] font-bold text-blue-900">Quét kiểm tra online</div>
        </div>
        <img 
          :src="`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(qrLink || 'https://kg-booking.pages.dev')}`" 
          class="w-10 h-10 object-contain rounded border border-slate-200" 
          alt="QR Link" 
        />
      </div>
    </div>
  </div>
</template>
