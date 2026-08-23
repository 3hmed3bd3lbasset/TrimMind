# TrimMind — Complete Software Engineering Audit & Problem Solving Plan

> Scope note on method: every finding below was produced by directly reading the source in this
> archive (paths cited inline), not by trusting `CLEANUP_REPORT.md`, `PRODUCTION_READINESS_*.md`,
> or `SECURITY_AUDIT_REPORT.md`, which were deliberately ignored as instructed. Areas that were not
> read line-by-line (every React component, every n8n node, every service file in full) are marked
> **UNVERIFIED — REQUIRES MANUAL VERIFICATION** rather than guessed at.

---

## 1. Executive Summary

TrimMind is a single-salon booking/queue/POS platform (React + Zustand frontend, Express + MySQL
backend, WhatsApp AI agent via Baileys + n8n + Gemini) intended to be **deployed once per salon**
(separate server, separate DB, separate env per customer) — not a multi-tenant SaaS. That
deployment model is understood and respected in this report: no multi-tenant refactor is
recommended anywhere below.

The backend *does* have a real Clean-Architecture skeleton (`domain/`, `usecases/`,
`adapters/repositories`, `adapters/gateways`, `container.ts`) — and the highest-risk flow
(booking creation, queue numbering) is implemented properly through it, with row locking inside a
real DB transaction (`server/src/adapters/repositories/MySQLBookingRepository.ts`,
`withTransaction`/`FOR UPDATE`). This is the strongest part of the codebase.

Everything built *around* that core, however, bypasses it. Roughly half the backend routes talk
to `query()` (raw SQL) directly from the Express route file with no repository/use-case in
between. The frontend Zustand store (`src/lib/store.ts`) independently re-implements the entire
business domain (pricing, queue numbers, invoice totals, booking IDs) in the browser, writes it to
`localStorage` **and** IndexedDB as the *persisted* app state, and only afterwards "notifies" the
backend with a fire-and-forget `api.createBooking(...).catch(err => console.warn(...))` call. That
is the direct, verifiable root cause of "data doesn't persist / disagrees across devices" style
bugs (§8).

On top of that, three concrete, high-severity, evidence-backed security problems exist:

1. **`POST /api/ai/chat` has no authentication** (`server/src/index.ts:82`,
   `server/src/routes/ai.routes.ts`) — anyone on the internet can burn the salon's Gemini quota,
   pick which of the four role-based Gemini keys to spend (`role` is read straight from the
   request body), and inject an arbitrary `systemInstruction`.
2. **CORS is fully open while `credentials: true`** (`server/src/config/security.ts`) — the
   `allowedOrigins` allow-list is built but never actually consulted; the callback unconditionally
   calls `callback(null, true)`.
3. **The JWT is stored in both an httpOnly cookie *and* `localStorage`**
   (`src/lib/api.ts` reads `localStorage.getItem('salon_auth_token')`; the cookie is set in
   `server/src/routes/auth.routes.ts`). The httpOnly cookie's entire XSS-protection value is
   undermined because the same token also sits in JS-readable storage.

Severity counts (see §23 for the full table): **6 × P0, 9 × P1, 8 × P2, 4 × P3** discovered and
verified directly against source. This is a functioning prototype with a genuinely good
architectural skeleton in the newer parts of the backend, undermined by an older/parallel
direct-SQL route layer, a frontend that thinks it owns the data, and an authentication boundary
that was clearly added in a rush around the AI/agent surface.

---

## 2. Current Architecture

```
/src                    React 18 + Vite + Zustand + Tailwind (frontend)
  /lib/store.ts          <- Zustand store, persisted to IndexedDB+localStorage, owns ALL domain state
  /lib/api.ts             axios client -> /api/*, JWT read from localStorage per-request
  /lib/sync.ts             BroadcastChannel + storage-event cross-tab sync (client-only, no server involvement)
  /lib/aiService.ts        client-side AI rate limiting (localStorage) + calls POST /api/ai/chat
  /pages, /components      role-based dashboards (Manager/Receptionist/Barber/Customer)

/server/src
  /domain                 entities + repository/gateway interfaces (Clean Architecture core)
  /usecases                CreateBookingUseCase, CancelBookingUseCase, waitlist/recall/insights use cases
  /adapters/repositories   MySQL*Repository implementations of domain interfaces
  /adapters/gateways       Bcrypt, JWT, Baileys WhatsApp, Socket.IO notifier
  /adapters/controllers    thin controllers used by SOME routes (Auth, Booking, Insights, Recall, Waitlist)
  /routes                  Express routers — some delegate to usecases/services, several hit `query()` directly
  /services                booking/queue/auth/whatsapp/insights/recall/noshow/cleanup/reminder services
  /middleware              auth (JWT), rateLimiter, sanitize, validate, errorHandler
  /config                  database.ts (mysql2 pool + withTransaction helper), security.ts (CORS/helmet)
  /socket                  Socket.IO realtime broadcast

/database/schema.sql       MySQL schema: 20 tables, FKs present, several composite indexes, InnoDB
/n8n/workflows/*.json       4 n8n flows: WhatsApp router, AI agent tool orchestrator, payment-proof handler, reminder cron
/docs/WHATSAPP_AI_*.md      WhatsApp/Evolution/n8n design docs (not verified against running n8n — see §18)
```

Deployment target (per the project's own instructions, confirmed by `n8n/Dockerfile`,
`server/.env.example`, and hardcoded Railway URLs found throughout the code — see §21): a single
Railway-style deployment per salon, MySQL per deployment, one WhatsApp number per deployment.

---

## 3. Architecture Problems

The single biggest structural problem is that **two different architectural patterns coexist for
the same kind of work**, and the newer/cleaner one is the minority:

| Pattern | Where | Example |
|---|---|---|
| Clean (route → controller/service → usecase → repository → DB) | `bookings.routes.ts` (partially), `waitlist.routes.ts`, `recall.routes.ts`, `insights.routes.ts`, `auth.routes.ts` login | `CreateBookingUseCase` → `MySQLBookingRepository.createWithTransaction` |
| Direct (route → raw SQL) | `branches.routes.ts`, `barbers.routes.ts`, `chairs.routes.ts`, `services.routes.ts`, `products.routes.ts`, `settings.routes.ts`, most of `agentTools.routes.ts`, most of `auth.routes.ts` (create-staff, profiles CRUD) | `routes/branches.routes.ts:15-24` — `await query('SELECT * FROM branches ...')` directly inside the route handler |

This is not a cosmetic issue — it means:

- Validation, RBAC, and audit-logging behavior differ between entity types for no domain reason
  (branches/barbers/chairs/services/products get none of the invariant-checking a `usecase` layer
  would give them; bookings/waitlist do).
- Any future business rule that must apply universally (e.g. "log every write to `audit_logs`",
  "reject writes when branch is inactive") has to be manually re-added in 6+ separate route files
  instead of one repository/usecase.
- The WhatsApp agent tools (`agentTools.routes.ts`) maintain **their own in-memory JS object**
  (`liveSyncedState`, `liveSyncedBookings`) as a second, parallel "database" that is *not* MySQL —
  see §8.

A second structural problem: the frontend does not treat the backend as authoritative at all. See
§6–§8.

---

## 4. Clean Architecture Audit

Dependency direction was traced file-by-file for the booking flow (the one flow that matters most)
and for the "direct SQL" routes.

### 4.1 Where each layer actually lives

| Concern | Layer it should be in | Layer it's actually in |
|---|---|---|
| Business rules for booking creation (queue numbering, pricing, transaction) | Application/Use Case | ✅ `server/src/usecases/bookings/CreateBookingUseCase.ts` + `MySQLBookingRepository.createWithTransaction` — correct |
| Business rules for branch/barber/chair/service/product CRUD | Application/Use Case | ❌ **Presentation layer** — directly in `server/src/routes/{branches,barbers,chairs,services,products,settings}.routes.ts` |
| Business rules for the *entire customer-facing store* (pricing, booking IDs, queue numbers, invoice totals, ratings) | Application/Use Case (server) | ❌ **Presentation layer, client-side** — `src/lib/store.ts` (`createBooking`, `updateBookingDetails`, `reviewPaymentProof`, `transitionBookingStatus`, `addBookingItem`, `rateBooking` all compute money/queue values in the browser) |
| Database access | Infrastructure (repositories) | Mixed: `adapters/repositories/*` for booking/waitlist/recall/insights/profile/chair/webhook; **raw `query()` calls directly in routes** for branches/barbers/chairs(update/delete)/services/products/settings/auth-profiles/agent-tools |
| WhatsApp send/receive | Infrastructure (gateway) | ✅ mostly correct — `adapters/gateways/BaileysWhatsAppGateway.ts` implements `INotificationGateway`; but `agentTools.routes.ts` also calls `query()` and touches booking status directly, bypassing `CancelBookingUseCase`/`CreateBookingUseCase` interfaces in some branches (see §4.3) |
| AI (Gemini) | Infrastructure (gateway) | ❌ Inline `fetch()` call to `generativelanguage.googleapis.com` directly inside `server/src/routes/ai.routes.ts` — no gateway/interface, no domain boundary, and (see §17.1) no authentication |
| Payments (proof review) | Application/Use Case | ✅ `BookingController`/booking usecases for the receptionist-facing endpoint; ❌ duplicated in `agentTools.routes.ts /payments/submit-proof` which writes to `bookings.payment_proof` with raw SQL and its own status machine |
| Authentication | Application/Use Case (server) + Infrastructure (JWT gateway) | ✅ `AuthenticateStaffUseCase` + `JwtTokenService`, wired through `container.ts` — correct pattern; but `auth.routes.ts` `create-staff`/`profiles/:id` CRUD bypasses this container entirely and hits `query()` directly |

### 4.2 Domain → Infrastructure dependency violations

