// Real Facebook Messenger Graph API Client (v19.0)
// Supports secure proxying via Cloudflare Edge Gateway / Local API with Zero-Token client exposure

import { AI_GATEWAY_URL, API_GATEWAY_URL } from '@/config/endpoints'

export interface RealFBMessage {
  id: string
  message: string
  created_time: string
  from: {
    name: string
    id: string
    email?: string
  }
}

export interface RealFBConversation {
  id: string
  updated_time: string
  unread_count: number
  senders?: {
    data: Array<{ name: string; id: string; email?: string }>
  }
  messages?: {
    data: RealFBMessage[]
  }
}

function getGatewayBase(): string {
  const aiGateway = (import.meta.env.VITE_AI_GATEWAY_URL || AI_GATEWAY_URL || '').trim().replace(/\/$/, '')
  if (aiGateway) return aiGateway
  const apiGateway = (import.meta.env.VITE_API_URL || API_GATEWAY_URL || '/api').trim().replace(/\/$/, '')
  return apiGateway.startsWith('http') ? apiGateway : ''
}

function buildHeaders(pageAccessToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }
  if (pageAccessToken) {
    headers['x-fb-access-token'] = pageAccessToken
  }
  return headers
}

export async function fetchRealFBConversations(pageAccessToken?: string): Promise<RealFBConversation[]> {
  const gatewayBase = getGatewayBase()
  const proxyUrl = `${gatewayBase}/api/facebook/conversations?limit=50`

  try {
    const res = await fetch(proxyUrl, {
      headers: buildHeaders(pageAccessToken)
    })
    if (res.ok) {
      const data = await res.json() as any
      if (data && data.data) {
        return (data.data as RealFBConversation[]).sort((a, b) => new Date(b.updated_time).getTime() - new Date(a.updated_time).getTime())
      }
      return []
    }
  } catch (proxyErr) {
    console.warn('[FB API Proxy] Gateway proxy unavailable, attempting direct fallback if token present:', proxyErr)
  }

  // Direct Graph API fallback if token is explicitly available
  if (pageAccessToken) {
    try {
      const url = `https://graph.facebook.com/v19.0/me/conversations?fields=id,updated_time,senders,participants,unread_count,messages{id,message,created_time,from}&limit=50&access_token=${encodeURIComponent(pageAccessToken)}`
      const res = await fetch(url)
      const data = await res.json() as any
      if (data && data.data) {
        return (data.data as RealFBConversation[]).sort((a, b) => new Date(b.updated_time).getTime() - new Date(a.updated_time).getTime())
      }
    } catch (directErr) {
      console.error('[FB API Direct Fallback Error]', directErr)
    }
  }

  return []
}

export async function fetchRealFBUserProfile(psid: string, pageAccessToken?: string): Promise<{ name?: string; picture?: string } | null> {
  const gatewayBase = getGatewayBase()
  const proxyUrl = `${gatewayBase}/api/facebook/user-profiles?psid=${encodeURIComponent(psid)}`

  try {
    const res = await fetch(proxyUrl, {
      headers: buildHeaders(pageAccessToken)
    })
    if (res.ok) {
      const data = await res.json() as any
      if (data && data.name) {
        return {
          name: data.name,
          picture: data.picture?.data?.url
        }
      }
      return null
    }
  } catch (proxyErr) {
    console.warn('[FB API Proxy] Profile fetch failed via gateway:', proxyErr)
  }

  if (pageAccessToken) {
    try {
      const url = `https://graph.facebook.com/v19.0/${encodeURIComponent(psid)}?fields=name,picture{url}&access_token=${encodeURIComponent(pageAccessToken)}`
      const res = await fetch(url)
      const data = await res.json() as any
      if (data && data.name) {
        return {
          name: data.name,
          picture: data.picture?.data?.url
        }
      }
    } catch (directErr) {
      console.warn('[FB API Direct Profile Fallback Error]', directErr)
    }
  }

  return null
}

