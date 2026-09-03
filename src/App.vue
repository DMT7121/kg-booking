<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { isIOS } from '@/utils'
import { useUIStore } from '@/stores/useUIStore'
import ErrorBoundary from '@/components/core/ErrorBoundary.vue'
import AppLayout from '@/components/core/AppLayout.vue'
import ToastSystem from '@/components/modals/ToastSystem.vue'
import PublicBill from '@/components/core/PublicBill.vue'
import CustomerBookingPage from '@/components/customer/CustomerBookingPage.vue'

const ui = useUIStore()

// Hash-based routing for standalone views
const isPublicBill = ref(false)
const isCustomerBooking = ref(false)

function checkRoute() {
  const hash = window.location.hash || ''
  const search = window.location.search || ''

  isPublicBill.value = hash.startsWith('#/bill/')

  const isCustomerPath =
    hash.startsWith('#/dat-ban') ||
    hash.startsWith('#/booking') ||
    hash.startsWith('#/online') ||
    search.includes('mode=customer')

  // CLIENT ISOLATION & SESSION GUARD:
  // Khóa khách ở chế độ đặt bàn, ngăn chặn vô tình rơi về webapp nhân viên
  let isGuestSession = false
  try {
    isGuestSession = sessionStorage.getItem('kg_guest_mode') === '1'
  } catch {}

  if (isCustomerPath) {
    try {
      sessionStorage.setItem('kg_guest_mode', '1')
    } catch {}
    isCustomerBooking.value = true
  } else if (isGuestSession && !isPublicBill.value) {
    window.location.hash = '#/dat-ban'
    isCustomerBooking.value = true
  } else {
    isCustomerBooking.value = false
  }
}

// Add iOS class
if (isIOS) document.documentElement.classList.add('is-ios')

onMounted(() => {
  checkRoute()
  window.addEventListener('hashchange', checkRoute)
  
  if (ui.isDarkMode) {
    document.documentElement.classList.add('dark-theme', 'dark')
  }

  const setAppHeight = () => {
    document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`)
  }
  window.addEventListener('resize', setAppHeight)
  setAppHeight()
})

onUnmounted(() => {
  window.removeEventListener('hashchange', checkRoute)
})
</script>

<template>
  <!-- CUSTOMER ONLINE BOOKING MODULE (Shareable link / QR Code / Mobile) -->
  <CustomerBookingPage v-if="isCustomerBooking" />

  <!-- PUBLIC BILL VIEW (shareable link) -->
  <PublicBill v-else-if="isPublicBill" />

  <!-- NORMAL APP -->
  <ErrorBoundary v-else>
    <AppLayout />
    <ToastSystem />
  </ErrorBoundary>
</template>


