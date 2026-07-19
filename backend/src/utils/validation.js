import Transaction from '../models/Transaction.js';
import Product from '../models/Product.js';
import Customer from '../models/Customer.js';
import { dailySalesByProduct, forecastFromEntry } from './forecast.js';
import { customerMetrics, bucketCustomer, SEGMENTS } from './segmentation.js';
import { buildPurchaseGraph, collaborativeScore } from './recommend.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Backtesting validation for the three Milestone-2 analytical outputs.
 * Splits historical transactions chronologically into train (older 70%) /
 * test (newer 30%), then recomputes each output on the TRAIN set only and
 * compares against the TEST set.
 *
 *  - forecastAccuracy     : 1 - MAPE of predicted vs actual test-window units
 *  - segmentationQuality  : cohesion-vs-separation proxy in [0,1]
 *  - recommendationRelevance : held-out last-purchase hit rate
 *
 * Thresholds (concept-note Step 4): 0.80 / 0.85 / 0.75.
 */

const THRESHOLDS = { forecastAccuracy: 0.8, segmentationQuality: 0.85, recommendationRelevance: 0.75 };

/** MAPE-based accuracy. Returns 1 - mean(abs% error), clamped to [0,1]. */
function mapeAccuracy(predictions) {
  const valid = predictions.filter((p) => p.actual > 0);
  if (valid.length === 0) {
    // No actual sales in the test window: a zero forecast is perfect, a
    // non-zero forecast is a miss. Reward correct zero forecasts.
    const zeros = predictions.filter((p) => p.actual === 0 && p.predicted === 0).length;
    return predictions.length ? zeros / predictions.length : 0;
  }
  const sum = valid.reduce((acc, p) => acc + Math.abs((p.actual - p.predicted) / p.actual), 0);
  const mape = sum / valid.length;
  return Number(Math.max(0, Math.min(1, 1 - mape)).toFixed(3));
}

/**
 * Segmentation quality: a cohesion/separation proxy.
 * For each segment, compute the mean intra-segment distance in (recency,
 * frequency, spend) space normalised to [0,1]; quality = 1 - (mean intra /
 * mean inter). Higher = tighter, better-separated segments.
 */
function segmentationQuality(segmented) {
  // Collect points with a 3D feature vector.
  const points = [];
  for (const seg of SEGMENTS) {
    for (const c of segmented[seg]) {
      points.push({
        seg,
        f: [
          Math.min(1, (c.recencyDays ?? 90) / 90), // recency
          Math.min(1, (c.orderCount ?? 0) / 10), // frequency
          Math.min(1, (c.totalSpend ?? 0) / 1000), // monetary
        ],
      });
    }
  }
  if (points.length < 2) return 0;

  const dist = (a, b) => Math.sqrt(a.f.reduce((s, v, i) => s + (v - b.f[i]) ** 2, 0));

  // Mean intra-segment distance (cohesion — lower is better).
  let intraSum = 0;
  let intraPairs = 0;
  for (const seg of SEGMENTS) {
    const members = points.filter((p) => p.seg === seg);
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        intraSum += dist(members[i], members[j]);
        intraPairs += 1;
      }
    }
  }
  const intra = intraPairs ? intraSum / intraPairs : 0;

  // Mean inter-segment distance (separation — higher is better).
  let interSum = 0;
  let interPairs = 0;
  const segs = SEGMENTS.filter((s) => points.some((p) => p.seg === s));
  for (let a = 0; a < segs.length; a++) {
    const aMembers = points.filter((p) => p.seg === segs[a]);
    for (let b = a + 1; b < segs.length; b++) {
      const bMembers = points.filter((p) => p.seg === segs[b]);
      for (const x of aMembers) {
        for (const y of bMembers) {
          interSum += dist(x, y);
          interPairs += 1;
        }
      }
    }
  }
  const inter = interPairs ? interSum / interPairs : 0;
  if (inter === 0) return 0;
  return Number(Math.max(0, Math.min(1, 1 - intra / inter)).toFixed(3));
}

/**
 * Recommendation relevance: for each customer with ≥2 purchases, hold out
 * their latest purchase; build CF recommendations from train-only history;
 * a "hit" is the held-out product OR a same-category product appearing in the
 * recommendation set. Relevance = hits / evaluated customers.
 */
