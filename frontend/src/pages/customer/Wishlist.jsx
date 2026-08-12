import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { wishlistApi, cartApi } from '../../api/client';
import Spinner from '../../components/Spinner';

const money = (n) => `₹${Number(n || 0).toFixed(2)}`;

/**
 * Wishlist page. A saved-for-later set of products. Each item can be moved
 * straight to the cart (one round-trip via the move-to-cart endpoint, which
 * adds to cart + removes from wishlist) or removed entirely. The heart toggle
 * lives on Catalog cards; this page is the management view.
 */
export default function Wishlist() {
  const navigate = useNavigate();
  const [wishlist, setWishlist] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState(null);

  const load = () => wishlistApi.get().then(({ wishlist }) => setWishlist(wishlist));

  useEffect(() => {
    load().catch(() => setWishlist({ items: [] }));
  }, []);

  const items = (wishlist?.items || []).filter((i) => i.productId);

  const move = async (item) => {
    setBusyId(item.productId._id);
    setToast(null);
    try {
      await wishlistApi.moveToCart(item.productId._id);
      // Refresh local wishlist state (move-to-cart removed the item).
      await load();
      setToast({ kind: 'ok', msg: `“${item.productId.name}” moved to your cart.` });
    } catch (err) {
      setToast({ kind: 'err', msg: err.response?.data?.error?.message || 'Could not move to cart.' });
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (item) => {
    setBusyId(item.productId._id);
    setToast(null);
    try {
      const { wishlist: updated } = await wishlistApi.remove(item.productId._id);
      setWishlist(updated);
    } catch (err) {
      setToast({ kind: 'err', msg: err.response?.data?.error?.message || 'Could not remove item.' });
    } finally {
      setBusyId(null);
    }
  };

  if (!wishlist) return <Spinner />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Your wishlist</h1>
        <p className="text-sm text-slate-500">
          {items.length === 0 ? 'No saved items yet — tap the heart on any product.' : `${items.length} saved item${items.length === 1 ? '' : 's'}.`}
        </p>
      </div>

      {toast && (
        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            toast.kind === 'ok'
              ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20'
              : 'bg-rose-50 text-rose-700 ring-1 ring-rose-600/20'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <p className="text-sm text-slate-500">Your wishlist is empty.</p>
          <button
            onClick={() => navigate('/')}
            className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Browse products
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => {
            const p = item.productId;
            const out = (p.status && p.status !== 'active');
            return (
              <div key={p._id} className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex h-40 items-center justify-center bg-brand-50">
                  {p.images?.length ? (
                    <img src={p.images[0]} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-4xl font-bold text-brand-300">{(p.name || '?')[0]}</span>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent w-fit">
                    {p.category || 'Misc'}
                  </span>
                  <h3 className="mt-2 text-sm font-semibold text-ink">{p.name}</h3>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-lg font-bold text-brand-700">{money(p.price)}</span>
                    {out && <span className="text-xs font-medium text-rose-600">Unavailable</span>}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => move(item)}
                      disabled={busyId === p._id || out}
                      className="flex-1 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                    >
                      {busyId === p._id ? 'Moving…' : 'Move to cart'}
                    </button>
                    <button
                      onClick={() => remove(item)}
                      disabled={busyId === p._id}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      aria-label="Remove from wishlist"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
