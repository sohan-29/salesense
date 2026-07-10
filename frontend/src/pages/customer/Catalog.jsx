import { useEffect, useState } from 'react';
import { productApi } from '../../api/client';
import Spinner from '../../components/Spinner';

export default function Catalog() {
  const [products, setProducts] = useState(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    productApi.list().then(({ products }) => setProducts(products)).catch(() => setProducts([]));
  }, []);

  const filtered = (products || []).filter((p) =>
    !q ? true : p.name.toLowerCase().includes(q.toLowerCase()) || (p.category || '').toLowerCase().includes(q.toLowerCase())
  );

  if (!products) return <Spinner />;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Browse products</h1>
          <p className="text-sm text-slate-500">Products listed by marketplace vendors</p>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search products or categories…"
          className="w-72 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-slate-500">No products found.</p>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => (
            <div key={p._id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex h-40 items-center justify-center bg-brand-50">
                {p.images?.length ? (
                  <img src={p.images[0]} alt={p.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-4xl font-bold text-brand-300">{(p.name || '?')[0]}</span>
                )}
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                    {p.category || 'Misc'}
                  </span>
                  {p.vendorId?.businessName && (
                    <span className="text-xs text-slate-400">by {p.vendorId.businessName}</span>
                  )}
                </div>
                <h3 className="mt-2 text-sm font-semibold text-ink">{p.name}</h3>
                {p.description && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{p.description}</p>}
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-lg font-bold text-brand-700">${p.price?.toFixed(2)}</span>
                  {p.sku && <span className="text-xs text-slate-400">SKU {p.sku}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
