<script setup lang="ts">
import { ref, computed } from 'vue'
import { haptic } from '@/composables/useGestures'

const props = defineProps<{
  orderId: string
  customerName: string
}>()

const emit = defineEmits(['close'])

const prizes = [
  { label: 'Tặng 1 dĩa Bò Mỹ', color: '#ef4444', text: '#fff' },
  { label: 'Chúc may mắn lần sau', color: '#f8fafc', text: '#64748b' },
  { label: 'Giảm 10% Tổng Bill', color: '#f59e0b', text: '#fff' },
  { label: 'Tặng 1 Tháp Bia', color: '#3b82f6', text: '#fff' },
  { label: 'Chúc may mắn lần sau', color: '#f8fafc', text: '#64748b' },
  { label: 'Free Tráng Miệng', color: '#10b981', text: '#fff' }
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

function spin() {
  if (isSpinning.value || hasSpun.value) return
  haptic('heavy')
  isSpinning.value = true

  // Tính toán góc quay (quay thêm ít nhất 5-8 vòng)
  const spins = 5 + Math.floor(Math.random() * 5)
  // Chọn ngẫu nhiên 1 phần thưởng (Ưu tiên giảm tỷ lệ trúng giải lớn nếu cần, tạm thời random đều)
  const prizeIndex = Math.floor(Math.random() * prizes.length)
  
  // Tính góc dừng. Mỗi cung là 360 / prizes.length = 60 độ.
  // Nếu muốn mũi tên chỉ vào giữa cung prizeIndex, góc của bánh xe phải là:
  // 360 - (prizeIndex * 60) - 30 (lùi lại 1 nửa cung để kim chỉ đúng giữa)
  const segmentAngle = 360 / prizes.length
  const stopAngle = 360 - (prizeIndex * segmentAngle) - (segmentAngle / 2)
  
  // Tổng góc quay = quay vòng + góc dừng
  const totalRotation = currentRotation.value + (spins * 360) + stopAngle - (currentRotation.value % 360)

  currentRotation.value = totalRotation

  setTimeout(() => {
    isSpinning.value = false
    hasSpun.value = true
    prizeResult.value = prizes[prizeIndex].label
    
    // Lưu vào local
    localStorage.setItem(`kg_spin_${props.orderId}`, 'true')
    localStorage.setItem(`kg_prize_${props.orderId}`, prizeResult.value)
    localStorage.setItem(`kg_rot_${props.orderId}`, String(totalRotation))
    
    haptic('heavy')
    // Nếu trúng giải, bắn pháo hoa css
    if (!prizeResult.value.includes('may mắn')) {
      triggerConfetti()
    }
  }, 4000)
}

function triggerConfetti() {
  // Simple CSS confetti logic can be added here or just show a nice popup
}

function close() {
  emit('close')
}
</script>

<template>
  <div class="fixed inset-0 z-[20000] flex justify-center items-center p-4 bg-blue-950/90 backdrop-blur-sm">
    <div class="bg-white w-full max-w-sm rounded-3xl p-6 relative overflow-hidden flex flex-col items-center text-center shadow-2xl border-4 border-yellow-400">
      
      <!-- Close Btn -->
      <button @click="close" class="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-slate-100 text-slate-500 rounded-full active:scale-95">
        <i class="fa-solid fa-xmark"></i>
      </button>

      <div class="mb-6">
        <h2 class="text-2xl font-black text-rose-600 uppercase tracking-tighter mb-1" style="font-family: 'Be Vietnam Pro', sans-serif;">Vòng Quay May Mắn</h2>
        <p class="text-xs font-bold text-slate-500">Cảm ơn {{ customerName || 'bạn' }} đã đặt bàn. Quay ngay để nhận quà!</p>
      </div>

      <!-- Wheel Container -->
      <div class="relative w-64 h-64 mb-8 shrink-0">
        <!-- Pointer -->
        <div class="absolute -top-4 left-1/2 -translate-x-1/2 z-20 text-4xl text-rose-600 drop-shadow-md">
          <i class="fa-solid fa-location-pin"></i>
        </div>
        
        <!-- Wheel -->
        <div class="w-full h-full rounded-full border-4 border-white shadow-xl relative overflow-hidden bg-slate-100" :style="wheelStyle">
          <!-- Slices -->
          <div v-for="(prize, idx) in prizes" :key="idx"
               class="absolute top-0 right-0 w-1/2 h-1/2 origin-bottom-left"
               :style="{
                 backgroundColor: prize.color,
                 transform: `rotate(${idx * 60}deg) skewY(30deg)`
               }">
          </div>
          <!-- Text Labels -->
          <div v-for="(prize, idx) in prizes" :key="'txt'+idx"
               class="absolute inset-0 flex justify-center items-start origin-center pointer-events-none"
               :style="{ transform: `rotate(${idx * 60 + 30}deg)` }">
            <div class="pt-4 text-[10px] font-black uppercase w-20 text-center leading-tight drop-shadow-sm"
                 :style="{ color: prize.text, transform: 'rotate(-90deg)' }">
              {{ prize.label }}
            </div>
          </div>
          <!-- Center Dot -->
          <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 bg-white rounded-full shadow-inner z-10 flex items-center justify-center border-4 border-rose-100">
            <i class="fa-solid fa-star text-yellow-400 text-lg"></i>
          </div>
        </div>
      </div>

      <!-- Result & Action -->
      <div class="w-full">
        <div v-if="prizeResult" class="p-4 rounded-2xl mb-4 border-2 animate-bounce" :class="prizeResult.includes('may mắn') ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-yellow-50 border-yellow-400 text-rose-600'">
          <div class="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Kết quả</div>
          <div class="text-lg font-black">{{ prizeResult }}</div>
          <div v-if="!prizeResult.includes('may mắn')" class="text-xs font-bold mt-2 opacity-80 text-rose-500">
            Vui lòng đưa màn hình này cho nhân viên để nhận thưởng!
          </div>
        </div>

        <button v-if="!hasSpun" @click="spin" :disabled="isSpinning" class="w-full py-4 bg-gradient-to-r from-rose-500 to-pink-500 text-white font-black text-lg uppercase tracking-widest rounded-2xl shadow-lg shadow-rose-500/30 active:scale-95 transition-all">
          {{ isSpinning ? 'Đang quay...' : 'Quay Ngay!' }}
        </button>
        <button v-else @click="close" class="w-full py-4 bg-slate-100 text-slate-600 font-black text-sm uppercase tracking-widest rounded-2xl active:scale-95 transition-all">
          Đóng
        </button>
      </div>

    </div>
  </div>
</template>
