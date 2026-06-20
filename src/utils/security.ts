/**
 * HMAC-SHA256 Request Signing Helper using Web Crypto API
 */
export async function signRequest(
  method: string,
  path: string,
  body: string,
  ephemeralKey: string,
  keyId: string
): Promise<{
  timestamp: number
  nonce: string
  signature: string
  keyId: string
}> {
  const timestamp = Date.now()
  const nonce = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36)
  
  const encoder = new TextEncoder()
  const bodyBuffer = encoder.encode(body)
  const hashBuffer = await crypto.subtle.digest('SHA-256', bodyBuffer)
  const bodyHash = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    
  const canonicalString = `${method.toUpperCase()}\n${path}\n${timestamp}\n${nonce}\n${bodyHash}`
  
  const keyData = encoder.encode(ephemeralKey)
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    encoder.encode(canonicalString)
  )
  const signatureArray = Array.from(new Uint8Array(signatureBuffer))
  const signature = btoa(String.fromCharCode.apply(null, signatureArray))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '') // base64url
    
  return { timestamp, nonce, signature, keyId }
}
