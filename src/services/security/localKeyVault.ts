import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval'

const ENVELOPE_KEY = 'kg_vault_envelope'
const DEVICE_KEY_KEY = 'kg_vault_device_key'
const METADATA_KEY = 'kg_vault_metadata'

export interface KeyVaultEnvelope {
  ciphertext: ArrayBuffer
  iv: Uint8Array
  salt?: Uint8Array
  mode: 'device' | 'passphrase'
}

export interface LocalKeyMetadata {
  provider: string
  count: number
  maskedList: string[]
}

export function maskApiKey(key: string): string {
  if (!key) return ''
  if (key === 'free') return 'free...free'
  if (key.length <= 8) return '••••••••'
  return `${key.substring(0, 4)}••••••••${key.substring(key.length - 4)}`
}

// In-memory active decrypted state
let decryptedKeys: Record<string, string[]> | null = null
let activeCryptoKey: CryptoKey | null = null
let currentUnlockMode: 'device' | 'passphrase' | null = null
let inactivityTimer: any = null
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

function resetInactivityTimer() {
  if (inactivityTimer) {
    clearTimeout(inactivityTimer)
  }
  inactivityTimer = setTimeout(() => {
    lock()
    console.info('[Vault] Auto-locked due to inactivity')
  }, INACTIVITY_TIMEOUT_MS)
}

function clearInactivityTimer() {
  if (inactivityTimer) {
    clearTimeout(inactivityTimer)
    inactivityTimer = null
  }
}

// Listen to activities to reset lock timer
if (typeof window !== 'undefined') {
  const events = ['mousemove', 'keypress', 'mousedown', 'touchstart']
  events.forEach(e => {
    window.addEventListener(e, () => {
      if (isUnlocked()) {
        resetInactivityTimer()
      }
    })
  })
}

// Web Crypto derivations
async function deriveKeyFromPassphrase(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    true, // Must be extractable to support sessionStorage persistence on page reload
    ['encrypt', 'decrypt']
  )
}

async function generateDeviceKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // Must be extractable to support sessionStorage persistence on page reload
    ['encrypt', 'decrypt']
  )
}

async function encryptData(data: string, key: CryptoKey): Promise<{ ciphertext: ArrayBuffer; iv: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoder = new TextEncoder()
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(data)
  )
  return { ciphertext, iv }
}

async function decryptData(ciphertext: ArrayBuffer, iv: Uint8Array, key: CryptoKey): Promise<string> {
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  )
  const decoder = new TextDecoder()
  return decoder.decode(decrypted)
}

export async function isVaultInitialized(): Promise<boolean> {
  const env = await idbGet<KeyVaultEnvelope>(ENVELOPE_KEY)
  return !!env
}

export function isUnlocked(): boolean {
  return decryptedKeys !== null && activeCryptoKey !== null
}

export function getUnlockMode(): 'device' | 'passphrase' | null {
  return currentUnlockMode
}

export async function getMetadata(): Promise<Record<string, LocalKeyMetadata>> {
  return (await idbGet<Record<string, LocalKeyMetadata>>(METADATA_KEY)) || {}
}

export async function initialize(mode: 'device' | 'passphrase', credential?: string): Promise<void> {
  if (await isVaultInitialized()) {
    throw new Error('Vault is already initialized')
  }

  let cryptoKey: CryptoKey
  let salt: Uint8Array | undefined

  if (mode === 'device') {
    cryptoKey = await generateDeviceKey()
    await idbSet(DEVICE_KEY_KEY, cryptoKey)
  } else {
    if (!credential) {
      throw new Error('PIN/Passphrase is required for passphrase locked mode')
    }
    salt = crypto.getRandomValues(new Uint8Array(16))
    cryptoKey = await deriveKeyFromPassphrase(credential, salt)
  }

  // Save empty keys initially
  decryptedKeys = {}
  activeCryptoKey = cryptoKey
  currentUnlockMode = mode

  // Cache in sessionStorage to persist reload
  if (typeof sessionStorage !== 'undefined') {
    if (mode === 'device') {
      sessionStorage.setItem('kg_vault_session_key', 'device')
    } else {
      const rawKey = await crypto.subtle.exportKey('raw', cryptoKey)
      const hexKey = Array.from(new Uint8Array(rawKey))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
      sessionStorage.setItem('kg_vault_session_key', hexKey)
    }
  }

  const { ciphertext, iv } = await encryptData(JSON.stringify(decryptedKeys), cryptoKey)
  const envelope: KeyVaultEnvelope = {
    ciphertext,
    iv,
    salt,
    mode
  }
  await idbSet(ENVELOPE_KEY, envelope)
  await updateMetadata()
  resetInactivityTimer()
}

