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

export interface DepositInfo {
  amount: number
  isPaid: boolean
  note: string
  image: string | null
  time: string
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
    amount: 0, isPaid: false, note: '', image: null, time: ''
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

  // --- Persist Draft ---
  function loadDraft() {
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

  function saveDraft() {
    try {
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
      localStorage.setItem('kg_booking_draft', JSON.stringify(draft))
    } catch (e) {
      console.warn('Failed to save draft:', e)
    }
  }

  function clearDraft() {
    localStorage.removeItem('kg_booking_draft')
  }

  // Watch state changes to auto-save draft
  watch([id, version, originalState, customer, items, deposit, staff, rawInput, aiImage, oldBillFileId, aiMetadata, warnings, unresolvedItems, originalAiValues, taxEnabled, billMode, saveType, billUrl], () => {
    saveDraft()
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
        const isAlc = ALCOHOL_KEYS.some(k => stripAccents(i.name).toLowerCase().includes(k))
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
      const norm = stripAccents(item.name).toLowerCase()
      const isBar = [...ALCOHOL_KEYS, ...DRINK_KEYS].some(k => norm.includes(k))
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
      deposit: { amount: deposit.amount, isPaid: deposit.isPaid, note: deposit.note },
      staff
    })
  }

  function $reset() {
    id.value = generateBookingId()
    version.value = 1
    originalState.value = null
    Object.assign(customer, { name: '', phone: '', date: '', time: '', pax: '', tables: '', type: '', note: '' })
    items.value = []
    Object.assign(deposit, { amount: 0, isPaid: false, note: '', image: null, time: '' })
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

  return {
    id, version, originalState,
    customer, items, deposit, staff,
    rawInput, aiImage, oldBillFileId, aiMetadata, warnings, unresolvedItems, originalAiValues, parsedAiResult,
    taxEnabled, billMode, saveType, billUrl,
    calculatedTotals, filteredBillItems, previewTitle,
    getDataSnapshot, $reset
  }
})
