# ReconResolve — AI-Assisted Payment Reconciliation

> Reconcile payments, surface mismatches, and resolve them with evidence and a full audit trail.

ReconResolve is a payment reconciliation platform in development. Its intended workflow brings provider-side transaction records and merchant orders together, surfaces discrepancies, and supports evidence-backed investigations while keeping final resolution decisions with people. The AI investigator is designed to explain evidence, not move money.

The repository is a monorepo containing a React landing page and an Express/TypeScript backend. **Day 3 establishes a read-only PayPal Sandbox transaction import pipeline**, including API access, normalization, and idempotent persistence. Webhook processing, reconciliation execution, AI investigations, authentication, and the operational dashboard remain future work.

---

## Repository at a glance

| Directory | Stack | Purpose |
|---|---|---|
| `frontend/` | React 19, Vite 8, Tailwind CSS 4, Motion | Product landing page |
| `backend/` | Express 4, TypeScript, Prisma 6, PostgreSQL | API server, data model, and provider integration |
| `backend/src/providers/paypal/` | TypeScript | PayPal Sandbox client, OAuth token management, response validation, normalization, and money conversion |
| `backend/src/services/paypal-import/` | TypeScript | Import orchestration, source adapter, connection resolution, record mapping, record keys, and import errors |
| `backend/src/repositories/` | TypeScript, Prisma | PostgreSQL persistence for provider transactions |
| `backend/test/` | Vitest | Unit and integration tests, depending on configured test scripts and test database availability |

> Treat the repository itself and each package's `package.json` as the source of truth if paths or scripts have evolved.

## Prerequisites

| Requirement | Version / notes |
|---|---|
| Node.js | 20 or newer |
| npm | Use the version compatible with the project lockfiles |
| PostgreSQL | 14 or newer; local PostgreSQL or a compatible hosted instance |
| PayPal Sandbox credentials | Required for a real Sandbox import; not required for mocked unit tests |

Install the versions recorded by the lockfiles. Avoid upgrading major dependencies without reviewing compatibility and running the relevant checks.

---

## Quick start

### 1. Install dependencies

From the repository root:

```bash
cd backend
npm install

cd ../frontend
npm install
```

### 2. Configure the backend

From `backend/`:

```bash
cp .env.example .env
```

On Windows Command Prompt:

```bat
copy .env.example .env
```

Set `DATABASE_URL` in `backend/.env` to a valid PostgreSQL connection string:

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
```

For Sandbox imports, also set the credentials expected by the current implementation:

```dotenv
PAYPAL_CLIENT_ID=your_sandbox_client_id
PAYPAL_CLIENT_SECRET=your_sandbox_client_secret
```

Use Sandbox credentials from the PayPal Developer Dashboard. Do not commit `.env`, paste credentials into tickets, or print secrets in logs.

### 3. Validate Prisma, generate the client, migrate, and seed

Run these from `backend/`:

```bash
npm run db:validate
npm run db:generate
npm run db:migrate
npm run db:seed
```

- `db:validate` validates the Prisma schema.
- `db:generate` generates Prisma Client.
- `db:migrate` applies the configured development migration workflow.
- `db:seed` runs the development merchant seed and should be idempotent.

For a deployment or CI environment, apply already-reviewed migrations with:

```bash
npm run db:deploy
```

Do not use a production database for destructive tests or development migration experiments. Inspect generated migration SQL before applying it, especially if the database already contains provider transaction records.

### 4. Start the backend

From `backend/`:

```bash
npm run dev
```

The Express server uses the configured port, normally `3000`. Verify the health endpoint in another terminal:

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{
  "status": "ok"
}
```

### 5. Start the frontend

In another terminal:

```bash
cd frontend
npm run dev
```

Vite normally serves the landing page at `http://localhost:5173`. Use the URL printed by Vite if it selects another port.

---

## Frontend

