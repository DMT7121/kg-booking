# TASKS — PHASE 0: FOUNDATION SAFETY

## Task List & Execution Status

- [x] **TASK-P0-001**: Implement Currency & Timezone Safety Engine
  - **Files**: `src/utils/money.ts`, `src/utils/time.ts`
  - **Tests**: `src/utils/__tests__/money.test.ts` (10 tests passed)
  - **Acceptance Criteria**: Đảm bảo 100% phép tính tiền tệ chính xác từng đồng, không lỗi float, timezone cố định GMT+7.

- [x] **TASK-P0-002**: Implement Feature Flag Management System
  - **Files**: `src/services/featureFlags/featureFlagService.ts`, `src/services/featureFlags/types.ts`, `src/stores/useConfigStore.ts`
  - **Tests**: `src/services/featureFlags/__tests__/featureFlagService.test.ts` (4 tests passed)
  - **Acceptance Criteria**: Đọc/ghi cờ tính năng an toàn, hỗ trợ 16 feature flags mới, mặc định OFF để bảo vệ production.

- [x] **TASK-P0-003**: Implement Audit Logging Infrastructure & Local Store
  - **Files**: `src/services/audit/auditService.ts`, `src/services/audit/types.ts`
  - **Tests**: `src/services/audit/__tests__/auditService.test.ts` (3 tests passed)
  - **Acceptance Criteria**: Lưu vết thay đổi có trước/sau, actor, timestamp, source, correlationId.

- [x] **TASK-P0-004**: Integrate & Verify Baseline Stability
  - **Commands**: `npx vitest run`, `npm run build`
  - **Acceptance Criteria**: Toàn bộ unit tests (223/223 passing tests, tăng 17 test mới so với baseline 206), build Vite production thành công 0 lỗi.
