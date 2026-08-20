# Implementation Plan - Phase 5: Conversational Vietnamese AI Engine & Interactive Confirmation Gate

## 1. Architecture & Component Breakdown

### 1.1 Conversational AI & Distributive Quantifier Engine
- **Files**:
  - `src/domain/ai/ruleEngine.ts`:
    - Add distributive quantifier resolution (`resolveDistributiveQuantifiers`) to handle patterns like `"mỗi món 2 phần"`, `"mỗi loại 1 đĩa"`, `"lẩu 1 phần còn lại 2 phần"`.
    - Enhance conversational entity classification and bullet/format cleaning.
    - Enhance dietary and special request parsing.
  - `src/domain/menu/menuMatcher.ts`:
    - Ensure robust stripping of discounts/notes during score matching.
  - `src/domain/ai/promptProfiles.ts`:
    - Enrich prompt instructions with conversational Vietnamese examples, quantifiers, and dietary preferences.

### 1.2 Completeness & Missing Content Warning Gate
- **Files**:
  - `src/domain/booking/bookingCompletenessGate.ts`:
    - Add `auditBookingCompleteness(formData, rawInput)` evaluating all operational dimensions (Contact, Date/Time, Pax/Table, Menu/Deposit, Decor/Dietary Notes) returning detailed warnings and missing items.

### 1.3 Interactive Booking Confirmation Modal
- **Files**:
  - `src/components/modals/BookingConfirmationModal.vue`:
    - Structured review cards (Customer, Schedule/Table, Menu, Deposit, Decor & Taste Notes, Warnings).
    - Granular checkbox per section, auto-tick on edit.
    - 1-Click "Xác nhận tất cả" button.
    - Actions: "Chỉnh sửa thêm" / "Xác nhận & Tiến hành".
  - `src/stores/useUIStore.ts` & `src/composables/useBillRender.ts` & `src/composables/useForm.ts`:
    - Intercept `triggerSave` / `Tạo phiếu` / `Lưu ảnh` / `Đồng bộ` to open `BookingConfirmationModal` when review is required or when user creates a booking.

---

## 2. Verification Strategy
1. **Unit Tests**:
   - `src/domain/ai/__tests__/conversationalVietnamese.test.ts`: Test chat sentences, distributive quantifiers ("mỗi món 2 phần"), dietary notes, foreign/Vietnamese names.
   - `src/domain/booking/__tests__/bookingCompletenessGate.test.ts`: Test missing fields audit and warnings.
2. **End-to-End Build & Visual Test**:
   - Verify `BookingConfirmationModal` appearance, auto-tick behavior, and save execution.
   - Run `npx vitest run` & `npm run build`.
