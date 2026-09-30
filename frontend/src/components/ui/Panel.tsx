import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react';

import { Button } from './Button';

/* --------------------------------------------------------------- surfaces */

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function CardHeader({
  title,
  icon,
  actions,
  subtitle,
}: {
  title: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <header className="card-header">
      <div className="min-w-0">
        <h2 className="card-title">
          {icon}
          <span className="truncate">{title}</span>
        </h2>
        {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function CardBody({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`p-5 ${className}`}>{children}</div>;
}

/* ------------------------------------------------------------------ state */

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={`animate-spin text-brand-600 ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function LoadingState({ label = 'Loading...', hint }: { label?: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center" role="status">
      <Spinner className="h-7 w-7" />
      <p className="text-sm font-medium text-slate-700">{label}</p>
      {hint ? <p className="max-w-md text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function SkeletonRows({ rows = 4, className = '' }: { rows?: number; className?: string }) {
  return (
    <div className={`space-y-3 p-5 ${className}`} aria-hidden>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="animate-pulse rounded-md border border-slate-200 bg-slate-50 p-4">
          <div className="h-3 w-1/3 rounded bg-slate-200" />
          <div className="mt-2.5 h-2.5 w-2/3 rounded bg-slate-200/80" />
          <div className="mt-2 h-2.5 w-1/2 rounded bg-slate-200/60" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  message,
  icon,
  action,
}: {
  title: string;
  message?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        {icon ?? <Inbox aria-hidden className="h-6 w-6" />}
      </div>
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      {message ? <div className="max-w-lg text-sm leading-relaxed text-slate-600">{message}</div> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  compact = false,
}: {
  title?: string;
  message?: ReactNode;
  onRetry?: () => void;
  compact?: boolean;
}) {
  return (
    <div
      role="alert"
      className={`flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 text-red-900 ${
        compact ? 'p-3' : 'p-5'
      }`}
    >
      <AlertTriangle aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        {message ? <div className="mt-1 text-sm leading-relaxed text-red-800">{message}</div> : null}
        {onRetry ? (
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={onRetry}
            icon={<RefreshCw aria-hidden className="h-3.5 w-3.5" />}
          >
            Retry
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function InlineNotice({
  tone = 'info',
  title,
  children,
  icon,
}: {
  tone?: 'info' | 'warning' | 'success' | 'danger' | 'neutral';
  title?: ReactNode;
  children?: ReactNode;
  icon?: ReactNode;
}) {
  const tones = {
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    success: 'border-success-200 bg-success-50 text-success-700',
    danger: 'border-red-200 bg-red-50 text-red-900',
    neutral: 'border-slate-200 bg-slate-50 text-slate-700',
  } as const;
  return (
    <div className={`rounded-md border px-3.5 py-3 text-xs leading-relaxed ${tones[tone]}`}>
      {title ? <p className="text-sm font-semibold">{title}</p> : null}
      {children ? <div className={title ? 'mt-1' : ''}>{children}</div> : null}
      {icon ? <span className="sr-only">{icon}</span> : null}
    </div>
  );
}

/* ------------------------------------------------------------- definition */

export function DefinitionItem({
  label,
  children,
  className = '',
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-800">{children}</dd>
    </div>
  );
}

export function PageTitle({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-navy-900 sm:text-2xl">{title}</h1>
        {description ? (
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-600">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
