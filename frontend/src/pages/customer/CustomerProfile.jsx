import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

export default function CustomerProfile() {
  const { account, setAccount } = useAuth();
  const [form, setForm] = useState({ name: account?.name || '', phone: account?.phone || '', address: account?.address || '' });
  const [saved, setSaved] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    // Customers have no update endpoint yet; reflect locally for now.
    setAccount({ ...account, ...form });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-semibold text-ink">My profile</h1>
      <p className="mt-1 text-sm text-slate-500">Your customer account details.</p>

      <form onSubmit={save} className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <label className="block text-sm font-medium text-slate-700">Email</label>
          <input value={account?.email || ''} disabled className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Phone</label>
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Address</label>
          <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30" />
        </div>
        <button type="submit" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">Save</button>
        {saved && <span className="ml-3 text-sm text-emerald-600">Saved</span>}
      </form>
    </div>
  );
}