- `server/src/routes/branches.routes.ts`, `barbers.routes.ts`, `chairs.routes.ts`,
  `services.routes.ts`, `products.routes.ts`, `settings.routes.ts`, `audit.routes.ts` import
  `../config/database.js` (`query`) directly. There is no domain entity, no repository interface,
  no use case for any of these six resources on the backend — despite `domain/entities/` and
  `domain/repositories/` folders existing and being used correctly for *other* entities
  (`Booking`, `Chair` — note `IChairRepository`/`MySQLChairRepository` exist but chair
  create/update/delete in `chairs.routes.ts` do **not** use them; only some read path might).
  **File / Function / Violation:**
  - File: `server/src/routes/branches.routes.ts`, function: inline handler, lines 15-24 / 26-46 /
    48-64 / 66-73. Responsibility: HTTP routing. Violation: also performs SQL, business validation,
    and realtime broadcast composition — three layers collapsed into one file.
  - Same pattern in `barbers.routes.ts`, `chairs.routes.ts`, `services.routes.ts`,
    `products.routes.ts`, `settings.routes.ts`.
  - Why problematic: no single place to enforce cross-cutting rules (e.g. "chair count must match
    branch capacity", "can't delete a branch with active bookings" — currently absent, see §9);
    every future rule change means editing N near-duplicate route files.
  - Recommended target: introduce `IBranchRepository`/`MySQLBranchRepository` (mirroring the
    existing `IChairRepository` pattern that already exists in `domain/repositories/IChairRepository.ts`
    but is under-used) and thin `CreateBranchUseCase`/`UpdateBranchUseCase`/`DeleteBranchUseCase`
    classes, wired through `container.ts` exactly like bookings already are. This is **not** a
    rewrite — it is copying the pattern that already works for bookings onto six more resources.

- `server/src/routes/agentTools.routes.ts` (677 lines by itself) is the worst offender: it imports
  `query` from infrastructure, contains its own phone-normalization business logic, its own
  in-memory "database" (`liveSyncedState`, `liveSyncedBookings` — module-level mutable arrays/objects,
  see §8.2), duplicates booking-status Arabic copy that also exists elsewhere, and mixes WhatsApp
  response formatting with SQL with realtime broadcasting with fallback-data business decisions —
  a textbook **God module**. Recommended target: split into
  `AgentToolsController` (HTTP only) → `WhatsAppAgentUseCases` (one per tool: lookup, availability,
  create-pending-booking, cancel, reschedule, submit-proof, reminders) → existing
  `IBookingRepository`/`IWaitlistRepository`. The tools should call the **same**
  `CreateBookingUseCase`/`CancelBookingUseCase` the human-facing REST API uses, not reimplement a
  parallel booking-creation code path (`bookings/create-pending` builds its own booking object with
  its own fallback/"draft" logic instead of calling the existing use case consistently — it does
  call `createBooking()` from `booking.service.ts` in the success path, but the `catch` block
  fabricates a **second, different** booking record straight into `liveSyncedBookings` and attempts
  a raw `INSERT` — meaning a DB error produces a booking the customer is told succeeded, that may
  or may not exist as a row, see §17.2).

### 4.3 Frontend business logic in the Presentation layer

`src/lib/store.ts` (1,419 lines) is Zustand "state management" in name only — it is a full
duplicate implementation of the backend's booking domain, running in the browser:

- `createBooking()` (store.ts ~L268-390): computes `servicePrice`, `bookingFee`, `itemsTotal`,
  `total_at_booking`, generates the booking ID (`BK-${random 4-digit}`) and the `secure_token`,
  and **independently calculates `assignedQueueNumber`** by scanning the client's own in-memory
  `bookings` array for the day and incrementing past collisions — a client-side, non-atomic
  reimplementation of exactly the row-locked logic that `MySQLBookingRepository.createWithTransaction`
  already does correctly on the server (§14). Two browser tabs booking at the same time can and
  will compute the same `queue_number` and the same `BK-XXXX` id (4 random digits → 1-in-9000
  collision space, no server round-trip before display).
- `reviewPaymentProof()`, `transitionBookingStatus()`, `cancelBooking()`,
  `updateBookingDetails()`, `addBookingItem()`, `rateBooking()`, `addWalkInBooking()`: all mutate
  local state as the "real" outcome (the UI reacts to this immediately) and only afterwards fire
  `api.xxx(...).catch(err => console.warn(...))` — i.e. **the server's response is discarded**
  even when it succeeds, and **errors are swallowed to a console.warn with no user-facing rollback**.
- `addBranch/updateBranch/deleteBranch/addBarber/... /addProduct/deleteProduct/updateSettings`:
  identical pattern — optimistic local mutation, fire-and-forget API call, no reconciliation.

**Why it's problematic:** the browser is doing the job of the Application layer, and the Express
API is relegated to "best-effort audit trail" rather than source of truth. This is the direct
mechanism behind the root cause discussed in §8.

**Recommended target architecture:** Zustand should hold **only**: (a) ephemeral UI state
(`isAiDrawerOpen`, `lastCalledCustomer`, `selectedBranchId` as a *view* preference), and (b) a
**cache** of the last known-good server response for each resource, written *only* from API
responses (`then()`), never computed client-side. All ID generation, pricing, queue numbering, and
status transitions must happen server-side and be returned to the client, which then simply
displays what the server said. This is elaborated with a request-by-request diagram in §9.

---

## 5. SOLID Audit

Rather than a textbook pass over every file, these are the concrete violations found with real
consequences:

**S — Single Responsibility.**
- `src/lib/store.ts` — one 1,419-line object is simultaneously: pricing engine, queue-number
  allocator, audit-log writer, notification composer, cross-tab broadcaster, persistence layer
  selector (IndexedDB vs localStorage), and API client caller. Any change to invoice math risks
  breaking notification text because they're interleaved in the same function bodies (e.g.
  `createBooking` builds `newNotification.message` inline using the same local variables as the
  price calc). **Recommendation:** extract a pure `computeBookingTotals()` function, a pure
  `buildAuditLog()` helper, and a pure `buildNotification()` helper — each independently testable —
  and have the store action just call them in sequence, mirroring what the server's use cases
  already do correctly.
- `server/src/routes/agentTools.routes.ts` — one file is router, controller, repository, and
  in-memory datastore for 9 distinct WhatsApp tools. See §4.2.

**O — Open/Closed.**
- Adding a new booking status color/label anywhere requires touching a hardcoded `statusMap` object
  duplicated in at least two places (`agentTools.routes.ts` `bookings/status` handler, and likely
  frontend components — **UNVERIFIED, not all frontend files were read**). There is no single
  `BookingStatus` → Arabic-label mapping module that both server and client import.

**L — Liskov.** No repository-interface substitution violations were found in the parts that use
interfaces (`IBookingRepository`, `IWaitlistRepository`, etc. — the MySQL implementations honor
their interfaces as far as was reviewed). Not fully exhaustively checked against every method —
**UNVERIFIED for `MySQLRecallRepository` and `MySQLInsightsRepository` internals.**

**I — Interface Segregation.** `SalonStore` (the single Zustand interface in `store.ts`) exposes
~45 methods on one interface consumed by every component regardless of role — a Manager component
and a Customer component both depend on the full interface including methods irrelevant to them
(e.g. customer-facing `BookingPage.tsx` presumably imports the same `useSalonStore` that exposes
`deleteManager`). This isn't fatal (Zustand encourages a single store) but it does mean **no
compile-time signal** prevents a customer-facing component from accidentally calling a
manager-only mutator — the only protection is the (also client-side, spoofable) `currentUser.role`
check inside the UI, and, correctly, the server-side `requireRoles()` check when the fire-and-forget
API call eventually lands. **Recommendation:** split the store into role-scoped selector hooks
(`useCustomerActions()`, `useManagerActions()`) built on top of one underlying store, or at minimum
group the interface into named sub-objects.

**D — Dependency Inversion.** Correctly applied in `container.ts` / `usecases/*` / `domain/*` — use
cases depend on repository *interfaces*, concrete MySQL classes are injected at composition root.
This is genuinely good and should be the template extended to §4.2's un-refactored resources. The
violation is that **half the codebase never uses this container at all** — `branches.routes.ts`
etc. import the concrete `query()` function directly, which is a Dependency Inversion violation by
omission (no interface exists to invert).

Do not introduce abstractions/interfaces for things that don't need them (e.g. `utils.ts` helper
functions, one-off Arabic formatting) — that would be SOLID-for-its-own-sake, which the audit
brief explicitly warns against.

---

## 6. Database Source of Truth Audit

**Verdict: the database is not the actual source of truth for the frontend today.** It is written
to, and it is capable of being authoritative, but the client does not treat it that way.

Evidence:
- `src/lib/store.ts` persists via `zustand/persist` to a custom storage adapter
  (L~1130-1155) that writes to **both** `idb-keyval` (IndexedDB) **and** `localStorage` under key
  `barber-platform-storage-v4`, containing the entire `SalonStore` — branches, barbers, chairs,
  services, products, **bookings**, **queue**, profiles, audit logs, settings. On every app load,
  `create<SalonStore>()(persist(...))` rehydrates this entire object from the browser, not from the
  API. There is no `GET /api/bookings` call on startup that replaces the rehydrated state — search
  of `App.tsx`/dashboards for a mount-time refetch that overwrites `bookings`/`queue`/`branches` was
  not found in the files read (**partially UNVERIFIED — not every dashboard component's `useEffect`
  was read; this should be confirmed file-by-file for `ManagerDashboard.tsx`,
  `ReceptionistDashboard.tsx`, `BarberDashboard.tsx`, `BookingPage.tsx` before implementation**, but
  the *pattern* in every store action — optimistic local write, fire-and-forget API call, no
  response consumption — is unambiguous and file-verified).
- `getInitialCurrentUser()` / `getInitialBranchId()` (store.ts top) explicitly read
  `localStorage.getItem('salon_current_user')` / `barber-platform-storage-v3` as the **first**
  source of identity, before any server call.

---

## 7. Browser Storage Audit

Full inventory of browser persistence found:

| Mechanism | Key(s) | What it stores | File |
|---|---|---|---|
| IndexedDB (via `idb-keyval`) | `barber-platform-storage-v4` | Entire `SalonStore` incl. bookings, queue, branches, staff, settings, audit logs | `src/lib/store.ts` custom Zustand storage adapter |
| localStorage (fallback mirror of the above) | `barber-platform-storage-v4` | Same as above (written on every `setItem`, even though IndexedDB "handles unlimited sizes" per the code's own comment) | `src/lib/store.ts` |
| localStorage | `salon_current_user` | Current logged-in profile object | `store.ts getInitialCurrentUser/setCurrentUser` |
| localStorage | `salon_selected_branch_id` | Selected branch | `store.ts getInitialBranchId/setSelectedBranchId` |
| localStorage | `salon_auth_token` | **The raw JWT**, read on every axios request via interceptor | `src/lib/api.ts` |
| localStorage | `elite_barber_ai_quota_v2` | Client-side AI usage counter used as the *only* rate limit for customers | `src/lib/aiService.ts` |
| localStorage | `trimmind_sync_ping` | Cross-tab sync fallback message | `src/lib/sync.ts` |
| BroadcastChannel | `trimmind_realtime_sync` | Same cross-tab events, in-memory (not persisted) | `src/lib/sync.ts` |
| Server-side in-memory (not browser, but the server-side analogue of the same anti-pattern) | `liveSyncedState`, `liveSyncedBookings` module-level variables | A second "branches/services/barbers/bookings" dataset that competes with MySQL | `server/src/routes/agentTools.routes.ts` |

No usage of `sessionStorage`, Redux-persist, Context-persistence, or service workers was found.
`seedData.ts` provides `INITIAL_*` arrays used as the Zustand store's default state before any
persisted or server data loads — effectively **mock/fallback business data compiled into the
production bundle** (see §8.1 and §21).

---

## 8. ROOT CAUSE — Browser Storage vs Database

This was investigated directly rather than assumed. The root cause is **not** "someone forgot to
remove `localStorage.setItem`" — it is a specific, traceable architectural decision:

### 8.1 The frontend was designed offline-first, and the "online" half was never finished

The store was built so that **every single user-facing action must work with zero network
round-trip** (the UI updates from `set(...)` synchronously, before `api.xxx()` even starts). This
is a legitimate offline-first pattern *if* it is paired with: (a) a reconciliation step that
replaces optimistic data with the server's authoritative response, and (b) a rollback step if the
server call fails. **Neither exists.** Every API call in `store.ts` ends in
`.catch((err) => console.warn(...))` — literally just logging a warning and doing nothing else.
There is no `.then((serverBooking) => set(state => replace-optimistic-with-real(serverBooking)))`
anywhere in the file. The offline-first half was implemented; the "sync back to authoritative
truth" half was not.

### 8.2 The backend has its own accidental in-memory database for the WhatsApp agent

`agentTools.routes.ts` defines `liveSyncedState` (branches/services/barbers/settings) and
`liveSyncedBookings` (an array) as **module-scope `let`/`const` variables that live in server
process memory**. A separate endpoint, `POST /sync-store`, lets the frontend push its own state
into this object (`if (Array.isArray(branches) && branches.length > 0) liveSyncedState.branches =
branches;` — **no authentication required on this endpoint** beyond the shared `AGENT_API_SECRET`
that the frontend would need to know, which is itself a design smell: the browser is not supposed
to know backend agent secrets). Every WhatsApp-agent tool then reads from `liveSyncedState`/
`liveSyncedBookings` **as a fallback whenever the MySQL query returns empty or throws**
(`if (!services || services.length === 0) { services = liveSyncedState.services; }` — repeated
verbatim for branches, services, barbers). This means: when MySQL is briefly empty (fresh
deploy, migration in progress) or errors, the WhatsApp bot silently serves **hardcoded Cairo salon
data compiled into the source file** ("`branch-elhdad`", "الحداد - ELHDAD", specific VIP prices,
specific phone numbers) instead of failing loudly. For a product meant to be redeployed per-salon,
this is actively dangerous: a fresh deployment for **Salon B** whose MySQL isn't seeded yet would
have its WhatsApp bot quote **Salon A's** (the original "ELHDAD" salon's) prices, branch address,
and phone number to real customers, because those exact strings are hardcoded as the fallback.

