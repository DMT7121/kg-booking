import * as outbox from './outbox'
import { PostgresOrderRepository } from '../postgres/postgresRepository'
import { getBackendMode } from '@/utils/backendMode'

const pgRepo = new PostgresOrderRepository()
let isSyncing = false

async function syncToSheets(item: outbox.DecryptedOutboxItem): Promise<boolean> {
  const cleanPayload = JSON.parse(JSON.stringify(item.payload))
  if (cleanPayload && cleanPayload.deposit && cleanPayload.deposit.image === '__OFFLINE_IMAGE_BUFFER_REF__') {
    cleanPayload.deposit.image = ''
  }

  const sheetsPayload = {
    action: item.action === 'upsert' ? 'saveOrder' : 'deleteOrder',
    id: item.id,
    data: cleanPayload,
    idempotencyKey: item.idempotencyKey
  }
  
  const gatewayUrl = import.meta.env.VITE_API_URL || '/api'
  const gasFallbackUrl = import.meta.env.VITE_GAS_URL ||
    'https://script.google.com/macros/s/AKfycbxzjio4sat5fWoUncPgp8SfjoGqfGxW5vFoDgkHvBI3OKVWIaszsAaUt0LE2fCHtkCFsA/exec'
  const sharedSecret = import.meta.env.VITE_APP_SHARED_SECRET || ''
  const bodyStr = JSON.stringify(sheetsPayload)
  
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (sharedSecret) {
    headers['Authorization'] = `Bearer ${sharedSecret}`
  }

  // 1. Try API Gateway first (will proxy to GAS or Worker)
  try {
    const res = await fetch(gatewayUrl, {
      method: 'POST',
      headers,
      body: bodyStr
    })
    
    if (res.ok) {
      const data = await res.json()
      if (data && data.ok) {
        console.log('[Outbox Sync Sheets] Success via Gateway:', data)
        return true
      }
    }
  } catch (err: any) {
    console.warn('[Outbox Sync Sheets] Gateway failed:', err.message)
  }

  // 2. Fallback to GAS directly
  try {
    const res = await fetch(gasFallbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: bodyStr
    })
    if (res.ok) {
      const data = await res.json()
      if (data && data.ok) {
        console.log('[Outbox Sync Sheets] Success via GAS Fallback:', data)
        return true
      }
    }
  } catch (err: any) {
    console.warn('[Outbox Sync Sheets] GAS Fallback failed:', err.message)
  }

  return false
}

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

    const mode = getBackendMode()

    while (pendingItems.length > 0) {
      const item = pendingItems[0]
      let success = false
      
      try {
        if (item.action === 'upsert') {
          // 1. Conflict detection before saving (only if Pinia is active)
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
        }

        // 2. Perform database write operations based on resolved backend mode
        if (mode === 'gas') {
          // GAS mode: sync to Google Sheets synchronously
          const sheetsOk = await syncToSheets(item)
          if (!sheetsOk) {
            throw new Error('Failed to save to Google Sheets')
          }
          success = true
        } else if (mode === 'postgres') {
          // Postgres mode: sync only to Postgres
          let res = { ok: true, message: '' }
          if (item.action === 'upsert') {
            const cleanPayload = JSON.parse(JSON.stringify(item.payload))
            if (cleanPayload && cleanPayload.deposit && cleanPayload.deposit.image === '__OFFLINE_IMAGE_BUFFER_REF__') {
              cleanPayload.deposit.image = ''
            }
            const payload = { ...cleanPayload, idempotencyKey: item.idempotencyKey }
            res = await pgRepo.saveOrder(payload, token)
          } else if (item.action === 'delete') {
            res = await pgRepo.deleteOrder(item.id, undefined, token)
          }
          if (res && res.ok) {
            success = true
          } else {
            throw new Error(res?.message || 'Postgres operation failed')
          }
        } else if (mode === 'dual_write') {
          // Dual Write mode: sync to both Postgres and Google Sheets sequentially
          let pgOk = false
          if (item.action === 'upsert') {
            const cleanPayload = JSON.parse(JSON.stringify(item.payload))
            if (cleanPayload && cleanPayload.deposit && cleanPayload.deposit.image === '__OFFLINE_IMAGE_BUFFER_REF__') {
              cleanPayload.deposit.image = ''
            }
            const payload = { ...cleanPayload, idempotencyKey: item.idempotencyKey }
            const res = await pgRepo.saveOrder(payload, token)
            pgOk = res && res.ok
          } else if (item.action === 'delete') {
            const res = await pgRepo.deleteOrder(item.id, undefined, token)
            pgOk = res && res.ok
          }
          if (!pgOk) {
            throw new Error('Postgres write failed in dual_write mode')
          }

          const sheetsOk = await syncToSheets(item)
          if (!sheetsOk) {
            throw new Error('Google Sheets write failed in dual_write mode')
          }
          success = true
        }
      } catch (err: any) {
        console.error(`[Outbox Sync] Failed to sync item ${item.id}:`, err.message)
        await outbox.recordAttemptFailure(item.id, item.action, err.message)
        
        if (err.message?.startsWith('Conflict detected:')) {
          pendingItems = await outbox.getPendingItems()
          continue
        }
        
        // Halt processing to avoid loop hammering
        break 
      }
      
      if (success) {
        await outbox.markAsSynced(item.id, item.action)
        
        // Trigger background image upload if an offline image exists in buffer
        if (item.action === 'upsert' && item.payload?.deposit?.image === '__OFFLINE_IMAGE_BUFFER_REF__') {
          uploadImageInBackground(item.id, item.payload, mode, token).catch(() => {})
        }
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
          if (store) {
            if (typeof store.updateOfflineQueueCount === 'function') {
              await store.updateOfflineQueueCount()
            }
            if (typeof store.loadHistory === 'function') {
              await store.loadHistory(true)
            }
          }
        }
    } catch (err) {
      console.warn('[Outbox Sync] Failed to update offline queue count in store:', err)
    }
  }
}

