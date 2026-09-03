import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useCustomerBooking } from '@/composables/useCustomerBooking'
import {
  CUSTOMER_BOOKING_DRAFT_KEY,
  DEFAULT_BOOKING_ZONE,
  NOTE_PREFIX
} from '@/domain/customerBooking/types'
import { DualWriteOrderRepository } from '@/infrastructure/dual/dualWriteRepository'

// Mock DualWriteOrderRepository
vi.mock('@/infrastructure/dual/dualWriteRepository', () => {
  const MockRepo = vi.fn()
  MockRepo.prototype.saveOrder = vi.fn().mockResolvedValue({ ok: true, id: 'test-order-id' })
  return { DualWriteOrderRepository: MockRepo }
})

describe('Customer Online Booking Module Tests', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  // TEST 01: Autosave & Restore
  it('TEST 01: should autosave form changes to localStorage and restore on reload', async () => {
    const draftData = {
      bookerName: 'Nguyễn Văn A',
      hostName: 'Trần Thị B',
      phone: '0901234567',
      guestCount: 10,
      hasChildren: true,
      childrenCount: 2,
      date: '2026-09-10',
      time: '19:00',
      partyType: 'Sinh nhật',
      customPartyType: '',
      colorTone: 'Vàng',
      note: 'Bàn gần cửa sổ'
    }

    localStorage.setItem(CUSTOMER_BOOKING_DRAFT_KEY, JSON.stringify(draftData))

    const { form, draftRestored } = useCustomerBooking()

    // Chờ mount loadDraft
    expect(form.bookerName).toBe('Nguyễn Văn A')
    expect(form.hostName).toBe('Trần Thị B')
    expect(form.phone).toBe('0901234567')
    expect(form.guestCount).toBe(10)
    expect(form.hasChildren).toBe(true)
    expect(form.childrenCount).toBe(2)
    expect(form.colorTone).toBe('Vàng')
    expect(form.note).toBe('Bàn gần cửa sổ')
    expect(draftRestored.value).toBe(true)
  })

  // TEST 02 & 03: Has Children Toggle
  it('TEST 02 & 03: should validate children count when enabled and reset when disabled', () => {
    const { form, validateForm, errors } = useCustomerBooking()

    form.bookerName = 'Lê Văn C'
    form.phone = '0987654321'
    form.guestCount = 8
    form.date = '2026-09-15'
    form.time = '18:30'
    form.partyType = 'Liên hoan'

    // Chưa bật có trẻ em
    form.hasChildren = false
    expect(validateForm()).toBe(true)
    expect(errors.childrenCount).toBeUndefined()

    // TEST 02: Bật có trẻ em nhưng chưa nhập số lượng
    form.hasChildren = true
    form.childrenCount = ''
    expect(validateForm()).toBe(false)
    expect(errors.childrenCount).toBeDefined()

    // Nhập số trẻ em hợp lệ (vd 3 trẻ em)
    form.childrenCount = 3
    expect(validateForm()).toBe(true)
    expect(errors.childrenCount).toBeUndefined()

    // TEST 03: Tắt có trẻ em -> tự động xóa dữ liệu trẻ em
    form.hasChildren = false
    expect(form.childrenCount).toBe('')
  })

  // TEST 04: Custom Party Type
  it('TEST 04: should require customPartyType when partyType is "Khác"', () => {
    const { form, validateForm, errors } = useCustomerBooking()

    form.bookerName = 'Hoàng Thị D'
    form.phone = '0912345678'
    form.guestCount = 15
    form.date = '2026-09-20'
    form.time = '19:00'

    form.partyType = 'Khác'
    form.customPartyType = ''
    expect(validateForm()).toBe(false)
    expect(errors.customPartyType).toBeDefined()

    form.customPartyType = 'Tiệc hội khóa 10 năm'
    expect(validateForm()).toBe(true)
    expect(errors.customPartyType).toBeUndefined()
  })

  // TEST USER REQUIREMENT: Lượng khách = khách lớn + trẻ em (VD 12 khách + 1 trẻ em -> lưu 13ng)
  it('TEST USER SPEC: should calculate total guests as guestCount + childrenCount (12 + 1 = 13ng)', () => {
    const { form, buildBookingPayload, totalGuestsCount } = useCustomerBooking()

    form.bookerName = 'Lê Thị Thu'
    form.phone = '0988776655'
    form.guestCount = 12
    form.hasChildren = true
    form.childrenCount = 1
    form.date = '2026-09-25'
    form.time = '19:00'
    form.partyType = 'Sinh nhật'

    expect(totalGuestsCount.value).toBe(13)

    const payload = buildBookingPayload()
    // Lưu về spreadsheet: 13ng
    expect(payload.customer.pax).toBe('13ng')
    expect(payload.customer.note).toContain('Gửi qua form - cần sắp bàn')
    expect(payload.customer.note).toContain('Gồm 12 lớn + 1 trẻ em')
    expect(payload.meta.rawDetails.totalGuests).toBe(13)
  })

  // TEST 11: Zone A & Ghi chú bắt đầu bằng "Gửi qua form - cần sắp bàn"
  it('TEST 11: should always assign Zone A and prefix note with "Gửi qua form - cần sắp bàn"', () => {
    const { form, buildBookingPayload } = useCustomerBooking()

    form.bookerName = 'Phạm Văn E'
    form.hostName = ''
    form.phone = '0933112233'
    form.guestCount = 6
    form.hasChildren = false
    form.date = '2026-09-25'
    form.time = '18:00'
    form.partyType = 'Ăn thường'
    form.colorTone = ''
    form.note = ''

    const payload = buildBookingPayload()

    expect(payload.customer.tables).toBe(DEFAULT_BOOKING_ZONE)
    expect(payload.customer.tables).toBe('A')
    expect(payload.customer.pax).toBe('6ng')
    expect(payload.customer.note).toBe(NOTE_PREFIX)
    expect(payload.customer.note).toBe('Gửi qua form - cần sắp bàn')
    expect(payload.customer.name).toBe('PHẠM VĂN E')
  })

  // TEST 12: Note with tone and guest note
  it('TEST 12: should format note correctly when customer specifies tone and notes', () => {
    const { form, buildBookingPayload } = useCustomerBooking()

    form.bookerName = 'Nguyễn Văn A'
    form.hostName = 'Bé Bún'
    form.phone = '0901234567'
    form.guestCount = 12
    form.hasChildren = true
    form.childrenCount = 4
    form.date = '2026-09-28'
    form.time = '19:30'
    form.partyType = 'Sinh nhật'
    form.colorTone = 'Hồng'
    form.note = 'Khách muốn bàn gần sân khấu, có hoa tươi'

    const payload = buildBookingPayload()

    // Kiểm tra tên ghép Người đặt / Chủ tiệc (UPPERCASE)
    expect(payload.customer.name).toBe('NGUYỄN VĂN A / BÉ BÚN')
    expect(payload.customer.tables).toBe('A')
    expect(payload.customer.pax).toBe('16ng')

    // Kiểm tra note cấu trúc: Gửi qua form - cần sắp bàn | Gồm 12 lớn + 4 trẻ em | Tone: Hồng | Khách muốn...
    expect(payload.customer.note).toContain('Gửi qua form - cần sắp bàn')
    expect(payload.customer.note).toContain('Gồm 12 lớn + 4 trẻ em')
    expect(payload.customer.note).toContain('Tone: Hồng')
    expect(payload.customer.note).toContain('Khách muốn bàn gần sân khấu, có hoa tươi')
  })


  // TEST 07 & 08: Single submission & Anti-double click lock
  it('TEST 07 & 08: should lock submissionState and prevent duplicate submit calls', async () => {
    const { form, submitBooking, submissionState } = useCustomerBooking()

    form.bookerName = 'Đặng Văn F'
    form.phone = '0944556677'
    form.guestCount = 4
    form.date = '2026-09-30'
    form.time = '19:00'
    form.partyType = 'Ăn thường'

    // Mock delay
    const saveOrderSpy = vi.spyOn(DualWriteOrderRepository.prototype, 'saveOrder')
      .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 50)))

    const promise1 = submitBooking()
    const promise2 = submitBooking() // Cố tình double click

    const [res1, res2] = await Promise.all([promise1, promise2])

    expect(res1).toBe(true)
    expect(res2).toBe(false) // Request thứ 2 bị chặn ngay tại chỗ
    expect(saveOrderSpy).toHaveBeenCalledTimes(1) // Chỉ gọi server đúng 1 lần
    expect(submissionState.value).toBe('SUCCESS')
  })

  // TEST 09 & 10: Network failure handling
  it('TEST 09 & 10: should preserve draft on network error and allow safe retry', async () => {
    const { form, submitBooking, retrySubmit, submissionState, errorMessage } = useCustomerBooking()

    form.bookerName = 'Vũ Thị G'
    form.phone = '0977889900'
    form.guestCount = 5
    form.date = '2026-10-01'
    form.time = '18:30'
    form.partyType = 'Sinh nhật'
    form.note = 'Yêu cầu phòng mát'

    // Lần 1: Giả lập lỗi mạng
    const saveOrderSpy = vi.spyOn(DualWriteOrderRepository.prototype, 'saveOrder')
      .mockRejectedValueOnce(new Error('Network offline or Gateway timeout'))
      .mockResolvedValueOnce({ ok: true })

    const resFail = await submitBooking()
    expect(resFail).toBe(false)
    expect(submissionState.value).toBe('FAILED')
    expect(errorMessage.value).toContain('Network offline')

    // Dữ liệu form và draft vẫn còn nguyên
    expect(form.bookerName).toBe('Vũ Thị G')
    expect(form.note).toBe('Yêu cầu phòng mát')

    // Lần 2: Khách bấm "Thử gửi lại"
    const resRetry = await retrySubmit()
    expect(resRetry).toBe(true)
    expect(submissionState.value).toBe('SUCCESS')
    expect(saveOrderSpy).toHaveBeenCalledTimes(2)
  })

  // TEST 14 & 15: Clear draft on success & Reset form
  it('TEST 14 & 15: should clear draft on success and reset cleanly for new bookings', async () => {
    const { form, submitBooking, resetForm, submissionState, createdBookingId } = useCustomerBooking()

    form.bookerName = 'Trịnh Văn H'
    form.phone = '0966554433'
    form.guestCount = 10
    form.date = '2026-10-05'
    form.time = '19:00'
    form.partyType = 'Công ty'

    // Lưu draft vào localStorage trước
    localStorage.setItem(CUSTOMER_BOOKING_DRAFT_KEY, JSON.stringify({ bookerName: 'Trịnh Văn H' }))

    vi.spyOn(DualWriteOrderRepository.prototype, 'saveOrder').mockResolvedValue({ ok: true })

    const res = await submitBooking()
    expect(res).toBe(true)
    expect(submissionState.value).toBe('SUCCESS')
    expect(createdBookingId.value).toBeTruthy()

    // Xác nhận draft đã bị xóa khỏi localStorage
    expect(localStorage.getItem(CUSTOMER_BOOKING_DRAFT_KEY)).toBeNull()

    // Bấm đặt đơn mới
    resetForm()
    expect(submissionState.value).toBe('DRAFT')
    expect(form.bookerName).toBe('')
    expect(form.phone).toBe('')
  })
})
