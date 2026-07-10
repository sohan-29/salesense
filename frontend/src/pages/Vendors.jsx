import { useEffect, useState } from 'react';
import { vendorApi } from '../api/client';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';
import Spinner from '../components/Spinner';

const emptyForm = { businessName: '', contactEmail: '', password: '', phone: '' };

export default function Vendors() {
  const { isAdmin, register } = useAuth();
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { vendors: v } = await vendorApi.list();
      setVendors(v);
    } catch (e) {
      setError(e.response?.data?.error?.message || 'Failed to load vendors');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) load();
    else setLoading(false);
  }, [isAdmin]);

  const submit = async (e) => {
    e.preventDefault();
    setFieldErrors({});
    setSubmitting(true);
    try {
      await register(form);
      await load();
      setForm(emptyForm);
      setShowForm(false);
    } catch (err) {
      const details = err.response?.data?.error?.details;
      if (details?.fieldErrors) {
        setFieldErrors(details.fieldErrors);
      } else {
        setError(err.response?.data?.error?.message || 'Registration failed');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const changeStatus = async (id, status) => {
    try {
      await vendorApi.updateStatus(id, { status });
      await load();
    } catch (e) {
      setError(e.response?.data?.error?.message || 'Status update failed');
    }
  };

  if (!isAdmin) {
    return <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">Vendor management is an admin-only view.</div>;
  }
  if (loading) return <Spinner label="Loading vendors…" />;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vendors</h1>
          <p className="text-sm text-slate-500">Onboarding, verification and lifecycle</p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
        >
          {showForm ? 'Close' : 'Register Vendor'}
        </button>
      </div>

      {error && <div className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      {showForm && (
        <form onSubmit={submit} className="mb-6 grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700">Business name *</label>
            <input
              required
              value={form.businessName}
              onChange={(e) => setForm({ ...form, businessName: e.target.value })}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 outline-none"
            />
            {fieldErrors.businessName && <p className="mt-1 text-xs text-rose-600">{fieldErrors.businessName}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Contact email *</label>
            <input
              type="email"
              required
              value={form.contactEmail}
              onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 outline-none"
            />
            {fieldErrors.contactEmail && <p className="mt-1 text-xs text-rose-600">{fieldErrors.contactEmail}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Phone</label>
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Password *</label>
            <input
              type="password"
              required
              minLength={6}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 outline-none"
            />
            {fieldErrors.password && <p className="mt-1 text-xs text-rose-600">{fieldErrors.password}</p>}
          </div>
          <div className="sm:col-span-2">
            <button disabled={submitting} className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
              {submitting ? 'Registering…' : 'Register Vendor'}
            </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-medium">Business</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Commission</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {vendors.map((v) => (
              <tr key={v._id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-700">{v.businessName}</td>
                <td className="px-4 py-3 text-slate-500">{v.contactEmail}</td>
                <td className="px-4 py-3 tabular-nums text-slate-500">{v.commissionRate}%</td>
                <td className="px-4 py-3"><StatusBadge status={v.status} /></td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    {v.status !== 'Active' && (
                      <button onClick={() => changeStatus(v._id, 'Active')} className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100">Activate</button>
                    )}
                    {v.status !== 'Suspended' && (
                      <button onClick={() => changeStatus(v._id, 'Suspended')} className="rounded-md bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100">Suspend</button>
                    )}
                    {v.status !== 'Pending' && (
                      <button onClick={() => changeStatus(v._id, 'Pending')} className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200">Reset</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {vendors.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">No vendors yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