### 8.3 Concretely, the chain of causation

1. Someone needed the UI to feel instant → optimistic local mutation was added (reasonable).
2. Someone needed it to survive a page refresh before there was a working backend → `zustand/persist`
   to IndexedDB/localStorage was added (reasonable, *if temporary*).
3. The real backend (Clean Architecture, MySQL, `withTransaction`) was subsequently built — but the
   frontend call sites were never revisited to make the *server's response* replace the optimistic
   state, and the persisted store was never scoped down to UI-only state.
4. Separately, the WhatsApp/agent surface needed to work even before MySQL was configured during
   initial bring-up, so an in-memory JS object with real salon data baked in was added as a
   fallback — and never removed once MySQL was wired up.

Both 3 and 4 are the same root cause: **incomplete migration from a prototype/offline-first phase
to the production client-server phase**, not a deliberate architecture choice and not something
that can be fixed by "just remove localStorage" — the fix has to replace every optimistic-write
call site with a request/response/reconcile cycle (§9), and remove the in-memory fallback dataset
from the server entirely (§8.2), replacing "fall back to hardcoded data" with "return a clear
`503`/empty result and let n8n's WhatsApp flow apologize gracefully" — never fabricate a name/price
that isn't actually true for *this* deployment.

---

## 9. Correct Target Data Architecture

**READ**
```
Frontend component
  -> React Query / SWR (or, minimally, an explicit useEffect fetch) 
  -> GET /api/<resource>
  -> requireAuth / requireRoles / requireBranchAccess
  -> Controller -> UseCase -> IRepository -> MySQL
  -> JSON response
  -> Frontend cache updated FROM the response (never computed client-side)
```

**CREATE**
```
Frontend form submit
  -> POST /api/<resource>            (NO optimistic mutation of bookings/queue/money beforehand)
  -> validateBody(schema)             (server-side validation, already exists via Zod-style validators)
  -> requireAuth / requireRoles
  -> UseCase.execute()
       -> withTransaction(conn => {
            FOR UPDATE row locks where concurrency matters (already correct for bookings)
            INSERT
            compute derived values (price, queue_number, secure_token) SERVER-SIDE ONLY
          })
  -> COMMIT -> realtime broadcast (Socket.IO, already exists) -> HTTP 201 with the created row
  -> Frontend: only NOW does the UI show the booking, using the id/queue_number/total the
     server returned. A brief loading/pending state is correct and expected; a fabricated
     client-side booking id is not.
```

**FAILURE**
```
DB error inside withTransaction -> ROLLBACK (already implemented in config/database.ts)
  -> UseCase throws -> Controller catches -> HTTP 4xx/5xx with a real error message
  -> Frontend: show the error, do NOT create a local record, do NOT leave an optimistic
     row in the UI. No fabricated "fallback booking" (see §17.2 — this is currently violated
     in agentTools.routes.ts).
```

**Cross-cutting behaviors this fixes automatically once adopted:**
- **Refresh:** re-fetches from `/api/*`, always shows the DB's current truth instead of whatever
  was last written to IndexedDB.
- **Logout/login, another device, another browser:** identical — there is no per-browser state to
  diverge from, because the browser no longer holds authoritative business data, only a
  `queryClient`-style cache tagged by request.
- **Browser storage clearing:** no data loss, because nothing important lived there.
- **Server restart:** no impact on business data (already true today, since MySQL survives
  restarts) — the *only* thing lost today on server restart is `liveSyncedState`/`liveSyncedBookings`,
  which is exactly why that in-memory store must be removed (§8.2), not patched.

The Zustand store's remaining legitimate job after this refactor: `selectedBranchId` as a UI
preference, `isAiDrawerOpen`, `lastCalledCustomer` (a purely ephemeral "just called" animation
trigger, fine to keep local), and a thin response cache. `zustand/persist` should persist **only**
`selectedBranchId` and `currentUser` (or better, currentUser should come from `GET /api/auth/me`
on load using the httpOnly cookie, and not be persisted client-side at all — see §11).

---

## 10. Data Consistency Problems

| # | Problem | Root Cause | Impact | Recommended Solution |
|---|---|---|---|---|
| DC-1 | Client-computed `queue_number` can collide across two tabs/devices | `store.ts createBooking()` scans local `bookings` array instead of asking the server | Two customers shown the same queue number until the fire-and-forget sync eventually corrects it (or doesn't, if the request failed) | Never compute queue numbers client-side; always take the server's `FOR UPDATE`-derived value from the create-booking response (§9) |
| DC-2 | Optimistic booking IDs (`BK-${4 random digits}`) generated in two independent places (browser `store.ts` and `agentTools.routes.ts` fallback branch) with a 9,000-value space | Both were built to work without waiting on the other | Real, if rare, collision risk producing two logically different bookings sharing an id, or a client-shown id that the server never actually persisted | Server is the only ID generator; use UUID or a DB auto-increment/sequence, never `Math.random()` for anything user-facing that must be unique |
| DC-3 | `agentTools.routes.ts /bookings/create-pending` silently falls back to a **different, unpersisted** booking object when the DB insert throws, and still returns HTTP 201 "success" | Deliberate "graceful fallback" try/catch around the DB call (see code around `catch (dbErr)`) | Customer receives a real-looking booking confirmation via WhatsApp for a booking that may not exist in MySQL at all — a payment could then be requested/received for a "ghost" booking | Never return success on a caught DB error; return a real error, let n8n retry or apologize. See §17.2 |
| DC-4 | `ClaimWaitlistOfferUseCase.execute()` reads the offer (`findByOfferToken` + `isOfferValid()`), and only creates the booking + marks it claimed in two **separate, non-atomic** steps | The read-check-then-two-writes pattern was not wrapped in a single `withTransaction` with a row lock on the waitlist entry, unlike `CreateBookingUseCase` which does lock | Two concurrent `POST /waitlist/claim/:token` calls with the same still-valid token can both pass `isOfferValid()` before either call marks it claimed → double booking from one waitlist slot | Wrap the whole method in `withTransaction`, `SELECT ... FOR UPDATE` the waitlist row by token, re-check validity/claimed status inside the lock, then create the booking + mark claimed in the same transaction |
| DC-5 | Frontend rehydrates the entire previous session's `bookings`/`queue`/`branches` from IndexedDB on load, and no confirmed refetch-and-replace happens on mount (see §6 caveat) | §8 root cause | Stale data shown after a receptionist's browser has been closed overnight; a cancelled-elsewhere booking may still show as active until any store action happens to trigger a resync | Remove business data from `persist()` entirely (§9) |
| DC-6 | Errors from `api.*()` calls in `store.ts` are caught and only `console.warn`'d — never surfaced to the UI | Fire-and-forget dispatch pattern | User believes an action succeeded (branch created, price changed, booking cancelled) when the server actually rejected it (e.g. RBAC 403, validation 400) — silent, invisible failures | Every store action must `await` the API call, and only update UI state from the response; show a toast on failure and do not apply the optimistic change (or roll it back) |

---

## 11. Security Audit

Findings are grouped by area; each cites the exact evidence.

### 11.1 CORS — wide open despite an allow-list being defined (P0)
`server/src/config/security.ts`:
```js
const allowedOrigins = [clientUrl, 'http://localhost:5173', ...];
export const corsMiddleware = cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    callback(null, true);          // <-- allowedOrigins is never consulted
  },
  credentials: true,
  ...
});
```
`allowedOrigins` is dead code. Combined with `credentials: true` and the fact that the API also
accepts an `Authorization: Bearer` header from `localStorage` (§11.4), any website a logged-in
staff member visits can issue authenticated, credentialed requests to the TrimMind API on their
behalf. **Fix:** actually check `allowedOrigins.includes(origin)` and reject/allow accordingly; in
production this should be exactly `CLIENT_URL` (single deployment per salon — no need for a
wildcard).

### 11.2 `/api/ai/chat` is completely unauthenticated (P0)
See §17.1 for full detail — no `requireAuth`, client-controlled `role` selects which of four Gemini
API keys is spent, client-controlled `systemInstruction` is forwarded verbatim to Gemini.

### 11.3 Agent-tools shared secret has a hardcoded fallback checked into source (P0)
`server/src/routes/agentTools.routes.ts`:
```js
const AGENT_API_SECRET = process.env.AGENT_API_SECRET || process.env.WHATSAPP_AGENT_SECRET || 'trim-mind-agent-secret-key-2026';
```
If the deployment's `.env` doesn't set `AGENT_API_SECRET` (easy to miss across N independent
per-salon deployments, which is exactly this product's deployment model), the effective secret is
a **string published in this very source tree**: `trim-mind-agent-secret-key-2026`. Anyone who has
ever seen this codebase (a competitor, a former contractor, anyone this audit is shared with) can
call every agent tool — including `bookings/cancel`, which cancels a real customer's real booking
given only their phone number — against any TrimMind deployment that didn't override the default.
**Fix:** fail startup (`process.exit(1)`) if `AGENT_API_SECRET` is not set in production, and
delete the hardcoded fallback string entirely.

### 11.4 JWT stored in `localStorage` in addition to an httpOnly cookie (P0)
- Server sets a correct httpOnly/secure(prod)/SameSite=lax cookie on login
  (`server/src/routes/auth.routes.ts` `/login`).
- Server **also returns the raw token in the JSON response body** (`data: result` — verify
  `AuthenticateStaffUseCase`/`authenticateStaff` includes `token` in its return —
  **UNVERIFIED at the exact field name**, but `src/lib/api.ts`'s request interceptor unconditionally
  reads `localStorage.getItem('salon_auth_token')` and attaches it as `Authorization: Bearer`,
  which is only possible if something in the frontend is writing that token to localStorage after
  login — this write site was not located in the files read, most likely in `AuthPage.tsx`,
  **UNVERIFIED, recommend a direct grep of `AuthPage.tsx` for `salon_auth_token`**).
- Any XSS anywhere in the SPA (e.g. via the file-upload gap in §11.7, or any future `dangerouslySetInnerHTML`)
  can now read `localStorage.getItem('salon_auth_token')` and exfiltrate a fully valid staff session
  token — completely bypassing the httpOnly protection that was correctly set up for the cookie.
  **Fix:** pick one mechanism. Recommended: httpOnly cookie only; stop returning the token in the
  JSON body; stop reading/writing `salon_auth_token` in `localStorage`/`api.ts`; rely on
  `withCredentials: true` (already set) for the cookie to travel automatically.

### 11.5 Privilege escalation via staff profile PATCH (P1)
`PATCH /api/auth/profiles/:id` (`server/src/routes/auth.routes.ts`) only requires
`requireRoles('manager')` and allows `is_super_admin` to be set to `1` in the same request, on
**any** profile id including the caller's own. Any ordinary manager account can grant itself (or
any other manager) `is_super_admin`, which (`requireRoles`) grants universal bypass of every RBAC
check in the app, and (`requireBranchAccess`) bypasses per-branch isolation entirely. **Fix:**
`is_super_admin` changes must require the *caller* to already be `is_super_admin`, checked
explicitly in this handler (`req.user.is_super_admin`), not just any `manager`.

### 11.6 Weak WhatsApp-agent "ownership" check by phone suffix (P1)
`agentTools.routes.ts /bookings/reschedule` and `/bookings/cancel` verify the caller "owns" a
booking by comparing only the **last 8–9 digits** of the phone number
(`storedPhoneClean.endsWith(cleanPhone.slice(-8))`), and multiple fallback paths in `/bookings/cancel`
will cancel *any* recent non-completed booking in `liveSyncedBookings` if no exact/partial match is
found at all (`booking = liveSyncedBookings.find((b) => ... b.status !== 'cancelled' && b.status
!== 'completed')` with no phone constraint in that final fallback). Given this endpoint sits behind
only the shared `AGENT_API_SECRET` (§11.3) rather than per-customer authentication, and the secret
has a public fallback default, this compounds into an unauthenticated cancel-any-booking primitive
in the worst case. **Fix:** require an exact, full phone-number match (already normalized), remove
the no-phone fallback path, and consider requiring the `secure_token` from the original booking
confirmation rather than a phone number for any state-changing agent action.

### 11.7 File upload: MIME check only, no extension allow-list (P1)
`server/src/routes/upload.routes.ts`:
```js
filename: (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase(); // attacker-controlled string
  cb(null, `proof_${Date.now()}_${uuid}${ext}`);
},
fileFilter: (_req, file, cb) => {
  const allowedMimes = ['image/jpeg','image/png','image/webp','image/jpg'];
  if (allowedMimes.includes(file.mimetype)) cb(null, true); // client-supplied header, spoofable
  ...
}
```
The saved file's **extension** comes from the attacker-controlled `originalname` and is never
checked against an allow-list — only the client-supplied `mimetype` header is checked, and that
header is trivially spoofable. An attacker can upload a file named `x.html` (or `x.svg`) with
`Content-Type: image/jpeg`; the file filter passes (checks `mimetype`, not extension); the saved
file is `proof_<ts>_<uuid>.html`, served publicly and unauthenticated by
`app.use('/uploads', express.static(uploadsPath))` (`server/src/index.ts:68`). A crafted HTML/SVG
file served from the same origin is a same-origin stored-XSS primitive against any staff member
who can be induced to open the link (e.g. via the receptionist's own "review payment proof" UI,
which presumably renders the uploaded image inline — **UNVERIFIED**, `PaymentProofModal.tsx` was
not read in full). **Fix:** validate the file's actual content (magic bytes, e.g. via
`file-type` package) not just the header; force the output extension from an allow-list derived
from the *verified* content type, never from `originalname`; consider serving `/uploads` with
`Content-Disposition: attachment` or from a separate cookie-less subdomain.

