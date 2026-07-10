import { useEffect, useState } from 'react';
import { transactionApi, productApi } from '../api/client';
import Spinner from '../components/Spinner';

const currency = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n ?? 0);

const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export default function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ productId: '', quantity: 1 });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [t, p] = await Promise.all([transactionApi.list(), productApi.list()]);
      setTransactions(t.transactions || []);
      setProducts(p.products || []);
    } catch (e) {
      setError(e.response?.data?.error?.message || 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      const { transaction } = await transactionApi.create(form);
      setSuccess(`Order recorded: ${transaction.quantity} × ${currency(transaction.unitPrice)} = ${currency(transaction.totalAmount)}`);
      setForm({ productId: '', quantity: 1 });
      await load();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Order failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Spinner label="Loading transactions…" />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
        <p className="text-sm text-slate-500">Record orders and review sales history</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Record order */}
        <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700">Record an Order</h2>
          <p className="mt-1 text-xs text-slate-400">Atomic: stock decremented and transaction written together.</p>

          {success && <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{success}</div>}
          {error && <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}

          <label className="mt-4 block text-sm font-medium text-slate-700">Product</label>
          <select
            required
            value={form.productId}
            onChange={(e) => setForm({ ...form, productId: e.target.value })}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 outline-none"
          >
            <option value="">Select a product…</option>
            {products.map((p) => (
              <option key={p._id} value={p._id}>{p.name} — {currency(p.price)}</option>
            ))}
          </select>

          <label className="mt-4 block text-sm font-medium text-slate-700">Quantity</label>
          <input
            type="number"
            min={1}
            required
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 outline-none"
          />

          <button disabled={submitting} className="mt-5 w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
            {submitting ? 'Recording…' : 'Record Order'}
          </button>
        </form>

        {/* Recent orders */}
        <div className="lg:col-span-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-700">Recent Orders</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 text-right font-medium">Qty</th>
                <th className="px-4 py-3 text-right font-medium">Unit</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t._id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 text-slate-500">{dateFmt.format(new Date(t.date))}</td>
                  <td className="px-4 py-3 font-medium text-slate-700">{t.productId?.name || '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{t.quantity}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-500">{currency(t.unitPrice)}</td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">{currency(t.totalAmount)}</td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">No transactions yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
