# V2 DEPENDENCY MAP — CALLERS, CALLEES & STATE FLOW

## 1. Bản đồ luồng dữ liệu hiện tại (V1 Flow)

```text
[UI Input / Pasted Text]
        │
        ▼
useFormStore.rawInput
        │
        ▼
useAI.analyzeBooking()
        │
        ├──> preNormalizeInput(rawText) ──> normalizedText
        │
        ├──> classifyAIInput(normalizedText) ──> { complexity, shouldTryLocalFirst, hasStructuredForm }
        │
        ├──> [If structured] parseStructuredForm(normalizedText)
        │
        ├──> extractByRules(normalizedText) ──> ruleBasedResult
        │
        ├──> [If not bypassed] runAIRouter() / callAIModel() ──> rawJsonParsed
        │
        ├──> crossValidateResults(rawJsonParsed, ruleBasedResult) ──> crossValidated
        │
        ├──> buildPartyNote() + cleanBookingNotes()
        │
        └──> Commit directly to Pinia Store:
                - formStore.customer = ...
                - formStore.items = ...
                - formStore.deposit = ...
```

---

## 2. Điểm tiếp xúc nhạy cảm (Critical Touchpoints)

1. **`useFormStore.ts`**:
   - Consumers: `CustomerForm.vue`, `LeftPanel.vue`, `BillPreview.vue`, `MenuItemsEditor.vue`, `useAI.ts`.
   - Các trường bị mutate: `customer.*`, `items`, `deposit.*`, `rawInput`, `warnings`, `parsedAiResult`.
   - **Quy tắc an toàn V2**: Parser V2 không được mutate trực tiếp `formStore`. Parser V2 nhận `BookingInputEnvelope`, xử lý qua Pure Reducer, sinh ra `VerifiedBookingState`, sau đó Store Action mới commit dữ liệu vào state.

2. **`useAI.ts`**:
   - Consumer chính gọi `analyzeBooking()`: Nút "Phân tích AI / Nhận diện" trên thanh công cụ và phím tắt `Ctrl/Cmd + Enter`.
   - **Quy tắc an toàn V2**: Giữ nguyên public signature của `useAI()`, chuyển lõi phân tích bên trong thành facade gọi sang `BookingIntelligenceV2`.

3. **`ruleEngine.ts`**:
   - Callers: 52 test files trong `src/domain/ai/__tests__/`, `src/domain/booking/__tests__/`, `useAI.ts`, `localFirstBookingAnalyzer.ts`.
   - Các hàm cốt lõi: `extractByRules`, `preNormalizeInput`, `classifyPeopleNames`, `extractHardEntities`, `parseTableCodes`, `parseDishItems`.
   - **Quy tắc an toàn V2**: Giữ nguyên signature và logic của các hàm này để phục vụ backward-compatibility. V2 xây dựng Candidate Extractors bọc (wrap) lấy các hàm này để phát ra các `BookingFactEvent`.

4. **`conflictEngine.ts`**:
   - Consumers: `useAppStore.ts` (quản lý rủi ro đơn đặt), `HistoryTimeline.vue`, `BookingDetailModal.vue`, `ConflictResolutionModal.vue`.
   - Functions: `checkTableOverlap`, `checkCapacityLimit`, `detectBookingRisks`.
   - **Quy tắc an toàn V2**: Tái sử dụng `DEFAULT_TABLE_DEFINITIONS` và mở rộng thành `bookingConstraintEngine.ts` độc lập, vừa phục vụ NLU pipeline vừa cung cấp dữ liệu cho UI modal.

5. **`menuMatcher.ts`**:
   - Consumers: `useAI.ts`, `localFirstBookingAnalyzer.ts`, `menuCandidateRetriever.ts`.
   - Functions: `matchMenuItems`, `resolveMenuItemsLocally`, `jaroWinklerDistance`, `normalizeSynonyms`.
   - **Quy tắc an toàn V2**: Nâng cấp thành `menuResolverV2.ts`, bổ sung cơ chế tính khoảng cách điểm (Margin Score Gate) và nhận diện Intent gợi ý / yêu cầu có điều kiện.