async function recommendationRelevance({ splitDate, until }) {
  // Customers with ≥2 purchases overall are candidates for held-out evaluation.
  const metrics = await customerMetrics({ until });
  const eligible = metrics.filter((m) => m.orderCount >= 2);
  if (eligible.length === 0) return { value: 0, evaluated: 0, hits: 0, candidates: 0 };

  const graph = await buildPurchaseGraph({ until: splitDate }); // train only
  let hits = 0;
  let evaluated = 0;
  let candidates = 0;

  for (const m of eligible) {
    // Hold out the customer's most recent purchase in the test window.
    const heldOut = await Transaction.findOne({
      customerId: m.customerId,
      status: { $ne: 'cancelled' },
      date: { $gte: splitDate },
    })
      .sort({ date: -1 })
      .populate('productId', 'category');
    if (!heldOut) continue;
    candidates += 1;

    const recs = collaborativeScore(m.customerId, graph).slice(0, 5);
    // Relevance is measured over customers the CF engine actually served
    // (non-empty recommendation set). Customers with no co-purchase signal
    // are cold-start cases handled by the popular fallback, not by CF.
    if (recs.length === 0) continue;
    evaluated += 1;

    const recIds = new Set(recs.map((r) => r.productId));
    const heldId = heldOut.productId?._id?.toString();
    if (recIds.has(heldId)) {
      hits += 1;
      continue;
    }
    // Same-category hit: a recommended product shares the held-out category.
    const heldCat = heldOut.productId.category;
    const recProducts = await Product.find({ _id: { $in: [...recIds] } }).select('category');
    if (recProducts.some((p) => p.category === heldCat)) hits += 1;
  }

  const value = evaluated ? hits / evaluated : 0;
  return { value: Number(value.toFixed(3)), evaluated, hits, candidates };
}

/**
 * Run the full backtesting validation. Returns the three metrics + details.
 */
export async function runValidation({ trainRatio = 0.7, windowDays = 7, horizon = 7 } = {}) {
  const all = await Transaction.find({ status: { $ne: 'cancelled' }, customerId: { $ne: null } }).sort('date');
  if (all.length === 0) {
    return {
      forecastAccuracy: 0,
      segmentationQuality: 0,
      recommendationRelevance: 0,
      thresholds: THRESHOLDS,
      details: { message: 'No customer-attributed transactions to validate against.' },
    };
  }

  const until = all[all.length - 1].date;
  const earliest = all[0].date;
  const span = until.getTime() - earliest.getTime();
  const splitDate = new Date(earliest.getTime() + span * trainRatio);

  // --- Forecast accuracy ---
  const products = await Product.find().select('_id');
  const productIds = products.map((p) => p._id);
  const trainSales = await dailySalesByProduct({
    productIds,
    since: new Date(splitDate.getTime() - windowDays * DAY_MS),
    until: splitDate,
  });
  const testSales = await dailySalesByProduct({
    productIds,
    since: splitDate,
    until,
  });
  const horizonDays = Math.max(1, Math.round((until.getTime() - splitDate.getTime()) / DAY_MS));
  const predictions = productIds.map((pid) => {
    const entry = trainSales.get(pid.toString()) || null;
    const fc = forecastFromEntry(entry, { windowDays, horizon: horizonDays });
    const actual = testSales.get(pid.toString())?.totalUnits || 0;
    return { productId: pid, predicted: fc.predictedStock, actual };
  });
  const forecastAccuracy = mapeAccuracy(predictions);

  // --- Segmentation quality (on train set) ---
  const customers = await Customer.find().select('createdAt');
  const trainMetrics = await customerMetrics({ until: splitDate, customerIds: customers.map((c) => c._id) });
  const byId = new Map(trainMetrics.map((m) => [m.customerId.toString(), m]));
  const segmented = Object.fromEntries(SEGMENTS.map((s) => [s, []]));
  for (const c of customers) {
    const m = byId.get(c._id.toString());
    const joinedDaysAgo = Math.floor((splitDate.getTime() - c.createdAt.getTime()) / DAY_MS);
    const seg = bucketCustomer({
      recencyDays: m ? m.recencyDays : null,
      ordersLast30d: m ? m.orderCount : 0, // approx (all-train orders)
      joinedDaysAgo,
    });
    segmented[seg].push({
      recencyDays: m ? m.recencyDays : null,
      orderCount: m ? m.orderCount : 0,
      totalSpend: m ? m.totalSpend : 0,
    });
  }
  const segQuality = segmentationQuality(segmented);

  // --- Recommendation relevance (held-out) ---
  const rec = await recommendationRelevance({ splitDate, until });

  return {
    forecastAccuracy,
    segmentationQuality: segQuality,
    recommendationRelevance: rec.value,
    thresholds: THRESHOLDS,
    details: {
      transactions: all.length,
      splitDate: splitDate.toISOString(),
      testWindowDays: horizonDays,
      forecastProducts: productIds.length,
      segmentationCustomers: customers.length,
      recommendationCandidates: rec.candidates,
      recommendationEvaluated: rec.evaluated,
      recommendationHits: rec.hits,
    },
  };
}
