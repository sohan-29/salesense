import { useEffect, useState } from 'react';
import { customerApi } from '../../api/client';
import Spinner from '../../components/Spinner';
import StatCard from '../../components/StatCard';

const money = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n || 0);

const SEGMENTS = [
  { key: 'frequentBuyers', label: 'Frequent buyers', accent: 'emerald' },
  { key: 'occasional', label: 'Occasional', accent: 'sky' },
  { key: 'atRisk', label: 'At risk', accent: 'amber' },
  { key: 'dormantUsers', label: 'Dormant', accent: 'indigo' },
  { key: 'newUsers', label: 'New', accent: 'sky' },
];

export default function Customers() {
  const [customers, setCustomers] = useState(null);
  const [segments, setSegments] = useState(null);
  const [selected, setSelected] = useState(null);
  const [behaviour, setBehaviour] = useState(null);

  const load = async () => {
    try {
      const [c, s] = await Promise.all([customerApi.list(), customerApi.segments()]);
      setCustomers(c.customers);
      setSegments(s);
    } catch {
      setCustomers([]);
      setSegments(null);
    }
  };
  useEffect(() => { load(); }, []);

  const openBehaviour = async (c) => {
    setSelected(c);
    setBehaviour(null);
    try {
      const b = await customerApi.behaviour(c._id);
      setBehaviour(b.behaviour);
    } catch {
      setBehaviour({ history: [], orderCount: 0, totalSpend: 0 });
    }
  };

  if (!customers) return <Spinner />;

  const counts = segments?.summary?.counts || {};

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Customers</h1>
      <p className="text-sm text-slate-500">Segmentation and purchase behaviour across the marketplace.</p>

      {segments && (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {SEGMENTS.map((s) => (
            <StatCard key={s.key} label={s.label} value={counts[s.key] || 0} accent={s.accent} />
          ))}
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th><th className="px-4 py-3">Segment</th>
                <th className="px-4 py-3">Orders</th><th className="px-4 py-3">Spend</th>
                <th className="px-4 py-3">Last purchase</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customers.map((c) => (
                <tr key={c._id} className="cursor-pointer hover:bg-slate-50" onClick={() => openBehaviour(c)}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{c.name}</p>
                    <p className="text-xs text-slate-400">{c.email}</p>
                  </td>
                  <td className="px-4 py-3"><SegmentBadge segment={c.segment} /></td>
                  <td className="px-4 py-3 text-slate-600">{c.orderCount || 0}</td>
                  <td className="px-4 py-3 font-medium text-ink">{money(c.totalSpend)}</td>
                  <td className="px-4 py-3 text-slate-500">{c.lastPurchaseDate ? new Date(c.lastPurchaseDate).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
              {customers.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">No customers yet.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          {selected ? (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-ink">{selected.name}</h2>
                <button onClick={() => { setSelected(null); setBehaviour(null); }} className="text-xs text-slate-400 hover:text-slate-600">Close</button>
              </div>
              <p className="text-xs text-slate-400">{selected.email}</p>

              {!behaviour ? (
                <p className="mt-4 text-sm text-slate-400">Loading…</p>
              ) : (
                <>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <Mini label="Orders" value={behaviour.orderCount} />
                    <Mini label="Spend" value={money(behaviour.totalSpend)} />
                    <Mini label="Units" value={behaviour.totalUnits} />
                  </div>
                  <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    Favourite category: <span className="font-medium text-ink">{behaviour.favouriteCategory || '—'}</span>
                  </div>
                  <h3 className="mt-4 text-xs font-semibold uppercase text-slate-400">Recent purchases</h3>
                  <ul className="mt-2 space-y-2">
                    {behaviour.history.slice(0, 8).map((h) => (
                      <li key={h._id} className="flex items-center justify-between text-sm">
                        <div>
                          <p className="font-medium text-ink">{h.product?.name || 'Product'}</p>
                          <p className="text-xs text-slate-400">{new Date(h.date).toLocaleDateString()} · {h.product?.category}</p>
                        </div>
                        <span className="font-medium text-ink">{money(h.totalAmount)}</span>
                      </li>
                    ))}
                    {behaviour.history.length === 0 && <li className="text-sm text-slate-400">No purchases yet.</li>}
                  </ul>
                </>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-400">Select a customer to view their purchase behaviour.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Mini({ label, value }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2 py-2">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}

function SegmentBadge({ segment }) {
  const map = {
    frequentBuyers: 'bg-emerald-50 text-emerald-700',
    occasional: 'bg-sky-50 text-sky-700',
    atRisk: 'bg-amber-50 text-amber-700',
    dormantUsers: 'bg-indigo-50 text-indigo-700',
    newUsers: 'bg-slate-100 text-slate-600',
  };
  const label = { frequentBuyers: 'Frequent', occasional: 'Occasional', atRisk: 'At risk', dormantUsers: 'Dormant', newUsers: 'New' };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${map[segment] || 'bg-slate-100 text-slate-600'}`}>
      {label[segment] || segment}
    </span>
  );
}
