import { useEffect, useState } from 'react';
import {
  Boxes,
  Check,
  Factory,
  Gauge,
  Layers,
  Pencil,
  RotateCw,
  ShieldCheck,
  Tag,
  Users,
  X,
} from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { InlineNotice } from '@/components/ui/Panel';
import { formatPercent } from '@/lib/format';
import type { ExtractedRequirements } from '@/types/api';

interface Props {
  extraction: ExtractedRequirements;
  onReanalyze: (edited: ExtractedRequirements) => Promise<void> | void;
  isReanalyzing?: boolean;
}

interface FieldSpec {
  key: keyof ExtractedRequirements & ('product' | 'material' | 'application' | 'sector' | 'category' | 'quantity');
  label: string;
  icon: typeof Tag;
  hint: string;
}

const FIELDS: FieldSpec[] = [
  { key: 'product', label: 'Product', icon: Tag, hint: 'What is being procured' },
  { key: 'material', label: 'Material', icon: Layers, hint: 'e.g. HDPE, XLPE copper' },
  { key: 'application', label: 'Application', icon: Users, hint: 'Who / where it is used' },
  { key: 'sector', label: 'Sector', icon: Factory, hint: 'Industry sector' },
  { key: 'category', label: 'Product category', icon: Boxes, hint: 'Catalogue grouping' },
  { key: 'quantity', label: 'Quantity', icon: Gauge, hint: 'Units on order' },
];

const LIST_FIELDS: { key: 'requirements' | 'technical_requirements' | 'safety_requirements' | 'performance_requirements'; label: string; icon: typeof ShieldCheck; tone: 'brand' | 'success' | 'warning' | 'info' }[] = [
  { key: 'requirements', label: 'Requirements', icon: ShieldCheck, tone: 'brand' },
  { key: 'technical_requirements', label: 'Technical', icon: Gauge, tone: 'info' },
  { key: 'safety_requirements', label: 'Safety', icon: ShieldCheck, tone: 'success' },
  { key: 'performance_requirements', label: 'Performance', icon: Gauge, tone: 'warning' },
];

function asText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

/**
 * Shows what the NLP stage extracted, and lets the officer correct it before
 * the engine re-scores. Edits are sent to POST /api/recommendations as
 * `overrides`, so the correction genuinely changes the ranking.
 */
export function ExtractedRequirementsPanel({ extraction, onReanalyze, isReanalyzing = false }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ExtractedRequirements>(extraction);

  // Re-sync the draft whenever a fresh extraction arrives from the backend.
  useEffect(() => {
    setDraft(extraction);
  }, [extraction]);

  const confidencePct = Math.round((extraction.confidence ?? 0) * 100);
  const confidenceTone =
    confidencePct >= 70 ? 'success' : confidencePct >= 40 ? 'warning' : 'danger';

  const toggleListItem = (key: (typeof LIST_FIELDS)[number]['key'], item: string) => {
    setDraft((current) => {
      const list = current[key] ?? [];
      return {
        ...current,
        [key]: list.includes(item) ? list.filter((value) => value !== item) : [...list, item],
      };
    });
  };

  const hasChanges = (() => {
    if (!editing) return false;
    return FIELDS.some((field) => asText(draft[field.key]).trim() !== asText(extraction[field.key]).trim()) ||
      LIST_FIELDS.some((field) => (draft[field.key] ?? []).join('|') !== (extraction[field.key] ?? []).join('|'));
  })();

  const handleSave = async () => {
    await onReanalyze({ ...draft, source: 'manual' });
    setEditing(false);
  };

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">
          <ShieldCheck aria-hidden className="h-4 w-4" />
          AI Extracted Requirements
        </h2>
        <div className="flex items-center gap-2">
          <Badge tone={confidenceTone} title="NLP extraction confidence">
            Confidence {formatPercent(extraction.confidence)}
          </Badge>
          {!editing ? (
            <Button
              variant="secondary"
              size="sm"
              icon={<Pencil aria-hidden className="h-3.5 w-3.5" />}
              onClick={() => setEditing(true)}
            >
              Edit
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                icon={<X aria-hidden className="h-3.5 w-3.5" />}
                onClick={() => {
                  setDraft(extraction);
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={isReanalyzing}
                disabled={!hasChanges}
                icon={<RotateCw aria-hidden className="h-3.5 w-3.5" />}
                onClick={handleSave}
                title="Re-score this query using the corrected requirements"
              >
                Re-analyze
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="p-5">
        {extraction.notes?.length ? (
          <InlineNotice tone="info">
            <ul className="list-disc space-y-0.5 pl-4">
              {extraction.notes.map((note, index) => (
                <li key={index}>{note}</li>
              ))}
            </ul>
          </InlineNotice>
        ) : null}

        {/* Attribute fields */}
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FIELDS.map((field) => (
            <div key={field.key} className="min-w-0">
              <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <field.icon aria-hidden className="h-3.5 w-3.5" />
                {field.label}
              </dt>
              <dd className="mt-1.5">
                {editing ? (
                  <>
                    <input
                      className="input"
                      value={asText(draft[field.key])}
                      placeholder={field.hint}
                      aria-label={field.label}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, [field.key]: event.target.value }))
                      }
                    />
                  </>
                ) : asText(extraction[field.key]).trim() ? (
                  <span className="block break-words text-sm font-medium text-slate-800">
                    {asText(extraction[field.key])}
                  </span>
                ) : (
                  <span className="text-sm italic text-slate-400">Not detected</span>
                )}
              </dd>
            </div>
          ))}
        </dl>

        {/* Requirement groups */}
        <div className="mt-5 space-y-4">
          {LIST_FIELDS.map((group) => {
            const source = extraction[group.key] ?? [];
            const draftList = draft[group.key] ?? [];
            if (source.length === 0 && draftList.length === 0) return null;

            return (
              <div key={group.key}>
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <group.icon aria-hidden className="h-3.5 w-3.5" />
                  {group.label}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {(editing ? draftList : source).length === 0 ? (
                    <span className="text-xs italic text-slate-400">None detected</span>
                  ) : (
                    (editing ? draftList : source).map((item, index) => (
                      <button
                        key={`${item}-${index}`}
                        type="button"
                        disabled={!editing}
                        onClick={() => editing && toggleListItem(group.key, item)}
                        title={editing ? 'Click to exclude this requirement from the re-analysis' : undefined}
                        className={
                          editing
                            ? 'inline-flex max-w-full items-center gap-1 rounded border border-slate-300 bg-white px-2 py-0.5 text-left text-xs font-medium text-slate-700 hover:border-red-300 hover:bg-red-50 hover:text-red-700'
                            : ''
                        }
                      >
                        <Badge tone={group.tone}>{item}</Badge>
                        {editing ? <X aria-hidden className="h-3 w-3 shrink-0" /> : null}
                      </button>
                    ))
                  )}
                </div>
                {editing ? (
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    Click a requirement to exclude it. Use “Edit” on a value above to correct it.
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>

        {editing ? (
          <InlineNotice tone="warning">
            <span className="flex items-start gap-1.5">
              <Check aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Press <span className="font-semibold">Re-analyze</span> to re-run the recommendation
                engine with your corrections. Match scores will be recalculated.
              </span>
            </span>
          </InlineNotice>
        ) : null}

        {extraction.keywords?.length ? (
          <div className="mt-5 border-t border-slate-200 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Keywords used for matching
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {extraction.keywords.slice(0, 18).map((keyword, index) => (
                <span
                  key={`${keyword}-${index}`}
                  className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-600"
                >
                  {keyword}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
