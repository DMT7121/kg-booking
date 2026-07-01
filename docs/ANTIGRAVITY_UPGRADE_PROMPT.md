# Prompt giao Antigravity: Local-first AI và backend không phụ thuộc GAS

Hãy nâng cấp trực tiếp repository `F:\kg-booking`. Trước khi sửa, đọc đầy đủ:

- `docs/LOCAL_FIRST_AI_ARCHITECTURE.md`
- `docs/SECURITY_ROADMAP.md`
- `docs/BACKEND_MIGRATION_PLAN.md`
- `docs/architecture/enterprise-upgrade-plan.md`

Tham khảo hành vi direct-call đơn giản trong:

- `C:\Users\Admin\Desktop\kg-booking old\src\composables\useAI.ts`
- `C:\Users\Admin\Desktop\kg-booking old\src\stores\useConfigStore.ts`

Không copy nguyên code cũ. Bản hiện tại phải giữ local rule engine, exact/semantic cache, dynamic prompt, menu retrieval, validator, normalizer, circuit breaker và asymmetric race.

## Mục tiêu không được thay đổi

1. Người dùng được lưu API key cục bộ trên browser để gọi AI provider trực tiếp.
2. `local_first` là mặc định; local key phải hoạt động kể cả GAS và AI Gateway đều tắt.
3. GAS không nằm trong critical path của AI, menu load, booking save hoặc image upload.
4. Không lưu plaintext key trong localStorage và không tự đồng bộ local key lên cloud.
5. Không được hy sinh tính đúng đắn dữ liệu để đổi lấy cảm giác nhanh.

## P0 — Local Key Vault

1. Tạo module key vault độc lập dùng IndexedDB + Web Crypto AES-GCM.
2. Hỗ trợ `device local` và `PIN/passphrase locked`.
3. Decrypted key chỉ sống trong memory; tự lock khi logout/inactivity.
4. Viết migration idempotent từ `CACHE_KEYS.KEYS` plaintext sang encrypted vault; chỉ xóa plaintext sau verify thành công.
5. Pinia chỉ giữ metadata/masked key, không giữ raw key reactive.
6. Xóa hành vi tự gọi `saveApiKeyToCloud` khi thêm key.
7. Xóa `autoLoadApiKeys()` kéo raw cloud keys về browser.
8. Cloud sync key nếu còn phải là tính năng opt-in riêng, mặc định OFF.

## P0 — Sửa AI routing

1. Tách `localKeyStatus` khỏi `gatewayProviderStatus`.
2. Candidate model phải khả dụng nếu vault có local key, không phụ thuộc hydrate từ GAS.
3. Tạo provider adapters typed cho Gemini và các OpenAI-compatible providers.
4. Thêm transport policy:
   - `local_only`
   - `local_first` mặc định
   - `gateway_first`
   - `gateway_only`
5. Trong `local_first`: local direct → Worker gateway khi cần → provider miễn phí nếu opt-in. Không fallback GAS.
6. Sửa key rotation:
   - 401/403 thử key tiếp theo.
   - 429 tôn trọng Retry-After và cooldown key.
   - 404 cooldown model.
   - 400 không retry cùng payload.
   - network/CORS/5xx/timeout đổi transport/provider.
   - user abort dừng ngay.
7. Bỏ hard timeout direct 3 giây/total 8 giây dùng chung. Dùng deadline theo loại model và latency history.
8. Race chỉ chấp nhận output qua validator và phải abort loser.

## P0 — Loại GAS khỏi critical path

1. AI không gọi GAS.
2. Menu/history render từ IndexedDB rồi SWR qua Worker/Postgres.
3. Booking save ghi local outbox, commit primary database bằng idempotency key, sau đó mới sync Sheets qua Queue/outbox.
4. Không trả success giả trước primary commit.
5. Image upload thẳng R2 qua authenticated Worker/signed URL, không gửi base64 qua GAS.
6. Google Sheets chỉ là reporting sink/legacy fallback có reconciliation.
7. Local outbox/cache chứa PII phải được mã hóa hoặc tối thiểu hóa, có retention và thao tác purge rõ ràng.

## P0 — Security vẫn phải hoàn tất

1. Xóa `admin_bypass`, `ADMINDMT`, `admin123` và mock token production.
2. Enforce authentication/RBAC phía server.
3. Không dùng `VITE_APP_SHARED_SECRET` như bí mật.
4. Enable Supabase RLS và policy tests.
5. Khóa R2 upload/delete/list/cleanup/stats.
6. Bảo vệ GAS history/write/config endpoints trong thời gian migration.
7. Public bill dùng signed opaque token có expiry và DTO tối thiểu.
8. Loại `v-html` không an toàn và thêm CSP `connect-src` allowlist cho provider.

