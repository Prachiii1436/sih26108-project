import { useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  HelpCircle,
  Info,
  ListChecks,
} from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { CheckSymbol, STATUS_HEADLINE, STATUS_TONE, StatusPill } from './statusLook';
import type {
  ApplicabilityResponse,
  ApplicabilityStatus,
  Assessment,
  CheckRow,
  Clarification,
} from '@/types/applicability';

interface ApplicabilityStepProps {
  result: ApplicabilityResponse;
  answers: Record<string, string>;
  busy: boolean;
  onAnswer: (dimension: string, value: string) => void;
  onBack: () => void;
  onContinue: () => void;
}

/** Step 4 - the applicability decision for every candidate standard. */
export function ApplicabilityStep({
  result,
  answers,
  busy,
  onAnswer,
  onBack,
  onContinue,
}: ApplicabilityStepProps) {
  const open = result.clarifications.filter((item) => !answers[item.dimension]);

  return (
    <section className="mx-auto max-w-4xl">
      <header className="mb-5">
        <h1 className="text-xl font-bold tracking-tight text-navy-900">Applicability Analysis</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-600">
          Each standard has been checked condition by condition against your requirement. Open{' '}
          <span className="font-semibold text-slate-800">Why?</span> on any card to see the exact
          evidence.
        </p>
      </header>

      {open.length > 0 ? (
        <div id="missing-detail" className="mb-5 space-y-3">
          {open.map((clarification) => (
            <ClarificationCard
              key={clarification.dimension}
              clarification={clarification}
              busy={busy}
              onAnswer={onAnswer}
            />
          ))}
        </div>
      ) : null}

      {result.candidates.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white px-5 py-8 text-center">
          <p className="text-sm font-semibold text-slate-700">No standards to check</p>
          <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-slate-500">
            Go back a step and add more detail to your requirement.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {result.candidates.map((candidate) => (
            <StandardCard
              key={candidate.standard_id}
              assessment={candidate}
              hasOpenQuestion={open.some((item) =>
                candidate.checks.some(
                  (check) => check.dimension === item.dimension && check.result === 'missing',
                ),
              )}
              busy={busy}
              onAnswer={onAnswer}
            />
          ))}
        </ul>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          icon={<ArrowLeft aria-hidden className="h-4 w-4" />}
          onClick={onBack}
        >
          Back to Standards
        </Button>
        <Button
          icon={<ArrowRight aria-hidden className="h-4 w-4" />}
          onClick={onContinue}
          disabled={result.candidates.length === 0}
        >
          View Summary
        </Button>
        {open.length > 0 ? (
          <span className="text-xs font-medium text-amber-700">
            {open.length} question{open.length > 1 ? 's' : ''} still open
          </span>
        ) : null}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ clarification */

function ClarificationCard({
  clarification,
  busy,
  onAnswer,
}: {
  clarification: Clarification;
  busy: boolean;
  onAnswer: (dimension: string, value: string) => void;
}) {
  const [selected, setSelected] = useState<string>('');
  const freeText = clarification.options.length === 0;
  const [text, setText] = useState('');

  const chosen = selected || text.trim();

  return (
    <section className="rounded-xl border border-amber-300 bg-white shadow-card" aria-live="polite">
      <header className="border-b border-amber-200 bg-amber-50 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-amber-900">
              <CircleHelp aria-hidden className="h-4 w-4 text-amber-600" />
              One detail is required
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-amber-800">
              We need this information to determine whether the standard applies.
            </p>
          </div>
          <span className="inline-flex items-center rounded bg-white px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">
            {clarification.affected_standards.join(', ')}
          </span>
        </div>
      </header>

      <div className="px-5 py-4">
        <p className="text-sm font-semibold text-navy-900">{clarification.question}</p>
        {clarification.why ? (
          <p className="mt-1 text-xs leading-relaxed text-slate-500">{clarification.why}</p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {clarification.options.map((option) => (
            <button
              key={option}
              type="button"
              disabled={busy}
              onClick={() => setSelected(option)}
              className={[
                'rounded-md border px-4 py-2 text-sm font-medium transition-colors',
                selected === option
                  ? 'border-brand-700 bg-brand-700 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:border-brand-500 hover:bg-brand-50 hover:text-brand-800',
              ].join(' ')}
              aria-pressed={selected === option}
            >
              {option}
            </button>
          ))}

          {freeText ? (
            <input
              className="input max-w-[260px]"
              placeholder="Type the answer"
              value={text}
              onChange={(event) => setText(event.target.value)}
              aria-label={clarification.question}
            />
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            loading={busy}
            disabled={!chosen}
            icon={<ArrowRight aria-hidden className="h-4 w-4" />}
            onClick={() => onAnswer(clarification.dimension, chosen)}
          >
            Re-check Applicability
          </Button>
          {!chosen ? (
            <span className="text-xs text-slate-500">
              Select an option, then re-check the result.
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- card */

function StandardCard({
  assessment,
  hasOpenQuestion,
  busy,
  onAnswer,
}: {
  assessment: Assessment;
  hasOpenQuestion: boolean;
  busy: boolean;
  onAnswer: (dimension: string, value: string) => void;
}) {
  const [showWhy, setShowWhy] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [answer, setAnswer] = useState('');

  const tone = STATUS_TONE[assessment.status];
  const missingCheck = assessment.checks.find((check) => check.result === 'missing');

  const canAnswer =
    assessment.status === 'CONDITIONALLY_APPLICABLE' &&
    Boolean(missingCheck) &&
    !hasOpenQuestion;

  const action = explainAction(assessment, canAnswer, hasOpenQuestion);

  function primaryAction() {
    if (action.kind === 'scroll') {
      document.getElementById('missing-detail')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (action.kind === 'answer') {
      setAnswering((value) => !value);
      setShowWhy(false);
      return;
    }
    setShowWhy((value) => !value);
    setAnswering(false);
  }

  return (
    <li className={`overflow-hidden rounded-xl border border-l-4 border-slate-200 bg-white shadow-card ${tone.border}`}>
      <div className="px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={assessment.status} />
              <span className="text-sm font-bold text-navy-900">{assessment.edition}</span>
            </div>
            <p className="mt-1.5 text-sm leading-snug text-slate-700">{assessment.title}</p>
          </div>
          <span className="text-xs font-medium tabular-nums text-slate-400">
            {assessment.matched_count}/{assessment.conditions_total} conditions matched
          </span>
        </div>

        <div className={`mt-3 rounded-md border-l-4 px-4 py-3 ${tone.border} bg-slate-50`}>
          <p className={`text-sm font-semibold ${tone.text}`}>{STATUS_HEADLINE[assessment.status]}</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">{assessment.reason}</p>
          {assessment.status !== 'APPLICABLE' && assessment.why_not_applicable ? (
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {assessment.why_not_applicable}
            </p>
          ) : null}
        </div>

        <ul className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {assessment.checks.map((check, index) => (
            <li key={`${check.dimension}-${index}`} className="flex items-center gap-2 text-sm">
              <CheckSymbol result={check.result} />
              <span className="min-w-0 truncate font-medium text-slate-700">{check.label}</span>
              <span className={`ml-auto shrink-0 text-xs font-semibold ${checkResultClass(check.result)}`}>
                {checkResultLabel(check.result)}
              </span>
            </li>
          ))}
        </ul>

        {answering && canAnswer && missingCheck ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3.5">
            <p className="text-sm font-semibold text-amber-900">
              One detail is required: {missingCheck.label}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-amber-800">
              The standard records &ldquo;{missingCheck.standard_condition}&rdquo;
              {missingCheck.clause ? ` (${missingCheck.clause})` : ''}. We need this value to finish
              the check.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                className="input max-w-[260px] bg-white"
                placeholder="Type the value"
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                aria-label={missingCheck.label}
              />
              <Button
                size="sm"
                loading={busy}
                disabled={!answer.trim() || !missingCheck.dimension}
                onClick={() => {
                  if (!missingCheck.dimension) return;
                  onAnswer(missingCheck.dimension, answer.trim());
                  setAnswer('');
                  setAnswering(false);
                }}
              >
                Re-check Applicability
              </Button>
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={primaryAction}
            aria-expanded={showWhy}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-brand-500 hover:bg-brand-50 hover:text-brand-800"
          >
            {action.icon}
            {action.label}
            {action.kind === 'explain' ? (
              showWhy ? (
                <ChevronDown aria-hidden className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight aria-hidden className="h-3.5 w-3.5" />
              )
            ) : null}
          </button>

          <button
            type="button"
            onClick={() => setShowDetails((value) => !value)}
            aria-expanded={showDetails}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-brand-500 hover:bg-brand-50 hover:text-brand-800"
          >
            <Info aria-hidden className="h-3.5 w-3.5" />
            Version &amp; related
            {showDetails ? (
              <ChevronDown aria-hidden className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight aria-hidden className="h-3.5 w-3.5" />
            )}
          </button>
        </div>

        {showWhy ? <WhyPanel assessment={assessment} /> : null}
        {showDetails ? <DetailsPanel assessment={assessment} /> : null}
      </div>
    </li>
  );
}

/* ---------------------------------------------------------------- actions */

type Action = { kind: 'explain' | 'answer' | 'scroll'; label: string; icon: JSX.Element };

function explainAction(assessment: Assessment, canAnswer: boolean, hasOpenQuestion: boolean): Action {
  const help = <CircleHelp aria-hidden className="h-3.5 w-3.5" />;
  switch (assessment.status as ApplicabilityStatus) {
    case 'APPLICABLE':
      return { kind: 'explain', label: 'Why does it apply?', icon: help };
    case 'CONDITIONALLY_APPLICABLE':
      return canAnswer
        ? { kind: 'answer', label: 'Answer Question', icon: help }
        : { kind: 'explain', label: 'Why does it apply?', icon: help };
    case 'UNDETERMINED':
      return hasOpenQuestion
        ? { kind: 'scroll', label: 'Answer Question', icon: help }
        : { kind: 'explain', label: 'Why not applicable?', icon: help };
    case 'EXCLUDED':
      return { kind: 'explain', label: 'Why excluded?', icon: help };
    default:
      return { kind: 'explain', label: 'Why not applicable?', icon: help };
  }
}

function checkResultLabel(result: CheckRow['result']): string {
  if (result === 'match') return 'Match';
  if (result === 'missing') return 'Not stated';
  if (result === 'excluded') return 'Excluded';
  return 'Conflict';
}

function checkResultClass(result: CheckRow['result']): string {
  if (result === 'match') return 'text-success-700';
  if (result === 'missing') return 'text-amber-700';
  return 'text-red-700';
}

/* ------------------------------------------------------------------ why */

function WhyPanel({ assessment }: { assessment: Assessment }) {
  const matched = assessment.checks.filter((check) => check.result === 'match');
  const problems = assessment.checks.filter(
    (check) => check.result === 'mismatch' || check.result === 'excluded',
  );

  return (
    <div className="mt-4 animate-fade-in space-y-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
      <div>
        <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
          <ListChecks aria-hidden className="h-3.5 w-3.5" />
          Why this standard was selected
        </h4>
        <ul className="mt-2 space-y-1.5">
          {assessment.why_selected.map((reason, index) => (
            <li key={index} className="flex gap-2 text-sm leading-relaxed text-slate-700">
              <span aria-hidden className="font-bold text-success-600">
                &#10003;
              </span>
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">Evidence</h4>
        <ul className="mt-2 space-y-2">
          {assessment.checks.map((check, index) => (
            <li
              key={`${check.dimension}-${index}`}
              className="rounded-md border border-slate-200 bg-white px-3.5 py-2.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-navy-900">{check.label}</span>
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-bold ${checkResultClass(check.result)}`}
                >
                  <CheckSymbol result={check.result} className="h-3.5 w-3.5" />
                  {checkResultLabel(check.result)}
                </span>
              </div>
              <dl className="mt-1.5 grid gap-x-4 gap-y-0.5 text-xs leading-relaxed sm:grid-cols-2">
                <div>
                  <dt className="inline font-semibold text-slate-500">Requirement: </dt>
                  <dd className="inline text-slate-700">
                    {check.requirement_value ?? <span className="text-amber-700">not stated</span>}
                  </dd>
                </div>
                <div>
                  <dt className="inline font-semibold text-slate-500">Standard condition: </dt>
                  <dd className="inline text-slate-700">{check.standard_condition}</dd>
                </div>
              </dl>
              <p className="mt-1 text-[11px] text-slate-400">
                {check.clause ? `Source: ${check.clause}` : 'Source: recorded scope condition'}
                {check.detail ? ` - ${check.detail}` : ''}
              </p>
            </li>
          ))}
        </ul>
      </div>

      {assessment.status !== 'APPLICABLE' && (problems.length > 0 || assessment.why_not_applicable) ? (
        <div className="rounded-md border border-red-200 bg-white px-4 py-3.5">
          <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-red-700">
            <AlertTriangle aria-hidden className="h-3.5 w-3.5" />
            Why it was not recommended
          </h4>
          <ul className="mt-2 space-y-1.5">
            {matched.map((check, index) => (
              <li key={`ok-${index}`} className="flex gap-2 text-sm leading-relaxed text-slate-700">
                <span aria-hidden className="font-bold text-success-600">
                  &#10003;
                </span>
                <span>
                  {check.label} matches
                  {check.requirement_value ? ` (${check.requirement_value})` : ''}
                </span>
              </li>
            ))}
            {problems.map((check, index) => (
              <li key={`bad-${index}`} className="flex gap-2 text-sm leading-relaxed text-slate-700">
                <span aria-hidden className="font-bold text-red-600">
                  &#10005;
                </span>
                <span>
                  {check.label} {check.result === 'excluded' ? 'is outside the scope' : 'conflicts'}
                  {check.requirement_value ? ` - your value: ${check.requirement_value}` : ''}
                  {check.clause ? ` (${check.clause})` : ''}
                </span>
              </li>
            ))}
            {assessment.status === 'SUPERSEDED' && matched.length > 0 ? (
              <li className="flex gap-2 text-sm leading-relaxed text-slate-700">
                <span aria-hidden className="font-bold text-slate-500">
                  &#8212;
                </span>
                <span>
                  {assessment.record_status_label || assessment.record_status} - use the current
                  edition instead.
                </span>
              </li>
            ) : null}
          </ul>
          {assessment.why_not_applicable ? (
            <p className="mt-2 text-sm leading-relaxed text-slate-700">
              {assessment.why_not_applicable}
            </p>
          ) : null}
          {assessment.excluded_by.length > 0 || assessment.conflicting.length > 0 ? (
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              The standard is related to the product, but its recorded scope does not cover what is
              being procured.
            </p>
          ) : null}
        </div>
      ) : null}

      {assessment.missing_questions.length > 0 && assessment.status === 'UNDETERMINED' ? (
        <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm leading-relaxed text-amber-900">
          <HelpCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Still needed: {assessment.missing_questions.map((item) => item.label).join(', ')}. Answer
            the question above and the system will re-check this standard.
          </span>
        </div>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------- details */

function DetailsPanel({ assessment }: { assessment: Assessment }) {
  return (
    <div className="mt-4 animate-fade-in grid gap-4 lg:grid-cols-2">
      <section className="rounded-lg border border-slate-200 bg-white px-4 py-3.5">
        <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">Version</h4>
        <ul className="mt-2 space-y-1.5">
          {assessment.versions.map((version) => {
            const superseded = /superseded|withdrawn/i.test(version.status);
            return (
              <li key={version.edition} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold text-navy-900">{version.edition}</span>
                <span
                  className={[
                    'inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
                    superseded
                      ? 'bg-slate-100 text-slate-600 ring-slate-200'
                      : 'bg-success-50 text-success-700 ring-success-200',
                  ].join(' ')}
                >
                  {version.status}
                </span>
                {version.note ? (
                  <span className="w-full text-xs leading-snug text-slate-500">{version.note}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
        {assessment.versions.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No version history recorded.</p>
        ) : null}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white px-4 py-3.5">
        <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Related Standards
        </h4>
        {assessment.related.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No related standards recorded.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {assessment.related.map((item) => (
              <li
                key={`${item.edition}-${item.relationship}`}
                className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm"
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-brand-700">
                  {item.relationship}
                </span>
                <span aria-hidden className="text-slate-400">
                  &rarr;
                </span>
                <span className="font-semibold text-navy-900">{item.edition}</span>
              </li>
            ))}
          </ul>
        )}
        {assessment.related.length > 0 ? (
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            Shown with their relationship type only. A related standard is{' '}
            <span className="font-semibold">not</span> automatically applicable - each one must be
            checked on its own.
          </p>
        ) : null}
      </section>
    </div>
  );
}
