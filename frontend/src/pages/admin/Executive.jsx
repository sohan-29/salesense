import { useState, useCallback, useEffect } from 'react';
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
  Legend,
} from 'recharts';
import { analyticsApi } from '../../api/client';
import Spinner from '../../components/Spinner';
import StatCard from '../../components/StatCard';

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

/** Date-range presets that map to from/to query params (ISO). */
const PRESETS = [
  { key: '7d', label: 'Last 7 days', days: 7 },
  { key: '30d', label: 'Last 30 days', days: 30 },
  { key: '90d', label: 'Last 90 days', days: 90 },
  { key: 'all', label: 'All time', days: null },
];

function paramsForPreset(preset) {
  if (preset.days == null) return {};
  const to = new Date();
  const from = new Date(to.getTime() - preset.days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

export default function Executive() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activePreset, setActivePreset] = useState('all');
  const [exporting, setExporting] = useState(false);

  const load = useCallback((presetKey) => {
    setLoading(true);
    setError('');
    const preset = PRESETS.find((p) => p.key === presetKey) || PRESETS.at(-1);
    return analyticsApi
      .executive(paramsForPreset(preset))
      .then((d) => setData(d))
      .catch((e) => setError(e.response?.data?.error?.message || 'Executive analytics failed'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const preset = PRESETS.find((p) => p.key === 'all') || PRESETS.at(-1);
    analyticsApi
      .executive(paramsForPreset(preset))
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e.response?.data?.error?.message || 'Executive analytics failed'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const onPreset = (key) => {
    setActivePreset(key);
    load(key);
  };

  const downloadPdf = async () => {
    setExporting(true);
    try {
      const preset = PRESETS.find((p) => p.key === activePreset) || PRESETS.at(-1);
      const blob = await analyticsApi.reportPdf(paramsForPreset(preset));
      const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'shopsense-executive-report.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('PDF export failed. Try again.');
    } finally {
      setExporting(false);
    }
  };

  const s = data?.summary;
  const g = data?.growth;
  const t = data?.totals;
  const trend = data?.trend || [];
  const topVendors = data?.topVendors || [];
  const topProducts = data?.topProducts || [];
  const mp = data?.marketplace;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Executive report</h1>
          <p className="text-sm text-slate-500">
            Consolidated marketplace intelligence, one request. Generated {data?.generatedAt ? new Date(data.generatedAt).toLocaleString() : '—'}.
          </p>
        </div>
        <button
          onClick={downloadPdf}
          disabled={exporting || !data}
          className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {exporting ? 'Preparing PDF…' : '↓ Executive PDF'}
        </button>
      </div>

      {/* Date-range presets */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Window</span>
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => onPreset(p.key)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
              activePreset === p.key
                ? 'bg-brand-600 text-white'
                : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {error && <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {loading && <Spinner />}

      {!loading && data && (
        <>
          {/* Executive KPI strip */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard label="GMV" value={compactMoney(t?.gmv)} accent="indigo" sub={<Growth pct={g?.gmvPct} />} />
            <StatCard label="Net revenue" value={compactMoney(t?.netRevenue)} accent="emerald" sub={`margin ${t?.marginPct}%`} />
            <StatCard label="Avg order value" value={compactMoney(t?.aov)} accent="amber" sub={<Growth pct={g?.aovPct} />} />
            <StatCard label="Orders" value={t?.orders ?? 0} accent="sky" sub={<Growth pct={g?.ordersPct} />} />
            <StatCard label="Active vendors" value={mp?.activeVendors ?? 0} accent="indigo" sub={`of ${mp?.vendorCount ?? 0} total`} />
            <StatCard label="Customers" value={mp?.customerCount ?? 0} accent="emerald" sub={`${mp?.productCount ?? 0} products`} />
          </div>

          {/* Revenue trend + fulfilment */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
              <h2 className="text-sm font-semibold text-ink">Revenue trend</h2>
              <p className="text-xs text-slate-500">GMV vs net revenue (after commission) for the selected window.</p>
              {trend.length === 0 ? (
                <p className="mt-2 text-sm text-slate-400">No data for this window.</p>
              ) : (
                <div className="mt-4 h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trend}>
                      <defs>
                        <linearGradient id="ex-gmv" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="ex-net" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`} />
                      <Tooltip formatter={(v) => money(v)} />
                      <Legend />
                      <Area type="monotone" name="GMV" dataKey="gmv" stroke="#4f46e5" strokeWidth={2} fill="url(#ex-gmv)" />
                      <Area type="monotone" name="Net revenue" dataKey="netRevenue" stroke="#10b981" strokeWidth={2} fill="url(#ex-net)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Fulfilment + benchmark snapshot */}
            <div className="space-y-6">
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-ink">Fulfilment</h2>
                <p className="text-xs text-slate-500">Delivered ÷ total orders across the marketplace.</p>
                <p className="mt-3 text-4xl font-semibold tracking-tight text-indigo-600">
                  {s?.fulfilmentRate != null ? `${Math.round(s.fulfilmentRate * 100)}%` : '—'}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {s?.deliveredOrders ?? 0} of {s?.orderCount ?? 0} orders delivered
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-ink">Marketplace benchmark</h2>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between"><dt className="text-slate-500">Avg vendor revenue</dt><dd className="font-medium">{money(data?.benchmark?.avgRevenue)}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Avg fulfilment</dt><dd className="font-medium">{Math.round((data?.benchmark?.avgFulfilment || 0) * 100)}%</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Avg growth</dt><dd className="font-medium">{(data?.benchmark?.avgGrowth ?? 0).toFixed(1)}%</dd></div>
                  <div className="flex justify-between border-t border-slate-100 pt-2"><dt className="text-slate-500">Top vendor</dt><dd className="font-semibold text-indigo-600">{data?.benchmark?.topVendor || '—'}</dd></div>
                </dl>
              </div>
            </div>
          </div>

          {/* Top vendors + top products */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-ink">Top vendors by GMV</h2>
              <p className="text-xs text-slate-500">The marketplace's highest-grossing vendors.</p>
              {topVendors.length === 0 ? (
                <p className="mt-2 text-sm text-slate-400">No vendor data.</p>
              ) : (
                <div className="mt-4 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topVendors} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`} />
                      <YAxis type="category" dataKey="businessName" tick={{ fontSize: 11 }} width={110} />
                      <Tooltip formatter={(v) => money(v)} />
                      <Bar dataKey="gmv" fill="#4f46e5" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-ink">Top products by revenue</h2>
              <p className="text-xs text-slate-500">The marketplace's highest-revenue products.</p>
              {topProducts.length === 0 ? (
                <p className="mt-2 text-sm text-slate-400">No product data.</p>
              ) : (
                <div className="mt-4 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topProducts} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                      <Tooltip formatter={(v) => money(v)} />
                      <Bar dataKey="revenue" fill="#0ea5e9" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Vendor detail table */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-ink">Vendor performance detail</h2>
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
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topVendors.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-6 text-center text-slate-400">No data</td></tr>
                ) : topVendors.map((v) => (
                  <tr key={v.vendorId} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-ink">{v.businessName}</td>
                    <td className="px-4 py-3 font-medium">{money(v.gmv)}</td>
                    <td className="px-4 py-3 text-slate-600">{money(v.netRevenue)}</td>
                    <td className="px-4 py-3 text-slate-600">{money(v.commission)}</td>
                    <td className="px-4 py-3 text-slate-600">{v.marginPct}%</td>
                    <td className="px-4 py-3 text-slate-600">{v.orders}</td>
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
