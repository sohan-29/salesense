import Transaction from '../models/Transaction.js';

/**
 * Recommendation engine utilities (collaborative filtering + content-based
 * fallback). Shared by the recommendation controller (live) and the analytics
 * validation (held-out relevance) so both use identical ranking.
 *
 * Collaborative filtering:
 *   1. Build the customer→product purchase matrix from Transactions.
 *   2. For the target customer, find other customers who share ≥1 purchased
 *      product (co-purchasers).
 *   3. Score every product bought by those co-purchasers by the sum of
 *      co-purchase counts, excluding products the target already owns.
 *
 * Content-based fallback:
 *   If co-purchase signal is weak (< `minSignal` scored products), top up with
 *   the target's favourite categories (by spend) they haven't bought.
 */

/**
 * Build { customerHex: Set(productHex) } and { productHex: totalUnits } from
 * transactions in [since, until). Non-cancelled orders only.
 */
export async function buildPurchaseGraph({ since = null, until = new Date(), customerIds = null } = {}) {
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
        products: { $addToSet: '$productId' },
      },
    },
  ]);

  const customerProducts = new Map();
  for (const r of rows) customerProducts.set(r._id.toString(), new Set(r.products.map((p) => p.toString())));
  return customerProducts;
}

/**
 * Score candidate products for a target customer via co-purchase.
 * Returns [{ productId, score, reason: 'collaborative' }] sorted desc, with
 * the target's own purchases excluded.
 */
export function collaborativeScore(targetId, customerProducts) {
  const targetKey = targetId.toString();
  const owned = customerProducts.get(targetKey) || new Set();
  if (owned.size === 0) return []; // no history → no CF signal

  const scores = new Map();
  for (const [otherKey, products] of customerProducts) {
    if (otherKey === targetKey) continue;
    // overlap = how similar this co-purchaser is to the target
    let overlap = 0;
    for (const p of products) if (owned.has(p)) overlap += 1;
    if (overlap === 0) continue;
    for (const p of products) {
      if (owned.has(p)) continue; // don't recommend what they already bought
      scores.set(p, (scores.get(p) || 0) + overlap);
    }
  }

  return [...scores.entries()]
    .map(([productId, score]) => ({ productId, score, reason: 'collaborative' }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Content-based top-up: favourite categories by spend, products in those
 * categories not already purchased. `catSpend` is { category: spend }.
 */
export function contentScore(catSpend, purchasedProductIds, candidateProducts) {
  const owned = new Set((purchasedProductIds || []).map((p) => p.toString()));
  const rankedCats = Object.entries(catSpend).sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const out = [];
  for (const cat of rankedCats) {
    for (const p of candidateProducts) {
      if (p.category !== cat) continue;
      if (owned.has(p._id.toString())) continue;
      out.push({ productId: p._id.toString(), score: 1, reason: 'content', category: cat });
    }
  }
  return out;
}
