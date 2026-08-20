export type DecorTicketStatus =
  | 'NOT_REQUIRED'
  | 'WAITING_CONFIRMATION'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'READY'
  | 'COMPLETED'

export interface DecorChecklistItem {
  id: string
  label: string
  detail: string
  completed: boolean
  required: boolean
}

export interface DecorTicket {
  ticketId: string
  bookingId: string
  customerName: string
  phone: string
  partyOwnerName?: string
  partyType: string
  eventDate: string
  eventTime: string
  tableCode: string
  status: DecorTicketStatus
  themeColor?: string
  displayBoardText?: string
  mirrorBoardText?: string
  freshFlowers?: string
  balloons?: string
  cakeServingTime?: string
  notes?: string
  checklist: DecorChecklistItem[]
  createdAt: number
}

/**
 * Generates a Decor Execution Ticket and checklist from a booking object.
 */
export function createDecorTicketFromBooking(booking: any): DecorTicket {
  const bookingId = String(booking.id || booking.order_id || '')
  const party = booking.party || {}
  const decor = booking.decoration || {}
  const partyType = party.type || booking.booking?.need || 'Ăn thường'
  const isParty = /sinh nhật|thôi nôi|đầy tháng|công ty|kỷ niệm|tiệc|hbd/i.test(partyType)

  const themeColor = party.decor_color || decor.decor_color || ''
  const displayBoardText = party.display_board_text || party.text_on_board || decor.text_on_board || ''
  const mirrorBoardText = party.mirror_board_text || decor.mirror_board_text || ''
  const freshFlowers = party.fresh_flowers || decor.fresh_flowers || ''
  const balloons = party.balloons || decor.balloons || ''
  const cakeServingTime = party.cake_serving_time || decor.cake_serving_time || ''

  const checklist: DecorChecklistItem[] = []

  if (isParty) {
    checklist.push({
      id: 'chk_board',
      label: 'Bảng chào mừng / Backdrop',
      detail: displayBoardText || 'Chưa chốt nội dung bảng',
      completed: false,
      required: true
    })

    if (mirrorBoardText) {
      checklist.push({
        id: 'chk_mirror',
        label: 'Gương viết chữ nghệ thuật',
        detail: mirrorBoardText,
        completed: false,
        required: true
      })
    }

    if (freshFlowers) {
      checklist.push({
        id: 'chk_flowers',
        label: 'Hoa tươi trang trí bàn tiệc',
        detail: freshFlowers,
        completed: false,
        required: true
      })
    }

    if (balloons || themeColor) {
      checklist.push({
        id: 'chk_balloons',
        label: 'Bong bóng theo tông màu',
        detail: `Tông màu: ${themeColor || 'Tự do'} - ${balloons || 'Bóng chùm bàn'}`,
        completed: false,
        required: true
      })
    }

    if (cakeServingTime) {
      checklist.push({
        id: 'chk_cake',
        label: 'Bảo quản & Lên bánh kem',
        detail: `Thời gian phục vụ bánh: ${cakeServingTime}`,
        completed: false,
        required: false
      })
    }
  }

  let status: DecorTicketStatus = 'NOT_REQUIRED'
  if (isParty) {
    if (!displayBoardText && !themeColor) {
      status = 'WAITING_CONFIRMATION'
    } else {
      status = 'CONFIRMED'
    }
  }

  return {
    ticketId: `DT-${bookingId.substring(0, 8).toUpperCase()}`,
    bookingId,
    customerName: booking.customer?.name || booking.customer_name || '',
    phone: booking.customer?.phone || booking.phone || '',
    partyOwnerName: party.owner_name || '',
    partyType,
    eventDate: booking.booking?.event_date || booking.date || '',
    eventTime: booking.booking?.event_time || booking.time || '',
    tableCode: booking.booking?.table_number || booking.table_number || booking.tables || '',
    status,
    themeColor,
    displayBoardText,
    mirrorBoardText,
    freshFlowers,
    balloons,
    cakeServingTime,
    notes: party.decor_note || decor.notes || '',
    checklist,
    createdAt: Date.now()
  }
}
