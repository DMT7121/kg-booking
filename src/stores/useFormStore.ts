import { defineStore } from 'pinia'
import { reactive, ref, computed } from 'vue'
import { stripAccents, cleanPhoneNumber } from '@/utils'
import { ALCOHOL_KEYS, DRINK_KEYS } from '@/utils/constants'

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

  // --- Tax ---
  const taxEnabled = ref(false)

  // --- Bill Mode ---
  const billMode = ref<'full' | 'kitchen' | 'bar'>('full')

  // --- Save Type ---
  const saveType = ref<string>('')

  // --- Computed: Totals ---
  const calculatedTotals = computed(() => {
    const sub = items.value.reduce((acc, i) => acc + (i.price * i.qty), 0)
    let tax = 0
    if (taxEnabled.value) {
      tax = items.value.reduce((acc, i) => {
        const isAlc = ALCOHOL_KEYS.some(k => stripAccents(i.name).toLowerCase().includes(k))
        return acc + (i.price * i.qty * (isAlc ? 0.1 : 0.08))
      }, 0)
    }
    return { sub, tax, final: sub + tax }
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

  // --- Reset Form ---
  function $reset() {
    id.value = crypto.randomUUID()
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
  }

  return {
    id, version, originalState,
    customer, items, deposit, staff,
    rawInput, aiImage, oldBillFileId, aiMetadata,
    taxEnabled, billMode, saveType,
    calculatedTotals, filteredBillItems, previewTitle,
    getDataSnapshot, $reset
  }
})
