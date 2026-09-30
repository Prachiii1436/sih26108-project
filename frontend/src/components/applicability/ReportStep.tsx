import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  FileText,
  MessageSquare,
  Printer,
  ShieldCheck,
  XCircle,
} from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { InlineNotice } from '@/components/ui/Panel';
import { STATUS_HEADLINE, StatusPill } from './statusLook';
import { downloadReport, type ReportDecision } from '@/lib/report';
import {
  STATUS_LABEL,
  STATUS_ORDER,
  type ApplicabilityResponse,
  type ApplicabilityStatus,
  type Assessment,
} from '@/types/applicability';

export type Decision = 'accepted' | 'rejected' | 'modified';
export type ReportStage = 'summary' | 'review' | 'report';

interface ReportStepProps {
  result: ApplicabilityResponse;
  stage: ReportStage;
  onStage: (stage: ReportStage) => void;
  decisions: Record<string, Decision>;
  notes: Record<string, string>;
  busy: boolean;
  error: string | null;
  savedCount: number;
  onDecision: (standardId: string, decision: Decision) => void;
  onNote: (standardId: string, note: string) => void;
  onSubmitReviews: () => void;
  onBack: () => void;
}

const DECISION_LABEL: Record<Decision, string> = {
  accepted: 'Accepted',
  rejected: 'Rejected',
  modified: 'Modified',
};

/** Step 5 - summary, officer review and the downloadable report. */
export function ReportStep({
  result,
  stage,
  onStage,
  decisions,
  notes,
  busy,
  error,
  savedCount,
  onDecision,
  onNote,
  onSubmitReviews,
  onBack,
}: ReportStepProps) {
  const decidedCount = Object.keys(decisions).length;

  return (
    <section className="mx-auto max-w-4xl">
      <SubSteps stage={stage} onStage={onStage} canReview={decidedCount > 0} canReport={savedCount > 0} />

      {stage === 'summary' ? (
        <SummaryView result={result} onBack={onBack} onReview={() => onStage('review')} />
      ) : null}

      {stage === 'review' ? (
        <ReviewView
          result={result}
          decisions={decisions}
          notes={notes}
          busy={busy}
          error={error}
          savedCount={savedCount}
          decidedCount={decidedCount}
          onDecision={onDecision}
          onNote={onNote}
          onSubmit={onSubmitReviews}
          onBack={() => onStage('summary')}
          onContinue={() => onStage('report')}
        />
      ) : null}

      {stage === 'report' ? (
        <ReportView
          result={result}
          decisions={decisions}
          notes={notes}
          onBack={() => onStage('review')}
          onRestart={onBack}
        />
      ) : null}
    </section>
  );
}

/* --------------------------------------------------------------- sub steps */

const SUB_STEPS: { id: ReportStage; label: string }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'review', label: 'Officer Review' },
  { id: 'report', label: 'Report' },
];

