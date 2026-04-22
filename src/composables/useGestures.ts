import { ref, onMounted, onUnmounted, type Ref } from 'vue'

/**
 * Mobile Gestures Composable — Feature #10
 * - Swipe reveal actions on list items
 * - Pull-to-refresh
 * - Haptic feedback
 * - Tab swipe navigation
 * - Long-press detection
 */

// ═══════════════════════════════════════════════════════
//  HAPTIC FEEDBACK
// ═══════════════════════════════════════════════════════
export function haptic(intensity: 'light' | 'medium' | 'heavy' = 'light') {
  if (!navigator.vibrate) return
  const patterns: Record<string, number | number[]> = {
    light: 10,
    medium: 25,
    heavy: [30, 10, 30]
  }
  try { navigator.vibrate(patterns[intensity]) } catch { /* ignore */ }
}

// ═══════════════════════════════════════════════════════
//  SWIPE REVEAL (for history list items)
// ═══════════════════════════════════════════════════════
export interface SwipeState {
  activeId: string | null
  offsetX: number
}

export function useSwipeReveal() {
  const swipeState = ref<SwipeState>({ activeId: null, offsetX: 0 })
  
  let startX = 0
  let startY = 0
  let currentX = 0
  let isDragging = false
  let isHorizontal: boolean | null = null
  const THRESHOLD = 60 // px to fully reveal actions
  const MAX_SWIPE = 160

  function onTouchStart(e: TouchEvent, itemId: string) {
    // Close previous if different item
    if (swipeState.value.activeId && swipeState.value.activeId !== itemId) {
      swipeState.value = { activeId: null, offsetX: 0 }
    }
    startX = e.touches[0].clientX
    startY = e.touches[0].clientY
    currentX = startX
    isDragging = true
    isHorizontal = null
  }

  function onTouchMove(e: TouchEvent, itemId: string) {
    if (!isDragging) return
    const touchX = e.touches[0].clientX
    const touchY = e.touches[0].clientY
    
    // Determine swipe direction on first move
    if (isHorizontal === null) {
      const dx = Math.abs(touchX - startX)
      const dy = Math.abs(touchY - startY)
      if (dx < 5 && dy < 5) return
      isHorizontal = dx > dy
      if (!isHorizontal) { isDragging = false; return }
    }
    
    if (!isHorizontal) return
    e.preventDefault()
    
    currentX = touchX
    let delta = startX - currentX
    
    // If already open, add accumulated offset
    if (swipeState.value.activeId === itemId && swipeState.value.offsetX < 0) {
      delta += Math.abs(swipeState.value.offsetX)
    }
    
    // Clamp: only swipe left (negative offset), with resistance past max
    const raw = -Math.max(0, delta)
    const clamped = raw < -MAX_SWIPE ? -MAX_SWIPE - (raw + MAX_SWIPE) * 0.3 : raw
    
    swipeState.value = { activeId: itemId, offsetX: clamped }
  }

  function onTouchEnd(_e: TouchEvent, itemId: string) {
    if (!isDragging || !isHorizontal) { isDragging = false; return }
    isDragging = false
    
    const delta = startX - currentX
    
    if (delta > THRESHOLD) {
      // Snap open
      swipeState.value = { activeId: itemId, offsetX: -MAX_SWIPE }
      haptic('light')
    } else {
      // Snap closed
      swipeState.value = { activeId: null, offsetX: 0 }
    }
  }

  function closeSwipe() {
    swipeState.value = { activeId: null, offsetX: 0 }
  }

  function getSwipeStyle(itemId: string): Record<string, string> {
    if (swipeState.value.activeId !== itemId) return {}
    return {
      transform: `translateX(${swipeState.value.offsetX}px)`,
      transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
    }
  }

  function isRevealed(itemId: string): boolean {
    return swipeState.value.activeId === itemId && swipeState.value.offsetX <= -THRESHOLD
  }

  return {
    swipeState, onTouchStart, onTouchMove, onTouchEnd,
    closeSwipe, getSwipeStyle, isRevealed
  }
}

