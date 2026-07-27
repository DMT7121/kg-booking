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
    const url = `https://graph.facebook.com/v19.0/me/conversations?fields=id,updated_time,senders,participants,unread_count,messages{id,message,created_time,from}&limit=50&access_token=${encodeURIComponent(pageAccessToken)}`
    const res = await fetch(url)
    const data = await res.json() as any
    if (data && data.data) {
      // Sort conversations by updated_time descending (newest conversation thread first!)
      return (data.data as RealFBConversation[]).sort((a, b) => new Date(b.updated_time).getTime() - new Date(a.updated_time).getTime())
    }
    return []
  } catch (err) {
    console.error('[FB API Error] Failed to fetch conversations:', err)
    return []
  }
}

export async function fetchRealFBUserProfile(psid: string, pageAccessToken: string): Promise<{ name?: string; picture?: string } | null> {
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
    return null
  } catch (err) {
    console.warn('[FB API Error] Failed to fetch user profile:', err)
    return null
  }
}

export async function fetchRealFBThreadMessages(conversationId: string, pageAccessToken: string): Promise<RealFBMessage[]> {
  try {
    const url = `https://graph.facebook.com/v19.0/${encodeURIComponent(conversationId)}/messages?fields=id,message,created_time,from&limit=50&access_token=${encodeURIComponent(pageAccessToken)}`
    const res = await fetch(url)
    const data = await res.json() as any
    if (data && data.data) {
      // Sort messages ascending by created_time (oldest message first, newest message last!)
      return (data.data as RealFBMessage[]).sort((a, b) => new Date(a.created_time).getTime() - new Date(b.created_time).getTime())
    }
    return []
  } catch (err) {
    console.error('[FB API Error] Failed to fetch thread messages:', err)
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
