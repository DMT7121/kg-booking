import { describe, it, expect } from 'vitest'
import { cleanOcrOutputText, extractStructuredOcrLines, preprocessOcrImage } from '../visionProcessor'
import { AI_MODELS } from '@/utils/constants'
import { getModelPolicy } from '../modelPolicy'

describe('Vision Processor & Multimodal OCR Tests', () => {
  it('should clean OCR output text and remove AI preambles', () => {
    const rawOutput = '```text\nHere is the extracted text:\n1. Bò nướng tảng - 250k\n2. Bia Tiger - 25k\n```'
    const cleaned = cleanOcrOutputText(rawOutput)
    expect(cleaned).not.toContain('```')
    expect(cleaned).not.toContain('Here is the extracted text:')
    expect(cleaned).toContain('1. Bò nướng tảng - 250k')
  })

  it('should parse structured OCR bill lines into item arrays', () => {
    const ocrText = `1. Bò nướng tảng - 250k x 2
2. Lẩu riêu cua - 350.000đ
3. Bia Tiger x 10 25k`
    const parsed = extractStructuredOcrLines(ocrText)
    expect(parsed.length).toBeGreaterThanOrEqual(2)
    expect(parsed[0].rawName).toBe('Bò nướng tảng')
    expect(parsed[0].quantity).toBe(2)
    expect(parsed[0].unitPrice).toBe(250000)
    expect(parsed[0].totalPrice).toBe(500000)
  })

  it('should fallback gracefully for preprocessOcrImage in test environment', async () => {
    const fakeBase64 = 'data:image/jpeg;base64,12345'
    const processed = await preprocessOcrImage(fakeBase64, { enhanceContrast: true })
    expect(processed).toBe(fakeBase64)
  })

  it('should contain expanded Vision AI models in AI_MODELS catalog', () => {
    const visionModels = AI_MODELS.filter(m => m.type === 'vision')
    expect(visionModels.length).toBeGreaterThanOrEqual(10)

    const hasGroq90B = visionModels.some(m => m.id === 'llama-3.2-90b-vision-instruct')
    const hasGeminiPro = visionModels.some(m => m.id === 'gemini-2.0-pro-exp-02-05')
    const hasQwenVL = visionModels.some(m => m.id === 'qwen/qwen-2-vl-72b-instruct:free')

    expect(hasGroq90B).toBe(true)
    expect(hasGeminiPro).toBe(true)
    expect(hasQwenVL).toBe(true)
  })

  it('should apply OCR timeout policy for vision models', () => {
    const groq90b = AI_MODELS.find(m => m.id === 'llama-3.2-90b-vision-instruct')!
    const policy = getModelPolicy(groq90b)
    expect(policy.tier).toBe('TIER_3_OCR')
    expect(policy.supportsVision).toBe(true)
    expect(policy.defaultTimeoutMs).toBe(25000)
  })
})
