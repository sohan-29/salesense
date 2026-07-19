import { useEffect, useState } from 'react';
import { analyticsApi } from '../../api/client';
import Spinner from '../../components/Spinner';

/**
 * Admin validation report: backtests the three Milestone-2 analytical outputs
 * (forecast, segmentation, recommendations) against held-out historical
 * transactions and shows actual vs the concept-note thresholds.
 */
export default function Validation() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    analyticsApi
      .validate()
      .then((d) => setData(d))
      .catch((e) => setError(e.response?.data?.error?.message || 'Validation failed'));
  }, []);

  if (error) return <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>;
  if (!data) return <Spinner />;

  const rows = [
    { label: 'Forecast accuracy', value: data.forecastAccuracy, threshold: data.thresholds.forecastAccuracy, hint: '1 − MAPE of predicted vs actual test-window units' },
    { label: 'Segmentation quality', value: data.segmentationQuality, threshold: data.thresholds.segmentationQuality, hint: 'Cohesion-vs-separation proxy over RFM features' },
    { label: 'Recommendation relevance', value: data.recommendationRelevance, threshold: data.thresholds.recommendationRelevance, hint: 'Held-out last-purchase hit rate' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Validation report</h1>
      <p className="text-sm text-slate-500">
        Backtesting against held-out historical transactions. Split at {data.details?.splitDate ? new Date(data.details.splitDate).toLocaleString() : '—'}.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {rows.map((r) => {
          const pct = Math.round(r.value * 100);
          const targetPct = Math.round(r.threshold * 100);
          const pass = r.value >= r.threshold;
          return (
            <div key={r.label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-500">{r.label}</p>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${pass ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                  {pass ? 'Pass' : 'Below'}
                </span>
              </div>
              <p className={`mt-2 text-3xl font-semibold tracking-tight ${pass ? 'text-emerald-600' : 'text-rose-600'}`}>{pct}%</p>
              <p className="mt-1 text-xs text-slate-400">Target ≥ {targetPct}%</p>
              <p className="mt-2 text-xs text-slate-500">{r.hint}</p>
            </div>
          );
        })}
      </div>

      {data.details && (
        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-ink">Backtest details</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Detail label="Transactions" value={data.details.transactions} />
            <Detail label="Test window" value={`${data.details.testWindowDays} days`} />
            <Detail label="Products forecast" value={data.details.forecastProducts} />
            <Detail label="Customers segmented" value={data.details.segmentationCustomers} />
            <Detail label="Rec. candidates" value={data.details.recommendationCandidates} />
            <Detail label="Rec. served (CF)" value={data.details.recommendationEvaluated} />
            <Detail label="Rec. hits" value={data.details.recommendationHits} />
          </dl>
          {data.details.message && <p className="mt-3 text-sm text-slate-400">{data.details.message}</p>}
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="text-sm font-semibold text-ink">{value}</dd>
    </div>
  );
}
