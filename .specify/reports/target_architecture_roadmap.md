# PROPOSED TARGET ARCHITECTURE & PHASED ROADMAP

## 1. Target Architecture: KING'S GRILL RESTAURANT OPERATIONS OS

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                            KING'S GRILL OPERATIONS OS (VUE 3)                               │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│  [ BOOKING COMMAND CENTER ]  │  [ RISK & CONFLICT CENTER ]  │  [ KITCHEN / BEO DISPATCH ]   │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│  Domain Modules:                                                                            │
│  • Booking (Composite State Machine: Booking, Deposit, Menu, Decor, Kitchen, Table)         │
│  • Constraint & Conflict Engine (Table overlaps, turnaround, capacity solver)                │
│  • AI Cognitive Engine (Asymmetric Race, Confidence Evidence, Human-in-the-Loop)            │
│  • Menu & Price Optimizer (Deterministic Subset Sum / Dynamic Budget Tuning)                │
│  • Party / BEO Engine (Full Lifecycle: Draft -> Confirmed -> Distributed -> Completed)       │
│  • Audit & Versioning (Time-travel diffs, Entity Revision Tracking)                          │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│  Infrastructure Layer:                                                                      │
│  • Local-First IndexedDB + Reactive Pinia Sub-stores                                        │
│  • Outbox Sync with 3-Way Conflict Resolver (Local / Server / Merge)                        │
│  • Supabase PostgreSQL (RLS) + Google Sheets Multi-channel Sync                             │
│  • Cloudflare Worker Edge Gateway (Zero API Key Leakage)                                    │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Phased Roadmap

### 🛡️ Phase 0 — Foundation Safety & Baseline Hardening
- **Mục tiêu**: Xây dựng nền tảng vững chắc, bảo vệ dữ liệu, chống hồi quy và thiết lập cơ chế an toàn trước khi thêm nghiệp vụ lớn.
- **Nội dung chính**:
  1. Spec-Kit Constitution & Architecture Governance.
  2. Feature Flag System (Quản trị bật/tắt an toàn: `OFF`, `BETA`, `100%`).
  3. Audit Log Infrastructure & Domain Event Dispatcher (`audit_logs` store).
  4. Currency & Timezone Safety Engine (Safe Decimal / Fixed Vietnam Timezone).
  5. Observability & Structured Logging Framework (`correlationId`).

### 🎛️ Phase 1 — Operational Control & Command Center
- **Mục tiêu**: Nâng cấp trải nghiệm vận hành cho Lễ tân và Quản lý nhà hàng.
- **Nội dung chính**:
  1. Composite Booking Status (Độc lập trạng thái Đặt, Cọc, Món, Decor, Bếp, Bàn).
  2. Operational Risk Center (Tự động quét và cảnh báo các booking có rủi ro cao).
  3. Booking Command Center Dashboard (Home screen trực quan hóa toàn bộ tình trạng hôm nay).
  4. Deterministic Booking Conflict Engine (Chặn trùng bàn, quá tải sức chứa, thiếu giờ setup).
  5. AI Confidence Evidence & Review Panel (Hiển thị bằng chứng trích xuất của từng trường).
  6. Booking Version History & Time-travel Diffs.
  7. Offline Sync Conflict Center (Giao diện giải quyết xung đột 3-Way).

### 🍲 Phase 2 — Party Execution & Departmental Dispatch
- **Mục tiêu**: Mở rộng luồng vận hành xuống Bếp, Đội Trang Trí và Thu Ngân.
- **Nội dung chính**:
  1. Party Execution Plan / BEO Engine (Vòng đời: Draft -> Distributed -> Executed).
  2. Kitchen Preparation Board (Giao diện chuyên biệt cho Bếp theo ca, món, trạm nấu).
  3. Decor Execution Board (Quản lý tiến độ cắm hoa tươi, bóng bay, bảng tên, gương viết).
  4. Deposit Reconciliation Center (Đối soát giao dịch ngân hàng & VietQR tự động).

### 📈 Phase 3 — Intelligent Optimization & Customer 360
- **Mục tiêu**: Tối ưu hóa doanh thu, thực đơn và thấu hiểu khách hàng.
- **Nội dung chính**:
  1. Deterministic Price Adjustment Optimizer (Tối ưu giảm trừ ngân sách chính xác từng đồng).
  2. Smart Menu Budget Engine (Gợi ý thực đơn cân bằng đạm/hải sản/rau/lẩu theo ngân sách).
  3. Smart Table Assignment Optimizer.
  4. Customer 360 Profile (Lịch sử đặt bàn, chi tiêu, sở thích món, khu vực yêu thích).
  5. No-Code Automation Rule Builder.

### 🏢 Phase 4 — Management OS & Multi-Branch
- **Mục tiêu**: Quản trị chuỗi và phân tích nâng cao.
- **Nội dung chính**:
  1. Operations Analytics & Revenue Forecasting.
  2. AI Operations Center (Giám sát tỷ lệ chỉnh sửa của con người theo từng trường).
  3. Multi-branch management.
