import { defineStore } from 'pinia'
import { reactive, ref, computed, watch } from 'vue'
import { stripAccents, cleanPhoneNumber, generateBookingId } from '@/utils'
import { ALCOHOL_KEYS, DRINK_KEYS } from '@/utils/constants'
import { useUIStore } from './useUIStore'

export interface MenuItem {
  name: string
  qty: number
  price: number
  note: string
}

export interface CustomerInfo {
  name: string
  phone: string
  date: string
  time: string
  pax: string
  tables: string
  type: string
  note: string
}

export interface DepositHistoryEntry {
  time: string
  amount: number
  delta: number
  note?: string
  type?: 'initial' | 'increase' | 'decrease' | 'cancel'
}

export interface DepositInfo {
  amount: number
  isPaid: boolean
  note: string
  image: string | null
  time: string
  isManualAmount?: boolean
  history?: DepositHistoryEntry[]
}

export interface StaffInfo {
  name: string
  phone: string
}

export interface AIMetadata {
  pipeline: 'text' | 'vision'
  tier_used: number
  model_used: string
  fallback_count: number
  repair_applied: boolean
  latency: string
  confidence_score?: number
  confidences?: Record<string, { value: any; confidence: number; source_text: string; needs_review: boolean }>
  mode?: string
}

export interface NewBookingDraft {
  id: string | null
  customer: CustomerInfo
  items: MenuItem[]
  deposit: DepositInfo
  staff: StaffInfo
  rawInput: string
  aiImage: string | null
  oldBillFileId: string | null
  aiMetadata: AIMetadata | null
  taxEnabled: boolean
  billMode: 'full' | 'kitchen' | 'bar'
  savedAt: string
  displaySummary: string
}

