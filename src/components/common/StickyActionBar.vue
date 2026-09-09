<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

const props = withDefaults(defineProps<{
  show?: boolean;
  withBottomNav?: boolean;
  elevation?: boolean;
  stickyTopBorder?: boolean;
}>(), {
  show: true,
  withBottomNav: false,
  elevation: true,
  stickyTopBorder: true
});

const isKeyboardOpen = ref(false);

const handleViewportResize = () => {
  if (window.visualViewport) {
    // If visual viewport height is substantially smaller than window innerHeight, virtual keyboard is active
    const heightDiff = window.innerHeight - window.visualViewport.height;
    isKeyboardOpen.value = heightDiff > 150;
  }
};

onMounted(() => {
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', handleViewportResize);
  }
});

onUnmounted(() => {
  if (window.visualViewport) {
    window.visualViewport.removeEventListener('resize', handleViewportResize);
  }
});
</script>

<template>
  <div
    v-if="show"
    class="sticky-action-bar-wrapper transition-all duration-200 z-30"
    :class="[
      isKeyboardOpen ? 'fixed bottom-0 left-0 right-0 p-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md' : 'fixed left-0 right-0 p-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md',
      withBottomNav && !isKeyboardOpen ? 'bottom-[64px] sm:bottom-0' : 'bottom-0',
      stickyTopBorder ? 'border-t border-slate-200/80 dark:border-slate-800/80' : '',
      elevation ? 'shadow-[0_-4px_16px_rgba(0,0,0,0.06)] dark:shadow-[0_-4px_16px_rgba(0,0,0,0.3)]' : ''
    ]"
    style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom));"
  >
    <div class="max-w-md mx-auto w-full flex items-center justify-between gap-3">
      <slot name="prefix" />
      <div class="flex-1 min-w-0">
        <slot />
      </div>
      <slot name="suffix" />
    </div>
  </div>
</template>

<style scoped>
.sticky-action-bar-wrapper {
  touch-action: manipulation;
}
</style>
