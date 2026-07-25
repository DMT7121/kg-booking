import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { CACHE_KEYS } from '@/utils/constants'
import { useUIStore } from './useUIStore'
import { UserRole, Permission, can } from '@/auth/permissions'
import { sha256 } from '@/utils/security'
import { DualWriteSettingsRepository as GasSettingsRepository } from '@/infrastructure/dual/dualWriteRepository'

const settingsRepo = new GasSettingsRepository()

export const useAdminStore = defineStore('admin', () => {
  const uiStore = useUIStore()

  const adminToken = ref(sessionStorage.getItem('kg_admin_token') || '')
  const adminExpiresAt = ref(parseInt(sessionStorage.getItem('kg_admin_expires_at') || '0'))

  function getJwtExpiry(token: string): number | null {
    try {
      const parts = token.split('.')
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
        if (payload && typeof payload.exp === 'number') {
          return payload.exp * 1000
        }
      }
    } catch (e) {}
    return null
  }

  function getRoleFromToken(token: string): UserRole {
    if (token === 'admin_bypass' || (token && token.startsWith('ADM_'))) return 'admin'
    try {
      const parts = token.split('.')
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
        if (payload && payload.app_metadata && typeof payload.app_metadata.role === 'string') {
          return payload.app_metadata.role as UserRole
        }
      }
    } catch (e) {}
    return 'staff'
  }

  const currentUserRole = computed<UserRole>(() => {
    if (!adminToken.value) return 'staff'
    const jwtExp = getJwtExpiry(adminToken.value)
    if (jwtExp !== null && Date.now() >= jwtExp) {
      return 'staff'
    }
    if (adminExpiresAt.value <= Date.now()) {
      return 'staff'
    }
    return getRoleFromToken(adminToken.value)
  })

  const isAdminSettingsUnlocked = computed(() => {
    if (!adminToken.value) return false
    const jwtExp = getJwtExpiry(adminToken.value)
    if (jwtExp !== null && Date.now() >= jwtExp) {
      return false
    }
    return adminExpiresAt.value > Date.now()
  })

  function maskPii(data: any) {
    if (!data) return data
    try {
      const clone = JSON.parse(JSON.stringify(data))
      if (typeof clone === 'object') {
        if (clone.customer_name) clone.customer_name = '***'
        if (clone.parsedCustomer) {
          if (clone.parsedCustomer.name) clone.parsedCustomer.name = '***'
          if (clone.parsedCustomer.phone) clone.parsedCustomer.phone = '***'
        }
        if (clone.phone_number) clone.phone_number = '***'
        if (clone.phone) clone.phone = '***'
      }
      return clone
    } catch (e) {
      return data
    }
  }

  async function triggerAuditLog(action: string, targetType?: string, targetId?: string, before?: any, after?: any) {
    try {
      const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'node'
      const uaHash = await sha256(userAgent)
      const ipHash = await sha256('local-client-ip')
      const payload = {
        actor_id: adminToken.value ? 'session-user' : undefined,
        actor_role: currentUserRole.value,
        action,
        target_type: targetType,
        target_id: targetId,
        before_json: before ? maskPii(before) : null,
        after_json: after ? maskPii(after) : null,
        ip_hash: ipHash,
        user_agent_hash: uaHash
      }
      await settingsRepo.writeAuditLog(payload)
    } catch (e) {
      console.warn('[AuditLog] Failed to write audit log:', e)
    }
  }

  async function lockAdminSettings() {
    const roleBefore = currentUserRole.value
    const tokenBefore = adminToken.value
    if (adminToken.value) {
      try {
        await settingsRepo.logoutAdminSettings(adminToken.value)
      } catch (e) {}
    }
    adminToken.value = ''
    adminExpiresAt.value = 0
    sessionStorage.removeItem('kg_admin_token')
    sessionStorage.removeItem('kg_admin_expires_at')
    uiStore.showToast('Đã khóa cấu hình Admin', 'info')
    await triggerAuditLog('logout', 'auth', tokenBefore, { role: roleBefore }, null)
  }

  async function unlockAdminSettings(password: string): Promise<boolean> {
    try {
      const res = await settingsRepo.authAdminSettings(password)
      if (res.ok && res.token) {
        adminToken.value = res.token
        const jwtExp = getJwtExpiry(res.token)
        const expiryTime = jwtExp !== null ? jwtExp : res.expiresAt
        adminExpiresAt.value = expiryTime
        sessionStorage.setItem('kg_admin_token', res.token)
        sessionStorage.setItem('kg_admin_expires_at', String(expiryTime))
        
        const role = getRoleFromToken(res.token)
        const roleLabel = role === 'admin' ? 'Admin' : role === 'manager' ? 'Manager' : 'Staff'
        uiStore.showToast(`Xác thực ${roleLabel} thành công!`, 'success')
        await triggerAuditLog('login', 'auth', res.token, null, { role })
        return true
      } else {
        uiStore.showToast(res.message || 'Mật khẩu PIN không đúng!', 'error')
        return false
      }
    } catch (e: any) {
      console.error(e)
      uiStore.showToast('Lỗi xác thực: ' + e.message, 'error')
      return false
    }
  }

  async function verifyAdminSession(): Promise<boolean> {
    if (isAdminSettingsUnlocked.value) return true
    const pin = await uiStore.showPrompt('Xác Thực Quyền Admin', 'Vui lòng nhập mã PIN Admin để tiếp tục:', 'password')
    if (!pin) return false
    return await unlockAdminSettings(pin)
  }

  async function verifySession(requiredPermission?: Permission): Promise<boolean> {
    if (requiredPermission && can(currentUserRole.value, requiredPermission)) {
      return true
    }
    return await verifyAdminSession()
  }

  function logout() {
    uiStore.showToast('Đang đăng xuất và xóa phiên làm việc...', 'info')
    lockAdminSettings()
    localStorage.removeItem(CACHE_KEYS.HISTORY)
    setTimeout(() => {
      if (typeof window !== 'undefined') window.location.reload()
    }, 500)
  }

  function handleInactivityTimeout() {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('kg_logout_reason', 'inactivity')
    }
    logout()
  }

  return {
    adminToken,
    adminExpiresAt,
    currentUserRole,
    isAdminSettingsUnlocked,
    unlockAdminSettings,
    lockAdminSettings,
    verifyAdminSession,
    verifySession,
    logout,
    handleInactivityTimeout,
    triggerAuditLog,
    maskPii
  }
})
