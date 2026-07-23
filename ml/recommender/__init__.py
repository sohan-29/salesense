"""ShopSense ML product-recommendation package.

Standalone Python recommender that reads from the same MongoDB Atlas the
Node/Express app uses, trains three algorithms (SVD matrix factorization,
item-item cosine CF, and a reimplementation of the JS co-purchase baseline),
and backtests them with the same held-out protocol the JS validation uses
(see backend/src/utils/validation.js).

Entry point: ``python -m recommender.cli`` (train / evaluate / recommend).
"""

__all__ = ["data", "models", "backtest", "cli"]

__version__ = "0.1.0"
