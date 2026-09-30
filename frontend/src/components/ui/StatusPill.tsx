import type { ReactNode } from 'react';

import { STATUS_META, TONE_CLASSES, type Tone } from '@/lib/status';
import type { ApplicabilityStatus } from '@/lib/types';

/** The one status chip used everywhere a decision is shown. */
export function StatusPill({
  status,
  size = 'md',
}: {
  status: ApplicabilityStatus;
  size?: 'sm' | 'md';
}) {
  const meta = STATUS_META[status];
  const tone = TONE_CLASSES[meta.tone];

  return (
    <span
      className={[
        'inline-flex shrink-0 items-center gap-1.5 rounded-full font-semibold uppercase tracking-wide ring-1 ring-inset',
        size === 'sm' ? 'px-2.5 py-0.5 text-[11px]' : 'px-3 py-1 text-xs',
        tone.pill,
      ].join(' ')}
    >
      <span aria-hidden className="font-bold">
        {meta.symbol}
      </span>
      {meta.label}
    </span>
  );
}

/** Plain, quiet chip for secondary facts (sector, clause, relationship). */
export function Chip({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  const styles: Record<Tone, string> = {
    ok: 'bg-ok-50 text-ok-800 ring-ok-200',
    warn: 'bg-warn-50 text-warn-800 ring-warn-200',
    stop: 'bg-stop-50 text-stop-800 ring-stop-200',
    neutral: 'bg-ink-100 text-ink-700 ring-ink-200',
  };
  return (
    <span
      className={[
        'inline-flex max-w-full items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        styles[tone],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </span>
  );
}
