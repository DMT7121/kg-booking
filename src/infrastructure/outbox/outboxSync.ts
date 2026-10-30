import * as outbox from './outbox'
import { PostgresOrderRepository } from '../postgres/postgresRepository'
import { enqueueGasMutation } from '../gas/gasClient'
import { getBackendMode } from '@/utils/backendMode'
import { API_GATEWAY_URL, GAS_DIRECT_URL, buildGatewayHeaders, buildGASHeaders } from '@/config/endpoints'

const pgRepo = new PostgresOrderRepository()

let activeSyncPromise: Promise<{ processed: number; failures: number }> | null = null
let queuedSyncRequest: { forceRetryAll: boolean } | null = null

const STALE_NOTIFICATION_AGE_MS = 30 * 60 * 1000 // Suppress Telegram spam for orders queued > 30 minutes ago
const SHEETS_SINGLE_TIMEOUT_MS = 45000
const SHEETS_BATCH_TIMEOUT_MS = 60000
const SHEETS_BATCH_THRESHOLD = 4
const SHEETS_BATCH_CHUNK_SIZE = 5
const OUTBOX_RECOVERY_KEY = 'kg_outbox_recovery_v252'

export interface OutboxStoreDelegate {
  getStore?: () => any
  hasTimeConflictIndexed?: (data: any) => boolean
}

let _storeDelegate: OutboxStoreDelegate | null = null

export function setOutboxStoreDelegate(delegate: OutboxStoreDelegate) {
  _storeDelegate = delegate
}

export function isOutboxSyncActive(): boolean {
  return activeSyncPromise !== null
}

function dispatchOutboxEvent(name: string, detail?: Record<string, any>) {
  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent(name, detail ? { detail } : undefined))
    } catch {}
  }
}

async function parseJsonSafely(res: Response): Promise<any> {
  try {
    if (typeof res.json === 'function') {
      return await res.json()
    }
  } catch {}
  try {
    if (typeof res.text === 'function') {
      const txt = await res.text()
      return txt ? JSON.parse(txt) : null
    }
  } catch {}
  return null
}

function buildSheetsUpsertData(item: outbox.DecryptedOutboxItem): any {
  const normalized = outbox.normalizeOrderPayloadForSync(item.id, item.payload)
  const ageMs = item.createdAt ? Date.now() - item.createdAt : 0
  if (ageMs > STALE_NOTIFICATION_AGE_MS && normalized.skipNotification === undefined) {
    normalized.skipNotification = true
  }
  return normalized
}

async function postSheetsRequest(
  sheetsPayload: Record<string, any>,
  timeoutMs: number
): Promise<{ ok: boolean; data?: any; error?: string }> {
  const headers = buildGatewayHeaders()
  let lastError = ''
  let gatewayTimedOut = false

  // 1. Try API Gateway first (up to 2 attempts if GAS reports transient lock contention)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      const res = await fetch(API_GATEWAY_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(sheetsPayload),
        signal: controller.signal
      }).finally(() => clearTimeout(timer))

      if (res.ok) {
        const data = await parseJsonSafely(res)
        if (data && data.ok) {
          return { ok: true, data }
        }
        const serverMsg = String(data?.message || data?.error || '').trim()
        if (serverMsg) {
          lastError = serverMsg
          if (attempt === 0 && serverMsg.toLowerCase().includes('lock timeout')) {
            await new Promise((r) => setTimeout(r, 1500))
            continue
          }
          // Deterministic application validation error from GAS — no need to re-send to GAS_DIRECT_URL
          if (!serverMsg.toLowerCase().includes('lock timeout') && !serverMsg.toLowerCase().includes('non-json')) {
            return { ok: false, error: serverMsg }
          }
        }
      } else {
        lastError = `Gateway HTTP ${res.status}`
      }
      break
    } catch (err: any) {
      const isAbort = err?.name === 'AbortError' || String(err?.message || '').toLowerCase().includes('abort')
      if (isAbort) {
        gatewayTimedOut = true
        lastError = `Gateway timeout (${Math.round(timeoutMs / 1000)}s)`
      } else {
        lastError = err?.message || 'Gateway network error'
      }
      console.warn('[Outbox Sync Sheets] Gateway failed:', lastError)
      break
    }
  }

  // Avoid firing a duplicate write directly into GAS if Gateway timed out after 45s while GAS is still executing
  if (gatewayTimedOut) {
    return { ok: false, error: lastError }
  }

  // 2. Fallback to GAS directly
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(GAS_DIRECT_URL, {
      method: 'POST',
      headers: buildGASHeaders(),
      body: JSON.stringify(sheetsPayload),
      signal: controller.signal
    }).finally(() => clearTimeout(timer))

    if (res.ok) {
      const data = await parseJsonSafely(res)
      if (data && data.ok) {
        return { ok: true, data }
      }
      const serverMsg = String(data?.message || data?.error || '').trim()
      if (serverMsg) lastError = serverMsg
    } else {
      lastError = `GAS HTTP ${res.status}`
    }
  } catch (err: any) {
    const isAbort = err?.name === 'AbortError' || String(err?.message || '').toLowerCase().includes('abort')
    lastError = isAbort
      ? `GAS timeout (${Math.round(timeoutMs / 1000)}s)`
      : (err?.message || lastError || 'Failed to save to Google Sheets')
    console.warn('[Outbox Sync Sheets] GAS Fallback failed:', lastError)
  }

  return { ok: false, error: lastError || 'Failed to save to Google Sheets' }
}

