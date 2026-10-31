# syntax=docker/dockerfile:1

# ==============================================================================
# Stage 1: Base runtime environment
# ==============================================================================
FROM node:20-slim AS base
WORKDIR /app

# Install required system packages:
# - openssl & ca-certificates: required by Prisma Client engine
# - curl: required for Docker container healthcheck probes
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    curl \
  && rm -rf /var/lib/apt/lists/*

# ==============================================================================
# Stage 2: Install dependencies
# ==============================================================================
FROM base AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma/

# Install all dependencies (including devDependencies required for build, generate, & seed)
RUN npm ci

# ==============================================================================
# Stage 3: Build application & generate Prisma client
# ==============================================================================
FROM deps AS builder
WORKDIR /app

COPY tsconfig.json ./
COPY src ./src/

# 1. Generate Prisma Client into src/generated/prisma
RUN npx prisma generate

# 2. Compile TypeScript source to dist/
RUN npm run build

# 3. Copy generated Prisma client into dist/generated/prisma
# Ensures runtime require("../generated/prisma") in dist/db/postgres.js resolves cleanly
RUN cp -r src/generated dist/generated

# ==============================================================================
# Stage 4: Production Runner
# ==============================================================================
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=development
ENV ALLOW_TEST_FAKE_AI=true

# Copy application code and node_modules from builder
COPY --chown=node:node --from=builder /app/package.json ./package.json
COPY --chown=node:node --from=builder /app/package-lock.json ./package-lock.json
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/prisma ./prisma
COPY --chown=node:node --from=builder /app/src ./src

# Run as non-root user
USER node

# Expose default HTTP port
EXPOSE 3000

# Container healthcheck targeting Express /health endpoint via IPv4 loopback
HEALTHCHECK --interval=10s --timeout=5s --retries=5 --start-period=20s \
  CMD curl -f http://127.0.0.1:3000/health || exit 1

# Default command launches the Express API server
CMD ["node", "dist/server.js"]

