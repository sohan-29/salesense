"""Recommendation models for ShopSense.

Three estimators sharing one interface so the backtest and CLI treat them
uniformly:

    fit(dataset) -> self
    recommend(customer_idx, k, exclude_owned=True) -> list[Recommendation]

1. SVDRecommender        — TruncatedSVD matrix factorization (the ML model).
2. ItemCosineRecommender — item-item collaborative filtering (cosine sim).
3. JSCoBaseline          — reimplementation of backend/src/utils/recommend.js
                           collaborativeScore (co-purchase overlap counting).

All three leave cold-start (empty rec set) to the caller; the backtest counts
only CF-served customers in the denominator, matching the JS relevance metric.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import numpy as np
from scipy.sparse import csr_matrix
from sklearn.decomposition import TruncatedSVD
from sklearn.metrics.pairwise import cosine_similarity


@dataclass
class Recommendation:
    product_idx: int
    score: float
    reason: str
    category: Optional[str] = None


class BaseRecommender:
    """Shared interface + name. Subclasses implement fit/recommend."""

    name: str = "base"

    def fit(self, dataset) -> "BaseRecommender":
        raise NotImplementedError

    def recommend(self, customer_idx: int, k: int = 5, exclude_owned: bool = True) -> list[Recommendation]:
        raise NotImplementedError


class SVDRecommender(BaseRecommender):
    """Matrix factorization via TruncatedSVD on the customer x product matrix.

    Learns latent factors U (customers) and V (products); predicted score for
    (c, p) = dot(U[c], V[p]). Top-k per customer excludes already-owned items.
    """

    name = "svd"

    def __init__(self, n_components: int = 20, random_state: int = 42):
        self.n_components = n_components
        self.random_state = random_state
        self.svd: Optional[TruncatedSVD] = None
        self.customer_factors: Optional[np.ndarray] = None  # U
        self.product_factors: Optional[np.ndarray] = None  # V (components.T)
        self._dataset = None

    def fit(self, dataset) -> "SVDRecommender":
        self._dataset = dataset
        n_components = min(self.n_components, max(1, dataset.n_products - 1))
        self.svd = TruncatedSVD(
            n_components=n_components,
            random_state=self.random_state,
            algorithm="arpack" if n_components < min(dataset.matrix.shape) else "randomized",
        )
        # Fit on the units-weighted matrix.
        self.customer_factors = self.svd.fit_transform(dataset.matrix)  # [n_c, k]
        self.product_factors = self.svd.components_.T  # [n_p, k]
        return self

    def recommend(self, customer_idx: int, k: int = 5, exclude_owned: bool = True) -> list[Recommendation]:
        if self.customer_factors is None or self._dataset is None:
            return []
        u = self.customer_factors[customer_idx]  # [k]
        scores = self.product_factors @ u  # [n_p]
        if exclude_owned:
            owned = self._dataset.owned_products(customer_idx)
            for pid in owned:
                scores[pid] = -np.inf
        top = np.argpartition(-scores, range(min(k, len(scores))))[:k]
        # Sort the top-k slice by score desc.
        top = top[np.argsort(-scores[top])]
        out = []
        for pid in top:
            if not np.isfinite(scores[pid]):
                continue
            out.append(
                Recommendation(
                    product_idx=int(pid),
                    score=float(round(scores[pid], 6)),
                    reason="svd",
                    category=self._dataset.product_meta.get(pid, {}).get("category"),
                )
            )
        return out


class ItemCosineRecommender(BaseRecommender):
    """Item-item collaborative filtering with cosine similarity.

    Product column-vectors (over customers) of the binary interaction matrix
    give an item-item similarity; score(p) = sum over owned o of sim(p, o).
    """

    name = "cosine"

    def __init__(self):
        self.similarity: Optional[np.ndarray] = None  # [n_p, n_p]
        self._dataset = None

    def fit(self, dataset) -> "ItemCosineRecommender":
        self._dataset = dataset
        # Items are columns of the binary matrix; similarity is item x item.
        item_vectors = dataset.binary_matrix.T  # [n_p, n_c]
        # Dense is fine for the seeded scale; kept general via cosine_similarity.
        self.similarity = cosine_similarity(item_vectors)
        np.fill_diagonal(self.similarity, 0.0)  # don't recommend an item via itself
        return self

    def recommend(self, customer_idx: int, k: int = 5, exclude_owned: bool = True) -> list[Recommendation]:
        if self.similarity is None or self._dataset is None:
            return []
        owned = self._dataset.owned_products(customer_idx)
        if not owned:
            return []
        owned_vec = np.zeros(self._dataset.n_products, dtype=np.float64)
        for pid in owned:
            owned_vec[pid] = 1.0
        scores = self.similarity @ owned_vec  # [n_p]
        if exclude_owned:
            for pid in owned:
                scores[pid] = -np.inf
        top = np.argpartition(-scores, range(min(k, len(scores))))[:k]
        top = top[np.argsort(-scores[top])]
        out = []
        for pid in top:
            if not np.isfinite(scores[pid]) or scores[pid] <= 0:
                continue
            out.append(
                Recommendation(
                    product_idx=int(pid),
                    score=float(round(scores[pid], 6)),
                    reason="cosine",
                    category=self._dataset.product_meta.get(pid, {}).get("category"),
                )
            )
        return out


class JSCoBaseline(BaseRecommender):
    """Reimplementation of backend/src/utils/recommend.js collaborativeScore.

    For the target customer, find other customers sharing >=1 purchased product
    (co-purchasers); score every product bought by them by the sum of co-purchase
    overlap counts, excluding products the target already owns.
    """

    name = "baseline"

    def __init__(self):
        self._dataset = None
        self._customer_products: list[set] = []  # customer_idx -> set(product_idx)

    def fit(self, dataset) -> "JSCoBaseline":
        self._dataset = dataset
        self._customer_products = []
        for c in range(dataset.n_customers):
            self._customer_products.append(dataset.owned_products(c))
        return self

    def recommend(self, customer_idx: int, k: int = 5, exclude_owned: bool = True) -> list[Recommendation]:
        if self._dataset is None:
            return []
        owned = self._customer_products[customer_idx]
        if not owned:
            return []
        scores: dict[int, float] = {}
        for other in range(self._dataset.n_customers):
            if other == customer_idx:
                continue
            their = self._customer_products[other]
            overlap = len(owned & their)
            if overlap == 0:
                continue
            for p in their:
                if p in owned:
                    continue
                scores[p] = scores.get(p, 0.0) + overlap
        ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)[:k]
        return [
            Recommendation(
                product_idx=int(pid),
                score=float(round(score, 6)),
                reason="collaborative",
                category=self._dataset.product_meta.get(pid, {}).get("category"),
            )
            for pid, score in ranked
        ]


def popular_fallback(dataset, k: int = 5) -> list[Recommendation]:
    """Cold-start fallback matching backend popularProducts: top units sold."""
    totals = np.asarray(dataset.matrix.sum(axis=0)).ravel()  # [n_p]
    top = np.argpartition(-totals, range(min(k, len(totals))))[:k]
    top = top[np.argsort(-totals[top])]
    return [
        Recommendation(
            product_idx=int(pid),
            score=float(totals[pid]),
            reason="popular",
            category=dataset.product_meta.get(pid, {}).get("category"),
        )
        for pid in top
        if totals[pid] > 0
    ]


def build_all(dataset, n_components: int = 20) -> list[BaseRecommender]:
    """Fit all three models and return them (for comparison)."""
    return [
        SVDRecommender(n_components=n_components).fit(dataset),
        ItemCosineRecommender().fit(dataset),
        JSCoBaseline().fit(dataset),
    ]