export async function fetchRealFBBatchUserProfiles(
  psids: string[],
  pageAccessToken?: string
): Promise<Record<string, { name?: string; picture?: string }>> {
  if (!psids || psids.length === 0) return {}
  const uniquePsids = Array.from(new Set(psids)).filter(id => id && id !== 'unknown' && !id.startsWith('wh-')).slice(0, 50)
  if (uniquePsids.length === 0) return {}

  const gatewayBase = getGatewayBase()
  const proxyUrl = `${gatewayBase}/api/facebook/user-profiles?ids=${encodeURIComponent(uniquePsids.join(','))}`

  try {
    const res = await fetch(proxyUrl, {
      headers: buildHeaders(pageAccessToken)
    })
    if (res.ok) {
      const data = await res.json() as Record<string, any>
      const result: Record<string, { name?: string; picture?: string }> = {}
      if (data) {
        Object.keys(data).forEach(id => {
          if (data[id]?.name) {
            result[id] = {
              name: data[id].name,
              picture: data[id].picture?.data?.url
            }
          }
        })
      }
      return result
    }
  } catch (proxyErr) {
    console.warn('[FB API Proxy] Batch user profiles proxy error:', proxyErr)
  }

  if (pageAccessToken) {
    try {
      const url = `https://graph.facebook.com/v19.0/?ids=${encodeURIComponent(uniquePsids.join(','))}&fields=name,picture{url}&access_token=${encodeURIComponent(pageAccessToken)}`
      const res = await fetch(url)
      const data = await res.json() as Record<string, any>
      const result: Record<string, { name?: string; picture?: string }> = {}
      if (data) {
        Object.keys(data).forEach(id => {
          if (data[id]?.name) {
            result[id] = {
              name: data[id].name,
              picture: data[id].picture?.data?.url
            }
          }
        })
      }
      return result
    } catch (directErr) {
      console.warn('[FB API Direct Batch Fallback Error]', directErr)
    }
  }

  return {}
}

export async function fetchRealFBThreadMessages(conversationId: string, pageAccessToken?: string): Promise<RealFBMessage[]> {
  const gatewayBase = getGatewayBase()
  const proxyUrl = `${gatewayBase}/api/facebook/messages?conversationId=${encodeURIComponent(conversationId)}&limit=50`

  try {
    const res = await fetch(proxyUrl, {
      headers: buildHeaders(pageAccessToken)
    })
    if (res.ok) {
      const data = await res.json() as any
      if (data && data.data) {
        return (data.data as RealFBMessage[]).sort((a, b) => new Date(a.created_time).getTime() - new Date(b.created_time).getTime())
      }
      return []
    }
  } catch (proxyErr) {
    console.warn('[FB API Proxy] Thread messages proxy error:', proxyErr)
  }

  if (pageAccessToken) {
    try {
      const url = `https://graph.facebook.com/v19.0/${encodeURIComponent(conversationId)}/messages?fields=id,message,created_time,from&limit=50&access_token=${encodeURIComponent(pageAccessToken)}`
      const res = await fetch(url)
      const data = await res.json() as any
      if (data && data.data) {
        return (data.data as RealFBMessage[]).sort((a, b) => new Date(a.created_time).getTime() - new Date(b.created_time).getTime())
      }
    } catch (directErr) {
      console.error('[FB API Direct Thread Fallback Error]', directErr)
    }
  }

  return []
}

export async function sendRealFBMessage(recipientId: string, text: string, pageAccessToken?: string): Promise<boolean> {
  const gatewayBase = getGatewayBase()
  const proxyUrl = `${gatewayBase}/api/facebook/messages`

  try {
    const res = await fetch(proxyUrl, {
      method: 'POST',
      headers: buildHeaders(pageAccessToken),
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text }
      })
    })
    if (res.ok) {
      const data = await res.json() as any
      return !!data.message_id
    }
  } catch (proxyErr) {
    console.warn('[FB API Proxy] Send message proxy error:', proxyErr)
  }

  if (pageAccessToken) {
    try {
      const url = `https://graph.facebook.com/v19.0/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text }
        })
      })
      const data = await res.json() as any
      return !!data.message_id
    } catch (directErr) {
      console.error('[FB API Direct Send Fallback Error]', directErr)
    }
  }

  return false
}
