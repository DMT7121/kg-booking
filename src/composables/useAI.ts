import { useUIStore } from '@/stores/useUIStore'
import { useFormStore } from '@/stores/useFormStore'
import { useConfigStore } from '@/stores/useConfigStore'
import { useAppStore } from '@/stores/useAppStore'
import { useLogStore } from '@/stores/useLogStore'
import { resizeImage, cleanPhoneNumber, formatDateStr, formatVND, stripAccents } from '@/utils'
import { AI_MODELS, ADVANCED_AI_PROMPT, IMAGE_OCR_PROMPT } from '@/utils/constants'
import type { AIModel } from '@/utils/constants'
import * as api from '@/services/api'
import { getCachedMenu, getCachedMenuSheets } from '@/services/cache'
import { 
  extractByRules, 
  preNormalizeInput, 
  classifyInputType, 
  extractHardEntities, 
  stripSetMenuComponents, 
  prepareAIPayload,
  classifyPeopleNames
} from '@/domain/ai/ruleEngine'
import { safeParseJSON } from '@/domain/ai/jsonRepair'
import { 
  matchMenuItems, 
  resolveBestMenuSheet, 
  resolveMenuItemsLocally 
} from '@/domain/menu/menuMatcher'
import { 
  applyDeterministicRuleLock, 
  resolveDisplayCustomerName, 
  buildPartyNote, 
  cleanBookingNotes, 
  normalizePartyType, 
  repairAndNormalizeJSON, 
  validateParsedFields 
} from '@/domain/booking/bookingNormalizer'
import { runAIRouter } from '@/services/ai/aiRouter'
import { callAIModel } from '@/services/ai/aiProviderClient'
import type { HardEntities } from '@/domain/ai/ruleEngine'
import { classifyAIInput } from '@/domain/ai/inputClassifier'
import { evaluateBookingBypass } from '@/domain/booking/bookingCompletenessGate'
import { analyzeBookingLocally } from '@/services/ai/localFirstBookingAnalyzer'
import { buildDynamicPrompt } from '@/domain/ai/promptBuilder'
import type { PromptProfile } from '@/domain/ai/promptBuilder'
import { retrieveMenuCandidates } from '@/domain/menu/menuCandidateRetriever'
import { validateAIResult } from '@/domain/ai/aiResultValidator'


import { getCachedAIResponse, setCachedAIResponse, hashString, stableStringify } from '@/services/ai/aiResponseCache'

