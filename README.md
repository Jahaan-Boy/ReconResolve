# ReconResolve

> Multi-tenant payment reconciliation, deterministic mismatch detection, grounded AI root-cause analysis, and auditable human-in-the-loop exception resolution.

ReconResolve compares provider payment records with internal merchant orders, surfaces financial discrepancies with explainable evidence, generates grounded root-cause diagnoses via Google Gemini, and enables authorized operators to investigate, resolve, or reopen exceptions using a virtualized AG Grid workbench with an immutable audit trail and optimistic concurrency control.

---

## Architectural Model

```text
                                  RECONRESOLVE ARCHITECTURE
                                  
  ┌────────────────────────────────────────────────────────────────────────────────────────┐
  │                                     DATA INGESTION                                     │
  ├────────────────────────────────────────┬───────────────────────────────────────────────┤
  │       Nightly / Batch Import           │              Real-Time Webhooks               │
  │     (PayPal Reporting Search)          │          (PayPal Webhook Intake)              │
  │                   │                    │                         │                     │
  │                   ▼                    │                         ▼                     │
  │      OAuth Token Manager (Mutex)       │          Raw Body Byte Capture (<1MB)         │
  │                   │                    │                         │                     │
  │                   ▼                    │                         ▼                     │
  │     Canonical Normalization &          │         Cryptographic Signature               │
  │     Exact BigInt Minor Units           │             Verification                      │
  │                   │                    │                         │                     │
  │                   ▼                    │                         ▼                     │
  │      Deterministic Record Key          │       Atomic PostgreSQL $transaction          │
  │     Fingerprint Deduplication          │     ├── Insert WebhookEvent (RECEIVED)        │
  │                   │                    │     └── Insert OutboxEvent (PENDING)          │
  │                   ▼                    │                         │                     │
  │    provider_transactions (PostgreSQL)  │                         ▼                     │
  │                                        │             Outbox Worker Daemon              │
  │                                        │      (FOR UPDATE SKIP LOCKED + Claims)        │
  │                                        │                         │                     │
  │                                        │                         ▼                     │
  │                                        │             Event Dispatcher & Handlers       │
  └────────────────────────────────────────┴───────────────────────────────────────────────┘
                                           │
                                           ▼
  ┌────────────────────────────────────────────────────────────────────────────────────────┐
  │                           DETERMINISTIC RECONCILIATION ENGINE                          │
  ├────────────────────────────────────────────────────────────────────────────────────────┤
  │  Multi-Tenant Scoped Transaction & Order Fetching                                      │
  │  Matching Policy Engine (Prioritized Pure Mathematical Rules):                         │
  │    ├── Rule 1: Exact Provider Order Reference (AMOUNT_MISMATCH / STATUS_DISCREPANCY)   │
  │    ├── Rule 2: Exact Transaction Reference (Metadata Cross-Reference)                  │
  │    ├── Rule 3: Exact Amount, Currency & Time Window (24-Hour Bounded Window)           │
  │    └── Ambiguity & Unmatched Guards (Refuses fuzzy guessing, creates exceptions)      │
  │  Atomic Persistence:                                                                   │
  │    ├── reconciliation_matches (Rule code, ruleset version, evidence payload)          │
  │    ├── reconciliation_exceptions (OPEN discrepancy records with version tokens)        │
  │    └── reconciliation_runs (Run summary counters and idempotency key guard)            │
  └────────────────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           ▼
  ┌────────────────────────────────────────────────────────────────────────────────────────┐
  │                         EXCEPTION MANAGEMENT & AUDIT TRAIL                             │
  ├────────────────────────────────────────────────────────────────────────────────────────┤
  │  Tenant-Scoped REST API (/api/merchants/:merchantId/exceptions)                        │
  │    ├── List Exceptions (Bounded pagination, status/type filters, deterministic order)  │
  │    ├── Detail View (Linked provider transaction, merchant order, run evidence)         │
  │    └── Explicit Commands: Resolve, Reopen, Dismiss, Investigate                        │
  │  Validated State Machine (OPEN ⇄ INVESTIGATING ⇄ RESOLVED / DISMISSED)                 │
  │  Optimistic Concurrency Control (OCC via integer version, HTTP 409 Conflict)           │
  │  Append-Only Audit Trail (exception_audit_events committed in same transaction)        │
  │  Tenant Isolation & Role Authorization (Consistent 404 policy, VIEWER mutation blocks)  │
  └────────────────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           ▼
  ┌────────────────────────────────────────────────────────────────────────────────────────┐
  │                     GROUNDED AI ROOT-CAUSE INVESTIGATOR (GEMINI)                       │
  ├────────────────────────────────────────────────────────────────────────────────────────┤
  │  Grounded Diagnostic Engine (/api/merchants/:merchantId/exceptions/:id/investigate)    │
  │    ├── Tenant-Isolated Evidence Assembler (Linked Txn, Order, Run Evidence Refs)      │
  │    ├── Google Gemini Provider Adapter (Structured JSON Mode, 15s Abort Timeout)        │
  │    ├── Anti-Hallucination Citation Validator (Strict membership check on evidenceRefs) │
  │    ├── Prompt Injection Defenses (<untrusted_external_content> sanitization fences)    │
  │    └── Immutable Persistence: exception_investigations & investigation_audit_events    │
  │  Read-Only Advisory Invariant: Never mutates exception status or alters financial data │
  └────────────────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           ▼
  ┌────────────────────────────────────────────────────────────────────────────────────────┐
  │                    ENTERPRISE OPERATOR CONSOLE (AG GRID COMMUNITY)                     │
  ├────────────────────────────────────────────────────────────────────────────────────────┤
  │  High-Performance Virtualized Workbench (React 19 + TypeScript + Tailwind CSS 4)       │
  │    ├── AG Grid Queue (60fps virtualization, custom cell badges, keyboard triage: j/k)  │
  │    ├── Split-Pane Evidence Diff (Provider Txn vs. Merchant Order with delta chips)     │
  │    ├── Interactive AI Panel (Cited hypotheses, confidence pills, stale-state alerts)   │
  │    ├── Action Modals with Quick Note Presets, 10-char note guard, and OCC versioning   │
  │    └── Modal Hubs: Batch Order Ingestion Dialog & On-Demand Reconciliation Runs Hub    │
  └────────────────────────────────────────────────────────────────────────────────────────┘
```

