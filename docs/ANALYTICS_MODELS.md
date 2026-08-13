# ShopSense — Analytics & ML Models

This document describes the four analytical pillars of ShopSense: revenue
analysis & benchmarking, demand forecasting, customer segmentation, and the
ML recommender — plus the backtesting framework that validates them.

All analytics are computed **on the fly** from the `Transaction` collection
(the source of truth), scoped by a `from`/`to` window and optional
`category` filter.

---

## 1. Revenue analysis & vendor benchmarking

**Endpoint:** `GET /api/analytics/revenue-analysis`, `GET /api/analytics/benchmark`
**Code:** [benchmarkController.js](backend/src/controllers/benchmarkController.js)

### Revenue analysis
For each vendor in the window:
- **Revenue (GMV)** = Σ `items[].quantity × price` across delivered+pending
  transactions.
- **Commission** = `revenue × vendor.commissionRate` (per-vendor rate).
- **Margin** = `revenue − commission` (marketplace take = commission).
- **Growth %** = the vendor's own window split in half by time:
  `(secondHalfRevenue − firstHalfRevenue) / firstHalfRevenue`.
- **Timeseries** bucketed by `period` (`day` | `month`).

### Composite benchmark score
Each vendor is scored on three normalised 0–100 sub-scores, then blended:

| Sub-score        | Formula                                  | Weight |
|------------------|------------------------------------------|--------|
| `revenueScore`   | `(revenue / maxRevenue) × 100`           | **0.5**|
| `fulfilmentScore`| `(fulfilmentRate / maxFulfilment) × 100`| **0.3**|
| `growthScore`    | `max(0, growthPct / maxGrowth) × 100`    | **0.2**|

```
compositeScore = 0.5·revenueScore + 0.3·fulfilmentScore + 0.2·growthScore
```

Normalisation is **max-based**: the top vendor on each axis scores 100, so
the composite rewards balanced performance. Rows are ranked descending by
`compositeScore`; the response also includes marketplace averages
(arithmetic mean of each column across the ranking).

`GET /analytics/executive` consolidates this plus a KPI summary, top-5
vendors, top-5 products, and marketplace counts into a single call for the
executive dashboard.

---

## 2. Demand forecasting

**Endpoint:** `GET /api/inventory/forecast?horizon=7`
**Code:** [forecast.js](backend/src/utils/forecast.js)

A transparent **moving-average** model. For each product, over a trailing
`windowDays` (default 7):

```
avgDailySales = totalUnitsSold / windowDays
predictedStock = avgDailySales × horizon
```

- **Confidence** (`confidenceFromSample`) rises with the number of days that
  had actual sales in the window — a product that sold 5 of 7 days is
  forecast with more confidence than one that sold on 1 day.
- `method: 'moving-average'` is returned so consumers know the model.
- Low-stock detection (`GET /inventory/low-stock`) flags items where
  `available ≤ reorderThreshold` (per-row threshold) or `≤ N` (query
  override) — uses a `$expr` aggregation so per-row thresholds work.

This is intentionally a simple, explainable baseline; the heavy lifting for
*recommendations* (not demand) is the ML model below.

---

## 3. Customer segmentation

**Endpoint:** `GET /api/customers/segments`
**Code:** [segmentation.js](backend/src/utils/segmentation.js)

**RFM-style rule-based segmentation** into five segments, derived from each
customer's `recencyDays`, `ordersLast30d`, and `joinedDaysAgo`:

| Segment          | Rule                                    |
|------------------|-----------------------------------------|
| `frequentBuyers` | recent + high 30d frequency             |
| `dormantUsers`   | `recencyDays ≥ 60`                      |
| `atRisk`         | `30 ≤ recencyDays < 60`                 |
| `newUsers`       | `joinedDaysAgo < 14` (or never purchased)|
| `occasional`     | everyone else (active, low frequency)   |

Rule-based (rather than k-means) because the segment definitions are
business-actionable and stable — a vendor can target "at-risk" customers
without interpreting a cluster number.

---

## 4. ML recommender

**Package:** [`/ml/recommender`](ml/recommender) (Python)
**Endpoint served by backend:** `GET /api/recommendations?customerId=…&limit=5`
**Code:** [models.py](ml/recommender/models.py), [writeback.py](ml/recommender/writeback.py)

Three models, each implementing `fit(dataset)` + `recommend(customerIdx, k)`:

### SVDRecommender (`svd`) — the primary model
Matrix factorisation via scikit-learn's `TruncatedSVD` on the
**customer × product** purchase matrix:
- `svd.fit_transform(matrix)` → `customer_factors [n_c × k]`
- `svd.components_.T` → `product_factors [n_p × k]`
- Score a product for a customer = `customer_factors[c] · product_factors[p]`.
- `n_components=20`, `random_state=42`.

### ItemCosineRecommender (`cosine`)
Item-item collaborative filtering: `cosine_similarity` over the item
vectors (columns of the purchase matrix). For a customer, ranks products
similar to ones they already bought.

### JSCoBaseline (`baseline`)
Non-personalised popularity ranking — the fallback when SVD/cosine coverage
is too low (cold-start customers or sparse data).

### Pipeline
1. `load_dataset` pulls transactions from Atlas → builds the sparse matrix +
   index maps.
2. `build_all` fits all three models.
3. Artifacts persisted to `artifacts/models.joblib` (+ `meta.json`).
4. `refresh_recommendations` (writeback) writes the top-k per customer into
   the `MLRecommendation` collection, which the Node app reads at request
   time.
5. **MLflow** ([mlflow_pipeline.py](ml/recommender/mlflow_pipeline.py))
   tracks each run's params/metrics. Trigger via `npm run ml:refresh` from
   the backend, or `python -m recommender.cli train`.

A backtest harness ([backtest.py](ml/recommender/backtest.py)) evaluates
precision/recall against held-out purchases.

---

## 5. Validation / backtesting

**Endpoint:** `GET /api/analytics/validate`
**Code:** [validation.js](backend/src/utils/validation.js)

A single chronological train/test split (older 70% train, newer 30% test)
recomputes all three M2 outputs on the **train** set and scores them
against the **test** set. Returns three metrics in `[0,1]` + concept-note
thresholds + `details`:

| Metric                    | How it's measured                              | Threshold |
|---------------------------|------------------------------------------------|-----------|
| `forecastAccuracy`        | `1 − MAPE` of predicted vs actual test-window units, clamped `[0,1]` | **0.80** |
| `segmentationQuality`     | `1 − (meanIntraDistance / meanInterDistance)` in RFM space | **0.85** |
| `recommendationRelevance` | held-out last-purchase hit rate (did the rec appear in the test purchase?) | **0.75** |

```json
{
  "forecastAccuracy": 0.82,
  "segmentationQuality": 0.88,
  "recommendationRelevance": 0.79,
  "thresholds": { "forecastAccuracy": 0.8, "segmentationQuality": 0.85, "recommendationRelevance": 0.75 },
  "details": { "transactions": 40, "testSplit": "...", "...": "..." }
}
```

The regression tests in
[analytics.validate.regression.test.js](backend/tests/analytics.validate.regression.test.js)
and [analyticsRegression.test.js](backend/tests/analyticsRegression.test.js)
assert the shape and bounds of this response so the contract is stable.
