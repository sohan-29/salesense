import { useEffect, useState } from 'react';
import { analyticsApi, transactionApi } from '../../api/client';
import Spinner from '../../components/Spinner';
import StatCard from '../../components/StatCard';

const money = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n || 0);

export default function Sales() {
  const [summary, setSummary] = useState(null);
  const [txns, setTxns] = useState(null);

  useEffect(() => {
    Promise.all([analyticsApi.summary(), transactionApi.list()])
      .then(([s, t]) => { setSummary(s.summary); setTxns(t.transactions); })
      .catch(() => { setSummary({}); setTxns([]); });
  }, []);

  if (!summary || !txns) return <Spinner />;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Sales</h1>
      <p className="text-sm text-slate-500">Your revenue and order history.</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Revenue (GMV)" value={money(summary.gmv)} accent="indigo" />
        <StatCard label="Units sold" value={summary.totalUnits} accent="emerald" />
        <StatCard label="Orders" value={summary.orderCount} accent="sky" />
        <StatCard label="Avg order value" value={money(summary.aov)} accent="amber" />
      </div>

      <div className="mt-8 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
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
