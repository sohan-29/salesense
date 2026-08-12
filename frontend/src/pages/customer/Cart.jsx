import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cartApi, recommendationApi } from '../../api/client';
import Spinner from '../../components/Spinner';

const money = (n) => `₹${Number(n || 0).toFixed(2)}`;

/**
 * Shopping cart page. Lists cart items with quantity steppers, shows a live
 * order total, and converts the whole cart into one atomic order via
 * POST /api/cart/checkout (server-side transaction: all-or-nothing stock +
 * Transaction rows). On success it routes to My Transactions so the customer
 * sees their freshly created order.
 */
export default function Cart() {
  const navigate = useNavigate();
  const [cart, setCart] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [toast, setToast] = useState(null);
  const [recs, setRecs] = useState([]);

  const loadCart = () => cartApi.get().then(({ cart }) => setCart(cart));

  const loadRecs = async () => {
    try {
      const { recommendations } = await recommendationApi.forCustomer({ limit: 4 });
      setRecs(recommendations);
    } catch {
      setRecs([]);
    }
  };

  useEffect(() => {
    loadCart().catch(() => setCart({ items: [] }));
    loadRecs();
  }, []);

  const items = cart?.items || [];
  const liveItems = items.filter((i) => i.productId); // drop refs to deleted products
  const subtotal = liveItems.reduce((sum, i) => sum + (i.productId.price || 0) * i.quantity, 0);

  const setQty = async (item, qty) => {
    setBusyId(item.productId._id);
    setToast(null);
    try {
      const { cart: updated } = await cartApi.setQty(item.productId._id, qty);
      setCart(updated);
    } catch (err) {
      setToast({ kind: 'err', msg: err.response?.data?.error?.message || 'Could not update quantity.' });
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (item) => {
    setBusyId(item.productId._id);
    setToast(null);
    try {
      const { cart: updated } = await cartApi.removeItem(item.productId._id);
      setCart(updated);
    } catch (err) {
      setToast({ kind: 'err', msg: err.response?.data?.error?.message || 'Could not remove item.' });
    } finally {
      setBusyId(null);
    }
  };

  const checkout = async () => {
    setCheckingOut(true);
    setToast(null);
    try {
      await cartApi.checkout();
      setToast({ kind: 'ok', msg: 'Order placed! Redirecting to your transactions…' });
      setTimeout(() => navigate('/my-transactions'), 900);
    } catch (err) {
      setToast({ kind: 'err', msg: err.response?.data?.error?.message || 'Checkout failed. No order was placed.' });
    } finally {
      setCheckingOut(false);
    }
  };

  if (!cart) return <Spinner />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Your cart</h1>
        <p className="text-sm text-slate-500">
          {liveItems.length === 0 ? 'No items yet — browse the catalog to add some.' : `${liveItems.length} item${liveItems.length === 1 ? '' : 's'} ready to check out.`}
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

      {liveItems.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <p className="text-sm text-slate-500">Your cart is empty.</p>
          <button
            onClick={() => navigate('/')}
            className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Browse products
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Items */}
          <div className="space-y-3 lg:col-span-2">
            {liveItems.map((item) => {
              const p = item.productId;
              const out = (p.status && p.status !== 'active');
              return (
                <div key={p._id} className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-brand-50">
                    {p.images?.length ? (
                      <img src={p.images[0]} alt={p.name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xl font-bold text-brand-300">{(p.name || '?')[0]}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{p.name}</p>
                    <p className="text-xs text-slate-500">{p.category || 'Misc'} · {money(p.price)}</p>
                    {out && <p className="mt-0.5 text-xs font-medium text-rose-600">No longer available</p>}
                  </div>

                  {/* Quantity stepper */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setQty(item, item.quantity - 1)}
                      disabled={busyId === p._id}
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      aria-label="Decrease quantity"
                    >
                      –
                    </button>
                    <span className="w-8 text-center text-sm font-medium text-ink">{item.quantity}</span>
                    <button
                      onClick={() => setQty(item, item.quantity + 1)}
                      disabled={busyId === p._id}
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>

                  <span className="w-20 text-right text-sm font-bold text-brand-700">{money(p.price * item.quantity)}</span>
                  <button
                    onClick={() => remove(item)}
                    disabled={busyId === p._id}
                    className="text-slate-400 hover:text-rose-600 disabled:opacity-50"
                    aria-label="Remove item"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Summary */}
          <div className="lg:col-span-1">
            <div className="sticky top-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-ink">Order summary</h2>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Subtotal</dt>
                  <dd className="font-medium text-ink">{money(subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Shipping</dt>
                  <dd className="font-medium text-emerald-600">Free</dd>
                </div>
                <div className="mt-3 flex justify-between border-t border-slate-100 pt-3">
                  <dt className="font-semibold text-ink">Total</dt>
                  <dd className="text-lg font-bold text-brand-700">{money(subtotal)}</dd>
                </div>
              </dl>
              <button
                onClick={checkout}
                disabled={checkingOut}
                className="mt-5 w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {checkingOut ? 'Placing order…' : 'Checkout'}
              </button>
              <p className="mt-2 text-center text-[11px] text-slate-400">
                Checkout is atomic — if any item is out of stock, nothing is charged.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Recommendations while the cart is open */}
      {recs.length > 0 && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-5">
          <h2 className="text-sm font-semibold text-ink">You might also like</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {recs.map((r) => (
              <button
                key={r.product._id}
                onClick={() => navigate('/')}
                className="rounded-lg border border-slate-200 bg-white p-3 text-left hover:border-brand-300"
              >
                <p className="truncate text-sm font-semibold text-ink">{r.product.name}</p>
                <p className="text-sm font-bold text-brand-700">{money(r.product.price)}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
