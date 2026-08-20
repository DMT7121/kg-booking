# TASKS — PHASE 2: PARTY EXECUTION

## Task List & Execution Status

- [x] **TASK-P2-001**: Implement Party / BEO Lifecycle & Update Tracking Engine
  - **Files**: `src/domain/party/beoEngine.ts`
  - **Tests**: `src/domain/party/__tests__/beoEngine.test.ts` (2 tests passed)
  - **Acceptance Criteria**: Chuyển booking thành BEO hoàn chỉnh, theo dõi 6 trạng thái lifecycle và tự động phát hiện thay đổi sau khi đã phân phối (Distributed).

- [x] **TASK-P2-002**: Implement Kitchen Ticket & Station Routing Engine
  - **Files**: `src/domain/party/kitchenTicket.ts`
  - **Tests**: `src/domain/party/__tests__/kitchenTicket.test.ts` (2 tests passed)
  - **Acceptance Criteria**: Phân loại chính xác 100% các món ăn về 4 trạm bếp (Grill, Hotpot/Stir, Cold Seafood, General) và quản lý tiến độ chuẩn bị món.

- [x] **TASK-P2-003**: Implement Decor Ticket Engine & Party Checklist
  - **Files**: `src/domain/party/decorTicket.ts`
  - **Tests**: `src/domain/party/__tests__/decorTicket.test.ts` (2 tests passed)
  - **Acceptance Criteria**: Quản lý chi tiết hoa tươi, bóng bay, bảng mừng, gương viết và thời gian phục vụ bánh kem.

- [x] **TASK-P2-004**: Implement Deterministic Deposit Reconciliation Engine
  - **Files**: `src/domain/deposit/reconciliationEngine.ts`
  - **Tests**: `src/domain/deposit/__tests__/reconciliationEngine.test.ts` (3 tests passed)
  - **Acceptance Criteria**: So khớp tiền cọc và giao dịch chuyển khoản ngân hàng/VietQR với 4 trạng thái (`MATCHED`, `PROBABLE_MATCH`, `AMBIGUOUS`, `UNMATCHED`).

- [x] **TASK-P2-005**: Build Departmental UI Boards (KitchenBoard, DecorBoard, DepositReconciliationModal)
  - **Files**: `src/components/operations/KitchenBoard.vue`, `src/components/operations/DecorBoard.vue`, `src/components/operations/DepositReconciliationModal.vue`
  - **Acceptance Criteria**: Giao diện KDS bếp theo ca/trạm, bảng quản trị trang trí tiệc và modal đối soát tiền cọc.

- [x] **TASK-P2-006**: Regression Verification & Build Hardening
  - **Commands**: `npx vitest run`, `npm run build`
  - **Acceptance Criteria**: Toàn bộ unit tests (243/243 passing tests, bảo toàn baseline 206 ban đầu) pass 100%, build Vite production sạch không lỗi.
