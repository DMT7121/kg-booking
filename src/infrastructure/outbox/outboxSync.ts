import * as outbox from './outbox'
import { PostgresOrderRepository } from '../postgres/postgresRepository'
import { getBackendMode } from '@/utils/backendMode'
import { API_GATEWAY_URL, GAS_DIRECT_URL, SHARED_SECRET, buildGatewayHeaders, buildGASHeaders } from '@/config/endpoints'

const pgRepo = new PostgresOrderRepository()
let isSyncing = false

export interface OutboxStoreDelegate {
  getStore?: () => any
  hasTimeConflictIndexed?: (data: any) => boolean
}

let _storeDelegate: OutboxStoreDelegate | null = null

export function setOutboxStoreDelegate(delegate: OutboxStoreDelegate) {
  _storeDelegate = delegate
}

async function syncToSheets(item: outbox.DecryptedOutboxItem): Promise<boolean> {
  const cleanPayload = JSON.parse(JSON.stringify(item.payload))
  if (cleanPayload && cleanPayload.deposit && cleanPayload.deposit.image === '__OFFLINE_IMAGE_BUFFER_REF__') {
    cleanPayload.deposit.image = ''
  }

  const isUpsert = item.action === 'upsert'
  const sheetsPayload = isUpsert ? {
    action: 'saveOrder',
    id: item.id,
    data: cleanPayload,
    idempotencyKey: item.idempotencyKey
  } : {
    action: 'deleteOrder',
    id: item.id,
    password: cleanPayload?.password,
    token: cleanPayload?.token,
    data: cleanPayload,
    idempotencyKey: item.idempotencyKey
  }
  
  const headers = buildGatewayHeaders()

  // 1. Try API Gateway first (will proxy to GAS or Worker) with 15s timeout
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)
    const res = await fetch(API_GATEWAY_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(sheetsPayload),
      signal: controller.signal
    }).finally(() => clearTimeout(timer))
    
    if (res.ok) {
      let data: any
      try {
        data = typeof res.json === 'function' ? await res.json() : JSON.parse(await res.text())
      } catch {
        try {
          data = JSON.parse(await res.text())
        } catch {}
      }
      if (data && data.ok) {
        console.log('[Outbox Sync Sheets] Success via Gateway:', data)
        return true
      }
    }
  } catch (err: any) {
    console.warn('[Outbox Sync Sheets] Gateway failed:', err.message)
  }

  // 2. Fallback to GAS directly with 15s timeout
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)
    const res = await fetch(GAS_DIRECT_URL, {
      method: 'POST',
      headers: buildGASHeaders(),
      body: JSON.stringify(sheetsPayload),
      signal: controller.signal
    }).finally(() => clearTimeout(timer))

    if (res.ok) {
      let data: any
      try {
        data = typeof res.json === 'function' ? await res.json() : JSON.parse(await res.text())
      } catch {
        try {
          data = JSON.parse(await res.text())
        } catch {}
      }
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

export async function triggerSync(forceRetryAll = false): Promise<{ processed: number; failures: number }> {
  if (isSyncing) return { processed: 0, failures: 0 }
  isSyncing = true
  
  let processedCount = 0
  let failureCount = 0
  const failedItemIds = new Set<string>()

  try {
    // Active JWT session token
    let token = ''
    try {
      token = sessionStorage.getItem('kg_admin_token') || ''
    } catch {}

    const mode = getBackendMode()
    const processedItemKeys = new Set<string>()

    // Load & decrypt pending items once per pass instead of O(M^2) per-item decryption;
    // re-check once at the end in case new items were enqueued while syncing.
    while (true) {
      const allPending = await outbox.getPendingItems(forceRetryAll)
      const batchCandidates = allPending.filter((it) => {
        const key = `${it.id}:${it.action}`
        return !failedItemIds.has(key) && !processedItemKeys.has(key)
      })
      if (batchCandidates.length === 0) break

      let abortedOffline = false
      for (const item of batchCandidates) {
        const itemKey = `${item.id}:${item.action}`
        let success = false
        let partialUpdateOnFailure: outbox.PartialSyncStatus | undefined

        try {
          if (item.action === 'upsert') {
          // 1. Conflict detection before saving (only if Pinia is active)
          let conflictType: string | null = null
          let existingServerBooking: any = null
          
          try {
            const store = _storeDelegate?.getStore ? _storeDelegate.getStore() : null
            const hasTimeConflictIndexed = _storeDelegate?.hasTimeConflictIndexed
            if (store) {
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
              
              if (!conflictType && typeof hasTimeConflictIndexed === 'function') {
                const customerData = payload.customer || payload.parsedCustomer || payload
                const date = customerData.date
                const time = customerData.time
                const tables = customerData.tables || ''
                
                const hasConflict = hasTimeConflictIndexed({ id: localId, date, time, tables, phone: customerData.phone || '' })
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
          // GAS mode: sync to Google Sheets
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
            res = await pgRepo.deleteOrder(item.id, item.payload?.password, token || item.payload?.token)
          }
          if (res && res.ok) {
            success = true
          } else {
            throw new Error(res?.message || 'Postgres operation failed')
          }
        } else if (mode === 'dual_write') {
          // Dual Write mode: run missing PG & Google Sheets targets CONCURRENTLY instead of serially
          const needPg = !item.syncedToPg
          const needSheets = !item.syncedToSheets

          const runPgTarget = async (): Promise<{ ok: boolean; message?: string }> => {
            if (!needPg) return { ok: true }
            if (item.action === 'upsert') {
              const cleanPayload = JSON.parse(JSON.stringify(item.payload))
              if (cleanPayload && cleanPayload.deposit && cleanPayload.deposit.image === '__OFFLINE_IMAGE_BUFFER_REF__') {
                cleanPayload.deposit.image = ''
              }
              const payload = { ...cleanPayload, idempotencyKey: item.idempotencyKey }
              return pgRepo.saveOrder(payload, token)
            }
            if (item.action === 'delete') {
              return pgRepo.deleteOrder(item.id, item.payload?.password, token || item.payload?.token)
            }
            return { ok: false, message: 'Unknown action' }
          }

          const runSheetsTarget = async (): Promise<boolean> => {
            if (!needSheets) return true
            return syncToSheets(item)
          }

          const [pgSettled, sheetsSettled] = await Promise.allSettled([
            runPgTarget(),
            runSheetsTarget()
          ])

          const pgRes = pgSettled.status === 'fulfilled' ? pgSettled.value : { ok: false, message: pgSettled.reason?.message }
          const pgOk = !!(pgRes && pgRes.ok)
          const sheetsOk = sheetsSettled.status === 'fulfilled' ? Boolean(sheetsSettled.value) : false

          item.syncedToPg = pgOk
          item.syncedToSheets = sheetsOk

          if (pgOk && sheetsOk) {
            success = true
          } else {
            partialUpdateOnFailure = { syncedToPg: pgOk, syncedToSheets: sheetsOk }
            if (!pgOk) {
              throw new Error(pgRes?.message || 'PostgreSQL write failed in dual_write mode')
            }
            throw new Error('Google Sheets write failed in dual_write mode')
          }
        }
      } catch (err: any) {
        console.error(`[Outbox Sync] Failed to sync item ${item.id}:`, err.message)
        failedItemIds.add(itemKey)
        failureCount++
        await outbox.recordAttemptFailure(item.id, item.action, err.message, partialUpdateOnFailure)

        // If device is confirmed offline, stop queue to avoid excessive CPU cycles
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          console.warn('[Outbox Sync] Device is offline — halting current sync run.')
          abortedOffline = true
          break
        }

        // NON-BLOCKING: Do NOT break the loop on server errors.
        // Continue to the next item so other bookings can sync freely!
        continue
      }

      if (success) {
        processedItemKeys.add(itemKey)
        await outbox.markAsSynced(item.id, item.action)
        processedCount++

        // Update in-memory store order sync status immediately without network reload
        try {
          const store = _storeDelegate?.getStore ? _storeDelegate.getStore() : null
          if (store && item.action === 'upsert' && typeof store.markOrderSynced === 'function') {
            store.markOrderSynced(item.id)
          }
        } catch (err) {}

        // Trigger background image upload if an offline image exists in buffer
        if (item.action === 'upsert' && item.payload?.deposit?.image === '__OFFLINE_IMAGE_BUFFER_REF__') {
          uploadImageInBackground(item.id, item.payload, mode, token).catch(() => {})
        }
      }
      }
      if (abortedOffline) break
    }
  } catch (e: any) {
    console.error('[Outbox Sync] Sync runner error:', e.message)
  } finally {
    isSyncing = false
    try {
      const store = _storeDelegate?.getStore ? _storeDelegate.getStore() : null
      if (store && typeof store.updateOfflineQueueCount === 'function') {
        await store.updateOfflineQueueCount()
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('kg-outbox-updated'))
      }
    } catch (err) {
      console.warn('[Outbox Sync] Failed to update offline queue count in store:', err)
    }
  }

  return { processed: processedCount, failures: failureCount }
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
      const headers = buildGatewayHeaders()
      
      let sheetsOk = false
      try {
        const res = await fetch(API_GATEWAY_URL, { method: 'POST', headers, body: JSON.stringify(sheetsPayload) })
        if (res.ok) {
          const data = await res.json()
          if (data && data.ok) sheetsOk = true
        }
      } catch {}

      if (!sheetsOk) {
        try {
          await fetch(GAS_DIRECT_URL, {
            method: 'POST',
            headers: buildGASHeaders(),
            body: JSON.stringify(sheetsPayload)
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

// Watch network online event with debounce
let onlineDebounceTimer: any = null
if (typeof window !== 'undefined' && import.meta.env.MODE !== 'test') {
  window.addEventListener('online', () => {
    if (onlineDebounceTimer) clearTimeout(onlineDebounceTimer)
    onlineDebounceTimer = setTimeout(() => {
      triggerSync()
    }, 500)
  })
  // Trigger once on startup if online
  if (navigator.onLine) {
    setTimeout(() => triggerSync(), 300)
  }
}
