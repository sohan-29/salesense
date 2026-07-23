"""CLI for the ShopSense ML recommender.

Usage (run from the ml/ directory, or set PYTHONPATH):

    python -m recommender.cli train [--components N] [--out artifacts/]
    python -m recommender.cli evaluate [--limit 5] [--train-ratio 0.7]
    python -m recommender.cli recommend <customerId> [--limit 5] [--model svd|cosine|baseline]
    python -m recommender.cli show-models

Reads MONGO_URI from backend/.env (the same Atlas connection the Node app uses).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Optional

import joblib

from .data import Dataset, get_mongo_uri, load_dataset
from .models import build_all, popular_fallback
from .backtest import run_backtest, format_report
from .writeback import refresh_recommendations, RefreshResult

DEFAULT_ARTIFACTS_DIR = "artifacts"
MODEL_FILE = "models.joblib"
META_FILE = "meta.json"


def _artifacts_dir(out: str) -> str:
    os.makedirs(out, exist_ok=True)
    return out


def _save_artifacts(models, dataset: Dataset, out: str, components: int) -> None:
    """Persist fitted models + the index maps (NOT the full data) for `recommend`."""
    out = _artifacts_dir(out)
    # Save the lightweight models; they carry the latent factors / similarity.
    joblib.dump(models, os.path.join(out, MODEL_FILE))
    meta = {
        "customer_ids": dataset.customer_ids,
        "product_ids": dataset.product_ids,
        "product_meta": dataset.product_meta,
        "n_components": components,
        "note": "regenerable from Atlas via `python -m recommender.cli train`",
    }
    with open(os.path.join(out, META_FILE), "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=2)


def _load_artifacts(out: str):
    """Return (models, Dataset-shell-with-index-maps-only) for inference."""
    model_path = os.path.join(out, MODEL_FILE)
    meta_path = os.path.join(out, META_FILE)
    if not (os.path.exists(model_path) and os.path.exists(meta_path)):
        raise FileNotFoundError(
            f"No trained models in {out}. Run `python -m recommender.cli train` first."
        )
    models = joblib.load(model_path)
    with open(meta_path, "r", encoding="utf-8") as fh:
        meta = json.load(fh)
    # Minimal Dataset carrying just the index maps the recommenders need for
    # owned_products()/product_meta lookups during inference. The recommenders
    # also need a matrix for owned lookups — we rebuild it from Atlas lazily.
    return models, meta


def _model_by_name(models, name: str):
    for m in models:
        if m.name == name:
            return m
    raise SystemExit(f"Unknown model '{name}'. Trained: {[m.name for m in models]}")


def cmd_train(args) -> None:
    print("Loading data from Atlas...")
    uri = get_mongo_uri()
    dataset = load_dataset(uri)
    print(
        f"Loaded {len(dataset.interactions)} interactions, "
        f"{dataset.n_customers} customers, {dataset.n_products} products."
    )
    print(f"Fitting models (SVD components={args.components}, cosine, baseline)...")
    models = build_all(dataset, n_components=args.components)
    _save_artifacts(models, dataset, args.out, args.components)
    print(f"Saved trained models to {os.path.join(args.out, MODEL_FILE)}")
    for m in models:
        print(f"  - {m.name}")


def cmd_evaluate(args) -> None:
    print("Loading data from Atlas...")
    uri = get_mongo_uri()
    dataset = load_dataset(uri)
    print(
        f"Loaded {len(dataset.interactions)} interactions, "
        f"{dataset.n_customers} customers, {dataset.n_products} products."
    )
    # Fresh, unfitted models — run_backtest fits them on the train split.
    from .models import SVDRecommender, ItemCosineRecommender, JSCoBaseline

    models = [
        SVDRecommender(n_components=args.components),
        ItemCosineRecommender(),
        JSCoBaseline(),
    ]
    print(f"Running backtest (k={args.limit}, train_ratio={args.train_ratio})...")
    report = run_backtest(dataset, models, k=args.limit, train_ratio=args.train_ratio)
    print(format_report(report))


def cmd_recommend(args) -> None:
    models, meta = _load_artifacts(args.artifacts_dir)
    model = _model_by_name(models, args.model)

    # Inference needs the customer's owned products + product meta. Rebuild a
    # full Dataset from Atlas so owned lookups are correct (cheap on seed data).
    print("Loading data from Atlas for inference...")
    uri = get_mongo_uri()
    dataset = load_dataset(uri)
    # Re-fit the chosen model on full history so recommend() has its factors.
    model.fit(dataset)

    cidx = dataset.customer_index(args.customerId)
    if cidx is None:
        raise SystemExit(
            f"customerId {args.customerId} not found in transactions "
            f"(known: {len(dataset.customer_ids)} customers)."
        )

    recs = model.recommend(cidx, k=args.limit, exclude_owned=True)
    if not recs:
        # Cold-start -> popular fallback (matches the JS controller path).
        print(f"No CF signal for customer {args.customerId}; using popular fallback.")
        recs = popular_fallback(dataset, k=args.limit)

    print(f"\nRecommendations for customer {args.customerId} (model={model.name}, k={args.limit}):")
    print("-" * 72)
    print(f"{'#':<3} {'product':<36} {'category':<16} {'score':>8} {'reason':<12}")
    print("-" * 72)
    for i, r in enumerate(recs, 1):
        meta_p = dataset.product_meta.get(r.product_idx, {})
        name = (meta_p.get("name") or "")[:35]
        cat = (meta_p.get("category") or "")[:15]
        print(f"{i:<3} {name:<36} {cat:<16} {r.score:>8.3f} {r.reason:<12}")


def cmd_show_models(args) -> None:
    meta_path = os.path.join(args.artifacts_dir, META_FILE)
    model_path = os.path.join(args.artifacts_dir, MODEL_FILE)
    if not os.path.exists(meta_path) or not os.path.exists(model_path):
        print(f"No trained models in {args.artifacts_dir}.")
        print("Run: python -m recommender.cli train")
        return
    models = joblib.load(model_path)
    with open(meta_path, "r", encoding="utf-8") as fh:
        meta = json.load(fh)
    print("Trained models:")
    for m in models:
        print(f"  - {m.name}: {type(m).__name__}")
    print(f"\nn_components (SVD): {meta.get('n_components')}")
    print(f"customers indexed: {len(meta.get('customer_ids', []))}")
    print(f"products indexed: {len(meta.get('product_ids', []))}")


def cmd_refresh(args) -> None:
    """Compute recs for every customer and write them to MongoDB (batch write-back)."""
    print("Loading data from Atlas...")
    result = refresh_recommendations(
        model_name=args.model,
        k=args.limit,
        n_components=args.components,
    )
    print(
        f"Wrote {result.customers_written} recommendation rows to "
        f"the `ml_recommendations` collection (model={result.model}, k={result.limit})."
    )
    print("The Node app will serve these (freshness-gated) via GET /api/recommendations.")
    print("Re-run after data changes, or on a schedule, to refresh the cache.")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="recommender.cli",
        description="ShopSense ML product-recommendation model (Python).",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_train = sub.add_parser("train", help="Fit all three models on Atlas data and save artifacts.")
    p_train.add_argument("--components", type=int, default=20, help="SVD latent factors (default 20).")
    p_train.add_argument("--out", default=DEFAULT_ARTIFACTS_DIR, help="Artifact output dir.")
    p_train.set_defaults(func=cmd_train)

    p_eval = sub.add_parser("evaluate", help="Backtest all three models on the held-out set.")
    p_eval.add_argument("--limit", type=int, default=5, help="Top-k (default 5).")
    p_eval.add_argument("--components", type=int, default=20, help="SVD latent factors (default 20).")
    p_eval.add_argument("--train-ratio", type=float, default=0.7, help="Chronological split ratio.")
    p_eval.set_defaults(func=cmd_evaluate)

    p_rec = sub.add_parser("recommend", help="Recommend products for a customer.")
    p_rec.add_argument("customerId", help="Customer ObjectId (hex).")
    p_rec.add_argument("--limit", type=int, default=5, help="Top-k (default 5).")
    p_rec.add_argument(
        "--model",
        default="svd",
        choices=["svd", "cosine", "baseline"],
        help="Which trained model to use (default svd).",
    )
    p_rec.add_argument("--artifacts-dir", default=DEFAULT_ARTIFACTS_DIR, help="Trained-model dir.")
    p_rec.set_defaults(func=cmd_recommend)

    p_show = sub.add_parser("show-models", help="List trained models + metadata.")
    p_show.add_argument("--artifacts-dir", default=DEFAULT_ARTIFACTS_DIR, help="Trained-model dir.")
    p_show.set_defaults(func=cmd_show_models)

    p_refresh = sub.add_parser(
        "refresh",
        help="Compute recs for every customer and write them to MongoDB (batch write-back).",
    )
    p_refresh.add_argument(
        "--model",
        default="svd",
        choices=["svd", "cosine"],
        help="Which model drives the cache (default svd).",
    )
    p_refresh.add_argument("--limit", type=int, default=5, help="Top-k per customer (default 5).")
    p_refresh.add_argument("--components", type=int, default=20, help="SVD latent factors (default 20).")
    p_refresh.set_defaults(func=cmd_refresh)

    return parser


def main(argv: Optional[list[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        args.func(args)
    except FileNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 2
    except RuntimeError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 3
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001 - surface a clean CLI error
        print(f"Error: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
