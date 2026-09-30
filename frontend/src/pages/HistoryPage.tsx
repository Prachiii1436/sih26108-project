import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Clock,
  Eye,
  History as HistoryIcon,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  TrendingUp,
} from 'lucide-react';

import { Badge, ScoreBadge, SectorBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  Card,
  EmptyState,
  ErrorState,
  InlineNotice,
  PageTitle,
  SkeletonRows,
} from '@/components/ui/Panel';
import { useToast } from '@/components/ui/Toast';
import { useAsync, useDebounced } from '@/hooks/useAsync';
import { formatMs, formatNumber, formatRelative, formatScore, truncate } from '@/lib/format';
import { deleteSearchHistory, getHistorySectors, listSearchHistory } from '@/services/api';

const PAGE_SIZE = 15;

export function HistoryPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounced(searchInput, 350);
  const [sector, setSector] = useState('');
  const [page, setPage] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);

  const sectors = useAsync(() => getHistorySectors(), []);
  const history = useAsync(
    () =>
      listSearchHistory({
        search: search || undefined,
        sector: sector || undefined,
        page,
        page_size: PAGE_SIZE,
        include_recommendations: false,
      }),
    [search, sector, page],
  );

  const refreshAll = () => {
    void history.reload();
    void sectors.reload();
  };

  const handleDelete = async (id: number) => {
    setPendingDelete(id);
    try {
      await deleteSearchHistory(id);
      toast.success('Query deleted', 'The analysis and its recommendations were removed.');
      // Step back a page if we just removed the last row on the final page.
      const items = history.data?.items ?? [];
      if (items.length === 1 && page > 1) setPage((current) => current - 1);
      else refreshAll();
    } catch (caught) {
      toast.error('Could not delete query', (caught as Error).message);
    } finally {
      setPendingDelete(null);
    }
  };

  const items = history.data?.items ?? [];
  const totalPages = history.data?.total_pages ?? 1;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <PageTitle
        title="Search History"
        description="Every procurement specification you have analysed, with its detected product and top match. Records persist in the database."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={refreshAll}
              icon={<RefreshCw aria-hidden className="h-3.5 w-3.5" />}
            >
              Refresh
            </Button>
            <Link to="/new-query">
              <Button size="sm" icon={<Plus aria-hidden className="h-3.5 w-3.5" />}>
                New Query
              </Button>
            </Link>
          </div>
        }
      />

      {/* Filters */}
      <div className="card mb-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            />
            <label htmlFor="history-search" className="sr-only">
              Search history by specification text
            </label>
            <input
              id="history-search"
              type="search"
              className="input pl-9"
              placeholder="Search specifications by text, product or IS number..."
              value={searchInput}
              onChange={(event) => {
                setSearchInput(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <label className="flex shrink-0 items-center gap-2 text-xs text-slate-600">
            Sector
            <select
              className="select w-48"
              value={sector}
              onChange={(event) => {
                setSector(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All sectors</option>
              {(sectors.data?.sectors ?? []).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* List */}
      {history.isInitialLoading ? (
        <Card>
          <SkeletonRows rows={4} />
        </Card>
      ) : history.status === 'error' ? (
        <ErrorState
          title="Could not load search history"
          message={history.error?.message}
          onRetry={() => void history.reload()}
        />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<HistoryIcon aria-hidden className="h-6 w-6" />}
            title={search || sector ? 'No queries match this filter' : 'No procurement queries yet'}
            message={
              search || sector ? (
                'Try a different search term, or clear the sector filter.'
              ) : (
                <>
                  Analyse a procurement specification and it will be stored here automatically.
                  <span className="mt-2 block">
                    <Link to="/new-query" className="font-semibold text-brand-700 underline">
                      Start your first query
                    </Link>{' '}
                    or load an{' '}
                    <Link to="/" className="font-semibold text-brand-700 underline">
                      example specification
                    </Link>
                    .
                  </span>
                </>
              )
            }
            action={
              search || sector ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSearchInput('');
                    setSector('');
                    setPage(1);
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Link to="/new-query">
                  <Button size="sm">Start a new query</Button>
                </Link>
              )
            }
          />
        </Card>
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="hidden grid-cols-[minmax(0,1fr)_150px_120px_150px_110px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 lg:grid">
              <span>Query</span>
              <span>Detected product</span>
              <span>Recommendations</span>
              <span>Top match</span>
              <span className="text-right">Actions</span>
            </div>

            <ul className="divide-y divide-slate-100">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="grid gap-3 p-4 transition-colors hover:bg-slate-50 lg:grid-cols-[minmax(0,1fr)_150px_120px_150px_110px] lg:items-center"
                >
                  {/* Query */}
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-snug text-navy-900">
                      {truncate(item.specification, 140)}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <Clock aria-hidden className="h-3 w-3" />
                        {formatRelative(item.created_at)}
                      </span>
                      {item.status && item.status !== 'analyzed' ? (
                        <Badge tone={item.status === 'failed' ? 'danger' : 'warning'}>{item.status}</Badge>
                      ) : null}
                      {item.processing_ms ? (
                        <span className="text-xs text-slate-400">{formatMs(item.processing_ms)}</span>
                      ) : null}
                    </div>
                  </div>

                  {/* Product */}
                  <div className="min-w-0 text-xs">
                    <p className="truncate font-medium text-slate-800">
                      {item.extracted_product || item.product_category || (
                        <span className="italic text-slate-400">Not detected</span>
                      )}
                    </p>
                    {item.extracted_sector || item.sector ? (
                      <div className="mt-1">
                        <SectorBadge sector={(item.extracted_sector || item.sector) as string} />
                      </div>
                    ) : null}
                  </div>

                  {/* Recommendation count */}
                  <div className="flex items-center gap-1.5 text-xs text-slate-600">
                    <TrendingUp aria-hidden className="h-3.5 w-3.5 text-slate-400" />
                    <span className="font-semibold tabular-nums">{item.recommendation_count}</span>
                    <span className="hidden sm:inline">ranked</span>
                  </div>

                  {/* Top match */}
                  <div className="min-w-0 text-xs">
                    {item.top_is_number ? (
                      <>
                        <p className="truncate font-mono font-semibold text-brand-800">{item.top_is_number}</p>
                        <div className="mt-1">
                          {item.top_match_score !== null && item.top_match_score !== undefined ? (
                            <ScoreBadge score={item.top_match_score} />
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <span className="italic text-slate-400">No match</span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 lg:justify-end">
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={pendingDelete === item.id}
                      onClick={() => navigate(`/analysis/${item.id}`)}
                      icon={<Eye aria-hidden className="h-3.5 w-3.5" />}
                    >
                      View
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      loading={pendingDelete === item.id}
                      onClick={() => void handleDelete(item.id)}
                      aria-label={`Delete query ${item.id}`}
                      icon={<Trash2 aria-hidden className="h-3.5 w-3.5" />}
                    >
                      <span className="sr-only sm:not-sr-only">Delete</span>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Pagination */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              Page {history.data?.page ?? 1} of {totalPages} · {formatNumber(history.data?.total ?? 0)} queries
            </p>
            {totalPages > 1 ? (
              <div className="flex items-center gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                >
                  Next
                </Button>
              </div>
            ) : null}
          </div>
        </>
      )}

      <div className="mt-5">
        <InlineNotice tone="info" title="Stored locally, scoped to this session">
          <p>
            History is persisted in the backend database and scoped to the current{' '}
            <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px]">X-User-Id</code>{' '}
            header, so each officer sees their own list. Deleting an entry also deletes its stored
            recommendations. Average top match across visible results:{' '}
            {formatScore(
              (items.filter((item) => item.top_match_score).reduce((sum, item) => sum + (item.top_match_score ?? 0), 0) /
                Math.max(1, items.filter((item) => item.top_match_score).length)) || 0,
              1,
            )}
            .
          </p>
          <p className="mt-2 flex items-center gap-1">
            <ArrowRight aria-hidden className="h-3 w-3" />
            Scores are algorithm output, not BIS certification.
          </p>
        </InlineNotice>
      </div>
    </div>
  );
}
