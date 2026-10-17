# ReconResolve
Express + TypeScript + Prisma API with PostgreSQL — Day 2 foundation.
---
## Prerequisites
| Requirement | Version |
|---|---|
| Node.js | 20 or newer (required by Prisma 6) |
| npm | 9 or newer (bundled with Node 20) |
| PostgreSQL | 14 or newer, running locally or remotely |
---
## Setup
### 1. Install dependencies
```bash
npm install
```
### 2. Create your local environment file
```bash
cp .env.example .env
```
### 3. Configure the database connection
Open `.env` and set `DATABASE_URL` to a valid PostgreSQL connection string:
```
DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<database>
```
Example for a local installation:
```
DATABASE_URL=postgresql://postgres:secret@localhost:5432/reconresolve_dev
```
> **Note:** The database must already exist before running migrations.  
> Create it with `createdb reconresolve_dev` or your preferred tool.
---
## Database setup
### Generate Prisma Client
```bash
npm run db:generate
```
### Validate schema (optional pre-flight)
```bash
npm run db:validate
```
### Run migrations (creates all tables, enums, indexes, and check constraints)
```bash
npm run db:migrate
```
> For CI / production deployments use `npm run db:deploy` (applies without prompts).
### Seed development data (creates one demo merchant — idempotent)
```bash
npm run db:seed
```
Running this twice produces exactly one merchant row.
---
## Running the server
### Development (live reload via tsx)
```bash
npm run dev
```
The server starts on `http://0.0.0.0:3000` by default (configurable via `HOST` and `PORT` in `.env`).
> PostgreSQL must be running and migrations must have been applied **before** starting the server.
### Test the health endpoint
```bash
curl http://localhost:3000/health
```
Expected response:
```json
{"status":"ok"}
```
---
## Production build
```bash
npm run build
npm start
```
---
## Environment variables
| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | Yes | `development`, `test`, or `production` |
| `HOST` | Yes | Interface to bind (e.g. `0.0.0.0`) |
| `PORT` | Yes | Port to listen on (e.g. `3000`) |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
See `.env.example` for a template.
---
## NPM scripts reference
| Script | Command | Purpose |
|---|---|---|
| `dev` | `tsx src/server.ts` | Start server with live reload |
| `build` | `tsc` | Compile TypeScript to `dist/` |
| `start` | `node dist/server.js` | Run compiled production server |
| `db:validate` | `prisma validate` | Validate schema without touching DB |
| `db:generate` | `prisma generate` | Regenerate Prisma Client |
| `db:migrate` | `prisma migrate dev` | Create and apply migrations (dev) |
| `db:seed` | `prisma db seed` | Run idempotent development seed |
| `db:deploy` | `prisma migrate deploy` | Apply existing migrations (CI/prod) |
---
## Project structure
```
prisma/
├── schema.prisma          # Core domain schema (enums, models, indexes)
├── seed.ts                # Idempotent demo-merchant seed
└── migrations/
    ├── 20261017155346_core_domain/
    │   └── migration.sql  # Tables, FKs, indexes
    └── 20261017155445_add_check_constraints/
        └── migration.sql  # DB CHECK constraints (window, amounts, source)
src/
├── app.ts                 # Express app factory (buildApp)
├── server.ts              # Entry point — connects DB then starts listener
├── config.ts              # Environment validation
├── db/
│   └── postgres.ts        # Singleton PrismaClient — connectDB(), closeDB(), getDB()
└── routes/
    └── health.ts          # GET /health
docs/
└── data-model.md          # Entity ownership, constraints, money rules, invariants
```
---
## Database connection architecture
Prisma 6 (v6.19.3) is the single data-access path. There is **one PrismaClient instance per process**, managed by `src/db/postgres.ts`.

- `connectDB()` — instantiates the client and verifies connectivity with `SELECT 1`.
- `closeDB()` — disconnects cleanly during graceful shutdown.
- `getDB()` — returns the active client to route/service code.

The bare `pg` driver is no longer used directly; Prisma manages the underlying connection pool.

**Why Prisma 6, not 7?**  
Prisma 7 requires ESM (`"type": "module"`) and a significant tsconfig change. The project uses CommonJS + `tsx` for development — migrating to ESM would be a breaking change unrelated to Day 2 scope. Prisma 6.19.3 is the latest stable release compatible with this configuration.

---
## Data model summary
See [`docs/data-model.md`](docs/data-model.md) for full entity documentation including:
- Tenant isolation rules
- Money representation (BigInt minor units, ISO 4217 currency codes)
- Unique constraints and cross-merchant integrity invariants
- DB check constraints

---
## What is NOT included (Day 2 scope)
This version establishes the schema and persistence foundation only:
- No PayPal API calls or OAuth credentials
- No webhook ingestion or payload processing
- No reconciliation matching logic
- No authentication or authorization
- No Redis, queues, or worker processes
- No frontend UI
- No public CRUD APIs for any entity