import { ref, nextTick } from 'vue'
import { useFormStore } from '@/stores/useFormStore'
import { useAppStore } from '@/stores/useAppStore'
import { useUIStore } from '@/stores/useUIStore'
import { useConfigStore } from '@/stores/useConfigStore'
import { stripAccents, resizeImage, isIOS, isDesktop, generateBookingId } from '@/utils'
import { updateOrderImages } from '@/services/api'
import { smartUploadImage } from '@/services/r2'
import { useAI } from '@/composables/useAI'
import { cacheBillImage } from '@/services/cache'
import { addToOutbox } from '@/infrastructure/outbox/outbox'
import {
  prewarmBillExportAssets,
  renderBillElementToCanvas,
  canvasToPngBlob,
  canvasToOptimizedWebpDataUrl,
  copyCanvasPngToClipboard,
  savePngBlobToDevice,
  exportCanvasToPdf,
  type BillQualityPreset
} from '@/utils/billExportEngine'

/**
 * Bill rendering composable (SINGLETON)
 * Handles high-precision PNG/PDF export pipeline, clipboard copy, and responsive scaling
 */
let _billInstance: ReturnType<typeof _createBillRender> | null = null

export function useBillRender() {
  if (!_billInstance) _billInstance = _createBillRender()
  return _billInstance
}

