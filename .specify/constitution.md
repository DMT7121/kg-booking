# KING'S GRILL RESTAURANT OPERATIONS OS — SPEC-KIT CONSTITUTION

## Version: 3.0.0 · Stability First · Zero Regression · Zero Data Loss

### Principle 1 — Zero Regression
Không một tính năng mới nào được làm hỏng hoặc suy giảm chất lượng các chức năng hiện hữu (AI Ingestion, Menu Matcher, Floor Map, Timeline, Deposit, VietQR, Outbox, Dual-Write, Google Sheets Sync, RLS). Mọi thay đổi phải xác định rõ ràng:
- Impacted modules & Dependencies
- Regression surface
- Database impact & Sync impact
- Offline impact & AI impact
- UI/UX impact

### Principle 2 — Zero Data Loss & Transaction Safety
Mọi mutation dữ liệu quan trọng phải:
- Transaction-safe khi phù hợp.
- Idempotent (sử dụng idempotency keys cho Outbox & API calls).
- Có Audit trail ghi lại: `actorId`, `actorType`, `timestamp`, `before`, `after`, `source`.
- Có retry strategy & recovery strategy.
- Tuyệt đối không mất dữ liệu khi thiết bị offline.
- Không ghi đè âm thầm dữ liệu mới hơn (No blind Last-Write-Wins).

### Principle 3 — Backward Compatibility & Schema Evolution
Schema, API, IndexedDB, Supabase và Google Sheets sync không được phá vỡ tính tương thích ngược.
- Schema migrations phải tuân theo quy tắc: **ADD NEW → MIGRATE → VERIFY → SWITCH → DEPRECATE LATER**.
- Không rename/drop column trực tiếp nếu chưa qua chu kỳ deprecation.
- Phiên bản hóa các API & Payload contract.

### Principle 4 — Offline-First Integrity
Mọi nghiệp vụ cốt lõi (Xem lịch, Sơ đồ bàn, Tạo/Sửa đặt bàn, Nhập món, Cọc) phải hoạt động trơn tru trong cả **ONLINE MODE** lẫn **OFFLINE MODE**.
- Ghi dữ liệu tức thì xuống local storage (IndexedDB).
- Sử dụng Outbox Queue để đồng bộ nền khi có mạng trở lại.
- Hiển thị UI giải quyết xung đột (Conflict Resolution) khi có sự không đồng nhất giữa Local và Server.

### Principle 5 — Deterministic Before Generative
- Các nghiệp vụ logic, tính toán tiền tệ, phân bổ bàn, kiểm tra xung đột thời gian/sức chứa, xác thực schema bắt buộc xử lý bằng **Deterministic Rules, Algorithms, Constraint Solvers**.
- LLM AI chỉ đóng vai trò hỗ trợ trích xuất ngôn ngữ tự nhiên (NLP) và nhận dạng hình ảnh (OCR), không tự quyết định logic tài chính hoặc trạng thái hệ thống.

### Principle 6 — AI Explainability & Confidence Thresholds
- AI không được âm thầm đưa ra quyết định nhạy cảm.
- Mọi kết quả trích xuất AI phải trả về chi tiết: `value`, `confidence`, `sourceEvidence`, `extractionMethod`, `provider`, `validationState`.
- Thiết lập ngưỡng tin cậy configurable:
  - `>= 0.95`: Tự động chấp nhận nếu Rule Validation đồng thuận.
  - `0.80 - 0.95`: Đánh dấu highlight cần xem xét.
  - `< 0.80`: Bắt buộc nhân viên xác nhận (Human-in-the-loop).

### Principle 7 — Explicit State Machines & Composite Status
- Không dùng chuỗi trạng thái mơ hồ hoặc 1 status duy nhất cho toàn bộ quy trình đặt bàn.
- Phân định các domain status độc lập: `bookingStatus`, `depositStatus`, `menuStatus`, `decorStatus`, `kitchenStatus`, `tableStatus`, `paymentStatus`.
- Derived status (`READY`, `NEEDS_ATTENTION`, `BLOCKED`, `IN_SERVICE`, `COMPLETED`, `CANCELLED`) được tính toán từ các domain state và phải có State Transition Validation.

### Principle 8 — Test Before Merge & Baseline Preservation
Mọi feature chỉ hoàn thành khi:
- 100% test suite hiện hành pass (Bảo toàn baseline 206/206 tests passing).
- Bổ sung Unit tests, Integration tests, Regression tests, Offline tests tương ứng.
- Không sửa test chỉ để "cho pass" nếu phá vỡ hành vi nghiệp vụ đúng ban đầu.

### Principle 9 — Feature Flag First
- Mọi module lớn hoặc nâng cấp kiến trúc mới phải được bọc trong Feature Flag (`OFF`, `BETA`, `SELECTED_BRANCH`, `100_PERCENT`).
- Cho phép bật/tắt tức thì mà không cần redeploy hoặc làm gián đoạn người dùng.

### Principle 10 — Observability by Design
- Mọi sự kiện quan trọng phải phát ra structured event logs (`booking.created`, `ai.extraction_completed`, `sync.conflict`, `deposit.matched`,...).
- Gắn `correlationId` xuyên suốt workflow để dễ dàng truy vết và debug.

### Principle 11 — Security by Default & Least Privilege
- Không lưu API Key dài hạn dưới client. Mọi giao tiếp với AI Providers thực hiện qua Authenticated Edge Gateway (Cloudflare Worker / Supabase Edge Functions).
- Phân quyền chi tiết theo Granular Permissions kết hợp Row-Level Security (RLS) của PostgreSQL.

### Principle 12 — Operations-First UX Design
- Thiết kế giao diện tối ưu cho môi trường nhà hàng nhịp độ nhanh: ít click, trực quan, hỗ trợ màn hình cảm ứng POS/Tablet/Mobile, tránh modal dư thừa, làm nổi bật ngay các booking cần xử lý (`Needs Attention`).
