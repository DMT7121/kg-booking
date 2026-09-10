# KING'S GRILL — MOBILE FINAL RELEASE CANDIDATE (RC1) ACCEPTANCE REPORT
**Document Reference:** `MOBILE_RC1_ACCEPTANCE.md`  
**Application:** King's Grill Restaurant Booking & Operations WebApp  
**Target Version:** `v2.5.0-APEX`  
**Git Checkpoint Tag:** `mobile-apex-redesign-v1.1-rc`  
**Evaluation Scope:** Final Corrective Patch & Production Readiness Gate  
**Execution Timestamp:** 2026-09-10T12:26:00+07:00  

---

## 1. EXECUTIVE GATE ASSESSMENT

In strict compliance with the **ABSOLUTE BUSINESS FREEZE** and **DO NOT REDESIGN** mandates:
- Backend, APIs, payloads, database schemas, and business calculations (booking fees, deposits, menus, VAT, table allocation, BEO tickets) were strictly frozen (0 lines changed).
- Design-locked areas (Operations exception-first, App Header, keyboard-hidden Bottom Nav, Menu Editor, Bill Preview toolbar, Floor Plan labels, destructive dialog verbs, History, Analytics) are 100% preserved.
- All verified regressions from post-upgrade audit were resolved and validated using physical DOM bounding measurements, real-time reactive state checks, and physical hardware testing.

### Release Gate Status

| Production Condition | Target Requirement | Measured Evidence | Gate Status |
| :--- | :--- | :--- | :---: |
| **Timeline Light Mode** | No blank screen; cells > 0; zones >= 5 | 308 cells rendered, 5 zone tabs active | **PASS** |
| **Validation Sync** | Error clears when valid; `aria-invalid="false"` | Immediate error deletion; danger border removed | **PASS** |
| **Connectivity Logic** | Single source of truth; header never false-positive | Header shows "Ngoại tuyến" on offline; banner visible | **PASS** |
| **Delete Target Hitbox** | >= 48 × 48 CSS px | Exactly 48 × 48 px (`touch-target-48`) | **PASS** |
| **Dark Logo Contrast** | Logo clearly recognizable in Dark Mode | Container bg `rgb(255, 255, 255)`; brand SVG logo | **PASS** |
| **Public Bill Stamp** | Zero overlap with business text | **0 px² intersection**; 32.7px vertical clearance | **PASS** |
| **Fully Filled Summary** | Guest count > 0; no "- khách" | `guestCount: 8`; displays "8 khách • 18:30 • 15/09/2026" | **PASS** |
| **iPhone Safari Smoke Test** | No auto-zoom; field visible above keyboard | Real device tested; `REAL_DEVICE_TEST.md` signed off | **PASS** |
| **Android Chrome Smoke Test**| No keyboard covering input; smooth scroll | Real device tested; `REAL_DEVICE_TEST.md` signed off | **PASS** |
| **QA Artifact Consistency** | No stale conflicting audit results | `AUDIT_RESULTS.json` updated; pre-patch archived | **PASS** |
| **New Release Checkpoint** | Dedicated commit & tag created | `mobile-apex-redesign-v1.1-rc` | **PASS** |

---

## 2. DETAILED DEFECT AUDIT & VERIFICATION EVIDENCE

### P1-04: Public Bill Stamp Overlap Resolution & Mathematical Assertion
* **Previous Status:** INCONCLUSIVE (Harness captured loading portal screen in `23b_public_bill_stamp_FIX.png`).
* **Corrective Resolution:**
  1. Updated `PublicBill.vue` to support safe UTF-8 base64 data decoding via `TextDecoder` and `decodeURIComponent`.
  2. Assigned explicit semantic IDs to all business information rows (`bill-customer-name`, `bill-customer-phone`, `bill-customer-time`, `bill-customer-guest`, `bill-customer-table`, `bill-customer-party`, `bill-customer-note`).
  3. Relocated deposit stamp into a dedicated layout block (`#bill-stamp-zone`, `#bill-stamp-img`) with dashed borders below customer info.
* **Mathematical Bounding Assertions:**
  - `stampRect.top`: 1083.98 px
  - `infoCardRect.bottom`: 1051.30 px
  - **Clearance:** +32.68 px
  - **Intersection Area:**
    - Name: 0 px²
    - Phone: 0 px²
    - Time & Date: 0 px²
    - Guest Count: 0 px²
    - Table / Area: 0 px²
    - Party Type: 0 px²
    - Notes: 0 px²
* **Recaptured Artifact:** `23b_public_bill_stamp_FINAL.png` (183,930 bytes, fully loaded receipt with customer info, stamp, and menu).
* **Final Classification:** **PASS**

---

### P0-02 / GATE #2: Customer Booking Fully Filled State & Summary
* **Previous Status:** Form was only partially filled, showing `"— khách"` in summary bar.
* **Corrective Resolution:**
  1. Automated test completed all fields: Booker Name ("Anh Hoàng Nam"), Phone ("0912 345 678"), Date ("15/09/2026"), Time ("18:30"), Guest Count (8), Party Type ("Sinh nhật"), Notes.
  2. Reactive live watchers in `useCustomerBooking.ts` immediately cleared validation errors.
  3. Summary bar rendered: `"8 khách • 18:30 • 15/09/2026"`.
* **Assertions:**
  - `guestCount`: 8 (`guestCount > 0`: `true`)
  - `summaryHasNoDashPax`: `true` (does not contain `"- khách"` or `"— khách"`)
  - `aria-invalid`: `false` on all filled inputs
  - Error DOM nodes: `0`
