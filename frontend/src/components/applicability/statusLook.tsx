import type { ReactNode } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  Check,
  CheckCircle2,
  Circle,
  HelpCircle,
  History,
  MinusCircle,
  X,
  XCircle,
} from 'lucide-react';

import { STATUS_LABEL, type ApplicabilityStatus, type Assessment, type CheckResult } from '@/types/applicability';

/** Restrained colour system. Colour never carries meaning alone - the text label always shows too. */
export const STATUS_TONE: Record<ApplicabilityStatus, { dot: string; chip: string; border: string; text: string }> = {
  APPLICABLE: {
    dot: 'bg-success-600',
    chip: 'bg-success-50 text-success-700 ring-success-200',
    border: 'border-l-success-500',
    text: 'text-success-700',
  },
  CONDITIONALLY_APPLICABLE: {
    dot: 'bg-amber-500',
    chip: 'bg-amber-50 text-amber-800 ring-amber-200',
    border: 'border-l-amber-400',
    text: 'text-amber-800',
  },
  EXCLUDED: {
    dot: 'bg-red-500',
    chip: 'bg-red-50 text-red-700 ring-red-200',
    border: 'border-l-red-500',
    text: 'text-red-700',
  },
  CONFLICTING: {
    dot: 'bg-red-600',
    chip: 'bg-red-50 text-red-700 ring-red-200',
    border: 'border-l-red-600',
    text: 'text-red-700',
  },
  SUPERSEDED: {
    dot: 'bg-slate-400',
    chip: 'bg-slate-100 text-slate-600 ring-slate-200',
    border: 'border-l-slate-400',
    text: 'text-slate-600',
  },
  UNDETERMINED: {
    dot: 'bg-slate-500',
    chip: 'bg-slate-100 text-slate-700 ring-slate-300',
    border: 'border-l-slate-400',
    text: 'text-slate-700',
  },
};

const STATUS_ICON: Record<ApplicabilityStatus, ReactNode> = {
  APPLICABLE: <CheckCircle2 aria-hidden className="h-3.5 w-3.5" />,
  CONDITIONALLY_APPLICABLE: <AlertTriangle aria-hidden className="h-3.5 w-3.5" />,
  EXCLUDED: <XCircle aria-hidden className="h-3.5 w-3.5" />,
  SUPERSEDED: <History aria-hidden className="h-3.5 w-3.5" />,
  CONFLICTING: <AlertOctagon aria-hidden className="h-3.5 w-3.5" />,
  UNDETERMINED: <HelpCircle aria-hidden className="h-3.5 w-3.5" />,
};

/** Uppercase status label + icon. Always shows the word, never just a colour. */
export function StatusPill({ status, className = '' }: { status: ApplicabilityStatus; className?: string }) {
  const tone = STATUS_TONE[status];
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-bold uppercase tracking-wide ring-1 ring-inset',
        tone.chip,
        className,
      ].join(' ')}
    >
      {STATUS_ICON[status]}
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Short, human sentence shown directly under the status pill. */
export const STATUS_HEADLINE: Record<ApplicabilityStatus, string> = {
  APPLICABLE: 'All required conditions match.',
  CONDITIONALLY_APPLICABLE: 'One important condition still needs confirmation.',
  EXCLUDED: 'The requirement is outside this standard\u2019s scope.',
  CONFLICTING: 'One requirement conflicts with a condition of this standard.',
  SUPERSEDED: 'This edition has been replaced by a newer one.',
  UNDETERMINED: 'One detail is required before this can be decided.',
};

/* ------------------------------------------------------- search match strength */

export type MatchStrength = 'Strong Match' | 'Partial Match' | 'Needs Verification';

export const MATCH_META: Record<MatchStrength, { className: string; hint: string }> = {
  'Strong Match': {
    className: 'bg-brand-50 text-brand-800 ring-brand-200',
    hint: 'Closely matches the product and description you entered.',
  },
  'Partial Match': {
    className: 'bg-slate-100 text-slate-700 ring-slate-200',
    hint: 'Related to the product, but not a close match on every detail.',
  },
  'Needs Verification': {
    className: 'bg-white text-slate-500 ring-slate-300',
    hint: 'Weakly related - open the record and verify it yourself.',
  },
};

/**
 * Search strength only. This describes how close the *search* was - it never
 * says whether the standard applies (that is the Applicability step).
 */
export function matchStrength(assessment: Assessment): MatchStrength {
  const familyHit = assessment.why_selected.some((reason) =>
    reason.includes('is listed inside this standard'),
  );
  const score = assessment.retrieval_score;
  if (score >= 0.9 || (familyHit && score >= 0.75)) return 'Strong Match';
  if (score >= 0.6 || familyHit) return 'Partial Match';
  return 'Needs Verification';
}

export function MatchStrengthBadge({ assessment }: { assessment: Assessment }) {
  const strength = matchStrength(assessment);
  return (
    <span
      title={MATCH_META[strength].hint}
      className={`inline-flex items-center rounded px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${MATCH_META[strength].className}`}
    >
      {strength}
    </span>
  );
}

/* --------------------------------------------------------------- condition rows */

export const CHECK_META: Record<CheckResult, { symbol: JSX.Element; label: string; className: string }> = {
  match: { symbol: <Check aria-hidden className="h-4 w-4" />, label: 'Match', className: 'text-success-700' },
  missing: { symbol: <HelpCircle aria-hidden className="h-4 w-4" />, label: 'Not stated', className: 'text-amber-700' },
  mismatch: { symbol: <X aria-hidden className="h-4 w-4" />, label: 'Conflict', className: 'text-red-700' },
  excluded: { symbol: <X aria-hidden className="h-4 w-4" />, label: 'Excluded', className: 'text-red-700' },
};

export function CheckSymbol({ result, className = '' }: { result: CheckResult; className?: string }) {
  if (result === 'match') {
    return <CheckCircle2 aria-hidden className={`h-4 w-4 shrink-0 text-success-600 ${className}`} />;
  }
  if (result === 'missing') {
    return <MinusCircle aria-hidden className={`h-4 w-4 shrink-0 text-amber-500 ${className}`} />;
  }
  return <XCircle aria-hidden className={`h-4 w-4 shrink-0 text-red-500 ${className}`} />;
}

/** Grey dot used for the "undetermined" summary tile. */
export function UndeterminedDot() {
  return <Circle aria-hidden className="h-3.5 w-3.5 fill-slate-400 text-slate-400" />;
}
