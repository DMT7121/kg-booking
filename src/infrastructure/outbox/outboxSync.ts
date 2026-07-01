import * as outbox from './outbox'
import { PostgresOrderRepository } from '../postgres/postgresRepository'

const pgRepo = new PostgresOrderRepository()
let isSyncing = false

export async function triggerSync(): Promise<void> {
  if (isSyncing) return
  isSyncing = true
  
  try {
    let pendingItems = await outbox.getPendingItems()
    
    // Import store to get active JWT session token if Pinia is active
    let token = ''
    try {
      const { getActivePinia } = await import('pinia')
      if (getActivePinia()) {
        const { useAppStore } = await import('@/stores/useAppStore')
        token = useAppStore().adminToken || ''
      }
    } catch {}

    while (pendingItems.length > 0) {
      const item = pendingItems[0]
      let success = false
      
      try {
        if (item.action === 'upsert') {
          // 1. Conflict detection before saving to Postgres (only if Pinia is active)
          let conflictType: string | null = null
          let existingServerBooking: any = null
          
          try {
            const { getActivePinia } = await import('pinia')
            if (getActivePinia()) {
              const { useAppStore, hasTimeConflictIndexed } = await import('@/stores/useAppStore')
              const store = useAppStore()
              const payload = item.payload
              const localId = item.id
              
              existingServerBooking = store.historyList.find((h: any) => h.id === localId)
              if (existingServerBooking) {
                const baseVersion = payload.baseServerVersion ?? payload.version ?? 1
                const serverVersion = existingServerBooking.version ?? 1
                if (serverVersion > baseVersion) {
                  conflictType = 'version_mismatch'
                }
              }
              
              if (!conflictType) {
                const customerData = payload.customer || payload.parsedCustomer || payload
                const date = customerData.date
                const time = customerData.time
                const tables = customerData.tables || ''
                
                const hasConflict = hasTimeConflictIndexed({ id: localId, date, time, tables })
                if (hasConflict) {
                  conflictType = 'table_time_overlap'
                }
              }
              
              if (conflictType) {
                // Register conflict in activeConflicts store array
                if (!store.activeConflicts.some((c: any) => c.localBookingId === localId)) {
                  store.activeConflicts.push({
                    type: conflictType as any,
                    severity: 'warning',
                    detectedAt: new Date().toISOString(),
                    localBookingId: localId,
                    localSnapshot: payload,
                    serverSnapshot: existingServerBooking || null
                  })
                  store.saveConflicts()
                }
                throw new Error(`Conflict detected: ${conflictType}`)
              }
            }
          } catch (e: any) {
            if (e.message?.startsWith('Conflict detected:')) {
              throw e
            }
            // Ignore other dynamic import errors or active pinia instance errors to prevent blocking execution
            console.warn('[Outbox Sync] Warning: could not verify conflict check:', e.message)
          }

          const payload = {
            ...item.payload,
            idempotencyKey: item.idempotencyKey
          }
          let res = { ok: true, message: '' }
          try {
            res = await pgRepo.saveOrder(payload, token)
            if (!res.ok && res.message?.includes('not configured')) {
              console.warn('[Outbox Sync] Supabase not configured (returned), skipping Postgres save.')
              res = { ok: true, message: '' }
            }
          } catch (e: any) {
            if (e.message?.includes('not configured')) {
              console.warn('[Outbox Sync] Supabase not configured (thrown), skipping Postgres save.')
              res = { ok: true, message: '' }
            } else {
              throw e
            }
          }
          if (res.ok) {
            success = true
          } else {
            throw new Error(res.message || 'Postgres save returned failed state')
          }
        } else if (item.action === 'delete') {
          let res = { ok: true, message: '' }
          try {
            res = await pgRepo.deleteOrder(item.id, undefined, token)
            if (!res.ok && res.message?.includes('not configured')) {
              console.warn('[Outbox Sync] Supabase not configured (returned), skipping Postgres delete.')
              res = { ok: true, message: '' }
            }
          } catch (e: any) {
            if (e.message?.includes('not configured')) {
              console.warn('[Outbox Sync] Supabase not configured (thrown), skipping Postgres delete.')
              res = { ok: true, message: '' }
            } else {
              throw e
            }
          }
          if (res.ok) {
            success = true
          } else {
            throw new Error(res.message || 'Postgres delete returned failed state')
          }
        }
      } catch (err: any) {
        console.error(`[Outbox Sync] Failed to sync item ${item.id}:`, err.message)
        await outbox.recordAttemptFailure(item.id, item.action, err.message)
        
        // Halt processing to avoid loop hammering
        break 
      }
      
      if (success) {
        await outbox.markAsSynced(item.id, item.action)
        
        // Asynchronously trigger Sheets sync in background
        triggerSheetsSyncInBackground(item)
      }
      
      pendingItems = await outbox.getPendingItems()
    }
  } catch (e: any) {
    console.error('[Outbox Sync] Sync runner error:', e.message)
  } finally {
    isSyncing = false
    try {
      const { getActivePinia } = await import('pinia')
      if (getActivePinia()) {
        const { useAppStore } = await import('@/stores/useAppStore')
        const store = useAppStore()
        if (store && typeof store.updateOfflineQueueCount === 'function') {
          await store.updateOfflineQueueCount()
        }
      }
    } catch (err) {
      console.warn('[Outbox Sync] Failed to update offline queue count in store:', err)
    }
  }
}

async function triggerSheetsSyncInBackground(item: outbox.DecryptedOutboxItem) {
  try {
    const sheetsPayload = {
      action: item.action === 'upsert' ? 'saveOrder' : 'deleteOrder',
      id: item.id,
      data: item.payload,
      idempotencyKey: item.idempotencyKey
    }
    
    const gatewayUrl = import.meta.env.VITE_API_URL || '/api'
    const sharedSecret = import.meta.env.VITE_APP_SHARED_SECRET || ''
    
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (sharedSecret) {
      headers['Authorization'] = `Bearer ${sharedSecret}`
    }
    
    fetch(gatewayUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(sheetsPayload)
    })
      .then(async (res) => {
        const text = await res.text()
        console.log('[Outbox Sync Sheets] response:', res.status, text.substring(0, 200))
      })
      .catch(err => {
        console.warn('[Outbox Sync] Background Sheets sync trigger error:', err.message)
      })
  } catch (e) {
    // Ignore error, non-blocking
  }
}

// Watch network online event
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    triggerSync()
  })
  // Trigger once on startup if online
  if (navigator.onLine) {
    triggerSync()
  }
}
