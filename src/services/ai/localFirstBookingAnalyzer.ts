import { extractByRules, extractHardEntities, classifyPeopleNames } from '@/domain/ai/ruleEngine'
import type { LocalBookingExtractionResult } from '@/domain/booking/bookingCompletenessGate'
import { stripAccents, cleanPhoneNumber } from '@/utils'

export function analyzeBookingLocally(text: string): LocalBookingExtractionResult {
  const normalizedText = text.trim()
  const ruleResult = extractByRules(normalizedText)
  const hardEntities = extractHardEntities(normalizedText)
  const nameResults = classifyPeopleNames(normalizedText)

  const cleanTextLower = stripAccents(normalizedText).toLowerCase()

  // 1. Customer Name Confidence
  let nameVal = ruleResult.customer_name || ''
  let nameConf = 0
  if (nameVal) {
    nameConf = (ruleResult as any).customer_name_confidence ?? 0.95
    const cleanNameVal = stripAccents(nameVal).toLowerCase().trim()
    const filteredNames = nameResults.peopleNames.filter((n: string) => {
      const cleanN = stripAccents(n).toLowerCase().trim()
      if (['ban', 'ban oi', 'quan', 'cho', 'dem', 'anh', 'chi', 'em', 'dat', 'nguoi', 'khach', 'viet', 'nam'].includes(cleanN)) {
        return false
      }
      return cleanN !== cleanNameVal
    })
    
    if (filteredNames.length > 0 && nameConf > 0.80) {
      nameConf = 0.78
    }
  }

  // 2. Phone Confidence
  let phoneVal = ruleResult.phone || ''
  let phoneConf = 0
  if (phoneVal) {
    const cleanPhone = phoneVal.replace(/\s+/g, '')
    const vnPhoneRegex = /^(?:0|\+84)[1-9]\d{8}$/
    if (vnPhoneRegex.test(cleanPhone)) {
      phoneConf = 0.98
    } else {
      phoneConf = 0.50
    }
  }

  // 3. Guest Count Confidence
  let guestVal = ruleResult.guest_count || null
  let guestConf = 0
  if (guestVal !== null && guestVal > 0) {
    const paxMatch = cleanTextLower.match(/\b(\d+)\s*(?:pax|nguoi|ng|khach|cho|cho nguoi|lon)\b/i)
    if (paxMatch && parseInt(paxMatch[1], 10) === guestVal) {
      guestConf = 0.98
    } else {
      guestConf = 0.85
    }
  }

  // 4. Date Confidence
  let dateVal = ruleResult.event_date || ''
  let dateConf = 0
  if (dateVal) {
    const isSpecificFormat = /^\d{2}\/\d{2}\/\d{4}$/.test(dateVal)
    if (isSpecificFormat) {
      dateConf = 0.98
    } else {
      dateConf = 0.95
    }
  } else if (hardEntities.dates && hardEntities.dates.length > 0) {
    const standardDate = hardEntities.dates.find((d: any) => d.confidence >= 0.9)
    if (standardDate) {
      dateVal = standardDate.value
      dateConf = 0.95
    }
  }

  // 5. Time Confidence
  let timeVal = ruleResult.event_time || ''
  let timeConf = 0
  if (timeVal) {
    const isSpecificFormat = /^\d{2}:\d{2}$/.test(timeVal)
    if (isSpecificFormat) {
      timeConf = 0.95
    } else {
      timeConf = 0.80
    }
  }

  // 6. Party Type & Notes
  const partyVal = ruleResult.booking_need || 'Ăn thường'
  const partyConf = partyVal !== 'Ăn thường' ? 0.95 : 0.90
  const noteVal = ruleResult.note || ''
  const noteConf = noteVal ? 0.90 : 0.50

  // Overall Confidence (Average of 5 Core Fields)
  const overallConfidence = parseFloat(
    ((nameConf + phoneConf + guestConf + dateConf + timeConf) / 5).toFixed(2)
  )

  const missingFields: string[] = []
  if (!nameVal) missingFields.push('customerName')
  if (!phoneVal) missingFields.push('phone')
  if (guestVal === null) missingFields.push('guestCount')
  if (!dateVal) missingFields.push('bookingDate')
  if (!timeVal) missingFields.push('bookingTime')

  const warnings: string[] = []
  if (nameConf < 0.95 && nameVal) warnings.push('Độ tin cậy tên khách đặt thấp.')
  if (phoneConf < 0.95 && phoneVal) warnings.push('Số điện thoại không đúng định dạng VN.')
  if (guestVal !== null && (guestVal < 1 || guestVal > 200)) warnings.push('Số lượng khách bất thường.')
  if (timeVal) {
    const [hStr] = timeVal.split(':')
    const hour = parseInt(hStr, 10)
    if (hour < 10 || hour > 23) warnings.push('Giờ đặt ngoài khung hoạt động.')
  }

  return {
    customerName: { value: nameVal, confidence: nameConf, source: 'rule' },
    phone: { value: phoneVal, confidence: phoneConf, source: 'rule' },
    guestCount: { value: guestVal || 0, confidence: guestConf, source: 'rule' },
    bookingDate: { value: dateVal, confidence: dateConf, source: 'rule' },
    bookingTime: { value: timeVal, confidence: timeConf, source: 'rule' },
    partyType: { value: partyVal, confidence: partyConf, source: 'rule' },
    notes: { value: noteVal, confidence: noteConf, source: 'rule' },
    overallConfidence,
    missingFields,
    warnings
  }
}
