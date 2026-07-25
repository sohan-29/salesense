import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';
import Spinner from './Spinner';

const money = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

const COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

const card = 'rounded-xl border border-slate-200 bg-white p-5 shadow-sm';
const title = 'text-sm font-semibold text-ink';

function Empty({ label = 'No data for these filters' }) {
  return <p className="mt-2 text-sm text-slate-400">{label}</p>;
}

function ChartCard({ heading, subtitle, children }) {
  return (
    <div className={card}>
      <h2 className={title}>{heading}</h2>
      {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      <div className="mt-4 h-64">{children}</div>
    </div>
  );
}

/**
 * Renders the full graphical-analytics grid from a /api/analytics/chart
 * response. `data` is the endpoint payload; `loading` shows a spinner.
 * `byVendor` is only present for admins.
 */
export default function AnalyticsCharts({ data, loading, isAdmin = false }) {
  if (loading) return <Spinner />;
  if (!data) return null;

  const ts = data.timeseries || [];
  const byCategory = data.byCategory || [];
  const byStatus = data.byStatus || [];
  const priceBuckets = data.priceBuckets || [];
  const topProducts = data.topProducts || [];
  const byVendor = data.byVendor || [];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Revenue over time — the headline chart */}
      <div className={card + ' lg:col-span-2'}>
        <h2 className={title}>Revenue over time</h2>
        <p className="text-xs text-slate-500">Daily revenue across the selected filters.</p>
        {ts.length === 0 ? (
          <Empty />
        ) : (
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={ts}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`} />
                <Tooltip formatter={(v) => money(v)} />
                <Area type="monotone" dataKey="revenue" stroke="#4f46e5" strokeWidth={2} fill="url(#rev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Revenue by category */}
      <ChartCard heading="Revenue by category" subtitle="Where the money comes from.">
        {byCategory.length === 0 ? (
          <Empty />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={byCategory} dataKey="revenue" nameKey="category" cx="50%" cy="50%" outerRadius={90} label>
                {byCategory.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => money(v)} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Order status mix */}
      <ChartCard heading="Order status mix" subtitle="Count of orders by status.">
        {byStatus.length === 0 ? (
          <Empty />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={byStatus} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={90} label>
                {byStatus.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Price distribution */}
      <ChartCard heading="Order value distribution" subtitle="How many orders fall in each price band.">
        {priceBuckets.every((b) => b.count === 0) ? (
          <Empty />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={priceBuckets}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Top products */}
      <ChartCard heading="Top products" subtitle="By revenue in the selected filters.">
        {topProducts.length === 0 ? (
          <Empty />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topProducts} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
              <Tooltip formatter={(v) => money(v)} />
              <Bar dataKey="revenue" fill="#10b981" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Revenue by vendor (admin only) */}
      {isAdmin && (
        <ChartCard heading="Revenue by vendor" subtitle="Vendor contribution to filtered GMV.">
          {byVendor.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byVendor}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="businessName" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`} />
                <Tooltip formatter={(v) => money(v)} />
                <Bar dataKey="revenue" fill="#f59e0b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      )}
    </div>
  );
}
