# CURRENT SYSTEM ARCHITECTURE AUDIT

## 1. Executive Summary
KG-Booking hiện là một hệ thống Web Application (Vue 3 + TypeScript + Pinia) kết hợp Hybrid AI Pipeline, Dual-Write Storage (IndexedDB + Supabase PostgreSQL) và Outbox Background Synchronization.

## 2. Architecture Map & Component Evaluation

| Module / Component | Đường dẫn mã nguồn | Đánh giá hiện trạng | Quyết định phân loại |
| :--- | :--- | :--- | :--- |
| **Frontend Framework & Entry** | `src/main.ts`, `src/App.vue` | Vue 3 Composition API, Pinia, Tailwind CSS, Vite. Khởi tạo mượt, clean. | **KEEP** |
| **Domain AI Engine** | `src/domain/ai/` | Gồm `ruleEngine.ts` (1900+ dòng), `promptProfiles.ts`, `promptBuilder.ts`, `jsonRepair.ts`, `inputClassifier.ts`, `aiResultValidator.ts`. Hoạt động rất chính xác. | **EXTEND** (Tách modular hơn, thêm AI Confidence Evidence) |
| **Domain Menu & Matcher** | `src/domain/menu/` | Gồm `menuMatcher.ts`, `menuCandidateRetriever.ts` (MiniSearch BM25). Nhận diện món ăn, khẩu phần (5/10 con, nửa con) rất tốt. | **EXTEND** (Bổ sung Menu Budget & Price Optimizer) |
| **Domain Booking** | `src/domain/booking/` | `bookingNormalizer.ts`, `bookingCompletenessGate.ts`. Phân định tên khách, chủ tiệc, chuẩn hóa ngày giờ. | **EXTEND** (Bổ sung Composite Status, Conflict Engine) |
| **AI Infrastructure & Services** | `src/services/ai/` | `aiProviderClient.ts`, `asymmetricRace.ts`, `circuitBreaker.ts`, `semanticCache.ts`, `correctionFewShotBuilder.ts`. | **KEEP & EXTEND** |
| **Storage & Dual-Write** | `src/infrastructure/dual/`, `src/infrastructure/postgres/` | `dualWriteRepository.ts`, `postgresRepository.ts`. Hỗ trợ Promise.allSettled ghi song song. | **KEEP & EXTEND** (Bổ sung Audit Logs & Revision ID) |
| **Offline Outbox & Sync** | `src/infrastructure/outbox/` | `outbox.ts`. Quản lý queue khi rớt mạng, retry với backoff. | **EXTEND** (Thêm Conflict Center UI & Idempotency Key) |
| **Cloudflare Worker Edge Proxy** | `workers/ai-gateway/`, `worker/` | Edge proxy luân chuyển AI API keys, bảo mật credentials. | **KEEP** |
| **Google Apps Script Proxy** | `gas/Backend.gs`, `src/infrastructure/gas/` | Fallback gateway và Google Sheets sync. | **KEEP** |
| **Pinia Stores** | `src/stores/` | `useAppStore.ts` (57KB monolith chứa booking logic, timeline, floor map), `useConfigStore.ts`, `useFormStore.ts`, `useMenuStore.ts`, `useUIStore.ts`. | **REFACTOR CÓ KIỂM SOÁT** (Tách bớt logic nghiệp vụ từ store sang Domain Services) |
| **UI Components & Modals** | `src/components/` | Core timeline, floor plan, AI input panel, social bot, menu manager, version release. | **EXTEND** (Thêm Command Center, Risk Center, BEO, Kitchen Board) |

## 3. Current Strengths
1. **Khả năng nhận diện AI xuất sắc**: Nhờ mô hình Asymmetric Race, MiniSearch Candidate Filtering và Vietnamese Rule Engine.
2. **Offline-first vững chắc**: IndexedDB + Outbox giúp app không bao giờ bị đơ khi rớt mạng nhà hàng.
3. **Bộ test tự động bao phủ cao**: 206 unit tests với tốc độ thực thi ~5s.

## 4. Key Bottlenecks & Evolution Needs
1. `useAppStore.ts` quá lớn (~57KB) đóng vai trò vừa là data store, vừa điều phối UI, vừa xử lý logic đặt bàn.
2. Thiếu cấu trúc **Composite Booking Status** (chỉ có 1 trạng thái chung thay vì tách biệt Bếp, Decor, Cọc, Bàn).
3. Thiếu **Audit Logging** ghi lại lịch sử chỉnh sửa ai đổi số khách, ai đổi món, ai đổi cọc.
4. Thiếu **Operational Risk Center** để tự động cảnh báo các booking thiếu cọc, sắp đến giờ chưa xếp bàn.
