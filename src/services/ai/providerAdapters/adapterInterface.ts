import type { AIModel } from '@/utils/constants'

export interface ProviderRequestPayload {
  url: string
  headers: Record<string, string>
  body: string
}

export interface ProviderAdapter {
  formatRequest(params: {
    model: AIModel
    sysPrompt: string
    userPrompt: string
    image?: string | null
    jsonMode?: boolean
    responseSchema?: any
    maxOutputTokens?: number
    temperature?: number
    key: string
  }): ProviderRequestPayload

  parseResponse(responseJson: any): string
}
