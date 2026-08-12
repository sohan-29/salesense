import { useEffect, useState } from 'react';
import { productApi, recommendationApi, cartApi, wishlistApi } from '../../api/client';
import Spinner from '../../components/Spinner';

const money = (n) => `₹${Number(n || 0).toFixed(2)}`;

export default function Catalog() {
  const [products, setProducts] = useState(null);
  const [recs, setRecs] = useState([]);
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState(null);
  const [wishIds, setWishIds] = useState(new Set());

  const loadProducts = () => productApi.list().then(({ products }) => setProducts(products));

  const loadRecs = async () => {
    try {
      const { recommendations } = await recommendationApi.forCustomer({ limit: 5 });
      setRecs(recommendations);
    } catch {
      // Cold-start or no customer token: fall back to popular.
      try {
        const { recommendations } = await recommendationApi.popular({ limit: 5 });
        setRecs(recommendations);
      } catch {
        setRecs([]);
      }
    }
  };

  // Load the wishlist once so the heart toggle reflects saved state.
  const loadWishIds = async () => {
    try {
      const { wishlist } = await wishlistApi.get();
      setWishIds(new Set((wishlist.items || []).map((i) => (i.productId?._id || i.productId).toString())));
    } catch {
      setWishIds(new Set());
    }
  };

  useEffect(() => {
    loadProducts().catch(() => setProducts([]));
    loadRecs();
    loadWishIds();
  }, []);

  const addToCart = async (p) => {
    setBusyId(p._id);
    setToast(null);
    try {
      await cartApi.addItem(p._id, 1);
      setToast({ kind: 'ok', msg: `Added “${p.name}” to your cart.` });
    } catch (err) {
      const msg = err.response?.data?.error?.message || 'Could not add to cart.';
      setToast({ kind: 'err', msg });
    } finally {
      setBusyId(null);
    }
  };

  const toggleWish = async (p) => {
    setBusyId(p._id);
    setToast(null);
    const saved = wishIds.has(p._id);
    // Optimistic toggle for snappy UI.
    setWishIds((prev) => {
      const next = new Set(prev);
      if (saved) next.delete(p._id);
      else next.add(p._id);
      return next;
    });
    try {
      if (saved) await wishlistApi.remove(p._id);
      else await wishlistApi.add(p._id);
    } catch (err) {
      // Revert on failure.
      setWishIds((prev) => {
        const next = new Set(prev);
        if (saved) next.add(p._id);
        else next.delete(p._id);
        return next;
      });
      setToast({ kind: 'err', msg: err.response?.data?.error?.message || 'Could not update wishlist.' });
    } finally {
      setBusyId(null);
    }
  };

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

      {toast && (
        <div
          className={`mb-4 rounded-lg px-3 py-2 text-sm ${
            toast.kind === 'ok'
              ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20'
              : 'bg-rose-50 text-rose-700 ring-1 ring-rose-600/20'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {recs.length > 0 && (
        <div className="mb-8 rounded-xl border border-indigo-200 bg-indigo-50/40 p-5">
          <h2 className="text-sm font-semibold text-ink">Recommended for you</h2>
          <p className="text-xs text-slate-500">Based on your purchase history and what similar customers bought.</p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {recs.map((r) => (
              <div key={r.product._id} className="rounded-lg border border-slate-200 bg-white p-3">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-accent">{r.product.category || 'Misc'}</span>
                <p className="mt-1 text-sm font-semibold text-ink line-clamp-1">{r.product.name}</p>
                <p className="text-sm font-bold text-brand-700">{money(r.product.price)}</p>
                <p className="mt-1 text-[10px] text-slate-400">{reasonLabel(r.reason)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-slate-500">No products found.</p>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => (
            <div key={p._id} className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex h-40 items-center justify-center bg-brand-50">
                {p.images?.length ? (
                  <img src={p.images[0]} alt={p.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-4xl font-bold text-brand-300">{(p.name || '?')[0]}</span>
                )}
              </div>
              <div className="flex flex-1 flex-col p-4">
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
                  <span className="text-lg font-bold text-brand-700">{money(p.price)}</span>
                  {p.sku && <span className="text-xs text-slate-400">SKU {p.sku}</span>}
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => addToCart(p)}
                    disabled={busyId === p._id}
                    className="flex-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
                  >
                    {busyId === p._id ? 'Adding…' : 'Add to cart'}
                  </button>
                  <button
                    onClick={() => toggleWish(p)}
                    disabled={busyId === p._id}
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border disabled:opacity-60 ${
                      wishIds.has(p._id)
                        ? 'border-rose-300 bg-rose-50 text-rose-600'
                        : 'border-slate-300 text-slate-400 hover:text-rose-500'
                    }`}
                    aria-label={wishIds.has(p._id) ? 'Remove from wishlist' : 'Add to wishlist'}
                    title={wishIds.has(p._id) ? 'In your wishlist' : 'Save to wishlist'}
                  >
                    <svg className="h-5 w-5" fill={wishIds.has(p._id) ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function reasonLabel(reason) {
  if (reason === 'collaborative') return 'Customers like you bought this';
  if (reason === 'content') return 'In your favourite category';
  if (reason === 'popular') return 'Popular right now';
  if (reason === 'svd') return 'Smart pick (ML)';
  if (reason === 'cosine') return 'Similar to what you buy (ML)';
  return '';
}
