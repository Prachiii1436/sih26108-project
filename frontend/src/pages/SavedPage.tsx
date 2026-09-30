import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bookmark,
  BookmarkCheck,
  Columns3,
  Download,
  Eye,
  NotebookPen,
  Search,
  Tag,
  Trash2,
  X,
} from 'lucide-react';

import { Badge, SampleDataBadge, SectorBadge } from '@/components/ui/Badge';
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
import { useSavedStandards } from '@/context/SavedStandardsContext';
import { formatDateTime, formatNumber, truncate } from '@/lib/format';
import { deleteSavedStandard, getSavedTags, listSavedStandards, updateSavedStandard } from '@/services/api';
import type { SavedStandardItem } from '@/types/api';

export function SavedPage() {
  const toast = useToast();
  const { toggleCompare, isInCompare, compareIds, clearCompare } = useSavedStandards();

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounced(searchInput, 350);
  const [tagFilter, setTagFilter] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [tagDraft, setTagDraft] = useState('');
  const [pendingId, setPendingId] = useState<number | null>(null);

  const tags = useAsync(() => getSavedTags(), []);
  const saved = useAsync(
    () => listSavedStandards({ search: search || undefined, tag: tagFilter || undefined, page_size: 100 }),
    [search, tagFilter],
  );

  const items = saved.data ?? [];

  const startEdit = (item: SavedStandardItem) => {
    setEditingId(item.id);
    setNoteDraft(item.notes ?? '');
    setTagDraft(item.tag ?? '');
  };

  const saveEdits = async (item: SavedStandardItem) => {
    setPendingId(item.id);
    try {
      await updateSavedStandard(item.id, {
        notes: noteDraft.trim() || null,
        tag: tagDraft.trim() || null,
      });
      toast.success('Notes updated', `${item.standard.is_number} shortlist entry saved.`);
      setEditingId(null);
      void saved.reload();
      void tags.reload();
    } catch (caught) {
      toast.error('Could not update notes', (caught as Error).message);
    } finally {
      setPendingId(null);
    }
  };

  const handleDelete = async (item: SavedStandardItem) => {
    setPendingId(item.id);
    try {
      await deleteSavedStandard(item.id);
      toast.success('Removed from shortlist', `${item.standard.is_number} — ${item.standard.title}`);
      void saved.reload();
      void tags.reload();
    } catch (caught) {
      toast.error('Could not remove standard', (caught as Error).message);
    } finally {
      setPendingId(null);
    }
  };

  const exportShortlist = () => {
    if (items.length === 0) return;
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = items.map((item) =>
      [
        item.standard.is_number,
        item.standard.title,
        item.standard.sector,
        item.standard.category,
        item.tag ?? '',
        item.saved_at,
        item.notes ?? '',
        item.query_specification ?? '',
      ]
        .map(escape)
        .join(','),
    );
    const csv = [
      '# SIH26108 prototype shortlist - not a BIS certification or compliance record.',
      ['IS Number', 'Title', 'Sector', 'Category', 'Tag', 'Saved At', 'Notes', 'Source Specification']
        .map(escape)
        .join(','),
      ...rows,
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'sih26108-shortlist.csv';
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success('Shortlist exported', `${items.length} standards written to CSV.`);
  };

  const compareSelected = items
    .filter((item) => isInCompare(item.standard.id))
    .map((item) => item.standard);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <PageTitle
        title="Saved Standards"
        description="Your shortlist of standards worth reviewing, with notes, tags and the specification each was found from."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {compareSelected.length >= 2 ? (
              <Link to={`/compare?ids=${compareSelected.map((s) => s.id).join(',')}`}>
                <Button size="sm" icon={<Columns3 aria-hidden className="h-3.5 w-3.5" />}>
                  Compare {compareSelected.length}
                </Button>
              </Link>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              disabled={items.length === 0}
              onClick={exportShortlist}
              icon={<Download aria-hidden className="h-3.5 w-3.5" />}
            >
              Export CSV
            </Button>
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
            <label htmlFor="saved-search" className="sr-only">
              Search saved standards
            </label>
            <input
              id="saved-search"
              type="search"
              className="input pl-9"
              placeholder="Search by IS number, title, note or tag..."
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>
          <label className="flex shrink-0 items-center gap-2 text-xs text-slate-600">
            Tag
            <select
              className="select w-40"
              value={tagFilter}
              onChange={(event) => setTagFilter(event.target.value)}
            >
              <option value="">All tags</option>
              {(tags.data?.tags ?? []).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* List */}
      {saved.isInitialLoading ? (
        <Card>
          <SkeletonRows rows={3} />
        </Card>
      ) : saved.status === 'error' ? (
        <ErrorState
          title="Could not load your shortlist"
          message={saved.error?.message}
          onRetry={() => void saved.reload()}
        />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Bookmark aria-hidden className="h-6 w-6" />}
            title={
              search || tagFilter ? 'No saved standards match this filter' : 'Your shortlist is empty'
            }
            message={
              search || tagFilter ? (
                'Try a different search term or clear the tag filter.'
              ) : (
                <>
                  Save a standard from any recommendation card, the Standards Explorer or a standard
                  detail page. Your shortlist persists in the database and is scoped to this session.
                  <span className="mt-2 block">
                    <Link to="/new-query" className="font-semibold text-brand-700 underline">
                      Run a procurement query
                    </Link>{' '}
                    to find candidates worth shortlisting.
                  </span>
                </>
              )
            }
            action={
              <Link to="/explorer">
                <Button size="sm" icon={<Search aria-hidden className="h-3.5 w-3.5" />}>
                  Browse Standards Explorer
                </Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          <p className="mb-3 text-xs text-slate-500">
            {formatNumber(items.length)} saved standard{items.length === 1 ? '' : 's'}
            {compareIds.length > 0 ? ` · ${compareIds.length} staged for comparison` : ''}
          </p>

          <ul className="space-y-3">
            {items.map((item) => {
              const inCompare = isInCompare(item.standard.id);
              const isEditing = editingId === item.id;

              return (
                <li key={item.id}>
                  <Card>
                    <div className="p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              to={`/standards/${item.standard_id}`}
                              className="font-mono text-sm font-bold text-brand-800 hover:underline"
                            >
                              {item.standard.is_number}
                            </Link>
                            {item.standard.is_demonstration ? <SampleDataBadge /> : null}
                            {item.tag ? (
                              <Badge tone="brand" icon={<Tag aria-hidden className="h-3 w-3" />}>
                                {item.tag}
                              </Badge>
                            ) : null}
                            <span className="text-xs text-slate-400">
                              Saved {formatDateTime(item.saved_at)}
                            </span>
                          </div>

                          <h3 className="mt-1 text-sm font-semibold leading-snug text-navy-900">
                            <Link to={`/standards/${item.standard_id}`} className="hover:text-brand-700">
                              {item.standard.title}
                            </Link>
                          </h3>

                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <SectorBadge sector={item.standard.sector} />
                            <Badge tone="neutral">{item.standard.category}</Badge>
                            {item.standard.year ? <span className="text-xs text-slate-500">{item.standard.year}</span> : null}
                          </div>

                          {isEditing ? (
                            <div className="mt-3 space-y-2">
                              <div>
                                <label className="label" htmlFor={`note-${item.id}`}>
                                  Notes
                                </label>
                                <textarea
                                  id={`note-${item.id}`}
                                  className="input resize-y"
                                  rows={2}
                                  value={noteDraft}
                                  placeholder="e.g. Verify the fire-rating clause with the electrical engineer."
                                  onChange={(event) => setNoteDraft(event.target.value)}
                                />
                              </div>
                              <div className="sm:w-56">
                                <label className="label" htmlFor={`tag-${item.id}`}>
                                  Tag
                                </label>
                                <input
                                  id={`tag-${item.id}`}
                                  className="input"
                                  value={tagDraft}
                                  placeholder="e.g. electrical"
                                  onChange={(event) => setTagDraft(event.target.value)}
                                />
                              </div>
                            </div>
                          ) : item.notes ? (
                            <p className="mt-2.5 rounded-md bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-700 ring-1 ring-inset ring-slate-200">
                              {item.notes}
                            </p>
                          ) : (
                            <p className="mt-2.5 text-xs italic text-slate-400">No notes added</p>
                          )}

                          {item.query_specification ? (
                            <p className="mt-2.5 text-[11px] leading-relaxed text-slate-500">
                              <span className="font-semibold text-slate-600">Found from:</span>{' '}
                              {truncate(item.query_specification, 120)}
                            </p>
                          ) : null}
                        </div>

                        {/* Actions */}
                        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                          {isEditing ? (
                            <>
                              <Button
                                size="sm"
                                loading={pendingId === item.id}
                                onClick={() => void saveEdits(item)}
                                icon={<NotebookPen aria-hidden className="h-3.5 w-3.5" />}
                              >
                                Save notes
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <>
                              <Link to={`/standards/${item.standard_id}`}>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  icon={<Eye aria-hidden className="h-3.5 w-3.5" />}
                                >
                                  View
                                </Button>
                              </Link>
                              <Button
                                size="sm"
                                variant={inCompare ? 'success' : 'secondary'}
                                onClick={() => toggleCompare(item.standard)}
                                icon={
                                  inCompare ? (
                                    <X aria-hidden className="h-3.5 w-3.5" />
                                  ) : (
                                    <Columns3 aria-hidden className="h-3.5 w-3.5" />
                                  )
                                }
                              >
                                {inCompare ? 'Staged' : 'Compare'}
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => startEdit(item)}
                                icon={<NotebookPen aria-hidden className="h-3.5 w-3.5" />}
                                aria-label={`Edit notes for ${item.standard.is_number}`}
                              >
                                Notes
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                loading={pendingId === item.id}
                                onClick={() => void handleDelete(item)}
                                icon={<Trash2 aria-hidden className="h-3.5 w-3.5" />}
                                aria-label={`Remove ${item.standard.is_number} from shortlist`}
                              />
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>

          {compareSelected.length >= 2 ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-success-200 bg-success-50 p-3">
              <BookmarkCheck aria-hidden className="h-4 w-4 text-success-700" />
              <p className="flex-1 text-xs text-success-700">
                {compareSelected.length} standards staged for comparison.
              </p>
              <Link to={`/compare?ids=${compareSelected.map((s) => s.id).join(',')}`}>
                <Button size="sm" variant="success" icon={<Columns3 aria-hidden className="h-3.5 w-3.5" />}>
                  Compare now
                </Button>
              </Link>
              <Button size="sm" variant="ghost" onClick={clearCompare}>
                Clear
              </Button>
            </div>
          ) : null}
        </>
      )}

      <div className="mt-5">
        <InlineNotice tone="warning" title="Shortlist is not an approval">
          Saving a standard records that you want to review it. It does not mean the standard applies
          to your procurement, and it carries no certification or compliance status. Records marked{' '}
          <span className="font-semibold">SAMPLE DATA</span> are demonstration records.
        </InlineNotice>
      </div>
    </div>
  );
}
