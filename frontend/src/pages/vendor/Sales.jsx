import { useEffect, useState, useCallback } from 'react';
import { analyticsApi, transactionApi } from '../../api/client';
import Spinner from '../../components/Spinner';
import StatCard from '../../components/StatCard';
import AnalyticsFilters from '../../components/AnalyticsFilters';
import AnalyticsCharts from '../../components/AnalyticsCharts';

const money = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n || 0);

export default function Sales() {
  const [summary, setSummary] = useState(null);
  const [txns, setTxns] = useState(null);
  const [chart, setChart] = useState(null);
  const [chartLoading, setChartLoading] = useState(true);
  const [filters, setFilters] = useState({});

  useEffect(() => {
    Promise.all([analyticsApi.summary(), transactionApi.list()])
      .then(([s, t]) => { setSummary(s.summary); setTxns(t.transactions); })
      .catch(() => { setSummary({}); setTxns([]); });
  }, []);

  // Filterable analytics: re-fetch /chart (vendor-scoped server-side) on change.
  const onFiltersChange = useCallback((params) => {
    setFilters(params);
    setChartLoading(true);
    analyticsApi
      .chart(params)
      .then((d) => setChart(d))
      .catch(() => setChart(null))
      .finally(() => setChartLoading(false));
  }, []);

  if (!summary || !txns) return <Spinner />;

  const cs = chart?.summary;
  const hasFilters = Object.keys(filters).length > 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Sales</h1>
        <p className="text-sm text-slate-500">Your revenue and order history, filterable by date, price, category & status.</p>
      </div>

      {/* Filter bar (vendor is auto-scoped to their own data server-side) */}
      <AnalyticsFilters onChange={onFiltersChange} />

      {/* Filtered KPIs (all-time shown as sub) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={hasFilters ? 'Revenue (filtered)' : 'Revenue (GMV)'}
          value={money(cs?.gmv)}
          accent="indigo"
          sub={`all-time ${money(summary.gmv)} · ${cs?.orderCount ?? 0} orders`}
        />
        <StatCard
          label={hasFilters ? 'Units (filtered)' : 'Units sold'}
          value={cs?.totalUnits ?? 0}
          accent="emerald"
          sub={`all-time ${summary.totalUnits ?? 0}`}
        />
        <StatCard
          label={hasFilters ? 'Avg order (filtered)' : 'Avg order value'}
          value={money(cs?.aov)}
          accent="amber"
          sub={`all-time ${money(summary.aov)}`}
        />
        <StatCard
          label="Orders"
          value={cs?.orderCount ?? 0}
          accent="sky"
          sub={hasFilters ? `filtered from ${summary.orderCount ?? 0}` : 'all-time'}
        />
      </div>

      {/* Charts */}
      <AnalyticsCharts data={chart} loading={chartLoading} />

      {/* Order history */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-ink">Order history</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Product</th><th className="px-4 py-3">Qty</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Status</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {txns.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">No sales yet.</td></tr>
            ) : txns.map((t) => (
              <tr key={t._id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-500">{new Date(t.date).toLocaleDateString()}</td>
                <td className="px-4 py-3 font-medium text-ink">{t.productId?.name || '—'}</td>
                <td className="px-4 py-3 text-slate-600">{t.quantity}</td>
                <td className="px-4 py-3 font-medium text-ink">{money(t.totalAmount)}</td>
                <td className="px-4 py-3"><span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">{t.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