async function syncToSheets(item: outbox.DecryptedOutboxItem): Promise<{ ok: boolean; error?: string }> {
  const isUpsert = item.action === 'upsert'
  const cleanPayload = isUpsert
    ? buildSheetsUpsertData(item)
    : outbox.normalizeOrderPayloadForSync(item.id, item.payload)

  const sheetsPayload = isUpsert
    ? {
        action: 'saveOrder',
        id: item.id,
        data: cleanPayload,
        idempotencyKey: item.idempotencyKey
      }
    : {
        action: 'deleteOrder',
        id: item.id,
        password: cleanPayload?.password,
        token: cleanPayload?.token,
        data: cleanPayload,
        idempotencyKey: item.idempotencyKey
      }

  return enqueueGasMutation(sheetsPayload.action, () =>
    postSheetsRequest(sheetsPayload, SHEETS_SINGLE_TIMEOUT_MS)
  )
}

async function syncUpsertBatchToSheets(
  items: outbox.DecryptedOutboxItem[]
): Promise<Map<string, { ok: boolean; error?: string }>> {
  const outcomeMap = new Map<string, { ok: boolean; error?: string }>()
  for (let i = 0; i < items.length; i += SHEETS_BATCH_CHUNK_SIZE) {
    const chunk = items.slice(i, i + SHEETS_BATCH_CHUNK_SIZE)
    if (chunk.length === 1) {
      const single = await syncToSheets(chunk[0])
      outcomeMap.set(chunk[0].id, single)
      continue
    }

    const payloads = chunk.map((it) => buildSheetsUpsertData(it))
    const batchReq = {
      action: 'saveOrdersBatch',
      payloads
    }

    const batchRes = await enqueueGasMutation('saveOrdersBatch', () =>
      postSheetsRequest(batchReq, SHEETS_BATCH_TIMEOUT_MS)
    )

    const perItemResults = Array.isArray(batchRes.data?.results) ? batchRes.data.results : null
    if (batchRes.ok && perItemResults && perItemResults.length === chunk.length) {
      for (let idx = 0; idx < chunk.length; idx++) {
        const item = chunk[idx]
        const r = perItemResults[idx]
        if (r && r.ok) {
          outcomeMap.set(item.id, { ok: true })
        } else {
          // Automatic per-item fallback if a specific entry in batch failed
          const fallbackRes = await syncToSheets(item)
          outcomeMap.set(item.id, fallbackRes.ok ? fallbackRes : { ok: false, error: r?.message || fallbackRes.error })
        }
      }
    } else {
      // Whole chunk fallback to per-item saveOrder
      for (const item of chunk) {
        const fallbackRes = await syncToSheets(item)
        outcomeMap.set(item.id, fallbackRes)
      }
    }
  }
  return outcomeMap
}

