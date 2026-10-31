# syntax=docker/dockerfile:1

# ==============================================================================
# Stage 1: Build React/Vite application
# ==============================================================================
FROM node:20-alpine AS builder
WORKDIR /app

# Copy dependency specifications
COPY package.json package-lock.json ./

# Install dependencies cleanly
RUN npm ci

# Copy configuration and source files
COPY tsconfig*.json vite.config.ts eslint.config.js index.html ./
COPY public ./public
COPY src ./src

# Build production assets into dist/
RUN npm run build

# ==============================================================================
# Stage 2: Production Nginx Server
# ==============================================================================
FROM nginx:1.27-alpine AS runner

# Remove default nginx static html files
RUN rm -rf /usr/share/nginx/html/*

# Copy built SPA assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx reverse proxy configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose HTTP port 80
EXPOSE 80

# Healthcheck probe verifying Nginx responds
HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1/ || exit 1

# Start Nginx in foreground
CMD ["nginx", "-g", "daemon off;"]

