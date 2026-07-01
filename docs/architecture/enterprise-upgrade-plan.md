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
* **Security:** API keys are currently stored as plaintext in `localStorage` and may be auto-synchronized to GAS. Direct provider calls are a supported BYOK requirement; plaintext persistence and implicit cloud sync are the vulnerabilities.
* **Database Bottlenecks:** Writes to Google Sheets via GAS take between 1.5s and 4.0s. No transaction isolation.
* **Access Control:** UI-only checks for admin features; no server-side enforcement.

---

## 2. Target Architecture

The target architecture keeps user-owned AI keys in an encrypted browser vault while moving database persistence, access control, server-owned secrets, and audit logging to serverless edge workers and a transactional relational database:

```
                         +-------------------------------+
                         |        Vue 3 SPA Client       |
                         | Local cache + encrypted BYOK  |
                         +-------------------------------+
                            |                         |
              local direct AI|                         |authenticated data API
                            v                         v
                   +----------------+       +-------------------------+
                   | AI Providers   |       | Cloudflare API Worker   |
                   +----------------+       | + optional AI fallback  |
                            ^               +-------------------------+
                            |                         |
                   gateway fallback                  v
                                           +-------------------+
                                           |    PostgreSQL     |
                                           +-------------------+
                                                    |
                                            async outbox/queue
                                                    v
                                           +-------------------+
                                           | Google Sheets     |
                                           | reporting only    |
                                           +-------------------+
```

The Vue client also owns an encrypted local BYOK vault and may call supported AI providers directly. The preferred AI path is local rule/cache → direct provider with local key → optional AI Gateway. GAS is not part of the AI path. Booking writes use a local outbox and commit to the primary API/database; Sheets is an asynchronous reporting sink.

---

## 3. Migration Phases

* **Phase 0: Architectural Audit & Scaffolding (Current)**
  * Audit codebase modules and interfaces.
  * Formulate ADR for database selection.
  * Draft database initial SQL migration.
  * Implement feature flags (`VITE_BACKEND_MODE=gas`).
* **Phase 1: Local Key Vault and AI Transport**
  * Migrate plaintext local keys into encrypted IndexedDB storage.
  * Make `local_first` the default and separate local key availability from gateway provider availability.
  * Keep direct provider calls for supported CORS providers.
  * Remove GAS from AI fallback.
* **Phase 2: Optional AI Gateway Implementation**
  * Deploy Cloudflare AI Gateway Worker.
  * Load API Secrets into Worker Environment.
  * Integrate client-side calling to reroute via Edge Gateway.
* **Phase 3: Database Scaffolding & Outbox Migration**
  * Establish Supabase database instance.
  * Create a single primary booking API backed by PostgreSQL.
  * Add a local IndexedDB outbox for optimistic/offline operation.
  * Commit once to the primary database with an idempotency key.
  * Publish Google Sheets updates asynchronously through an outbox/Queue and reconcile failures.
* **Phase 4: RBAC & Session Security**
  * Add permission checks in Pinia store.
  * Implement inactivity listeners for auto-logout.
  * Enforce role-based checks inside the Cloudflare Worker Gateway.
* **Phase 5: Self-Learning Pipeline**
  * Implement diff calculations for correction updates.
  * Apply PII masking rules to scrub names/phones.
  * Deploy dynamic few-shot prompt injector.
* **Phase 6: Cutover & Hardening**
  * Set `VITE_BACKEND_MODE=postgres`.
  * Restructure Google Sheets to be a read-only reporting destination.

---

## 4. Rollback Strategy

We maintain a zero-downtime rollback structure via environment feature flags:
* **AI Gateway Failure:** If the AI gateway goes down, an unlocked local BYOK vault continues with direct provider calls. `gateway_only` users receive an explicit error. The client never falls back to GAS for AI.
* **Database Migration Failure:** By keeping the database mode configurable via `VITE_BACKEND_MODE`:
  * If PostgreSQL/API is unavailable, keep bookings in the local outbox and show an explicit pending-sync state.
  * Roll back to the last signed stable API release. Direct GAS write is an emergency operator-controlled procedure, never an automatic client fallback.
  * Run reconciliation before replaying pending outbox entries.

---

## 5. Security & Risk Analysis

| Risk | Mitigation | Rollback Plan |
| :--- | :--- | :--- |
| **API Key leakage** | Local BYOK keys use the encrypted browser vault; server-owned keys use Worker secrets. Raw keys are never logged or auto-synchronized. | Lock/purge the local vault and revoke the affected provider key. |
| **Database Sync Mismatch** | Primary commit uses idempotency/CAS; Sheets updates use outbox/Queue and reconciliation. | PostgreSQL remains authoritative; replay only verified outbox events. |
| **User Access Privilege Escapes** | API Worker validates signed sessions and permissions for every protected operation. | Fail closed and roll back to the last signed release; never enable mock verification. |
