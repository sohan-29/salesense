import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * A customer's shopping cart. One per customer (customerId is unique).
 * Items reference a Product + a quantity; the cart is the source of truth
 * for checkout, which converts all items into atomic Transaction rows.
 */
const cartItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const cartSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, unique: true, index: true },
    items: { type: [cartItemSchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model('Cart', cartSchema);
