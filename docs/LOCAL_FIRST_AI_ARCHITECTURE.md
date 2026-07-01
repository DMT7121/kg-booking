# Local-first AI Architecture

## 1. Quyết định sản phẩm

Ứng dụng phải hỗ trợ người dùng chủ động lưu API key trên thiết bị để gọi thẳng AI provider, giảm độ trễ và không phụ thuộc Google Apps Script (GAS).

Đây là chế độ BYOK (Bring Your Own Key) có chủ đích, không phải chế độ debug. Thứ tự transport mặc định:

1. Local rule engine / exact cache / semantic cache.
2. Gọi trực tiếp AI provider bằng local key.
3. Cloudflare AI Gateway nếu người dùng bật fallback hoặc provider không hỗ trợ CORS.
4. Provider miễn phí nếu được người dùng cho phép.
5. GAS không được nằm trong đường gọi AI.

GAS chỉ còn là đích đồng bộ báo cáo legacy, chạy ngoài critical path.

## 2. Kết quả đối chiếu bản cũ và bản hiện tại

### Điểm nên giữ từ `C:\Users\Admin\Desktop\kg-booking old`

- `useAI.ts` chọn model bằng sự tồn tại thực tế của local key.
- Request đi thẳng từ browser tới provider, không qua GAS.
- Có key rotation, waterfall và race giữa các model.
- UI không phải đợi tải cấu hình key từ backend mới có thể xử lý AI.

### Điểm nên giữ từ bản hiện tại

- Local-first booking analyzer và completeness gate.
- Exact response cache và semantic cache có fingerprint.
- Dynamic prompt profiles và menu candidate retrieval.
- Strict output validation, normalizer và asymmetric race.
- Circuit breaker theo provider/model và optimistic form fill.

### Các regression cần sửa trong bản hiện tại

1. `useConfigStore.ts` lưu plaintext key trong `localStorage`.
2. Thêm/xóa local key tự động gọi GAS để đồng bộ cloud.
3. `autoLoadApiKeys()` kéo key cloud về browser và tiếp tục lưu plaintext.
4. Candidate model lọc theo `keysStatus` từ server, nên local key có thể không được dùng nếu GAS/gateway chưa hydrate.
5. Direct transport bị giới hạn cứng khoảng 3 giây; request provider hợp lệ dễ bị hủy rồi chuyển qua proxy/GAS.
6. Khi key đầu tiên trả 401/403/429, client có thể dừng vòng key quá sớm thay vì phân loại lỗi và thử key/model phù hợp tiếp theo.
7. `VITE_APP_SHARED_SECRET` không phải secret vì được đóng gói vào frontend.

## 3. Local Key Vault

### 3.1. Storage

- Không lưu plaintext key trong `localStorage`, Pinia persisted state, logs hoặc crash report.
- Lưu encrypted envelope trong IndexedDB.
- Mã hóa bằng Web Crypto AES-GCM 256-bit, IV ngẫu nhiên mới cho mỗi lần ghi.
- Không dùng Base64, XOR hoặc obfuscation như một cơ chế mã hóa.
- Key giải mã chỉ tồn tại trong memory khi vault đang unlock.
- Tự lock khi logout, inactivity timeout, tab đóng hoặc người dùng bấm khóa.

### 3.2. Unlock modes

Hỗ trợ hai chế độ và mô tả rõ trade-off trên UI:

- `Device local`: nhanh nhất; dùng non-extractable `CryptoKey` gắn với browser profile. Bảo vệ trước việc đọc file storage thô hoặc copy vault sang máy khác, nhưng không bảo vệ trước mã JavaScript độc hại chạy cùng origin.
- `PIN/passphrase locked`: key vault được mở bằng khóa dẫn xuất từ PIN/passphrase, salt riêng từng vault và tham số được hiệu chỉnh để mất khoảng 150–300 ms trên thiết bị mục tiêu. Không giữ passphrase sau khi derive.

Nếu PIN ngắn được dùng, UI phải cảnh báo đây là bảo vệ thiết bị dùng chung, không chống brute-force ngoại tuyến mạnh như passphrase dài.

### 3.3. Migration

Khi phát hiện `CACHE_KEYS.KEYS` cũ:

1. Không tự gửi key lên server.
2. Yêu cầu người dùng xác nhận import vào vault.
3. Encrypt và đọc kiểm chứng lại.
4. Chỉ sau khi xác nhận thành công mới xóa plaintext khỏi `localStorage`.
5. Xóa key khỏi Pinia snapshots, cache và logs.
6. Migration phải idempotent, có rollback nếu encryption hoặc IndexedDB thất bại.

### 3.4. API tối thiểu

```ts
interface LocalKeyVault {
  initialize(options: VaultSetupOptions): Promise<void>
  unlock(credential?: string): Promise<void>
  lock(): void
  isUnlocked(): boolean
  listMetadata(): Promise<LocalKeyMetadata[]>
  getKeysForProvider(provider: string): Promise<SecretHandle[]>
  addKey(provider: string, rawKey: string, label?: string): Promise<void>
  removeKey(keyId: string): Promise<void>
  markHealth(keyId: string, result: KeyHealthResult): Promise<void>
}
```

Không expose toàn bộ map plaintext keys dưới dạng reactive state. Provider client chỉ nhận key cần dùng ngay trước request.

## 4. AI transport và routing

### 4.1. Tách trạng thái key

