# ── Backend image ──────────────────────────────────────────────────────
# Node/Express API + Jest test runtime. Production image is lean: only the
# files under src/ and package.json are copied in (no tests, no coverage).
# ───────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app

# Install production + dev deps first (devDeps needed for the build stage is
# none here — backend ships raw ESM — so we go straight to prod-only).
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# Application source.
COPY src ./src

ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000

# Non-root user for runtime.
USER node

CMD ["node", "src/server.js"]
