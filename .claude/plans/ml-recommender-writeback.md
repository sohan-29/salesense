# Wire the Python ML Recommender into the Live App (Batch Write-Back)

## Goal
Make the Python ML model actually drive the recommendations customers see in
the UI — without a second always-on process. The Python model computes each
customer's top-k recommendations and writes them to MongoDB; the Node backend
reads that cache first and falls back to the existing JS CF engine when the
cache is missing or stale. Existing behavior + all 24 tests are preserved —
ML is an additive cache layer, never a regression.

## Approach (vs. the microservice alternative)
**Batch write-back** (not FastAPI). No always-on Python process; matches the
existing `InventoryForecast` "cached analytical output" pattern; the CLI
already exists. The user runs a refresh command to (re)generate the cache; the
app reads it. Recommended as the simplest option.

## Freshness / staleness handling (the key design point)
The Catalog re-fetches recommendations after every purchase
(`loadRecs()` in `Catalog.jsx:42`), so precomputed recs would go stale
instantly. Resolution — a **freshness gate** in the controller:
- Node reads the cached ML rec for the customer only if a cache row exists
  AND was written within `ML_REC_MAX_AGE_MIN` (default 60 min) AND the customer
  has **no purchase more recent than the cache write** (so recs the customer
  has already partly reacted to aren't shown stale).
- Otherwise → existing live JS CF path (unchanged). Right after a purchase the
  customer gets fresh live JS recs (reactivity preserved); later, once a
  refresh has run and the customer hasn't bought since, they get ML recs.

This keeps the "recommendations react to the new purchase" UX intact while
letting ML recs appear once the refresh script runs.

## Files

### New — Python write-back
- `ml/recommender/writeback.py` — `refresh_recommendations(model_name, k)`:
  load dataset from Atlas, fit the chosen model on full history, compute top-k
  for EVERY customer, write/replace rows in the `ml_recommendations` collection.
  Cold-start customers (no CF signal) get a `popular` row. Stores per-row:
  `customerId`, `model`, `generatedAt`, `items: [{ productId, score, reason,
  category }]`. Uses pymongo upsert per customer (replace by customerId+model).
- `ml/recommender/cli.py` — add a `refresh` subcommand:
  `python -m recommender.cli refresh --model svd --limit 5` writes the cache.
- `ml/README.md` — document `refresh` + how the app consumes the cache.

### New — Node cache model + read
- `backend/src/models/MLRecommendation.js` — Mongoose model mirroring
  `InventoryForecast`: `{ customerId, model, generatedAt, items[] }`, unique
  index on `{ customerId, model }`, `timestamps: true`.

### Modified — Node controller (the only behavior change)
- `backend/src/controllers/recommendationController.js`:
  - In `recommendProducts`, BEFORE the existing CF logic, call a new
    `readFreshMLCache(customerId, limit)` helper. If it returns a non-empty
    fresh row → hydrate products (same `Product.find().populate('vendorId')`
    shape the frontend expects) and return them with `reason` from the cache.
  - Else → existing JS CF + content + popular fallback, unchanged.
  - `popularProducts` is unchanged.
  - The response shape is identical: `{ customerId, recommendations:
    [{ product, score, reason, category }] }`. `reason` may now also be
    `svd`/`cosine`.

### Modified — frontend (labels only, non-breaking)
- `frontend/src/pages/customer/Catalog.jsx` `reasonLabel` — add labels for
  `svd` ("Smart pick (ML)") and `cosine` ("Similar to what you buy (ML)").
  Unknown reasons already render as `''`, so this is cosmetic + non-breaking.

### New — npm trigger
- `backend/package.json` — add `"ml:refresh": "node src/scripts/runMLRefresh.js"`
  where `runMLRefresh.js` spawns `python -m recommender.cli refresh` from the
  `ml/` dir (uses MONGO_URI from `backend/.env` via the Python side). Fails
  gracefully with a clear message if python/deps missing. This gives a single
  `npm run ml:refresh` entry point from the backend.

## Tests
- Existing `backend/tests/recommendation.test.js` (5 cases) must pass
  UNCHANGED — the test DB never populates the ML cache, so every case hits the
  JS fallback. Verified by the freshness gate: no cache row → fallback.
- New `backend/tests/mlRecommendation.test.js`: when a fresh `MLRecommendation`
  row is inserted for a customer, `GET /api/recommendations?customerId=`
  returns the cached products (reason `svd`); when the row is stale or the
  customer bought after `generatedAt`, it falls back to JS CF. Run after the
  existing suite, same in-memory replset setup.
- Python: `refresh` smoke-tested against seeded Atlas (write rows, then
  `recommend --model svd` from CLI still works; and a Mongo peek shows rows).

## Acceptance / verification
1. `cd backend && npm test` → all green (existing 24 + new ml cases).
2. `cd ml && python -m recommender.cli refresh --model svd --limit 5`
   → writes 8 rows (one per seeded customer).
3. Sign in as a seeded customer in the UI (customer@shopsense.test /
   customer123) → the "Recommended for you" rail shows ML-tagged products
   (reason `svd`) IF fresh and no purchase since; otherwise JS recs (unchanged).
4. Buy a product → rail re-fetches → shows fresh JS recs (reactivity intact).

## Scope / out of scope
- No always-on Python service, no Docker, no scheduler daemon. Refresh is
  manual via `npm run ml:refresh` (could be wired to cron later — not now).
- Does NOT remove or replace the JS CF engine; it's the fallback + the
  reactive-after-purchase path.
- Frontend change is label-only and non-breaking.

## Risks
- Freshness gate edge cases (clock skew, customer's newest txn vs generatedAt)
  → covered by the "no purchase newer than the cache" check + the existing
  test suite as fallback proof.
- `pymongo` already installed; `python` on PATH confirmed. If a user lacks
  python/deps, `npm run ml:refresh` prints a clear message and the app keeps
  working on JS recs (no hard dependency at runtime — only the cache read,
  which no-ops to fallback when absent).
