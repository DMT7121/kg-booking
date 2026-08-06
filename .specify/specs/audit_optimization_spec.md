# Spec Kit Specification: Webapp Stability & Performance Optimization

## 1. Objective & Scope
Audit the live webapp `https://kg-booking.pages.dev/` and codebase to identify and fix all latent bugs, CSP violations, network CORS fallback failures, and performance bottlenecks.

## 2. Identified Bugs & Requirements
- **SPEC-1 (CSP Violation Fix):**
  - **Issue:** Social Bot tab network requests to `https://graph.facebook.com` fail due to missing domain in Content Security Policy `connect-src`.
  - **Fix:** Add `https://graph.facebook.com` and `https://*.facebook.com` to the CSP meta tag in `index.html`.

- **SPEC-2 (GAS Client CORS & Proxy Fallback Robustness):**
  - **Issue:** Direct fetch to `script.google.com` triggers net::ERR_FAILED on CORS redirects when proxy is unavailable.
  - **Fix:** Route all Google Apps Script calls cleanly through `/api` gateway proxy with proper timeout fallback.

- **SPEC-3 (History List & Filter Performance):**
  - **Issue:** Large order histories trigger re-sorting on every keypress in `filteredHistory`.
  - **Fix:** Debounce filter inputs and memoize sorted history groups.

## 3. Success Criteria
- [ ] Zero CSP connect-src errors when accessing Social Bot or external integrations.
- [ ] 100% pass rate on Vitest suite (`npm run test:run`).
- [ ] Clean build compilation (`npm run build`).
