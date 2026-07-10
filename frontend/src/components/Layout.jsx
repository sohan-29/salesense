import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const icon = {
  catalog: 'M4 7l8 4 8-4M4 7v10l8 4 8-4V7M4 7l8-4 8 4',
  products: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  profile: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  sales: 'M3 3v18h18M7 14l3-3 3 3 4-5',
  vendors: 'M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87',
  customers: 'M12 4.5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zM5 20h14a3 3 0 00-3-3H8a3 3 0 00-3 3z',
  txns: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z',
  dash: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3',
};

const navByRole = {
  customer: [
    { to: '/', label: 'Catalog', icon: icon.catalog },
    { to: '/profile', label: 'My Profile', icon: icon.profile },
  ],
  vendor: [
    { to: '/', label: 'My Products', icon: icon.products },
    { to: '/sales', label: 'Sales', icon: icon.sales },
    { to: '/profile', label: 'My Profile', icon: icon.profile },
  ],
  admin: [
    { to: '/', label: 'Dashboard', icon: icon.dash },
    { to: '/vendors', label: 'Vendors', icon: icon.vendors },
    { to: '/customers', label: 'Customers', icon: icon.customers },
    { to: '/products', label: 'Products', icon: icon.products },
    { to: '/transactions', label: 'Transactions', icon: icon.txns },
  ],
};

export default function Layout() {
  const { account, logout, role } = useAuth();
  const nav = navByRole[role] || [];
  const roleLabel = role ? role[0].toUpperCase() + role.slice(1) : '';
  const displayName = account?.businessName || account?.name || account?.contactEmail;

  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
      isActive ? 'bg-brand-500/20 text-white' : 'text-indigo-100/80 hover:bg-white/10'
    }`;

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <aside className="fixed inset-y-0 left-0 w-64 bg-sidebar px-4 py-6 text-white">
        <div className="flex items-center gap-2 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 font-bold">S</div>
          <div>
            <p className="text-sm font-semibold leading-tight">ShopSense</p>
            <p className="text-xs text-indigo-200/70">{roleLabel} portal</p>
          </div>
        </div>

        <nav className="mt-8 space-y-1">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={linkClass}>
              <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6}>
                <path strokeLinecap="round" strokeLinejoin="round" d={n.icon} />
              </svg>
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="absolute inset-x-4 bottom-4 rounded-lg bg-white/10 p-3">
          <p className="truncate text-sm font-medium">{displayName}</p>
          <p className="truncate text-xs text-indigo-200/70">{account?.contactEmail || account?.email}</p>
          <button onClick={logout} className="mt-2 text-xs font-medium text-indigo-200/80 hover:text-white">
            Sign out
          </button>
        </div>
      </aside>

      <main className="ml-64 p-8">
        <Outlet />
      </main>
    </div>
  );
}
