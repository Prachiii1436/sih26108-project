import { Check } from 'lucide-react';

export interface WizardStep {
  id: number;
  label: string;
}

interface StepRailProps {
  steps: WizardStep[];
  current: number;
  maxReached: number;
  onJump: (id: number) => void;
}

/**
 * One-row progress indicator: `1 Requirement -> 2 Review -> 3 Standards ->
 * 4 Applicability -> 5 Report`. Completed steps stay clickable so an officer can
 * step backwards, upcoming steps are disabled so the flow stays linear.
 */
export function StepRail({ steps, current, maxReached, onJump }: StepRailProps) {
  return (
    <nav aria-label="Analysis progress" className="mb-6">
      <ol className="flex items-start overflow-x-auto pb-1 scroll-slim">
        {steps.map((step, index) => {
          const active = step.id === current;
          const done = step.id < current;
          const reachable = step.id <= maxReached;
          const last = index === steps.length - 1;

          return (
            <li key={step.id} className="flex min-w-max flex-1 items-start">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => reachable && onJump(step.id)}
                aria-current={active ? 'step' : undefined}
                className={[
                  'group flex flex-col items-center gap-1.5 px-2 text-center sm:px-3',
                  reachable ? 'cursor-pointer' : 'cursor-not-allowed',
                ].join(' ')}
              >
                <span className="flex w-full items-center">
                  <span
                    aria-hidden
                    className={[
                      'h-px flex-1',
                      index === 0 ? 'invisible' : done || active ? 'bg-brand-600' : 'bg-slate-200',
                    ].join(' ')}
                  />
                  <span
                    className={[
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-1 ring-inset transition-colors',
                      active
                        ? 'bg-brand-700 text-white ring-brand-700'
                        : done
                          ? 'bg-brand-50 text-brand-700 ring-brand-200'
                          : 'bg-white text-slate-400 ring-slate-300',
                      reachable && !active ? 'group-hover:bg-slate-100' : '',
                    ].join(' ')}
                  >
                    {done && !active ? <Check aria-hidden className="h-4 w-4" /> : step.id}
                  </span>
                  <span
                    aria-hidden
                    className={[
                      'h-px flex-1',
                      last ? 'invisible' : done || active ? 'bg-brand-600' : 'bg-slate-200',
                    ].join(' ')}
                  />
                </span>
                <span
                  className={[
                    'text-[11px] font-semibold uppercase tracking-wide sm:text-xs',
                    active ? 'text-brand-800' : done ? 'text-slate-700' : 'text-slate-400',
                  ].join(' ')}
                >
                  {step.label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
