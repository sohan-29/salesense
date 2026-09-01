# ShopSense ML Recommender (Python)

A standalone Python ML product-recommendation model for ShopSense. It reads
from the **same MongoDB Atlas** the Node/Express app uses, trains three
recommendation algorithms, and backtests them with the **same held-out
protocol** the JS `validate` endpoint uses (`backend/src/utils/validation.js`),
so the numbers are directly comparable.

This is a **Milestone-2 add-on**: it runs alongside the existing in-process JS
recommendation engine and does **not** modify the Node app or frontend.

## Algorithms (compared side-by-side)

| Model | What it is | Where |
|-------|-----------|-------|
| `svd` | **Matrix factorization** via `TruncatedSVD` (scikit-learn). Learns latent customer/product factors; score(c,p) = U[c]·V[p]. The ML model. | `models.SVDRecommender` |
| `cosine` | **Item-item collaborative filtering**. Cosine similarity between product column-vectors of the interaction matrix; score(p) = Σ sim(p, owned). | `models.ItemCosineRecommender` |
| `baseline` | Reimplementation of the JS `collaborativeScore` (co-purchase overlap counting) in numpy, for a like-for-like comparison. | `models.JSCoBaseline` |
| `popular` | Cold-start fallback: top products by units sold (matches the JS `popularProducts`). | `models.popular_fallback` |

## Prerequisites

- Python 3.12+ (`numpy`, `scikit-learn`, `scipy`, `joblib` already installed locally).
- `pymongo` + `python-dotenv` (see install below).
- The Atlas DB must contain the seeded data — run this once in `backend/`:
  ```bash
  npm run seed
  ```
- `backend/.env` must define `MONGO_URI` (the same Atlas connection the app uses).

## Install

```bash
cd ml
python -m pip install -r requirements.txt
```

## Usage

All commands are run from the `ml/` directory.

### Train (fit all three models, save artifacts)

```bash
python -m recommender.cli train
# optional: python -m recommender.cli train --components 30
```
Saves `artifacts/models.joblib` + `artifacts/meta.json`.

### Evaluate (backtest on the held-out 70/30 split)

```bash
python -m recommender.cli evaluate
```
Prints a comparison table: per-model `relevance` (hits / evaluated), the
popular fallback, and the concept-note threshold (0.75). Mirrors the JS
`/api/analytics/validate` `recommendationRelevance` metric, so you can compare
directly against the ~1.0 the JS engine reports on the seeded dataset.

### Recommend for one customer

```bash
python -m recommender.cli recommend <customerId> --model svd
# models: svd | cosine | baseline
```
`<customerId>` is a Customer ObjectId hex (e.g. from the seed). Prints a
ranked table with product name, category, score, and reason. Cold-start
customers (no purchase history / no CF signal) fall through to the popular
fallback, matching the JS controller.

### List trained models

```bash
python -m recommender.cli show-models
```

### Refresh — drive the LIVE app's recommendations (batch write-back)

This is the command that wires the ML model into the running app:

```bash
python -m recommender.cli refresh --model svd --limit 5
# or from the backend dir:  npm run ml:refresh -- --model cosine --limit 5
```

It trains the chosen model on full history, computes top-k recommendations for
**every** customer, and writes them to the `ml_recommendations` collection in
Atlas. The Node backend then serves these (freshness-gated) from
`GET /api/recommendations` — so customers see ML-driven recommendations in the
Catalog UI. Cold-start customers get a `popular` row.

**Freshness gate** (`backend/src/controllers/recommendationController.js`): a
cached row is served only if it is younger than `ML_CACHE_MAX_AGE_MIN`
(default 60 min) AND the customer has not purchased anything since it was
generated. Otherwise the controller recomputes live (JS CF), so recommendations
still react to new purchases. Re-run `refresh` after data changes (or on a
schedule) to keep the cache current.

### Segment-refresh — drive the LIVE app's customer segmentation (K-Means)

```bash
python -m recommender.cli segment-refresh
# or from the backend dir:  npm run ml:refresh   (refreshes recs AND segments)
```

