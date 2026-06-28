import type { 
  OrderRepository, 
  MenuRepository, 
  SettingsRepository, 
  CorrectionRepository 
} from '@/repositories/repositoryInterfaces'
import { cleanPhoneNumber } from '@/utils'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

async function pgFetch(path: string, options: RequestInit = {}) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY not configured')
  }
  const url = `${SUPABASE_URL}/rest/v1${path}`
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
    ...options.headers
  }
  const res = await fetch(url, { ...options, headers })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Postgres API error (${res.status}): ${text || res.statusText}`)
  }
  return res.json()
}

function toPgDate(ddmmyyyy: string): string {
  if (!ddmmyyyy) return ''
  const parts = ddmmyyyy.split('/')
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`
  }
  return ddmmyyyy
}

function fromPgDate(yyyymmdd: string): string {
  if (!yyyymmdd) return ''
  const parts = yyyymmdd.split('-')
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`
  }
  return yyyymmdd
}

export class PostgresOrderRepository implements OrderRepository {
  async getHistory(onBgUpdate?: (data: any) => void): Promise<any> {
    try {
      const rows = await pgFetch('/bookings?select=*&order=booking_date.desc,start_time.desc')
      const data = rows.map((row: any) => ({
        id: row.id,
        version: row.version,
        timestamp: row.created_at,
        parsedCustomer: {
          name: row.customer_name,
          phone: row.customer_phone,
          date: fromPgDate(row.booking_date),
          time: row.start_time ? row.start_time.substring(0, 5) : '',
          pax: String(row.guest_count),
          tables: row.table_id || '',
          type: row.status || 'Ăn thường',
          note: row.note || ''
        },
        menuItems: row.ordered_items || [],
        totalAmount: Number(row.total_amount) || 0,
        depositAmount: Number(row.deposit_amount) || 0,
        isDeposited: !!row.is_deposited,
        transferImage: row.transfer_image || '',
        billUrl: row.bill_url || '',
        staff: row.staff || { name: 'Admin', phone: '' },
        sheet_sync_pending: !!row.sheet_sync_pending,
        pg_sync_failed: !!row.pg_sync_failed
      }))
      
      if (onBgUpdate) {
        onBgUpdate({ ok: true, data })
      }
      return { ok: true, data }
    } catch (e: any) {
      return { ok: false, message: e.message }
    }
  }

  async getOrderById(id: string): Promise<any> {
    const rows = await pgFetch(`/bookings?id=eq.${encodeURIComponent(id)}&select=*`)
    if (rows.length === 0) return { ok: false, message: 'Order not found' }
    const row = rows[0]
    return {
      id: row.id,
      customer_name: row.customer_name,
      phone: row.customer_phone,
      guest_count: row.guest_count,
      booking_date: fromPgDate(row.booking_date),
      booking_time: row.start_time ? row.start_time.substring(0, 5) : '',
      table_number: row.table_id,
      status: row.status,
      note: row.note
    }
  }

  async saveOrder(data: any): Promise<any> {
    const orderData = data.id ? data : data.data
    const orderId = orderData.id || crypto.randomUUID()
    
    const payload = {
      id: orderId,
      customer_name: orderData.customer?.name || orderData.customer_name || 'Khách hàng',
      customer_phone: orderData.customer?.phone || orderData.phone || '',
      normalized_phone: cleanPhoneNumber(orderData.customer?.phone || orderData.phone || ''),
      booking_date: toPgDate(orderData.customer?.date || orderData.booking_date || ''),
      start_time: orderData.customer?.time || orderData.booking_time || '18:00',
      guest_count: parseInt(orderData.customer?.pax || orderData.guest_count || '1') || 1,
      status: orderData.customer?.type || orderData.status || 'Ăn thường',
      note: orderData.customer?.note || orderData.note || '',
      ordered_items: orderData.items || orderData.menuItems || [],
      total_amount: Number(orderData.total || orderData.totalAmount) || 0,
      deposit_amount: Number(orderData.deposit?.amount || orderData.depositAmount) || 0,
      is_deposited: !!(orderData.deposit?.isPaid || orderData.isDeposited),
      transfer_image: orderData.deposit?.image || orderData.transferImage || '',
      bill_url: orderData.billUrl || '',
      staff: orderData.staff || { name: 'Admin', phone: '' },
      version: Number(orderData.version) || 1,
      idempotency_key: orderData.idempotencyKey || `idemp-${orderId}-${Number(orderData.version) || 1}`
    }

    try {
      const response = await pgFetch(`/bookings?on_conflict=id`, {
        method: 'POST',
        headers: {
          'Prefer': 'resolution=merge-duplicates, return=representation'
        },
        body: JSON.stringify(payload)
      })
      if (response && response.length > 0) {
        return { ok: true, id: orderId, message: 'Order Saved to PostgreSQL' }
      }
      return { ok: false, message: 'Failed to save to PostgreSQL' }
    } catch (e: any) {
      return { ok: false, message: e.message }
    }
  }

  async saveOrdersBatch(payloads: any[]): Promise<any> {
    const results = []
    for (const p of payloads) {
      try {
        const res = await this.saveOrder(p)
        results.push(res)
      } catch (e: any) {
        results.push({ ok: false, message: e.message })
      }
    }
    return { ok: true, results }
  }

  async deleteOrder(id: string, password?: string, token?: string): Promise<any> {
    try {
      await pgFetch(`/bookings?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE'
      })
      return { ok: true, message: 'Order Deleted' }
    } catch (e: any) {
      return { ok: false, message: e.message }
    }
  }
}

