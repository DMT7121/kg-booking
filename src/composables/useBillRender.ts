import { ref, nextTick } from 'vue'
import { useFormStore } from '@/stores/useFormStore'
import { useAppStore } from '@/stores/useAppStore'
import { useUIStore } from '@/stores/useUIStore'
import { stripAccents, resizeImage, loadLibrary, isIOS, isAndroid, isMobile } from '@/utils'
import { fetchWithRetry } from '@/services/api'
import { smartUploadImage } from '@/services/r2'
import { cacheBillImage, addToOfflineQueue } from '@/services/cache'


declare const html2canvas: any

/**
 * Bill rendering composable (SINGLETON)
 * Handles html2canvas rendering, save/export pipeline, and responsive scaling
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

  const billRef = ref<HTMLElement | null>(null)
  const isRendering = ref(false)
  const mobileScaleStyles = ref<Record<string, string>>({})
  const wrapperScaleStyles = ref<Record<string, string>>({})

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
  function triggerSave(type: string, validateFn?: () => boolean) {
    if (validateFn && !validateFn()) return
    uiStore.pendingAction = type
    uiStore.showStaffSelector = true
  }

  // --- Confirm Staff & Save ---
  async function confirmStaffAndSave(staff: { name: string; phone: string }) {
    formStore.staff.name = staff.name
    formStore.staff.phone = staff.phone
    await nextTick()
    uiStore.showStaffSelector = false
    formStore.saveType = uiStore.pendingAction || ''
    await performOptimisticSave()
  }

  // --- Main Save Pipeline ---
  async function performOptimisticSave() {
    uiStore.loading.is = true
    uiStore.loading.msg = 'ĐANG XỬ LÝ...'
    uiStore.loading.subMsg = 'Rendering High-Res...'
    uiStore.connectionStatus = 'syncing'
    await nextTick()
    await new Promise(r => setTimeout(r, isIOS ? 150 : 50))

    const currentSnapshot = formStore.getDataSnapshot()
    const hasChanges = formStore.originalState !== currentSnapshot
    const isNewOrder = !formStore.originalState

    if (!isNewOrder && !hasChanges) {
      uiStore.connectionStatus = 'online'
      if (formStore.saveType === 'save') {
        uiStore.loading.is = false
        return uiStore.showToast('Dữ liệu đã đồng bộ - Không có thay đổi mới.', 'info')
      }
      if (formStore.saveType === 'image') {
        uiStore.loading.subMsg = 'Local Render (No Sync)...'
      }
    }

    if (!isNewOrder && hasChanges) {
      formStore.version = (formStore.version || 1) + 1
    }

    try {
      if (typeof html2canvas === 'undefined') {
        await loadLibrary('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js')
      }
      await document.fonts.ready

      const currentScrollX = window.scrollX
      const currentScrollY = window.scrollY
      window.scrollTo(0, 0)

      const originalElement = document.getElementById('bill-render')
      if (!originalElement) throw new Error('Không tìm thấy phiếu đặt. Vui lòng thử lại.')

      // ALWAYS clone bill to avoid any scroll offset, transform clipping, or hidden state issues
      const container = document.createElement('div')
      container.id = 'sandbox-container'
      container.style.cssText = 'position:fixed;top:0;left:-9999px;width:800px;z-index:-9999;visibility:visible;opacity:1;pointer-events:none;'
      const clone = originalElement.cloneNode(true) as HTMLElement
      clone.id = 'bill-render' // Keep ID so all #bill-render CSS rules apply to the clone
      clone.style.cssText = 'transform:none !important;margin:0;width:800px;min-height:100px;'
      
      const originalId = originalElement.id
      originalElement.id = 'bill-render-original' // Temporarily rename original to avoid ID collision

      container.appendChild(clone)
      document.body.appendChild(container)
      const elementToRender = clone
      
      // Wait for fonts, images, and layout to settle
      await new Promise(r => setTimeout(r, isIOS ? 500 : 300))

      // Inline all images to avoid CORS/taint issues which crash the render on PC
      try {
        const imgs = Array.from(elementToRender.querySelectorAll('img'))
        await Promise.all(imgs.map(async (img) => {
          if (!img.src || img.src.startsWith('data:')) return
          try {
            const r = await fetch(img.src)
            const blob = await r.blob()
            const base64 = await new Promise<string>((res) => {
              const reader = new FileReader()
              reader.onloadend = () => res(reader.result as string)
              reader.readAsDataURL(blob)
            })
            img.src = base64
          } catch (e) { img.style.display = 'none' } // Hide if CORS blocked
        }))
      } catch (e) {}

      let canvas: HTMLCanvasElement | null = null

      // Wait for rendering pipeline
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))

      // Render fixed high-quality scale directly (siêu nhanh)
      try {
        canvas = await html2canvas(elementToRender, {
          scale: 2, useCORS: true, logging: false,
          backgroundColor: '#ffffff', width: 800, windowWidth: 800,
          ignoreElements: (el: Element) => el.classList.contains('no-print') || (el as HTMLElement).style?.display === 'none'
        })
      } catch (e) {
        console.error('H2C Error', e)
        canvas = null
      }

      if (container) document.body.removeChild(container)
      originalElement.id = originalId // restore original ID
      window.scrollTo(currentScrollX, currentScrollY)

      if (!canvas) throw new Error('Render ảnh thất bại. Vui lòng chuyển sang tab Bill rồi thử lại.')

      const highResBase64 = canvas.toDataURL('image/jpeg', 0.85)

      if (highResBase64.length < 500) throw new Error('Render ảnh thất bại (File quá nhỏ). Vui lòng thử lại.')

      const dynamicFileName = constructFileName()

      uiStore.loading.subMsg = 'Optimizing Payload...'
      const lowResBase64 = await resizeImage(highResBase64, 800)

      uiStore.loading.subMsg = 'Uploading Images...'

      // Smart upload bill image: R2 first, fallback to base64 for GAS
      const billUpload = await smartUploadImage(
        lowResBase64,
        `${dynamicFileName}.jpg`,
        formStore.id || undefined
      )

      // Smart upload transfer image if exists
      let transferUpload: { url: string; source: 'r2' | 'base64'; key?: string } = { url: formStore.deposit.image || '', source: 'base64' }
      if (formStore.deposit.image && formStore.deposit.image.includes('base64')) {
        transferUpload = await smartUploadImage(
          formStore.deposit.image,
          `CK_${formStore.customer.name}_${Date.now()}.jpg`,
          formStore.id || undefined
        )
      }

      // Cache bill image locally for offline preview
      cacheBillImage(formStore.id || '', lowResBase64)

      uiStore.loading.subMsg = 'Building Payload...'

      const metadata = {
        customerName: formStore.customer.name,
        customerPhone: formStore.customer.phone,
        customerTable: formStore.customer.tables,
        bookingDate: formStore.customer.date,
        totalAmount: formStore.calculatedTotals.final,
        itemsCount: formStore.items.length,
        isDeposited: formStore.deposit.isPaid,
        staff: formStore.staff.name,
        aiEngine: formStore.aiMetadata ? formStore.aiMetadata.model_used : '',
        timestamp: new Date().toISOString()
      }

      const payload: any = {
        customer: formStore.customer,
        items: formStore.items,
        deposit: { ...formStore.deposit, image: transferUpload.url },
        staff: formStore.staff,
        id: formStore.id || crypto.randomUUID(),
        version: formStore.version || 1,
        total: formStore.calculatedTotals.final,
        billImage: billUpload.source === 'r2' ? billUpload.url : lowResBase64,
        customFileName: dynamicFileName,
        oldBillFileId: formStore.oldBillFileId,
        smartIndex: metadata,
        renderPdf: formStore.saveType === 'pdf',
        imageSource: billUpload.source
      }

      if (formStore.saveType === 'pdf') {
        uiStore.loading.subMsg = 'Generating PDF...'
        if (typeof (window as any).jspdf === 'undefined') {
          await loadLibrary('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')
        }
        const { jsPDF } = (window as any).jspdf
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
        const pdfWidth = doc.internal.pageSize.getWidth()
        const imgProps = doc.getImageProperties(highResBase64)
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width
        doc.addImage(highResBase64, 'JPEG', 0, 0, pdfWidth, pdfHeight)
        doc.save(`${dynamicFileName}.pdf`)
        uiStore.showToast('Xuất PDF tức thì thành công!', 'success')
      }

      // ══════════════════════════════════════════════════════════════
      //  INSTANT ACTION: Save image/PDF immediately (don't wait for cloud)
      // ══════════════════════════════════════════════════════════════
      if (formStore.saveType === 'image' || formStore.saveType === 'copy') {
        // Release UI immediately — user gets their file NOW
        uiStore.loading.is = false
        await universalSaveImage(highResBase64, `${dynamicFileName}.jpg`)
        uiStore.showToast('✅ Xuất ảnh tức thì!', 'success')
      } else if (formStore.saveType === 'pdf') {
        // PDF already saved above, just release UI
        uiStore.loading.is = false
      } else if (formStore.saveType === 'print') {
        uiStore.loading.is = false
        setTimeout(() => { window.print() }, 300)
      } else if (formStore.saveType === 'save') {
        // For "save only", show brief loading then release
        uiStore.loading.subMsg = 'Đang gửi...'
      }

      // ══════════════════════════════════════════════════════════════
      //  BACKGROUND SYNC: Cloud save runs silently after UI is free
      // ══════════════════════════════════════════════════════════════
      const needsSync = isNewOrder || hasChanges || formStore.saveType === 'save'

      if (needsSync) {
        // Mark syncing indicator (non-blocking)
        uiStore.connectionStatus = 'syncing'

        // Fire-and-forget cloud sync
        const syncPromise = fetchWithRetry({ action: 'saveOrder', data: payload })
          .then((result: any) => {
            if (result?.ok) {
              formStore.originalState = formStore.getDataSnapshot()
              uiStore.connectionStatus = 'online'
              formStore.oldBillFileId = null
              formStore.aiMetadata = null

              if (result.syncResult && !result.syncResult.ok) {
                uiStore.showToast(result.syncResult.msg, 'warning')
              } else {
                // Only show sync toast if user hasn't navigated away
                const syncMsg = formStore.saveType === 'save'
                  ? '☁️ Đồng bộ Cloud hoàn tất!'
                  : '☁️ Đã đồng bộ ngầm thành công'
                uiStore.showToast(syncMsg, 'success', 2000)
              }

              // Refresh history in background
              appStore.loadHistory(true)
              if (formStore.saveType === 'save') uiStore.tab = 'history'
            } else {
              throw new Error(result?.message || 'Sync failed')
            }
          })
          .catch(async (err: any) => {
            console.error('[BG Sync] Failed:', err.message)
            uiStore.connectionStatus = 'error'
            uiStore.showToast('⚠️ Lưu cục bộ OK — Chờ mạng để đồng bộ', 'warning', 5000)
            
            // Add to offline queue for later sync
            await addToOfflineQueue({
              id: payload.id || crypto.randomUUID(),
              action: 'saveOrder',
              payload: payload,
              timestamp: Date.now()
            })
          })

        // If save-only mode, wait for sync to complete before switching tab
        if (formStore.saveType === 'save') {
          await syncPromise
          uiStore.loading.is = false
        }
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
   * Universal Image Save - Works on ALL devices/browsers
   * Strategy:
   *  1. Web Share API (mobile native share sheet - best UX)
   *  2. iOS Safari: open blob in new tab (user long-presses to save)
   *  3. Desktop / fallback: classic <a download> click
   */
  async function universalSaveImage(base64Data: string, filename: string) {
    const binStr = atob(base64Data.split(',')[1])
    const len = binStr.length
    const arr = new Uint8Array(len)
    for (let i = 0; i < len; i++) arr[i] = binStr.charCodeAt(i)
    const blob = new Blob([arr], { type: 'image/jpeg' })

    // --- Strategy 1: Web Share API (works great on mobile) ---
    if (isMobile && navigator.share && navigator.canShare) {
      try {
        const file = new File([blob], filename, { type: 'image/jpeg' })
        const shareData = { files: [file], title: filename }
        if (navigator.canShare(shareData)) {
          await navigator.share(shareData)
          return // success
        }
      } catch (e: any) {
        // User cancelled share or API not supported for files
        if (e.name === 'AbortError') return // user cancelled, that's OK
        console.warn('[Save] Share API failed, trying fallback:', e.message)
      }
    }

    // --- Strategy 2: iOS Safari fallback (open in new tab) ---
    if (isIOS) {
      try {
        const blobUrl = URL.createObjectURL(blob)
        const newTab = window.open(blobUrl, '_blank')
        if (newTab) {
          // Cleanup after some time
          setTimeout(() => URL.revokeObjectURL(blobUrl), 60000)
          uiStore.showToast('📱 Ảnh đã mở — nhấn giữ để lưu về máy!', 'info', 4000)
          return
        }
        URL.revokeObjectURL(blobUrl)
      } catch (e) {
        console.warn('[Save] iOS fallback failed:', e)
      }
    }

    // --- Strategy 3: Android WebView / in-app browser fallback ---
    if (isAndroid) {
      try {
        // Try download via <a> with download attribute first
        const blobUrl = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = blobUrl
        link.download = filename
        link.style.display = 'none'
        document.body.appendChild(link)

        // Use both click methods for max compatibility
        link.click()
        // Some Android WebViews need a timeout
        await new Promise(r => setTimeout(r, 500))
        document.body.removeChild(link)

        // Verify download started by checking if blob URL is still valid
        setTimeout(() => URL.revokeObjectURL(blobUrl), 30000)
        return
      } catch (e) {
        console.warn('[Save] Android download failed, opening in new tab:', e)
        // Fallback: open in new tab
        const blobUrl = URL.createObjectURL(blob)
        window.open(blobUrl, '_blank')
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000)
        uiStore.showToast('📱 Ảnh đã mở — nhấn giữ hoặc nhấn ⋮ → Tải về!', 'info', 4000)
        return
      }
    }

    // --- Strategy 4: Desktop classic download ---
    const blobUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = filename
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000)
  }

  // --- Responsive Preview Scaling ---
  function updatePreviewScale() {
    const el = document.getElementById('bill-render')
    if (!el) return
    
    // Always fit inside a 480px max-width constraint (minus padding) or the window width on smaller devices.
    const availableWidth = Math.min(window.innerWidth - 32, 480 - 32)
    
    if (availableWidth < 800) {
      const s = availableWidth / 800
      requestAnimationFrame(() => {
        const h = el.scrollHeight || 800
        mobileScaleStyles.value = { transform: `scale(${s})`, transformOrigin: 'top left', margin: '0' }
        wrapperScaleStyles.value = { width: `${800 * s}px`, height: `${h * s + 16}px`, position: 'relative', margin: '0 auto' }
      })
    } else {
      mobileScaleStyles.value = { transform: 'none', transformOrigin: 'top center', margin: '0 auto' }
      wrapperScaleStyles.value = { width: '100%', display: 'flex', justifyContent: 'center' }
    }
  }

  return {
    billRef, isRendering, mobileScaleStyles, wrapperScaleStyles,
    constructFileName, triggerSave, confirmStaffAndSave, performOptimisticSave,
    updatePreviewScale, universalSaveImage
  }
}
