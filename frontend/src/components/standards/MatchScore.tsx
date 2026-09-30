import { useId } from 'react';
import { Info } from 'lucide-react';

import { scoreTone, TONE_STYLES } from '@/lib/format';
import type { MatchFactor } from '@/types/api';

interface GaugeProps {
  score: number;
  size?: number;
  label?: string;
  thickness?: number;
}

/**
 * Radial relevance indicator. The value comes straight from the backend's
 * scoring engine - it is explicitly framed as an algorithm score, never as a
 * certification verdict.
 */
export function MatchScoreGauge({ score, size = 132, label, thickness = 11 }: GaugeProps) {
  const gradientId = useId();
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const offset = circumference * (1 - clamped / 100);
  const tone = TONE_STYLES[scoreTone(clamped)];

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Match score ${clamped.toFixed(0)} out of 100, relevance ${label ?? 'unlabelled'}`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={tone.stroke} stopOpacity="0.75" />
            <stop offset="100%" stopColor={tone.stroke} stopOpacity="1" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={thickness}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 500ms ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-2xl font-bold tabular-nums ${tone.text}`}>{clamped.toFixed(0)}%</span>
        {label ? <span className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span> : null}
      </div>
    </div>
  );
}

/** Compact horizontal bar used in the match-factor breakdown. */
export function MatchFactorBar({ factor }: { factor: MatchFactor }) {
  const tone = TONE_STYLES[scoreTone(factor.score)];
  const id = useId();

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-xs font-medium text-slate-700" title={factor.label}>
          {factor.label}
        </span>
        <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-700">
          {factor.score.toFixed(0)}%
        </span>
      </div>
      <div
        className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200"
        role="progressbar"
        aria-valuenow={Math.round(factor.score)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={factor.label}
      >
        <div
          id={id}
          className="h-full rounded-full"
          style={{ width: `${Math.max(2, factor.score)}%`, backgroundColor: tone.bar }}
        />
      </div>
      <p className="mt-1 flex items-start gap-1 text-[11px] leading-snug text-slate-500">
        <span className="shrink-0 font-medium">weight {(factor.weight * 100).toFixed(0)}%</span>
        {factor.detail ? (
          <>
            <span aria-hidden>&middot;</span>
            <span className="min-w-0">{factor.detail}</span>
          </>
        ) : null}
      </p>
    </div>
  );
}

/** Explanation of how a match score is produced, shown wherever a score appears. */
export function ScoreMethodNote({ compact = false }: { compact?: boolean }) {
  return (
    <p
      className={`flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-500 ${
        compact ? '' : 'rounded-md bg-slate-50 p-2.5 ring-1 ring-inset ring-slate-200'
      }`}
    >
      <Info aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" />
      <span>
        This score is computed by the recommendation algorithm from weighted similarity signals
        (semantic, keyword, product, sector, requirement and application). It is not a BIS
        certification, approval or compliance result.
      </span>
    </p>
  );
}
