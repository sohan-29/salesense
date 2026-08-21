# ShopSense

A **multi-vendor e-commerce analytics platform** — a marketplace backend
with a full analytics core (revenue analysis, vendor benchmarking, demand
forecasting, customer segmentation) and an ML recommender, wrapped in a
role-aware React dashboard.

```
browser ─▶ React + Vite ── /api ▶ Express + Mongoose ──▶ MongoDB Atlas
                                        ▲
                                        │ train + write-back
                              Python ML recommender (SVD / cosine)
```

## Stack

| Layer    | Technology                                                         |
|----------|--------------------------------------------------------------------|
| Frontend | React 19, Vite 8, TailwindCSS 4, recharts 3, react-router-dom 7    |
| Backend  | Node 20, Express 4, Mongoose 8 (ESM), JWT auth, zod validation     |
| Database | MongoDB Atlas                                                      |
| ML       | Python 3.11, scikit-learn (TruncatedSVD, cosine CF), MLflow         |
| Tests    | Jest 29 + mongodb-memory-server (in-memory repl-set), Locust       |
| Infra    | Docker + nginx, GitHub Actions CI                                  |

## Features

- **Multi-vendor commerce** — vendors manage their own products/inventory;
  customers browse, cart, wishlist, and checkout (atomic multi-doc
  transactions across vendors).
- **Role-based access** — customer / vendor / admin, gated on every route.
- **Analytics core** — revenue (commission/margin/growth), timeseries,
  vendor composite benchmarking (`0.5·revenue + 0.3·fulfilment + 0.2·growth`).
- **Executive BI dashboard** — consolidated KPIs, trends, top vendors &
  products, marketplace benchmark, PDF export.
- **Demand forecasting** — moving-average per-product inventory forecast
  with confidence scoring + low-stock alerts.
- **Customer segmentation** — RFM-style segments (frequent / dormant /
  at-risk / new / occasional).
- **ML recommender** — SVD + cosine collaborative filtering with a popular
  fallback, trained offline and written back to Mongo for live serving.
- **Backtesting** — `/api/analytics/validate` scores forecast accuracy,
  segmentation quality, and recommendation relevance against held-out data.

## Quick start

### 1. Backend
```bash
cd backend
cp .env.example .env            # fill in MONGO_URI + JWT_SECRET
npm install
npm run seed                    # demo data (--reset to drop first)
npm run dev                     # http://localhost:5000
```

### 2. Frontend
```bash
cd frontend
npm install
npm run dev                     # http://localhost:5173
```

### 3. ML recommender (optional)
```bash
cd ml
pip install -r requirements.txt
python -m recommender.cli train
```

### Docker (one command)
```bash
cd backend && cp .env.example .env   # set MONGO_URI
cd .. && docker compose up --build   # frontend :8080, backend :5000
```

## Testing

```bash
# Backend — 145 tests, in-memory Mongo, no external services
cd backend && npm test
cd backend && npm run test:coverage

# Frontend
cd frontend && npm run lint && npm run build

# Performance (Locust, against a running backend)
cd backend/tests/perf && locust -f locustfile.py --host http://localhost:5000
```

CI (`.github/workflows/ci.yml`) runs all of the above on every push/PR.

## Documentation

- **[API reference](docs/API.md)** — every endpoint, with params and roles
- **[Architecture](docs/ARCHITECTURE.md)** — system layout, data model, middleware
- **[Deployment](docs/DEPLOYMENT.md)** — local, Docker, CI/CD, production checklist
- **[Analytics & ML models](docs/ANALYTICS_MODELS.md)** — the four analytical pillars + backtesting

## Project structure

```
shopsense/
├── backend/          Express API + Mongoose models + Jest tests
│   ├── src/{controllers,models,routes,middleware,utils,config}
│   └── tests/        unit, integration, regression, perf/
├── frontend/         React app (Vite) + nginx config
│   └── src/{pages,components,api,context}
├── ml/               standalone Python recommender package
│   └── recommender/{models,cli,backtest,writeback,mlflow_pipeline}
├── docs/             API, architecture, deployment, analytics models
├── .github/workflows/  ci.yml, docker-publish.yml
└── docker-compose.yml
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

