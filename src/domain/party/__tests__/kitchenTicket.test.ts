import { describe, it, expect } from 'vitest'
import { routeDishToStation, createKitchenTicketFromBooking } from '../kitchenTicket'

describe('Kitchen Ticket & Station Routing Tests', () => {
  it('should accurately route dishes to the correct kitchen stations', () => {
    expect(routeDishToStation('5 con hàu nướng phô mai')).toBe('grill')
    expect(routeDishToStation('Sườn bò nướng sốt cay')).toBe('grill')
    expect(routeDishToStation('Lẩu riêu cua bắp bò')).toBe('hotpot_stir')
    expect(routeDishToStation('Rau muống xào tỏi')).toBe('hotpot_stir')
    expect(routeDishToStation('Gỏi bò bóp thấu')).toBe('cold_seafood')
    expect(routeDishToStation('Tôm sú hấp nước dừa')).toBe('cold_seafood')
    expect(routeDishToStation('Trái cây tráng miệng')).toBe('general')
  })

  it('should generate a complete Kitchen Order Ticket with station tallies', () => {
    const booking = {
      id: 'bk_kitchen_1',
      booking: { table_number: 'VIP02', event_time: '19:15', guest_count: 8 },
      menu_items: [
        { name: '10 con hàu nướng mỡ hành', quantity: 2 },
        { name: 'Lẩu nấm gà ta', quantity: 1 },
        { name: 'Gỏi ngó sen tôm thịt', quantity: 1 }
      ]
    }

    const ticket = createKitchenTicketFromBooking(booking)
    expect(ticket.ticketId).toBeDefined()
    expect(ticket.tableCode).toBe('VIP02')
    expect(ticket.dishes.length).toBe(3)
    expect(ticket.stationCounts.grill).toBe(2)
    expect(ticket.stationCounts.hotpot_stir).toBe(1)
    expect(ticket.stationCounts.cold_seafood).toBe(1)
  })
})
