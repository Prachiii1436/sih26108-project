import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, CircleHelp, ListChecks } from 'lucide-react';

import { Button } from '@/components/ui/Button';

const FLOW = [
  { n: '1', title: 'Requirement', text: 'Describe what you are procuring, or upload the tender document.' },
  { n: '2', title: 'Review', text: 'Check the technical details the system extracted from your text.' },
  { n: '3', title: 'Standards', text: 'See the Indian Standards that look relevant to the product.' },
  { n: '4', title: 'Applicability', text: 'See which standards apply, which do not, and the reason why.' },
  { n: '5', title: 'Report', text: 'Confirm the recommendations and download the procurement report.' },
];

export function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      {/* Hero ------------------------------------------------------------- */}
      <section className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-700">
          SIH26108 &middot; Procurement standards assistant
        </p>
        <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-navy-900 sm:text-4xl">
          Indian Standards Applicability Engine
        </h1>
        <p className="mt-3 text-base leading-relaxed text-slate-600 sm:text-lg">
          AI-assisted identification of applicable Indian Standards for procurement specifications.
        </p>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-600">
          Enter a procurement requirement and let the system identify relevant standards, check
          their applicability, and explain the result.
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            onClick={() => navigate('/applicability')}
            icon={<ArrowRight aria-hidden className="h-4 w-4" />}
          >
            Start New Analysis
          </Button>
          <button
            type="button"
            onClick={() =>
              navigate('/applicability', {
                state: { preset: 'heater-full' },
              })
            }
            className="inline-flex h-12 items-center gap-1.5 rounded-md px-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <CircleHelp aria-hidden className="h-4 w-4" />
            View Demo
          </button>
        </div>
      </section>

      {/* Central message --------------------------------------------------- */}
      <section className="mt-12 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-center">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded bg-slate-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-600 ring-1 ring-inset ring-slate-200">
              <ListChecks aria-hidden className="h-3.5 w-3.5" />
              The core idea
            </span>
            <p className="mt-4 text-3xl font-bold tracking-tight text-navy-900 sm:text-4xl">
              Relevant <span className="text-brand-700">&ne;</span> Applicable
            </p>
          </div>
          <p className="text-sm leading-relaxed text-slate-600 sm:text-base">
            Our AI does not simply search for similar standards. It checks the standard&apos;s
            conditions and scope against the actual procurement requirement &mdash; and then tells
            you, in plain English, why a standard applies, why it does not, and what information is
            still missing.
          </p>
        </div>
      </section>

      {/* Flow -------------------------------------------------------------- */}
      <section className="mt-10">
        <h2 className="text-base font-semibold text-navy-900">How the analysis works</h2>
        <p className="mt-1 text-sm text-slate-600">
          One task per screen. You always know where you are and what to do next.
        </p>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {FLOW.map((step) => (
            <li key={step.n} className="rounded-lg border border-slate-200 bg-white p-4 shadow-card">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-navy-900 text-xs font-bold text-white">
                {step.n}
              </span>
              <h3 className="mt-3 text-sm font-semibold text-navy-900">{step.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Footnote ---------------------------------------------------------- */}
      <section className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-5 py-4">
        <p className="max-w-3xl text-xs leading-relaxed text-slate-500">
          This prototype supports the officer&apos;s judgement &mdash; it does not replace it.
          Always confirm the applicable standard, its current edition and any mandatory
          certification with the Bureau of Indian Standards before finalising a tender.
        </p>
        <Link
          to="/about"
          className="shrink-0 text-xs font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800"
        >
          About this prototype
        </Link>
      </section>
    </div>
  );
}
