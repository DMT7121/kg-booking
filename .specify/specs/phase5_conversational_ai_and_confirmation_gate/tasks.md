# Tasks - Phase 5: Conversational Vietnamese AI Engine & Interactive Confirmation Gate

- [ ] **Task 5.1: Conversational Vietnamese AI & Distributive Quantifiers**
  - [ ] Implement `resolveDistributiveQuantifiers` in `src/domain/ai/ruleEngine.ts` (e.g. "mỗi món 2 phần", "mỗi loại 1 đĩa", "lẩu 1 phần còn lại 2 phần").
  - [ ] Enhance conversational customer name extraction and dietary note parsing.
  - [ ] Update `BASE_SYSTEM_INSTRUCTIONS` in `src/domain/ai/promptProfiles.ts`.
  - [ ] Add unit tests in `src/domain/ai/__tests__/conversationalVietnamese.test.ts`.

- [ ] **Task 5.2: Missing Content & Completeness Warning Gate**
  - [ ] Implement `auditBookingCompleteness` in `src/domain/booking/bookingCompletenessGate.ts`.
  - [ ] Detect missing phone, missing table for large groups, missing deposit for set menus, unrecorded raw notes.
  - [ ] Add unit tests in `src/domain/booking/__tests__/bookingCompletenessGate.test.ts`.

- [ ] **Task 5.3: Interactive Booking Confirmation Modal**
  - [ ] Create `src/components/modals/BookingConfirmationModal.vue` with glassmorphic design, section checkboxes, auto-tick on edit, and "Xác nhận tất cả" button.
  - [ ] Integrate into `useUIStore.ts`, `useForm.ts`, `useBillRender.ts`, and `AppLayout.vue`.
  - [ ] Connect confirmation completion to final action dispatch (Tạo phiếu / Cập nhật / Lưu ảnh / Đồng bộ).

- [ ] **Task 5.4: Quality Gate & Verification**
  - [ ] Run full Vitest suite (`npx vitest run`) and verify 100% tests pass.
  - [ ] Run `npm run build` and verify type check + production asset bundle.
