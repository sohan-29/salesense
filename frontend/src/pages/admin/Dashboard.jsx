import { useEffect, useState, useCallback } from 'react';
import { analyticsApi, inventoryApi } from '../../api/client';
import Spinner from '../../components/Spinner';
import StatCard from '../../components/StatCard';
import AnalyticsFilters from '../../components/AnalyticsFilters';
import AnalyticsCharts from '../../components/AnalyticsCharts';

const money = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
const compactMoney = (n) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;

export default function Dashboard() {
  const [overview, setOverview] = useState(null); // all-time summary + low-stock + forecast
  const [chart, setChart] = useState(null);
  const [chartLoading, setChartLoading] = useState(true);
  const [filters, setFilters] = useState({});

  useEffect(() => {
    Promise.all([
      analyticsApi.summary(),
      inventoryApi.lowStock(),
      inventoryApi.forecast({ days: 14, horizon: 7 }).catch(() => ({ forecasts: [] })),
    ])
      .then(([s, ls, f]) =>
        setOverview({ summary: s.summary, low: ls.inventory, forecast: f.forecasts })
      )
      .catch(() => setOverview({ summary: {}, low: [], forecast: [] }));
  }, []);

  // Filterable analytics: re-fetch /chart whenever the filter object changes.
  const onFiltersChange = useCallback((params) => {
    setFilters(params);
    setChartLoading(true);
    analyticsApi
      .chart(params)
      .then((d) => setChart(d))
      .catch(() => setChart(null))
      .finally(() => setChartLoading(false));
  }, []);

  if (!overview) return <Spinner />;

  const all = overview.summary; // all-time
  const cs = chart?.summary; // filtered
  const hasFilters = Object.keys(filters).length > 0;

  return (
    <div className="space-y-8">
      {/* Header + marketplace context */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Dashboard</h1>
          <p className="text-sm text-slate-500">Marketplace performance, filterable by date, price, category & status.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600">
            {all.activeVendors ?? 0}/{all.vendorCount ?? 0} active vendors
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600">
            {all.productCount ?? 0} products
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600">
            {all.customerCount ?? 0} customers
          </span>
        </div>
      </div>

      {/* Filter bar */}
      <AnalyticsFilters onChange={onFiltersChange} isAdmin />

      {/* Filtered KPIs (all-time shown as sub for comparison) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={hasFilters ? 'Revenue (filtered)' : 'Revenue'}
          value={compactMoney(cs?.gmv)}
          accent="indigo"
          sub={`all-time ${compactMoney(all.gmv)} · ${cs?.orderCount ?? 0} orders`}
        />
        <StatCard
          label={hasFilters ? 'Units (filtered)' : 'Units sold'}
          value={cs?.totalUnits ?? 0}
          accent="emerald"
          sub={`all-time ${all.totalUnits ?? 0}`}
        />
        <StatCard
          label={hasFilters ? 'Avg order (filtered)' : 'Avg order value'}
          value={compactMoney(cs?.aov)}
          accent="amber"
          sub={`all-time ${compactMoney(all.aov)}`}
        />
        <StatCard
          label="Orders"
          value={cs?.orderCount ?? 0}
          accent="sky"
          sub={hasFilters ? `filtered from ${all.orderCount ?? 0}` : 'all-time'}
        />
      </div>

      {/* Charts */}
      <AnalyticsCharts data={chart} loading={chartLoading} isAdmin />

      {/* Operational: low-stock + forecast */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-ink">Low-stock alerts</h2>
          {overview.low.length === 0 ? (
            <p className="mt-2 text-sm text-slate-400">No low-stock items.</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {overview.low.map((i) => (
                <div key={i._id} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm">
                  <span className="font-medium text-amber-800">{i.product?.name || 'Product'}</span>
                  <span className="ml-2 text-amber-600">{i.stockAvailable} left</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-ink">Inventory forecast — next 7 days</h2>
          <p className="text-xs text-slate-500">Moving-average demand from the last 14 days of sales.</p>
          {overview.forecast.length === 0 ? (
            <p className="mt-2 text-sm text-slate-400">No forecast data.</p>
          ) : (
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-400">
                <tr><th className="py-2">Product</th><th className="py-2">Stock</th><th className="py-2">Avg/day</th><th className="py-2">Pred.</th><th className="py-2">Conf.</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {overview.forecast.slice(0, 6).map((f) => {
                  const low = f.predictedStock > f.stockAvailable;
                  return (
                    <tr key={f.productId}>
                      <td className="py-2 font-medium text-ink">{f.name}</td>
                      <td className="py-2 text-slate-600">{f.stockAvailable}</td>
                      <td className="py-2 text-slate-600">{f.avgDailySales}</td>
                      <td className={`py-2 font-medium ${low ? 'text-rose-600' : 'text-ink'}`}>{Math.round(f.predictedStock)}</td>
                      <td className="py-2 text-slate-600">{Math.round(f.confidenceLevel * 100)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
