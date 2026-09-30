import { ArrowLeft, Download, FileText, ScrollText } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Chip, StatusPill } from '@/components/ui/StatusPill';
import { OfficerReview, type OfficerDecision } from '@/components/workflow/OfficerReview';
import { RelevanceIsNotApplicability } from '@/components/workflow/RelevanceIsNotApplicability';
import { STATUS_META, TONE_CLASSES, isRecommended } from '@/lib/status';
import { STATUS_ORDER, type AnalysisResult, type ApplicabilityStatus, type Assessment, type Decision } from '@/lib/types';

interface ReportStepProps {
  result: AnalysisResult;
  decisions: Record<string, OfficerDecision>;
  savedCount: number;
  busy: boolean;
  error: string | null;
  onDecide: (standardId: string, decision: Decision) => void;
  onNote: (standardId: string, note: string) => void;
  onSave: () => void;
  onDownload: () => void;
  onBack: () => void;
  onOpenWhy: (assessment: Assessment) => void;
}

function formatStamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function GroupList({
  status,
  items,
  onOpenWhy,
}: {
  status: ApplicabilityStatus;
  items: Assessment[];
  onOpenWhy: (assessment: Assessment) => void;
}) {
  const meta = STATUS_META[status];
  const tone = TONE_CLASSES[meta.tone];

  return (
    <section className="card overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <StatusPill status={status} size="sm" />
          <span className="text-sm font-semibold text-ink-700">
            {items.length} standard{items.length === 1 ? '' : 's'}
          </span>
        </div>
      </header>
      <ul className="divide-y divide-ink-100">
        {items.map((item) => (
          <li key={item.standard_id} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-3.5">
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-ink-900">{item.edition}</p>
              <p className="mt-0.5 text-sm text-ink-600">{item.title}</p>
              <p className={`mt-1.5 text-sm leading-relaxed ${tone.text}`}>{item.reason}</p>
            </div>
            <button
              type="button"
              onClick={() => onOpenWhy(item)}
              className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-primary-700 transition-colors hover:bg-primary-50"
            >
              Why?
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Step 5 - the result, the officer's decision on it, and the file it produces.
 *
 * Deliberately one scroll: counts, what to use, what not to use, then the report.
 */
export function ReportStep({
  result,
  decisions,
  savedCount,
  busy,
  error,
  onDecide,
  onNote,
  onSave,
  onDownload,
  onBack,
  onOpenWhy,
}: ReportStepProps) {
  const counts = STATUS_ORDER.map((status) => ({
    status,
    count: result.summary[status] ?? 0,
  })).filter((entry) => entry.count > 0);

  const recommended = result.candidates.filter((c) => isRecommended(c.status));
  const otherGroups = STATUS_ORDER.filter((status) => !isRecommended(status))
    .map((status) => ({
      status,
      items: result.candidates.filter((c) => c.status === status),
    }))
    .filter((group) => group.items.length > 0);

  const answeredFields = result.fields.filter((field) => !field.missing);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">Analysis Complete</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-600">
          {result.candidates.length} standard{result.candidates.length === 1 ? '' : 's'} checked
          against your requirement. {recommended.length} can be used, and each decision below is
          explained.
        </p>
      </header>

      {/* --------------------------------------------------------- counts */}
      <ul className="grid gap-2.5 sm:grid-cols-3">
        {counts.map(({ status, count }) => {
          const meta = STATUS_META[status];
          const tone = TONE_CLASSES[meta.tone];
          return (
            <li
              key={status}
              className={`rounded-2xl border px-4 py-3.5 ${tone.border} ${tone.soft}`}
            >
              <p className={`text-xs font-bold uppercase tracking-wide ${tone.text}`}>
                {meta.label}
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-ink-900">{count}</p>
            </li>
          );
        })}
      </ul>

      {/* ------------------------------------------------ recommended list */}
      <section aria-labelledby="recommended-heading">
        <h2 id="recommended-heading" className="text-lg font-bold tracking-tight text-ink-900">
          Recommended Standards
        </h2>
        <p className="mt-1 text-sm text-ink-600">
          These are the standards you can quote in this tender.
        </p>
        <div className="mt-4">
          {recommended.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-ink-300 bg-ink-50 px-4 py-6 text-center text-sm text-ink-500">
              No standard reached Applicable or Conditionally Applicable for this requirement.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {recommended.map((item) => {
                const decision = decisions[item.standard_id];
                return (
                  <li
                    key={item.standard_id}
                    className="card flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5"
                  >
                    <StatusPill status={item.status} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold text-ink-900">{item.edition}</p>
                      <p className="text-sm text-ink-600">{item.title}</p>
                    </div>
                    {decision ? (
                      <Chip tone="neutral">
                        {decision.decision === 'accepted'
                          ? 'Accepted'
                          : decision.decision === 'rejected'
                            ? 'Rejected'
                            : 'Modified'}
                      </Chip>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onOpenWhy(item)}
                      className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-primary-700 transition-colors hover:bg-primary-50"
                    >
                      Why?
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* --------------------------------------------------- other results */}
      {otherGroups.length > 0 ? (
        <section aria-labelledby="other-heading" className="space-y-3.5">
          <div>
            <h2 id="other-heading" className="text-lg font-bold tracking-tight text-ink-900">
              Everything else we checked
            </h2>
            <p className="mt-1 text-sm text-ink-600">
              Kept in the file so the tender record shows what was considered and why it was set
              aside.
            </p>
          </div>
          {otherGroups.map((group) => (
            <GroupList
              key={group.status}
              status={group.status}
              items={group.items}
              onOpenWhy={onOpenWhy}
            />
          ))}
        </section>
      ) : null}

      {/* ---------------------------------------------------- officer review */}
      <OfficerReview
        recommendations={recommended}
        decisions={decisions}
        savedCount={savedCount}
        busy={busy}
        error={error}
        onDecide={onDecide}
        onNote={onNote}
        onSave={onSave}
        onBack={onBack}
        onDownload={onDownload}
      />

      {/* ---------------------------------------------------- report preview */}
      <section aria-labelledby="report-heading" className="card overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 px-5 py-4">
          <div className="min-w-0">
            <h2 id="report-heading" className="flex items-center gap-2 text-lg font-bold text-ink-900">
              <ScrollText aria-hidden className="h-5 w-5 text-primary-600" />
              Procurement Standards Report
            </h2>
            <p className="mt-1 text-sm text-ink-500">
              Generated {formatStamp(result.created_at)} · {result.knowledge_base.size} records
              checked
            </p>
          </div>
          <Button onClick={onDownload} icon={<Download aria-hidden className="h-4 w-4" />}>
            Download Report
          </Button>
        </header>

        <div className="space-y-6 px-5 py-5">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-ink-500">
              Procurement requirement
            </h3>
            <p className="report-body mt-1.5">{result.specification}</p>
            {result.product_name ? (
              <p className="report-body mt-1 text-ink-500">Product: {result.product_name}</p>
            ) : null}
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-ink-500">
              Extracted technical details
            </h3>
            <dl className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-3">
              {answeredFields.map((field) => (
                <div key={field.key}>
                  <dt className="text-xs font-semibold text-ink-500">{field.label}</dt>
                  <dd className="text-sm font-medium text-ink-900">{field.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-ink-500">
              Officer decisions
            </h3>
            {recommended.length === 0 ? (
              <p className="report-body mt-1.5 text-ink-500">No recommendation required a decision.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {recommended.map((item) => {
                  const decision = decisions[item.standard_id];
                  return (
                    <li key={item.standard_id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                      <span className="font-semibold text-ink-900">{item.edition}</span>
                      <span className="text-ink-600">
                        {decision
                          ? decision.decision === 'accepted'
                            ? 'Accepted'
                            : decision.decision === 'rejected'
                              ? 'Rejected'
                              : 'Modified'
                          : 'Awaiting decision'}
                      </span>
                      {decision?.note ? (
                        <span className="w-full text-xs text-ink-500">“{decision.note}”</span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <p className="flex items-start gap-2 rounded-xl border border-ink-200 bg-ink-50 px-4 py-3 text-xs leading-relaxed text-ink-500">
            <FileText aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            The downloaded report also carries the per-condition evidence, the clause references, the
            version information and the related standards for every standard listed above.
          </p>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t border-ink-200 pt-6">
        <Button variant="secondary" icon={<ArrowLeft aria-hidden className="h-4 w-4" />} onClick={onBack}>
          Back to Applicability
        </Button>
      </div>

      <RelevanceIsNotApplicability
        variant="inline"
        className="rounded-xl border border-ink-200 bg-white px-4 py-3"
      />
    </div>
  );
}