## P1 — Data correctness

1. Chọn primary database duy nhất.
2. Thêm optimistic concurrency/CAS; version mismatch trả 409.
3. Chống double-booking bằng transaction/constraint backend.
4. Sửa `saveOrdersBatch` tuân thủ backend mode.
5. Không trả `ok:true` khi `Promise.allSettled` có lỗi chưa được queue/reconcile.
6. Dùng durable queue/outbox, retry, dead-letter và reconciliation report.

## P1 — Test và CI

1. Unit tests không được có outbound network.
2. Tách benchmark khỏi Vitest mặc định; test không sửa tracked files.
3. Thêm test key vault, migration, transport routing, key rotation, CORS fallback, abort và no-GAS local mode.
4. Thêm integration tests cho RLS, Worker auth, outbox và concurrent booking.
5. CI chạy lint, typecheck, tests, coverage, build và dependency audit.
6. Thêm production build scan bảo đảm raw test key, admin bypass và shared secret không xuất hiện trong bundle.

## Thứ tự triển khai

1. Viết characterization tests cho luồng hiện tại.
2. Tạo key vault và migration nhưng chưa đổi router.
3. Đổi availability/routing sang local-key-aware.
4. Tắt auto cloud sync và loại GAS khỏi AI.
5. Chuyển data path sang local outbox + primary API + async Sheets sink.
6. Hoàn tất server auth/RLS/R2 hardening.
7. Chạy migration, E2E, performance benchmark và security checks.

Mỗi pha phải là commit độc lập, có rollback rõ ràng. Không refactor UI lớn trong cùng commit với migration dữ liệu.

## File plan tối thiểu dự kiến

Antigravity có thể điều chỉnh tên nhưng phải giữ ranh giới module:

- `src/services/security/localKeyVault.ts`: encrypt/decrypt, unlock/lock và key handles.
- `src/services/security/localKeyVaultMigration.ts`: migration plaintext an toàn, idempotent.
- `src/services/ai/providerAdapters/*`: Gemini/OpenAI-compatible request-response adapters và capability metadata.
- `src/services/ai/aiTransportPolicy.ts`: local/gateway selection và error classification.
- `src/services/ai/aiProviderClient.ts`: chỉ orchestration transport; không đọc localStorage/GAS trực tiếp.
- `src/stores/useConfigStore.ts`: chỉ expose masked metadata/status; bỏ auto cloud sync/download.
- `src/components/modals/AiConfigModal.vue`: setup/unlock/lock vault, transport policy và cảnh báo threat model.
- `src/infrastructure/outbox/*`: encrypted booking outbox, retry và sync state.
- `workers/api-gateway/*`: authenticated booking API, R2 authorization và optional AI fallback.
- `supabase/migrations/*`: RLS, constraints, outbox table, idempotency và optimistic concurrency.
- `.env.example`: chỉ thêm non-secret transport flags; tuyệt đối không thêm `VITE_*SECRET`.
- `src/**/__tests__` và Worker integration tests cho toàn bộ acceptance criteria.

Worker implementation phải dùng R2/Queue/service bindings thay vì gọi Cloudflare REST API, generated binding types, config JSONC, compatibility date được kiểm thử và observability với structured logs. Queue consumer phải idempotent vì delivery có thể lặp lại.

## Acceptance criteria

- Thêm local key, reload, unlock vault và gọi AI direct thành công.
- Tắt GAS URL và AI Gateway nhưng local-key AI vẫn hoạt động.
- DevTools Network không có request GAS trong một lần AI local-direct.
- Không có raw key trong localStorage, logs, Pinia snapshot hoặc production bundle.
- Migration không mất key và chạy lặp lại an toàn.
- 401 key A chuyển sang key B; 429 không khóa nhầm toàn provider; user abort không fallback.
- Provider không hỗ trợ CORS mới chuyển Worker gateway, tuyệt đối không chuyển GAS.
- Local bypass/cache phản hồi tức thì và giữ validator hiện tại.
- Offline booking tồn tại trong outbox; online lại sync đúng một lần.
- Secondary Sheets hỏng không làm mất primary booking và có reconciliation.
- Unauthenticated API/R2/Supabase operations trả 401/403.
- Test suite không gọi production và không làm dirty worktree.

Kết thúc công việc, cung cấp:

1. Danh sách file thay đổi.
2. Migration/rollback instructions cho local key vault và database.
3. Security threat model ngắn cho local BYOK.
4. Kết quả test, coverage, build và performance trước/sau.
5. Network trace chứng minh local AI không qua GAS.