function SubSteps({
  stage,
  onStage,
  canReview,
  canReport,
}: {
  stage: ReportStage;
  onStage: (stage: ReportStage) => void;
  canReview: boolean;
  canReport: boolean;
}) {
  const enabled: Record<ReportStage, boolean> = {
    summary: true,
    review: canReview,
    report: canReport,
  };
  const index = SUB_STEPS.findIndex((item) => item.id === stage);

  return (
    <nav aria-label="Report progress" className="mb-5">
      <ol className="flex flex-wrap items-center gap-2">
        {SUB_STEPS.map((item, position) => {
          const active = item.id === stage;
          const reachable = enabled[item.id] || position <= index;
          return (
            <li key={item.id} className="flex items-center gap-2">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => reachable && onStage(item.id)}
                aria-current={active ? 'step' : undefined}
                className={[
                  'rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors',
                  active
                    ? 'bg-navy-900 text-white'
                    : reachable
                      ? 'bg-white text-slate-600 ring-1 ring-inset ring-slate-300 hover:bg-slate-50'
                      : 'cursor-not-allowed bg-white text-slate-300 ring-1 ring-inset ring-slate-200',
                ].join(' ')}
              >
                {item.label}
              </button>
              {position < SUB_STEPS.length - 1 ? (
                <span aria-hidden className="text-slate-300">
                  &rarr;
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ------------------------------------------------------------------ summary */

function SummaryView({
  result,
  onBack,
  onReview,
}: {
  result: ApplicabilityResponse;
  onBack: () => void;
  onReview: () => void;
}) {
  const recommended = result.candidates.filter((candidate) =>
    ['APPLICABLE', 'CONDITIONALLY_APPLICABLE', 'UNDETERMINED'].includes(candidate.status),
  );
  const others = result.candidates.length - recommended.length;

  return (
    <div>
      <header className="mb-5">
        <h1 className="text-xl font-bold tracking-tight text-navy-900">Analysis Complete</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
          {result.candidates.length} standard
          {result.candidates.length === 1 ? '' : 's'} checked against your requirement.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {STATUS_ORDER.map((status) => (
          <SummaryTile key={status} status={status} count={result.summary[status] ?? 0} />
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white shadow-card">
        <header className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">
            Recommended Standards
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Standards worth carrying into the tender, most confident first.
          </p>
        </header>

        {recommended.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">
            No standard could be confirmed. Go back and add more detail to your requirement.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {recommended.map((candidate) => (
              <li key={candidate.standard_id} className="flex flex-wrap items-start gap-3 px-5 py-4">
                <StatusPill status={candidate.status} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-navy-900">{candidate.edition}</p>
                  <p className="text-sm leading-snug text-slate-700">{candidate.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    {STATUS_HEADLINE[candidate.status]}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}

        {others > 0 ? (
          <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
            {others} further standard{others === 1 ? ' was' : 's were'} excluded, conflicting or
            superseded. They are listed in the final report.
          </p>
        ) : null}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button variant="secondary" icon={<ArrowLeft aria-hidden className="h-4 w-4" />} onClick={onBack}>
          Back to Applicability
        </Button>
        <Button
          icon={<ArrowRight aria-hidden className="h-4 w-4" />}
          onClick={onReview}
          disabled={result.candidates.length === 0}
        >
          Review Recommendations
        </Button>
      </div>
    </div>
  );
}

function SummaryTile({ status, count }: { status: ApplicabilityStatus; count: number }) {
  const bar: Record<ApplicabilityStatus, string> = {
    APPLICABLE: 'border-l-success-500',
    CONDITIONALLY_APPLICABLE: 'border-l-amber-400',
    EXCLUDED: 'border-l-red-500',
    CONFLICTING: 'border-l-red-600',
    SUPERSEDED: 'border-l-slate-400',
    UNDETERMINED: 'border-l-slate-400',
  };
  return (
    <div className={`rounded-lg border border-l-4 border-slate-200 bg-white px-3.5 py-3 shadow-card ${bar[status]}`}>
      <p className="text-2xl font-bold tabular-nums text-navy-900">{count}</p>
      <p className="mt-0.5 text-[11px] font-semibold uppercase leading-tight tracking-wide text-slate-600">
        {STATUS_LABEL[status]}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------- review */

function ReviewView({
  result,
  decisions,
  notes,
  busy,
  error,
  savedCount,
  decidedCount,
  onDecision,
  onNote,
  onSubmit,
  onBack,
  onContinue,
}: {
  result: ApplicabilityResponse;
  decisions: Record<string, Decision>;
  notes: Record<string, string>;
  busy: boolean;
  error: string | null;
  savedCount: number;
  decidedCount: number;
  onDecision: (standardId: string, decision: Decision) => void;
  onNote: (standardId: string, note: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <div>
      <header className="mb-4">
        <h1 className="text-xl font-bold tracking-tight text-navy-900">Officer Review</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
          Confirm each recommendation before the report is generated.
        </p>
      </header>

      <div className="mb-5 rounded-lg border border-brand-200 bg-brand-50 px-5 py-4">
        <p className="text-sm font-semibold italic text-brand-900">
          AI-generated recommendation. Final verification remains with the authorized procurement
          officer.
        </p>
      </div>

      <ul className="space-y-3">
        {result.candidates.map((candidate) => {
          const current = decisions[candidate.standard_id];
          return (
            <li key={candidate.standard_id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-card">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                AI Recommendation
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <StatusPill status={candidate.status} />
                <span className="text-sm font-bold text-navy-900">{candidate.edition}</span>
                <span className="min-w-0 truncate text-sm text-slate-600">{candidate.title}</span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {(['accepted', 'rejected', 'modified'] as Decision[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => onDecision(candidate.standard_id, option)}
                    aria-pressed={current === option}
                    className={[
                      'inline-flex items-center gap-1.5 rounded-md border px-3.5 py-2 text-xs font-semibold transition-colors',
                      current === option
                        ? option === 'accepted'
                          ? 'border-success-600 bg-success-50 text-success-700'
                          : option === 'rejected'
                            ? 'border-red-400 bg-red-50 text-red-700'
                            : 'border-brand-500 bg-brand-50 text-brand-800'
                        : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50',
                    ].join(' ')}
                  >
                    {option === 'accepted' ? (
                      <Check aria-hidden className="h-3.5 w-3.5" />
                    ) : option === 'rejected' ? (
                      <XCircle aria-hidden className="h-3.5 w-3.5" />
                    ) : (
                      <MessageSquare aria-hidden className="h-3.5 w-3.5" />
                    )}
                    {DECISION_LABEL[option]}
                  </button>
                ))}
              </div>

              {current ? (
                <input
                  className="input mt-3 max-w-xl"
                  placeholder="Officer note (optional) - e.g. verified against tender clause 4.2"
                  value={notes[candidate.standard_id] ?? ''}
                  onChange={(event) => onNote(candidate.standard_id, event.target.value)}
                  aria-label={`Note for ${candidate.edition}`}
                />
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="mt-5 space-y-3">
        {error ? (
          <InlineNotice tone="danger" title="Could not record the decisions">
            {error}
          </InlineNotice>
        ) : null}
        {savedCount > 0 && !error ? (
          <InlineNotice tone="success" title="Decisions recorded">
            {savedCount} decision{savedCount === 1 ? '' : 's'} saved. You can now generate the report.
          </InlineNotice>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" icon={<ArrowLeft aria-hidden className="h-4 w-4" />} onClick={onBack}>
            Back to Summary
          </Button>
          <Button
            loading={busy}
            disabled={decidedCount === 0}
            icon={<ArrowRight aria-hidden className="h-4 w-4" />}
            onClick={savedCount > 0 ? onContinue : onSubmit}
          >
            {savedCount > 0 ? 'Generate Report' : 'Record Decisions & Generate Report'}
          </Button>
          {decidedCount === 0 ? (
            <span className="text-xs text-slate-500">Select a decision for at least one standard.</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- report */

function ReportView({
  result,
  decisions,
  notes,
  onBack,
  onRestart,
}: {
  result: ApplicabilityResponse;
  decisions: Record<string, Decision>;
  notes: Record<string, string>;
  onBack: () => void;
  onRestart: () => void;
}) {
  const [saved, setSaved] = useState(false);

  const reportDecisions: Record<string, ReportDecision> = Object.fromEntries(
    Object.entries(decisions).map(([id, decision]) => [
      id,
      { decision: DECISION_LABEL[decision], note: notes[id] ?? '' },
    ]),
  );

  const generatedAt = new Date();

  return (
    <div>
      <header className="mb-5">
        <h1 className="text-xl font-bold tracking-tight text-navy-900">
          Procurement Standards Report
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
          Prepared {generatedAt.toLocaleString('en-IN')}. Review it below, then download a copy for
          the tender file.
        </p>
      </header>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
          <p className="flex items-center gap-2 text-sm font-bold text-navy-900">
            <FileText aria-hidden className="h-4 w-4 text-brand-700" />
            Procurement requirement
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">{result.specification}</p>
        </div>

        <section className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Extracted technical details
          </h2>
          <dl className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-3">
            {result.fields.map((field) => (
              <div key={field.key}>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {field.label}
                </dt>
                <dd className="text-sm font-medium text-navy-900">
                  {field.value ?? <span className="text-slate-400">Not specified</span>}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {STATUS_ORDER.map((status) => {
          const items = result.candidates.filter((candidate) => candidate.status === status);
          if (items.length === 0) return null;
          return (
            <section key={status} className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                {STATUS_LABEL[status]} standards ({items.length})
              </h2>
              <ul className="mt-3 space-y-4">
                {items.map((item) => (
                  <ReportStandard
                    key={item.standard_id}
                    assessment={item}
                    decision={decisions[item.standard_id]}
                    note={notes[item.standard_id]}
                  />
                ))}
              </ul>
            </section>
          );
        })}

        <section className="px-5 py-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Officer decisions
          </h2>
          {Object.keys(decisions).length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No decisions recorded.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {result.candidates
                .filter((candidate) => decisions[candidate.standard_id])
                .map((candidate) => (
                  <li key={candidate.standard_id} className="flex flex-wrap items-baseline gap-2 text-sm">
                    <span className="font-semibold text-navy-900">{candidate.edition}</span>
                    <span className="text-slate-500">-&gt;</span>
                    <span className="font-semibold text-slate-700">
                      {DECISION_LABEL[decisions[candidate.standard_id]]}
                    </span>
                    {notes[candidate.standard_id] ? (
                      <span className="text-xs text-slate-500">
                        ({notes[candidate.standard_id]})
                      </span>
                    ) : null}
                  </li>
                ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-slate-500">
            Generated {generatedAt.toLocaleString('en-IN')}
          </p>
        </section>
      </div>

      <div className="mt-5 rounded-lg border border-slate-200 bg-white px-5 py-4 text-xs leading-relaxed text-slate-500">
        {result.disclaimer}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          icon={<ArrowLeft aria-hidden className="h-4 w-4" />}
          onClick={onBack}
        >
          Back to Review
        </Button>
        <Button
          icon={<Download aria-hidden className="h-4 w-4" />}
          onClick={() => {
            downloadReport(result, reportDecisions);
            setSaved(true);
          }}
        >
          Download Report
        </Button>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
        >
          <Printer aria-hidden className="h-3.5 w-3.5" />
          Print
        </button>
        <button
          type="button"
          onClick={onRestart}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
        >
          <ShieldCheck aria-hidden className="h-3.5 w-3.5" />
          Start a new analysis
        </button>
      </div>

      {saved ? (
        <p className="mt-3 text-xs font-semibold text-success-700">
          Report downloaded. Attach it to the tender file.
        </p>
      ) : null}
    </div>
  );
}

function ReportStandard({
  assessment,
  decision,
  note,
}: {
  assessment: Assessment;
  decision?: Decision;
  note?: string;
}) {
  return (
    <li className="rounded-lg border border-slate-200 px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={assessment.status} />
        <span className="text-sm font-bold text-navy-900">{assessment.edition}</span>
      </div>
      <p className="mt-1 text-sm text-slate-700">{assessment.title}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{assessment.reason}</p>

      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        {assessment.checks.map((check, index) => (
          <li key={`${check.dimension}-${index}`}>
            <span className="font-medium text-slate-600">{check.label}:</span>{' '}
            {check.result === 'match'
              ? 'Match'
              : check.result === 'missing'
                ? 'Not stated'
                : check.result === 'excluded'
                  ? 'Excluded'
                  : 'Conflict'}
          </li>
        ))}
      </ul>

      {assessment.versions.length > 0 ? (
        <p className="mt-2 text-xs text-slate-500">
          <span className="font-semibold text-slate-600">Versions:</span>{' '}
          {assessment.versions.map((version) => `${version.edition} (${version.status})`).join(' · ')}
        </p>
      ) : null}

      {assessment.related.length > 0 ? (
        <p className="mt-1 text-xs text-slate-500">
          <span className="font-semibold text-slate-600">Related:</span>{' '}
          {assessment.related.map((item) => `${item.relationship} -> ${item.edition}`).join(' · ')}
        </p>
      ) : null}

      <p className="mt-2 text-xs font-semibold text-slate-700">
        Officer decision:{' '}
        {decision ? (
          <>
            {DECISION_LABEL[decision]}
            {note ? <span className="font-normal text-slate-500"> - {note}</span> : null}
          </>
        ) : (
          <span className="font-normal text-slate-400">pending</span>
        )}
      </p>
    </li>
  );
}
