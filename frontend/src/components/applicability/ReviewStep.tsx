import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Pencil, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import type { ApplicabilityResponse, RequirementField } from '@/types/applicability';

interface ReviewStepProps {
  result: ApplicabilityResponse;
  overrides: Record<string, string>;
  busy: boolean;
  onOverride: (key: string, value: string) => void;
  onClearOverrides: () => void;
  onBack: () => void;
  onContinue: () => void;
}

/** Step 2 - review what was extracted. Everything stays editable. */
export function ReviewStep({
  result,
  overrides,
  busy,
  onOverride,
  onClearOverrides,
  onBack,
  onContinue,
}: ReviewStepProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const rows: RequirementField[] = result.fields;
  const editCount = Object.keys(overrides).length;

  function startEdit(field: RequirementField) {
    setEditing(field.key);
    setDraft(field.value ?? '');
  }

  function cancelEdit() {
    setEditing(null);
    setDraft('');
  }

  function saveEdit(field: RequirementField) {
    const value = draft.trim();
    if (value !== (field.value ?? '')) onOverride(field.key, value);
    cancelEdit();
  }

  return (
    <section className="mx-auto max-w-5xl">
      <header className="mb-5">
        <h1 className="text-xl font-bold tracking-tight text-navy-900">
          Review Extracted Requirements
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-600">
          We found the following information. Please check it before continuing.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((field) => {
          const isEditing = editing === field.key;
          const edited = Object.prototype.hasOwnProperty.call(overrides, field.key);

          return (
            <div
              key={field.key}
              className={[
                'flex flex-col rounded-lg border bg-white p-4 shadow-card',
                field.missing ? 'border-amber-200' : 'border-slate-200',
              ].join(' ')}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  {field.label}
                </span>
                {!isEditing ? (
                  <button
                    type="button"
                    onClick={() => startEdit(field)}
                    aria-label={`Edit ${field.label}`}
                    title={`Edit ${field.label}`}
                    className="-mr-1 -mt-1 rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-brand-700"
                  >
                    <Pencil aria-hidden className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>

              {isEditing ? (
                <div className="mt-2">
                  <input
                    autoFocus
                    className="input"
                    value={draft}
                    placeholder="Enter a value"
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') saveEdit(field);
                      if (event.key === 'Escape') cancelEdit();
                    }}
                    aria-label={field.label}
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <Button size="sm" onClick={() => saveEdit(field)}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={cancelEdit}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm font-semibold leading-snug text-navy-900">
                  {field.value ?? (
                    <span className="font-medium text-amber-700">Not specified</span>
                  )}
                </p>
              )}

              <p className="mt-auto pt-2 text-[11px] leading-snug text-slate-400">
                {edited
                  ? 'Corrected by you'
                  : field.missing
                    ? 'Not found in your text - you can add it'
                    : 'Read from your description'}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white px-5 py-4">
        <p className="text-sm leading-relaxed text-slate-600">
          The next step searches for Indian Standards that could apply to these requirements, then
          checks each standard&apos;s conditions against them one by one.
        </p>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          icon={<ArrowLeft aria-hidden className="h-4 w-4" />}
          onClick={onBack}
        >
          Edit Requirement
        </Button>
        <Button
          loading={busy}
          icon={<ArrowRight aria-hidden className="h-4 w-4" />}
          onClick={onContinue}
        >
          Find Applicable Standards
        </Button>
        {editCount > 0 ? (
          <button
            type="button"
            onClick={() => {
              onClearOverrides();
              setEditing(null);
            }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
          >
            <RotateCcw aria-hidden className="h-3.5 w-3.5" />
            Reset my {editCount} edit{editCount > 1 ? 's' : ''}
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <Check aria-hidden className="h-3.5 w-3.5 text-success-600" />
            Every value above can be corrected before the check runs.
          </span>
        )}
      </div>
    </section>
  );
}
