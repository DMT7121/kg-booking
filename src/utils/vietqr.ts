import { stripAccents } from './index'

/**
 * Format field in EMVCo format: [ID][Length][Value]
 */
function formatField(id: string, value: string): string {
  const lengthStr = String(value.length).padStart(2, '0')
  return `${id}${lengthStr}${value}`
}

/**
 * Compute CRC16-CCITT checksum (Polynomial: 0x1021, Initial: 0xFFFF)
 */
export function computeCRC16(str: string): string {
  let crc = 0xFFFF
  for (let c = 0; c < str.length; c++) {
    const charCode = str.charCodeAt(c)
    crc ^= (charCode << 8)
    for (let i = 0; i < 8; i++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF
      } else {
        crc = (crc << 1) & 0xFFFF
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

/**
 * Generate EMVCo standard VietQR payment string
 */
export function generateVietQRText(
  bankBin: string,
  accountNo: string,
  amount: number,
  content: string,
  accountName: string
): string {
  const cleanBankBin = String(bankBin).replace(/\D/g, '')
  const cleanAccountNo = String(accountNo).replace(/\s/g, '')

  // 1. Build Merchant Account Information (ID 38)
  const guid = "A000000727" // NAPAS GUID
  const providerBlock = formatField("00", cleanBankBin) + formatField("01", cleanAccountNo)
  const serviceCode = "QRIBFTTA" // NAPAS account transfer
  
  const merchantInfo = 
    formatField("00", guid) + 
    formatField("01", providerBlock) + 
    formatField("02", serviceCode)
  
  const merchantInfoField = formatField("38", merchantInfo)

  // 2. Concat all standard fields
  let emvco = ''
  emvco += formatField("00", "01") // Payload Format Indicator
  emvco += formatField("01", amount > 0 ? "12" : "11") // Initiation Method (11: Static, 12: Dynamic)
  emvco += merchantInfoField
  emvco += formatField("53", "704") // Currency (VND)
  
  if (amount > 0) {
    emvco += formatField("54", String(Math.round(amount))) // Amount
  }
  
  emvco += formatField("58", "VN") // Country Code
  
  if (accountName) {
    const cleanName = stripAccents(accountName).toUpperCase().trim()
    emvco += formatField("59", cleanName) // Merchant Name
  }
  
  if (content) {
    const cleanContent = stripAccents(content).toUpperCase().trim()
    const addData = formatField("08", cleanContent)
    emvco += formatField("62", addData) // Additional Data
  }

  // 3. Append CRC ID and length ("6304"), then compute checksum
  emvco += "6304"
  const crc = computeCRC16(emvco)
  emvco += crc

  return emvco
}
