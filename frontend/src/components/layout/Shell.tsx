import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CircleHelp, FilePlus2, Menu, ShieldCheck, X } from 'lucide-react';

/**
 * Deliberately small header: product name on the left, two actions on the
 * right. No navigation tree - the workflow itself is the navigation.
 */
export function Header() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  const items = [
    { to: '/analysis?step=1', label: 'New Analysis', icon: FilePlus2 },
    { to: '/help', label: 'Help', icon: CircleHelp },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-ink-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link
          to="/"
          className="flex min-w-0 items-center gap-2.5 rounded-lg py-1 pr-2"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-700 text-white">
            <ShieldCheck aria-hidden className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold leading-tight text-ink-900">
              IS Applicability Engine
            </span>
            <span className="hidden text-[11px] leading-tight text-ink-500 sm:block">
              Smart India Hackathon 26108
            </span>
          </span>
        </Link>

        <nav aria-label="Main" className="ml-auto hidden items-center gap-1 sm:flex">
          {items.map((item) => {
            const active =
              item.to === '/help'
                ? location.pathname === '/help'
                : location.pathname === '/analysis';
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={[
                  'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary-50 text-primary-800'
                    : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
                ].join(' ')}
              >
                <item.icon aria-hidden className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
          <span
            className="ml-2 flex h-9 w-9 items-center justify-center rounded-full bg-ink-100 text-xs font-bold text-ink-600"
            title="Procurement officer (demo session)"
            aria-label="Procurement officer, demo session"
          >
            PO
          </span>
        </nav>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? 'Close menu' : 'Open menu'}
          className="ml-auto rounded-lg p-2 text-ink-600 transition-colors hover:bg-ink-100 sm:hidden"
        >
          {open ? <X aria-hidden className="h-5 w-5" /> : <Menu aria-hidden className="h-5 w-5" />}
        </button>
      </div>

      {open ? (
        <nav
          id="mobile-menu"
          aria-label="Main"
          className="border-t border-ink-200 bg-white sm:hidden"
        >
          <ul className="mx-auto max-w-6xl px-4 py-2">
            {items.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-2.5 text-sm font-medium text-ink-700 hover:bg-ink-100"
                >
                  <item.icon aria-hidden className="h-4 w-4" />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-auto border-t border-ink-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <p className="text-xs leading-relaxed text-ink-500">
          <strong className="font-semibold text-ink-700">SIH26108 prototype.</strong>{' '}
          AI-generated recommendations only. Final verification remains with the authorized
          procurement officer. Standards records shown here are a small curated demonstration
          dataset — always confirm the current edition and any amendments with the Bureau of Indian
          Standards before issuing a tender.
        </p>
      </div>
    </footer>
  );
}
