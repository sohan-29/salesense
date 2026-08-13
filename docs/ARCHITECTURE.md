# ShopSense — Architecture

ShopSense is a multi-vendor e-commerce platform with an analytics core. It is
deliberately split into three independently-deployable parts that share a
single MongoDB database.

```
            ┌───────────────┐         ┌────────────────────┐
 browser ──▶│  Frontend     │── /api ▶│  Backend (Express) │──▶ MongoDB Atlas
 (React)    │  Vite + nginx │         │  Node + Mongoose   │
            └───────────────┘         └────────────────────┘
                                             ▲
                                             │ reads + writes back recommendations
                                    ┌────────┴───────────┐
                                    │  ML Recommender     │
                                    │  Python (SVD/cosine)│
                                    └─────────────────────┘
```

## 1. Frontend (`/frontend`)

- **React 19 + Vite 8 + TailwindCSS 4**, charts with **recharts 3**,
  routing with **react-router-dom 7**.
- Role-aware shell ([Layout.jsx](frontend/src/components/Layout.jsx)) renders
  a different nav for `customer` / `vendor` / `admin`.
- API layer in [client.js](frontend/src/api/client.js) — one thin wrapper per
  resource, all calls go through a single axios instance with the JWT
  interceptor.
- Auth context ([AuthContext.jsx](frontend/src/context/AuthContext.jsx))
  stores the token in `localStorage` and exposes `{ account, role, login,
  logout }`.
- Protected routes via `<ProtectedRoute roles={[...]}>`.

### Key pages
| Role     | Pages                                                          |
|----------|----------------------------------------------------------------|
| Customer | Catalog, Product detail, Cart, Wishlist, My Transactions, Profile |
| Vendor   | My Products, Sales analytics, Profile                          |
| Admin    | Dashboard, Analytics, **Executive**, Vendors, Customers, Products, Transactions, Validation |

## 2. Backend (`/backend`)

- **Node 20 + Express 4 + Mongoose 8**, ESM (`"type": "module"`).
- Entry: [server.js](backend/src/server.js) connects Mongo then listens;
  [app.js](backend/src/app.js) builds the Express app (kept separate so
  tests import the app without binding a port).
- **Middleware pipeline**: `helmet → cors → compression → express.json →
  request-id → morgan → rate-limit → routes → notFound → errorHandler`.
- **Auth**: JWT in `Authorization: Bearer`. The token's `role` claim selects
  the collection (`customer` → Customer, else Vendor). See
  [auth.js](backend/src/middleware/auth.js). `requireRole(...roles)`
  ([role.js](backend/src/middleware/role.js)) gates by role.
- **Validation**: `zod` schemas + a `runValidation` helper that validates
  `body` / `query` and returns a 400 on mismatch.

### Data model (`/backend/src/models`)
```
Vendor ─┐                         ┌── Cart ── CartItem
        ├── Product ── Inventory  │
Customer┤                  │      ├── Wishlist
        ├── Transaction ───┘      │
        └── MLRecommendation ─────┘  (written back by the ML job)
Category, InventoryForecast
```
- **Transactions** are the analytical source of truth: every order becomes
  one (or more, for multi-vendor carts) Transaction rows with `status`,
  `items[]`, `vendorId`, `customerId`, `total`, `commission`, `margin`.
- Multi-document **MongoDB transactions** guard checkout (atomic stock
  decrement + Transaction creation across products from multiple vendors).

### Analytics core (`/backend/src/controllers`)
- `analyticsController` — revenue/summary/chart/timeseries, the consolidated
  **executive** endpoint, CSV/PDF exports, and **validate** (backtest).
- `benchmarkController` — `computeRevenueAnalysis` (commission, margin,
  growth) and `computeBenchmark` (composite scoring).
- `forecastController` — inventory demand forecasting.
- `segmentationController` — RFM customer segmentation.

## 3. ML Recommender (`/ml`)

A **standalone Python package** (`recommender/`) that reads transactions
directly from Atlas and writes recommendations back into the
`MLRecommendation` collection, which the Node app serves at
`GET /api/recommendations`.

- **Three models**: SVD (matrix factorisation), cosine collaborative
  filtering, and a popularity baseline. SVD/cosine fall back to popular
  when coverage is too low.
- **CLI** ([cli.py](ml/recommender/cli.py)): `train`, `evaluate`,
  `recommend`, `show-models`.
- **MLflow** ([mlflow_pipeline.py](ml/recommender/mlflow_pipeline.py)) tracks
  runs; the Node backend can trigger a refresh via `npm run ml:refresh`
  ([runMLRefresh.js](backend/src/scripts/runMLRefresh.js)).
- Reads `MONGO_URI` from `backend/.env` — same Atlas connection as the app.

## 4. Test architecture (`/backend/tests`)

- **Jest 29** with `mongodb-memory-server` (a real in-memory Mongo, REPL-set
  mode for transaction support). `globalSetup` spins the repl-set once per
  jest invocation; `connectTestDb()` drops the DB before each test file.
- Run with `--runInBand --forceExit` and `--experimental-vm-modules` (ESM).
- Suites: unit (auth, product/inventory, cart, wishlist), integration
  (cartFlow end-to-end checkout), regression (analytics benchmark +
  validate shapes), and performance harness (Locust, see
  [perf/](backend/tests/perf/)).
- **145 tests across 15 suites** at M4 baseline.

## 5. Cross-cutting concerns

- **Config**: single [env.js](backend/src/config/env.js) reads from `dotenv`;
  warns if `JWT_SECRET` is the default in production.
- **Errors**: uniform `{ error: { message, code } }` envelope via
  [ApiError](backend/src/utils/ApiError.js) + centralized
  [errorHandler](backend/src/middleware/errorHandler.js).
- **Security**: helmet headers, CORS allowlist, rate limiting, bcrypt
  password hashing, JWT expiry, role-based authorization on every mutating
  route.
