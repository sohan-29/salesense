import { useEffect, useState } from 'react';
import { vendorApi } from '../../api/client';
import Spinner from '../../components/Spinner';
import StatusBadge from '../../components/StatusBadge';

export default function Vendors() {
  const [vendors, setVendors] = useState(null);
  const [filter, setFilter] = useState('');

  const load = () => vendorApi.list(filter ? { status: filter } : {}).then(({ vendors }) => setVendors(vendors));
  useEffect(() => { load(); }, [filter]);

  const setStatus = async (id, status) => {
    await vendorApi.updateStatus(id, { status });
    await load();
  };

  if (!vendors) return <Spinner />;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div><h1 className="text-2xl font-semibold text-ink">Vendors</h1><p className="text-sm text-slate-500">Approve, suspend, and review vendors.</p></div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500">
          <option value="">All statuses</option>
          <option value="Pending">Pending</option>
          <option value="Active">Active</option>
          <option value="Suspended">Suspended</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Business</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Commission</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {vendors.map((v) => (
              <tr key={v._id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-ink">{v.businessName}</td>
                <td className="px-4 py-3 text-slate-600">{v.contactEmail}</td>
                <td className="px-4 py-3 text-slate-600">{v.commissionRate}%</td>
                <td className="px-4 py-3"><StatusBadge status={v.status} /></td>
                <td className="px-4 py-3 text-right space-x-2">
                  {v.status !== 'Active' && <button onClick={() => setStatus(v._id, 'Active')} className="text-emerald-600 hover:text-emerald-700">Approve</button>}
                  {v.status !== 'Suspended' && <button onClick={() => setStatus(v._id, 'Suspended')} className="text-rose-500 hover:text-rose-600">Suspend</button>}
                  {v.status === 'Suspended' && <button onClick={() => setStatus(v._id, 'Active')} className="text-emerald-600 hover:text-emerald-700">Reactivate</button>}
                </td>
              </tr>
            ))}
            {vendors.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">No vendors.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
