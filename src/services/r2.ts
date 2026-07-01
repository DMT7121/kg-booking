/**
 * Cloudflare R2 Image Service
 * Handles image upload/download with automatic fallback to GAS/Drive
 * 
 * Free: 10GB storage, 10M reads/month, 1M writes/month, $0 egress
 */

const R2_URL = import.meta.env.VITE_R2_URL || ''

/** Check if R2 is configured */
export function isR2Available(): boolean {
  return !!R2_URL
}

/** Upload base64 image to R2 using presigned URLs */
export async function uploadToR2(
  base64Data: string,
  filename: string,
  orderId?: string
): Promise<{ ok: boolean; url?: string; key?: string; error?: string }> {
  if (!R2_URL) return { ok: false, error: 'R2 not configured' }

  try {
    const { useAppStore } = await import('@/stores/useAppStore')
    const appStore = useAppStore()
    const token = appStore.adminToken

    // 1. Get presigned upload URL
    const presignRes = await fetch(`${R2_URL}/api/images/presign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ filename, type: 'image/jpeg', orderId })
    })

    if (!presignRes.ok) {
      throw new Error(`Failed to get presigned URL: HTTP ${presignRes.status}`)
    }

    const { url, method, key } = await presignRes.json()

    // Convert base64 to binary blob
    let binaryData: Blob
    if (base64Data.startsWith('data:')) {
      const res = await fetch(base64Data)
      binaryData = await res.blob()
    } else {
      const binaryString = atob(base64Data)
      const len = binaryString.length
      const bytes = new Uint8Array(len)
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      binaryData = new Blob([bytes], { type: 'image/jpeg' })
    }

    // 2. Put binary data to presigned upload URL
    const uploadRes = await fetch(url, {
      method: method || 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: binaryData
    })

    if (!uploadRes.ok) {
      throw new Error(`Upload failed: HTTP ${uploadRes.status}`)
    }

    return {
      ok: true,
      url: `${R2_URL}/image/${key}`,
      key
    }
  } catch (e: any) {
    console.warn('[R2] Upload failed, will fallback to GAS:', e.message)
    return { ok: false, error: e.message }
  }
}

/** Delete image from R2 */
export async function deleteFromR2(key: string): Promise<boolean> {
  if (!R2_URL || !key) return false

  try {
    const { useAppStore } = await import('@/stores/useAppStore')
    const appStore = useAppStore()
    const token = appStore.adminToken

    const res = await fetch(`${R2_URL}/image/${key}`, {
      method: 'DELETE',
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    })
    const result = await res.json()
    return result.ok
  } catch {
    return false
  }
}

/** Get R2 image URL from key */
export function getR2ImageUrl(key: string): string {
  return `${R2_URL}/image/${key}`
}

/** Get R2 storage stats */
export async function getR2Stats(): Promise<any> {
  if (!R2_URL) return null
  try {
    const { useAppStore } = await import('@/stores/useAppStore')
    const appStore = useAppStore()
    const token = appStore.adminToken

    const res = await fetch(`${R2_URL}/stats`, {
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    })
    return await res.json()
  } catch {
    return null
  }
}

/** List images for a specific order */
export async function listOrderImages(orderId: string): Promise<any[]> {
  if (!R2_URL) return []
  try {
    const { useAppStore } = await import('@/stores/useAppStore')
    const appStore = useAppStore()
    const token = appStore.adminToken

    const res = await fetch(`${R2_URL}/list?prefix=orders/${orderId}`, {
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    })
    const result = await res.json()
    return result.files || []
  } catch {
    return []
  }
}

/**
 * Smart Upload: Try R2 first, fallback to returning base64 for GAS upload
 * Returns { url, source } where source is 'r2' or 'base64'
 */
export async function smartUploadImage(
  base64Data: string,
  filename: string,
  orderId?: string
): Promise<{ url: string; source: 'r2' | 'base64'; key?: string }> {
  // Try R2 first
  if (isR2Available()) {
    const r2Result = await uploadToR2(base64Data, filename, orderId)
    if (r2Result.ok && r2Result.url) {
      return { url: r2Result.url, source: 'r2', key: r2Result.key }
    }
  }

  // Fallback: return base64 (GAS will handle Drive upload)
  return { url: base64Data, source: 'base64' }
}
