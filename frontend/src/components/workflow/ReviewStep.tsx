import { useState } from 'react';
import { ArrowLeft, Check, Pencil, RotateCcw, X } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { RelevanceIsNotApplicability } from '@/components/workflow/RelevanceIsNotApplicability';
import type { RequirementField } from '@/lib/types';

interface ReviewStepProps {
  fields: RequirementField[];
  /** Officer edits, keyed by field. Sent to the backend and always wins. */
  edits: Record<string, string>;
  busy: boolean;
  onEdit: (key: string, value: string) => void;
  onResetEdits: () => void;
  onBack: () => void;
  onContinue: () => void;
}

/**
 * Step 2 - the officer confirms what the system understood.
 *
 * Editable cards rather than a table: one value per card, an edit icon on each,
 * and missing values highlighted so the officer can fill them in before moving on.
 */
export function ReviewStep({
  fields,
  edits,
  busy,
  onEdit,
  onResetEdits,
  onBack,
  onContinue,
}: ReviewStepProps) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const found = fields.filter((field) => !field.missing).length;
  const missing = fields.length - found;
  const editedCount = Object.keys(edits).length;

  function startEdit(field: RequirementField) {
    setOpenKey(field.key);
    setDraft(edits[field.key] ?? field.value ?? '');
  }

  function save() {
    if (!openKey) return;
    onEdit(openKey, draft);
    setOpenKey(null);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">Review Extracted Requirements</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-600">
          We found the following information. Please check it before continuing — anything you
          change is used instead of our reading of your text.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2.5 text-sm">
        <span className="rounded-lg bg-ok-50 px-2.5 py-1 font-semibold text-ok-800 ring-1 ring-inset ring-ok-200">
          {found} found
        </span>
        {missing > 0 ? (
          <span className="rounded-lg bg-warn-50 px-2.5 py-1 font-semibold text-warn-800 ring-1 ring-inset ring-warn-200">
            {missing} not stated
          </span>
        ) : null}
        {editedCount > 0 ? (
          <span className="rounded-lg bg-primary-50 px-2.5 py-1 font-semibold text-primary-800 ring-1 ring-inset ring-primary-200">
            {editedCount} edited by you
          </span>
        ) : null}
        {editedCount > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            icon={<RotateCcw aria-hidden className="h-3.5 w-3.5" />}
            onClick={onResetEdits}
          >
            Undo my edits
          </Button>
        ) : null}
      </div>

      {missing > 0 ? (
        <p className="text-sm text-ink-600">
          Anything left as <span className="font-medium text-ink-800">Not stated</span> is not held
          against you — the system will simply ask you about it later, if a standard needs it.
        </p>
      ) : null}

      <ul className="grid gap-3 sm:grid-cols-2">
        {fields.map((field) => {
          const isOpen = openKey === field.key;
          const edited = Object.prototype.hasOwnProperty.call(edits, field.key);
          const current = edits[field.key] ?? field.value ?? '';

          return (
            <li
              key={field.key}
              className={[
                'card px-4 py-3.5 transition-colors',
                field.missing && !edited ? 'border-warn-200 bg-warn-50/40' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                    {field.label}
                  </p>

                  {isOpen ? (
                    <div className="mt-2">
                      <input
                        className="input"
                        value={draft}
                        autoFocus
                        aria-label={`Edit ${field.label}`}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') save();
                          if (event.key === 'Escape') setOpenKey(null);
                        }}
                        placeholder={field.missing ? 'Not stated — type a value' : ''}
                      />
                    </div>
                  ) : (
                    <p
                      className={[
                        'mt-1 truncate text-[15px] font-semibold',
                        current ? 'text-ink-900' : 'text-ink-400',
                      ].join(' ')}
                    >
                      {current || 'Not stated'}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {edited ? (
                    <span className="mr-1 rounded-md bg-primary-50 px-1.5 py-0.5 text-[11px] font-semibold text-primary-700">
                      Your value
                    </span>
                  ) : null}
                  {isOpen ? (
                    <>
                      <button
                        type="button"
                        onClick={save}
                        aria-label={`Save ${field.label}`}
                        className="rounded-lg p-1.5 text-primary-700 transition-colors hover:bg-primary-50"
                      >
                        <Check aria-hidden className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setOpenKey(null)}
                        aria-label={`Cancel editing ${field.label}`}
                        className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-100"
                      >
                        <X aria-hidden className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEdit(field)}
                      aria-label={`Edit ${field.label}`}
                      title={`Edit ${field.label}`}
                      className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-primary-700"
                    >
                      <Pencil aria-hidden className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <RelevanceIsNotApplicability
        variant="inline"
        className="rounded-xl border border-ink-200 bg-white px-4 py-3"
      />

      <div className="flex flex-wrap items-center gap-3 border-t border-ink-200 pt-6">
        <Button variant="secondary" icon={<ArrowLeft aria-hidden className="h-4 w-4" />} onClick={onBack}>
          Edit Requirement
        </Button>
        <Button
          size="lg"
          loading={busy}
          icon={<Check aria-hidden className="h-4 w-4" />}
          onClick={onContinue}
        >
          Find Applicable Standards
        </Button>
      </div>
    </div>
  );
}
