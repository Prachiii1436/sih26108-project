import { Check, HelpCircle, X } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Chip, StatusPill } from '@/components/ui/StatusPill';
import { CHECK_META, STATUS_META, TONE_CLASSES } from '@/lib/status';
import type { Assessment } from '@/lib/types';

interface ApplicabilityCardProps {
  assessment: Assessment;
  onOpenWhy: (assessment: Assessment) => void;
  onAnswerQuestion?: (assessment: Assessment) => void;
}

/** The primary result component: one standard, one decision, its conditions. */
export function ApplicabilityCard({
  assessment,
  onOpenWhy,
  onAnswerQuestion,
}: ApplicabilityCardProps) {
  const a = assessment;
  const meta = STATUS_META[a.status];
  const tone = TONE_CLASSES[meta.tone];
  const needsAnswer = a.status === 'UNDETERMINED';

  return (
    <article className={`card overflow-hidden border-l-4 ${tone.left}`}>
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <StatusPill status={a.status} />
            {a.sector ? <Chip>{a.sector}</Chip> : null}
          </div>
          <h3 className="mt-2.5 text-lg font-bold leading-snug text-ink-900">{a.edition}</h3>
          <p className="mt-0.5 text-sm text-ink-600">{a.title}</p>
        </div>
      </div>

      <div className={`${tone.soft} border-y border-ink-100 px-5 py-3.5 sm:px-6`}>
        <p className="text-[15px] font-semibold leading-snug text-ink-900">{meta.short}</p>
        {a.why_not_applicable ? (
          <p className="mt-1.5 text-sm leading-relaxed text-ink-700">{a.why_not_applicable}</p>
        ) : null}
      </div>

      {/* the condition list: the heart of the decision */}
      <ul className="divide-y divide-ink-100">
        {a.checks.map((row, index) => {
          const check = CHECK_META[row.result];
          const rowTone = TONE_CLASSES[check.tone];
          return (
            <li
              key={`${row.dimension}-${index}`}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 sm:px-6"
            >
              <span
                aria-hidden
                className={[
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                  rowTone.soft,
                  rowTone.text,
                ].join(' ')}
              >
                {check.symbol}
              </span>
              <span className="min-w-0 flex-1 text-sm text-ink-800">{row.label}</span>
              <span className={`text-sm font-semibold ${rowTone.text}`}>{check.label}</span>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-2.5 border-t border-ink-200 bg-white px-5 py-3.5 sm:px-6">
        {needsAnswer && onAnswerQuestion ? (
          <Button
            size="sm"
            icon={<HelpCircle aria-hidden className="h-4 w-4" />}
            onClick={() => onAnswerQuestion(a)}
          >
            Answer Question
          </Button>
        ) : null}
        <Button
          variant="secondary"
          size="sm"
          icon={a.status === 'EXCLUDED' || a.status === 'CONFLICTING' ? <X aria-hidden className="h-4 w-4" /> : <Check aria-hidden className="h-4 w-4" />}
          onClick={() => onOpenWhy(a)}
        >
          {a.status === 'EXCLUDED' || a.status === 'CONFLICTING' ? 'Why was it not recommended?' : 'Why does it apply?'}
        </Button>
      </div>
    </article>
  );
}