### Core Architecture Components

1. **Ingestion & Normalization:** Ingests reporting data from PayPal APIs, batch merchant orders, and real-time webhooks, normalizes codes, validates signatures, and stores currency amounts strictly in `BigInt` minor units (cents) to avoid floating-point errors.
2. **Transactional Outbox & Worker:** Commits incoming webhooks and pending outbox events in a single atomic transaction. A worker daemon uses PostgreSQL `SELECT ... FOR UPDATE SKIP LOCKED` with claim tokens, error sanitization, and exponential backoff to process background events concurrently without duplicate execution.
3. **Reconciliation Engine:** Deterministically matches provider transactions against merchant orders using prioritized rules, flags ambiguities, and records explainable evidence without opaque scoring.
4. **Exception Lifecycle & Auditing:** Manages discrepancies through a strictly validated state machine (`OPEN`, `INVESTIGATING`, `RESOLVED`, `DISMISSED`) with Optimistic Concurrency Control (`version` token) and an append-only audit log. It never alters source payment records or initiates money movement.
5. **AI Root-Cause Investigator:** Employs Google Gemini (`gemini-2.5-flash`) via `@google/genai` to generate grounded root-cause hypotheses, facts, and remediation actions. Enforces a strict read-only advisory invariant and validates at runtime that every citation refers to verified evidence references.
6. **Enterprise Operator Console:** High-velocity React 19 / Tailwind 4 workbench powered by AG Grid Community for virtualized queue scrolling, side-by-side evidence inspection, hotkey navigation, and CSV auditing exports.

---

## Local Setup Guide

### 1. Prerequisites

- **Node.js**: 20 or newer
- **PostgreSQL**: 14 or newer (local installation or hosted instance)
- **npm**: Standard Node package manager

---

### 2. Install Dependencies

From the repository root:

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

---

### 3. Configure Environment Variables

Create the `.env` file in `backend/`:

```bash
cd backend
cp .env.example .env
```

Update `backend/.env` with your PostgreSQL connection string and settings:

```dotenv
NODE_ENV=development
PORT=3000
HOST=0.0.0.0

# PostgreSQL Connection String
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/reconresolve

# PayPal Sandbox Credentials (Required for live API sync; unit tests use mocks)
PAYPAL_CLIENT_ID=your_sandbox_client_id
PAYPAL_CLIENT_SECRET=your_sandbox_client_secret

# Optional disposable test database for integration tests
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/reconresolve_test

# Outbox Worker Daemon Settings
OUTBOX_POLL_INTERVAL_MS=1000
OUTBOX_BATCH_SIZE=20
OUTBOX_LEASE_DURATION_MS=30000
OUTBOX_MAX_ATTEMPTS=5
OUTBOX_BASE_BACKOFF_MS=1000
OUTBOX_MAX_BACKOFF_MS=60000
OUTBOX_DRAIN_TIMEOUT_MS=10000

# Session & Authentication Settings
SESSION_TTL_HOURS=168

# AI Model Provider Configuration (Google Gemini)
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL_ID=gemini-2.5-flash

# Optional Opt-in Live AI Smoke Test
LIVE_AI_TEST=false
```

---

### 4. Database Setup & Migration

Run these commands from `backend/`:

```bash
# Validate Prisma schema
npm run db:validate

# Generate Prisma Client
npm run db:generate

# Apply migrations
npm run db:migrate

# Seed development merchant, provider connection, and orders
npm run db:seed
```

---

### 5. Running the Application Locally

Run the following processes in separate terminals:

#### Terminal 1: Backend API Server
```bash
cd backend
npm run dev
```
The API starts at `http://localhost:3000`. Test health:
```bash
curl http://localhost:3000/health
# {"status":"ok"}
```

#### Terminal 2: Outbox Worker Daemon
```bash
cd backend
npm run outbox:worker
```

#### Terminal 3: Frontend Application
```bash
cd frontend
npm run dev
```
The frontend starts at `http://localhost:5173`.

---

### 6. Available CLI Commands

From `backend/`:

```bash
# Manual/batch import of PayPal transactions for a merchant
npm run paypal:sync -- --merchant-slug demo-merchant --from 2026-10-01T00:00:00Z --to 2026-10-02T00:00:00Z

# Run the deterministic reconciliation engine
npm run recon:run -- --merchant-slug demo-merchant

# Run the full test suite
npm test

# Opt-in live smoke test against Google Gemini API (requires valid key)
LIVE_AI_TEST=true GEMINI_API_KEY="your-key" npm test test/services/ai-investigator/gemini-live-smoke.integration.test.ts

# Build production bundles
npm run build
```