async function uploadImageInBackground(id: string, payload: any, mode: string, token?: string) {
  try {
    const imageBase64 = await outbox.getImageFromBuffer(id)
    if (!imageBase64) return

    console.log(`[Outbox Background Sync] Syncing image for order ${id}...`)

    // Restore image to payload
    const imagePayload = JSON.parse(JSON.stringify(payload))
    if (!imagePayload.deposit) imagePayload.deposit = {}
    imagePayload.deposit.image = imageBase64

    // 1. Sync to Sheets if sheets or dual mode
    if (mode === 'gas' || mode === 'dual_write') {
      const sheetsPayload = {
        action: 'saveOrder',
        id: id,
        data: imagePayload,
        idempotencyKey: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2)
      }
      const gatewayUrl = import.meta.env.VITE_API_URL || '/api'
      const gasFallbackUrl = import.meta.env.VITE_GAS_URL ||
        'https://script.google.com/macros/s/AKfycbxzjio4sat5fWoUncPgp8SfjoGqfGxW5vFoDgkHvBI3OKVWIaszsAaUt0LE2fCHtkCFsA/exec'
      const sharedSecret = import.meta.env.VITE_APP_SHARED_SECRET || ''
      const bodyStr = JSON.stringify(sheetsPayload)
      
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (sharedSecret) {
        headers['Authorization'] = `Bearer ${sharedSecret}`
      }
      
      let sheetsOk = false
      try {
        const res = await fetch(gatewayUrl, { method: 'POST', headers, body: bodyStr })
        if (res.ok) {
          const data = await res.json()
          if (data && data.ok) sheetsOk = true
        }
      } catch {}

      if (!sheetsOk) {
        try {
          await fetch(gasFallbackUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: bodyStr
          })
        } catch {}
      }
    }

    // 2. Sync to Postgres if postgres or dual mode
    if (mode === 'postgres' || mode === 'dual_write') {
      await pgRepo.saveOrder(imagePayload, token)
    }

    // Clean up buffered image after successful backend sync
    await outbox.deleteImageFromBuffer(id)
    console.log(`[Outbox Background Sync] Image sync successful & purged for order ${id}.`)
  } catch (err: any) {
    console.warn(`[Outbox Background Sync] Image sync failed for order ${id}:`, err.message)
  }
}

// Watch network online event
if (typeof window !== 'undefined' && import.meta.env.MODE !== 'test') {
  window.addEventListener('online', () => {
    triggerSync()
  })
  // Trigger once on startup if online
  if (navigator.onLine) {
    triggerSync()
  }
}
