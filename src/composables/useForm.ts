import { ref, computed, watch } from 'vue'
import { useFormStore } from '@/stores/useFormStore'
import { useAppStore } from '@/stores/useAppStore'
import { useUIStore } from '@/stores/useUIStore'
import { stripAccents, formatVND, cleanPhoneNumber, formatDateStr, isIOS, formatSetNote, escapeHtml } from '@/utils'
import { SETS, SAMPLE_MENU } from '@/utils/constants'
import { saveFormDraft, getFormDraft, clearFormDraft } from '@/services/cache'

import MiniSearch from 'minisearch'

/**
 * Form handling, validation, menu search, deposit, and save pipeline
 * SINGLETON: MiniSearch is only created once to avoid memory leaks
 */
let _instance: ReturnType<typeof _createForm> | null = null

export function useForm() {
  if (!_instance) _instance = _createForm()
  return _instance
}

function _createForm() {
  const formStore = useFormStore()
  const appStore = useAppStore()
  const uiStore = useUIStore()


  // --- MiniSearch for menu items ---
  const miniSearch = new MiniSearch({ fields: ['name', 'acronym', 'cleanName'], storeFields: ['name', 'price'] })
  const itemSuggestions = ref<any[]>([])

  watch(() => appStore.menuList, (nl) => {
    miniSearch.removeAll()
    if (nl.length) miniSearch.addAll(nl.map((i: any, idx: number) => ({ id: idx, ...i })))
  }, { deep: true })

  function onSearchInput(idx: number) {
    uiStore.focusIdx = idx
    const q = formStore.items[idx].name
    if (!q) { itemSuggestions.value = []; return }
    itemSuggestions.value = miniSearch.search(q, { fuzzy: 0.2, prefix: true }).slice(0, 8)
  }

  function selectMenuItem(s: any, idx: number) {
    formStore.items[idx].name = s.name
    formStore.items[idx].price = s.price
    let rawNote = appStore.menuDetails[s.name] || SETS[s.name.toUpperCase()] || ''
    if (rawNote) {
      formStore.items[idx].note = formatSetNote(rawNote)
    }
    uiStore.focusIdx = null
  }

  function handleItemBlur() {
    setTimeout(() => { uiStore.focusIdx = null }, 250)
  }

  // --- Input Focus/Blur (keyboard detection) ---
  function handleInputFocus(e: FocusEvent) {
    uiStore.isKeyboardOpen = true
    if (!isIOS) {
      setTimeout(() => {
        if (e?.target) {
          (e.target as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 300)
    }
  }

  function handleInputBlur() {
    if (!isIOS) {
      setTimeout(() => { uiStore.isKeyboardOpen = false }, 200)
    }
  }

  // --- Form Actions ---
  function addNewItem() {
    formStore.items.push({ name: '', qty: 1, price: 0, note: '' })
  }

  function formatDate() {
    formStore.customer.date = formatDateStr(formStore.customer.date)
  }

  function autoCalcDeposit() {
    const total = formStore.calculatedTotals.final
    if (total < 1500000) {
      formStore.deposit.amount = 500000
    } else {
      const oneThird = total / 3
      formStore.deposit.amount = Math.round(oneThird / 500000) * 500000
    }
  }

  // Auto-recalc deposit when total changes
  watch(() => formStore.calculatedTotals.final, () => {
    if (!formStore.deposit.isPaid) autoCalcDeposit()
  })

  async function toggleDepositState() {
    if (!formStore.deposit.isPaid) {
      const note = await uiStore.showPrompt('Xác Nhận Đặt Cọc', 'Nhập lý do/ghi chú:', 'CK Thành công')
      if (note !== null) {
        formStore.deposit.isPaid = true
        formStore.deposit.note = note || 'Confirmed'
        // Lock the timestamp: only set if not already present
        if (!formStore.deposit.time) {
          formStore.deposit.time = new Date().toLocaleString('vi-VN')
        }
      }
    } else {
      const reason = await uiStore.showPrompt('Hủy Trạng Thái Cọc', 'Nhập lý do hủy:', 'Khách hủy/Hoàn tiền')
      if (reason !== null) {
        formStore.deposit.isPaid = false
        formStore.deposit.image = null
        formStore.deposit.note = ''
      }
    }
  }

  function clearDeposit() {
    formStore.deposit.image = null
    formStore.deposit.isPaid = false
  }

  // --- CRM ---
  const crmStatus = computed(() => appStore.getCrmStatus(formStore.customer.phone))

  function checkCRM() {
    if (!formStore.customer.phone) return
    const phone = cleanPhoneNumber(formStore.customer.phone)
    const lastOrder = appStore.historyList.find((h: any) => cleanPhoneNumber(h.parsedCustomer.phone) === phone)
    if (lastOrder) {
      formStore.customer.name = lastOrder.parsedCustomer.name || formStore.customer.name
    }
  }

  // --- Deposit Transfer Computed ---
  const depositTransferContent = computed(() => {
    let n = stripAccents(formStore.customer.name).substring(0, 20).toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim()
    if (!n) n = 'KH'
    const p = formStore.customer.phone ? formStore.customer.phone.replace(/\D/g, '').slice(-4) : ''
    const idSuf = (formStore.id || '').replace(/-/g, '').substring(0, 4).toUpperCase()
    return `${n} DAT COC ${p} ${idSuf}`.trim()
  })

  const qrImageUrl = computed(() => {
    const b = appStore.currentBank
    return `https://img.vietqr.io/image/${b.bankId}-${b.number}-${b.template}.png?amount=${formStore.deposit.amount}&addInfo=${encodeURIComponent(depositTransferContent.value)}&accountName=${encodeURIComponent(b.owner)}`
  })

  // --- Validation ---
  function validateForm(): boolean {
    const c = formStore.customer
    const missing: string[] = []
    if (!c.name) missing.push('Người đặt')
    if (!c.phone) missing.push('SĐT/Zalo')
    if (!c.date) missing.push('Ngày')
    if (!c.time) missing.push('Giờ')
    if (!c.pax) missing.push('Số khách')
    if (!c.type) missing.push('Loại tiệc')
    if (!c.tables) missing.push('Số bàn')

    if (missing.length > 0) {
      uiStore.showAlert('Thiếu thông tin quan trọng', `Vui lòng bổ sung các mục sau:\n- ${missing.join('\n- ')}`)
      return false
    }
    return true
  }


  // --- Edit Historic Order ---
  function editHistoricOrder(o: any) {
    Object.assign(formStore.customer, o.parsedCustomer)
    formStore.items = JSON.parse(JSON.stringify(o.menuItems))
    formStore.deposit.amount = o.depositAmount
    formStore.deposit.isPaid = o.isDeposited
    formStore.deposit.image = o.transferImage || (o.deposit && o.deposit.image) || null
    formStore.oldBillFileId = o.billFileId || null

    formStore.id = o.id || crypto.randomUUID()
    formStore.version = o.version || 1

    const match = (o.parsedCustomer.tables || '').match(/^([A-E])(\d+)$/i)
    if (match) {
      uiStore.tempTable.zone = match[1].toUpperCase()
      uiStore.tempTable.number = match[2]
    } else {
      uiStore.tempTable.zone = 'A'
      const numeric = (o.parsedCustomer.tables || '').replace(/\D/g, '')
      uiStore.tempTable.number = numeric || o.parsedCustomer.tables
    }

    formStore.originalState = formStore.getDataSnapshot()
    uiStore.tab = 'create'
  }

  // --- Reset Form ---
  function resetForm() {
    formStore.$reset()
    uiStore.tempTable = { zone: 'A', number: '' } as any
    uiStore.tab = 'create'
  }

  // --- Copy Booking Confirmation ---
  function copyBookingConfirmation() {
    if (!validateForm()) return
    const c = formStore.customer
    if (!c.name || formStore.items.length === 0) {
      uiStore.showAlert('Thiếu dữ liệu món ăn', 'Vui lòng nhập tên khách và ít nhất 1 món ăn!')
      return
    }

    const menuText = formStore.items.map((item, i) => {
      const note = item.notes ? ` (${item.notes})` : ''
      return `  ${i + 1}. ${item.name} x${item.qty}${note}`
    }).join('\n')

    const total = formatVND(formStore.calculatedTotals.final)
    const deposit = formStore.deposit.amount > 0 ? `\n💰 Cọc: ${formatVND(formStore.deposit.amount)}` : ''
    const noteText = c.note ? `\n📝 ${c.note}` : ''

    const template = `Chào anh/chị ${c.name} ạ! 😊
Em xác nhận đặt bàn tại King's Grill:

🕐 ${c.time} — ${c.date}
👥 ${c.pax || '...'} khách | 📍 ${c.tables || 'Chưa xếp'}

🍽 Menu:
${menuText}
💵 Tạm tính: ${total}${deposit}${noteText}

Anh/chị kiểm tra giúp em, thả ❤️ hoặc "OK" để em chốt bếp nhé!
Cảm ơn anh/chị đã tin tưởng King's Grill 🙏`

    navigator.clipboard.writeText(template).then(() => {
      uiStore.showToast('✅ Đã copy nội dung xác nhận!', 'success')
    }).catch(err => {
      uiStore.showToast('Lỗi copy: ' + err, 'error')
    })
  }

  // --- Voice Mode ---
  function toggleVoiceMode() {
    if (!uiStore.isVoiceSupported) {
      return uiStore.showToast('Tính năng giọng nói chưa hỗ trợ trên thiết bị này', 'warning')
    }
    if (uiStore.listening) { uiStore.listening = false; return }

    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      const recognition = new SpeechRecognition()
      recognition.lang = 'vi-VN'
      recognition.onstart = () => { uiStore.listening = true }
      recognition.onresult = (e: any) => {
        formStore.rawInput += ' ' + e.results[0][0].transcript
        uiStore.listening = false
      }
      recognition.start()
    }
  }

  // --- File Handlers ---
  function handleAiImage(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0]
    if (f) {
      const r = new FileReader()
      r.onload = (ev) => { formStore.aiImage = ev.target?.result as string }
      r.readAsDataURL(f)
    }
  }

  function handleTransferUpload(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      formStore.deposit.image = ev.target?.result as string
      // The AI verification will be triggered from the component
    }
    reader.readAsDataURL(file)
  }

  // --- Utility ---
  function copyToClipboard(t: string) {
    navigator.clipboard.writeText(t)
    uiStore.showToast('Đã copy!', 'info')
  }

  // --- Menu Helpers ---
  function fillSampleMenu() {
    if (appStore.menuList.length > 0) {
      const lines = appStore.menuList.map((i: any) => {
        let p = i.price
        if (p && typeof p === 'number' && p >= 1000 && p % 1000 === 0) p = (p / 1000) + 'k'
        return `${i.name} - ${p}`
      })
      appStore.newMenuContent = lines.join('\n')
    } else {
      appStore.newMenuContent = SAMPLE_MENU
    }
  }

  function prepareUpdate(sheetName: string) {
    appStore.newMenuName = sheetName
    appStore.newMenuContent = ''
    uiStore.isUpdateMode = true
    uiStore.menuTab = 'upload'
  }

  // --- Confirm Verification ---
  function confirmVerification(useAiData: boolean) {
    if (useAiData) {
      formStore.deposit.amount = uiStore.verifyModal.scanned.amount
      formStore.deposit.note = uiStore.verifyModal.scanned.content || 'Manual Verified'
      formStore.deposit.isPaid = true
      // Lock the timestamp: only set if not already present
      if (!formStore.deposit.time) {
        formStore.deposit.time = new Date().toLocaleString('vi-VN')
      }
      uiStore.showToast('Đã cập nhật theo số liệu AI!', 'success')
    } else {
      formStore.deposit.isPaid = false
    }
    uiStore.verifyModal.show = false
  }

  // --- AUTO-SAVE DRAFT ---
  let _draftTimer: ReturnType<typeof setInterval> | null = null
  const draftStatus = ref<string>('')

  function startAutoSave() {
    if (_draftTimer) return
    _draftTimer = setInterval(async () => {
      // Only save if form has meaningful data
      if (!formStore.customer.name && !formStore.items.some((i: any) => i.name)) return
      try {
        await saveFormDraft({
          customer: { ...formStore.customer },
          items: formStore.items.map((i: any) => ({ ...i })),
          deposit: { ...formStore.deposit },
          staff: { ...formStore.staff },
          savedAt: new Date().toLocaleString('vi-VN')
        })
        draftStatus.value = `Đã lưu nháp ${new Date().toLocaleTimeString('vi-VN')}`
      } catch { /* ignore */ }
    }, 5000)
  }

  function stopAutoSave() {
    if (_draftTimer) {
      clearInterval(_draftTimer)
      _draftTimer = null
    }
  }

  async function restoreDraft() {
    const draft = await getFormDraft()
    if (!draft) return false
    formStore.customer = { ...formStore.customer, ...draft.customer }
    formStore.items = draft.items || formStore.items
    formStore.deposit = { ...formStore.deposit, ...draft.deposit }
    formStore.staff = { ...formStore.staff, ...draft.staff }
    draftStatus.value = `Khôi phục từ ${draft.savedAt || 'bản nháp'}`
    uiStore.showToast(`Đã khôi phục bản nháp (${draft.savedAt || ''})`, 'info')
    return true
  }

  async function clearDraft() {
    await clearFormDraft()
    draftStatus.value = ''
  }

  async function checkDraftOnLoad() {
    const draft = await getFormDraft()
    if (draft && draft.customer?.name) {
      // Show a toast asking if user wants to restore
      uiStore.showToast(`Có bản nháp "${escapeHtml(draft.customer.name)}" — nhấn khôi phục để tiếp tục`, 'info')
      return true
    }
    return false
  }

  // Start auto-save on init
  startAutoSave()

  // --- QUICK DUPLICATE ORDER ---
  function duplicateOrder(order: any) {
    resetForm()
    // Copy customer info (except date/time)
    formStore.customer.name = order.customerName || order.customer?.name || ''
    formStore.customer.phone = order.customerPhone || order.customer?.phone || ''
    formStore.customer.pax = order.customerPax || order.customer?.pax || ''
    formStore.customer.tables = order.customerTable || order.customer?.tables || ''
    formStore.customer.type = order.customer?.type || 'Ăn thường'
    formStore.customer.note = order.customer?.note || ''
    // Copy items
    const items = order.items || (order.data ? JSON.parse(order.data).items : null)
    if (items && Array.isArray(items)) {
      formStore.items = items.map((i: any) => ({
        name: i.name || '',
        qty: i.qty || 1,
        price: i.price || 0,
        note: i.note || ''
      }))
    }
    // Reset deposit & date (new booking)
    formStore.deposit.isPaid = false
    formStore.deposit.amount = 0
    formStore.deposit.image = null
    formStore.customer.date = ''
    formStore.customer.time = ''

    uiStore.tab = 'create'
    uiStore.showToast(`Đã sao chép đơn "${escapeHtml(formStore.customer.name)}" — chỉ cần chọn ngày giờ!`, 'success')
  }

  return {
    itemSuggestions, crmStatus, depositTransferContent, qrImageUrl,
    draftStatus,
    onSearchInput, selectMenuItem, handleItemBlur,
    handleInputFocus, handleInputBlur,
    addNewItem, formatDate, autoCalcDeposit, toggleDepositState, clearDeposit,
    checkCRM, validateForm,
    editHistoricOrder, resetForm,
    copyBookingConfirmation, toggleVoiceMode,
    handleAiImage, handleTransferUpload, copyToClipboard,
    fillSampleMenu, prepareUpdate, confirmVerification,
    restoreDraft, clearDraft, checkDraftOnLoad, duplicateOrder, stopAutoSave
  }
}
