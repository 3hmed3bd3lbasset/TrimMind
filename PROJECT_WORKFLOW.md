# PROJECT_WORKFLOW.md
## Barber Shop / Salon Booking & AI Management Platform

> Single source of truth for implementation. Every phase must be completed, tested, and security-checked before moving to the next.

---

## 0. Tech Stack (confirmed)

**Frontend:** React (Vite) + TypeScript + Tailwind CSS + React Router DOM + TanStack Query + Zustand + Zod + Axios + React Hook Form + Framer Motion + Lucide React + React Lazy/Suspense + React Error Boundary + React Helmet Async + Day.js + Recharts + Mapbox/React Map GL + PWA + ESLint/Prettier

**Backend/Infra:** Supabase (PostgreSQL, Auth, Storage, Realtime, Row Level Security, Edge Functions/Deno, Auto REST APIs, Migrations, Webhooks) + Vercel (hosting) + Git/GitHub

**AI Layer:** Provider-agnostic chat completion service (e.g. Anthropic/OpenAI) called **only from an Edge Function**, never from the browser — the model never receives a service-role key or raw DB access. Tool calls are dispatched server-side against RLS-protected Supabase queries scoped to the authenticated customer.

---

## 1. Core Principle (non-negotiable)

- The AI is an **interface**, not a security boundary.
- All authorization happens in Postgres via **Row Level Security (RLS)** + Edge Function checks, never in the frontend and never trusted from AI/user text.
- Customer AI tools ⊂ customer-safe read/write operations only. Admin/manager data (revenue, cash register, staff stats, other customers' bookings) is **not reachable** by any customer-facing code path, regardless of prompt.

---

## 2. Roles (RBAC)

```
CUSTOMER      – own bookings/profile only
RECEPTIONIST  – branch-scoped: bookings, payments, queue, drinks, invoices
MANAGER       – full control: branches, barbers, chairs, services, pricing, staff, reports, AI config
```

Implemented via a `profiles` table with `role` + `branch_id` (nullable for managers with multi-branch access) and enforced with Postgres RLS policies keyed off `auth.uid()`.

---

## 3. Data Model (summary — full DDL in `supabase/schema.sql`)

```
profiles, branches, barbers, chairs, services, service_barbers,
products (drinks/add-ons), bookings, booking_items, booking_status_history,
payments, payment_proofs, invoices, invoice_items, queue_entries,
ratings, notifications, audit_logs, ai_conversations, ai_messages,
ai_tool_calls, settings, price_history
```

Key rules:
- Every price-bearing row on a booking stores a **snapshot** (`*_at_booking`) so historical invoices never change retroactively.
- Soft-delete (`is_active` / `deactivated_at`) for barbers, chairs, branches — never hard delete rows referenced by historical bookings.
- Unique constraints + exclusion constraints (`tstzrange` + `EXCLUDE USING gist`) on (chair_id, time range) to make double-booking **impossible at the DB level**, not just app-level.

---

## 4. Booking State Machine

```
DRAFT → AWAITING_PAYMENT → PAYMENT_SUBMITTED → PENDING_REVIEW → CONFIRMED
→ CUSTOMER_ARRIVED → IN_SERVICE → COMPLETED

Side states: REJECTED, CANCELLED, EXPIRED, NO_SHOW
```

Transitions are validated **only** inside a Postgres function/Edge Function (`transition_booking_status`), never via direct client UPDATE. Every transition writes to `booking_status_history`.

---

## 5. AI Tool Architecture

Customer-safe tools (exposed to chatbot via Edge Function `ai-chat`):
```
getBranches, getBranchDetails, getAvailableServices, getAvailableBarbers,
getAvailableChairs, getAvailableTimes, getQueueStatus, getBarberAvailability,
calculateBookingPrice, createBooking, submitPaymentProof,
getCustomerBookings, getBookingStatus, getCustomerInvoice
```
Explicitly **excluded**: revenue, cash register, staff data, other customers' data, raw SQL, admin reports, system config, credentials.

Refusal behavior: polite, fixed-scope redirection (implemented as a system-prompt rule **plus** a hard filter — refusal doesn't rely on the model "deciding," undeclared tools simply don't exist in its toolset).

Manager AI (future, Phase 8b) is a **completely separate** Edge Function/tool namespace — never shares a toolset with customer AI.

---

## 6. Payment Workflow

1. Customer creates booking → `AWAITING_PAYMENT`.
2. Uploads proof (image) to a **private** Supabase Storage bucket (`payment-proofs`), validated server-side for MIME/size/extension.
3. Row inserted in `payment_proofs`, booking → `PENDING_REVIEW`.
4. AI/customer UI never claims payment is confirmed — only "received, pending review."
5. Receptionist (RLS-scoped to their branch) approves/rejects via Edge Function that re-validates amount vs. server-calculated price before flipping status.
6. All decisions written to `audit_logs`.

---

## 7. Realtime

Supabase Realtime channels for: booking status changes, queue position, chair/barber availability, payment approval, notifications. Scoped per-branch and per-customer via RLS-aware channel filters — no broadcasting of other customers' data.

---

## 8. Security Checklist (applies every phase)

- [ ] RLS enabled + tested on every table
- [ ] No `service_role` key in any frontend bundle
- [ ] Auth required + role checked on every Edge Function
- [ ] Input validated with Zod both client and server side
- [ ] File upload validated (type/size/MIME) before storage write
- [ ] Rate limiting on auth + AI + booking endpoints
- [ ] Audit log on every sensitive mutation
- [ ] No stack traces / internal errors returned to client

---

## 9. Implementation Phases

| Phase | Deliverable | Status |
|---|---|---|
| 0 | Discovery/audit (this doc) | ✅ |
| 1 | Architecture docs | ✅ (this file + SUPABASE_SETUP.md) |
| 2 | Database schema + RLS | ⏳ scaffolded in `supabase/schema.sql` |
| 3 | Auth & RBAC | ⏳ next |
| 4 | Manager dashboard | pending |
| 5 | Receptionist dashboard | pending |
| 6 | Booking engine + concurrency | pending |
| 7 | Payment workflow | pending |
| 8 | AI chatbot (Edge Function + tools) | pending |
| 9 | Customer pages (landing, chat, check-booking) | pending |
| 10 | Realtime | pending |
| 11 | Security hardening pass | pending |
| 12 | Testing (unit/integration/e2e/security) | pending |
| 13 | Performance | pending |
| 14 | Deployment (Vercel + Supabase prod) | pending |
| 15 | Final acceptance E2E | pending |

**Rule:** we implement one phase at a time, you review, then we continue — per the phase rule (plan → implement → test → security check → document → mark complete).

---

## 10. What I need from you to keep going for real (not a mock)

1. **Supabase Project URL** (e.g. `https://xxxx.supabase.co`) — you gave me the publishable key but not the project URL/ref.
2. Confirm the publishable key is meant for this project (publishable/anon keys are safe to ship in the frontend — this is expected, not a leak).
3. Do you want me to actually run the schema migration against your live Supabase project (I'd need you to run the SQL I generate, or grant a way to execute it), or do you just want the code + SQL files to run yourself?
4. Which AI provider for the chatbot (Anthropic/OpenAI) and do you have an API key to store as an Edge Function secret (never in frontend)?
