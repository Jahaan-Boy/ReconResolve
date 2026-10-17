# ReconResolve
Minimal Fastify 5 + TypeScript API with a PostgreSQL connection — Day 1 foundation.
---
## Prerequisites
| Requirement | Version |
|---|---|
| Node.js | 20 or newer |
| npm | 9 or newer (bundled with Node 20) |
| PostgreSQL | Any recent version (15+ recommended), running locally or remotely |
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
Example for a local default Postgres installation:
```
DATABASE_URL=postgresql://postgres:secret@localhost:5432/reconresolve_dev
```
> **Note:** The database must exist before you start the server.  
> Create it with `createdb reconresolve_dev` or your preferred tool.
---
## Running the server
### Development (live reload via tsx)
```bash
npm run dev
```
The server starts on `http://0.0.0.0:3000` by default (configurable via `HOST` and `PORT` in `.env`).
> PostgreSQL must be running **before** you execute this command.  
> The server will refuse to start if the `DATABASE_URL` is unreachable.
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
### Compile TypeScript
```bash
npm run build
```
Output is written to `dist/`.
### Start the compiled server
```bash
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
## Project structure
```
src/
├── app.ts          # Fastify app factory (buildApp)
├── server.ts       # Entry point — connects DB then starts listener
├── config.ts       # Environment validation
├── db/
│   └── postgres.ts # pg connection pool, connectDB(), closeDB()
└── routes/
    └── health.ts   # GET /health
```