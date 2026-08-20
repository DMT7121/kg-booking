export type BEOLifecycleStatus = 'DRAFT' | 'REVIEW' | 'CONFIRMED' | 'DISTRIBUTED' | 'IN_EXECUTION' | 'COMPLETED'

export interface BEOMenuItem {
  name: string
  quantity: number
  portion?: string
  unit_price?: number
  kitchenNotes?: string
  station?: 'grill' | 'hotpot_stir' | 'cold_seafood' | 'general'
}

export interface BEOItem {
  id: string
  bookingId: string
  version: number
  status: BEOLifecycleStatus
  general: {
    eventDate: string
    eventTime: string
    guestCount: number
    tableNumber: string
    partyType: string
    customerName: string
    phone: string
    partyOwnerName?: string
  }
  menu: {
    items: BEOMenuItem[]
    specialServiceInstructions?: string
    cakeServingTime?: string
  }
  decoration: {
    themeColor?: string
    displayBoardText?: string
    mirrorBoardText?: string
    freshFlowers?: string
    balloons?: string
    backdrop?: string
    setupDeadline?: string
    notes?: string
  }
  deposit: {
    amount: number
    status: string
    reconciled: boolean
  }
  isUpdatedAfterDistribution?: boolean
  updateHighlights?: string[]
  createdAt: number
  updatedAt: number
}

/**
 * Builds a standardized BEO (Banquet Event Order) from a booking object.
 */
export function buildBEOFromBooking(booking: any, previousBEO?: BEOItem): BEOItem {
  const bookingId = String(booking.id || booking.order_id || `beo_${Date.now()}`)
  const rawItems = booking.menu_items || booking.items || []
  
  const menuItems: BEOMenuItem[] = Array.isArray(rawItems)
    ? rawItems.map((it: any) => ({
        name: it.name || '',
        quantity: it.quantity ?? it.qty ?? 1,
        portion: it.portion || it.portion_size || '',
        unit_price: it.unit_price ?? it.price ?? 0,
        kitchenNotes: it.notes || it.kitchen_notes || ''
      }))
    : []

  const party = booking.party || {}
  const decor = booking.decoration || {}

  const currentVersion = previousBEO ? previousBEO.version + 1 : 1
  let isUpdatedAfterDistribution = false
  const updateHighlights: string[] = []

  // Check if BEO was previously distributed and key fields changed
  if (previousBEO && (previousBEO.status === 'DISTRIBUTED' || previousBEO.status === 'IN_EXECUTION')) {
    const prevGuest = previousBEO.general.guestCount
    const newGuest = booking.booking?.guest_count ?? booking.guest_count ?? 0
    if (prevGuest !== newGuest) {
      isUpdatedAfterDistribution = true
      updateHighlights.push(`Số khách thay đổi: ${prevGuest} -> ${newGuest}`)
    }

    const prevMenuCount = previousBEO.menu.items.reduce((s, i) => s + i.quantity, 0)
    const newMenuCount = menuItems.reduce((s, i) => s + i.quantity, 0)
    if (prevMenuCount !== newMenuCount || JSON.stringify(previousBEO.menu.items) !== JSON.stringify(menuItems)) {
      isUpdatedAfterDistribution = true
      updateHighlights.push('Danh sách món hoặc số lượng món đã được cập nhật.')
    }
  }

  const beo: BEOItem = {
    id: previousBEO ? previousBEO.id : `BEO-${bookingId.substring(0, 8).toUpperCase()}`,
    bookingId,
    version: currentVersion,
    status: previousBEO ? previousBEO.status : 'DRAFT',
    general: {
      eventDate: booking.booking?.event_date || booking.date || '',
      eventTime: booking.booking?.event_time || booking.time || '',
      guestCount: booking.booking?.guest_count ?? booking.guest_count ?? 2,
      tableNumber: booking.booking?.table_number || booking.table_number || booking.tables || '',
      partyType: party.type || booking.booking?.need || 'Ăn thường',
      customerName: booking.customer?.name || booking.customer_name || '',
      phone: booking.customer?.phone || booking.phone || '',
      partyOwnerName: party.owner_name || party.honoree || ''
    },
    menu: {
      items: menuItems,
      specialServiceInstructions: booking.service_notes || booking.special_request || '',
      cakeServingTime: party.cake_serving_time || decor.cake_serving_time || ''
    },
    decoration: {
      themeColor: party.decor_color || decor.decor_color || '',
      displayBoardText: party.display_board_text || party.text_on_board || decor.text_on_board || '',
      mirrorBoardText: party.mirror_board_text || decor.mirror_board_text || '',
      freshFlowers: party.fresh_flowers || decor.fresh_flowers || '',
      balloons: party.balloons || decor.balloons || '',
      backdrop: party.backdrop || decor.backdrop || '',
      setupDeadline: party.setup_deadline || decor.setup_deadline || '',
      notes: party.decor_note || decor.notes || ''
    },
    deposit: {
      amount: booking.deposit?.amount ?? booking.deposit_amount ?? 0,
      status: booking.deposit?.status || booking.deposit_status || 'chờ cọc',
      reconciled: !!booking.deposit?.reconciled
    },
    isUpdatedAfterDistribution,
    updateHighlights,
    createdAt: previousBEO ? previousBEO.createdAt : Date.now(),
    updatedAt: Date.now()
  }

  return beo
}

/**
 * Transitions BEO lifecycle status safely.
 */
export function transitionBEOStatus(beo: BEOItem, targetStatus: BEOLifecycleStatus): BEOItem {
  const next = { ...beo }
  next.status = targetStatus
  next.updatedAt = Date.now()
  if (targetStatus === 'DISTRIBUTED') {
    next.isUpdatedAfterDistribution = false
    next.updateHighlights = []
  }
  return next
}
