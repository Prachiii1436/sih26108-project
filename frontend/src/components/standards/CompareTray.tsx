import { Link } from 'react-router-dom';
import { Columns3, Trash2, X } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { useSavedStandards } from '@/context/SavedStandardsContext';
import type { StandardSummary } from '@/types/api';

/** Sticky tray showing the standards staged for side-by-side comparison. */
export function CompareTray({
  standards,
  onRemove,
}: {
  /** Resolved summaries for the staged ids, so the tray shows real titles. */
  standards: StandardSummary[];
  onRemove: (id: number) => void;
}) {
  const { compareIds, clearCompare, compareLimit } = useSavedStandards();

  if (compareIds.length === 0) return null;

  return (
    <div className="sticky bottom-0 z-20 border-t border-brand-200 bg-white/95 shadow-[0_-2px_8px_rgba(15,23,42,0.06)] backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
          <Columns3 aria-hidden className="h-4 w-4 text-brand-700" />
          Comparison tray ({compareIds.length}/{compareLimit})
        </span>

        <ul className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {standards.map((standard) => (
            <li
              key={standard.id}
              className="flex max-w-xs items-center gap-1.5 rounded border border-slate-200 bg-slate-50 py-1 pl-2 pr-1 text-xs"
            >
              <Link
                to={`/standards/${standard.id}`}
                className="truncate font-mono font-semibold text-brand-800 hover:underline"
              >
                {standard.is_number}
              </Link>
              <span className="hidden truncate text-slate-600 sm:inline">{standard.title}</span>
              <button
                type="button"
                onClick={() => onRemove(standard.id)}
                aria-label={`Remove ${standard.is_number} from comparison`}
                className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
              >
                <X aria-hidden className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={clearCompare}
            icon={<Trash2 aria-hidden className="h-3.5 w-3.5" />}
          >
            Clear
          </Button>
          {compareIds.length < 2 ? (
            <span
              className="inline-flex h-9 cursor-not-allowed items-center rounded-md border border-slate-200 bg-slate-100 px-4 text-xs font-semibold text-slate-400"
              title="Select at least 2 standards to compare"
            >
              Compare now
            </span>
          ) : (
            <Link
              to={`/compare?ids=${compareIds.join(',')}`}
              className="inline-flex h-9 items-center rounded-md border border-brand-700 bg-brand-700 px-4 text-xs font-semibold text-white transition-colors hover:bg-brand-800"
            >
              Compare now
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
