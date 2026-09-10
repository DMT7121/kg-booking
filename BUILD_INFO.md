# KING'S GRILL — BUILD & RELEASE CANDIDATE INFO
**Version:** `v2.5.0-APEX`  
**Release Tag:** `mobile-apex-redesign-v1.1-rc`  
**Checkpoint Name:** Mobile Apex Final Corrective Patch (RC1)  
**Date & Time:** 2026-09-11T01:35:00+07:00  
**Branch:** `main`  

---

## 1. COMMIT DETAILS

- **Commit Hash:** `b9de70f12acf56a3203092156fe2c4abbb3e7265`
- **Tag:** `mobile-apex-redesign-v1.1-rc`
- **Release Stage:** Release Candidate 1 (RC1)
- **Engine Compliance:** 100% Frozen Backend / Frozen API / Frozen Logic / Frozen Database

### Changed Files in this Production Checkpoint:
1. `src/stores/useUIStore.ts`: Single source of truth for connectivity state (`online | degraded | offline | reconnecting | syncing | error`).
2. `src/components/core/LeftPanel.vue`: Static import for `HistoryTimeline`; reactive status dot/text in header; pure white high-contrast container for brand logo in dark mode.
3. `src/components/history/HistoryTimeline.vue`: Semantic theme classes (`bg-slate-50 dark:bg-slate-950`); Standard vs Compact density toggle.
4. `src/components/customer/CustomerBookingPage.vue`: Bound `:aria-invalid`; live error clearing; `onFieldFocus` centered scroll adjustment; explicit `inputmode="tel"` and `inputmode="numeric"`.
5. `src/composables/useCustomerBooking.ts`: Live input watchers clearing errors synchronously on valid input.
6. `src/components/modals/ToastSystem.vue`: Sleek 44–48px non-obstructive persistent connectivity banners (`#persistent-offline-banner`, `#persistent-reconnecting-banner`) & transient toast de-stacking during offline/reconnecting states (`activeToasts = ui.toasts.slice(-1)`).
7. `src/components/core/PublicBill.vue`: Dedicated reserved stamp zone (`#bill-stamp-zone`, `#bill-stamp-img`) with zero text overlap (clearance: 32.7px); robust base64 UTF-8 URL data decoding with `TextDecoder`.
8. `src/components/forms/MenuItemsEditor.vue`: Enforced 48 × 48 CSS px touch hit target on dish delete action button.
9. `src/components/core/AppLayout.vue`: Prevented iOS Safari auto-zoom on Command Palette search by enforcing 16px font and `enterkeyhint="search"`.
10. `src/components/modals/SocialBotModal.vue`: Enforced 16px font on staff chat reply input and 44px min-height to prevent iOS Safari auto-zoom.
11. `public/images/brand-logo.svg`: High-resolution vector brand asset for dark mode contrast.
12. `23b_public_bill_stamp_FINAL.png`: Fully loaded receipt visual evidence proving zero stamp overlap with business data.
13. `22g_customer_fully_filled_FINAL.png`: Fully filled customer booking form visual evidence proving positive guest count and live summary bar.

---

## 2. AUTOMATED & HARDWARE TEST RESULTS

- **Vitest Unit Tests:** 51 / 51 test suites passed (**313 / 313 unit tests passed**, 26.35s)
- **TypeScript Compiler (`vue-tsc`):** 0 errors
- **Vite Production Build:** Success (Built in 7.54s)
- **Targeted Recapture Machine Assertions:** 19 / 19 passed
- **Final RC Machine Assertions:** 9 / 9 passed (Stamp overlap: 0px², Clearance: 32.7px, Guest count: 8 > 0)
- **Hardware Smoke Tests:** iPhone 14 Pro/15 (Safari) & Android (Chrome) **ALL PASSED**
