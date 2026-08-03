import Transaction from '../models/Transaction.js';
import Vendor from '../models/Vendor.js';
import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import { fetchFilteredTransactions, growthPct } from '../utils/analyticsFilter.js';
import { sendCsv } from '../utils/csv.js';
import { sendReportPdf } from '../utils/reportPdf.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Bucket key for a date given a period (day | week | month). Weeks are
 * ISO-week-start (Monday) so buckets are stable across runs.
 */
function periodBucket(date, period) {
  const d = new Date(date);
  if (period === 'day') return d.toISOString().slice(0, 10);
  if (period === 'month') return d.toISOString().slice(0, 7);
  // week: Monday-anchored
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = (day + 6) % 7; // days since Monday
  const monday = new Date(d.getTime() - diff * DAY_MS);
  return monday.toISOString().slice(0, 10);
}

/**
 * Compute advanced revenue analysis. Pure (no res) so the JSON endpoint and
 * the CSV/PDF export endpoints share identical math.
 *
 * Returns: { totals, growth, byVendor, timeseries, window }.
 */
export async function computeRevenueAnalysis(req) {
  const period = req.query.period || 'week';
  const rows = await fetchFilteredTransactions(Transaction, req);

  // Resolve the current window bounds from the query (or the filtered set).
  let curStart = req.query.from ? new Date(req.query.from) : null;
  let curEnd = req.query.to ? new Date(req.query.to) : null;
  if (!curStart || !curEnd) {
    const dates = rows.map((r) => r.date.getTime());
    if (dates.length) {
      const lo = Math.min(...dates);
      const hi = Math.max(...dates);
      curStart = curStart || new Date(lo);
      curEnd = curEnd || new Date(hi + DAY_MS); // exclusive end = end of last day
    }
  }

  const windowMs = curStart && curEnd ? curEnd.getTime() - curStart.getTime() : 0;
  const prevEnd = curStart ? new Date(curStart.getTime()) : null;
  const prevStart = windowMs ? new Date(curStart.getTime() - windowMs) : null;

  // The date filter in `rows` restricts to the CURRENT window only, so fetch
  // the previous equal-length window separately for the growth comparison
  // (same non-date filters, date = previous window).
  let prevRows = [];
  if (prevStart && prevEnd) {
    const prevReq = { ...req, query: { ...req.query } };
    delete prevReq.query.from;
    delete prevReq.query.to;
    prevReq.query.from = prevStart.toISOString();
    prevReq.query.to = prevEnd.toISOString();
    prevRows = await fetchFilteredTransactions(Transaction, prevReq);
  }

  // Load commission rates per vendor (across both windows).
  const vendorIds = [...new Set(
    [...rows, ...prevRows].map((r) => r.vendorId?.toString()).filter(Boolean)
  )];
  const vendors = vendorIds.length ? await Vendor.find({ _id: { $in: vendorIds } }).select('businessName commissionRate status') : [];
  const vMeta = new Map(vendors.map((v) => [v._id.toString(), v]));

  // Aggregate current window + trend buckets.
  let gmv = 0, units = 0, orders = 0;
  const byVendorMap = new Map();
  const tsMap = new Map();

  for (const r of rows) {
    gmv += r.totalAmount || 0;
    units += r.quantity || 0;
    orders += 1;

    const vid = r.vendorId?.toString();
    if (vid) {
      const v = vMeta.get(vid);
      const rate = v?.commissionRate || 0;
      const commission = (r.totalAmount || 0) * rate / 100;
      const entry = byVendorMap.get(vid) || {
        vendorId: vid, businessName: v?.businessName || '—',
        gmv: 0, commission: 0, orders: 0, units: 0,
      };
      entry.gmv += r.totalAmount || 0;
      entry.commission += commission;
      entry.orders += 1;
      entry.units += r.quantity || 0;
      byVendorMap.set(vid, entry);
    }

    const bucket = periodBucket(r.date, period);
    const ts = tsMap.get(bucket) || { bucket, gmv: 0, netRevenue: 0, orders: 0 };
    ts.gmv += r.totalAmount || 0;
    ts.orders += 1;
    tsMap.set(bucket, ts);
  }

  // Previous-window totals + per-vendor GMV (for growth).
  let prevGmv = 0, prevOrders = 0;
  const prevByVendor = new Map();
  for (const r of prevRows) {
    prevGmv += r.totalAmount || 0;
    prevOrders += 1;
    const vid = r.vendorId?.toString();
    if (vid) prevByVendor.set(vid, (prevByVendor.get(vid) || 0) + (r.totalAmount || 0));
  }
  const prevAovBase = prevOrders ? prevGmv / prevOrders : 0;

  // Net revenue + margin use the marketplace commission (sum of per-vendor).
  let commission = 0;
  for (const e of byVendorMap.values()) commission += e.commission;
  const netRevenue = gmv - commission;
  const marginPct = gmv > 0 ? Number(((netRevenue / gmv) * 100).toFixed(1)) : 0;
  const aov = orders ? gmv / orders : 0;

  // Per-vendor net/margin/growth (uses the previous-window map built above).
  for (const e of byVendorMap.values()) {
    e.netRevenue = Number((e.gmv - e.commission).toFixed(2));
    e.marginPct = e.gmv > 0 ? Number(((e.netRevenue / e.gmv) * 100).toFixed(1)) : 0;
    e.gmvGrowthPct = growthPct(e.gmv, prevByVendor.get(e.vendorId) || 0);
  }

  // Trend net revenue: subtract per-bucket commission from each GMV bucket.
  const tsCommission = new Map();
  for (const r of rows) {
    const bucket = periodBucket(r.date, period);
    const v = vMeta.get(r.vendorId?.toString());
    const rate = v?.commissionRate || 0;
    tsCommission.set(bucket, (tsCommission.get(bucket) || 0) + (r.totalAmount || 0) * rate / 100);
  }
  for (const ts of tsMap.values()) {
    ts.netRevenue = Number((ts.gmv - (tsCommission.get(ts.bucket) || 0)).toFixed(2));
    ts.gmv = Number(ts.gmv.toFixed(2));
  }

  return {
    totals: {
      gmv: Number(gmv.toFixed(2)),
      netRevenue: Number(netRevenue.toFixed(2)),
      commission: Number(commission.toFixed(2)),
      marginPct,
      aov: Number(aov.toFixed(2)),
      units,
      orders,
    },
    growth: {
      gmvPct: growthPct(gmv, prevGmv),
      ordersPct: growthPct(orders, prevOrders),
      aovPct: growthPct(aov, prevAovBase),
    },
    byVendor: [...byVendorMap.values()]
      .map((e) => ({
        ...e,
        gmv: Number(e.gmv.toFixed(2)),
        commission: Number(e.commission.toFixed(2)),
      }))
      .sort((a, b) => b.gmv - a.gmv),
    timeseries: [...tsMap.values()].sort((a, b) => a.bucket.localeCompare(b.bucket)),
    window: { current: { start: curStart, end: curEnd }, previous: { start: prevStart, end: prevEnd } },
  };
}