export const useFormStore = defineStore('form', () => {
  // --- Form State ---
  const id = ref<string | null>(null)
  const version = ref(1)
  const originalState = ref<string | null>(null)

  const customer = reactive<CustomerInfo>({
    name: '', phone: '', date: '', time: '', pax: '', tables: '', type: '', note: ''
  })

  const items = ref<MenuItem[]>([])

  const deposit = reactive<DepositInfo>({
    amount: 0, isPaid: false, note: '', image: null, time: '', isManualAmount: false, history: []
  })

  const staff = reactive<StaffInfo>({ name: 'Admin', phone: '0336667301' })

  const rawInput = ref('')
  const aiImage = ref<string | null>(null)
  const oldBillFileId = ref<string | null>(null)
  const aiMetadata = ref<AIMetadata | null>(null)
  const warnings = ref<string[]>([])
  const unresolvedItems = ref<string[]>([])
  const originalAiValues = ref<any>(null)
  const parsedAiResult = ref<any>(null)
  const billUrl = ref<string>('')

  // --- Tax ---
  const taxEnabled = ref(false)

  // --- Bill Mode ---
  const billMode = ref<'full' | 'kitchen' | 'bar'>('full')

  // --- Save Type ---
  const saveType = ref<string>('')

  // --- Saved New Booking Draft (Đang xử lý tạo mới) ---
  const savedNewBookingDraft = ref<NewBookingDraft | null>(null)

  // --- Persist Draft ---
  function loadDraft() {
    try {
      const savedNew = localStorage.getItem('kg_saved_new_booking_draft')
      if (savedNew) {
        savedNewBookingDraft.value = JSON.parse(savedNew)
      }
    } catch (e) {
      console.warn('Failed to load kg_saved_new_booking_draft:', e)
    }

    try {
      const draft = localStorage.getItem('kg_booking_draft')
      if (draft) {
        const parsed = JSON.parse(draft)
        if (parsed.id) id.value = parsed.id
        if (parsed.version) version.value = parsed.version
        if (parsed.originalState) originalState.value = parsed.originalState
        if (parsed.customer) Object.assign(customer, parsed.customer)
        if (parsed.items) items.value = parsed.items
        if (parsed.deposit) Object.assign(deposit, parsed.deposit)
        if (parsed.staff) Object.assign(staff, parsed.staff)
        if (parsed.rawInput) rawInput.value = parsed.rawInput
        if (parsed.aiImage) aiImage.value = parsed.aiImage
        if (parsed.oldBillFileId) oldBillFileId.value = parsed.oldBillFileId
        if (parsed.aiMetadata) aiMetadata.value = parsed.aiMetadata
        if (parsed.warnings) warnings.value = parsed.warnings
        if (parsed.unresolvedItems) unresolvedItems.value = parsed.unresolvedItems
        if (parsed.originalAiValues) originalAiValues.value = parsed.originalAiValues
        if (parsed.taxEnabled !== undefined) taxEnabled.value = parsed.taxEnabled
        if (parsed.billMode) billMode.value = parsed.billMode
        if (parsed.saveType) saveType.value = parsed.saveType
        if (parsed.billUrl) billUrl.value = parsed.billUrl
      }
    } catch (e) {
      console.warn('Failed to load draft:', e)
    }
  }

  const _dishTaxCategoryCache = new Map<string, { isAlc: boolean; isBar: boolean }>()
  const BAR_KEYS = [...ALCOHOL_KEYS, ...DRINK_KEYS]

  function classifyDishTaxAndBar(rawName: string): { isAlc: boolean; isBar: boolean } {
    if (!rawName) return { isAlc: false, isBar: false }
    let cached = _dishTaxCategoryCache.get(rawName)
    if (cached) return cached
    const norm = stripAccents(rawName).toLowerCase()
    const isAlc = ALCOHOL_KEYS.some(k => norm.includes(k))
    const isBar = isAlc || BAR_KEYS.some(k => norm.includes(k))
    cached = { isAlc, isBar }
    if (_dishTaxCategoryCache.size > 500) _dishTaxCategoryCache.clear()
    _dishTaxCategoryCache.set(rawName, cached)
    return cached
  }

  let _draftSaveTimer: ReturnType<typeof setTimeout> | null = null
  let _draftDirty = false
  let _suppressAutoDraft = false

  function saveDraft() {
    if (_draftSaveTimer) {
      clearTimeout(_draftSaveTimer)
      _draftSaveTimer = null
    }
    _draftDirty = false
    const draft = {
      id: id.value,
      version: version.value,
      originalState: originalState.value,
      customer,
      items: items.value,
      deposit,
      staff,
      rawInput: rawInput.value,
      aiImage: aiImage.value,
      oldBillFileId: oldBillFileId.value,
      aiMetadata: aiMetadata.value,
      warnings: warnings.value,
      unresolvedItems: unresolvedItems.value,
      originalAiValues: originalAiValues.value,
      taxEnabled: taxEnabled.value,
      billMode: billMode.value,
      saveType: saveType.value,
      billUrl: billUrl.value
    }
    try {
      localStorage.setItem('kg_booking_draft', JSON.stringify(draft))
    } catch (e) {
      try {
        const lightDraft = {
          ...draft,
          aiImage: null,
          deposit: {
            ...deposit,
            image: deposit.image?.startsWith('data:') ? null : deposit.image
          }
        }
        localStorage.setItem('kg_booking_draft', JSON.stringify(lightDraft))
      } catch (fallbackErr) {
        console.warn('Failed to save draft:', fallbackErr)
      }
    }
  }

  function flushPendingDraft() {
    if (_draftDirty) {
      saveDraft()
    }
  }

  function scheduleSaveDraft() {
    if (_suppressAutoDraft) return
    _draftDirty = true
    if (_draftSaveTimer) clearTimeout(_draftSaveTimer)
    _draftSaveTimer = setTimeout(() => {
      saveDraft()
    }, 250)
  }

  function clearDraft() {
    if (_draftSaveTimer) {
      clearTimeout(_draftSaveTimer)
      _draftSaveTimer = null
    }
    _draftDirty = false
    localStorage.removeItem('kg_booking_draft')
  }

  if (typeof window !== 'undefined' && !(window as any).__kgDraftFlushBound) {
    ;(window as any).__kgDraftFlushBound = true
    window.addEventListener('pagehide', () => {
      try { useFormStore().flushPendingDraft() } catch {}
    })
    window.addEventListener('beforeunload', () => {
      try { useFormStore().flushPendingDraft() } catch {}
    })
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        try { useFormStore().flushPendingDraft() } catch {}
      }
    })
  }

  // Watch state changes to auto-save draft (debounced to keep typing INP < 16ms)
  watch([id, version, originalState, customer, items, deposit, staff, rawInput, aiImage, oldBillFileId, aiMetadata, warnings, unresolvedItems, originalAiValues, taxEnabled, billMode, saveType, billUrl], () => {
    scheduleSaveDraft()
  }, { deep: true })

  // Initialize draft
  loadDraft()

  // --- Computed: Totals ---
  const calculatedTotals = computed(() => {
    const sub = items.value.reduce((acc, i) => acc + (i.price * i.qty), 0)
    let tax = 0
    let vat8 = 0
    let vat10 = 0
    if (taxEnabled.value) {
      items.value.forEach(i => {
        const { isAlc } = classifyDishTaxAndBar(i.name)
        const itemTax = i.price * i.qty * (isAlc ? 0.1 : 0.08)
        if (isAlc) vat10 += itemTax
        else vat8 += itemTax
      })
      tax = vat8 + vat10
    }
    return { sub, tax, vat8, vat10, final: sub + tax }
  })

  // --- Computed: Filtered Bill Items (by mode) ---
  const filteredBillItems = computed(() => {
    if (!Array.isArray(items.value)) return []
    if (billMode.value === 'full') return items.value
    return items.value.filter(item => {
      const { isBar } = classifyDishTaxAndBar(item.name)
      return billMode.value === 'bar' ? isBar : !isBar
    })
  })

  // --- Computed: Preview Title ---
  const previewTitle = computed(() =>
    ({ kitchen: 'BẾP CHẾ BIẾN', bar: 'QUẦY BAR / ĐỒ UỐNG' } as Record<string, string>)[billMode.value] || 'PHIẾU ĐẶT CHỖ'
  )

  // --- Snapshot for change detection ---
  function getDataSnapshot(): string {
    return JSON.stringify({
      customer,
      items: items.value,
      deposit: { amount: deposit.amount, isPaid: deposit.isPaid, note: deposit.note, time: deposit.time, history: deposit.history },
      staff
    })
  }

  function $reset() {
    _suppressAutoDraft = true
    id.value = generateBookingId()
    version.value = 1
    originalState.value = null
    Object.assign(customer, { name: '', phone: '', date: '', time: '', pax: '', tables: '', type: '', note: '' })
    items.value = []
    Object.assign(deposit, { amount: 0, isPaid: false, note: '', image: null, time: '', isManualAmount: false, history: [] })
    Object.assign(staff, { name: 'Admin', phone: '0336667301' })
    rawInput.value = ''
    aiImage.value = null
    oldBillFileId.value = null
    aiMetadata.value = null
    warnings.value = []
    unresolvedItems.value = []
    originalAiValues.value = null
    parsedAiResult.value = null
    billUrl.value = ''
    clearDraft()
    Promise.resolve().then(() => {
      _suppressAutoDraft = false
      clearDraft()
    })

    // Reset UI bound variables to prevent carryover cache bugs
    try {
      const uiStore = useUIStore()
      uiStore.tempTable.zone = 'A'
      uiStore.tempTable.number = ''
      uiStore.selectedBooking = null
    } catch (e) {
      console.warn('UIStore not initialized yet during reset:', e)
    }
  }

  // --- Draft Protection & Historic Edit Detection ---
  const isEditingHistoric = computed(() => !!originalState.value)

  const hasOngoingNewInput = computed(() => {
    // Only counts as new in-progress draft if NOT currently editing a historic order
    if (originalState.value) return false
    const hasCust = !!(customer.name?.trim() || customer.phone?.trim())
    const hasItms = items.value.length > 0
    const hasRaw = !!rawInput.value?.trim()
    const hasDep = deposit.amount > 0 || !!deposit.note?.trim()
    return hasCust || hasItms || hasRaw || hasDep
  })

  function getOngoingDraftSummary(): string {
    const parts: string[] = []
    if (customer.name?.trim()) parts.push(customer.name.trim())
    if (customer.phone?.trim()) parts.push(customer.phone.trim())
    if (customer.pax?.trim()) parts.push(`${customer.pax.trim()} khách`)
    if (customer.time?.trim()) parts.push(customer.time.trim())
    if (items.value.length > 0) parts.push(`${items.value.length} món`)
    return parts.length > 0 ? parts.join(' • ') : 'Phiếu tạo mới dở dang'
  }

  function saveCurrentAsNewDraft(): boolean {
    if (!hasOngoingNewInput.value) return false
    const summary = getOngoingDraftSummary()
    const draftData: NewBookingDraft = {
      id: id.value,
      customer: JSON.parse(JSON.stringify(customer)),
      items: JSON.parse(JSON.stringify(items.value)),
      deposit: JSON.parse(JSON.stringify(deposit)),
      staff: JSON.parse(JSON.stringify(staff)),
      rawInput: rawInput.value,
      aiImage: aiImage.value,
      oldBillFileId: oldBillFileId.value,
      aiMetadata: aiMetadata.value ? JSON.parse(JSON.stringify(aiMetadata.value)) : null,
      taxEnabled: taxEnabled.value,
      billMode: billMode.value,
      savedAt: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date().toLocaleDateString('vi-VN'),
      displaySummary: summary
    }
    savedNewBookingDraft.value = draftData
    try {
      localStorage.setItem('kg_saved_new_booking_draft', JSON.stringify(draftData))
    } catch (e) {
      console.warn('Failed to save kg_saved_new_booking_draft:', e)
    }
    return true
  }

  function restoreNewDraft(): boolean {
    if (!savedNewBookingDraft.value) return false
    const d = savedNewBookingDraft.value
    id.value = d.id || generateBookingId()
    version.value = 1
    originalState.value = null // Mark explicitly as NEW booking
    Object.assign(customer, d.customer)
    items.value = JSON.parse(JSON.stringify(d.items || []))
    Object.assign(deposit, d.deposit)
    Object.assign(staff, d.staff)
    rawInput.value = d.rawInput || ''
    aiImage.value = d.aiImage || null
    oldBillFileId.value = d.oldBillFileId || null
    aiMetadata.value = d.aiMetadata || null
    taxEnabled.value = d.taxEnabled || false
    billMode.value = d.billMode || 'full'
    discardNewDraft()

    try {
      const uiStore = useUIStore()
      const match = (customer.tables || '').match(/^([A-E])(\d+)$/i)
      if (match) {
        uiStore.tempTable.zone = match[1].toUpperCase()
        uiStore.tempTable.number = match[2]
      }
      uiStore.tab = 'create'
      uiStore.showToast('✅ Đã khôi phục phiếu đang xử lý tạo mới!', 'success')
    } catch (e) {
      console.warn('Error syncing UI during draft restore:', e)
    }

    return true
  }

  function discardNewDraft() {
    savedNewBookingDraft.value = null
    try {
      localStorage.removeItem('kg_saved_new_booking_draft')
    } catch (e) {
      console.warn('Failed to remove kg_saved_new_booking_draft:', e)
    }
  }

  function cancelHistoricEdit() {
    $reset()
    if (savedNewBookingDraft.value) {
      restoreNewDraft()
    } else {
      try {
        const uiStore = useUIStore()
        uiStore.showToast('Đã hủy sửa và làm mới phiếu!', 'info')
      } catch (e) { /* ignore */ }
    }
  }

  return {
    id, version, originalState,
    customer, items, deposit, staff,
    rawInput, aiImage, oldBillFileId, aiMetadata, warnings, unresolvedItems, originalAiValues, parsedAiResult,
    taxEnabled, billMode, saveType, billUrl,
    savedNewBookingDraft, isEditingHistoric, hasOngoingNewInput,
    getOngoingDraftSummary, saveCurrentAsNewDraft, restoreNewDraft, discardNewDraft, cancelHistoricEdit,
    calculatedTotals, filteredBillItems, previewTitle,
    saveDraft, flushPendingDraft, clearDraft,
    getDataSnapshot, $reset
  }
})
