import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { vendorApi } from '../../api/client';

export default function VendorProfile() {
  const { account, refreshAccount } = useAuth();
  const [form, setForm] = useState({
    businessName: account?.businessName || '',
    phone: account?.phone || '',
    address: account?.businessDetails?.address || '',
    gstNumber: account?.businessDetails?.gstNumber || '',
    description: account?.businessDetails?.description || '',
    commissionRate: account?.commissionRate ?? 0,
  });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [msg, setMsg] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg('');
    try {
      await vendorApi.updateMe({
        businessName: form.businessName,
        phone: form.phone,
        businessDetails: { address: form.address, gstNumber: form.gstNumber, description: form.description },
        commissionRate: Number(form.commissionRate),
      });
      await refreshAccount();
      setMsg('Profile updated');
      setTimeout(() => setMsg(''), 2000);
    } catch (err) {
      setMsg(err.response?.data?.error?.message || 'Update failed');
    } finally { setBusy(false); }
  };

  const changePw = async (e) => {
    e.preventDefault();
    setBusy(true); setPwMsg('');
    try {
      await vendorApi.changePassword(pw);
      setPw({ currentPassword: '', newPassword: '' });
      setPwMsg('Password changed');
      setTimeout(() => setPwMsg(''), 2000);
    } catch (err) {
      setPwMsg(err.response?.data?.error?.message || 'Change failed');
    } finally { setBusy(false); }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-ink">My profile</h1>
      <p className="mt-1 text-sm text-slate-500">Update your vendor business details.</p>

      <form onSubmit={save} className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <label className="block text-sm font-medium text-slate-700">Business email</label>
          <input value={account?.contactEmail || ''} disabled className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500" />
        </div>
        <Row label="Business name" value={form.businessName} onChange={(v) => setForm({ ...form, businessName: v })} />
        <Row label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} required={false} />
        <Row label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} required={false} />
        <Row label="GST number" value={form.gstNumber} onChange={(v) => setForm({ ...form, gstNumber: v })} required={false} />
        <Row label="Commission rate (%)" type="number" value={form.commissionRate} onChange={(v) => setForm({ ...form, commissionRate: v })} />
        <div>
          <label className="block text-sm font-medium text-slate-700">Description</label>
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30" />
        </div>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={busy} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">Save</button>
          {msg && <span className="text-sm text-emerald-600">{msg}</span>}
        </div>
      </form>

      <form onSubmit={changePw} className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold">Change password</h2>
        <Row label="Current password" type="password" value={pw.currentPassword} onChange={(v) => setPw({ ...pw, currentPassword: v })} />
        <Row label="New password" type="password" value={pw.newPassword} onChange={(v) => setPw({ ...pw, newPassword: v })} />
        <div className="flex items-center gap-3">
          <button type="submit" disabled={busy} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">Update password</button>
          {pwMsg && <span className="text-sm text-emerald-600">{pwMsg}</span>}
        </div>
      </form>
    </div>
  );
}

function Row({ label, value, onChange, type = 'text', required = true }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      <input type={type} required={required} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30" />
    </div>
  );
}
