import { describe, it, expect } from 'vitest'
import { buildDynamicPrompt } from '../promptBuilder'
import type { AIInputClassificationResult } from '../inputClassifier'

describe('Prompt Builder Tests', () => {
  const mockSimpleClassification: AIInputClassificationResult = {
    complexity: 'simple_booking',
    shouldTryLocalFirst: true,
    requiresLLM: false,
    requiresOCR: false,
    requiresMenuContext: false,
    requiresConversationContext: false,
    reasons: [],
    detectedSignals: {
      hasPhone: true,
      hasGuestCount: true,
      hasDateExpression: true,
      hasTimeExpression: true,
      hasNameSignal: true,
      hasMenuKeyword: false,
      hasPartyKeyword: false,
      hasImage: false,
      hasAmbiguousPhrase: false
    }
  }

  it('should build simple prompt without menu context', () => {
    const result = buildDynamicPrompt({
      profile: 'TEXT_SIMPLE',
      userText: 'Anh Minh 0909998888 đặt 5 khách tối mai 19h',
      classification: mockSimpleClassification,
      currentDateTime: 'Thứ Sáu, 19/06/2026 02:30',
      locale: 'vi-VN'
    })

    expect(result.systemPrompt).toContain('Hồ sơ: TEXT_SIMPLE')
    expect(result.systemPrompt).not.toContain('Danh sách các món ăn ứng viên')
    expect(result.userPrompt).toContain('Anh Minh 0909998888')
    expect(result.omittedSections).toContain('MENU_CANDIDATES')
  })

  it('should build prompt with menu context if requested', () => {
    const menuCandidates = [
      { menuId: 'm1', menuName: 'Thực đơn nướng', itemName: 'Sườn nướng tảng', score: 1, matchedBy: ['exact' as const] }
    ]
    const menuClassification = {
      ...mockSimpleClassification,
      complexity: 'booking_with_menu' as const,
      requiresMenuContext: true
    }

    const result = buildDynamicPrompt({
      profile: 'TEXT_WITH_MENU',
      userText: 'Đặt sườn nướng tảng cho 5 người',
      classification: menuClassification,
      menuCandidates,
      currentDateTime: 'Thứ Sáu, 19/06/2026 02:30',
      locale: 'vi-VN'
    })

    expect(result.systemPrompt).toContain('Hồ sơ: TEXT_WITH_MENU')
    expect(result.systemPrompt).toContain('Sườn nướng tảng')
    expect(result.includedSections).toContain('MENU_CANDIDATES')
  })
})