// ═══════════════════════════════════════════════════════
//  PULL TO REFRESH
// ═══════════════════════════════════════════════════════
export function usePullToRefresh(onRefresh: () => Promise<void>) {
  const pullDistance = ref(0)
  const isPulling = ref(false)
  const isRefreshing = ref(false)
  
  const PULL_THRESHOLD = 80
  const MAX_PULL = 120
  let startY = 0
  let scrollEl: HTMLElement | null = null

  function onPullStart(e: TouchEvent, el: HTMLElement) {
    scrollEl = el
    if (el.scrollTop > 0 || isRefreshing.value) return
    startY = e.touches[0].clientY
    isPulling.value = true
  }

  function onPullMove(e: TouchEvent) {
    if (!isPulling.value || isRefreshing.value) return
    if (scrollEl && scrollEl.scrollTop > 0) {
      isPulling.value = false
      pullDistance.value = 0
      return
    }
    
    const delta = e.touches[0].clientY - startY
    if (delta < 0) { pullDistance.value = 0; return }
    
    // Resistance curve
    pullDistance.value = Math.min(delta * 0.5, MAX_PULL)
    
    if (delta > 10) e.preventDefault()
  }

  async function onPullEnd() {
    if (!isPulling.value) return
    isPulling.value = false
    
    if (pullDistance.value >= PULL_THRESHOLD && !isRefreshing.value) {
      isRefreshing.value = true
      haptic('medium')
      pullDistance.value = 50 // hold at indicator position
      try {
        await onRefresh()
      } finally {
        isRefreshing.value = false
        pullDistance.value = 0
      }
    } else {
      pullDistance.value = 0
    }
  }

  return {
    pullDistance, isPulling, isRefreshing,
    onPullStart, onPullMove, onPullEnd
  }
}

// ═══════════════════════════════════════════════════════
//  TAB SWIPE NAVIGATION
// ═══════════════════════════════════════════════════════
export function useTabSwipe(
  currentTab: Ref<string>,
  tabs: string[],
  onSwitch: (tab: string) => void
) {
  let startX = 0
  let startY = 0
  let isHorizontal: boolean | null = null

  function onSwipeStart(e: TouchEvent) {
    startX = e.touches[0].clientX
    startY = e.touches[0].clientY
    isHorizontal = null
  }

  function onSwipeEnd(e: TouchEvent) {
    const deltaX = startX - e.changedTouches[0].clientX
    const deltaY = Math.abs(startY - e.changedTouches[0].clientY)
    
    // Must be strongly horizontal and significant distance
    if (Math.abs(deltaX) < 80 || deltaY > Math.abs(deltaX) * 0.5) return
    
    const idx = tabs.indexOf(currentTab.value)
    if (deltaX > 0 && idx < tabs.length - 1) {
      // Swipe left → next tab
      onSwitch(tabs[idx + 1])
      haptic('light')
    } else if (deltaX < 0 && idx > 0) {
      // Swipe right → prev tab
      onSwitch(tabs[idx - 1])
      haptic('light')
    }
  }

  return { onSwipeStart, onSwipeEnd }
}

// ═══════════════════════════════════════════════════════
//  LONG PRESS
// ═══════════════════════════════════════════════════════
export function useLongPress(callback: (e: TouchEvent) => void, duration = 500) {
  let timer: ReturnType<typeof setTimeout> | null = null
  let moved = false

  function onStart(e: TouchEvent) {
    moved = false
    timer = setTimeout(() => {
      if (!moved) {
        haptic('heavy')
        callback(e)
      }
    }, duration)
  }

  function onMove() { moved = true; if (timer) { clearTimeout(timer); timer = null } }
  function onEnd() { if (timer) { clearTimeout(timer); timer = null } }

  return { onStart, onMove, onEnd }
}
