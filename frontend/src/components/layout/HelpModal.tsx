import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';

const STEPS = [
  { n: 1, title: 'Requirement', text: 'Tell the system what you are procuring.' },
  { n: 2, title: 'Review', text: 'Check the technical details the system extracted.' },
  { n: 3, title: 'Standards', text: 'See the Indian Standards that look relevant.' },
  { n: 4, title: 'Applicability', text: 'See which standards actually apply, and why.' },
  { n: 5, title: 'Report', text: 'Review the recommendations and generate the report.' },
];

/** Short, plain-English guide reachable from the header and footer. */
export function HelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-900/50 p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label="Help"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl animate-fade-in rounded-xl border border-slate-200 bg-white shadow-panel"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-navy-900">How this works</h2>
            <p className="mt-1 text-sm text-slate-600">
              Five short steps. You are guided through each one.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close help"
            className="-m-1 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X aria-hidden className="h-5 w-5" />
          </button>
        </header>

        <div className="space-y-6 px-6 py-5">
          <ol className="space-y-3">
            {STEPS.map((step) => (
              <li key={step.n} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600 ring-1 ring-inset ring-slate-200">
                  {step.n}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-navy-900">{step.title}</span>
                  <span className="block text-sm leading-relaxed text-slate-600">{step.text}</span>
                </span>
              </li>
            ))}
          </ol>

          <section className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3.5">
            <h3 className="text-sm font-bold text-brand-900">Relevant is not the same as applicable</h3>
            <p className="mt-1 text-sm leading-relaxed text-brand-900/80">
              The system does not simply search for similar standards. It checks each standard&apos;s
              recorded conditions and scope against your actual procurement requirement, one
              condition at a time, and explains the result in plain English.
            </p>
          </section>

          <section className="text-sm leading-relaxed text-slate-600">
            <h3 className="text-sm font-semibold text-navy-900">Need more detail?</h3>
            <p className="mt-1">
              Every result on the Applicability screen has a{' '}
              <span className="font-semibold text-slate-800">Why?</span> button that shows the exact
              conditions, the clause references and the evidence behind the decision.
            </p>
            <p className="mt-3">
              <Link
                to="/about"
                onClick={onClose}
                className="font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800"
              >
                Read the full methodology and limitations
              </Link>
            </p>
          </section>

          <p className="border-t border-slate-200 pt-4 text-xs leading-relaxed text-slate-500">
            This is a Smart India Hackathon research prototype. It is not an official Bureau of
            Indian Standards system, and its output is not a certification or compliance decision.
          </p>
        </div>
      </div>
    </div>
  );
}
