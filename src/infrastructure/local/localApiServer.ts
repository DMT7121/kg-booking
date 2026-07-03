import fs from 'fs/promises'
import path from 'path'
import http from 'http'

// Cấu hình đường dẫn lưu trữ data local
const DATA_DIR = path.resolve(process.cwd(), 'src/infrastructure/local/data')
const BOOKINGS_FILE = path.join(DATA_DIR, 'bookings.json')
const CONFIG_FILE = path.join(DATA_DIR, 'config.json')
const MENU_SHEETS_FILE = path.join(DATA_DIR, 'menu_sheets.json')
const ALIASES_FILE = path.join(DATA_DIR, 'aliases.json')
const CORRECTIONS_FILE = path.join(DATA_DIR, 'corrections.json')

// GAS URL fallback lấy từ biến môi trường
const REAL_GAS_URL = process.env.VITE_GAS_URL || 'https://script.google.com/macros/s/AKfycbxzjio4sat5fWoUncPgp8SfjoGqfGxW5vFoDgkHvBI3OKVWIaszsAaUt0LE2fCHtkCFsA/exec'

// Đảm bảo thư mục lưu trữ local tồn tại
async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true })
  } catch (e) {
    console.error('[Local API] Không thể tạo thư mục data:', e)
  }
}

// Cache lưu trữ dữ liệu JSON trong bộ nhớ để giảm tải I/O đĩa
const fileCache = new Map<string, any>()

// Đọc file JSON an toàn qua cache
async function readJsonFile<T>(filePath: string, defaultValue: T): Promise<T> {
  if (fileCache.has(filePath)) {
    return JSON.parse(JSON.stringify(fileCache.get(filePath))) as T
  }
  await ensureDataDir()
  try {
    const data = await fs.readFile(filePath, 'utf-8')
    const parsed = JSON.parse(data)
    fileCache.set(filePath, parsed)
    return parsed as T
  } catch {
    fileCache.set(filePath, defaultValue)
    return defaultValue
  }
}

// Ghi file JSON an toàn qua cache
async function writeJsonFile<T>(filePath: string, data: T): Promise<void> {
  fileCache.set(filePath, JSON.parse(JSON.stringify(data)))
  await ensureDataDir()
  try {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
  } catch (e) {
    console.error(`[Local API] Lỗi ghi file ${filePath}:`, e)
  }
}

// Gửi request đồng bộ ngầm tới GAS (Background Sync)
function backgroundSyncToGAS(payload: Record<string, any>) {
  console.log(`[Local API] Bắt đầu đồng bộ ngầm action: ${payload.action} lên GAS...`)
  fetch(REAL_GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  })
    .then(async (res) => {
      if (res.ok) {
        const json = await res.json()
        console.log(`[Local API] Đồng bộ thành công action: ${payload.action}`, json)
      } else {
        console.error(`[Local API] Đồng bộ thất bại action: ${payload.action}, HTTP Status: ${res.status}`)
      }
    })
    .catch((err) => {
      console.error(`[Local API] Lỗi mạng khi đồng bộ action: ${payload.action}`, err.message)
    })
}

