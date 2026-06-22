export type UserRole = 'admin' | 'manager' | 'staff'

export type Permission =
  | 'booking:create'
  | 'booking:update'
  | 'booking:delete'
  | 'booking:resolve_conflict'
  | 'menu:read'
  | 'menu:update'
  | 'ai:use'
  | 'ai:configure'
  | 'users:manage'
  | 'settings:update'
  | 'corrections:approve'

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  staff: [
    'booking:create',
    'booking:update',
    'menu:read',
    'ai:use'
  ],
  manager: [
    'booking:create',
    'booking:update',
    'menu:read',
    'ai:use',
    'booking:resolve_conflict',
    'corrections:approve'
  ],
  admin: [
    'booking:create',
    'booking:update',
    'menu:read',
    'ai:use',
    'booking:resolve_conflict',
    'corrections:approve',
    'booking:delete',
    'menu:update',
    'ai:configure',
    'users:manage',
    'settings:update'
  ]
}

export function can(role: UserRole | undefined | null, permission: Permission): boolean {
  if (!role) return false
  const permissions = ROLE_PERMISSIONS[role] || []
  return permissions.includes(permission)
}

export function requirePermission(role: UserRole | undefined | null, permission: Permission): void {
  if (!can(role, permission)) {
    throw new Error(`Permission Denied: User role [${role || 'anonymous'}] requires permission [${permission}]`)
  }
}
