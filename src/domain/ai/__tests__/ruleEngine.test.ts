import { describe, it, expect, vi } from 'vitest'
import { extractByRules, preNormalizeInput, prepareAIPayload, classifyPeopleNames, evaluateNameConfidence } from '../ruleEngine'

describe('Rule Engine Tests', () => {
  it('should extract basic details: date, time, pax', () => {
    const input = preNormalizeInput('Đặt bàn 10 người, 19h hôm nay')
    const result = extractByRules(input)
    expect(result.guest_count).toBe(10)
    expect(result.event_time).toBe('19:00')
    expect(result.event_date).toBeDefined()
  })

  it('should parse relative dates like ngay mai, mot', () => {
    const inputTomorrow = preNormalizeInput('Mai lúc 18h30, 8 khách')
    const result = extractByRules(inputTomorrow)
    expect(result.guest_count).toBe(8)
    expect(result.event_time).toBe('18:30')
  })

  it('should parse standard explicit date formats', () => {
    const input = preNormalizeInput('Ngày 20/6 lúc 18:00')
    const result = extractByRules(input)
    expect(result.event_date).toBe(`20/06/${new Date().getFullYear()}`)
    expect(result.event_time).toBe('18:00')
  })

  it('should parse phone numbers', () => {
    const input = preNormalizeInput('Anh Nguyễn Văn Giang, SĐT 0987654321')
    const result = extractByRules(input)
    expect(result.customer_name).toBe('Nguyễn Văn Giang')
    expect(result.phone).toBe('0987654321')
  })

  it('should extract table codes correctly', () => {
    const input = preNormalizeInput('Đặt bàn vip B12 cho 4 khách')
    const result = extractByRules(input)
    expect(result.table_code).toBe('B12')
  })

  it('should prepare payload properly and inject menu context', () => {
    const promptText = 'Đặt bàn 10 người ăn sườn nướng'
    const sysPrompt = 'Hệ thống đặt bàn. Thực đơn:\n{{MENU_CONTEXT}}'
    const ruleBasedResult = { guest_count: 10 }
    const menuList = [
      { name: 'Sườn nướng', price: 250000, acronym: 'sn' },
      { name: 'Gà nướng', price: 200000, acronym: 'gn' }
    ]
    const result = prepareAIPayload(promptText, sysPrompt, ruleBasedResult, menuList)
    expect(result.isLocalOnly).toBe(false)
    expect(result.sysPrompt).toContain('Sườn nướng')
    expect(result.sysPrompt).toContain('250.000')
  })

  it('should infer date as today or tomorrow based on time when date is missing', () => {
    vi.useFakeTimers()
    const mockNow = new Date()
    mockNow.setHours(12, 0, 0, 0)
    vi.setSystemTime(mockNow)

    // Booking time 17:00 is greater than current time 12:00 -> Today
    const inputToday = preNormalizeInput('Đặt bàn lúc 17:00')
    const resultToday = extractByRules(inputToday)
    const expectedTodayStr = `${String(mockNow.getDate()).padStart(2, '0')}/${String(mockNow.getMonth() + 1).padStart(2, '0')}/${mockNow.getFullYear()}`
    expect(resultToday.event_date).toBe(expectedTodayStr)

    // Booking time 09:00 sáng is less than current time 12:00 -> Tomorrow
    const inputTomorrow = preNormalizeInput('Đặt bàn lúc 09:00 sáng')
    const resultTomorrow = extractByRules(inputTomorrow)
    const tomorrow = new Date(mockNow)
    tomorrow.setDate(mockNow.getDate() + 1)
    const expectedTomorrowStr = `${String(tomorrow.getDate()).padStart(2, '0')}/${String(tomorrow.getMonth() + 1).padStart(2, '0')}/${tomorrow.getFullYear()}`
    expect(resultTomorrow.event_date).toBe(expectedTomorrowStr)

    vi.useRealTimers()
  })

  describe('Vietnamese Name Ambiguity Guard', () => {
    it('should accept ambiguous names with strong context (honorific, phone nearby, intro phrases)', () => {
      const inputs = [
        'Anh Sơn 0901234567 đặt bàn 5 người tối nay 7h',
        'Chị Hạnh đặt bàn 6 người lúc 19h, SĐT 0987654321',
        'Tên em là Oanh, đặt bàn 4 người tối mai',
        'Liên hệ anh Phúc 0987654321'
      ]

      const expectedNames = ['Sơn', 'Hạnh', 'Oanh', 'Phúc']

      inputs.forEach((input, index) => {
        const normalized = preNormalizeInput(input)
        const result = extractByRules(normalized)
        expect(result.customer_name).toBe(expectedNames[index])
        expect(result.customer_name_confidence).toBeGreaterThanOrEqual(0.80)
      })
    })

    it('should reject or ignore ambiguous names with weak or negative context', () => {
      const negativeInputs = [
        'Sơn lại bàn này giúp em',
        'Mai đặt được không?',
        'Hạnh phúc quá',
        'Vui lòng đặt bàn 5 người',
        'Cho em hỏi tối mai còn bàn không?'
      ]

      negativeInputs.forEach(input => {
        const normalized = preNormalizeInput(input)
        const result = extractByRules(normalized)
        // Ambiguous name without context should either not be extracted at all (null),
        // or have confidence less than 0.55 (which makes extractByRules nullify it).
        expect(result.customer_name).toBeNull()
      })
    })

    it('should accept ambiguous name with phone nearby as a strong signal', () => {
      const inputs = [
        'Sơn 0901234567 đặt bàn 5 người tối nay',
        'Oanh 0987654321 bàn 4 người 7h'
      ]
      const expectedNames = ['Sơn', 'Oanh']

      inputs.forEach((input, index) => {
        const normalized = preNormalizeInput(input)
        const result = extractByRules(normalized)
        expect(result.customer_name).toBe(expectedNames[index])
        expect(result.customer_name_confidence).toBeGreaterThanOrEqual(0.80)
      })
    })

    it('should reject or flag when there are multiple conflicting name candidates', () => {
      const input = 'Anh Sơn đặt bàn cho chị Hạnh 5 người tối nay, liên hệ 0901234567'
      const normalized = preNormalizeInput(input)
      const result = extractByRules(normalized)
      // Since there is a tie / conflict and no single best candidate with confidence >= 0.80
      expect(result.customer_name).toBeNull()
      expect(result.customer_name_confidence).toBe(0.0)
    })
  })
})

