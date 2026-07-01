import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.hoisted(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://mock-supabase.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'mock-anon-key')
})

import { PostgresOrderRepository, PostgresMenuRepository } from '../postgresRepository'

const mockFetch = vi.fn()
global.fetch = mockFetch

describe('PostgreSQL RLS Integration Security Tests', () => {
  let orderRepo: PostgresOrderRepository
  let menuRepo: PostgresMenuRepository

  beforeEach(() => {
    vi.clearAllMocks()
    orderRepo = new PostgresOrderRepository()
    menuRepo = new PostgresMenuRepository()
  })

  function generateJwtForRole(role: 'admin' | 'manager' | 'staff' | 'anon'): string {
    if (role === 'anon') return ''
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    const payload = btoa(JSON.stringify({
      app_metadata: { role },
      sub: `user-id-${role}`,
      exp: Math.floor(Date.now() / 1000) + 3600
    }))
    return `${header}.${payload}.mocksignature`
  }

  async function simulateGatewayRlsFetch(url: string, init?: RequestInit): Promise<Response> {
    const headers = init?.headers as any || {}
    const authHeader = headers['Authorization'] || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : ''
    
    let role = 'anon'
    if (token) {
      try {
        const payloadStr = atob(token.split('.')[1])
        const payload = JSON.parse(payloadStr)
        role = payload.app_metadata?.role || 'staff'
      } catch (e: any) {
        console.log('JWT Decode Error:', e.message)
      }
    }

    const path = new URL(url).pathname
    const method = init?.method || 'GET'

    if (path.startsWith('/rest/v1/bookings')) {
      if (method === 'DELETE') {
        if (role !== 'admin' && role !== 'manager') {
          return new Response(JSON.stringify({ error: 'Permission Denied: DELETE booking policy' }), { status: 403 })
        }
      }
    }

    if (path.startsWith('/rest/v1/menu_items')) {
      if (method === 'POST' || method === 'PATCH' || method === 'DELETE') {
        if (role !== 'admin') {
          return new Response(JSON.stringify({ error: 'Permission Denied: admin role required for writes' }), { status: 403 })
        }
      }
    }

    return new Response(JSON.stringify([{ id: 'mock-id', ok: true }]), { status: 200 })
  }

  it('should allow booking deletion for managers and admins', async () => {
    const adminToken = generateJwtForRole('admin')
    mockFetch.mockImplementation((url, init) => simulateGatewayRlsFetch(url, init))

    const res = await orderRepo.deleteOrder('booking-123', undefined, adminToken)
    expect(res.ok).toBe(true)
  })

  it('should reject booking deletion for staff members', async () => {
    const staffToken = generateJwtForRole('staff')
    mockFetch.mockImplementation((url, init) => simulateGatewayRlsFetch(url, init))

    const res = await orderRepo.deleteOrder('booking-123', undefined, staffToken)
    expect(res.ok).toBe(false)
  })

  it('should deny menu updates for staff and managers', async () => {
    const managerToken = generateJwtForRole('manager')
    mockFetch.mockImplementation((url, init) => simulateGatewayRlsFetch(url, init))

    const res = await menuRepo.saveMenuAlias('mxhs', 'Muối Hành Sả', managerToken)
    expect(res.ok).toBe(false)
  })

  it('should allow menu updates for admins', async () => {
    // 1. mock the search call first
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'menu-1', aliases: [] }]), { status: 200 }))
    
    // 2. mock the patch call
    const adminToken = generateJwtForRole('admin')
    mockFetch.mockImplementation((url, init) => simulateGatewayRlsFetch(url, init))

    const res = await menuRepo.saveMenuAlias('mxhs', 'Muối Hành Sả', adminToken)
    expect(res.ok).toBe(true)
  })
})
