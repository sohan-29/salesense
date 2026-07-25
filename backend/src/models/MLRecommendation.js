import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Cached ML recommendations for a customer, produced by the Python
 * recommender (ml/recommender/writeback.py) via `python -m recommender.cli
 * refresh`. Read freshness-gated by recommendationController — if a row is
 * missing or stale, the controller falls back to its in-process JS CF engine.
 *
 * Mirrors the InventoryForecast "cached analytical output" pattern. The
 * Python writer sets `generatedAt` explicitly (raw pymongo writes bypass
 * Mongoose's timestamps middleware), so `generatedAt` is the freshness
 * anchor, not createdAt.
 */
const itemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    score: { type: Number, required: true },
    reason: { type: String, required: true }, // 'svd' | 'cosine' | 'popular'
    category: { type: String, default: 'Uncategorised' },
  },
  { _id: false }
);

const mlRecommendationSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    model: { type: String, required: true, index: true }, // 'svd' | 'cosine'
    generatedAt: { type: Date, required: true },
    items: { type: [itemSchema], default: [] },
  },
  { timestamps: true }
);

// One row per (customer, model) — refresh replaces in place.
mlRecommendationSchema.index({ customerId: 1, model: 1 }, { unique: true });

// Explicit collection name: Mongoose would otherwise pluralize to
// `mlrecommendations`, but the Python write-back (ml/recommender/writeback.py)
// writes to `ml_recommendations`. Pin the name so both sides agree.
export default mongoose.model('MLRecommendation', mlRecommendationSchema, 'ml_recommendations');
