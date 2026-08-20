import { describe, it, expect } from 'vitest'
import { createDecorTicketFromBooking } from '../decorTicket'

describe('Decor Ticket Engine Tests', () => {
  it('should generate decor checklist for birthday party with fresh flowers and board', () => {
    const booking = {
      id: 'bk_decor_1',
      customer: { name: 'Anh Hùng', phone: '0933333333' },
      booking: { table_number: 'VIP01', event_time: '19:00', event_date: '29/08/2026' },
      party: {
        type: 'Sinh nhật',
        owner_name: 'Bé Min',
        decor_color: 'Xanh pastel',
        display_board_text: 'Mừng Bé Min 1 Tuổi',
        mirror_board_text: 'Happy Birthday Min',
        fresh_flowers: 'Bình hoa hồng tươi trên bàn tiệc',
        cake_serving_time: '20h00'
      }
    }

    const ticket = createDecorTicketFromBooking(booking)
    expect(ticket.ticketId).toBeDefined()
    expect(ticket.status).toBe('CONFIRMED')
    expect(ticket.checklist.length).toBe(5)
    expect(ticket.checklist.some(c => c.label.includes('Gương'))).toBe(true)
    expect(ticket.checklist.some(c => c.label.includes('Hoa tươi'))).toBe(true)
    expect(ticket.checklist.some(c => c.label.includes('bánh kem'))).toBe(true)
  })

  it('should return NOT_REQUIRED for standard non-party bookings', () => {
    const booking = {
      id: 'bk_regular',
      customer: { name: 'Chị Lan' },
      booking: { need: 'Ăn thường' }
    }

    const ticket = createDecorTicketFromBooking(booking)
    expect(ticket.status).toBe('NOT_REQUIRED')
    expect(ticket.checklist.length).toBe(0)
  })
})
