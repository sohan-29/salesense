"""MLflow model registry + automated analytical pipeline (Milestone 3).

Logs the two trained ML models to a local MLflow tracking server so they are
versioned, reproducible, and browsable via `mlflow ui`:

  1. SVD recommender (matrix factorization) — params (n_components) + metrics
     (held-out relevance from the backtest) + the sklearn estimator artifact.
  2. LinearRegression forecaster — a NEW trained model (temporal features) with
     MAPE / accuracy metrics + the sklearn estimator artifact. This fills the
     concept-note M3 gap where forecasting was previously a moving-average
     heuristic (not a loggable trained model).

The pipeline is the "automated analytical workflow": one command loads data,
trains both models, evaluates them on held-out data, and logs everything to
MLflow. Run via:

    python -m recommender.cli mlflow-run
    mlflow ui --backend-store-uri sqlite:///ml/mlflow.db   # view the registry
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Optional

import numpy as np
from sklearn.linear_model import LinearRegression

import mlflow
import mlflow.sklearn

from .data import Dataset, get_mongo_uri, load_dataset
from .models import SVDRecommender
from .backtest import run_backtest
from .segmentation import fit_kmeans, label_clusters, build_customer_features

# Default tracking store: a persistent sqlite DB inside the ml/ dir so the
# registry survives restarts and `mlflow ui` can read it.
DEFAULT_TRACKING_URI = "sqlite:///" + os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "mlflow.db"
)
EXPERIMENT_NAME = "shopsense-analytics"
REC_MODEL_NAME = "shopsense-recommender"
FORECAST_MODEL_NAME = "shopsense-forecaster"
SEGMENTER_MODEL_NAME = "shopsense-segmenter"

DAY_MS = 24 * 60 * 60 * 1000


def _set_tracking(tracking_uri: Optional[str]) -> str:
    uri = tracking_uri or DEFAULT_TRACKING_URI
    mlflow.set_tracking_uri(uri)
    mlflow.set_experiment(EXPERIMENT_NAME)
    return uri


def _mape_accuracy(y_true, y_pred):
    """1 - MAPE over rows with actual > 0, clamped to [0,1]. Matches the JS
    validation's mapeAccuracy so the metric is comparable."""
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    nonzero = y_true > 0
    if not np.any(nonzero):
        zeros = np.sum((y_true == 0) & (y_pred == 0))
        return float(zeros / len(y_true)) if len(y_true) else 0.0
    mape = np.mean(np.abs((y_true[nonzero] - y_pred[nonzero]) / y_true[nonzero]))
    return float(max(0.0, min(1.0, 1.0 - mape)))


def _build_forecast_features(dataset: Dataset):
    """Build per-(product, day) temporal regression rows from interactions.

    Features: t (day index, trend), dow (day-of-week), is_weekend, lag1
    (previous day's units), roll7 (7-day mean up to previous day).
    Target: units sold that day.
    """
    if not dataset.interactions:
        return None, None, None

    # Aggregate units per (product_idx, day).
    dates = [it.date for it in dataset.interactions]
    earliest = min(dates)
    latest = max(dates)

    # Map (product_idx, day_index) -> units
    daily = {}
    for it in dataset.interactions:
        day_idx = (it.date - earliest).days
        key = (it.product_idx, day_idx)
        daily[key] = daily.get(key, 0) + it.units

    n_days = (latest - earliest).days + 1
    product_indices = sorted({it.product_idx for it in dataset.interactions})

    base = earliest.replace(tzinfo=None) if earliest.tzinfo else earliest
    X_rows, y_rows, meta = [], [], []
    for pidx in product_indices:
        prev = 0
        history = []
        for d in range(n_days):
            units = daily.get((pidx, d), 0)
            dow = _weekday(base, d)
            roll7 = (sum(history[-7:]) / len(history[-7:])) if history else 0.0
            X_rows.append([float(d), float(dow), 1.0 if dow >= 5 else 0.0, float(prev), float(roll7)])
            y_rows.append(float(units))
            meta.append((pidx, d))
            history.append(units)
            prev = units

    return np.array(X_rows, dtype=float), np.array(y_rows, dtype=float), meta


