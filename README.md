# FlowOps — AI-Assisted Payment Reconciliation

> Reconcile payments, surface mismatches, and resolve them with evidence and a full audit trail.

---

## Overview

FlowOps is a payment reconciliation platform that ingests PayPal webhook events, matches them against merchant orders, and uses an AI investigator to explain discrepancies — without ever moving money on its own.

The project is structured as a **monorepo** with two packages:

| Directory | Stack | Purpose |
|---|---|---|
| `frontend/` | React 19 · Vite 8 · Tailwind CSS 4 · Motion | Product landing page |
| `backend/` | Express 4 · TypeScript · Prisma 6 · PostgreSQL | API server and data model |

---

## Prerequisites

| Requirement | Version |
|---|---|
| Node.js | 20 or newer |
| npm | 9 or newer (bundled with Node 20) |
| PostgreSQL | 14 or newer (local or remote, e.g. Neon) |

---

## Quick Start

### 1. Clone and install

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Configure the backend

```bash
cd backend
cp .env.example .env
```

Edit `.env` and set `DATABASE_URL` to a valid PostgreSQL connection string:

```
DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<database>
```

### 3. Run database migrations and seed

```bash
cd backend
npm run db:generate       # Generate Prisma Client
npm run db:migrate        # Apply all migrations
npm run db:seed           # Seed demo merchant (idempotent)
```

### 4. Start development servers

**Backend** (Express — port 3000):

```bash
cd backend
npm run dev
```

**Frontend** (Vite — port 5173):

```bash
cd frontend
npm run dev
```

---

## Frontend

The frontend is a React 19 + TypeScript landing page built with Vite and styled with Tailwind CSS 4. It uses [Motion](https://motion.dev) for animations and [Lucide](https://lucide.dev) for icons.

### Landing Page Sections

| Section | Description |
|---|---|
| **Hero** | Animated headline, live reconciliation console preview, key stats |
| **Problem** | Three pain points FlowOps solves (duplicates, mismatches, manual investigation) |
| **How It Works** | Four-step pipeline: Ingest → Reconcile → Investigate → Resolve |
| **Features** | Six capability cards (webhooks, processing, matching, AI, exceptions, audit) |
| **Benefits** | Value propositions with spotlight card interactions |
| **Call to Action** | Sign-up prompt with safety guarantees |

### Scripts

| Script | Command | Purpose |
|---|---|---|
| `dev` | `vite` | Start dev server with HMR |
| `build` | `tsc -b && vite build` | Type-check and create production bundle |
| `preview` | `vite preview` | Preview production build locally |
| `lint` | `eslint .` | Run ESLint |

### Key Dependencies

- **React 19** + **React DOM 19**
- **Tailwind CSS 4** via `@tailwindcss/vite`
- **Motion 14** (Framer Motion successor)
- **Lucide React** for icons
- **Inter** (variable) + **Instrument Serif** fonts via `@fontsource`

---

## Backend

The backend is an Express + TypeScript API server with Prisma 6 ORM managing PostgreSQL.

### Architecture

- **Single PrismaClient instance** per process, managed by `src/db/postgres.ts`
- `connectDB()` — instantiates client and verifies connectivity with `SELECT 1`
- `closeDB()` — disconnects cleanly during graceful shutdown
- `getDB()` — returns the active client to route/service layers

### Data Model (6 entities, 9 enums)

| Entity | Table | Purpose |
|---|---|---|
| `Merchant` | `merchants` | Tenant/workspace — owns all data |
| `ProviderConnection` | `provider_connections` | Merchant's link to a payment provider |
| `ProviderTransaction` | `provider_transactions` | Normalized provider-side transaction |
| `MerchantOrder` | `merchant_orders` | Merchant-side order for reconciliation |
| `ReconciliationRun` | `reconciliation_runs` | Time-windowed reconciliation attempt |
| `ReconciliationException` | `reconciliation_exceptions` | Discrepancy record |

Money is stored as **BigInt minor units** with **CHAR(3) ISO 4217** currency codes. See `backend/docs/data-model.md` for full entity docs, constraints, and tenant isolation invariants.

### Scripts

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

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | Yes | `development`, `test`, or `production` |
| `HOST` | Yes | Interface to bind (e.g. `0.0.0.0`) |
| `PORT` | Yes | Port to listen on (e.g. `3000`) |
| `DATABASE_URL` | Yes | PostgreSQL connection string |

### API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check — returns `{"status":"ok"}` |

---

## Project Structure

```
ReconResolve/
├── frontend/                     # React + Vite landing page
│   ├── index.html                # HTML shell with SEO meta tags
│   ├── vite.config.ts            # Vite + Tailwind + React plugin config
│   ├── public/                   # Static assets (favicon)
│   └── src/
│       ├── App.tsx               # Root component (MotionConfig wrapper)
│       ├── main.tsx              # Entry point
│       ├── index.css             # Tailwind imports and global styles
│       ├── components/
│       │   ├── brand/            # Logo component
│       │   ├── layout/           # Header, Footer, Container, Section
│       │   ├── motion/           # Animation primitives (Reveal, Tilt, CountUp, etc.)
│       │   └── ui/               # Badge, ButtonLink, Card, IconTile, SectionHeading
│       └── features/
│           └── landing/
│               ├── LandingPage.tsx
│               ├── content.ts     # All copy, nav links, and data constants
│               ├── components/    # HeroConsole, HeroBackdrop, Marquee, Stats
│               └── sections/      # Hero, Problem, HowItWorks, Features, Benefits, CTA
│
├── backend/                      # Express + Prisma API server
│   ├── .env.example              # Environment template
│   ├── package.json
│   ├── tsconfig.json
│   ├── prisma/
│   │   ├── schema.prisma         # Core domain schema
│   │   ├── seed.ts               # Idempotent demo-merchant seed
│   │   └── migrations/           # Version-controlled migration SQL
│   ├── docs/
│   │   └── data-model.md         # Entity docs, constraints, invariants
│   └── src/
│       ├── app.ts                # Express app factory
│       ├── server.ts             # Entry point (DB connect → HTTP listen)
│       ├── config.ts             # Environment validation
│       ├── db/
│       │   └── postgres.ts       # Singleton PrismaClient module
│       ├── generated/            # Prisma-generated client (gitignored)
│       └── routes/
│           └── health.ts         # GET /health
│
└── README.md                     # ← You are here
```

---

## What Is Not Yet Implemented

This version establishes the landing page and persistence foundation:

- ❌ PayPal API integration / OAuth credentials
- ❌ Webhook ingestion and payload processing
- ❌ Reconciliation matching engine
- ❌ AI investigator
- ❌ Authentication and authorization
- ❌ Redis, BullMQ, or worker processes
- ❌ Dashboard / application UI
- ❌ Public CRUD APIs