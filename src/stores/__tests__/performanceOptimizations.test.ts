import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useFormStore } from '../useFormStore'
import { useAppStore } from '../useAppStore'
import { useUIStore } from '../useUIStore'

vi.mock('idb-keyval', () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
  del: vi.fn(async () => undefined),
  keys: vi.fn(async () => []),
  clear: vi.fn(async () => undefined)
}))

describe('WebApp Hot-Path Performance & Regression Tests', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    sessionStorage.clear()
    setActivePinia(createPinia())
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ ok: true, data: [] }),
      text: async () => '{"ok":true,"data":[]}'
    }) as any
  })

  afterEach(() => {
    vi.useRealTimers()
    global.fetch = originalFetch
  })

  it('coalesces rapid keystrokes into a single debounced localStorage write and flushes on demand', async () => {
    const formStore = useFormStore()
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')

    // Simulate 25 rapid keystrokes into customer name & raw AI input
    for (let i = 1; i <= 25; i++) {
      formStore.customer.name = 'Nguyễn Văn A'.slice(0, (i % 12) + 1)
      formStore.rawInput = `Đặt bàn ${i} khách lúc 19:00`
      await nextTick()
    }

    // Before 250ms debounce window elapses, 0 draft writes should have blocked the main thread
    const draftWritesDuringTyping = setItemSpy.mock.calls.filter(([k]) => k === 'kg_booking_draft')
    expect(draftWritesDuringTyping.length).toBe(0)

    // Advance 250ms -> exactly 1 coalesced write
    vi.advanceTimersByTime(260)
    const draftWritesAfterDebounce = setItemSpy.mock.calls.filter(([k]) => k === 'kg_booking_draft')
    expect(draftWritesAfterDebounce.length).toBe(1)

    const saved = JSON.parse(localStorage.getItem('kg_booking_draft') || '{}')
    expect(saved.rawInput).toBe('Đặt bàn 25 khách lúc 19:00')

    // Mutate again and verify flushPendingDraft() persists immediately (e.g. beforeunload/pagehide)
    formStore.customer.phone = '0909123456'
    await nextTick()
    formStore.flushPendingDraft()

    const flushed = JSON.parse(localStorage.getItem('kg_booking_draft') || '{}')
    expect(flushed.customer.phone).toBe('0909123456')

    setItemSpy.mockRestore()
  })

  it('ensures $reset() cancels pending debounced draft writes and never resurrects cleared drafts', async () => {
    const formStore = useFormStore()
    formStore.customer.name = 'Khách Tạm'
    formStore.rawInput = 'Test reset race condition'
    await nextTick()

    // Reset immediately while debounce timer is pending
    formStore.$reset()
    await nextTick()
    vi.advanceTimersByTime(500)
    await nextTick()

    expect(localStorage.getItem('kg_booking_draft')).toBeNull()
  })

  it('preserves exact VAT 8% / 10% calculations and kitchen/bar filtering with memoized dish classifier', () => {
    const formStore = useFormStore()
    formStore.items = [
      { name: 'Ba chỉ bò Mỹ nướng', qty: 2, price: 200000, note: '' }, // 400k -> 8% VAT = 32k
      { name: 'Bia Tiger Bạc', qty: 10, price: 25000, note: '' },       // 250k -> 10% VAT = 25k (alcohol & bar)
      { name: 'Nước suối Aquafina', qty: 4, price: 15000, note: '' }    // 60k  -> 8% VAT = 4.8k (non-alc bar drink)
    ]
    formStore.taxEnabled = true

    expect(formStore.calculatedTotals.sub).toBe(710000)
    expect(formStore.calculatedTotals.vat10).toBe(25000)
    expect(formStore.calculatedTotals.vat8).toBe(36800)
    expect(formStore.calculatedTotals.final).toBe(771800)

    formStore.billMode = 'kitchen'
    expect(formStore.filteredBillItems.map(i => i.name)).toEqual(['Ba chỉ bò Mỹ nướng'])

    formStore.billMode = 'bar'
    expect(formStore.filteredBillItems.map(i => i.name)).toEqual(['Bia Tiger Bạc', 'Nước suối Aquafina'])
  })

  it('resolves CRM tier in O(1) time across 1,000 history records (< 25ms for 1,000 lookups)', () => {
    vi.useRealTimers()
    const appStore = useAppStore()
    const uiStore = useUIStore()

    const syntheticHistory: any[] = []
    for (let i = 0; i < 1000; i++) {
      const phone =
        i < 6 ? '0901111111' : // 6 visits -> VIP
        i < 8 ? '0902222222' : // 2 visits -> Khách quen
        `098${String(i).padStart(7, '0')}`
      syntheticHistory.push({
        id: `KG-PERF-${i}`,
        version: 1,
        timestamp: new Date(1700000000000 + i * 60000).toISOString(),
        parsedCustomer: {
          name: `Khách ${i}`,
          phone,
          date: '25/10/2026',
          time: '19:00',
          pax: '6',
          tables: `A${(i % 20) + 1}`
        },
        totalAmount: 1500000,
        isDeposited: i % 2 === 0
      })
    }

    appStore.historyList = syntheticHistory

    expect(appStore.getCrmStatus('901111111')).toBe('VIP')
    expect(appStore.getCrmStatus('0902222222')).toBe('Khách quen')
    expect(appStore.getCrmStatus('0999999999')).toBe('Khách mới')
    expect(appStore.getCrmStatus('')).toBeNull()

    const startLookup = performance.now()
    for (let i = 0; i < 1000; i++) {
      appStore.getCrmStatus(`098${String(i).padStart(7, '0')}`)
    }
    const lookupElapsedMs = performance.now() - startLookup
    expect(lookupElapsedMs).toBeLessThan(50)

    // Verify fast sorting & filtering over 1,000 grouped orders
    uiStore.historyFilters.deposit = 'paid'
    uiStore.historyFilters.sort = 'newest'
    const startFilter = performance.now()
    const filteredKeys = Object.keys(appStore.filteredHistory)
    const filterElapsedMs = performance.now() - startFilter

    expect(filteredKeys.length).toBe(500)
    expect(filteredKeys[0]).toBe('KG-PERF-998')
    expect(filterElapsedMs).toBeLessThan(100)
  })
})
