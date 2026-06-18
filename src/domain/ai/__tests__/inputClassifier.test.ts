import { describe, it, expect } from 'vitest'
import { classifyAIInput } from '../inputClassifier'

describe('Input Classifier Tests', () => {
  it('should classify simple booking with all core fields', () => {
    const input = {
      text: 'Chị Vy 0901234567 đặt bàn 5 người tối mai lúc 19h'
    }
    const result = classifyAIInput(input)
    expect(result.complexity).toBe('simple_booking')
    expect(result.shouldTryLocalFirst).toBe(true)
    expect(result.requiresLLM).toBe(false)
    expect(result.detectedSignals.hasPhone).toBe(true)
    expect(result.detectedSignals.hasGuestCount).toBe(true)
    expect(result.detectedSignals.hasDateExpression).toBe(true)
    expect(result.detectedSignals.hasTimeExpression).toBe(true)
    expect(result.detectedSignals.hasNameSignal).toBe(true)
  })

  it('should classify booking with menu when dishes or sets are mentioned', () => {
    const input = {
      text: 'Đặt bàn 10 người tối nay có combo 4 người và bia tiger'
    }
    const result = classifyAIInput(input)
    expect(result.complexity).toBe('booking_with_menu')
    expect(result.requiresLLM).toBe(true)
    expect(result.requiresMenuContext).toBe(true)
    expect(result.detectedSignals.hasMenuKeyword).toBe(true)
  })

  it('should classify booking with missing fields when any core field is missing', () => {
    const input = {
      text: 'Mai 19h đặt 5 người'
    }
    const result = classifyAIInput(input)
    expect(result.complexity).toBe('booking_with_missing_fields')
    expect(result.requiresLLM).toBe(true)
    expect(result.shouldTryLocalFirst).toBe(true)
    expect(result.detectedSignals.hasPhone).toBe(false)
  })

  it('should classify image ocr when image is attached', () => {
    const input = {
      text: 'Phân tích bill này',
      hasImage: true
    }
    const result = classifyAIInput(input)
    expect(result.complexity).toBe('image_ocr')
    expect(result.requiresOCR).toBe(true)
    expect(result.requiresLLM).toBe(true)
  })

  it('should classify complex conversation when ambiguous references are detected', () => {
    const input = {
      text: 'Đặt bàn như hôm trước nha em'
    }
    const result = classifyAIInput(input)
    expect(result.complexity).toBe('complex_conversation')
    expect(result.requiresLLM).toBe(true)
    expect(result.requiresConversationContext).toBe(true)
  })
})
