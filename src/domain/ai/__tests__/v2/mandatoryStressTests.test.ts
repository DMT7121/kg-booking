import { describe, it, expect } from 'vitest'
import { analyzeBookingIntelligenceV2 } from '../../v2/bookingIntelligenceV2'
import goldenData from './booking-nlu-golden.json'

describe("KING'S GRILL BOOKING INTELLIGENCE V2 - MANDATORY STRESS TESTS", () => {
  it('CASE 1 - Amendment loop for guest count and time with staff confirmation turn', () => {
    const fixture = goldenData.cases.find(c => c.id === 'case_1_amendment_loop')!
    const result = analyzeBookingIntelligenceV2(fixture.input)

    expect(result.state.customer.name).toBe('Lan')
    expect(result.state.party.owner_name).toBe('Bảo')
    expect(result.state.party.type).toBe('Sinh nhật')
    expect(result.state.booking.guest_count).toBe(13)
    expect(result.state.booking.event_time).toBe('19:00')
    expect(result.state.booking.need).toBe('Sinh nhật')

    // Must not produce
    expect(result.state.booking.guest_count).not.toBe(15)
    expect(result.state.booking.guest_count).not.toBe(12)
    expect(result.state.booking.event_time).not.toBe('19:30')
  })

  it('CASE 2 - Clear separation of Booker, Party Owner, Contact Person, Deposit Sender', () => {
    const fixture = goldenData.cases.find(c => c.id === 'case_2_role_distinction')!
    const result = analyzeBookingIntelligenceV2(fixture.input)

    expect(result.state.customer.name).toBe('Thu')
    expect(result.state.customer.phone).toBe('0901234567')
    expect(result.state.customer.contact_person).toBe('Hùng')
    expect(result.state.party.owner_name).toBe('Minh')
    expect(result.state.party.type).toBe('Sinh nhật')
    expect(result.state.deposit.sender_name).toBe('Trần Quốc Nam')
    expect(result.state.deposit.transfer_note).toBe('NAM SN MINH')
    expect(result.state.booking.guest_count).toBe(13)
    expect(result.state.booking.adults).toBe(10)
    expect(result.state.booking.children).toBe(3)

    // Must not produce
    expect(result.state.customer.name).not.toBe('Minh')
    expect(result.state.customer.name).not.toBe('Trần Quốc Nam')
  })

  it('CASE 3 - Menu typos, recommendation intent, and conditional request', () => {
    const fixture = goldenData.cases.find(c => c.id === 'case_3_menu_resolution_conditional')!
    const result = analyzeBookingIntelligenceV2(fixture.input)

    const items = result.state.menu.items
    expect(items.some(i => i.name === 'Lẩu Thái' && i.quantity === 2)).toBe(true)
    expect(items.some(i => i.name === 'Bò lúc lắc' && i.quantity === 1)).toBe(true)

    expect(result.state.menu.recommendation_intents).toHaveLength(1)
    expect(result.state.menu.recommendation_intents[0].query).toBe('gà nướng')
    expect(result.state.menu.recommendation_intents[0].criteria).toBe('bán chạy')
    expect(result.state.menu.recommendation_intents[0].quantity).toBe(2)

    expect(result.state.menu.conditional_requests).toHaveLength(1)
    expect(result.state.menu.conditional_requests[0].condition).toBe('có set 4 người ăn bò ngon')
    expect(result.state.menu.conditional_requests[0].ifTrueAction).toBe('đổi bò lúc lắc sang set đó')
    expect(result.state.menu.conditional_requests[0].ifFalseAction).toBe('giữ món cũ')
  })

  it('CASE 4 - Multiple operational constraints: Capacity exceeded, Children in smoking area, Allergy conflict', () => {
    const fixture = goldenData.cases.find(c => c.id === 'case_4_operational_conflicts')!
    const result = analyzeBookingIntelligenceV2(fixture.input)

    const violationCodes = result.violations.map(v => v.code)
    expect(violationCodes).toContain('CAPACITY_EXCEEDED')
    expect(violationCodes).toContain('CHILDREN_IN_SMOKING_AREA')
    expect(violationCodes).toContain('ALLERGY_CONFLICT')

    const capViolation = result.violations.find(v => v.code === 'CAPACITY_EXCEEDED')
    expect(capViolation?.severity).toBe('CRITICAL')

    const smokeViolation = result.violations.find(v => v.code === 'CHILDREN_IN_SMOKING_AREA')
    expect(smokeViolation?.severity).toBe('HIGH')

    const allergyViolation = result.violations.find(v => v.code === 'ALLERGY_CONFLICT')
    expect(allergyViolation?.severity).toBe('CRITICAL')

    expect(result.state.party.baby_chairs).toBe(3)
    expect(result.state.party.smoking_area).toBe(true)
    expect(result.state.party.allergens).toContain('hải sản')
  })

  it('CASE 5 - Table negation (reject VIP2), fallback preference (VIP3 -> ngoài), and guest count approximation', () => {
    const fixture = goldenData.cases.find(c => c.id === 'case_5_negation_and_approximation')!
    const result = analyzeBookingIntelligenceV2(fixture.input)

    expect(result.state.table.rejected).toContain('VIP2')
    expect(result.state.table.preferences).toContain('VIP3')
    expect(result.state.table.preferences).toContain('NGOÀI TRỜI')

    expect(result.state.booking.guest_range).toBeDefined()
    expect(result.state.booking.guest_range?.min).toBe(18)
    expect(result.state.booking.guest_range?.max).toBe(20)
    expect(result.state.booking.guest_range?.precision).toBe('range')

    // Must not produce
    expect(result.state.booking.table_code).not.toBe('VIP2')
    expect(result.state.booking.guest_count).not.toBe(20)
  })
})