The frontend is a React 19 and TypeScript landing page built with Vite and Tailwind CSS 4. Motion provides animation primitives, and Lucide React supplies icons.

### Landing page sections

| Section | Purpose |
|---|---|
| Hero | Introduces ReconResolve and previews the intended reconciliation experience |
| Problem | Explains duplicate/delayed events, mismatched records, and manual investigations |
| How it works | Presents the planned flow: Ingest → Reconcile → Investigate → Resolve |
| Features | Introduces event intake, processing, matching, investigation, exceptions, and auditability |
| Benefits | Explains the intended operational value |
| Call to action | Introduces the product's next step and safety principles |

Landing-page copy describes product intent; it is not proof that every capability is implemented in the backend.

### Frontend scripts

Run from `frontend/`:

| Script | Command | Purpose |
|---|---|---|
| `dev` | `vite` | Start the development server with HMR |
| `build` | `tsc -b && vite build` | Type-check and create a production bundle |
| `preview` | `vite preview` | Preview the production bundle locally |
| `lint` | `eslint .` | Run ESLint |

Run frontend quality checks:

```bash
cd frontend
npm run build
npm run lint
```

### Key frontend dependencies

- React 19 and React DOM 19
- Tailwind CSS 4 through `@tailwindcss/vite`
- Motion for animations
- Lucide React for icons
- Inter and Instrument Serif fonts through `@fontsource`

---

## Backend architecture

The backend uses Express 4, TypeScript, Prisma 6, and PostgreSQL.

### Server and database lifecycle

A single shared Prisma Client instance is managed by `src/db/postgres.ts`.

| Component | Responsibility |
|---|---|
| `connectDB()` | Connects to PostgreSQL and verifies connectivity with `SELECT 1` |
| `getDB()` | Returns the active shared Prisma Client |
| `closeDB()` | Disconnects the client during graceful shutdown |
| `src/app.ts` | Configures the Express app |
| `src/server.ts` | Connects to the database and starts the HTTP server |
| `src/routes/health.ts` | Implements `GET /health` |

Do not instantiate a Prisma Client per request or create a second database pool for ordinary application queries.

### Core data model

| Entity | Table | Purpose |
|---|---|---|
| `Merchant` | `merchants` | Tenant/workspace that owns business data |
| `ProviderConnection` | `provider_connections` | A merchant's logical connection to a provider |
| `ProviderTransaction` | `provider_transactions` | Normalized provider reporting record |
| `MerchantOrder` | `merchant_orders` | Merchant-side order that may later be reconciled |
| `ReconciliationRun` | `reconciliation_runs` | Durable record of a planned reconciliation attempt |
| `ReconciliationException` | `reconciliation_exceptions` | Discrepancy record for later investigation and resolution |

Amounts are stored as `BigInt` integer minor units with a three-character ISO 4217 currency code. Monetary arithmetic must not use floating-point values. See `backend/docs/data-model.md` for model documentation, relations, indexes, and tenant-isolation invariants.

### Backend scripts

Run from `backend/`:

| Script | Command | Purpose |
|---|---|---|
| `dev` | `tsx src/server.ts` | Start the Express server in development |
| `build` | `tsc` | Compile TypeScript into `dist/` |
| `start` | `node dist/server.js` | Run the compiled server |
| `db:validate` | `prisma validate` | Validate the Prisma schema |
| `db:generate` | `prisma generate` | Generate Prisma Client |
| `db:migrate` | `prisma migrate dev` | Apply/create development migrations |
| `db:seed` | `prisma db seed` | Run the development seed |
| `db:deploy` | `prisma migrate deploy` | Apply committed migrations in CI/deployment |
| `paypal:sync` | `tsx src/cli/paypal-sync.ts` | Import a bounded date window from PayPal Sandbox (if configured in `package.json`) |

Check `backend/package.json` for the exact scripts configured in your checkout. Do not rely on a documented script until it exists and has been tested.

### Environment variables

