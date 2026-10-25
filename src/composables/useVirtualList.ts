import {
  ref,
  computed,
  watch,
  onMounted,
  onUnmounted,
  onActivated,
  nextTick,
  type Ref,
  type ComputedRef,
  type ComponentPublicInstance
} from 'vue'

export interface UseVirtualListOptions<T> {
  /** Reactive array of all items to virtualize */
  items: Ref<readonly T[]> | ComputedRef<readonly T[]>
  /** Estimated height in px for unmeasured items */
  estimateSize: number | ((index: number, item: T) => number)
  /** Number of extra items rendered above and below viewport (default: 6) */
  overscan?: number
  /** Stable unique key extractor per item (enables exact height caching across filter/scroll) */
  getKey?: (item: T, index: number) => string | number
  /** Vertical gap in px between items (default: 0) */
  gap?: number
  /** Fallback viewport height in px before DOM mount or in headless environments (default: 640) */
  initialViewportHeight?: number
}

export interface VirtualItem<T> {
  item: T
  index: number
  key: string | number
  start: number
  size: number
}

/**
 * Zero-dependency, dynamic-height-aware Virtual Scrolling engine for Vue 3.
 *
 * Uses normal-flow visible windowing (`topSpacer` + `bottomSpacer`) combined with
 * shared `ResizeObserver` height caching and binary-search prefix sums (`O(log N)`),
 * guaranteeing zero card overlap on mobile/desktop text wrapping or click-to-expand,
 * and zero scroll jumps when scrolling back up.
 */
