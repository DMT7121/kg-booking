import { ref, reactive, watch, onMounted, getCurrentInstance, computed } from 'vue'
import {
  type CustomerBookingDraft,
  type BookingSubmissionState,
  CUSTOMER_BOOKING_DRAFT_KEY,
  DEFAULT_BOOKING_ZONE,
  NOTE_PREFIX,
  RESTAURANT_HOTLINE
} from '@/domain/customerBooking/types'
import { cleanPhoneNumber, generateBookingId, escapeHtml } from '@/utils'
import { DualWriteOrderRepository } from '@/infrastructure/dual/dualWriteRepository'

const orderRepo = new DualWriteOrderRepository()

function getTodayIsoDate(): string {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getTomorrowIsoDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function convertIsoToDisplayDate(isoDate: string): string {
  if (!isoDate) return ''
  const parts = isoDate.split('-')
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`
  }
  return isoDate
}

export function useCustomerBooking() {
  const form = reactive<CustomerBookingDraft>({
    bookerName: '',
    hostName: '',
    phone: '',
    guestCount: '',
    hasChildren: false,
    childrenCount: '',
    date: getTomorrowIsoDate(),
    time: '18:30',
    partyType: 'Sinh nhật',
    customPartyType: '',
    colorTone: '',
    note: '',
    requestId: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    updatedAt: new Date().toISOString()
  })

  const submissionState = ref<BookingSubmissionState>('DRAFT')
  const errors = reactive<Record<string, string>>({})
  const draftRestored = ref(false)
  const createdBookingId = ref('')
  const submittedData = ref<any>(null)
  const submittedAt = ref('')
  const errorMessage = ref('')

  // --- Autosave Debounce Engine ---
  let autosaveTimer: any = null

  function saveDraft() {
    if (submissionState.value === 'SUCCESS') return
    try {
      form.updatedAt = new Date().toISOString()
      const draftData = JSON.stringify(form)
      localStorage.setItem(CUSTOMER_BOOKING_DRAFT_KEY, draftData)
    } catch (e) {
      console.warn('[CustomerBooking] Không thể lưu draft vào localStorage:', e)
    }
  }

  function clearDraft() {
    try {
      localStorage.removeItem(CUSTOMER_BOOKING_DRAFT_KEY)
    } catch (e) {
      console.warn('[CustomerBooking] Không thể xóa draft:', e)
    }
  }

  function loadDraft() {
    try {
      const saved = localStorage.getItem(CUSTOMER_BOOKING_DRAFT_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed && typeof parsed === 'object') {
          if (parsed.bookerName !== undefined) form.bookerName = parsed.bookerName
          if (parsed.hostName !== undefined) form.hostName = parsed.hostName
          if (parsed.phone !== undefined) form.phone = parsed.phone
          if (parsed.guestCount !== undefined) form.guestCount = parsed.guestCount
          if (parsed.hasChildren !== undefined) form.hasChildren = parsed.hasChildren
          if (parsed.childrenCount !== undefined) form.childrenCount = parsed.childrenCount
          if (parsed.date) {
            // Không khôi phục ngày trong quá khứ
            const today = getTodayIsoDate()
            form.date = parsed.date < today ? today : parsed.date
          }
          if (parsed.time) form.time = parsed.time
          if (parsed.partyType) form.partyType = parsed.partyType
          if (parsed.customPartyType !== undefined) form.customPartyType = parsed.customPartyType
          if (parsed.colorTone !== undefined) form.colorTone = parsed.colorTone
          if (parsed.note !== undefined) form.note = parsed.note
          if (parsed.requestId) form.requestId = parsed.requestId

          // Nếu có ít nhất 1 trường có dữ liệu, hiển thị thông báo khôi phục
          if (form.bookerName || form.phone || form.guestCount || form.note) {
            draftRestored.value = true
          }
        }
      }
    } catch (e) {
      console.warn('[CustomerBooking] Không thể đọc draft:', e)
    }
  }

  // Watcher tự động lưu draft sau 400ms debounce
  watch(
    form,
    () => {
      if (submissionState.value === 'SUCCESS') return
      if (autosaveTimer) clearTimeout(autosaveTimer)
      autosaveTimer = setTimeout(() => {
        saveDraft()
      }, 400)
    },
    { deep: true }
  )

  // Xử lý logic trẻ em
  watch(
    () => form.hasChildren,
    (val) => {
      if (!val) {
        form.childrenCount = ''
        delete errors.childrenCount
      }
    },
    { flush: 'sync' }
  )


  // --- Validation ---
  function validateForm(): boolean {
    // Reset errors
    Object.keys(errors).forEach((key) => delete errors[key])

    let isValid = true

    // 1. Người đặt
    const trimmedBooker = (form.bookerName || '').trim()
    if (!trimmedBooker) {
      errors.bookerName = 'Vui lòng nhập tên người đặt'
      isValid = false
    } else if (trimmedBooker.length < 2) {
      errors.bookerName = 'Tên người đặt tối thiểu 2 ký tự'
      isValid = false
    } else if (trimmedBooker.length > 80) {
      errors.bookerName = 'Tên người đặt không quá 80 ký tự'
      isValid = false
    }

    // 2. SĐT / Zalo
    const trimmedPhone = (form.phone || '').trim()
    if (!trimmedPhone) {
      errors.phone = 'Vui lòng nhập số điện thoại hoặc Zalo liên hệ'
      isValid = false
    } else {
      const cleaned = cleanPhoneNumber(trimmedPhone)
      // Chấp nhận SĐT Việt Nam: 10 số bắt đầu bằng 03, 05, 07, 08, 09 hoặc 11 số nếu có mã quốc gia
      const vnPhoneRegex = /^(0|\+84)(3|5|7|8|9)[0-9]{8}$/
      if (!vnPhoneRegex.test(cleaned)) {
        errors.phone = 'Số điện thoại không hợp lệ (ví dụ: 0901234567)'
        isValid = false
      }
    }

    // 3. Số lượng khách
    const paxNum = Number(form.guestCount)
    if (!form.guestCount || isNaN(paxNum) || paxNum <= 0 || !Number.isInteger(paxNum)) {
      errors.guestCount = 'Vui lòng nhập số lượng khách (nguyên dương)'
      isValid = false
    } else if (paxNum > 200) {
      errors.guestCount = 'Với đoàn trên 200 khách, vui lòng liên hệ trực tiếp hotline để được phục vụ tốt nhất'
      isValid = false
    }

    // 4. Số trẻ em (khi khai báo, trẻ em sẽ cộng thêm vào tổng khách)
    if (form.hasChildren) {
      const childNum = Number(form.childrenCount)
      if (form.childrenCount === '' || isNaN(childNum) || childNum < 0 || !Number.isInteger(childNum)) {
        errors.childrenCount = 'Vui lòng nhập số trẻ em (>= 0)'
        isValid = false
      }
    }

    // 5. Ngày đặt bàn
    if (!form.date) {
      errors.date = 'Vui lòng chọn ngày đặt tiệc'
      isValid = false
    } else {
      const today = getTodayIsoDate()
      if (form.date < today) {
        errors.date = 'Không thể chọn ngày trong quá khứ'
        isValid = false
      }
    }

    // 6. Giờ đặt bàn
    if (!form.time) {
      errors.time = 'Vui lòng chọn giờ đặt tiệc'
      isValid = false
    } else {
      const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/
      if (!timeRegex.test(form.time)) {
        errors.time = 'Định dạng giờ không hợp lệ (HH:MM)'
        isValid = false
      }
    }

    // 7. Loại tiệc
    if (!form.partyType) {
      errors.partyType = 'Vui lòng chọn loại tiệc'
      isValid = false
    } else if (form.partyType === 'Khác') {
      const trimmedCustom = (form.customPartyType || '').trim()
      if (!trimmedCustom) {
        errors.customPartyType = 'Vui lòng ghi rõ loại tiệc của quý khách'
        isValid = false
      } else if (trimmedCustom.length > 50) {
        errors.customPartyType = 'Tên loại tiệc không quá 50 ký tự'
        isValid = false
      }
    }

    // 8. Ghi chú
    if (form.note && form.note.length > 500) {
      errors.note = 'Ghi chú tối đa 500 ký tự'
      isValid = false
    }

    return isValid
  }

  // --- Normalizer sang Booking Model ---
  function buildBookingPayload(): any {
    const orderId = generateBookingId()
    const cleanedPhone = cleanPhoneNumber(form.phone)
    const displayDate = convertIsoToDisplayDate(form.date)

    // Chuẩn hóa tên: Người đặt / Chủ tiệc (UPPERCASE)
    const booker = (form.bookerName || '').trim().toUpperCase()
    const host = (form.hostName || '').trim().toUpperCase()
    const customerName = host ? `${booker} / ${host}` : booker

    // Chuẩn hóa loại tiệc
    const finalPartyType = form.partyType === 'Khác' ? (form.customPartyType || '').trim() : form.partyType

    // TÍNH TOÁN LƯỢNG KHÁCH: Khách lớn + Trẻ em = Tổng khách lưu Spreadsheet
    const adultCount = Number(form.guestCount) || 0
    const childCount = (form.hasChildren && Number(form.childrenCount) > 0) ? Number(form.childrenCount) : 0
    const totalGuests = adultCount + childCount

    // Chuẩn hóa ghi chú: Luôn bắt đầu bằng "Gửi qua form - cần sắp bàn"
    const noteParts: string[] = [NOTE_PREFIX]

    if (form.hasChildren && childCount > 0) {
      noteParts.push(`Gồm ${adultCount} lớn + ${childCount} trẻ em`)
    }

    if (form.colorTone) {
      noteParts.push(`Tone: ${form.colorTone}`)
    }

    if (form.note && form.note.trim()) {
      noteParts.push(escapeHtml(form.note.trim()))
    }

    const finalNote = noteParts.join(' | ')

    // Số khách lưu về spreadsheet (VD 12 khách + 1 trẻ em -> lưu 13ng)
    const paxString = `${totalGuests}ng`

    return {
      id: orderId,
      customer: {
        name: customerName,
        phone: cleanedPhone,
        date: displayDate,
        time: form.time,
        pax: paxString,
        tables: DEFAULT_BOOKING_ZONE, // Luôn khởi tạo ở Khu A
        type: finalPartyType || 'Ăn thường',
        note: finalNote
      },
      items: [],
      deposit: {
        amount: 0,
        isPaid: false,
        note: 'Chờ nhà hàng xác nhận',
        image: null,
        time: ''
      },
      staff: {
        name: 'Online Guest',
        phone: RESTAURANT_HOTLINE
      },
      total: 0,
      meta: {
        source: 'CUSTOMER_ONLINE_FORM',
        requestId: form.requestId,
        version: '1.0',
        submittedAt: new Date().toISOString(),
        rawDetails: {
          bookerName: form.bookerName,
          hostName: form.hostName,
          colorTone: form.colorTone,
          hasChildren: form.hasChildren,
          childrenCount: form.childrenCount,
          adultCount: form.guestCount,
          totalGuests: totalGuests,
          rawNote: form.note
        }
      }
    }
  }


  // --- Submission Pipeline ---
  async function submitBooking(): Promise<boolean> {
    // Chống duplicate / double-click
    if (submissionState.value === 'SUBMITTING') {
      return false
    }

    if (!validateForm()) {
      submissionState.value = 'DRAFT'
      return false
    }

    submissionState.value = 'SUBMITTING'
    errorMessage.value = ''

    try {
      const payload = buildBookingPayload()

      // Gửi qua repository hiện có
      const result = await orderRepo.saveOrder(payload)

      if (result && result.ok) {
        createdBookingId.value = payload.id
        submittedData.value = payload
        submittedAt.value = new Date().toISOString()
        submissionState.value = 'SUCCESS'

        // Xóa draft sau khi đã xác nhận lưu thành công
        clearDraft()
        return true
      } else {
        throw new Error(result?.message || 'Không nhận được phản hồi thành công từ hệ thống')
      }
    } catch (err: any) {
      console.error('[CustomerBooking] Lỗi khi gửi đơn đặt bàn:', err)
      submissionState.value = 'FAILED'
      errorMessage.value = err.message || 'Kết nối đang không ổn định. Thông tin quý khách đã nhập vẫn được lưu trên thiết bị. Vui lòng thử gửi lại.'
      return false
    }
  }

  // --- Retry Submission ---
  async function retrySubmit(): Promise<boolean> {
    return submitBooking()
  }

  // --- Reset Form cho đơn mới ---
  function resetForm() {
    form.bookerName = ''
    form.hostName = ''
    form.phone = ''
    form.guestCount = ''
    form.hasChildren = false
    form.childrenCount = ''
    form.date = getTomorrowIsoDate()
    form.time = '18:30'
    form.partyType = 'Sinh nhật'
    form.customPartyType = ''
    form.colorTone = ''
    form.note = ''
    form.requestId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    form.updatedAt = new Date().toISOString()

    submissionState.value = 'DRAFT'
    createdBookingId.value = ''
    submittedData.value = null
    submittedAt.value = ''
    errorMessage.value = ''
    draftRestored.value = false
    Object.keys(errors).forEach((key) => delete errors[key])

    clearDraft()
  }

  // Nạp draft ngay khi khởi tạo
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    loadDraft()
  }

  if (getCurrentInstance()) {
    onMounted(() => {
      loadDraft()
    })
  }



  const totalGuestsCount = computed(() => {
    const adult = Number(form.guestCount) || 0
    const child = (form.hasChildren && Number(form.childrenCount) > 0) ? Number(form.childrenCount) : 0
    return adult + child
  })

  return {
    form,
    submissionState,
    errors,
    draftRestored,
    createdBookingId,
    submittedData,
    submittedAt,
    errorMessage,
    totalGuestsCount,
    validateForm,
    submitBooking,
    retrySubmit,
    resetForm,
    loadDraft,
    buildBookingPayload,
    convertIsoToDisplayDate,
    getTodayIsoDate,
    getTomorrowIsoDate
  }
}


