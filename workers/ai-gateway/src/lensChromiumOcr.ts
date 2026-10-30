/**
 * Chromium Google Lens Overlay Protobuf OCR Engine (Zero-dependency V8/Edge implementation)
 *
 * Protocol adapted from MIT-licensed `bropines/chrome-lens-py` (commit 9ea5b6c):
 * https://github.com/bropines/chrome-lens-py
 *
 * Encodes a `lens.LensOverlayServerRequest` (`objects_request` with `SURFACE_CHROMIUM` +
 * `PLATFORM_WEB` + `RENDERING_ENV_LENS_OVERLAY` + `AUTO_FILTER`) to
 * `https://lensfrontend-pa.googleapis.com/v1/crupload` and decodes
 * `lens.LensOverlayServerResponse` (`objects_response.text.text_layout`) into clean UTF-8 lines.
 */

export const LENS_CRUPLOAD_ENDPOINT = 'https://lensfrontend-pa.googleapis.com/v1/crupload'
export const LENS_CHROMIUM_API_KEY = 'AIzaSyDr2UxVnv_U85AbhhY8XSHSIavUW0DC-sY'
export const LENS_CHROMIUM_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

export interface LensOcrInput {
  imageBytes: Uint8Array
  width: number
  height: number
  mimeType?: string
  language?: string
  region?: string
  timeZone?: string
}

export interface LensOcrDecodedResult {
  serverError: number
  lines: string[]
  text: string
}

function encodeVarint(val: number | bigint): Uint8Array {
  let v = typeof val === 'bigint' ? val : BigInt(val >>> 0)
  const out: number[] = []
  while (v >= 0x80n) {
    out.push(Number((v & 0x7fn) | 0x80n))
    v >>= 7n
  }
  out.push(Number(v))
  return Uint8Array.from(out)
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  let total = 0
  for (const a of arrays) total += a.length
  const res = new Uint8Array(total)
  let offset = 0
  for (const a of arrays) {
    res.set(a, offset)
    offset += a.length
  }
  return res
}

function writeVarintField(fieldNo: number, val: number | bigint): Uint8Array {
  return concatBytes(encodeVarint((fieldNo << 3) | 0), encodeVarint(val))
}

function writeBytesField(fieldNo: number, bytes: Uint8Array): Uint8Array {
  return concatBytes(encodeVarint((fieldNo << 3) | 2), encodeVarint(bytes.length), bytes)
}

function writeStringField(fieldNo: number, str: string): Uint8Array {
  if (!str) return new Uint8Array(0)
  const bytes = new TextEncoder().encode(str)
  return writeBytesField(fieldNo, bytes)
}

export function buildLensOcrRequest(input: LensOcrInput): Uint8Array {
  const width = Math.max(1, Math.round(input.width || 1000))
  const height = Math.max(1, Math.round(input.height || 1000))
  const mimeType = input.mimeType && input.mimeType !== 'image/jpeg' ? input.mimeType : ''

  const randHi = BigInt(Math.floor(Math.random() * 0x7fffffff))
  const randLo = BigInt(Math.floor(Math.random() * 0xffffffff))
  const uuid = (randHi << 32n) | randLo
  const timeUsec = BigInt(Date.now()) * 1000n

  // lens.LensOverlayRequestId
  const requestId = concatBytes(
    writeVarintField(1, uuid),
    writeVarintField(2, 1), // sequence_id = 1
    writeVarintField(3, 1), // image_sequence_id = 1
    writeVarintField(7, timeUsec),
    mimeType ? writeStringField(13, mimeType) : new Uint8Array(0)
  )

  // lens.LocaleContext
  const localeContext = concatBytes(
    writeStringField(1, input.language || ''),
    writeStringField(2, input.region || 'VN'),
    writeStringField(3, input.timeZone || 'Asia/Ho_Chi_Minh')
  )

  // lens.AppliedFilters -> filter: [{ filter_type: AUTO_FILTER (7) }]
  const appliedFilter = writeVarintField(1, 7)
  const clientFilters = writeBytesField(1, appliedFilter)

  // lens.RenderingContext -> rendering_environment: RENDERING_ENV_LENS_OVERLAY (14)
  const renderingContext = writeVarintField(2, 14)

  // lens.LensOverlayClientContext
  const clientContext = concatBytes(
    writeVarintField(1, 3), // PLATFORM_WEB = 3
    writeVarintField(2, 4), // SURFACE_CHROMIUM = 4
    writeBytesField(4, localeContext),
    writeBytesField(17, clientFilters),
    writeBytesField(20, renderingContext)
  )

  // lens.LensOverlayRequestContext (request_id = 3, client_context = 4)
  const requestContext = concatBytes(
    writeBytesField(3, requestId),
    writeBytesField(4, clientContext)
  )

  // lens.ImageData (payload = 1 { image_bytes = 1 }, image_metadata = 3 { width = 1, height = 2 })
  const imagePayload = writeBytesField(1, input.imageBytes)
  const imageMetadata = concatBytes(writeVarintField(1, width), writeVarintField(2, height))
  const imageData = concatBytes(writeBytesField(1, imagePayload), writeBytesField(3, imageMetadata))

  // lens.LensOverlayObjectsRequest (request_context = 1, image_data = 3)
  const objectsRequest = concatBytes(
    writeBytesField(1, requestContext),
    writeBytesField(3, imageData)
  )

  // lens.LensOverlayServerRequest (objects_request = 1)
  return writeBytesField(1, objectsRequest)
}