function _createBillRender() {
  const formStore = useFormStore()
  const appStore = useAppStore()
  const uiStore = useUIStore()
  const configStore = useConfigStore()
  const { checkAndLogAiCorrections } = useAI()

  // Pre-warm static bill stamps & logos during idle time for 0ms network wait on first export
  prewarmBillExportAssets()

  const billRef = ref<HTMLElement | null>(null)
  const isRendering = ref(false)
  const mobileScaleStyles = ref<Record<string, string>>({})
  const wrapperScaleStyles = ref<Record<string, string>>({})
  const zoomMode = ref<'fit-width' | 'fit-screen' | 'manual'>('fit-width')
  const zoomScale = ref<number>(1)
  const isFullscreen = ref(false)

  // --- File Name Construction ---
  function constructFileName(): string {
    const depositStatus = formStore.deposit.isPaid ? '|Y|' : '|N|'
    const dateParts = formStore.customer.date.split('/')
    let dateStr = '00.00.00'
    if (dateParts.length === 3) {
      dateStr = `${dateParts[0]}.${dateParts[1]}.${dateParts[2].slice(-2)}`
    }
    let tables = (formStore.customer.tables || '0').trim()
    tables = stripAccents(tables).toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (!tables) tables = '0'
    const name = stripAccents(formStore.customer.name || 'KHACH').toUpperCase().replace(/[^A-Z0-9\s]/g, '').trim()
    return `${depositStatus} ${dateStr} ${tables} ${name}`
  }

  // --- Trigger Save ---
  async function triggerSave(type: string, validateFn?: () => boolean) {
    if (uiStore.loading.is) return
    if (validateFn && !validateFn()) return
    
    // Interactive Confirmation Gate before saving
    const isConfirmed = await uiStore.openBookingConfirmation({
      customer: formStore.customer,
      items: formStore.items,
      deposit: formStore.deposit,
      rawInput: formStore.rawInput
    })

    if (!isConfirmed) return

    uiStore.pendingAction = type
    if (uiStore.pinShiftStaff && uiStore.activeShiftStaff?.name && uiStore.activeShiftStaff?.phone) {
      await confirmStaffAndSave(uiStore.activeShiftStaff)
    } else {
      uiStore.showStaffSelector = true
    }
  }

  // --- Confirm Staff & Save ---
  async function confirmStaffAndSave(staff: { name: string; phone: string; role?: string }) {
    if (uiStore.loading.is) return
    formStore.staff.name = staff.name
    formStore.staff.phone = staff.phone
    if (uiStore.pinShiftStaff) {
      uiStore.setActiveShiftStaff(staff, true)
    }
    await nextTick()
    uiStore.showStaffSelector = false
    if (!uiStore.pendingAction) {
      uiStore.showToast(`👤 Đã chọn nhân viên trực ca: ${staff.name}`, 'success')
      return
    }
    formStore.saveType = uiStore.pendingAction || ''
    uiStore.pendingAction = null
    await performOptimisticSave()
  }

  // --- Main Save Pipeline ---
  async function performOptimisticSave() {
    uiStore.loading.is = true
    uiStore.loading.msg = 'ĐANG XỬ LÝ...'
    uiStore.loading.subMsg = 'Đang kết xuất phiếu sắc nét...'
    uiStore.connectionStatus = 'syncing'
    await nextTick()

    const currentSnapshot = formStore.getDataSnapshot()
    const hasChanges = formStore.originalState !== currentSnapshot
    const isNewOrder = !formStore.originalState

    if (!isNewOrder && !hasChanges) {
      uiStore.connectionStatus = 'online'
      if (formStore.saveType === 'save') {
        uiStore.loading.is = false
        return uiStore.showToast('Dữ liệu đã đồng bộ - Không có thay đổi mới.', 'info')
      }
      if (formStore.saveType === 'image' || formStore.saveType === 'copy') {
        uiStore.loading.subMsg = 'Đang xuất ảnh PNG sắc nét...'
      }
    }

    if (!isNewOrder && hasChanges) {
      formStore.version = (formStore.version || 1) + 1
    }

    const dynamicFileName = constructFileName()
    const saveType = formStore.saveType
    const needsForegroundRender = saveType === 'image' || saveType === 'copy' || saveType === 'pdf'
    let renderedCanvas: HTMLCanvasElement | null = null
    let billClone: HTMLElement | null = null

    // Clone the bill-render element synchronously before any UI/tab/state changes
    try {
      const originalElement = document.getElementById('bill-render')
      if (originalElement) {
        billClone = originalElement.cloneNode(true) as HTMLElement
      }
    } catch (e) {
      console.warn('[useBillRender] Failed to clone bill-render element:', e)
    }

    try {
      // ONLY run synchronous foreground rendering when user requested PNG, Copy, or PDF export
      if (needsForegroundRender) {
        const originalElement = document.getElementById('bill-render')
        if (!originalElement && !billClone) {
          throw new Error('Không tìm thấy phiếu đặt. Vui lòng thử lại.')
        }

        const qualitySetting = (configStore.billPreferences?.quality || 'hd') as BillQualityPreset
        const renderResult = await renderBillElementToCanvas({
          element: (originalElement || billClone) as HTMLElement,
          preClonedElement: billClone,
          width: 800,
          quality: qualitySetting,
          backgroundColor: '#ffffff'
        })
        renderedCanvas = renderResult.canvas
      }

      // Capture all formStore state locally before releasing UI / running background sync
      const orderId = formStore.id || generateBookingId()
      formStore.id = orderId
      const orderVersion = formStore.version || 1
      const customer = JSON.parse(JSON.stringify(formStore.customer))
      const items = JSON.parse(JSON.stringify(formStore.items))
      const depositAmount = formStore.deposit.amount
      const depositIsPaid = formStore.deposit.isPaid
      const depositImage = formStore.deposit.image || ''
      const depositInfo = JSON.parse(JSON.stringify(formStore.deposit))
      const staff = JSON.parse(JSON.stringify(formStore.staff))
      const calculatedTotalsFinal = formStore.calculatedTotals.final
      const oldBillFileId = formStore.oldBillFileId
      const activeSheet = appStore.activeSheet
      const aiEngine = formStore.aiMetadata ? formStore.aiMetadata.model_used : ''

      // ══════════════════════════════════════════════════════════════
      //  INSTANT ACTION: Save PNG / Copy / PDF / Print immediately
      // ══════════════════════════════════════════════════════════════
      if (saveType === 'image' && renderedCanvas) {
        // Release UI immediately — user gets their lossless PNG file NOW
        uiStore.loading.is = false
        const [pngBlob, copiedToClipboard] = await Promise.all([
          canvasToPngBlob(renderedCanvas),
          isDesktop ? copyCanvasPngToClipboard(renderedCanvas) : Promise.resolve(false)
        ])
        await savePngBlobToDevice(pngBlob, `${dynamicFileName}.png`, (infoMsg) => {
          uiStore.showToast(infoMsg, 'info', 4000)
        })
        uiStore.showToast(
          copiedToClipboard
            ? '✅ Đã tải PNG sắc nét & copy sẵn vào bộ nhớ tạm (Ctrl+V dán Zalo)!'
            : '✅ Xuất ảnh PNG sắc nét tức thì!',
          'success',
          3500
        )
      } else if (saveType === 'copy' && renderedCanvas) {
        uiStore.loading.is = false
        const copied = await copyCanvasPngToClipboard(renderedCanvas)
        if (copied) {
          uiStore.showToast('📋 Đã copy ảnh PNG sắc nét! Bấm Ctrl+V để dán vào Zalo / Messenger.', 'success', 3500)
        } else {
          const pngBlob = await canvasToPngBlob(renderedCanvas)
          await savePngBlobToDevice(pngBlob, `${dynamicFileName}.png`, (infoMsg) => {
            uiStore.showToast(infoMsg, 'info', 4000)
          })
          uiStore.showToast('✅ Đã xuất ảnh PNG sắc nét!', 'success')
        }
      } else if (saveType === 'pdf' && renderedCanvas) {
        uiStore.loading.subMsg = 'Đang đóng gói PDF sắc nét...'
        await exportCanvasToPdf(renderedCanvas, `${dynamicFileName}.pdf`)
        uiStore.showToast('✅ Xuất PDF sắc nét thành công!', 'success')
        uiStore.loading.is = false
      } else if (saveType === 'print') {
        uiStore.loading.is = false
        setTimeout(() => { window.print() }, 300)
      } else if (saveType === 'save') {
        // For "save only", release UI immediately (Optimistic UI - 0ms delay!)
        uiStore.loading.is = false
        uiStore.tab = 'history'
      }

      // Reset form changed state immediately since we are syncing optimistically
      formStore.originalState = formStore.getDataSnapshot()
      formStore.oldBillFileId = null
      formStore.aiMetadata = null

      // ══════════════════════════════════════════════════════════════
      //  BACKGROUND SYNC: Cloud save runs silently after UI is free
      // ══════════════════════════════════════════════════════════════
      const needsSync = isNewOrder || hasChanges || saveType === 'save'
      console.log('[useBillRender] needsSync:', needsSync, { isNewOrder, hasChanges, saveType })

      if (needsSync) {
        console.log('[useBillRender] Starting background sync...')
        // Run AI corrections auto-learning
        checkAndLogAiCorrections()

        const optimisticOrder = {
          id: orderId,
          version: orderVersion,
          timestamp: new Date().toISOString(),
          parsedCustomer: {
            name: customer.name,
            phone: customer.phone,
            date: customer.date,
            time: customer.time || '',
            pax: String(customer.pax || ''),
            tables: customer.tables || '',
            type: customer.type || 'Ăn thường',
            note: customer.note || ''
          },
          menuItems: items,
          totalAmount: calculatedTotalsFinal,
          depositAmount: depositAmount || 0,
          isDeposited: depositIsPaid,
          transferImage: depositImage,
          deposit: { ...depositInfo },
          depositTime: depositInfo?.time || '',
          depositHistory: depositInfo?.history || [],
          staff: staff,
          isSyncing: true
        }

        // Save optimistic order locally
        appStore.setOptimisticOrder(optimisticOrder)

        // Fire-and-forget background task
        const runBackgroundSync = async () => {
          let fastPayload: any = null
          try {
            // Task 1: Uploading images (in parallel with saving order)
            const uploadPromise = (async () => {
              let billUploadUrl = ''
              let billUploadSource = 'base64'
              let uploadedReceiptUrl = depositImage

              let bgCanvas: HTMLCanvasElement | null = renderedCanvas

              // If it's a save-only or print operation, render the canvas in the background
              if (!bgCanvas && billClone) {
                try {
                  const bgResult = await renderBillElementToCanvas({
                    element: billClone,
                    preClonedElement: billClone,
                    width: 800,
                    quality: 'hd',
                    backgroundColor: '#ffffff'
                  })
                  bgCanvas = bgResult.canvas
                } catch (err: any) {
                  console.warn('[BG Sync] Failed to render bill canvas in background:', err.message)
                }
              }

              // 1. Process bill image optimization & upload in background (Direct Canvas -> WebP 1800px 0.94)
              if (bgCanvas) {
                try {
                  const lowResBase64 = canvasToOptimizedWebpDataUrl(bgCanvas, 1800, 0.94)
                  const billUpload = await smartUploadImage(
                    lowResBase64,
                    `${dynamicFileName}.webp`,
                    orderId
                  )
                  if (billUpload.url) {
                    billUploadUrl = billUpload.url
                    billUploadSource = billUpload.source
                    cacheBillImage(orderId, lowResBase64)
                  }
                } catch (err) {
                  console.warn('[BG Sync] Failed to process/upload bill image:', err)
                }
              }

              // 2. Process receipt upload in background (if it is base64)
              if (depositImage && depositImage.includes('base64')) {
                try {
                  const receiptUpload = await smartUploadImage(
                    depositImage,
                    `CK_${customer.name}_${Date.now()}.jpg`,
                    orderId
                  )
                  if (receiptUpload.url) {
                    uploadedReceiptUrl = receiptUpload.url
                  }
                } catch (err) {
                  console.warn('[BG Sync] Failed to upload receipt image:', err)
                }
              }

              return { billUploadUrl, billUploadSource, uploadedReceiptUrl }
            })()

            // Task 2: First-phase Save payload (fast payload without base64 images)
            fastPayload = {
              customer: customer,
              items: items,
              deposit: { ...depositInfo, image: depositImage.startsWith('http') ? depositImage : '' },
              depositTime: depositInfo?.time || '',
              depositHistory: depositInfo?.history || [],
              staff: staff,
              id: orderId,
              version: orderVersion,
              total: calculatedTotalsFinal,
              billImage: '', // Blank initially for fast save
              customFileName: dynamicFileName,
              oldBillFileId: oldBillFileId,
              smartIndex: {
                customerName: customer.name,
                customerPhone: customer.phone,
                customerTable: customer.tables,
                bookingDate: customer.date,
                totalAmount: calculatedTotalsFinal,
                itemsCount: items.length,
                isDeposited: depositIsPaid,
                staff: staff.name,
                aiEngine: aiEngine,
                timestamp: new Date().toISOString()
              },
              renderPdf: saveType === 'pdf',
              imageSource: 'base64',
              activeMenuSheet: activeSheet
            }

            uiStore.connectionStatus = 'syncing'
            const result = await appStore.saveOrder(fastPayload)

            if (result?.ok) {
              if (result.status === 'pending') {
                uiStore.connectionStatus = 'error'
                uiStore.showToast('💾 Đã lưu ngoại tuyến an toàn (Chờ mạng để đồng bộ Cloud)', 'warning', 5000)
              } else if (result.status === 'partially_synced') {
                uiStore.connectionStatus = 'degraded'
                uiStore.showToast('⚠️ Đã lưu 1 nguồn — Đang đồng bộ nguồn còn lại qua hàng đợi ngầm', 'info', 5000)
              } else {
                uiStore.connectionStatus = 'online'
                // Mark synced in local store
                appStore.markOrderSynced(orderId, result.data || {})

                // Display detailed calendar sync status to user
                let calendarMsg = ''
                let calendarType: 'success' | 'warning' | 'info' = 'success'
                if (result.calendarSync) {
                  const status = result.calendarSync.status
                  const msg = result.calendarSync.message
                  if (status === 'SUCCESS') {
                    calendarMsg = '📅 Đã tự động cập nhật sơ đồ lịch bàn.'
                    calendarType = 'success'
                  } else if (status === 'MOVED_DATE') {
                    calendarMsg = '📅 Khách đổi ngày - Đã thu hồi ô cũ và xếp sang ngày mới.'
                    calendarType = 'success'
                  } else if (status === 'MOVED_TABLE') {
                    calendarMsg = '📅 Khách đổi bàn - Đã thu hồi bàn cũ và xếp sang bàn mới.'
                    calendarType = 'success'
                  } else if (status === 'CONFLICT') {
                    calendarMsg = '⚠️ Xung đột vị trí - Bàn đã bị trùng với tiệc khác cùng khung giờ.'
                    calendarType = 'warning'
                  } else if (status === 'NO_SLOT') {
                    calendarMsg = '⚠️ Hết chỗ trống hoặc không tìm thấy ngày trong sơ đồ lịch.'
                    calendarType = 'warning'
                  } else if (status === 'FAILED' || status === 'ERROR') {
                    calendarMsg = `❌ Lỗi đồng bộ lịch: ${msg || 'Không rõ nguyên nhân'}`
                    calendarType = 'warning'
                  }
                }

                if (calendarMsg) {
                  uiStore.showToast(calendarMsg, calendarType, 5000)
                } else {
                  const syncMsg = saveType === 'save'
                    ? '☁️ Đồng bộ Cloud hoàn tất!'
                    : '☁️ Đã đồng bộ ngầm thành công'
                  uiStore.showToast(syncMsg, 'success', 2000)
                }
              }

              // Await image upload completion in background
              const uploads = await uploadPromise

              // Phase 2: Update images on GAS once uploaded
              if (uploads.billUploadUrl || uploads.uploadedReceiptUrl !== depositImage) {
                try {
                  const updateRes = await updateOrderImages(
                    orderId,
                    uploads.billUploadUrl,
                    uploads.uploadedReceiptUrl !== depositImage ? uploads.uploadedReceiptUrl : ''
                  )
                  if (updateRes?.ok) {
                    console.log('[BG Sync] Successfully updated order images on GAS')
                    optimisticOrder.transferImage = uploads.uploadedReceiptUrl
                    appStore.setOptimisticOrder(optimisticOrder)
                  }
                } catch (updateErr) {
                  console.warn('[BG Sync] Failed to update image links on GAS:', updateErr)
                }
              }

              // Refresh history in background
              appStore.loadHistory(true)
            } else {
              throw new Error(result?.message || 'Sync failed')
            }
          } catch (err: any) {
            console.error('[BG Sync] Failed:', err.message)
            uiStore.connectionStatus = 'error'
            uiStore.showToast('❌ Không thể kết nối server. Đã tự động lưu vào hàng đợi Outbox!', 'warning', 5000)
            
            // Safety net: Enqueue to outbox so order is never lost!
            try {
              await addToOutbox(orderId, 'upsert', fastPayload || optimisticOrder)
            } catch (outboxErr) {
              console.error('[BG Sync Safety Net] Failed to queue to outbox:', outboxErr)
            }

            // Mark failed/not syncing locally
            appStore.markOrderFailed(orderId)
          }
        }

        runBackgroundSync()
      } else {
        uiStore.connectionStatus = 'online'
      }
    } catch (e: any) {
      uiStore.connectionStatus = 'error'
      uiStore.error = { show: true, msg: 'Sync Error: ' + e.message }
      uiStore.loading.is = false
    }
  }

  /**
   * Universal Image Save - Preserved for backward compatibility
   */
  async function universalSaveImage(base64Data: string, filename: string) {
    const isPng = base64Data.startsWith('data:image/png') || filename.toLowerCase().endsWith('.png')
    const mimeType = isPng ? 'image/png' : 'image/jpeg'
    const binStr = atob(base64Data.split(',')[1])
    const len = binStr.length
    const arr = new Uint8Array(len)
    for (let i = 0; i < len; i++) arr[i] = binStr.charCodeAt(i)
    const blob = new Blob([arr], { type: mimeType })

    await savePngBlobToDevice(blob, filename, (infoMsg) => {
      uiStore.showToast(infoMsg, 'info', 4000)
    })
  }

  // --- Responsive Preview Scaling ---
  function updatePreviewScale() {
    const el = document.getElementById('bill-render')
    if (!el) return
    
    // Find the unscaled ancestor container instead of the wrapper parent to avoid circular shrinking
    const container = el.closest('.overflow-y-auto') || el.parentElement?.parentElement
    const containerWidth = container ? container.getBoundingClientRect().width : window.innerWidth
    
    // Do not update or shrink to 0 if the container is currently hidden (display: none)
    if (containerWidth === 0) return
    
    const availableWidth = Math.max(280, containerWidth - 32)
    
    const viewportHeight = window.innerHeight
    const toolbarHeight = 56
    const verticalPadding = 48
    const availableHeight = Math.max(300, viewportHeight - toolbarHeight - verticalPadding - (isFullscreen.value ? 120 : 0))
    
    const billHeight = el.scrollHeight || 1000
    
    let s = 1
    if (zoomMode.value === 'fit-width') {
      s = Math.min(1.0, availableWidth / 800)
      zoomScale.value = Math.round(s * 100) / 100
    } else if (zoomMode.value === 'fit-screen') {
      const sw = availableWidth / 800
      const sh = availableHeight / billHeight
      s = Math.min(sw, sh)
      zoomScale.value = Math.round(s * 100) / 100
    } else {
      s = zoomScale.value
    }
    
    // Only enforce minScale if zoomMode is NOT 'fit-width' and NOT 'fit-screen'
    // (If in fit modes, we must allow it to scale down to fit the container perfectly without horizontal scroll)
    if (zoomMode.value === 'manual') {
      const isDesktopView = window.innerWidth >= 1024
      const minScale = isDesktopView ? 0.5 : 0.25
      if (s < minScale) s = minScale
    }
    if (s > 2.0) s = 2.0
    
    requestAnimationFrame(() => {
      mobileScaleStyles.value = { 
        transform: `translate(-50%, 0) scale(${s})`, 
        transformOrigin: 'top center', 
        position: 'absolute',
        left: '50%',
        top: '0'
      }
      wrapperScaleStyles.value = { 
        width: `${800 * s}px`, 
        height: `${billHeight * s + 16}px`, 
        position: 'relative', 
        margin: '0 auto',
        overflow: 'hidden',
        maxWidth: 'none'
      }
    })
  }

  function setZoomMode(mode: 'fit-width' | 'fit-screen' | 'manual', scale?: number) {
    zoomMode.value = mode
    if (scale !== undefined) {
      zoomScale.value = scale
    }
    updatePreviewScale()
  }

  function adjustZoom(delta: number) {
    zoomMode.value = 'manual'
    let newScale = Math.round((zoomScale.value + delta) * 20) / 20
    if (newScale < 0.3) newScale = 0.3
    if (newScale > 2.0) newScale = 2.0
    zoomScale.value = newScale
    updatePreviewScale()
  }

  return {
    billRef, isRendering, mobileScaleStyles, wrapperScaleStyles,
    zoomMode, zoomScale, isFullscreen, setZoomMode, adjustZoom,
    constructFileName, triggerSave, confirmStaffAndSave, performOptimisticSave,
    updatePreviewScale, universalSaveImage
  }
}
