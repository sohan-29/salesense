import { useEffect, useState } from 'react';
import { customerApi } from '../../api/client';
import Spinner from '../../components/Spinner';

export default function Customers() {
  const [customers, setCustomers] = useState(null);
  useEffect(() => { customerApi.list().then(({ customers }) => setCustomers(customers)).catch(() => setCustomers([])); }, []);

  if (!customers) return <Spinner />;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Customers</h1>
      <p className="text-sm text-slate-500">Registered marketplace customers.</p>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Address</th><th className="px-4 py-3">Joined</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {customers.map((c) => (
              <tr key={c._id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-ink">{c.name}</td>
                <td className="px-4 py-3 text-slate-600">{c.email}</td>
                <td className="px-4 py-3 text-slate-600">{c.phone || '—'}</td>
                <td className="px-4 py-3 text-slate-600">{c.address || '—'}</td>
                <td className="px-4 py-3 text-slate-500">{new Date(c.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {customers.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">No customers yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
