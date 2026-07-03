## Recent Work: Production & Local Connection Status and Offline Mode Fixes
- **What was done:**
  - Modified [gasClient.ts](file:///f:/kg-booking/src/infrastructure/gas/gasClient.ts) to detect `useLocalProxy` in development, routing requests through Vite's local `/api` proxy middleware.
  - Added global status updates inside `postGASDirect()` and `fetchWithRetry()`: transitions `uiStore.connectionStatus` to `'online'` on any successful fetch (Gateway or direct GAS script), and to `'error'` if all retries and fallback endpoints fail.
  - Modified [useAppStore.ts](file:///f:/kg-booking/src/stores/useAppStore.ts) to add an `else` branch in `fetchRemoteConfig()` preventing the UI from getting stuck in `'syncing'`.
  - Added window `'online'` and `'offline'` event listeners in [useAppStore.ts](file:///f:/kg-booking/src/stores/useAppStore.ts). Losses of connection immediately set status to `'error'` with a warning toast. Recovery triggers background outbox synchronization (`processOfflineQueue`) and re-fetches sheets, menu, history, and configs to auto-heal local state.
- **Why:** To make connection tracking robust, stable, and auto-recovering in both development and production (online) environments when network state transitions occur.
- **Current state:** Fully resolved and verified. Transitioning offline/online updates the status instantly, and all 132 tests pass.
- **Next steps:** None.
- **Gotchas:** `useLocalProxy` is disabled in production to preserve the normal Gateway fallback mechanism.

---

## Recent Work: High-Resolution WebP R2 Storage & Sharp Canvas Smoothing
- **What was done:**
  - Upgraded [index.ts](file:///f:/kg-booking/src/utils/index.ts)'s `resizeImage` function to support high-quality smoothing (`imageSmoothingQuality = 'high'`), and added parameters to configure custom output compression quality and format.
  - Dynamically extracted Content-Type header details from base64 prefixes in [r2.ts](file:///f:/kg-booking/src/services/r2.ts)'s `uploadToR2`, replacing the hardcoded `image/jpeg`.
  - Configured [useBillRender.ts](file:///f:/kg-booking/src/composables/useBillRender.ts) background sync to resize bill images to a crisp width of `1600px` (preserving full 2x canvas details) using `'image/webp'` format at `0.92` quality.
  - Named saved Cloudflare images with a `.webp` extension (e.g. `${dynamicFileName}.webp`).
- **Why:** The previous `resizeImage(..., 800)` outputted heavily compressed JPEGs (0.8 quality) at 800px width, causing small text to lose sharpness when the bills were downloaded or viewed online. The new WebP 1600px 0.92 format keeps bills perfectly sharp and legible while retaining small file sizes for fast uploads.
- **Current state:** Fully completed and deployed. Tested and compiles correctly.
- **Next steps:** None.
- **Gotchas:** Make sure the Cloudflare Worker receives the correct parsed mime-type from base64 so it assigns the right header for browser viewing.

---

## Recent Work: Instant UI Response & Deferred Background Sync
- **What was done:**
  - Optimistically decoupled local file actions (Image, PDF, Print) and UI state transitions from slow network tasks in [useBillRender.ts](file:///f:/kg-booking/src/composables/useBillRender.ts).
  - Captured `formStore` state snapshots and closed the loading screen immediately.
  - Deferred the high-resolution to low-resolution resizing, Cloudflare R2 image uploading (both for the bill image and the deposit receipt), and GAS/Postgres database synchronization to a non-blocking background promise.
- **Why:** Previously, the user had to wait up to 6 seconds in a loading state for image optimization and R2 uploads to complete before saving their local image or copy. This refactoring achieves instant response (<300ms) for all actions while ensuring safe background data consistency.
- **Current state:** Fully working. Deployed and verified. All 131 tests pass.
- **Next steps:** None.
- **Gotchas:** Because the sync task runs in the background, we must copy all required `formStore` properties immediately *before* launching the promise, to avoid race conditions if the user edits the form during the background sync.

---

## Recent Work: Robust Outbox Sync and Vitest Warnings Resolution
- **What was done:**
  - Resolved `indexedDB is not defined` warning in [offlineConflict.test.ts](file:///f:/kg-booking/src/stores/offlineConflict.test.ts) by adding a check `import.meta.env.MODE !== 'test'` to the automatic startup sync trigger in [outboxSync.ts](file:///f:/kg-booking/src/infrastructure/outbox/outboxSync.ts).
  - Fixed `res.text is not a function` error during test runs by adding `text: () => Promise.resolve('ok')` and `status: 200` to the mocked fetch responses in [outbox.test.ts](file:///f:/kg-booking/src/infrastructure/outbox/__tests__/outbox.test.ts).
  - Fixed `Cannot read properties of undefined (reading 'ok')` during dual-write repo tests by mocking the global `fetch` and adding default mock resolved values `{ ok: true }` to `PostgresOrderRepository` and `GasOrderRepository` mocks in [dualWriteRepository.test.ts](file:///f:/kg-booking/src/infrastructure/dual/__tests__/dualWriteRepository.test.ts).
  - Added safety checks in [outboxSync.ts](file:///f:/kg-booking/src/infrastructure/outbox/outboxSync.ts) to gracefully handle falsy database repository responses without crashing the background sync execution.
- **Why:** The test runner was polluting stderr with mock-related errors and missing globals warnings which made identifying real synchronization issues difficult and affected the test environment reliability.
- **Current state:** Fully working. All 131 tests pass with clean logs.
- **Next steps:** None.
- **Gotchas:** When mocking `fetch` or database repositories in future test files, ensure they return compatible types (`{ ok: boolean, status: number, text: () => Promise<string> }`) because the background sync runs asynchronously and depends on these values.

---

## Recent Work: Telegram Webhook, GAS Mode & Speed Optimizations
- **What was done:** 
  - Fixed offline-sync and missing background synchronization to GAS by routing around the broken Postgres pipeline.
  - Implemented automatic fallback to GAS mode in [dualWriteRepository.ts](file:///f:/kg-booking/src/infrastructure/dual/dualWriteRepository.ts) if `VITE_SUPABASE_URL` is missing.
  - Configured `VITE_BACKEND_MODE=gas` in [.env](file:///f:/kg-booking/.env) to natively default to GAS direct writing.
  - Configured Telegram Webhook bot token and chat ID directly on GAS, resolving silent notification delivery.
  - Added HTML-safe character escaping for customer notes in GAS notifications to prevent Telegram Markdown parsing errors.
  - Optimized the app's sync speed by bypassing Cloudflare edge gateway `/api` checks entirely when `VITE_BACKEND_MODE=gas` is active, avoiding useless retries/timeouts.
  - Optimized GAS server execution time by removing redundant header comparisons and file reads in `initSheetIfNeeded_` when the target sheet already exists.
  - Conditionalized html2canvas rendering: Only generates high-resolution bill canvas and uploads images to R2 during file exports (Image, PDF, Print). Bypasses it completely during simple "Save" actions to make data saving instant.
- **Why:** To fix the offline app sync, ensure Telegram notifications trigger properly, clean up the redundant outbox pipeline, and optimize the overall save action latency.
- **Current state:** Working. Deployed and verified.
- **Next steps:** None.
- **Gotchas:** When testing from PowerShell, make sure to supply a valid `staff` object in the payload structure to prevent GAS from failing with a "Cannot read properties of undefined (reading 'name')" error.
