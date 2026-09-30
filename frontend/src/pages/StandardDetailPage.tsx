import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  BookOpen,
  Columns3,
  ExternalLink,
  FileText,
  Info,
  Layers,
  Link2,
  ListChecks,
  Pencil,
  ScrollText,
  Tag,
} from 'lucide-react';

import { DisclaimerBanner } from '@/components/layout/DisclaimerBanner';
import { Badge, SampleDataBadge, SectorBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  Card,
  CardHeader,
  DefinitionItem,
  ErrorState,
  InlineNotice,
  LoadingState,
  PageTitle,
} from '@/components/ui/Panel';
import { useToast } from '@/components/ui/Toast';
import { useSavedStandards } from '@/context/SavedStandardsContext';
import { useAsync } from '@/hooks/useAsync';
import { formatDateTime, formatNumber } from '@/lib/format';
import { getStandard, saveStandard } from '@/services/api';
import type { StandardSummary } from '@/types/api';

const TABS = ['Overview', 'Scope', 'Requirements', 'Related Standards', 'Source Information'] as const;
type Tab = (typeof TABS)[number];

export function StandardDetailPage() {
  const { standardId } = useParams<{ standardId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { isSaved, toggleSave, isInCompare, toggleCompare } = useSavedStandards();

  const id = Number(standardId);
  const valid = Number.isFinite(id) && id > 0;
  const fromResults = (location.state as { queryId?: number; fromResults?: boolean } | null) ?? {};

  const query = useAsync(() => (valid ? getStandard(id) : Promise.reject(new Error('Invalid standard id'))), [id], {
    immediate: valid,
  });

  const [tab, setTab] = useState<Tab>('Overview');
  const [saving, setSaving] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);

  if (!valid) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <ErrorState title="Invalid standard reference" message="That standard id is not valid." />
        <div className="mt-4">
          <Link to="/explorer">
            <Button icon={<ArrowLeft aria-hidden className="h-4 w-4" />}>Back to Standards Explorer</Button>
          </Link>
        </div>
      </div>
    );
  }

  const standard = query.data;
  const saved = standard ? isSaved(standard.id) : false;
  const inCompare = standard ? isInCompare(standard.id) : false;

  const handleSave = async () => {
    if (!standard) return;
    setSaving(true);
    try {
      await toggleSave(standard, {
        queryId: fromResults.queryId ?? null,
        notes: noteDraft.trim() || null,
      });
      setNoteOpen(false);
      setNoteDraft('');
    } finally {
      setSaving(false);
    }
  };

  /** Save with a note/tag in one call, for the explorer-style quick save. */
  const handleQuickSave = async () => {
    if (!standard) return;
    setSaving(true);
    try {
      await saveStandard({ standard_id: standard.id, query_id: fromResults.queryId ?? null });
      toast.success('Saved to shortlist', `${standard.is_number} — ${standard.title}`);
    } catch (caught) {
      toast.error('Could not save standard', (caught as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          icon={<ArrowLeft aria-hidden className="h-3.5 w-3.5" />}
        >
          Back
        </Button>
        {fromResults.fromResults && fromResults.queryId ? (
          <Link
            to={`/analysis/${fromResults.queryId}`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
          >
            Back to Results
          </Link>
        ) : (
          <Link to="/explorer" className="text-xs font-semibold text-brand-700 hover:underline">
            Back to Standards Explorer
          </Link>
        )}
      </div>

      {query.status === 'loading' ? <LoadingState label="Loading standard record..." /> : null}

      {query.status === 'error' ? (
        <ErrorState
          title="Could not load this standard"
          message={query.error?.message}
          onRetry={() => void query.reload()}
        />
      ) : null}

      {standard ? (
        <>
          <PageTitle
            title={
              <span className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-brand-800">{standard.is_number}</span>
                <span>{standard.title}</span>
              </span>
            }
            description={
              <span className="flex flex-wrap items-center gap-2">
                <SectorBadge sector={standard.sector} />
                <Badge tone="neutral">{standard.category}</Badge>
                {standard.product ? <Badge tone="info">{standard.product}</Badge> : null}
                {standard.year ? <Badge tone="neutral">{standard.year}</Badge> : null}
                <Badge tone={standard.status === 'Active' ? 'success' : 'neutral'}>{standard.status}</Badge>
                {standard.is_demonstration ? <SampleDataBadge /> : null}
              </span>
            }
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant={inCompare ? 'success' : 'secondary'}
                  size="sm"
                  icon={<Columns3 aria-hidden className="h-3.5 w-3.5" />}
                  onClick={() => toggleCompare(standard)}
                >
                  {inCompare ? 'In comparison' : 'Compare Standard'}
                </Button>
                <Button
                  variant={saved ? 'success' : 'primary'}
                  size="sm"
                  loading={saving}
                  icon={
                    saved ? (
                      <BookmarkCheck aria-hidden className="h-3.5 w-3.5" />
                    ) : (
                      <Bookmark aria-hidden className="h-3.5 w-3.5" />
                    )
                  }
                  onClick={() => {
                    if (saved) void handleSave();
                    else setNoteOpen((open) => !open);
                  }}
                >
                  {saved ? 'Saved' : 'Save Standard'}
                </Button>
              </div>
            }
          />

          {noteOpen ? (
            <div className="mb-5">
              <Card>
                <div className="p-5">
                  <label className="label" htmlFor="save-note">
                    Add a note before saving (optional)
                  </label>
                  <textarea
                    id="save-note"
                    className="input resize-y"
                    rows={2}
                    value={noteDraft}
                    placeholder="e.g. Confirm fire-rating clause with the electrical engineer before tendering."
                    onChange={(event) => setNoteDraft(event.target.value)}
                  />
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button size="sm" loading={saving} onClick={handleSave}>
                      Save with note
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setNoteOpen(false)}>
                      Cancel
                    </Button>
                    <Button size="sm" variant="secondary" onClick={handleQuickSave}>
                      Save without note
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          ) : null}

          {/* Tab navigation */}
          <div className="mb-4 overflow-x-auto">
            <div role="tablist" aria-label="Standard sections" className="flex min-w-max gap-1 border-b border-slate-200">
              {TABS.map((item) => (
                <button
                  key={item}
                  type="button"
                  role="tab"
                  id={`tab-${item.replace(/\s+/g, '-').toLowerCase()}`}
                  aria-selected={tab === item}
                  aria-controls="standard-tabpanel"
                  onClick={() => setTab(item)}
                  className={[
                    '-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                    tab === item
                      ? 'border-brand-700 text-brand-800'
                      : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900',
                  ].join(' ')}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div id="standard-tabpanel" role="tabpanel" aria-labelledby={`tab-${tab.replace(/\s+/g, '-').toLowerCase()}`}>
            {tab === 'Overview' ? (
              <div className="grid gap-5 lg:grid-cols-3">
                <div className="space-y-5 lg:col-span-2">
                  <Card>
                    <CardHeader title="Description" icon={<Info aria-hidden className="h-4 w-4" />} />
                    <div className="p-5">
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                        {standard.description || 'No description recorded for this standard.'}
                      </p>
                    </div>
                  </Card>

                  <Card>
                    <CardHeader
                      title="Keywords"
                      icon={<Tag aria-hidden className="h-4 w-4" />}
                      subtitle={`${standard.keywords.length} index terms used for keyword matching`}
                    />
                    <div className="p-5">
                      {standard.keywords.length === 0 ? (
                        <p className="text-sm italic text-slate-400">No keywords recorded.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {standard.keywords.map((keyword, index) => (
                            <span
                              key={`${keyword}-${index}`}
                              className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700"
                            >
                              {keyword}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </Card>
                </div>

                <div className="space-y-5">
                  <Card>
                    <CardHeader title="Record details" icon={<ScrollText aria-hidden className="h-4 w-4" />} />
                    <dl className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-1">
                      <DefinitionItem label="IS number">
                        <span className="font-mono font-semibold">{standard.is_number}</span>
                      </DefinitionItem>
                      <DefinitionItem label="Sector">{standard.sector}</DefinitionItem>
                      <DefinitionItem label="Product category">{standard.category}</DefinitionItem>
                      {standard.product ? (
                        <DefinitionItem label="Product">{standard.product}</DefinitionItem>
                      ) : null}
                      {standard.year ? <DefinitionItem label="Year">{standard.year}</DefinitionItem> : null}
                      <DefinitionItem label="Status">{standard.status}</DefinitionItem>
                      {standard.revision ? (
                        <DefinitionItem label="Revision">{standard.revision}</DefinitionItem>
                      ) : null}
                      <DefinitionItem label="Recommended">{formatNumber(standard.recommendation_count)} times</DefinitionItem>
                    </dl>
                  </Card>

                  {standard.is_demonstration ? (
                    <InlineNotice tone="warning" title="Demonstration record">
                      <p>
                        This is <strong>sample data</strong> provided so the engine works out of the
                        box. It is not an official BIS catalogue record. Replace it with verified BIS
                        metadata before using the output for a real procurement.
                      </p>
                    </InlineNotice>
                  ) : null}

                  <InlineNotice tone="info" title="Why was this recommended?">
                    <p>
                      This standard appeared in your results because its product, sector and
                      requirement content matched the procurement specification. Open the analysis page
                      to see the exact factor scores and the plain-English reasoning for this match.
                    </p>
                  </InlineNotice>
                </div>
              </div>
            ) : null}

            {tab === 'Scope' ? (
              <Card>
                <CardHeader title="Scope" icon={<BookOpen aria-hidden className="h-4 w-4" />} />
                <div className="p-5">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                    {standard.scope || 'No scope text recorded for this standard.'}
                  </p>
                  <div className="mt-5 border-t border-slate-200 pt-4">
                    <DisclaimerBanner variant="inline" />
                  </div>
                </div>
              </Card>
            ) : null}

            {tab === 'Requirements' ? (
              <Card>
                <CardHeader
                  title="Requirements"
                  icon={<ListChecks aria-hidden className="h-4 w-4" />}
                  subtitle={`${standard.requirement_rows.length} requirement clauses recorded`}
                />
                {standard.requirement_rows.length === 0 ? (
                  <div className="p-5">
                    <p className="text-sm italic text-slate-400">
                      No clause-level requirements are recorded in this dataset.
                    </p>
                  </div>
                ) : (
                  <ol className="divide-y divide-slate-100">
                    {standard.requirement_rows.map((requirement) => (
                      <li key={requirement.id} className="flex gap-4 px-5 py-3.5">
                        <span className="mt-0.5 w-24 shrink-0 font-mono text-xs font-semibold text-brand-800">
                          {requirement.requirement_code || '—'}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm leading-relaxed text-slate-800">
                            {requirement.requirement_text}
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <Badge tone={requirement.is_mandatory ? 'danger' : 'neutral'}>
                              {requirement.is_mandatory ? 'Mandatory' : 'Optional'}
                            </Badge>
                            <Badge tone="info">{requirement.requirement_type}</Badge>
                            {requirement.notes ? (
                              <span className="text-xs text-slate-500">{requirement.notes}</span>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>
            ) : null}

            {tab === 'Related Standards' ? (
              <Card>
                <CardHeader
                  title="Related Standards"
                  icon={<Link2 aria-hidden className="h-4 w-4" />}
                  subtitle="Standards sharing a sector, product or catalogue reference"
                />
                {standard.related_standards.length === 0 ? (
                  <div className="p-5">
                    <p className="text-sm italic text-slate-400">No related standards are linked yet.</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {standard.related_standards.map((related: StandardSummary) => (
                      <li key={related.id}>
                        <Link
                          to={`/standards/${related.id}`}
                          className="flex flex-wrap items-center gap-3 px-5 py-3.5 transition-colors hover:bg-slate-50"
                        >
                          <span className="font-mono text-sm font-bold text-brand-800">{related.is_number}</span>
                          <span className="min-w-0 flex-1 text-sm text-slate-800">{related.title}</span>
                          <SectorBadge sector={related.sector} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            ) : null}

            {tab === 'Source Information' ? (
              <div className="grid gap-5 lg:grid-cols-2">
                <Card>
                  <CardHeader title="Provenance" icon={<FileText aria-hidden className="h-4 w-4" />} />
                  <dl className="grid gap-4 p-5 sm:grid-cols-2">
                    <DefinitionItem label="Source">{standard.source || 'Not recorded'}</DefinitionItem>
                    <DefinitionItem label="Record type">
                      {standard.is_demonstration ? 'Demonstration sample' : 'Imported catalogue data'}
                    </DefinitionItem>
                    {standard.source_url ? (
                      <DefinitionItem label="Reference">
                        <a
                          href={standard.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-brand-700 hover:underline"
                        >
                          {standard.source_url}
                          <ExternalLink aria-hidden className="h-3 w-3" />
                        </a>
                      </DefinitionItem>
                    ) : null}
                    <DefinitionItem label="Created">{formatDateTime(standard.created_at)}</DefinitionItem>
                    <DefinitionItem label="Last updated">{formatDateTime(standard.updated_at)}</DefinitionItem>
                  </dl>
                </Card>

                <Card>
                  <CardHeader title="Data usage notice" icon={<Layers aria-hidden className="h-4 w-4" />} />
                  <div className="space-y-3 p-5 text-xs leading-relaxed text-slate-600">
                    <p>
                      This prototype stores <strong>metadata only</strong> — title, sector, scope
                      summary, keywords and clause summaries. No copyrighted BIS document text is
                      redistributed.
                    </p>
                    <p>
                      To use this system with real data, import a permitted catalogue export with{' '}
                      <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px]">
                        python scripts/import_standards.py --csv your-file.csv
                      </code>
                      . Each record keeps its own source attribution.
                    </p>
                    <a
                      href="https://www.bis.gov.in"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline"
                    >
                      Verify against the official BIS catalogue
                      <ExternalLink aria-hidden className="h-3 w-3" />
                    </a>
                  </div>
                </Card>
              </div>
            ) : null}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate(-1)}
              icon={<ArrowLeft aria-hidden className="h-3.5 w-3.5" />}
            >
              Back to Results
            </Button>
            <Button
              variant={inCompare ? 'success' : 'secondary'}
              size="sm"
              icon={<Columns3 aria-hidden className="h-3.5 w-3.5" />}
              onClick={() => toggleCompare(standard)}
            >
              {inCompare ? 'Remove from comparison' : 'Compare Standard'}
            </Button>
            <Button
              variant={saved ? 'success' : 'primary'}
              size="sm"
              loading={saving}
              icon={
                saved ? (
                  <BookmarkCheck aria-hidden className="h-3.5 w-3.5" />
                ) : (
                  <Pencil aria-hidden className="h-3.5 w-3.5" />
                )
              }
              onClick={() => {
                if (saved) void handleSave();
                else setNoteOpen((open) => !open);
              }}
            >
              {saved ? 'Saved' : 'Save Standard'}
            </Button>
            {fromResults.queryId ? (
              <Link
                to={`/analysis/${fromResults.queryId}`}
                className="ml-auto text-xs font-semibold text-brand-700 hover:underline"
              >
                See full ranking
              </Link>
            ) : null}
          </div>

          {standard.recommendation_count > 0 ? (
            <p className="mt-4 text-xs text-slate-500">
              This standard has been recommended {formatNumber(standard.recommendation_count)} time
              {standard.recommendation_count === 1 ? '' : 's'} across recorded analyses in this
              workspace.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
