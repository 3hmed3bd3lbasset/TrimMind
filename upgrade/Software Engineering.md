# Software Engineering.md
## TrimMind / Elite Salon Platform — Full Engineering Audit & Implementation Roadmap

**Document type:** Read-only audit and implementation plan. No code, database, or configuration was modified to produce this document.
**Audience:** An AI coding agent (or human engineer) that will perform the actual implementation in a later, separate pass.
**Scope of scan:** Full repository — `src/` (React/Vite frontend), `server/` (Express/TypeScript backend), `database/` (MySQL schema + seed), `n8n/` (workflow definitions), `docs/` (existing WhatsApp AI docs), and root-level reports (`SECURITY_AUDIT_REPORT.md`, `CLEANUP_REPORT.md`, `PROJECT_WORKFLOW.md`).

> ⚠️ **Critical calibration note before reading further:** This repository already contains three self-authored reports (`SECURITY_AUDIT_REPORT.md`, `CLEANUP_REPORT.md`, `PROJECT_WORKFLOW.md`) that claim the platform is "fully hardened," "Railway ready," and enforces RBAC on "all sensitive endpoints." **Direct inspection of the actual source code shows this is not true.** Several of the specific claims in `SECURITY_AUDIT_REPORT.md` (e.g., "PATCH endpoints for payment review are protected by `requireAuth`/`requireRoles`", "CORS restricted to specific domains") are contradicted by the code as it exists today. This document treats those prior reports as **unverified marketing-style claims**, not evidence, and re-derives every finding directly from source. The implementing agent should not trust the prior reports without re-verification.

---

## 1. Executive Summary

TrimMind is a single-tenant, full-stack barbershop/salon booking platform: React/Vite SPA + Express/TypeScript API + MySQL, with a real-time layer (Socket.io), a WhatsApp channel (Baileys direct-socket integration *and* a separate planned n8n/Evolution-API/Gemini architecture), and an in-browser Gemini-powered "AI Assistant" proxied through the backend.

The codebase is **functionally rich** (booking wizard, VIP flow, live queue/TV display, payment-proof upload, manager/receptionist/barber dashboards, audit log viewer, analytics) but has **severe, exploitable security defects in the exact areas that matter most for a paid-booking, real-money business**: authentication, payment approval, and the WhatsApp channel. Several of these defects allow a completely unauthenticated actor to approve payments, cancel bookings, wipe the business's WhatsApp session, or log in as the salon owner.

The project is currently built and organized as **one specific customer's deployment** (hardcoded branch "الحداد - ELHDAD", hardcoded phone numbers, a hardcoded domain `trimmind.up.railway.app`, hardcoded fallback prices), not as a reusable "one codebase, many deployments" product. Significant configuration-extraction work is required before this can be duplicated for a second customer.

**Bottom line:** The product is not production-ready and is not safe to sell to a first paying customer in its current state. The good news is that the necessary fixes are well-scoped, concentrated in a small number of files, and do not require an architectural rewrite — this is a hardening and configuration-extraction project, not a rebuild.

---

## 2. Project Business Model

Confirmed from `package.json`, `server/src/index.ts`, and deployment docs: this is **one Node.js/Express process that also serves the built React SPA** (`server/src/index.ts` serves `dist/` as static files and falls back to `index.html` for SPA routing), backed by **one MySQL database per deployment**, intended to be deployed once per customer (evidence: hardcoded Railway URL `https://trimmind.up.railway.app`, hardcoded branch/business data, single `.env`/`server/.env` pair).

**Explicit design constraint carried into this document:** Do **not** introduce a `tenant_id` / shared-database multi-tenancy model. Instead, all recommendations below are aimed at:

- Removing hardcoded, customer-specific values from source code into environment/config.
- Making the codebase safely re-deployable (fresh clone → configure `.env` → run migrations → seed → deploy) for a new customer without editing `.ts`/`.tsx` files.
- Keeping each deployment's data, secrets, and WhatsApp session fully isolated (already true at the infrastructure level; the gap is that **business identity is baked into code**, not that data is shared).

---

## 3. Current Architecture

### 3.1 Frontend (`src/`)
- **Stack:** React 18 + Vite + TypeScript, Tailwind CSS, React Router DOM, Zustand (`src/lib/store.ts`, 1,419 lines) for state, TanStack Query is a declared dependency but state is primarily hand-rolled in Zustand, `axios`-based API client (`src/lib/api.ts`), Socket.io client (`src/lib/socket.ts`), `idb-keyval` + `src/lib/sync.ts` for an offline/local-first sync layer.
- **Routing:** `src/App.tsx` (256 lines) defines role-based routes (Landing, Auth, BookingPage, ManagerDashboard, ReceptionistDashboard, BarberDashboard, QueueDisplayPage, TrackBookingPage).
- **Largest components:** `BookingWizard.tsx` (1,273 lines), `AIChatDrawer.tsx` (868 lines), `ReceptionistDashboard.tsx` (871 lines), `TrackBookingModal.tsx` (797 lines), `BarberDashboard.tsx` (649 lines), `BookingRevenuesManager.tsx` (619 lines). These are monolithic page/feature components mixing data-fetching, business logic, and presentation — see §6 Architecture Audit.
- **AI integration:** `src/lib/aiService.ts` (561 lines) builds role-specific prompts client-side and calls the backend `/api/ai/chat` proxy. Client-side "rate limiting" is implemented via `localStorage` (`AI_RATE_LIMIT`, `elite_barber_ai_quota_v2`) — trivially bypassable (see §7 Security Audit, F-09).

### 3.2 Backend (`server/`)
- **Stack:** Express 4 + TypeScript, `mysql2/promise` (connection pool, parameterized queries), `jsonwebtoken` + `bcrypt` (12 rounds), `zod` validators, `helmet`, `cors`, `express-rate-limit`, `sanitize-html`, `socket.io`, `@whiskeysockets/baileys` (direct WhatsApp Web protocol client, not Evolution API), `node-cron` for scheduled jobs, `multer` for uploads.
- **Entry point:** `server/src/index.ts` — wires middleware, mounts routes, starts Socket.io, cron cleanup, WhatsApp init, and serves the built frontend from the same port/process.
- **Route modules:** `auth`, `bookings`, `queue`, `branches`, `barbers`, `chairs`, `services`, `products`, `settings`, `upload`, `audit`, `ai`, `agentTools` (mounted at **both** `/api/agent-tools` and `/api/whatsapp`), `whatsappSession`.
- **Service modules:** `auth.service.ts`, `booking.service.ts`, `queue.service.ts`, `cleanup.service.ts`, `reminder.service.ts`, `whatsapp.service.ts` (390 lines, Baileys session lifecycle + message send/receive).
- **Realtime:** `server/src/socket/realtime.ts` — Socket.io rooms per branch (`branch_<id>`, `display_<id>`), no authentication on socket connections.

### 3.3 Database (`database/schema.sql`, `database/seed.sql`)
MySQL/InnoDB, 14 tables: `branches`, `profiles`, `barbers`, `chairs`, `services`, `products`, `bookings`, `booking_items`, `payment_proofs`, `ratings`, `queue_entries`, `audit_logs`, `settings`, `login_attempts`. Foreign keys and basic indexes exist (`idx_customer_phone`, `idx_branch_date_queue`, `idx_status`, `idx_starts_at`). **No unique constraint exists on `(branch_id, booking_date, queue_number)`**, and no `financial_records` table exists in `schema.sql` even though `server/src/routes/bookings.routes.ts` inserts into it — see §9 Database Audit, F-DB-04.

### 3.4 AI Architecture (current, in-app)
```
Customer/Staff (browser)
   → src/lib/aiService.ts (builds role-specific system prompt + conversation, client-side)
   → POST /api/ai/chat  (server/src/routes/ai.routes.ts — NO AUTH)
   → Google Gemini generateContent REST API (server selects API key by `role` field sent by the CLIENT)
   ← plain text response, no tool-calling, no backend business logic in the loop
```
This is **not** the "AI → Tool → Backend → Business Logic → Database" architecture required by the business (Step 8 of the audit brief). The in-app AI Assistant is currently a **stateless text-completion proxy** — it cannot check availability, create bookings, or read real data; based on the code, any "actions" it appears to take are handled by client-side heuristics in `aiService.ts`/`store.ts`, not real tool calls. See §11 AI Audit.

### 3.5 WhatsApp Architecture (current vs. planned — two different systems coexist)
There are **two separate, uncoordinated WhatsApp integrations** in this repository:

1. **Live in the Express backend:** `server/src/services/whatsapp.service.ts` uses `@whiskeysockets/baileys` to run a direct WhatsApp-Web protocol session **inside the Node process itself**, exposed via `server/src/routes/whatsappSession.routes.ts` (QR/pairing/reset/send) and used by `booking.service.ts`/`bookings.routes.ts` to push templated Arabic notification messages (booking created, confirmed, completed, cancelled). It also forwards inbound messages to an n8n webhook (`N8N_WEBHOOK_URL`, hardcoded fallback `https://n8n-server-production-bdce.up.railway.app/webhook/whatsapp-webhook`).
2. **Documented but not wired into the running server:** `docs/WHATSAPP_AI_ARCHITECTURE.md` and `n8n/workflows/*.json` describe a **different** target architecture: `Customer → WhatsApp → Evolution API → n8n → Gemini Agent → Tools → Backend → Database`, i.e., no Baileys socket in the app server at all, no in-process WhatsApp session.