### 11.8 SQL Injection — not found in reviewed code
Every `query()` call read during this audit used parameterized placeholders (`?`) correctly,
including the dynamic-`UPDATE`-field-list handlers in `branches.routes.ts`/`auth.routes.ts` (the
field *names* are drawn from a hardcoded allow-list before being interpolated into the SQL string,
and *values* are always passed as bound parameters). **No SQL injection found in the files read.**
This should still be re-verified for `insights.service.ts`, `recall.service.ts`, and
`noshow.service.ts` internals, which were **not** read line-by-line —
**UNVERIFIED — REQUIRES MANUAL VERIFICATION**.

### 11.9 XSS — sanitize middleware exists but is best-effort
`server/src/middleware/sanitize.ts` strips all HTML tags from every string in `req.body/query/params`
except keys containing `password` or named `imagePath`/`imageData`. This is applied globally
(`server/src/index.ts:58`) before routing — a reasonable defense-in-depth layer. It does **not**
protect the frontend from rendering server-stored strings unsafely (e.g. via
`dangerouslySetInnerHTML`) — **not verified either way, no such usage was found in the files read,
but not all `.tsx` files were read — UNVERIFIED.**

### 11.10 Rate limiting gaps
- `authLimiter` (10/15min) is correctly applied to `/api/auth/login`.
- `bookingLimiter` is **defined** in `middleware/rateLimiter.ts` but **grep of every route file
  shows it is never imported/used anywhere** — `bookings.routes.ts`'s public `POST /` (customer
  booking creation) only inherits the generic `apiLimiter` (120 req/min per IP), i.e. up to 120
  bookings/minute per IP is currently possible, not 15/hour as the limiter's own comment intends.
  **Fix:** apply `bookingLimiter` to `POST /api/bookings`.
- `/api/ai/chat` gets only the generic `apiLimiter`, and — being unauthenticated (§11.2) — that
  120/min ceiling is shared across every anonymous caller from a given IP, trivially bypassed with
  rotating IPs, directly translating to Gemini API cost.

---

## 12. Authentication Audit

- Password hashing: bcrypt via `BcryptPasswordHasher` / `hashPassword` — appropriate algorithm
  choice. Work factor **not verified** — `UNVERIFIED, check the bcrypt salt-round constant`.
- JWT verification (`middleware/auth.ts requireAuth`) correctly re-checks the user still exists and
  `is_active = 1` in the DB on every request (not just trusting the token payload) — this is good
  practice and prevents a deactivated staff member's still-valid token from continuing to work.
- `JWT_SECRET` has a hardcoded fallback identical in spirit to §11.3:
  `process.env.JWT_SECRET || 'fallback_dev_secret_only_change_in_prod_123456789'`
  (`server/src/middleware/auth.ts`). Same fix: refuse to boot in production without a real
  `JWT_SECRET`.
- `login_attempts` table exists in the schema (`database/schema.sql`) suggesting brute-force
  tracking was intended; whether `authenticateStaff` actually writes to/reads from it was **not
  verified** — `server/src/services/auth.service.ts` full content was not read in this pass.
  **UNVERIFIED.**

---

## 13. Authorization / RBAC / IDOR Audit

- `requireRoles()` correctly gives `is_super_admin` universal bypass, and otherwise checks the
  authenticated (server-side, DB-verified) `req.user.role` — not a client-supplied value. Good.
