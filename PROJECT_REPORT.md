# ShopSense — Multi-Vendor E-Commerce Analytics Platform

**Customer Insights Platform · Infosys Springboard Virtual Internship 7.0 · Team A**

| S.No | Team Member Name |
|------|------------------|
| 1 | DAYANITHA C |
| 2 | DEDEEPYA AGARAMSETTY |
| 3 | DEETCHINI V |
| 4 | GRANDHI PRAVEEN |
| 5 | SOHAN D |

---

## Table of Contents

- [Abstract](#abstract)
- [1. Project Title](#1-project-title)
- [2. Project Objective](#2-project-objective)
- [3. Project Description in Detail](#3-project-description-in-detail)
- [4. Key Milestones & Objectives](#4-key-milestones--objectives)
- [5. System Architecture](#5-system-architecture)
- [6. Database Design](#6-database-design)
- [7. Technology Stack](#7-technology-stack)
- [8. Application Walkthrough (Screens)](#8-application-walkthrough-screens)
- [9. Core Module Implementation (Code)](#9-core-module-implementation-code)
- [10. API Reference](#10-api-reference)
- [11. Key Features by User Role](#11-key-features-by-user-role)
- [12. Testing & Quality Assurance](#12-testing--quality-assurance)
- [13. Challenges Faced](#13-challenges-faced)
- [14. Learnings & Skills Acquired](#14-learnings--skills-acquired)
- [15. Conclusion](#15-conclusion)
- [16. Acknowledgement](#16-acknowledgement)

---

## Abstract

ShopSense is a full-stack, multi-vendor e-commerce analytics platform built as the
Customer Insights Platform project for Infosys Springboard Virtual Internship 7.0.
Independent online sellers typically operate a patchwork of disconnected tools —
separate systems for listings, orders, and revenue tracking, with no shared
visibility for the platform owner. ShopSense replaces that patchwork with a single
marketplace in which customers shop across every vendor from one storefront,
vendors run and monitor their own store, and administrators get marketplace-wide
analytics — all backed by one shared MongoDB Atlas database.

The platform is delivered as a React + Tailwind CSS frontend over a Node.js +
Express REST API secured with JWT authentication and role-based access control.
Applied machine learning sits at its core: a scikit-learn pipeline (StandardScaler
+ K-Means, with k auto-selected by silhouette score) segments customers from
RFM-style behavioural features and labels clusters premium / regular / new /
inactive; a moving-average model forecasts per-product demand from trailing sales
velocity with confidence scoring and low-stock alerts; and a recommendation
engine blends in-process collaborative filtering with an offline SVD
matrix-factorization model (TruncatedSVD) that is trained in Python, written back
to the database, and served freshness-gated to the live app — with
marketplace-wide popularity as a cold-start fallback so no shopper ever sees an
empty feed.

Rather than presenting analytics as static numbers, the platform validates its own
models: a backtesting harness splits transaction history chronologically 70/30 and
scores held-out forecast accuracy, segmentation quality, and recommendation
relevance against concept-note thresholds (0.80 / 0.85 / 0.75). On the seeded
dataset the system reports 0.967 / 0.947 / 1.000. The implementation spans the
full stack — schema design, REST API, three role-based frontend experiences,
applied analytics, and a Jest test suite of 151 tests — with strict per-vendor
data isolation enforced server-side in every vendor-facing query.

**Keywords:** multi-vendor e-commerce, customer analytics, K-Means segmentation,
collaborative filtering, demand forecasting, RFM, MongoDB, Express, React,
JWT authentication, backtesting.

---

## 1. Project Title

**ShopSense — Multi-Vendor E-Commerce Analytics Platform**

ShopSense is a full-stack, multi-vendor e-commerce marketplace developed as the
Customer Insights Platform project for Infosys Springboard Virtual Internship 7.0.
It combines a React + Tailwind CSS frontend, a Node.js + Express backend with
MongoDB Atlas storage (Mongoose ODM), and applied machine learning — an in-process
recommendation and forecasting engine in JavaScript plus a companion scikit-learn
model service (SVD collaborative filtering and K-Means segmentation) — to turn
everyday marketplace transactions into customer, vendor, and admin-level insight.

## 2. Project Objective

The project was scoped around the following objectives, agreed at the start of the
internship and tracked milestone by milestone:

- Design a normalized document-relational schema (MongoDB Atlas, Mongoose ODM)
  supporting a full multi-vendor marketplace — vendors, admins, customers,
  categories, products, inventory, carts, wishlists, and transactions.
- Build a complete customer shopping journey — browse, wishlist, cart, checkout,
  and order tracking — on a React + Tailwind frontend.
- Build vendor-facing tools for product, inventory, and order management, plus a
  business analytics dashboard.
- Apply real machine learning to platform data: K-Means customer segmentation,
  sales-based inventory forecasting, and a cold-start-aware recommendation engine.
- Expose all functionality through a documented, JWT-secured REST API built with
  Express and validated with zod schemas.
- Build role-specific dashboards for Customer, Vendor, and Admin, including
  marketplace-wide Executive BI for admins.
- Establish backend test coverage for authentication, product/inventory
  management, and cart/checkout operations.
- Produce documentation covering architecture, database design, and setup,
  sufficient for another developer to continue the project.

## 3. Project Description in Detail

### 3a. Background & Problem Statement

Independent vendors selling online typically rely on a patchwork of disconnected
tools — one system for product listings, another for order management,
spreadsheets for tracking revenue, and no shared visibility for the platform owner
into how the marketplace is performing as a whole. Customers have no single place
to discover products across sellers, vendors have no easy way to track their own
performance, and administrators are left reconciling data manually.

ShopSense — the Customer Insights Platform delivered for this internship —
replaces that patchwork with a single, coherent multi-vendor e-commerce platform:
customers shop across every vendor from one storefront, vendors run and monitor
their own store, and administrators get marketplace-wide analytics, all backed by
one shared MongoDB Atlas database.

### 3b. Why This Domain

Why a marketplace, and why analytics: e-commerce was chosen as the domain because
it naturally produces rich, interconnected data — products, vendors, customers,
carts, and transactions — which makes it an ideal setting to practice full-stack
development alongside applied data analytics and machine learning together,
rather than as separate exercises. The analytics layer computes its insight
directly from live order and transaction data — K-Means customer segmentation
over RFM-style features, moving-average inventory forecasting, and
collaborative-filtering recommendations — rather than simulating insight with
fixed labels.

This matches the spirit of a Customer Insights Platform: customer segments,
inventory forecasts, and recommendations are all derived directly from real
transactional behaviour captured through the same cart-to-checkout flow a shopper
actually uses.

### 3c. Solution Overview

ShopSense is organized around three role-based experiences — Customer, Vendor,
and Admin — each with its own React pages and sidebar navigation, backed by an
Express service layer organized by domain (routes → controllers → models, with
zod-validated request schemas).

**Customer Experience**

Customers register and log in, browse the product catalogue, add items to a
persistent cart, maintain a wishlist, check out atomically, and track their
orders. A dedicated **My Transactions** page surfaces personal analytics back to
the customer — spending KPIs, spending over time, breakdown by category, and top
products — and a recommendation feed on the storefront suggests products based
on purchase history (or overall popularity for new shoppers).

**Vendor Experience**

Vendors get a business overview dashboard, full product and inventory management
(order fulfilment via the shared transactions view), and a **Sales** analytics
page with filterable charts benchmarking their store's performance against the
marketplace average — all scoped strictly to the authenticated vendor's own
record at the query level.

**Admin Experience**

Admins approve new vendors (**Vendors / onboarding**), manage the
marketplace-wide product catalogue, review all transactions, and access three
analytics surfaces: **Analytics** (advanced revenue analysis, vendor composite
benchmarking, CSV/PDF export), **Customers** (K-Means segmentation), and
**Executive BI** (consolidated KPIs, status tags, and growth-signal reporting) —
plus a **Validation** page that backtests the analytics models against held-out
transaction history.

### 3d. Customer Insight Modules

**Customer Segmentation (K-Means Clustering)**

A scikit-learn pipeline — `StandardScaler` + `KMeans` — is trained over
per-customer RFM-style features (total spend, order count, average order value,
recency in days since last purchase). The cluster count `k` is auto-selected from
2..min(8, n−1) by the best silhouette score, and clusters are auto-labelled
**premium / regular / new / inactive** from their centroids by deterministic
value-score ranking. Segments are written back to the database and served
freshness-gated from `GET /api/customers/segments`; if the ML cache is missing or
stale, the API falls back to transparent RFM rules (frequent / occasional /
at-risk / dormant / new) so the endpoint never regresses.

**Inventory Forecasting**

For each product, units sold over a trailing window are queried from
non-cancelled transactions, converted into an average daily sales rate, and
projected forward over a forecast horizon into a predicted-demand figure, with a
confidence score that falls as history becomes sparse. Each product's current
stock is compared against its reorder threshold, and a dedicated low-stock
endpoint flags items that need restocking.

**Recommendation Engine**

Recommendations are personalized where purchase history exists: the live
JavaScript engine scores co-purchase overlap (collaborative filtering) blended
with category affinity, and an offline SVD matrix-factorization model
(scikit-learn TruncatedSVD) is trained on full history, written back to the
`ml_recommendations` collection, and served freshness-gated. For new customers
with no order history — the cold-start case — the engine falls back to
marketplace-wide popularity, ranked by total units sold, so every shopper sees
relevant suggestions from their very first visit.

**Executive Business Intelligence**

The Admin Executive BI page reports top-line KPIs (revenue, orders, average
order value, products sold) alongside qualitative status tags (Active
Marketplace, Stable, Healthy, Early Activity) and a set of growth signals —
inventory alerts, sales-activity trends, and stockout warnings — intended to
prompt specific admin action rather than just display numbers. A one-click PDF
report can be generated from the same data.

**Security & Access Control**

Authentication uses JWT access tokens (jsonwebtoken) with bcrypt-hashed
passwords. Every protected route passes through an `authenticate` middleware,
and role-specific middleware additionally verifies the authenticated user's
role; vendor routes scope every query to the authenticated vendor's own record —
so one vendor's dashboard can never leak another vendor's data. Passwords are
never stored or logged in plaintext, and all request bodies are validated
against zod schemas before handlers run.

**Data Source**

ShopSense operates on its own live dataset rather than a static, pre-packaged
CSV: every customer segment, forecast, and recommendation is queried fresh from
MongoDB Atlas against real transactions, carts, and inventory records created
through the platform's own checkout flow.

## 4. Key Milestones & Objectives

The project was delivered across four two-week milestones over an eight-week
schedule. Each milestone had its own objectives, tracked and reviewed before
moving to the next.

| Milestone | Focus Area | Duration |
|-----------|------------|----------|
| Milestone 1 | Marketplace Foundation & Vendor Analytics | Weeks 1–2 |
| Milestone 2 | Customer Intelligence & Forecasting | Weeks 3–4 |
| Milestone 3 | APIs & Business Intelligence Reporting | Weeks 5–6 |
| Milestone 4 | Testing, Optimization & Finalization | Weeks 7–8 |

### 4a. Milestone 1 — Marketplace Foundation & Vendor Analytics (Weeks 1–2)

**Objectives**

- Design the MongoDB Atlas schema for a multi-vendor marketplace — vendors,
  admins, customers, categories, products, and inventory.
- Implement authentication (registration, login, JWT issuance) and role-based
  access for Customer, Vendor, and Admin.
- Build vendor registration with an admin-approval workflow.
- Deliver core product catalogue and inventory management for vendors.
- Stand up baseline marketplace analytics — revenue, order, and vendor counts.

### 4b. Milestone 2 — Customer Intelligence & Forecasting (Weeks 3–4)

**Objectives**

- Build the customer shopping journey — cart, wishlist, and atomic checkout
  recording transactions across vendors.
- Implement customer segmentation with real K-Means clustering (scikit-learn)
  over RFM features, with RFM-rules fallback.
- Implement inventory forecasting from trailing sales velocity, with confidence
  scoring and low-stock alerts.
- Deploy a recommendation engine, including cold-start handling for new
  customers.
- Add a backtesting harness scoring all three models against held-out data
  (`GET /analytics/validate`).

### 4c. Milestone 3 — APIs & Business Intelligence Reporting (Weeks 5–6)

**Objectives**

- Expand the Express backend with dedicated routers for analytics, admin
  intelligence, and recommendations.
- Build the Admin Analytics page — advanced revenue analysis (commission,
  margin, growth) and vendor composite benchmarking with CSV/PDF export.
- Build the Executive BI dashboard — consolidated KPIs, status tags, and growth
  signals for admin decision-making.
- Harden per-vendor data isolation across every vendor-facing analytics query.

### 4d. Milestone 4 — Testing, Optimization & Finalization (Weeks 7–8)

**Objectives**

- Write backend tests covering authentication, product/inventory management,
  cart/checkout behaviour, and all analytics models (151 Jest tests).
- Wire the Python ML models (SVD recommender, K-Means segmenter) into the live
  app via batch write-back with freshness-gated serving, logged to MLflow.
- Optimize and finalize the React frontend across all three role-based
  experiences.
- Complete project documentation — architecture, database design, API reference,
  analytics models, and setup — and prepare the final submission.

## 5. System Architecture

ShopSense follows a conventional three-tier architecture, with the backend
further organized by domain (routes, controllers, models, validators) rather
than a single monolithic file, plus an offline ML pipeline that trains models
and writes results back to the shared database.

| Layer | Technology | Responsibility |
|-------|------------|----------------|
| Frontend | React + Tailwind CSS (Vite) | Role-based UI (Customer, Vendor, Admin) with dedicated sidebars and pages; communicates with the backend over REST. |
| Backend | Node.js + Express (Mongoose ODM) | Routers, controllers, and validators organized by domain (auth, products, cart, wishlist, transactions, analytics, recommendations); JWT-secured routes; zod request validation. |
| Database | MongoDB Atlas | Document storage for vendors, admins, customers, categories, products, inventory, carts, wishlists, and transactions. |
| ML pipeline | Python + scikit-learn + MLflow | Offline model training (SVD recommender, K-Means segmenter) reading from and writing back to the same database. |

### 5a. Backend Module Breakdown

The backend's `src/` package is organized into clearly separated concerns:

- `routes/` — one router per domain (auth, vendors, customers, products,
  inventory, transactions, cart, wishlist, categories, recommendations,
  analytics) defining the actual HTTP endpoints.
- `controllers/` — the business logic behind each router, including the
  analytics controllers (revenue analysis, benchmarking, executive summary,
  validation).
- `models/` — Mongoose schemas mapping directly to the MongoDB collections.
- `validators/` — zod schemas validating every request body and query before a
  controller runs.
- `middleware/` — `authenticate` (JWT) and `requireRole` (role checks) applied
  per-route.
- `utils/` — the pure analytics functions: segmentation, forecasting,
  recommendations, and the backtesting validation harness.
- `scripts/` — database seeding and the ML refresh driver (`npm run ml:refresh`).

### 5b. Request Flow

A typical request flows as follows: the React frontend calls the backend via its
api service module, attaching the JWT bearer token for protected routes.
Express middleware validates the request body/query against a zod schema, then
resolves the current user via `authenticate` (and role via `requireRole` where
needed), delegates to the relevant controller, which queries MongoDB through
Mongoose, and returns a uniform JSON response — or a uniform error envelope with
an HTTP status and error code.

### 5c. ML Pipeline Flow

The Python ML pipeline runs alongside the app and is **additive** — the app
never depends on it being alive:

```
python -m recommender.cli refresh / segment-refresh
        │  train on full history (Atlas)
        ▼
ml_recommendations / ml_segments collections (Atlas)
        │  freshness-gated read (max cache age, no newer purchase)
        ▼
GET /api/recommendations · GET /api/customers/segments
        │  cache miss / stale
        ▼
JS fallback: collaborative filtering + popular / RFM rules
```

A cached row is served only if it is younger than a configurable max age AND
the customer has not purchased anything since it was generated — so
recommendations still react to new purchases, and a stale or missing cache can
never regress the user experience.

### 5d. Frontend Structure

The frontend is a Vite-powered React application. `src/layouts/MainLayout.jsx`
renders a role-specific sidebar (admin, vendor, or customer) based on the role
stored at login, wrapping every page in a consistent shell with a shared
navbar. Route guards prevent a customer from ever navigating to a vendor or
admin route.

## 6. Database Design

The schema consists of eleven related MongoDB collections, each defined as a
Mongoose model with explicit references between documents.

| Collection | Purpose |
|------------|---------|
| `vendors` | Vendor business profiles (including admin accounts), status, commission rate, credentials |
| `customers` | Customer profiles and credentials |
| `categories` | Product category taxonomy |
| `products` | Product catalogue, scoped per vendor and category |
| `inventories` | Stock levels, reorder threshold per product |
| `carts` | One active cart per customer, with embedded line items |
| `wishlists` | Saved products per customer |
| `transactions` | Purchase events — customer, product, quantity, amount, date, status |
| `inventoryforecasts` | Cached per-product demand forecasts |
| `mlrecommendations` | Cached ML (SVD/cosine) recommendations per customer |
| `mlsegments` | Cached K-Means segment per customer |

### 6a. Design Rationale

Carts and wishlists embed their line items directly in the customer's document,
while purchase history is normalized into one transaction document per
product-purchase event. This is what lets a checkout atomically record a
multi-vendor order (using MongoDB multi-document transactions against the Atlas
replica set) while still letting each vendor query only their own transactions —
and it is the basis for the per-vendor scoping used throughout the analytics
controllers.

### 6b. Key Relationships

- `products.vendor` and `products.category` reference vendors and categories.
- `carts.customer` ties one cart to its customer; each embedded item references
  a product.
- `transactions.customerId`, `transactions.productId`, and `transactions.vendor`
  tie each purchase event to the customer who made it, the product bought, and
  the vendor who sold it.
- `inventories.productId` ties each stock row to exactly one product.
- `mlrecommendations.customerId` / `mlsegments.customerId` tie each cached ML
  row to one customer.

## 7. Technology Stack

| Category | Technology | Purpose |
|----------|------------|---------|
| Frontend | React 19 + Vite + Tailwind CSS 4 | Component-based UI, role-specific dashboards, utility-first styling |
| Charts | recharts 3 | Revenue trends, category breakdowns, benchmarking charts |
| Backend framework | Express 4 (Node 20, ESM) | REST API with layered routes/controllers/models |
| ORM | Mongoose 8 | Object-document mapping between JS models and MongoDB collections |
| Database | MongoDB Atlas | Document storage; replica set enables multi-document transactions |
| Validation | zod | Typed request schemas for every endpoint |
| Authentication | jsonwebtoken (JWT) + bcryptjs | Token-based authentication and secure password hashing |
| Machine Learning | Python 3.12 + scikit-learn (TruncatedSVD, KMeans) + NumPy/SciPy | SVD collaborative filtering, K-Means segmentation |
| Experiment tracking | MLflow | Model registry for the recommender and segmenter |
| Testing | Jest 29 + mongodb-memory-server + supertest | 151 backend tests against an in-memory replica set |
| Security | helmet, express-rate-limit, cors, compression | Hardened HTTP layer, rate limiting |
| Reporting | PDFKit | Generated PDF analytics reports |

These choices pair a conventional, production-style JavaScript web stack with a
real ML library (scikit-learn) over hand-rolled heuristics — chosen so the
platform's analytics claims are backed by actual trained models, not just
labels — while the JS fallbacks guarantee the live API never depends on the
Python pipeline being available.

## 8. Application Walkthrough (Screens)

This section walks through the platform's key screens across all three roles.
Screen names and behaviour below are taken directly from the submitted React
component structure (page files under `frontend/src/pages/`).

### 8a. Login (`AuthPage.jsx`)

A credential form accepting customer, vendor, or admin logins. Successful login
stores the returned JWT and role, which `MainLayout` then uses to pick the
correct sidebar. Demo accounts are seeded for each role.

### 8b. Admin — Marketplace Performance Dashboard (`admin/Dashboard.jsx`)

The admin dashboard presents top-line KPIs — revenue, orders, customers,
vendors, products — a revenue trend chart, a top-vendors panel, and a recent
transactions table with status badges, all filterable by date range.

### 8c. Admin — Executive Business Intelligence (`admin/Executive.jsx`)

The Executive BI page adds qualitative status tags to each KPI (Active
Marketplace, Stable, Healthy, Early Activity) and a Growth Signals panel —
inventory alerts, sales-activity trends, stockout warnings — each summarizing a
specific, actionable observation for the admin. A PDF report can be downloaded
from the same screen.

### 8d. Admin — Analytics (`admin/Analytics.jsx`) & Validation (`admin/Validation.jsx`)

The Analytics page shows advanced revenue analysis (commission, margin,
growth, timeseries) and the vendor composite benchmarking table
(`0.5·revenue + 0.3·fulfilment + 0.2·growth`, normalized to 0–100), with CSV
export. The Validation page runs the backtest and displays forecast accuracy,
segmentation quality, and recommendation relevance against their thresholds.

### 8e. Vendor — Business Overview & Sales (`vendor/MyProducts.jsx`, `vendor/Sales.jsx`)

A vendor's dashboard mirrors the admin dashboard's shape but is scoped entirely
to their store: their own revenue, orders, products, and stock levels
(`MyProducts`), while the Sales page benchmarks their performance against the
marketplace average with filterable graphical analytics.

### 8f. Customer — Browse Products (`customer/Catalog.jsx`)

The customer catalogue view presents a searchable product grid, each card
showing the product, its vendor, and price, with add-to-cart and wishlist
actions — plus a personalized recommendations rail (with the popular fallback
for new shoppers).

### 8g. Customer — My Transactions (`customer/MyTransactions.jsx`)

The customer's personal analytics page: spending KPIs, spend-over-time chart,
category breakdown, top products, and full order history — each row scoped to
the signed-in customer's own purchases.

## 9. Core Module Implementation (Code)

This section describes representative modules, taken directly from the
submitted backend, for four core areas — authentication, customer
segmentation, inventory forecasting, and recommendations — each paired with the
live request/response shape the API produces.

### 9a. Authentication (JWT)

Registration and login are handled by `routes/authRoutes.js` +
`controllers/authController.js`, delegating to the Mongoose models for password
hashing (`bcryptjs`, 10 rounds) and JWT issuance (`utils/jwt.js`). Every
protected route elsewhere in the API passes through the `authenticate`
middleware, which verifies the token and loads the correct account collection
based on the token's role claim.

```json
// POST /api/auth/admin/login   { "email": "...", "password": "..." }
// 200
{ "token": "eyJ...", "vendor": { "id": "...", "name": "...", "role": "admin" } }
```

### 9b. Customer Segmentation — K-Means Clustering

The Python pipeline (`ml/recommender/segmentation.py`) builds a per-customer
feature table (total spend, order count, average order value, recency days),
scales it with `StandardScaler`, and clusters it with scikit-learn's `KMeans` —
with `k` auto-selected from 2..min(8, n−1) by the best silhouette score — then
auto-labels clusters premium / regular / new / inactive from their centroids
and upserts one row per customer into `ml_segments`. The Node endpoint
(`controllers/customerController.js`) serves these freshness-gated, falling
back to the deterministic RFM rules in `utils/segmentation.js` when the cache
is missing or stale, and reports which path served the response.

```json
// GET /api/customers/segments   (admin)
// 200
{
  "source": "kmeans",
  "model": { "k": 5, "silhouette": 0.719,
             "labels": ["premium", "new", "regular", "inactive"] },
  "segments": { "premium": [ ... ], "new": [ ... ], ... },
  "summary": { "total": 8, "counts": { "premium": 2, "new": 4, ... } }
}
```

### 9c. Inventory Forecasting

`utils/forecast.js` computes a trailing-window sales rate per product from
non-cancelled transactions, projects it forward over the requested horizon into
a predicted-demand figure, and scores confidence from how many days in the
window actually had sales (sparse history → lower confidence). Stock levels and
reorder thresholds live on the Inventory model, and
`GET /inventory/low-stock` flags items at or below their threshold.

```json
// GET /api/inventory/forecast?horizon=7   (admin)
// 200 — per product:
{
  "productId": "...", "avgDailySales": 1.43,
  "predictedStock": 10.0, "confidenceLevel": 0.86,
  "windowDays": 30, "horizonDays": 7,
  "method": "moving-average", "daysWithSales": 26
}
```

### 9d. Recommendation Engine — Cold Start Handling

`controllers/recommendationController.js` first checks the freshness-gated ML
cache (`ml_recommendations`, written by the SVD/cosine trainer); on a miss it
recomputes live via `utils/recommend.js` collaborative filtering (co-purchase
overlap blended with category affinity); and if the customer has no purchase
history — the cold-start case — it falls back to marketplace-wide popularity by
units sold, so recommendations are never empty even for a first-time visitor.

```json
// GET /api/recommendations?limit=3   (customer)
// 200
{ "recommendations": [
  { "reason": "svd", "score": 0.42,
    "product": { "name": "Air Fryer", "price": 89.99, "category": "..." } },
  ...
]}
```

## 10. API Reference

All endpoints are implemented in Express with zod request validation and
JWT-based access control, and are documented in full in `docs/API.md`. The
table below summarizes the primary routers and representative endpoints.
Base URL: `http://localhost:5000/api`.

**Authentication & Accounts**

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /auth/customer/register | Register a customer account |
| POST | /auth/customer/login | Customer login → JWT |
| POST | /auth/vendor/register · /auth/vendor/login | Vendor registration/login |
| POST | /auth/admin/login | Admin login |
| GET | /auth/me | Current account profile (🔒) |

**Products, Cart, Wishlist & Transactions**

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /products | List / search the catalogue (public) |
| POST | /products | Create product (🔒 vendor) |
| GET | /inventory · /inventory/low-stock · /inventory/forecast | Stock levels, alerts, demand forecast (🔒) |
| GET / POST / PATCH / DELETE | /cart[/:productId] | Cart operations (🔒 customer) |
| POST | /cart/checkout | Atomic multi-vendor checkout → Transaction |
| GET / POST / DELETE | /wishlist[/:productId] | Wishlist operations (🔒 customer) |
| POST | /wishlist/:productId/move-to-cart | Move a wishlist item to the cart |
| GET | /transactions | Transaction history (🔒, scoped by role) |

**Vendor Routes (🔒 vendor|admin)**

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET / PUT | /vendors/me | Vendor's own profile |
| PATCH | /vendors/:id/status | Approve / suspend vendors (🔒 admin) |
| GET | /analytics/summary · /analytics/revenue · /analytics/products | Vendor's own KPIs and performance |

**Admin & Intelligence (🔒 admin unless noted)**

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /customers | List / search customers |
| GET | /customers/segments | K-Means segments (RFM fallback, `source` field) |
| GET | /customers/:id/behaviour | Purchase behaviour profile |
| GET | /analytics/revenue-analysis | Commission, margin, growth, timeseries |
| GET | /analytics/benchmark | Vendor composite scoring + CSV export |
| GET | /analytics/executive | Consolidated executive BI summary |
| GET | /analytics/report?format=pdf | Generated PDF report |
| GET | /analytics/validate | Backtest: forecast / segmentation / recommendation scores |
| GET | /recommendations | Personalized recs (ML cache → JS CF → popular fallback) |

All errors follow a uniform envelope (`{ "error": { "message", "code" } }`)
with conventional status codes (400/401/403/404/409/500), and the API is rate
limited (1000 requests / 15 min per IP).

## 11. Key Features by User Role

**Customer**

- Browse and search the product catalogue across every vendor.
- Persistent cart, atomic multi-vendor checkout, and wishlist (with
  move-to-cart).
- Order history and order tracking.
- My Transactions — personal spending analytics (KPIs, trends, categories, top
  products).
- Personalized recommendations, including a cold-start fallback for new
  customers.

**Vendor**

- Business overview dashboard with own revenue, orders, and stock.
- Full product and inventory management, scoped to the vendor's own catalogue.
- Transaction views limited to the vendor's own sales.
- Sales analytics — filterable charts and performance vs. the marketplace
  average.

**Admin**

- Vendor onboarding — review and approve new vendor applications.
- Marketplace-wide product catalogue, customer, and transaction visibility.
- Analytics — advanced revenue analysis and vendor composite benchmarking with
  CSV/PDF export.
- Marketplace Intelligence — K-Means customer segmentation and inventory
  forecasting.
- Executive BI — KPIs, status tags, and growth signals for marketplace-wide
  decision-making.
- Validation — backtested model quality scores against concept-note thresholds.

## 12. Testing & Quality Assurance

Backend test coverage (`backend/tests/`, 151 tests across 16 suites) targets
the areas of the platform most sensitive to correctness — authentication,
catalogue/inventory management, cart/checkout behaviour, and every analytics
model — since a defect in any of these directly affects checkout integrity or
data isolation between vendors. Tests run against an in-memory MongoDB replica
set (so multi-document transaction semantics are exercised for real), with
HTTP-level integration tests via supertest.

| Area | What's Verified |
|------|-----------------|
| Authentication | Registration, login, JWT issuance and validation, rejection of invalid credentials, role separation |
| Product & Inventory | Catalogue CRUD, stock updates, low-stock detection, demand forecasts |
| Cart & Checkout | Add / update / remove, stock checks, atomic multi-vendor checkout, wishlist flows |
| Analytics | Revenue analysis, benchmarking, executive summary, and regression tests pinning each metric |
| ML models | Forecast, segmentation (rules + K-Means cache path), recommendation relevance, validation harness |

The analytics regression suite pins the backtest metrics (forecast accuracy,
segmentation quality, recommendation relevance) so any change that would
degrade model quality below the concept-note thresholds fails CI rather than
silently shipping.

## 13. Challenges Faced

**Scoping Every Query to the Correct Vendor**

With products, inventory, transactions, and analytics all needing to be
strictly scoped per vendor, a missed filter anywhere in the controller layer
would leak one vendor's data into another's dashboard. This required
consistently resolving the authenticated vendor's own record server-side in
every vendor-facing query, rather than trusting a client-supplied vendor
identifier — enforced and regression-tested across the analytics endpoints.

**Choosing a Cluster Count for Small Customer Bases**

K-Means needs a chosen number of clusters, but the platform might have only a
handful of customers — too few for several meaningful segments. The
segmentation pipeline adapts `k` over 2..min(8, n−1), selecting the best
silhouette score, and reports that score back through the API and the admin UI
so a genuinely poor clustering (very small or homogeneous customer bases) is
visible rather than silently presented as confident segments.

**Serving ML Models Without Coupling the Live App to Python**

The SVD recommender and K-Means segmenter live in a Python package, but the
live API is Node. Running Python inline per-request would have coupled request
latency and availability to the ML runtime. The solution was a batch write-back
pattern: the Python CLI trains on full history and upserts results into
`ml_recommendations` / `ml_segments`; the Node API serves them freshness-gated
(max cache age, and invalidated by newer purchases) and falls back to the JS
engines on any miss — so the ML layer is purely additive and can never
regress the app.

**Cold-Start Recommendations**

A pure collaborative or purchase-history-based recommender returns nothing for
a brand-new customer. The recommendation controller explicitly branches on
this case, falling back to marketplace-wide popularity by units sold so every
customer — including one who has never ordered anything — still sees relevant
suggestions.

**Atomic Multi-Vendor Checkout**

A cart can contain products from several vendors, and checkout must decrement
every product's stock and record every transaction row or none of them. This
was implemented with MongoDB multi-document transactions (valid because Atlas
runs a replica set), with stock-shortfall conflicts surfacing as clean 409
errors rather than partial orders.

**Validating Analytics Rather Than Just Displaying Them**

Numbers on a dashboard are easy to fake and hard to trust. The backtesting
harness (`utils/validation.js`) splits transaction history chronologically
70/30, recomputes each model on the train split only, and scores it against
the held-out test split — turning "the analytics work" from a claim into a
measured result surfaced on its own admin page.

## 14. Learnings & Skills Acquired

**Full-Stack Development with React & Express**

Gained practical experience building a role-based React frontend against an
Express backend, including structuring routes, controllers, models, and
validators by domain rather than as one large file.

**Document Database Design**

Learned to design a MongoDB schema balancing embedding (cart line items)
against normalization (one transaction per product-purchase event) to support
multi-vendor orders, per-vendor query scoping, and analytics aggregations.

**Applied Machine Learning**

Developed hands-on experience with scikit-learn — feature engineering,
StandardScaler feature scaling, K-Means clustering with silhouette-based model
selection, TruncatedSVD matrix factorization, and MLflow model tracking —
rather than only rule-based heuristics, and learned to integrate Python models
with a JavaScript API through a cache-and-fallback pattern.

**Authentication & Authorization**

Implemented JWT-based authentication end to end, including secure password
hashing and role-based route protection, and learned to reason carefully about
data isolation between vendors sharing one database.

**API Design & Validation**

Practiced designing a REST API with a uniform error envelope, zod-validated
request schemas, rate limiting, and security headers — and keeping the written
API reference in sync with the actual route definitions through a regression
test suite.

**Backtesting & Model Evaluation**

Learned to evaluate analytics claims properly — chronological train/test
splits, MAPE-based forecast accuracy, cohesion-vs-separation segmentation
quality, and held-out recommendation hit rate — and to pin those metrics in CI
so quality cannot silently degrade.

**Debugging Multi-Layer Systems**

Strengthened the ability to trace a bug across the full stack — from a React
component, through an API call, into an Express route, down to the MongoDB
query, and (for ML issues) into the Python pipeline and its written-back cache.

## 15. Conclusion

The ShopSense project — delivered as the Customer Insights Platform for Infosys
Springboard Virtual Internship 7.0 — demonstrates a complete, production-style
multi-vendor e-commerce platform with genuine machine learning at its core. By
combining a React + Tailwind frontend, a Node.js + Express + Mongoose backend,
a MongoDB Atlas database, and scikit-learn-driven customer segmentation,
inventory forecasting, and recommendations, the project delivers a centralized,
role-appropriate view of marketplace performance for customers, vendors, and
administrators.

The implementation spans the full stack — schema design, REST API development,
role-based frontend experiences, applied analytics, and a 151-test backend
suite — with careful attention to per-vendor data isolation and to handling
real-world edge cases like small customer bases, cold-start recommendations,
and atomic multi-vendor checkout, rather than only the easy path. Critically,
the platform validates its own intelligence: every model is backtested against
held-out transaction history, and those scores are surfaced in the admin UI
rather than asserted in documentation.

Beyond the working software, the internship strengthened practical skills in
full-stack engineering, document database design, applied machine learning,
and secure authentication — and demonstrated that a genuinely useful customer
insights platform depends on the same rigor as the analytics it produces: real
data, real models, and a schema and API built to keep that data honest.

## 16. Acknowledgement

We would like to express our sincere gratitude to Infosys Springboard for
providing the opportunity to be part of Virtual Internship 7.0, and for
structuring a program that encouraged genuine, hands-on project building
rather than passive learning.

We are thankful to our mentors and reviewers for their consistent guidance,
timely feedback, and encouragement throughout the development of ShopSense —
particularly for the direction to build genuine machine learning into the
platform rather than simulated analytics, and to take data isolation between
vendors seriously from the start.

We would also like to thank our fellow team members for the collaborative
learning environment, peer discussions, and shared problem-solving that made
this internship a genuinely enriching experience.

Finally, we are grateful to our families and friends for their continuous
support and encouragement throughout the duration of this internship.
