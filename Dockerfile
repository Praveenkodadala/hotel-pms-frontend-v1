# ── Frontend Dockerfile ───────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ── Development (hot-reload via Vite) ────────────────────────────
FROM base AS development
COPY . .
# VITE_API_TARGET is injected by docker-compose at runtime
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ── Build stage ──────────────────────────────────────────────────
FROM base AS builder
COPY . .
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

# ── Production (nginx) ───────────────────────────────────────────
FROM nginx:alpine AS production
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx-frontend.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