Trains a real scikit-learn segmentation model — `StandardScaler` + `KMeans`
over per-customer RFM features (`totalSpend`, `orderCount`, `avgOrderValue`,
`recencyDays`) — with `k` auto-selected from 2..min(8, n−1) by the best
silhouette score. Clusters are auto-labelled **premium / regular / new /
inactive** from their centroids (deterministic value-score ranking), and one
row per customer is upserted into the `ml_segments` collection in Atlas.

`GET /api/customers/segments` (Node) serves these freshness-gated
(`ML_SEGMENT_MAX_AGE_MIN`, default 1440 min — segments drift slower than
recommendations), falling back to the JS RFM rules in
`backend/src/utils/segmentation.js` when the cache is missing or stale. The
response's `source` field (`'kmeans'` | `'rules-fallback'`) says which path
served it; the admin Customers page shows the model's k and silhouette when
the ML path is live.

The K-Means model is also logged to MLflow as `shopsense-segmenter` by
`python -m recommender.cli mlflow-run`.

## How the app consumes the cache

```
python -m recommender.cli refresh   ──writes──▶  ml_recommendations (Atlas)
                                                         │
GET /api/recommendations  ──reads (fresh only)──▶  ML cache HIT  ──▶ serve ML recs
                      │                                   (else) ──▶ JS CF fallback
                      └──── always available, never regresses ────┘
```

The ML cache is **additive**: if Python/deps are missing or the cache is
absent/stale, the app behaves exactly as before (JS CF + popular fallback).
All 54 backend tests pass with the cache layer in place.

## How the backtest maps to the JS endpoint

| JS (`utils/validation.js`) | Python (`backtest.py`) |
|----------------------------|------------------------|
| chronological 70/30 split on customer-attributed txns | same — `split_date_for_ratio` |
| eligible = customers with ≥2 purchases | same — `_customers_with_min_purchases` |
| hold out newest post-split purchase | same — `_held_out_purchase` |
| hit = held-out product OR same-category in top-5 | same — `_is_hit` |
| relevance = hits / **evaluated** (CF-served only) | same — cold-start excluded from denominator |

Both report a precision@k over customers the engine actually served.

## Layout

```
ml/
  requirements.txt
  recommender/
    data.py       # Atlas load + interaction matrices + index maps
    models.py     # SVDRecommender, ItemCosineRecommender, JSCoBaseline, popular_fallback
    backtest.py   # held-out protocol mirroring JS validation
    cli.py        # train / evaluate / recommend / show-models
  artifacts/      # gitignored — trained models + meta (regenerable)
  README.md
```

## Scope notes

- No `pandas` dependency (pure `numpy` / `scikit-learn` / `scipy`).
- No Node/Express or frontend changes; no Docker/CI/MLflow.
- Deterministic (fixed `random_state`; no RNG-dependent flows).
- The seeded dataset is small (8 customers), so SVD latent factors are
  near-degenerate — the comparison will report whatever it finds honestly.
```

## MLflow model registry (Milestone 3)

The `mlflow-run` command is the automated analytical workflow pipeline: it
loads data from Atlas, trains both ML models, evaluates them on held-out data,
and logs params + metrics + model artifacts to a local MLflow registry.

```bash
python -m recommender.cli mlflow-run
```

This registers two versioned models in the `shopsense-analytics` experiment:

| Model (registry name) | Algorithm | Key metrics logged |
|-----------------------|-----------|--------------------|
| `shopsense-recommender` | SVD matrix factorization (TruncatedSVD) | relevance (held-out precision@k), evaluated, hits |
| `shopsense-forecaster` | LinearRegression (temporal features: trend, day-of-week, lag, rolling) | forecast_accuracy (1−MAPE), mape, r2 |

The registry persists to `ml/mlflow.db` (sqlite). View it in the browser:

```bash
mlflow ui --backend-store-uri sqlite:///ml/mlflow.db
# → http://localhost:5000 (or the port mlflow reports)
```

Load a registered model for inference:

```python
import mlflow.sklearn
model = mlflow.sklearn.load_model("models:/shopsense-forecaster/1")
model.predict([[day_index, weekday, is_weekend, lag1, roll7]])
```

Re-run `mlflow-run` after data changes to log new versions (reproducibility +
version control for the analytics models). The LinearRegression forecaster
achieves ~0.82 accuracy (≥0.80 threshold) on the seeded dataset; the SVD
recommender achieves 1.0 held-out relevance.
