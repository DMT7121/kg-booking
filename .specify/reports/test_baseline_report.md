# TEST BASELINE REPORT

## 1. Test Execution Baseline
- **Execution Date**: 2026-08-20T03:00:53+07:00
- **Test Runner**: Vitest v1.6.1
- **TypeScript Compiler**: `vue-tsc --noEmit` (0 errors)
- **Production Build Status**: `npm run build` (Passed in 13.47s, 0 errors)

---

## 2. Test Suite Summary

| Test Suite / File | Category | Test Count | Status |
| :--- | :--- | :--- | :--- |
| `src/domain/booking/__tests__/bookingNormalizer.test.ts` | Domain / Booking | 9 | **PASS** |
| `src/domain/booking/__tests__/bookingCompletenessGate.test.ts` | Domain / Validation | 7 | **PASS** |
| `src/domain/menu/__tests__/menuMatcher.test.ts` | Domain / Menu Matcher | 5 | **PASS** |
| `src/domain/menu/__tests__/menuMatcherFuzzy.test.ts` | Domain / Fuzzy Matcher | 6 | **PASS** |
| `src/domain/menu/__tests__/menuCandidateRetriever.test.ts` | Domain / Candidate Retrieval | 4 | **PASS** |
| `src/domain/ai/__tests__/inputClassifier.test.ts` | AI / Classification | 5 | **PASS** |
| `src/domain/ai/__tests__/ruleEngine.test.ts` | AI / Vietnamese Rule Engine | 26 | **PASS** |
| `src/domain/ai/__tests__/regressionHarness.test.ts` | AI / Regression Harness | 12 | **PASS** |
| `src/domain/ai/__tests__/aiResultValidator.test.ts` | AI / Schema Validation | 6 | **PASS** |
| `src/domain/ai/__tests__/jsonRepair.test.ts` | AI / JSON Repair | 3 | **PASS** |
| `src/domain/ai/__tests__/promptBuilder.test.ts` | AI / Dynamic Prompt | 2 | **PASS** |
| `src/domain/ai/__tests__/vietnameseNameGuard.test.ts` | AI / Name Guard | 14 | **PASS** |
| `src/services/ai/__tests__/asymmetricRace.test.ts` | Services / AI Race | 3 | **PASS** |
| `src/services/ai/__tests__/circuitBreaker.test.ts` | Services / SRE Circuit Breaker | 12 | **PASS** |
| `src/services/ai/__tests__/aiResponseCache.test.ts` | Services / L1 & L2 Cache | 5 | **PASS** |
| `src/services/ai/__tests__/semanticCache.test.ts` | Services / Semantic Cache | 4 | **PASS** |
| `src/services/ai/__tests__/correctionFewShotBuilder.test.ts` | Services / Learning Engine | 5 | **PASS** |
| `src/services/ai/__tests__/aiProviderClient.test.ts` | Services / Edge Gateway | 2 | **PASS** |
| `src/services/ai/__tests__/characterization.test.ts` | Services / Characterization | 18 | **PASS** |
| `src/services/security/__tests__/localKeyVault.test.ts` | Security / AES Encryption | 7 | **PASS** |
| `src/infrastructure/outbox/__tests__/outbox.test.ts` | Infrastructure / Outbox Sync | 6 | **PASS** |
| `src/infrastructure/postgres/__tests__/rlsIntegration.test.ts` | Infrastructure / PostgreSQL RLS | 4 | **PASS** |
| `src/infrastructure/dual/__tests__/dualWriteRepository.test.ts` | Infrastructure / Dual-Write | 4 | **PASS** |
| `src/stores/offlineConflict.test.ts` | Stores / Conflict Handling | 4 | **PASS** |
| `src/utils/__tests__/security.test.ts` | Utils / Sanitization | 1 | **PASS** |
| `scripts/benchmark-ai-latency.test.ts` | Benchmarks / Latency & Accuracy | 1 | **PASS** |

### **TOTAL: 27 Test Files · 206 Tests Passing · 0 Failures**

---

## 3. Strict Quality Preservation Constraint
Mọi thay đổi mã nguồn trong các Phase tiếp theo bắt buộc phải:
1. Đạt tối thiểu **206/206 passing tests**.
2. Tăng số lượng test tương ứng với các tính năng mới được triển khai.
3. Không làm suy giảm thời gian thực thi test tổng thể (>15s cần tối ưu lại).
