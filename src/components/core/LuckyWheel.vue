<script setup lang="ts">
import { ref, computed } from 'vue'
import { haptic } from '@/composables/useGestures'

const props = defineProps<{
  orderId: string
  customerName: string
}>()

const emit = defineEmits(['close'])

const prizes = [
  { label: '1 Dĩa Bò Mỹ', color: '#ef4444', text: '#ffffff' },
  { label: 'May mắn lần sau', color: '#f8fafc', text: '#64748b' },
  { label: 'Giảm 10% Bill', color: '#f59e0b', text: '#ffffff' },
  { label: '1 Tháp Bia', color: '#3b82f6', text: '#ffffff' },
  { label: 'May mắn lần sau', color: '#f8fafc', text: '#64748b' },
  { label: 'Free Tráng Miệng', color: '#10b981', text: '#ffffff' }
]

const isSpinning = ref(false)
const hasSpun = ref(localStorage.getItem(`kg_spin_${props.orderId}`) === 'true')
const prizeResult = ref(localStorage.getItem(`kg_prize_${props.orderId}`) || '')
const currentRotation = ref(Number(localStorage.getItem(`kg_rot_${props.orderId}`)) || 0)

const wheelStyle = computed(() => {
  return {
    transform: `rotate(${currentRotation.value}deg)`,
    transition: isSpinning.value ? 'transform 4s cubic-bezier(0.1, 0.7, 0.1, 1)' : 'none'
  }
})

// Calculate SVG paths for 6 slices (60 degrees each)
function getSlicePath(index: number, total: number) {
  const radius = 50;
  const startAngle = (index * 360) / total - 90;
  const endAngle = ((index + 1) * 360) / total - 90;

  const startX = 50 + radius * Math.cos((Math.PI * startAngle) / 180);
  const startY = 50 + radius * Math.sin((Math.PI * startAngle) / 180);
  const endX = 50 + radius * Math.cos((Math.PI * endAngle) / 180);
  const endY = 50 + radius * Math.sin((Math.PI * endAngle) / 180);

  // M 50 50 L startX startY A 50 50 0 0 1 endX endY Z
  return `M 50 50 L ${startX} ${startY} A 50 50 0 0 1 ${endX} ${endY} Z`;
}

// Calculate text position and rotation
function getTextTransform(index: number, total: number) {
  const angle = (index + 0.5) * (360 / total) - 90;
  // Position text at ~65% of radius
  const radius = 32; 
  const x = 50 + radius * Math.cos((Math.PI * angle) / 180);
  const y = 50 + radius * Math.sin((Math.PI * angle) / 180);
  return `translate(${x}, ${y}) rotate(${angle + 90})`;
}

function spin() {
  if (isSpinning.value || hasSpun.value) return
  haptic('heavy')
  isSpinning.value = true

  const spins = 5 + Math.floor(Math.random() * 5)
  const prizeIndex = Math.floor(Math.random() * prizes.length)
  
  const segmentAngle = 360 / prizes.length
  // To point to the center of the segment, stop angle needs to align the segment's center (prizeIndex * segmentAngle + segmentAngle / 2) to the top (-90 deg, or 270 deg)
  const stopAngle = 360 - (prizeIndex * segmentAngle) - (segmentAngle / 2)
  
  const totalRotation = currentRotation.value + (spins * 360) + stopAngle - (currentRotation.value % 360)

  currentRotation.value = totalRotation

  setTimeout(() => {
    isSpinning.value = false
    hasSpun.value = true
    prizeResult.value = prizes[prizeIndex].label
    
    localStorage.setItem(`kg_spin_${props.orderId}`, 'true')
    localStorage.setItem(`kg_prize_${props.orderId}`, prizeResult.value)
    localStorage.setItem(`kg_rot_${props.orderId}`, String(totalRotation))
    
    haptic('heavy')
  }, 4000)
}

function close() {
  emit('close')
}
</script>

