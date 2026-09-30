import type { ReactNode } from 'react';

import { scoreTone, TONE_STYLES } from '@/lib/format';

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

const TONES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  brand: 'bg-brand-50 text-brand-800 ring-brand-200',
  success: 'bg-success-50 text-success-700 ring-success-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  danger: 'bg-red-50 text-red-700 ring-red-200',
  info: 'bg-sky-50 text-sky-800 ring-sky-200',
};

export interface BadgeProps {
  children: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
  className?: string;
  title?: string;
}

export function Badge({ children, tone = 'neutral', icon, className = '', title }: BadgeProps) {
  return (
    <span
      title={title}
      className={[
        'inline-flex max-w-full items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        TONES[tone],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Coloured chip that reflects a 0-100 relevance score. */
export function ScoreBadge({ score, label }: { score: number; label?: string }) {
  const tone = TONE_STYLES[scoreTone(score)];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${tone.bg} ${tone.text} ${tone.ring}`}
    >
      {score.toFixed(0)}% match
      {label ? <span className="font-normal opacity-80">({label})</span> : null}
    </span>
  );
}

export function SectorBadge({ sector }: { sector: string }) {
  return (
    <Badge tone="brand" title={`Sector: ${sector}`}>
      {sector}
    </Badge>
  );
}

/** Marks a record as demonstration data, never as an official BIS listing. */
export function SampleDataBadge({ className = '' }: { className?: string }) {
  return (
    <Badge tone="warning" title="Demonstration dataset - replace with verified BIS data" className={className}>
      SAMPLE DATA
    </Badge>
  );
}

export function Dot({ tone = 'brand' }: { tone?: Tone }) {
  const colors: Record<Tone, string> = {
    neutral: 'bg-slate-400',
    brand: 'bg-brand-600',
    success: 'bg-success-600',
    warning: 'bg-amber-500',
    danger: 'bg-red-600',
    info: 'bg-sky-500',
  };
  return <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${colors[tone]}`} />;
}
