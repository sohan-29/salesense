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
