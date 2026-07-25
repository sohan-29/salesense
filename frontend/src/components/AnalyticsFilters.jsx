import { useEffect, useState } from 'react';
import { categoryApi, vendorApi } from '../api/client';

const STATUSES = ['paid', 'pending', 'shipped', 'delivered', 'refunded', 'cancelled'];

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30';

/**
 * Shared filter bar for the graphical analytics on the admin Dashboard and
 * vendor Sales pages. Calls `onChange(filterObject)` whenever a filter
 * changes; the owning page fetches `/api/analytics/chart` with that object.
 *
 * `isAdmin` toggles the vendor dropdown (vendors are auto-scoped server-side).
 */
export default function AnalyticsFilters({ onChange, isAdmin = false }) {
  const [filters, setFilters] = useState({
    from: '',
    to: '',
    minPrice: '',
    maxPrice: '',
    category: '',
    status: '',
    vendorId: '',
  });
  const [categories, setCategories] = useState([]);
  const [vendors, setVendors] = useState([]);

  useEffect(() => {
    categoryApi.list().then((c) => setCategories(c.categories || [])).catch(() => setCategories([]));
    if (isAdmin) {
      vendorApi.list().then((v) => setVendors(v.vendors || [])).catch(() => setVendors([]));
    }
  }, [isAdmin]);

  // Notify the parent whenever any filter changes (debounce-free; fetch is cheap).
  useEffect(() => {
    const params = {};
    if (filters.from) params.from = new Date(filters.from).toISOString();
    if (filters.to) {
      // Make `to` inclusive of the selected day by pushing to end-of-day.
      const end = new Date(filters.to);
      end.setHours(23, 59, 59, 999);
      params.to = end.toISOString();
    }
    if (filters.minPrice !== '') params.minPrice = Number(filters.minPrice);
    if (filters.maxPrice !== '') params.maxPrice = Number(filters.maxPrice);
    if (filters.category) params.category = filters.category;
    if (filters.status) params.status = filters.status;
    if (isAdmin && filters.vendorId) params.vendorId = filters.vendorId;
    onChange(params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, isAdmin]);

  const update = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  const reset = () =>
    setFilters({ from: '', to: '', minPrice: '', maxPrice: '', category: '', status: '', vendorId: '' });

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Filters</h2>
        <button
          onClick={reset}
          className="rounded-lg px-3 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
        >
          Reset
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-slate-500">
          From date
          <input type="date" value={filters.from} onChange={(e) => update('from', e.target.value)} className={`mt-1 ${inputCls}`} />
        </label>
        <label className="text-xs text-slate-500">
          To date
          <input type="date" value={filters.to} onChange={(e) => update('to', e.target.value)} className={`mt-1 ${inputCls}`} />
        </label>
        <label className="text-xs text-slate-500">
          Min price (₹)
          <input
            type="number"
            min="0"
            value={filters.minPrice}
            onChange={(e) => update('minPrice', e.target.value)}
            className={`mt-1 ${inputCls}`}
            placeholder="0"
          />
        </label>
        <label className="text-xs text-slate-500">
          Max price (₹)
          <input
            type="number"
            min="0"
            value={filters.maxPrice}
            onChange={(e) => update('maxPrice', e.target.value)}
            className={`mt-1 ${inputCls}`}
            placeholder="any"
          />
        </label>
        <label className="text-xs text-slate-500">
          Category
          <select value={filters.category} onChange={(e) => update('category', e.target.value)} className={`mt-1 ${inputCls}`}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c._id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-500">
          Order status
          <select value={filters.status} onChange={(e) => update('status', e.target.value)} className={`mt-1 ${inputCls}`}>
            <option value="">All (excl. cancelled)</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        {isAdmin && (
          <label className="text-xs text-slate-500">
            Vendor
            <select value={filters.vendorId} onChange={(e) => update('vendorId', e.target.value)} className={`mt-1 ${inputCls}`}>
              <option value="">All vendors</option>
              {vendors.map((v) => (
                <option key={v._id} value={v._id}>
                  {v.businessName}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </div>
  );
}
