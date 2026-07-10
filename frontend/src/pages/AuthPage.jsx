import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ROLES = [
  { key: 'customer', label: 'Customer', desc: 'Browse products from vendors' },
  { key: 'vendor', label: 'Vendor', desc: 'Sell & manage your products' },
  { key: 'admin', label: 'Admin', desc: 'Marketplace oversight' },
];

const field = (label, name, type, form, setForm, opts = {}) => (
  <div key={name}>
    <label className="block text-sm font-medium text-slate-700">{label}</label>
    <input
      type={type}
      required={opts.required !== false}
      value={form[name] ?? ''}
      onChange={(e) => setForm({ ...form, [name]: e.target.value })}
      className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30"
      placeholder={opts.placeholder || ''}
    />
  </div>
);

export default function AuthPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const [role, setRole] = useState('customer');
  const [mode, setMode] = useState('login'); // login | signup
  const [form, setForm] = useState({ email: '', password: '', name: '', businessName: '', phone: '', address: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const credentials = { email: form.email, password: form.password };
      if (mode === 'login') {
        await login(role, credentials);
      } else {
        const body =
          role === 'customer'
            ? { name: form.name, email: form.email, password: form.password, phone: form.phone, address: form.address }
            : role === 'vendor'
            ? { businessName: form.businessName, email: form.email, password: form.password, phone: form.phone, address: form.address }
            : { businessName: form.businessName, email: form.email, password: form.password, phone: form.phone };
        await register(role, body);
      }
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error?.message || `${mode} failed`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white text-lg font-bold">S</div>
          <div>
            <h1 className="text-xl font-semibold text-ink">ShopSense</h1>
            <p className="text-sm text-slate-500">Multi-Vendor Analytics Platform</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {/* role selector */}
          <div className="grid grid-cols-3 gap-2">
            {ROLES.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => { setRole(r.key); setMode('login'); setError(''); }}
                className={`rounded-lg border px-2 py-2 text-center transition ${
                  role === r.key
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}
              >
                <span className="block text-sm font-semibold">{r.label}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-center text-xs text-slate-500">{ROLES.find((r) => r.key === role).desc}</p>

          {/* mode toggle */}
          <div className="mt-5 flex rounded-lg bg-slate-100 p-1 text-sm">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`flex-1 rounded-md px-3 py-1.5 font-medium ${mode === 'login' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => setMode('signup')}
              className={`flex-1 rounded-md px-3 py-1.5 font-medium ${mode === 'signup' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`}
            >
              Sign up
            </button>
          </div>

          {error && (
            <div className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-600/20">{error}</div>
          )}

          <form onSubmit={submit} className="mt-4 space-y-3">
            {mode === 'signup' && role === 'customer' && field('Name', 'name', 'text', form, setForm)}
            {mode === 'signup' && (role === 'vendor' || role === 'admin') && field('Business name', 'businessName', 'text', form, setForm, { required: role === 'vendor' })}
            {field('Email', 'email', 'email', form, setForm, { placeholder: role === 'admin' ? 'admin@shopsense.test' : '' })}
            {field('Password', 'password', 'password', form, setForm)}
            {mode === 'signup' && field('Phone (optional)', 'phone', 'text', form, setForm, { required: false })}
            {mode === 'signup' && role !== 'admin' && field('Address (optional)', 'address', 'text', form, setForm, { required: false })}

            <button
              type="submit"
              disabled={busy}
              className="mt-2 w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
            >
              {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          {role === 'admin' && mode === 'login' && (
            <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              Demo admin: <code>admin@shopsense.test</code> / <code>admin123</code>
            </p>
          )}
          {role === 'vendor' && (
            <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              Demo vendor: <code>vendor@shopsense.test</code> / <code>vendor123</code>
            </p>
          )}
          {role === 'customer' && (
            <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              Demo customer: <code>customer@shopsense.test</code> / <code>customer123</code>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