/** GET /api/analytics/revenue-analysis — JSON view of the above. */
export const revenueAnalysis = asyncHandler(async (req, res) => {
  res.json(await computeRevenueAnalysis(req));
});

/**
 * Compute marketplace benchmarking. Pure (no res) for reuse by CSV/PDF export.
 * Admin-only — caller must check role.
 *
 * Returns: { ranking, benchmark }.
 */
export async function computeBenchmark(req) {

  const rows = await fetchFilteredTransactions(Transaction, req);

  // Per-vendor aggregation: revenue, orders, delivered (fulfilment), date range.
  const vMap = new Map();
  for (const r of rows) {
    const vid = r.vendorId?.toString();
    if (!vid) continue;
    const e = vMap.get(vid) || {
      vendorId: vid, revenue: 0, orders: 0, delivered: 0, minDate: r.date, maxDate: r.date,
    };
    e.revenue += r.totalAmount || 0;
    e.orders += 1;
    if (r.status === 'delivered') e.delivered += 1;
    if (r.date < e.minDate) e.minDate = r.date;
    if (r.date > e.maxDate) e.maxDate = r.date;
    vMap.set(vid, e);
  }

  const vendorIds = [...vMap.keys()];
  const vendors = vendorIds.length ? await Vendor.find({ _id: { $in: vendorIds } }).select('businessName status createdAt') : [];
  const vName = new Map(vendors.map((v) => [v._id.toString(), v]));

  // Growth: split each vendor's own range in half (first vs second half by time).
  for (const e of vMap.values()) {
    const span = e.maxDate.getTime() - e.minDate.getTime();
    const mid = span > 0 ? new Date(e.minDate.getTime() + span / 2) : e.maxDate;
    let first = 0, second = 0;
    for (const r of rows) {
      if (r.vendorId?.toString() !== e.vendorId) continue;
      if (r.date < mid) first += r.totalAmount || 0;
      else second += r.totalAmount || 0;
    }
    e.growthPct = growthPct(second, first);
    e.fulfilmentRate = e.orders ? Number((e.delivered / e.orders).toFixed(3)) : 0;
  }

  // Normalise each metric to 0-100 (max vendor = 100).
  const maxRev = Math.max(1, ...[...vMap.values()].map((e) => e.revenue));
  const maxFul = Math.max(1, ...[...vMap.values()].map((e) => e.fulfilmentRate));
  const growths = [...vMap.values()].map((e) => e.growthPct).filter((g) => g != null);
  const maxGrowth = Math.max(1, ...(growths.length ? growths : [1]));

  const ranking = [...vMap.values()]
    .map((e) => {
      const revenueScore = Number(((e.revenue / maxRev) * 100).toFixed(1));
      const fulfilmentScore = Number(((e.fulfilmentRate / maxFul) * 100).toFixed(1));
      const growthScore = e.growthPct == null ? 0 : Number((Math.max(0, e.growthPct / maxGrowth) * 100).toFixed(1));
      const compositeScore = Number((0.5 * revenueScore + 0.3 * fulfilmentScore + 0.2 * growthScore).toFixed(1));
      const v = vName.get(e.vendorId);
      return {
        vendorId: e.vendorId,
        businessName: v?.businessName || '—',
        status: v?.status || '—',
        revenue: Number(e.revenue.toFixed(2)),
        revenueScore,
        fulfilmentRate: e.fulfilmentRate,
        fulfilmentScore,
        growthPct: e.growthPct,
        growthScore,
        compositeScore,
      };
    })
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .map((e, i) => ({ rank: i + 1, ...e }));

  const avgRevenue = ranking.length ? ranking.reduce((s, r) => s + r.revenue, 0) / ranking.length : 0;
  const avgFulfilment = ranking.length ? ranking.reduce((s, r) => s + r.fulfilmentRate, 0) / ranking.length : 0;
  const growthVals = ranking.map((r) => r.growthPct).filter((g) => g != null);
  const avgGrowth = growthVals.length ? growthVals.reduce((s, g) => s + g, 0) / growthVals.length : 0;

  return {
    ranking,
    benchmark: {
      avgRevenue: Number(avgRevenue.toFixed(2)),
      avgFulfilment: Number(avgFulfilment.toFixed(3)),
      avgGrowth: Number(avgGrowth.toFixed(1)),
      topVendor: ranking[0]?.businessName || '—',
    },
  };
}

