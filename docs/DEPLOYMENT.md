# ShopSense — Deployment Guide

Three ways to run ShopSense: local dev (no containers), Docker Compose
(recommended for staging/production-like), and a manual split deploy.

---

## 1. Prerequisites

- **Node.js 20+**, **npm 10+**
- **Python 3.11+** (only if you want the ML recommender)
- A **MongoDB** database — the project targets **MongoDB Atlas**. Get a free
  M0 cluster at mongodb.com and grab the connection string.

---

## 2. Local development (no Docker)

### Backend
```bash
cd backend
cp .env.example .env          # fill in MONGO_URI, JWT_SECRET, etc.
npm install
npm run seed                  # optional: load demo data (--reset to drop first)
npm run dev                   # http://localhost:5000
```

### Frontend
```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173  (proxies /api → :5000)
```

### ML recommender (optional)
```bash
cd ml
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m recommender.cli train                     # train + write back to Atlas
npm --prefix ../backend run ml:refresh              # or trigger via the app
```

### Demo logins (after `npm run seed`)
| Role     | Email                  | Password     |
|----------|------------------------|--------------|
| Admin    | (see seed output)      | (see seed)   |
| Vendor   | (see seed output)      | (see seed)   |
| Customer | (see seed output)      | (see seed)   |

> Run `npm run seed` and check the console — it prints the seeded credentials.

---

## 3. Docker Compose (recommended)

Brings up the backend + frontend together. **MongoDB is external** (Atlas)
— set `MONGO_URI` in `backend/.env`.

```bash
cd backend && cp .env.example .env   # then edit MONGO_URI, JWT_SECRET
cd ..
docker compose up --build
```

- Frontend: **http://localhost:8080**
- Backend:  **http://localhost:5000**
- nginx proxies `/api/*` → `backend:5000`, so the browser sees one origin.

To stop: `docker compose down` (add `-v` to also drop volumes — none are
app-owned here).

---

## 4. Configuration reference (`backend/.env`)

| Var              | Required | Default                          | Notes                                   |
|------------------|----------|----------------------------------|-----------------------------------------|
| `PORT`           | no       | `5000`                           |                                         |
| `NODE_ENV`       | no       | `development`                    | Set `production` in prod                |
| `MONGO_URI`      | **yes**  | `mongodb://127.0.0.1:27017/...`  | Atlas SRV string in prod                |
| `JWT_SECRET`     | **yes**  | `dev_secret_change_me`           | Long random string; app warns if default|
| `JWT_EXPIRES_IN` | no       | `7d`                             |                                         |
| `CLIENT_URL`     | no       | `http://localhost:5173`          | CORS origin; `http://localhost:8080` in compose |

> Never commit `.env`. The repo `.gitignore` excludes it and keeps only
> `.env.example`.

---

## 5. CI/CD

Two GitHub Actions workflows (`.github/workflows/`):

### `ci.yml` — runs on every push/PR to `main`
- **backend** job: `npm ci` → `npm run test:coverage` → uploads `coverage/`.
  No external Mongo needed — tests use `mongodb-memory-server`.
- **frontend** job: `npm ci` → `npm run lint` → `npm run build` → uploads
  `dist/`.
- **ml-smoke** job: `pip install -r requirements.txt` → import check.

### `docker-publish.yml` — manual (`workflow_dispatch`)
Builds the backend and frontend images to verify the Dockerfiles produce
runnable images. **Does not push to any registry.** Use the optional `tag`
input to label the images (defaults to the commit SHA).

To push to a registry later, add a registry login step and change
`load: true` → `push: true` with `tags: ghcr.io/<org>/shopsense-*:latest`.

---

## 6. Production checklist

- [ ] `NODE_ENV=production`
- [ ] `JWT_SECRET` set to a strong random value (not the default)
- [ ] `MONGO_URI` points to the Atlas prod cluster (IP-allowlisted)
- [ ] `CLIENT_URL` set to the real frontend origin
- [ ] MongoDB Atlas user has least-privilege (readWrite on `shopsense` DB only)
- [ ] HTTPS termination in front of nginx (a load balancer / reverse proxy)
- [ ] Rate limiting is on (default 1000 req / 15 min / IP — tune for traffic)
- [ ] ML model trained and `MLRecommendation` collection populated
- [ ] Regular backup of the Atlas cluster configured
- [ ] CI passing on the release commit

---

## 7. Performance testing (Locust)

See [backend/tests/perf/README.md](backend/tests/perf/README.md) for full
details. Quick start:

```bash
cd backend/tests/perf
pip install locust
# either provide a token:
export LOCUST_TOKEN="<admin JWT>"
# or let the locustfile bootstrap a throwaway admin (loadtest-admin@shopsense.dev)
locust -f locustfile.py --host http://localhost:5000
# headless:
locust -f locustfile.py --host http://localhost:5000 \
  --headless -u 50 -r 5 --run-time 2m --csv=results
```

Tasks cover the read-heavy analytics paths (summary, revenue-analysis,
benchmark, chart) and the catalog/product browse paths.
