import { PROMPT_PROFILES, type PromptProfile } from './promptProfiles'
import type { AIInputClassificationResult } from './inputClassifier'
import { buildFewShotString } from '../../services/ai/correctionFewShotBuilder'

export interface MenuCandidate {
  menuId: string
  menuName: string
  itemId?: string
  itemName: string
  aliases?: string[]
  price?: number
  score: number
  matchedBy: Array<'exact' | 'alias' | 'token' | 'fuzzy' | 'bm25'>
}

export interface PromptBuildInput {
  profile: PromptProfile
  userText: string
  classification: AIInputClassificationResult
  menuCandidates?: MenuCandidate[]
  activeMenuSummary?: {
    sheetName: string
    totalDishes: number
  }
  conversationContext?: string
  currentDateTime: string
  locale: 'vi-VN'
  aiCorrections?: any[]
  currentField?: string
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
    aiCorrections = [],
    currentField = ''
  } = input

  let sysPrompt = PROMPT_PROFILES[profile] || PROMPT_PROFILES.TEXT_SIMPLE
  const includedSections: string[] = [profile]
  const omittedSections: string[] = []

  // 1. Inject Current DateTime & Active Menu Summary Context
  sysPrompt = sysPrompt + `\n\nThời gian hệ thống hiện tại: ${currentDateTime}`
  if (input.activeMenuSummary && input.activeMenuSummary.totalDishes > 0) {
    sysPrompt += `\nThực đơn đang sử dụng của nhà hàng: "${input.activeMenuSummary.sheetName}" (${input.activeMenuSummary.totalDishes} món).`
  }

  // 2. Handle Menu Candidates (inject whenever profile is TEXT_WITH_MENU, requiresMenuContext is true, or candidates matched)
  if (profile === 'TEXT_WITH_MENU' || classification.requiresMenuContext || menuCandidates.length > 0) {
    if (menuCandidates.length > 0) {
      const candidatesText = menuCandidates
        .map(c => {
          const priceLabel = typeof c.price === 'number' && c.price > 0
            ? ` | Giá: ${c.price.toLocaleString('vi-VN')}đ`
            : ''
          return `- Món: "${c.itemName}" (Thực đơn: ${c.menuName}${priceLabel})`
        })
        .join('\n')
      if (sysPrompt.includes('{{MENU_CANDIDATES}}')) {
        sysPrompt = sysPrompt.replace('{{MENU_CANDIDATES}}', `Danh sách các món ăn ứng viên trong thực đơn đang sử dụng:\n${candidatesText}`)
      } else {
        sysPrompt += `\n\nDanh sách các món ăn ứng viên trong thực đơn đang sử dụng (ưu tiên khớp matched_name theo danh sách này):\n${candidatesText}`
      }
      includedSections.push('MENU_CANDIDATES')
    } else {
      sysPrompt = sysPrompt.replace('{{MENU_CANDIDATES}}', 'Không có món ăn ứng viên nào khớp cục bộ.')
      omittedSections.push('MENU_CANDIDATES')
    }
  } else {
    sysPrompt = sysPrompt.replace('{{MENU_CANDIDATES}}', '')
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

  // 4. Handle Few-Shot Learning Loop corrections
  if (aiCorrections && aiCorrections.length > 0) {
    const fewShotText = buildFewShotString(aiCorrections, currentField)
    if (fewShotText) {
      sysPrompt += fewShotText
      includedSections.push('FEW_SHOT_CORRECTIONS')
    } else {
      omittedSections.push('FEW_SHOT_CORRECTIONS')
    }
  } else {
    omittedSections.push('FEW_SHOT_CORRECTIONS')
  }

  // 5. Construct User Prompt
  const userPrompt = `Hãy trích xuất thông tin đặt bàn từ văn bản này:\n\n"${userText}"`

  // 6. Estimate Token Size (Simple character-based heuristics: ~4 chars per token)
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
