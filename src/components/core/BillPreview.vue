<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useUIStore } from '@/stores/useUIStore'
import { useFormStore } from '@/stores/useFormStore'
import { useAppStore } from '@/stores/useAppStore'
import { useConfigStore } from '@/stores/useConfigStore'
import { useBillRender } from '@/composables/useBillRender'
import { useForm } from '@/composables/useForm'
import { formatVND } from '@/utils'
import { PARTY_TYPES } from '@/utils/constants'

const ui = useUIStore()
const formStore = useFormStore()
const appStore = useAppStore()
const configStore = useConfigStore()
const { mobileScaleStyles, wrapperScaleStyles } = useBillRender()
const { depositTransferContent, qrImageUrl } = useForm()

const currentTimestamp = ref('')
let _timestampTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  currentTimestamp.value = new Date().toLocaleString('vi-VN')
  _timestampTimer = setInterval(() => {
    currentTimestamp.value = new Date().toLocaleString('vi-VN')
  }, 1000)
})

onUnmounted(() => {
  if (_timestampTimer) {
    clearInterval(_timestampTimer)
    _timestampTimer = null
  }
})

// --- KDS Vertical Slider ---
const MODES = ['full', 'kitchen', 'bar'] as const
const ITEM_HEIGHT = 72 // px per slider item

const sliderIndicatorTop = computed(() => {
  const idx = MODES.indexOf(formStore.billMode as any)
  return `${idx * ITEM_HEIGHT}px`
})

let touchStartY = 0
function onSliderTouchStart(e: TouchEvent) {
  touchStartY = e.touches[0].clientY
}
function onSliderTouchMove(e: TouchEvent) {
  e.preventDefault()
}
function onSliderTouchEnd(e: TouchEvent) {
  const deltaY = touchStartY - e.changedTouches[0].clientY
  if (Math.abs(deltaY) < 30) return
const idx = MODES.indexOf(formStore.billMode as any)
  if (deltaY > 0 && idx < MODES.length - 1) {
    formStore.billMode = MODES[idx + 1]
    haptic('light')
  } else if (deltaY < 0 && idx > 0) {
    formStore.billMode = MODES[idx - 1]
    haptic('light')
  }
}

import { haptic } from '@/composables/useGestures'
import paidStampImg from '@/assets/paid-stamp.png'

// --- Parallax Effect for Stamp ---
const stampParallax = ref({ x: 0, y: 0 })
function handleMouseMove(e: MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const x = (e.clientX - rect.left) / rect.width - 0.5
  const y = (e.clientY - rect.top) / rect.height - 0.5
  stampParallax.value = { x: x * 15, y: y * 15 }
}
function resetParallax() {
  stampParallax.value = { x: 0, y: 0 }
}
</script>

