import { useEffect, useState } from 'react';
import { productApi } from '../../api/client';
import Spinner from '../../components/Spinner';
import StatusBadge from '../../components/StatusBadge';

export default function Products() {
  const [products, setProducts] = useState(null);
  useEffect(() => { productApi.list().then(({ products }) => setProducts(products)).catch(() => setProducts([])); }, []);

  if (!products) return <Spinner />;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">All products</h1>
      <p className="text-sm text-slate-500">Every product across the marketplace.</p>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Product</th><th className="px-4 py-3">Vendor</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Price</th><th className="px-4 py-3">Status</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {products.map((p) => (
              <tr key={p._id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-ink">{p.name}</td>
                <td className="px-4 py-3 text-slate-600">{p.vendorId?.businessName || '—'}</td>
                <td className="px-4 py-3 text-slate-600">{p.category || '—'}</td>
                <td className="px-4 py-3 font-medium">${p.price?.toFixed(2)}</td>
                <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
              </tr>
            ))}
            {products.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">No products.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
