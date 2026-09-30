import { ArrowLeft, ArrowRight, BookOpen, Search } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/StatusPill';
import { EmptyNote } from '@/components/ui/Notice';
import { RelevanceIsNotApplicability } from '@/components/workflow/RelevanceIsNotApplicability';
import type { Assessment } from '@/lib/types';

interface StandardsStepProps {
  candidates: Assessment[];
  uiMessage: string;
  onBack: () => void;
  onContinue: () => void;
}

type Strength = 'Strong Match' | 'Partial Match' | 'Needs Verification';

const STRENGTH_CLASSES: Record<Strength, string> = {
  'Strong Match': 'bg-ok-50 text-ok-800 ring-ok-200',
  'Partial Match': 'bg-primary-50 text-primary-800 ring-primary-200',
  'Needs Verification': 'bg-ink-100 text-ink-600 ring-ink-200',
};

/**
 * Search results are described in words, never as a similarity percentage.
 *
 * A percentage invites an officer to treat "87% match" as an applicability
 * decision. "Strong Match" describes how well the standard was found, and the
 * label itself says the applicability check has not happened yet.
 */
function matchStrength(candidate: Assessment): Strength {
  const productHit = candidate.why_selected.some((line) => line.includes('is listed inside'));
  if (productHit) return 'Strong Match';
  if (candidate.retrieval_score >= 0.45) return 'Partial Match';
  return 'Needs Verification';
}

function whyFound(candidate: Assessment): string {
  const productHit = candidate.why_selected.find((line) => line.includes('is listed inside'));
  if (productHit) return 'Product type and technical description match.';
  const semantic = candidate.why_selected.find((line) => line.toLowerCase().includes('scope'));
  return semantic ?? 'The wording of this standard is close to your requirement.';
}

/**
 * Step 3 - the standards the search found.
 *
 * Nothing is decided on this screen. Its whole job is to set up the next one.
 */
export function StandardsStep({ candidates, uiMessage, onBack, onContinue }: StandardsStepProps) {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">Standards Found</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-600">
          {candidates.length} {candidates.length === 1 ? 'standard' : 'standards'} look related to
          your requirement. We now need to check whether each one actually applies.
        </p>
      </header>

      <RelevanceIsNotApplicability message={uiMessage} />

      {candidates.length === 0 ? (
        <EmptyNote>
          No standard in the current knowledge base is related to this requirement. Try adding more
          detail — the product type in particular.
        </EmptyNote>
      ) : (
        <ul className="space-y-3">
          {candidates.map((candidate) => {
            const strength = matchStrength(candidate);
            return (
              <li key={candidate.standard_id} className="card px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold text-ink-900">{candidate.edition}</p>
                    <p className="mt-0.5 text-sm text-ink-600">{candidate.title}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    {candidate.sector ? <Chip>{candidate.sector}</Chip> : null}
                    <span
                      className={[
                        'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
                        STRENGTH_CLASSES[strength],
                      ].join(' ')}
                    >
                      <Search aria-hidden className="h-3.5 w-3.5" />
                      {strength}
                    </span>
                  </div>
                </div>

                <dl className="mt-3.5 grid gap-x-6 gap-y-2 border-t border-ink-100 pt-3.5 sm:grid-cols-[9rem_minmax(0,1fr)]">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                    Why found
                  </dt>
                  <dd className="text-sm text-ink-700">{whyFound(candidate)}</dd>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                    Applicability
                  </dt>
                  <dd className="text-sm text-ink-500">Checking applicability…</dd>
                </dl>
              </li>
            );
          })}
        </ul>
      )}

      <p className="flex items-start gap-2 text-sm text-ink-500">
        <BookOpen aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
        Match strength describes only how a standard was found. It is not a decision.
      </p>

      <div className="flex flex-wrap items-center gap-3 border-t border-ink-200 pt-6">
        <Button variant="secondary" icon={<ArrowLeft aria-hidden className="h-4 w-4" />} onClick={onBack}>
          Back
        </Button>
        <Button
          size="lg"
          disabled={candidates.length === 0}
          icon={<ArrowRight aria-hidden className="h-4 w-4" />}
          onClick={onContinue}
        >
          Check Applicability
        </Button>
      </div>
    </div>
  );
}
