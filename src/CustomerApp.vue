<script setup lang="ts">
import { onMounted } from 'vue'
import { isIOS } from '@/utils'
import CustomerBookingPage from '@/components/customer/CustomerBookingPage.vue'

// Apply iOS specific classes
if (isIOS && typeof document !== 'undefined') {
  document.documentElement.classList.add('is-ios')
}

onMounted(() => {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.add('customer-booking-mode')
    document.body.classList.add('customer-booking-mode')
    document.body.classList.remove('overflow-hidden')

    const setAppHeight = () => {
      document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`)
    }
    window.addEventListener('resize', setAppHeight)
    setAppHeight()
  }
})
</script>

<template>
  <main class="min-h-screen bg-slate-950 text-slate-100 selection:bg-amber-500 selection:text-slate-950">
    <CustomerBookingPage />
  </main>
</template>

<style scoped>
main {
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
}
</style>
