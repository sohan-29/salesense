"""K-Means customer segmentation for ShopSense (Milestone 4).

Trains a real scikit-learn segmentation model — StandardScaler + KMeans over
RFM features — and writes the resulting per-customer cluster labels back to
MongoDB so the Node/Express app can serve them from the live
GET /api/customers/segments endpoint (freshness-gated; the JS RFM rules in
backend/src/utils/segmentation.js remain as the fallback when the cache is
missing or stale). Mirrors the MLRecommendation write-back pattern
(ml/recommender/writeback.py).

Pipeline:
    1. Pull non-cancelled, customer-attributed transactions + customer docs
       from Atlas (same source of truth as the JS analytics).
    2. Compute per-customer features: totalSpend, orderCount, avgOrderValue,
       recencyDays. Never-purchased customers get a sentinel recency so they
       cluster into the low-engagement region.
    3. StandardScaler + KMeans. k is swept 2..min(8, n-1) and chosen by the
       best silhouette score (data-driven, adapts as the dataset grows).
    4. Auto-label clusters from their centroids: Premium / Regular / New /
       Inactive (deterministic ranking by a value score).
    5. Upsert one row per customer into the `ml_segments` collection.

Run via the CLI:
    python -m recommender.cli segment-refresh
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

import numpy as np
from bson import ObjectId
from pymongo import MongoClient
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import StandardScaler

from .data import get_mongo_uri

DEFAULT_DB = "shopsense"
COLLECTION = "ml_segments"
MODEL_NAME = "kmeans"

# Feature order used everywhere in this module.
FEATURES = ["totalSpend", "orderCount", "avgOrderValue", "recencyDays"]

# Cluster labels, ranked best-to-worst engagement. K-Means produces cluster
# ids, not business names; label_clusters() maps ids to these deterministically.
LABELS = ["premium", "regular", "new", "inactive"]

# Minimum customers worth clustering. Below this, K-Means is statistically
# meaningless — the caller should keep the JS rules fallback instead.
MIN_CUSTOMERS = 4

# Sentinel recency (days) for customers who never purchased: older than any
# realistic gap so they land in the low-engagement region of feature space.
NEVER_PURCHASED_RECENCY = 365

DAY_MS = 24 * 60 * 60 * 1000


@dataclass
class CustomerFeatures:
    """Per-customer RFM feature vector (pre-scaling)."""

    customer_hex: str
    totalSpend: float
    orderCount: int
    avgOrderValue: float
    recencyDays: Optional[int]  # None = never purchased
    joinedDaysAgo: int


@dataclass
class SegmentRefreshResult:
    model: str
    k: int
    silhouette: float
    customers_written: int
    labels: dict = field(default_factory=dict)  # cluster id -> label
    skipped: Optional[str] = None  # set when clustering was skipped


def _load_customers(db):
    """All customer docs (id + createdAt) — segmentation covers everyone, not
    only purchasers, so new/inactive customers get clustered too."""
    out = {}
    for c in db.customers.find({}, {"createdAt": 1}):
        created = c.get("createdAt")
        out[str(c["_id"])] = created if isinstance(created, datetime) else None
    return out


def _load_transaction_metrics(db):
    """Per-customer spend/order aggregates over non-cancelled, attributed txns.
    Mirrors the $group in backend/src/utils/segmentation.js customerMetrics."""
    pipeline = [
        {"$match": {"status": {"$ne": "cancelled"}, "customerId": {"$ne": None}}},
        {
            "$group": {
                "_id": "$customerId",
                "orderCount": {"$sum": 1},
                "totalSpend": {"$sum": "$totalAmount"},
                "lastPurchaseDate": {"$max": "$date"},
            }
        },
    ]
    metrics = {}
    for row in db.transactions.aggregate(pipeline):
        metrics[str(row["_id"])] = row
    return metrics


def build_customer_features(db, now: Optional[datetime] = None) -> list[CustomerFeatures]:
    """Compute RFM features for every customer (purchasers and non-purchasers)."""
    now = now or datetime.now(tz=timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)

    customers = _load_customers(db)
    metrics = _load_transaction_metrics(db)

    out: list[CustomerFeatures] = []
    for hex_id, created in customers.items():
        m = metrics.get(hex_id)
        if m:
            last = m["lastPurchaseDate"]
            # Mongo stores naive UTC; normalise both sides to aware UTC.
            if last.tzinfo is None:
                last = last.replace(tzinfo=timezone.utc)
            if now.tzinfo is None:
                now_cmp = now.replace(tzinfo=timezone.utc)
            else:
                now_cmp = now
            recency = max(0, (now_cmp - last).days)
            order_count = int(m["orderCount"])
            total_spend = float(m["totalSpend"] or 0)
        else:
            recency = None
            order_count = 0
            total_spend = 0.0

        joined_days_ago = 0
        if created is not None:
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            joined_days_ago = max(0, (now - created).days)

        out.append(
            CustomerFeatures(
                customer_hex=hex_id,
                totalSpend=total_spend,
                orderCount=order_count,
                avgOrderValue=(total_spend / order_count) if order_count else 0.0,
                recencyDays=recency,
                joinedDaysAgo=joined_days_ago,
            )
        )
    return out


def _feature_matrix(features: list[CustomerFeatures]):
    """N x 4 matrix with never-purchased recency mapped to the sentinel."""
    rows = []
    for f in features:
        recency = f.recencyDays if f.recencyDays is not None else NEVER_PURCHASED_RECENCY
        rows.append([f.totalSpend, f.orderCount, f.avgOrderValue, recency])
    return np.array(rows, dtype=np.float64)


def fit_kmeans(features: list[CustomerFeatures], k: Optional[int] = None, random_state: int = 42):
    """StandardScaler + KMeans. If k is None, sweep 2..min(8, n-1) and pick
    the best silhouette score. Returns (scaler, kmeans, k, silhouette, labels)."""
    X = _feature_matrix(features)
    if len(features) < MIN_CUSTOMERS:
        raise ValueError(
            f"Not enough customers to cluster ({len(features)} < {MIN_CUSTOMERS}); "
            "the JS rules fallback should be used instead."
        )

    scaler = StandardScaler()
    Xs = scaler.fit_transform(X)

    max_k = min(8, len(features) - 1)
    candidates = [k] if k else range(2, max_k + 1)
    candidates = [c for c in candidates if 2 <= c <= max_k]
    if not candidates:
        candidates = [2]

    best = None
    for cand in candidates:
        km = KMeans(n_clusters=cand, n_init=10, random_state=random_state)
        labels = km.fit_predict(Xs)
        if len(set(labels.tolist())) < 2:
            continue
        sil = float(silhouette_score(Xs, labels))
        if best is None or sil > best[3]:
            best = (scaler, km, cand, sil, labels)

    if best is None:  # degenerate: every k collapsed to one cluster
        km = KMeans(n_clusters=2, n_init=10, random_state=random_state)
        labels = km.fit_predict(Xs)
        best = (scaler, km, 2, 0.0, labels)

    scaler, km, chosen_k, sil, labels = best
    return scaler, km, chosen_k, sil, labels


def label_clusters(scaler: StandardScaler, km: KMeans) -> dict:
    """Map cluster ids to business labels from their centroids (deterministic).

    Rank clusters by a value score — scaled (spend + orders + aov - recency) —
    so the most valuable cluster is `premium`, the next `regular`. Among the
    rest, the highest mean recency is `inactive`; any remainder is `new`.
    Ties break by cluster index for reproducibility.
    """
    centers_scaled = km.cluster_centers_  # [k, 4] in scaled space
    # Invert the scaling to interpret centroids in raw units.
    centers = scaler.inverse_transform(centers_scaled)

    value_scores = []
    for idx, c in enumerate(centers):
        spend, orders, aov, recency = c[0], c[1], c[2], c[3]
        # Weighted engagement score; recency counts against value.
        value_scores.append((idx, spend + 50 * orders + 10 * aov - 5 * max(0.0, recency)))

    value_scores.sort(key=lambda t: (-t[1], t[0]))  # value desc, then cluster id

    labels: dict[int, str] = {}
    remaining = [idx for idx, _ in value_scores]
    if remaining:
        labels[remaining.pop(0)] = "premium"
    if remaining:
        labels[remaining.pop(0)] = "regular"
    if remaining:
        # Highest mean recency among the rest -> inactive.
        rest_sorted = sorted(remaining, key=lambda i: (-centers[i][3], i))
        labels[rest_sorted[0]] = "inactive"
        for idx in rest_sorted[1:]:
            labels[idx] = "new"
    return labels


def refresh_segments(
    k: Optional[int] = None,
    db_name: str = DEFAULT_DB,
    uri: Optional[str] = None,
) -> SegmentRefreshResult:
    """Train K-Means on live Atlas data and upsert per-customer labels to
    the `ml_segments` collection (read by the Node segmentCustomers controller)."""
    uri = uri or get_mongo_uri()
    client = MongoClient(uri, serverSelectionTimeoutMS=10000)
    db = client[db_name]
    coll = db[COLLECTION]

    try:
        features = build_customer_features(db)
        if len(features) < MIN_CUSTOMERS:
            return SegmentRefreshResult(
                model=MODEL_NAME,
                k=0,
                silhouette=0.0,
                customers_written=0,
                skipped=f"only {len(features)} customers (<{MIN_CUSTOMERS})",
            )

        scaler, km, chosen_k, sil, labels = fit_kmeans(features, k=k)
        cluster_labels = label_clusters(scaler, km)

        # generatedAt is the freshness anchor the Node controller checks.
        # Set explicitly because raw pymongo writes bypass Mongoose's
        # timestamps middleware (same gotcha as writeback.py).
        generated_at = datetime.now(tz=timezone.utc)

        written = 0
        for f, cluster in zip(features, labels):
            coll.replace_one(
                {"customerId": ObjectId(f.customer_hex)},
                {
                    "customerId": ObjectId(f.customer_hex),
                    "cluster": int(cluster),
                    "segment": cluster_labels[int(cluster)],
                    "features": {
                        "totalSpend": f.totalSpend,
                        "orderCount": f.orderCount,
                        "avgOrderValue": round(f.avgOrderValue, 2),
                        "recencyDays": f.recencyDays,
                    },
                    "model": MODEL_NAME,
                    "k": chosen_k,
                    "silhouette": round(sil, 4),
                    "generatedAt": generated_at,
                },
                upsert=True,
            )
            written += 1

        return SegmentRefreshResult(
            model=MODEL_NAME,
            k=chosen_k,
            silhouette=sil,
            customers_written=written,
            labels=cluster_labels,
        )
    finally:
        client.close()
