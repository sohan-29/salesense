import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Cached K-Means customer segment, produced by the Python segmenter
 * (ml/recommender/segmentation.py) via `python -m recommender.cli
 * segment-refresh`. Read freshness-gated by customerController — if a row is
 * missing or stale, the controller falls back to its in-process RFM rules
 * (utils/segmentation.js).
 *
 * Mirrors the MLRecommendation "cached analytical output" pattern. The Python
 * writer sets `generatedAt` explicitly (raw pymongo writes bypass Mongoose's
 * timestamps middleware), so `generatedAt` is the freshness anchor, not
 * createdAt.
 */
const featuresSchema = new Schema(
  {
    totalSpend: { type: Number, default: 0 },
    orderCount: { type: Number, default: 0 },
    avgOrderValue: { type: Number, default: 0 },
    recencyDays: { type: Number, default: null }, // null = never purchased
  },
  { _id: false }
);

const mlCustomerSegmentSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    cluster: { type: Number, required: true },
    segment: {
      type: String,
      required: true,
      enum: ['premium', 'regular', 'new', 'inactive'],
    },
    features: { type: featuresSchema, default: () => ({}) },
    model: { type: String, default: 'kmeans' },
    k: { type: Number },
    silhouette: { type: Number },
    generatedAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// One row per customer — refresh replaces in place.
mlCustomerSegmentSchema.index({ customerId: 1 }, { unique: true });

// Explicit collection name: Mongoose would otherwise pluralize to
// `mlcustomersegments`, but the Python write-back (ml/recommender/segmentation.py)
// writes to `ml_segments`. Pin the name so both sides agree.
export default mongoose.model('MLCustomerSegment', mlCustomerSegmentSchema, 'ml_segments');
