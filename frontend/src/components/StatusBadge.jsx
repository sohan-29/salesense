const styles = {
  Active: 'bg-emerald-100 text-emerald-700 ring-emerald-600/20',
  Pending: 'bg-amber-100 text-amber-700 ring-amber-600/20',
  Suspended: 'bg-rose-100 text-rose-700 ring-rose-600/20',
  draft: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  active: 'bg-emerald-100 text-emerald-700 ring-emerald-600/20',
  archived: 'bg-slate-100 text-slate-500 ring-slate-500/20',
  paid: 'bg-emerald-100 text-emerald-700 ring-emerald-600/20',
  shipped: 'bg-sky-100 text-sky-700 ring-sky-600/20',
  delivered: 'bg-indigo-100 text-indigo-700 ring-indigo-600/20',
  cancelled: 'bg-rose-100 text-rose-700 ring-rose-600/20',
  refunded: 'bg-amber-100 text-amber-700 ring-amber-600/20',
};

export default function StatusBadge({ status }) {
  const cls = styles[status] || 'bg-slate-100 text-slate-600 ring-slate-500/20';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}>
      {status}
    </span>
  );
}
