<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { isIOS } from '@/utils'
import ErrorBoundary from '@/components/core/ErrorBoundary.vue'
import AppLayout from '@/components/core/AppLayout.vue'
import ToastSystem from '@/components/modals/ToastSystem.vue'
import PublicBill from '@/components/core/PublicBill.vue'

// Hash-based routing for public bill view
const isPublicBill = ref(false)

function checkRoute() {
  isPublicBill.value = window.location.hash.startsWith('#/bill/')
}

// Add iOS class
if (isIOS) document.documentElement.classList.add('is-ios')

onMounted(() => {
  checkRoute()
  window.addEventListener('hashchange', checkRoute)

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
  <!-- PUBLIC BILL VIEW (shareable link) -->
  <PublicBill v-if="isPublicBill" />

  <!-- NORMAL APP -->
  <ErrorBoundary v-else>
    <AppLayout />
    <ToastSystem />
  </ErrorBoundary>
</template>

