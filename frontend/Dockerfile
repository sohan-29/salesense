# ── Frontend image ────────────────────────────────────────────────────
# Multi-stage: build the Vite bundle in a Node image, then serve the static
# dist/ from nginx. nginx also proxies /api to the backend container so the
# browser sees a single origin.
# ───────────────────────────────────────────────────────────────────────

# ── Stage 1: build ──
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: serve ──
FROM nginx:alpine AS serve
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
