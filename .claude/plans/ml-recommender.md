# Python ML Product-Recommendation Model

## Goal
Add a Python ML recommendation model that reads from the same MongoDB Atlas
the Node app uses, trains three algorithms, backtests them against the
held-out protocol the JS validation already uses, and exposes a CLI. No
changes to the Node/Express app or frontend.

## Decisions (from clarifying questions)
- **Algorithms**: implement and compare all three — SVD matrix factorization,
  item-item cosine collaborative filtering, plus a JS-baseline reimplementation
  in Python — reported side-by-side.
- **Integration**: standalone Python package + CLI (`train`, `evaluate`,
  `recommend <customerId>`). Reads `MONGO_URI` from `backend/.env`.

## Environment verified
- Python 3.12.6 at `C:\Python312\python.exe`. `numpy 2.3.3`, `scikit-learn 1.7.2`,
  `scipy 1.16.1`, `joblib` available. `pandas` and `pymongo` **not** installed →
  the plan installs `pymongo` (no pandas needed; pure numpy/sklearn).
- `backend/.env` exists and holds `MONGO_URI` (Atlas). `.gitignore` covers
  `.env`, `node_modules`, `dist`; will add `__pycache__/`, `*.pkl`, `ml/venv/`.

## Data model (from the existing code)
- `Transaction`: `{ customerId?, productId, vendorId, quantity, totalAmount,
  status, date }`. Non-cancelled, `customerId != null` only.
- `Product`: `{ name, category, price, status }`. `status: 'active'`.
- `Customer`: `{ name, email }`.
- The JS validation (`utils/validation.js`) splits customer-attributed txns
  chronologically 70/30 (`splitDate`), holds out each eligible customer's
  newest purchase, and counts a hit if the held-out product OR a same-category
  product is in the top-5 recs built from train-only history. The Python
  backtest will replicate this exactly so numbers are directly comparable
  to the existing `/api/analytics/validate` `recommendationRelevance` (≈1.0 on
  seed data) and to the concept-note 0.75 threshold.

## File layout (new, all under `ml/`)
```
ml/
  README.md                 # how to install + run (mirrors backend run docs)
  requirements.txt          # pymongo, scikit-learn, numpy, scipy, joblib (pinned-ish)
  .gitignore                # __pycache__/, *.pkl, venv/, .env
  recommender/
    __init__.py
    data.py                 # load txns/products/customers from Atlas, build matrices
    models.py               # SVDRecommender, ItemCosineRecommender, JSCoBaseline
    backtest.py             # chronological split + held-out hit-rate (mirrors JS)
    cli.py                  # argparse: train / evaluate / recommend / show-model
  artifacts/                # gitignored: trained model .joblib + index maps
```
`ml/` is a sibling of `backend/` and `frontend/`; Node code is untouched.

## Implementation detail

### `data.py`
- Read `MONGO_URI` from `backend/.env` via `python-dotenv` (also not installed
  → include in requirements; fallback: a 10-line manual parse so no hard dep).
- `pymongo` client → `shopsense` DB. Pull non-cancelled, customer-attributed
  `transactions` sorted by `date`; pull `products` (id, name, category, status).
- Build:
  - `interactions`: list of `(customer_idx, product_idx, weight, date)` where
    weight = units (or binary 1 for the cosine model; configurable).
  - `customer_index` / `product_index` maps (hex ↔ int) for stable array slots.
  - sparse `csr_matrix` `R` of shape `[n_customers, n_products]` (scipy.sparse).

### `models.py` — three estimators, one interface
Each implements `fit(interactions, R)` and `recommend(customer_idx, k,
exclude_owned=True) -> [(product_idx, score, reason)]`, so the backtest and
CLI treat them uniformly.

1. **`SVDRecommender`** (the real ML one): `sklearn.decomposition.TruncatedSVD`
   on the customer×product matrix → latent factors U·Vᵀ. Predicted score for
   (c,p) = dot(U[c], V[p]). Reconstruct the dense top-k per customer, excluding
   owned products. `n_components` default `min(50, n_products-1)`; configurable.
2. **`ItemCosineRecommender`**: item-item collaborative filtering. Cosine
   similarity between product column-vectors of R (sklearn
   `cosine_similarity` on the sparse matrix). For a customer, score(p) =
   sum over owned products o of sim(p, o). Classic CF baseline.
3. **`JSCoBaseline`**: reimplementation of `utils/recommend.js`
   `collaborativeScore` (co-purchase overlap counting) in numpy, so the
   comparison includes the exact heuristic the app currently ships.

All three: empty rec set → caller falls back to "popular" (top units) to
match the JS cold-start path; the backtest counts only CF-served customers
in the denominator (precision@k, matching the existing relevance metric).

### `backtest.py`
- Chronological 70/30 split on customer-attributed txns → `split_date`.
- For each customer with ≥2 purchases: hold out newest post-split purchase;
  build recs from train-only history; hit if held-out product OR a
  same-category product is in top-5.
- Print a table: per-model `relevance` (hits/evaluated), `evaluated`,
  `candidates`, `hits`, plus a `popular` fallback baseline. Also restate the
  JS threshold (0.75) and the current JS relevance (≈1.0 on seed) for context.
- Deterministic (no RNG). Pure numpy/sklearn deterministic ops.

### `cli.py` (argparse subcommands)
- `python -m recommender.cli train [--components N] [--out artifacts/]`
  — load data, fit all three, save `.joblib` to `artifacts/`.
- `python -m recommender.cli evaluate [--limit 5] [--train-ratio 0.7]`
  — run the backtest, print the comparison table.
- `python -m recommender.cli recommend <customerId> [--limit 5] [--model svd|cosine|baseline]`
  — load artifacts, print ranked recs with product name, category, score, reason.
- `python -m recommender.cli show-models` — list saved models + metadata
  (n_components, train size, fit timestamp passed in via args; no Date.now).

### `README.md`
- Prereqs, install (`pip install -r requirements.txt`), the three commands,
  where MONGO_URI comes from, and how the backtest maps to the JS endpoint.
- Note that this is a Milestone-2 add-on (no Node integration) per scope.

## Worked example / acceptance
After `npm run seed` in the backend (so Atlas has the 60-day dataset), run:
```
cd ml
pip install -r requirements.txt
python -m recommender.cli evaluate
python -m recommender.cli recommend <seed-customer-id> --model svd
```
Expected: the comparison table prints relevance for SVD / cosine / JS-baseline
plus popular fallback, all on the same held-out protocol the JS endpoint uses.
SVD and cosine should land at or near 1.0 on the seeded data (same signal the
JS CF exploits) — if they don't, that's a real finding to report, not a fudge.

## Out of scope (explicitly)
- No Node/Express or frontend changes. No new endpoints. No Docker/CI/MLflow.
- No pandas dependency. No online serving / FastAPI (the chosen option was
  standalone CLI).
- Does not replace `utils/recommend.js`; it runs alongside and compares.

## Risks / notes
- `pymongo` and `python-dotenv` must be installed (one `pip install`). Atlas
  must be reachable from this machine (it already is for Node).
- The seed dataset is small (8 customers, a handful of products), so latent-
  factor SVD is near-degenerate; results may equal or trail the simple CF —
  the comparison will say so honestly. Plan does not tune to force a win.
- All timestamps/RNG avoided in scripts (use args); deterministic.
