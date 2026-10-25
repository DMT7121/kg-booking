import { ref, computed, watch } from 'vue'
import { useFormStore } from '@/stores/useFormStore'
import { useAppStore } from '@/stores/useAppStore'
import { useUIStore } from '@/stores/useUIStore'
import { stripAccents, formatVND, cleanPhoneNumber, formatDateStr, isIOS, formatSetNote, mergeSetComponentNote, escapeHtml, generateBookingId, formatCurrentDepositTime, formatTimestampToDepositTime } from '@/utils'
import { SETS, SAMPLE_MENU } from '@/utils/constants'
import { resolveSetMenuDescription } from '@/domain/menu/menuMatcher'
import { saveFormDraft, getFormDraft, clearFormDraft } from '@/services/cache'
import { useAI } from '@/composables/useAI'

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
  const miniSearch = new MiniSearch({ fields: ['name', 'acronym', 'cleanName'], storeFields: ['name', 'price', 'desc'] })
  const itemSuggestions = ref<any[]>([])

  watch(() => appStore.menuList, (nl) => {
    miniSearch.removeAll()
    if (Array.isArray(nl) && nl.length > 0) {
      miniSearch.addAll(
        nl.map((i: any, idx: number) => {
          const cleanName = i.cleanName || stripAccents(i.name || '').toLowerCase().trim()
          const acronym = i.acronym || cleanName.split(/\s+/).filter(Boolean).map((w: string) => w[0]).join('')
          return { id: idx, ...i, cleanName, acronym }
        })
      )
    }
  }, { immediate: true })

  function onSearchInput(idx: number) {
    uiStore.focusIdx = idx
    const q = formStore.items[idx].name
    if (!q) { itemSuggestions.value = []; return }
    itemSuggestions.value = miniSearch.search(q, { fuzzy: 0.2, prefix: true }).slice(0, 30)
  }

  function selectMenuItem(s: any, idx: number) {
    formStore.items[idx].name = s.name
    formStore.items[idx].price = s.price
    const resolvedDesc = resolveSetMenuDescription(s.name, appStore.menuList, appStore.menuDetails || {})
    const rawNote = resolvedDesc || (s.desc && String(s.desc).trim().length >= 5 ? s.desc : '') || SETS[s.name] || SETS[s.name.toUpperCase()] || ''
    if (rawNote) {
      formStore.items[idx].note = mergeSetComponentNote('', rawNote)
    }
    uiStore.focusIdx = null
  }

  function handleItemBlur() {
    setTimeout(() => { uiStore.focusIdx = null }, 250)
  }

  // --- Input Focus/Blur (keyboard detection) ---
  function handleInputFocus(e?: FocusEvent) {
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
    setTimeout(() => { uiStore.isKeyboardOpen = false }, 200)
  }

  // --- Form Actions ---
  function addNewItem() {
    formStore.items.push({ name: '', qty: 1, price: 0, note: '' })
  }

  function formatDate() {
    formStore.customer.date = formatDateStr(formStore.customer.date)
  }

  function autoCalcDeposit() {
    formStore.deposit.isManualAmount = false
    const hasFood = formStore.items.length > 0 && formStore.items.some(item => item.name?.trim() && item.qty > 0)
    
    if (!hasFood) {
      // Bàn chưa có món
      const pax = parseInt(formStore.customer.pax) || 0
      if (pax >= 20) {
        formStore.deposit.amount = 1000000
      } else {
        formStore.deposit.amount = 500000
      }
    } else {
      // Bàn đã có món (logic hiện tại)
      const total = formStore.calculatedTotals.final
      if (total < 1500000) {
        formStore.deposit.amount = 500000
      } else {
        const oneThird = total / 3
        formStore.deposit.amount = Math.round(oneThird / 500000) * 500000
      }
    }
  }

  // Auto-recalc deposit when total, pax count, or items change
  watch(
    [
      () => formStore.calculatedTotals.final,
      () => formStore.customer.pax,
      () => formStore.items
    ],
    () => {
      if (!formStore.deposit.isPaid && !formStore.deposit.isManualAmount) autoCalcDeposit()
    },
    { deep: true }
  )

  async function toggleDepositState() {
    if (!formStore.customer.name) {
      uiStore.showAlert('Thiếu thông tin bắt buộc', 'Chưa có tên khách hàng. Vui lòng nhập tên khách hoặc nạp lại dữ liệu trước khi xuất/xác nhận phiếu.')
      return
    }
    if (!formStore.deposit.isPaid) {
      const note = await uiStore.showPrompt('Xác Nhận Đặt Cọc', 'Nhập lý do/ghi chú:', 'CK Thành công')
      if (note !== null) {
        formStore.deposit.isPaid = true
        formStore.deposit.note = note || 'Confirmed'
        // Always update the time to the actual action time in clean DD/MM/YYYY - HH:mm format
        const actionTime = formatCurrentDepositTime()
        formStore.deposit.time = actionTime

        if (!Array.isArray(formStore.deposit.history) || formStore.deposit.history.length === 0) {
          formStore.deposit.history = [{
            time: actionTime,
            amount: formStore.deposit.amount,
            delta: formStore.deposit.amount,
            note: note || 'Xác nhận cọc',
            type: 'initial'
          }]
        } else {
          formStore.deposit.history.push({
            time: actionTime,
            amount: formStore.deposit.amount,
            delta: formStore.deposit.amount,
            note: note || `Xác nhận cọc (Lần ${formStore.deposit.history.length + 1})`,
            type: 'increase'
          })
        }
      }
    } else {
      const reason = await uiStore.showPrompt('Hủy Trạng Thái Cọc', 'Nhập lý do hủy:', 'Khách hủy/Hoàn tiền')
      if (reason !== null) {
        formStore.deposit.isPaid = false
        formStore.deposit.image = null
        formStore.deposit.note = ''
        formStore.deposit.time = ''
        formStore.deposit.history = []
      }
    }
  }

  function clearDeposit() {
    formStore.deposit.image = null
    formStore.deposit.isPaid = false
    formStore.deposit.time = ''
    formStore.deposit.history = []
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
    let n = stripAccents(formStore.customer.name).toUpperCase().replace(/[^A-Z0-9]/g, '').trim()
    if (!n) n = 'KH'
    n = n.substring(0, 10)
    const p = formStore.customer.phone ? formStore.customer.phone.replace(/\D/g, '').slice(-4) : ''
    const idSuf = (formStore.id || '').replace(/-/g, '').substring(0, 4).toUpperCase()
    return `KG ${n} ${p} ${idSuf}`.trim()
  })

  const qrImageUrl = computed(() => {
    const b = appStore.currentBank
    if (!b || !b.number) return ''
    return `https://img.vietqr.io/image/${b.bankId}-${b.number}-${b.template || 'compact'}.png?amount=${formStore.deposit.amount || 0}&addInfo=${encodeURIComponent(depositTransferContent.value)}&accountName=${encodeURIComponent(b.owner || '')}`
  })

  // --- Validation ---
  function validateForm(): boolean {
    const c = formStore.customer
    if (!c.name?.trim()) {
      uiStore.showAlert('Thiếu thông tin bắt buộc', 'Chưa có tên khách hàng. Vui lòng nhập tên khách hoặc nạp lại dữ liệu trước khi xuất/xác nhận phiếu.')
      return false
    }
    const missing: string[] = []
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
  async function editHistoricOrder(o: any) {
    if (formStore.hasOngoingNewInput) {
      const draftSummary = formStore.getOngoingDraftSummary()
      const historicName = o.parsedCustomer?.name ? `"${o.parsedCustomer.name}"` : 'phiếu lịch sử'
      const action = await uiStore.promptDraftConflict(draftSummary, historicName)
      if (action === 'cancel') {
        return
      }
      if (action === 'save') {
        formStore.saveCurrentAsNewDraft()
        uiStore.showToast(`💾 Đã lưu tạm đơn mới vào "Đang xử lý tạo mới"!`, 'success', 3500)
      } else if (action === 'discard') {
        formStore.discardNewDraft()
        uiStore.showToast('🗑️ Đã làm mới phiếu tạo dở để sửa phiếu này!', 'info')
      }
    }

    Object.assign(formStore.customer, o.parsedCustomer)
    formStore.items = JSON.parse(JSON.stringify(o.menuItems || []))
    formStore.deposit.amount = typeof o.depositAmount === 'number' ? o.depositAmount : (o.deposit && typeof o.deposit.amount === 'number' ? o.deposit.amount : 0)
    formStore.deposit.isManualAmount = true
    formStore.deposit.isPaid = typeof o.isDeposited === 'boolean' ? o.isDeposited : (o.deposit && typeof o.deposit.isPaid === 'boolean' ? o.deposit.isPaid : false)
    formStore.deposit.image = o.transferImage || (o.deposit && o.deposit.image) || null
    formStore.deposit.note = (o.deposit && o.deposit.note) || ''

    // Always preserve and restore deposit time
    const depTime = o.depositTime || (o.deposit && o.deposit.time) || (formStore.deposit.isPaid && o.timestamp ? formatTimestampToDepositTime(o.timestamp) : '')
    formStore.deposit.time = depTime

    // Always preserve and restore deposit history
    const depHistory = (o.deposit && Array.isArray(o.deposit.history)) ? o.deposit.history : (Array.isArray(o.depositHistory) ? o.depositHistory : [])
    if (formStore.deposit.isPaid && formStore.deposit.amount > 0 && (!depHistory || depHistory.length === 0)) {
      formStore.deposit.history = [{
        time: depTime || formatCurrentDepositTime(),
        amount: formStore.deposit.amount,
        delta: formStore.deposit.amount,
        note: formStore.deposit.note || 'Xác nhận cọc',
        type: 'initial'
      }]
    } else {
      formStore.deposit.history = JSON.parse(JSON.stringify(depHistory || []))
    }

    formStore.oldBillFileId = o.billFileId || null
    formStore.billUrl = o.billUrl || o.billImage || ''

    formStore.id = o.id || generateBookingId()
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

  // --- Copy Booking Confirmation & Smart Reply Templates ---
  function copyBookingConfirmation(templateType?: 'quote_deposit' | 'deposit_confirmed' | 'reminder') {
    const c = formStore.customer
    if (!c.name?.trim()) {
      uiStore.showAlert('Thiếu thông tin bắt buộc', 'Chưa có tên khách hàng. Vui lòng nhập tên khách trước khi copy tin nhắn.')
      return
    }

    const activeItems = formStore.items.filter(i => i.name && i.name.trim())
    const menuText = activeItems.length > 0
      ? activeItems.map((item, i) => {
          const lineTotal = item.price ? ` — ${formatVND(item.price * (item.qty || 1))}` : ''
          let block = `  ${i + 1}. ${item.name} x${item.qty}${lineTotal}`
          if (item.note && item.note.trim()) {
            const noteLines = item.note.split('\n').map((l: string) => l.trim()).filter(Boolean)
            if (noteLines.length === 1 && !/^\d+\s*\//.test(noteLines[0])) {
              block += ` (${noteLines[0]})`
            } else {
              block += '\n' + noteLines.map((l: string) => `     • ${l}`).join('\n')
            }
          }
          return block
        }).join('\n')
      : '  (Chọn món trực tiếp tại nhà hàng)'

    const totalNum = formStore.calculatedTotals.final || 0
    const depNum = formStore.deposit.amount || 0
    const total = formatVND(totalNum)
    const depositStr = depNum > 0 ? formatVND(depNum) : '0đ'
    const remainingStr = formatVND(Math.max(0, totalNum - depNum))
    const noteText = c.note ? `\n📝 Ghi chú: ${c.note}` : ''
    const bank = appStore.currentBank
    const billLink = typeof window !== 'undefined' && formStore.id
      ? `${window.location.origin}${window.location.pathname}#/bill/${formStore.id}`
      : ''

    const resolvedMode = templateType || (formStore.deposit.isPaid ? 'deposit_confirmed' : 'quote_deposit')
    let template = ''

    if (resolvedMode === 'deposit_confirmed') {
      template = `Dạ chào anh/chị ${c.name} ạ! 😊
King's Grill xác nhận ĐÃ NHẬN CỌC và chốt lịch đặt bàn của anh/chị:

🕐 Thời gian: ${c.time || '--:--'} — ${c.date || '--/--/----'}
👥 Quy mô: ${c.pax || '...'} khách | 📍 Bàn: ${c.tables || 'Chưa xếp'} (${c.type || 'Ăn thường'})

🍽 Thực đơn đã chốt:
${menuText}
💵 Tổng tạm tính: ${total}
✅ Đã nhận cọc: ${depositStr}
💳 Còn lại tạm tính: ${remainingStr}${noteText}${billLink ? `\n🔗 Phiếu điện tử: ${billLink}` : ''}

Nhà hàng đã lên lịch chuẩn bị chu đáo để đón tiếp đoàn mình ạ. Hẹn gặp anh/chị tại King's Grill (34 Hoàng Văn Thụ, P. Thủ Dầu Một)! 🙏`
    } else if (resolvedMode === 'reminder') {
      template = `Dạ chào anh/chị ${c.name} ạ! 🌟
King's Grill xin phép nhắc lịch hẹn đặt bàn của đoàn mình:

🕐 Thời gian đón khách: ${c.time || '--:--'} — ${c.date || '--/--/----'}
👥 Số lượng: ${c.pax || '...'} khách | 📍 Vị trí bàn: ${c.tables || 'Đã chuẩn bị'}
📍 Địa chỉ: 34 Hoàng Văn Thụ, P. Thủ Dầu Một${formStore.staff?.phone ? `\n📞 Hotline đón tiếp: ${formStore.staff.phone} (${formStore.staff.name || 'Lễ tân'})` : ''}

Bàn tiệc và thực đơn của anh/chị đang được bếp chuẩn bị sẵn sàng. Nếu có thay đổi giờ đến hoặc số lượng khách, anh/chị nhắn lại giúp em nhé ạ! ❤️`
    } else {
      const bankSection = bank && bank.number && depNum > 0
        ? `\n\n🏦 Thông tin chuyển khoản giữ bàn:\n• Ngân hàng: ${bank.name} (${bank.bankId})\n• Số TK: ${bank.number}\n• Chủ TK: ${bank.owner}\n• Số tiền cọc: ${depositStr}\n• Nội dung CK: ${depositTransferContent.value}`
        : ''

      template = `Chào anh/chị ${c.name} ạ! 😊
Em gửi thông tin báo giá & giữ bàn tại King's Grill:

🕐 Thời gian: ${c.time || '--:--'} — ${c.date || '--/--/----'}
👥 Số lượng: ${c.pax || '...'} khách | 📍 Bàn dự kiến: ${c.tables || 'Chưa xếp'}

🍽 Thực đơn đặt trước:
${menuText}
💵 Tạm tính: ${total}${depNum > 0 ? `\n💰 Tiền cọc giữ bàn: ${depositStr}` : ''}${noteText}${bankSection}

Anh/chị kiểm tra thông tin giúp em, sau khi chuyển khoản cọc anh/chị gửi ảnh bill để em xuất phiếu xác nhận chính thức nhé ạ! Cảm ơn anh/chị 🙏`
    }

    const labelMap: Record<string, string> = {
      quote_deposit: '📋 Đã copy mẫu Báo giá & Xin cọc giữ bàn!',
      deposit_confirmed: '✅ Đã copy mẫu Xác nhận đã nhận cọc!',
      reminder: '🔔 Đã copy mẫu Nhắc lịch hẹn đón khách!'
    }

    navigator.clipboard.writeText(template).then(() => {
      uiStore.showToast(labelMap[resolvedMode] || '✅ Đã copy nội dung xác nhận!', 'success')
    }).catch(err => {
      uiStore.showToast('Lỗi copy: ' + err, 'error')
    })
  }

  // --- Voice Mode ---
  function toggleVoiceMode() {
    if (!uiStore.isVoiceSupported) {
      return uiStore.showToast('Tính năng giọng nói chưa hỗ trợ trên thiết bị này', 'warning')
    }
    if (uiStore.listening) { 
      uiStore.listening = false
      return 
    }

    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      const recognition = new SpeechRecognition()
      recognition.lang = 'vi-VN'
      recognition.onstart = () => { 
        uiStore.listening = true
        // Play a small pop sound to indicate listening
        import('@/utils/audio').then(m => m.sound.playPop())
      }
      recognition.onend = () => {
        uiStore.listening = false
      }
      recognition.onresult = (e: any) => {
        const transcript = e.results[0][0].transcript
        formStore.rawInput = (formStore.rawInput ? formStore.rawInput + ' ' : '') + transcript
        uiStore.listening = false
        
        // Auto-trigger AI processing
        const { processAI } = useAI()
        processAI()
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

  function fillSampleMenu() {
    if (appStore.menuList.length > 0) {
      const lines = appStore.menuList.map((i: any) => {
        let p = i.price
        if (p && typeof p === 'number' && p >= 1000 && p % 1000 === 0) p = (p / 1000) + 'k'
        let itemStr = `${i.name} - ${p}`
        if (i.desc) {
          const formattedDesc = i.desc.split('\n').map((d: string) => {
            const trimmed = d.trim()
            if (!trimmed) return ''
            return trimmed.startsWith('-') ? trimmed : `- ${trimmed}`
          }).filter((d: string) => d.length > 0).join('\n')
          if (formattedDesc) {
            itemStr += `\n${formattedDesc}`
          }
        }
        return itemStr
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
      formStore.deposit.isManualAmount = true
      formStore.deposit.note = uiStore.verifyModal.scanned.content || 'Manual Verified'
      formStore.deposit.isPaid = true
      // Always update the time to the actual action time
      formStore.deposit.time = new Date().toLocaleString('vi-VN')
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
