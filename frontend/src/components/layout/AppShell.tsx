import { Link } from 'react-router-dom';
import { CircleHelp, PlusCircle, ShieldCheck } from 'lucide-react';

/**
 * Deliberately small application chrome: brand on the left, the two actions a
 * procurement officer actually needs on the right. No navigation menu - the
 * product is one guided flow, not a dashboard.
 */
export function AppHeader({ onHelp }: { onHelp: () => void }) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex min-w-0 items-center gap-2.5 rounded-md py-1">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-navy-900">
            <ShieldCheck aria-hidden className="h-4.5 w-4.5 text-white" style={{ width: 18, height: 18 }} />
          </span>
          <span className="truncate text-[15px] font-semibold tracking-tight text-navy-900">
            IS Applicability Engine
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <Link
            to="/applicability"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand-700 px-3 text-sm font-semibold text-white transition-colors hover:bg-brand-800"
          >
            <PlusCircle aria-hidden className="h-4 w-4" />
            <span className="hidden sm:inline">New Analysis</span>
            <span className="sm:hidden">New</span>
          </Link>

          <button
            type="button"
            onClick={onHelp}
            className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <CircleHelp aria-hidden className="h-4 w-4" />
            Help
          </button>

          <span
            className="ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600 ring-1 ring-inset ring-slate-200"
            title="Procurement Officer - demo session"
            aria-label="Procurement Officer profile"
          >
            PO
          </span>
        </div>
      </div>
    </header>
  );
}

export function AppFooter({ onHelp }: { onHelp: () => void }) {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <p className="max-w-3xl text-xs leading-relaxed text-slate-500">
          <span className="font-semibold text-slate-700">IS Applicability Engine</span> - SIH26108
          research prototype. Recommendations are AI-assisted and are not a Bureau of Indian
          Standards certification. Verify the standard and its current edition with BIS before
          issuing a tender.
        </p>
        <div className="flex shrink-0 flex-wrap gap-5 text-xs">
          <button type="button" onClick={onHelp} className="text-slate-600 hover:text-brand-700 hover:underline">
            Help
          </button>
          <Link to="/about" className="text-slate-600 hover:text-brand-700 hover:underline">
            About &amp; methodology
          </Link>
          <Link to="/explorer" className="text-slate-600 hover:text-brand-700 hover:underline">
            Standards Explorer
          </Link>
          <a
            href="https://www.bis.gov.in"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-600 hover:text-brand-700 hover:underline"
          >
            Official BIS catalogue
          </a>
        </div>
      </div>
    </footer>
  );
}
