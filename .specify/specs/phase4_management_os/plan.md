# IMPLEMENTATION PLAN — PHASE 4: MANAGEMENT OS

## 1. Scope & Impact Analysis
- **Mục tiêu**: Xây dựng Operations Analytics Engine, AI Operations Telemetry Tracker, Multi-Branch Model và Management Dashboards.
- **Vùng ảnh hưởng**:
  - `src/domain/analytics/operationsAnalytics.ts` (NEW): Tính toán chỉ số vận hành và doanh thu.
  - `src/domain/ai/aiOperations.ts` (NEW): Giám sát telemetry AI và tỷ lệ chỉnh sửa của con người.
  - `src/domain/branch/branchConfig.ts` (NEW): Cấu hình chuỗi nhà hàng đa chi nhánh.
  - `src/components/operations/OperationsAnalyticsModal.vue` (NEW): Modal Dashboard báo cáo vận hành.
  - `src/components/operations/AiOperationsModal.vue` (NEW): Modal giám sát đường ống AI.
- **Chiến lược an toàn**:
  - Không phá vỡ bất kỳ luồng hoạt động cũ nào.

---

## 2. Technical Architecture & Steps

### Step 1: Operations Analytics Engine (`src/domain/analytics/operationsAnalytics.ts`)
- Tính toán KPI ngày: Doanh thu dự kiến, tiền cọc đã nhận, tiền cọc còn thiếu, tỷ lệ lấp đầy bàn (Occupancy), số khách trung bình/bàn.
- Phân tích xu hướng: Khung giờ cao điểm đón khách (18h, 19h), top món ăn được yêu thích nhất.

### Step 2: AI Operations Telemetry & Feedback Loop (`src/domain/ai/aiOperations.ts`)
- Theo dõi các chỉ số quan trọng: `cacheHitRate`, `p95Latency`, `circuitBreakerStatus`.
- Theo dõi `Human Correction Rate` theo từng trường: Khách sửa `guestCount`, `menuItems`, hay `decorColor`.

### Step 3: Multi-Branch Configuration Engine (`src/domain/branch/branchConfig.ts`)
- Quản lý danh sách chi nhánh trong chuỗi KING'S GRILL (Chi nhánh trung tâm, Chi nhánh sân vườn, Chi nhánh VIP).

### Step 4: Management Dashboards UI
- `OperationsAnalyticsModal.vue`: Giao diện báo cáo quản trị toàn diện.
- `AiOperationsModal.vue`: Giao diện giám sát AI thời gian thực.

### Step 5: Test Suite & Hardening
- Viết unit tests cho `operationsAnalytics.test.ts`, `aiOperations.test.ts`, `branchConfig.test.ts`.
- Chạy `npx vitest run` và `npm run build`.
