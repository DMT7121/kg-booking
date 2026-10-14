import type { ProviderAdapter, ProviderRequestPayload } from './adapterInterface'
import type { AIModel } from '@/utils/constants'

export const openaiAdapter: ProviderAdapter = {
  formatRequest(params): ProviderRequestPayload {
    const { model, sysPrompt, userPrompt, image, jsonMode, responseSchema, maxOutputTokens, temperature, key } = params
    
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (key !== 'free') {
      headers['Authorization'] = `Bearer ${key}`
    }

    // Custom headers for OpenRouter
    if (model.provider === 'openrouter') {
      let originLocation = ''
      try {
        originLocation = window.location.origin
      } catch {
        originLocation = 'https://kings-grill-booking.pages.dev'
      }
      headers['HTTP-Referer'] = originLocation
      headers['X-Title'] = "KING's GRILL BOOKING APP"
    }

    let userMsgContent: any = userPrompt
    if (image) {
      userMsgContent = [
        { type: 'text', text: userPrompt },
        { type: 'image_url', image_url: { url: image } }
      ]
    }

    // Providers or models that do not reliably support response_format parameter
    const noResponseFormatProviders = ['pollinations', 'huggingface']
    const isFreeOrReasoningModel = model.id.includes(':free') || model.id.toLowerCase().includes('deepseek-r1')
    const skipResponseFormatParam = noResponseFormatProviders.includes(model.provider) || isFreeOrReasoningModel

    // Always ensure the word "JSON" is in the system prompt when jsonMode is enabled
    // (Required by Groq, OpenAI, and DeepSeek when response_format.type === 'json_object')
    const hasJsonKeyword = /json/i.test(sysPrompt) || (typeof userPrompt === 'string' && /json/i.test(userPrompt))
    const systemPromptText = jsonMode && (skipResponseFormatParam || !hasJsonKeyword)
      ? sysPrompt + '\n\nCRITICAL: Respond ONLY with raw valid JSON. No markdown, no ```json blocks. Start with { and end with }.'
      : sysPrompt

    const body: any = {
      model: model.id,
      messages: [
        { role: 'system', content: systemPromptText },
        { role: 'user', content: userMsgContent }
      ],
      temperature: temperature ?? 0.1,
      max_tokens: maxOutputTokens ?? 4096
    }

    if (jsonMode && !skipResponseFormatParam) {
      if (responseSchema) {
        body.response_format = {
          type: 'json_schema',
          json_schema: {
            name: 'booking_extraction',
            strict: true,
            schema: responseSchema
          }
        }
      } else {
        body.response_format = { type: 'json_object' }
      }
    }

    return {
      url: model.url,
      headers,
      body: JSON.stringify(body)
    }
  },

  parseResponse(responseJson): string {
    const content = responseJson.choices?.[0]?.message?.content
    if (content !== undefined && content !== null) {
      return content
    }
    throw new Error('Không tìm thấy nội dung phản hồi từ OpenAI Provider')
  }
}

