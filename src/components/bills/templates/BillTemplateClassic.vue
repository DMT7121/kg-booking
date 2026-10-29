<script setup lang="ts">
import { computed } from 'vue'
import { formatVND, formatShortVND, getDayOfWeek, formatDepositTime, parseBillItemNote } from '../billHelpers'

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
  <div class="w-full px-12 pt-7 pb-12 bg-white relative mx-auto select-text text-slate-800 font-sans">
    <!-- HEADER -->
    <div class="text-center mb-8 pb-6 border-b border-slate-100 mt-0">
      <div class="flex justify-center mb-3">
        <img 
          :src="configStore?.branding?.logo || '/images/brand-logo.svg'" 
          class="h-[216px] w-auto mx-auto object-contain" 
          alt="Logo"
          loading="eager"
        >
      </div>
      <h1 class="font-black tracking-[0.14em] text-slate-900 uppercase text-[36px] leading-tight" style="font-family: 'Be Vietnam Pro', sans-serif;">
        KING'S GRILL
      </h1>
      <p class="text-slate-600 text-[14px] font-bold mt-1.5 tracking-wide" style="font-family: 'Be Vietnam Pro', sans-serif;">
        ĐC: Số 34, Đường Hoàng Văn Thụ, Phường Thủ Dầu Một, Thành phố Hồ Chí Minh
      </p>
      <div class="mt-4 flex items-center justify-center gap-4">
        <span class="w-14 h-[3.5px] rounded-full bg-amber-400 shrink-0"></span>
        <h2 class="font-black tracking-[0.2em] text-blue-950 uppercase text-[24px] leading-snug whitespace-nowrap shrink-0" style="font-family: 'Be Vietnam Pro', sans-serif;">
          PHIẾU ĐẶT BÀN
        </h2>
        <span class="w-14 h-[3.5px] rounded-full bg-amber-400 shrink-0"></span>
      </div>
    </div>

    <!-- INFO & STAMP SECTION -->
    <div class="relative mb-10">
      <!-- Customer Info Grid -->
      <div class="grid gap-y-3.5 text-[16px] w-[66%]" style="grid-template-columns: 140px 1fr;">
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
        class="absolute -top-4 right-0 z-20 pointer-events-none" 
        :style="{ transform: `rotate(-4deg) translate(${stampParallax?.x || 0}px, ${stampParallax?.y || 0}px)` }"
      >
        <div class="relative w-[228px] flex flex-col items-center justify-center">
          <img 
            :src="formStore.deposit.isPaid ? '/images/stamps/paid.png?v=2' : '/images/stamps/pending.png?v=2'" 
            class="w-full object-contain" 
            style="filter: contrast(1.06) saturate(1.1) drop-shadow(0 4px 10px rgba(15, 23, 42, 0.14));" 
            alt="Stamp" 
          />
          <div 
            v-if="formStore.deposit.isPaid" 
            class="mt-2 px-3.5 py-1 bg-white/95 border border-red-300 rounded-full shadow-sm text-center text-[#B41222] font-black tracking-widest whitespace-nowrap font-tabular font-deposit-meta" 
            style="font-family: 'Google Sans Flex', 'Be Vietnam Pro', sans-serif; font-size: 13px;"
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
            <th class="py-3 px-3 text-left font-bold text-[13px] rounded-tl-xl w-10">#</th>
            <th class="py-3 px-3 text-left font-bold text-[13px]">TÊN MÓN</th>
            <th class="py-3 px-2 text-center font-bold text-[13px] w-12">SL</th>
            <th v-if="!hidePrice" class="py-3 px-3 text-right font-bold text-[13px] w-28">ĐƠN GIÁ</th>
            <th v-if="!hidePrice" class="py-3 px-3 text-right font-bold text-[13px] rounded-tr-xl w-32">THÀNH TIỀN</th>
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
          <tr v-for="(item, i) in formStore.filteredBillItems" :key="i" class="border-b border-slate-100 align-top">
            <td class="py-4 px-3 font-bold text-slate-400">{{ i + 1 }}</td>
            <td class="py-4 px-3 text-left">
              <div class="font-black text-slate-900 text-[15.5px] uppercase tracking-wide whitespace-normal break-words overflow-wrap-anywhere leading-snug">{{ item.name || 'Chưa đặt tên' }}</div>
              <div v-if="item.note" class="mt-2 space-y-2 text-left">
                <div
                  v-for="(cNote, cnIdx) in parseBillItemNote(item.note).customNotes"
                  :key="'cn-' + cnIdx"
                  class="text-[12.5px] text-rose-700 font-bold whitespace-pre-line leading-relaxed border-l-[3px] border-rose-400 bg-rose-50/70 rounded-r-lg px-2.5 py-1.5"
                  style="background-color: #fff1f2; color: #be123c; border-left: 3px solid #fb7185;"
                >
                  {{ cNote }}
                </div>
                <div
                  v-if="parseBillItemNote(item.note).parsedComponents.length > 0"
                  class="rounded-xl border border-blue-200 overflow-hidden shadow-2xs"
                  style="background-color: #f5f8ff; border-color: #bfdbfe; border-left: 4px solid #172554;"
                >
                  <div
                    class="px-3 py-1.5 border-b border-blue-200 flex items-center justify-between gap-2 text-[10.5px] font-black uppercase tracking-wider text-blue-950"
                    style="background-color: #eaf1ff; border-bottom-color: #bfdbfe; color: #172554;"
                  >
                    <span class="flex items-center gap-1.5 whitespace-nowrap">
                      <i class="fa-solid fa-utensils text-[10px] text-blue-700"></i>
                      <span>Chi tiết gói ({{ parseBillItemNote(item.note).parsedComponents.length }} món)</span>
                    </span>
                    <span class="text-[10px] font-bold text-blue-800 whitespace-nowrap">SL / Set</span>
                  </div>
                  <div class="flex flex-col divide-y divide-blue-100 px-3 py-0.5">
                    <div
                      v-for="(comp, cpIdx) in parseBillItemNote(item.note).parsedComponents"
                      :key="'cp-' + cpIdx"
                      class="py-1.5 flex items-center justify-between gap-2.5"
                    >
                      <div class="flex items-center gap-2 min-w-0 flex-1">
                        <span
                          class="inline-flex items-center justify-center w-5 h-5 rounded-md bg-blue-950 text-white text-[11px] font-black shrink-0 tabular-nums leading-none"
                          style="background-color: #172554; color: #ffffff;"
                        >
                          {{ comp.index }}
                        </span>
                        <span class="text-[13.5px] font-bold text-slate-900 leading-snug break-words" style="color: #0f172a;">
                          {{ comp.name }}
                        </span>
                      </div>
                      <span
                        v-if="comp.qty"
                        class="px-2 py-0.5 rounded-md bg-white border border-blue-200 text-blue-950 font-mono font-black text-[11.5px] shrink-0 whitespace-nowrap tabular-nums leading-snug"
                        style="background-color: #ffffff; border-color: #bfdbfe; color: #172554;"
                      >
                        SL: {{ comp.qty }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </td>
            <td class="py-4 px-2 text-center font-black text-slate-800 text-[15px] tabular-nums whitespace-nowrap">{{ item.qty }}</td>
            <td v-if="!hidePrice" class="py-4 px-3 text-right font-bold text-slate-600 font-mono tabular-nums whitespace-nowrap">{{ formatVND(item.price) }}</td>
            <td v-if="!hidePrice" class="py-4 px-3 text-right font-black text-blue-900 font-mono tabular-nums whitespace-nowrap">{{ formatVND(item.price * item.qty) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- TOTALS & DEPOSIT SUMMARY CARD -->
    <div
      v-if="!hidePrice"
      class="mb-10 w-full max-w-[540px] ml-auto rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs"
      style="background-color: #ffffff; border-color: #cbd5e1;"
    >
      <div
        class="px-6 py-2.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between gap-4"
        style="background-color: #f1f5f9; border-bottom-color: #e2e8f0;"
      >
        <span class="text-[11px] font-black uppercase tracking-[0.14em] text-slate-600 whitespace-nowrap" style="color: #475569;">
          TỔNG HỢP THANH TOÁN & ĐẶT CỌC
        </span>
        <span class="text-[10.5px] font-bold text-slate-500 font-mono whitespace-nowrap" style="color: #64748b;">
          VNĐ
        </span>
      </div>

      <div class="px-6 py-4 space-y-3 bg-white" style="background-color: #ffffff;">
        <!-- Subtotal -->
        <div class="grid grid-cols-[1fr_auto] items-center gap-6 py-0.5">
          <span class="text-[14px] font-bold text-slate-600 uppercase tracking-wide whitespace-nowrap leading-normal" style="color: #475569;">
            Tạm tính thực đơn
          </span>
          <span class="text-[17px] font-extrabold text-slate-800 font-mono tabular-nums whitespace-nowrap leading-normal text-right" style="color: #1e293b;">
            {{ formatVND(formStore.calculatedTotals.sub) }}
          </span>
        </div>

        <!-- Tax Rows -->
        <template v-if="formStore.taxEnabled">
          <div v-if="formStore.calculatedTotals.vat8 > 0" class="grid grid-cols-[1fr_auto] items-center gap-6 py-0.5">
            <span class="text-[13px] font-bold text-slate-500 uppercase tracking-wide whitespace-nowrap leading-normal" style="color: #64748b;">
              Thuế VAT (8%)
            </span>
            <span class="text-[15px] font-bold text-slate-700 font-mono tabular-nums whitespace-nowrap leading-normal text-right" style="color: #334155;">
              +{{ formatVND(formStore.calculatedTotals.vat8) }}
            </span>
          </div>
          <div v-if="formStore.calculatedTotals.vat10 > 0" class="grid grid-cols-[1fr_auto] items-center gap-6 py-0.5">
            <span class="text-[13px] font-bold text-slate-500 uppercase tracking-wide whitespace-nowrap leading-normal" style="color: #64748b;">
              Thuế VAT (10%)
            </span>
            <span class="text-[15px] font-bold text-slate-700 font-mono tabular-nums whitespace-nowrap leading-normal text-right" style="color: #334155;">
              +{{ formatVND(formStore.calculatedTotals.vat10) }}
            </span>
          </div>
        </template>

        <!-- Grand Total -->
        <div class="grid grid-cols-[1fr_auto] items-center gap-6 py-3 border-y-2 border-dashed border-slate-200" style="border-color: #e2e8f0;">
          <span class="text-[19px] font-black text-blue-950 uppercase tracking-wider whitespace-nowrap leading-normal" style="color: #172554;">
            TỔNG CỘNG
          </span>
          <span class="text-[26px] font-black text-blue-950 font-mono tabular-nums whitespace-nowrap leading-normal text-right" style="color: #172554;">
            {{ formatVND(formStore.calculatedTotals.final) }}
          </span>
        </div>

        <!-- Deposit Status Pill Box -->
        <div
          class="rounded-xl px-4 py-3 border grid grid-cols-[1fr_auto] items-center gap-6"
          :class="formStore.deposit.isPaid ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'"
          :style="formStore.deposit.isPaid
            ? 'background-color: #ecfdf5; border-color: #a7f3d0;'
            : 'background-color: #fff1f2; border-color: #fecdd3;'"
        >
          <span
            class="text-[15px] font-black uppercase tracking-wide inline-flex items-center gap-2 whitespace-nowrap leading-normal"
            :class="formStore.deposit.isPaid ? 'text-emerald-700' : 'text-rose-600'"
            :style="formStore.deposit.isPaid ? 'color: #047857;' : 'color: #e11d48;'"
          >
            <i class="fa-solid text-[14px]" :class="formStore.deposit.isPaid ? 'fa-circle-check' : 'fa-hourglass-half'"></i>
            <span>{{ formStore.deposit.isPaid ? 'ĐÃ ĐẶT CỌC' : 'YÊU CẦU ĐẶT CỌC' }}</span>
          </span>
          <span
            class="text-[22px] font-black font-tabular font-mono whitespace-nowrap leading-normal text-right"
            :class="formStore.deposit.isPaid ? 'text-emerald-700' : 'text-rose-600'"
            :style="formStore.deposit.isPaid ? 'color: #047857;' : 'color: #e11d48;'"
          >
            {{ formatVND(formStore.deposit.amount) }}
          </span>
        </div>

        <!-- DEPOSIT INSTALLMENT BREAKDOWN -->
        <div
          v-if="formStore.deposit.isPaid && formStore.deposit.history && formStore.deposit.history.length > 1"
          class="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-3 space-y-1.5 text-xs text-left font-deposit-meta"
          style="font-family: 'Google Sans Flex', 'Be Vietnam Pro', sans-serif; background-color: #f0fdf4; border-color: #bbf7d0;"
        >
          <div class="font-black text-[10.5px] uppercase tracking-wider text-emerald-800 flex items-center gap-1.5 pb-1 border-b border-emerald-200/60" style="color: #065f46;">
            <i class="fa-solid fa-clock-rotate-left text-[11px] text-emerald-600"></i> Chi tiết các đợt cọc:
          </div>
          <div
            v-for="(h, idx) in formStore.deposit.history"
            :key="idx"
            class="flex justify-between items-center gap-4 font-tabular text-[11.5px] font-deposit-meta leading-normal"
            style="font-family: 'Google Sans Flex', 'Be Vietnam Pro', sans-serif;"
          >
            <span class="text-slate-600" style="color: #475569;">
              {{ h.time }} <span class="font-black text-emerald-700" style="color: #047857;">[{{ formatShortVND(h.delta) }}]</span> <span class="font-bold text-slate-400">(Lần {{ idx + 1 }})</span>
            </span>
            <span class="font-bold text-slate-800 font-deposit-meta whitespace-nowrap" style="color: #1e293b;">{{ formatVND(h.amount) }}</span>
          </div>
          <div class="pt-1.5 border-t border-emerald-200/60 flex justify-between items-center gap-4 font-black text-[12px] text-emerald-800 font-deposit-meta leading-normal" style="color: #065f46;">
            <span>Tổng cọc: [{{ formatShortVND(formStore.deposit.amount) }}]</span>
            <span class="font-tabular font-deposit-meta whitespace-nowrap">{{ formatVND(formStore.deposit.amount) }}</span>
          </div>
        </div>

        <!-- Remaining Balance -->
        <div
          v-if="formStore.calculatedTotals.final - formStore.deposit.amount > 0"
          class="grid grid-cols-[1fr_auto] items-center gap-6 pt-3 border-t-2 border-slate-200"
          style="border-top-color: #e2e8f0;"
        >
          <div>
            <span class="text-[16px] font-black text-slate-900 uppercase tracking-wider whitespace-nowrap block leading-normal" style="color: #0f172a;">
              CÒN LẠI THANH TOÁN
            </span>
            <span class="text-[11px] font-semibold text-slate-500 block leading-normal" style="color: #64748b;">
              Thanh toán tại nhà hàng khi kết thúc tiệc
            </span>
          </div>
          <span class="text-[24px] font-black text-rose-600 font-mono tabular-nums whitespace-nowrap leading-normal text-right" style="color: #e11d48;">
            {{ formatVND(formStore.calculatedTotals.final - formStore.deposit.amount) }}
          </span>
        </div>
      </div>
    </div>

    <!-- INVITATION NOTICE (When hidePrice is true) -->
    <div v-else class="mb-10 p-5 rounded-2xl bg-blue-50/60 border border-blue-200 text-blue-900 text-xs leading-relaxed font-semibold text-center">
      ✦ Phiếu xác nhận thực đơn bàn tiệc — Trân trọng kính mời Quý khách! ✦
    </div>

    <!-- QR BANK TRANSFER (Shown only if not paid and not hidePrice) -->
    <div v-if="!hidePrice && appStore.currentBank && !formStore.deposit.isPaid" class="bg-slate-50 border-2 border-slate-100 rounded-3xl p-6 mb-8 w-full">
      <h3 class="font-black text-sm text-slate-800 uppercase tracking-widest mb-6 text-center">THÔNG TIN CHUYỂN KHOẢN</h3>
      
      <div class="flex gap-8 items-center justify-center flex-nowrap">
        <!-- QR Code -->
        <div class="flex-shrink-0">
          <img :src="qrImageUrl" class="w-60 h-60 object-contain rounded-2xl shadow-md border border-slate-200" alt="QR Code" loading="eager" decoding="sync">
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
