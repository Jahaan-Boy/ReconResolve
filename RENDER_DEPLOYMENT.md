# ReconResolve — Render Production Deployment Guide (Docker)

> Comprehensive architectural runbook for deploying ReconResolve to [Render](https://render.com) using Docker, managed PostgreSQL, managed Redis (Key Value), background workers, and Nginx.

---

## 1. Required Render Services & Architecture Overview

ReconResolve decomposes cleanly into five cloud components on Render:

| Component | Render Service Type | Plan / Tier | Source Directory | Dockerfile |
|:---|:---|:---|:---|:---|
| **Managed Database** | PostgreSQL (`reconresolve-db`) | Starter ($7/mo)* | N/A (Managed) | N/A (Managed PostgreSQL 16) |
| **Cache Store** | Key Value (`reconresolve-redis`) | Starter ($7/mo) or Free | N/A (Managed) | N/A (Managed Redis 7) |
| **Backend API** | Web Service (`reconresolve-backend`) | Starter ($7/mo) or Free | `backend/` | `backend/Dockerfile` |
| **Outbox Worker** | Background Worker (`reconresolve-worker`) | Starter ($7/mo)** | `backend/` | `backend/Dockerfile` |
| **Frontend UI** | Web Service (`reconresolve-frontend`) | Starter ($7/mo) or Free | `frontend/` | `frontend/Dockerfile` |

> [!IMPORTANT]
> **\* PostgreSQL Retention:** Render's free PostgreSQL tier automatically expires and wipes data after 30 days. For production stability, use a `starter` ($7/mo) instance.  
> **\*\* Background Worker Pricing:** Render **does not offer a free tier for Background Workers** (`type: worker`). Running the outbox daemon on Render requires a paid plan (`starter` $7/mo minimum).
> **Graceful Redis Fallback:** If Render Key Value is not provisioned or degraded, ReconResolve automatically and safely falls back to its thread-safe in-memory cache store without interrupting database reads or transaction reconciliation.

```text
                                  RENDER TOPOLOGY
                                  
   Client Browser                                    PayPal Sandbox & Webhooks
         │                                                      │
         │ HTTPS                                                │ HTTPS
         ▼                                                      ▼
┌───────────────────────────────┐               ┌───────────────────────────────┐
│ reconresolve-frontend         │               │ reconresolve-backend          │
│ (Docker Web Service)          │               │ (Docker Web Service)          │
│ Nginx 1.27 + Built Vite SPA   │               │ Express 4.19 + Node.js 20 LTS │
│ Listening on $PORT (10000)    │               │ Listening on $PORT (10000)    │
└──────────────┬────────────────┘               └───────┬───────────────┬───────┘
               │                                        │               │
               │ REST API / CORS / Credentials          │               │
               └────────────────────────────────────────┘               │
                                                                        │
┌───────────────────────────────┐                                       │
│ reconresolve-worker           │                                       │
│ (Docker Background Worker)    │                                       │
│ Standalone Outbox Daemon      ├───────────────────────────────────────┤
│ `npm run outbox:worker`       │                                       │
└──────────────┬────────────────┘                                       │
               │                                                        │
               ▼                                                        ▼
┌───────────────────────────────┐               ┌───────────────────────────────┐
│ reconresolve-db               │               │ reconresolve-redis            │
│ (Render Managed PostgreSQL)   │               │ (Render Managed Key Value)    │
│ Port 5432 / Private Network   │               │ Port 6379 / Private Network   │
└───────────────────────────────┘               └───────────────────────────────┘
```

---

## 2. Dockerfile Mapping

Both the Backend API and the Outbox Worker build from the **same backend Docker image**, but execute distinct entrypoint commands:

1. **Backend Web Service (`reconresolve-backend`):**
   - **Dockerfile:** `backend/Dockerfile`
   - **Build Context:** `backend/`
   - **Execution Command:** `npm start` (runs `node dist/server.js`)
   - **Pre-Deploy Command:** `npm run db:migrate` (executes `prisma migrate deploy`)

2. **Outbox Background Worker (`reconresolve-worker`):**
   - **Dockerfile:** `backend/Dockerfile`
   - **Build Context:** `backend/`
   - **Execution Command (`dockerCommand`):** `npm run outbox:worker` (runs `node dist/workers/run-worker.js`)
   - **Pre-Deploy Command:** None

3. **Frontend Web Service (`reconresolve-frontend`):**
   - **Dockerfile:** `frontend/Dockerfile`
   - **Build Context:** `frontend/`
   - **Execution Command:** Standard Nginx foreground (`nginx -g "daemon off;"`)
   - **Build Argument (`VITE_API_URL`):** Injected dynamically at build time pointing to `reconresolve-backend`.

---

## 3. Deployment Configuration (Render Blueprint or Manual)

### Option A: Automated Infrastructure as Code via `render.yaml`

A production-ready `render.yaml` Blueprint is located at the root of the repository:

1. Navigate to [Render Blueprints](https://dashboard.render.com/blueprints).
2. Connect your Git repository containing ReconResolve.
3. Render reads `render.yaml` and prepares all 5 resources.
4. Input the requested sensitive environment variables (`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `GEMINI_API_KEY`).
5. Click **Apply**.

### Option B: Manual Service Creation Runbook

If you prefer configuring resources individually via the Render Web Dashboard:

#### 1. Create Managed PostgreSQL (`reconresolve-db`)
- **Name:** `reconresolve-db`
- **Database:** `reconresolve`
- **User:** `reconresolve_user`
- **Region:** `Oregon (US West)` (ensure all services share the same region to minimize latency)
- **Plan:** `Starter` ($7/mo)

#### 2. Create Managed Key Value (`reconresolve-redis`)
- **Name:** `reconresolve-redis`
- **Region:** Same region as database
- **Plan:** `Starter` or `Free`
- **Maxmemory Policy:** `allkeys-lru`

#### 3. Create Backend Web Service (`reconresolve-backend`)
- **Type:** Web Service
- **Runtime:** `Docker`
- **Root Directory / Docker Context:** `backend`
- **Dockerfile Path:** `backend/Dockerfile`
- **Health Check Path:** `/health`
- **Pre-Deploy Command:** `npm run db:migrate`
- **Environment Variables:** See Section 4.

#### 4. Create Outbox Background Worker (`reconresolve-worker`)
- **Type:** Background Worker
- **Runtime:** `Docker`
- **Root Directory / Docker Context:** `backend`
- **Dockerfile Path:** `backend/Dockerfile`
- **Docker Command:** `npm run outbox:worker`
- **Environment Variables:** See Section 4.

#### 5. Create Frontend Web Service (`reconresolve-frontend`)
- **Type:** Web Service
- **Runtime:** `Docker`
- **Root Directory / Docker Context:** `frontend`
- **Dockerfile Path:** `frontend/Dockerfile`
- **Health Check Path:** `/health`
- **Environment Variables / Build Arguments:**
  - `PORT`: `10000`
  - `VITE_API_URL`: `https://<your-backend-service-subdomain>.onrender.com`

---

## 4. Required Environment Variables

### Backend API (`reconresolve-backend`)

| Variable | Description | Source / Example Value |
|:---|:---|:---|
| `NODE_ENV` | Runtime environment | `production` |
| `HOST` | Bind address | `0.0.0.0` |
| `PORT` | Listening port (injected by Render) | `10000` |
| `DATABASE_URL` | PostgreSQL connection string | Connected via Render DB `connectionString` |
| `REDIS_URL` | Redis connection string | Connected via Render Key Value `connectionString` |
| `CORS_ALLOWED_ORIGIN` | Authorized Frontend Origin | `https://<frontend-subdomain>.onrender.com` |
| `COOKIE_SAME_SITE` | Cookie cross-site policy | `none` (Required for cross-subdomain `.onrender.com` HTTPS) |
| `SESSION_TTL_HOURS` | Session expiry | `168` (7 days) |
| `ALLOW_TEST_FAKE_AI` | Safe AI fallback toggle | `true` |
| `GEMINI_API_KEY` | Google Gemini API Key | From [Google AI Studio](https://aistudio.google.com/) |
| `GEMINI_MODEL_ID` | Gemini model identifier | `gemini-2.5-flash` |
| `PAYPAL_CLIENT_ID` | PayPal Sandbox Client ID | From [PayPal Developer Dashboard](https://developer.paypal.com/) |
| `PAYPAL_CLIENT_SECRET` | PayPal Sandbox Secret | From PayPal Developer Dashboard |

### Outbox Background Worker (`reconresolve-worker`)

| Variable | Description | Source / Example Value |
|:---|:---|:---|
| `NODE_ENV` | Runtime environment | `production` |
| `DATABASE_URL` | Shared PostgreSQL connection | Same as Backend API (`connectionString`) |
| `REDIS_URL` | Shared Redis connection | Same as Backend API (`connectionString`) |
| `OUTBOX_POLL_INTERVAL_MS` | Polling frequency | `1000` |
| `OUTBOX_BATCH_SIZE` | Records per batch | `20` |
| `OUTBOX_LEASE_DURATION_MS` | Concurrency lock lease | `30000` |
| `OUTBOX_CONCURRENCY` | Parallel event handlers | `5` |
| `OUTBOX_MAX_ATTEMPTS` | Retries before FAILED | `5` |
| `ALLOW_TEST_FAKE_AI` | Safe AI fallback | `true` |
| `GEMINI_API_KEY` | Gemini API Key | Shared with Backend API |
| `PAYPAL_CLIENT_ID` | PayPal Sandbox Client ID | Shared with Backend API |
| `PAYPAL_CLIENT_SECRET` | PayPal Sandbox Secret | Shared with Backend API |

### Frontend (`reconresolve-frontend`)

| Variable | Description | Source / Example Value |
|:---|:---|:---|
| `PORT` | Web server listening port | `10000` |
| `VITE_API_URL` | Embedded Backend Base URL | `https://<backend-subdomain>.onrender.com` |
| `BACKEND_URL` | *(Optional)* Reverse proxy target | Leave empty on Render (uses direct `VITE_API_URL`) |

---

## 5. Database Migrations & One-Time Seeding

### Migrations (Automatic via Pre-Deploy)
In Render, migrations are configured as a **Pre-Deploy Command** on `reconresolve-backend`:
```bash
npm run db:migrate
```
- Executes `prisma migrate deploy` from `/app`.
- Runs automatically before traffic is swapped to the new container revision.
- If a migration fails, the deployment is aborted safely and the previous release remains live.

### One-Time Seeding (Manual Operation)
Database seeding seeds demo merchants, system operators, role memberships, and initial exception datasets. **Never run seeding automatically on every deployment.**

To run the one-time seed after initial deployment:

1. Open the Render Dashboard.
2. Navigate to `reconresolve-backend`.
3. Open the **Shell** tab (or connect via SSH).
4. Run:
```bash
npm run db:seed
```

> [!NOTE]
> **Idempotency Verified:** The seed script uses `prisma.merchant.upsert`, `prisma.user.upsert`, `prisma.merchantMembership.upsert`, and cleans demo exception tables before re-inserting fixtures. Re-running `npm run db:seed` will not create duplicate accounts or invalid relational states.

---

## 6. Frontend API URL Configuration & Build Embedding

Vite environment variables (`VITE_*`) are statically analyzed and **baked into the JavaScript bundle at build time**. They cannot be modified at runtime by injecting OS environment variables into the running Nginx container.

1. **How Render Handles Build Args:** Render automatically translates environment variables defined on a Docker service into `--build-arg` parameters during `docker build`.
2. **Dockerfile Support:** `frontend/Dockerfile` declares `ARG VITE_API_URL=""` and `ENV VITE_API_URL=$VITE_API_URL`, which Vite consumes during `npm run build`.
3. **If You Change Backend URL:** If your backend URL changes (e.g., adding a custom domain), trigger a **Manual Deploy > Clear build cache & deploy** on the frontend service so Vite recompiles the bundle with the new URL.

---

## 7. CORS and Cross-Domain Cookie Configuration

Because Render assigns separate subdomains under `.onrender.com` (which is registered on the [Public Suffix List](https://publicsuffix.org/)):

1. `https://reconresolve-frontend.onrender.com` and `https://reconresolve-backend.onrender.com` are treated by modern browsers as **different sites (cross-site)**.
2. Standard `SameSite=Lax` cookies will **not** be included on cross-site `fetch()` calls.
3. **Production Solution:**
   - Backend `COOKIE_SAME_SITE` must be set to `none`.
   - Cookies are marked `Secure: true` and `HttpOnly: true`.
   - Frontend API client uses `credentials: 'include'` on all HTTP requests.
   - Backend Express sets `Access-Control-Allow-Origin: <frontend_origin>` and `Access-Control-Allow-Credentials: true`.

---

## 8. PayPal Sandbox Webhook Configuration

PayPal webhooks must be routed to the live backend URL:

1. Log in to the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/applications/sandbox).
2. Under your Sandbox App, click **Add Webhook**.
3. Set the **Webhook URL** to:
   ```text
   https://<your-backend-subdomain>.onrender.com/api/webhooks/paypal
   ```
4. Subscribe to the relevant events:
   - `PAYMENT.CAPTURE.COMPLETED`
   - `PAYMENT.CAPTURE.DENIED`
   - `CHECKOUT.ORDER.APPROVED`
5. Note the generated `Webhook ID` and configure it in the application or seed connection.

---

## 9. Recommended Deployment Order

When deploying manually without a Blueprint, follow this sequence:

1. **Provision Managed PostgreSQL (`reconresolve-db`)** — Wait until status is `Available`.
2. **Provision Managed Key Value (`reconresolve-redis`)** — Wait until status is `Available`.
3. **Deploy Backend API (`reconresolve-backend`)** — Link database and Redis connection strings. Allow the pre-deploy migration to run.
4. **Deploy Outbox Background Worker (`reconresolve-worker`)** — Link database and Redis connection strings.
5. **Run One-Time Database Seed** — Via the Backend Web Service shell (`npm run db:seed`).
6. **Deploy Frontend Web Service (`reconresolve-frontend`)** — Set `VITE_API_URL` to the public URL of `reconresolve-backend`.
7. **Configure PayPal Webhook** — Register backend webhook URL in PayPal Developer Sandbox.

---

## 10. Post-Deployment Verification Checklist

- [ ] **Backend Health Probe:** Visit `https://<backend-subdomain>.onrender.com/health` $\rightarrow$ Expect `{"status":"ok","uptimeSeconds":...}`.
- [ ] **Readiness Probe:** Visit `https://<backend-subdomain>.onrender.com/health/ready` $\rightarrow$ Expect `{"status":"ready","database":"connected","cache":{...}}`.
- [ ] **Frontend Loading:** Visit `https://<frontend-subdomain>.onrender.com` $\rightarrow$ Expect landing page and login modal.
- [ ] **SPA Route Refresh:** Navigate to an inner route and refresh the browser $\rightarrow$ Confirm Nginx serves `index.html` without 404.
- [ ] **Operator Authentication:** Log in using pre-seeded persona:
  - Email: `admin@reconresolve.com`
  - Password: `Password123!`
  - Verify HttpOnly session cookie is saved and user dashboard loads.
- [ ] **Outbox Worker Logs:** Inspect `reconresolve-worker` logs in Render $\rightarrow$ Confirm worker claims batches with `workerId` active without unhandled errors.
- [ ] **Reconciliation Run:** Trigger a reconciliation run from the Operator Console $\rightarrow$ Verify matches and exceptions populate the grid.
- [ ] **Webhook Ingress Test:** Send test payload to `/api/webhooks/paypal` $\rightarrow$ Expect signature validation and outbox entry insertion.

---

## 11. Common Deployment Errors & Troubleshooting

### 1. `Missing required environment variable: HOST` or `PORT`
* **Cause:** The background worker does not have a web port, or Render injects `$PORT` without `$HOST`.
* **Resolution:** Resolved in `backend/src/config.ts`. `HOST` defaults to `0.0.0.0` and `PORT` defaults safely to `3000` when not provided.

### 2. `P1001: Can't reach database server`
* **Cause:** Incorrect `DATABASE_URL` or Render PostgreSQL instance still spinning up.
* **Resolution:** Ensure the database is `Available` and check that `fromDatabase: name: reconresolve-db, property: connectionString` is linked properly.

### 3. `host not found in upstream "api"` in Frontend Nginx
* **Cause:** Nginx trying to resolve Docker Compose hostname `api:3000` in cloud production.
* **Resolution:** Resolved in `frontend/docker-entrypoint.sh`. When `BACKEND_URL` is omitted, Nginx runs in standalone SPA mode without attempting upstream proxy resolution.

### 4. 401 Unauthorized / Cookies Not Stored After Login
* **Cause:** Cross-domain cookies blocked because `SameSite=Lax` was used across different subdomains.
* **Resolution:** Set `COOKIE_SAME_SITE=none` on `reconresolve-backend`.

### 5. Frontend API Calls Still Point to `localhost`
* **Cause:** Vite environment variables were not supplied during Docker image build.
* **Resolution:** In Render, set `VITE_API_URL` on the frontend service, then click **Manual Deploy > Clear build cache & deploy**.

---

## 12. Local Docker Commands for Testing

Test the production Docker builds locally before pushing to Git:

### Build Backend Production Image
```bash
docker build -t reconresolve-backend:prod ./backend
```

### Build Frontend Production Image (With Build Argument)
```bash
docker build \
  --build-arg VITE_API_URL="http://localhost:3000" \
  -t reconresolve-frontend:prod \
  ./frontend
```

### Run Standalone Backend API Container
```bash
docker run --rm -it \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e DATABASE_URL="postgresql://postgres:postgres@host.docker.internal:5432/reconresolve" \
  -e CORS_ALLOWED_ORIGIN="*" \
  reconresolve-backend:prod
```

### Run Standalone Outbox Worker Container
```bash
docker run --rm -it \
  -e NODE_ENV=production \
  -e DATABASE_URL="postgresql://postgres:postgres@host.docker.internal:5432/reconresolve" \
  reconresolve-backend:prod npm run outbox:worker
```

### Run Full Multi-Service Stack (Local Development)
```bash
docker compose up --build
```