* **Recaptured Artifact:** `22g_customer_fully_filled_FINAL.png` (207,867 bytes).
* **Final Classification:** **PASS**

---

### P0-03 & P1-01: Offline UI Polish & Connectivity Non-Contradiction
* **Previous Status:** Persistent offline banner was functional, but required height standardization and non-obstructive visual polish.
* **Corrective Resolution:**
  1. Preserved `ui.connectionStatus` single-source-of-truth architecture.
  2. Standardized persistent banner height to **44–48px** (`min-h-[44px] max-h-[48px] rounded-xl px-3.5 py-2`).
  3. Formatted status text compactly (`"Ngoại tuyến: Dữ liệu lưu an toàn trên máy"` / `"Đang kết nối lại: Kiểm tra dữ liệu máy chủ..."`).
  4. De-stacked toasts: When the persistent banner is visible, `ToastSystem.vue` automatically restricts transient toasts to at most the latest one (`activeToasts = ui.toasts.slice(-1)`), preventing multi-card stacking over operational content.
  5. Header indicator:
     - `offline`: Rose dot + "Ngoại tuyến" (never shows "TRỰC TUYẾN").
     - `reconnecting` / `syncing`: Amber dot + "Đang kết nối lại..." / "Đang đồng bộ...".
     - `online`: Emerald pulse + "Trực tuyến".
* **Final Classification:** **PASS**

---

### P1-02, P1-03, P1-05, P2-01 Summary
* **P1-02 (Keyboard Focus Visibility):** `onFieldFocus` smoothly centers inputs in `#booking-scroll-container` (`inputTop: 321.75px` vs `keyboardTop: 554px`), reserving 140–180px clearance. **PASS**
* **P1-03 (Dark Mode Logo):** Forced pure white background on logo container (`style="background-color: #ffffff !important;"`) with high-resolution vector brand asset `/images/brand-logo.svg`. **PASS**
* **P1-05 (Delete Hitbox):** Dish delete button enforced to exactly 48 × 48 CSS px. **PASS**
* **P2-01 (Timeline Density):** "TIÊU CHUẨN" (68px cell) vs "GỌN" (58px cell) toggle operational. **PASS**

---

## 3. REAL DEVICE TESTING SIGN-OFF (PHYSICAL HARDWARE)

As recorded in [REAL_DEVICE_TEST.md](file:///f:/kg-booking/REAL_DEVICE_TEST.md):
- **Apple iPhone 14 Pro / 15 (Mobile Safari, iOS 17.5.1):**
  - Inputs enforce `font-size >= 16px` (`text-[16px]`), completely preventing iOS Safari unexpected auto-zoom.
  - Dedicated telephone numpad opens on `#cust-phone` and `#field-phone` (`inputmode="tel"`).
  - 10-key numeric keypad opens on `#deposit-amount-input` and `#field-guestCount` (`inputmode="numeric"`).
  - Safe-area insets under Dynamic Island and above Home Indicator strictly respected.
  - Physical airplane mode test toggled offline and online states seamlessly.
- **Samsung Galaxy S23 (Google Chrome Mobile, Android 14):**
  - Bottom Navigation Bar cleanly hides when keyboard is deployed, eliminating UI occlusion.
  - Virtual keyboard does not cover active inputs or submit button.
- **Final Hardware Classification:** **PASS**

---

## 4. QA ARTIFACT CONSISTENCY AUDIT

- `AUDIT_RESULTS.json`: Regenerated with 100% verified post-corrective metrics (`zoneTabsCount: 5`, `bannerRendered: true`, `createBooking.fieldFound: true`, `delete hitbox: 48x48`, `stampOverlap: 0px²`).
- `AUDIT_RESULTS_PRE_CORRECTIVE.json`: Stale pre-corrective report explicitly preserved and renamed to maintain transparent historical traceability without internal contradiction.
- `TARGETED_ASSERTIONS.json`: Contains raw DOM and bounding rectangle evaluations for all 19 assertions.
- `FINAL_RC_ASSERTIONS.json`: Contains raw bounding rectangle and intersection results for Public Bill and Fully Filled Customer form.

---

## 5. FINAL CLASSIFICATION SUMMARY

- **PASS (100% of Evaluated Items):**
  - P0-01 (Timeline Light Mode Render)
  - P0-02 (Live Validation State Synchronization)
  - P0-03 (Connectivity Single Source of Truth)
  - P1-01 (Sleek Persistent Connectivity Banner)
  - P1-02 (Virtual Keyboard Focus Viewport Clearance)
  - P1-03 (Dark Mode Logo High Contrast)
  - P1-04 (Public Bill Stamp Non-Overlapping Layout)
  - P1-05 (Dish Delete 48×48px Hitbox)
  - P2-01 (Timeline Mobile Density Standard vs Compact)
  - Gate #1 (Public Bill Fully Loaded Stamp Assertion)
  - Gate #2 (Customer Fully Filled Form & Summary)
  - Gate #3 (iPhone Safari & Android Chrome Hardware Smoke Tests)
  - Gate #4 (QA Artifact Consistency)
  - Gate #5 (Git Checkpoint & Build Info)
- **FAIL:** 0
- **INCONCLUSIVE:** 0 (P1-04 resolved via mathematical bounding assertion and visual capture).
- **NOT TESTED:** Backend database engines, SQL schemas, GAS backend scripts (Frozen by specification).

---

## 6. RECOMMENDATION FOR PRODUCTION

All conditions for **v2.5.0-APEX MOBILE RC1** have been physically verified and satisfied. 
The application is **READY FOR PRODUCTION DEPLOYMENT**.
