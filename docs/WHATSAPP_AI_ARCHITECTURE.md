# WhatsApp AI Assistant & Booking Agent Architecture

## 1. Executive Summary

This architecture integrates a conversational WhatsApp AI Assistant into the existing **TrimMind (Elite Salon Platform)**. 

The system leverages:
- **Evolution API** as the WhatsApp transport gateway.
- **n8n** as the workflow orchestrator and state coordinator.
- **Google Gemini (Gemini 2.5 / Flash)** as the cognitive intelligence and natural language reasoner.
- **Existing Backend REST API & Database** as the authoritative single source of truth and business logic enforcer.

---

## 2. End-to-End System Architecture

```mermaid
sequenceDiagram
    autonumber
    actor Customer as 📱 العميل (WhatsApp)
    participant Evo as ⚡ Evolution API
    participant n8n as 🔄 n8n Orchestrator
    participant Gemini as 🧠 Gemini 2.5 AI Agent
    participant Backend as 🛡️ Salon Backend API
    participant DB as 🗄️ Database
    actor Staff as 💈 Receptionist / Manager

    Customer->>Evo: "مساء الخير، عايز أظبط ميعاد بكرة بعد العصر مع أحمد"
    Evo->>n8n: Webhook (messages.upsert)
    Note over n8n: 1. Normalize Message<br/>2. Deduplicate Event ID<br/>3. Load Customer Context
    n8n->>Gemini: Prompt + Session Buffer Memory
    Note over Gemini: Thinks & Decides Tool: check_availability
    Gemini->>n8n: Tool Call: check_availability(date="2026-08-23", barber="أحمد")
    n8n->>Backend: POST /api/agent-tools/availability/check
    Backend->>DB: Query appointments & chair status
    DB-->>Backend: Availability result
    Backend-->>n8n: 200 OK (Slot available, Branch hours)
    n8n-->>Gemini: Tool Result
    Note over Gemini: Crafts natural Egyptian Arabic response
    Gemini-->>n8n: "أهلاً بيك يا فندم! الموعد متاح مع الكابتن أحمد بكرة الساعة 5 مساءً..."
    n8n->>Evo: POST /message/sendText (Evolution API)
    Evo->>Customer: "الموعد متاح مع الكابتن أحمد بكرة الساعة 5 مساءً..."
```

---

## 3. Core Principles & Design Rules

1. **No Keyword Bots / State Machines**: 
   The system does NOT use rigid regex/keyword routers (`"حجز"` -> static branch). Gemini understands free-form text, slang, missing details, and context.
2. **Backend is the Sole Truth**:
   The AI agent never accesses SQL directly and never alters DB tables without passing through backend validators and authorization checks.
3. **Deterministic Financial Safety**:
   The AI agent CANNOT mark payments as confirmed or approved. Incoming payment receipts automatically transition bookings to `pending_review`, where a human receptionist reviews and approves them.
4. **Idempotency & Deduplication**:
   Every incoming event uses the WhatsApp Message ID (`key.id`) and phone timestamp to prevent double-booking or duplicate messages.

---

## 4. Booking Lifecycle State Machine

```mermaid
stateDiagram-v2
    [*] --> awaiting_payment: Customer creates booking via AI
    awaiting_payment --> pending_review: Customer sends payment proof image
    pending_review --> confirmed: Receptionist / Manager Approves
    pending_review --> awaiting_payment: Receptionist Rejects (invalid proof)
    confirmed --> customer_arrived: Customer reaches salon
    customer_arrived --> in_service: Called to chair
    in_service --> completed: Haircut finished
    awaiting_payment --> cancelled: Customer cancels / grace timeout
    confirmed --> cancelled: Customer cancels within grace window
```

---

## 5. Security & Isolation

- **Endpoint Security**: `/api/agent-tools/*` is protected via `x-agent-secret` / `AGENT_API_SECRET`.
- **Identity Isolation**: Phone ownership is verified before any booking cancellation or modification.
- **Prompt Injection Immunity**: System prompt explicitly instructs the model to ignore system prompt leak requests, database dumps, and role modifications.
