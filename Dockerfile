# ============================================
# Flash Sale Platform - Multi-stage Dockerfile
# Week 5 Day 6: DevOps & Containerization
# ============================================

# ---- Base Stage ----
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

# ---- Dependencies Stage ----
FROM base AS deps
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Install all dependencies (including devDependencies for build)
RUN npm ci --legacy-peer-deps

# ---- Backend Build Stage ----
FROM base AS backend-builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/backend/node_modules ./backend/node_modules
COPY package*.json ./
COPY backend ./backend
COPY tsconfig.json ./

# Build backend
WORKDIR /app/backend
RUN npm run build

# ---- Frontend Build Stage ----
FROM base AS frontend-builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/frontend/node_modules ./frontend/node_modules
COPY package*.json ./
COPY frontend ./frontend

# Build frontend
WORKDIR /app/frontend
RUN npm run build

# ---- Production Backend Image ----
FROM node:20-alpine AS backend-production
WORKDIR /app

# Security: Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 flashsale

# Copy package files
COPY package*.json ./
COPY backend/package*.json ./backend/

# Install production dependencies only
RUN npm ci --only=production --legacy-peer-deps --workspaces --workspace=backend

# Copy built backend
COPY --from=backend-builder /app/backend/dist ./backend/dist
COPY --from=backend-builder /app/backend/src/redis/lua ./backend/dist/redis/lua

# Security: Set ownership
RUN chown -R flashsale:nodejs /app
USER flashsale

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Environment
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "backend/dist/app.js"]

# ---- Production Frontend Image (Nginx) ----
FROM nginx:alpine AS frontend-production

# Copy custom nginx config
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/default.conf /etc/nginx/conf.d/default.conf

# Copy built frontend
COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html

# Security: Remove default nginx files
RUN rm -rf /usr/share/nginx/html/50x.html

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:80 || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

# ---- Development Image ----
FROM base AS development
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/backend/node_modules ./backend/node_modules
COPY --from=deps /app/frontend/node_modules ./frontend/node_modules
COPY . .

ENV NODE_ENV=development

# Expose both backend and frontend ports
EXPOSE 3000 5173

CMD ["npm", "run", "dev"]
