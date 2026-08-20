# MODULE DEPENDENCY MAP

```
                                  [ Presentation Layer (UI) ]
                               App.vue / AppLayout.vue / LeftPanel
             ┌─────────────────────────────┼─────────────────────────────┐
             ▼                             ▼                             ▼
    [ Forms / Panels ]             [ Core Timeline ]             [ Modals & Views ]
• AIInputPanel                  • HistoryTimeline              • BookingDetailModal
• CustomerForm                  • QuickDashboard               • FloorPlanModal
• MenuItemsEditor               • AnalyticsDashboard           • MenuManagerModal
             │                             │                             │
             └─────────────────────────────┼─────────────────────────────┘
                                           │
                                           ▼
                                 [ State Stores (Pinia) ]
           ┌───────────────────────────────┼───────────────────────────────┐
           ▼                               ▼                               ▼
    useAppStore.ts                 useConfigStore.ts               useMenuStore.ts
    (Bookings, Timeline, Sync)     (AI, Gateway, Keys, FeatureFlags)(Menu List, Sets, Aliases)
           │                               │                               │
           └───────────────────────────────┼───────────────────────────────┘
                                           │
                                           ▼
                              [ Domain & Business Layer ]
           ┌───────────────────────────────┼───────────────────────────────┐
           ▼                               ▼                               ▼
     [ Domain AI ]                 [ Domain Booking ]              [ Domain Menu ]
   • ruleEngine.ts               • bookingNormalizer.ts          • menuMatcher.ts
   • promptProfiles.ts           • bookingCompletenessGate.ts    • menuCandidateRetriever.ts
   • inputClassifier.ts          • smartTableAllocator.ts        • (Planned: menuOptimizer.ts)
   • jsonRepair.ts               • (Planned: conflictEngine.ts)  • (Planned: budgetEngine.ts)
           │                               │                               │
           └───────────────────────────────┼───────────────────────────────┘
                                           │
                                           ▼
                            [ Services & Gateway Layer ]
           ┌───────────────────────────────┼───────────────────────────────┐
           ▼                               ▼                               ▼
     [ AI Services ]               [ Security Services ]         [ External APIs ]
   • asymmetricRace.ts           • localKeyVault.ts              • vietqr.ts
   • circuitBreaker.ts           • (Planned: auditService.ts)    • facebookApi.ts
   • semanticCache.ts                                            • r2.ts
           │                               │                               │
           └───────────────────────────────┼───────────────────────────────┘
                                           │
                                           ▼
                           [ Infrastructure & Data Layer ]
           ┌───────────────────────────────┼───────────────────────────────┐
           ▼                               ▼                               ▼
 [ DualWriteRepository ]           [ Outbox Queue ]              [ Gateway Proxies ]
 • IndexedDB (Local-First)        • outboxSync.ts               • Cloudflare Edge Worker
 • Postgres (Supabase RLS)        • conflict resolution         • Google Apps Script (GAS)
```

## Dependency Rules & Boundaries
1. **Domain Isolation**: Code trong `src/domain/` không được phụ thuộc trực tiếp vào Vue Components hoặc Pinia Stores. Phải là Pure TypeScript functions / classes để dễ dàng Unit Test và tái sử dụng.
2. **Infrastructure Abstraction**: Các tương tác lưu trữ (IndexedDB, Supabase, Google Sheets) chỉ được gọi thông qua Repositories (`dualWriteRepository`, `postgresRepository`).
3. **Store Thinning**: Pinia store chỉ giữ state phản ứng và gọi Domain Services / Repositories, không chứa thuật toán phức tạp.
