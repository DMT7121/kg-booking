import { describe, it, expect, vi } from 'vitest'
import { defineComponent, ref, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { useVirtualList } from '../useVirtualList'

describe('useVirtualList Composable (Cross-Device Dynamic Virtual Scrolling)', () => {
  it('renders only a small bounded window out of 5,000 items and computes exact spacers', async () => {
    const items = ref(
      Array.from({ length: 5000 }, (_, i) => ({
        id: `booking-${i}`,
        height: 80
      }))
    )

    let api!: ReturnType<typeof useVirtualList<{ id: string; height: number }>>

    const Harness = defineComponent({
      setup() {
        api = useVirtualList({
          items,
          estimateSize: 80,
          overscan: 4,
          getKey: (it) => it.id,
          initialViewportHeight: 400
        })
        return () => null
      }
    })

    const wrapper = mount(Harness)
    const mockEl = document.createElement('div')
    Object.defineProperty(mockEl, 'clientHeight', { value: 400, configurable: true })
    mockEl.scrollTop = 0
    api.containerRef.value = mockEl
    await nextTick()

    // Total height = 5,000 * 80px = 400,000px
    expect(api.totalSize.value).toBe(400000)
    // Viewport 400px fits 5 items (indices 0..5) + overscan 4 => bounded DOM window (<= 12 items instead of 5,000)
    expect(api.virtualItems.value.length).toBeLessThanOrEqual(12)
    expect(api.topSpacer.value).toBe(0)
    expect(
      api.topSpacer.value + api.virtualItems.value.length * 80 + api.bottomSpacer.value
    ).toBe(400000)
    expect(api.visibleDisplayRange.value).toEqual({ first: 1, last: 6 })
    expect(api.isScrolledDown.value).toBe(false)

    // Simulate scrolling down to 16,000px (item index 200)
    mockEl.scrollTop = 16000
    api.onScroll()
    await nextTick()

    expect(api.isScrolledDown.value).toBe(true)
    expect(api.startIndex.value).toBe(196) // 200 - overscan(4)
    expect(api.topSpacer.value).toBe(196 * 80)
    expect(api.visibleDisplayRange.value.first).toBe(201)
    expect(
      api.topSpacer.value + api.virtualItems.value.length * 80 + api.bottomSpacer.value
    ).toBe(400000)

    wrapper.unmount()
  })

  it('supports variable item heights (click-to-expand) and keyboard / programmatic navigation', async () => {
    const expandedId = ref<string | null>(null)
    const items = ref(
      Array.from({ length: 200 }, (_, i) => ({
        id: `row-${i}`
      }))
    )

    let api!: ReturnType<typeof useVirtualList<{ id: string }>>

    const Harness = defineComponent({
      setup() {
        api = useVirtualList({
          items,
          estimateSize: (_idx, item) => (expandedId.value === item.id ? 320 : 72),
          overscan: 3,
          gap: 8,
          getKey: (it) => it.id,
          initialViewportHeight: 480
        })
        return () => null
      }
    })

    const wrapper = mount(Harness)
    const mockEl = document.createElement('div')
    Object.defineProperty(mockEl, 'clientHeight', { value: 480, configurable: true })
    api.containerRef.value = mockEl
    await nextTick()

    // Base total size = 200 * 72 + 199 * 8 = 14400 + 1592 = 15992
    const baseTotal = api.totalSize.value
    expect(baseTotal).toBe(15992)

    // Expand row-2 from 72px -> 320px (+248px)
    expandedId.value = 'row-2'
    api.refreshMeasurements()
    await nextTick()

    expect(api.totalSize.value).toBe(baseTotal + 248)
    // Verify no overlap: row-3 start offset shifts down by +248px
    const row2 = api.virtualItems.value.find((v) => v.key === 'row-2')!
    const row3 = api.virtualItems.value.find((v) => v.key === 'row-3')!
    expect(row2.size).toBe(320)
    expect(row3.start).toBe(row2.start + 320 + 8)

    // Programmatic scrollToIndex
    api.scrollToIndex(100, 'start', false)
    expect(api.scrollTop.value).toBeGreaterThan(7000)

    // Keyboard End -> jumps to end of list
    const preventEnd = vi.fn()
    api.handleKeydown({
      key: 'End',
      target: mockEl,
      preventDefault: preventEnd
    } as unknown as KeyboardEvent)
    expect(preventEnd).toHaveBeenCalled()
    expect(api.endIndex.value).toBe(199)

    // Keyboard Home -> jumps back to top
    const preventHome = vi.fn()
    api.handleKeydown({
      key: 'Home',
      target: mockEl,
      preventDefault: preventHome
    } as unknown as KeyboardEvent)
    expect(preventHome).toHaveBeenCalled()
    expect(api.scrollTop.value).toBe(0)

    // Keyboard events inside INPUT are ignored so search typing is unaffected
    const inputEl = document.createElement('input')
    const preventIgnored = vi.fn()
    api.handleKeydown({
      key: 'PageDown',
      target: inputEl,
      preventDefault: preventIgnored
    } as unknown as KeyboardEvent)
    expect(preventIgnored).not.toHaveBeenCalled()

    wrapper.unmount()
  })
})
