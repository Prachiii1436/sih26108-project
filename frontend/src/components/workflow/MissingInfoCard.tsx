import { useState } from 'react';
import { HelpCircle, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/StatusPill';
import type { Clarification } from '@/lib/types';

interface MissingInfoCardProps {
  clarifications: Clarification[];
  answers: Record<string, string>;
  busy: boolean;
  onAnswer: (dimension: string, value: string) => void;
}

/**
 * Missing information, asked as a question rather than reported as an error.
 *
 * The system refuses to guess. It says which detail it needs, offers the values
 * the standards themselves record, and re-checks as soon as the officer answers.
 */
export function MissingInfoCard({
  clarifications,
  answers,
  busy,
  onAnswer,
}: MissingInfoCardProps) {
  const [freeText, setFreeText] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(true);

  if (clarifications.length === 0) return null;

  return (
    <section className="rounded-2xl border border-warn-200 bg-warn-50" aria-live="polite">
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warn-600 text-white">
            <HelpCircle aria-hidden className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold text-warn-800">
              {clarifications.length === 1
                ? 'One detail is required'
                : `${clarifications.length} details are required`}
            </h2>
            <p className="mt-0.5 text-sm leading-relaxed text-warn-800/90">
              We need this information to determine whether the standard applies.
            </p>
          </div>
        </div>
        {clarifications.length > 1 ? (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="text-sm font-semibold text-warn-800 underline underline-offset-2 hover:text-warn-600"
          >
            {open ? 'Hide' : 'Show'}
          </button>
        ) : null}
      </header>

      {open ? (
        <ul className="divide-y divide-warn-200 border-t border-warn-200">
          {clarifications.map((item) => {
            const answered = answers[item.dimension];
            const typed = freeText[item.dimension] ?? '';
            const isFreeText = item.options.length === 0;

            return (
              <li
                key={item.dimension}
                id={`question-${item.dimension}`}
                className="scroll-mt-24 bg-white px-5 py-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 text-[15px] font-semibold text-ink-900">{item.question}</p>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    {item.affected_standards.map((edition) => (
                      <Chip key={edition}>{edition}</Chip>
                    ))}
                  </div>
                </div>

                <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-500">{item.why}</p>

                <div className="mt-3.5 flex flex-wrap items-center gap-2">
                  {item.options.map((option) => {
                    const selected = answered === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        disabled={busy}
                        onClick={() => onAnswer(item.dimension, option)}
                        className={[
                          'rounded-xl border px-4 py-2 text-sm font-semibold transition-colors',
                          selected
                            ? 'border-primary-700 bg-primary-700 text-white'
                            : 'border-ink-300 bg-white text-ink-700 hover:border-primary-500 hover:bg-primary-50 hover:text-primary-800',
                          busy ? 'cursor-not-allowed opacity-60' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        {option}
                      </button>
                    );
                  })}

                  {isFreeText ? (
                    <div className="flex items-center gap-2">
                      <input
                        className="input max-w-[240px]"
                        placeholder="Type the value"
                        value={typed}
                        aria-label={item.question}
                        onChange={(event) =>
                          setFreeText((current) => ({ ...current, [item.dimension]: event.target.value }))
                        }
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && typed.trim()) {
                            onAnswer(item.dimension, typed.trim());
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        disabled={!typed.trim() || busy}
                        onClick={() => onAnswer(item.dimension, typed.trim())}
                      >
                        Submit
                      </Button>
                    </div>
                  ) : null}

                  {answered ? (
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ok-700">
                      <RefreshCw aria-hidden className="h-4 w-4" />
                      {answered} — re-checked
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