- `requireBranchAccess()` correctly compares `req.user.branch_id` (server-derived) against the
  requested branch, with managers/super-admins exempted. Applied inconsistently, however: it is
  **only actually attached where explicitly imported and used** — a full audit of every route file
  for `requireBranchAccess` usage was not exhaustively completed; `queue.routes.ts`,
  `bookings.routes.ts`, and `waitlist.routes.ts` should each be re-checked to confirm a
  receptionist/barber for Branch A cannot query Branch B's queue/bookings by simply passing a
  different `branchId` param. From what was read, `GET /api/queue/:branchId` (`queue.routes.ts`) is
  **public** with no `requireAuth` at all (intentional — it's the TV/customer-facing display) so
  this is not an IDOR in itself, but confirm no *sensitive* fields (customer phone numbers?) leak
  through that public endpoint — **UNVERIFIED, `queue.service.ts getBranchQueue` projection was not
  read.**
- §11.5 (privilege escalation) and §11.6 (weak WhatsApp ownership check) are the two confirmed
  IDOR/BOLA-class findings; see those sections for detail.

---

## 14. Token & Secret Security Audit

| Secret | Where stored | Where used | Exposed to frontend JS? | Hardcoded fallback in source? |
|---|---|---|---|---|
| `JWT_SECRET` | `server/.env` | `middleware/auth.ts` | No | **Yes** — `'fallback_dev_secret_only_change_in_prod_123456789'` (§12) |
| `GEMINI_API_KEY_*` (4 role-scoped keys) | `server/.env` | `routes/ai.routes.ts` (server-side `fetch` to Gemini) | No — correctly kept server-side | No fallback string, but the *selection* of which key to spend is attacker-controlled (§17.1) |
| `AGENT_API_SECRET` / `WHATSAPP_AGENT_SECRET` | `server/.env` | `routes/agentTools.routes.ts` | No | **Yes** — `'trim-mind-agent-secret-key-2026'` (§11.3) |
| `DB_PASSWORD` / `DATABASE_URL` | `server/.env` | `config/database.ts` | No | No (empty-string default only if unset, not a real secret string) |
| Staff JWT (issued token) | httpOnly cookie **and** `localStorage['salon_auth_token']` | `api.ts` interceptor | **Yes, via localStorage** | N/A — this is the duplicate-storage problem, §11.4 |
| Frontend `.env` (`VITE_API_URL`, `VITE_SOCKET_URL`) | `. env` (repo root) | Vite build (bundled into client JS, by design — these are meant to be public) | Yes, by design and correctly so — no secret values present | N/A |

Cookie flags on the auth cookie: `httpOnly: true` ✅, `secure: NODE_ENV==='production'` ✅
(correctly off only in dev), `sameSite: 'lax'` — reasonable, though combined with the wide-open CORS
in §11.1, `SameSite=lax` alone is not sufficient protection for state-changing cross-site requests
using non-simple methods, since the fetch would need CORS preflight approval anyway — closing
§11.1 is the actual fix, `SameSite` is defense in depth on top of it. No CSRF token mechanism was
found; given the app also accepts a bearer token (§11.4) for the same endpoints, CSRF risk is
currently secondary to the token-duplication issue — fixing §11.4 (cookie-only auth) should be
paired with either strict CORS (§11.1) or an explicit CSRF token for any cookie-authenticated
mutating request.

---

## 15. Database Engineering Audit

`database/schema.sql` (20 tables, InnoDB, utf8mb4) is, on the whole, competently designed:

- Foreign keys present on all reviewed relational columns (`bookings.branch_id/barber_id/service_id`,
  `booking_items.booking_id ON DELETE CASCADE`, `payment_proofs.booking_id ON DELETE CASCADE`,
  `ratings.booking_id`).
- Useful composite index `idx_branch_date_queue (branch_id, booking_date, queue_number)` exists —
  matches the exact query pattern used by the row-locking queue-number allocation in
  `MySQLBookingRepository`.
- `secure_token` is `UNIQUE` on `bookings`.
- `payment_proofs.booking_id` is `UNIQUE` (correctly enforces one proof per booking at the DB
  level, not just in application code).

Gaps found:
- No `UNIQUE` constraint on `(branch_id, booking_date, queue_number)` — uniqueness is currently
  enforced only by the application-level `FOR UPDATE` transaction logic, not by the schema. This
  is a defense-in-depth gap, not an active bug (the app-level logic is correct as far as reviewed),
  but a schema-level unique constraint would catch any future code path (e.g. a bulk-import script,
  or the un-migrated `agentTools.routes.ts` fallback insert in §17.2) that bypasses the use case and
  inserts directly. **Recommendation:** add the constraint; it will also immediately surface any
  remaining direct-insert code path as a loud error instead of a silent duplicate.
- `starts_at`, `ends_at`, `completed_at`, `cancelled_at`, `submitted_at`, `reviewed_at` are all
  stored as `VARCHAR(50)` rather than `DATETIME`/`TIMESTAMP`. This forces string-based date
  comparisons in several `WHERE` clauses seen in `agentTools.routes.ts`
  (`b.starts_at >= ? AND b.starts_at <= ?`) which only work correctly if every writer formats the
  string identically (ISO 8601) — a single writer using a different format (e.g. the
  `agentTools.routes.ts` "current-year auto-correct" logic that string-splices the year prefix,
  `finalStartsAt.replace(/^\d{4}/, currentYear)`) can silently corrupt sort/range order. Not
  confirmed as an active bug, but a real, verifiable fragility. **Recommendation:** migrate to
  proper `DATETIME` columns.
- Remaining tables (`financial_records`, `webhook_events`, `insight_reports`,
  `recall_campaigns`/`recall_sends`) were listed but not individually reviewed in depth for
  constraint completeness — **UNVERIFIED, recommend the same FK/index review be repeated for
  these before Phase 2 work begins.**

---

## 16. Transaction & Concurrency Audit

| Flow | Uses `withTransaction`? | Uses row locks (`FOR UPDATE`)? | Verdict |
|---|---|---|---|
| Booking creation (`CreateBookingUseCase` → `MySQLBookingRepository.createWithTransaction`) | ✅ | ✅ (queue-number scan and chair-status check both locked, per §14 evidence) | **Correct** |
| Waitlist offer claim (`ClaimWaitlistOfferUseCase`) | ❌ (booking creation inside it is transactional, but the *offer validity check* and the *markClaimed* call are not part of that same transaction, nor locked) | ❌ | **Race condition — DC-4, §10** |
| Agent-tools pending booking creation (`agentTools.routes.ts /bookings/create-pending`) | Delegates to the same `createBooking()`/use case on the happy path (so inherits the correct locking) | — | Correct on success path; **the failure/fallback path bypasses it entirely and does a raw, unlocked `INSERT`** — see §17.2 |
| Reschedule (`agentTools.routes.ts /bookings/reschedule`) | ❌ raw `query()` `UPDATE` after a separate `SELECT ... FOR UPDATE`-less conflict check | ❌ | TOCTOU race: two concurrent reschedule requests to the same new slot can both pass the conflict `SELECT` before either `UPDATE`s — **new finding, add as DC-7** |
| Cancel booking (`CancelBookingUseCase`) | **Not verified in this pass** — file exists at `usecases/bookings/CancelBookingUseCase.ts` but was not opened. **UNVERIFIED.** |
| Payment proof review (approve → creates queue entry) | Reviewed only in the **frontend** `store.ts` version (`reviewPaymentProof`) which is not transactional by definition (client-side). The **backend** equivalent (`BookingController`/use case referenced by `PATCH /:id/payment-proof` in `bookings.routes.ts`) was not opened in this pass — **UNVERIFIED, this is one of the highest-value files to review next given it touches money + queue placement.** |

**DC-7 (new, add to §10 table):** Reschedule endpoint's VIP-collision check-then-update is not
transactional/locked — same class of bug as DC-4. Fix identically: wrap in `withTransaction`, lock
the barber's relevant rows for that date, re-check inside the lock.

`server/src/scripts/simulate_full_e2e.ts` and `verify_hardening.ts` exist and *suggest* concurrency
was tested at some point manually — their actual assertions were not read in this pass.
**UNVERIFIED — worth reading before Phase 4 to see what was already validated vs. assumed.**

---

## 17. AI Security Audit

### 17.1 `POST /api/ai/chat` — unauthenticated, client-controlled role and system prompt (P0)

Full route, `server/src/routes/ai.routes.ts`:
```js
router.post('/chat', async (req, res) => {
  const { role = 'customer', systemInstruction, contents } = req.body;
  const apiKey = ROLE_KEYS[role] || ROLE_KEYS.customer;   // role is CLIENT-SUPPLIED
  ...
  payload.systemInstruction = { parts: [{ text: systemInstruction }] };  // CLIENT-SUPPLIED, forwarded verbatim
  const apiRes = await fetch(`https://generativelanguage.googleapis.com/.../generateContent?key=${apiKey}`, ...);
```
Mounted at `app.use('/api/ai', aiRoutes)` (`server/src/index.ts:82`) with **no** `requireAuth`/
`requireRoles` in between — every other sensitive router (`insights`, `recall`, `waitlist` staff
actions, `whatsapp-session`) explicitly does `router.use(requireAuth, requireRoles(...))` at the
top; `ai.routes.ts` is the one router in the entire backend that doesn't.

Consequences, all directly exploitable by an unauthenticated internet caller:
1. **Cost/DoS:** repeatedly call `/api/ai/chat` to exhaust the salon owner's Gemini quota/budget —
   only the generic 120/min `apiLimiter` applies (§11.10).
2. **Key selection:** by passing `role: "manager"` (or `receptionist`/`barber`), the caller chooses
   which of the four separately-provisioned Gemini API keys gets billed/rate-limited, defeating
   whatever reason those keys were split by role in the first place (likely per-role quota
   isolation) — the isolation is decided by the client, not the server.
3. **System-prompt injection:** the caller fully controls `systemInstruction`, i.e. they can make
   the salon's own Gemini key answer *any* prompt they want with *any* persona they want, for free,
   using the business's paid API key — completely unrelated to TrimMind's actual purpose. This is
   the literal client-supplied-system-prompt risk the audit brief called out.

**Fix:** add `requireAuth` (or, if genuinely intended to also serve the anonymous
customer-facing AI widget, then keep it public but (a) never let the client choose `role` — derive
it from `req.user?.role || 'customer'` server-side, defaulting unauthenticated callers to the
`customer` key/quota only, and (b) never accept a client-supplied `systemInstruction` — build it
server-side from a fixed template per role).

### 17.2 Fabricated "success" on database failure inside the WhatsApp booking tool (P1, ties to DC-3)

`agentTools.routes.ts /bookings/create-pending`, the `catch (dbErr)` block: on any DB error during
`createBooking()`, instead of returning an error, the handler builds a **new, different**
in-memory `fallbackBooking` object, pushes it to `liveSyncedBookings`, and returns
`res.status(201).json({ success: true, ... data: fallbackBooking })` — i.e. the customer is told
via WhatsApp "your booking is confirmed, here's your booking ID and payment instructions" for a
booking that (a) is not the one that failed to insert, and (b) may never exist as a durable MySQL
row (the `fallbackBooking` branch does not itself attempt any DB write). If the underlying DB error
was transient, this creates a customer who believes they have a queue position and made a deposit
against a booking ID the staff dashboard (which reads MySQL) will never show.

### 17.3 AI does not have a tool-authorization boundary distinct from the agent secret

Per the audit brief's model (`AI → Authorized Tool → Backend → Use Case → Repository → Database`),
the current reality is `WhatsApp/n8n → shared static secret → any agent-tools route → mix of
use-cases and raw SQL`. There is no per-tool scoping (e.g. a "read-only" tool token vs a
"can-cancel-bookings" token) — the single `AGENT_API_SECRET` grants access to every tool including
destructive ones (`bookings/cancel`). **Recommendation:** at minimum, split read tools
(customer lookup, availability, branches/services/barbers list) from write tools (create booking,
cancel, reschedule, submit payment proof) behind separate secrets/scopes, so a leaked read-only
integration (e.g. a future analytics export) can't cancel bookings.

### 17.4 `AskInsightsAssistantUseCase` does not actually call an LLM

Noted for engineering-maturity accuracy, not security: `server/src/usecases/insights/
AskInsightsAssistantUseCase.ts` builds a hardcoded Arabic template string using real DB metrics and
literally echoes the user's `question` back inside a fixed sentence — it does not call Gemini or
any model. This isn't a vulnerability, but it means the "AI Business Insights assistant" feature is
currently a templated report, not an AI Q&A feature, which is worth knowing before estimating any
"AI" roadmap work in this area.

---

## 18. WhatsApp / Evolution / n8n Audit

- The actual WhatsApp transport implemented in code is **Baileys** (direct WhatsApp Web protocol
  library, `@whiskeysockets/baileys`, `server/src/services/whatsapp.service.ts`,
  `server/src/adapters/gateways/BaileysWhatsAppGateway.ts`), **not** the Evolution API that the
  audit brief and `docs/WHATSAPP_AI_ARCHITECTURE.md`/`WHATSAPP_AI_SETUP.md` reference by name.
  **This is a documentation/reality mismatch worth flagging explicitly** — whoever wrote those docs
  either planned to use Evolution API and pivoted to Baileys without updating the docs, or the docs
  describe a target architecture that was never implemented. Either way, any operational runbook
  based on those docs (e.g. "restart the Evolution container") will not match what's actually
  running. **Recommendation:** update `docs/WHATSAPP_AI_*.md` to describe Baileys accurately, or
  clarify if Evolution is planned as a future replacement.
- Session/auth state for Baileys is stored on disk at `server/uploads/whatsapp_auth/` (per
  `AUTH_DIR` in `whatsapp.service.ts`) — this directory is **inside** the same `uploads` tree that
  is served statically and rate-limited for public uploads (§11.7); confirm (not verified in this
  pass) that `whatsapp_auth/` is excluded from the static file server, since Baileys auth-state
  files are effectively equivalent to a live WhatsApp session token — if publicly downloadable via
  `/uploads/whatsapp_auth/...`, that would allow full WhatsApp account takeover.
  **UNVERIFIED — HIGH PRIORITY to check `express.static` mount path exactly.**
- Idempotency: `bookings/create-pending` destructures `idempotencyKey` from the request body and
  **never uses it anywhere in the function** — the parameter is dead. The route's own comment
  claims "(Idempotent)". It is not. A retried webhook delivery (n8n's own retry policy, or a flaky
  WhatsApp webhook redelivery) will create a **second real booking** for the same customer message.
  **Fix:** actually use `idempotencyKey` — check `webhook_events` (a table that already exists in
  the schema, `MySQLWebhookEventRepository` already exists as an adapter!) for a prior record with
  this key before creating anything, and short-circuit with the previous result if found. The
  infrastructure for correct idempotency already exists in this codebase (`IWebhookEventRepository`)
  — it simply isn't wired into this specific route.
- The four `n8n/workflows/*.json` files were listed but their node-level webhook-auth
  configuration, retry policy, and credential references were **not opened/reviewed** in this
  pass — **UNVERIFIED — REQUIRES MANUAL VERIFICATION**, specifically: (a) does the n8n
  "WhatsApp Master Router" workflow verify a webhook signature/secret from the WhatsApp
  provider before processing, (b) do any nodes have credentials hardcoded in the workflow JSON
  itself (a common n8n export footgun) rather than referencing n8n's credential store.

---

## 19. Error Handling Audit

Systemic pattern found across both frontend and backend: **errors are frequently caught and
either silently ignored or converted into a fake success**, rather than surfaced.

- Frontend: every `store.ts` mutator ends `.catch((err) => console.warn(...))` — see §10 DC-6.
- Backend, `agentTools.routes.ts`: at least six separate `try { await query(...) } catch {}` blocks
  with a genuinely empty catch body (e.g. around the `confirm-arrival` status update, the
  `payments/submit-proof` status update, the branch-row lookups) — a DB write failure here is
  indistinguishable, from the caller's perspective, from success, because the surrounding handler
  proceeds to return `success: true` regardless.
- The `/bookings/create-pending` fallback (§17.2) is the most severe instance: not just an ignored
  error, but a **fabricated alternate success payload**.

**Recommendation (applies broadly, not file-by-file):** adopt a rule for this codebase — a caught
database error inside a request handler must either (a) be re-thrown to the shared `errorHandler`
middleware (already exists, `server/src/middleware/errorHandler.ts`, and is correctly mounted last
in `index.ts`), or (b) be logged **and** cause the handler to return a non-2xx response — never (c)
be swallowed and followed by a 2xx response describing an outcome that didn't happen.

---

## 20. Performance Audit

Not exhaustively profiled (would require a running instance with realistic data volume — out of
scope for a static read-through). Concrete, file-verifiable observations:

- `agentTools.routes.ts` several handlers issue 2–3 sequential `query()` calls where one JOINed
  query would do (e.g. `/payments/submit-proof`'s branch lookup is repeated in both the "not found"
  and the main path as separate round-trips). Not a scaling bottleneck at single-salon volume, but
  worth cleaning up during the Phase 6 refactor since those handlers are being rewritten anyway.
- No N+1 query patterns were found in the reviewed repository classes (`MySQLBookingRepository`
  uses JOINs for related data rather than looping). Other repositories/services
  (`insights.service.ts`, `recall.service.ts`) were **not** read in full — **UNVERIFIED.**
- `INITIAL_*` seed arrays (`src/lib/seedData.ts`, 303 lines) are bundled into the production JS and
  loaded into the Zustand store as default state even when a real backend/DB exists — pure waste of
  initial bundle size and a contributor to §8's confusion between "seed/demo data" and "real
  business data," but not a runtime performance bottleneck.
- Frontend rendering, caching strategy, and cron-job (`cleanup.service.ts`, `reminder.service.ts`,
  `noshow.service.ts`) scheduling internals were **not reviewed** — **UNVERIFIED.**

---

## 21. Deployment & Configuration Audit

Given the confirmed one-deployment-per-salon model, **business data must never be hardcoded in
source** — it must all come from `database/seed.sql` (run once per new deployment) or the
`settings`/`branches` tables, editable per deployment. Violations found:

| Hardcoded value | File | Should come from |
|---|---|---|
| Salon name "TrimMind (الحداد VIP)" in the WhatsApp confirmation message template | `server/src/usecases/bookings/CreateBookingUseCase.ts` | `settings` table / branch name |
| Tracking URL domain `https://trimmind.up.railway.app` | `CreateBookingUseCase.ts`, and again independently in `agentTools.routes.ts` (`trackingUrl` field, twice) | `process.env.CLIENT_URL` or a `PUBLIC_APP_URL` env var |
| Full branch/service/barber catalog (specific VIP prices, "الحداد - ELHDAD" branch, specific phone numbers `01005437633`, `01285694670`, `01285694689`) | `server/src/routes/agentTools.routes.ts` (`liveSyncedState` initializer and the hardcoded `barbers` fallback array inside `/barbers/list`) | Must be deleted entirely — this is exactly the in-memory-fallback-as-database problem from §8.2; a fresh per-salon deployment must never see this data even transiently |
| n8n webhook URL default `https://n8n-server-production-bdce.up.railway.app/webhook/whatsapp-webhook` | `server/src/services/whatsapp.service.ts` (`N8N_WEBHOOK_URL` fallback) | Fine as a *fallback for the original deployment's convenience*, but must be documented clearly as "override this in every new deployment's `.env`" — currently it's silently correct-by-default for one specific salon and silently wrong for every other one |
| Default WhatsApp phone number `'01005437633'` used as a default param in `whatsappSession.routes.ts /pair` | `server/src/routes/whatsappSession.routes.ts` | Should have no default, or default from `settings` |

**Recommendation:** treat §21's table as the literal checklist for Phase 9 — every one of these
must become a required (or `settings`-table-sourced) configuration value with **no working
fallback to real salon-specific data**, so that a second deployment fails loudly/obviously if
mis-configured instead of quietly serving the first salon's data.

---

## 22. Testing Audit

`grep`/`find` across the entire archive for `*.test.*`, `*.spec.*`, and any `test`/`jest`/`vitest`
script in either `package.json` returned **zero results**. There is no test runner configured in
either `package.json` (`root` or `server`). `server/src/scripts/simulate_full_e2e.ts` and
`verify_hardening.ts` exist as standalone manual scripts (not wired into any CI/test command) —
their content was not reviewed in this pass but they are **not** a substitute for an automated test
suite (no evidence of being run in CI; `package.json` has no `test` script referencing them).

**Verdict: 0% automated test coverage across the entire product.** Every item requested by the
audit brief (§20 of the brief) — auth, authorization/IDOR, DB persistence, booking concurrency,
payments, waitlist, no-show, AI, WhatsApp, webhooks, secrets — is currently untested. Given the
volume of concurrency- and security-sensitive logic found in this audit (§16, §17), this is itself
one of the highest-leverage gaps: several of the P0/P1 findings above (the AI auth bypass, the
waitlist race, the reschedule race) would have been caught by even a minimal integration test
suite before reaching this stage.

---

## 23. Problems Discovered

| ID | Severity | File | Function | Root Cause | Impact | Recommended Solution | Testing Requirements | Acceptance Criteria |
|---|---|---|---|---|---|---|---|---|
| P-01 | **P0** | `server/src/config/security.ts` | `corsMiddleware` | `allowedOrigins` array built but never consulted; callback always allows | Any origin can make credentialed requests | Actually check `allowedOrigins.includes(origin)` | Integration test: request from disallowed origin with a cookie must be rejected | Cross-origin request from a non-listed origin returns CORS error; listed origin works |
| P-02 | **P0** | `server/src/routes/ai.routes.ts`, `index.ts:82` | `POST /chat` | No `requireAuth`; `role`/`systemInstruction` client-controlled | Unauthenticated cost abuse + arbitrary system-prompt injection using the salon's paid Gemini key | Add auth (or at minimum server-derive `role`, drop client `systemInstruction`) | Test: unauthenticated call is 401 (or forced to `customer` role/template); authenticated staff call uses their own role's key | No client input can select an arbitrary key or override the system prompt |
| P-03 | **P0** | `server/src/routes/agentTools.routes.ts` | `requireAgentAuth` | Hardcoded fallback secret `'trim-mind-agent-secret-key-2026'` | Any deployment that forgets to set `AGENT_API_SECRET` is fully open to cancel/create/reschedule bookings by anyone who has seen this source | Remove fallback string; refuse to boot without the env var in production | Startup test: server exits non-zero if `AGENT_API_SECRET` unset and `NODE_ENV=production` | No default secret string exists anywhere in source |
| P-04 | **P0** | `server/src/middleware/auth.ts` | module-level `JWT_SECRET` | Hardcoded fallback `'fallback_dev_secret_only_change_in_prod_123456789'` | Forged JWTs possible on any deployment missing `JWT_SECRET` | Same pattern as P-03 | Same as P-03 | Same as P-03 |
| P-05 | **P0** | `src/lib/api.ts`, `server/src/routes/auth.routes.ts` | axios interceptor / `/login` | JWT persisted to `localStorage` in addition to httpOnly cookie | Any XSS = full session theft, defeating the httpOnly cookie | Cookie-only auth; stop returning/storing the raw token client-side | Test: after login, no `salon_auth_token`-equivalent readable value exists in `localStorage`/`sessionStorage` | Session works purely via cookie; no JS-readable token exists |
| P-06 | **P0** | `server/src/routes/agentTools.routes.ts` | `/bookings/create-pending` catch block | DB error swallowed, fake `201 success` returned with a fabricated, unpersisted booking | Customers told a booking succeeded when it may not exist in MySQL; payments could be requested against nothing | Never fabricate success on a caught DB error; return a real 5xx and let n8n retry/apologize | Integration test: force a DB error and assert the endpoint returns non-2xx and no phantom booking is shown to the customer | No code path returns `success:true` from inside a caught DB exception |
| P-07 | P1 | `server/src/routes/auth.routes.ts` | `PATCH /profiles/:id` | Any `manager` can set `is_super_admin=1` on any account incl. their own | Privilege escalation to full RBAC bypass | Require caller to already be `is_super_admin` to change that field | RBAC test: non-super-admin manager PATCHing `is_super_admin` is rejected | Only existing super-admins can grant/revoke super-admin |
| P-08 | P1 | `server/src/routes/agentTools.routes.ts` | `/bookings/cancel`, `/bookings/reschedule` | Ownership verified by last 8–9 phone digits only; cancel has a no-match fallback that cancels *any* recent open booking | Booking cancellation/reschedule by non-owners | Require full phone match; remove no-match fallback; consider requiring `secure_token` | Test: mismatched/partial phone is rejected; no fallback cancels an unrelated booking | Only the exact phone on the booking (or its secure token) can cancel/reschedule it |
| P-09 | P1 | `server/src/usecases/waitlist/ClaimWaitlistOfferUseCase.ts` | `execute` | Validity-check and claim/booking-creation not in one locked transaction | Two concurrent claims on one offer can both succeed (double booking) | Wrap in `withTransaction` with `FOR UPDATE` on the waitlist row; re-check validity inside the lock | Concurrency test: fire two simultaneous claim requests for the same token, assert exactly one succeeds | Second concurrent claim gets a clean "already claimed" error, no duplicate booking |
| P-10 | P1 | `server/src/routes/agentTools.routes.ts` | `/bookings/reschedule` | Conflict check and `UPDATE` not transactional/locked | Two concurrent reschedules to the same slot can both pass the check (double booking of a barber/slot) | Wrap in `withTransaction` + row lock, same pattern as `CreateBookingUseCase` | Same style of concurrency test as P-09 | Only one of two concurrent conflicting reschedules succeeds |
| P-11 | P1 | `server/src/routes/upload.routes.ts` | `fileFilter`/`filename` | Extension taken from attacker-controlled `originalname`; only spoofable MIME header checked | Stored file with attacker-chosen extension (e.g. `.html`) served publicly and unauthenticated → same-origin stored XSS | Validate real file content (magic bytes); force extension from a fixed allow-list | Test: upload a `.html` file with `Content-Type: image/jpeg`, assert rejection | Only genuinely-image bytes can be uploaded, with a fixed safe extension regardless of `originalname` |
| P-12 | P1 | `src/lib/store.ts` | every `add*/update*/delete*/create*/cancel*/review*` action | Optimistic local write + fire-and-forget API call + `console.warn`-only error handling; server response never consumed | UI can show state the server rejected or never received; refresh/second-device/second-tab show stale or diverging data; client-computed queue numbers/booking IDs can collide | Rework every action to `await` the API, apply state only from the response, roll back / toast on failure (§9) | Integration test per action: force the API call to fail, assert the store does not retain the optimistic change and the UI shows an error | Store state always matches the last successful server response; no action commits without server confirmation |
| P-13 | P1 | `server/src/routes/agentTools.routes.ts` | `liveSyncedState`, `/barbers/list` fallback, `/branches/list` fallback | Hardcoded specific-salon business data used as a silent fallback whenever MySQL is empty/erroring | A freshly-deployed second salon whose DB isn't seeded yet will have its WhatsApp bot quote the *original* salon's name/address/phone/prices | Delete the hardcoded fallback data entirely; on empty/error, return a clear failure and let the n8n flow apologize instead of fabricating an answer | Test: point at an empty DB, assert the tool returns an explicit "no data" response, never the hardcoded ELHDAD branch | No salon-specific string exists anywhere outside `database/seed.sql`/the `settings`/`branches` tables |
| P-14 | P1 | `server/src/routes/agentTools.routes.ts` | `/bookings/create-pending` | `idempotencyKey` destructured but never used, despite `IWebhookEventRepository`/`webhook_events` table already existing | Retried WhatsApp/n8n webhook deliveries create duplicate real bookings | Check `webhook_events` for the key before creating; short-circuit with the prior result if present | Test: send the same `idempotencyKey` twice, assert only one booking is created and the second call returns the first's result | Duplicate calls with the same idempotency key never create a second booking |
| P-15 | P2 | Six route files (`branches`, `barbers`, `chairs`, `services`, `products`, `settings`) | all handlers | Routes call `query()` directly, bypassing the Clean Architecture layer used elsewhere | Inconsistent validation/audit-logging; hard to extend safely (§4) | Introduce repository + use-case classes mirroring the booking pattern | Unit tests per new use case, mirroring existing `CreateBookingUseCase` tests (once those exist — see P-19) | All six resources go through `container.ts`-wired use cases, no raw `query()` left in route files |
| P-16 | P2 | `server/src/middleware/rateLimiter.ts`, `server/src/routes/bookings.routes.ts` | `bookingLimiter` (defined, unused) | Never imported/applied anywhere | Public booking-creation endpoint has a much looser effective limit (120/min via generic limiter) than intended (15/hr) | Apply `bookingLimiter` to `POST /api/bookings` and the WhatsApp create-pending tool | Load test asserting the 16th booking within an hour from one IP is rejected | Booking creation is capped per the limiter's own documented intent |
| P-17 | P2 | `database/schema.sql` | `bookings` table | No `UNIQUE(branch_id, booking_date, queue_number)` constraint | Only application code prevents duplicate queue numbers; any bypassing insert (e.g. P-06's fallback path) can silently duplicate | Add the composite unique constraint | Migration + test: attempt a duplicate insert, assert DB-level rejection | Constraint exists and is enforced even by direct SQL |
| P-18 | P2 | `database/schema.sql` | multiple date columns | `starts_at` etc. stored as `VARCHAR(50)` | Range/order queries depend on every writer using identical string formatting; a formatting bug elsewhere silently breaks sort order | Migrate to `DATETIME` | Regression test comparing query results before/after migration on a seeded dataset | All date columns are real `DATETIME`/`TIMESTAMP` types |
| P-19 | P2 | entire repo | — | Zero automated tests (§22) | No regression protection for any of the above fixes | Stand up a test runner (Vitest for both client and server is a natural fit given Vite is already used) and require tests for every fix in this roadmap | N/A — this item *is* the testing requirement for all others | CI runs a test suite covering at minimum: auth, RBAC, booking concurrency, waitlist concurrency, the AI endpoint's auth, and upload validation |
| P-20 | P2 | `server/src/services/whatsapp.service.ts` | `AUTH_DIR` | Baileys session files stored under `server/uploads/...`, same tree as the public upload route | Possible public exposure of WhatsApp session/auth material if the static mount isn't scoped correctly | Verify `express.static` mount excludes `whatsapp_auth/`; move it outside the public uploads tree entirely to be safe | Test: `GET /uploads/whatsapp_auth/<any file>` must 404 regardless of static config | WhatsApp auth state is never reachable over HTTP |
| P-21 | P2 | `docs/WHATSAPP_AI_ARCHITECTURE.md` etc. | — | Docs describe "Evolution API"; code implements Baileys directly | Operational runbooks/on-call docs will not match reality | Update docs to describe the actual Baileys-based implementation | N/A (documentation) | Docs and code agree on the WhatsApp transport in use |
| P-22 | P3 | `src/lib/aiService.ts` | `AI_RATE_LIMIT` | Customer AI rate limit enforced only client-side via `localStorage` | Trivially bypassed by clearing storage or using a different browser/incognito | Enforce rate limiting server-side (per-phone or per-session), keep the client-side check only as UX (early feedback) | Test: exceed the limit after clearing localStorage, assert server still enforces it | Server rejects/throttles beyond the intended quota regardless of client state |
| P-23 | P3 | `server/src/usecases/insights/AskInsightsAssistantUseCase.ts` | `execute` | Templated string, not an actual LLM call, despite being presented as an "AI assistant" | Feature is less capable than its name suggests; not a defect, a scoping/roadmap accuracy issue | Either wire it to Gemini for real free-form Q&A, or rename/document it as a templated report | N/A | Feature behavior matches its documented/marketed capability |
| P-24 | P3 | `src/lib/store.ts` | Zustand `SalonStore` interface | ~45 methods on one interface used by every role's components | No compile-time isolation between role-specific actions (ISP violation, §5) | Split into role-scoped selector hooks over one underlying store | N/A (structural) | Customer-facing components no longer import manager-only mutators |
| P-25 | P3 | `src/lib/seedData.ts` | `INITIAL_*` exports | Full demo dataset bundled into production JS and used as default store state | Bundle bloat; contributes to the confusion in §8 between demo and real data | Load seed/demo data only in an explicit dev/demo mode, never as the default production store state | Bundle-size check; manual QA that a fresh prod build shows empty/loading state, not demo salon data, before the first API response | Production bundle does not ship demo business data as default state |
| P-26 | P3 (defense-in-depth) | `server/src/routes/agentTools.routes.ts` | `requireAgentAuth` | Single shared secret grants access to both read and write tools | A leaked read-only integration could also cancel/create bookings | Split read vs write tool secrets/scopes | Test: a "read-only" scoped secret is rejected on write endpoints | Read and write tool access can be revoked independently |

---

## 24. Recommended Target Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  React SPA (per-salon deployment, static build)                     │
│  - UI-only state in Zustand: selectedBranchId (pref), isAiDrawerOpen,│
│    lastCalledCustomer (ephemeral), + a thin response cache           │
│  - currentUser derived from GET /api/auth/me (cookie), not persisted │
│  - NO client-side pricing/queue-number/ID computation                │
└──────────────────────────────┬────────────────────────────────────┘
                                 │  HTTPS, credentials: cookie only,
                                 │  strict CORS to this deployment's own origin
┌──────────────────────────────▼────────────────────────────────────┐
│  Express API (per-salon deployment, own MySQL)                      │
│  routes/*  → thin, HTTP-only (parse, call use case, format response)│
│  usecases/* → ALL business rules, ALL resources (not just bookings) │
│  domain/*   → entities + repository/gateway interfaces               │
│  adapters/repositories/* → MySQL implementations (withTransaction + │
│                              FOR UPDATE wherever concurrency matters)│
│  adapters/gateways/*     → WhatsApp (Baileys), JWT, bcrypt, Socket.IO│
│  middleware/  → requireAuth (cookie-only), requireRoles,             │
│                 requireBranchAccess (applied to EVERY branch-scoped │
│                 route, audited), rate limiters (all actually wired),│
│                 sanitize, validate                                   │
│  NO in-memory business-data fallback anywhere (liveSyncedState       │
│  deleted); NO hardcoded per-salon strings anywhere in source        │
└──────┬───────────────────────────────────────┬──────────────────┘
        │ same use cases                         │ same use cases
┌───────▼────────┐                     ┌─────────▼──────────────┐
│  Human REST API │                     │  WhatsApp Agent Tools   │
│  (staff + web    │                     │  (n8n → agent-tools      │
│  customer flows) │                     │  router, scoped secrets, │
│                   │                     │  idempotency-key checked │
│                   │                     │  against webhook_events) │
└──────────────────┘                     └─────────────────────────┘
                                │
                          ┌─────▼─────┐
                          │  MySQL     │  ← single source of truth,
                          │  (per      │    schema-level uniqueness
                          │  deployment)│    constraints as defense-in-depth
                          └───────────┘
```

Key structural changes from today, restated as a checklist:
1. Every resource (branches, barbers, chairs, services, products, settings) gets a repository +
   use case, mirroring bookings — no more raw `query()` in route files.
2. WhatsApp agent tools call the *same* use cases the REST API uses — no parallel booking-creation
   code path, no in-memory fallback dataset.
3. Frontend store shrinks to UI-state + response cache; all money/ID/queue-number computation
   happens server-side only.
4. Single auth mechanism: httpOnly cookie only.
5. CORS actually enforces the allow-list; in production this is exactly one origin per deployment.
6. Every use case that writes more than one row, or checks-then-writes, runs inside
   `withTransaction`, with `FOR UPDATE` locks wherever two concurrent requests could race (already
   the pattern for bookings — extend it to waitlist claim and reschedule).

---

## 25. Complete Engineering Roadmap

### Phase 0 — Discovery / Preparation
**Objective:** close the "UNVERIFIED" gaps this audit could not close from a static read, before
any fix work starts, so Phase 1+ isn't built on remaining unknowns.
**Problems solved:** none directly; de-risks everything downstream.
**Files/modules affected:** `server/src/services/auth.service.ts` (full read),
`usecases/bookings/CancelBookingUseCase.ts`, the booking-controller path for
`PATCH /:id/payment-proof`, `server/src/services/{insights,recall,noshow,cleanup,reminder}.service.ts`,
`n8n/workflows/*.json` (webhook auth + credential storage), `AuthPage.tsx` (confirm where
`salon_auth_token` is written), `express.static` mount for `/uploads` vs `whatsapp_auth/`.
**Dependencies:** none — can start immediately.
**Implementation approach:** read-through + a short findings addendum to this document (do not
start coding yet).
**Testing:** N/A.
**Acceptance criteria:** every UNVERIFIED item in §11–§20 above is resolved to a confirmed
finding or confirmed non-issue.
**Risk:** low; risk of skipping this phase is that Phase 1 fixes miss an equally severe issue
hiding in an unread file (most likely candidate: the payment-proof-approval backend path, since
it touches money + queue placement and was not opened).

### Phase 1 — Critical Security
**Objective:** close every P0 in §23 (P-01 through P-06).
**Problems solved:** open CORS, unauthenticated AI proxy, hardcoded secrets (agent + JWT), dual
token storage, fabricated booking success on DB failure.
**Files/modules affected:** `config/security.ts`, `routes/ai.routes.ts`, `routes/agentTools.routes.ts`,
`middleware/auth.ts`, `routes/auth.routes.ts`, `src/lib/api.ts`, `AuthPage.tsx`,
`routes/agentTools.routes.ts` create-pending catch block.
**Dependencies:** Phase 0's `AuthPage.tsx` finding for P-05.
**Implementation approach:** one fix at a time, each independently deployable and testable; no
schema changes required for this phase.
**Testing:** the specific test named per row in §23's table for P-01…P-06.
**Acceptance criteria:** all six P0 rows' acceptance criteria met.
**Risk:** medium — removing the `localStorage` token (P-05) requires the frontend to correctly
rely on `withCredentials: true` for every request; must verify no request path forgets this and
silently breaks after the change.

### Phase 2 — Database Source of Truth
**Objective:** implement §9's target read/create/failure flow; eliminate optimistic-without-
reconciliation writes (P-12) and the in-memory salon-data fallback (P-13).
**Problems solved:** DC-1 through DC-6, P-12, P-13, the root cause in §8.
**Files/modules affected:** `src/lib/store.ts` (every action rewritten), `src/lib/api.ts` (add
`.then()` handling), `agentTools.routes.ts` (`liveSyncedState`/`liveSyncedBookings` deleted).
**Dependencies:** Phase 1 (auth must be stable before reworking every API call site).
**Implementation approach:** resource by resource (bookings first, since it's highest-risk and
already has the correct backend pattern to mirror; then branches/barbers/chairs/services/products/
settings once Phase 6 gives them real use cases to call).
**Testing:** P-12's integration test per action; manual QA of refresh/second-tab/second-device
scenarios per §9.
**Acceptance criteria:** no store action mutates business-data state before an awaited API
response; `liveSyncedState`/`liveSyncedBookings` no longer exist in source.
**Risk:** medium-high — this is the largest single behavioral change and needs careful UX handling
of the newly-visible network latency (loading states where there were none before).

### Phase 3 — Authentication / Authorization
**Objective:** close P-07, P-08, and complete the `requireBranchAccess` coverage audit from §13.
**Problems solved:** privilege escalation, weak WhatsApp ownership checks, unverified branch-
isolation gaps.
**Files/modules affected:** `routes/auth.routes.ts`, `routes/agentTools.routes.ts`,
`middleware/auth.ts`, every branch-scoped route file.
**Dependencies:** Phase 0 (branch-access audit needs a full route-by-route confirmation first).
**Testing:** RBAC/IDOR test suite per §22's requested coverage.
**Acceptance criteria:** P-07/P-08 rows met; every branch-scoped route has a passing
cross-branch-denial test.
**Risk:** low.

### Phase 4 — Transactions / Concurrency
**Objective:** close P-09, P-10, P-17.
**Problems solved:** waitlist double-claim, reschedule double-book, missing DB-level uniqueness.
**Files/modules affected:** `ClaimWaitlistOfferUseCase.ts`, `agentTools.routes.ts` reschedule
handler, `database/schema.sql` (new migration for the unique constraint).
**Dependencies:** none beyond Phase 0's `CancelBookingUseCase` read (to confirm cancel doesn't have
the same gap).
**Implementation approach:** copy the exact `withTransaction` + `FOR UPDATE` pattern already
proven correct in `MySQLBookingRepository.createWithTransaction`.
**Testing:** concurrency tests per P-09/P-10 rows (fire simultaneous requests, assert exactly one
wins).
**Acceptance criteria:** rows met; migration applied and constraint verified against a duplicate-
insert attempt.
**Risk:** low — this is additive locking around existing logic, not a rewrite.

