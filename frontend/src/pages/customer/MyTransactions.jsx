import { useEffect, useState } from 'react';
import {
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';
import { transactionApi } from '../../api/client';
import Spinner from '../../components/Spinner';
import StatCard from '../../components/StatCard';

const money = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
const COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

/**
 * Customer transaction analytics: a personal analytics dashboard showing the
 * signed-in customer their own spending — KPIs, spending over time, category
 * breakdown, top products, and the full order history.
 *
 * Data comes from the role-scoped GET /api/transactions (server returns only
 * the customer's own orders); aggregation is client-side (small per-customer set).
 */
export default function MyTransactions() {
  const [txns, setTxns] = useState(null);

  useEffect(() => {
    transactionApi.list().then((t) => setTxns(t.transactions || [])).catch(() => setTxns([]));
  }, []);

  if (!txns) return <Spinner />;

  // --- Aggregate ---
  let totalSpend = 0;
  let totalUnits = 0;
  const tsMap = new Map();
  const catMap = new Map();
  const prodMap = new Map();

  for (const t of txns) {
    if (t.status === 'cancelled') continue;
    totalSpend += t.totalAmount || 0;
    totalUnits += t.quantity || 0;

    const day = new Date(t.date).toISOString().slice(0, 10);
    const ts = tsMap.get(day) || { date: day, spend: 0, orders: 0 };
    ts.spend += t.totalAmount || 0;
    ts.orders += 1;
    tsMap.set(day, ts);

    const cat = t.productId?.category || 'Uncategorised';
    const c = catMap.get(cat) || { category: cat, spend: 0, units: 0 };
    c.spend += t.totalAmount || 0;
    c.units += t.quantity || 0;
    catMap.set(cat, c);

    const pid = t.productId?._id || t.productId;
    const name = t.productId?.name || '—';
    const p = prodMap.get(pid) || { name, spend: 0, units: 0 };
    p.spend += t.totalAmount || 0;
    p.units += t.quantity || 0;
    prodMap.set(pid, p);
  }

  const aov = txns.length ? totalSpend / txns.filter((t) => t.status !== 'cancelled').length : 0;
  const timeseries = [...tsMap.values()].sort((a, b) => a.date.localeCompare(b.date));
  const byCategory = [...catMap.values()].sort((a, b) => b.spend - a.spend);
  const topProducts = [...prodMap.values()].sort((a, b) => b.spend - a.spend).slice(0, 5);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink">My transactions</h1>
        <p className="text-sm text-slate-500">Your purchase history and spending analytics.</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total spent" value={money(totalSpend)} accent="indigo" sub={`${txns.length} orders`} />
        <StatCard label="Units bought" value={totalUnits} accent="emerald" />
        <StatCard label="Avg order value" value={money(aov)} accent="amber" />
        <StatCard label="Categories shopped" value={byCategory.length} accent="sky" />
      </div>

      {/* Spending over time */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-ink">Spending over time</h2>
        <p className="text-xs text-slate-500">Daily spend across your orders.</p>
        {timeseries.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">No purchases yet.</p>
        ) : (
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeseries}>
                <defs>
                  <linearGradient id="spend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`} />
                <Tooltip formatter={(v) => money(v)} />
                <Area type="monotone" dataKey="spend" stroke="#4f46e5" strokeWidth={2} fill="url(#spend)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Category + top products */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-ink">Spend by category</h2>
          {byCategory.length === 0 ? (
            <p className="mt-2 text-sm text-slate-400">No data.</p>
          ) : (
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byCategory} dataKey="spend" nameKey="category" cx="50%" cy="50%" outerRadius={90} label>
                    {byCategory.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => money(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-ink">Top products you buy</h2>
          {topProducts.length === 0 ? (
            <p className="mt-2 text-sm text-slate-400">No data.</p>
          ) : (
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProducts} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
                  <Tooltip formatter={(v) => money(v)} />
                  <Bar dataKey="spend" fill="#10b981" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Order history */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-ink">Order history</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Product</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Qty</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Status</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {txns.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">No orders yet. Browse the catalog to make your first purchase!</td></tr>
            ) : txns.map((t) => (
              <tr key={t._id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-500">{new Date(t.date).toLocaleDateString()}</td>
                <td className="px-4 py-3 font-medium text-ink">{t.productId?.name || '—'}</td>
                <td className="px-4 py-3 text-slate-600">{t.productId?.category || '—'}</td>
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
