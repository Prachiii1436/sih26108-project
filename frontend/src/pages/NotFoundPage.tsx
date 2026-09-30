import { Link } from 'react-router-dom';
import { ArrowLeft, Compass, Home, Search } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Panel';

export function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-16 text-center sm:px-6">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-700">
        <Compass aria-hidden className="h-7 w-7" />
      </span>
      <p className="mt-5 font-mono text-sm font-bold text-brand-700">404</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-navy-900">Page not found</h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-600">
        That page does not exist in this application. It may have been moved, or the link may be
        incorrect.
      </p>

      <Card className="mt-6 w-full">
        <div className="p-5 text-left">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Try one of these</p>
          <ul className="mt-3 space-y-1.5">
            <li>
              <Link
                to="/"
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-brand-700 hover:bg-brand-50"
              >
                <Home aria-hidden className="h-4 w-4" />
                Home — start a procurement query
              </Link>
            </li>
            <li>
              <Link
                to="/explorer"
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-brand-700 hover:bg-brand-50"
              >
                <Search aria-hidden className="h-4 w-4" />
                Standards Explorer — browse the knowledge base
              </Link>
            </li>
            <li>
              <Link
                to="/history"
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-brand-700 hover:bg-brand-50"
              >
                <ArrowLeft aria-hidden className="h-4 w-4" />
                Search History — re-open a previous analysis
              </Link>
            </li>
          </ul>
        </div>
      </Card>

      <div className="mt-6">
        <Link to="/">
          <Button>Back to home</Button>
        </Link>
      </div>
    </div>
  );
}
