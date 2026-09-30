import { useEffect } from 'react';
import {
  BookOpen,
  Check,
  ExternalLink,
  GitBranch,
  History,
  Minus,
  X,
} from 'lucide-react';

import { StatusPill } from '@/components/ui/StatusPill';
import { CHECK_META, STATUS_META, TONE_CLASSES } from '@/lib/status';
import type { Assessment } from '@/lib/types';

interface WhyPanelProps {
  assessment: Assessment | null;
  onClose: () => void;
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-ink-500">
        <span className="text-ink-400">{icon}</span>
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * The explanation drawer.
 *
 * Answers three questions in a fixed order: why was this standard found, how
 * does each requirement compare with the standard's own condition, and what
 * evidence, version and related standards sit behind that.
 */
export function WhyPanel({ assessment, onClose }: WhyPanelProps) {
  useEffect(() => {
    if (!assessment) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [assessment, onClose]);

  if (!assessment) return null;
  const a = assessment;
  const supporting = a.checks.filter((row) => row.result === 'match');
  const against = a.checks.filter((row) => row.result !== 'match');
  const verdictTone = TONE_CLASSES[STATUS_META[a.status].tone];

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        aria-label="Close explanation"
        onClick={onClose}
        className="absolute inset-0 bg-ink-900/40 backdrop-blur-[1px]"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Explanation for ${a.edition}`}
        className="relative flex h-full w-full max-w-xl animate-slide-in flex-col bg-white shadow-panel"
      >
        <header className="flex items-start gap-3 border-b border-ink-200 px-5 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <StatusPill status={a.status} size="sm" />
            <h2 className="mt-2 text-lg font-bold leading-snug text-ink-900">{a.edition}</h2>
            <p className="mt-0.5 text-sm text-ink-600">{a.title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close explanation"
            className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
          >
            <X aria-hidden className="h-5 w-5" />
          </button>
        </header>

        <div className="scroll-slim flex-1 space-y-7 overflow-y-auto px-5 py-6 sm:px-6">
          {/* ---------------------------------------------------- the verdict */}
          <div
            className={`rounded-xl border px-4 py-3.5 ${verdictTone.soft} ${verdictTone.border}`}
          >
            <p className="text-[15px] font-semibold leading-snug text-ink-900">{a.reason}</p>
            {a.why_not_applicable ? (
              <p className="mt-2.5 text-sm leading-relaxed text-ink-700">
                <span className="font-semibold">Why it was not recommended: </span>
                {a.why_not_applicable}
              </p>
            ) : null}
          </div>

          {/* -------------------------------------- why it was selected */}
          <Section icon={<BookOpen className="h-3.5 w-3.5" />} title="Why this standard was selected">
            <ul className="space-y-1.5">
              {a.why_selected.map((line, index) => (
                <li key={index} className="flex gap-2.5 text-sm leading-relaxed text-ink-700">
                  <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </Section>

          {/* ---------------------------------------------- condition check */}
          <Section icon={<Minus className="h-3.5 w-3.5" />} title="Evidence — your requirement vs the standard">
            <ul className="space-y-2">
              {a.checks.map((row, index) => {
                const meta = CHECK_META[row.result];
                const tone = TONE_CLASSES[meta.tone];
                return (
                  <li
                    key={`${row.dimension}-${index}`}
                    className="rounded-xl border border-ink-200 bg-ink-50/60 px-3.5 py-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={[
                          'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                          tone.soft,
                          tone.text,
                        ].join(' ')}
                        aria-hidden
                      >
                        {meta.symbol}
                      </span>
                      <span className="text-sm font-semibold text-ink-900">{row.label}</span>
                      <span className={`text-xs font-semibold ${tone.text}`}>{meta.label}</span>
                    </div>

                    <dl className="mt-2.5 space-y-1 pl-7 text-sm">
                      <div className="flex gap-2">
                        <dt className="w-28 shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-500">
                          Your requirement
                        </dt>
                        <dd className="min-w-0 text-ink-800">
                          {row.requirement_value || <span className="text-warn-700">not stated</span>}
                        </dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="w-28 shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-500">
                          Standard says
                        </dt>
                        <dd className="min-w-0 text-ink-800">{row.standard_condition}</dd>
                      </div>
                      {row.clause ? (
                        <div className="flex gap-2">
                          <dt className="w-28 shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-500">
                            Clause
                          </dt>
                          <dd className="min-w-0 text-ink-600">{row.clause}</dd>
                        </div>
                      ) : null}
                      {row.detail ? (
                        <div className="flex gap-2">
                          <dt className="w-28 shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-500">
                            Result
                          </dt>
                          <dd className="min-w-0 text-ink-600">{row.detail}</dd>
                        </div>
                      ) : null}
                    </dl>
                  </li>
                );
              })}
            </ul>

            {a.scope ? (
              <p className="mt-3 rounded-xl border border-ink-200 px-3.5 py-3 text-sm leading-relaxed text-ink-600">
                <span className="font-semibold text-ink-800">Scope of the standard: </span>
                {a.scope}
              </p>
            ) : null}
          </Section>

          {/* ------------------------------------------------- clause text */}
          {a.evidence.length > 0 ? (
            <Section icon={<BookOpen className="h-3.5 w-3.5" />} title="Clause text">
              <ul className="space-y-2">
                {a.evidence.map((item, index) => (
                  <li key={index} className="rounded-xl border border-ink-200 px-3.5 py-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-primary-700">
                      {item.clause}
                    </p>
                    <p className="mt-1 text-sm italic leading-relaxed text-ink-700">“{item.text}”</p>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {/* ------------------------------------------------- version info */}
          {a.versions.length > 0 ? (
            <Section icon={<History className="h-3.5 w-3.5" />} title="Version">
              <ul className="space-y-1.5">
                {a.versions.map((version) => {
                  const isCurrent = !/superseded|withdrawn/i.test(version.status);
                  return (
                    <li
                      key={version.edition}
                      className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 text-sm"
                    >
                      <span
                        className={[
                          'font-semibold',
                          isCurrent ? 'text-ink-900' : 'text-ink-500 line-through',
                        ].join(' ')}
                      >
                        {version.edition}
                      </span>
                      <span
                        className={[
                          'rounded px-1.5 py-0.5 text-[11px] font-semibold',
                          isCurrent
                            ? 'bg-ok-50 text-ok-800'
                            : 'bg-ink-100 text-ink-500',
                        ].join(' ')}
                      >
                        {isCurrent ? 'Current in prototype database' : 'Superseded'}
                      </span>
                      {version.note ? (
                        <span className="w-full text-xs text-ink-500">{version.note}</span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </Section>
          ) : null}

          {/* -------------------------------------------- related standards */}
          {a.related.length > 0 ? (
            <Section icon={<GitBranch className="h-3.5 w-3.5" />} title="Related standards">
              <ul className="space-y-1.5">
                {a.related.map((item) => (
                  <li
                    key={`${item.edition}-${item.relationship}`}
                    className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
                  >
                    <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[11px] font-semibold text-ink-600">
                      {item.relationship}
                    </span>
                    <span className="text-sm font-semibold text-ink-800">{item.edition}</span>
                    <span className="w-full text-xs text-ink-500">{item.title}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2.5 text-xs leading-relaxed text-ink-500">
                A related standard is not automatically applicable. Each one has to be checked on its
                own.
              </p>
            </Section>
          ) : null}
        </div>

        <footer className="flex flex-wrap items-center gap-2.5 border-t border-ink-200 bg-ink-50 px-5 py-3.5 text-xs text-ink-500 sm:px-6">
          <span className="inline-flex items-center gap-1.5">
            <Minus aria-hidden className="h-3.5 w-3.5" />
            {supporting.length} condition{supporting.length === 1 ? '' : 's'} supported
          </span>
          {against.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-stop-700">
              <X aria-hidden className="h-3.5 w-3.5" />
              {against.length} not satisfied
            </span>
          ) : null}
          <a
            href="https://www.bis.gov.in"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1.5 font-semibold text-primary-700 hover:underline"
          >
            Verify on bis.gov.in
            <ExternalLink aria-hidden className="h-3 w-3" />
          </a>
        </footer>
      </aside>
    </div>
  );
}
