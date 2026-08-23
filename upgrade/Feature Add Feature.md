# Feature Add Feature.md
## TrimMind / Elite Salon Platform — Feature Engineering Plans

**Document type:** Implementation-ready feature specifications. No code has been written or modified to produce this document — these are specifications for a future implementation pass.

**Prerequisite note (applies to all five features below):** Every feature in this document assumes **Phase 1 (Security/Data-Integrity Foundation)** and **Phase 2 (Database Concurrency & Schema Correctness)** from `Software Engineering.md` are complete first. In particular: (a) `query()` must throw on error rather than silently returning `[]`, since every feature below adds new write paths that must not fail silently; (b) the booking status state machine must exist and be enforced server-side; (c) authentication/authorization must be correctly enforced on the endpoints these features extend. Building these features on top of the current unauthenticated payment-approval endpoint, for example, would make the new automation *worse*, not better (e.g., an automated "recall" message could be triggered by unauthenticated status manipulation).

---

## 1. Smart Waitlist

### Problem
Today, when a customer wants a fully-booked slot/day, there is no mechanism to capture that demand. The booking flow (`BookingWizard.tsx` → `POST /api/bookings`) only supports booking an available slot; there is no `waitlist` concept anywhere in `database/schema.sql`, `booking.service.ts`, or the frontend. Demand for popular barbers/times is lost, and receptionists have no visibility into who would take a slot if one opens up (e.g., via a cancellation).

### Business Value
Converts lost demand (customers who leave because "nothing's available") into recoverable bookings, and gives the manager visibility into which barbers/times are most oversubscribed (useful for future scheduling/hiring decisions).

