import { useEffect, useState } from 'react';
import { analyticsApi, inventoryApi } from '../api/client';
import StatCard from '../components/StatCard';
import StatusBadge from '../components/StatusBadge';
import Spinner from '../components/Spinner';

const currency = (n) =>
  n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

const num = (n) => new Intl.NumberFormat('en-US').format(n ?? 0);

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [revenue, setRevenue] = useState([]);
  const [products, setProducts] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([analyticsApi.summary(), analyticsApi.revenue(), analyticsApi.products(), inventoryApi.lowStock()])
      .then(([s, r, p, ls]) => {
        setSummary(s.summary);
        setRevenue(r.report || []);
        setProducts((p.report || []).slice(0, 8));
        setLowStock(ls.inventory || []);
      })
      .catch((e) => setError(e.response?.data?.error?.message || 'Failed to load analytics'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner label="Loading analytics…" />;
  if (error) return <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>;

  const maxRevenue = Math.max(...revenue.map((r) => r.totalRevenue || 0), 1);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Marketplace Dashboard</h1>
        <p className="text-sm text-slate-500">Revenue, product performance and vendor overview</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Gross Merchandise Value" value={currency(summary?.gmv)} accent="indigo" sub={`${num(summary?.orderCount)} orders`} />
        <StatCard label="Units Sold" value={num(summary?.totalUnits)} accent="emerald" />
        <StatCard label="Avg Order Value" value={currency(summary?.aov)} accent="amber" />
        <StatCard label="Active Vendors" value={`${summary?.activeVendors ?? 0} / ${summary?.vendorCount ?? 0}`} accent="sky" sub={`${summary?.productCount} products`} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Revenue by vendor — bar chart */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700">Revenue by Vendor</h2>
          <div className="mt-4 space-y-3">
            {revenue.length === 0 && <p className="text-sm text-slate-400">No transactions yet.</p>}
            {revenue.map((r) => (
              <div key={r.vendorId} className="flex items-center gap-3">
                <div className="w-32 truncate text-sm text-slate-600">{r.businessName || 'Unknown'}</div>
                <div className="relative flex-1">
                  <div className="h-6 w-full overflow-hidden rounded bg-slate-100">
                    <div
                      className="h-6 rounded bg-indigo-500 transition-all"
                      style={{ width: `${(r.totalRevenue / maxRevenue) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="w-24 text-right text-sm font-medium text-slate-700">{currency(r.totalRevenue)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Top products by revenue — table */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700">Top Products by Revenue</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-4 font-medium">Product</th>
                  <th className="py-2 pr-4 font-medium">Category</th>
                  <th className="py-2 pr-4 text-right font-medium">Units</th>
                  <th className="py-2 text-right font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {products.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-slate-400">No sales recorded yet.</td>
                  </tr>
                )}
                {products.map((p) => (
                  <tr key={p.productId} className="border-b border-slate-100 last:border-0">
                    <td className="py-2.5 pr-4 font-medium text-slate-700">{p.name}</td>
                    <td className="py-2.5 pr-4 text-slate-500">{p.category}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{num(p.unitsSold)}</td>
                    <td className="py-2.5 text-right font-medium tabular-nums">{currency(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Low stock alerts */}
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Low-Stock Alerts</h2>
          <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">{lowStock.length}</span>
        </div>
        {lowStock.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">All products are above reorder threshold.</p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {lowStock.map((i) => (
              <div key={i._id} className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 ring-1 ring-amber-600/20">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-700">{i.product?.name || 'Product'}</p>
                  <p className="truncate text-xs text-slate-400">{i.product?.sku || i.product?.category}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-amber-700">{i.stockAvailable} left</p>
                  <p className="text-[10px] text-slate-400">min {i.reorderThreshold}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
