# Enterprise Upgrade Architecture Plan (enterprise-upgrade-plan.md)

This document describes the transition blueprint for the `kg-booking` application from its current client-heavy, GAS-based backend to a production-grade enterprise architecture.

---

## 1. Current Architecture (Optimized v7.0)

At present, the frontend client (Vue 3/Pinia) performs direct operations on both Google Apps Script (GAS) endpoints and direct AI APIs:
```
+-------------------------------------------------------------+
|                      Vue 3 SPA Client                       |
|  (Rule Engine, Local Candidate Search, Local Bypass Gate)   |
+-------------------------------------------------------------+
          |                        |                 |
          |                        |                 | (Direct API call with
          | (Sync/Data writes)     | (JSON completion) |  client-configured keys)
          v                        v                 v
+------------------+     +------------------+     +--------------------+
|  Google Sheets / |     |    GAS Proxy     |     | AI Providers (e.g. |
|  GAS Database    |     |    (Fallback)    |     | Gemini, Groq, etc) |
+------------------+     +------------------+     +--------------------+
```

### Known Vulnerabilities:
* **Security:** API keys are exposed or saved client-side (`localStorage`).
* **Database Bottlenecks:** Writes to Google Sheets via GAS take between 1.5s and 4.0s. No transaction isolation.
* **Access Control:** UI-only checks for admin features; no server-side enforcement.

---

## 2. Target Architecture

The target architecture moves critical responsibilities (API key containment, database persistence, access control, and logging) to serverless edge workers and a transactional relational database:

```
                  +-----------------------------------+
                  |          Vue 3 SPA Client         |
                  |     (Inactivity Session Timer)    |
                  +-----------------------------------+
                                    |
                                    | (All API / AI requests)
                                    v
                  +-----------------------------------+
                  |      Cloudflare Worker Gateway    |
                  |    (Rate Limiting, Routing, RLS)  |
                  +-----------------------------------+
                         /                     \
                        /                       \
     (AI Requests with Secrets)        (Database Queries)
                      v                           v
             +------------------+       +-------------------+
             |   AI Providers   |       |    PostgreSQL     |
             | (Gemini / Groq)  |       | (Supabase / Neon) |
             +------------------+       +-------------------+
                                                  |
                                                  | (Reporting/Cron Sync)
                                                  v
                                        +-------------------+
                                        |   Google Sheets   |
                                        | (Legacy Reporting)|
                                        +-------------------+
```

---

## 3. Migration Phases

* **Phase 0: Architectural Audit & Scaffolding (Current)**
  * Audit codebase modules and interfaces.
  * Formulate ADR for database selection.
  * Draft database initial SQL migration.
  * Implement feature flags (`VITE_BACKEND_MODE=gas`).
* **Phase 1: AI Gateway Implementation**
  * Deploy Cloudflare AI Gateway Worker.
  * Load API Secrets into Worker Environment.
  * Integrate client-side calling to reroute via Edge Gateway.
* **Phase 2: Database Scaffolding & Dual-Write**
  * Establish Supabase database instance.
  * Create repository layer with `DualWriteBookingRepository`.
  * Enable dual-writing to write to both PostgreSQL and Google Sheets.
  * bookings failing on Sheets are reconciled asynchronously.
* **Phase 3: RBAC & Session Security**
  * Add permission checks in Pinia store.
  * Implement inactivity listeners for auto-logout.
  * Enforce role-based checks inside the Cloudflare Worker Gateway.
* **Phase 4: Self-Learning Pipeline**
  * Implement diff calculations for correction updates.
  * Apply PII masking rules to scrub names/phones.
  * Deploy dynamic few-shot prompt injector.
* **Phase 5: Cutover & Hardening**
  * Set `VITE_BACKEND_MODE=postgres`.
  * Restructure Google Sheets to be a read-only reporting destination.

---

## 4. Rollback Strategy

We maintain a zero-downtime rollback structure via environment feature flags:
* **AI Gateway Failure:** If the AI gateway goes down or becomes unreachable, the client automatically falls back to direct client-side model calling (if debug keys are supplied) or fallback GAS calling.
* **Database Migration Failure:** By keeping the database mode configurable via `VITE_BACKEND_MODE`:
  * If PostgreSQL experiences a outage: Toggle mode to `gas`. The client immediately redirects all reads and writes directly back to Google Sheets via GAS, restoring complete app functionality within minutes.
  * Syncing script is run later to import missings.

---

## 5. Security & Risk Analysis

| Risk | Mitigation | Rollback Plan |
| :--- | :--- | :--- |
| **API Key leakage during Worker transition** | Keys are injected solely via `wrangler secret` on Cloudflare Dashboard; never committed in source code or client configs. | Revoke compromised credentials immediately on the provider console. |
| **Database Sync Mismatch** | Idempotency keys are checked at the repository layer. A nightly reconcile script reports mismatches. | Sheets serves as the database backup. If mismatch is detected, DB values are restored from Sheets. |
| **User Access Privilege Escapes** | CF Worker validates requests against user tokens and roles, rejecting unauthorized actions. | Revert backend workers to mock verification mode. |
