import { Check, Download, Info, Pencil, X } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { STATUS_META, TONE_CLASSES } from '@/lib/status';
import type { Assessment, Decision } from '@/lib/types';

export interface OfficerDecision {
  decision: Decision;
  note: string;
}

interface OfficerReviewProps {
  recommendations: Assessment[];
  decisions: Record<string, OfficerDecision>;
  savedCount: number;
  busy: boolean;
  error: string | null;
  onDecide: (standardId: string, decision: Decision) => void;
  onNote: (standardId: string, note: string) => void;
  onSave: () => void;
  onBack: () => void;
  onDownload: () => void;
}

const OPTIONS: { id: Decision; label: string; icon: typeof Check; on: string }[] = [
  {
    id: 'accepted',
    label: 'Accept',
    icon: Check,
    on: 'border-ok-600 bg-ok-600 text-white',
  },
  {
    id: 'rejected',
    label: 'Reject',
    icon: X,
    on: 'border-stop-600 bg-stop-600 text-white',
  },
  {
    id: 'modified',
    label: 'Modify',
    icon: Pencil,
    on: 'border-ink-700 bg-ink-700 text-white',
  },
];

/**
 * Human review of the AI recommendation.
 *
 * The officer records an explicit decision per standard; the system never records
 * one on their behalf. The AI's suggestion is always shown alongside.
 */
export function OfficerReview({
  recommendations,
  decisions,
  savedCount,
  busy,
  error,
  onDecide,
  onNote,
  onSave,
  onBack,
  onDownload,
}: OfficerReviewProps) {
  const decidedCount = recommendations.filter((item) => decisions[item.standard_id]).length;

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-xl font-bold tracking-tight text-ink-900">Officer Review</h2>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-600">
          Confirm, reject or adjust each recommendation. Your decision is what goes into the
          report.
        </p>
        <p className="mt-3 inline-flex items-start gap-2 rounded-xl border border-ink-200 bg-ink-50 px-4 py-2.5 text-sm italic text-ink-700">
          <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
          AI-generated recommendation. Final verification remains with the authorized procurement
          officer.
        </p>
      </header>

      {recommendations.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-ink-300 bg-ink-50 px-4 py-6 text-center text-sm text-ink-500">
          No standard reached Applicable or Conditionally Applicable, so there is nothing to review.
        </p>
      ) : (
        <ul className="space-y-3">
          {recommendations.map((item) => {
            const current = decisions[item.standard_id];
            const meta = STATUS_META[item.status];
            const tone = TONE_CLASSES[meta.tone];

            return (
              <li key={item.standard_id} className={`card border-l-4 ${tone.left} px-5 py-4`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                      AI Recommendation
                    </p>
                    <p className="mt-1 text-[15px] font-bold text-ink-900">
                      {item.edition} — <span className={tone.text}>{meta.label}</span>
                    </p>
                    <p className="mt-0.5 text-sm text-ink-600">{item.title}</p>
                  </div>
                  {current ? (
                    <span className="shrink-0 rounded-lg bg-ink-100 px-2.5 py-1 text-xs font-semibold text-ink-700">
                      {current.decision === 'accepted'
                        ? 'Accepted'
                        : current.decision === 'rejected'
                          ? 'Rejected'
                          : 'Modified'}
                    </span>
                  ) : null}
                </div>

                <div className="mt-3.5 flex flex-wrap gap-2">
                  {OPTIONS.map((option) => {
                    const selected = current?.decision === option.id;
                    const Icon = option.icon;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => onDecide(item.standard_id, option.id)}
                        aria-pressed={selected}
                        className={[
                          'inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors',
                          selected
                            ? option.on
                            : 'border-ink-300 bg-white text-ink-600 hover:bg-ink-50 hover:text-ink-900',
                        ].join(' ')}
                      >
                        <Icon aria-hidden className="h-4 w-4" />
                        {option.label}
                      </button>
                    );
                  })}
                </div>

                {current ? (
                  <input
                    className="input mt-3"
                    placeholder="Note for the file (optional) — e.g. verified against tender clause 4.2"
                    value={current.note}
                    aria-label={`Note for ${item.edition}`}
                    onChange={(event) => onNote(item.standard_id, event.target.value)}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {error ? (
        <p role="alert" className="rounded-xl border border-stop-200 bg-stop-50 px-4 py-3 text-sm text-stop-800">
          {error}
        </p>
      ) : null}
      {savedCount > 0 && !error ? (
        <p className="rounded-xl border border-ok-200 bg-ok-50 px-4 py-3 text-sm font-semibold text-ok-800">
          {savedCount} decision{savedCount === 1 ? '' : 's'} recorded.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-ink-200 pt-6">
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        {recommendations.length > 0 ? (
          <Button
            variant="secondary"
            loading={busy}
            disabled={decidedCount === 0}
            onClick={onSave}
          >
            Record decisions
          </Button>
        ) : null}
        <Button onClick={onDownload} icon={<Download aria-hidden className="h-4 w-4" />}>
          Download Report
        </Button>
        {recommendations.length > 0 && decidedCount === 0 ? (
          <span className="text-sm text-ink-500">Review each recommendation above to continue.</span>
        ) : null}
      </div>
    </div>
  );
}
