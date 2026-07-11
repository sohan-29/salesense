import { useEffect, useState } from 'react';
import { transactionApi } from '../../api/client';
import Spinner from '../../components/Spinner';

const money = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n || 0);

export default function Transactions() {
  const [txns, setTxns] = useState(null);
  useEffect(() => { transactionApi.list().then(({ transactions }) => setTxns(transactions)).catch(() => setTxns([])); }, []);

  if (!txns) return <Spinner />;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Transactions</h1>
      <p className="text-sm text-slate-500">All marketplace orders.</p>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Product</th><th className="px-4 py-3">Qty</th><th className="px-4 py-3">Unit price</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Status</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {txns.map((t) => (
              <tr key={t._id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-500">{new Date(t.date).toLocaleDateString()}</td>
                <td className="px-4 py-3 font-medium text-ink">{t.productId?.name || '—'}</td>
                <td className="px-4 py-3 text-slate-600">{t.quantity}</td>
                <td className="px-4 py-3 text-slate-600">{money(t.unitPrice)}</td>
                <td className="px-4 py-3 font-medium">{money(t.totalAmount)}</td>
                <td className="px-4 py-3"><span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">{t.status}</span></td>
              </tr>
            ))}
            {txns.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">No transactions.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
