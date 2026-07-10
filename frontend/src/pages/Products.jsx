import { useEffect, useState } from 'react';
import { productApi, inventoryApi } from '../api/client';
import StatusBadge from '../components/StatusBadge';
import Spinner from '../components/Spinner';

const currency = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n ?? 0);

export default function Products() {
  const [products, setProducts] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([productApi.list(), inventoryApi.list()])
      .then(([p, i]) => {
        setProducts(p.products || []);
        setInventory(i.inventory || []);
      })
      .catch((e) => setError(e.response?.data?.error?.message || 'Failed to load products'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner label="Loading products…" />;
  if (error) return <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>;

  const stockByProduct = Object.fromEntries(inventory.map((i) => [i.productId?._id || i.productId, i]));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Product Catalog</h1>
        <p className="text-sm text-slate-500">Products and live stock levels</p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 text-right font-medium">Price</th>
              <th className="px-4 py-3 text-right font-medium">Stock</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const inv = stockByProduct[p._id];
              const stock = inv?.stockAvailable ?? '—';
              const low = inv && inv.stockAvailable <= inv.reorderThreshold;
              return (
                <tr key={p._id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-slate-700">{p.name}</td>
                  <td className="px-4 py-3 text-slate-500">{p.sku || '—'}</td>
                  <td className="px-4 py-3 text-slate-500">{p.category}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{currency(p.price)}</td>
                  <td className={`px-4 py-3 text-right tabular-nums font-medium ${low ? 'text-amber-600' : 'text-slate-600'}`}>
                    {stock}
                    {low && <span className="ml-1 text-[10px] uppercase">low</span>}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                </tr>
              );
            })}
            {products.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">No products yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
