import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  Bookmark,
  BookMarked,
  Cpu,
  Database,
  Gauge,
  Layers,
  PieChart as PieChartIcon,
  RefreshCw,
  Timer,
  TrendingUp,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Button } from '@/components/ui/Button';
import { Card, CardHeader, EmptyState, ErrorState, InlineNotice, PageTitle, SkeletonRows } from '@/components/ui/Panel';
import { useAsync } from '@/hooks/useAsync';
import {
  bucketLabel,
  bucketNumber,
  formatMs,
  formatNumber,
  formatPercent,
  formatScore,
} from '@/lib/format';
import { getAnalytics } from '@/services/api';

/** Restrained, colour-blind-safe-ish categorical palette. */
const PALETTE = ['#1d4ed8', '#0f766e', '#b45309', '#7c3aed', '#be123c', '#0369a1', '#4d7c0f', '#9333ea'];
const AXIS = '#94a3b8';
const GRID = '#e2e8f0';

const TOOLTIP_STYLE = {
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  fontSize: 12,
  boxShadow: '0 4px 12px -2px rgb(15 23 42 / 0.12)',
};

const WINDOWS = [7, 30, 90];

export function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const analytics = useAsync(() => getAnalytics(days), [days]);

  const summary = analytics.data?.summary;
  const sectorData = (analytics.data?.queries_by_sector ?? []).slice(0, 10);
  const productData = (analytics.data?.top_products ?? []).slice(0, 10);
  const distribution = analytics.data?.score_distribution ?? [];
  const trend = analytics.data?.queries_by_day ?? [];
  const topStandards = analytics.data?.top_recommended_standards ?? [];
  const share = analytics.data?.sector_share ?? [];

  const hasData = (summary?.total_queries ?? 0) > 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <PageTitle
        title="Analytics Dashboard"
        description="Every figure below is a live aggregate computed by the backend from the database — nothing here is hardcoded."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              Window
              <select
                className="select h-9 w-28 py-0 text-xs"
                value={days}
                onChange={(event) => setDays(Number(event.target.value))}
              >
                {WINDOWS.map((option) => (
                  <option key={option} value={option}>
                    {option} days
                  </option>
                ))}
              </select>
            </label>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void analytics.reload()}
              icon={<RefreshCw aria-hidden className="h-3.5 w-3.5" />}
            >
              Refresh
            </Button>
          </div>
        }
      />

      {analytics.isInitialLoading ? (
        <Card>
          <SkeletonRows rows={3} />
        </Card>
      ) : analytics.status === 'error' ? (
        <ErrorState
          title="Could not load analytics"
          message={analytics.error?.message}
          onRetry={() => void analytics.reload()}
        />
      ) : summary ? (
        <div className="space-y-5">
          {/* KPI cards */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              icon={Activity}
              label="Total queries"
              value={formatNumber(summary.total_queries)}
              sub={`${summary.queries_last_7_days} in the last 7 days`}
            />
            <Kpi
              icon={BookMarked}
              label="Standards indexed"
              value={formatNumber(summary.total_standards)}
              sub={`${formatNumber(summary.knowledge_base_demonstration_records)} demonstration records`}
            />
            <Kpi
              icon={Gauge}
              label="Average match score"
              value={formatScore(summary.average_match_score, 1)}
              sub="Across all recommendations"
              tone={summary.average_match_score >= 60 ? 'success' : 'brand'}
            />
            <Kpi
              icon={TrendingUp}
              label="Recommendations issued"
              value={formatNumber(summary.total_recommendations)}
              sub={`${formatNumber(summary.total_saved_standards)} saved to shortlists`}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MiniStat
              icon={Cpu}
              label="Extraction confidence"
              value={formatPercent(summary.average_extraction_confidence, 1)}
            />
            <MiniStat icon={Timer} label="Average processing" value={formatMs(summary.average_processing_ms)} />
            <MiniStat icon={Layers} label="Vector index" value={`${formatNumber(summary.vector_index_size)} vectors`} />
            <MiniStat icon={Database} label="Vector backend" value={summary.vector_backend} />
          </div>

          {!hasData ? (
            <Card>
              <EmptyState
                icon={<BarChart3 aria-hidden className="h-6 w-6" />}
                title="No queries recorded yet"
                message="Analytics populate automatically as procurement specifications are analysed. Run your first query to start building the dataset."
                action={
                  <Link to="/new-query">
                    <Button size="sm">Run a procurement query</Button>
                  </Link>
                }
              />
            </Card>
          ) : null}

          {/* Daily trend */}
          <Card>
            <CardHeader
              title={`Queries over the last ${days} days`}
              icon={<Activity aria-hidden className="h-4 w-4" />}
              subtitle="Counted from the procurement_queries table"
            />
            <div className="h-72 p-4">
              {trend.length === 0 ? (
                <p className="flex h-full items-center justify-center text-sm text-slate-400">
                  No query activity in this window.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={normaliseTrend(trend)} margin={{ top: 8, right: 12, bottom: 4, left: -18 }}>
                    <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={{ stroke: GRID }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Line
                      type="monotone"
                      dataKey="queries"
                      stroke="#1d4ed8"
                      strokeWidth={2}
                      dot={{ r: 2.5, fill: '#1d4ed8' }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            {/* Queries by sector */}
            <Card>
              <CardHeader
                title="Queries by sector"
                icon={<BarChart3 aria-hidden className="h-4 w-4" />}
                subtitle="Sector detected by the NLP extraction stage"
              />
              <div className="h-72 p-4">
                {sectorData.length === 0 ? (
                  <p className="flex h-full items-center justify-center text-sm text-slate-400">
                    No sector data yet.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={sectorData.map((bucket) => ({
                        sector: bucketLabel(bucket, 'sector', 'label', 'name'),
                        queries: bucketNumber(bucket, 'queries', 'count', 'value'),
                      }))}
                      layout="vertical"
                      margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
                    >
                      <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={false} />
                      <YAxis
                        type="category"
                        dataKey="sector"
                        width={116}
                        tick={{ fontSize: 11, fill: AXIS }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Bar dataKey="queries" fill="#1d4ed8" radius={[0, 4, 4, 0]} barSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            {/* Sector share */}
            <Card>
              <CardHeader
                title="Sector distribution"
                icon={<PieChartIcon aria-hidden className="h-4 w-4" />}
                subtitle="Share of detected product sectors"
              />
              <div className="h-72 p-4">
                {share.length === 0 ? (
                  <p className="flex h-full items-center justify-center text-sm text-slate-400">
                    No sector distribution yet.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={share.map((bucket, index) => ({
                          name: bucketLabel(bucket, 'sector', 'label', 'name'),
                          value: bucketNumber(bucket, 'queries', 'count', 'value', 'percentage'),
                          fill: PALETTE[index % PALETTE.length],
                        }))}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius="45%"
                        outerRadius="72%"
                        paddingAngle={2}
                      >
                        {share.map((_, index) => (
                          <Cell key={index} fill={PALETTE[index % PALETTE.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            {/* Top products */}
            <Card>
              <CardHeader
                title="Top product categories"
                icon={<Layers aria-hidden className="h-4 w-4" />}
                subtitle="Most frequently detected product or category"
              />
              <div className="h-72 p-4">
                {productData.length === 0 ? (
                  <p className="flex h-full items-center justify-center text-sm text-slate-400">
                    No product data yet.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={productData.map((bucket) => ({
                        product: bucketLabel(bucket, 'product', 'label', 'name'),
                        queries: bucketNumber(bucket, 'queries', 'count', 'value'),
                      }))}
                      margin={{ top: 8, right: 12, bottom: 48, left: -18 }}
                    >
                      <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="product"
                        tick={{ fontSize: 10, fill: AXIS }}
                        tickLine={false}
                        axisLine={{ stroke: GRID }}
                        angle={-35}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Bar dataKey="queries" radius={[4, 4, 0, 0]} barSize={26}>
                        {productData.map((_, index) => (
                          <Cell key={index} fill={PALETTE[index % PALETTE.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            {/* Confidence distribution */}
            <Card>
              <CardHeader
                title="Recommendation confidence"
                icon={<Gauge aria-hidden className="h-4 w-4" />}
                subtitle="How strongly recommendations matched their specifications"
              />
              <div className="h-72 p-4">
                {distribution.length === 0 ? (
                  <p className="flex h-full items-center justify-center text-sm text-slate-400">
                    No recommendations issued yet.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={distribution.map((bucket) => ({
                        bucket: bucketLabel(bucket, 'bucket', 'label', 'range', 'name'),
                        recommendations: bucketNumber(bucket, 'recommendations', 'count', 'value'),
                      }))}
                      margin={{ top: 8, right: 12, bottom: 4, left: -18 }}
                    >
                      <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: AXIS }} tickLine={false} axisLine={{ stroke: GRID }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="recommendations" radius={[4, 4, 0, 0]} barSize={34}>
                        {distribution.map((_, index) => (
                          <Cell key={index} fill={PALETTE[index % PALETTE.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>
          </div>

          {/* Top recommended standards */}
          <Card>
            <CardHeader
              title="Most frequently recommended standards"
              icon={<Bookmark aria-hidden className="h-4 w-4" />}
              subtitle="Across every recorded procurement query"
            />
            {topStandards.length === 0 ? (
              <div className="p-5">
                <p className="text-sm text-slate-500">No recommendations recorded yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <th scope="col" className="px-4 py-2.5 font-semibold">Standard</th>
                      <th scope="col" className="px-4 py-2.5 font-semibold">Sector</th>
                      <th scope="col" className="px-4 py-2.5 font-semibold">Times recommended</th>
                      <th scope="col" className="px-4 py-2.5 font-semibold">Average match</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {topStandards.map((bucket, index) => {
                      const standardId = bucketNumber(bucket, 'standard_id', 'id') || null;
                      const isNumber = bucketLabel(bucket, 'is_number', 'standard', 'code');
                      const title = bucketLabel(bucket, 'title', 'name');
                      return (
                        <tr key={index} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            {standardId ? (
                              <Link
                                to={`/standards/${standardId}`}
                                className="font-mono font-semibold text-brand-800 hover:underline"
                              >
                                {isNumber}
                              </Link>
                            ) : (
                              <span className="font-mono font-semibold text-brand-800">{isNumber}</span>
                            )}
                            <p className="mt-0.5 text-xs text-slate-500">{title}</p>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">
                            {bucketLabel(bucket, 'sector')}
                          </td>
                          <td className="px-4 py-3 text-xs font-semibold tabular-nums text-slate-700">
                            {formatNumber(bucketNumber(bucket, 'recommendation_count', 'count', 'value'))}
                          </td>
                          <td className="px-4 py-3 text-xs tabular-nums text-slate-700">
                            {formatScore(bucketNumber(bucket, 'average_score', 'avg_score', 'avg'), 1)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <InlineNotice tone="warning" title="How to interpret these numbers">
            <p>
              Match-score averages reflect a <strong>demonstration knowledge base</strong> and a
              similarity algorithm, not real procurement outcomes. A low average usually means the
              specification was vague, the product sits outside the loaded sectors, or the
              knowledge base needs the relevant standards imported. Nothing here indicates BIS
              approval, compliance or certification.
            </p>
          </InlineNotice>
        </div>
      ) : null}
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  tone = 'brand',
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  sub?: string;
  tone?: 'brand' | 'success';
}) {
  return (
    <Card>
      <div className="p-5">
        <div className="flex items-center gap-2">
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-md ${
              tone === 'success' ? 'bg-success-50 text-success-700' : 'bg-brand-50 text-brand-700'
            }`}
          >
            <Icon aria-hidden className="h-4 w-4" />
          </span>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        </div>
        <p className="mt-3 text-2xl font-bold tabular-nums text-navy-900">{value}</p>
        {sub ? <p className="mt-1 text-xs text-slate-500">{sub}</p> : null}
      </div>
    </Card>
  );
}

function MiniStat({ icon: Icon, label, value }: { icon: typeof Cpu; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-card">
      <Icon aria-hidden className="h-4 w-4 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="truncate text-sm font-semibold text-navy-900">{value}</p>
      </div>
    </div>
  );
}

/** Coerce the daily trend into a shape Recharts can plot directly. */
function normaliseTrend(trend: { [key: string]: string | number | null }[]) {
  return trend.map((bucket) => ({
    label: String(bucket.day ?? bucket.date ?? bucket.label ?? ''),
    queries: Number(bucket.queries ?? bucket.count ?? 0) || 0,
  }));
}
