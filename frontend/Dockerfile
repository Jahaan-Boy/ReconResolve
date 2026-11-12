# syntax=docker/dockerfile:1

# ==============================================================================
# Stage 1: Build React/Vite application
# ==============================================================================
FROM node:20-alpine AS builder
WORKDIR /app

# Accept API URL build argument to embed at build time into Vite bundle
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

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

# Copy dynamic startup script into official nginx entrypoint directory
COPY docker-entrypoint.sh /docker-entrypoint.d/40-render-config.sh
RUN chmod +x /docker-entrypoint.d/40-render-config.sh

# Provide fallback static configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Render injects PORT (default 80 if not set)
ENV PORT=80
EXPOSE 80

# Healthcheck probe verifying Nginx responds on configured PORT
HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider "http://127.0.0.1:${PORT:-80}/" || exit 1

# Start Nginx in foreground using standard official entrypoint
CMD ["nginx", "-g", "daemon off;"]