function readVarint(buf: Uint8Array, pos: number): { val: bigint; pos: number } {
  let result = 0n
  let shift = 0n
  while (pos < buf.length) {
    const b = buf[pos++]
    result |= BigInt(b & 0x7f) << shift
    if ((b & 0x80) === 0) return { val: result, pos }
    shift += 7n
  }
  throw new Error('Truncated protobuf varint')
}

function skipField(buf: Uint8Array, pos: number, wireType: number): number {
  if (wireType === 0) return readVarint(buf, pos).pos
  if (wireType === 1) return pos + 8
  if (wireType === 2) {
    const { val, pos: p2 } = readVarint(buf, pos)
    return p2 + Number(val)
  }
  if (wireType === 5) return pos + 4
  throw new Error(`Unsupported protobuf wire type: ${wireType}`)
}

function iterateFields(
  buf: Uint8Array,
  cb: (fieldNo: number, wireType: number, val: Uint8Array | bigint) => void
): void {
  let pos = 0
  while (pos < buf.length) {
    const { val: tag, pos: p1 } = readVarint(buf, pos)
    const fieldNo = Number(tag >> 3n)
    const wireType = Number(tag & 7n)
    if (wireType === 2) {
      const { val: len, pos: p2 } = readVarint(buf, p1)
      const end = Math.min(buf.length, p2 + Number(len))
      cb(fieldNo, wireType, buf.subarray(p2, end))
      pos = end
    } else if (wireType === 0) {
      const { val, pos: p2 } = readVarint(buf, p1)
      cb(fieldNo, wireType, val)
      pos = p2
    } else {
      pos = skipField(buf, p1, wireType)
    }
  }
}

export function decodeLensOcrResponse(buf: Uint8Array): LensOcrDecodedResult {
  const decoder = new TextDecoder()
  const lines: string[] = []
  let serverError = 0

  iterateFields(buf, (fServer, wtServer, vServer) => {
    if (fServer === 1 && wtServer === 2 && vServer instanceof Uint8Array) {
      iterateFields(vServer, (fErr, wtErr, vErr) => {
        if (fErr === 1 && wtErr === 0 && typeof vErr === 'bigint') {
          serverError = Number(vErr)
        }
      })
    }
    if (fServer === 2 && wtServer === 2 && vServer instanceof Uint8Array) {
      iterateFields(vServer, (fObj, wtObj, vObj) => {
        if (fObj === 3 && wtObj === 2 && vObj instanceof Uint8Array) {
          iterateFields(vObj, (fText, wtText, vText) => {
            if (fText === 1 && wtText === 2 && vText instanceof Uint8Array) {
              iterateFields(vText, (fLayout, wtLayout, vLayout) => {
                if (fLayout === 1 && wtLayout === 2 && vLayout instanceof Uint8Array) {
                  iterateFields(vLayout, (fPara, wtPara, vPara) => {
                    if (fPara === 2 && wtPara === 2 && vPara instanceof Uint8Array) {
                      const wordParts: Array<{ plainText: string; hasSep: boolean; sep: string }> = []
                      iterateFields(vPara, (fLine, wtLine, vLine) => {
                        if (fLine === 1 && wtLine === 2 && vLine instanceof Uint8Array) {
                          let plainText = ''
                          let hasSep = false
                          let sep = ''
                          iterateFields(vLine, (fWord, wtWord, vWord) => {
                            if (fWord === 2 && wtWord === 2 && vWord instanceof Uint8Array) {
                              plainText = decoder.decode(vWord)
                            }
                            if (fWord === 3 && wtWord === 2 && vWord instanceof Uint8Array) {
                              hasSep = true
                              sep = decoder.decode(vWord)
                            }
                          })
                          wordParts.push({ plainText, hasSep, sep })
                        }
                      })
                      if (wordParts.length > 0) {
                        const lineStr = wordParts
                          .map((w, idx) =>
                            w.plainText + (w.hasSep ? w.sep : idx < wordParts.length - 1 ? ' ' : '')
                          )
                          .join('')
                          .trim()
                        if (lineStr) lines.push(lineStr)
                      }
                    }
                  })
                }
              })
            }
          })
        }
      })
    }
  })

  return { serverError, lines, text: lines.join('\n') }
}