// Handler chính xử lý các request từ client
export async function handleLocalApi(req: http.IncomingMessage, res: http.ServerResponse): Promise<boolean> {
  // Chỉ intercept các request dạng /api/*
  const url = new URL(req.url || '', `http://${req.headers.host}`)
  if (!url.pathname.startsWith('/api')) {
    return false
  }

  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return true
  }

  // Đọc body của request
  let bodyText = ''
  for await (const chunk of req) {
    bodyText += chunk
  }

  let payload: Record<string, any> = {}
  try {
    if (bodyText) {
      payload = JSON.parse(bodyText)
    }
  } catch {
    res.statusCode = 400
    res.end(JSON.stringify({ ok: false, message: 'Malformed JSON payload' }))
    return true
  }

  const action = payload.action || url.searchParams.get('action')
  console.log(`[Local API Server] Nhận request action: ${action}`)

  try {
    let result: any = { ok: true }

    switch (action) {
      case 'getHistory': {
        const bookings = await readJsonFile<any[]>(BOOKINGS_FILE, [])
        if (bookings.length === 0) {
          // Lần đầu chạy, kéo thử dữ liệu từ GAS về lưu local
          try {
            console.log('[Local API] Tải dữ liệu lịch sử từ GAS về làm cache local...')
            const response = await fetch(REAL_GAS_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body: JSON.stringify({ action: 'getHistory' })
            })
            if (response.ok) {
              const data = await response.json()
              if (data.ok && Array.isArray(data.data)) {
                await writeJsonFile(BOOKINGS_FILE, data.data)
                result = data
                break
              }
            }
          } catch (e: any) {
            console.warn('[Local API] Không thể tải dữ liệu ban đầu từ GAS:', e.message)
          }
        }
        result = { ok: true, data: bookings }
        break
      }

      case 'saveOrder': {
        const orderData = payload.data
        if (!orderData || !orderData.customer?.name) {
          result = { ok: false, message: 'Dữ liệu đơn hàng không hợp lệ' }
          break
        }
        const orderId = orderData.id || crypto.randomUUID()
        orderData.id = orderId

        const bookings = await readJsonFile<any[]>(BOOKINGS_FILE, [])
        const existingIndex = bookings.findIndex(b => b.id === orderId)
        
        const timestamp = new Date().toISOString()
        const orderRecord = {
          id: orderId,
          timestamp: existingIndex !== -1 ? bookings[existingIndex].timestamp : timestamp,
          parsedCustomer: {
            name: orderData.customer.name,
            phone: orderData.customer.phone || '',
            date: orderData.customer.date || '',
            time: orderData.customer.time || '',
            pax: orderData.customer.pax || '0',
            tables: orderData.customer.tables || '',
            type: orderData.customer.type || 'Ăn thường',
            note: orderData.customer.note || ''
          },
          menuItems: orderData.items || [],
          totalAmount: Number(orderData.total) || 0,
          depositAmount: Number(orderData.deposit?.amount) || 0,
          isDeposited: !!orderData.deposit?.isPaid,
          transferImage: orderData.deposit?.image || '',
          billUrl: orderData.billUrl || '',
          staff: orderData.staff || { name: 'Admin', phone: '' },
          version: (existingIndex !== -1 ? (bookings[existingIndex].version || 1) + 1 : 1)
        }

        if (existingIndex !== -1) {
          bookings[existingIndex] = orderRecord
        } else {
          bookings.push(orderRecord)
        }

        await writeJsonFile(BOOKINGS_FILE, bookings)
        
        // Trả về kết quả ngay lập tức cho client
        result = { ok: true, message: 'Order Saved locally', id: orderId, billUrl: orderRecord.billUrl }

        // Đồng bộ ngầm lên GAS
        backgroundSyncToGAS({ action: 'saveOrder', data: orderData })
        break
      }

      case 'deleteOrder': {
        const orderId = payload.id
        const bookings = await readJsonFile<any[]>(BOOKINGS_FILE, [])
        const filteredBookings = bookings.filter(b => b.id !== orderId)
        
        await writeJsonFile(BOOKINGS_FILE, filteredBookings)
        result = { ok: true, message: 'Order Deleted locally' }

        // Đồng bộ ngầm lên GAS
        backgroundSyncToGAS(payload)
        break
      }

      case 'getMenuSheets': {
        let sheets = await readJsonFile<string[]>(MENU_SHEETS_FILE, [])
        if (sheets.length === 0) {
          try {
            const response = await fetch(REAL_GAS_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body: JSON.stringify({ action: 'getMenuSheets' })
            })
            if (response.ok) {
              const data = await response.json()
              if (data.ok && Array.isArray(data.sheets)) {
                await writeJsonFile(MENU_SHEETS_FILE, data.sheets)
                result = data
                break
              }
            }
          } catch (e: any) {
            console.warn('[Local API] Không tải được danh sách menu sheet từ GAS:', e.message)
          }
          sheets = ['Menu']
        }
        result = { ok: true, sheets }
        break
      }

      case 'getMenu': {
        const sheetName = payload.sheetName || 'Menu'
        const menuFile = path.join(DATA_DIR, `menu_${sheetName.replace(/\s+/g, '_')}.json`)
        let menuData = await readJsonFile<any[]>(menuFile, [])
        
        if (menuData.length === 0) {
          try {
            const response = await fetch(REAL_GAS_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body: JSON.stringify({ action: 'getMenu', sheetName })
            })
            if (response.ok) {
              const data = await response.json()
              if (data.ok && Array.isArray(data.data)) {
                await writeJsonFile(menuFile, data.data)
                result = data
                break
              }
            }
          } catch (e: any) {
            console.warn(`[Local API] Không tải được dữ liệu menu [${sheetName}] từ GAS:`, e.message)
          }
        }
        result = { ok: true, data: menuData }
        break
      }

      case 'getConfig': {
        let config = await readJsonFile<any>(CONFIG_FILE, null)
        if (!config) {
          try {
            const response = await fetch(REAL_GAS_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body: JSON.stringify({ action: 'getConfig' })
            })
            if (response.ok) {
              const data = await response.json()
              if (data.ok && data.data) {
                await writeJsonFile(CONFIG_FILE, data.data)
                result = data
                break
              }
            }
          } catch (e: any) {
            console.warn('[Local API] Không tải được config từ GAS:', e.message)
          }
          config = { staffList: '[]', bankList: '[]' }
        }
        result = { ok: true, data: config }
        break
      }

      case 'saveConfig': {
        await writeJsonFile(CONFIG_FILE, {
          staffList: payload.staffList,
          bankList: payload.bankList,
          webhookUrl: payload.webhookUrl,
          telegramChatId: payload.telegramChatId,
          showPortalMinigames: payload.showPortalMinigames
        })
        result = { ok: true, message: 'Config Saved locally' }

        // Đồng bộ ngầm lên GAS
        backgroundSyncToGAS(payload)
        break
      }

      case 'getAiRuntimeConfig': {
        const status: Record<string, { configured: boolean, count: number, maskedList: string[] }> = {
          pollinations: { configured: true, count: 1, maskedList: ['free'] }
        }
        
        const providers = ['google', 'groq', 'cerebras', 'sambanova', 'openrouter', 'mistral', 'github']
        providers.forEach(p => {
          status[p] = { configured: false, count: 0, maskedList: [] }
        })
        
        if (process.env.VITE_GEMINI_API_KEY) {
          status.google = { configured: true, count: 1, maskedList: ['••••••••'] }
        }
        if (process.env.VITE_GROQ_API_KEY) {
          status.groq = { configured: true, count: 1, maskedList: ['••••••••'] }
        }
        if (process.env.VITE_OPENROUTER_API_KEY) {
          status.openrouter = { configured: true, count: 1, maskedList: ['••••••••'] }
        }
        
        const config = await readJsonFile<any>(CONFIG_FILE, null)
        if (config && config.api_keys) {
          try {
            const parsed = JSON.parse(config.api_keys)
            for (const provider in parsed) {
              const list = parsed[provider]
              if (Array.isArray(list) && list.length > 0) {
                const pId = provider === 'gemini' ? 'google' : provider
                if (status[pId]) {
                  status[pId].configured = true
                  status[pId].count = list.length
                  status[pId].maskedList = list.map((k: string) => {
                    if (k.length > 8) {
                      return k.substring(0, 4) + '••••' + k.substring(k.length - 4)
                    }
                    return '••••••••'
                  })
                }
              }
            }
          } catch {}
        }
        
        result = {
          ok: true,
          keysStatus: status,
          defaults: {
            text: 'llama-3.3-70b-versatile',
            vision: 'gemini-2.0-flash'
          }
        }
        break
      }

      case 'authAdminSettings': {
        const password = payload.password
        if (password !== 'ADMINDMT' && password !== 'kg_booking_secret_token_2026') {
          result = { ok: false, message: 'Sai mật khẩu Admin!' }
          break
        }
        result = { 
          ok: true, 
          token: 'ADM_local_admin', 
          expiresAt: Date.now() + 30 * 60 * 1000 
        }
        break
      }

      case 'verifyAdminSettings': {
        const token = payload.token
        const isValid = token === 'admin_bypass' || (token && token.startsWith('ADM_'))
        result = { ok: true, valid: isValid }
        break
      }

      case 'logoutAdminSettings': {
        result = { ok: true, message: 'Logged out successfully' }
        break
      }

      case 'borrowApiKeys': {
        const password = payload.password
        if (password !== 'ADMINDMT' && password !== 'kg_booking_secret_token_2026') {
          result = { ok: false, message: 'Sai mật khẩu Admin!' }
          break
        }
        
        const keysFile = path.join(DATA_DIR, 'api_keys.json')
        const keys = await readJsonFile<any[]>(keysFile, [])
        result = { ok: true, keys }
        break
      }

      case 'getSharedApiKeysWithoutPassword': {
        const localKeys = []
        if (process.env.VITE_GEMINI_API_KEY) {
          localKeys.push({ provider: 'google', key: process.env.VITE_GEMINI_API_KEY })
        }
        if (process.env.VITE_GROQ_API_KEY) {
          localKeys.push({ provider: 'groq', key: process.env.VITE_GROQ_API_KEY })
        }
        if (process.env.VITE_OPENROUTER_API_KEY) {
          localKeys.push({ provider: 'openrouter', key: process.env.VITE_OPENROUTER_API_KEY })
        }
        
        // Nếu không có keys cấu hình trong process.env, ta kéo thử từ file api_keys.json cục bộ
        if (localKeys.length === 0) {
          const KEYS_FILE = path.join(DATA_DIR, 'api_keys.json')
          try {
            const rawKeys = await readJsonFile<any[]>(KEYS_FILE, [])
            if (Array.isArray(rawKeys) && rawKeys.length > 0) {
              rawKeys.forEach((k: any) => {
                let provider = k.provider === 'gemini' ? 'google' : k.provider
                localKeys.push({ provider, key: k.key })
              })
              console.log(`[Local API] Đã tải ${localKeys.length} API Keys từ api_keys.json cục bộ!`)
            }
          } catch (e: any) {
            console.warn('[Local API] Không thể đọc api_keys.json cục bộ:', e.message)
          }
        }
        
        // Nếu không có keys cấu hình trong api_keys.json, ta kéo thử từ config local
        if (localKeys.length === 0) {
          const config = await readJsonFile<any>(CONFIG_FILE, null)
          if (config && config.api_keys) {
            try {
              const parsed = JSON.parse(config.api_keys)
              for (const provider in parsed) {
                if (Array.isArray(parsed[provider])) {
                  parsed[provider].forEach((k: string) => {
                    localKeys.push({ provider, key: k })
                  })
                }
              }
            } catch {}
          }
        }

        // Nếu vẫn không có keys ở local, ta kéo thử từ GAS (không cần mật khẩu)
        if (localKeys.length === 0) {
          try {
            console.log('[Local API] Tải API Keys từ GAS không cần mật khẩu...')
            const response = await fetch(REAL_GAS_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body: JSON.stringify({ action: 'getSharedApiKeysWithoutPassword' })
            })
            if (response.ok) {
              const data = await response.json()
              if (data.ok && Array.isArray(data.keys)) {
                // Lưu cục bộ config.json
                const apiKeysObj: Record<string, string[]> = {}
                data.keys.forEach((k: any) => {
                  localKeys.push(k)
                  const providerKey = k.provider === 'google' ? 'google' : k.provider
                  if (!apiKeysObj[providerKey]) apiKeysObj[providerKey] = []
                  apiKeysObj[providerKey].push(k.key)
                })
                
                const config = await readJsonFile<any>(CONFIG_FILE, {})
                config.api_keys = JSON.stringify(apiKeysObj)
                await writeJsonFile(CONFIG_FILE, config)
                console.log('[Local API] Đã tải và lưu sẵn các API Keys vào config.json cục bộ!')
              }
            }
          } catch (e: any) {
            console.warn('[Local API] Không thể tải API Keys từ GAS:', e.message)
          }
        }

        result = { ok: true, keys: localKeys }
        break
      }

      case 'getMenuAliases': {
        const aliases = await readJsonFile<any[]>(ALIASES_FILE, [])
        result = { ok: true, data: aliases }
        break
      }

      case 'saveMenuAlias': {
        const aliases = await readJsonFile<any[]>(ALIASES_FILE, [])
        aliases.push({ alias: payload.alias, dishName: payload.dishName })
        await writeJsonFile(ALIASES_FILE, aliases)
        result = { ok: true }
        backgroundSyncToGAS(payload)
        break
      }

      case 'deleteMenuAlias': {
        const aliases = await readJsonFile<any[]>(ALIASES_FILE, [])
        const filtered = aliases.filter(a => a.alias !== payload.alias)
        await writeJsonFile(ALIASES_FILE, filtered)
        result = { ok: true }
        backgroundSyncToGAS(payload)
        break
      }

      case 'logAiCorrection': {
        const corrections = await readJsonFile<any[]>(CORRECTIONS_FILE, [])
        corrections.push({
          inputText: payload.inputText,
          wrongValue: payload.wrongValue,
          correctValue: payload.correctValue,
          field: payload.field,
          createdAt: new Date().toISOString()
        })
        await writeJsonFile(CORRECTIONS_FILE, corrections)
        result = { ok: true }
        backgroundSyncToGAS(payload)
        break
      }

      case 'getAiCorrections': {
        const corrections = await readJsonFile<any[]>(CORRECTIONS_FILE, [])
        result = { ok: true, data: corrections }
        break
      }

      case 'writeAuditLog': {
        result = { ok: true }
        break
      }

      case 'getSystemConfigAuditLogs': {
        result = { ok: true, logs: [] }
        break
      }

      case 'callAiService': {
        // Chuyển tiếp thẳng sang GAS xử lý các API AI dự phòng
        try {
          const response = await fetch(REAL_GAS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
          })
          if (response.ok) {
            result = await response.json()
          } else {
            result = { ok: false, message: 'GAS AI proxy failed' }
          }
        } catch (e: any) {
          result = { ok: false, message: e.message }
        }
        break
      }

      default: {
        // Cố gắng chuyển tiếp các action không được định nghĩa rõ ràng sang GAS
        try {
          const response = await fetch(REAL_GAS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
          })
          if (response.ok) {
            result = await response.json()
          } else {
            result = { ok: false, message: `Failed forwarding to GAS: ${response.status}` }
          }
        } catch (e: any) {
          result = { ok: false, message: `Failed forwarding connection: ${e.message}` }
        }
        break
      }
    }

    res.statusCode = 200
    res.end(JSON.stringify(result))
  } catch (err: any) {
    res.statusCode = 500
    res.end(JSON.stringify({ ok: false, message: err.toString() }))
  }

  return true
}
