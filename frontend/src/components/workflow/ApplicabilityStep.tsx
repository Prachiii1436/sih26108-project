import { useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { EmptyNote } from '@/components/ui/Notice';
import { ApplicabilityCard } from '@/components/workflow/ApplicabilityCard';
import { MissingInfoCard } from '@/components/workflow/MissingInfoCard';
import { RelevanceIsNotApplicability } from '@/components/workflow/RelevanceIsNotApplicability';
import { STATUS_META, TONE_CLASSES } from '@/lib/status';
import { STATUS_ORDER, type AnalysisResult, type ApplicabilityStatus, type Assessment, type Clarification } from '@/lib/types';

interface ApplicabilityStepProps {
  result: AnalysisResult;
  answers: Record<string, string>;
  busy: boolean;
  onOpenWhy: (assessment: Assessment) => void;
  onAnswer: (dimension: string, value: string) => void;
  onBack: () => void;
  onContinue: () => void;
}

/**
 * Step 4 - the screen the whole prototype exists for.
 *
 * One card per standard, each carrying a plain-text status, the condition list
 * that produced it, and the question to ask when something is missing.
 */
export function ApplicabilityStep({
  result,
  answers,
  busy,
  onOpenWhy,
  onAnswer,
  onBack,
  onContinue,
}: ApplicabilityStepProps) {
  const questionRef = useRef<HTMLDivElement>(null);

  const openQuestions: Clarification[] = result.clarifications.filter(
    (item) => !answers[item.dimension],
  );
  const resolvedCount = result.clarifications.length - openQuestions.length;

  // Jump to the question when the officer answers from a result card.
  useEffect(() => {
    if (openQuestions.length > 0 && questionRef.current) {
      questionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    // Only react to the number of open questions changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openQuestions.length]);

  const byStatus = STATUS_ORDER.map((status) => ({
    status,
    items: result.candidates.filter((candidate) => candidate.status === status),
  })).filter((group) => group.items.length > 0);

  const undetermined = result.candidates.filter((c) => c.status === 'UNDETERMINED');

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">Applicability Analysis</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-600">
          Each standard has been checked against your requirement, one condition at a time. Open any
          result to see exactly why.
        </p>
      </header>

      {/* count summary, always visible */}
      <div className="flex flex-wrap gap-2">
        {byStatus.map(({ status, items }) => {
          const meta = STATUS_META[status as ApplicabilityStatus];
          const tone = TONE_CLASSES[meta.tone];
          return (
            <span
              key={status}
              className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm ring-1 ring-inset ${tone.pill}`}
            >
              <span aria-hidden className="font-bold">
                {meta.symbol}
              </span>
              <span className="font-semibold">{meta.label}</span>
              <span className="font-bold tabular-nums">{items.length}</span>
            </span>
          );
        })}
      </div>

      {openQuestions.length > 0 ? (
        <div ref={questionRef} className="scroll-mt-24">
          <MissingInfoCard
            clarifications={result.clarifications}
            answers={answers}
            busy={busy}
            onAnswer={onAnswer}
          />
        </div>
      ) : result.clarifications.length > 0 ? (
        <p className="rounded-2xl border border-ok-200 bg-ok-50 px-5 py-3.5 text-sm font-semibold text-ok-800">
          All {result.clarifications.length} question
          {result.clarifications.length === 1 ? '' : 's'} answered — the results below have been
          re-checked
          {resolvedCount > 0 ? ` (${resolvedCount} resolved)` : ''}.
        </p>
      ) : null}

      {byStatus.length === 0 ? (
        <EmptyNote>
          No standard was close enough to your requirement to be checked. Go back and add more
          detail.
        </EmptyNote>
      ) : (
        byStatus.map(({ status, items }) => (
          <section key={status} aria-labelledby={`group-${status}`}>
            <h2
              id={`group-${status}`}
              className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-500"
            >
              {STATUS_META[status].label} · {items.length}
            </h2>
            <ul className="space-y-3.5">
              {items.map((assessment) => (
                <li key={assessment.standard_id}>
                  <ApplicabilityCard
                    assessment={assessment}
                    onOpenWhy={onOpenWhy}
                    onAnswerQuestion={(target) => {
                      const question = result.clarifications.find((item) =>
                        target.missing_questions.some(
                          (missing) => missing.dimension === item.dimension,
                        ),
                      );
                      if (question) {
                        document
                          .getElementById(`question-${question.dimension}`)
                          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }
                    }}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {undetermined.length > 0 && openQuestions.length === 0 ? (
        <EmptyNote>
          {undetermined.length} standard{undetermined.length === 1 ? ' is' : 's are'} still
          undetermined because a required detail is not recorded yet. Go back to the review step to
          add it.
        </EmptyNote>
      ) : null}

      <RelevanceIsNotApplicability
        variant="inline"
        className="rounded-xl border border-ink-200 bg-white px-4 py-3"
      />

      <div className="flex flex-wrap items-center gap-3 border-t border-ink-200 pt-6">
        <Button variant="secondary" icon={<ArrowLeft aria-hidden className="h-4 w-4" />} onClick={onBack}>
          Back
        </Button>
        <Button
          size="lg"
          disabled={result.candidates.length === 0}
          icon={<ArrowRight aria-hidden className="h-4 w-4" />}
          onClick={onContinue}
        >
          View Summary
        </Button>
      </div>
    </div>
  );
}