export function useVirtualList<T>(options: UseVirtualListOptions<T>) {
  const {
    items,
    estimateSize,
    overscan = 6,
    getKey = (_item: T, index: number) => index,
    gap = 0,
    initialViewportHeight = 640
  } = options

  const containerRef = ref<HTMLElement | null>(null)
  const scrollTop = ref(0)
  const viewportHeight = ref(initialViewportHeight)
  const measureVersion = ref(0)

  // Cached exact heights by item key
  const measuredSizes = new Map<string | number, number>()
  const mountedElements = new Map<string | number, HTMLElement>()
  const elementToKey = new WeakMap<Element, string | number>()
  const keyToIndex = new Map<string | number, number>()

  let itemResizeObserver: ResizeObserver | null = null
  let containerResizeObserver: ResizeObserver | null = null
  let rafId: number | null = null

  function getEstimatedSize(index: number, item: T): number {
    return typeof estimateSize === 'function' ? estimateSize(index, item) : estimateSize
  }

  function resolveSize(index: number, item: T, key: string | number): number {
    const measured = measuredSizes.get(key)
    return measured !== undefined && measured > 0 ? measured : getEstimatedSize(index, item)
  }

  function scheduleMeasureBump() {
    if (rafId !== null) return
    if (typeof requestAnimationFrame === 'function') {
      rafId = requestAnimationFrame(() => {
        rafId = null
        measureVersion.value++
      })
    } else {
      measureVersion.value++
    }
  }

  // Prefix-sum offsets array: offsets[i] = start Y of item i; offsets[N] = total content height
  const layoutMetrics = computed(() => {
    // Subscribe to dynamic measurement updates
    void measureVersion.value
    const list = items.value
    const count = list.length
    const offsets = new Float64Array(count + 1)
    const keys: Array<string | number> = new Array(count)
    keyToIndex.clear()

    let runningOffset = 0
    for (let i = 0; i < count; i++) {
      const item = list[i]
      const key = getKey(item, i)
      keys[i] = key
      keyToIndex.set(key, i)
      offsets[i] = runningOffset
      const size = resolveSize(i, item, key)
      runningOffset += size + (i < count - 1 ? gap : 0)
    }
    offsets[count] = runningOffset

    return { offsets, keys, count, totalSize: runningOffset }
  })

  // Binary search: find first index whose bottom edge >= targetOffset
  function findStartIndex(offsets: Float64Array, count: number, targetOffset: number): number {
    if (count <= 0 || targetOffset <= 0) return 0
    let low = 0
    let high = count - 1
    while (low < high) {
      const mid = (low + high) >>> 1
      const itemEnd = offsets[mid + 1]
      if (itemEnd <= targetOffset) {
        low = mid + 1
      } else {
        high = mid
      }
    }
    return low
  }

  const visibleRange = computed(() => {
    const { offsets, count } = layoutMetrics.value
    if (count === 0) {
      return { startIndex: 0, endIndex: -1 }
    }

    const currentScrollTop = Math.max(0, scrollTop.value)
    const currentViewport = viewportHeight.value > 0 ? viewportHeight.value : initialViewportHeight

    const rawStart = findStartIndex(offsets, count, currentScrollTop)
    const rawEnd = findStartIndex(offsets, count, currentScrollTop + currentViewport)

    const startIndex = Math.max(0, rawStart - overscan)
    const endIndex = Math.min(count - 1, rawEnd + overscan)

    return { startIndex, endIndex }
  })

  const virtualItems = computed<VirtualItem<T>[]>(() => {
    const list = items.value
    const { offsets, keys, count } = layoutMetrics.value
    const { startIndex, endIndex } = visibleRange.value
    if (count === 0 || endIndex < startIndex) return []

    const result: VirtualItem<T>[] = new Array(endIndex - startIndex + 1)
    for (let i = startIndex; i <= endIndex; i++) {
      const item = list[i]
      const key = keys[i]
      const start = offsets[i]
      const nextStart = offsets[i + 1]
      const size = i < count - 1 ? Math.max(0, nextStart - start - gap) : Math.max(0, nextStart - start)
      result[i - startIndex] = {
        item,
        index: i,
        key,
        start,
        size
      }
    }
    return result
  })

  const totalSize = computed(() => layoutMetrics.value.totalSize)

  const topSpacer = computed(() => {
    const { offsets, count } = layoutMetrics.value
    const { startIndex } = visibleRange.value
    if (count === 0 || startIndex <= 0) return 0
    return offsets[startIndex]
  })

  const bottomSpacer = computed(() => {
    const { offsets, count, totalSize: total } = layoutMetrics.value
    const { endIndex } = visibleRange.value
    if (count === 0 || endIndex < 0 || endIndex >= count - 1) return 0
    const afterEndOffset = offsets[endIndex + 1]
    return Math.max(0, total - afterEndOffset)
  })

  const startIndex = computed(() => visibleRange.value.startIndex)
  const endIndex = computed(() => visibleRange.value.endIndex)

  // First & last item actually inside user's visible viewport (excluding overscan)
  const visibleDisplayRange = computed(() => {
    const { offsets, count } = layoutMetrics.value
    if (count === 0) return { first: 0, last: 0 }
    const currentScrollTop = Math.max(0, scrollTop.value)
    const currentViewport = viewportHeight.value > 0 ? viewportHeight.value : initialViewportHeight
    const first = Math.min(count, findStartIndex(offsets, count, currentScrollTop) + 1)
    const last = Math.min(count, findStartIndex(offsets, count, currentScrollTop + currentViewport) + 1)
    return { first, last: Math.max(first, last) }
  })

  const isScrolledDown = computed(() => scrollTop.value > 360)

  const scrollProgress = computed(() => {
    const maxScroll = totalSize.value - viewportHeight.value
    if (maxScroll <= 0) return 0
    return Math.min(1, Math.max(0, scrollTop.value / maxScroll))
  })

  function ensureItemObserver() {
    if (itemResizeObserver || typeof ResizeObserver === 'undefined') return
    itemResizeObserver = new ResizeObserver((entries) => {
      let changed = false
      let scrollAnchorDelta = 0
      const container = containerRef.value
      const currentScroll = container ? container.scrollTop : scrollTop.value
      const { offsets } = layoutMetrics.value

      for (const entry of entries) {
        const el = entry.target as HTMLElement
        const key = elementToKey.get(el)
        if (key === undefined) continue

        const borderBoxHeight = entry.borderBoxSize?.[0]?.blockSize
        const measuredHeight = Math.round(
          borderBoxHeight !== undefined && borderBoxHeight > 0
            ? borderBoxHeight
            : el.offsetHeight || entry.contentRect.height
        )
        if (measuredHeight <= 0) continue

        const idx = keyToIndex.get(key)
        const prevSize =
          measuredSizes.get(key) ??
          (idx !== undefined && idx < items.value.length
            ? getEstimatedSize(idx, items.value[idx])
            : measuredHeight)

        if (Math.abs(measuredHeight - prevSize) >= 1) {
          measuredSizes.set(key, measuredHeight)
          changed = true

          // If an item strictly above the visible viewport (in top overscan during upward scroll)
          // differs from its estimate, compensate scrollTop to prevent visual jump.
          if (idx !== undefined && offsets[idx] + prevSize <= currentScroll) {
            scrollAnchorDelta += measuredHeight - prevSize
          }
        }
      }

      if (changed) {
        if (scrollAnchorDelta !== 0 && container) {
          container.scrollTop += scrollAnchorDelta
          scrollTop.value = container.scrollTop
        }
        scheduleMeasureBump()
      }
    })
  }

  /**
   * Template `:ref` callback for dynamic-height virtual rows:
   * `:ref="(el) => measureItem(vRow.key, el)"`
   */
  function measureItem(
    key: string | number,
    elOrComp: Element | ComponentPublicInstance | null
  ) {
    const rawEl =
      elOrComp && '$el' in elOrComp
        ? (elOrComp.$el as Element | null)
        : (elOrComp as Element | null)
    const htmlEl = rawEl instanceof HTMLElement ? rawEl : null

    const prevEl = mountedElements.get(key)
    if (prevEl === htmlEl) return

    if (prevEl) {
      itemResizeObserver?.unobserve(prevEl)
      mountedElements.delete(key)
    }

    if (htmlEl) {
      mountedElements.set(key, htmlEl)
      elementToKey.set(htmlEl, key)
      ensureItemObserver()
      if (itemResizeObserver) {
        itemResizeObserver.observe(htmlEl)
      } else {
        const h = htmlEl.offsetHeight
        if (h > 0 && measuredSizes.get(key) !== h) {
          measuredSizes.set(key, h)
          scheduleMeasureBump()
        }
      }
    }
  }

  function onScroll(e?: Event) {
    const el = (e?.currentTarget as HTMLElement | null) || containerRef.value
    if (!el) return
    scrollTop.value = el.scrollTop
    if (el.clientHeight > 0 && el.clientHeight !== viewportHeight.value) {
      viewportHeight.value = el.clientHeight
    }
  }

  function syncContainerMetrics(el: HTMLElement | null) {
    if (!el) return
    if (el.clientHeight > 0) {
      viewportHeight.value = el.clientHeight
    }
    scrollTop.value = el.scrollTop
  }

  function prefersReducedMotion(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  function scrollToTop(smooth = true) {
    const el = containerRef.value
    if (!el) return
    const useSmooth = smooth && !prefersReducedMotion() && typeof el.scrollTo === 'function'
    if (useSmooth) {
      const vp = el.clientHeight || viewportHeight.value
      // Pre-clamp huge virtual offsets to 2x viewport before smooth glide so returning from item #5000 takes ~180ms
      if (el.scrollTop > vp * 2.5) {
        el.scrollTop = vp * 1.5
        scrollTop.value = el.scrollTop
      }
      el.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      el.scrollTop = 0
      scrollTop.value = 0
    }
  }

  function scrollToIndex(
    index: number,
    align: 'start' | 'center' | 'end' = 'start',
    smooth = false
  ) {
    const el = containerRef.value
    const { offsets, count } = layoutMetrics.value
    if (!el || count === 0) return

    const clamped = Math.max(0, Math.min(count - 1, index))
    const itemStart = offsets[clamped]
    const itemEnd = offsets[clamped + 1]
    const itemHeight = itemEnd - itemStart
    const vpHeight = el.clientHeight || viewportHeight.value

    let targetTop = itemStart
    if (align === 'center') {
      targetTop = Math.max(0, itemStart - (vpHeight - itemHeight) / 2)
    } else if (align === 'end') {
      targetTop = Math.max(0, itemEnd - vpHeight)
    }

    const useSmooth = smooth && !prefersReducedMotion() && typeof el.scrollTo === 'function'
    if (useSmooth) {
      el.scrollTo({ top: targetTop, behavior: 'smooth' })
    } else {
      el.scrollTop = targetTop
      scrollTop.value = targetTop
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable)
    ) {
      return
    }
    const el = containerRef.value
    if (!el) return

    const vp = el.clientHeight || viewportHeight.value
    if (e.key === 'Home') {
      e.preventDefault()
      scrollToTop(false)
    } else if (e.key === 'End') {
      e.preventDefault()
      scrollToIndex(items.value.length - 1, 'end', false)
    } else if (e.key === 'PageDown') {
      e.preventDefault()
      el.scrollTop = Math.min(totalSize.value, el.scrollTop + vp * 0.85)
      scrollTop.value = el.scrollTop
    } else if (e.key === 'PageUp') {
      e.preventDefault()
      el.scrollTop = Math.max(0, el.scrollTop - vp * 0.85)
      scrollTop.value = el.scrollTop
    }
  }

  function refreshMeasurements() {
    syncContainerMetrics(containerRef.value)
    measureVersion.value++
  }

  // Bind passive scroll & container ResizeObserver automatically when containerRef changes
  watch(
    containerRef,
    (el, prevEl) => {
      if (prevEl) {
        prevEl.removeEventListener('scroll', onScroll)
        containerResizeObserver?.unobserve(prevEl)
      }
      if (el) {
        el.addEventListener('scroll', onScroll, { passive: true })
        syncContainerMetrics(el)
        if (typeof ResizeObserver !== 'undefined') {
          if (!containerResizeObserver) {
            containerResizeObserver = new ResizeObserver((entries) => {
              for (const entry of entries) {
                const h = Math.round(entry.contentRect.height)
                if (h > 0 && h !== viewportHeight.value) {
                  viewportHeight.value = h
                }
              }
            })
          }
          containerResizeObserver.observe(el)
        }
      }
    },
    { flush: 'post' }
  )

  onMounted(() => {
    syncContainerMetrics(containerRef.value)
  })

  // KeepAlive tab reactivation support
  onActivated(() => {
    nextTick(() => {
      syncContainerMetrics(containerRef.value)
    })
  })

  onUnmounted(() => {
    if (rafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    if (containerRef.value) {
      containerRef.value.removeEventListener('scroll', onScroll)
    }
    containerResizeObserver?.disconnect()
    containerResizeObserver = null
    itemResizeObserver?.disconnect()
    itemResizeObserver = null
    mountedElements.clear()
  })

  return {
    containerRef,
    virtualItems,
    totalSize,
    topSpacer,
    bottomSpacer,
    startIndex,
    endIndex,
    scrollTop,
    viewportHeight,
    visibleDisplayRange,
    isScrolledDown,
    scrollProgress,
    measureItem,
    onScroll,
    scrollToTop,
    scrollToIndex,
    handleKeydown,
    refreshMeasurements
  }
}
