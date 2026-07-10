import QRCode from 'qrcode'

/**
 * Generate a QR Code as a Base64 Data URL (PNG)
 */
export async function generateQRCodeDataURL(text: string): Promise<string> {
  try {
    return await QRCode.toDataURL(text, {
      margin: 1,
      width: 300,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    })
  } catch (err) {
    console.error('[QRCode] Failed to generate:', err)
    return ''
  }
}
