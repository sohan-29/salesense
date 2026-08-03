import { useState, useCallback } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';
import { analyticsApi } from '../../api/client';
import Spinner from '../../components/Spinner';
import StatCard from '../../components/StatCard';
import AnalyticsFilters from '../../components/AnalyticsFilters';

const money = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
const compactMoney = (n) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;

/** Growth badge: ▲ green / ▼ red / — neutral. */
function Growth({ pct }) {
  if (pct == null) return <span className="text-xs text-slate-400">—</span>;
  const up = pct >= 0;
  return (
    <span className={`text-xs font-medium ${up ? 'text-emerald-600' : 'text-rose-600'}`}>
      {up ? '▲' : '▼'} {Math.abs(pct)}%
    </span>
  );
}

export default function Analytics() {
  const [analysis, setAnalysis] = useState(null);
  const [bench, setBench] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({});
  const [exporting, setExporting] = useState('');

  const onFiltersChange = useCallback((params) => {
    setFilters(params);
    setLoading(true);
    setError('');
    Promise.all([analyticsApi.revenueAnalysis(params), analyticsApi.benchmark(params)])
      .then(([a, b]) => {
        setAnalysis(a);
        setBench(b);
      })
      .catch((e) => setError(e.response?.data?.error?.message || 'Analytics failed'))
      .finally(() => setLoading(false));
  }, []);

  // Trigger a Blob download (CSV/PDF) using the currently-applied filters.
  const download = useCallback(
    async (kind, filename, mime) => {
      setExporting(kind);
      try {
        let blob;
        if (kind === 'revenueCsv') blob = await analyticsApi.revenueAnalysisCsv(filters);
        else if (kind === 'benchmarkCsv') blob = await analyticsApi.benchmarkCsv(filters);
        else blob = await analyticsApi.reportPdf(filters);
        const url = URL.createObjectURL(new Blob([blob], { type: mime }));
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      } catch {
        setError('Export failed. Try again.');
      } finally {
        setExporting('');
      }
    },
    [filters]
  );

  const t = analysis?.totals;
  const g = analysis?.growth;
  const ts = analysis?.timeseries || [];
  const byVendor = analysis?.byVendor || [];
  const ranking = bench?.ranking || [];
  const bm = bench?.benchmark;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Analytics</h1>
          <p className="text-sm text-slate-500">Advanced revenue analysis & marketplace benchmarking (Milestone 3).</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => download('revenueCsv', 'revenue-analysis.csv', 'text/csv')}
            disabled={!!exporting}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {exporting === 'revenueCsv' ? 'Exporting…' : '↓ Revenue CSV'}
          </button>
          <button
            onClick={() => download('benchmarkCsv', 'benchmark.csv', 'text/csv')}
            disabled={!!exporting}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {exporting === 'benchmarkCsv' ? 'Exporting…' : '↓ Benchmark CSV'}
          </button>
          <button
            onClick={() => download('reportPdf', 'shopsense-bi-report.pdf', 'application/pdf')}
            disabled={!!exporting}
            className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {exporting === 'reportPdf' ? 'Exporting…' : '↓ PDF Report'}
          </button>
        </div>
      </div>

      <AnalyticsFilters onChange={onFiltersChange} isAdmin />

      {error && <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {loading && <Spinner />}

      {!loading && analysis && (
        <>
          {/* Revenue analysis KPIs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="GMV" value={compactMoney(t.gmv)} accent="indigo" sub={<Growth pct={g?.gmvPct} />} />
            <StatCard label="Net revenue" value={compactMoney(t.netRevenue)} accent="emerald" sub={`margin ${t.marginPct}%`} />
            <StatCard label="Commission" value={compactMoney(t.commission)} accent="amber" sub={`${t.orders} orders`} />
            <StatCard label="Avg order value" value={compactMoney(t.aov)} accent="sky" sub={<Growth pct={g?.aovPct} />} />
          </div>

          {/* Revenue trend (GMV vs net) */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-ink">Revenue trend</h2>
            <p className="text-xs text-slate-500">GMV vs net revenue (after commission) over the period.</p>
            {ts.length === 0 ? (
              <p className="mt-2 text-sm text-slate-400">No data for these filters.</p>
            ) : (
              <div className="mt-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={ts}>
                    <defs>
                      <linearGradient id="gmv" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="net" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`} />
                    <Tooltip formatter={(v) => money(v)} />
                    <Area type="monotone" dataKey="gmv" stroke="#4f46e5" strokeWidth={2} fill="url(#gmv)" />
                    <Area type="monotone" dataKey="netRevenue" stroke="#10b981" strokeWidth={2} fill="url(#net)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Per-vendor revenue table */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-ink">Revenue by vendor</h2>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3">Vendor</th>
                  <th className="px-4 py-3">GMV</th>
                  <th className="px-4 py-3">Net</th>
                  <th className="px-4 py-3">Commission</th>
                  <th className="px-4 py-3">Margin</th>
                  <th className="px-4 py-3">Orders</th>
                  <th className="px-4 py-3">Growth</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {byVendor.length === 0 ? (
                  <tr><td colSpan={7} className="px-5 py-6 text-center text-slate-400">No data</td></tr>
                ) : byVendor.map((v) => (
                  <tr key={v.vendorId} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-ink">{v.businessName}</td>
                    <td className="px-4 py-3 font-medium">{money(v.gmv)}</td>
                    <td className="px-4 py-3 text-slate-600">{money(v.netRevenue)}</td>
                    <td className="px-4 py-3 text-slate-600">{money(v.commission)}</td>
                    <td className="px-4 py-3 text-slate-600">{v.marginPct}%</td>
                    <td className="px-4 py-3 text-slate-600">{v.orders}</td>
                    <td className="px-4 py-3"><Growth pct={v.gmvGrowthPct} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!loading && bench && (
        <>
          {/* Benchmark strip */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Avg vendor revenue" value={compactMoney(bm?.avgRevenue)} accent="indigo" sub="marketplace average" />
            <StatCard label="Avg fulfilment" value={`${Math.round((bm?.avgFulfilment || 0) * 100)}%`} accent="emerald" sub="delivered / total" />
            <StatCard label="Top vendor" value={bm?.topVendor || '—'} accent="amber" sub={`avg growth ${(bm?.avgGrowth || 0).toFixed(1)}%`} />
          </div>

          {/* Composite score chart */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-ink">Vendor benchmark — composite score</h2>
            <p className="text-xs text-slate-500">0.5 revenue + 0.3 fulfilment + 0.2 growth (normalised 0–100).</p>
            {ranking.length === 0 ? (
              <p className="mt-2 text-sm text-slate-400">No data for these filters.</p>
            ) : (
              <div className="mt-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ranking} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="businessName" tick={{ fontSize: 11 }} width={110} />
                    <Tooltip />
                    <Bar dataKey="compositeScore" fill="#4f46e5" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Ranking table */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-ink">Vendor ranking</h2>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3">#</th>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3">Revenue</th>
                  <th className="px-4 py-3">Fulfilment</th>
                  <th className="px-4 py-3">Growth</th>
                  <th className="px-4 py-3">Composite</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ranking.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-6 text-center text-slate-400">No data</td></tr>
                ) : ranking.map((r) => (
                  <tr key={r.vendorId} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-bold text-ink">{r.rank}</td>
                    <td className="px-4 py-3 font-medium text-ink">{r.businessName}</td>
                    <td className="px-4 py-3 text-slate-600">{money(r.revenue)} <span className="text-xs text-slate-400">({r.revenueScore})</span></td>
                    <td className="px-4 py-3 text-slate-600">{Math.round(r.fulfilmentRate * 100)}% <span className="text-xs text-slate-400">({r.fulfilmentScore})</span></td>
                    <td className="px-4 py-3"><Growth pct={r.growthPct} /></td>
                    <td className="px-4 py-3 font-bold text-indigo-600">{r.compositeScore}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