### Phase 5 — AI / WhatsApp Security
**Objective:** close P-02 (if not already fully done in Phase 1), P-14, P-20, P-21, P-26.
**Problems solved:** AI auth (if deferred from Phase 1's minimal fix, harden further here — e.g.
server-derived role), missing idempotency, potential WhatsApp session file exposure, doc/reality
mismatch, single-scope agent secret.
**Files/modules affected:** `routes/ai.routes.ts`, `routes/agentTools.routes.ts`,
`MySQLWebhookEventRepository` (wire it in), `index.ts` static mount config,
`docs/WHATSAPP_AI_*.md`.
**Dependencies:** Phase 0's static-mount verification for P-20.
**Testing:** idempotency test (P-14), static-file 404 test (P-20).
**Acceptance criteria:** rows met.
**Risk:** low-medium — idempotency logic touches the booking-creation hot path, test thoroughly
against Phase 4's new locking.

### Phase 6 — Architecture Refactoring
**Objective:** close P-15 — bring branches/barbers/chairs/services/products/settings into the
Clean Architecture pattern.
**Problems solved:** the §4 "two patterns coexist" structural issue.
**Files/modules affected:** new `domain/entities/*`, `domain/repositories/I*Repository.ts` (some
already exist, e.g. `IChairRepository` — audit which are unused and wire them),
`adapters/repositories/MySQL*Repository.ts`, new `usecases/*` per resource, `container.ts`,
corresponding route files simplified to thin controllers.
**Dependencies:** Phase 2 (frontend must already be calling these endpoints correctly and awaiting
responses before the backend contract changes further).
**Implementation approach:** one resource at a time, in order of blast radius: `settings` (lowest
risk, single row) → `products`/`services` → `chairs` → `barbers` → `branches` (highest risk, other
tables FK to it).
**Testing:** unit tests per new use case (this is also where P-19's test runner gets stood up if
not already done).
**Acceptance criteria:** zero raw `query()` calls remain in any `routes/*.ts` file except inside
`adapters/repositories/*` (imported, not inlined).
**Risk:** low per-resource, but cumulative effort is the largest single line item in this roadmap.