def _weekday(base, day_offset):
    """Weekday (0=Mon..6=Sun) for base + day_offset days, tz-naive-safe."""
    import datetime as _dt

    b = base if isinstance(base, _dt.datetime) else _dt.datetime.fromtimestamp(base)
    if b.tzinfo is not None:
        b = b.replace(tzinfo=None)
    return (b + _dt.timedelta(days=int(day_offset))).weekday()


def log_recommender(dataset: Dataset, n_components: int = 10, k: int = 5):
    """Train the SVD recommender, backtest it, and log to MLflow."""
    from .models import ItemCosineRecommender, JSCoBaseline

    models = [
        SVDRecommender(n_components=n_components),
        ItemCosineRecommender(),
        JSCoBaseline(),
    ]
    report = run_backtest(dataset, models, k=k, train_ratio=0.7)
    svd_result = next(r for r in report.models if r.name == "svd")

    # Re-fit the SVD on full history for the logged artifact.
    svd = SVDRecommender(n_components=n_components)
    svd.fit(dataset)

    with mlflow.start_run(run_name="svd-recommender") as run:
        mlflow.log_param("model_type", "TruncatedSVD")
        mlflow.log_param("n_components", n_components)
        mlflow.log_param("n_customers", dataset.n_customers)
        mlflow.log_param("n_products", dataset.n_products)
        mlflow.log_param("interactions", len(dataset.interactions))
        mlflow.log_metric("relevance", svd_result.relevance)
        mlflow.log_metric("evaluated", svd_result.evaluated)
        mlflow.log_metric("hits", svd_result.hits)
        mlflow.sklearn.log_model(svd.svd, artifact_path="svd_model")
        mlflow.set_tag("stage", "recommendation")
        run_id = run.info.run_id

    mlflow.register_model(f"runs:/{run_id}/svd_model", REC_MODEL_NAME)
    return {"run_id": run_id, "relevance": svd_result.relevance, "evaluated": svd_result.evaluated, "hits": svd_result.hits}


def log_forecaster(dataset: Dataset):
    """Train a LinearRegression forecaster on temporal features and log to MLflow."""
    X, y, meta = _build_forecast_features(dataset)
    if X is None or len(X) < 10:
        return {"run_id": None, "skipped": "not enough data"}

    # Chronological split: last 30% of days held out (rows are ordered by day
    # within each product, so split globally by row index after sorting by day).
    order = np.argsort([m[1] for m in meta])
    X, y = X[order], y[order]
    split = int(len(X) * 0.7)
    X_train, X_test = X[:split], X[split:]
    y_train, y_test = y[:split], y[split:]

    model = LinearRegression()
    model.fit(X_train, y_train)
    y_pred = np.maximum(0, model.predict(X_test))  # units can't be negative
    accuracy = _mape_accuracy(y_test, y_pred)
    r2 = model.score(X_test, y_test)

    with mlflow.start_run(run_name="linearregression-forecaster") as run:
        mlflow.log_param("model_type", "LinearRegression")
        mlflow.log_param("features", "t,dow,is_weekend,lag1,roll7")
        mlflow.log_param("n_train", len(X_train))
        mlflow.log_param("n_test", len(X_test))
        mlflow.log_metric("forecast_accuracy", round(accuracy, 3))
        mlflow.log_metric("mape", round(1 - accuracy, 3))
        mlflow.log_metric("r2", round(float(r2), 3))
        mlflow.sklearn.log_model(model, artifact_path="forecast_model")
        mlflow.set_tag("stage", "forecasting")
        run_id = run.info.run_id

    mlflow.register_model(f"runs:/{run_id}/forecast_model", FORECAST_MODEL_NAME)
    return {"run_id": run_id, "accuracy": round(accuracy, 3), "r2": round(float(r2), 3)}


