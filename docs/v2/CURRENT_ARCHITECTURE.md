# CURRENT ARCHITECTURE ASSESSMENT — KING'S GRILL BOOKING ENGINE V1

## 1. Executive Summary
Hệ thống xử lý đầu vào hiện tại của King's Grill là một kiến trúc Hybrid kết hợp giữa:
- **Local Rule Engine (Deterministic Heuristics)**: Xử lý Regex, NER tiếng Việt, bóc tách cấu trúc Key-Value, chuẩn hóa chuỗi và đối chiếu bảng giá/món ăn.
- **Asymmetric AI Pipeline (Remote LLM)**: Đua song song giữa Fast Model (Gemini Flash/Haiku) và Quality Model (Gemini Pro/Sonnet), đi qua 3 tầng Cache (In-memory L1, IndexedDB L2, Semantic Cache L3) và Circuit Breaker.
- **Post-Processing Normalizer**: Sửa lỗi JSON, đối chiếu chéo (Cross-Validation), bóc tách ghi chú tiệc và dọn rác thực đơn.

Hệ thống hiện tại đạt hiệu năng tốt ở các trường hợp đơn lẻ (single-turn) và form mẫu chuẩn (< 5ms cho structured forms, ~10ms cho rule engine), vượt qua 52 test suites (320 tests). Tuy nhiên, kiến trúc V1 bộc lộ các giới hạn căn bản khi đối mặt với hội thoại đặt bàn phức tạp trong thế giới thực.

---

## 2. Component-by-Component Analysis

### 2.1. Input Ingestion & Pre-Normalization (`src/domain/ai/ruleEngine.ts` -> `preNormalizeInput`)
- **Cơ chế**: Nhận chuỗi thô (`rawText`), thực hiện regex thay thế liên tiếp trên một biến `clean` duy nhất.
- **Vấn đề**:
  1. *Phá hủy văn bản gốc (Destructive Normalization)*: Biến các con số ước lượng thành con số chính xác giả tạo (ví dụ: `tầm 8-10 người` -> `10 khách`, `19h hơn` -> `19:15`, `tối khoảng 7 giờ` -> `19:00 exact`). Điều này làm mất tính bất định (uncertainty) của khách hàng.
  2. *Xóa sạch ngữ cảnh nhân viên*: Regex `nhân viên|nv|page|bot` xóa toàn bộ dòng nói của nhân viên, dẫn đến việc mất liên kết hội thoại. Ví dụ: khi nhân viên hỏi *"Chị đặt 15 khách lúc 19h đúng không?"* và khách trả lời *"Đúng em"*, hệ thống chỉ còn thấy chữ *"Đúng em"* và không trích xuất được số lượng hay thời gian.
  3. *Không có Envelope bất biến*: Dữ liệu thô chỉ được lưu tạm tại `formStore.rawInput`, không có cấu trúc quản lý metadata nguồn (source), timestamp hay danh sách turns.

### 2.2. Classification & Routing (`src/domain/ai/inputClassifier.ts` & `structuredFormParser.ts`)
- **Cơ chế**: `isStructuredFormText` kiểm tra nếu có $\ge 3$ cặp Key-Value; `classifyAIInput` kiểm tra từ khóa món ăn và hội thoại để ra quyết định bypass AI.
- **Vấn đề**:
  1. *Thiếu Safety Gate*: Nếu khách gửi một form mẫu chuẩn nhưng kèm theo dòng đính chính bên dưới (*"À khách đổi sang 15 người nha"*), hệ thống V1 có thể bypass AI và nhận ngay số lượng 10 từ form cũ.
  2. *Phân loại tĩnh*: Chưa phân biệt được giữa việc khách hỏi tư vấn món (*Recommendation Intent*) với việc chốt món thực tế.

### 2.3. Extraction Engine & NER (`src/domain/ai/ruleEngine.ts`)
- **Cơ chế**: `classifyPeopleNames`, `extractHardEntities`, `parseTableCodes`, `extractDecorationDetails`, `extractDietaryNotes`.
- **Vấn đề**:
  1. *Kiến trúc "One-shot Guess Final State"*: Cố gắng đoán ngay trạng thái booking cuối cùng từ toàn bộ văn bản thay vì mô hình hóa sự biến đổi trạng thái qua từng câu thoại.
  2. *Xung đột nhiều tên*: Khi có nhiều tên người, hệ thống chỉ so sánh điểm confidence tĩnh; nếu điểm bằng nhau thì trả về `null` vì sợ sai, thay vì truy vết vai trò ngữ cảnh (người đặt vs chủ tiệc vs người chuyển cọc).
  3. *Đính chính cục bộ bằng regex đuôi*: Regex `doi sang|chuyen sang` chỉ bắt được một số mẫu câu đính chính đơn giản, không xử lý được chuỗi đính chính lặp lại (12 -> đổi 10 -> thôi vẫn 12).

### 2.4. Menu Matching (`src/domain/menu/menuMatcher.ts`)
- **Cơ chế**: Jaro-Winkler distance, chuẩn hóa từ đồng nghĩa, trích xuất định lượng (con, kg, dĩa).
- **Vấn đề**:
  1. *Chưa có Cascade nhiều tầng chuẩn mực*: Chưa tách bạch rõ ràng giữa Exact SKU -> Canonical Name -> Normalized Token -> Fuzzy Character -> Semantic Embedding.
  2. *Thiếu Minimum Margin Gate*: Khi Top-1 đạt 0.87 và Top-2 đạt 0.86, hệ thống vẫn tự động chọn Top-1 mà không cảnh báo trạng thái nhập nhằng (ambiguity).
  3. *Không hỗ trợ yêu cầu có điều kiện (Conditional Requests)*: Chưa biểu diễn được cấu trúc *"Nếu còn cá lăng thì lấy 2, không thì đổi cá diêu hồng"*.

### 2.5. Conflict & Risk Engine (`src/domain/booking/conflictEngine.ts`)
- **Cơ chế**: `checkTableOverlap`, `checkCapacityLimit`, `detectBookingRisks`.
- **Vấn đề**:
  1. *Tách rời khỏi NLU pipeline*: Chỉ chạy sau khi booking đã được gán vào store hoặc khi xem danh sách đơn, không tham gia vào quá trình phân tích văn bản tức thì.
  2. *Thiếu các ràng buộc an toàn F&B quan trọng*: Chưa có kiểm tra xung đột giữa Tiệc trẻ em và Khu vực hút thuốc, chưa có kiểm tra dị ứng hải sản nghiêm ngặt khi thực đơn có lẩu hải sản.
  3. *Mức độ nghiêm trọng chưa phân cấp triệt để*: Chưa có cấp độ `BLOCK` để ngăn chặn việc xác nhận đơn sai nguyên tắc.

### 2.6. Provenance & Observability
- **Hiện trạng**: Hoàn toàn thiếu vắng. Hệ thống không thể trả lời câu hỏi: *"Tại sao số khách là 13? Con số 13 được lấy từ câu nào, ở dòng số mấy, do ai nói, và có bị câu nào sau đó phủ định hay không?"*.
