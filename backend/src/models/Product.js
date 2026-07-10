import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * A product in a vendor's catalogue. Creating a product also creates an
 * Inventory row (see controllers/productController).
 */
const productSchema = new Schema(
  {
    vendorId: { type: Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
    name: { type: String, required: true, trim: true },
    sku: { type: String, trim: true, default: '' },
    category: { type: String, trim: true, default: 'Uncategorised' },
    price: { type: Number, required: true, min: 0 },
    description: { type: String, trim: true, default: '' },
    images: [{ type: String, trim: true }],
    status: { type: String, enum: ['draft', 'active', 'archived'], default: 'active' },
  },
  { timestamps: true }
);

productSchema.index({ vendorId: 1, name: 1 });

export default mongoose.model('Product', productSchema);