def log_segmenter(uri: Optional[str] = None, db_name: str = "shopsense"):
    """Train the K-Means customer segmenter and log it to MLflow.

    Unlike the recommender/forecaster (which train from the Dataset object),
    segmentation reads customer + transaction aggregates directly from Mongo
    via build_customer_features — every customer is clustered, including
    never-purchasers. Params (k, features), metrics (silhouette, cluster
    sizes) and the sklearn pipeline (scaler + KMeans) are logged, then
    registered as `shopsense-segmenter`.
    """
    from pymongo import MongoClient
    from sklearn.pipeline import Pipeline

    client = MongoClient(uri or get_mongo_uri(), serverSelectionTimeoutMS=10000)
    try:
        db = client[db_name]
        features = build_customer_features(db)
        if len(features) < 4:
            return {"run_id": None, "skipped": f"only {len(features)} customers"}

        scaler, km, chosen_k, sil, _ = fit_kmeans(features)
        cluster_labels = label_clusters(scaler, km)
        sizes = {cluster_labels[c]: int(n) for c, n in enumerate(np.bincount(km.labels_))}
    finally:
        client.close()

    # A sklearn Pipeline bundles scaler + kmeans into one loggable artifact.
    pipe = Pipeline([("scaler", scaler), ("kmeans", km)])
    pipe.fit(_feature_rows(features))

    with mlflow.start_run(run_name="kmeans-segmenter") as run:
        mlflow.log_param("model_type", "KMeans")
        mlflow.log_param("k", chosen_k)
        mlflow.log_param("features", "totalSpend,orderCount,avgOrderValue,recencyDays")
        mlflow.log_param("n_customers", len(features))
        mlflow.log_param("k_selection", "silhouette sweep 2..min(8, n-1)")
        mlflow.log_metric("silhouette", round(float(sil), 4))
        for label, count in sizes.items():
            mlflow.log_metric(f"cluster_size_{label}", count)
        mlflow.sklearn.log_model(pipe, artifact_path="segmenter_model")
        mlflow.set_tag("stage", "segmentation")
        run_id = run.info.run_id

    mlflow.register_model(f"runs:/{run_id}/segmenter_model", SEGMENTER_MODEL_NAME)
    return {
        "run_id": run_id,
        "k": chosen_k,
        "silhouette": round(float(sil), 4),
        "cluster_sizes": sizes,
    }


def _feature_rows(features):
    """Feature matrix (matching segmentation._feature_matrix) for the Pipeline refit."""
    from .segmentation import _feature_matrix

    return _feature_matrix(features)


def run_pipeline(
    n_components: int = 10,
    k: int = 5,
    tracking_uri: Optional[str] = None,
) -> dict:
    """The automated analytical workflow: load data, train + log all three models."""
    uri = _set_tracking(tracking_uri)
    print(f"MLflow tracking URI: {uri}")
    print("Loading data from Atlas...")
    dataset = load_dataset(get_mongo_uri())
    print(f"  {len(dataset.interactions)} interactions, {dataset.n_customers} customers, {dataset.n_products} products")

    print("\n[1/3] Logging SVD recommender...")
    rec = log_recommender(dataset, n_components=n_components, k=k)
    print(f"  run_id={rec['run_id']}  relevance={rec['relevance']}")

    print("\n[2/3] Logging LinearRegression forecaster...")
    fc = log_forecaster(dataset)
    if fc.get("run_id"):
        print(f"  run_id={fc['run_id']}  accuracy={fc['accuracy']}  r2={fc['r2']}")
    else:
        print(f"  skipped: {fc.get('skipped')}")

    print("\n[3/3] Logging KMeans segmenter...")
    seg = log_segmenter()
    if seg.get("run_id"):
        print(f"  run_id={seg['run_id']}  k={seg['k']}  silhouette={seg['silhouette']}")
    else:
        print(f"  skipped: {seg.get('skipped')}")

    print("\nDone. View the registry with:")
    print(f"  mlflow ui --backend-store-uri {uri}")
    return {"tracking_uri": uri, "recommender": rec, "forecaster": fc, "segmenter": seg}
