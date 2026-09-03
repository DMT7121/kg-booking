/**
 * Types and Constants for Customer Online Booking Module
 * King's Grill Restaurant Operations
 */

export interface CustomerBookingDraft {
  bookerName: string         // Người đặt (Bắt buộc)
  hostName: string           // Chủ tiệc (Không bắt buộc)
  phone: string              // Zalo / SĐT liên hệ (Bắt buộc)
  guestCount: number | ''    // Số lượng khách (Bắt buộc, số nguyên dương)
  hasChildren: boolean       // Có trẻ em đi kèm (Checkbox)
  childrenCount: number | '' // Số trẻ em (Bắt buộc nếu hasChildren = true)
  date: string               // Ngày đặt tiệc: YYYY-MM-DD
  time: string               // Giờ đặt tiệc: HH:MM (24h)
  partyType: string          // Nhu cầu / Loại tiệc
  customPartyType: string    // Nhập tự do khi partyType = 'Khác'
  colorTone: string          // Tông màu mong muốn (Không bắt buộc)
  note: string               // Ghi chú khác
  requestId?: string         // Unique ID chống duplicate
  updatedAt?: string         // Thời điểm autosave
}

export type BookingSubmissionState = 'DRAFT' | 'READY' | 'REVIEWING' | 'SUBMITTING' | 'SUCCESS' | 'FAILED'

export interface SubmittedCustomerDetails {
  bookerName?: string
  hostName?: string
  phone?: string
  totalGuests?: number | string
  adultCount?: number | string
  childrenCount?: number | string
  hasChildren?: boolean
  date?: string
  time?: string
  partyType?: string
  colorTone?: string
  rawNote?: string
}


export interface ColorToneOption {
  name: string
  hex: string
  border?: string
}

export const COLOR_TONES: ColorToneOption[] = [
  { name: 'Đỏ', hex: '#ef4444' },
  { name: 'Vàng', hex: '#eab308' },
  { name: 'Xanh dương', hex: '#3b82f6' },
  { name: 'Xanh lá', hex: '#22c55e' },
  { name: 'Trắng', hex: '#f8fafc', border: '#cbd5e1' },
  { name: 'Hồng', hex: '#ec4899' },
  { name: 'Be', hex: '#d4b996' },
  { name: 'Nâu', hex: '#78350f' }
]

export const CUSTOMER_PARTY_TYPES: string[] = [
  'Sinh nhật',
  'Thôi nôi',
  'Liên hoan',
  'Ăn thường',
  'Công ty',
  'Tiệc chia tay',
  'Kỉ niệm',
  'Khác'
]

export const RESTAURANT_NAME = "NHÀ HÀNG KING's GRILL"
export const CUSTOMER_BOOKING_DRAFT_KEY = 'kg_customer_booking_draft_v1'
export const RESTAURANT_HOTLINE = '0336667301'
export const RESTAURANT_ZALO_URL = 'https://zalo.me/0336667301'
export const DEFAULT_BOOKING_ZONE = 'A' // Luôn khởi tạo ở Khu A để nhân viên sắp bàn sau
export const NOTE_PREFIX = 'Gửi qua form - cần sắp bàn'


