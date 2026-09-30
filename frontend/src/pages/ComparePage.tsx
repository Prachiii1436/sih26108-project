import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, Check, Columns3, Info, Minus, X } from 'lucide-react';

import { Badge, SampleDataBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, EmptyState, ErrorState, InlineNotice, LoadingState, PageTitle } from '@/components/ui/Panel';
import { ScoreMethodNote } from '@/components/standards/MatchScore';
import { useAsync } from '@/hooks/useAsync';
import { useSavedStandards } from '@/context/SavedStandardsContext';
import { formatScore, scoreTone, TONE_STYLES } from '@/lib/format';
import { compareStandards } from '@/services/api';

export function ComparePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { clearCompare, compareIds, toggleCompare } = useSavedStandards();

  const urlIds = useMemo(() => {
    const raw = searchParams.get('ids');
    if (!raw) return [] as number[];
    return raw
      .split(',')
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
      .slice(0, 4);
  }, [searchParams]);

  // The URL is authoritative; seeding the tray keeps both surfaces in sync.
  useEffect(() => {
    if (urlIds.length === 0) return;
    for (const id of urlIds) {
      if (!compareIds.includes(id)) {
        toggleCompare({
          id,
          is_number: '',
          title: '',
          sector: '',
          category: '',
          status: '',
          is_demonstration: true,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlIds.join(',')]);

  const selectedIds = urlIds.length > 0 ? urlIds : compareIds.slice(0, 4);
  const key = selectedIds.join(',');

  const query = useAsync(
    () =>
      selectedIds.length >= 2
        ? compareStandards(selectedIds)
        : Promise.reject(new Error('Select at least 2 standards to compare.')),
    [key],
    { immediate: selectedIds.length >= 2 },
  );

  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set(['scope', 'description']));

  const toggleRow = (field: string) => {
    setExpandedRows((current) => {
      const next = new Set(current);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  };

  const removeId = (id: number) => {
    const next = selectedIds.filter((value) => value !== id);
    toggleCompare({
      id,
      is_number: '',
      title: '',
      sector: '',
      category: '',
      status: '',
      is_demonstration: true,
    });
    setSearchParams(next.length > 0 ? { ids: next.join(',') } : {});
  };

  const clearAll = () => {
    selectedIds.forEach((id) =>
      toggleCompare({
        id,
        is_number: '',
        title: '',
        sector: '',
        category: '',
        status: '',
        is_demonstration: true,
      }),
    );
    setSearchParams({});
    clearCompare();
  };

  const standards = query.data?.standards ?? [];
  const maxPairSimilarity = query.data?.pairwise_similarity.length
    ? Math.max(...query.data.pairwise_similarity.map((pair) => pair.similarity))
    : null;
  const minPairSimilarity = query.data?.pairwise_similarity.length
    ? Math.min(...query.data.pairwise_similarity.map((pair) => pair.similarity))
    : null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <PageTitle
        title="Compare Indian Standards"
        description="Put 2–4 standards side by side to see exactly where they differ and where they overlap."
        actions={
          selectedIds.length > 0 ? (
            <Button variant="secondary" size="sm" onClick={clearAll} icon={<X aria-hidden className="h-3.5 w-3.5" />}>
              Clear selection
            </Button>
          ) : null
        }
      />

      {selectedIds.length < 2 ? (
        <Card>
          <EmptyState
            icon={<Columns3 aria-hidden className="h-6 w-6" />}
            title="Select at least 2 standards to compare"
            message={
              <>
                Add standards from the <Link to="/explorer" className="font-semibold text-brand-700 underline">Standards Explorer</Link>, from your{' '}
                <Link to="/saved" className="font-semibold text-brand-700 underline">saved standards</Link>, or use the
                <span className="font-semibold"> Compare</span> button on any recommendation card.
                <span className="mt-2 block text-slate-500">You can compare up to 4 standards at once.</span>
              </>
            }
          />
        </Card>
      ) : query.status === 'loading' ? (
        <LoadingState label="Building comparison..." />
      ) : query.status === 'error' ? (
        <ErrorState
          title="Could not build the comparison"
          message={query.error?.message}
          onRetry={() => void query.reload()}
        />
      ) : query.data ? (
        <div className="space-y-5">
          {/* Header row: standard identity */}
          <Card className="overflow-hidden">
            <div className="grid gap-px bg-slate-200" style={{ gridTemplateColumns: `repeat(${standards.length}, minmax(0, 1fr))` }}>
              {standards.map((standard) => (
                <div key={standard.id} className="bg-white p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-bold text-brand-800">{standard.is_number}</p>
                      <p className="mt-1 text-sm font-semibold leading-snug text-navy-900">{standard.title}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeId(standard.id)}
                      aria-label={`Remove ${standard.is_number} from comparison`}
                      className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    >
                      <X aria-hidden className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {standard.is_demonstration ? <SampleDataBadge /> : null}
                    <Badge tone="neutral">{standard.status}</Badge>
                  </div>
                  <Link
                    to={`/standards/${standard.id}`}
                    className="mt-2 inline-block text-xs font-semibold text-brand-700 hover:underline"
                  >
                    View full record
                  </Link>
                </div>
              ))}
            </div>
          </Card>

          {/* Similarity summary */}
          {query.data.pairwise_similarity.length > 0 ? (
            <Card>
              <CardHeader
                title="Semantic similarity"
                icon={<Info aria-hidden className="h-4 w-4" />}
                subtitle="Cosine similarity between the standard records in the vector index"
              />
              <div className="p-5">
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {query.data.pairwise_similarity.map((pair) => (
                    <li
                      key={`${pair.a_id}-${pair.b_id}`}
                      className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 text-xs"
                    >
                      <span className="font-mono font-semibold text-slate-700">
                        {pair.a_is_number} ↔ {pair.b_is_number}
                      </span>
                      <span
                        className={`font-semibold tabular-nums ${
                          TONE_STYLES[scoreTone(pair.similarity)].text
                        }`}
                      >
                        {formatScore(pair.similarity, 1)}
                      </span>
                    </li>
                  ))}
                </ul>
                {maxPairSimilarity !== null && minPairSimilarity !== null ? (
                  <p className="mt-3 text-xs text-slate-500">
                    These standards range from {formatScore(minPairSimilarity, 1)} to{' '}
                    {formatScore(maxPairSimilarity, 1)} similar. Low similarity means the records
                    cover substantially different subject matter, so more than one may need to be
                    considered.
                  </p>
                ) : null}
                <div className="mt-3">
                  <ScoreMethodNote />
                </div>
              </div>
            </Card>
          ) : null}

          {/* Comparison table */}
          <Card className="overflow-hidden">
            <CardHeader
              title="Field-by-field comparison"
              icon={<Columns3 aria-hidden className="h-4 w-4" />}
              subtitle="Differences are highlighted in amber"
              actions={
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                  <AlertCircle aria-hidden className="h-3.5 w-3.5 text-amber-600" />
                  Amber = differs
                </span>
              }
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <caption className="sr-only">Side-by-side comparison of the selected Indian Standards</caption>
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th scope="col" className="w-48 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Attribute
                    </th>
                    {standards.map((standard) => (
                      <th key={standard.id} scope="col" className="px-4 py-2.5 text-xs font-semibold text-slate-700">
                        <span className="font-mono">{standard.is_number}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {query.data.rows.map((row) => {
                    const normalised = row.values.map((value) => (value ?? '').trim().toLowerCase());
                    const isUnique = new Set(normalised).size > 1;
                    const isLong = row.field === 'scope' || row.field === 'description';
                    const expanded = expandedRows.has(row.field);

                    return (
                      <tr key={row.field} className="align-top">
                        <th scope="row" className="px-4 py-3 text-xs font-semibold text-slate-600">
                          {row.label}
                          {isLong ? (
                            <button
                              type="button"
                              onClick={() => toggleRow(row.field)}
                              className="mt-1 block text-[11px] font-medium text-brand-700 hover:underline"
                              aria-expanded={expanded}
                            >
                              {expanded ? 'Show less' : 'Show more'}
                            </button>
                          ) : null}
                        </th>
                        {row.values.map((value, index) => {
                          const text = (value ?? '').trim();
                          const isEmpty = !text;
                          return (
                            <td key={index} className="px-4 py-3">
                              {isEmpty ? (
                                <span className="text-sm italic text-slate-400">Not recorded</span>
                              ) : isLong && text.length > 180 && !expanded ? (
                                <div className="rounded-md bg-slate-50 px-2.5 py-2 text-xs leading-relaxed text-slate-700">
                                  {`${text.slice(0, 180).trimEnd()}...`}
                                </div>
                              ) : (
                                <div
                                  className={[
                                    'rounded-md px-2.5 py-2 text-xs leading-relaxed',
                                    isUnique
                                      ? 'bg-amber-50 text-amber-950 ring-1 ring-inset ring-amber-200'
                                      : 'bg-slate-50 text-slate-700',
                                  ].join(' ')}
                                >
                                  {text}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {query.data.summary ? (
            <InlineNotice tone="info" title="Comparison summary">
              {query.data.summary}
            </InlineNotice>
          ) : null}

          <InlineNotice tone="warning" title="How to read this comparison">
            <p>
              Differences are highlighted so you can shortlist quickly, but a difference is not
              automatically a better or worse standard. Weight the scope, the tested requirements and
              the applicable sector against your actual procurement before choosing.
            </p>
          </InlineNotice>
        </div>
      ) : null}

      {/* Legend */}
      {standards.length >= 2 ? (
        <div className="mt-5 flex flex-wrap items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <Check aria-hidden className="h-3.5 w-3.5 text-success-600" />
            Identical values
          </span>
          <span className="flex items-center gap-1.5">
            <Minus aria-hidden className="h-3.5 w-3.5 text-amber-600" />
            Values differ between these standards
          </span>
        </div>
      ) : null}
    </div>
  );
}
