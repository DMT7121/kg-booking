<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue';

const props = withDefaults(defineProps<{
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'primary';
  loading?: boolean;
}>(), {
  confirmText: 'XÁC NHẬN',
  cancelText: 'QUAY LẠI',
  type: 'danger',
  loading: false
});

const emit = defineEmits<{
  (e: 'confirm'): void;
  (e: 'cancel'): void;
}>();

const confirmBtnRef = ref<HTMLButtonElement | null>(null);
const cancelBtnRef = ref<HTMLButtonElement | null>(null);
let previouslyFocusedElement: HTMLElement | null = null;

const handleKeyDown = (e: KeyboardEvent) => {
  if (!props.isOpen) return;

  if (e.key === 'Escape') {
    e.preventDefault();
    emit('cancel');
    return;
  }

  // Focus trap
  if (e.key === 'Tab') {
    const focusable = [cancelBtnRef.value, confirmBtnRef.value].filter(Boolean) as HTMLElement[];
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
};

watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    previouslyFocusedElement = document.activeElement as HTMLElement;
    window.addEventListener('keydown', handleKeyDown);
    nextTick(() => {
      // Auto focus cancel button by default for safety in destructive actions
      if (cancelBtnRef.value) {
        cancelBtnRef.value.focus();
      }
    });
  } else {
    window.removeEventListener('keydown', handleKeyDown);
    if (previouslyFocusedElement) {
      previouslyFocusedElement.focus();
    }
  }
});

onMounted(() => {
  if (props.isOpen) {
    window.addEventListener('keydown', handleKeyDown);
  }
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
});
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isOpen"
        class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="'dialog-title-' + title"
        :aria-describedby="'dialog-desc-' + title"
        @click.self="emit('cancel')"
      >
        <div
          class="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200/80 dark:border-slate-800 p-5 space-y-4 transform transition-all"
        >
          <!-- Header with Icon & Title -->
          <div class="flex items-start gap-3">
            <div
              class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              :class="[
                type === 'danger' ? 'bg-rose-100 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400' :
                type === 'warning' ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400' :
                'bg-blue-100 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400'
              ]"
            >
              <svg v-if="type === 'danger'" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              <svg v-else-if="type === 'warning'" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <h3 :id="'dialog-title-' + title" class="text-base font-bold text-slate-900 dark:text-white leading-tight">
                {{ title }}
              </h3>
              <p :id="'dialog-desc-' + title" class="text-sm text-slate-600 dark:text-slate-300 mt-1 leading-normal">
                {{ message }}
              </p>
            </div>
          </div>

          <!-- Actions -->
          <div class="grid grid-cols-2 gap-2.5 pt-2">
            <button
              ref="cancelBtnRef"
              type="button"
              class="touch-target-48 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 font-semibold text-sm transition-colors active:scale-98"
              @click="emit('cancel')"
            >
              {{ cancelText }}
            </button>
            <button
              ref="confirmBtnRef"
              type="button"
              :disabled="loading"
              class="touch-target-48 px-4 py-3 rounded-xl font-bold text-sm text-white transition-all shadow-md active:scale-98 flex items-center justify-center gap-2"
              :class="[
                type === 'danger' ? 'bg-rose-600 hover:bg-rose-700 active:bg-rose-800 dark:bg-rose-600 shadow-rose-500/20' :
                type === 'warning' ? 'bg-amber-600 hover:bg-amber-700 active:bg-amber-800 dark:bg-amber-600 shadow-amber-500/20' :
                'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 dark:bg-blue-600 shadow-blue-500/20',
                loading ? 'opacity-70 cursor-not-allowed' : ''
              ]"
              @click="emit('confirm')"
            >
              <svg v-if="loading" class="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>{{ confirmText }}</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