<template>
  <!-- RIGHT PANEL (BILL PREVIEW) -->
  <div v-show="ui.tab === 'preview' || true" :class="['w-full md:w-7/12 flex-1 overflow-y-auto bill-preview-wrapper', ui.tab !== 'preview' ? 'hidden md:block' : '']" class="custom-scrollbar">
    <div class="p-4 md:p-8 flex gap-0 md:gap-4">

      <!-- VERTICAL MODE SLIDER — Desktop (hidden on mobile) -->
      <div class="kds-vertical-slider no-print" @touchstart="onSliderTouchStart" @touchmove="onSliderTouchMove" @touchend="onSliderTouchEnd">
        <div class="kds-slider-track">
          <div class="kds-slider-indicator" :style="{ top: sliderIndicatorTop }"></div>
          <button
            @click="formStore.billMode = 'full'"
            :class="['kds-slider-item', formStore.billMode === 'full' ? 'kds-active' : '']">
            <i class="fa-solid fa-receipt"></i>
            <span>Bill</span>
          </button>
          <button
            @click="formStore.billMode = 'kitchen'"
            :class="['kds-slider-item', formStore.billMode === 'kitchen' ? 'kds-active' : '']">
            <i class="fa-solid fa-fire-burner"></i>
            <span>Bếp</span>
          </button>
          <button
            @click="formStore.billMode = 'bar'"
            :class="['kds-slider-item', formStore.billMode === 'bar' ? 'kds-active' : '']">
            <i class="fa-solid fa-martini-glass-citrus"></i>
            <span>Bar</span>
          </button>
        </div>
      </div>

      <!-- Scaled wrapper -->
      <div class="flex-1 relative" :style="wrapperScaleStyles">

        <!-- MOBILE MODE SWITCHER — Sticky overlay on bill -->
        <div class="kds-mobile-switcher no-print mb-4">
          <button
            @click="formStore.billMode = 'full'; haptic('light')"
            :class="['kds-mobile-btn', formStore.billMode === 'full' ? 'kds-mobile-active kds-m-bill' : '']">
            <i class="fa-solid fa-receipt"></i>
            <span>Bill</span>
          </button>
          <button
            @click="formStore.billMode = 'kitchen'; haptic('light')"
            :class="['kds-mobile-btn', formStore.billMode === 'kitchen' ? 'kds-mobile-active kds-m-kitchen' : '']">
            <i class="fa-solid fa-fire-burner"></i>
            <span>Bếp</span>
          </button>
          <button
            @click="formStore.billMode = 'bar'; haptic('light')"
            :class="['kds-mobile-btn', formStore.billMode === 'bar' ? 'kds-mobile-active kds-m-bar' : '']">
            <i class="fa-solid fa-martini-glass-citrus"></i>
            <span>Bar</span>
          </button>
        </div>

        <div id="bill-render" :style="mobileScaleStyles" class="bill-preview-container p-10 rounded-3xl relative" @mousemove="handleMouseMove" @mouseleave="resetParallax">

          <!-- HEADER -->
          <div class="text-center mb-6">
            <div class="flex justify-center mb-1"><img :src="configStore.branding.logo || '/favicon.svg'" class="h-[252px] w-auto object-contain print-no-shadow drop-shadow-sm" alt="Logo" loading="lazy"></div>
            <h1 class="font-black tracking-widest text-slate-900 uppercase text-3xl" style="font-family: 'Freeman', sans-serif;">KING'S GRILL</h1>
            <h2 class="font-bold tracking-[0.3em] text-slate-500 uppercase mt-2 text-base" style="font-family: 'Freeman', sans-serif;">{{ formStore.previewTitle }}</h2>
            <div class="w-40 h-1 mx-auto mt-4 rounded-full" :style="{ backgroundColor: configStore.branding.color }"></div>
          </div>

          <!-- INFO CARD + STAMP (Stamp overlays on right, info fills width) -->
          <div class="info-stamp-section">
            <!-- Full-width Info Card -->
            <div class="info-card">
              <div class="info-row"><span class="info-label">Khách hàng</span><span class="info-value font-black text-xl">{{ formStore.customer.name || '---' }}</span></div>
              <div class="info-row"><span class="info-label">SĐT/Zalo</span><span class="info-value highlight">{{ formStore.customer.phone || '---' }}</span></div>
              <div class="info-row"><span class="info-label">Thời gian</span><span class="info-value">{{ formStore.customer.time || '--:--' }} &mdash; {{ formStore.customer.date || 'dd/mm/yyyy' }}</span></div>
              <div class="info-row"><span class="info-label">Số khách</span><span class="info-value">{{ formStore.customer.pax || '0' }} người</span></div>
              <div class="info-row"><span class="info-label">Bàn</span><span class="info-value highlight">{{ formStore.customer.tables || '---' }}</span></div>
              <div class="info-row"><span class="info-label">Loại tiệc</span><span class="info-value"><i class="fa-solid mr-1" :class="PARTY_TYPES.find(p => p.name === formStore.customer.type)?.icon || 'fa-utensils'"></i>{{ formStore.customer.type || '---' }}</span></div>
              <div v-if="formStore.customer.note" class="info-row"><span class="info-label">Ghi chú</span><span class="info-value text-red-600 font-bold italic">{{ formStore.customer.note }}</span></div>
            </div>

            <!-- Stamp: SVG (With dynamic parallax) -->
            <div class="stamp-overlay" :style="{ transform: `rotate(-6deg) translate(${stampParallax.x}px, ${stampParallax.y}px)` }">
              <!-- ĐÃ NHẬN CỌC (Real 1.svg from Desktop) -->
              <div v-if="formStore.deposit.isPaid" class="rubber-stamp-svg-wrapper">
                <svg version="1.0" xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 600.000000 600.000000" preserveAspectRatio="xMidYMid meet">
                  <g transform="translate(0.000000,600.000000) scale(0.100000,-0.100000)" fill="#8b1113" stroke="none">
                    <path d="M4425 5283 c-33 -2 -841 -4 -1795 -5 l-1735 -3 -41 -22 c-53 -28 -111 -96 -124 -144 -7 -24 -9 -776 -8 -2170 l3 -2134 23 -38 c13 -20 32 -42 42 -47 12 -7 789 -10 2215 -10 l2197 0 34 37 c19 20 36 50 39 67 3 17 4 994 3 2171 l-3 2140 -22 41 c-29 54 -83 101 -132 114 -36 9 -512 11 -696 3z m665 -131 c60 -32 67 -59 74 -275 12 -389 18 -3952 7 -3993 -12 -45 -54 -90 -91 -98 -25 -5 -1735 -14 -3320 -18 -764 -1 -827 0 -858 16 -66 34 -61 -122 -63 2175 l-1 2091 21 34 c12 18 34 38 49 44 29 11 599 17 2567 28 622 4 1132 8 1134 10 2 2 104 4 225 4 195 0 225 -2 256 -18z"/>
                    <path d="M3330 5089 c-745 -3 -1573 -6 -1840 -7 -543 -2 -537 -1 -572 -72 -17 -33 -18 -151 -18 -2050 0 -1939 1 -2017 19 -2056 13 -28 30 -46 57 -60 38 -18 70 -19 874 -19 1420 1 2196 6 2175 15 -12 5 187 9 470 9 305 1 504 5 527 11 24 7 48 24 65 47 l28 37 -2 710 c-2 391 -6 1301 -9 2021 -7 1437 -3 1362 -67 1401 -38 23 146 21 -1707 13z m1698 -57 c18 -18 20 -39 26 -383 5 -324 12 -3215 8 -3576 -2 -138 -3 -143 -25 -158 -21 -14 -155 -15 -1168 -15 -629 0 -1530 -5 -2001 -10 -613 -8 -863 -8 -877 0 -11 6 -26 20 -32 33 -10 17 -12 494 -12 2033 1 1107 4 2021 8 2033 3 11 16 27 28 33 31 18 398 22 2348 27 1660 3 1677 3 1697 -17z m-1186 -4159 c-272 -2 -713 -2 -980 0 -268 1 -46 2 493 2 539 0 758 -1 487 -2z"/>
                    <path d="M4287 4793 c-13 -15 -15 -34 -10 -109 5 -85 4 -93 -17 -114 -33 -33 -75 -22 -168 43 -106 75 -169 111 -228 131 -48 16 -84 14 -84 -4 0 -14 65 -66 126 -100 282 -160 377 -303 378 -570 1 -168 -44 -307 -140 -432 -64 -83 -189 -168 -247 -168 -19 0 -20 4 -13 83 3 45 11 156 16 247 6 91 17 226 26 300 16 145 16 311 -1 317 -6 2 -21 -17 -33 -42 -19 -39 -26 -45 -53 -45 -31 0 -82 42 -135 111 -38 50 -104 68 -104 27 0 -24 30 -66 107 -150 92 -100 120 -189 61 -196 -31 -4 -52 16 -110 103 -81 121 -179 198 -211 166 -8 -8 -1 -21 26 -49 20 -21 37 -46 37 -56 0 -17 -6 -18 -52 -12 -157 20 -160 20 -156 1 2 -10 61 -54 138 -102 253 -158 330 -271 330 -488 0 -97 -32 -236 -67 -293 -102 -165 -234 -123 -363 114 -59 109 -126 194 -154 194 -7 0 -19 -7 -26 -15 -11 -13 -2 -37 49 -146 70 -146 101 -229 101 -269 0 -31 30 -96 59 -127 11 -12 28 -40 37 -63 32 -79 72 -79 184 1 74 53 208 124 375 199 81 36 229 127 281 173 130 114 272 379 335 622 24 90 36 262 20 285 -8 12 -12 12 -29 -3 -22 -20 -38 -59 -76 -187 -39 -129 -83 -186 -101 -130 -4 12 -4 116 0 233 8 246 -8 408 -47 486 -26 52 -38 59 -61 34z"/>
                    <path d="M1663 4778 c-57 -71 -73 -235 -59 -583 8 -179 3 -211 -29 -185 -25 21 -44 64 -86 189 -38 115 -66 160 -89 146 -19 -12 -6 -203 21 -295 54 -189 180 -437 258 -507 13 -13 20 -23 15 -23 -17 0 84 -93 148 -136 83 -55 348 -184 380 -184 22 0 63 -19 43 -20 -5 0 17 -15 50 -33 106 -57 152 -95 211 -174 l59 -78 0 -213 c0 -116 2 -212 5 -212 3 0 23 18 44 39 31 32 36 42 28 58 -9 16 -16 149 -13 252 1 29 3 32 17 20 24 -19 39 -55 69 -159 41 -147 70 -180 155 -180 108 0 150 149 54 195 -39 18 -63 14 -90 -16 -14 -15 -16 -24 -8 -36 16 -25 34 -27 34 -4 0 28 34 45 60 31 59 -32 38 -140 -27 -140 -52 0 -82 38 -119 147 -26 78 -63 146 -91 170 l-26 21 27 32 c34 41 54 80 71 139 27 91 21 126 -25 151 -14 8 -16 2 -12 -51 3 -33 -1 -87 -8 -120 -13 -61 -68 -159 -79 -141 -3 6 -3 66 0 134 6 110 12 137 53 261 25 75 72 194 103 263 44 98 54 130 46 142 -29 48 -78 5 -159 -141 -119 -212 -153 -247 -239 -247 -69 0 -118 40 -160 132 -52 113 -69 290 -40 403 36 135 102 209 314 349 170 112 173 134 13 101 -101 -21 -118 -5 -62 58 35 40 38 57 10 57 -52 0 -105 -49 -190 -173 -29 -43 -63 -85 -74 -93 -32 -22 -55 -17 -62 12 -9 36 21 96 88 173 117 136 132 171 77 171 -32 0 -39 -6 -137 -114 -36 -40 -47 -47 -75 -44 -26 2 -36 11 -55 46 -13 23 -27 42 -32 42 -24 0 -23 -112 5 -320 8 -58 20 -175 25 -260 6 -85 18 -202 26 -259 8 -58 14 -106 14 -108 0 -2 -12 -3 -27 -3 -48 0 -135 52 -209 126 -142 141 -218 375 -185 570 37 220 116 323 360 470 127 77 172 133 95 121 -57 -10 -155 -60 -254 -131 -95 -68 -121 -80 -161 -74 -39 5 -51 42 -43 136 4 58 2 87 -6 97 -15 18 -34 19 -47 3z m515 -1359 c2 -19 8 -39 13 -46 7 -7 6 -13 -1 -18 -5 -3 -10 -1 -10 4 0 6 -13 11 -30 11 -35 0 -35 2 -12 51 20 46 36 45 40 -2z"/>
                    <path d="M3234 3160 c-30 -12 -60 -53 -81 -113 -14 -40 -18 -83 -18 -187 0 -146 11 -203 49 -246 55 -65 109 14 118 174 l5 82 -39 0 c-21 0 -41 0 -45 0 -5 1 -9 -8 -11 -20 -3 -16 1 -19 20 -18 22 3 23 0 26 -82 3 -86 -11 -132 -35 -117 -39 24 -51 297 -19 417 24 94 53 105 71 29 8 -33 13 -40 18 -26 16 42 3 99 -25 110 -7 2 -23 1 -34 -3z"/>
                    <path d="M2815 3122 c12 -30 17 -235 7 -312 -5 -41 -9 -75 -8 -76 0 -1 18 1 39 4 31 3 37 8 31 21 -12 27 -16 212 -7 283 l9 66 -39 16 c-36 14 -38 14 -32 -2z"/>
                    <path d="M3950 3106 c-14 -8 -65 -21 -115 -31 -53 -10 -113 -29 -145 -46 -77 -41 -169 -115 -180 -145 -12 -30 -13 -74 -2 -74 4 0 31 17 59 39 62 46 138 85 155 78 19 -7 -83 -102 -141 -132 -57 -28 -71 -48 -71 -99 0 -37 16 -49 27 -21 7 20 49 41 127 67 188 61 327 194 343 328 5 45 4 50 -13 50 -10 -1 -30 -7 -44 -14z"/>
                    <path d="M3078 3103 c-13 -3 -15 -10 -7 -36 11 -40 12 -304 1 -292 -10 11 -30 76 -71 222 -26 97 -27 98 -59 101 -31 3 -33 2 -23 -17 14 -26 14 -296 1 -322 -8 -15 -7 -19 4 -19 8 0 22 -3 31 -7 15 -5 16 -3 6 15 -6 12 -11 66 -10 124 l0 103 29 -90 c15 -49 42 -140 60 -202 24 -83 37 -114 51 -118 29 -9 42 4 23 22 -14 14 -15 46 -12 247 2 163 7 238 16 254 11 19 11 22 -5 21 -10 -1 -25 -3 -35 -6z"/>
                    <path d="M2010 3068 c0 -45 49 -146 91 -186 70 -70 161 -121 267 -153 95 -28 111 -38 139 -87 30 -51 46 -44 46 20 0 62 -15 82 -89 120 -110 55 -203 151 -125 128 41 -11 68 -27 134 -76 63 -47 77 -48 77 -8 0 38 -13 57 -72 102 -93 71 -195 120 -278 132 -41 6 -95 18 -119 26 -64 20 -71 19 -71 -18z"/>
                    <path d="M3323 3084 c-3 -8 0 -26 7 -39 7 -13 10 -32 6 -41 -6 -16 -5 -16 14 1 20 18 26 49 14 79 -8 21 -33 21 -41 0z"/>
                    <path d="M3373 2975 c-27 -19 -46 -75 -37 -111 3 -16 28 -63 55 -104 54 -84 69 -147 47 -190 -11 -20 -21 -25 -53 -25 -32 0 -42 5 -54 26 -30 53 14 116 49 69 19 -25 40 -20 40 9 0 26 -20 41 -56 41 -41 0 -64 -30 -64 -83 0 -52 35 -87 88 -87 52 0 86 28 101 82 15 55 -2 118 -53 187 -38 51 -66 109 -66 136 0 8 9 24 20 35 16 16 25 18 40 10 26 -14 26 -46 -1 -53 -30 -8 -18 -32 17 -32 26 0 29 4 32 33 6 61 -53 93 -105 57z"/>
                    <path d="M3161 2509 c12 -24 3 -440 -11 -490 l-8 -28 101 6 c56 3 105 8 109 12 4 3 11 25 16 49 10 44 0 56 -18 22 -13 -24 -53 -46 -103 -55 l-37 -7 0 113 c0 139 16 337 30 373 9 26 9 26 -41 26 -48 0 -49 -1 -38 -21z"/>
                    <path d="M2674 2495 c-23 -35 -33 -89 -34 -175 0 -134 40 -318 85 -386 34 -52 84 -64 101 -26 8 17 16 280 9 291 -2 4 -24 5 -49 3 -41 -4 -46 -7 -46 -28 0 -25 15 -33 23 -11 10 28 27 -12 41 -101 16 -99 13 -125 -13 -120 -58 11 -128 485 -79 534 16 17 18 17 37 0 10 -9 24 -37 30 -62 6 -24 15 -44 20 -44 13 0 -9 113 -26 132 -25 27 -79 24 -99 -7z"/>
                    <path d="M3052 2474 c5 -20 8 -114 6 -210 l-3 -174 38 0 c36 0 37 1 30 28 -5 15 -8 109 -7 210 l0 182 -37 0 -37 0 10 -36z"/>
                    <path d="M3276 2453 c7 -48 -12 -301 -25 -336 -6 -15 -8 -27 -6 -27 2 0 30 11 61 25 31 14 63 25 70 25 8 0 16 10 18 23 13 64 15 87 6 87 -6 0 -10 -6 -10 -13 0 -21 -50 -87 -66 -87 -13 0 -14 12 -9 83 8 106 23 219 31 240 5 14 -1 17 -35 17 l-41 0 6 -37z"/>
                    <path d="M2935 2465 c-5 -2 -32 -6 -58 -10 -41 -5 -46 -9 -36 -21 16 -19 32 -422 20 -488 -5 -27 -5 -46 1 -46 23 0 79 31 73 40 -10 16 -24 224 -16 233 11 12 36 -23 56 -78 23 -63 68 -136 92 -151 10 -6 39 -15 63 -19 25 -4 65 -18 89 -31 49 -27 74 -30 88 -11 16 20 21 53 11 71 -9 15 -12 15 -33 -8 -30 -33 -62 -33 -124 -1 -56 28 -92 67 -128 139 -14 28 -37 63 -51 79 l-26 27 26 28 c34 35 48 72 48 128 0 53 -23 114 -44 114 -8 0 -20 2 -28 4 -7 3 -17 3 -23 1z m19 -30 c45 -45 25 -223 -27 -233 -15 -3 -17 8 -17 116 0 136 7 154 44 117z"/>
                    <path d="M2903 1869 c-57 -22 -93 -59 -93 -94 0 -32 39 -85 88 -119 37 -26 55 -31 116 -34 58 -3 81 0 112 16 110 56 149 148 87 204 -55 50 -214 64 -310 27z"/>
                    <path d="M1680 1476 c-106 -29 -190 -118 -190 -202 0 -34 5 -47 26 -63 38 -30 71 -26 110 13 26 26 34 42 34 70 0 23 -5 36 -13 36 -9 0 -12 -9 -9 -28 5 -39 -32 -84 -67 -80 -22 3 -26 8 -29 42 -5 54 13 90 70 141 73 66 168 81 250 39 80 -41 76 -211 -7 -320 -43 -57 -115 -81 -165 -54 -18 10 -17 14 20 83 34 62 44 73 75 80 43 11 46 27 5 27 -16 0 -30 2 -30 5 0 19 55 123 73 137 31 23 15 33 -23 13 -31 -16 -86 -91 -96 -132 -4 -14 -14 -23 -24 -23 -26 0 -34 -17 -14 -28 14 -8 12 -16 -15 -70 -17 -34 -33 -62 -36 -62 -2 0 -15 5 -29 11 -34 16 -93 3 -107 -22 -25 -48 56 -78 122 -44 26 14 35 14 83 0 43 -13 63 -14 95 -5 62 16 122 68 153 132 103 207 -34 367 -262 304z m-89 -387 c20 -10 20 -11 2 -24 -21 -17 -69 -19 -78 -5 -9 15 14 40 37 40 11 0 28 -5 39 -11z"/>
                    <path d="M2485 1483 c-94 -25 -149 -160 -90 -218 13 -14 29 -25 35 -25 13 0 13 2 -5 36 -42 82 15 190 96 182 54 -5 58 -26 24 -124 -47 -136 -104 -235 -148 -259 -42 -23 -43 -39 -3 -43 55 -7 111 78 170 261 l33 99 16 -84 c10 -45 17 -122 17 -170 0 -79 2 -88 18 -88 15 0 26 21 50 95 32 98 102 246 130 279 9 10 30 24 45 31 25 10 26 13 12 25 -41 34 -98 -33 -160 -187 l-43 -107 -7 60 c-9 91 -46 194 -75 216 -27 20 -82 30 -115 21z"/>
                    <path d="M2944 1470 c-20 -13 -46 -48 -68 -90 -21 -39 -40 -70 -44 -70 -4 0 -7 -12 -8 -28 0 -15 -19 -70 -41 -122 -40 -93 -41 -109 -6 -110 6 0 21 25 33 56 23 64 72 139 98 153 10 5 24 6 31 1 11 -6 7 -22 -18 -75 -44 -96 -40 -135 14 -135 8 0 30 14 50 31 25 22 35 27 35 16 0 -47 67 -61 104 -23 l24 23 11 -23 c13 -30 47 -31 78 -2 l23 21 0 -22 c0 -17 4 -22 16 -17 9 3 19 6 23 6 4 0 13 17 19 38 16 54 79 150 103 157 37 12 40 -9 9 -74 -17 -34 -30 -73 -30 -85 0 -51 52 -61 95 -18 36 35 78 102 70 110 -4 4 -10 0 -15 -8 -25 -45 -72 -100 -85 -100 -22 0 -18 34 11 91 15 31 24 63 22 82 -3 28 -7 32 -34 35 -22 2 -40 -5 -64 -25 -29 -24 -32 -25 -21 -5 11 20 9 22 -12 22 -20 0 -29 -11 -51 -63 -43 -102 -116 -175 -116 -116 0 12 15 56 34 99 19 43 32 81 29 84 -3 2 -17 0 -31 -5 -17 -7 -29 -6 -36 1 -33 33 -109 -11 -152 -88 -44 -77 -74 -112 -95 -112 -25 0 -24 7 11 82 32 68 37 97 18 116 -20 20 -54 14 -89 -15 l-32 -27 14 26 c8 15 36 43 63 62 27 19 57 47 67 63 23 35 25 89 3 97 -22 9 -26 8 -60 -14z m51 -32 c-11 -36 -53 -96 -75 -108 -24 -13 -25 -4 -4 45 24 59 45 85 66 85 15 0 18 -5 13 -22z m201 -183 c15 -38 -68 -175 -107 -175 -44 0 -10 124 47 169 31 25 52 27 60 6z"/>
                    <path d="M3900 1458 c-51 -26 -75 -47 -110 -95 -25 -34 -50 -62 -56 -62 -21 -2 -54 45 -54 78 0 39 -20 38 -35 -3 -12 -34 -1 -53 47 -84 34 -23 35 -25 26 -60 -6 -20 -8 -61 -6 -91 4 -45 10 -59 36 -82 62 -55 146 -46 231 27 37 32 42 34 48 17 12 -33 36 -53 66 -53 32 0 92 32 106 57 4 9 22 22 40 29 30 13 31 13 31 -15 0 -59 75 -90 139 -56 29 15 111 101 111 116 0 20 -20 7 -40 -26 -65 -105 -183 -100 -151 7 14 46 66 108 91 108 27 0 36 -21 17 -35 -23 -17 -21 -35 3 -35 28 0 45 36 31 66 -9 20 -18 24 -53 24 -40 0 -47 -4 -110 -72 -37 -40 -69 -70 -72 -67 -2 2 0 23 7 46 9 34 8 45 -6 66 -13 21 -25 26 -56 25 -57 -1 -92 -26 -145 -107 -55 -82 -83 -107 -139 -122 -82 -22 -127 12 -127 95 0 92 8 102 83 110 153 17 276 126 220 195 -32 40 -96 39 -173 -1z m145 -19 c18 -57 -84 -137 -186 -146 l-62 -6 19 34 c33 58 107 125 150 136 49 12 72 6 79 -18z m164 -183 c13 -16 -1 -90 -19 -101 -23 -14 -39 60 -20 96 13 23 23 24 39 5z m-66 -38 c-4 -34 0 -48 17 -66 l21 -22 -26 -26 c-36 -36 -69 -30 -73 15 -5 47 4 74 34 110 14 17 27 31 29 31 1 0 0 -19 -2 -42z"/>
                    <path d="M3178 1365 c-21 -20 -38 -37 -38 -40 0 -11 23 -4 50 17 l29 21 20 -24 c10 -13 22 -21 26 -18 10 10 -22 79 -37 79 -7 0 -30 -16 -50 -35z"/>
                    <path d="M2095 1359 l-20 -22 24 6 c14 3 44 1 68 -6 39 -10 45 -9 65 10 l21 22 -34 0 c-19 0 -50 3 -69 6 -29 5 -39 3 -55 -16z"/>
                    <path d="M4817 1364 c-4 -4 -7 -21 -7 -38 0 -17 -9 -40 -22 -53 -28 -29 -11 -30 33 0 28 19 34 29 34 57 0 33 -20 51 -38 34z"/>
                    <path d="M1187 1343 c-27 -26 21 -103 63 -103 l21 0 -21 22 c-12 13 -20 35 -20 55 0 25 -4 33 -18 33 -10 0 -22 -3 -25 -7z"/>
                    <path d="M4886 1276 c-9 -14 -31 -32 -49 -40 l-32 -14 28 -11 c15 -6 38 -22 52 -36 23 -25 23 -26 30 -5 3 11 20 27 38 36 29 16 30 17 12 30 -10 8 -22 14 -27 14 -4 0 -13 12 -21 26 l-14 26 -17 -26z"/>
                    <path d="M2040 1242 c-57 -56 -79 -116 -58 -160 18 -37 57 -41 94 -9 l28 25 11 -22 c23 -46 75 -25 129 53 15 22 26 45 24 52 -2 6 -20 -14 -41 -45 -24 -37 -44 -56 -57 -56 -27 0 -25 12 15 105 32 74 41 105 31 105 -3 0 -16 -4 -30 -10 -16 -6 -27 -6 -31 0 -4 6 -20 10 -37 10 -23 0 -42 -11 -78 -48z m107 12 c8 -22 -16 -90 -49 -135 -49 -68 -92 -42 -64 39 20 55 45 92 70 102 30 13 36 12 43 -6z"/>
                    <path d="M1125 1260 c-4 -11 -20 -27 -36 -35 -16 -9 -29 -18 -29 -20 0 -2 13 -11 29 -20 16 -8 33 -25 37 -37 l7 -22 17 21 c9 12 32 31 50 42 l34 20 -26 10 c-14 5 -34 21 -46 35 -24 31 -29 32 -37 6z"/>
                    <path d="M4704 1236 c-8 -21 3 -36 27 -36 15 0 20 6 17 22 -4 27 -35 37 -44 14z"/>
                    <path d="M1301 1226 c-16 -19 -7 -46 14 -46 22 0 30 29 13 46 -13 13 -16 13 -27 0z"/>
                    <path d="M4796 1165 c18 -18 23 -31 18 -50 -8 -32 22 -47 42 -20 23 32 -23 95 -70 95 -11 0 -8 -7 10 -25z"/>
                    <path d="M1233 1165 c-36 -15 -56 -46 -51 -78 2 -14 10 -22 23 -22 16 0 21 8 23 35 2 19 13 45 24 58 25 26 24 26 -19 7z"/>
                    <path d="M3071 1001 c-8 -14 -7 -22 5 -32 14 -11 18 -10 29 5 16 21 9 46 -11 46 -7 0 -18 -9 -23 -19z"/>
                    <path d="M4057 1013 c-11 -10 -8 -41 4 -49 16 -9 43 21 36 40 -7 16 -28 21 -40 9z"/>
                  </g>
                </svg>
                <!-- Locked Confirmation Timestamp (placed right below the stamp) -->
                <div class="rubber-stamp-fixed-footer">
                  {{ formStore.deposit.time || '' }}
                </div>
              </div>

              <!-- CHỜ CỌC (Real 2.svg from Desktop — No timestamp) -->
              <div v-else class="rubber-stamp-svg-wrapper pending-stamp-wrapper">
                <svg version="1.0" xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 600.000000 600.000000" preserveAspectRatio="xMidYMid meet">
                  <g transform="translate(0.000000,600.000000) scale(0.100000,-0.100000)" fill="#14305b" stroke="none">
                    <path d="M4435 5283 c-22 -1 -827 -4 -1790 -5 l-1750 -3 -42 -23 c-58 -31 -120 -111 -128 -165 -3 -23 -5 -997 -3 -2164 l3 -2121 30 -44 31 -43 2206 -3 2206 -2 31 26 c17 14 35 42 41 62 8 26 10 694 8 2182 l-3 2145 -22 40 c-30 56 -81 101 -128 114 -36 10 -578 13 -690 4z m642 -128 c78 -30 80 -40 87 -415 3 -179 9 -1116 12 -2082 l7 -1756 -22 -45 c-14 -30 -33 -50 -54 -60 -33 -15 -211 -17 -3477 -29 l-695 -3 -37 23 c-21 13 -41 36 -47 54 -8 22 -11 643 -11 2115 -1 1985 0 2086 17 2115 10 17 29 39 43 49 27 20 -96 18 2410 35 503 3 916 7 917 8 1 0 183 2 404 4 356 3 408 1 446 -13z"/>
                    <path d="M4900 5094 c-19 -2 -748 -5 -1620 -7 -2532 -7 -2280 -4 -2318 -27 -67 -41 -62 113 -62 -2102 0 -1937 1 -2015 19 -2054 13 -28 30 -46 57 -60 38 -19 76 -19 1534 -16 966 1 1496 6 1498 12 2 6 181 10 490 10 305 0 501 4 524 10 24 7 48 24 65 47 l28 37 0 410 c0 226 -4 1135 -8 2020 -9 1765 -5 1669 -67 1701 -32 16 -89 24 -140 19z m125 -57 c19 -14 20 -30 25 -219 7 -241 16 -2591 13 -3198 -1 -234 -3 -482 -3 -552 0 -115 -2 -129 -20 -146 -20 -18 -74 -19 -1773 -26 -963 -3 -1865 -9 -2003 -12 -270 -7 -287 -5 -305 42 -10 28 -14 4040 -3 4068 4 9 16 22 28 28 31 18 454 23 2346 26 1475 3 1677 2 1695 -11z m-766 -4162 c-7 -7 -1870 -7 -1877 -1 -3 3 419 6 938 6 519 0 941 -2 939 -5z m-2216 -32 c-13 -2 -33 -2 -45 0 -13 2 -3 4 22 4 25 0 35 -2 23 -4z m110 0 c-13 -2 -35 -2 -50 0 -16 2 -5 4 22 4 28 0 40 -2 28 -4z"/>
                    <path d="M4286 4789 c-12 -18 -14 -40 -9 -109 5 -81 4 -89 -17 -110 -28 -28 -76 -23 -123 13 -172 130 -306 194 -347 167 -22 -15 33 -63 150 -132 252 -150 341 -291 343 -548 2 -187 -60 -354 -177 -473 -62 -63 -166 -127 -206 -127 -22 0 -23 2 -17 78 4 42 11 147 17 232 5 85 17 220 26 300 17 155 16 331 -1 337 -6 2 -21 -17 -33 -42 -19 -39 -26 -45 -53 -45 -32 0 -46 12 -142 118 -28 32 -45 42 -67 42 -54 0 -36 -50 51 -145 108 -117 140 -180 107 -213 -31 -31 -57 -10 -157 130 -60 85 -100 120 -152 133 -42 10 -44 -12 -5 -55 52 -57 49 -74 -11 -66 -27 4 -74 10 -106 13 -53 5 -59 4 -55 -12 2 -11 56 -51 127 -95 199 -124 267 -193 317 -327 24 -62 26 -77 21 -183 -5 -128 -31 -228 -76 -294 -41 -61 -72 -80 -131 -78 -78 2 -129 49 -215 203 -98 174 -157 231 -185 178 -9 -16 -7 -29 11 -62 65 -125 131 -287 136 -335 4 -36 17 -69 39 -105 18 -29 42 -71 53 -94 40 -85 74 -83 215 11 61 41 163 98 226 127 407 185 516 288 659 619 72 167 101 275 107 400 6 125 -3 150 -40 108 -24 -26 -35 -56 -75 -193 -12 -38 -30 -85 -41 -102 -20 -33 -48 -44 -52 -20 -1 6 -2 138 -3 292 -1 294 -11 377 -52 448 -23 39 -37 43 -57 16z"/>
                    <path d="M1645 4759 c-41 -78 -54 -265 -39 -571 5 -122 4 -161 -6 -173 -26 -32 -59 23 -109 183 -32 103 -68 161 -89 148 -17 -10 -15 -145 2 -227 21 -97 62 -210 121 -335 56 -119 129 -234 147 -234 6 0 9 -3 5 -6 -15 -15 81 -106 178 -169 94 -61 334 -175 369 -175 13 0 35 -9 48 -20 12 -11 65 -47 115 -80 89 -58 126 -98 191 -204 10 -16 12 -69 9 -229 l-4 -208 43 42 c37 36 41 45 33 66 -12 33 -12 273 1 273 18 0 39 -44 66 -140 44 -157 78 -200 159 -200 69 0 115 45 115 112 0 65 -78 115 -128 82 -30 -19 -37 -40 -22 -59 17 -21 30 -19 30 5 0 23 32 43 55 34 17 -7 45 -54 45 -77 0 -26 -41 -67 -66 -67 -56 0 -72 23 -134 188 -19 50 -45 96 -66 119 l-35 36 25 26 c37 39 65 100 81 177 l15 69 -37 33 c-20 17 -39 30 -41 27 -3 -3 0 -11 6 -17 7 -7 12 -41 12 -78 0 -76 -28 -170 -65 -215 l-25 -30 0 106 c0 152 41 301 152 552 48 108 59 143 51 155 -30 48 -78 5 -159 -141 -88 -157 -124 -207 -168 -229 -53 -27 -126 -21 -162 13 -66 62 -111 185 -121 335 -14 211 62 345 273 481 136 88 184 124 184 140 0 13 -8 14 -47 9 -143 -19 -163 -19 -163 -2 0 9 16 34 36 56 30 33 33 41 20 46 -48 19 -100 -23 -197 -157 -76 -106 -107 -131 -134 -109 -35 29 -6 93 101 217 74 87 95 126 77 144 -19 19 -73 -13 -124 -74 -63 -76 -82 -89 -116 -85 -19 2 -33 14 -49 43 -12 22 -25 40 -30 40 -16 0 -25 -62 -19 -135 3 -41 12 -127 20 -190 8 -63 19 -176 24 -250 15 -193 33 -333 43 -347 7 -9 2 -14 -17 -19 -46 -11 -140 41 -221 123 -125 127 -185 278 -187 473 -1 122 16 197 67 297 47 94 120 160 286 262 142 87 182 140 98 127 -61 -9 -128 -44 -243 -126 -105 -74 -130 -86 -168 -76 -37 9 -49 49 -42 132 9 88 2 114 -30 114 -17 0 -29 -9 -40 -31z m530 -718 c0 -6 7 -16 15 -21 9 -6 10 -10 3 -10 -14 0 -43 28 -43 42 0 5 6 8 13 6 6 -3 12 -10 12 -17z m-5 -583 c1 -2 3 -21 6 -43 4 -22 11 -44 18 -48 7 -6 4 -7 -7 -3 -10 3 -30 6 -43 6 -27 0 -31 12 -9 34 8 8 15 24 15 35 0 12 5 21 10 21 6 0 10 -1 10 -2z"/>
                    <path d="M3240 3163 c-64 -23 -101 -117 -108 -271 -8 -183 28 -297 93 -297 41 0 65 51 77 162 12 114 12 116 -42 117 -39 1 -45 -2 -48 -22 -3 -18 1 -22 20 -20 22 3 23 0 26 -67 4 -88 -4 -135 -24 -135 -21 0 -32 38 -46 146 -10 80 -10 109 5 198 9 57 22 116 29 130 18 41 41 28 53 -29 8 -36 13 -45 18 -32 12 31 8 81 -9 105 -16 23 -19 24 -44 15z"/>
                    <path d="M2823 3076 c9 -62 3 -299 -8 -329 -6 -14 -1 -15 32 -10 21 3 39 6 40 7 1 1 -3 26 -9 56 -10 52 -4 262 7 292 4 10 -7 20 -33 30 l-38 15 9 -61z"/>
                    <path d="M3955 3108 c-10 -6 -62 -20 -113 -30 -110 -22 -172 -51 -260 -121 -64 -50 -82 -77 -82 -123 0 -32 10 -30 62 9 54 42 131 87 146 87 43 0 -46 -93 -131 -136 -50 -26 -67 -52 -67 -105 0 -30 17 -40 26 -14 7 16 99 65 125 65 41 0 186 85 244 144 69 69 93 114 102 186 5 45 4 50 -13 50 -10 0 -28 -6 -39 -12z"/>
                    <path d="M3073 3102 c-10 -6 -10 -17 -3 -42 12 -40 14 -280 3 -280 -5 0 -28 71 -53 158 l-45 157 -33 3 c-31 3 -33 2 -23 -17 14 -26 14 -296 1 -322 -8 -15 -7 -19 4 -19 8 0 22 -3 31 -7 15 -5 16 -3 6 15 -7 14 -11 61 -9 124 l3 103 22 -75 c12 -41 31 -109 43 -150 11 -41 27 -98 35 -127 10 -35 22 -54 35 -58 31 -10 44 4 25 25 -15 17 -17 44 -13 247 2 158 8 235 16 251 12 20 11 22 -10 22 -13 0 -29 -4 -35 -8z"/>
                    <path d="M2012 3056 c16 -143 148 -262 365 -331 81 -25 100 -40 144 -105 23 -34 33 -19 33 44 0 66 -9 78 -93 121 -111 56 -200 148 -122 125 41 -11 68 -27 134 -76 33 -24 63 -41 68 -38 21 13 8 65 -23 97 -42 42 -97 82 -125 91 -13 4 -23 11 -23 15 0 17 -108 54 -192 67 -48 7 -96 18 -107 23 -11 6 -30 11 -42 11 -20 0 -21 -4 -17 -44z m235 -140 c4 -5 -5 -6 -20 -2 -16 4 -26 3 -23 -2 2 -4 1 -14 -3 -21 -6 -9 -8 -4 -8 13 0 22 4 26 23 23 13 -2 27 -7 31 -11z"/>
                    <path d="M3323 3084 c-3 -8 0 -26 7 -39 7 -13 10 -32 6 -41 -6 -16 -5 -16 14 1 22 20 27 64 8 83 -16 16 -27 15 -35 -4z"/>
                    <path d="M3367 2972 c-49 -54 -43 -116 19 -207 48 -70 71 -137 60 -178 -13 -55 -97 -62 -117 -10 -22 58 18 107 52 64 20 -25 39 -20 39 9 0 30 -42 53 -73 41 -33 -13 -47 -39 -47 -89 0 -66 61 -105 123 -78 89 37 98 147 22 253 -56 76 -78 129 -67 161 7 21 15 27 38 27 22 0 30 -5 32 -22 2 -16 -2 -23 -12 -23 -9 0 -16 -8 -16 -20 0 -27 45 -27 60 -1 31 60 -67 124 -113 73z"/>
                    <path d="M3157 2534 c-2 -2 1 -30 6 -61 10 -63 -4 -436 -17 -466 -8 -16 -1 -17 95 -11 57 4 108 10 112 14 10 9 28 83 21 89 -2 3 -11 -5 -20 -17 -19 -27 -58 -48 -108 -58 l-39 -7 7 184 c7 177 16 270 31 315 6 19 3 21 -39 21 -25 0 -47 -1 -49 -3z"/>
                    <path d="M2674 2495 c-58 -88 -35 -399 40 -542 35 -67 92 -90 112 -45 4 9 9 81 12 158 l4 142 -48 -5 c-59 -7 -58 -6 -49 -34 6 -17 9 -19 16 -8 15 25 28 -3 42 -95 15 -93 13 -126 -8 -126 -31 0 -80 178 -94 346 -10 115 -5 178 15 195 24 20 39 0 74 -95 16 -44 21 -26 10 38 -11 71 -31 96 -76 96 -25 0 -38 -7 -50 -25z"/>
                    <path d="M3052 2473 c6 -21 8 -112 6 -210 l-3 -173 38 0 c35 0 38 2 30 23 -4 12 -7 106 -5 210 l2 187 -39 0 -39 0 10 -37z"/>
                    <path d="M3273 2372 c-3 -133 -11 -226 -24 -260 -8 -21 -7 -23 13 -16 13 4 39 15 58 25 19 11 43 19 52 19 18 0 21 10 32 80 4 30 3 32 -7 16 -7 -10 -21 -32 -32 -50 -12 -17 -28 -32 -38 -34 -16 -3 -17 4 -12 70 8 102 25 236 31 253 5 12 -3 15 -32 15 l-39 0 -2 -118z"/>
                    <path d="M2920 2463 c-92 -14 -92 -14 -79 -29 15 -18 30 -415 19 -488 -4 -25 -5 -46 -2 -46 3 0 22 5 44 12 29 9 37 15 32 27 -4 9 -9 68 -12 131 -4 102 -3 113 11 102 8 -7 25 -38 38 -70 29 -72 76 -150 97 -161 10 -5 37 -12 62 -16 25 -4 66 -18 91 -32 26 -14 55 -23 65 -21 27 5 48 52 34 78 -14 25 -26 26 -33 0 -13 -49 -124 -26 -187 39 -19 20 -49 64 -67 96 -17 33 -42 71 -54 84 l-23 24 26 22 c67 57 64 230 -4 249 -13 3 -25 5 -28 5 -3 -1 -16 -3 -30 -6z m51 -65 c13 -51 6 -125 -16 -168 -29 -56 -40 -32 -43 93 l-3 117 25 0 c21 0 27 -7 37 -42z"/>
                    <path d="M2903 1869 c-107 -42 -120 -112 -36 -190 47 -44 92 -62 157 -61 98 0 169 39 207 113 29 59 14 100 -49 131 -67 33 -205 36 -279 7z"/>
                    <path d="M2330 1511 c-73 -23 -169 -100 -211 -167 -25 -41 -32 -42 -64 -9 -17 16 -25 35 -25 60 0 19 -4 35 -10 35 -13 0 -30 -34 -30 -62 0 -25 47 -78 67 -78 21 0 24 -19 12 -79 -23 -110 25 -189 119 -199 65 -6 110 10 166 59 43 38 45 39 36 14 -15 -38 -13 -45 14 -45 20 0 30 13 63 83 42 87 95 150 122 145 20 -4 16 -39 -11 -93 -46 -89 -41 -135 13 -135 25 0 41 10 71 42 30 33 38 37 38 22 0 -35 37 -64 81 -64 33 0 48 7 88 45 26 25 55 45 64 45 21 0 84 56 75 66 -4 3 -24 -8 -44 -25 -20 -18 -37 -31 -39 -29 -8 9 21 118 32 118 6 0 19 10 27 22 26 37 -14 79 -43 45 -8 -10 -7 -17 1 -25 17 -17 0 -28 -22 -14 -25 16 -102 8 -134 -14 -15 -9 -51 -54 -81 -100 -57 -88 -91 -117 -101 -89 -4 9 8 48 26 87 40 86 35 121 -17 126 -25 3 -41 -5 -74 -35 -42 -38 -42 -38 -26 -8 8 17 39 47 69 67 58 41 93 86 102 133 8 39 -5 58 -39 58 -59 0 -115 -74 -180 -236 -45 -112 -86 -171 -144 -205 -58 -34 -131 -36 -162 -5 -27 26 -36 101 -20 161 l12 42 48 0 c81 0 175 35 226 84 39 37 45 48 45 83 0 27 -6 46 -19 57 -22 20 -84 29 -121 17z m88 -33 c18 -18 15 -49 -8 -86 -24 -39 -120 -87 -192 -96 -59 -7 -60 1 -13 70 64 92 175 150 213 112z m232 -11 c0 -39 -89 -161 -105 -145 -8 8 33 99 61 135 29 39 44 42 44 10z m179 -220 c-14 -31 -4 -96 17 -104 20 -8 18 -20 -11 -48 -51 -52 -97 -15 -76 62 11 39 68 129 77 120 3 -2 0 -16 -7 -30z m71 -14 c-1 -49 -22 -90 -37 -71 -31 39 -20 108 17 108 17 0 20 -6 20 -37z"/>
                    <path d="M3459 1506 c-77 -27 -172 -109 -201 -171 -14 -32 -32 -32 -63 0 -17 16 -25 35 -25 60 0 38 -14 46 -30 16 -24 -47 -4 -86 65 -126 15 -9 16 -16 5 -71 -22 -114 23 -192 118 -202 67 -6 112 11 172 65 43 39 50 42 50 24 0 -12 10 -31 21 -42 17 -17 30 -20 66 -16 36 4 54 13 87 46 23 22 49 41 57 41 8 0 20 5 27 12 9 9 12 4 12 -24 0 -66 79 -100 149 -63 30 15 121 111 121 126 0 19 -18 7 -49 -32 -62 -77 -127 -99 -157 -54 -13 20 -14 30 -4 62 25 76 95 142 122 115 9 -9 6 -18 -11 -36 -25 -26 -15 -42 19 -31 21 7 34 41 28 72 -2 13 -14 19 -46 21 -55 4 -94 -20 -148 -90 -49 -64 -78 -76 -63 -26 24 85 0 121 -74 114 -60 -5 -99 -34 -136 -100 -76 -132 -214 -195 -277 -125 -24 27 -30 115 -11 162 15 34 19 37 58 37 132 0 272 88 272 171 0 65 -70 95 -154 65z m99 -28 c36 -36 -8 -108 -91 -147 -70 -32 -157 -48 -157 -28 0 25 71 117 112 145 60 41 113 53 136 30z m122 -227 c-16 -30 -12 -66 11 -94 16 -21 18 -31 9 -46 -14 -28 -46 -43 -72 -36 -18 6 -20 13 -16 59 4 51 47 136 68 136 7 0 7 -6 0 -19z m70 -15 c0 -19 -5 -47 -10 -61 -9 -23 -13 -25 -25 -15 -15 13 -20 65 -9 94 3 9 15 16 25 16 15 0 19 -7 19 -34z"/>
                    <path d="M2832 1418 c-20 -20 -14 -36 25 -63 51 -34 59 -32 32 13 -34 56 -43 64 -57 50z"/>
                    <path d="M4817 1363 c-4 -3 -7 -20 -7 -37 0 -16 -9 -40 -21 -52 l-21 -23 23 6 c50 12 91 72 68 99 -12 15 -31 18 -42 7z"/>
                    <path d="M1192 1348 c-21 -21 -14 -65 14 -87 15 -12 35 -21 46 -21 18 0 18 1 -2 22 -11 12 -20 27 -21 32 -1 6 -2 22 -2 35 -2 28 -17 37 -35 19z"/>
                    <path d="M4891 1282 c-6 -12 -28 -30 -48 -41 l-37 -18 34 -18 c19 -10 42 -27 52 -39 l18 -21 6 23 c4 12 20 30 37 39 l31 16 -25 19 c-13 11 -31 29 -40 40 l-17 21 -11 -21z"/>
                    <path d="M1130 1265 c0 -9 -16 -25 -35 -36 -19 -12 -35 -23 -35 -25 0 -2 13 -10 29 -19 16 -8 32 -24 36 -35 8 -26 19 -25 34 4 7 13 27 30 44 38 l32 16 -37 18 c-21 9 -40 26 -44 36 -7 22 -24 24 -24 3z"/>
                    <path d="M4704 1235 c-8 -20 4 -35 26 -35 25 0 35 17 20 35 -16 19 -39 19 -46 0z"/>
                    <path d="M1294 1226 c-9 -24 4 -48 23 -44 12 2 18 12 18 28 0 29 -32 41 -41 16z"/>
                    <path d="M4789 1174 c12 -15 21 -40 21 -56 0 -34 25 -47 48 -25 21 22 4 60 -40 87 -45 27 -53 25 -29 -6z"/>
                    <path d="M1235 1171 c-56 -23 -76 -102 -27 -109 19 -3 22 1 22 31 0 20 9 46 21 61 21 27 18 30 -16 17z"/>
                    <path d="M3586 995 c-17 -17 -12 -40 9 -49 14 -5 45 18 45 33 0 9 -22 31 -31 31 -4 0 -14 -7 -23 -15z"/>
                  </g>
                </svg>
              </div>
            </div>
          </div>

          <!-- MENU TABLE -->
          <table class="bill-table">
            <thead><tr><th class="w-10 text-center">#</th><th>Tên món</th><th class="text-center w-16">SL</th><th class="text-right w-28">Đơn giá</th><th class="text-right w-32">Thành tiền</th></tr></thead>
            <tbody>
              <tr v-for="(item, i) in formStore.filteredBillItems" :key="i">
                <td class="text-center font-bold text-slate-400">{{ i + 1 }}</td>
                <td>
                  <div class="font-bold text-[15px]">{{ item.name || 'Chưa đặt tên' }}</div>
                  <div v-if="item.note" class="text-[12px] text-red-600 font-semibold mt-1 whitespace-pre-line italic leading-snug">{{ item.note }}</div>
                </td>
                <td class="text-center font-black text-lg">{{ item.qty }}</td>
                <td class="text-right font-bold text-slate-600 text-[14px]">{{ formatVND(item.price) }}</td>
                <td class="text-right font-black text-blue-700 text-[15px]">{{ formatVND(item.price * item.qty) }}</td>
              </tr>
            </tbody>
          </table>

          <!-- TOTALS -->
          <div class="border-t-4 border-slate-900 pt-6 space-y-3 mb-10">
            <div class="flex justify-between items-center"><span class="text-lg font-bold text-slate-500 uppercase tracking-wider">Tạm tính</span><span class="text-xl font-black text-slate-700">{{ formatVND(formStore.calculatedTotals.sub) }}</span></div>
            <div v-if="formStore.taxEnabled" class="flex justify-between items-center"><span class="text-lg font-bold text-slate-500 uppercase tracking-wider">Thuế VAT</span><span class="text-xl font-black text-orange-600">{{ formatVND(formStore.calculatedTotals.tax) }}</span></div>
            <div class="flex justify-between items-center pt-4 border-t-2 border-dashed border-slate-200"><span class="text-2xl font-black text-slate-900 uppercase tracking-tighter">TỔNG CỘNG</span><span class="text-4xl font-black" :style="{ color: configStore.branding.color }">{{ formatVND(formStore.calculatedTotals.final) }}</span></div>
            <div class="flex justify-between items-center"><span class="text-lg font-bold uppercase tracking-wider" :class="formStore.deposit.isPaid ? 'text-emerald-600' : 'text-red-600'">{{ formStore.deposit.isPaid ? '✓ Đã đặt cọc' : '⏳ Yêu cầu đặt cọc' }}</span><span class="text-2xl font-black" :class="formStore.deposit.isPaid ? 'text-emerald-600' : 'text-red-600'">{{ formatVND(formStore.deposit.amount) }}</span></div>
          </div>

          <!-- QR BANK TRANSFER (Full Bill only) -->
          <div v-if="appStore.currentBank && !formStore.deposit.isPaid && formStore.billMode === 'full'" class="bg-slate-50 border border-slate-200 rounded-2xl p-6 mb-8 relative overflow-hidden">
            <div class="absolute inset-0 bg-gradient-to-br from-blue-50/30 to-transparent"></div>
            <div class="relative z-10">
              <h3 class="font-black text-sm text-slate-700 uppercase tracking-widest mb-4 text-center">THÔNG TIN CHUYỂN KHOẢN</h3>
              
              <!-- Compact: QR left + Info right -->
              <div class="flex gap-6 items-start">
                <!-- QR Code -->
                <div class="flex-shrink-0 bg-white p-3 rounded-2xl shadow-lg border border-slate-100">
                  <img :src="qrImageUrl" class="w-44 h-44 object-contain rounded-xl" alt="QR Code" crossorigin="anonymous" loading="lazy">
                </div>
                
                <!-- Bank Details -->
                <div class="flex-grow space-y-2 min-w-0">
                  <div class="flex justify-between items-center pb-2 border-b border-slate-200/60 gap-2">
                    <span class="text-[11px] font-bold text-slate-400 uppercase shrink-0">Ngân hàng</span>
                    <span class="font-black text-slate-800 text-base text-right truncate">{{ appStore.currentBank.name }}</span>
                  </div>
                  <div class="flex justify-between items-center pb-2 border-b border-slate-200/60 gap-2">
                    <span class="text-[11px] font-bold text-slate-400 uppercase shrink-0">STK</span>
                    <span class="font-black text-blue-700 text-lg font-mono tracking-wider text-right break-all">{{ appStore.currentBank.number }}</span>
                  </div>
                  <div class="flex justify-between items-center pb-2 border-b border-slate-200/60 gap-2">
                    <span class="text-[11px] font-bold text-slate-400 uppercase shrink-0">Chủ TK</span>
                    <span class="font-black text-slate-800 text-sm text-right">{{ appStore.currentBank.owner }}</span>
                  </div>
                  <div class="flex justify-between items-center pb-2 gap-2">
                    <span class="text-[11px] font-bold text-slate-400 uppercase shrink-0">Đặt cọc</span>
                    <span class="font-black text-red-600 text-xl text-right">{{ formatVND(formStore.deposit.amount) }}</span>
                  </div>
                  <!-- Transfer content -->
                  <div class="bg-yellow-50 border border-yellow-300 p-2.5 rounded-xl mt-1">
                    <span class="text-[10px] font-bold text-red-500 uppercase block mb-1"><i class="fa-solid fa-triangle-exclamation mr-1"></i> Nội dung CK</span>
                    <span class="font-black text-indigo-700 text-sm block tracking-wider uppercase break-words">{{ depositTransferContent }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- DEPOSIT VERIFICATION IMAGE (Full Bill only) -->
          <div v-if="formStore.deposit.image && formStore.billMode === 'full'" class="text-center mb-8">
            <h3 class="font-black text-xs text-slate-500 uppercase tracking-widest mb-3">BIÊN LAI CHUYỂN KHOẢN</h3>
            <img :src="formStore.deposit.image" class="max-h-48 mx-auto object-contain rounded-2xl shadow-lg border-2 border-white" crossorigin="anonymous" referrerpolicy="no-referrer" loading="lazy">
          </div>

          <!-- FOOTER -->
          <div class="border-t-2 border-slate-100 pt-6 text-center space-y-2">
            <p class="text-xs text-slate-400 font-bold">Nhân viên: <span class="text-slate-600 font-black">{{ formStore.staff.name }}</span> &bull; {{ formStore.staff.phone }}</p>
            <p class="text-[10px] text-slate-300 font-mono">King's Grill Manager AI v2.0 | {{ currentTimestamp }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
