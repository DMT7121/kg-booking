import { describe, it, expect } from 'vitest'
import { extractByRules, preNormalizeInput, prepareAIPayload } from '../ruleEngine'

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
})

