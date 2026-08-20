# Phase 5: Conversational Vietnamese AI Engine & Interactive Confirmation Gate

## 1. Executive Summary
Phase 5 focuses on elevating King's Grill AI to human-grade conversational Vietnamese comprehension (everyday chat, slang, speech patterns, distributive dish quantifiers, complex party decor notes) and implementing a failsafe **Interactive Booking Confirmation & Missing Content Gate** before ticket creation, bill generation, and cloud sync.

---

## 2. Core Capabilities & Requirements

### 2.1 Advanced Conversational Vietnamese AI Comprehension
1. **Conversational Entity Recognition**:
   - Extract customer names seamlessly from informal messaging formats (Zalo, Messenger, SMS, voice transcriptions, hybrid English/Vietnamese names like "Serena", "Ánh Tiên", "Mr. David").
   - Strip compound prefixes and conversational clutter (`"Khách hàng: Serena"`, `"C2 Hồng Nhung"`, `"Bàn 5 đặt tiệc a Nam"`, `"Em ơi đặt bàn tên Trang"`).
2. **Distributive Dish Quantifiers & Complex Food Orders**:
   - Understand distributive and collective quantity modifiers:
     - `"Mỗi món 2 phần"` / `"Mỗi loại 1 đĩa"` / `"Mấy món trên lấy 2 suất"` -> Apply quantity 2 to all preceding dishes.
     - `"3 món đầu mỗi món 2 phần, món lẩu 1 phần"` -> Distributed application.
     - `"Gỏi x2 còn lại x1"` -> Partial overrides.
3. **Comprehensive Note & Special Request Aggregation**:
   - Culinary taste & dietary restrictions: `"Không cay, ít ngọt, nhiều đá, bớt dầu mỡ, 1 người ăn chay, không hành"`.
   - Party decor details: `"Tông màu: Trắng-Hồng-Xanh, Bảng tên: ..., Gương viết: ..., Setup mặt bàn miễn phí, bóng bay, hoa tươi"`.
   - Logistics & child amenities: `"10 người lớn + 1 ghế trẻ em (đang sắp xếp), 18h30 có mặt, phòng lạnh dùng chung"`.
4. **Precision Menu Sheet & Set Menu Discrimination**:
   - Precise discrimination between Set Menu variants (`SET MENU 1` vs `SET MENU 6` with discount notes like `(Giảm 10% tiền thức ăn)`).
   - Smart synonym normalization and homophone protection.

---

### 2.2 Completeness & Missing Content Warning Gate
- Perform full-text audit upon parsing and before final save actions (`Lưu ảnh`, `Tạo phiếu`, `Đồng bộ`).
- Check and flag:
  - Missing or invalid contact info (Phone, Customer Name).
  - Missing arrival time or event date.
  - Large party without assigned table or room.
  - High-value party / Set Menu / Decor reservation with 0 deposit.
  - Unresolved menu items or discrepancy in guest counts.
  - Unrecorded requests mentioned in raw chat.

---

### 2.3 Interactive Pre-Creation Confirmation Modal (`BookingConfirmationModal.vue`)
- **Single Source of Truth Review**: Presents all parsed booking information in structured cards:
  - Customer & Booker Info
  - Date, Time & Seating (Zone/Table)
  - Menu Items, Portions, Quantities, Unit Prices & Totals
  - Deposit Status & Payment Reference
  - Party Theme, Decor Colors & Special Notes
  - Completeness & Risk Warnings (if any)
- **Granular & Auto-Tick Verification**:
  - Checkbox per section / item.
  - Editing any value inside the modal automatically ticks that item as confirmed.
- **Fast-Track "Xác nhận tất cả" (1-Click Approve All)**:
  - Quickly marks all sections as verified when the employee has reviewed the form.
- **Action Dispatcher**:
  - Proceeds seamlessly to `Tạo lịch mới`, `Cập nhật`, `Lưu ảnh phiếu`, or `Đồng bộ`.

---

## 3. Success Metrics & Verification
- 100% test coverage across colloquial conversational fixtures and distributive quantifier scenarios.
- 0 false positive menu mismatches on Set Menus with discount notes.
- Seamless, beautiful, glassmorphic UI for `BookingConfirmationModal.vue` adhering to King's Grill Design System.
- All existing 46 test suites pass without regression.
