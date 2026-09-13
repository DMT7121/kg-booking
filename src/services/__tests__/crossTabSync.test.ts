import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { 
  broadcastSyncEvent, 
  onSyncEvent, 
  closeCrossTabSync, 
  TAB_INSTANCE_ID 
} from '../crossTabSync'

describe('Cross-Tab Synchronization Unit Tests', () => {
  beforeEach(() => {
    closeCrossTabSync()
    localStorage.clear()
  })

  afterEach(() => {
    closeCrossTabSync()
    localStorage.clear()
  })

  it('should generate a valid non-empty TAB_INSTANCE_ID', () => {
    expect(TAB_INSTANCE_ID).toBeDefined()
    expect(typeof TAB_INSTANCE_ID).toBe('string')
    expect(TAB_INSTANCE_ID.length).toBeGreaterThan(5)
  })

  it('should ignore incoming messages originating from the same tab', () => {
    const listener = vi.fn()
    const unsubscribe = onSyncEvent(listener)

    // Simulate self broadcast
    broadcastSyncEvent('ORDER_SAVED', { id: 'bk_self_1', name: 'Self Order' })

    // Since the event was sent by TAB_INSTANCE_ID, this tab should NOT trigger its own listener
    expect(listener).not.toHaveBeenCalled()

    unsubscribe()
  })

  it('should trigger listener when event arrives from a different tab (via storage fallback or simulated channel)', () => {
    const listener = vi.fn()
    const unsubscribe = onSyncEvent(listener)

    // Simulate message from Tab B
    const remotePayload = {
      type: 'ORDER_SAVED',
      senderId: 'different_tab_instance_xyz',
      timestamp: Date.now(),
      data: { id: 'bk_remote_1', name: 'Khách VIP Tab Khác' }
    }

    // Fire via storage event (works in all test and browser environments)
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'kg_cross_tab_sync_event',
      newValue: JSON.stringify(remotePayload)
    }))

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      type: 'ORDER_SAVED',
      senderId: 'different_tab_instance_xyz',
      data: { id: 'bk_remote_1', name: 'Khách VIP Tab Khác' }
    }))

    unsubscribe()
  })

  it('should handle ORDER_DELETED, OUTBOX_SYNCED, and MENU_UPDATED events', () => {
    const receivedEvents: any[] = []
    const unsubscribe = onSyncEvent((evt) => {
      receivedEvents.push(evt)
    })

    const eventsToSimulate = [
      {
        type: 'ORDER_DELETED',
        senderId: 'tab_b_999',
        timestamp: Date.now(),
        data: { id: 'order_to_remove' }
      },
      {
        type: 'OUTBOX_SYNCED',
        senderId: 'tab_b_999',
        timestamp: Date.now(),
        data: { count: 0 }
      },
      {
        type: 'MENU_UPDATED',
        senderId: 'tab_b_999',
        timestamp: Date.now(),
        data: { sheet: 'MENU_TET_2026' }
      }
    ]

    eventsToSimulate.forEach(payload => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'kg_cross_tab_sync_event',
        newValue: JSON.stringify(payload)
      }))
    })

    expect(receivedEvents).toHaveLength(3)
    expect(receivedEvents[0].type).toBe('ORDER_DELETED')
    expect(receivedEvents[1].type).toBe('OUTBOX_SYNCED')
    expect(receivedEvents[2].type).toBe('MENU_UPDATED')

    unsubscribe()
  })

  it('should stop receiving events after calling unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = onSyncEvent(listener)

    unsubscribe()

    window.dispatchEvent(new StorageEvent('storage', {
      key: 'kg_cross_tab_sync_event',
      newValue: JSON.stringify({
        type: 'ORDER_SAVED',
        senderId: 'tab_other_456',
        timestamp: Date.now(),
        data: { id: 'bk_ignored' }
      })
    }))

    expect(listener).not.toHaveBeenCalled()
  })
})
