import { useEffect, useState } from 'react';
import { productApi, inventoryApi, categoryApi } from '../../api/client';
import Spinner from '../../components/Spinner';
import StatusBadge from '../../components/StatusBadge';

const empty = { name: '', sku: '', category: '', price: '', description: '', images: '', stock: '', status: 'active' };

export default function MyProducts() {
  const [products, setProducts] = useState(null);
  const [categories, setCategories] = useState([]);
  const [editing, setEditing] = useState(null); // product id or 'new' or null
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [{ products: ps }, { categories: cs }] = await Promise.all([productApi.list(), categoryApi.list().catch(() => ({ categories: [] }))]);
    setProducts(ps);
    setCategories(cs);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setForm(empty); setEditing('new'); setError(''); };
  const openEdit = (p) => {
    setForm({ name: p.name, sku: p.sku || '', category: p.category || '', price: p.price, description: p.description || '', images: (p.images || []).join(', '), stock: '', status: p.status });
    setEditing(p._id);
    setError('');
  };
  const close = () => { setEditing(null); setForm(empty); setError(''); };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    const body = {
      name: form.name,
      sku: form.sku,
      category: form.category,
      price: Number(form.price),
      description: form.description,
      images: form.images ? form.images.split(',').map((s) => s.trim()).filter(Boolean) : [],
      status: form.status,
      ...(editing === 'new' ? { stock: Number(form.stock) || 0 } : {}),
    };
    try {
      if (editing === 'new') await productApi.create(body);
      else await productApi.update(editing, body);
      await load();
      close();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Save failed');
    } finally { setBusy(false); }
  };

  const remove = async (id) => {
    if (!confirm('Delete this product?')) return;
    await productApi.remove(id);
    await load();
  };

  if (!products) return <Spinner />;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">My products</h1>
          <p className="text-sm text-slate-500">Add and manage your catalogue.</p>
        </div>
        <button onClick={openNew} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">+ Add product</button>
      </div>

      {editing && (
        <form onSubmit={submit} className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">{editing === 'new' ? 'Add product' : 'Edit product'}</h2>
          {error && <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-600/20">{error}</div>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            <Input label="SKU" value={form.sku} onChange={(v) => setForm({ ...form, sku: v })} required={false} />
            <div>
              <label className="block text-sm font-medium text-slate-700">Category</label>
              <input list="cats" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30" />
              <datalist id="cats">{categories.map((c) => <option key={c._id} value={c.name} />)}</datalist>
            </div>
            <Input label="Price (INR)" type="number" value={form.price} onChange={(v) => setForm({ ...form, price: v })} />
            {editing === 'new' && <Input label="Initial stock" type="number" value={form.stock} onChange={(v) => setForm({ ...form, stock: v })} required={false} />}
            <div>
              <label className="block text-sm font-medium text-slate-700">Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30">
                <option value="active">active</option>
                <option value="draft">draft</option>
                <option value="archived">archived</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700">Image URLs (comma-separated)</label>
              <input value={form.images} onChange={(e) => setForm({ ...form, images: e.target.value })} placeholder="https://…/img1.jpg, https://…/img2.jpg" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700">Description</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30" />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="submit" disabled={busy} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">{busy ? 'Saving…' : 'Save'}</button>
            <button type="button" onClick={close} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
          </div>
        </form>
      )}

      {products.length === 0 ? (
        <p className="text-sm text-slate-500">No products yet. Click “Add product”.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr><th className="px-4 py-3">Product</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Price</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.map((p) => (
                <tr key={p._id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded bg-brand-50 text-brand-400">
                        {p.images?.length ? <img src={p.images[0]} alt="" className="h-10 w-10 rounded object-cover" /> : (p.name || '?')[0]}
                      </div>
                      <div><p className="font-medium text-ink">{p.name}</p><p className="text-xs text-slate-400">{p.sku}</p></div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{p.category || '—'}</td>
                  <td className="px-4 py-3 font-medium text-ink">₹{p.price?.toFixed(2)}</td>
                  <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openEdit(p)} className="text-brand-600 hover:text-brand-700">Edit</button>
                    <button onClick={() => remove(p._id)} className="ml-3 text-rose-500 hover:text-rose-600">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Input({ label, value, onChange, type = 'text', required = true }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      <input type={type} required={required} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30" />
    </div>
  );
}
