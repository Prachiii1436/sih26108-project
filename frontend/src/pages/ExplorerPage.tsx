import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bookmark,
  BookmarkCheck,
  Columns3,
  Database,
  Filter,
  Library,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';

import { Badge, SampleDataBadge, SectorBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  InlineNotice,
  PageTitle,
  SkeletonRows,
} from '@/components/ui/Panel';
import { useSavedStandards } from '@/context/SavedStandardsContext';
import { useAsync, useDebounced } from '@/hooks/useAsync';
import { formatNumber } from '@/lib/format';
import { getStandardFacets, listStandards } from '@/services/api';
import type { StandardSort, StandardSummary } from '@/types/api';

const SORT_OPTIONS: { value: StandardSort; label: string }[] = [
  { value: 'is_number_asc', label: 'IS number (A-Z)' },
  { value: 'is_number_desc', label: 'IS number (Z-A)' },
  { value: 'title_asc', label: 'Title (A-Z)' },
  { value: 'sector_asc', label: 'Sector (A-Z)' },
  { value: 'year_desc', label: 'Year (newest)' },
  { value: 'year_asc', label: 'Year (oldest)' },
  { value: 'updated_desc', label: 'Recently updated' },
  { value: 'relevance', label: 'Relevance to search' },
];

const PAGE_SIZE = 20;