| Variable | Required for | Description |
|---|---|---|
| `NODE_ENV` | API server | `development`, `test`, or `production` |
| `HOST` | API server | Bind address, for example `0.0.0.0` |
| `PORT` | API server | HTTP port, normally `3000` |
| `DATABASE_URL` | Database access | PostgreSQL connection string |
| `PAYPAL_CLIENT_ID` | PayPal Sandbox import | Sandbox application client ID |
| `PAYPAL_CLIENT_SECRET` | PayPal Sandbox import | Sandbox application secret |

Keep real credentials in `backend/.env` or the deployment environment. Never commit secrets or log access tokens, Authorization headers, database URLs, or raw payment payloads.

---

## Day 3 — PayPal Sandbox transaction import

Day 3 delivers a read-only import path that composes the PayPal API client with normalization and PostgreSQL persistence. It is not yet a webhook-driven or scheduled integration.

### Import flow

```text
CLI arguments (merchant + date range)
           |
           v
Validate arguments and resolve one active PayPal connection
           |
           v
PayPal Sandbox OAuth token manager
           |
           v
Transaction Search API + bounded pagination
           |
           v
Runtime response validation and normalization
           |
           v
Derive providerRecordKey for each reporting record
           |
           v
Persist in bounded batches with database uniqueness
           |
           v
Return aggregate import summary
```

### Key design decisions

- **Sandbox-only and read-only:** this import uses PayPal Sandbox reporting APIs. It must not create orders, capture payments, initiate refunds, or call other money-movement endpoints.
- **Bounded import window:** callers provide explicit timezone-aware start and end timestamps. Invalid ranges are rejected before network access; the Transaction Search range is limited to 31 days per request.
- **Reporting delay:** Transaction Search is a reporting API, not a real-time stream. Recent executed transactions may take up to three hours to appear.
- **Canonical domain model:** PayPal response fields are normalized into the project's canonical transaction types before persistence.
- **Exact money representation:** decimal strings are converted using integer/string arithmetic and currency-specific minor-unit exponents.
- **Database-enforced idempotency:** `providerRecordKey` separates the provider's transaction reference from the imported reporting-record identity. The database uniqueness constraint is scoped to `[providerConnectionId, providerRecordKey]`.
- **Trusted tenant context:** merchant and provider-connection IDs are resolved from local database state, not accepted from provider response payloads.
- **Safe replay:** an interrupted import may leave earlier batches committed. Re-running the same date window should be safe because writes are idempotent; this is not an all-or-nothing transaction across every page.
- **Sanitized output:** import logs report counts and safe error categories, not credentials, raw response bodies, or payer details.

### Run a PayPal Sandbox import

Use the actual seeded merchant slug in your database. If the CLI and script are present in your checkout, the command should resemble:

```bash
cd backend
npm run paypal:sync -- \
  --merchant-slug demo-merchant \
  --from 2026-10-01T00:00:00Z \
  --to 2026-10-02T00:00:00Z
```

The date range above is only an example; use a valid range appropriate to your Sandbox account. The implementation should print a sanitized summary of fetched, normalized, inserted, updated, unchanged, and rejected records. If your actual script uses different arguments or an alternate CLI path, follow its implementation and update this documentation accordingly.

### Provider-record identity caveat

PayPal Transaction Search does not guarantee that `transaction_id` uniquely identifies every reporting row. `providerRecordKey` is a deterministic fingerprint used by this application to support idempotent storage; it is not a PayPal-issued immutable row ID. A fingerprint collision with materially different record contents must fail visibly rather than silently overwrite one record. The key algorithm and its version must be kept consistent between imports and any migration/backfill process.

Official references:

