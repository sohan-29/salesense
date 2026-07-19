import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * A persisted stock forecast for a product. Produced by
 * controllers/inventoryController#forecastInventory using a moving average of
 * historical daily sales (from the Transaction collection).
 *
 * `predictedStock` is the forecasted unit demand for the next `horizonDays`
 * days; `avgDailySales` is the underlying daily rate; `confidenceLevel`
 * reflects how much historical data backed the forecast (more days → higher
 * confidence, capped at 0.95).
 */
const inventoryForecastSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    vendorId: { type: Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
    predictedStock: { type: Number, required: true, min: 0 },
    avgDailySales: { type: Number, required: true, min: 0 },
    horizonDays: { type: Number, required: true, min: 1, default: 7 },
    windowDays: { type: Number, required: true, min: 1, default: 7 },
    method: { type: String, default: 'moving-average' },
    confidenceLevel: { type: Number, min: 0, max: 1, default: 0.8 },
    forecastDate: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Most-recent forecast first per product.
inventoryForecastSchema.index({ productId: 1, forecastDate: -1 });

export default mongoose.model('InventoryForecast', inventoryForecastSchema);
