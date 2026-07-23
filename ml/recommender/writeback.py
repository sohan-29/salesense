"""Batch write-back: persist ML recommendations to MongoDB for the live app.

The Node/Express app reads the `ml_recommendations` collection as a cache
(freshness-gated; see backend/src/controllers/recommendationController.js)
and falls back to its in-process JS CF engine when the cache is missing or
stale. This module populates that cache for every customer, for a chosen
model, so the ML model actually drives what customers see.

Run via the CLI:
    python -m recommender.cli refresh --model svd --limit 5
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from pymongo import MongoClient

from .data import Dataset, get_mongo_uri, load_dataset
from .models import BaseRecommender, SVDRecommender, ItemCosineRecommender, popular_fallback

DEFAULT_DB = "shopsense"
COLLECTION = "ml_recommendations"


@dataclass
class RefreshResult:
    model: str
    customers_written: int
    rows_replaced: int
    limit: int


def _build_model(name: str, n_components: int) -> BaseRecommender:
    if name == "svd":
        return SVDRecommender(n_components=n_components)
    if name == "cosine":
        return ItemCosineRecommender()
    raise ValueError(f"Unsupported model for write-back: {name} (use svd or cosine)")


def refresh_recommendations(
    model_name: str = "svd",
    k: int = 5,
    n_components: int = 20,
    db_name: str = DEFAULT_DB,
    uri: Optional[str] = None,
) -> RefreshResult:
    """Compute top-k recs for every customer and write them to MongoDB.

    - Trains the chosen model on FULL history (no train/test split — this is
      live inference, not backtesting).
    - For each customer: top-k recs excluding owned products.
    - Cold-start (no CF signal) customers get a `popular` row so the UI still
      shows something; the Node freshness gate treats all rows uniformly.
    - Rows are upserted by (customerId, model) so re-running replaces cleanly.
    """
    uri = uri or get_mongo_uri()
    dataset = load_dataset(uri, db_name)
    model = _build_model(model_name, n_components)
    model.fit(dataset)

    client = MongoClient(uri, serverSelectionTimeoutMS=10000)
    db = client[db_name]
    coll = db[COLLECTION]

    # generatedAt is the freshness anchor the Node controller checks against
    # the customer's newest purchase. Set explicitly because raw pymongo writes
    # bypass Mongoose's timestamps middleware.
    generated_at = datetime.now(tz=timezone.utc)

    written = 0
    for c in range(dataset.n_customers):
        recs = model.recommend(c, k=k, exclude_owned=True)
        reason_prefix = model.name  # 'svd' or 'cosine'
        if not recs:
            # Cold-start: popular fallback so the customer still gets recs.
            recs = popular_fallback(dataset, k=k)

        items = []
        for r in recs:
            meta = dataset.product_meta.get(r.product_idx, {})
            items.append(
                {
                    "productId": dataset.product_ids[r.product_idx],
                    "score": float(r.score),
                    "reason": r.reason if r.reason != "popular" else "popular",
                    "category": meta.get("category", "Uncategorised"),
                }
            )

        customer_hex = dataset.customer_ids[c]
        coll.replace_one(
            {"customerId": customer_hex, "model": reason_prefix},
            {
                "customerId": customer_hex,
                "model": reason_prefix,
                "generatedAt": generated_at,
                "items": items,
            },
            upsert=True,
        )
        written += 1

    client.close()
    return RefreshResult(
        model=model_name,
        customers_written=written,
        rows_replaced=written,
        limit=k,
    )
