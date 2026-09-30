import { ArrowLeft, ArrowRight, Search } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { MatchStrengthBadge, MATCH_META, matchStrength } from './statusLook';
import type { ApplicabilityResponse } from '@/types/applicability';

interface StandardsStepProps {
  result: ApplicabilityResponse;
  onBack: () => void;
  onContinue: () => void;
}

/**
 * Step 3 - candidate search results only. Deliberately shows no status and no
 * similarity percentage: finding a relevant standard is not the same as it
 * being applicable, which is decided in the next step.
 */
export function StandardsStep({ result, onBack, onContinue }: StandardsStepProps) {
  const candidates = result.candidates;

  return (
    <section className="mx-auto max-w-4xl">
      <header className="mb-5">
        <h1 className="text-xl font-bold tracking-tight text-navy-900">Standards Found</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-600">
          {candidates.length === 0
            ? 'No standards matched this requirement closely enough.'
            : `${candidates.length} Indian Standard${candidates.length > 1 ? 's' : ''} look relevant to your requirement.`}
        </p>
      </header>

      <div className="mb-5 rounded-lg border border-brand-200 bg-brand-50 px-5 py-4">
        <p className="text-sm font-bold text-brand-900">
          Finding a relevant standard does not mean it is applicable.
        </p>
        <p className="mt-1 text-sm leading-relaxed text-brand-900/80">
          These are search results only. In the next step the system checks each standard&apos;s
          conditions and scope against your requirement, condition by condition.
        </p>
      </div>

      {candidates.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white px-5 py-8 text-center">
          <Search aria-hidden className="mx-auto h-6 w-6 text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-slate-700">No standards found</p>
          <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-slate-500">
            Go back and add the product type, capacity or material so the search has more to work
            with.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {candidates.map((candidate) => {
            const strength = matchStrength(candidate);
            const why = candidate.why_selected[0] ?? 'Matched against the product description.';
            return (
              <li
                key={candidate.standard_id}
                className="rounded-lg border border-slate-200 bg-white p-5 shadow-card"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold tracking-tight text-navy-900">
                      {candidate.edition}
                    </p>
                    <p className="mt-0.5 text-sm leading-snug text-slate-700">
                      {candidate.title}
                    </p>
                  </div>
                  <MatchStrengthBadge assessment={candidate} />
                </div>

                <div className="mt-3 rounded-md bg-slate-50 px-3.5 py-2.5">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    Why found
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{why}</p>
                </div>

                <p className="mt-2.5 text-[11px] text-slate-400">
                  {MATCH_META[strength].hint} Applicability is checked in the next step.
                </p>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          icon={<ArrowLeft aria-hidden className="h-4 w-4" />}
          onClick={onBack}
        >
          Edit Requirement
        </Button>
        <Button
          icon={<ArrowRight aria-hidden className="h-4 w-4" />}
          onClick={onContinue}
          disabled={candidates.length === 0}
        >
          Check Applicability
        </Button>
      </div>
    </section>
  );
}
