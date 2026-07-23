"""Data loading + matrix construction for the ShopSense recommender.

Reads non-cancelled, customer-attributed transactions from MongoDB Atlas
(the same DB the Node app uses) and builds the customer x product interaction
matrix the models train on. Mirrors the matching done in
backend/src/utils/recommend.js (buildPurchaseGraph) and the split logic in
backend/src/utils/validation.js (runValidation).
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Iterable

import numpy as np
from pymongo import MongoClient
from scipy.sparse import csr_matrix

try:
    # Optional: load MONGO_URI from backend/.env if present.
    from dotenv import load_dotenv

    _BACKEND_ENV = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "backend",
        ".env",
    )
    if os.path.exists(_BACKEND_ENV):
        load_dotenv(_BACKEND_ENV)
except Exception:
    # dotenv not installed -> fall back to the environment / a manual parse.
    _BACKEND_ENV = None


DEFAULT_DB = "shopsense"


def get_mongo_uri() -> str:
    """Return the MONGO_URI the Node app uses (from backend/.env or env)."""
    uri = os.environ.get("MONGO_URI")
    if uri:
        return uri
    # Manual fallback parse of backend/.env so the CLI works without dotenv.
    backend_env = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "backend",
        ".env",
    )
    if os.path.exists(backend_env):
        with open(backend_env, "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line.startswith("MONGO_URI="):
                    return line[len("MONGO_URI="):].strip().strip('"').strip("'")
    raise RuntimeError(
        "MONGO_URI not found. Set it in backend/.env or as an env var."
    )


@dataclass
class Interaction:
    """One customer-product purchase event used for training/eval."""

    customer_idx: int
    product_idx: int
    units: int
    amount: float
    date: datetime


@dataclass
class Dataset:
    """Everything the models + backtest need, built once from Atlas."""

    interactions: list  # list[Interaction], sorted by date ascending
    customer_ids: list  # hex strings, index -> _id
    product_ids: list  # hex strings, index -> _id
    product_meta: dict  # product_idx -> {name, category, price, status}
    matrix: csr_matrix  # [n_customers, n_products], weight = units
    binary_matrix: csr_matrix  # same shape, weight = 1 (for cosine CF)

    @property
    def n_customers(self) -> int:
        return len(self.customer_ids)

    @property
    def n_products(self) -> int:
        return len(self.product_ids)

    def customer_index(self, customer_hex: str) -> int | None:
        try:
            return self.customer_ids.index(str(customer_hex))
        except ValueError:
            return None

    def product_index(self, product_hex: str) -> int | None:
        try:
            return self.product_ids.index(str(product_hex))
        except ValueError:
            return None

    def owned_products(self, customer_idx: int) -> set:
        """Set of product_idx a customer has bought."""
        row = self.matrix.getrow(customer_idx)
        return set(row.indices.tolist())


def _load_raw(uri: str, db_name: str):
    """Pull non-cancelled customer-attributed txns + active products from Atlas."""
    client = MongoClient(uri, serverSelectionTimeoutMS=10000)
    db = client[db_name]

    txn_cursor = db.transactions.find(
        {"status": {"$ne": "cancelled"}, "customerId": {"$ne": None}},
        {
            "customerId": 1,
            "productId": 1,
            "quantity": 1,
            "totalAmount": 1,
            "date": 1,
            "_id": 0,
        },
    ).sort("date", 1)

    txns = []
    for t in txn_cursor:
        if t.get("customerId") is None or t.get("productId") is None:
            continue
        txns.append(
            {
                "customerId": str(t["customerId"]),
                "productId": str(t["productId"]),
                "quantity": int(t.get("quantity", 1) or 1),
                "totalAmount": float(t.get("totalAmount", 0) or 0),
                "date": t["date"],
            }
        )

    products = {}
    for p in db.products.find({}, {"name": 1, "category": 1, "price": 1, "status": 1}):
        products[str(p["_id"])] = {
            "name": p.get("name", ""),
            "category": p.get("category", "Uncategorised"),
            "price": float(p.get("price", 0) or 0),
            "status": p.get("status", "active"),
        }

    client.close()
    return txns, products


def load_dataset(uri: str | None = None, db_name: str = DEFAULT_DB) -> Dataset:
    """Connect to Atlas, pull data, build the interaction matrices."""
    uri = uri or get_mongo_uri()
    txns, products = _load_raw(uri, db_name)

    if not txns:
        raise RuntimeError(
            "No customer-attributed transactions found. Run `npm run seed` in backend first."
        )

    # Stable index maps (sorted for determinism).
    customer_ids = sorted({t["customerId"] for t in txns})
    product_ids = sorted({t["productId"] for t in txns})
    c_pos = {c: i for i, c in enumerate(customer_ids)}
    p_pos = {p: i for i, p in enumerate(product_ids)}

    interactions: list[Interaction] = []
    for t in txns:
        interactions.append(
            Interaction(
                customer_idx=c_pos[t["customerId"]],
                product_idx=p_pos[t["productId"]],
                units=t["quantity"],
                amount=t["totalAmount"],
                date=t["date"],
            )
        )

    # Dense enough for the seeded dataset; scipy.sparse keeps it general.
    units = np.zeros((len(customer_ids), len(product_ids)), dtype=np.float64)
    binary = np.zeros((len(customer_ids), len(product_ids)), dtype=np.float64)
    for it in interactions:
        units[it.customer_idx, it.product_idx] += it.units
        binary[it.customer_idx, it.product_idx] = 1.0

    product_meta = {p_pos[pid]: meta for pid, meta in products.items() if pid in p_pos}
    # Products that appear in txns but have no Product doc (shouldn't happen on
    # a seeded DB; guard anyway).
    for pid, idx in p_pos.items():
        if idx not in product_meta:
            product_meta[idx] = {
                "name": f"(missing {pid})",
                "category": "Uncategorised",
                "price": 0.0,
                "status": "unknown",
            }

    return Dataset(
        interactions=interactions,
        customer_ids=customer_ids,
        product_ids=product_ids,
        product_meta=product_meta,
        matrix=csr_matrix(units),
        binary_matrix=csr_matrix(binary),
    )


def split_date_for_ratio(interactions: Iterable[Interaction], train_ratio: float = 0.7) -> datetime:
    """Chronological split date matching JS runValidation (earliest + span*ratio).

    Returns a datetime with the same tz-awareness as the source dates so the
    train/test comparisons (it.date < split_date) don't mix naive + aware.
    """
    dates = [it.date for it in interactions]
    if not dates:
        return datetime.now(tz=timezone.utc)
    earliest = min(dates)
    latest = max(dates)
    span = (latest - earliest).total_seconds()
    # JS uses earliest + span*trainRatio (ms). Mirror exactly, preserving tz.
    split_ts = earliest.timestamp() + span * train_ratio
    if earliest.tzinfo is not None:
        return datetime.fromtimestamp(split_ts, tz=earliest.tzinfo)
    # Mongo stores Date as naive UTC; keep it naive to match the source dates.
    return datetime.utcfromtimestamp(split_ts)
