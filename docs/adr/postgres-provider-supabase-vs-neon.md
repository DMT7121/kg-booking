# Architecture Decision Record (ADR): Supabase vs Neon PostgreSQL Provider

## Context & Problem Statement
To resolve performance bottlenecks, daily quota limits, and lack of transaction safety under Google Sheets/GAS, we must migrate `kg-booking` to a relational PostgreSQL database. We evaluate two modern serverless PostgreSQL options: **Supabase** and **Neon**.

---

## Comparison Matrix

| Criteria | Supabase | Neon |
| :--- | :--- | :--- |
| **Database Core** | PostgreSQL | Serverless PostgreSQL (tách Compute/Storage) |
| **Authentication & RBAC**| Built-in Supabase Auth & Row-Level Security (RLS) | None (Requires external auth library/service) |
| **Realtime** | Native PgRealtime (WebSockets) | Requires third-party triggers or long-polling |
| **Admin UI & Tooling** | Rich dashboard, database viewer, table editor | Simple database dashboard, console |
| **Hosting Latency** | Low latency, regional connection pooling | Ultra-low latency, auto-scaling |
| **Connection Pooling** | Integrated PgBouncer / Supavisor | Built-in connection pooling |
| **Vendor Lock-in** | Low (Standard Postgres underneath) | Low (Standard Postgres underneath) |

---

## Evaluation of Options

### Option A: Supabase
* **Pros:**
  * **Out-of-the-box Features:** Includes authentication, Row-Level Security (RLS), and Postgres database. This saves days of developer time since we don't have to build custom user login, sessions, and session verification.
  * **Realtime:** Critical for a restaurant booking app. Supabase allows clients to listen to changes on the `bookings` table via WebSockets, ensuring staff members see updates concurrently.
  * **Management UI:** Non-technical administrators can view and edit database tables easily using the Supabase Table Editor.
* **Cons:**
  * Slightly higher cold start latency for compute containers compared to Neon.

### Option B: Neon
* **Pros:**
  * High-performance serverless architecture: automatically scales down to zero compute resources when inactive, saving costs.
  * Branching: Allows instant schema branching for development and staging, making it excellent for Git-based database migrations.
* **Cons:**
  * Does not provide built-in auth, RLS interfaces, or real-time event broadcasting, meaning we would have to deploy an additional API server or third-party service to manage user sessions and state changes.

---

## Decision & Recommendation
We will adopt **Option A (Supabase)** for the initial phase of the upgrade plan. 

### Rationale:
Supabase offers a complete backend-as-a-service package. By choosing Supabase, we can reuse its built-in session authentication (which maps perfectly to our security requirement of Admin/Manager/Staff roles via metadata/custom claims) and PostgreSQL database features with minimal custom code. This directly aligns with Andrej Karpathy's LLM coding guideline: *Simplicity First - minimum code that solves the problem.*