export function ExplorerPage() {
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounced(searchInput, 350);

  const [sectors, setSectors] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [keyword, setKeyword] = useState('');
  const [sort, setSort] = useState<StandardSort>('is_number_asc');
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const { isSaved, toggleSave, isInCompare, toggleCompare } = useSavedStandards();

  const facets = useAsync(() => getStandardFacets(), []);

  const list = useAsync(
    () =>
      listStandards({
        search: search || undefined,
        sector: sectors.length ? sectors : undefined,
        category: categories.length ? categories : undefined,
        status: statuses.length ? statuses : undefined,
        keyword: keyword || undefined,
        sort,
        page,
        page_size: PAGE_SIZE,
      }),
    [search, sectors.join(','), categories.join(','), statuses.join(','), keyword, sort, page],
  );

  // Any filter change invalidates the current page number.
  const setFilter = <T,>(setter: (value: T) => void, value: T) => {
    setter(value);
    setPage(1);
  };

  const toggleIn = (current: string[], value: string) =>
    current.includes(value) ? current.filter((item) => item !== value) : [...current, value];

  const activeFilterCount = sectors.length + categories.length + statuses.length + (keyword ? 1 : 0);
  const clearAll = () => {
    setSectors([]);
    setCategories([]);
    setStatuses([]);
    setKeyword('');
    setPage(1);
  };

  const filterPanels = useMemo(
    () => [
      {
        title: 'Sector',
        values: facets.data?.sectors ?? [],
        selected: sectors,
        onToggle: (value: string) => setFilter(setSectors, toggleIn(sectors, value)),
      },
      {
        title: 'Product category',
        values: facets.data?.categories ?? [],
        selected: categories,
        onToggle: (value: string) => setFilter(setCategories, toggleIn(categories, value)),
      },
      {
        title: 'Status',
        values: facets.data?.statuses ?? [],
        selected: statuses,
        onToggle: (value: string) => setFilter(setStatuses, toggleIn(statuses, value)),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [facets.data, sectors, categories, statuses],
  );

  const total = list.data?.total ?? 0;
  const totalPages = list.data?.total_pages ?? 1;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <PageTitle
        title="Standards Explorer"
        description="Search and filter the standards knowledge base by number, title, product, sector, keyword or description."
        actions={
          <div className="flex items-center gap-2">
            <Badge tone="brand" icon={<Database aria-hidden className="h-3.5 w-3.5" />}>
              {formatNumber(total)} matching
            </Badge>
            <Button
              variant="secondary"
              size="sm"
              className="lg:hidden"
              onClick={() => setFiltersOpen((open) => !open)}
              icon={<Filter aria-hidden className="h-3.5 w-3.5" />}
            >
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </Button>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* ------------------------------------------------------ filter rail */}
        <aside className={`${filtersOpen ? 'block' : 'hidden'} lg:block`}>
          <div className="space-y-4">
            <Card>
              <CardHeader
                title="Filters"
                icon={<SlidersHorizontal aria-hidden className="h-4 w-4" />}
                actions={
                  activeFilterCount > 0 ? (
                    <button
                      type="button"
                      onClick={clearAll}
                      className="text-xs font-semibold text-brand-700 hover:underline"
                    >
                      Clear all
                    </button>
                  ) : null
                }
              />
              <div className="space-y-5 p-4">
                {facets.status === 'loading' ? (
                  <div className="space-y-2" aria-hidden>
                    {Array.from({ length: 6 }).map((_, index) => (
                      <div key={index} className="h-4 w-full animate-pulse rounded bg-slate-200" />
                    ))}
                  </div>
                ) : facets.status === 'error' ? (
                  <p className="text-xs text-red-700">{facets.error?.message}</p>
                ) : (
                  <>
                    <div>
                      <label className="label" htmlFor="keyword-filter">
                        Keyword
                      </label>
                      <input
                        id="keyword-filter"
                        className="input"
                        placeholder="e.g. helmet"
                        value={keyword}
                        onChange={(event) => setFilter(setKeyword, event.target.value)}
                      />
                    </div>

                    {filterPanels.map((panel) => (
                      <fieldset key={panel.title}>
                        <legend className="label">{panel.title}</legend>
                        <div className="max-h-56 space-y-1 overflow-y-auto pr-1 scroll-slim">
                          {panel.values.length === 0 ? (
                            <p className="text-xs italic text-slate-400">None available</p>
                          ) : (
                            panel.values.map((value) => (
                              <label
                                key={value}
                                className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs text-slate-700 hover:bg-slate-100"
                              >
                                <input
                                  type="checkbox"
                                  className="h-3.5 w-3.5 rounded border-slate-300 text-brand-700 focus:ring-brand-600"
                                  checked={panel.selected.includes(value)}
                                  onChange={() => panel.onToggle(value)}
                                />
                                <span className="min-w-0 flex-1 truncate" title={value}>
                                  {value}
                                </span>
                              </label>
                            ))
                          )}
                        </div>
                      </fieldset>
                    ))}

                    <p className="text-[11px] leading-relaxed text-slate-500">
                      {formatNumber(facets.data?.total ?? 0)} standards in the knowledge base.
                    </p>
                  </>
                )}
              </div>
            </Card>

            <InlineNotice tone="warning" title="Sample knowledge base">
              Records are demonstration metadata. Import verified BIS data before using this for a
              real procurement.
            </InlineNotice>
          </div>
        </aside>

        {/* --------------------------------------------------------- results */}
        <div className="min-w-0">
          {/* Search bar */}
          <div className="card mb-4 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                />
                <label htmlFor="explorer-search" className="sr-only">
                  Search standards by number, title, product, sector, keyword or description
                </label>
                <input
                  id="explorer-search"
                  type="search"
                  className="input pl-9"
                  placeholder="Search by IS number, title, product, sector, keyword or description..."
                  value={searchInput}
                  onChange={(event) => setFilter(setSearchInput, event.target.value)}
                />
              </div>
              <label className="flex shrink-0 items-center gap-2 text-xs text-slate-600">
                Sort by
                <select
                  className="select w-48"
                  value={sort}
                  onChange={(event) => setFilter(setSort, event.target.value as StandardSort)}
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {activeFilterCount > 0 || searchInput ? (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-slate-500">Active:</span>
                {searchInput ? (
                  <FilterChip label={`"${searchInput}"`} onRemove={() => setFilter(setSearchInput, '')} />
                ) : null}
                {keyword ? <FilterChip label={`keyword: ${keyword}`} onRemove={() => setFilter(setKeyword, '')} /> : null}
                {sectors.map((value) => (
                  <FilterChip
                    key={`sector-${value}`}
                    label={value}
                    onRemove={() => setFilter(setSectors, sectors.filter((item) => item !== value))}
                  />
                ))}
                {categories.map((value) => (
                  <FilterChip
                    key={`category-${value}`}
                    label={value}
                    onRemove={() => setFilter(setCategories, categories.filter((item) => item !== value))}
                  />
                ))}
                {statuses.map((value) => (
                  <FilterChip
                    key={`status-${value}`}
                    label={value}
                    onRemove={() => setFilter(setStatuses, statuses.filter((item) => item !== value))}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => {
                    clearAll();
                    setFilter(setSearchInput, '');
                  }}
                  className="ml-1 text-xs font-semibold text-brand-700 hover:underline"
                >
                  Reset everything
                </button>
              </div>
            ) : null}
          </div>

          {/* List */}
          {list.isInitialLoading ? (
            <Card>
              <SkeletonRows rows={5} />
            </Card>
          ) : list.status === 'error' ? (
            <ErrorState
              title="Could not load standards"
              message={list.error?.message}
              onRetry={() => void list.reload()}
            />
          ) : list.data && list.data.items.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Library aria-hidden className="h-6 w-6" />}
                title="No standards match these filters"
                message="Try removing a filter, widening the year range, or searching with fewer keywords. The knowledge base only contains the records that have been imported."
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button variant="secondary" size="sm" onClick={clearAll}>
                      Clear filters
                    </Button>
                    <Link to="/new-query">
                      <Button variant="primary" size="sm">
                        Describe your procurement instead
                      </Button>
                    </Link>
                  </div>
                }
              />
            </Card>
          ) : list.data ? (
            <>
              <div className="card divide-y divide-slate-100">
                {list.data.items.map((standard: StandardSummary) => {
                  const saved = isSaved(standard.id);
                  const inCompare = isInCompare(standard.id);

                  return (
                    <div
                      key={standard.id}
                      className="flex flex-col gap-3 p-4 transition-colors hover:bg-slate-50 sm:flex-row sm:items-start"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            to={`/standards/${standard.id}`}
                            className="font-mono text-sm font-bold text-brand-800 hover:underline"
                          >
                            {standard.is_number}
                          </Link>
                          {standard.is_demonstration ? <SampleDataBadge /> : null}
                          {standard.status !== 'Active' ? <Badge tone="neutral">{standard.status}</Badge> : null}
                        </div>
                        <Link
                          to={`/standards/${standard.id}`}
                          className="mt-1 block text-sm font-semibold leading-snug text-navy-900 hover:text-brand-700"
                        >
                          {standard.title}
                        </Link>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <SectorBadge sector={standard.sector} />
                          <Badge tone="neutral">{standard.category}</Badge>
                          {standard.product ? <Badge tone="info">{standard.product}</Badge> : null}
                          {standard.year ? <span className="text-xs text-slate-500">{standard.year}</span> : null}
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => toggleCompare(standard)}
                          icon={
                            inCompare ? (
                              <X aria-hidden className="h-3.5 w-3.5" />
                            ) : (
                              <Plus aria-hidden className="h-3.5 w-3.5" />
                            )
                          }
                          title={inCompare ? 'Remove from comparison' : 'Add to comparison'}
                        >
                          {inCompare ? 'Added' : 'Compare'}
                        </Button>
                        <Button
                          size="sm"
                          variant={saved ? 'success' : 'secondary'}
                          onClick={() => void toggleSave(standard)}
                          icon={
                            saved ? (
                              <BookmarkCheck aria-hidden className="h-3.5 w-3.5" />
                            ) : (
                              <Bookmark aria-hidden className="h-3.5 w-3.5" />
                            )
                          }
                        >
                          {saved ? 'Saved' : 'Save'}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination */}
              {totalPages > 1 ? (
                <nav aria-label="Pagination" className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-slate-500">
                    Page {list.data.page} of {totalPages} · {formatNumber(total)} standards
                  </p>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                    >
                      Previous
                    </Button>
                    {pageNumbers(page, totalPages).map((entry, index) =>
                      entry === '...' ? (
                        <span key={`gap-${index}`} className="px-1 text-xs text-slate-400">
                          ...
                        </span>
                      ) : (
                        <button
                          key={entry}
                          type="button"
                          onClick={() => setPage(entry)}
                          aria-current={entry === page ? 'page' : undefined}
                          className={[
                            'h-8 min-w-8 rounded-md px-2 text-xs font-semibold transition-colors',
                            entry === page
                              ? 'bg-brand-700 text-white'
                              : 'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-100',
                          ].join(' ')}
                        >
                          {entry}
                        </button>
                      ),
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                    >
                      Next
                    </Button>
                  </div>
                </nav>
              ) : null}
            </>
          ) : null}

          <p className="mt-4 flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-500">
            <Columns3 aria-hidden className="mt-0.5 h-3 w-3 shrink-0" />
            Standards marked <span className="font-semibold">SAMPLE DATA</span> are demonstration
            records, not official BIS catalogue entries.
          </p>
        </div>
      </div>
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-brand-200 bg-brand-50 px-1.5 py-0.5 text-xs text-brand-800">
      {label}
      <button type="button" onClick={onRemove} aria-label={`Remove filter ${label}`} className="hover:text-brand-900">
        <X aria-hidden className="h-3 w-3" />
      </button>
    </span>
  );
}

/** Windowed page numbers with ellipsis, e.g. 1 … 4 5 6 … 20 */
function pageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);

  const pages = new Set<number>([1, total, current, current - 1, current + 1]);
  const sorted = [...pages].filter((value) => value >= 1 && value <= total).sort((a, b) => a - b);

  const result: (number | '...')[] = [];
  let previous = 0;
  for (const value of sorted) {
    if (previous && value - previous > 1) result.push('...');
    result.push(value);
    previous = value;
  }
  return result;
}