### User Flow (Customer)
1. Customer attempts to book a specific barber/date/time-window that is fully booked (chairs at capacity or the requested time slot's queue is full for that barber).
2. `BookingWizard.tsx` detects unavailability (via the existing `availability/check` logic, extended per below) and offers "Join Waitlist for this barber/day" instead of a dead end.
3. Customer confirms name/phone/preferred barber/date/optional time-window; no payment required to join a waitlist.
4. When a slot opens (cancellation, or a barber adds capacity), the system automatically offers the slot to the next matching waitlist entry via WhatsApp (if WhatsApp channel — Phase 8 — is live) and/or a notification, with a short claim window (e.g., 20 minutes) before offering to the next person.
5. Customer claims via a tokenized link (`/track?claim=<token>`) or, if capable, directly through the WhatsApp conversational flow.

### Manager Flow
- New "Waitlist" tab in `ManagerDashboard.tsx` (or a section within `BranchManager.tsx`) showing per-branch, per-barber waitlist depth and average time-to-fulfillment.
- Manager can manually promote a waitlist entry to a booking (e.g., for VIP customer prioritization), which should be audit-logged.

### Reception Flow
- `ReceptionistDashboard.tsx` shows a "Waitlist" panel alongside the existing queue/bookings table for their branch; when cancelling a booking (`cancelBooking`), reception sees a prompt: "3 people are waiting for this barber/day — notify next?"

### Customer Flow (self-service)
- `TrackBookingModal.tsx`/`TrackBookingPage.tsx` extended to also support tracking a waitlist entry by phone/token, showing current position and estimated likelihood.

### AI Role
- Once Phase 7 (in-app AI tool-calling) and/or Phase 8 (WhatsApp agent) exist, the AI can offer waitlist joining conversationally ("مفيش أماكن فاضية بكرة، تحب أسجلك في قائمة الانتظار؟") by calling a `join_waitlist` tool — but the AI must never automatically promote someone off the waitlist into a paid, confirmed booking; promotion always creates an `awaiting_payment`/offer state requiring the same customer-side payment-proof flow as a normal booking, not an auto-confirmation.

### Backend Requirements
- New service `server/src/services/waitlist.service.ts`:
  - `joinWaitlist(payload)`: validate against `waitlist_entries`, prevent duplicate active entries for the same phone+branch+date+barber (unique constraint, see Database Requirements).
  - `findMatchingWaitlistEntries(branchId, barberId, date)`: used whenever a slot frees up.
  - `offerSlotToNextEntry(entryId)`: transitions entry to `offered`, generates a claim token (reuse the existing `generateSecureToken` pattern from `booking.service.ts`), starts a claim-expiry timer (implemented via the existing `node-cron` pattern, checking `offered_expires_at` periodically, not a per-entry `setTimeout` which would not survive a process restart).
  - `claimWaitlistOffer(token)`: converts the waitlist entry into a real booking via the existing `createBooking` service function (reusing all its validated pricing/queue logic — do not duplicate booking-creation logic).
- New route file `server/src/routes/waitlist.routes.ts`, mounted at `/api/waitlist`:
  - `POST /` (public, rate-limited like `bookingLimiter`) — join waitlist.
  - `GET /branch/:branchId` (`requireAuth`, `requireRoles('manager','receptionist')`, `requireBranchAccess`) — list active waitlist entries.
  - `POST /:id/promote` (`requireAuth`, `requireRoles('manager','receptionist')`) — manual promotion.
  - `GET /claim/:token` (public) — view offer details.
  - `POST /claim/:token` (public, rate-limited) — accept offer → creates booking.
- Hook into `cancelBooking` (`booking.service.ts`) and any future "capacity increased" action: after a booking transitions to `cancelled` (or a chair is added), call `findMatchingWaitlistEntries` + `offerSlotToNextEntry` for the freed branch/barber/date.

### Database Requirements
```sql
CREATE TABLE IF NOT EXISTS `waitlist_entries` (
  `id` VARCHAR(64) PRIMARY KEY,
  `branch_id` VARCHAR(64) NOT NULL,
  `barber_id` VARCHAR(64),
  `customer_name` VARCHAR(150) NOT NULL,
  `customer_phone` VARCHAR(20) NOT NULL,
  `preferred_date` DATE NOT NULL,
  `preferred_time_window` VARCHAR(50),
  `service_id` VARCHAR(64),
  `status` ENUM('waiting','offered','claimed','expired','cancelled') DEFAULT 'waiting',
  `offer_token` VARCHAR(64) UNIQUE,
  `offered_at` TIMESTAMP NULL,
  `offer_expires_at` TIMESTAMP NULL,
  `claimed_booking_id` VARCHAR(64),
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`barber_id`) REFERENCES `barbers`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`claimed_booking_id`) REFERENCES `bookings`(`id`) ON DELETE SET NULL,
  UNIQUE KEY uniq_active_wait (`customer_phone`, `branch_id`, `preferred_date`, `barber_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```
Note: the `UNIQUE KEY uniq_active_wait` prevents duplicate active entries but must be paired with application logic that also allows a *new* entry after a prior one reaches a terminal state (`expired`/`cancelled`/`claimed`) — either drop the unique constraint in favor of a partial/application-level check (MySQL doesn't support partial unique indexes), or include `status` in a composite check performed in a transaction before insert.

### API Requirements
See Backend Requirements above for the full route list. All mutating endpoints must go through the same `validateBody` (zod) pattern as existing routes — add `waitlist.schema.ts` under `server/src/validators/`.

### Frontend Requirements
- New `src/components/customer/WaitlistJoinModal.tsx` triggered from `BookingWizard.tsx` when availability check fails.
- New `src/components/manager/WaitlistManager.tsx` (or extend `BranchManager.tsx`).
- New `src/components/receptionist/WaitlistPanel.tsx`.
- API client functions in `src/lib/api.ts` mirroring the new routes.

### WhatsApp Requirements
Once Phase 8 is live: a new n8n workflow (or an extension of `02_AI_Agent_Tools_Orchestrator.json`) exposing `join_waitlist` and `check_waitlist_status` as agent tools calling the new `/api/agent-tools/waitlist/*` aliases (reuse `requireAgentAuth`, fixed per F-SEC-04).

### Security
- Public `POST /api/waitlist` must be rate-limited identically to booking creation (`bookingLimiter` pattern) to prevent spam entries.
- Claim tokens must be single-use, cryptographically random (reuse `crypto.randomBytes` pattern from `generateSecureToken`), and expire.
- Promotion/manual endpoints require `requireBranchAccess` so a receptionist cannot promote/view another branch's waitlist.

### Edge Cases
- Customer already has an active booking for the same day — decide whether to allow a simultaneous waitlist entry (recommendation: allow, since they may want an earlier/different-barber slot).
- Slot freed but the offer window expires with no claim — must cleanly advance to the next entry (or close if none), verified by a scheduled job, not user-triggered.
- Multiple slots free up near-simultaneously — the offer/claim logic must use the same transactional `SELECT ... FOR UPDATE` discipline established in Phase 2 to avoid double-offering the same slot to two entries.

### Failure Scenarios
- Cron job that checks `offer_expires_at` fails to run (server restart mid-cycle) — must be idempotent and safe to re-run (checking `NOW() > offer_expires_at AND status = 'offered'` is naturally idempotent).
- WhatsApp notification fails to send (transport down, Phase 8 concerns) — the waitlist entry must still be viewable/actionable by reception manually; do not make the feature's correctness depend on WhatsApp delivery succeeding.

### Testing
- Unit: matching logic (`findMatchingWaitlistEntries` correctly filters by branch/barber/date/status).
- Integration: full join → cancellation-triggers-offer → claim → booking-created path.
- Concurrency: two waitlist entries racing to claim the same expiring offer — only one should succeed.

### Dependencies
Phases 1–2 (foundation). Independent of Phase 7/8 for the manual/reception flows; benefits from but does not require Phase 8 for automatic WhatsApp notification (can ship with SMS/manual-call fallback first).

### Implementation Phases
1. Schema + backend service + REST API (no automatic notification, reception manually calls waitlisted customers).
2. Frontend UI for customers/reception/manager.
3. Automatic notification integration once Phase 8 (WhatsApp) is available.

### Acceptance Criteria
- A customer attempting to book a fully-booked barber/date is offered and can join a waitlist.
- Cancelling a booking correctly identifies and offers the freed slot to the next matching waitlist entry, exactly once.
- Claim tokens are single-use and expire correctly.
- All new endpoints enforce the same auth/branch-access discipline as the rest of the platform.

---

## 2. AI Customer Recall

### Problem
There is currently no mechanism to identify and re-engage customers who haven't returned in a while. `agentTools.routes.ts::/customer/lookup` can look up a single customer's history on demand, but nothing proactively scans the customer base for recall candidates.

### Business Value
Directly drives repeat revenue by re-engaging lapsed customers (a well-known salon-industry retention lever) without manual list-building by staff.

### User Flow (Customer, recipient side)
Customer receives a WhatsApp message (once Phase 8 is live) or, as an interim fallback, the manager sees a recall list to action manually: "You haven't visited in N days — here's a quick way to rebook with [preferred barber]," including a one-tap link into `BookingPage.tsx` pre-filled with their last barber/service.

### Manager Flow
- New "Customer Recall" panel (extend `AnalyticsCharts.tsx` or new `src/components/manager/CustomerRecallManager.tsx`) showing candidates ranked by recency/frequency/lifetime value, with a "Send Recall" action (bulk or individual) and an opt-out list.
- Manager configures the recall threshold (e.g., "45 days since last completed visit") via `SettingsManager.tsx` → `settings` table.

### Reception Flow
Reception can trigger a one-off recall for a specific customer from `BookingsTable.tsx`'s customer history view (manual, ad hoc use case distinct from the scheduled bulk job).

### Customer Flow
Receives message → taps link → `BookingPage.tsx` pre-fills last-used barber/service via a query param (`?recall=<token>`) → normal booking flow proceeds unchanged from there (no special-cased booking logic needed — this feature is primarily a targeting/messaging feature, not a booking-flow feature).

### AI Role
- The "AI" aspect is in **candidate selection and message personalization**, not in autonomously booking anything. A scheduled job queries recent completed-booking history (`bookings` + `ratings`) and, optionally, calls Gemini (server-side, via the same tool-calling infrastructure from Phase 7) to draft a personalized-but-templated message referencing the customer's last service/barber in natural Egyptian Arabic — the AI does not have write access to bookings in this feature; it only produces message text, which a human (manager) approves before the first sends go out (recommend a manual-approval mode for the first release, with a fully-automated mode as a later toggle once trust is established).

### Backend Requirements
- `server/src/services/recall.service.ts`:
  - `findRecallCandidates(branchId, thresholdDays)`: `SELECT customer_phone, customer_name, MAX(booking_date) as last_visit, ... FROM bookings WHERE status='completed' GROUP BY customer_phone HAVING DATEDIFF(CURDATE(), MAX(booking_date)) >= ?`.
  - `generateRecallMessage(candidate)`: server-side Gemini call (Phase 7 infra) with a fixed template + candidate's last barber/service substituted safely (never customer-free-text into the prompt to avoid injection into the AI's own instructions — Phase 7's F-AI-02 fix applies here directly).
  - `recordRecallSent(candidateId, campaignId)`: prevents re-sending to the same customer more than once per configured cooldown.
- New route file `recall.routes.ts` mounted at `/api/recall`, entirely `requireAuth + requireRoles('manager')`:
  - `GET /candidates?branchId=&thresholdDays=`
  - `POST /send` (body: list of candidate phone numbers + optional custom message override) — queues sends through the WhatsApp transport (Phase 8) or falls back to marking them for manual reception follow-up if WhatsApp isn't live yet.
  - `GET /campaigns` — history of past recall campaigns and response rates (did the customer rebook within N days of the recall message).

### Database Requirements
```sql
CREATE TABLE IF NOT EXISTS `recall_campaigns` (
  `id` VARCHAR(64) PRIMARY KEY,
  `branch_id` VARCHAR(64) NOT NULL,
  `created_by` VARCHAR(64),
  `threshold_days` INT NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `recall_sends` (
  `id` VARCHAR(64) PRIMARY KEY,
  `campaign_id` VARCHAR(64) NOT NULL,
  `customer_phone` VARCHAR(20) NOT NULL,
  `message_text` TEXT NOT NULL,
  `status` ENUM('queued','sent','failed','rebooked') DEFAULT 'queued',
  `sent_at` TIMESTAMP NULL,
  `rebooked_at` TIMESTAMP NULL,
  `rebooked_booking_id` VARCHAR(64),
  FOREIGN KEY (`campaign_id`) REFERENCES `recall_campaigns`(`id`) ON DELETE CASCADE,
  INDEX idx_phone (`customer_phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```
Attribution of "rebooked" (did a recall lead to a new booking) is computed by a scheduled job matching `recall_sends.customer_phone` against new `bookings` created after `sent_at` within a configurable attribution window (e.g., 14 days).

### API Requirements
See above. All manager-only. `POST /send` must respect an opt-out flag — add `profiles.marketing_opt_out` or a dedicated `customer_preferences(phone, opt_out)` table if customers aren't already `profiles` rows (they generally aren't, per §4/Feature Inventory in `Software Engineering.md`) — recommend the latter, standalone table, since customers are currently tracked by phone number only.

### Frontend Requirements
`CustomerRecallManager.tsx` (manager), candidate table with filters (branch, threshold, last barber), bulk-select + send, campaign history view with rebook-rate metric.

### WhatsApp Requirements
Requires Phase 8. Before Phase 8 ships, this feature can still deliver value in a "candidate list only" mode where reception/manager calls or manually WhatsApps customers from the generated list — ship this reduced version first (Implementation Phase 1 below) rather than blocking the entire feature on Phase 8.

### Security
- Manager-only access to customer PII lists (already the correct pattern used elsewhere, e.g., `audit.routes.ts`).
- Respect opt-out preferences strictly — sending marketing messages to an opted-out customer is both a trust violation and, depending on the deployment's jurisdiction, a potential regulatory issue (WhatsApp Business policy also prohibits unsolicited marketing outside allowed templates/windows — flag to the business owner as a **UNVERIFIED — REQUIRES CONFIRMATION** compliance item specific to WhatsApp Business API terms, not something this engineering document can resolve).

### Edge Cases
- Customer has multiple phone-number variants recorded (e.g., with/without country code) — reuse the existing `normalizePhone` logic (`agentTools.routes.ts`) as a shared utility (extract to `server/src/utils/phone.ts` per F-AR-01's extraction recommendation) so recall matching and booking matching use identical normalization.
- Customer already has a future booking scheduled — exclude from recall candidates (`WHERE NOT EXISTS (SELECT 1 FROM bookings WHERE customer_phone = ? AND status IN ('confirmed','pending_review','awaiting_payment') AND booking_date >= CURDATE())`).

### Failure Scenarios
- Gemini call for message personalization fails — fall back to a static, non-AI templated message rather than blocking the whole campaign.
- WhatsApp send fails for a subset of candidates — mark those `failed` individually; do not fail the entire campaign batch.

### Testing
- Unit: candidate-selection SQL logic against a seeded test dataset with known last-visit dates.
- Integration: full candidate → send → simulated rebooking → attribution flow.

### Dependencies
Phases 1–3 (foundation + config). Full automation depends on Phase 7 (AI) and Phase 8 (WhatsApp); a manual/candidate-list-only version can ship earlier.

### Implementation Phases
1. Candidate identification + manager UI (list only, no auto-send).
2. Manual bulk-send once Phase 8 WhatsApp is live.
3. AI-personalized messaging once Phase 7 tool-calling/prompt infra exists.
4. Attribution/reporting on rebook rate.

### Acceptance Criteria
- Manager can view an accurate, opt-out-respecting list of lapsed customers per branch/threshold.
- Sent campaigns are recorded and rebooking attribution is computed correctly against a test dataset.

---

## 3. AI Manager Report / AI Business Insights

### Problem
`AnalyticsCharts.tsx` and `BookingRevenuesManager.tsx` present raw charts/tables but require the manager to interpret trends themselves. There is no synthesized, natural-language summary of "what happened and what to do about it."

### Business Value
Saves manager time and surfaces non-obvious patterns (e.g., a specific barber's no-show rate creeping up, a service quietly declining in bookings) that raw charts make easy to miss.

### User Flow
Manager opens a new "AI Insights" tab/widget in `ManagerDashboard.tsx`; sees a daily/weekly auto-generated Arabic-language summary plus 2–4 concrete recommended actions, each linking directly to the relevant existing manager tool (e.g., "Barber X's rating dropped — review recent ratings" links into `AuditLogViewer.tsx`/ratings data).

### Manager Flow
Manager can regenerate on demand, adjust the reporting period, and (optionally) ask a natural-language follow-up question ("ليه المبيعات قلت الأسبوع ده؟") which triggers a scoped, read-only AI tool call against pre-aggregated data (never raw free-form SQL generated by the model — see Security below).

### Reception/Customer Flow
Not applicable — manager-only feature.

### AI Role
Strictly **read-only summarization and recommendation** over data the backend has already aggregated and validated. The AI is never given raw SQL execution ability; it is given a fixed set of pre-computed metrics (via tool calls to endpoints that run known, reviewed queries) and asked to narrate/prioritize them. This directly follows the brief's "AI must not be the source of truth" principle and the required `AI → Tool → Backend → Business Logic → Database` shape.

### Backend Requirements
- `server/src/services/insights.service.ts`: a set of pure, reviewed aggregation functions, e.g. `getRevenueTrend(branchId, period)`, `getNoShowRateByBarber(branchId, period)`, `getServicePopularityTrend(branchId, period)`, `getAverageRatingByBarber(branchId, period)`, `getPeakHoursHeatmap(branchId, period)`.
- `server/src/routes/insights.routes.ts`, `requireAuth + requireRoles('manager')`:
  - `GET /summary?branchId=&period=` — runs all aggregations, passes the structured JSON result to Gemini (server-side, fixed prompt) to produce the narrated report; **caches** the result (e.g., in a new `insight_reports` table) for the given branch+period so repeated dashboard loads don't re-call the LLM unnecessarily.
  - `POST /ask` — accepts a manager's free-text question, but the model is restricted (via tool-calling) to only the aggregation functions above; it cannot request arbitrary data.

### Database Requirements
```sql
CREATE TABLE IF NOT EXISTS `insight_reports` (
  `id` VARCHAR(64) PRIMARY KEY,
  `branch_id` VARCHAR(64) NOT NULL,
  `period_start` DATE NOT NULL,
  `period_end` DATE NOT NULL,
  `metrics_json` JSON NOT NULL,
  `narrative_text` TEXT NOT NULL,
  `generated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE CASCADE,
  INDEX idx_branch_period (`branch_id`, `period_start`, `period_end`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### API Requirements
As above; manager-only; `requireBranchAccess` applies (a branch-scoped receptionist role should never reach this, but a manager with `assigned_branch_ids` limited to certain branches should only see those — reuse the existing `assigned_branch_ids` field already present on `profiles`).

### Frontend Requirements
`src/components/manager/AIInsightsPanel.tsx` — narrative card + linked recommendation chips + a simple chat-style follow-up input reusing `AIChatDrawer.tsx`'s UI patterns but pointed at `/api/insights/ask` instead of `/api/ai/chat`.

### Security
- The single most important rule for this feature: **never let the model generate or execute raw SQL against production data.** All data access is through the fixed, reviewed aggregation functions. This avoids SQL-injection-via-prompt-injection and avoids the AI ever seeing raw customer PII it doesn't need (aggregations should exclude names/phone numbers, operating on IDs/counts only).
- Manager-only, branch-scoped, per existing RBAC patterns.

### Edge Cases
- Branch with very little data (new deployment) — the narrative generation must handle empty/near-empty datasets gracefully ("Not enough data yet for a trend; check back after your first week") rather than hallucinating a trend from noise.
- Manager with multiple assigned branches — aggregate per-branch, do not silently blend branches together in one narrative unless explicitly requested.

### Failure Scenarios
- Gemini call fails/times out — fall back to showing the raw metrics (charts already exist in `AnalyticsCharts.tsx`) without the narrative, rather than blocking the dashboard.

### Testing
- Unit: each aggregation function against a seeded dataset with known expected output.
- AI tool test: verify the model, given a fixed metrics payload, produces a narrative referencing the correct numbers (a snapshot/eval test, not an exact-string match, since LLM phrasing varies).

### Dependencies
Phases 1–3 (foundation), Phase 7 (server-owned AI/tool-calling infrastructure) — this feature is a direct extension of that infrastructure and should not be built before Phase 7 lands, to avoid duplicating prompt/tool-calling plumbing.

### Implementation Phases
1. Aggregation service + routes + raw-metrics dashboard widget (no AI narrative yet — ships value immediately).
2. AI narrative generation on top of the aggregations, cached per period.
3. Follow-up Q&A via constrained tool-calling.

### Acceptance Criteria
- Manager can view an accurate weekly summary with correct underlying numbers (verified against direct SQL) and a coherent narrative referencing those numbers.
- The AI cannot be prompted (via the follow-up Q&A) into revealing data outside the manager's branch scope or into executing arbitrary queries.

---

## 4. No-show Protection

### Problem
`bookings.status` includes a `no_show` value in the schema, but no code path in `booking.service.ts`, `bookings.routes.ts`, or `agentTools.routes.ts` was found that automatically detects or acts on a no-show — it appears to be a manually-set status only (UNVERIFIED — confirm no automated job exists during implementation; none was found in the reviewed service/route/cron files). This means chairs/queue slots held by no-shows aren't reclaimed promptly, and repeat no-show customers aren't identified or discouraged.

### Business Value
Reclaims lost chair-time from no-shows quickly (directly recoverable revenue via the freed slot going to the next waitlist/queue candidate — natural synergy with Feature 1) and reduces future no-show rates by identifying repeat offenders for a stricter deposit policy.

### User Flow (Customer)
- On booking, if the customer's phone number has a recent no-show history above a configured threshold, the booking flow can require a higher deposit or a confirmation step (configurable by manager, not hardcoded) — this must be applied transparently (message explaining why, not silently charging more) to avoid a poor customer experience for a possibly-one-off situation.
- Customer receives an automated reminder message (Phase 8 WhatsApp) shortly before their appointment with a "confirm you're coming" quick-reply; failure to confirm within a window can (per manager configuration) trigger an earlier release of the slot to the waitlist.

### Manager Flow
- Configure: (a) the no-show grace period (minutes after `starts_at` before a `confirmed`/`customer_arrived`-pending booking is auto-flagged `no_show`), (b) the repeat-offender threshold and its consequence (e.g., "require full payment upfront instead of a deposit after 2 no-shows in 60 days").
- View a "No-show Report" (extend `AnalyticsCharts.tsx`) — rate by barber/branch/day-of-week, and a list of repeat offenders.

### Reception Flow
- `ReceptionistDashboard.tsx`/`BookingsTable.tsx` gets a visual flag on bookings approaching their no-show threshold, and a manual "Mark No-show" action (already possible today, since `no_show` is a valid enum value in the status schema — this feature primarily adds automation and policy around it, not a new manual capability).

### AI Role
Purely operational/automated (cron-based), not conversational. The only "AI-adjacent" component is Feature 3's insights narrative optionally surfacing no-show trends — this feature itself does not require Gemini at all, keeping it robust and low-cost.

### Backend Requirements
- New cron job in `server/src/services/noshow.service.ts` (pattern-matching the existing `cleanup.service.ts`/`reminder.service.ts` `node-cron` usage):
  - Every N minutes: `SELECT * FROM bookings WHERE status IN ('confirmed') AND starts_at < NOW() - INTERVAL <grace_minutes> MINUTE AND (customer_arrived flag not set)`; transition to `no_show` (through the existing status-transition function once F-API-06's state-machine guard exists — `no_show` must be added as a legal transition target from `confirmed`), free the chair (reuse the chair-release logic already in `cancelBooking`, extracted into a shared `releaseChairIfHeld(bookingId)` helper to avoid duplicating that logic a third time), and trigger the Feature 1 waitlist-offer hook.
  - `recordNoShowHistory`: increment a rolling counter used by the deposit-policy check at booking-creation time (`createBooking` in `booking.service.ts` gains a new step: look up `getNoShowCountForPhone(phone, windowDays)` and adjust required deposit per manager-configured policy, read from `settings`).
- Extend `settings` (JSON `setting_value` under a new key, e.g., `no_show_policy`) rather than adding new hardcoded columns, consistent with the existing `settings` table pattern used for `booking_fee_vip`/`booking_fee_normal`.

### Database Requirements
No new tables strictly required — `bookings.status = 'no_show'` already exists. Recommended addition for reporting/repeat-offender lookups without repeatedly scanning `bookings`:
```sql
ALTER TABLE `bookings` ADD COLUMN `no_show_marked_at` TIMESTAMP NULL;
ALTER TABLE `bookings` ADD INDEX `idx_phone_status_date` (`customer_phone`, `status`, `booking_date`);
```
This composite index directly supports both this feature's repeat-offender lookup and Feature 2's recall-candidate query.

### API Requirements
- `PATCH /api/bookings/:id/status` (already exists, once F-SEC-03's auth fix and F-API-06's transition-guard land) gains `no_show` as a valid target from `confirmed`/`customer_arrived`.
- `GET /api/settings` / `PATCH /api/settings` (already exist) extended to read/write the new `no_show_policy` JSON key — no new route needed, following the existing settings pattern.
- New read-only `GET /api/insights/no-show-report?branchId=&period=` (part of Feature 3's `insights.routes.ts`, or standalone if Feature 3 isn't built yet — recommend adding to `insights.routes.ts` for consistency, but it has no hard dependency on Feature 3's AI narrative).

### Frontend Requirements
- `SettingsManager.tsx` gains a "No-show Policy" section (grace period, repeat-offender threshold, deposit consequence).
- `BookingsTable.tsx` gains a visual "approaching no-show" badge.
- `AnalyticsCharts.tsx` gains a no-show-rate chart.

### WhatsApp Requirements
Pre-appointment "confirm you're coming" reminder — extends the existing `reminder.service.ts` (which already sends WhatsApp reminders per Step 9's architecture) with a quick-reply confirmation captured via the WhatsApp webhook (Phase 8), updating a new lightweight `bookings.confirmation_status` flag (`ENUM('pending','confirmed_by_customer')`) distinct from the booking's main `status` field.

### Security
- The auto-no-show cron must use the same transactional chair-release discipline established in Phase 2 (§13 concurrency audit) to avoid racing with a receptionist simultaneously calling the customer to the chair.
- Repeat-offender deposit policy must not be exposed to the customer in a way that reveals exact internal thresholds (avoid gaming); show a generic message ("عربون أعلى مطلوب لهذا الحجز") rather than "you have 2 no-shows."

### Edge Cases
- Customer arrives exactly at the grace-period boundary while the cron is mid-run — use a single source of truth (`starts_at + grace_minutes < NOW()` evaluated inside the same transaction that also checks current status) to avoid a race where the cron marks a booking `no_show` moments after the customer was actually marked `customer_arrived` by reception.
- Customer with a legitimate one-off emergency — manager must be able to manually reverse a `no_show` back to `confirmed`/`completed` and have that reversal excluded from the repeat-offender count (add an `audit_logs`-backed manual-override flag).

### Failure Scenarios
- Cron fails to run for an extended period (deploy issue) — on next run, must correctly catch up on all overdue bookings without duplicate side effects (idempotent: only act on bookings still in `confirmed` status, so a delayed run is safe).

### Testing
- Unit: grace-period boundary logic.
- Integration: full flow from `confirmed` → auto `no_show` → chair released → waitlist offered (ties into Feature 1's tests).
- Concurrency: reception marking `customer_arrived` at the same moment the cron would mark `no_show` — exactly one outcome should win, verified by the transaction discipline from Phase 2.

### Dependencies
Phases 1–2 (foundation, especially the status state-machine from F-API-06 and transaction helper from F-DB-03). Synergizes with Feature 1 (Smart Waitlist) for slot recovery and Feature 2/3 for reporting, but can be implemented independently of both.

### Implementation Phases
1. Manual no-show marking + repeat-offender read-only report (uses existing enum value, no new automation).
2. Automated cron-based no-show detection + chair release.
3. Deposit-policy adjustment at booking time based on history.
4. WhatsApp pre-appointment confirmation loop (depends on Phase 8).

### Acceptance Criteria
- A `confirmed` booking past its grace period is automatically and exactly-once marked `no_show`, its chair released, and (once Feature 1 exists) the freed slot offered to the waitlist.
- Repeat-offender deposit policy is configurable per deployment via `settings`, not hardcoded.

---

## 5. Revenue Recovery

### Problem
Several revenue-leakage points exist today with no systematic recovery mechanism: rejected payment proofs with no automatic follow-up prompting the customer to resubmit; abandoned bookings stuck in `awaiting_payment` indefinitely; and no visibility into total "leaked" revenue for the manager to prioritize fixes.

### Business Value
Directly recovers revenue that is currently dropped silently — a rejected payment proof today (per `bookings.routes.ts`'s `rejected` branch) sends one WhatsApp message and the flow ends; there's no retry nudge, no expiry/cleanup, and no manager visibility into how much money is sitting in limbo.

### User Flow (Customer)
1. Customer's payment proof is rejected (invalid/unclear screenshot, wrong amount, etc.) → existing rejection message sent.
2. **New:** a follow-up nudge (configurable delay, e.g., 30 minutes later) with a direct re-upload link if no new proof has been submitted.
3. **New:** if a booking sits in `awaiting_payment` (proof never submitted at all) past a configurable window (e.g., 2 hours), send a reminder nudge; past a second, longer window (e.g., 24 hours), auto-expire the booking (`status = 'expired'`, already a valid enum value in `schema.sql`) and release its queue slot/chair — reusing the same release logic as Feature 4's no-show handling.

### Manager Flow
- New "Revenue Recovery" dashboard section: total value currently stuck in `awaiting_payment`/`pending_review`/`rejected` states, average time-to-resolution, recovery rate after nudges, and a manually-triggerable "resend nudge now" action for a specific booking.

### Reception Flow
- `BookingsTable.tsx` surfaces stuck/rejected bookings prominently (already partially possible via status filtering) with a one-click "send reminder" action for cases the automation hasn't reached its threshold yet.

### Customer Flow
Re-upload flow reuses the existing `PaymentProofModal.tsx`/`POST /api/upload` + `PATCH /:id/payment-proof` (submission side, not the approval side) — no new customer-facing screens required beyond the nudge message's link target, which should deep-link into the existing track/upload flow (`TrackBookingModal.tsx`) with the booking ID pre-filled.

### AI Role
Optional enhancement only: once Phase 7 exists, the rejection-nudge message can be personalized ("عزيزي أحمد، لاحظنا إن صورة الإيصال مش واضحة، تقدر ترفع صورة تانية من هنا") via the same server-owned-prompt pattern as Feature 2. The core mechanism (detecting stuck bookings and sending a nudge) is deterministic cron logic, not AI-dependent, and should be built and shippable without any AI involvement first.

### Backend Requirements
- `server/src/services/revenueRecovery.service.ts`:
  - `findStuckBookings(branchId)`: bookings in `awaiting_payment` past reminder threshold (not yet nudged, or nudged once and past a second threshold), and `rejected` payment proofs past their own nudge threshold with no newer proof submitted.
  - `sendRecoveryNudge(bookingId, stage)`: sends the appropriate WhatsApp message (Phase 8) and records the attempt.
  - `expireStaleBookings(branchId)`: transitions long-stuck `awaiting_payment` bookings to `expired`, releasing chair/queue slot (shared helper with Feature 4).
- Extend `cleanup.service.ts`'s existing cron scheduler (same `node-cron` instance/pattern) rather than introducing a second scheduling mechanism.
- New route `insights.routes.ts` (Feature 3) or standalone `recovery.routes.ts`, `requireAuth + requireRoles('manager','receptionist')`:
  - `GET /stuck?branchId=` — list.
  - `POST /:bookingId/nudge` — manual trigger.
  - `GET /report?branchId=&period=` — recovered-vs-lost revenue summary.

### Database Requirements
```sql
ALTER TABLE `bookings` ADD COLUMN `last_nudge_sent_at` TIMESTAMP NULL;
ALTER TABLE `bookings` ADD COLUMN `nudge_count` INT DEFAULT 0;

CREATE TABLE IF NOT EXISTS `revenue_recovery_log` (
  `id` VARCHAR(64) PRIMARY KEY,
  `booking_id` VARCHAR(64) NOT NULL,
  `stage` ENUM('awaiting_payment_reminder','proof_rejected_nudge','expired') NOT NULL,
  `outcome` ENUM('recovered','still_pending','expired') DEFAULT 'still_pending',
  `sent_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `resolved_at` TIMESTAMP NULL,
  FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### API Requirements
As above; branch-scoped via `requireBranchAccess` for receptionist role; manager sees all assigned branches.

### Frontend Requirements
`src/components/manager/RevenueRecoveryDashboard.tsx` (value-stuck summary, recovery-rate trend, manual nudge action); a small badge/indicator added to `BookingsTable.tsx` rows for reception-side visibility.

### WhatsApp Requirements
Reuses the same transport/templating infrastructure as Features 1, 2, and 4 — recommend building a single shared `notifications.service.ts` message-template registry (per `Software Engineering.md` F-AR-01's extraction recommendation) once two or more of these features exist, rather than each feature independently constructing WhatsApp message strings the way `booking.service.ts`/`bookings.routes.ts` currently do inline.

### Security
- Nudge/expire automation must not fight with a customer who is mid-upload — check for a newer `payment_proofs` row before sending a "still waiting" nudge or expiring, to avoid an embarrassing "your booking expired" message sent moments after the customer actually submitted proof (race handled correctly by re-querying inside the same transaction that performs the expiry).
- Manual "nudge now" and the recovery report are staff-only, branch-scoped, per existing RBAC conventions.

### Edge Cases
- Customer submits a second, corrected payment proof after rejection — must supersede the rejected one cleanly; verify `payment_proofs.booking_id UNIQUE` constraint interaction (currently one proof row per booking, per schema) — decide whether resubmission **updates** the existing row (recommended, matches current unique constraint) or requires relaxing the constraint to keep a full history of resubmission attempts (recommended for better analytics — if changed, this is a schema migration to track separately, and `getBookingById`'s "most recent proof" logic must be updated accordingly).
- Multiple nudges shouldn't be sent faster than a sensible minimum interval even if the cron runs more frequently than the nudge cadence — guard via `last_nudge_sent_at` check.

### Failure Scenarios
- WhatsApp transport down when a nudge is due — retry on next cron run rather than marking as sent; only update `last_nudge_sent_at` after a confirmed send.

### Testing
- Unit: stuck-booking detection thresholds.
- Integration: full awaiting_payment → nudge → resubmission → approval path, and the awaiting_payment → nudge → no response → expiry → chair-released path.
- Regression: verify expiry logic never fires on a booking that has a payment proof submitted more recently than the last threshold check (the race condition above).

### Dependencies
Phases 1–2 (foundation, transaction helper for the expiry race). Synergizes with Feature 4 (shared chair/queue-release helper) and Feature 1 (expired bookings should also trigger a waitlist offer). Full automation depends on Phase 8 (WhatsApp); a manager-facing "stuck bookings" report with manual nudge can ship earlier as an interim version.

### Implementation Phases
1. Stuck-booking detection + manager report + manual nudge action (no automation yet).
2. Automated nudge cron (Phase 8-dependent for WhatsApp delivery; can use a manual "flag for reception to call" fallback list before Phase 8 lands).
3. Automated expiry + chair/queue release, wired into Feature 1's waitlist offer and Feature 4's shared release helper.
4. AI-personalized nudge copy (optional, Phase 7-dependent).

### Acceptance Criteria
- Manager can see, at any time, an accurate total of revenue currently "stuck" in unpaid/rejected states per branch.
- Stale `awaiting_payment` bookings are automatically expired and their resources released exactly once, with no false expiry of bookings that received a payment proof after the last check.
- Nudge automation never sends more than the configured maximum number of reminders per booking.

---

## Cross-Feature Shared Infrastructure (build once, use in all five)

To avoid the duplication problem already present in the current codebase (F-AR-01/F-AR-02 in `Software Engineering.md`), implement these shared pieces **before or during** Feature 1, and reuse them in Features 2, 4, and 5 rather than re-deriving equivalents per feature:

1. **`server/src/services/notifications/templates.ts`** — a single registry of WhatsApp/Arabic message templates keyed by event type, replacing the inline template-literal strings currently scattered across `booking.service.ts` and `bookings.routes.ts`.
2. **`server/src/services/chairRelease.service.ts`** — `releaseChairIfHeld(bookingId)`, extracted from `cancelBooking`'s inline chair-release logic, reused by cancellation, no-show handling (Feature 4), and expiry (Feature 5).
3. **`server/src/utils/phone.ts`** — a single `normalizePhone()` implementation, replacing the three near-duplicate versions currently in `booking.service.ts`, `agentTools.routes.ts`, and `whatsapp.service.ts`.
4. **`server/src/config/db-transaction.ts`** — the `withTransaction()` helper from `Software Engineering.md` Phase 2, required by nearly every write path introduced in this document.

These are called out explicitly because implementing each feature in isolation without this shared layer would reproduce the exact duplication/drift problems already documented in the main audit.

---

*End of Feature Add Feature.md.*
