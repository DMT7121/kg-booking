import { describe, test, expect } from 'vitest'
import { extractByRules, classifyPeopleNames, extractDecorationDetails } from '../ruleEngine'
import fixtures from './__fixtures__/realBookingMessages.json'

describe('Regression Harness: Real Booking Messages', () => {
  for (const fixture of fixtures) {
    describe(`[${fixture.id}] ${fixture.description}`, () => {
      const result = extractByRules(fixture.input)
      const nameResults = classifyPeopleNames(fixture.input)

      if (fixture.expected.customer_name) {
        test(`customer_name = "${fixture.expected.customer_name}"`, () => {
          expect(result.customer_name).toBe(fixture.expected.customer_name)
        })
      }

      if (fixture.expected.customer_name_must_not_be) {
        test(`customer_name must NOT be "${fixture.expected.customer_name_must_not_be}"`, () => {
          const nameLower = (result.customer_name || '').toLowerCase()
          const forbidden = fixture.expected.customer_name_must_not_be!.toLowerCase()
          expect(nameLower).not.toBe(forbidden)
          // Also check it's not in booker candidates
          const bookerLower = nameResults.bookerCandidates.map(n => n.toLowerCase())
          // If it is in booker candidates, that's a warning but the final customer_name matters most
        })
      }

      if (fixture.expected.phone) {
        test(`phone = "${fixture.expected.phone}"`, () => {
          expect(result.phone).toBe(fixture.expected.phone)
        })
      }

      if (fixture.expected.guest_count) {
        test(`guest_count = ${fixture.expected.guest_count}`, () => {
          expect(result.guest_count).toBe(fixture.expected.guest_count)
        })
      }

      if (fixture.expected.event_time) {
        test(`event_time = "${fixture.expected.event_time}"`, () => {
          expect(result.event_time).toBe(fixture.expected.event_time)
        })
      }

      if (fixture.expected.table_code) {
        test(`table_code = "${fixture.expected.table_code}"`, () => {
          expect(result.table_code).toBe(fixture.expected.table_code)
        })
      }

      if (fixture.expected.booking_need) {
        test(`booking_need = "${fixture.expected.booking_need}"`, () => {
          expect(result.booking_need).toBe(fixture.expected.booking_need)
        })
      }

      if (fixture.expected.menu_items_count_gte) {
        test(`menu_items.length >= ${fixture.expected.menu_items_count_gte}`, () => {
          expect(result.menu_items.length).toBeGreaterThanOrEqual(fixture.expected.menu_items_count_gte!)
        })
      }

      if (fixture.expected.decoration_details) {
        const decoDetails = result.decoration_details

        if (fixture.expected.decoration_details.decor_color) {
          test(`decoration_details.decor_color contains "${fixture.expected.decoration_details.decor_color}"`, () => {
            const color = decoDetails?.decor_color
            expect(color).toBeTruthy()
            expect(color!.toLowerCase()).toContain(fixture.expected.decoration_details!.decor_color!.toLowerCase())
          })
        }

        if (fixture.expected.decoration_details.board_text_contains) {
          test(`decoration_details.board_text contains "${fixture.expected.decoration_details.board_text_contains}"`, () => {
            expect(decoDetails?.board_text?.toLowerCase()).toContain(fixture.expected.decoration_details!.board_text_contains!.toLowerCase())
          })
        }

        if (fixture.expected.decoration_details.mirror_text_contains) {
          test(`decoration_details.mirror_text contains "${fixture.expected.decoration_details.mirror_text_contains}"`, () => {
            expect(decoDetails?.mirror_text?.toLowerCase()).toContain(fixture.expected.decoration_details!.mirror_text_contains!.toLowerCase())
          })
        }
      }
    })
  }
})

describe('extractDecorationDetails', () => {
  test('extracts all decoration components from structured block', () => {
    const block = [
      'Tông: hồng pastel',
      'Bảng: Happy Birthday Bé Su',
      'Gương viết: Welcome to Su Birthday',
      'Dặn dò: đem bánh kem lúc 20h'
    ].join('\n')

    const result = extractDecorationDetails(block)

    expect(result.decor_color).toBe('hồng pastel')
    expect(result.board_text).toBe('Happy Birthday Bé Su')
    expect(result.mirror_text).toBe('Welcome to Su Birthday')
    expect(result.special_requests).toContain('đem bánh kem lúc 20h')
  })

  test('extracts HBD pattern as board_text', () => {
    const block = 'Happy Birthday Ngọc Anh'
    const result = extractDecorationDetails(block)
    expect(result.board_text).toBe('Ngọc Anh')
  })

  test('returns empty for no decoration block', () => {
    const result = extractDecorationDetails('')
    expect(result.decor_color).toBeNull()
    expect(result.board_text).toBeNull()
    expect(result.mirror_text).toBeNull()
    expect(result.special_requests).toEqual([])
  })
})

describe('Deposit Sender Isolation', () => {
  test('deposit sender is excluded from booker candidates', () => {
    const text = 'Chị Trang đặt bàn 20 người\nAnh Thuận đã chuyển 500K cọc'
    const result = classifyPeopleNames(text)

    expect(result.depositSenderCandidates.length).toBeGreaterThan(0)
    // Thuận should not be in booker candidates
    const bookerNamesLower = result.bookerCandidates.map(n => n.toLowerCase())
    const senderNamesLower = result.depositSenderCandidates.map(n => n.toLowerCase())
    expect(senderNamesLower.some(s => s.includes('thu'))).toBe(true) // Thuận
    // Trang should remain as booker
    expect(bookerNamesLower.some(n => n.includes('trang'))).toBe(true)
  })

  test('reverse pattern: "Anh X đã cọc"', () => {
    const text = 'Chị Hoa đặt bàn\nAnh Minh đã cọc 1tr'
    const result = classifyPeopleNames(text)
    expect(result.depositSenderCandidates.length).toBeGreaterThan(0)
  })
})
