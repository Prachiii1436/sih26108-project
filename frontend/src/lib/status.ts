/**
 * Status vocabulary for the whole UI.
 *
 * Every status is shown as text first, colour second, so the interface stays
 * readable without relying on colour perception.
 */
import type { ApplicabilityStatus, CheckResult } from './types';

export type Tone = 'ok' | 'warn' | 'stop' | 'neutral';

export interface StatusMeta {
  /** Short label used on cards and in the summary. */
  label: string;
  /** The word the officer should read to understand the decision. */
  short: string;
  tone: Tone;
  /** One-line plain-English meaning of the decision. */
  meaning: string;
  /** Symbol shown next to the label; never the only signal. */
  symbol: string;
}

export const STATUS_META: Record<ApplicabilityStatus, StatusMeta> = {
  APPLICABLE: {
    label: 'Applicable',
    short: 'All required conditions match.',
    tone: 'ok',
    meaning: 'Every condition recorded for this standard is satisfied by your requirement.',
    symbol: '✓',
  },
  CONDITIONALLY_APPLICABLE: {
    label: 'Conditionally Applicable',
    short: 'Applies, with one condition still to confirm.',
    tone: 'warn',
    meaning: 'The important conditions match, but one detail still needs confirming.',
    symbol: '!',
  },
  EXCLUDED: {
    label: 'Excluded',
    short: 'The requirement is outside this standard’s scope.',
    tone: 'stop',
    meaning: 'This standard is related, but its scope does not cover your requirement.',
    symbol: '✕',
  },
  CONFLICTING: {
    label: 'Conflicting',
    short: 'A stated value does not meet the recorded condition.',
    tone: 'stop',
    meaning: 'The standard is relevant, but your stated value breaks one of its conditions.',
    symbol: '✕',
  },
  SUPERSEDED: {
    label: 'Superseded',
    short: 'A newer edition has replaced this one.',
    tone: 'neutral',
    meaning: 'Do not quote this edition. Use the current edition listed in Version information.',
    symbol: '↑',
  },
  UNDETERMINED: {
    label: 'Undetermined',
    short: 'One required detail is missing.',
    tone: 'neutral',
    meaning: 'The system will not guess. Answer the question and the result is re-checked.',
    symbol: '?',
  },
};

/** Tailwind class sets per tone, so no component has to know the palette. */
export const TONE_CLASSES: Record<
  Tone,
  { pill: string; dot: string; left: string; soft: string; text: string; border: string }
> = {
  ok: {
    pill: 'bg-ok-50 text-ok-800 ring-ok-200',
    dot: 'bg-ok-600',
    left: 'border-l-ok-600',
    soft: 'bg-ok-50',
    text: 'text-ok-700',
    border: 'border-ok-200',
  },
  warn: {
    pill: 'bg-warn-50 text-warn-800 ring-warn-200',
    dot: 'bg-warn-600',
    left: 'border-l-warn-500',
    soft: 'bg-warn-50',
    text: 'text-warn-700',
    border: 'border-warn-200',
  },
  stop: {
    pill: 'bg-stop-50 text-stop-800 ring-stop-200',
    dot: 'bg-stop-600',
    left: 'border-l-stop-600',
    soft: 'bg-stop-50',
    text: 'text-stop-700',
    border: 'border-stop-200',
  },
  neutral: {
    pill: 'bg-ink-100 text-ink-700 ring-ink-200',
    dot: 'bg-ink-400',
    left: 'border-l-ink-400',
    soft: 'bg-ink-100',
    text: 'text-ink-600',
    border: 'border-ink-200',
  },
};

export interface CheckMeta {
  symbol: string;
  label: string;
  tone: Tone;
}

export const CHECK_META: Record<CheckResult, CheckMeta> = {
  match: { symbol: '✓', label: 'Match', tone: 'ok' },
  mismatch: { symbol: '✕', label: 'Conflict', tone: 'stop' },
  missing: { symbol: '?', label: 'Missing', tone: 'warn' },
  excluded: { symbol: '✕', label: 'Outside scope', tone: 'stop' },
};

/** Statuses that end up in the officer's recommended list. */
export const RECOMMENDED_STATUSES: ApplicabilityStatus[] = [
  'APPLICABLE',
  'CONDITIONALLY_APPLICABLE',
];

export function isRecommended(status: ApplicabilityStatus): boolean {
  return RECOMMENDED_STATUSES.includes(status);
}

export function countByStatus(
  candidates: { status: ApplicabilityStatus }[],
  statuses: ApplicabilityStatus[],
): number {
  return candidates.filter((candidate) => statuses.includes(candidate.status)).length;
}
