import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * A marketplace order/transaction. Created atomically with an inventory
 * decrement by controllers/transactionController.
 */
const transactionSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    vendorId: { type: Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
    // Optional: the customer who placed the order. Absent on legacy/seeded
    // orders and on orders recorded by vendors/admins without a customer.
    // Customer behaviour analytics (segmentation, recommendations) joins on
    // this field — see customerController / recommendationController.
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', index: true, default: null },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['pending', 'paid', 'shipped', 'delivered', 'refunded', 'cancelled'],
      default: 'paid',
    },
    date: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

export default mongoose.model('Transaction', transactionSchema);
