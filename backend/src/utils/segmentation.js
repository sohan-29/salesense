import Transaction from '../models/Transaction.js';

/**
 * Customer segmentation utilities. Segments are deterministic rules over
 * recency / frequency derived from the Transaction collection (the source of
 * truth for purchases — customers carry no embedded purchaseHistory).
 *
 *   frequentBuyer : ≥3 orders in the last 30 days
 *   dormantUser   : had a purchase before, but none in the last 60 days
 *   newUser       : joined within 30 days AND <3 orders in last 30 days
 *   atRisk        : last purchase between 30 and 60 days ago
 *   occasional    : everything else (active but low frequency)
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export const SEGMENTS = ['frequentBuyers', 'dormantUsers', 'newUsers', 'atRisk', 'occasional'];

/**
 * Bucket one customer from their computed metrics. Pure function so the
 * validation endpoint can reuse it on held-out data.
 */
export function bucketCustomer({ recencyDays, ordersLast30d, joinedDaysAgo }) {
  if (ordersLast30d >= 3) return 'frequentBuyers';
  if (recencyDays === null) return 'newUsers'; // never purchased
  if (recencyDays >= 60) return 'dormantUsers';
  if (recencyDays >= 30) return 'atRisk';
  if (joinedDaysAgo <= 30) return 'newUsers';
  return 'occasional';
}

/**
 * Aggregate per-customer purchase metrics from Transactions in [since, until).
 * Returns an array of { customerId, orderCount, totalSpend, lastPurchaseDate,
 * firstPurchaseDate, recencyDays }.
 */
export async function customerMetrics({ since = null, until = new Date(), customerIds = null } = {}) {
  const match = { status: { $ne: 'cancelled' }, customerId: { $ne: null } };
  if (since || until) {
    match.date = {};
    if (since) match.date.$gte = since;
    match.date.$lt = until;
  }
  if (customerIds) match.customerId = { $in: customerIds };

  const rows = await Transaction.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$customerId',
        orderCount: { $sum: 1 },
        totalSpend: { $sum: '$totalAmount' },
        totalUnits: { $sum: '$quantity' },
        lastPurchaseDate: { $max: '$date' },
        firstPurchaseDate: { $min: '$date' },
      },
    },
  ]);

  return rows.map((r) => ({
    customerId: r._id,
    orderCount: r.orderCount,
    totalSpend: r.totalSpend,
    totalUnits: r.totalUnits,
    lastPurchaseDate: r.lastPurchaseDate,
    firstPurchaseDate: r.firstPurchaseDate,
    recencyDays: Math.floor((until.getTime() - r.lastPurchaseDate.getTime()) / DAY_MS),
  }));
}

export { DAY_MS };