export async function unlock(credential?: string): Promise<void> {
  const envelope = await idbGet<KeyVaultEnvelope>(ENVELOPE_KEY)
  if (!envelope) {
    throw new Error('Vault not initialized')
  }

  let cryptoKey: CryptoKey
  if (envelope.mode === 'device') {
    const devKey = await idbGet<CryptoKey>(DEVICE_KEY_KEY)
    if (!devKey) {
      throw new Error('Device local key missing in IndexedDB')
    }
    cryptoKey = devKey
  } else {
    if (!credential) {
      throw new Error('PIN/Passphrase is required to unlock this vault')
    }
    if (!envelope.salt) {
      throw new Error('Vault envelope corrupted (missing salt)')
    }
    cryptoKey = await deriveKeyFromPassphrase(credential, envelope.salt)
  }

  try {
    const rawJson = await decryptData(envelope.ciphertext, envelope.iv, cryptoKey)
    decryptedKeys = JSON.parse(rawJson)
    activeCryptoKey = cryptoKey
    currentUnlockMode = envelope.mode
    resetInactivityTimer()

    // Cache the unlock key in sessionStorage to persist reload
    if (typeof sessionStorage !== 'undefined') {
      if (envelope.mode === 'device') {
        sessionStorage.setItem('kg_vault_session_key', 'device')
      } else {
        const rawKey = await crypto.subtle.exportKey('raw', cryptoKey)
        const hexKey = Array.from(new Uint8Array(rawKey))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('')
        sessionStorage.setItem('kg_vault_session_key', hexKey)
      }
    }
  } catch (e) {
    throw new Error('Mật khẩu mở khóa không chính xác hoặc dữ liệu bị hỏng')
  }
}

export async function tryAutoUnlockFromSession(): Promise<boolean> {
  if (isUnlocked()) return true
  if (typeof sessionStorage === 'undefined') return false
  const cached = sessionStorage.getItem('kg_vault_session_key')
  if (!cached) return false

  const envelope = await idbGet<KeyVaultEnvelope>(ENVELOPE_KEY)
  if (!envelope) return false

  try {
    let cryptoKey: CryptoKey
    if (cached === 'device') {
      const devKey = await idbGet<CryptoKey>(DEVICE_KEY_KEY)
      if (!devKey) return false
      cryptoKey = devKey
    } else {
      const len = cached.length / 2
      const bytes = new Uint8Array(len)
      for (let i = 0; i < len; i++) {
        bytes[i] = parseInt(cached.substring(i * 2, i * 2 + 2), 16)
      }
      cryptoKey = await crypto.subtle.importKey(
        'raw',
        bytes.buffer,
        { name: 'AES-GCM' },
        true,
        ['encrypt', 'decrypt']
      )
    }

    const rawJson = await decryptData(envelope.ciphertext, envelope.iv, cryptoKey)
    decryptedKeys = JSON.parse(rawJson)
    activeCryptoKey = cryptoKey
    currentUnlockMode = envelope.mode
    resetInactivityTimer()
    return true
  } catch (e) {
    sessionStorage.removeItem('kg_vault_session_key')
    return false
  }
}

export function lock(): void {
  decryptedKeys = null
  activeCryptoKey = null
  currentUnlockMode = null
  clearInactivityTimer()
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem('kg_vault_session_key')
  }
}

export async function getKeysForProvider(provider: string): Promise<string[]> {
  if (!isUnlocked()) {
    throw new Error('Vault is locked')
  }
  return decryptedKeys?.[provider] || []
}

export async function addKey(provider: string, rawKey: string): Promise<void> {
  if (!isUnlocked() || !activeCryptoKey || !decryptedKeys) {
    throw new Error('Vault is locked')
  }

  if (!decryptedKeys[provider]) {
    decryptedKeys[provider] = []
  }

  if (decryptedKeys[provider].includes(rawKey)) {
    return // Skip duplicate
  }

  decryptedKeys[provider].push(rawKey)
  await saveVaultState()
}

export async function removeKey(provider: string, index: number): Promise<void> {
  if (!isUnlocked() || !activeCryptoKey || !decryptedKeys) {
    throw new Error('Vault is locked')
  }

  if (decryptedKeys[provider] && decryptedKeys[provider][index] !== undefined) {
    decryptedKeys[provider].splice(index, 1)
    await saveVaultState()
  }
}

async function saveVaultState(): Promise<void> {
  if (!activeCryptoKey || !decryptedKeys) return

  const envelope = await idbGet<KeyVaultEnvelope>(ENVELOPE_KEY)
  if (!envelope) return

  const { ciphertext, iv } = await encryptData(JSON.stringify(decryptedKeys), activeCryptoKey)
  const updatedEnvelope: KeyVaultEnvelope = {
    ...envelope,
    ciphertext,
    iv
  }
  await idbSet(ENVELOPE_KEY, updatedEnvelope)
  await updateMetadata()
}

async function updateMetadata(): Promise<void> {
  if (!decryptedKeys) return

  const metadata: Record<string, LocalKeyMetadata> = {}
  Object.keys(decryptedKeys).forEach(provider => {
    const list = decryptedKeys![provider] || []
    metadata[provider] = {
      provider,
      count: list.length,
      maskedList: list.map(maskApiKey)
    }
  })
  await idbSet(METADATA_KEY, metadata)
}

export async function purgeVault(): Promise<void> {
  lock()
  await idbDel(ENVELOPE_KEY)
  await idbDel(DEVICE_KEY_KEY)
  await idbDel(METADATA_KEY)
}
