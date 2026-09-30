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
</script>

<template>
  <div class="w-full p-10 md:p-14 bg-white relative mx-auto select-text text-slate-800 font-sans">
    <!-- HEADER -->
    <div class="text-center mb-6 mt-0">
      <img 
        :src="configStore?.branding?.logo || '/images/brand-logo.svg'" 
        class="h-20 w-auto mx-auto mb-3 opacity-90 object-contain" 
        alt="Logo"
        loading="eager"
      >
      <h1 class="font-black tracking-widest text-slate-800 uppercase text-3xl mb-1" style="font-family: 'Be Vietnam Pro', sans-serif;">
        KING'S GRILL
      </h1>
      <p class="text-slate-500 text-xs font-semibold mb-2" style="font-family: 'Inter', sans-serif;">
        ĐC: Số 34, Đường Hoàng Văn Thụ, Phường Thủ Dầu Một, Thành phố Hồ Chí Minh
      </p>
      <h2 class="font-bold tracking-widest text-slate-500 uppercase text-xl" style="font-family: 'Inter', sans-serif;">
        PHIẾU ĐẶT BÀN
      </h2>
      <div class="w-24 h-1 mx-auto mt-4 rounded-full bg-yellow-400"></div>
    </div>

    <!-- INFO & STAMP SECTION -->
    <div class="relative mb-10">
      <!-- Customer Info Grid -->
      <div class="grid gap-y-3.5 text-[16px] w-full lg:w-[70%]" style="grid-template-columns: 140px 1fr;">
        <div class="flex items-center gap-3 text-slate-500 font-bold uppercase text-[12px] tracking-wider">
          <i class="fa-solid fa-user-tie w-4 text-center text-[13px]"></i> Khách hàng
        </div>
        <div class="font-black text-blue-950 text-[16px]">{{ formStore.customer.name || '---' }}</div>
        
        <div class="flex items-center gap-3 text-slate-500 font-bold uppercase text-[12px] tracking-wider">
          <i class="fa-solid fa-phone w-4 text-center text-[13px]"></i> SĐT / Zalo
        </div>
        <div class="font-black text-blue-950 text-[16px]">{{ formStore.customer.phone || '---' }}</div>
        
        <div class="flex items-center gap-3 text-slate-500 font-bold uppercase text-[12px] tracking-wider">
          <i class="fa-regular fa-calendar-days w-4 text-center text-[13px]"></i> Thời gian
        </div>
        <div class="font-black text-blue-950 text-[16px]">
          {{ dayOfWeek ? dayOfWeek + ', ' : '' }}{{ formStore.customer.date || 'dd/mm/yyyy' }} • {{ formStore.customer.time || '--:--' }}
        </div>
        
        <div class="flex items-center gap-3 text-slate-500 font-bold uppercase text-[12px] tracking-wider">
          <i class="fa-solid fa-users w-4 text-center text-[13px]"></i> Số khách
        </div>
        <div class="font-black text-blue-950 text-[16px]">{{ formStore.customer.pax || '0' }} người</div>
        
        <div class="flex items-center gap-3 text-slate-500 font-bold uppercase text-[12px] tracking-wider">
          <i class="fa-solid fa-border-all w-4 text-center text-[13px]"></i> Bàn
        </div>
        <div class="font-black text-blue-950 text-[16px]">{{ formStore.customer.tables || '---' }}</div>
        
        <div class="flex items-center gap-3 text-slate-500 font-bold uppercase text-[12px] tracking-wider">
          <i class="fa-solid fa-utensils w-4 text-center text-[13px]"></i> Loại tiệc
        </div>
        <div class="font-black text-blue-950 text-[16px]">{{ formStore.customer.type || '---' }}</div>
      </div>

      <!-- Stamp -->
      <div 
        class="absolute -top-12 right-0 z-20 pointer-events-none" 
        :style="{ transform: `rotate(-4deg) translate(${stampParallax?.x || 0}px, ${stampParallax?.y || 0}px)` }"
      >
        <div class="relative w-[220px] flex flex-col items-center justify-center">
          <img 
            :src="formStore.deposit.isPaid ? '/images/stamps/paid.png' : '/images/stamps/pending.png'" 
            class="w-full object-contain filter drop-shadow-sm" 
            style="image-rendering: -webkit-optimize-contrast; image-rendering: crisp-edges;" 
            alt="Stamp" 
          />
          <div 
            v-if="formStore.deposit.isPaid" 
            class="mt-2 px-3 py-1 bg-white/95 border border-red-200/90 rounded-full shadow-xs text-center text-[#961825] font-black tracking-widest whitespace-nowrap font-tabular" 
            style="font-family: 'Cal Sans', sans-serif; font-size: 13px;"
          >
            {{ formatDepositTime(formStore.deposit.time) }}
          </div>
        </div>
      </div>
    </div>

    <!-- GHI CHÚ TIỆC / LƯU Ý PHỤC VỤ -->
    <div v-if="formStore.customer.note && formStore.customer.note.trim()" class="mb-8 p-4 bg-amber-50/60 border border-amber-200/80 rounded-2xl text-left">
      <div class="flex items-center gap-2 text-amber-950 font-black uppercase text-[11px] tracking-wider mb-2">
        <i class="fa-solid fa-triangle-exclamation text-amber-600 text-sm animate-pulse"></i>
        LƯU Ý PHỤC VỤ / GHI CHÚ TIỆC
      </div>
      <p class="text-amber-900 text-[14px] font-bold leading-relaxed whitespace-pre-line">{{ formStore.customer.note }}</p>
    </div>

    <!-- MENU TABLE -->
    <div class="overflow-x-auto w-full mb-8">
      <table class="w-full border-collapse">
        <thead>
          <tr class="bg-blue-950 text-white">
            <th class="py-3 px-4 text-left font-bold text-[13px] rounded-tl-xl w-12">#</th>
            <th class="py-3 px-4 text-left font-bold text-[13px]">TÊN MÓN</th>
            <th class="py-3 px-4 text-center font-bold text-[13px] w-16">SL</th>
            <th v-if="!hidePrice" class="py-3 px-4 text-right font-bold text-[13px] w-28">ĐƠN GIÁ</th>
            <th v-if="!hidePrice" class="py-3 px-4 text-right font-bold text-[13px] rounded-tr-xl w-32">THÀNH TIỀN</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!formStore.filteredBillItems.length">
            <td :colspan="hidePrice ? 3 : 5" class="py-8 text-center text-slate-400 font-semibold bg-slate-50 border-b border-slate-200">
              <i class="fa-regular fa-bell mb-2 text-xl block text-slate-300"></i>
              Chưa có món đặt trước (Món ăn gọi trực tiếp tại nhà hàng)
              <div v-if="!hidePrice" class="mt-3 text-[11px] text-amber-700 font-black bg-amber-50 px-4 py-2 rounded-xl border border-amber-100 inline-block leading-relaxed max-w-[95%]">
                <i class="fa-solid fa-circle-info mr-1 text-amber-500"></i>
                Cọc giữ bàn mặc định: {{ formatVND(formStore.deposit.amount) }} <br>
                <span class="text-[9px] font-bold text-slate-400">
                  (Áp dụng cho bàn chưa đặt món trước {{ (parseInt(formStore.customer.pax) || 0) >= 20 ? 'từ 20 khách trở lên' : 'dưới 20 khách' }})
                </span>
              </div>
            </td>
          </tr>
          <tr v-for="(item, i) in formStore.filteredBillItems" :key="i" class="border-b border-slate-100">
            <td class="py-4 px-4 font-bold text-slate-400">{{ i + 1 }}</td>
            <td class="py-4 px-4 text-left">
              <div class="font-black text-slate-800 text-[15px] uppercase tracking-wide whitespace-normal break-words overflow-wrap-anywhere">{{ item.name || 'Chưa đặt tên' }}</div>
              <div v-if="item.note" class="text-[12px] text-rose-600 font-bold mt-1.5 whitespace-pre-line leading-relaxed text-left border-l-2 border-rose-200 pl-2">
                {{ item.note }}
              </div>
            </td>
            <td class="py-4 px-4 text-center font-black text-slate-800">{{ item.qty }}</td>
            <td v-if="!hidePrice" class="py-4 px-4 text-right font-bold text-slate-600 font-mono">{{ formatVND(item.price) }}</td>
            <td v-if="!hidePrice" class="py-4 px-4 text-right font-black text-blue-900 font-mono">{{ formatVND(item.price * item.qty) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- TOTALS -->
    <div v-if="!hidePrice" class="space-y-4 mb-10 w-full md:w-1/2 ml-auto">
      <div class="flex justify-between items-center text-lg">
        <span class="font-bold text-slate-500 uppercase">TẠM TÍNH</span>
        <span class="font-black text-slate-800 font-mono">{{ formatVND(formStore.calculatedTotals.sub) }}</span>
      </div>
      
      <template v-if="formStore.taxEnabled">
         <div v-if="formStore.calculatedTotals.vat8 > 0" class="flex justify-between items-center text-md text-slate-500">
           <span class="font-bold uppercase">VAT (8%)</span>
           <span class="font-bold font-mono">{{ formatVND(formStore.calculatedTotals.vat8) }}</span>
         </div>
         <div v-if="formStore.calculatedTotals.vat10 > 0" class="flex justify-between items-center text-md text-slate-500">
           <span class="font-bold uppercase">VAT (10%)</span>
           <span class="font-bold font-mono">{{ formatVND(formStore.calculatedTotals.vat10) }}</span>
         </div>
      </template>

      <div class="flex justify-between items-center pt-4 border-t-2 border-dashed border-slate-200">
        <span class="text-2xl font-black text-blue-900 uppercase">TỔNG CỘNG</span>
        <span class="text-3xl font-black text-blue-900 font-mono">{{ formatVND(formStore.calculatedTotals.final) }}</span>
      </div>
      <div class="flex justify-between items-center pt-2">
        <span class="text-lg font-bold flex items-center gap-2" :class="formStore.deposit.isPaid ? 'text-green-600' : 'text-red-500'">
          <i class="fa-solid" :class="formStore.deposit.isPaid ? 'fa-check' : 'fa-hourglass-half'"></i> 
          {{ formStore.deposit.isPaid ? 'ĐÃ ĐẶT CỌC' : 'YÊU CẦU ĐẶT CỌC' }}
        </span>
        <span class="text-2xl font-black font-tabular font-mono" :class="formStore.deposit.isPaid ? 'text-green-600' : 'text-red-500'">
          {{ formatVND(formStore.deposit.amount) }}
        </span>
      </div>

      <!-- DEPOSIT INSTALLMENT BREAKDOWN -->
      <div v-if="formStore.deposit.isPaid && formStore.deposit.history && formStore.deposit.history.length > 1" class="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-3 space-y-1.5 text-xs text-left shadow-xs">
        <div class="font-black text-[10px] uppercase tracking-wider text-emerald-800 flex items-center gap-1.5 pb-1 border-b border-emerald-200/60">
          <i class="fa-solid fa-clock-rotate-left text-[11px] text-emerald-600"></i> Chi tiết các đợt cọc:
        </div>
        <div v-for="(h, idx) in formStore.deposit.history" :key="idx" class="flex justify-between items-center font-tabular text-[11px]">
          <span class="text-slate-600">
            {{ h.time }} <span class="font-black text-emerald-700">[{{ formatShortVND(h.delta) }}]</span> <span class="font-bold text-slate-400">(Lần {{ idx + 1 }})</span>
          </span>
          <span class="font-bold text-slate-700 font-mono">{{ formatVND(h.amount) }}</span>
        </div>
        <div class="pt-1.5 border-t border-emerald-200/60 flex justify-between items-center font-black text-[12px] text-emerald-800">
          <span>Tổng cọc: [{{ formatShortVND(formStore.deposit.amount) }}]</span>
          <span class="font-tabular font-mono">{{ formatVND(formStore.deposit.amount) }}</span>
        </div>
      </div>
      <div v-if="formStore.calculatedTotals.final - formStore.deposit.amount > 0" class="flex justify-between items-center pt-4 border-t-2 border-slate-200">
        <span class="text-xl font-black text-slate-800 uppercase">CÒN LẠI</span>
        <span class="text-2xl font-black text-rose-600 font-mono">{{ formatVND(formStore.calculatedTotals.final - formStore.deposit.amount) }}</span>
      </div>
    </div>

    <!-- INVITATION NOTICE (When hidePrice is true) -->
    <div v-else class="mb-10 p-5 rounded-2xl bg-blue-50/60 border border-blue-200 text-blue-900 text-xs leading-relaxed font-semibold text-center">
      ✦ Phiếu xác nhận thực đơn bàn tiệc — Trân trọng kính mời Quý khách! ✦
    </div>

    <!-- QR BANK TRANSFER (Shown only if not paid and not hidePrice) -->
    <div v-if="!hidePrice && appStore.currentBank && !formStore.deposit.isPaid" class="bg-slate-50 border-2 border-slate-100 rounded-3xl p-6 mb-8 w-full">
      <h3 class="font-black text-sm text-slate-800 uppercase tracking-widest mb-6 text-center">THÔNG TIN CHUYỂN KHOẢN</h3>
      
      <div class="flex gap-4 md:gap-8 items-center justify-center flex-wrap md:flex-nowrap">
        <!-- QR Code -->
        <div class="flex-shrink-0">
          <img :src="qrImageUrl" class="w-60 h-60 object-contain rounded-2xl shadow-md border border-slate-200" alt="QR Code" loading="lazy">
        </div>
        
        <!-- Bank Details -->
        <div class="space-y-4 flex-grow w-full max-w-sm">
          <div class="flex justify-between items-center border-b border-slate-200 pb-2">
            <span class="text-sm font-bold text-slate-500 uppercase">Ngân hàng</span>
            <span class="font-black text-slate-800 text-right">{{ appStore.currentBank.name }}</span>
          </div>
          <div class="flex justify-between items-center border-b border-slate-200 pb-2">
            <span class="text-sm font-bold text-slate-500 uppercase">Số tài khoản</span>
            <span class="font-black text-blue-600 text-lg tracking-wider text-right font-mono">{{ appStore.currentBank.number }}</span>
          </div>
          <div class="flex justify-between items-center border-b border-slate-200 pb-2">
            <span class="text-sm font-bold text-slate-500 uppercase">Chủ tài khoản</span>
            <span class="font-black text-slate-800 text-right uppercase">{{ appStore.currentBank.owner }}</span>
          </div>
          <div class="flex justify-between items-center pt-1">
            <span class="text-sm font-bold text-slate-500 uppercase">Nội dung CK</span>
            <span class="font-black text-blue-600 text-right font-mono">{{ depositTransferContent }}</span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- UNIFIED POLICY & NOTES CONTAINER -->
    <div v-if="!formStore.deposit.isPaid || formStore.filteredBillItems.length > 0" class="bg-blue-50/30 border border-blue-100 rounded-3xl p-6 mb-8 text-left space-y-5 relative overflow-hidden">
      <div class="absolute top-0 left-0 w-1.5 h-full bg-blue-500"></div>
      
      <div class="flex items-center gap-2 text-blue-950 font-black uppercase text-[11px] tracking-wider border-b border-blue-100/50 pb-2.5">
        <i class="fa-solid fa-circle-exclamation text-blue-600 text-sm"></i>
        Lưu ý quan trọng dành cho khách hàng
      </div>

      <!-- Subsection 1: Deposit Policy (shown only if not paid) -->
      <div v-if="!formStore.deposit.isPaid" class="space-y-2">
        <div class="text-[10px] font-black text-blue-900 uppercase tracking-widest flex items-center gap-1.5">
          <i class="fa-solid fa-vault text-[10px]"></i> 1. Quy định về đặt cọc
        </div>
        <div class="text-blue-950 text-[13px] font-bold leading-relaxed space-y-1.5 pl-4">
          <p>• Mức cọc tối thiểu là <span class="text-blue-900 font-black underline decoration-blue-500 decoration-2 underline-offset-4">500.000đ/bàn</span>. Với phiếu đặt có thức ăn, mức cọc bằng <span class="text-blue-900 font-black underline decoration-blue-500 decoration-2 underline-offset-4">1/3 tổng tiền thức ăn đặt trước</span>.</p>
          <p>• Hình thức trả cọc: Tiền cọc sẽ được <span class="text-emerald-700 font-black underline decoration-2 underline-offset-2">trừ vào bill khi thanh toán</span> hoặc <span class="text-emerald-700 font-black underline decoration-2 underline-offset-2">hoàn lại bằng tiền mặt</span>.</p>
          <p>• Yêu cầu đặt cọc: Quý khách vui lòng <span class="text-rose-700 font-black underline decoration-rose-500 decoration-2 underline-offset-4">đặt cọc đúng theo số tiền ghi trên phiếu</span>.</p>
        </div>
      </div>

      <!-- Divider line if both are present -->
      <div v-if="!formStore.deposit.isPaid && formStore.filteredBillItems.length > 0" class="h-[1px] bg-blue-100/50 my-3"></div>

      <!-- Subsection 2: Pre-order Notes (shown only if has pre-ordered items) -->
      <div v-if="formStore.filteredBillItems.length > 0" class="space-y-2">
        <div class="text-[10px] font-black text-amber-800 uppercase tracking-widest flex items-center gap-1.5">
          <i class="fa-solid fa-utensils text-[10px]"></i> 2. Lưu ý cho món ăn đặt trước
        </div>
        <div class="text-slate-800 text-[13px] font-bold leading-relaxed space-y-1.5 pl-4">
          <p>• <strong>Giá món chênh lệch:</strong> Giá một số món có thể được cập nhật mới và chênh lệch so với thực đơn online. Nếu cần kiểm tra, quý khách có thể yêu cầu nhân viên cập nhật và phản hồi lại.</p>
          <p>• <strong>Giá chưa bao gồm thuế:</strong> Giá trên thực đơn chưa bao gồm VAT. Thuế suất áp dụng: <span class="text-amber-800 font-black underline decoration-amber-500 decoration-2 underline-offset-4">8%</span> đối với món ăn, đồ uống pha chế; <span class="text-amber-800 font-black underline decoration-amber-500 decoration-2 underline-offset-4">10%</span> đối với bia, rượu và đồ uống có ga đóng lon.</p>
          <p>• <strong>Thời gian lên thức ăn:</strong> Với món đặt trước, nhà hàng sẽ ưu tiên chuẩn bị nguyên liệu và sơ chế trước. Khi quý khách yêu cầu lên món, nhà hàng sẽ xác nhận lại một lần trước khi chế biến. Thời gian lên món dự kiến sẽ từ <span class="text-rose-600 font-black">10–30 phút</span>, theo tình hình thực tế tại thời điểm tổ chức.</p>
        </div>
      </div>
    </div>

    <!-- FOOTER -->
    <div class="pt-8 text-center mt-12 border-t border-slate-100">
      <div class="mb-4 text-slate-600 font-bold text-[13px] uppercase tracking-wider flex items-center justify-center gap-2">
        <i class="fa-solid fa-headset text-blue-600 text-sm"></i>
        <span>Nhân viên hỗ trợ: {{ formStore.staff.name || '---' }}</span>
        <span v-if="formStore.staff.phone" class="text-blue-600 font-black ml-1">({{ formStore.staff.phone }})</span>
      </div>
      <p class="text-slate-500 font-bold mb-2">❤ Cảm ơn quý khách đã tin tưởng lựa chọn King's Grill!</p>
      <p class="text-slate-400 font-medium italic">Hẹn gặp lại!</p>
    </div>
  </div>
</template>
