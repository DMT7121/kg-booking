import { PROMPT_PROFILES, type PromptProfile } from './promptProfiles'
import type { AIInputClassificationResult } from './inputClassifier'

export interface MenuCandidate {
  menuId: string
  menuName: string
  itemId?: string
  itemName: string
  aliases?: string[]
  score: number
  matchedBy: Array<'exact' | 'alias' | 'token' | 'fuzzy' | 'bm25'>
}

export interface PromptBuildInput {
  profile: PromptProfile
  userText: string
  classification: AIInputClassificationResult
  menuCandidates?: MenuCandidate[]
  conversationContext?: string
  currentDateTime: string
  locale: 'vi-VN'
}

export interface PromptBuildResult {
  systemPrompt: string
  userPrompt: string
  estimatedInputTokens?: number
  includedSections: string[]
  omittedSections: string[]
}

export function buildDynamicPrompt(input: PromptBuildInput): PromptBuildResult {
  const {
    profile,
    userText,
    classification,
    menuCandidates = [],
    conversationContext = '',
    currentDateTime,
  } = input

  let sysPrompt = PROMPT_PROFILES[profile] || PROMPT_PROFILES.TEXT_SIMPLE
  const includedSections: string[] = [profile]
  const omittedSections: string[] = []

  // 1. Inject Current DateTime Context
  sysPrompt = sysPrompt + `\n\nThời gian hệ thống hiện tại: ${currentDateTime}`

  // 2. Handle Menu Candidates
  if (profile === 'TEXT_WITH_MENU' || classification.requiresMenuContext) {
    if (menuCandidates.length > 0) {
      const candidatesText = menuCandidates
        .map(c => `- Món: "${c.itemName}" (Thực đơn: ${c.menuName})`)
        .join('\n')
      sysPrompt = sysPrompt.replace('{{MENU_CANDIDATES}}', candidatesText)
      // If template did not have the placeholder, append it
      if (!sysPrompt.includes(candidatesText)) {
        sysPrompt += `\n\n{{MENU_CANDIDATES}}\nDanh sách các món ăn ứng viên trong thực đơn:\n${candidatesText}`
      }
      includedSections.push('MENU_CANDIDATES')
    } else {
      sysPrompt = sysPrompt.replace('{{MENU_CANDIDATES}}', 'Không có món ăn ứng viên nào khớp cục bộ.')
      omittedSections.push('MENU_CANDIDATES')
    }
  } else {
    omittedSections.push('MENU_CANDIDATES')
  }

  // 3. Handle Conversation Context
  if (profile === 'COMPLEX_CONVERSATION' || classification.requiresConversationContext) {
    if (conversationContext) {
      sysPrompt += `\n\nLịch sử hội thoại ngữ cảnh:\n${conversationContext}`
      includedSections.push('CONVERSATION_CONTEXT')
    } else {
      omittedSections.push('CONVERSATION_CONTEXT')
    }
  } else {
    omittedSections.push('CONVERSATION_CONTEXT')
  }

  // 4. Construct User Prompt
  const userPrompt = `Hãy trích xuất thông tin đặt bàn từ văn bản này:\n\n"${userText}"`

  // 5. Estimate Token Size (Simple character-based heuristics: ~4 chars per token)
  const totalChars = sysPrompt.length + userPrompt.length
  const estimatedInputTokens = Math.ceil(totalChars / 4)

  return {
    systemPrompt: sysPrompt,
    userPrompt,
    estimatedInputTokens,
    includedSections,
    omittedSections
  }
}
export type { PromptProfile }