/** GET /api/analytics/benchmark — JSON view of the above (admin-only). */
export const benchmark = asyncHandler(async (req, res) => {
  if (req.vendor.role !== 'admin') throw ApiError.forbidden('Benchmarking is admin-only');
  res.json(await computeBenchmark(req));
});

/** GET /api/analytics/revenue-analysis/export — CSV of the per-vendor breakdown. */
export const revenueAnalysisCsv = asyncHandler(async (req, res) => {
  const data = await computeRevenueAnalysis(req);
  sendCsv(
    res,
    data.byVendor,
    [
      { key: 'businessName', label: 'Vendor' },
      { key: 'gmv', label: 'GMV' },
      { key: 'netRevenue', label: 'Net Revenue' },
      { key: 'commission', label: 'Commission' },
      { key: 'marginPct', label: 'Margin %' },
      { key: 'orders', label: 'Orders' },
      { key: 'units', label: 'Units' },
      { key: 'gmvGrowthPct', label: 'GMV Growth %' },
    ],
    'revenue-analysis.csv'
  );
});

/** GET /api/analytics/benchmark/export — CSV of the vendor ranking (admin-only). */
export const benchmarkCsv = asyncHandler(async (req, res) => {
  if (req.vendor.role !== 'admin') throw ApiError.forbidden('Benchmarking is admin-only');
  const data = await computeBenchmark(req);
  sendCsv(
    res,
    data.ranking,
    [
      { key: 'rank', label: 'Rank' },
      { key: 'businessName', label: 'Vendor' },
      { key: 'revenue', label: 'Revenue' },
      { key: 'revenueScore', label: 'Revenue Score' },
      { key: 'fulfilmentRate', label: 'Fulfilment Rate' },
      { key: 'fulfilmentScore', label: 'Fulfilment Score' },
      { key: 'growthPct', label: 'Growth %' },
      { key: 'growthScore', label: 'Growth Score' },
      { key: 'compositeScore', label: 'Composite Score' },
    ],
    'benchmark.csv'
  );
});

/** GET /api/analytics/report — combined BI report as PDF (admin-only). */
export const analyticsReport = asyncHandler(async (req, res) => {
  if (req.vendor.role !== 'admin') throw ApiError.forbidden('Reports are admin-only');
  const [analysis, benchmarkData] = await Promise.all([
    computeRevenueAnalysis(req),
    computeBenchmark(req),
  ]);
  sendReportPdf(res, { analysis, benchmark: benchmarkData, filters: req.query });
});
