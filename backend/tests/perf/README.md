# ShopSense performance testing (Locust)

Locust load-tests the **running Express backend** to measure throughput and
latency under concurrent users. This satisfies Milestone 4's performance-testing
requirement (the brief's Locust step), retargeted at the real Node/Express API.

## Prerequisites

1. The Express backend running locally (default `http://localhost:5000`):

   ```bash
   cd backend
   npm install
   npm run dev
   ```

2. Locust installed (Python):

   ```bash
   pip install locust
   ```

## Authentication (auth endpoints)

Most analytics endpoints require a JWT. Two ways to provide one:

- **Recommended** — point Locust at an already-registered admin JWT:

  ```bash
  # PowerShell
  $env:LOCUST_TOKEN = "<a valid admin JWT>"
  # bash
  export LOCUST_TOKEN="<a valid admin JWT>"
  ```

- **Automatic bootstrap** — if `LOCUST_TOKEN` is unset, the load test registers
  (or logs into) a throwaway admin `loadtest-admin@shopsense.dev` on the target
  server once at startup, so authenticated tasks still run. Override the
  bootstrap account via `LOCUST_EMAIL` / `LOCUST_PASS`.

## Run

```bash
cd backend
locust -f tests/perf/locustfile.py
# → http://localhost:8089
```

In the Locust web UI, set:
- **Number of users** (peak concurrent users) — start with 10, scale to 100+.
- **Spawn rate** (users/second) — e.g. 5/s.
- **Host** — `http://localhost:5000` (the Express backend).

## What the tasks exercise

| Task | Endpoint | Why it matters perf-wise |
|------|----------|--------------------------|
| `health` (×5) | `GET /health` | Liveness probe; the cheapest possible 200 — a throughput ceiling. |
| `list_products` (×5) | `GET /api/products` | Hot customer browse path; no DB aggregation. |
| `analytics_summary` (×3) | `GET /api/analytics/summary` | Single aggregation over Transaction + a few counts. |
| `revenue_by_vendor` (×3) | `GET /api/analytics/revenue` | Multi-stage aggregation + `$lookup` into Vendor. |
| `chart_analytics` (×2) | `GET /api/analytics/chart` | Fetch + product join + in-JS aggregation across many dimensions. |
| `revenue_analysis` (×1) | `GET /api/analytics/revenue-analysis` | Two-window aggregation (current + previous) with commission lookup. |
| `benchmark` (×1) | `GET /api/analytics/benchmark` | Per-vendor composite scoring + ranking over all transactions. |

Weights (the numeric `task(n)` values) approximate a real analytics workload:
cheap reads are much more frequent than the heavy aggregation endpoints.

## Reading the results

The Locust UI shows, per endpoint: RPS (requests/s), median & p95/p99 latency,
and failure rate. Healthy targets for a local dev box on the seeded dataset:
- `/health` and `/api/products` — hundreds of RPS, p95 < 20 ms.
- Aggregation endpoints — tens of RPS; p95 in the tens-to-low-hundreds of ms
  depending on dataset size.

A failure spike under load usually means an auth token has expired (re-export
`LOCUST_TOKEN`) or Mongo is saturating (check for the aggregation-heavy
endpoints). To remove the load on Atlas entirely, run against a local Mongo or
a dedicated test dataset.

## Headless run (no browser)

```bash
locust -f tests/perf/locustfile.py \
  --headless -u 50 -r 5 -t 60s \
  -H http://localhost:5000 \
  --csv=perf/results
```

Writes `perf/results_stats.csv` etc. for trend tracking.
