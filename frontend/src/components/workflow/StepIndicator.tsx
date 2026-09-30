import { Check } from 'lucide-react';

export interface WorkflowStep {
  id: number;
  label: string;
}

export const WORKFLOW_STEPS: WorkflowStep[] = [
  { id: 1, label: 'Requirement' },
  { id: 2, label: 'Review' },
  { id: 3, label: 'Standards' },
  { id: 4, label: 'Applicability' },
  { id: 5, label: 'Report' },
];

interface StepIndicatorProps {
  current: number;
  /** Highest step the officer has unlocked; earlier steps stay clickable. */
  maxReached: number;
  onJump: (step: number) => void;
}

/**
 * Always answers "where am I?". Completed steps show a tick and stay clickable;
 * steps still locked are visible but disabled, so the officer can see the whole
 * journey ahead of them.
 */
export function StepIndicator({ current, maxReached, onJump }: StepIndicatorProps) {
  return (
    <nav aria-label="Analysis progress" className="mb-8">
      <ol className="flex items-stretch gap-1.5 sm:gap-2">
        {WORKFLOW_STEPS.map((step) => {
          const isCurrent = step.id === current;
          const isDone = step.id < current;
          const reachable = step.id <= maxReached;

          return (
            <li key={step.id} className="min-w-0 flex-1">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => reachable && onJump(step.id)}
                aria-current={isCurrent ? 'step' : undefined}
                className={[
                  'group flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors sm:px-3',
                  isCurrent
                    ? 'border-primary-700 bg-primary-700 text-white shadow-card'
                    : isDone
                      ? 'border-ok-200 bg-ok-50 text-ok-800 hover:border-ok-500'
                      : reachable
                        ? 'border-ink-200 bg-white text-ink-600 hover:border-ink-400'
                        : 'cursor-not-allowed border-dashed border-ink-200 bg-ink-50 text-ink-400',
                ].join(' ')}
              >
                <span
                  aria-hidden
                  className={[
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                    isCurrent
                      ? 'bg-white/20 text-white'
                      : isDone
                        ? 'bg-ok-600 text-white'
                        : 'bg-ink-100 text-ink-500',
                  ].join(' ')}
                >
                  {isDone ? <Check className="h-3.5 w-3.5" /> : step.id}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold leading-tight sm:text-sm">
                    {step.label}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="sr-only">
        Step {current} of {WORKFLOW_STEPS.length}: {WORKFLOW_STEPS[current - 1]?.label}
      </p>
    </nav>
  );
}
