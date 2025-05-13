# ─── STAGE 1: Build with Bun & Vite ───────────────────────────────────────────
FROM oven/bun:latest AS builder
WORKDIR /app

# 1. Copy manifest & lockfile
COPY package.json bun.lock index.html ./

# 2. Copy Vite/TS config
COPY vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json ./

# 3. Copy source & public assets
COPY public/ ./public
COPY src/    ./src

# 4. Install dependencies
RUN bun install

# 5. Build only the Vite assets
RUN bun x vite build


# ─── STAGE 2: Serve with Nginx on port 8080 ───────────────────────────────────
FROM --platform=linux/amd64 nginx:stable-alpine

# 1. Remove default content
RUN rm -rf /usr/share/nginx/html/*

# 2. Copy built SPA into place
COPY --from=builder /app/dist /usr/share/nginx/html

# 3. Drop in your custom nginx.conf (must listen 8080)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 4. Expose the port Cloud Run will hit
EXPOSE 8080

# 5. Launch nginx
CMD ["nginx", "-g", "daemon off;"]