function checkItemConflict(item: outbox.DecryptedOutboxItem, forceRetryAll: boolean): void {
  if (item.action !== 'upsert') return

  let conflictType: string | null = null
  let existingServerBooking: any = null

  try {
    const store = _storeDelegate?.getStore ? _storeDelegate.getStore() : null
    const hasTimeConflictIndexed = _storeDelegate?.hasTimeConflictIndexed
    if (store) {
      const payload = item.payload || {}
      const localId = item.id

      existingServerBooking = store.historyList.find((h: any) => h.id === localId)
      if (existingServerBooking && !forceRetryAll) {
        const baseVersion = payload.baseServerVersion ?? payload.version ?? 1
        const serverVersion = existingServerBooking.version ?? 1
        if (serverVersion > baseVersion) {
          conflictType = 'version_mismatch'
        }
      }

      if (!conflictType && typeof hasTimeConflictIndexed === 'function') {
        const normalized = outbox.normalizeOrderPayloadForSync(localId, payload)
        const customerData = normalized.customer || payload.customer || payload.parsedCustomer || payload
        const date = customerData.date
        const time = customerData.time
        const tables = customerData.tables || ''

        const hasConflict = hasTimeConflictIndexed({
          id: localId,
          date,
          time,
          tables,
          phone: customerData.phone || ''
        })
        if (hasConflict) {
          conflictType = 'table_time_overlap'
        }
      }

      if (conflictType) {
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
    console.warn('[Outbox Sync] Warning: could not verify conflict check:', e.message)
  }
}

async function executeSingleSyncPass(forceRetryAll: boolean): Promise<{ processed: number; failures: number }> {
  let processedCount = 0
  let failureCount = 0
  const failedItemIds = new Set<string>()
  const processedItemKeys = new Set<string>()

  let token = ''
  try {
    token = sessionStorage.getItem('kg_admin_token') || ''
  } catch {}

  const mode = getBackendMode()

  while (true) {
    const allPending = await outbox.getPendingItems(forceRetryAll)
    const batchCandidates = allPending.filter((it) => {
      const key = `${it.id}:${it.action}`
      return !failedItemIds.has(key) && !processedItemKeys.has(key)
    })
    if (batchCandidates.length === 0) break

    // Fast bulk path when >= 4 upsert orders need Google Sheets sync (e.g. recovering a large offline backlog)
    const bulkUpsertSheetsCandidates =
      (mode === 'dual_write' || mode === 'gas')
        ? batchCandidates.filter((it) => it.action === 'upsert' && (mode === 'gas' || !it.syncedToSheets))
        : []

    let precomputedSheetsOutcomes: Map<string, { ok: boolean; error?: string }> | null = null
    if (bulkUpsertSheetsCandidates.length >= SHEETS_BATCH_THRESHOLD) {
      // Filter out any conflicted items first before batching
      const conflictFreeForBatch: outbox.DecryptedOutboxItem[] = []
      for (const candidate of bulkUpsertSheetsCandidates) {
        try {
          checkItemConflict(candidate, forceRetryAll)
          conflictFreeForBatch.push(candidate)
        } catch {
          // Conflict will be handled and recorded in the main item loop below
        }
      }

      if (conflictFreeForBatch.length >= SHEETS_BATCH_THRESHOLD) {
        // Run PostgreSQL upserts concurrently with the chunked Google Sheets batch!
        const pgPreSyncPromise =
          mode === 'dual_write'
            ? Promise.all(
                conflictFreeForBatch.map(async (it) => {
                  if (it.syncedToPg) return
                  const normalized = outbox.normalizeOrderPayloadForSync(it.id, it.payload)
                  const payload = { ...normalized, idempotencyKey: it.idempotencyKey }
                  try {
                    const res = await pgRepo.saveOrder(payload, token)
                    if (res && res.ok) {
                      it.syncedToPg = true
                      await outbox.updateTargetSyncStatus(it.id, it.action, { syncedToPg: true })
                    }
                  } catch {}
                })
              )
            : Promise.resolve()

        const [sheetsMap] = await Promise.all([
          syncUpsertBatchToSheets(conflictFreeForBatch),
          pgPreSyncPromise
        ])
        precomputedSheetsOutcomes = sheetsMap
        dispatchOutboxEvent('kg-outbox-updated')
      }
    }

    let abortedOffline = false
    for (const item of batchCandidates) {
      const itemKey = `${item.id}:${item.action}`
      let success = false
      let partialUpdateOnFailure: outbox.PartialSyncStatus | undefined

      try {
        checkItemConflict(item, forceRetryAll)

        if (mode === 'gas') {
          const sheetsRes = precomputedSheetsOutcomes?.get(item.id) || (await syncToSheets(item))
          if (!sheetsRes.ok) {
            throw new Error(sheetsRes.error || 'Failed to save to Google Sheets')
          }
          success = true
        } else if (mode === 'postgres') {
          let res = { ok: true, message: '' }
          if (item.action === 'upsert') {
            const cleanPayload = outbox.normalizeOrderPayloadForSync(item.id, item.payload)
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
          const needPg = !item.syncedToPg
          const needSheets = !item.syncedToSheets

          const runPgTarget = async (): Promise<{ ok: boolean; message?: string }> => {
            if (!needPg) return { ok: true }
            if (item.action === 'upsert') {
              const cleanPayload = outbox.normalizeOrderPayloadForSync(item.id, item.payload)
              const payload = { ...cleanPayload, idempotencyKey: item.idempotencyKey }
              return pgRepo.saveOrder(payload, token)
            }
            if (item.action === 'delete') {
              return pgRepo.deleteOrder(item.id, item.payload?.password, token || item.payload?.token)
            }
            return { ok: false, message: 'Unknown action' }
          }

          const runSheetsTarget = async (): Promise<{ ok: boolean; error?: string }> => {
            if (!needSheets) return { ok: true }
            const pre = precomputedSheetsOutcomes?.get(item.id)
            if (pre) return pre
            return syncToSheets(item)
          }

          const [pgSettled, sheetsSettled] = await Promise.allSettled([
            runPgTarget(),
            runSheetsTarget()
          ])

          const pgRes =
            pgSettled.status === 'fulfilled'
              ? pgSettled.value
              : { ok: false, message: pgSettled.reason?.message }
          const sheetsRes =
            sheetsSettled.status === 'fulfilled'
              ? sheetsSettled.value
              : { ok: false, error: sheetsSettled.reason?.message }

          const pgOk = !!(pgRes && pgRes.ok)
          const sheetsOk = !!(sheetsRes && sheetsRes.ok)

          item.syncedToPg = pgOk
          item.syncedToSheets = sheetsOk

          if (pgOk && sheetsOk) {
            success = true
          } else {
            partialUpdateOnFailure = { syncedToPg: pgOk, syncedToSheets: sheetsOk }
            if (!pgOk) {
              throw new Error(pgRes?.message || 'PostgreSQL write failed in dual_write mode')
            }
            throw new Error(sheetsRes?.error || 'Google Sheets write failed in dual_write mode')
          }
        }
      } catch (err: any) {
        console.error(`[Outbox Sync] Failed to sync item ${item.id}:`, err.message)
        failedItemIds.add(itemKey)
        failureCount++
        await outbox.recordAttemptFailure(item.id, item.action, err.message, partialUpdateOnFailure)
        dispatchOutboxEvent('kg-outbox-updated')

        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          console.warn('[Outbox Sync] Device is offline — halting current sync run.')
          abortedOffline = true
          break
        }

        continue
      }

      if (success) {
        processedItemKeys.add(itemKey)
        await outbox.markAsSynced(item.id, item.action)
        processedCount++

        try {
          const store = _storeDelegate?.getStore ? _storeDelegate.getStore() : null
          if (store && item.action === 'upsert' && typeof store.markOrderSynced === 'function') {
            store.markOrderSynced(item.id)
          }
        } catch {}

        dispatchOutboxEvent('kg-outbox-updated')

        if (item.action === 'upsert' && item.payload?.deposit?.image === '__OFFLINE_IMAGE_BUFFER_REF__') {
          uploadImageInBackground(item.id, item.payload, mode, token).catch(() => {})
        }
      }
    }
    if (abortedOffline) break
  }

  return { processed: processedCount, failures: failureCount }
}

export async function triggerSync(forceRetryAll = false): Promise<{ processed: number; failures: number }> {
  if (activeSyncPromise) {
    // Queue follow-up pass instead of dropping caller's request (especially when forceRetryAll=true!)
    queuedSyncRequest = {
      forceRetryAll: Boolean(queuedSyncRequest?.forceRetryAll || forceRetryAll)
    }
    return activeSyncPromise
  }

  dispatchOutboxEvent('kg-outbox-sync-state', { syncing: true })

  activeSyncPromise = (async () => {
    let totalProcessed = 0
    let totalFailures = 0
    let nextForceRetry = forceRetryAll

    try {
      while (true) {
        const passRes = await executeSingleSyncPass(nextForceRetry)
        totalProcessed += passRes.processed
        totalFailures = passRes.failures

        if (queuedSyncRequest) {
          const req = queuedSyncRequest
          queuedSyncRequest = null
          nextForceRetry = req.forceRetryAll
          continue
        }
        break
      }
    } catch (e: any) {
      console.error('[Outbox Sync] Sync runner error:', e.message)
    } finally {
      activeSyncPromise = null
      queuedSyncRequest = null
      dispatchOutboxEvent('kg-outbox-sync-state', { syncing: false })
      try {
        const store = _storeDelegate?.getStore ? _storeDelegate.getStore() : null
        if (store && typeof store.updateOfflineQueueCount === 'function') {
          await store.updateOfflineQueueCount()
        }
        dispatchOutboxEvent('kg-outbox-updated')
      } catch (err) {
        console.warn('[Outbox Sync] Failed to update offline queue count in store:', err)
      }
    }

    return { processed: totalProcessed, failures: totalFailures }
  })()

  return activeSyncPromise
}

async function uploadImageInBackground(id: string, payload: any, mode: string, token?: string) {
  try {
    const imageBase64 = await outbox.getImageFromBuffer(id)
    if (!imageBase64) return

    console.log(`[Outbox Background Sync] Syncing image for order ${id}...`)

    const imagePayload = outbox.normalizeOrderPayloadForSync(id, payload)
    if (!imagePayload.deposit) imagePayload.deposit = {}
    imagePayload.deposit.image = imageBase64
    imagePayload.skipNotification = true

    if (mode === 'gas' || mode === 'dual_write') {
      const sheetsPayload = {
        action: 'saveOrder',
        id: id,
        data: imagePayload,
        idempotencyKey: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2)
      }
      await enqueueGasMutation('saveOrder', () =>
        postSheetsRequest(sheetsPayload, SHEETS_SINGLE_TIMEOUT_MS)
      )
    }

    if (mode === 'postgres' || mode === 'dual_write') {
      await pgRepo.saveOrder(imagePayload, token)
    }

    await outbox.deleteImageFromBuffer(id)
    console.log(`[Outbox Background Sync] Image sync successful & purged for order ${id}.`)
  } catch (err: any) {
    console.warn(`[Outbox Background Sync] Image sync failed for order ${id}:`, err.message)
  }
}

// Watch network online event with debounce + automatic one-time dead-letter recovery on startup
let onlineDebounceTimer: any = null
if (typeof window !== 'undefined' && import.meta.env.MODE !== 'test') {
  window.addEventListener('online', () => {
    if (onlineDebounceTimer) clearTimeout(onlineDebounceTimer)
    onlineDebounceTimer = setTimeout(() => {
      triggerSync()
    }, 500)
  })

  setTimeout(async () => {
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem(OUTBOX_RECOVERY_KEY) !== '1') {
        const resetCount = await outbox.resetFailedOutboxAttempts(false)
        localStorage.setItem(OUTBOX_RECOVERY_KEY, '1')
        if (resetCount > 0) {
          console.info(`[Outbox Recovery] Reset ${resetCount} stuck dead-letter orders for automatic Dual-Write sync.`)
        }
        if (navigator.onLine) {
          await triggerSync(true)
          return
        }
      }
    } catch {}

    if (navigator.onLine) {
      triggerSync()
    }
  }, 300)
}