Không dùng một `keysStatus` nhập nhằng. Tách thành:

- `localKeyStatus`: lấy từ vault metadata.
- `gatewayProviderStatus`: backend có key hay không, không chứa raw key.
- `providerCapability`: CORS, JSON schema, vision, max payload.
- `keyHealth`: last success, cooldown, failure kind và latency EWMA.

Model khả dụng khi có ít nhất một transport hợp lệ. Local key phải đủ để model được chọn mà không cần gọi GAS.

### 4.2. Transport policy

```ts
type AITransportPolicy =
  | 'local_only'
  | 'local_first'
  | 'gateway_first'
  | 'gateway_only'
```

Mặc định là `local_first`.

Với `local_first`, từng model được xử lý:

1. Lấy một local key khỏe từ vault.
2. Gọi trực tiếp provider.
3. Chỉ fallback gateway cho lỗi network/CORS/timeout hoặc khi local key không tồn tại.
4. Không fallback gateway cho payload/schema sai nếu gateway sẽ gửi lại cùng payload.
5. GAS không phải fallback AI.

### 4.3. Phân loại lỗi

- `401/403`: đánh dấu key hiện tại invalid; thử local key tiếp theo. Không cooldown toàn provider.
- `429`: cooldown key theo `Retry-After`; có thể thử key khác nếu chính sách quota cho phép.
- `404`: cooldown model/endpoint, không khóa toàn provider.
- `400`: lỗi request/capability; không retry cùng payload.
- `5xx`, network, CORS, timeout: thử transport/provider tiếp theo.
- User abort: dừng toàn pipeline, không fallback.

### 4.4. Timeout

Loại bỏ timeout direct cứng 3 giây và total budget 8 giây cho mọi loại tác vụ.

Thiết lập ban đầu:

- Fast text provider: 8 giây.
- Quality text provider: 15 giây.
- Vision/OCR: 30 giây.

Sau đó điều chỉnh theo latency EWMA/p95 quan sát trên chính thiết bị. Mỗi request vẫn phải có AbortController và deadline tổng.

### 4.5. Race

- Chỉ race khi input đủ phức tạp và người dùng cho phép tăng chi phí.
- Ưu tiên race giữa hai provider khác nhau.
- Chỉ kết quả qua validator mới được thắng.
- Hủy request thua ngay khi đã có kết quả hợp lệ.
- Không race nhiều key cùng một provider để né rate limit.

## 5. Loại GAS khỏi critical path

### AI

Local direct hoặc AI Gateway. Không gọi `callAiService` qua GAS.

### Menu và lịch sử

- Render ngay dữ liệu IndexedDB.
- Revalidate nền qua API Worker/Postgres.
- Không chặn form hoặc AI trong khi chờ GAS.

### Lưu booking

1. Ghi local outbox đã mã hóa/tối thiểu PII và cập nhật UI tức thì.
2. Commit vào primary API/transactional database bằng idempotency key.
3. Chỉ đánh dấu `synced` khi primary commit thành công.
4. Đồng bộ Google Sheets bằng Queue/outbox sau commit.
5. GAS/Sheets lỗi không được làm chậm thao tác chính và không được làm mất booking.

### Ảnh

Upload R2 qua authenticated Worker hoặc signed upload URL. Không đưa base64 lớn qua GAS.

## 6. Security controls bắt buộc

Local key không thể được bảo vệ tuyệt đối trước XSS hoặc extension độc hại. Vì vậy phải:

- Bỏ `v-html` cho dữ liệu không tin cậy hoặc sanitize bằng allowlist.
- Thiết lập CSP nghiêm: không inline script, không `unsafe-eval`; `connect-src` chỉ gồm provider được hỗ trợ.
- Self-host asset quan trọng thay vì phụ thuộc script/style CDN không kiểm soát.
- Không log prompt chứa PII hoặc raw key.
- Redact Authorization header khỏi telemetry.
- Không tự động sync local key lên cloud.
- Cloud sync key là tùy chọn riêng, mặc định tắt và cần xác nhận rõ.
- Khi bật cloud key, key chỉ đi tới secret-management endpoint đã xác thực; không trả raw key về client.

## 7. Performance budgets

- Local bypass: p95 dưới 100 ms trên thiết bị mục tiêu.
- Cache hit: p95 dưới 50 ms.
- UI optimistic fill: dưới 150 ms.
- Không có request GAS trong trace của một lần phân tích AI dùng local key.
- Direct AI không có proxy hop khi provider hỗ trợ browser CORS.
- App boot dùng cache không đợi network.
- Vision image được resize/compress trước request; không lưu ảnh base64 vào localStorage.

## 8. Test matrix

- Vault encrypt/decrypt, wrong PIN, lock, migration và corrupted record.
- Xác nhận plaintext key không xuất hiện trong localStorage, logs và serialized Pinia.
- Local key hoạt động khi GAS, Worker gateway và network tới backend đều tắt.
- Candidate model xuất hiện chỉ với local key, không cần `keysStatus` server.
- Key rotation cho 401, 429, 404, timeout và user abort.
- Provider CORS failure chuyển đúng sang gateway mà không qua GAS.
- Race hủy loser và chỉ nhận output qua validator.
- Booking outbox, idempotency, retry, offline/online và reconciliation.
- Retention/purge và encryption-at-rest cho local booking cache/outbox chứa PII.
- Browser E2E trên Chrome/Edge và thiết bị Android mục tiêu.