<template>
  <div class="fixed inset-0 z-[20000] flex justify-center items-center p-4 bg-slate-900/90 backdrop-blur-md">
    <div class="bg-white w-full max-w-[340px] rounded-[32px] p-6 relative overflow-hidden flex flex-col items-center text-center shadow-2xl border-[6px] border-yellow-400">
      
      <!-- Close Btn -->
      <button @click="close" class="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-full transition-colors active:scale-95 z-50">
        <i class="fa-solid fa-xmark text-lg"></i>
      </button>

      <div class="mb-4 mt-2">
        <h2 class="text-[22px] font-black text-rose-600 uppercase tracking-tighter mb-1" style="font-family: 'Be Vietnam Pro', sans-serif;">Vòng Quay May Mắn</h2>
        <p class="text-[11px] font-bold text-slate-500 leading-tight">Cảm ơn {{ customerName || 'bạn' }} đã đặt bàn.<br>Quay ngay để nhận quà!</p>
      </div>

      <!-- Wheel Container -->
      <div class="relative w-56 h-56 mb-6 shrink-0 drop-shadow-xl">
        <!-- Pointer -->
        <div class="absolute -top-3 left-1/2 -translate-x-1/2 z-20 text-4xl text-rose-600 drop-shadow-md">
          <i class="fa-solid fa-location-pin"></i>
        </div>
        
        <!-- Wheel SVG -->
        <div class="w-full h-full rounded-full border-4 border-white overflow-hidden bg-slate-100" :style="wheelStyle">
          <svg viewBox="0 0 100 100" class="w-full h-full transform -rotate-90">
            <g v-for="(prize, idx) in prizes" :key="'slice'+idx">
              <path :d="getSlicePath(idx, prizes.length)" :fill="prize.color" stroke="white" stroke-width="0.5" />
              <!-- Text -->
              <text :transform="getTextTransform(idx, prizes.length)"
                    text-anchor="middle" dominant-baseline="middle"
                    :fill="prize.text"
                    font-size="4.5" font-weight="900" font-family="'Be Vietnam Pro', sans-serif" letter-spacing="0.2" class="uppercase">
                <tspan x="0" dy="-2" v-if="prize.label.split(' ').length > 2">{{ prize.label.split(' ').slice(0, 2).join(' ') }}</tspan>
                <tspan x="0" dy="5" v-if="prize.label.split(' ').length > 2">{{ prize.label.split(' ').slice(2).join(' ') }}</tspan>
                <tspan x="0" dy="0" v-else>{{ prize.label }}</tspan>
              </text>
            </g>
          </svg>
          <!-- Center Dot -->
          <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-white rounded-full shadow-inner z-10 flex items-center justify-center border-[3px] border-rose-100">
            <i class="fa-solid fa-star text-yellow-400 text-base"></i>
          </div>
        </div>
      </div>

      <!-- Result & Action -->
      <div class="w-full space-y-3">
        <div v-if="prizeResult" class="p-3 rounded-2xl border-2" :class="prizeResult.includes('lần sau') ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-rose-50 border-rose-200 text-rose-600 animate-bounce'">
          <div class="text-[9px] font-black uppercase tracking-widest opacity-60 mb-0.5">KẾT QUẢ</div>
          <div class="text-base font-black">{{ prizeResult }}</div>
        </div>

        <button v-if="!hasSpun" @click="spin" :disabled="isSpinning" class="w-full py-3.5 bg-gradient-to-r from-rose-500 to-pink-500 text-white font-black text-sm uppercase tracking-widest rounded-2xl shadow-lg shadow-rose-500/30 active:scale-95 transition-all">
          {{ isSpinning ? 'ĐANG QUAY...' : 'QUAY NGAY!' }}
        </button>
        <button v-else @click="close" class="w-full py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-sm uppercase tracking-widest rounded-2xl active:scale-95 transition-all">
          ĐÓNG
        </button>
      </div>

    </div>
  </div>
</template>
