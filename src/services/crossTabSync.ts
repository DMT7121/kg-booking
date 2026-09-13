export type SyncEventType = 
  | 'ORDER_SAVED' 
  | 'ORDER_DELETED' 
  | 'OUTBOX_SYNCED'
  | 'MENU_UPDATED'
  | 'CONFIG_UPDATED'

export interface SyncEventPayload<T = any> {
  type: SyncEventType
  senderId: string
  timestamp: number
  data: T
}

export type SyncEventListener = (event: SyncEventPayload) => void

const CHANNEL_NAME = 'kg_booking_sync_bus'
const STORAGE_FALLBACK_KEY = 'kg_cross_tab_sync_event'

export const TAB_INSTANCE_ID = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
  ? crypto.randomUUID()
  : `tab_${Math.random().toString(36).substring(2)}_${Date.now().toString(36)}`

let broadcastChannel: BroadcastChannel | null = null
let isStorageListenerAttached = false
const listeners = new Set<SyncEventListener>()

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined') return null

  if (!broadcastChannel && typeof window.BroadcastChannel !== 'undefined') {
    try {
      broadcastChannel = new window.BroadcastChannel(CHANNEL_NAME)
      broadcastChannel.onmessage = (msgEvent: MessageEvent<SyncEventPayload>) => {
        handleIncomingMessage(msgEvent.data)
      }
    } catch (e) {
      console.warn('[CrossTabSync] BroadcastChannel initialization failed, falling back to storage:', e)
    }
  }

  if (!isStorageListenerAttached && typeof window.addEventListener === 'function') {
    isStorageListenerAttached = true
    window.addEventListener('storage', (e: StorageEvent) => {
      if (e.key === STORAGE_FALLBACK_KEY && e.newValue) {
        try {
          const payload: SyncEventPayload = JSON.parse(e.newValue)
          handleIncomingMessage(payload)
        } catch {}
      }
    })
  }

  return broadcastChannel
}

function handleIncomingMessage(payload: SyncEventPayload) {
  if (!payload || !payload.type || payload.senderId === TAB_INSTANCE_ID) {
    return
  }
  listeners.forEach(listener => {
    try {
      listener(payload)
    } catch (err) {
      console.error('[CrossTabSync] Error in sync listener:', err)
    }
  })
}

export function broadcastSyncEvent<T = any>(type: SyncEventType, data: T): void {
  if (typeof window === 'undefined') return

  const payload: SyncEventPayload<T> = {
    type,
    senderId: TAB_INSTANCE_ID,
    timestamp: Date.now(),
    data
  }

  const channel = getChannel()
  if (channel) {
    try {
      channel.postMessage(payload)
    } catch (e) {
      console.warn('[CrossTabSync] Failed to postMessage on BroadcastChannel:', e)
    }
  }

  // Also trigger storage event for tabs where BroadcastChannel might be blocked
  try {
    localStorage.setItem(STORAGE_FALLBACK_KEY, JSON.stringify(payload))
  } catch {}
}

export function onSyncEvent(listener: SyncEventListener): () => void {
  listeners.add(listener)
  getChannel() // ensure initialized

  return () => {
    listeners.delete(listener)
  }
}

export function closeCrossTabSync(): void {
  if (broadcastChannel) {
    try {
      broadcastChannel.close()
    } catch {}
    broadcastChannel = null
  }
  listeners.clear()
}