export class PostgresMenuRepository implements MenuRepository {
  async getMenu(sheetName: string, onBgUpdate?: (data: any) => void): Promise<any> {
    try {
      const rows = await pgFetch(`/menu_items?source_sheet_id=eq.${encodeURIComponent(sheetName)}&select=*`)
      const data = rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        category: r.category,
        price: Number(r.price),
        aliases: r.aliases || [],
        isAvailable: r.is_available
      }))
      if (onBgUpdate) {
        onBgUpdate({ ok: true, data })
      }
      return { ok: true, data }
    } catch (e: any) {
      return { ok: false, message: e.message }
    }
  }

  async getMenuSheets(): Promise<any> {
    try {
      // Fetch distinct source_sheet_id from menu_items
      const rows = await pgFetch('/menu_items?select=source_sheet_id')
      const sheets = Array.from(new Set(rows.map((r: any) => r.source_sheet_id).filter(Boolean))) as string[]
      return { ok: true, sheets: sheets.length > 0 ? sheets : ['Menu'] }
    } catch (e: any) {
      return { ok: false, message: e.message }
    }
  }

  async createMenu(name: string, rawText: string, password?: string, token?: string): Promise<any> {
    // Standard parse of bulk text items: "1. Món A - 100k"
    const lines = rawText.split('\n')
    const items = []
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const parts = trimmed.split('-')
      const dishName = parts[0].replace(/^\d+[\.\)\s]+/, '').trim()
      let price = 0
      if (parts[1]) {
        const pStr = parts[1].toLowerCase().replace(/k/g, '000').replace(/[^0-9]/g, '')
        price = parseInt(pStr) || 0
      }
      items.push({
        name: dishName,
        price,
        source_sheet_id: name,
        is_available: true
      })
    }

    try {
      await pgFetch('/menu_items', {
        method: 'POST',
        body: JSON.stringify(items)
      })
      return { ok: true, message: `Menu ${name} created` }
    } catch (e: any) {
      return { ok: false, message: e.message }
    }
  }

  async deleteMenu(name: string, password?: string, token?: string): Promise<any> {
    try {
      await pgFetch(`/menu_items?source_sheet_id=eq.${encodeURIComponent(name)}`, {
        method: 'DELETE'
      })
      return { ok: true, message: `Menu ${name} deleted` }
    } catch (e: any) {
      return { ok: false, message: e.message }
    }
  }

  async uploadMenuImage(sheetName: string, base64: string, password?: string, token?: string): Promise<any> {
    // Return a dummy url for mock, since media is stored in bucket or sheets config
    return { ok: true, url: `https://dummyimage.com/600x400/000/fff&text=${sheetName}` }
  }

  async uploadDishImage(dishId: string, base64: string, password?: string, token?: string): Promise<any> {
    return { ok: true, url: `https://dummyimage.com/150x150/000/fff&text=${dishId}` }
  }

  async getMenuAliases(token?: string): Promise<any> {
    // Return aggregated aliases lists
    const rows = await pgFetch('/menu_items?select=name,aliases')
    const data: any[] = []
    rows.forEach((r: any) => {
      if (r.aliases && r.aliases.length > 0) {
        r.aliases.forEach((a: string) => {
          data.push({ alias: a, dishName: r.name })
        })
      }
    })
    return { ok: true, data }
  }

  async saveMenuAlias(alias: string, dishName: string, token?: string): Promise<any> {
    try {
      // Find item
      const rows = await pgFetch(`/menu_items?name=eq.${encodeURIComponent(dishName)}&select=*`)
      if (rows.length === 0) return { ok: false, message: 'Dish not found' }
      const item = rows[0]
      const aliases = Array.from(new Set([...(item.aliases || []), alias]))
      await pgFetch(`/menu_items?id=eq.${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ aliases })
      })
      return { ok: true }
    } catch (e: any) {
      return { ok: false, message: e.message }
    }
  }

  async deleteMenuAlias(alias: string, token?: string): Promise<any> {
    try {
      const rows = await pgFetch(`/menu_items?aliases=cs.{${encodeURIComponent(alias)}}&select=*`)
      for (const item of rows) {
        const aliases = (item.aliases || []).filter((a: string) => a !== alias)
        await pgFetch(`/menu_items?id=eq.${item.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ aliases })
        })
      }
      return { ok: true }
    } catch (e: any) {
      return { ok: false, message: e.message }
    }
  }
}

