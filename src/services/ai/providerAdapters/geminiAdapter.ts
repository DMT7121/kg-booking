import type { ProviderAdapter, ProviderRequestPayload } from './adapterInterface'
import type { AIModel } from '@/utils/constants'

export const geminiAdapter: ProviderAdapter = {
  formatRequest(params): ProviderRequestPayload {
    const { model, sysPrompt, userPrompt, image, jsonMode, responseSchema, maxOutputTokens, temperature, key } = params
    
    const url = `${model.url}?key=${key}`
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }

    const parts: any[] = [
      { text: sysPrompt + '\n\nUser Input:\n' + userPrompt }
    ]

    if (image) {
      const partsImage = image.split(',')
      const mimeType = partsImage[0].split(':')[1]?.split(';')[0] || 'image/jpeg'
      const base64Data = partsImage[1] || partsImage[0]
      parts.push({
        inline_data: {
          mime_type: mimeType,
          data: base64Data
        }
      })
    }

    const generationConfig: any = {
      temperature: temperature ?? 0.1,
      ...(maxOutputTokens ? { maxOutputTokens } : {}),
      ...(jsonMode ? { responseMimeType: 'application/json' } : {})
    }

    if (jsonMode && responseSchema) {
      generationConfig.responseSchema = responseSchema
    }

    const body: any = {
      contents: [{ parts }],
      generationConfig
    }

    // Special handling for thinking models (e.g. gemini-2.5-flash-thinking)
    if (model.id.includes('thinking')) {
      body.generationConfig.thinkingConfig = { thinkingBudget: 0 }
    }

    return {
      url,
      headers,
      body: JSON.stringify(body)
    }
  },

  parseResponse(responseJson): string {
    const parts = responseJson.candidates?.[0]?.content?.parts || []
    
    // Find first text part that is not a thought part
    for (let p = parts.length - 1; p >= 0; p--) {
      if (parts[p].text && !parts[p].thought) {
        return parts[p].text
      }
    }
    
    const firstTextPart = parts.find((p: any) => p.text)
    if (firstTextPart) {
      return firstTextPart.text
    }

    throw new Error('Không tìm thấy nội dung phản hồi từ Gemini')
  }
}
