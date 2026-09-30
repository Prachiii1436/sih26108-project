import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info, Loader2 } from 'lucide-react';

type Tone = 'info' | 'warning' | 'success' | 'danger';

const TONES: Record<Tone, { wrap: string; icon: string }> = {
  info: { wrap: 'border-primary-200 bg-primary-50 text-primary-900', icon: 'text-primary-600' },
  warning: { wrap: 'border-warn-200 bg-warn-50 text-warn-800', icon: 'text-warn-600' },
  success: { wrap: 'border-ok-200 bg-ok-50 text-ok-800', icon: 'text-ok-600' },
  danger: { wrap: 'border-stop-200 bg-stop-50 text-stop-800', icon: 'text-stop-600' },
};

const ICONS: Record<Tone, ReactNode> = {
  info: <Info aria-hidden className="h-4 w-4" />,
  warning: <AlertCircle aria-hidden className="h-4 w-4" />,
  success: <CheckCircle2 aria-hidden className="h-4 w-4" />,
  danger: <AlertCircle aria-hidden className="h-4 w-4" />,
};

/** A short, friendly message. Never used for stack traces or raw API output. */
export function Notice({
  tone = 'info',
  title,
  children,
  className = '',
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const styles = TONES[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : undefined}
      className={[
        'flex gap-3 rounded-xl border px-4 py-3.5 text-sm leading-relaxed',
        styles.wrap,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className={`mt-0.5 shrink-0 ${styles.icon}`}>{ICONS[tone]}</span>
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={title ? 'mt-1' : ''}>{children}</div> : null}
      </div>
    </div>
  );
}

/** Busy indicator with a plain-English label of what is happening. */
export function Working({ label }: { label: string }) {
  return (
    <div
      role="status"
      className="flex flex-col items-center gap-3 rounded-2xl border border-ink-200 bg-white px-6 py-12 text-center shadow-card"
    >
      <Loader2 aria-hidden className="h-6 w-6 animate-spin text-primary-600" />
      <p className="text-sm font-medium text-ink-700">{label}</p>
    </div>
  );
}

/** Nothing to show, said in one friendly line. */
export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-ink-300 bg-ink-50 px-4 py-6 text-center text-sm text-ink-500">
      {children}
    </p>
  );
}
