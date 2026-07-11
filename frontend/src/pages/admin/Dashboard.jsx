import { useEffect, useState } from 'react';
import { analyticsApi, inventoryApi } from '../../api/client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import Spinner from '../../components/Spinner';
import StatCard from '../../components/StatCard';

const money = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n || 0);

export default function Dashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    Promise.all([analyticsApi.summary(), analyticsApi.revenue(), analyticsApi.products(), inventoryApi.lowStock()])
      .then(([s, r, p, ls]) => setData({ summary: s.summary, revenue: r.report, products: p.report, low: ls.inventory }))
      .catch(() => setData({ summary: {}, revenue: [], products: [], low: [] }));
  }, []);

  if (!data) return <Spinner />;

  const s = data.summary;
  const chart = data.revenue.map((r) => ({ name: r.businessName || '—', revenue: r.totalRevenue }));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Dashboard</h1>
      <p className="text-sm text-slate-500">Marketplace overview across all vendors.</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="GMV (total revenue)" value={money(s.gmv)} accent="indigo" sub={`${s.orderCount} orders · AOV ${money(s.aov)}`} />
        <StatCard label="Units sold" value={s.totalUnits} accent="emerald" />
        <StatCard label="Active vendors" value={`${s.activeVendors}/${s.vendorCount}`} accent="sky" sub={`${s.productCount} products`} />
        <StatCard label="Customers" value={s.customerCount ?? 0} accent="amber" />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-ink">Revenue by vendor</h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => money(v)} />
                <Bar dataKey="revenue" fill="#4f46e5" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-ink">Top products</h2>
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-400"><tr><th className="py-2">Product</th><th className="py-2">Revenue</th><th className="py-2">Units</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.products.slice(0, 6).map((p) => (
                <tr key={p.productId}>
                  <td className="py-2"><span className="font-medium text-ink">{p.name}</span><span className="ml-2 text-xs text-slate-400">{p.category}</span></td>
                  <td className="py-2 font-medium">{money(p.revenue)}</td>
                  <td className="py-2 text-slate-600">{p.unitsSold}</td>
                </tr>
              ))}
              {data.products.length === 0 && <tr><td colSpan={3} className="py-4 text-center text-slate-400">No data</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-ink">Low-stock alerts</h2>
        {data.low.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">No low-stock items.</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-3">
            {data.low.map((i) => (
              <div key={i._id} className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm">
                <span className="font-medium text-amber-800">{i.product?.name || 'Product'}</span>
                <span className="ml-2 text-amber-600">{i.stockAvailable} left</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
