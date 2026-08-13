"""
ShopSense load test (Locust → Express backend).

This is NOT a unit/integration test — it hammers the *running* Express server to
measure throughput (RPS) and latency (p50/p95/p99) under concurrent users. It
targets the Node/Express API (default http://localhost:5000), not a Python app.

Run it:
    # 1. install locust once
    pip install locust

    # 2. start the Express backend (in backend/)
    npm run dev

    # 3. (optional) point Locust at an admin account so the analytics endpoints
    #    that require auth pass. Easiest: register an admin via the UI or API and
    #    export its JWT.
    #        set LOCUST_TOKEN=<a valid admin JWT>            (Windows cmd)
    #        $env:LOCUST_TOKEN="<a valid admin JWT>"         (PowerShell)
    #        export LOCUST_TOKEN=<a valid admin JWT>         (bash)
    #    If LOCUST_TOKEN is unset, the load test bootstraps a throwaway admin on
    #    the target server once at start, so it still runs authenticated.

    # 4. start Locust and open the web UI
    locust -f tests/perf/locustfile.py
    #        → http://localhost:8089 — set the user count + spawn rate there.

Authentication:
    ShopSense uses JWT bearer tokens. Authenticated tasks send the token via the
    `Authorization` header. The /health probe and /api/products browse endpoints
    are unauthenticated-friendly and are always load-tested.
"""

import os

from locust import HttpUser, between, task

# A unique-enough bootstrap email per process run so re-runs don't collide when
# LOCUST_TOKEN isn't provided. Deterministic per host so parallel locust workers
# share one account.
_BOOTSTRAP_EMAIL = os.environ.get("LOCUST_EMAIL", "loadtest-admin@shopsense.dev")
_BOOTSTRAP_PASSWORD = os.environ.get("LOCUST_PASS", "loadtest-password-123")


def _bootstrap_admin_token(client):
    """Register (or log in) a throwaway admin so analytics endpoints are reachable.

    Uses raw HTTP via the Locust session so it works even when LOCUST_TOKEN is
    not set. Returns a bearer token, or None if both register & login fail (in
    which case the authenticated tasks are skipped with a warning).
    """
    # Try login first — the account may already exist from an earlier run.
    login = client.post(
        "/api/auth/admin/login",
        json={"email": _BOOTSTRAP_EMAIL, "password": _BOOTSTRAP_PASSWORD},
        name="/api/auth/admin/login",
    )
    if login.status_code == 200 and "token" in login.json():
        return login.json()["token"]

    # Otherwise register, then log in.
    reg = client.post(
        "/api/auth/admin/register",
        json={
            "businessName": "LoadTest Admin",
            "email": _BOOTSTRAP_EMAIL,
            "password": _BOOTSTRAP_PASSWORD,
        },
        name="/api/auth/admin/register",
    )
    if reg.status_code in (200, 201) and "token" in reg.json():
        return reg.json()["token"]

    print("[locust] WARNING: could not obtain an admin token; authenticated "
          "tasks will return 401. Set LOCUST_TOKEN to a valid admin JWT.")
    return None


class ShopSenseUser(HttpUser):
    """Simulated ShopSense analytics user.

    Weightings roughly mirror a real analytics workload: users browse products
    and check health far more often than they pull the heavier aggregation-heavy
    analytics endpoints.
    """

    wait_time = between(1, 3)

    def on_start(self):
        """Resolve the auth token once per simulated user."""
        token = os.environ.get("LOCUST_TOKEN")
        if not token:
            token = _bootstrap_admin_token(self.client)
        self.headers = {"Authorization": f"Bearer {token}"} if token else {}

    # --- Unauthenticated / low-cost -----------------------------------------

    @task(5)
    def health(self):
        self.client.get("/health", name="/health")

    @task(5)
    def list_products(self):
        self.client.get("/api/products", headers=self.headers, name="/api/products")

    # --- Authenticated analytics (heavier aggregation pipelines) ------------

    @task(3)
    def analytics_summary(self):
        self.client.get(
            "/api/analytics/summary", headers=self.headers, name="/api/analytics/summary"
        )

    @task(3)
    def revenue_by_vendor(self):
        self.client.get(
            "/api/analytics/revenue", headers=self.headers, name="/api/analytics/revenue"
        )

    @task(2)
    def chart_analytics(self):
        self.client.get(
            "/api/analytics/chart", headers=self.headers, name="/api/analytics/chart"
        )

    @task(1)
    def revenue_analysis(self):
        self.client.get(
            "/api/analytics/revenue-analysis",
            headers=self.headers,
            name="/api/analytics/revenue-analysis",
        )

    @task(1)
    def benchmark(self):
        self.client.get(
            "/api/analytics/benchmark", headers=self.headers, name="/api/analytics/benchmark"
        )
