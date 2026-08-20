export type KitchenStation = 'grill' | 'hotpot_stir' | 'cold_seafood' | 'general'

export type KitchenTicketStatus = 'NEW' | 'ACKNOWLEDGED' | 'PREPARING' | 'READY' | 'SERVED'

export interface KitchenTicketDish {
  id: string
  name: string
  quantity: number
  portion?: string
  station: KitchenStation
  notes?: string
  status: 'pending' | 'cooking' | 'done'
}

export interface KitchenOrderTicket {
  ticketId: string
  bookingId: string
  tableCode: string
  eventTime: string
  guestCount: number
  status: KitchenTicketStatus
  specialInstructions?: string
  dishes: KitchenTicketDish[]
  stationCounts: Record<KitchenStation, number>
  acknowledgedAt?: number
  readyAt?: number
  createdAt: number
}

/**
 * Deterministically routes a dish name to its dedicated preparation station.
 */
export function routeDishToStation(dishName: string): KitchenStation {
  const name = dishName.toLowerCase().trim()

  // 1. Grill Station (Bếp Nướng & BBQ)
  if (/nướng|bbq|nướng mỡ hành|nướng phô mai|nướng muối ớt|nướng mọi|quay|chiên giòn|sườn nướng|bò nướng|hàu nướng/i.test(name)) {
    return 'grill'
  }

  // 2. Hotpot & Stir Station (Bếp Lẩu, Xào, Súp, Kho, Hầm)
  if (/lẩu|xào|kho|súp|tiềm|om|cháo|canh|bò lúc lắc|rau muống xào|mì xào|cơm chiên/i.test(name)) {
    return 'hotpot_stir'
  }

  // 3. Cold & Seafood Prep Station (Khai vị nguội, Gỏi, Sashimi, Hải sản hấp)
  if (/gỏi|nộm|sashimi|hấp|tái chanh|salad|nguội|khai vị|cuốn|chả giò/i.test(name)) {
    return 'cold_seafood'
  }

  // 4. General / Desserts / Drinks Station
  return 'general'
}

/**
 * Generates a Kitchen Order Ticket from a booking object.
 */
export function createKitchenTicketFromBooking(booking: any): KitchenOrderTicket {
  const bookingId = String(booking.id || booking.order_id || '')
  const tableCode = booking.booking?.table_number || booking.table_number || booking.tables || 'Chưa gán'
  const eventTime = booking.booking?.event_time || booking.time || '18:00'
  const guestCount = booking.booking?.guest_count ?? booking.guest_count ?? 2
  const rawDishes = booking.menu_items || booking.items || []

  const stationCounts: Record<KitchenStation, number> = {
    grill: 0,
    hotpot_stir: 0,
    cold_seafood: 0,
    general: 0
  }

  const dishes: KitchenTicketDish[] = Array.isArray(rawDishes)
    ? rawDishes.map((it: any, idx: number) => {
        const dishName = it.name || ''
        const station: KitchenStation = (it.station && ['grill', 'hotpot_stir', 'cold_seafood', 'general'].includes(it.station))
          ? (it.station as KitchenStation)
          : routeDishToStation(dishName)
        stationCounts[station] += (it.quantity ?? it.qty ?? 1)

        return {
          id: `kdish_${bookingId}_${idx}`,
          name: dishName,
          quantity: it.quantity ?? it.qty ?? 1,
          portion: it.portion || it.portion_size || '',
          station,
          notes: it.notes || it.kitchen_notes || '',
          status: 'pending'
        }
      })
    : []

  return {
    ticketId: `KT-${bookingId.substring(0, 8).toUpperCase()}`,
    bookingId,
    tableCode,
    eventTime,
    guestCount,
    status: 'NEW',
    specialInstructions: booking.service_notes || booking.special_request || '',
    dishes,
    stationCounts,
    createdAt: Date.now()
  }
}