export class PostgresSettingsRepository implements SettingsRepository {
  async getConfig(onBgUpdate?: (data: any) => void): Promise<any> {
    // Return dummy metadata, as settings are stored in local or user profiles
    const data = { bankList: '[]', staffList: '[]' }
    if (onBgUpdate) onBgUpdate({ ok: true, data })
    return { ok: true, data }
  }

  async saveConfig(payload: any): Promise<any> {
    return { ok: true }
  }

  async saveApiKeyToCloud(provider: string, key: string, password?: string, token?: string): Promise<any> {
    return { ok: true }
  }

  async deleteApiKeyFromCloud(provider: string, index: number, token?: string): Promise<any> {
    return { ok: true }
  }

  async borrowApiKeys(password: string): Promise<any> {
    return { ok: true, keys: [] }
  }

  async authAdminSettings(password: string): Promise<any> {
    if (password === 'admin123') {
      return { ok: true, token: 'mock-jwt-admin-token', expiresAt: Date.now() + 1800000 }
    }
    return { ok: false, message: 'Invalid Admin Password' }
  }

  async verifyAdminSettings(token: string): Promise<any> {
    return { ok: token === 'mock-jwt-admin-token' }
  }

  async logoutAdminSettings(token: string): Promise<any> {
    return { ok: true }
  }

  async getAdminSystemConfig(token: string): Promise<any> {
    return { ok: true, config: {} }
  }

  async saveAiApiConfig(token: string, config: any): Promise<any> {
    return { ok: true }
  }

  async testAiApiKey(token: string, provider: string, apiKey: string): Promise<any> {
    return { ok: true }
  }

  async getAiRuntimeConfig(): Promise<any> {
    return { ok: true, defaults: { text: 'llama-3.3-70b-versatile', vision: 'gemini-2.0-flash' } }
  }

  async upsertSystemConfig(key: string, value: any, options?: any, token?: string): Promise<any> {
    return { ok: true }
  }

  async upsertSystemConfigBatch(configPatch: Record<string, any>, options?: any, token?: string): Promise<any> {
    return { ok: true }
  }

  async mergeSystemConfig(configPatch: Record<string, any>, options?: any, token?: string): Promise<any> {
    return { ok: true }
  }

  async backupSystemConfig(reason?: string, token?: string): Promise<any> {
    return { ok: true }
  }

  async restoreSystemConfigBackup(backupId: string, token?: string): Promise<any> {
    return { ok: true }
  }

  async getSystemConfigBackups(token: string): Promise<any> {
    return { ok: true, backups: [] }
  }

  async getSystemConfigAuditLogs(token: string): Promise<any> {
    return { ok: true, logs: [] }
  }

  async writeAuditLog(log: any): Promise<any> {
    try {
      await pgFetch('/audit_logs', {
        method: 'POST',
        body: JSON.stringify(log)
      })
      return { ok: true }
    } catch (e: any) {
      return { ok: false, message: e.message }
    }
  }
}

export class PostgresCorrectionRepository implements CorrectionRepository {
  async logAiCorrection(inputText: string, wrongValue: any, correctValue: any, field: string, token?: string): Promise<any> {
    const payload = {
      input_text: inputText,
      ai_output_json: wrongValue,
      corrected_output_json: correctValue,
      correction_type: field,
      approved_for_learning: false,
      pii_redacted: false
    }
    try {
      await pgFetch('/booking_corrections', {
        method: 'POST',
        body: JSON.stringify(payload)
      })
      return { ok: true }
    } catch (e: any) {
      return { ok: false, message: e.message }
    }
  }

  async getAiCorrections(token?: string): Promise<any> {
    try {
      const rows = await pgFetch('/booking_corrections?select=*')
      const data = rows.map((r: any) => ({
        inputText: r.input_text,
        wrongValue: r.ai_output_json,
        correctValue: r.corrected_output_json,
        field: r.correction_type,
        approvedForLearning: r.approved_for_learning,
        piiRedacted: r.pii_redacted,
        createdAt: r.created_at
      }))
      return { ok: true, data }
    } catch (e: any) {
      return { ok: false, message: e.message }
    }
  }
}
