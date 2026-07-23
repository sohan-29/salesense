"""Backtesting for the ShopSense recommenders.

Mirrors the held-out protocol in backend/src/utils/validation.js
(recommendationRelevance) so Python results are directly comparable to the
JS /api/analytics/validate `recommendationRelevance` metric (concept-note
threshold 0.75; ~1.0 on the seeded dataset).

Protocol:
  - Split customer-attributed transactions chronologically 70/30.
  - Build a TRAIN dataset (interactions before split_date) and fit models on it.
  - For each customer with >=2 purchases overall, hold out their newest
    post-split purchase.
  - A "hit" = the held-out product, OR a same-category product, appears in the
    model's top-k recommendations.
  - Relevance = hits / evaluated, where "evaluated" counts only customers the
    model actually served (non-empty rec set) — cold-start falls through to
    the popular fallback and is excluded from the denominator (precision@k,
    matching the JS metric).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

import numpy as np
from scipy.sparse import csr_matrix

from .data import Dataset, Interaction, split_date_for_ratio
from .models import BaseRecommender, Recommendation, popular_fallback


@dataclass
class ModelResult:
    name: str
    relevance: float
    evaluated: int
    hits: int
    candidates: int
    recommendations_per_customer: dict = field(default_factory=dict)


@dataclass
class BacktestReport:
    split_date: datetime
    train_size: int
    test_size: int
    n_customers: int
    n_products: int
    k: int
    threshold: float
    models: list  # list[ModelResult]
    popular_relevance: float


def _build_train_dataset(full: Dataset, split_date: datetime) -> Dataset:
    """Rebuild a Dataset from only the interactions before split_date."""
    train_interactions = [it for it in full.interactions if it.date < split_date]
    if not train_interactions:
        raise RuntimeError("No training interactions before the split date.")

    # Keep the SAME index maps as `full` so product_idx/customer_idx line up.
    units = np.zeros((full.n_customers, full.n_products), dtype=np.float64)
    binary = np.zeros((full.n_customers, full.n_products), dtype=np.float64)
    for it in train_interactions:
        units[it.customer_idx, it.product_idx] += it.units
        binary[it.customer_idx, it.product_idx] = 1.0

    return Dataset(
        interactions=train_interactions,
        customer_ids=full.customer_ids,
        product_ids=full.product_ids,
        product_meta=full.product_meta,
        matrix=csr_matrix(units),
        binary_matrix=csr_matrix(binary),
    )


def _held_out_purchase(
    full: Dataset, customer_idx: int, split_date: datetime
) -> Optional[tuple[int, str]]:
    """Newest post-split purchase for a customer -> (product_idx, category)."""
    post = [
        it for it in full.interactions
        if it.customer_idx == customer_idx and it.date >= split_date
    ]
    if not post:
        return None
    latest = max(post, key=lambda it: it.date)
    cat = full.product_meta.get(latest.product_idx, {}).get("category", "Uncategorised")
    return latest.product_idx, cat


def _customers_with_min_purchases(full: Dataset, split_date: datetime, min_orders: int = 2) -> list[int]:
    """Customer indices with >= min_orders purchases overall (mirrors JS eligible)."""
    counts: dict[int, int] = {}
    for it in full.interactions:
        counts[it.customer_idx] = counts.get(it.customer_idx, 0) + 1
    return [c for c, n in counts.items() if n >= min_orders]


def _is_hit(recs: list[Recommendation], held_product_idx: int, held_category: str, full: Dataset) -> bool:
    rec_ids = {r.product_idx for r in recs}
    if held_product_idx in rec_ids:
        return True
    # Same-category hit: a recommended product shares the held-out category.
    return any(
        full.product_meta.get(r.product_idx, {}).get("category") == held_category
        for r in recs
    )


def _evaluate_model(
    model: BaseRecommender,
    full: Dataset,
    eligible: list[int],
    split_date: datetime,
    k: int,
) -> ModelResult:
    hits = 0
    evaluated = 0
    candidates = 0
    per_customer: dict[str, list] = {}

    for c in eligible:
        held = _held_out_purchase(full, c, split_date)
        if held is None:
            continue
        candidates += 1
        held_pid, held_cat = held

        recs = model.recommend(c, k=k, exclude_owned=True)
        # Cold-start (empty rec set) -> not counted in denominator, matching JS.
        if not recs:
            continue
        evaluated += 1

        per_customer[full.customer_ids[c]] = [
            {"product_idx": r.product_idx, "score": r.score, "reason": r.reason}
            for r in recs
        ]
        if _is_hit(recs, held_pid, held_cat, full):
            hits += 1

    relevance = hits / evaluated if evaluated else 0.0
    return ModelResult(
        name=model.name,
        relevance=round(relevance, 3),
        evaluated=evaluated,
        hits=hits,
        candidates=candidates,
        recommendations_per_customer=per_customer,
    )


def _evaluate_popular(full: Dataset, eligible: list[int], split_date: datetime, k: int) -> float:
    """Popular-fallback baseline on the same held-out set (informational)."""
    recs = popular_fallback(full, k=k)
    if not recs:
        return 0.0
    hits = 0
    evaluated = 0
    for c in eligible:
        held = _held_out_purchase(full, c, split_date)
        if held is None:
            continue
        evaluated += 1
        held_pid, held_cat = held
        if _is_hit(recs, held_pid, held_cat, full):
            hits += 1
    return round(hits / evaluated, 3) if evaluated else 0.0


def run_backtest(
    dataset: Dataset,
    models: list[BaseRecommender],
    k: int = 5,
    train_ratio: float = 0.7,
) -> BacktestReport:
    """Fit each model on the train split and score it on the held-out set."""
    split_date = split_date_for_ratio(dataset.interactions, train_ratio)
    train = _build_train_dataset(dataset, split_date)

    eligible = _customers_with_min_purchases(dataset, split_date, min_orders=2)

    results: list[ModelResult] = []
    for model in models:
        model.fit(train)
        results.append(_evaluate_model(model, dataset, eligible, split_date, k))

    popular_rel = _evaluate_popular(dataset, eligible, split_date, k)

    return BacktestReport(
        split_date=split_date,
        train_size=len(train.interactions),
        test_size=len(dataset.interactions) - len(train.interactions),
        n_customers=dataset.n_customers,
        n_products=dataset.n_products,
        k=k,
        threshold=0.75,
        models=results,
        popular_relevance=popular_rel,
    )


def format_report(report: BacktestReport) -> str:
    """Human-readable comparison table for the CLI."""
    lines = []
    lines.append("=" * 72)
    lines.append("ShopSense Recommender Backtest")
    lines.append("=" * 72)
    lines.append(f"Split date (70/30 chronological): {report.split_date.isoformat()}")
    lines.append(
        f"Train interactions: {report.train_size}   Test interactions: {report.test_size}"
    )
    lines.append(f"Customers: {report.n_customers}   Products: {report.n_products}   k: {report.k}")
    lines.append(f"Concept-note threshold (relevance): {report.threshold}")
    lines.append("-" * 72)
    header = f"{'model':<12} {'relevance':>10} {'evaluated':>10} {'hits':>6} {'candidates':>11}"
    lines.append(header)
    lines.append("-" * 72)
    for m in report.models:
        lines.append(
            f"{m.name:<12} {m.relevance:>10.3f} {m.evaluated:>10} {m.hits:>6} {m.candidates:>11}"
        )
    lines.append(f"{'popular':<12} {report.popular_relevance:>10.3f} {'':>10} {'':>6} {'':>11}")
    lines.append("-" * 72)
    lines.append("relevance = hits / evaluated (CF-served customers only, precision@k)")
    lines.append("Comparable to JS /api/analytics/validate recommendationRelevance.")
    lines.append("=" * 72)
    return "\n".join(lines)
