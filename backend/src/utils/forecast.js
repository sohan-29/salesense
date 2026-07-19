import Transaction from '../models/Transaction.js';

/**
 * Moving-average inventory forecast utilities. Shared by the inventory
 * controller (live forecast) and the analytics validation (backtesting) so
 * both use identical math.
 *
 * Forecast model: average daily units sold over the trailing `windowDays`
 * (from non-cancelled transactions within [since, until)), multiplied by the
 * horizon. Confidence grows with sample size and is capped at 0.95.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Confidence in [0.5, 0.95]. Rises with the number of days that actually have
 * sales in the window (sparse history → lower confidence).
 */
export function confidenceFromSample(daysWithSales, windowDays) {
  if (!windowDays) return 0.5;
  const fill = Math.min(1, daysWithSales / Math.max(1, windowDays));
  // 0.5 baseline + up to 0.45 from data fill.
  return Number(Math.min(0.95, 0.5 + 0.45 * fill).toFixed(2));
}

/**
 * Aggregate daily units sold per product over [since, until).
 * Returns a map: productIdHex -> { totalUnits, dayCount, perDay: {isoDate: units} }.
 */
export async function dailySalesByProduct({ productIds, since, until, vendorId }) {
  if (!productIds || productIds.length === 0) return new Map();

  const match = {
    status: { $ne: 'cancelled' },
    date: { $gte: since, $lt: until },
    productId: { $in: productIds },
  };
  if (vendorId) match.vendorId = vendorId;

  const rows = await Transaction.aggregate([
    { $match: match },
    {
      $group: {
        _id: { p: '$productId', d: { $dateToString: { format: '%Y-%m-%d', date: '$date' } } },
        units: { $sum: '$quantity' },
      },
    },
  ]);

  const map = new Map();
  for (const r of rows) {
    const pid = r._id.p.toString();
    if (!map.has(pid)) map.set(pid, { totalUnits: 0, dayCount: 0, perDay: {} });
    const entry = map.get(pid);
    entry.totalUnits += r.units;
    entry.dayCount += 1;
    entry.perDay[r._id.d] = r.units;
  }
  return map;
}

/**
 * Compute a moving-average forecast for one product from a daily-sales entry.
 */
export function forecastFromEntry(entry, { windowDays, horizon, now = new Date() }) {
  const safeWindow = Math.max(1, windowDays);
  const totalUnits = entry ? entry.totalUnits : 0;
  const daysWithSales = entry ? entry.dayCount : 0;
  const avgDailySales = totalUnits / safeWindow;
  const predictedStock = avgDailySales * Math.max(1, horizon);
  const confidenceLevel = confidenceFromSample(daysWithSales, safeWindow);
  return {
    avgDailySales: Number(avgDailySales.toFixed(2)),
    predictedStock: Number(predictedStock.toFixed(2)),
    confidenceLevel,
    windowDays: safeWindow,
    horizonDays: horizon,
    method: 'moving-average',
    daysWithSales,
    forecastDate: now,
  };
}

export { DAY_MS };