export function useAI() {
  const uiStore = useUIStore()
  const formStore = useFormStore()
  const configStore = useConfigStore()
  const appStore = useAppStore()
  const logStore = useLogStore()

  const aiMode = (import.meta.env.VITE_AI_MODE || 'direct') as 'direct' | 'gateway'
  const apiGatewayUrl = import.meta.env.VITE_AI_GATEWAY_URL || ''

  function getMenuFingerprint(): string {
    return appStore.menuFingerprint
  }

  function getCorrectionFingerprint(): string {
    return appStore.correctionFingerprint
  }

  function resolveContext(parsed: any) {
    const resolved = { ...parsed }
    if (formStore.customer.date && !resolved.event_date) {
      resolved.event_date = formStore.customer.date
    }
    const formTable = (uiStore.tempTable.zone || '') + (uiStore.tempTable.number || '')
    if (formTable && !resolved.table_code) {
      resolved.table_code = formTable
    }
    if (formStore.customer.name && !resolved.customer_name) {
      resolved.customer_name = formStore.customer.name
    }
    if (formStore.customer.phone && !resolved.phone) {
      resolved.phone = formStore.customer.phone
    }
    if (formStore.customer.pax && !resolved.guest_count) {
      resolved.guest_count = parseInt(formStore.customer.pax) || null
    }
    if (formStore.customer.type && resolved.booking_need === 'Ăn thường') {
      resolved.booking_need = formStore.customer.type
    }
    return resolved
  }

  function shouldBypassAI(ruleResult: any, inputType: string, menuDetected: boolean): boolean {
    if (['menu_order_text', 'mixed_booking_menu', 'deposit_bill_image', 'chat_screenshot', 'decoration_request'].includes(inputType)) {
      return false
    }
    if (menuDetected) return false
    
    const nameResults = classifyPeopleNames(formStore.rawInput || '')
    if (nameResults.peopleNames.length > 1) {
      return false
    }

    const hasNameOrPhone = !!(ruleResult.customer_name || ruleResult.phone || nameResults.peopleNames[0])
    const hasDate = !!ruleResult.event_date
    const hasTime = !!ruleResult.event_time
    const hasPax = !!ruleResult.guest_count
    
    return !!(hasNameOrPhone && hasDate && hasTime && hasPax)
  }

  function isFieldDirty(field: string): boolean {
    if (field === 'name' && !formStore.customer.name) return false
    if (field === 'phone' && !formStore.customer.phone) return false
    if (field === 'date' && !formStore.customer.date) return false
    if (field === 'time' && !formStore.customer.time) return false
    if (field === 'pax' && !formStore.customer.pax) return false
    if (field === 'tables') {
      const currentTableNumber = uiStore.tempTable.number || ''
      if (!currentTableNumber.trim()) return false
    }

    if (!formStore.originalAiValues) {
      if (field === 'name' && formStore.customer.name) return true
      if (field === 'phone' && formStore.customer.phone) return true
      if (field === 'date' && formStore.customer.date) return true
      if (field === 'time' && formStore.customer.time) return true
      if (field === 'pax' && formStore.customer.pax) return true
      if (field === 'tables') {
        const currentTableNumber = uiStore.tempTable.number || ''
        if (currentTableNumber.trim()) return true
      }
      return false
    }

    if (field === 'name') return formStore.customer.name !== formStore.originalAiValues.name
    if (field === 'phone') return cleanPhoneNumber(formStore.customer.phone) !== cleanPhoneNumber(formStore.originalAiValues.phone)
    if (field === 'date') return formatDateStr(formStore.customer.date) !== formatDateStr(formStore.originalAiValues.date)
    if (field === 'time') return formStore.customer.time !== formStore.originalAiValues.time
    if (field === 'pax') return String(formStore.customer.pax) !== String(formStore.originalAiValues.pax)
    if (field === 'tables') {
      const currentTable = (uiStore.tempTable.zone || '') + (uiStore.tempTable.number || '')
      const originalTable = formStore.originalAiValues.tables || ''
      if (!uiStore.tempTable.number && !originalTable) return false
      return currentTable !== originalTable
    }
    return false
  }

  function fillBookingFormSafely(parsedResult: any, options: { mode: 'all' | 'customer' | 'menu' }) {
    const { mode } = options

    function parseTableCode(tableStr: string): { zone: string; number: string } | null {
      if (!tableStr) return null
      const s = String(tableStr).trim().toUpperCase()
      const full = s.match(/^([A-G])(\d+)$/)
      if (full) return { zone: full[1], number: full[2] }
      const numOnly = s.match(/^(\d+)$/)
      if (numOnly) return { zone: 'A', number: numOnly[1] }
      const zoneOnly = s.match(/^([A-G])$/)
      if (zoneOnly) return { zone: zoneOnly[1], number: '' }
      const bestEffort = s.match(/([A-G])?\s*(\d+)/)
      if (bestEffort) return { zone: bestEffort[1] || 'A', number: bestEffort[2] }
      return null
    }

    const setFormVal = (field: string, newValue: any, setter: (val: any) => void) => {
      if (newValue === undefined || newValue === null) return
      const isDirty = isFieldDirty(field)
      if (!isDirty) {
        setter(newValue)
      } else {
        formStore.warnings.push(`Trường ${field} không được ghi đè vì nhân viên đã sửa thủ công thành "${formStore.customer[field as keyof typeof formStore.customer]}".`)
      }
    }

    if (mode === 'all' || mode === 'customer') {
      const resolvedName = resolveDisplayCustomerName(parsedResult)
      if (resolvedName) {
        setFormVal('name', resolvedName, (val) => { formStore.customer.name = val })
      }
      
      const customerInfo = parsedResult.customer || parsedResult
      if (customerInfo && customerInfo.phone) {
        setFormVal('phone', cleanPhoneNumber(customerInfo.phone), (val) => { formStore.customer.phone = val })
      }
      
      const bookingInfo = parsedResult.booking || parsedResult.reservation || parsedResult
      if (bookingInfo) {
        if (bookingInfo.event_date || bookingInfo.date) {
          setFormVal('date', formatDateStr(bookingInfo.event_date || bookingInfo.date), (val) => { formStore.customer.date = val })
        }
        if (bookingInfo.event_time || bookingInfo.time) {
          setFormVal('time', bookingInfo.event_time || bookingInfo.time, (val) => { formStore.customer.time = val })
        }
        if (bookingInfo.guest_count || bookingInfo.pax) {
          setFormVal('pax', String(bookingInfo.guest_count || bookingInfo.pax), (val) => { formStore.customer.pax = val })
        }
        const partyType = normalizePartyType(bookingInfo.need || bookingInfo.type || parsedResult.party?.type || '')
        if (partyType && partyType !== 'Ăn thường') {
          setFormVal('type', partyType, (val) => { formStore.customer.type = val })
        }
        if (bookingInfo.table_number || bookingInfo.table_code) {
          const isTableDirty = isFieldDirty('tables')
          if (!isTableDirty) {
            const table = parseTableCode(bookingInfo.table_number || bookingInfo.table_code)
            if (table) {
              uiStore.tempTable.zone = table.zone
              uiStore.tempTable.number = table.number
            }
          }
        }
      }

      const partyInfo = parsedResult.party || null
      const notesInfo = parsedResult.notes || parsedResult
      const customerNoteVal = notesInfo?.customer_note || parsedResult.booking?.notes || parsedResult.reservation?.notes || parsedResult.note || ''
      
      const currentItems = parsedResult.menu_items || parsedResult.items || []
      let updatedNote = buildPartyNote(partyInfo, formStore.customer.note || customerNoteVal)
      updatedNote = cleanBookingNotes(
        updatedNote,
        { name: formStore.customer.name, phone: formStore.customer.phone },
        { guest_count: formStore.customer.pax },
        currentItems
      )
      formStore.customer.note = updatedNote
      
      const depositInfo = parsedResult.deposit || parsedResult.payment || null
      if (depositInfo?.amount) {
        const depositKeywords = /c[oọ][ck]|đ[aặ]t c[oọ][ck]|chuy[eể]n kho[aả]n|thanh to[aá]n|deposit/i
        const rawInput = formStore.rawInput || ''
        const hasImageContext = !!formStore.aiImage || ['deposit_bill_image', 'chat_screenshot'].includes(parsedResult.input_type || '')
        
        if (depositKeywords.test(rawInput) || hasImageContext) {
          formStore.deposit.amount = parseInt(String(depositInfo.amount)) || 0
          if (depositInfo.status === 'đã cọc' || depositInfo.status === 'YES' || depositInfo.method === 'transfer') {
            formStore.deposit.isPaid = true
          }
          if (depositInfo.bank_ref || depositInfo.bank_reference) {
            formStore.deposit.note = `AI Ref: ${depositInfo.bank_ref || depositInfo.bank_reference}`
          }
        }
      }

      const receiver = parsedResult.staff?.receiver || parsedResult.receiver || null
      if (receiver && appStore.staffList) {
        const cleanRec = cleanPhoneNumber(receiver).toLowerCase().trim()
        const matchedStaff = appStore.staffList.find((s: any) => 
          s.isActive !== false && (
            s.name.toLowerCase().trim() === cleanRec ||
            s.name.toLowerCase().replace(/\s+/g, '') === cleanRec
          )
        )
        if (matchedStaff) {
          formStore.staff.name = matchedStaff.name
          formStore.staff.phone = matchedStaff.phone || ''
        }
      }
    }

    if (mode === 'all' || mode === 'menu') {
      const menuItems = parsedResult.menu_items || parsedResult.items
      if (menuItems && Array.isArray(menuItems) && menuItems.length > 0) {
        const newItems = menuItems.map((newItem: any) => ({
          name: newItem.matched_name || newItem.name,
          qty: newItem.quantity || newItem.qty || 1,
          price: newItem.unit_price || newItem.price || 0,
          note: newItem.note || newItem.notes || ""
        }))

        if (mode === 'all') {
          formStore.items = newItems
        } else {
          const existingItems = [...formStore.items]
          for (const item of newItems) {
            const matchIdx = existingItems.findIndex(i => 
              i.name.toLowerCase().trim() === item.name.toLowerCase().trim() &&
              i.note === item.note
            )
            if (matchIdx !== -1) {
              existingItems[matchIdx].qty += item.qty
            } else {
              existingItems.push(item)
            }
          }
          formStore.items = existingItems
        }
      }
    }

    formStore.originalAiValues = {
      name: formStore.customer.name,
      phone: formStore.customer.phone,
      date: formStore.customer.date,
      time: formStore.customer.time,
      pax: String(formStore.customer.pax || ''),
      tables: (uiStore.tempTable.zone || '') + (uiStore.tempTable.number || ''),
      type: formStore.customer.type || 'Ăn thường',
      note: formStore.customer.note || '',
      items: JSON.parse(JSON.stringify(formStore.items || []))
    }
  }

  async function smartRouter(
    type: 'text' | 'vision',
    sysPrompt: string,
    userPrompt: string,
    image: string | null = null,
    inputType = 'unknown',
    signal?: AbortSignal
  ) {
    const keysStatusMapped: Record<string, { configured: boolean }> = {}
    Object.keys(configStore.keysStatus).forEach(k => {
      keysStatusMapped[k] = {
        configured: !!configStore.keysStatus[k]?.configured || !!configStore.gatewayProviderStatus[k]?.configured
      }
    })

    return runAIRouter({
      type,
      sysPrompt,
      userPrompt,
      image,
      inputType,
      signal,
      availableModels: AI_MODELS,
      defaultModelId: type === 'vision' ? configStore.defaults.vision : configStore.defaults.text,
      configKeys: {},
      keysStatus: keysStatusMapped,
      apiGatewayUrl,
      aiMode,
      logCallback: (msg, level) => logStore.addLog(msg, level),
      loadingSubMsgCallback: (msg) => { uiStore.loading.subMsg = msg }
    })
  }

  async function loadAllMenusData(): Promise<Record<string, any[]>> {
    const start = performance.now()
    const allData: Record<string, any[]> = {}
    
    let sheets = appStore.menuSheets
    let sheetsSource = 'store'
    
    if (!sheets || sheets.length === 0) {
      try {
        const cachedSheets = await getCachedMenuSheets()
        if (cachedSheets && cachedSheets.length > 0) {
          sheets = cachedSheets
          appStore.menuSheets = cachedSheets
          sheetsSource = 'local-cache'
        }
      } catch (e) {
        console.error('Failed to load menu sheets from local cache', e)
      }
    }
    
    if (!sheets || sheets.length === 0) {
      logStore.addLog(`[loadAllMenusData] Không tìm thấy danh sách sheet thực đơn nào (trống). Thời gian: 0ms`, 'warning')
      return allData
    }

    let cacheHits = 0
    let cacheMisses = 0
    const details: string[] = []

    await Promise.all(sheets.map(async (sheet) => {
      const menuItems = await getCachedMenu(sheet)
      if (menuItems && menuItems.length > 0) {
        allData[sheet] = menuItems
        cacheHits++
        details.push(`${sheet}: HIT (${menuItems.length} món)`)
      } else {
        cacheMisses++
        details.push(`${sheet}: MISS (scheduled background prefetch)`)
        appStore.scheduleMenuPrefetch(sheet, { reason: 'ai-cache-miss', priority: 'background' })
      }
    }))

    const durationMs = (performance.now() - start).toFixed(1)
    logStore.addLog(
      `[AI Caching V2] Đọc cache thực đơn xong: ${durationMs}ms | ` +
      `Nguồn sheets: ${sheetsSource} | Total: ${sheets.length} | ` +
      `HIT: ${cacheHits} | MISS: ${cacheMisses}`,
      'info'
    )
    
    return allData
  }

  async function runLegacyPipeline(
    promptText: string,
    type: 'text' | 'vision',
    inputType: string,
    ruleBasedResult: any,
    hardEntities: HardEntities,
    optimizedImg: string | null,
    signal?: AbortSignal
  ): Promise<any> {
    logStore.addLog(`Chạy legacy pipeline fallback...`, 'warning')
    
    const aiPromptText = stripSetMenuComponents(promptText)
    const systemPromptTemplate = ADVANCED_AI_PROMPT
      .replace('{{CURRENT_DATE}}', (() => {
        const now = new Date()
        const dayNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']
        const dd = String(now.getDate()).padStart(2, '0')
        const mm = String(now.getMonth() + 1).padStart(2, '0')
        const yyyy = now.getFullYear()
        const hh = String(now.getHours()).padStart(2, '0')
        const min = String(now.getMinutes()).padStart(2, '0')
        return `${dayNames[now.getDay()]}, ${dd}/${mm}/${yyyy} ${hh}:${min}`
      })())
      .replace('{{RAW_INPUT}}', aiPromptText)
      .replace('{{RULE_BASED_HINTS}}', JSON.stringify(ruleBasedResult, null, 2))
      .replace('{{LOCKED_ENTITIES}}', JSON.stringify(hardEntities, null, 2))
      .replace(/\{\{TOMORROW_DD_MM_YYYY\}\}/g, (() => {
        const tom = new Date()
        tom.setDate(tom.getDate() + 1)
        const dd = String(tom.getDate()).padStart(2, '0')
        const mm = String(tom.getMonth() + 1).padStart(2, '0')
        const yyyy = tom.getFullYear()
        return `${dd}/${mm}/${yyyy}`
      })())

    const payload = prepareAIPayload(aiPromptText, systemPromptTemplate, ruleBasedResult, appStore.menuList)

    if (payload.isLocalOnly) {
      logStore.addLog(`Kích hoạt Token Guard: Dữ liệu đầu vào quá lớn, tự động kích hoạt chế độ tách tối giản cục bộ.`, 'warning')
      const latency = '0.0'
      const routingInfo = {
        pipeline: 'text',
        tier_used: 0,
        model_used: 'Local Rule Engine V7.0 (Payload Compact)',
        fallback_count: 0,
        repair_applied: false,
        latency,
        mode: 'bypass-local'
      }
      const parsed = repairAndNormalizeJSON({
        customer: { name: ruleBasedResult.customer_name || 'Khách hàng', phone: ruleBasedResult.phone },
        booking: {
          event_date: ruleBasedResult.event_date,
          event_time: ruleBasedResult.event_time,
          guest_count: ruleBasedResult.guest_count,
          table_number: ruleBasedResult.table_code,
          need: ruleBasedResult.booking_need
        },
        menu_items: resolveMenuItemsLocally(
          ruleBasedResult.menu_items || [], 
          ruleBasedResult.guest_count,
          appStore.menuList,
          appStore.menuAliases,
          formStore.customer.pax ? parseInt(String(formStore.customer.pax)) : null
        )
      }, inputType)
      
      if (!parsed.warnings) parsed.warnings = []
      parsed.warnings.push('Đoạn text đặt bàn quá dài, kích hoạt chế độ tự động tách thông tin tối giản.')
      return { parsed, routing: routingInfo }
    } else {
      const routerResponse = await smartRouter(type, payload.sysPrompt, payload.userPrompt, optimizedImg, inputType, signal)
      return routerResponse
    }
  }

  async function processAI(options?: { force?: boolean }) {
    if (!formStore.rawInput && !formStore.aiImage) {
      return uiStore.showToast('Vui lòng nhập dữ liệu hoặc chụp ảnh!', 'warning')
    }

    const force = options?.force ?? false
    logStore.startNewSession('Phân tích AI')
    logStore.addLog(`Bắt đầu xử lý tin nhắn/ảnh đặt bàn...`)

    const activeController = api.createAIAbortController()
    uiStore.loading.is = true
    uiStore.loading.msg = 'AI PIPELINE V7.0'
    uiStore.loading.subMsg = 'Analyzing input...'

    const startTime = performance.now()
    
    let allMenus: Record<string, any[]> | null = null
    const getOrLoadAllMenus = async () => {
      if (!allMenus) {
        allMenus = await loadAllMenusData()
      }
      return allMenus
    }
    let pendingMenuSwitchSheet: string | null = null

    const flags = {
      enableLocalFirstBypass: import.meta.env.VITE_AI_LOCAL_FIRST !== 'false',
      enableDynamicPrompt: import.meta.env.VITE_AI_DYNAMIC_PROMPT !== 'false',
      enableMenuCandidateRetrieval: import.meta.env.VITE_AI_MENU_RETRIEVAL !== 'false',
      enableAsymmetricRace: import.meta.env.VITE_AI_RACE_MODE !== 'false',
      enableStrictJsonSchema: import.meta.env.VITE_AI_STRICT_JSON !== 'false',
      enableLegacyFallback: import.meta.env.VITE_AI_LEGACY_FALLBACK !== 'false'
    }

    let inputType = 'unknown'
    let ruleBasedResult: any = null
    let hardEntities: HardEntities = {
      phones: [],
      dates: [],
      times: [],
      guestCounts: [],
      tables: []
    }

    try {
      const type = formStore.aiImage ? 'vision' : 'text'
      const hasImage = !!formStore.aiImage
      
      const classificationInput = {
        text: formStore.rawInput || '',
        hasImage,
        attachedImageCount: hasImage ? 1 : 0,
        currentFormState: {
          customer: formStore.customer,
          items: formStore.items
        },
        now: new Date()
      }
      
      const classification = classifyAIInput(classificationInput)
      inputType = classification.complexity === 'image_ocr' ? 'chat_screenshot' : 'booking_text'
      
      let profile: PromptProfile = 'TEXT_SIMPLE'
      if (classification.requiresOCR) {
        profile = 'IMAGE_OCR'
      } else if (classification.requiresConversationContext) {
        profile = 'COMPLEX_CONVERSATION'
      } else if (classification.requiresMenuContext || classification.detectedSignals.hasMenuKeyword) {
        profile = 'TEXT_WITH_MENU'
      } else if (classification.complexity === 'booking_with_missing_fields') {
        profile = 'TEXT_WITH_MISSING_FIELDS'
      }

      const menuFingerprint = getMenuFingerprint()
      const correctionFingerprint = getCorrectionFingerprint()

      const cacheKey = hashString(stableStringify({
        normalizedUserInput: (formStore.rawInput || '').trim().toLowerCase(),
        providerOrMode: aiMode,
        modelProfile: profile,
        menuFingerprint,
        correctionFingerprint,
        promptSchemaVersion: 1,
        normalizerSchemaVersion: 1
      }))

      logStore.addLog(`[Classifier] Complexity: "${classification.complexity}", requiresLLM: ${classification.requiresLLM}, requiresMenuContext: ${classification.requiresMenuContext}`)
      
      let promptText = formStore.aiImage
        ? (formStore.rawInput || 'Phân tích ảnh này để lấy thông tin đặt bàn, khách hàng và danh sách món ăn.')
        : formStore.rawInput
      promptText = preNormalizeInput(promptText)

      ruleBasedResult = extractByRules(promptText)
      hardEntities = extractHardEntities(promptText)

      let finalParsedResult: any = null
      let routingInfo: any = null
      let isBypassed = false

      if (type === 'text' && flags.enableLocalFirstBypass && classification.shouldTryLocalFirst) {
        const localAnalysis = analyzeBookingLocally(promptText)
        const bypass = evaluateBookingBypass(
          localAnalysis,
          hasImage,
          classification.detectedSignals.hasMenuKeyword,
          classification.detectedSignals.hasAmbiguousPhrase
        )

        if (bypass.canBypassLLM) {
          isBypassed = true
          const latency = ((performance.now() - startTime) / 1000).toFixed(2)
          logStore.addLog(`[Local Bypass] Tất cả trường cốt lõi hợp lệ. Bỏ qua gọi LLM. Trích xuất thành công: Tên=${localAnalysis.customerName.value}, SĐT=${localAnalysis.phone.value}, Ngày=${localAnalysis.bookingDate.value}, Giờ=${localAnalysis.bookingTime.value}, Khách=${localAnalysis.guestCount.value}`, 'success')
          
          routingInfo = {
            pipeline: 'text',
            tier_used: 0,
            model_used: 'Local Rule Engine V7.0 (Bypass)',
            fallback_count: 0,
            repair_applied: false,
            latency,
            mode: 'bypass-local'
          }

          finalParsedResult = repairAndNormalizeJSON({
            customer: { name: localAnalysis.customerName.value || 'Khách hàng', phone: localAnalysis.phone.value },
            booking: {
              event_date: localAnalysis.bookingDate.value,
              event_time: localAnalysis.bookingTime.value,
              guest_count: localAnalysis.guestCount.value,
              table_number: '',
              need: localAnalysis.partyType.value
            },
            menu_items: []
          }, inputType)
        }
      }

      if (!isBypassed && !force) {
        const cached = await getCachedAIResponse<any>(cacheKey, {
          menuFingerprint,
          correctionFingerprint
        })
        
        if (cached) {
          finalParsedResult = cached
          isBypassed = true
          logStore.addLog(`Cache Hit: Tìm thấy kết quả đã xử lý trước đó trong cache. Bỏ qua gọi AI.`, 'success')
          const latency = ((performance.now() - startTime) / 1000).toFixed(2)
          routingInfo = {
            ...cached.routing,
            latency,
            mode: 'cache-hit'
          }
        }
      }

      if (!finalParsedResult && type === 'text' && !force) {
        const { extractEntitiesFromInput, querySemanticCache } = await import('@/services/ai/semanticCache')
        const newEntities = extractEntitiesFromInput(ruleBasedResult, hardEntities)
        
        const semanticCached = await querySemanticCache(formStore.rawInput || '', newEntities, {
          menuFingerprint,
          correctionFingerprint,
          promptSchemaVersion: 1,
          normalizerSchemaVersion: 1
        })
        
        if (semanticCached) {
          finalParsedResult = semanticCached.value
          isBypassed = true
          logStore.addLog(`Semantic Cache Hit: Tìm thấy kết quả tương đồng. Bỏ qua gọi AI.`, 'success')
          const latency = ((performance.now() - startTime) / 1000).toFixed(2)
          routingInfo = {
            ...(finalParsedResult.routing || {}),
            latency,
            mode: 'cache-hit'
          }
        }
      }

      if (!finalParsedResult) {
        logStore.addLog(`Bắt đầu chạy pipeline gọi AI...`)
        
        logStore.addLog(`[Optimistic UI] Tự động điền nhanh các thông tin cơ bản trích xuất được từ Rule Engine...`)
        const optimisticResult = {
          customer: {
            name: ruleBasedResult.customer_name || '',
            phone: ruleBasedResult.phone || ''
          },
          booking: {
            event_date: ruleBasedResult.event_date || '',
            event_time: ruleBasedResult.event_time || '',
            guest_count: ruleBasedResult.guest_count || null,
            table_number: ruleBasedResult.table_code || '',
            need: ruleBasedResult.booking_need || 'Ăn thường'
          }
        }
        fillBookingFormSafely(optimisticResult, { mode: 'customer' })
        uiStore.showToast('⚡ Đã nhận diện nhanh thông tin khách hàng...', 'info')

        const corrections = appStore.aiCorrections || []
        const appliedCorrections: Record<string, string> = {}
        for (const corr of corrections) {
          if (corr.inputText && promptText.toLowerCase().includes(corr.inputText.toLowerCase())) {
            appliedCorrections[corr.field] = corr.correctValue
            logStore.addLog(`Áp dụng sửa lỗi tự học (AI Correction) cho trường [${corr.field}]: "${corr.correctValue}"`)
          }
        }

        let menuCandidates: any[] = []
        if (flags.enableMenuCandidateRetrieval) {
          const loadedMenus = await getOrLoadAllMenus()
          const menusForRetriever = Object.entries(loadedMenus).map(([sheetName, items]) => ({
            menuId: sheetName,
            menuName: sheetName,
            items: items.map((item: any) => ({
              id: item.id || item.name,
              name: item.name,
              aliases: item.aliases || (item.acronym ? [item.acronym] : []),
              category: item.category,
              price: item.price
            }))
          }))
          
          if (menusForRetriever.length === 0 && appStore.menuList && appStore.menuList.length > 0) {
            menusForRetriever.push({
              menuId: appStore.activeSheet || 'default',
              menuName: appStore.activeSheet || 'default',
              items: appStore.menuList.map((item: any) => ({
                id: item.id || item.name,
                name: item.name,
                aliases: item.aliases || (item.acronym ? [item.acronym] : []),
                category: item.category,
                price: item.price
              }))
            })
          }

          menuCandidates = retrieveMenuCandidates({
            text: promptText,
            menus: menusForRetriever,
            limit: 15
          })
          logStore.addLog(`[Menu Retrieval] Đã lọc được ${menuCandidates.length} món ăn ứng viên phù hợp.`)
        }

        // profile already determined at start for cache key stability

        const currentDateTimeStr = (() => {
          const now = new Date()
          const dayNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']
          const dd = String(now.getDate()).padStart(2, '0')
          const mm = String(now.getMonth() + 1).padStart(2, '0')
          const yyyy = now.getFullYear()
          const hh = String(now.getHours()).padStart(2, '0')
          const min = String(now.getMinutes()).padStart(2, '0')
          return `${dayNames[now.getDay()]}, ${dd}/${mm}/${yyyy} ${hh}:${min}`
        })()

        const promptResult = buildDynamicPrompt({
          profile,
          userText: promptText,
          classification,
          menuCandidates,
          conversationContext: '',
          currentDateTime: currentDateTimeStr,
          locale: 'vi-VN',
          aiCorrections: appStore.aiCorrections
        })

        const optimizedImg = formStore.aiImage ? await resizeImage(formStore.aiImage, 1120) : null
        
        let routerResponse: any = null
        try {
          routerResponse = await smartRouter(
            type,
            promptResult.systemPrompt,
            promptResult.userPrompt,
            optimizedImg,
            inputType,
            activeController.signal
          )
        } catch (e: any) {
          if (flags.enableLegacyFallback) {
            logStore.addLog(`[AI Router] Lỗi trong pipeline tối ưu: ${e.message}. Đang chạy fallback sang prompt cũ...`, 'warning')
            routerResponse = await runLegacyPipeline(promptText, type, inputType, ruleBasedResult, hardEntities, optimizedImg, activeController.signal)
          } else {
            throw e
          }
        }

        routingInfo = routerResponse.routing
        let rawJsonParsed = repairAndNormalizeJSON(routerResponse.parsed, inputType)

        const validation = validateAIResult(rawJsonParsed)
        if (!validation.accepted) {
          logStore.addLog(`[Validation] Kết quả AI mới không đạt tiêu chuẩn: ${validation.reasons.join(', ')}`, 'warning')
          if (flags.enableLegacyFallback) {
            logStore.addLog(`Đang chạy fallback sang prompt cũ do kết quả không hợp lệ...`, 'warning')
            routerResponse = await runLegacyPipeline(promptText, type, inputType, ruleBasedResult, hardEntities, optimizedImg, activeController.signal)
            routingInfo = routerResponse.routing
            rawJsonParsed = repairAndNormalizeJSON(routerResponse.parsed, inputType)
          }
        }

        Object.keys(appliedCorrections).forEach(field => {
          const val = appliedCorrections[field]
          if (field === 'name' || field === 'phone') {
            if (!rawJsonParsed.customer) rawJsonParsed.customer = {}
            rawJsonParsed.customer[field] = val
          } else {
            if (!rawJsonParsed.booking) rawJsonParsed.booking = {}
            if (field === 'tables') rawJsonParsed.booking.table_number = val
            else rawJsonParsed.booking[field] = val
          }
        })

        if (rawJsonParsed.menu_items && rawJsonParsed.menu_items.length > 0) {
          logStore.addLog(`Bắt đầu đối khớp ${rawJsonParsed.menu_items.length} món ăn trích xuất được với thực đơn nhà hàng...`)
          rawJsonParsed.menu_items = matchMenuItems(
            rawJsonParsed.menu_items, 
            rawJsonParsed.booking?.guest_count,
            appStore.menuList,
            appStore.menuAliases,
            appStore.menuDetails || {},
            formStore.customer.pax ? parseInt(String(formStore.customer.pax)) : null,
            (msg, level) => logStore.addLog(msg, level)
          )
        }

        try {
          const loadedMenus = await getOrLoadAllMenus()
          const { bestSheet, score, isBorderline } = resolveBestMenuSheet(promptText, rawJsonParsed.menu_items || [], loadedMenus, appStore.activeSheet)
          
          if (bestSheet && bestSheet !== appStore.activeSheet) {
            logStore.addLog(`Phát hiện khả năng khớp thực đơn tốt hơn tại Sheet: "${bestSheet}" (Điểm: ${score}).`)
            if (isBorderline) {
              pendingMenuSwitchSheet = bestSheet
            } else {
              logStore.addLog(`Tự động chuyển sang thực đơn phù hợp nhất: "${bestSheet}"`, 'success')
              await appStore.switchMenu(bestSheet)
              uiStore.showToast(`Đã tự động chuyển sang thực đơn: ${bestSheet}`, 'success')
              
              if (rawJsonParsed.menu_items && rawJsonParsed.menu_items.length > 0) {
                logStore.addLog(`Khớp lại món ăn theo thực đơn mới: "${bestSheet}"...`)
                rawJsonParsed.menu_items = matchMenuItems(
                  rawJsonParsed.menu_items.map((i: any) => ({
                    name: i.raw_name || i.name,
                    quantity: i.quantity || i.qty || 1,
                    unit_price: i.unit_price || i.price || 0,
                    note: i.note
                  })),
                  rawJsonParsed.booking?.guest_count,
                  appStore.menuList,
                  appStore.menuAliases,
                  appStore.menuDetails || {},
                  formStore.customer.pax ? parseInt(String(formStore.customer.pax)) : null,
                  (msg, level) => logStore.addLog(msg, level)
                )
              }
            }
          }
        } catch (errSheet) {
          console.warn('Menu sheet routing error:', errSheet)
        }

        finalParsedResult = rawJsonParsed
        let ttl = 5 * 60 * 1000 // default 5 min
        if (inputType === 'booking_text') ttl = 10 * 60 * 1000
        if (inputType === 'menu_order_text' || inputType === 'mixed_booking_menu') ttl = 5 * 60 * 1000
        if (inputType === 'chat_screenshot') ttl = 30 * 60 * 1000
        if (inputType === 'deposit_bill_image') ttl = 60 * 60 * 1000

        const dataToCache = {
          ...finalParsedResult,
          routing: routingInfo
        }
        await setCachedAIResponse(cacheKey, dataToCache, {
          ttl,
          menuFingerprint,
          correctionFingerprint
        })

        if (type === 'text') {
          const { extractEntitiesFromInput, buildEntitySignature, saveToSemanticCache } = await import('@/services/ai/semanticCache')
          const entities = extractEntitiesFromInput(ruleBasedResult, hardEntities)
          const entitySignature = buildEntitySignature(entities)
          
          await saveToSemanticCache({
            normalizedText: stripAccents(formStore.rawInput || '').toLowerCase().trim(),
            entitySignature,
            value: dataToCache,
            createdAt: Date.now(),
            expiresAt: Date.now() + ttl,
            menuFingerprint,
            correctionFingerprint,
            promptSchemaVersion: 1,
            normalizerSchemaVersion: 1,
            modelProfile: profile
          })
        }
      }

      logStore.addLog(`Áp dụng Luật khóa dữ liệu deterministic (Deterministic Rule Lock)...`)
      finalParsedResult = applyDeterministicRuleLock(finalParsedResult, hardEntities, ruleBasedResult)

      const validatedResult = validateParsedFields(finalParsedResult)
      validatedResult.routing = routingInfo
      
      logStore.addLog(`Độ tin cậy tổng thể: ${Math.round((validatedResult.confidence?.overall || 0) * 100)}%`)
      if (validatedResult.needs_review_fields.length > 0) {
        logStore.addLog(`Các trường cần duyệt lại: [${validatedResult.needs_review_fields.join(', ')}]`, 'warning')
      } else {
        logStore.addLog(`Tất cả các trường đạt độ tin cậy an toàn.`, 'success')
      }

      const modeIcon = routingInfo.mode === 'bypass-local' ? '🚀' : routingInfo.mode === 'cache-hit' ? '💾' : '⚡'
      uiStore.showToast(
        `<b>AI V7.0 ${modeIcon} ${routingInfo.mode.toUpperCase()}</b><br/>` +
        `Model: ${routingInfo.model_used}<br/>` +
        `Latency: ${routingInfo.latency}s`,
        'success', 5000
      )

      formStore.parsedAiResult = validatedResult
      formStore.aiMetadata = {
        ...routingInfo,
        confidences: validatedResult.confidence
      }

      const warningMap: Record<string, string> = {
        phone: 'Số điện thoại không đúng định dạng VN hoặc thiếu số',
        event_date: 'Ngày đã qua hoặc sai định dạng DD/MM/YYYY',
        event_time: 'Giờ nằm ngoài khung hoạt động (15:00 - 23:30)',
        guest_count: 'Số lượng khách ngoài khoảng thông thường (1 - 200)',
        customer_name: 'Tên chứa từ khóa nghi vấn hoặc để trống',
        used_party_owner_as_customer_name: '⚠️ Tên chủ tiệc được nạp tạm vào ô Người đặt bàn vì chưa có thông tin người liên hệ rõ ràng.',
        used_single_ambiguous_name_as_customer_name: '⚠️ Nạp tạm tên người duy nhất tìm thấy vào ô Người đặt bàn (chưa rõ vai trò).',
        missing_clear_booker_name: '⚠️ Chưa xác định rõ người đặt bàn thực tế.',
        missing_customer_name: '⚠️ Hoàn toàn không tìm thấy tên người liên hệ nào trong nội dung.',
        customerName_or_partyOwner_ambiguous: '⚠️ Tên người trong tin nhắn mơ hồ, chưa xác định rõ vai trò.'
      }
      formStore.warnings = validatedResult.needs_review_fields.map((f: string) => {
        return warningMap[f] || `Trường ${f} cần kiểm tra lại độ chính xác`
      })
      formStore.unresolvedItems = validatedResult.menu_items.filter((i: any) => i.needs_review).map((i: any) => i.raw_name)

      if (configStore.defaults.aiWorkflowMode !== 'review') {
        logStore.addLog(`Chế độ tự động nạp form (Direct Mode): Đang nạp toàn bộ thông tin...`)
        fillBookingFormSafely(validatedResult, { mode: 'all' })
      }

    } catch (e: any) {
      if (e.name !== 'AbortError') {
        logStore.addLog(`Lỗi Pipeline AI: ${e.message}`, 'error')
        const localItems = resolveMenuItemsLocally(
          ruleBasedResult?.menu_items || [], 
          ruleBasedResult?.guest_count,
          appStore.menuList,
          appStore.menuAliases,
          formStore.customer.pax ? parseInt(String(formStore.customer.pax)) : null
        )
        if (localItems.length > 0 || ruleBasedResult?.phone || ruleBasedResult?.customer_name) {
          console.warn('[AI] All models failed, using LOCAL FALLBACK with rule-based data')
          logStore.addLog(`Bắt đầu chạy Chế độ dự phòng cục bộ (Local Fallback)...`, 'warning')
          const fallbackResult = repairAndNormalizeJSON({
            customer: { name: ruleBasedResult.customer_name || '', phone: ruleBasedResult.phone || '' },
            booking: {
              event_date: ruleBasedResult.event_date,
              event_time: ruleBasedResult.event_time,
              guest_count: ruleBasedResult.guest_count,
              table_number: ruleBasedResult.table_code,
              need: ruleBasedResult.booking_need
            },
            deposit: ruleBasedResult.deposit_amount ? {
              amount: ruleBasedResult.deposit_amount,
              status: ruleBasedResult.deposit_status || 'chờ cọc'
            } : undefined,
            menu_items: localItems,
            routing: { mode: 'local-fallback', model_used: 'Rule Engine', latency: '0.0', fallback_count: 0, tier_used: -1 }
          }, inputType)

          const validatedFallback = validateParsedFields(fallbackResult)
          validatedFallback.routing = fallbackResult.routing
          formStore.parsedAiResult = validatedFallback
          formStore.aiMetadata = { ...fallbackResult.routing }

          uiStore.showToast(
            `<b>⚠️ LOCAL FALLBACK</b><br/>AI không khả dụng. Đã dùng Rule Engine trích xuất ${localItems.length} món.`,
            'warning', 5000
          )
          logStore.addLog(`Local Fallback thành công! Trích xuất được ${localItems.length} món.`, 'success')

          if (configStore.defaults.aiWorkflowMode !== 'review') {
            fillBookingFormSafely(validatedFallback, { mode: 'all' })
          }
        } else {
          uiStore.error.show = true
          uiStore.error.msg = 'V7.0 Engine Error: ' + e.message
        }
      }
    } finally {
      uiStore.loading.is = false
      api.clearAIAbortController()
      logStore.addLog(`=== KẾT THÚC PHIÊN PHÂN TÍCH (Tổng độ trễ: ${((performance.now() - startTime)/1000).toFixed(2)}s) ===`, 'info')
      
      if (pendingMenuSwitchSheet) {
        const targetSheet = pendingMenuSwitchSheet
        setTimeout(async () => {
          try {
            const confirmed = await uiStore.showConfirm(
              'Đổi thực đơn?',
              `Nhận diện thực đơn "${targetSheet}". Bạn có muốn chuyển sang thực đơn này không?`
            )
            if (confirmed) {
              logStore.addLog(`Người dùng đồng ý chuyển sang thực đơn: "${targetSheet}"`, 'info')
              await appStore.switchMenu(targetSheet)
              
              if (formStore.items && formStore.items.length > 0) {
                logStore.addLog(`Đang khớp lại ${formStore.items.length} món ăn với thực đơn mới "${targetSheet}"...`)
                const reMatched = matchMenuItems(
                  formStore.items.map((i: any) => ({
                    name: i.name,
                    quantity: i.qty,
                    unit_price: i.price,
                    note: i.note
                  })),
                  formStore.customer.pax ? parseInt(String(formStore.customer.pax)) : null,
                  appStore.menuList,
                  appStore.menuAliases,
                  appStore.menuDetails || {},
                  formStore.customer.pax ? parseInt(String(formStore.customer.pax)) : null,
                  (msg, level) => logStore.addLog(msg, level)
                )
                
                formStore.items = reMatched.map((newItem: any) => ({
                  name: newItem.matched_name || newItem.name,
                  qty: newItem.quantity || newItem.qty || 1,
                  price: newItem.unit_price || newItem.price || 0,
                  note: newItem.note || newItem.notes || ""
                }))
                
                if (formStore.originalAiValues) {
                  formStore.originalAiValues.items = JSON.parse(JSON.stringify(formStore.items || []))
                }
                
                logStore.addLog(`Đã khớp lại món ăn thành công theo thực đơn mới.`, 'success')
                uiStore.showToast(`Đã cập nhật giá món ăn theo thực đơn: ${targetSheet}`, 'success')
              }
            } else {
              logStore.addLog(`Người dùng từ chối chuyển sang thực đơn: "${targetSheet}"`, 'warning')
            }
          } catch (errConfirm) {
            console.error('Switch menu confirm error:', errConfirm)
          }
        }, 300)
      }
    }
  }

  async function verifyTransferImage(base64Img: string) {
    logStore.startNewSession('Xác thực Bill Chuyển Khoản')
    logStore.addLog(`Khởi chạy AI xác thực Bill chuyển khoản...`)
    uiStore.loading.is = true
    uiStore.loading.msg = 'AI KIỂM TRA BILL CK...'
    uiStore.loading.subMsg = 'Analyzing...'
    try {
      const sysPrompt = `Bạn là AI Kế Toán King's Grill. Trích xuất thông tin từ ảnh chuyển khoản.
Output JSON: { "amount": Number, "content": "String", "bank": "String", "time": "String" }
- amount: số tiền chuyển thành công (bỏ qua số dư)
- content: nội dung/lời nhắn chuyển tiền
- Không tìm thấy → null. Chỉ trả về JSON thuần.`
      
      const optimizedImg = await resizeImage(base64Img, 1120)
      const aiResponse = (await smartRouter('vision', sysPrompt, 'Phân tích ảnh chuyển khoản', optimizedImg)) as any

      const amountVal = aiResponse?.parsed?.amount || aiResponse?.amount
      const contentVal = aiResponse?.parsed?.content || aiResponse?.content
      const timeVal = aiResponse?.parsed?.time || aiResponse?.time

      logStore.addLog(`AI trích xuất bill thành công. Số tiền: ${amountVal}, Nội dung: "${contentVal}", Thời gian: "${timeVal}"`)

      if (amountVal) {
        const aiAmount = parseInt(String(amountVal))
        const aiContent = String(contentVal || '')
        const expected = parseInt(String(formStore.deposit.amount))

        logStore.addLog(`So sánh số tiền quét được (${aiAmount}) với số tiền cần cọc (${expected}).`)
        if (aiAmount === expected) {
          formStore.deposit.isPaid = true
          formStore.deposit.note = aiContent || 'AI Verified ✓'
          formStore.deposit.time = String(timeVal || new Date().toLocaleString('vi-VN'))
          uiStore.showToast(`✅ Xác thực thành công!\nSố tiền: ${formatVND(aiAmount)}\nNội dung: ${aiContent}`, 'success')
          logStore.addLog(`Xác thực khớp hoàn toàn! Đã tự động cập nhật Trạng thái cọc thành ĐÃ CỌC.`, 'success')
        } else {
          uiStore.verifyModal.show = true
          uiStore.verifyModal.scanned = { amount: aiAmount, content: aiContent }
          uiStore.verifyModal.expected = { amount: expected }
          logStore.addLog(`Số tiền trên Bill không khớp với số tiền cần cọc! Yêu cầu người dùng duyệt thủ công.`, 'warning')
        }
      } else {
        throw new Error('Không đọc được thông tin chuyển khoản')
      }
    } catch (e: any) {
      uiStore.showToast('Lỗi xác thực: ' + e.message, 'warning')
      logStore.addLog(`Lỗi xác thực: ${e.message}`, 'error')
    } finally {
      uiStore.loading.is = false
      logStore.addLog(`=== KẾT THÚC XÁC THỰC BILL ===`, 'info')
    }
  }

  async function ocrExtractText(base64Img: string): Promise<string> {
    logStore.startNewSession('AI OCR Đọc Ảnh')
    logStore.addLog(`Bắt đầu trích xuất văn bản từ hình ảnh (OCR)...`)
    uiStore.loading.is = true
    uiStore.loading.msg = 'AI OCR ĐANG ĐỌC ẢNH...'
    uiStore.loading.subMsg = 'Vision Processing...'

    try {
      const optimizedImg = await resizeImage(base64Img, 1600)
      const defaultId = configStore.defaults.vision
      const candidates = AI_MODELS
        .filter(m => m.type === 'vision')
        .filter(m => m.provider === 'pollinations' || (configStore.keysStatus[m.provider]?.configured))

      candidates.sort((a, b) => {
        if (defaultId) {
          if (a.id === defaultId) return -1
          if (b.id === defaultId) return 1
        }
        return a.tier - b.tier
      })

      logStore.addLog(`Các model OCR khả dụng: ${candidates.map(c => c.name).join(', ')}`)
      if (candidates.length === 0) {
        logStore.addLog(`Chưa cấu hình API Key cho Vision/OCR.`, 'error')
        throw new Error('Chưa cấu hình API Key cho Vision/OCR. Vào Cài đặt → thêm Key Google/Groq.')
      }

      const startTime = performance.now()
      let lastError: Error | null = null

      for (const model of candidates) {
        try {
          uiStore.loading.subMsg = `OCR: ${model.name}...`
          logStore.addLog(`Thử chạy OCR bằng model: [${model.name}]...`)
          const rawResult = await callAIModel({
            model,
            sysPrompt: IMAGE_OCR_PROMPT,
            userPrompt: 'Trích xuất TOÀN BỘ văn bản từ ảnh này. CRITICAL: Nếu có bảng, phải trích xuất TẤT CẢ các dòng từ đầu đến cuối, KHÔNG được bỏ sót hay cắt ngắn. Trả về đầy đủ 100% nội dung.',
            image: optimizedImg,
            jsonMode: false,
            localKeys: [],
            apiGatewayUrl,
            aiMode
          }, (msg, level) => logStore.addLog(msg, level))

          if (rawResult && rawResult.trim().length > 10) {
            const latency = ((performance.now() - startTime) / 1000).toFixed(1)
            const cleanText = rawResult.trim().replace(/```[a-zA-Z]*\n([\s\S]*?)```/g, '$1').trim()
            uiStore.showToast(`<b>OCR ⚡</b> ${model.name} | ${latency}s`, 'success', 3000)
            logStore.addLog(`OCR thành công với [${model.name}] (Độ trễ: ${latency}s). Số ký tự trích xuất: ${cleanText.length}`, 'success')
            return cleanText
          } else {
            throw new Error('OCR trả về kết quả rỗng')
          }
        } catch (e: any) {
          console.warn(`[OCR] ${model.name} failed:`, e.message)
          logStore.addLog(`OCR model [${model.name}] thất bại: ${e.message}`, 'warning')
          lastError = e
        }
      }
      logStore.addLog(`Tất cả các model OCR đều thất bại.`, 'error')
      throw new Error('OCR thất bại: ' + (lastError?.message || 'Không có model khả dụng'))
    } finally {
      uiStore.loading.is = false
      logStore.addLog(`=== KẾT THÚC OCR ===`, 'info')
    }
  }

  async function parseMenuAI(text: string): Promise<string> {
    uiStore.loading.is = true
    uiStore.loading.msg = 'AI ĐANG PHÂN TÍCH MENU...'
    try {
      const sysPrompt = `Bạn là một trợ lý ảo chuyên phân tích thực đơn. Hãy trích xuất danh sách các món ăn từ đoạn văn bản lộn xộn của người dùng.
Trả về kết quả dưới định dạng chuẩn sau, không thêm bất kì văn bản nào khác:
[Tên món ăn] - [Giá tiền]
Ví dụ:
Sườn nướng tảng - 250000
Salad bò - 120000
(Lưu ý: Giá tiền chỉ bao gồm số, bỏ chữ k, vnd, đ)`
      
      const candidates = AI_MODELS
        .filter(m => m.type === 'text')
        .filter(m => m.provider === 'pollinations' || (configStore.keysStatus[m.provider]?.configured) || (configStore.gatewayProviderStatus[m.provider]?.configured))
        .sort((a, b) => a.tier - b.tier)
      
      if (candidates.length === 0) throw new Error('Chưa cấu hình API Key')
      
      const rawText = await callAIModel({
        model: candidates[0],
        sysPrompt,
        userPrompt: text,
        jsonMode: false,
        localKeys: [],
        apiGatewayUrl,
        aiMode
      })
      uiStore.showToast('✅ AI Phân tích thành công!', 'success')
      return rawText || text
    } catch (e: any) {
      uiStore.showToast('Lỗi AI Phân tích Menu: ' + e.message, 'warning')
      return text
    } finally {
      uiStore.loading.is = false
    }
  }

  async function checkAndLogAiCorrections() {
    if (!formStore.originalAiValues || !formStore.rawInput) return
    const original = formStore.originalAiValues
    const current = {
      name: formStore.customer.name,
      phone: cleanPhoneNumber(formStore.customer.phone),
      date: formatDateStr(formStore.customer.date),
      time: formStore.customer.time,
      pax: String(parseInt(String(formStore.customer.pax)) || ''),
      tables: (uiStore.tempTable.zone || '') + (uiStore.tempTable.number || ''),
      type: formStore.customer.type,
      note: formStore.customer.note
    }

    const fieldsToCompare = [
      { key: 'name', label: 'customer.name' },
      { key: 'phone', label: 'customer.phone' },
      { key: 'date', label: 'reservation.date' },
      { key: 'time', label: 'reservation.time' },
      { key: 'pax', label: 'reservation.pax' },
      { key: 'tables', label: 'reservation.table_code' },
      { key: 'type', label: 'reservation.type' }
    ]

    for (const f of fieldsToCompare) {
      const origVal = String(original[f.key] || '').trim().toLowerCase()
      const currVal = String((current as any)[f.key] || '').trim().toLowerCase()
      if (origVal && currVal && origVal !== currVal) {
        try {
          console.log(`[AI Auto-Learn] Logging correction for field ${f.key}: "${original[f.key]}" -> "${(current as any)[f.key]}"`)
          await appStore.logAiCorrection(
            formStore.rawInput,
            original[f.key],
            (current as any)[f.key],
            f.key,
            appStore.adminToken
          )
        } catch (e) {
          console.warn('[AI Auto-Learn] Failed to log correction:', e)
        }
      }
    }

    if (original.items && formStore.items && formStore.parsedAiResult?.menu_items) {
      const origItems = original.items as any[]
      const currItems = formStore.items as any[]
      const parsedMenuItems = formStore.parsedAiResult.menu_items as any[]
      
      for (let i = 0; i < currItems.length; i++) {
        const curr = currItems[i]
        const orig = origItems[i]
        if (orig && curr.name !== orig.name) {
          const parsedItem = parsedMenuItems.find(p => p.matched_name === orig.name || p.name === orig.name)
          if (parsedItem && parsedItem.raw_name) {
            const rawInputName = parsedItem.raw_name.trim()
            const correctedName = curr.name.trim()
            if (rawInputName && correctedName && rawInputName.toLowerCase() !== correctedName.toLowerCase()) {
              try {
                console.log(`[AI Auto-Learn] Learning menu alias: "${rawInputName}" -> "${correctedName}"`)
                await appStore.saveAlias(rawInputName, correctedName)
              } catch (e) {
                console.warn('[AI Auto-Learn] Failed to save menu alias:', e)
              }
            }
          }
        }
      }
    }
  }

  return {
    callAIModel: (req: any) => callAIModel(req, (msg, level) => logStore.addLog(msg, level)),
    smartRouter,
    processAI,
    verifyTransferImage,
    ocrExtractText,
    parseMenuAI,
    checkAndLogAiCorrections,
    fillBookingFormSafely,
    extractByRules,
    preNormalizeInput,
    classifyInputType,
    validateParsedFields,
    repairAndNormalizeJSON
  }
}
