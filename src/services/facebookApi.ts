// Real Facebook Messenger Graph API Client (v19.0)

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

export async function fetchRealFBConversations(pageAccessToken: string): Promise<RealFBConversation[]> {
  try {
    const url = `https://graph.facebook.com/v19.0/me/conversations?fields=id,updated_time,senders,unread_count,messages{id,message,created_time,from}&access_token=${encodeURIComponent(pageAccessToken)}`
    const res = await fetch(url)
    const data = await res.json() as any
    if (data && data.data) {
      return data.data as RealFBConversation[]
    }
    return []
  } catch (err) {
    console.error('[FB API Error] Failed to fetch conversations:', err)
    return []
  }
}

export async function sendRealFBMessage(recipientId: string, text: string, pageAccessToken: string): Promise<boolean> {
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
  } catch (err) {
    console.error('[FB API Error] Failed to send message:', err)
    return false
  }
}
