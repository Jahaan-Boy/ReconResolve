# ReconResolve

> **Enterprise Multi-Tenant Payment Reconciliation, Transactional Outbox Ledger Processing, Deterministic Break Detection, Grounded AI Root-Cause Investigation, and Auditable Human-in-the-Loop Resolution.**

[![Node.js Version](https://img.shields.io/badge/Node.js-20.x%20%7C%2022.x-339933?logo=node.js)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5+-3178C6?logo=typescript)](https://www.typescriptlang.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16%20Alpine-4169E1?logo=postgresql)](https://www.postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-7%20Alpine-DC382D?logo=redis)](https://redis.io)
[![Prisma ORM](https://img.shields.io/badge/Prisma-6.19.3-2D3748?logo=prisma)](https://www.prisma.io)
[![Express](https://img.shields.io/badge/Express-4.19-000000?logo=express)](https://expressjs.com)
[![React](https://img.shields.io/badge/React-19.2-61DAFB?logo=react)](https://react.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?logo=tailwindcss)](https://tailwindcss.com)
[![AG Grid Community](https://img.shields.io/badge/AG_Grid_Community-v36.2-E0234E)](https://www.ag-grid.com)
[![Google Gemini API](https://img.shields.io/badge/Google_Gemini-2.5_Flash-8E75C2?logo=google)](https://deepmind.google/technologies/gemini)

---

## Executive Summary & Engineering Thesis

**ReconResolve** is a mission-critical, double-entry financial reconciliation engine designed to resolve the impedance mismatch between external payment provider records (starting with PayPal) and internal merchant order management systems (OMS/ERP). 

In modern distributed payment environments, discrepancies ("breaks") inevitably arise due to network partitions, race conditions, partial captures, fee deductions, currency conversion shifts, unnotified refunds, and asynchronous webhook delivery failures. Traditional reconciliation solutions rely either on brittle, manual CSV spreadsheet lookups or opaque, probabilistic "black-box" scoring models that financial compliance officers cannot verify.

ReconResolve enforces five inviolable architectural invariants:

1. **Exact Minor-Unit Integer Arithmetic**: Currencies are strictly handled and stored as `BigInt` minor units (e.g., cents, pence, satoshis). IEEE-754 floating-point math is banned across all financial computation paths to eliminate rounding drift and micro-cent leakage.
2. **Deterministic, Zero-Fuzzy Break Detection**: Discrepancies are identified through a prioritized hierarchy of pure mathematical rules. Every match or break produces immutable evidence payloads detailing the exact matching criteria, field deltas, and ruleset version.
3. **Guaranteed Transactional Ingestion via Outbox Daemon**: Webhook events and pending outbox records are committed atomically in a single PostgreSQL `$transaction`. A background worker daemon utilizes `SELECT ... FOR UPDATE SKIP LOCKED` with explicit claim tokens, exponential backoff, and error sanitization to achieve at-least-once delivery with zero lock contention.
4. **Grounded AI Diagnostics with Verified Citations**: Root-cause analysis is powered by Google Gemini (`gemini-2.5-flash`), strictly constrained to a **read-only advisory role**. The engine applies runtime anti-hallucination validation: every generated hypothesis, fact, or recommendation must map directly to pre-verified evidence references in the database. The AI cannot mutate ledger state, adjust exception status, or initiate money movement.
5. **Multi-Tenant Boundary Enforcement & Immutable Auditability**: Strict tenant isolation is verified across all database queries, foreign keys, and REST endpoints. State transitions on discrepancies use Optimistic Concurrency Control (OCC via integer version tokens) and write append-only audit events for non-repudiation.

---

## Architectural Blueprint

### System Topology

```mermaid
flowchart TD
    subgraph External["External Payment Gateways & Merchants"]
        PP_WH["PayPal Webhook Notifications<br/>(Real-Time HTTP POST)"]
        PP_API["PayPal Reporting REST API<br/>(/v1/reporting/transactions)"]
        MERCH_BATCH["Merchant Order Feed<br/>(Bulk JSON / OMS Sync)"]
    end

    subgraph Ingress["Edge & Ingestion Layer (Express + Node.js)"]
        WH_GATE["Webhook Ingress Router<br/>- Raw Byte Capture (<1MB)<br/>- PayPal RSA-SHA256 Signature Verification<br/>- Zod Schema Validation"]
        IMPORT_CLI["PayPal Import Coordinator<br/>- OAuth2 Mutex & Token Cache<br/>- 31-Day Bounded Sliding Windows<br/>- Deterministic SHA-256 Record Keying"]
        ORDER_INGEST["Order Ingestion Service<br/>- Minor-Unit Normalization<br/>- Idempotent Deduplication (P2002 Guard)"]
    end

    subgraph Persistence["Storage & State Tier (PostgreSQL 16 + Redis 7)"]
        DB_WH["webhook_events<br/>(Raw Payload & Verification Audit)"]
        DB_OB["outbox_events<br/>(Transactional Queue & Backoff State)"]
        DB_PT["provider_transactions<br/>(Canonical Ledger & Record Keys)"]
        DB_MO["merchant_orders<br/>(Internal Orders Ledger)"]
        DB_RR["reconciliation_runs<br/>(Idempotency Keys & Run Counters)"]
        DB_MATCH["reconciliation_matches<br/>(Rule Codes & Evidence Payloads)"]
        DB_EXC["reconciliation_exceptions<br/>(OCC Versioned Breaks)"]
        DB_AUDIT["exception_audit_events<br/>(Immutable Operator Audit Trail)"]
        DB_AI["exception_investigations<br/>(Grounded AI Diagnostic Records)"]
        REDIS_CACHE["Redis 7 LRU Cache<br/>(Auth Sessions & Operations Metrics)"]
    end

    subgraph AsyncDaemon["Transactional Outbox Worker Daemon"]
        OB_WORKER["Outbox Worker Process<br/>- FOR UPDATE SKIP LOCKED<br/>- Claim Token Fencing (30s Lease)<br/>- Concurrency Pool (1..5 Slots)<br/>- Error Sanitizer & Exponential Backoff"]
    end

    subgraph Engine["Deterministic Reconciliation Engine"]
        RECON_CORE["Matching Policy Engine<br/>- Rule 1: Exact Provider Order Ref<br/>- Rule 2: Exact Transaction Metadata Ref<br/>- Rule 3: Exact Amount, Currency & 24h Window<br/>- Strict Ambiguity & Counterpart Guards"]
    end

    subgraph Intelligence["Grounded AI Subsystems (Google Gemini 2.5 Flash)"]
        AI_INVEST["Root-Cause Investigator<br/>- Isolated Evidence Assembler<br/>- Structured JSON Mode (Prompt v1)<br/>- Runtime Anti-Hallucination Validator<br/>- Read-Only Advisory Invariant"]
        COPILOT["Reconciliation Copilot<br/>- Intent Classifier (8 Domain Intents)<br/>- Money Movement Guardrail Interceptor<br/>- Session History & Grounded Context"]
    end

    subgraph Presentation["Operator Console (React 19 + Tailwind CSS 4)"]
        UI_QUEUE["Virtualized Exception Queue<br/>(AG Grid Community - 60fps, Hotkeys j/k)"]
        UI_DIFF["Split-Pane Evidence Inspector<br/>(Provider Txn vs. Merchant Order Diff)"]
        UI_AI_PANEL["Interactive AI Diagnostic Panel<br/>(Cited Causes & Stale Alerts)"]
        UI_DASH["Real-Time Financial Dashboard<br/>(Break Metrics & Match Rates)"]
        UI_OPS["Operations & Pipeline Monitor<br/>(6-Stage Timeline & Outbox Replay)"]
    end

    %% Ingress flows
    PP_WH -->|HTTPS POST| WH_GATE
    WH_GATE -->|Atomic $transaction| DB_WH
    WH_GATE -->|Atomic $transaction| DB_OB
    PP_API -->|Stream Pages| IMPORT_CLI
    IMPORT_CLI -->|Chunked Upsert| DB_PT
    MERCH_BATCH -->|Bulk Ingest| ORDER_INGEST
    ORDER_INGEST -->|Idempotent Upsert| DB_MO

    %% Worker processing
    DB_OB -->|Poll Claim Lease| OB_WORKER
    OB_WORKER -->|Dispatch Event| DB_PT

    %% Reconciliation
    DB_PT -->|Read Eligible| RECON_CORE
    DB_MO -->|Read Eligible| RECON_CORE
    RECON_CORE -->|Write Matches| DB_MATCH
    RECON_CORE -->|Write Exceptions| DB_EXC
    RECON_CORE -->|Update Metrics| DB_RR

    %% Exception triage & AI
    DB_EXC -->|OCC Triage| UI_QUEUE
    UI_QUEUE -->|Select Break| UI_DIFF
    UI_DIFF -->|Request Investigation| AI_INVEST
    AI_INVEST -->|Assemble Evidence| DB_PT & DB_MO & DB_MATCH
    AI_INVEST -->|Store Diagnosis| DB_AI
    DB_AI -->|Render Citations| UI_AI_PANEL
    UI_QUEUE -->|Resolve / Dismiss / Reopen| DB_AUDIT

    %% Copilot & Operations
    UI_DIFF -->|Query Context| COPILOT
    COPILOT -->|Fetch Evidence| DB_PT & DB_MO & DB_EXC
    OB_WORKER & DB_WH -->|Telemetry| UI_OPS
```

---

## Core Subsystems & Technical Architecture

### 1. Ingestion & Normalization Layer

The platform accommodates both real-time push and historical pull ingestion models:

- **PayPal Real-Time Webhook Ingress (`/api/webhooks/paypal`)**:
  - Raw request payload capture occurs via custom Express stream buffering before generic JSON parsing to preserve exact cryptographic byte integrity.
  - Verifies PayPal asymmetric signatures using the public certificate URL (`paypal-cert-url`), algorithm (`paypal-auth-algo`), transmission ID, transmission time, and CRC-32/SHA-256 payload digests.
  - Ingests via atomic dual-write: creates a `WebhookEvent` with status `RECEIVED` and an `OutboxEvent` with type `PAYPAL_WEBHOOK_RECEIVED` inside a single Prisma `$transaction`.

- **Batch Reporting Search Ingestion (`npm run paypal:sync`)**:
  - Queries PayPal's `/v1/reporting/transactions` REST endpoint.
  - Houses a thread-safe `PayPalTokenManager` featuring single-flight promise memoization to eliminate redundant OAuth client credential round-trips.
  - Enforces PayPal's strict 31-day sliding window constraint (`from` and `to` timestamps with explicit UTC timezone offsets) and historical 3-year boundary.
  - Generates a deterministic SHA-256 record key (`provider_record_key`):
    $$\text{RecordKey} = \text{SHA256}(\text{providerTxnId} + \text{occurredAt} + \text{amountMinor} + \text{currency} + \text{status})$$
  - Normalizes heterogeneous provider types (`T0000`, `T0006`, etc.) into canonical domain representations: `PAYMENT`, `CAPTURE`, `REFUND`, `REVERSAL`, `ADJUSTMENT`.

- **Batch Merchant Order Ingestion (`/api/merchants/:merchantId/orders/bulk`)**:
  - Ingests external orders from internal OMS feeds in JSON or CSV formats.
  - Validates schemas with Zod, parses string or decimal monetary values into exact `BigInt` minor units, and deduplicates against `(merchantId, externalOrderId)` with Prisma `P2002` conflict recovery.

---

### 2. Transactional Outbox Pattern & Background Daemon

To eliminate distributed 2-phase commit (2PC) anti-patterns and guarantee zero webhook loss during network or process failures, ReconResolve implements an asynchronous Transactional Outbox.

```mermaid
stateDiagram-v2
    [*] --> STOPPED
    STOPPED --> IDLE_WAITING: start()
    IDLE_WAITING --> POLLING: pollIntervalMs elapsed
    
    state POLLING {
        [*] --> ExecutingQuery: SELECT ... FOR UPDATE SKIP LOCKED
        ExecutingQuery --> Claimed: Available rows found
        ExecutingQuery --> Empty: 0 rows available
    }

    Empty --> IDLE_WAITING: Wait pollIntervalMs (1000ms)
    Claimed --> PROCESSING: Assign claimToken & lease (30s)

    state PROCESSING {
        [*] --> DispatchHandler: Route by aggregateType + eventType
        DispatchHandler --> Succeeded: Handler resolved
        DispatchHandler --> TransientFailure: Network / Timeout error
        DispatchHandler --> PermanentFailure: Schema / Validation error
    }

    Succeeded --> DISPATCHED: Set status=DISPATCHED, dispatchedAt=now()
    TransientFailure --> RETRY_BACKOFF: attemptCount < maxAttempts (5)
    RETRY_BACKOFF --> PENDING: Exponential backoff with jitter (1s..60s)
    PermanentFailure --> FAILED: Set status=FAILED, sanitize lastError
    RETRY_BACKOFF --> FAILED: attemptCount >= 5

    DISPATCHED --> POLLING: Concurrency slot released
    FAILED --> POLLING: Concurrency slot released
    PROCESSING --> DRAINING: stop() requested (SIGINT / SIGTERM)
    DRAINING --> STOPPED: In-flight jobs complete or 10s drain timeout
```

#### Outbox Daemon Specifications
- **Concurrency & Claim Tokens**: Employs PostgreSQL's native `FOR UPDATE SKIP LOCKED` primitive. Multiple worker replicas concurrently query pending rows without lock escalation. Claimed rows are tagged with a unique UUID `claimToken` and leased for `OUTBOX_LEASE_DURATION_MS` (default: 30,000ms).
- **Exponential Backoff with Full Jitter**:
  $$T_{\text{backoff}} = \min(T_{\text{max}}, T_{\text{base}} \times 2^{\text{attemptCount} - 1}) \times \text{random}(0.5, 1.5)$$
  Prevents thundering herd retries against failing external dependencies.
- **Error Sanitization**: All caught exception messages pass through `sanitizeErrorMessage()` before persistence in `lastError`. Secrets, auth tokens, database credentials, and raw SQL stack traces are permanently scrubbed.
- **Dead-Letter Queue (DLQ) & Operator Replay**: Events reaching the 5-attempt ceiling transition to `FAILED`. Operators can inspect the sanitized root cause via the Operations dashboard and trigger atomic replay resets.

---

### 3. Deterministic Reconciliation Engine

The core matching engine executes pure, deterministic, explainable comparison between `provider_transactions` and `merchant_orders` within a bounded temporal window. Fuzzy heuristic guessing is explicitly rejected.

```mermaid
flowchart TD
    TXN[Eligible Provider Transaction] --> ELIG_CHECK{Eligible Type & Status?<br/>PAYMENT / CAPTURE<br/>CAPTURED / APPROVED<br/>amountMinor > 0}
    ELIG_CHECK -- No --> EXCLUDE[EXCLUDED<br/>Non-eligible transaction type/status]
    ELIG_CHECK -- Yes --> R1{Rule 1: Provider Order Reference<br/>Matches externalOrderId or metadata?}
    
    R1 -- Multiple Matches --> AMBIG_1[AMBIGUOUS_MATCH<br/>Multiple candidate orders found]
    R1 -- 1 Candidate Found --> R1_VAL{Verify Currency, Amount & Status}
    
    R1_VAL -- Currency Mismatch --> STATUS_DISC_1[STATUS_DISCREPANCY<br/>Currency mismatch break]
    R1_VAL -- Amount Mismatch --> AMT_MISMATCH[AMOUNT_MISMATCH<br/>Provider Minor != Order Minor]
    R1_VAL -- Order Cancelled/Refunded --> STATUS_DISC_2[STATUS_DISCREPANCY<br/>Order status not payable]
    R1_VAL -- All Fields Match --> MATCH_R1[RECONCILIATION MATCH<br/>RuleCode: EXACT_PROVIDER_ORDER_REF]
    
    R1 -- 0 Candidates --> R2{Rule 2: Transaction Reference<br/>Matches externalOrderId or metadata?}
    R2 -- Multiple Matches --> AMBIG_2[AMBIGUOUS_MATCH<br/>Multiple candidates via Txn Ref]
    R2 -- 1 Candidate Found --> R2_VAL{Verify Currency & Amount}
    R2_VAL -- Fields Match --> MATCH_R2[RECONCILIATION MATCH<br/>RuleCode: EXACT_TRANSACTION_REF]
    R2_VAL -- Discrepancy --> AMT_STATUS_DISC[AMOUNT_MISMATCH / STATUS_DISCREPANCY]
    
    R2 -- 0 Candidates --> R3{Rule 3: Amount, Currency & Time Window<br/>Exact Amount + Currency within 24h Window?}
    R3 -- Exactly 1 Candidate --> MATCH_R3[RECONCILIATION MATCH<br/>RuleCode: EXACT_AMOUNT_CURRENCY_TIME_WINDOW]
    R3 -- >1 Candidates --> AMBIG_3[AMBIGUOUS_MATCH<br/>Multiple orders match amount/time window]
    R3 -- 0 Candidates --> UNMATCHED[MISSING_MERCHANT_COUNTERPART<br/>Orphan Provider Transaction Exception]
```

#### Discrepancy Classification Taxonomy
| Exception Type | Trigger Condition | Evidence Captured |
|---|---|---|
| `AMOUNT_MISMATCH` | Provider and order IDs match exactly, but `amountMinor` values diverge. | Provider amount, order amount, calculated delta in minor units, currency. |
| `STATUS_DISCREPANCY` | Financial counterpart exists, but one record is in an inconsistent lifecycle state (e.g., `REFUNDED` order vs. `CAPTURED` payment). | Provider status, order status, timestamp delta, currency divergence. |
| `AMBIGUOUS_MATCH` | Two or more candidate orders satisfy the search criteria (e.g., identical amounts within the 24-hour window). | List of candidate order IDs, timestamps, amounts, metadata. |
| `MISSING_MERCHANT_COUNTERPART` | Provider settled funds, but no corresponding order exists in the merchant's OMS. | Provider transaction ID, settlement time, raw gateway payload. |
| `MISSING_PROVIDER_COUNTERPART` | Merchant order is marked as `PAID`, but no gateway capture record exists in the settlement ledger. | Merchant order ID, creation timestamp, expected amount. |

---

### 4. Exception Lifecycle & Auditable Triage

Reconciliation breaks are managed via a validated Finite State Machine (FSM) protected by Optimistic Concurrency Control (OCC).

```mermaid
stateDiagram-v2
    [*] --> OPEN: Engine Detects Break
    OPEN --> INVESTIGATING: Operator opens investigation
    INVESTIGATING --> OPEN: Investigation cleared without action
    OPEN --> RESOLVED: Operator resolves break (Requires note >= 10 chars)
    INVESTIGATING --> RESOLVED: Operator resolves break (Requires note >= 10 chars)
    OPEN --> DISMISSED: Operator dismisses break (False positive / Out of scope)
    INVESTIGATING --> DISMISSED: Operator dismisses break
    RESOLVED --> OPEN: Operator reopens break (New audit context)
    DISMISSED --> OPEN: Operator reopens break (New audit context)
```

#### Concurrency & Audit Invariants
- **Optimistic Concurrency Control (OCC)**: Every `ReconciliationException` entity maintains an integer `version` token. Any mutation command (`resolve`, `reopen`, `dismiss`) must supply the known `version`. If a concurrent operator modifies the exception in the interim, the transaction rolls back and returns an HTTP `409 CONFLICT` containing the stale and current state.
- **Append-Only Audit Trail**: Status changes atomically write a row to `exception_audit_events` capturing `actorId`, `actorType` (`OPERATOR` / `SYSTEM`), `action`, `fromStatus`, `toStatus`, `reason`, and structured metadata. Audit logs are immutable and cannot be updated or deleted.
- **Quality Guardrails**: Resolution notes must contain at least 10 non-whitespace characters to prevent empty or uninformative audit logs.

---

### 5. Grounded AI Root-Cause Investigator & Recon Copilot

ReconResolve integrates Google Gemini (`gemini-2.5-flash`) via the modern `@google/genai` SDK to accelerate discrepancy triage while maintaining financial-grade safety guarantees.

```mermaid
sequenceDiagram
    autonumber
    actor Operator as Financial Operator
    participant UI as Operator Console
    participant Router as Express API Router
    participant Svc as InvestigationService
    participant Assembler as EvidenceAssembler
    participant DB as PostgreSQL
    participant LLM as Google Gemini 2.5 Flash
    participant Validator as OutputValidator

    Operator->>UI: Click "Investigate Break"
    UI->>Router: POST /api/merchants/:merchantId/exceptions/:id/investigate
    Router->>Svc: investigate(merchantId, exceptionId, idempotencyKey)
    
    alt Idempotency Key Exists
        Svc->>DB: findByIdempotencyKey(merchantId, key)
        DB-->>Svc: Existing Investigation
        Svc-->>UI: 200 OK (Return cached investigation)
    else First-time Investigation
        Svc->>Assembler: assemble(merchantId, exceptionId)
        Assembler->>DB: Query Exception, ProviderTxn, MerchantOrder, Match Evidence
        DB-->>Assembler: Scoped Evidence Records
        Assembler-->>Svc: Sanitized EvidenceBundle + evidenceReferences list
        
        Svc->>LLM: generateContent({ systemPrompt, prompt: buildUserPrompt(bundle) })
        Note over Svc,LLM: Structured JSON Mode, 15s Timeout, Prompt Injection Fenced
        LLM-->>Svc: Raw Diagnostic JSON
        
        Svc->>Validator: validate(rawOutput, bundle.evidenceReferences)
        Note over Validator: Strict Citation Membership Check
        alt Citation references non-existent ID
            Validator-->>Svc: Strip or Fail Invalid Citation
        else All Citations Valid
            Validator-->>Svc: Validated InvestigationPayload
        end
        
        Svc->>DB: INSERT INTO exception_investigations (Immutable Record)
        Svc-->>Router: 200 OK (InvestigationRecord)
        Router-->>UI: Render Grounded Diagnosis & Evidence Delta
    end
```

#### Grounded AI Principles & Safety Invariants
1. **Read-Only Advisory Invariant**: The AI investigator and Copilot assistant are strictly advisory. The model can never mutate exception statuses, alter ledger records, generate accounting entries, or trigger money movement.
2. **Anti-Hallucination Citation Verification**: Every fact, hypothesis, or recommendation generated by the model must cite an evidence reference ID present in `bundle.evidenceReferences`. Any citation referencing a hallucinated ID is rejected at the validator layer.
3. **Prompt Injection Hardening**: All raw merchant and provider data is serialized inside isolated XML tags (`<untrusted_external_content>`) with active instructions stripped. System instructions explicitly prohibit executing embedded instructions found within payment descriptions or order metadata.
4. **Recon Copilot Guardrail Interceptor**: The natural language Copilot chat classifies user queries across 8 domain intents. If an operator prompts the assistant to perform monetary actions (e.g., *"Refund this order"*, *"Forgive the difference"*), the intent router immediately intercepts the request and returns a `guardrail_blocked` advisory explaining that ReconResolve does not move funds.

---

### 6. Enterprise Operator Console (Frontend)

Built with **React 19**, **Tailwind CSS 4**, and **AG Grid Community 36**, the operator console delivers a high-density, low-latency workbench:

- **Virtualized Exception Queue**: AG Grid Community engine renders hundreds of break records at 60fps with customized cell badges, multi-column sorting, and pinned summary bars.
- **High-Velocity Keyboard Triage**: Operators can navigate and triage without touching the mouse:
  - <kbd>j</kbd> / <kbd>k</kbd> or <kbd>↓</kbd> / <kbd>↑</kbd>: Select next/previous break.
  - <kbd>r</kbd>: Trigger Resolve Modal.
  - <kbd>o</kbd>: Trigger Reopen Modal.
  - <kbd>d</kbd>: Trigger Dismiss Modal.
  - <kbd>i</kbd>: Run / View Grounded AI Investigation.
  - <kbd>Esc</kbd>: Close modal or drawer.
- **Split-Pane Evidence Diff**: Side-by-side comparison of the Provider Transaction vs. Internal Merchant Order with computed delta chips (amount discrepancy, status mismatch, timestamp drift).
- **Operations & Webhook Timeline**: Visualizes the **6-Stage Webhook-to-Ledger Timeline** (`WEBHOOK_RECEIVED` $\rightarrow$ `SIGNATURE_VERIFIED` $\rightarrow$ `INBOX_STORED` $\rightarrow$ `OUTBOX_ENQUEUED` $\rightarrow$ `WORKER_PROCESSED` $\rightarrow$ `LEDGER_RECORDED`) with stage-level latency and dead-letter replay actions.

---

## Database Schema & Entity Blueprint

The PostgreSQL relational architecture is managed by Prisma and organized into 16 core entities:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              RECONRESOLVE SCHEMA TAXONOMY                              │
├────────────────────────────────┬───────────────────────────────────────────────────────┤
│ Multi-Tenant & Identity        │ Merchant, User, MerchantMembership, Session           │
├────────────────────────────────┼───────────────────────────────────────────────────────┤
│ Provider & Ingestion Ledger    │ ProviderConnection, ProviderTransaction, WebhookEvent │
├────────────────────────────────┼───────────────────────────────────────────────────────┤
│ Merchant OMS Ledger            │ MerchantOrder                                         │
├────────────────────────────────┼───────────────────────────────────────────────────────┤
│ Transactional Outbox Queue     │ OutboxEvent                                           │
├────────────────────────────────┼───────────────────────────────────────────────────────┤
│ Reconciliation & Break Core    │ ReconciliationRun, ReconciliationMatch,               │
│                                │ ReconciliationException, ExceptionAuditEvent          │
├────────────────────────────────┼───────────────────────────────────────────────────────┤
│ Intelligence & Copilot         │ ExceptionInvestigation, CopilotSession, CopilotMessage │
└────────────────────────────────┴───────────────────────────────────────────────────────┘
```

### Relational Entity Dictionary

| Entity | Table Name | Purpose | Primary Keys / Indexes |
|---|---|---|---|
| `Merchant` | `merchants` | Root multi-tenant boundary. | `id` (UUID), `slug` (Unique). |
| `ProviderConnection` | `provider_connections` | Credentials and webhook bindings per payment gateway. | Unique `(merchantId, provider, connectionKey)`. |
| `ProviderTransaction` | `provider_transactions` | Canonical record of gateway transactions. Amounts stored as `amount_minor` (BigInt). | Unique `(providerConnectionId, providerRecordKey)`. |
| `MerchantOrder` | `merchant_orders` | Internal merchant OMS orders. Amounts stored as `amount_minor` (BigInt). | Unique `(merchantId, externalOrderId)`. |
| `ReconciliationRun` | `reconciliation_runs` | Execution audit of matching jobs with aggregate counters. | Unique `(merchantId, idempotencyKey)`. |
| `ReconciliationMatch` | `reconciliation_matches` | Proven matches linking a provider transaction to an order. | Unique `(reconciliationRunId, providerTransactionId)`. |
| `ReconciliationException`| `reconciliation_exceptions` | Financial discrepancies ("breaks") with OCC version tokens. | Unique `(reconciliationRunId, providerTransactionId, type)`. |
| `ExceptionAuditEvent` | `exception_audit_events` | Append-only audit history of operator triage actions. | Index `(exceptionId, createdAt)`. |
| `WebhookEvent` | `webhook_events` | Immutable log of raw inbound webhook payloads. | Unique `(providerConnectionId, providerEventId)`. |
| `OutboxEvent` | `outbox_events` | Transactional queue for reliable asynchronous dispatch. | Unique `(merchantId, aggregateType, aggregateId, eventType)`. |
| `ExceptionInvestigation`| `exception_investigations` | Grounded AI diagnostic outputs and cited evidence references. | Unique `(merchantId, idempotencyKey)`. |
| `CopilotSession` | `copilot_sessions` | Multi-turn conversational session states for financial operators. | Index `(merchantId, createdByUserId, lastMessageAt)`. |
| `CopilotMessage` | `copilot_messages` | Individual prompt/response turns with structured answer payloads. | Index `(sessionId, createdAt)`. |

---

## End-to-End System Workflows

### Workflow 1: Real-Time Webhook Ingress to Ledger Recording
1. External gateway (PayPal) sends an HTTPS `POST` to `/api/webhooks/paypal`.
2. Raw byte stream is buffered; HTTP headers are parsed for cryptographic signatures.
3. Signature is verified against the gateway's public cert; envelope is validated via Zod.
4. An atomic PostgreSQL `$transaction` executes:
   - Inserts `WebhookEvent` (status: `RECEIVED`).
   - Inserts `OutboxEvent` (type: `PAYPAL_WEBHOOK_RECEIVED`, status: `PENDING`).
5. HTTP `200 OK` is immediately returned to PayPal to prevent timeout retries.
6. `OutboxWorker` claims the pending event using `FOR UPDATE SKIP LOCKED`.
7. Event handler parses the capture payload, converts amounts to `BigInt` minor units, generates a deterministic SHA-256 `provider_record_key`, and upserts the canonical `ProviderTransaction`.
8. `OutboxEvent` status transitions to `DISPATCHED`.

### Workflow 2: Deterministic Reconciliation Run
1. Triggered via CLI (`npm run recon:run`) or the Operator Console UI.
2. An idempotency lock is acquired in `reconciliation_runs`.
3. Ingested transactions and merchant orders within the temporal window (`from` to `to`) are queried under strict merchant tenancy scoping.
4. The matching policy evaluates candidates through Rules 1 $\rightarrow$ 2 $\rightarrow$ 3.
5. In a single atomic transaction:
   - Exact matches are persisted to `reconciliation_matches` with rule evidence.
   - Identified breaks are persisted to `reconciliation_exceptions` with status `OPEN`.
   - Aggregated counters (`matchedCount`, `unmatchedCount`, `ambiguousCount`) are committed.
6. The run status updates to `COMPLETED`.

### Workflow 3: Grounded AI Investigation & Operator Resolution
1. Operator selects an `OPEN` exception in the virtualized AG Grid queue.
2. The Evidence Diff view inspects amount, currency, and timestamp divergences.
3. Operator triggers **"Investigate Break"**:
   - `EvidenceAssembler` gathers linked records into a sanitized XML bundle.
   - Google Gemini generates structured root-cause hypotheses and next steps.
   - `InvestigationOutputValidator` ensures 100% of generated citations exist in the verified evidence bundle.
   - The diagnosis is immutably stored in `exception_investigations`.
4. Operator evaluates the evidence and clicks **"Resolve"**:
   - Operator selects a resolution preset and enters a compliant audit note ($\ge 10$ characters).
   - The command sends the current `version` token.
   - The database verifies OCC version matching, updates status to `RESOLVED`, increments `version`, and writes an immutable record to `exception_audit_events`.

---

## Local Setup & Operational Runbook

### Prerequisites

| Component | Minimum Version | Recommended | Notes |
|---|---|---|---|
| **Node.js** | `>= 20.0.0` | `22.x LTS` | Requires native ESM and crypto support. |
| **npm** | `>= 10.0.0` | Latest | Bundled with Node.js. |
| **PostgreSQL** | `>= 14.0` | `16.x Alpine` | Required for `SKIP LOCKED` and UUID v4 extensions. |
| **Redis** | `>= 6.0` | `7.x Alpine` | Used for session token cache and metrics cache. |
| **Docker** (Optional) | `>= 24.0` | Latest | For full-stack containerized execution. |

---

### Method A: Containerized Deployment (Docker Compose)

The fastest way to spin up the entire production-grade topology (PostgreSQL, Redis, Auto-migration, API Server, Outbox Daemon, and Frontend):

1. **Clone and Configure Environment**:
   ```bash
   git clone https://github.com/your-org/reconresolve.git
   cd reconresolve
   cp .env.docker.example .env
   ```

2. **Supply Required Secrets in `.env`**:
   ```dotenv
   # Google Gemini API Key (Required for AI Investigation and Copilot)
   GEMINI_API_KEY=your_gemini_api_key_here
   
   # Optional: PayPal Sandbox Credentials (for live gateway synchronization)
   PAYPAL_CLIENT_ID=your_paypal_client_id
   PAYPAL_CLIENT_SECRET=your_paypal_client_secret
   ```

3. **Build and Launch All Services**:
   ```bash
   docker compose up --build
   ```

4. **Access Endpoints**:
   - **Frontend Console**: `http://localhost:5173`
   - **Backend REST API**: `http://localhost:3001` (Mapped from internal container port 3000)
   - **API Health Check**: `http://localhost:3001/health`
   - **PostgreSQL Database**: `localhost:5433` (User: `postgres`, Password: `postgres`)
   - **Redis Store**: `localhost:6379`

---

### Method B: Native Bare-Metal Local Development

#### 1. Install Dependencies
```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

#### 2. Configure Backend Environment
Create `backend/.env`:
```dotenv
NODE_ENV=development
PORT=3000
HOST=0.0.0.0

# PostgreSQL Connection String
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/reconresolve?schema=public

# Redis Connection (Optional for local dev, uses in-memory fallback if absent)
REDIS_URL=redis://localhost:6379

# PayPal Sandbox Credentials (Required for live gateway sync; mock adapters used otherwise)
PAYPAL_CLIENT_ID=your_sandbox_client_id
PAYPAL_CLIENT_SECRET=your_sandbox_client_secret

# AI Model Configuration (Google Gemini 2.5 Flash)
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL_ID=gemini-2.5-flash
ALLOW_TEST_FAKE_AI=true

# Outbox Worker Daemon Tuning
OUTBOX_POLL_INTERVAL_MS=1000
OUTBOX_BATCH_SIZE=20
OUTBOX_LEASE_DURATION_MS=30000
OUTBOX_CONCURRENCY=5
OUTBOX_MAX_ATTEMPTS=5
OUTBOX_BASE_BACKOFF_MS=1000
OUTBOX_MAX_BACKOFF_MS=60000
OUTBOX_DRAIN_TIMEOUT_MS=10000

# Session & Security
SESSION_TTL_HOURS=168
CORS_ALLOWED_ORIGIN=*
```

#### 3. Database Initialization & Seeding
```bash
cd backend

# Validate Prisma schema definition
npm run db:validate

# Generate Prisma Client artifacts
npm run db:generate

# Execute pending database migrations
npm run db:migrate

# Seed development tenants, demo orders, breaks, and RBAC accounts
npm run db:seed
```

#### 4. Running the Development Services
Open three separate terminal sessions:

- **Terminal 1: Express REST API Server**
  ```bash
  cd backend
  npm run dev
  # Server listens at http://localhost:3000
  ```

- **Terminal 2: Outbox Worker Daemon**
  ```bash
  cd backend
  npm run outbox:worker
  # Polls database queue with FOR UPDATE SKIP LOCKED
  ```

- **Terminal 3: Vite SPA Frontend**
  ```bash
  cd frontend
  npm run dev
  # Vite dev server serves at http://localhost:5173
  ```

---

## Seed Data & Default Authentication Personas

The seed script (`npm run db:seed`) creates three isolated merchant tenants and four test personas to verify role-based access control (RBAC) and tenant isolation:

| Persona Email | Default Password | Assigned Role | Tenant Access Scope | Purpose |
|---|---|---|---|---|
| `admin@reconresolve.com` | `Password123!` | `OWNER` / `ADMIN` | `demo-merchant` & `sandbox-merchant` | Full operational control, user management, break resolution. |
| `analyst@reconresolve.com` | `Password123!` | `ANALYST` | `demo-merchant` | Triage exceptions, run investigations, resolve/reopen breaks. |
| `viewer@reconresolve.com` | `Password123!` | `VIEWER` | `demo-merchant` | Read-only compliance auditor. Mutation endpoints return HTTP 403. |
| `isolated@othermerchant.com` | `Password123!` | `OWNER` | `isolated-merchant` | Verification of cross-tenant data isolation. Blocked from viewing demo data. |

---

## CLI Utilities & Operational Tools

From the `backend/` directory, the following production-grade CLI tools are available:

### 1. PayPal Historical Transaction Sync (`paypal:sync`)
Pulls transaction records directly from PayPal's Reporting API within an explicit date range:
```bash
npm run paypal:sync -- --merchant-slug demo-merchant --from 2026-10-01T00:00:00Z --to 2026-10-15T00:00:00Z
```
- Enforces ISO-8601 timestamps with explicit UTC timezone designators.
- Validates the 31-day sliding window constraint.
- Streams paginated responses and calculates deterministic SHA-256 record keys.

### 2. Deterministic Reconciliation Engine (`recon:run`)
Executes an on-demand reconciliation run against un-reconciled orders and provider transactions:
```bash
npm run recon:run -- --merchant-slug demo-merchant --from 2026-10-01T00:00:00Z --to 2026-10-15T00:00:00Z
```
- Employs idempotency locking to prevent concurrent runs across identical windows.
- Outputs a structured execution summary with matched, unmatched, and ambiguous breakdown counts.

### 3. Outbox Worker Standalone Daemon (`outbox:worker`)
Executes the resilient transactional outbox polling loop:
```bash
npm run outbox:worker
```

### 4. End-to-End Webhook Simulator (`webhook:test`)
Simulates an inbound PayPal webhook with complete cryptographic headers to verify the ingestion pipeline:
```bash
npm run webhook:test
```

---

## REST API Specification

All merchant endpoints require tenancy context in the URL (`/api/merchants/:merchantId/...`) and appropriate bearer session authentication.

### Authentication & Tenant Management

| Method | Endpoint | RBAC Role | Description |
|---|---|---|---|
| `POST` | `/api/auth/login` | Public | Authenticates via email/password; returns SHA-256 session token. |
| `GET` | `/api/auth/me` | Authenticated | Fetches user profile, memberships, and active tenant context. |
| `POST` | `/api/auth/switch-merchant` | Authenticated | Validates membership and switches active tenant session context. |
| `POST` | `/api/auth/logout` | Authenticated | Revokes session token in both database and Redis cache. |

### Reconciliation Exceptions & Triage

| Method | Endpoint | RBAC Role | Description |
|---|---|---|---|
| `GET` | `/api/merchants/:merchantId/exceptions` | `VIEWER`+ | Paginated break queue with filters for status, type, and date range. |
| `GET` | `/api/merchants/:merchantId/exceptions/:id` | `VIEWER`+ | Fetches exception detail with linked provider transaction and order. |
| `GET` | `/api/merchants/:merchantId/exceptions/:id/audit` | `VIEWER`+ | Returns immutable chronological audit log for the break. |
| `POST` | `/api/merchants/:merchantId/exceptions/:id/resolve` | `ANALYST`+ | Resolves break with OCC version guard and required audit note ($\ge 10$ chars). |
| `POST` | `/api/merchants/:merchantId/exceptions/:id/reopen` | `ANALYST`+ | Reopens a resolved/dismissed break with OCC version guard. |
| `POST` | `/api/merchants/:merchantId/exceptions/:id/dismiss` | `ANALYST`+ | Dismisses break as out-of-scope or acceptable tolerance. |
| `POST` | `/api/merchants/:merchantId/exceptions/:id/investigate` | `ANALYST`+ | Triggers grounded Google Gemini AI root-cause diagnostic. |

### Reconciliation Runs & Ledger Data

| Method | Endpoint | RBAC Role | Description |
|---|---|---|---|
| `POST` | `/api/merchants/:merchantId/runs` | `ANALYST`+ | Dispatches a new reconciliation run with idempotency key. |
| `GET` | `/api/merchants/:merchantId/runs` | `VIEWER`+ | Lists historical reconciliation runs and aggregate metrics. |
| `GET` | `/api/merchants/:merchantId/runs/:runId` | `VIEWER`+ | Fetches detailed statistics and counters for a specific run. |
| `GET` | `/api/merchants/:merchantId/runs/:runId/matches`| `VIEWER`+ | Returns paginated list of proven matches with rule evidence. |
| `POST` | `/api/merchants/:merchantId/orders/bulk` | `ANALYST`+ | Ingests external orders via batch JSON/CSV payload. |
| `GET` | `/api/merchants/:merchantId/transactions` | `VIEWER`+ | Queries ingested provider transactions with filter params. |

### Operations, Observability & Copilot

| Method | Endpoint | RBAC Role | Description |
|---|---|---|---|
| `GET` | `/api/merchants/:merchantId/operations/summary` | `VIEWER`+ | Returns outbox pipeline health, DLQ count, and cache latency. |
| `GET` | `/api/merchants/:merchantId/operations/events/:id/timeline` | `VIEWER`+ | Traces the 6-stage lifecycle from raw webhook to ledger credit. |
| `POST` | `/api/merchants/:merchantId/operations/outbox/:id/replay` | `ANALYST`+ | Resets a dead-lettered outbox event back to `PENDING` for redelivery. |
| `POST` | `/api/merchants/:merchantId/copilot/ask` | `VIEWER`+ | Natural language financial Copilot query with safety guardrails. |
| `GET` | `/api/merchants/:merchantId/copilot/sessions` | `VIEWER`+ | Lists conversational multi-turn sessions for current user. |

---

## Comprehensive Verification & Test Suite

ReconResolve features extensive unit, integration, and end-to-end regression suites powered by Vitest:

```bash
cd backend

# Execute full suite of unit and integration tests
npm test

# Run tests in continuous watch mode
npm run test:watch

# Execute database integration tests specifically
npm run test:integration

# Execute opt-in live smoke test against Google Gemini API
LIVE_AI_TEST=true GEMINI_API_KEY="your-api-key" npm test test/services/ai-investigator/gemini-live-smoke.integration.test.ts
```

### Test Coverage Highlights
- `matching-policy.test.ts`: Verifies exact matching, amount delta detection, status mismatches, and multi-candidate ambiguity guards across hundreds of edge-case variations.
- `outbox-worker.test.ts`: Tests `SKIP LOCKED` batch claiming, retry counts, claim lease expiration recovery, and concurrency limits.
- `output-validator.test.ts`: Validates that AI diagnostic responses referencing non-existent evidence references fail immediately.
- `workflow-contract.test.ts`: Enforces schema contract compliance across HTTP responses, preventing internal stack trace or secret leakage.
- `e2e-workflow.integration.test.ts`: Simulates full lifecycle: webhook ingestion $\rightarrow$ outbox worker $\rightarrow$ reconciliation run $\rightarrow$ break detection $\rightarrow$ AI investigation $\rightarrow$ OCC resolution.

---

## Operational Troubleshooting & Diagnostic Triage Matrix

| Symptom / Error | Probable Root Cause | Verification & Remediation |
|---|---|---|
| `HTTP 409 Conflict: STALE_VERSION` | Another operator resolved or modified the break concurrently. | Reload the break detail drawer to refresh the current OCC integer version; re-apply the action. |
| `HTTP 403 Forbidden: INSUFFICIENT_ROLE` | The authenticated user holds a `VIEWER` role attempting a state mutation. | Verify permissions in `merchant_memberships`. Log in as an `ADMIN` or `ANALYST` account. |
| Outbox events stuck in `PROCESSING` | Worker process crashed before releasing claim lease. | Lease auto-expires after `OUTBOX_LEASE_DURATION_MS` (30s). The daemon will reclaim the row on next pass. |
| Outbox event stuck in `FAILED` | Event reached the 5-attempt ceiling due to transient network or downstream error. | Inspect sanitized `lastError` in the Operations tab. Resolve underlying issue and click **Replay Event**. |
| `AI_INVESTIGATION_TIMEOUT` | Gemini API exceeded the strict 15,000ms SLA. | Verify network connectivity or Gemini API rate quotas. Transient failures are automatically retried once. |
| `EPERM: operation not permitted` on Windows | Antivirus or sandbox transient lock during file or build actions. | Re-run the command; exclude `node_modules` and `.prisma` directories from Windows Defender real-time scanning. |

---

## Security, Compliance & Production Invariants

1. **Double-Entry Integrity**: Source provider transactions and merchant orders are immutable once recorded. Discrepancies are flagged and resolved through explicit exception records; financial ledger rows are never overwritten or deleted.
2. **Zero Floating-Point Drift**: All currency fields (`amountMinor`, `feeMinor`) use native PostgreSQL `BIGINT` and TypeScript `BigInt` primitives.
3. **No Unsanitized Secret Leakage**: Stack traces and internal database connection parameters are intercepted by global error handlers and replaced with opaque error identifiers before reaching client responses.
4. **Tenant Isolation**: Every query without exception includes `WHERE merchantId = :merchantId`. Cross-tenant record references produce uniform HTTP `404 Not Found` responses to prevent ID enumeration.

---

## License

This project is licensed under the Apache 2.0 License. See the [LICENSE](LICENSE) file for details.