export function decodeBase64ImagePayload(imageBase64: string): {
  bytes: Uint8Array
  mimeType: string
} {
  let rawB64 = imageBase64.trim()
  let mimeType = 'image/jpeg'
  if (rawB64.startsWith('data:')) {
    const commaIdx = rawB64.indexOf(',')
    if (commaIdx !== -1) {
      const header = rawB64.slice(5, commaIdx)
      const detectedMime = header.split(';')[0]?.trim()
      if (detectedMime) mimeType = detectedMime
      rawB64 = rawB64.slice(commaIdx + 1)
    }
  }
  const binary = atob(rawB64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return { bytes, mimeType }
}

export function inferImageDimensions(
  bytes: Uint8Array,
  fallbackWidth = 1000,
  fallbackHeight = 1000
): { width: number; height: number } {
  // PNG IHDR
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return {
      width: view.getUint32(16, false) || fallbackWidth,
      height: view.getUint32(20, false) || fallbackHeight
    }
  }
  // JPEG SOF0 / SOF2
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset++
        continue
      }
      const marker = bytes[offset + 1]
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        const height = (bytes[offset + 5] << 8) | bytes[offset + 6]
        const width = (bytes[offset + 7] << 8) | bytes[offset + 8]
        if (width > 0 && height > 0) return { width, height }
        break
      }
      if (marker === 0xd8 || marker === 0xd9) {
        offset += 2
        continue
      }
      const segLen = (bytes[offset + 2] << 8) | bytes[offset + 3]
      if (segLen < 2) break
      offset += 2 + segLen
    }
  }
  return { width: fallbackWidth, height: fallbackHeight }
}

export async function executeChromiumLensOcr(params: {
  imageBase64: string
  width?: number
  height?: number
  language?: string
  timeoutMs?: number
}): Promise<{
  ok: boolean
  text: string
  lines: string[]
  latencyMs: number
  engine: 'google-lens-chromium'
  error?: string
}> {
  const t0 = Date.now()
  const { bytes, mimeType } = decodeBase64ImagePayload(params.imageBase64)
  const inferred = inferImageDimensions(bytes)
  const width = params.width && params.width > 0 ? params.width : inferred.width
  const height = params.height && params.height > 0 ? params.height : inferred.height

  const protobufBody = buildLensOcrRequest({
    imageBytes: bytes,
    width,
    height,
    mimeType,
    language: params.language || ''
  })

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), params.timeoutMs ?? 2800)

  try {
    const res = await fetch(LENS_CRUPLOAD_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-protobuf',
        'X-Goog-Api-Key': LENS_CHROMIUM_API_KEY,
        'User-Agent': LENS_CHROMIUM_USER_AGENT,
        'Accept-Encoding': 'gzip, deflate',
        Accept: '*/*'
      },
      body: protobufBody as unknown as BodyInit,
      signal: controller.signal
    })

    if (!res.ok) {
      return {
        ok: false,
        text: '',
        lines: [],
        latencyMs: Date.now() - t0,
        engine: 'google-lens-chromium',
        error: `Lens upstream HTTP ${res.status}`
      }
    }

    const resBytes = new Uint8Array(await res.arrayBuffer())
    const decoded = decodeLensOcrResponse(resBytes)
    if (decoded.serverError !== 0) {
      return {
        ok: false,
        text: '',
        lines: [],
        latencyMs: Date.now() - t0,
        engine: 'google-lens-chromium',
        error: `Lens server error code ${decoded.serverError}`
      }
    }

    return {
      ok: true,
      text: decoded.text,
      lines: decoded.lines,
      latencyMs: Date.now() - t0,
      engine: 'google-lens-chromium'
    }
  } catch (err: any) {
    return {
      ok: false,
      text: '',
      lines: [],
      latencyMs: Date.now() - t0,
      engine: 'google-lens-chromium',
      error: err?.name === 'AbortError' ? 'Lens OCR timeout' : err?.message || String(err)
    }
  } finally {
    clearTimeout(timeoutId)
  }
}
