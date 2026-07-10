import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Product category with optional parent for a hierarchy.
 */
const categorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    parent: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    commissionDefault: { type: Number, default: 0, min: 0, max: 100 },
  },
  { timestamps: true }
);

export default mongoose.model('Category', categorySchema);
