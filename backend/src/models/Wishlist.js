import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * A customer's wishlist (saved-for-later items). One per customer.
 * Items are product refs only (no quantity — a wishlist is a set of products).
 */
const wishlistItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const wishlistSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, unique: true, index: true },
    items: { type: [wishlistItemSchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model('Wishlist', wishlistSchema);