- [PayPal Transaction Search API](https://developer.paypal.com/api/transaction-search/v1/search-get)
- [PayPal REST API authentication](https://developer.paypal.com/api/rest/authentication)
- [PayPal Sandbox testing](https://developer.paypal.com/sandbox-testing/overview/)

### Test and build

From `backend/`:

```bash
npx prisma validate
npm run db:generate
npm run build
npx vitest run test/providers/paypal/
```

Run the broader test suite with `npx vitest run` if configured. Database integration tests require an isolated/disposable test database. The normal mocked unit tests should not require live PayPal credentials.

A successful test command is evidence for the code paths covered by the tests, not proof that the full PayPal integration has been verified against the Sandbox. If a real Sandbox smoke test has not been run, state that separately.

---

## API endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Basic API health check; returns `{"status":"ok"}` |

The import is developer-invoked CLI functionality; it is not exposed as a public HTTP endpoint.

---

## Project structure

```text
ReconResolve/
├── frontend/                         # React + Vite product landing page
│   ├── index.html                    # HTML shell and SEO metadata
│   ├── vite.config.ts                # Vite, Tailwind, React configuration
│   ├── public/                       # Static assets
│   └── src/
│       ├── App.tsx                   # Root component
│       ├── main.tsx                  # Frontend entry point
│       ├── index.css                 # Tailwind imports and global styles
│       ├── components/
│       │   ├── brand/                # Brand and logo components
│       │   ├── layout/               # Header, footer, container, section
│       │   ├── motion/               # Animation primitives
│       │   └── ui/                   # Reusable presentation components
│       └── features/
│           └── landing/
│               ├── LandingPage.tsx
│               ├── content.ts        # Landing-page copy and constants
│               ├── components/       # Hero preview, backdrop, marquee, stats
│               └── sections/         # Landing-page sections
│
├── backend/                          # Express + Prisma API
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   ├── prisma/
│   │   ├── schema.prisma             # Core domain schema
│   │   ├── seed.ts                   # Idempotent development merchant seed
│   │   └── migrations/               # Version-controlled migration SQL
│   ├── docs/
│   │   └── data-model.md             # Entity docs and integrity invariants
│   ├── test/
│   │   └── providers/paypal/         # Provider client and normalization tests
│   └── src/
│       ├── app.ts                    # Express app configuration
│       ├── server.ts                 # Startup/shutdown lifecycle
│       ├── config.ts                 # Environment validation
│       ├── db/postgres.ts             # Shared Prisma Client module
│       ├── generated/prisma/         # Generated client (per generator config)
│       ├── routes/health.ts           # GET /health
│       ├── domain/transaction.ts     # Canonical transaction types
│       ├── providers/paypal/         # PayPal client, token, schemas, normalizer
│       ├── repositories/             # Persistence boundary
│       ├── services/paypal-import/   # Import orchestration and identity logic
│       └── cli/paypal-sync.ts        # Bounded Sandbox import CLI, if present
│
└── README.md
```

Paths can differ if the implementation has evolved; the actual source tree and package scripts are authoritative.

---

## Current scope and what remains

### Implemented in the current development scope

- React landing page and reusable presentation components.
- Express server and `GET /health`.
- PostgreSQL data model, Prisma migrations, and development merchant seed.
- PayPal Sandbox OAuth and transaction-search client.
- Response validation, pagination handling, transaction normalization, and exact money conversion.
- Provider-record key derivation and a persistence path intended to support idempotent imports.
- Merchant/provider-connection resolution and sanitized import errors.
- CLI-driven bounded import, if the configured CLI and npm script are present and verified.

### Not implemented yet

- ❌ PayPal webhook ingestion and signature verification.
- ❌ Reconciliation/matching execution and automatic exception creation.
- ❌ AI investigator and evidence-cited explanations.
- ❌ Authentication and authorization.
- ❌ Redis, BullMQ, outbox dispatch, and background workers.
- ❌ Operational dashboard/application UI beyond the landing page.
- ❌ Public CRUD or sync APIs.
- ❌ Scheduled or continuous synchronization.

The landing page presents the intended product direction. The features above should be described as implemented only after their code, tests, and operational behavior have been verified.