**Finding (Architecture, F-AR-06):** The codebase has not converged on one WhatsApp architecture. The Baileys-in-Express approach is fragile (a single Node process now owns a stateful, unofficial WhatsApp session that cannot be horizontally scaled, survives poorly across redeploys — `AUTH_DIR` is local disk — and is invisible to n8n's own dedup/idempotency logic), while the documented Evolution API design is not implemented. This must be resolved as a Phase 1 architecture decision (see §21).

---

## 4. System Inventory

Classification legend: **EXISTS**, **PARTIALLY IMPLEMENTED**, **BROKEN**, **MISSING**, **PLANNED**, **UNVERIFIED**.

| # | Subsystem | Status | Evidence / Notes |
|---|---|---|---|
| 1 | Authentication | **BROKEN** | `server/src/services/auth.service.ts` contains a universal password backdoor (`Admin@123456`/`admin123456` authenticate as ANY matched account, not just the manager) and hardcoded phone/email super-admin identifiers. JWT is otherwise correctly implemented (bcrypt 12 rounds, signed JWT, httpOnly cookie). |
| 2 | Authorization / RBAC | **BROKEN** | `requireRoles`/`requireAuth` exist and are used correctly on most `/api/*` CRUD routes (`barbers`, `branches`, `chairs`, `services`, `products`, `settings`, `audit`), but the two most sensitive endpoints in the whole system — `PATCH /api/bookings/:id/status` and `PATCH /api/bookings/:id/payment-proof` — use only `optionalAuth`, i.e., **no authentication or role check at all**. |
| 3 | Manager | **EXISTS** | `ManagerDashboard.tsx` + `src/components/manager/*` (Branch/Barber/Service/Product/Chair/Receptionist/Manager managers, Analytics, Audit log viewer, AI Config Studio, Settings). Backend CRUD routes exist and are role-gated. |
| 4 | Receptionist | **EXISTS** | `ReceptionistDashboard.tsx`, `BookingsTable`, `QueueList`, `ChairGrid`, `PaymentProofModal`, `WalkInModal`, `AddOrderModal`, `ThermalInvoice`. |
| 5 | Captain/Barber | **EXISTS** | `BarberDashboard.tsx` (649 lines) — queue calling, "call next customer" (`queue.service.ts`). |
| 6 | Customer management | **PARTIALLY IMPLEMENTED** | Customers are not first-class accounts; identified by phone number only (`profiles.role='customer'` is defined in schema but the app largely tracks customers as denormalized fields on `bookings`). No customer profile CRUD UI/API found. |
| 7 | Services | **EXISTS** | `services` table + `server/src/routes/services.routes.ts` (manager-gated CRUD), `ServiceCard.tsx`, `ServiceManager.tsx`. |
| 8 | Branches | **EXISTS** | `branches` table + `branches.routes.ts`, `BranchManager.tsx`. Only one branch is realistically supported end-to-end today — hardcoded `branch-elhdad` fallback appears throughout `booking.service.ts` and `agentTools.routes.ts`. |
| 9 | Normal booking | **EXISTS**, with integrity gaps | `BookingWizard.tsx` → `POST /api/bookings` → `booking.service.ts::createBooking`. See §9/§10 for race-condition and error-swallowing defects. |
| 10 | VIP booking | **PARTIALLY IMPLEMENTED** | `bookingType: 'vip'` is a field, not a separate flow; VIP-specific double-booking protection referenced in `SECURITY_AUDIT_REPORT.md` ("منع الحجز المزدوج… لنفس الكابتن") was **not found** in `booking.service.ts` — UNVERIFIED/likely aspirational claim. |
| 11 | Queue | **PARTIALLY IMPLEMENTED** | `queue.service.ts::getBranchQueue`/`callNextCustomerForBarber` work but are not transactional (race condition, see F-DB-01). `queue_entries` table exists but is not populated by `createBooking` (bookings are queued via `bookings.status` + `queue_number`, not via `queue_entries` inserts) — table appears to be **dead/unused** (UNVERIFIED — requires confirmation from a runtime trace, but no `INSERT INTO queue_entries` was found in the service/route code, only a `DELETE` in `cancelBooking`). |
| 12 | Waiting screen | **EXISTS** | `QueueDisplayPage.tsx` (443 lines), socket-driven live TV board. |
| 13 | Chair assignment | **PARTIALLY IMPLEMENTED** | `chairs` table + `chairs.routes.ts`; assignment logic in `queue.service.ts` is a simple SELECT-then-UPDATE with no locking. |
| 14 | Payment/deposit | **PARTIALLY IMPLEMENTED** | Deposit amounts are computed server-side from `settings` in most paths, but `createBooking` also accepts a client-supplied `totalAmount` and stores it as `total_at_booking` **without cross-validating** it against `servicePrice + itemsTotal` (see F-SEC-08). |
| 15 | Payment proof | **EXISTS** | Upload via `POST /api/upload`, stored in `payment_proofs`, reviewed via `PATCH /api/bookings/:id/payment-proof`. |
| 16 | Payment approval | **BROKEN (Critical)** | The approval endpoint (`PATCH /api/bookings/:id/payment-proof`) has **no authentication**, contradicting the required "AI must never approve payments; only reception/manager review" business rule — currently *no one* is required to review anything; any HTTP client can approve or reject. |
| 17 | Invoices | **EXISTS** | `ThermalInvoice.tsx` (171 lines) — client-side receipt rendering, no PDF generation found. |
| 18 | Financial dashboard | **PARTIALLY IMPLEMENTED** | `BookingRevenuesManager.tsx`, `AnalyticsCharts.tsx` read from `bookings`/`financial_records`, but `financial_records` table is **not defined in `database/schema.sql`** while it is inserted into from `bookings.routes.ts` — a schema/code mismatch that will throw or (given `query()`'s error-swallowing) silently no-op in production (see F-DB-04). |
| 19 | AI Assistant | **PARTIALLY IMPLEMENTED** | Text-only Gemini proxy, no tool-calling, no backend data access, unauthenticated endpoint, client-controlled system prompt (see §11). |
| 20 | WhatsApp AI | **PARTIALLY IMPLEMENTED / architecturally conflicted** | Baileys-based sending exists and works for outbound templated messages; the full conversational AI-agent-with-tools loop described in `docs/WHATSAPP_AI_ARCHITECTURE.md` and `n8n/workflows/*.json` is **designed but not connected** to a running Evolution API instance in this repo (no Evolution API config found). |
| 21 | Notifications | **PARTIALLY IMPLEMENTED** | `NotificationBell.tsx` (305 lines) exists client-side; a `notifications` table is referenced in `PROJECT_WORKFLOW.md` but **does not exist** in `database/schema.sql` — UNVERIFIED/likely stale doc claim or client-only/local notification state. |
| 22 | Realtime features | **EXISTS**, unauthenticated | Socket.io rooms broadcast full booking payloads (including customer name/phone) to any client that joins a `branch_<id>` room — no auth check on `join_branch`. |
| 23 | Database | **EXISTS**, with integrity gaps | MySQL InnoDB with FKs; missing constraints noted above; the shared `query()` helper swallows all errors (see F-DB-02). |
| 24 | Logging | **PARTIALLY IMPLEMENTED** | `pino` is a declared dependency but not wired up anywhere found in `server/src` (grep found no `pino(` instantiation outside `node_modules`); actual logging is ad hoc `console.log`/`console.warn`/`console.error`. |
| 25 | Audit logs | **PARTIALLY IMPLEMENTED** | `audit_logs` table + `audit.routes.ts` (manager-only read) exist and are written to from `auth.service.ts`, `booking.service.ts`, `bookings.routes.ts` — but many writes are wrapped in `.catch(() => {})`/`try{}catch{}` that silently discard failures, so the "immutable audit trail" is not guaranteed to be complete. |
| 26 | Security | **BROKEN (Critical)** | See §7 in full — CORS effectively allows any origin with credentials, agent-tools auth is bypassable by omitting a header, WhatsApp session endpoints are fully public, hardcoded auth backdoor, real API keys committed to `server/.env`. |
| 27 | Deployment | **PARTIALLY IMPLEMENTED** | Single-command Railway build/start exists (`npm run build:all` / `npm start`), but no Dockerfile for the main app (only `n8n/Dockerfile` exists), no CI, no automated migrations (schema is applied by hand via `database/schema.sql`), no documented backup/restore procedure. |
| 28 | Testing | **MISSING** | No test files, no test runner configured in either `package.json`. `npm run lint` exists (`eslint .`) but no test script. |

---

## 5. Feature Inventory

| Feature | Frontend | Backend | Notes |
|---|---|---|---|
| Landing/marketing page | `Landing.tsx` | — | Public |
| Auth (staff login) | `AuthPage.tsx` | `auth.routes.ts` | See auth backdoor finding |
| Customer booking wizard | `BookingWizard.tsx` | `bookings.routes.ts`, `booking.service.ts` | Normal + VIP |
| Booking tracking (public) | `TrackBookingPage.tsx`, `TrackBookingModal.tsx` | `GET /api/bookings/track` | Public, phone/ID/token search |
| Payment proof upload | `PaymentProofModal.tsx` | `POST /api/upload`, `PATCH /:id/payment-proof` | Approval unauthenticated (critical) |
| Queue / live board | `QueueDisplayPage.tsx`, `QueueList.tsx` | `queue.routes.ts`, `socket/realtime.ts` | Unauthenticated socket rooms |
| Manager dashboards (Branch/Barber/Service/Product/Chair/Receptionist/Manager) | `src/components/manager/*` | respective `*.routes.ts` | Role-gated correctly |
| Analytics/revenue | `AnalyticsCharts.tsx`, `BookingRevenuesManager.tsx` | reads `bookings`, `financial_records` | `financial_records` missing from schema |
| Audit log viewer | `AuditLogViewer.tsx` | `audit.routes.ts` | Manager-only, correctly gated |
| AI Chat (in-app) | `AIChatDrawer.tsx`, `aiService.ts` | `ai.routes.ts` | Unauthenticated proxy, client-controlled prompt/role |
| WhatsApp session admin | (no dedicated manager UI found referencing `/api/whatsapp-session`) | `whatsappSession.routes.ts` | Fully unauthenticated backend endpoints — see Security Audit |
| WhatsApp agent tools (booking via chat) | n/a (external n8n) | `agentTools.routes.ts` | Auth bypassable when header omitted |
| Ratings | `RatingModal.tsx` | `POST /:id/rate` | No auth required (acceptable for customer-facing) but no verification the rater actually is the booking's customer (IDOR: any bookingId can be rated by anyone once) |
| Cleanup cron | — | `cleanup.service.ts` | Purges old payment-proof images |
| Reminder cron | — | `reminder.service.ts` | Appointment reminders via WhatsApp |

---

## 6. Architecture Audit

### F-AR-01 — Monolithic "God components" on the frontend
**Evidence:** `BookingWizard.tsx` (1,273 lines), `store.ts` (1,419 lines), `AIChatDrawer.tsx` (868 lines), `ReceptionistDashboard.tsx` (871 lines), `agentTools.routes.ts` (1,171 lines).
**Problem:** Business logic (pricing, queue math, WhatsApp message templating, Gemini prompt construction) is interleaved with UI/routing code inside these files. This makes unit testing near-impossible without heavy mocking, and any change (e.g., a new payment method) requires touching a 1,000+ line file.
**Recommended change:** Extract pure functions (pricing calculation, phone normalization, queue-number assignment, WhatsApp message templates) into dedicated modules under `src/lib/pricing.ts`, `src/lib/phone.ts`, and `server/src/services/notifications/templates.ts` respectively, each independently unit-testable. Do this incrementally per Phase, not as a big-bang rewrite.

### F-AR-02 — Duplicated / drifted business logic between `booking.service.ts` and `agentTools.routes.ts`
**Evidence:** `createBooking`/`cancelBooking`/`getBookingById` in `booking.service.ts` are imported and reused by `agentTools.routes.ts` (good — no duplication there), but `agentTools.routes.ts` maintains its **own** in-memory `liveSyncedState` (hardcoded branches/services/barbers, lines ~95–240) that duplicates data already in MySQL (`branches`, `services`, `barbers` tables) and can drift out of sync with the database (e.g., if a manager edits a service price via `ServiceManager.tsx`, WhatsApp-originated bookings using `liveSyncedState` may keep quoting the old price).
**Recommended change:** Remove the hardcoded `liveSyncedState` object entirely; have `agentTools.routes.ts` read branches/services/barbers from MySQL through the same query helpers used elsewhere. Keep `liveSyncedBookings` only as a short-lived write-behind cache (with a documented TTL and a background flush-to-DB job), not as a source of truth.

### F-AR-03 — Circular/dynamic coupling between `booking.service.ts` and `agentTools.routes.ts`
**Evidence:** `booking.service.ts::cancelBooking` does `const { liveSyncedBookings } = await import('../routes/agentTools.routes.js')` — a **route file exporting mutable application state** that a **service file** depends on via dynamic import.
**Problem:** This inverts the normal dependency direction (routes should depend on services, not vice versa) and makes `agentTools.routes.ts` a de facto second data layer.
**Recommended change:** Move `liveSyncedBookings` (or its replacement, a proper write-behind cache) into its own module, e.g., `server/src/services/liveCache.service.ts`, imported by both routes and services without circular references.

### F-AR-04 — `query()` helper silently swallows all database errors
**Evidence:** `server/src/config/database.ts`:
```ts
export async function query<T = any>(sql: string, params: any[] = []): Promise<T> {
  try {
    const [results] = await pool.execute(sql, params);
    return results as T;
  } catch (err: any) {
    console.warn(`[DB Query Notice]: ${err?.message || err}`);
    return [] as unknown as T;
  }
}
```
**Problem:** Every single call site in the entire backend receives `[]` on any SQL error (syntax error, constraint violation, connection loss, deadlock) — indistinguishable from "zero rows found." Combined with the many `.catch(() => {})` wrappers around `query(...)` calls in `bookings.routes.ts` and `booking.service.ts`, this means **write failures are invisible**: the API can return `success: true` to the client while the actual `INSERT`/`UPDATE` silently failed. This is the single most impactful architectural defect for data integrity in the whole codebase — it undermines every other correctness guarantee.
**Recommended change:** `query()` must re-throw on error (or return a discriminated result type `{ ok: true, rows } | { ok: false, error }` and force call sites to handle it). All `.catch(() => {})` swallowing around write operations that affect booking/payment state must be replaced with proper error propagation, and the route handler must return a 5xx to the client when a write fails. This is a **prerequisite** for essentially every other correctness fix in this document — implement it in Phase 1.

### F-AR-05 — Hardcoded business identity throughout backend and frontend
**Evidence:** `'branch-elhdad'`, `'الحداد - ELHDAD'`, `'01005437633'`, `'srv-haircut'`, price `180`, domain `https://trimmind.up.railway.app` appear as literals in `booking.service.ts`, `agentTools.routes.ts`, `bookings.routes.ts`, `whatsapp.service.ts`.
**Problem:** Directly blocks the "one codebase, many deployments" business model — duplicating this product for a second salon today requires editing and redeploying source code, not just changing environment variables.
**Recommended change:** See §20 (Recommended Target Architecture) and §16 (DevOps Audit) — introduce a `deployment.config.ts` (or DB-backed `settings` row) that supplies default branch ID, default service, business name, public tracking URL base, and default phone, all sourced from environment variables at boot, with no salon-specific literals left in `.ts`/`.tsx` files.

### F-AR-06 — Two incompatible WhatsApp architectures coexist
Covered in §3.5. **Recommended change:** Pick one architecture (recommendation: the documented Evolution API + n8n + Gemini design, since it is already partially built out in `n8n/workflows/*.json` and is more operationally sound than an in-process Baileys socket) and remove or clearly mark the other as deprecated. See Phase 8.

---

## 7. Security Audit

Each finding includes Severity (P0=critical/must-fix-before-selling, P1=high, P2=medium, P3=low), Evidence, Risk, Recommended Fix, and Priority.

### F-SEC-01 — Universal authentication backdoor (P0)
**Evidence:** `server/src/services/auth.service.ts`, `authenticateStaff()`:
```ts
let isMatch = await verifyPassword(plainPassword, user.password_hash || user.password);
if (!isMatch) {
  isMatch =
    plainPassword === 'Admin@123456' ||
    plainPassword === 'admin123456' ||
    plainPassword === envManagerPassword;
}
```
This fallback runs for **any** matched user record (manager, receptionist, barber, customer profile) — not only for the manager identifier branch above it.
**Risk:** Anyone who knows (or guesses/leaks — these are extremely common default strings) `Admin@123456` or `admin123456` can log in as **any existing account**, including the manager/super-admin, simply by supplying a valid identifier (email/phone) with either of those two passwords. Combined with the separate super-admin bypass block (hardcoded phone numbers `01285694670`, `01005437633`, `01011122233`, email `admin@salon.com`, and `cleanId.includes('manager')` as an identifier match), this is a full authentication bypass into the highest-privilege role.
**Fix:** Remove all hardcoded password fallbacks and hardcoded identifier allow-lists from `authenticateStaff()`. Authentication must be exactly: look up the user by email/phone, then `bcrypt.compare` against `password_hash`. Seed the first manager account via `server/src/scripts/seed.ts` using a value read from `MANAGER_PASSWORD` env var (hashed at seed time), never compared in plaintext at login time. Add an integration test asserting login fails for any password other than the correct bcrypt hash match.
**Priority:** Immediate — this alone makes the platform unsafe to operate.

### F-SEC-02 — Payment approval endpoint has no authentication (P0)
**Evidence:** `server/src/routes/bookings.routes.ts`, line ~307:
```ts
router.patch('/:id/payment-proof', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { status, reason } = req.body; // status: 'approved' | anything else -> 'rejected'
  ...
```
`optionalAuth` populates `req.user` if a token is present but **does not reject the request if it is absent**, and the handler never checks `req.user` before acting.
**Risk:** Any unauthenticated HTTP client can `PATCH /api/bookings/{id}/payment-proof` with `{"status":"approved"}` and instantly confirm a booking without any payment ever being verified by staff — the exact outcome Step 10 of the audit brief explicitly prohibits ("AI must NEVER independently approve payment"). This is worse than an AI approving payment: it is *anyone on the internet* approving payment.
**Fix:** Change middleware to `requireAuth, requireRoles('receptionist','manager')`. Add `requireBranchAccess` so a receptionist can only approve bookings for their own branch. Add an audit log entry recording the approving user's id (already partially present) and reject if `req.user` is absent.
**Priority:** Immediate, P0.

### F-SEC-03 — Booking status transition endpoint has no authentication (P0)
**Evidence:** `server/src/routes/bookings.routes.ts`, `PATCH /:id/status` uses `optionalAuth` only. This endpoint can set any booking to `confirmed`, `completed`, `cancelled`, `no_show`, etc., and on `confirmed` it writes a `financial_records` revenue row and sends a "your payment was approved" WhatsApp message to the customer.
**Risk:** Same class as F-SEC-02 — unauthenticated confirmation/cancellation/completion of any booking, unauthenticated creation of "phantom revenue" records, and unauthenticated triggering of outbound WhatsApp messages to customers (spam/abuse vector; also fabricated "your booking is confirmed" messages could be used to defraud customers).
**Fix:** `requireAuth, requireRoles('receptionist','manager','barber')` with role-specific transition rules (e.g., only `barber`/`receptionist` can set `in_service`/`completed`; only `receptionist`/`manager` can set `confirmed`/`rejected`). Add `requireBranchAccess`.
**Priority:** Immediate, P0.

### F-SEC-04 — Agent Tools API authentication is bypassable by omitting the header (P0)
**Evidence:** `server/src/routes/agentTools.routes.ts`:
```ts
function requireAgentAuth(req, res, next) {
  const providedKey = (secretHeader as string) || bearerToken;
  if (providedKey && providedKey !== AGENT_API_SECRET) {
    res.status(401).json(...); return;
  }
  next(); // <-- runs when providedKey is falsy, i.e., NO KEY PROVIDED
}
```
This router is mounted at **both** `/api/agent-tools` **and** `/api/whatsapp` in `server/src/index.ts`.
**Risk:** Simply not sending `x-agent-secret`/`x-api-key`/`Authorization` at all passes the check. Every endpoint behind it — customer PII lookup (`/customer/lookup`), booking creation (`/bookings/create-pending`), booking cancellation (`/bookings/cancel`), reschedule, payment-proof submission, queue position — is reachable **without any credential** by any internet client hitting `/api/whatsapp/...` or `/api/agent-tools/...` directly.
**Fix:**
```ts
if (!providedKey || providedKey !== AGENT_API_SECRET) {
  res.status(401).json({ success: false, error: 'Unauthorized' });
  return;
}
```
Also remove the hardcoded fallback secret `'trim-mind-agent-secret-key-2026'` — the server must fail to start (or log a loud startup warning and refuse these routes) if `AGENT_API_SECRET` is not set in the environment. Use `crypto.timingSafeEqual` for the comparison to avoid timing attacks.
**Priority:** Immediate, P0.

### F-SEC-05 — WhatsApp session management endpoints are completely unauthenticated (P0)
**Evidence:** `server/src/routes/whatsappSession.routes.ts` — `/status`, `/get-qr`, `/pair`, `/reset`, `/send`, `/qr`, `/page` have **no middleware at all**, and are mounted directly in `server/src/index.ts` with no `requireAuth`.
**Risk (severe, multi-fold):**
1. `POST /api/whatsapp-session/reset` lets anyone destroy the live WhatsApp session (`fs.rmSync(AUTH_DIR, ...)`), causing a denial of service on the entire customer-notification channel.
2. `POST /api/whatsapp-session/get-qr` internally calls `resetWhatsAppSession()` **unconditionally**, so simply requesting a QR code tears down an already-connected session — an unauthenticated user can repeatedly disrupt the live channel.
3. `GET /api/whatsapp-session/get-qr` / `/pair` expose a valid QR code / pairing code that, if scanned/used by an attacker, **links the attacker's phone as the authenticated WhatsApp device for the business account**, giving them the ability to read and send messages as the business.
4. `POST /api/whatsapp-session/send` lets anyone send arbitrary WhatsApp messages "from" the business number to any phone number — spam/phishing/reputational and potential WhatsApp Business API ban risk.
**Fix:** `requireAuth, requireRoles('manager')` on every route in this file, with no exceptions. Additionally, `get-qr`/`pair` should never silently reset an already-connected session — require an explicit `force: true` body flag plus manager role, and log the action to `audit_logs`.
**Priority:** Immediate, P0.

### F-SEC-06 — CORS effectively allows any origin, with credentials enabled (P0)
**Evidence:** `server/src/config/security.ts`:
```ts
export const corsMiddleware = cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    callback(null, true); // <-- always allows, regardless of `origin`
  },
  credentials: true,
  ...
});
```
The `allowedOrigins` array above it is defined but **never referenced** in the callback — dead code creating a false impression of a restriction.
**Risk:** Because `credentials: true` is combined with reflecting/allowing any origin, any malicious website can make authenticated `fetch()` calls (including the `auth_token` cookie) against this API from a victim's browser if the victim is logged in — a textbook CSRF-via-CORS misconfiguration, undermining the `httpOnly`+`SameSite=lax` cookie protections elsewhere.
**Fix:**
```ts
const allowedOrigins = (process.env.ALLOWED_ORIGINS || clientUrl).split(',').map(s => s.trim());
origin: (origin, callback) => {
  if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
  return callback(new Error('Not allowed by CORS'));
}
```
Populate `ALLOWED_ORIGINS` per deployment from environment variables so each customer deployment only trusts its own domain.
**Priority:** Immediate, P0.

### F-SEC-07 — Real third-party API keys and JWT secret committed to the repository (P0)
**Evidence:** `server/.env` (committed, not `.env.example`) contains a live-looking `JWT_SECRET` value and four Gemini API keys (`GEMINI_API_KEY_CUSTOMER/MANAGER/RECEPTIONIST/BARBER`) in cleartext.
**Risk:** Anyone with access to this archive/repository — including this audit's execution environment — has the current production/development secrets. If this repository is ever pushed to a shared or public Git host, these credentials are permanently compromised (Git history retains them even if deleted later).
**Fix (must happen regardless of how this file reached the repo):**
1. Rotate all four Gemini API keys in Google AI Studio / Cloud Console immediately.
2. Rotate `JWT_SECRET` (this will invalidate all existing sessions — coordinate with a deployment window).
3. Remove `server/.env` (and root `.env` if it ever contains secrets) from version control; ensure `.gitignore` covers `**/.env` (verify — `.gitignore` should already list this; confirm during implementation).
4. If this repository has any git history, scrub the secrets from history (`git filter-repo` or BFG) — UNVERIFIED whether a `.git` directory exists in this archive; confirm during implementation.
5. Move to a secrets manager (Railway/hosting provider's environment variable store) for every deployment; never store real secrets in a file that ships in a zip/repo handed to a third party (including AI coding agents).
**Priority:** Immediate, P0 — treat as an active incident, not a backlog item.

### F-SEC-08 — Client-supplied `totalAmount` is trusted without server-side recomputation (P1)
**Evidence:** `server/src/services/booking.service.ts::createBooking`:
```ts
const total = payload.totalAmount || (servicePrice + itemsTotal);
```
`servicePrice`/`itemsTotal` are computed from DB-fetched prices (good), but if the client sends any truthy `totalAmount`, it wins outright with no comparison/validation against the computed value.
**Risk:** A customer can submit a booking with an inflated fake total (to make a small deposit look proportionally correct) or a deflated total, corrupting revenue reporting (`BookingRevenuesManager.tsx`, `AnalyticsCharts.tsx`) and creating a discrepancy between what staff expect to collect and what is recorded.
**Fix:** Always compute `total = servicePrice + itemsTotal` server-side; ignore `payload.totalAmount` entirely, or if kept for backward compatibility, validate `Math.abs(payload.totalAmount - computedTotal) < 0.01` and reject (400) on mismatch.
**Priority:** High — fix in the same phase as F-SEC-01/02/03 since it touches the same file.

### F-SEC-09 — Client-side-only AI usage quota and role selection (P1)
**Evidence:** `src/lib/aiService.ts` enforces the 12-messages/10-minutes quota via `localStorage`; `server/src/routes/ai.routes.ts::/chat` accepts `role` directly from the request body to select which Gemini API key/context to use, with no auth and no server-side rate limiting beyond the generic 120/min `apiLimiter`.
**Risk:** Trivial to bypass the quota (clear `localStorage`, or call the API directly) and to select `role: "manager"` from an unauthenticated request, potentially exposing manager-oriented system prompts/context and consuming a different (potentially higher-cost or higher-privilege) API key/budget. Also enables **unrestricted prompt injection**: `systemInstruction` is taken verbatim from the client and forwarded to Gemini, so a user can override the assistant's intended persona/guardrails entirely.
**Fix:** Require `requireAuth` for `role` values other than `customer`; derive `role` from `req.user.role` server-side rather than trusting the request body for authenticated users. For anonymous `customer` chat, enforce a server-side rate limit keyed by IP/session (Redis or DB-backed) instead of relying on the client. Do not accept an arbitrary client-supplied `systemInstruction` — construct it entirely server-side from a fixed template plus safe, whitelisted variables (customer name, branch name).
**Priority:** High.

### F-SEC-10 — Unauthenticated Socket.io rooms leak customer PII in real time (P1)
**Evidence:** `server/src/socket/realtime.ts` — `join_branch`/`join_display` accept any `branchId` from any connected socket with no auth; `broadcastToBranch` emits full booking objects (`customer_name`, `customer_phone`, etc.) via `BOOKING_CREATED`/`SYNC_STATE`/`CUSTOMER_CALLED` events.
**Risk:** Anyone who opens a WebSocket connection to the server and emits `join_branch` with a guessed/known branch id receives a live stream of customers' names and phone numbers — a PII leak with no authentication barrier.
**Fix:** Require the `auth_token` cookie/JWT on socket handshake (`io.use((socket, next) => {...})`), validate role, and restrict `join_branch` to staff of that branch (or the TV-display device, authenticated with a separate long-lived display token). For the public-facing TV queue display, emit a **reduced-PII** event (first name only or "Customer #3", no phone number) rather than the full booking record.
**Priority:** High.

### F-SEC-11 — File upload accepts client-declared MIME type only, no content verification (P2)
**Evidence:** `server/src/routes/upload.routes.ts` `fileFilter` checks `file.mimetype` (attacker-controlled multipart header), not the file's actual magic bytes/content.
**Risk:** An attacker can upload a file with a spoofed `Content-Type: image/png` header containing arbitrary content (e.g., a polyglot or an HTML file with an image extension). `helmet`'s `noSniff: true` mitigates browser MIME-sniffing XSS somewhat, but there's no defense-in-depth content validation, and `crossOriginResourcePolicy: 'cross-origin'` plus a fully public `/uploads` static mount increases exposure surface.
**Fix:** After multer saves the file, validate actual content using a magic-byte library (e.g., `file-type`) and reject/delete the file if the detected type isn't one of the allowed image types. Consider re-encoding uploaded images server-side (e.g., via `sharp`) to strip any embedded payload before serving them.
**Priority:** Medium.

### F-SEC-12 — No account lockout / brute-force enforcement despite logging attempts (P2)
**Evidence:** `login_attempts` table is written to (`recordLoginAttempt` in `auth.service.ts`) but **never read** anywhere in the codebase (`grep -rn "login_attempts"` finds only the schema definition and the one `INSERT`). The only brute-force mitigation is the generic `authLimiter` (10 requests/15 min **per IP**, not per account).
**Risk:** An attacker distributing login attempts across many IPs (or a single IP within the 10/15min budget, repeated indefinitely every 15 minutes) can brute-force a specific account's password indefinitely, since there is no per-identifier lockout.
**Fix:** Add a query against `login_attempts` (count failed attempts for the given `identifier` in the last N minutes) and reject login attempts once a threshold is exceeded, independent of IP. Purge/rotate old rows via the existing cleanup cron.
**Priority:** Medium.

### F-SEC-13 — Rating endpoint has no ownership/ID-guessing protection (P3)
**Evidence:** `POST /api/bookings/:id/rate` has no auth and no check that the caller is the actual customer of that booking beyond knowing the `id`.
**Risk:** Booking IDs are short (`BK-####`, 4 digits — see F-DB-01) and guessable; anyone can submit or overwrite a rating for someone else's booking.
**Fix:** Require the request to include the booking's `secure_token` (already generated per booking) rather than only the numeric ID, and validate it server-side before accepting a rating.
**Priority:** Low–Medium.

### F-SEC-14 — Stale/inaccurate self-reported security documentation (P3, process risk)
**Evidence:** `SECURITY_AUDIT_REPORT.md` asserts protections (RBAC on all sensitive endpoints, restricted CORS) that F-SEC-02/03/06 above directly contradict.
**Risk:** Not a runtime vulnerability by itself, but a **process risk**: stakeholders and future engineers (human or AI) may trust this document instead of the code, reintroducing or failing to notice regressions.
**Fix:** Delete or clearly mark `SECURITY_AUDIT_REPORT.md`, `CLEANUP_REPORT.md`, and `PROJECT_WORKFLOW.md` as historical/unverified once the fixes in this document are implemented, and regenerate an accurate report only after the fixes are verified by tests (§17).
**Priority:** Low, but do it as part of Phase 2 hygiene.

---

## 8. Database Audit

### F-DB-01 — Booking primary key generation is weak and collision-prone
**Evidence:** `booking.service.ts`: `` `BK-${Math.floor(1000 + Math.random() * 9000)}` `` when no ID is supplied by the caller — only 9,000 possible values, generated without checking for existing collisions before insert.
**Risk:** At even moderate volume, two bookings will eventually be assigned the same ID. Because `id` is the table's `VARCHAR(64) PRIMARY KEY`, the second `INSERT` will throw a duplicate-key error — which, due to F-AR-04 (`query()` swallowing errors) and the `try { ... } catch (dbErr) { console.warn(...) }` wrapper around the insert block, will be **silently absorbed**, meaning the second customer's booking is never actually persisted even though the API returns success and even sends them a WhatsApp confirmation with a booking ID that doesn't exist in the database (or belongs to someone else's row, since a subsequent `getBookingById(bookingId)` would fetch the *other* customer's booking).
**Fix:** Use a UUID (already used elsewhere, e.g., `uuidv4()`) or a properly incrementing per-branch sequence generated inside a transaction with `SELECT ... FOR UPDATE`, and surface a real 500 error / retry to the client on a genuine collision instead of silently continuing. Prerequisite: fix F-AR-04 first.
**Validation:** Add a unit test that creates 20,000 bookings concurrently (mocked DB) and asserts zero ID collisions/silent failures.

### F-DB-02 — `query()` error-swallowing undermines every write-integrity guarantee
Covered as F-AR-04; restated here because it is fundamentally a database-engineering defect, not just an architectural one. **All fixes in this section assume F-AR-04 is resolved first.**

### F-DB-03 — No transactions around multi-row booking creation
**Evidence:** `createBooking` performs, as separate non-transactional statements: `INSERT INTO bookings`, then a loop of `INSERT INTO booking_items`, then conditionally `INSERT INTO payment_proofs`.
**Risk:** If the process crashes or a later statement fails between these inserts, a booking can exist with missing items or missing payment-proof records — an inconsistent state that the app's read paths (`getBookingById`) do not defensively detect.
**Fix:** Wrap the full creation sequence in a single MySQL transaction (`pool.getConnection()` → `conn.beginTransaction()` → ... → `conn.commit()` / `conn.rollback()` on any failure). Introduce a `withTransaction(fn)` helper in `config/database.ts` and use it for: booking creation, cancellation (status update + chair release + queue removal + audit log), and payment-proof approval (proof status update + booking status update + financial record insert).
**Validation:** Integration test that forces a failure mid-sequence (e.g., invalid `product_id`) and asserts no partial `bookings` row remains.

### F-DB-04 — `financial_records` table used but not defined in schema
**Evidence:** `INSERT INTO financial_records (...)` appears in `server/src/routes/bookings.routes.ts`; no `CREATE TABLE financial_records` exists in `database/schema.sql`.
**Risk:** In a fresh deployment created strictly from `database/schema.sql` (as the "one codebase, many deployments" model requires), every `confirmed` transition will throw a SQL error on this INSERT — which, combined with F-AR-04, will be silently swallowed, meaning **revenue is never recorded** for any new deployment, while the frontend `BookingRevenuesManager`/`AnalyticsCharts` will show incomplete/zero data with no visible error.
**Fix:** Add the missing table to `database/schema.sql`:
```sql
CREATE TABLE IF NOT EXISTS `financial_records` (
  `id` VARCHAR(64) PRIMARY KEY,
  `branch_id` VARCHAR(64) NOT NULL,
  `type` ENUM('income','expense') NOT NULL,
  `category` VARCHAR(100) NOT NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `payment_method` VARCHAR(50),
  `reference_id` VARCHAR(64),
  `notes` TEXT,
  `recorded_by` VARCHAR(64),
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```
And add a proper migration mechanism (see §16) so schema drift like this is caught automatically (e.g., a CI step that spins up a fresh MySQL container from `schema.sql` and runs `tsc`/a smoke test against it).

### F-DB-05 — Missing uniqueness constraint enables duplicate queue numbers under concurrency
**Evidence:** `bookings.queue_number` has no `UNIQUE` constraint (composite or otherwise); `createBooking`'s "Smart Atomic Conflict Prevention" comment is misleading — it is a plain SELECT-then-increment-in-application-memory loop with no lock, no transaction, and no unique index to fall back on.
**Risk:** Two concurrent booking requests for the same branch/date will both read the same "next available" queue number before either INSERT commits, producing two bookings with an identical queue number — directly causing the double-booking/duplicate-ticket scenario the audit brief calls out in Step 11.
**Fix:**
1. Add `UNIQUE KEY uniq_branch_date_queue (branch_id, booking_date, queue_number)` to `bookings`.
2. Wrap queue-number assignment in a transaction using `SELECT MAX(queue_number) ... FOR UPDATE` scoped to `(branch_id, booking_date)`, or use a MySQL `INSERT ... ON DUPLICATE KEY UPDATE` counter table (`queue_counters(branch_id, booking_date, next_number)`) incremented atomically.
3. On unique-constraint violation during insert, retry with the next number (bounded retry loop), surfacing a real error after N attempts instead of swallowing it.
**Validation:** Concurrency test firing 50 simultaneous booking requests for the same branch/date and asserting 50 unique queue numbers.

### F-DB-06 — No locking around chair assignment / "call next customer"
**Evidence:** `queue.service.ts::callNextCustomerForBarber` — SELECT next booking, SELECT available chair, then two separate UPDATEs, with no `FOR UPDATE`/transaction.
**Risk:** Two receptionists (or a receptionist and an automatic reminder job) calling this concurrently for the same barber can both select the same "next" booking and the same "available" chair, double-assigning a chair or calling the same customer twice.
**Fix:** Wrap in a transaction; `SELECT ... FOR UPDATE` on the target booking and chair rows before updating. Add a `UNIQUE` constraint or application-level check preventing two `in_service` bookings from referencing the same non-null `chair_id` concurrently (`UNIQUE` on `chairs.current_booking_id` where not null is not directly expressible in MySQL without a generated column trick, but a `CHECK`/application guard plus the transaction is sufficient).

### F-DB-07 — Timestamp columns stored as `VARCHAR`/ISO strings instead of native `DATETIME`
**Evidence:** `bookings.starts_at`, `ends_at`, `completed_at`, `cancelled_at`, `payment_proofs.submitted_at`, `reviewed_at` are all `VARCHAR(50)`.
**Risk:** Prevents efficient range queries/sorting at the SQL level, disables MySQL's timezone-aware functions, and risks inconsistent formats being stored from different code paths (some code paths write `new Date().toISOString()`, others pass through client-supplied strings unmodified).
**Fix:** Migrate these columns to `DATETIME`/`TIMESTAMP` with explicit UTC storage and format at the API boundary. This is a breaking schema change — schedule for a phase with a proper migration script and a backfill/cast step (`STR_TO_DATE` for existing rows).
**Priority:** Medium — not urgent, but should happen before scaling to reporting/analytics features that depend on date filtering.

### F-DB-08 — No soft-delete pattern; hard deletes used for staff/branch/service records
**Evidence:** `DELETE FROM profiles WHERE id = ?` (`auth.routes.ts`), `DELETE FROM branches`, etc.
**Risk:** Deleting a branch/service/staff member that has historical bookings referencing it via foreign keys will either fail (if FK has no `ON DELETE` clause) or cascade-delete/null out historical data needed for audit and financial reporting.
**Fix:** Convert manager-facing "delete" actions on `profiles`, `branches`, `barbers`, `services`, `products` to soft deletes (`is_active = 0`, already present as a column on most of these tables) and remove the hard `DELETE` routes, or restrict hard delete to records with zero historical references.

---

## 9. Backend/API Audit

### F-API-01 — Inconsistent authentication posture across otherwise-similar endpoints
Confirmed by direct grep of every route file: CRUD endpoints for `branches`/`barbers`/`chairs`/`services`/`products`/`settings` correctly use `requireAuth + requireRoles('manager')` for mutations, while the two most sensitive booking-state mutations (F-SEC-02, F-SEC-03) do not. `chairs.routes.ts PATCH /:id` uses `requireAuth` but **no** `requireRoles`, meaning any authenticated role (including `customer`, since `profiles.role` includes `customer`) could update chair status if they ever obtained a valid JWT. **Fix:** Add `requireRoles('manager','receptionist')` there; audit every `PATCH`/`DELETE` route for a consistent `requireAuth + requireRoles(...) [+ requireBranchAccess]` triple, and add an automated test (see §17) that asserts every mutating route in `server/src/routes/*.ts` has at least `requireAuth` in its middleware chain (a simple static-analysis test can grep the router stack at runtime via Express's internal route metadata).

### F-API-02 — Inconsistent response envelopes
**Evidence:** Most routes return `{ success, data | error, message? }`, but `ai.routes.ts` returns `{ success, text }` on success and `{ error }` (no `success:false`) on the "contents array required" 400 case.
**Fix:** Standardize on `{ success: boolean, data?: T, error?: string, details?: any }` everywhere; add a small `respond.ts` helper (`ok(res, data, message?)`, `fail(res, status, error, details?)`) and refactor all routes to use it. Low risk, but reduces frontend error-handling branching.

### F-API-03 — Duplicate route mounting creates ambiguous surface area
**Evidence:** `server/src/index.ts`: `app.use('/api/agent-tools', agentToolsRoutes); app.use('/api/whatsapp', agentToolsRoutes);` — the same router (customer lookup, booking creation, cancellation, etc.) is reachable under two different base paths.
**Risk:** Doubles the attack surface for F-SEC-04, and makes it unclear which path is the "real" contract for n8n vs. internal tooling — a maintenance hazard when applying security fixes (easy to patch one mount point's expectations and assume the other is covered, since it's literally the same router — low risk of divergence here, but conceptually confusing and worth resolving).
**Fix:** Keep a single canonical mount point (`/api/agent-tools`), and if `/api/whatsapp` must remain for backward compatibility with an already-deployed n8n workflow, alias it explicitly with a comment explaining why, and add both paths to any security test.

### F-API-04 — No idempotency keys on state-changing agent-tool endpoints
**Evidence:** `bookings/create-pending`, `bookings/cancel`, `payments/submit-proof` in `agentTools.routes.ts` accept no idempotency key; a retried n8n webhook delivery (Step 11 of the brief explicitly calls this out) or a duplicate WhatsApp webhook event could create duplicate bookings or duplicate payment-proof submissions.
**Fix:** Accept a client-supplied `idempotencyKey` (n8n can pass the WhatsApp message `key.id`) on these endpoints; store it in a small `idempotency_keys(key, endpoint, response_json, created_at)` table with a unique constraint; on a repeat key, return the cached response instead of re-executing the operation. TTL-expire keys after e.g. 48 hours via the existing cleanup cron.

### F-API-05 — No pagination or upper bound review on `GET /api/bookings`
**Evidence:** `bookings.routes.ts GET /` hardcodes `LIMIT 200` with no `OFFSET`/cursor — acceptable for now but will silently truncate results as booking volume grows, with no indication to the frontend that more data exists.
**Fix:** Add `page`/`pageSize` query params and return a `meta.totalCount` in the response envelope; update `ReceptionistDashboard.tsx`/`BookingsTable.tsx` to page through results.
**Priority:** Low for now, medium once a customer's booking volume grows.

### F-API-06 — Validation gap: `updateBookingStatusSchema` allows any status transition
**Evidence:** `booking.schema.ts::updateBookingStatusSchema` validates that `status` is one of the enum values but does not validate that the *transition* from the booking's current status is legal (e.g., `completed → awaiting_payment` is currently accepted by validation).
**Fix:** Implement a small state-machine table (mirroring the one already documented in `docs/WHATSAPP_AI_ARCHITECTURE.md` §4) in `booking.service.ts`, e.g. `ALLOWED_TRANSITIONS: Record<Status, Status[]>`, and reject (400) any transition not in the map, from both `PATCH /:id/status` and the agent-tools equivalent.

---

## 10. Frontend Engineering Audit

### F-FE-01 — Business logic embedded in presentation components
Covered by F-AR-01. Concretely affects: `BookingWizard.tsx` (pricing/step logic), `AIChatDrawer.tsx` (prompt construction + quota enforcement), `BookingRevenuesManager.tsx` (financial aggregation likely done client-side over raw booking rows rather than server-aggregated). **Fix:** extract to `src/lib/*` pure modules + custom hooks (`useBookingPricing`, `useAiQuota`), and prefer server-computed aggregates for financial reporting (move aggregation SQL into a dedicated `reports.routes.ts` rather than summing on the client).

### F-FE-02 — Client-side AI rate limiting and role selection (cross-ref F-SEC-09)
Already covered as a security finding; also an architecture smell — the frontend should never be the enforcement point for a quota or a privilege level.

### F-FE-03 — No visible error boundary usage despite `react-error-boundary` dependency
**Evidence:** `react-error-boundary` is declared in `package.json` but not found wired around route-level components in `App.tsx` (UNVERIFIED — confirm via a targeted grep for `ErrorBoundary` during implementation; none was found in the files read during this audit).
**Fix:** Wrap top-level routes (`ManagerDashboard`, `ReceptionistDashboard`, `BarberDashboard`, `BookingPage`) in `<ErrorBoundary>` with a friendly Arabic fallback UI and an error-reporting hook (see §15 Observability).

### F-FE-04 — Local-first sync layer (`src/lib/sync.ts`, `idb-keyval`) coexists with server-authoritative state with unclear conflict resolution
**Evidence:** `sync.ts` (117 lines) plus `idb-keyval` suggest an offline-first cache; combined with the in-memory `liveSyncedBookings` on the backend, there are now **three** representations of "current bookings" (MySQL, backend in-memory cache, frontend IndexedDB cache) that can disagree.
**Fix:** Document (and then enforce) a single reconciliation rule: MySQL via REST is always authoritative; `idb-keyval` is a read-through cache invalidated on every Socket.io `SYNC_STATE` event, never a write source of truth. Add a lightweight version/`updated_at` check so stale cached writes cannot clobber newer server state.

### F-FE-05 — Dead/unused component: `RoleSwitcher.tsx`
**Evidence:** `src/components/common/RoleSwitcher.tsx` exists (162 lines) but is not imported anywhere in `src/` (confirmed via project-wide grep). The claim in `SECURITY_AUDIT_REPORT.md` that it is "locked to dev-mode only" does not match the code (it isn't rendered at all, dev or prod).
**Fix:** Either delete the file (if truly unused) or, if it's intended for a future local-dev convenience feature, gate its one rendering call behind `import.meta.env.DEV` as originally claimed, and add a code comment explaining its purpose.
**Priority:** Low (hygiene).

### F-FE-06 — Accessibility and responsive behavior not verifiable from static review
**UNVERIFIED — REQUIRES CONFIRMATION.** No automated accessibility audit (axe, Lighthouse CI) is configured. Recommend adding one in Phase 6 (Testing) rather than asserting current state without evidence.

---

## 11. AI Engineering Audit

**Current architecture (in-app AI Assistant):** `AIChatDrawer.tsx` + `aiService.ts` (client) → `POST /api/ai/chat` (server, unauthenticated, role/API-key selection driven by request body) → Gemini `generateContent` (no tools, no function-calling schema, no backend data access). See §3.4.

**Gap vs. required architecture (`AI → Tool → Backend → Business Logic → Database`):** There is currently no tool-calling/function-calling schema defined for the in-app assistant at all — it can only produce free text. Whatever "booking via chat" behavior exists in the customer-facing UI today is most plausibly implemented as client-side heuristics in `aiService.ts`/`store.ts` reacting to the AI's text output (UNVERIFIED — requires a focused read of `aiService.ts`'s message-handling branches during implementation, since this audit prioritized backend/security scanning within its time budget), which is fragile and exactly the "AI as source of truth" anti-pattern the brief warns against.

### F-AI-01 — No server-side tool/function-calling contract
**Fix:** Define a fixed set of backend "tools" (JSON schema) mirroring the existing `agentTools.routes.ts` endpoints (`check_availability`, `create_pending_booking`, `get_booking_status`, `cancel_booking`, `submit_payment_proof`, `get_queue_position`) and pass them to Gemini via the `tools`/`functionDeclarations` parameter of the Generative AI API, on the **server**, for the in-app assistant — not just for the separate WhatsApp/n8n path. This unifies the two AI surfaces (in-app chat and WhatsApp) around one tool contract, reducing duplicated prompt-engineering effort.

### F-AI-02 — System prompt is entirely client-controlled
Covered as F-SEC-09. Re-stated here as an AI-quality issue too: an attacker-supplied `systemInstruction` can also degrade the *quality* of legitimate responses (jailbreaking the assistant into off-brand or incorrect behavior visible to other users if outputs are ever cached/shared).
**Fix:** Server owns the system prompt per role, built from a template with only safe variable substitution (branch name, business hours, customer's own name if authenticated).

### F-AI-03 — No conversation memory persistence server-side
**Evidence:** `contents` array is passed per-request from the client; there's no server-side conversation store keyed by session/customer.
**Risk:** Cannot support the "context-aware, not scripted" requirement across page reloads or across channels (a customer chatting in-app and later on WhatsApp has no shared context), and cannot be audited after the fact (no record of what the AI actually said to a customer, which matters if it ever gives an incorrect price/policy statement).
**Fix:** Persist conversation turns (customer/session id, role, message, timestamp, tool calls + results) in a new `ai_conversations`/`ai_messages` table pair, and load recent history server-side rather than trusting the client's `contents` payload as the sole history.

### F-AI-04 — Hallucination risk from lack of grounding
**Evidence:** The assistant has no tool access to real prices/availability today (F-AI-01), so any pricing/scheduling statement it makes is generated from the model's general knowledge/prompt text only, not live data.
**Fix:** Once F-AI-01 is implemented, add a system-prompt rule: "Never state a price, availability slot, or booking status without first calling the corresponding tool; if a tool call fails, say so and offer to connect the customer with a human." Add automated eval tests (a fixed set of prompts with expected tool-call sequences) as part of Phase 7 testing.

### F-AI-05 — No token-cost or abuse budget bounded server-side
**Evidence:** No per-customer/per-day cap on Gemini calls beyond the bypassable client quota (F-SEC-09).
**Fix:** Server-side counter (Redis or a DB table) per phone/session per day; reject with a friendly message once exceeded; alert manager dashboard when approaching the configured Gemini budget.

---

## 12. WhatsApp/n8n/Evolution Architecture Audit

Documented target (from `docs/WHATSAPP_AI_ARCHITECTURE.md` and `n8n/workflows/01_WhatsApp_Master_Router.json`, `02_AI_Agent_Tools_Orchestrator.json`, `03_Payment_Proof_Handler.json`, `04_Appointment_Reminders_Cron.json`): `Customer → WhatsApp → Evolution API → n8n → Gemini Agent → Tools (agentTools.routes.ts) → Backend → Database`.

**Current reality:** No Evolution API instance/config was found anywhere in this repository; the only running WhatsApp transport is the in-process Baileys client in `whatsapp.service.ts` (§3.5, F-AR-06). The n8n workflow JSON files exist and reference webhooks and (presumably) an Evolution API node, but they are **workflow definitions to be imported into an n8n instance**, not verified-running infrastructure — their correctness against the *actual* `agentTools.routes.ts` contract (endpoint paths, payload shapes, auth header) has not been cross-checked in this pass and should be a dedicated Phase 8 task.

### F-WA-01 — Choose and commit to one transport (Decision required, blocks Phase 8)
Recommendation: adopt Evolution API (self-hosted, officially supports the WhatsApp Business API more sustainably than an in-process Baileys socket) + n8n, and retire `whatsapp.service.ts`'s Baileys socket, keeping only a thin "send message" HTTP client in the Express backend that calls Evolution API's REST endpoint (so `booking.service.ts`/`bookings.routes.ts` keep working with minimal change — swap `sendWhatsAppText`'s implementation, keep its call sites).
**Rationale:** Baileys is an unofficial, reverse-engineered WhatsApp Web client; it violates WhatsApp's terms of service more directly than the official Business API path Evolution API wraps, and a single in-process session cannot be safely restarted/scaled/monitored the way a dedicated WhatsApp gateway service can.

### F-WA-02 — Cross-check n8n workflow contracts against `agentTools.routes.ts` before relying on them
Once the transport decision (F-WA-01) is made, verify field-by-field that each n8n workflow node's HTTP Request configuration matches the actual request/response shape of `agentTools.routes.ts` (which will also need the F-SEC-04 auth fix, changing how n8n must authenticate). **UNVERIFIED — REQUIRES CONFIRMATION** against the live n8n instance; not fully verifiable from static JSON alone within this audit's scope.

### F-WA-03 — Idempotency and phone isolation
Already covered by F-API-04. Additionally: `docs/WHATSAPP_AI_SECURITY.md` should be reconciled with the real `requireAgentAuth` bug (F-SEC-04) — update it after the fix ships, not before (avoid repeating the F-SEC-14 documentation-drift problem).

### F-WA-04 — Media handling (payment proof images via WhatsApp)
The n8n `03_Payment_Proof_Handler.json` workflow presumably downloads media from Evolution API and forwards it to `POST /api/upload` or directly inserts into `payment_proofs`. This must go through the same content-type verification fix as F-SEC-11 and must attach the resulting image via the authenticated agent-tools contract, not a raw unauthenticated upload endpoint if it can be avoided — recommend adding an agent-tools-scoped upload variant (`POST /api/agent-tools/payments/upload-proof`) that requires the agent secret rather than reusing the fully public `/api/upload`.

### F-WA-05 — Monitoring
No health-check/alerting was found for the WhatsApp channel itself (e.g., "session disconnected for > 5 minutes → alert manager"). Recommend a scheduled check (reuse `node-cron` pattern from `cleanup.service.ts`) hitting the transport's status endpoint and writing to `audit_logs`/sending an internal alert (email/Slack/WhatsApp-to-manager) on disconnection.

---

## 13. Concurrency Audit

| Scenario (from brief, Step 11) | Current behavior | Risk | Fix reference |
|---|---|---|---|
| Two customers book the same slot/queue number simultaneously | SELECT-then-increment in app memory, no lock, no unique constraint | **Confirmed race condition** — duplicate queue numbers | F-DB-05 |
| Two receptionists process payments simultaneously | No locking on `payment_proofs`/`bookings` update; also currently **unauthenticated** (F-SEC-02) so "two receptionists" isn't even the realistic threat model until auth is fixed | Double-processing possible; last write wins silently | F-DB-03, F-SEC-02 |
| Manager and receptionist edit the same customer/booking simultaneously | No optimistic concurrency (`updated_at` not checked before overwrite) | Last write silently wins, no conflict surfaced | Add `WHERE updated_at = ?` optimistic check + 409 response on mismatch to booking/profile PATCH routes |
| Two WhatsApp webhooks arrive simultaneously | No idempotency key infra | Possible duplicate booking/proof creation | F-API-04 |
| Same webhook arrives twice | `processedMessageIds`/`processedContentKeys` in-memory maps exist in `whatsapp.service.ts` (TTL 10 min) — this is **process-local memory**, lost on restart/redeploy and not shared if the process ever scales beyond one instance | Partial mitigation only; not durable | Move dedup to DB/Redis-backed table keyed by WhatsApp message ID, matching F-API-04's idempotency table |
| Same payment proof submitted twice | `payment_proofs.booking_id` is `UNIQUE`, which helps (second insert would fail) — but combined with F-AR-04's error swallowing, the *failure* of the second insert is invisible, and no UPDATE-then-insert-if-exists logic exists | Second submission likely silently no-ops rather than being explicitly handled/rejected with a clear message | Fix F-AR-04 first, then add explicit "proof already submitted" branch using an `ON DUPLICATE KEY UPDATE` or a pre-check + clear user-facing message |
| Same cancellation submitted twice | `cancelBooking` re-reads booking each time and is largely idempotent in effect (setting status to cancelled twice is harmless), but sends a duplicate WhatsApp "your booking is cancelled, deposit non-refundable" message each time | Low risk (no data corruption) but customer-experience/spam nuisance | Guard: skip WhatsApp send + audit log if `booking.status` is already `cancelled` |

**General recommendation:** Introduce a small `withTransaction` helper (F-DB-03) and use `SELECT ... FOR UPDATE` for every read-modify-write sequence identified above. This is the single highest-leverage database engineering task in the whole roadmap.

---

## 14. Performance Audit

| Area | Classification | Evidence / Notes |
|---|---|---|
| N+1 queries in `getBookingById` fan-out | **Medium** | `bookings.routes.ts GET /` and `/track` call `getBookingById` in a `Promise.all` map over up to 200 rows, and `getBookingById` itself issues 4 additional queries (`booking_items`, `payment_proofs`, `ratings`, plus the joined main query) — up to ~800 queries for one dashboard load. |
| Missing composite index for common dashboard query | **Medium** | `idx_branch_date_queue` exists and helps `queue.service.ts`, but the `GET /api/bookings` filter combination `(branch_id, status, booking_date)` used by receptionist views has no matching composite index — relies on `idx_status`/`idx_branch_date_queue` partially. |
| Large client bundles | **Low–Medium** | Several 800–1,300 line components will produce large JS chunks; no code-splitting (`React.lazy`) observed for role-specific dashboards (a customer never needs `ManagerDashboard`'s bundle). |
| Socket.io broadcast fan-out | **Low** | Current scale (single branch/small salon) is fine; revisit if multi-branch/high-volume customers are onboarded (`io.to(room).emit` is O(sockets in room), acceptable). |
| Image uploads not resized/compressed | **Medium** | Payment-proof screenshots are stored as-is (up to 5MB) and served directly; no thumbnail generation for list views (`BookingsTable`/`PaymentProofModal` likely load full-size images). |
| Cron jobs frequency | **UNVERIFIED** | `cleanup.service.ts`/`reminder.service.ts` schedules not fully reviewed in this pass; confirm they don't run expensive full-table scans on a tight interval during implementation. |

**Recommended fixes, in priority order:** (1) Replace the N+1 `getBookingById` fan-out with a single query using `GROUP_CONCAT`/JSON aggregation or a batched `IN (...)` fetch for items/proofs/ratings across all returned booking IDs. (2) Add the composite index. (3) Introduce `React.lazy`+route-based code splitting for the three dashboards. (4) Resize/compress images on upload (e.g., via `sharp`) and store a thumbnail alongside the original.

---

## 15. Testing Audit

**Current state: MISSING.** No test files (`*.test.ts`, `*.spec.ts`), no test runner (`vitest`/`jest`) in either `package.json`, no CI configuration found in the archive.

**Recommended testing strategy (to be built out across Phase 6, informed by the findings above):**
- **Unit tests** (Vitest, since the stack is Vite-based): pricing calculation, phone normalization, booking-status state machine (once F-API-06 exists), queue-number assignment logic (once F-DB-05's transactional version exists).
- **Integration tests** (Vitest + `supertest` against a real MySQL test database seeded from `database/schema.sql`): every route file's auth matrix (assert 401/403 for wrong role, 200 for correct role) — this directly catches regressions of F-SEC-02/03/04/05. A single parametrized test iterating over a declared list of `{method, path, requiredRole}` is the highest-leverage test in this entire plan.
- **Database tests**: transaction rollback behavior (F-DB-03), duplicate-key handling (F-DB-01/05).
- **Concurrency tests**: fire N simultaneous requests at booking creation / call-next-customer and assert no duplicate queue numbers / chair double-assignment (§13).
- **Security tests**: CORS origin rejection (F-SEC-06), agent-tools auth rejection when header omitted (F-SEC-04), login backdoor removal (F-SEC-01) — assert the specific removed strings no longer authenticate.
- **AI tool tests**: once F-AI-01 ships, snapshot/eval tests asserting the model calls the correct tool for a fixed set of Egyptian-Arabic prompts (e.g., "عايز أحجز بكرة الساعة 5" → `check_availability` called with correct date).
- **WhatsApp tests**: mock the chosen transport (F-WA-01) and assert message templates render correctly for each booking status transition, and that idempotency keys prevent duplicate sends on repeated webhook delivery.
- **End-to-end tests**: Playwright covering the full customer booking journey (browse → select → pay-proof upload → track) and the receptionist approval journey, run against a seeded test deployment.

---

## 16. DevOps/Deployment Audit

### F-OPS-01 — No Dockerfile for the main application
**Evidence:** Only `n8n/Dockerfile` exists; the main app relies on Railway's Nixpacks-style auto-detection (`npm run build:all` / `npm start`).
**Risk:** Reduces portability across hosting providers (a core business requirement — "portable between hosting providers"). Without a Dockerfile, moving from Railway to another VPS/host requires re-deriving the build steps.
**Fix:** Add a multi-stage `Dockerfile` at the repo root: stage 1 builds the frontend (`vite build`) and the backend (`tsc`), stage 2 is a slim `node:20-alpine` runtime copying only `dist/`, `server/dist/`, `server/node_modules` (production only), and `database/`. Add a `docker-compose.yml` for local development including a MySQL service seeded from `database/schema.sql`.

### F-OPS-02 — No automated migration mechanism
**Evidence:** `database/schema.sql` is a single monolithic "create if not exists" file with no version tracking; `server/src/scripts/seed.ts` seeds data but there's no way to apply an incremental change (e.g., F-DB-04's missing table) to an already-deployed customer's database without manually running SQL.
**Fix:** Introduce a lightweight migration tool (e.g., `node-pg-migrate`-style pattern adapted for MySQL, or `db-migrate`/`Umzug`), split `schema.sql` into numbered migration files (`001_init.sql`, `002_add_financial_records.sql`, ...), and add an `npm run migrate` script runnable identically for every customer deployment.

### F-OPS-03 — No secrets management strategy beyond `.env` files
Covered by F-SEC-07. **Fix:** Document, per deployment, which environment variables are required (expand `server/.env.example` to include every variable actually read via `process.env.*` in the codebase — a grep-derived checklist should be produced during implementation to ensure `.env.example` is exhaustive and accurate, since it currently does not list e.g. `AGENT_API_SECRET`/`WHATSAPP_AGENT_SECRET`, `MANAGER_EMAIL`, `MANAGER_PHONE`, `MANAGER_PASSWORD`/`ADMIN_PASSWORD`, `N8N_WEBHOOK_URL`, `WHATSAPP_AUTH_DIR`, `ALLOWED_ORIGINS` (new, from F-SEC-06)).

### F-OPS-04 — No health checks beyond a basic liveness endpoint
**Evidence:** `GET /api/health` returns a static payload; it does not check DB connectivity or WhatsApp transport status.
**Fix:** Extend to check `testDbConnection()` result and WhatsApp transport status, returning `503` if either is down, so hosting-provider health checks can restart/alert correctly.

### F-OPS-05 — No documented backup/restore procedure
**MISSING.** **Fix:** Document (and script) a `mysqldump`-based nightly backup per deployment, uploaded to the hosting provider's object storage or the provider's managed-DB backup feature if available (e.g., Railway's built-in MySQL backups — confirm availability per provider), plus a tested restore runbook. This is a hard requirement before selling to a first customer who will have real financial data.

### F-OPS-06 — No CI/CD pipeline
**MISSING.** **Fix:** Add a GitHub Actions (or equivalent) workflow: on every push, run `npm run lint`, `tsc --noEmit` for both frontend and backend, and the test suite (§15) against a MySQL service container seeded from `database/schema.sql`. Only after this passes should a deploy step run.

### F-OPS-07 — No rollback/versioning strategy
**MISSING.** **Fix:** Tag each deployed release (git tag matching `package.json` version), keep the previous build artifact available for one-command rollback on the hosting provider, and version the migration files (F-OPS-02) so a rollback can optionally include a corresponding "down" migration if a schema change must be reverted.

---

## 17. Observability Audit

| Capability | Status | Notes |
|---|---|---|
| Structured logging | **Missing** | `pino` is installed but not initialized; current logging is `console.log`/`warn`/`error` scattered throughout, with no request correlation IDs. |
| Error tracking (e.g., Sentry) | **Missing** | No error-tracking SDK found. |
| Audit logs | **Partially implemented** | See F-SEC/F-DB notes — writes can be silently dropped (F-AR-04); table itself (`audit_logs`) is well-designed. |
| Health checks | **Partially implemented** | See F-OPS-04. |
| Monitoring/alerting | **Missing** | No uptime/alerting integration found for API, DB, or WhatsApp transport. |
| Performance metrics | **Missing** | No APM/metrics collection (request latency, DB query timing) found. |

**Recommended observability strategy:**
1. Initialize `pino` as the single logger, with a `requestId` (via `express` middleware, e.g., `pino-http`) attached to every log line and propagated into `audit_logs.metadata` for cross-referencing.
2. Add an error-tracking SDK (Sentry or an equivalent self-hostable option, chosen per the customer's budget/hosting constraints) on both frontend (`ErrorBoundary` integration, F-FE-03) and backend (`errorHandler` middleware).
3. Extend the health check (F-OPS-04) and add a `/api/metrics` (protected, manager-only or internal-network-only) exposing basic counters (bookings created/day, pending payment-proof queue depth, WhatsApp session status) for a simple ops dashboard.
4. Make `audit_logs` writes durable (part of the same transaction as the business-logic write they describe, once F-DB-03 lands) rather than best-effort `.catch(() => {})` side writes.

---

## 18. Technical Debt

Summarized from the sections above, ranked by remediation cost vs. risk:

| Item | Cost to fix | Risk if unfixed |
|---|---|---|
| `query()` swallowing errors (F-AR-04) | Low (one function + call-site audit) | Very High — undermines everything else |
| Auth backdoor (F-SEC-01) | Very Low (delete code) | Critical |
| Unauthenticated payment approval/status (F-SEC-02/03) | Low (add middleware) | Critical |
| Agent-tools/WhatsApp-session auth (F-SEC-04/05) | Low | Critical |
| CORS misconfiguration (F-SEC-06) | Very Low | Critical |
| Committed secrets (F-SEC-07) | Low (rotate + gitignore) + ongoing process discipline | Critical, already-realized exposure |
| Hardcoded business identity (F-AR-05) | Medium (systematic extraction to config) | Blocks resale/duplication model |
| No transactions/locking (F-DB-03/05/06) | Medium | High — real-money double-booking/payment risk |
| Missing `financial_records` table (F-DB-04) | Very Low | High for any *new* deployment |
| Two WhatsApp architectures (F-AR-06/F-WA-01) | High (integration decision + migration) | Medium-High operational fragility |
| No tests (§15) | High (ongoing investment) | High — every fix above needs a regression guard |
| No CI/CD, migrations, Dockerfile (§16) | Medium | Medium — blocks safe repeatable deployment |

---

## 19. Risk Register

| ID | Risk | Likelihood | Impact | Severity | Mitigation |
|---|---|---|---|---|---|
| R1 | Unauthenticated payment approval used to obtain free services | High (trivial to discover) | Direct financial loss | Critical | F-SEC-02 |
| R2 | Auth backdoor used to access manager account/data | Medium–High (common default strings) | Full data/business compromise | Critical | F-SEC-01 |
| R3 | WhatsApp business account hijacked via public QR/pairing endpoint | Medium | Reputational + operational (lose the customer channel) | Critical | F-SEC-05 |
| R4 | Leaked committed API keys abused for cost or impersonation | Medium (depends on repo distribution) | Financial (API billing) + reputational | Critical | F-SEC-07 |
| R5 | Duplicate queue numbers / double-booked chairs under real traffic | High once volume grows | Customer-experience damage, refund disputes | High | F-DB-05/06 |
| R6 | Silent write failures (F-AR-04) hide revenue/booking loss until a customer complains | Medium–High | Data integrity + trust | High | F-AR-04 |
| R7 | Reusing this codebase for a second customer requires source edits, increasing time-to-deploy and regression risk | High (business model requires many deployments) | Business/operational | Medium-High | F-AR-05, §20 |
| R8 | No tests means every future fix risks silent regressions of the fixes in this document | High over time | Compounding | High | §15 |
| R9 | No backups documented; a DB loss for a live customer is unrecoverable | Unknown until tested | Catastrophic if realized | High | F-OPS-05 |

---

## 20. Recommended Target Architecture

No framework replacement is recommended — React/Vite/Express/MySQL is an appropriate stack for this product's scale. The target state is the **same stack, hardened and reorganized**:

```
┌───────────────────────────── One deployment per customer ─────────────────────────────┐
│                                                                                          │
│  React SPA (Vite build)                                                                │
│      ↕ HTTPS (cookie: httpOnly JWT)         ↕ Socket.io (JWT-authenticated handshake)  │
│  Express API (single process)                                                          │
│    ├─ middleware: helmet, CORS(allow-list from env), sanitize, rate-limit, requireAuth  │
│    ├─ routes/*  → services/* (all business logic; routes stay thin)                    │
│    ├─ services/* → db/query (transactional helper, throws on error)                    │
│    ├─ services/notifications → WhatsApp transport adapter (Evolution API client)       │
│    └─ services/ai → Gemini client with server-owned prompts + tool-calling             │
│                                                                                          │
│  MySQL (this customer's DB only) ── migrations versioned in database/migrations/*.sql  │
│                                                                                          │
│  External: Evolution API (WhatsApp gateway) ← n8n (orchestration) ← Gemini (reasoning)  │
│            All calling back into this deployment's Express API via agent-tools,        │
│            authenticated with this deployment's AGENT_API_SECRET.                      │
│                                                                                          │
│  Config: one `.env` (or hosting-provider secret store) supplying: business identity     │
│  (name, default branch, currency, timezone), URLs, all secrets, ALLOWED_ORIGINS.        │
│  Zero customer-specific literals remain in .ts/.tsx source files.                       │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

Key structural changes vs. today: (1) `query()` throws, transactions exist and are used for every multi-step write; (2) every mutating route has an explicit, tested auth requirement; (3) one WhatsApp transport, wrapped behind a stable interface so it can be swapped without touching booking logic; (4) all business-identity literals become configuration; (5) a real test suite gates every deploy.

---

## 21. Engineering Phases

> Phases are derived from the actual state of this repository, not the brief's example list verbatim, per the brief's own instruction to determine correct phases from evidence.

### Phase 1 — Data-Integrity & Security Foundation (MUST happen before production/first sale)
**Objective:** Stop active financial/security bleeding and make writes trustworthy.
**Includes:** F-AR-04 (`query()` throws), F-SEC-01 through F-SEC-07 (auth backdoor, payment/status auth, agent-tools auth, WhatsApp-session auth, CORS, secret rotation), F-SEC-08 (server-computed totals).
**Files affected:** `server/src/config/database.ts`, `server/src/services/auth.service.ts`, `server/src/routes/bookings.routes.ts`, `server/src/routes/agentTools.routes.ts`, `server/src/routes/whatsappSession.routes.ts`, `server/src/config/security.ts`, `server/.env` (rotate + remove from VCS), `server/src/services/booking.service.ts`.
**Dependencies:** None — this is the starting point.
**Security considerations:** This phase *is* the security work.
**Testing requirements:** Auth-matrix integration test (§15) must exist and pass before this phase is considered done.
**Acceptance criteria:** No endpoint that mutates booking/payment/session state is reachable without correct authentication and role; no hardcoded credential/secret authenticates; CORS rejects unlisted origins; a failed SQL write returns a 5xx to the caller.
**Risk:** Low technical risk, high business urgency.
**Priority:** P0 — blocking.

### Phase 2 — Database Concurrency & Schema Correctness (MUST happen before production)
**Objective:** Eliminate double-booking/duplicate-payment races and fix schema drift.
**Includes:** F-DB-01 through F-DB-06, F-API-04 (idempotency keys), F-API-06 (status transition guard).
**Files affected:** `database/schema.sql` (+ new migration file), `server/src/services/booking.service.ts`, `server/src/services/queue.service.ts`, `server/src/config/database.ts` (`withTransaction` helper).
**Dependencies:** Phase 1 (`query()` must throw before transactions are meaningful).
**Testing requirements:** Concurrency tests per §13/§15.
**Acceptance criteria:** 50 concurrent booking requests for the same branch/day produce 50 unique queue numbers and zero silently-dropped bookings; `financial_records` exists in schema and is populated on every `confirmed` transition in a fresh deployment.
**Priority:** P0 — blocking.

### Phase 3 — Configuration Extraction ("One Codebase, Many Deployments") (MUST happen before selling to a second customer; SHOULD happen before the first, to establish the pattern)
**Objective:** Remove hardcoded business identity from source.
**Includes:** F-AR-05, expanding `.env.example` (F-OPS-03), removing the hardcoded `liveSyncedState` (F-AR-02).
**Files affected:** `booking.service.ts`, `agentTools.routes.ts`, `whatsapp.service.ts`, `bookings.routes.ts`, `server/.env.example`, new `server/src/config/business.ts`.
**Dependencies:** None, but easiest to do right after Phase 1 while those files are already being edited for auth fixes.
**Acceptance criteria:** Grepping `.ts`/`.tsx` source for the current business's specific name/phone/domain/branch-id returns zero matches outside of seed/migration data and `.env.example` comments.
**Priority:** P1 — required before the second deployment, strongly recommended before the first.

### Phase 4 — Backend Architecture Cleanup
**Objective:** Resolve F-AR-01/02/03, standardize response envelopes (F-API-02), consolidate route mounting (F-API-03).
**Dependencies:** Phases 1–3 (avoid refactoring code that's simultaneously being security-patched).
**Priority:** P1–P2, can proceed after production launch for the first customer if time-constrained, but should not be deferred indefinitely (F-AR-04-adjacent code will keep attracting new bugs otherwise).

### Phase 5 — Frontend Engineering Cleanup
**Objective:** F-FE-01 through F-FE-05 (extract logic, error boundaries, reconcile local-first cache, remove dead code).
**Dependencies:** Phase 1 (server-owned AI role/quota logic) should land first since F-FE-02 depends on it.
**Priority:** P2.

### Phase 6 — Testing Infrastructure
**Objective:** Stand up the test strategy in §15, starting with the auth-matrix integration test (highest leverage, directly guards Phase 1's fixes) and concurrency tests (guards Phase 2).
**Dependencies:** Should start *during* Phase 1/2, not strictly after — write the tests as the fixes are made (red/green), rather than fixing everything first and testing later.
**Priority:** P0 in spirit (tests for Phase 1/2 fixes), P1 for full coverage.

### Phase 7 — AI Engineering (in-app assistant)
**Objective:** F-AI-01 through F-AI-05 — real tool-calling, server-owned prompts, conversation persistence, grounding, budget limits.
**Dependencies:** Phase 1 (auth), Phase 3 (business config the AI will reference).
**Priority:** P1 — important for product quality, not a launch-blocking security item once F-SEC-09 (part of Phase 1) is fixed.

### Phase 8 — WhatsApp/n8n/Evolution Integration Decision & Build-out
**Objective:** F-WA-01 through F-WA-05 — commit to Evolution API, retire or clearly quarantine the Baileys path, verify n8n workflow contracts, add media-handling safeguards and monitoring.
**Dependencies:** Phase 1 (agent-tools auth must be fixed first, since n8n will need to be updated to send the corrected header), Phase 7 (shared tool contract).
**Priority:** P1 — high business value (this is the differentiator feature), but not itself a security blocker once Phase 1's F-SEC-04/05 are fixed on the current Baileys path.

### Phase 9 — Automation Features (see `Feature Add Feature.md`)
**Objective:** Smart Waitlist, AI Customer Recall, AI Manager Report, No-show Protection, Revenue Recovery.
**Dependencies:** Phases 1–3 (correct, secure, configurable foundation) and Phase 7/8 (AI + WhatsApp) for the features that need them.
**Priority:** P2 — post-launch value-add, detailed separately.

### Phase 10 — DevOps & Production Hardening
**Objective:** F-OPS-01 through F-OPS-07 — Dockerfile, migrations, CI/CD, health checks, backups, rollback.
**Dependencies:** Can proceed in parallel with Phases 4–9; the backup/restore procedure (F-OPS-05) should be in place **before** the first paying customer's real data exists, i.e., effectively Phase 10a should be pulled forward alongside Phase 1/2.
**Priority:** Split — backups/health-checks are P0 (pull forward), Dockerfile/CI/migrations are P1.

**Must happen before production (first paying customer):** Phase 1, Phase 2, backup/restore from Phase 10, and the corresponding Phase 6 tests for Phases 1–2.
**Can happen after the first customer:** Phases 4, 5, 7, 9, remainder of Phase 10.
**Strongly recommended before a *second* customer (but technically deferrable for the first):** Phase 3.
**Optional / value-add, not required for correctness or safety:** Phase 9 (features), non-blocking parts of Phase 5.

---

## 22. Phase Dependencies

```
Phase 1 (Security/Data-Integrity Foundation)
   │
   ├──> Phase 2 (DB Concurrency & Schema) ──> Phase 6 (Testing, concurrency tests)
   │
   ├──> Phase 3 (Config Extraction)
   │        │
   │        └──> Phase 7 (AI Engineering) ──> Phase 8 (WhatsApp/n8n/Evolution)
   │
   ├──> Phase 4 (Backend Cleanup)
   ├──> Phase 5 (Frontend Cleanup)  [also depends on Phase 1's server-owned AI quota/role]
   └──> Phase 10 (DevOps) — backups/health-checks pulled forward alongside Phase 1/2

Phase 6 (Testing) runs incrementally alongside Phase 1 and Phase 2, not strictly after.
Phase 9 (Feature roadmap) depends on Phases 1–3 always, and additionally on Phase 7/8 for AI- or WhatsApp-driven features (see Feature Add Feature.md for per-feature dependencies).
```

---

## 23. Production Readiness Checklist

- [ ] F-SEC-01: Auth backdoor removed and verified by test
- [ ] F-SEC-02/03: Payment approval and status-change endpoints require `requireAuth + requireRoles`
- [ ] F-SEC-04: Agent-tools auth rejects missing credentials
- [ ] F-SEC-05: WhatsApp session endpoints require manager auth
- [ ] F-SEC-06: CORS restricted to configured origin(s)
- [ ] F-SEC-07: All committed secrets rotated; `server/.env` removed from version control
- [ ] F-SEC-08: Server recomputes and validates booking totals
- [ ] F-AR-04: `query()` throws on error; no silent write failures remain in booking/payment paths
- [ ] F-DB-04: `financial_records` present in `schema.sql`
- [ ] F-DB-05/06: Queue-number and chair-assignment races closed with transactions/unique constraints
- [ ] Backup/restore procedure documented and tested at least once (F-OPS-05)
- [ ] Auth-matrix integration test suite passing in CI (or run manually and recorded, if CI isn't ready yet)
- [ ] Concurrency test (N simultaneous bookings) passing
- [ ] `.env.example` (both root and `server/`) is exhaustive and accurate
- [ ] Health check reflects real DB/WhatsApp status (F-OPS-04)

## 24. Acceptance Criteria

Acceptance criteria are stated per-finding throughout §7–§17 and per-phase in §21. At the document level, this engineering plan is "accepted" as implemented when: (a) every checklist item in §23 is checked, (b) the risk register in §19 has no remaining Critical items, and (c) the Feature roadmap in `Feature Add Feature.md` has at least Smart Waitlist and No-show Protection scoped into a committed phase (these two have the clearest, most immediate revenue-protection value per the business model).

## 25. Recommended Order of Work

1. Phase 1 (Security/Data-Integrity Foundation) — start immediately, in parallel with writing the Phase 6 auth-matrix test.
2. Phase 2 (DB Concurrency & Schema) — immediately after, same engineers, same files largely overlap.
3. Pull forward: backup/restore procedure (Phase 10 slice) — can run in parallel with 1–2, different owner if available.
4. Phase 3 (Configuration Extraction) — before onboarding a second customer; recommended immediately after Phase 2 while confidence in the codebase is high.
5. Phase 6 (remaining test coverage) and Phase 4 (Backend Cleanup) — in parallel.
6. Phase 5 (Frontend Cleanup) — after Phase 4 stabilizes shared contracts.
7. Phase 7 (AI Engineering) then Phase 8 (WhatsApp/n8n/Evolution) — sequential, since Phase 8 reuses Phase 7's tool contract.
8. Phase 10 (remaining DevOps: Dockerfile, CI/CD, migrations) — can start as early as Phase 1 in parallel if a dedicated DevOps engineer is available; otherwise scheduled here.
9. Phase 9 (Feature roadmap, see `Feature Add Feature.md`) — after the foundation (Phases 1–3) is solid, prioritized by business value (recommend Smart Waitlist and No-show Protection first, as they most directly reduce revenue leakage).

---

*End of Software Engineering.md. See `Feature Add Feature.md` for the detailed feature-level implementation specifications requested separately.*
