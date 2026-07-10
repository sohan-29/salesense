import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Stock for a product. One row per product. Reserved stock is deducted by
 * future order flows; available = stockAvailable - reserved.
 */
const inventorySchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, unique: true, index: true },
    vendorId: { type: Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
    stockAvailable: { type: Number, default: 0, min: 0 },
    reserved: { type: Number, default: 0, min: 0 },
    reorderThreshold: { type: Number, default: 10, min: 0 },
    lastUpdated: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

inventorySchema.virtual('available').get(function () {
  return Math.max(0, this.stockAvailable - this.reserved);
});

inventorySchema.set('toJSON', { virtuals: true });
inventorySchema.set('toObject', { virtuals: true });

export default mongoose.model('Inventory', inventorySchema);