### Phase 7 — SOLID Improvements
**Objective:** address §5's concrete findings — extract pure pricing/audit-log/notification
builders from `store.ts`, split the Zustand interface (P-24), address the `agentTools.routes.ts`
God-module split described in §4.2/§4.3 (partially done already by Phase 5/6's work on that file).
**Files/modules affected:** `src/lib/store.ts`, new `src/lib/pricing.ts`/`auditLog.ts` helpers,
role-scoped store hooks.
**Dependencies:** Phase 2 (store.ts will already be substantially rewritten there; do this as part
of the same effort rather than a second pass over the same file).
**Testing:** unit tests for the extracted pure functions.
**Acceptance criteria:** `store.ts` actions are thin — call a pure calculation function, then call
the API, then apply the response; no inline multi-concern logic blocks remain.
**Risk:** low.

### Phase 8 — Testing
**Objective:** stand up the test runner and backfill coverage for everything fixed above (P-19),
per the brief's explicit testing-audit requirements (§22 of the brief).
**Problems solved:** P-19; regression protection for every other phase.
**Files/modules affected:** new `vitest.config.ts` (client + server), CI workflow file (not present
in this repo — **note:** no `.github/workflows` was found in the archive; add one).
**Dependencies:** ideally run *alongside* Phases 1–7 (write the test for each fix as it's made),
not purely after — this phase description covers the residual work of filling gaps and wiring CI.
**Testing:** N/A (this phase produces tests).
**Acceptance criteria:** CI pipeline exists and runs on every push; coverage includes, at minimum,
every "Testing Requirements" cell in §23's table.
**Risk:** low.

### Phase 9 — Deployment / Backup / Observability
**Objective:** close §21's hardcoded-config findings; ensure every new per-salon deployment starts
clean.
**Problems solved:** hardcoded salon name/domain/phone/prices across `CreateBookingUseCase.ts`,
`agentTools.routes.ts`, `whatsapp.service.ts`, `whatsappSession.routes.ts`.
**Files/modules affected:** those four files; `server/.env.example` (document every required var
with no working default for business-identity values); `database/seed.sql` (confirm it's the
single source for a new deployment's starter branch/service/barber rows, not the code).
**Dependencies:** Phase 6 (once `branches`/`services`/`settings` are properly repository-backed,
templates can pull from them instead of string literals).
**Testing:** a "fresh deployment" smoke test — spin up against an empty (but migrated + seeded)
DB and confirm no hardcoded ELHDAD-specific string appears anywhere in any response.
**Acceptance criteria:** §21's table fully resolved; grep for the specific hardcoded phone numbers/
domain/salon name across `server/src` and `src` returns zero results outside `database/seed.sql`
and test fixtures.
**Risk:** low.

### Phase 10 — Final Production Verification
**Objective:** re-run this entire audit's evidence-gathering process (not just re-read the report)
against the post-fix codebase, to confirm every finding in §23 is actually closed and no new issue
was introduced by the fixes themselves (e.g. confirm Phase 2's rewrite of `store.ts` didn't
reintroduce an optimistic-write pattern in a new component).
**Problems solved:** verification, not new fixes.
**Files/modules affected:** entire repo (re-scan).
**Dependencies:** Phases 1–9 complete.
**Testing:** full CI suite green; manual smoke test of the "another salon" deployment scenario from
Phase 9.
**Acceptance criteria:** every row in §23 re-verified closed against actual source, not against
this document's memory of the fix.
**Risk:** low — this is a checkpoint, not new engineering.

---

## 26. Implementation Order

1. Phase 0 (Discovery) — must come first, cheap, de-risks everything.
2. Phase 1 (Critical Security) — P0s are exploitable today; fix before any other refactor touches
   the same files, to avoid re-testing security fixes against a moving target.
3. Phase 3 (AuthZ) — small, low-risk, benefits from being done right after Phase 1 while auth code
   is already fresh in mind.
4. Phase 4 (Transactions/Concurrency) — small, additive, no dependency on the larger Phase 2/6
   rewrites; do it early to stop any further double-booking incidents while the bigger refactors
   are underway.
5. Phase 5 (AI/WhatsApp hardening) — depends only on Phase 0/1.
6. Phase 2 (Database Source of Truth) — the largest frontend change; do it once auth (Phase 1) is
   stable so it isn't rewritten twice.
7. Phase 6 (Architecture Refactoring) — depends on Phase 2 being done first (frontend must already
   correctly await/reconcile responses before backend contracts for these six resources are
   touched further).
8. Phase 7 (SOLID) — folded into/immediately after Phase 2 and Phase 6's file touches, to avoid a
   third pass over the same files.
9. Phase 8 (Testing) — run continuously alongside 1–7, formalized here; final gap-fill after Phase 7.
10. Phase 9 (Deployment/Config) — depends on Phase 6 (needs real repositories for branches/settings
    to source config from).
11. Phase 10 (Final Verification) — last, always.

---

## 27. Production Readiness Assessment

**Not production-ready for a second/new deployment today**, specifically because of §21's hardcoded
first-salon data and §11's authentication gaps — a new customer's deployment would be both
insecure (P-03/P-04 default secrets) and would risk quoting the *original* salon's information to
its own customers under DB failure conditions (P-13). The **original** deployment (the one this
data belongs to, "الحداد - ELHDAD") is functionally further along — its happy-path booking flow
(create → pay → approve → queue → serve) is implemented with genuinely correct transactional
concurrency handling — but it carries the same P0 security exposures (P-01 through P-06) as any
other deployment would, since those are code-level, not data-level, issues.

**Recommended minimum bar before considering *any* deployment (existing or new) production-ready:**
Phase 1 (Critical Security) and Phase 9's hardcoded-data removal, at minimum. Phases 2/4/6 improve
correctness and maintainability substantially but are not, on their own, blocking a currently-
functioning deployment from continuing to operate — they should nonetheless be treated as high
priority given the concurrency bugs (P-09/P-10) are real, if lower-probability, data-corruption
risks in daily operation.

---

## 28. Final Recommendations

1. **Do the security fixes first and in isolation** (Phase 1) — they are small, independently
   deployable, and currently exploitable; don't let them wait behind the larger architecture work.
2. **Treat `agentTools.routes.ts` as the single highest-risk file in the codebase** — it combines
   the unauthenticated-adjacent surface (shared static secret with a public fallback), the
   fabricated-success anti-pattern, the hardcoded-salon-data anti-pattern, and the missing-
   idempotency bug, all in one 677-line file. It should be the first file fully rewritten once
   Phase 1 lands.
3. **Don't rewrite `store.ts` piecemeal** — Phase 2 and Phase 7 touch the same file; plan one
   coordinated pass rather than two, and land it behind feature-flagged rollout if possible, since
   it changes the felt latency of every user action in the app.
4. **The Clean Architecture skeleton that already exists for bookings/waitlist/recall/insights is
   good and should be the literal template copied for the six remaining resources** (Phase 6) —
   this is not a case of "introduce Clean Architecture," it's "finish applying the pattern that's
   already proven to work in this same repo."
5. **Stand up automated tests concurrently with the fixes, not after** (Phase 8 folded into 1–7) —
   given zero coverage exists today, retrofitting tests only after all fixes land risks tests being
   written to match the (already-fixed) behavior rather than actually catching regressions during
   the fix work itself.
6. **Re-verify the Phase 0 unknowns before trusting this document as complete** — specifically the
   payment-proof-approval backend path and the n8n workflow webhook-auth configuration were not
   opened in this pass and are plausible homes for additional P0/P1-class findings given the
   patterns found everywhere else in this audit.
