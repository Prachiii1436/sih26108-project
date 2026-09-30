/** Shared formatting helpers so scores and dates read identically everywhere. */

export function formatScore(value: number | null | undefined, fractionDigits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '--';
  return `${value.toFixed(fractionDigits)}%`;
}

export type RelevanceTone = 'high' | 'moderate' | 'low' | 'none';

/** Map a 0-100 score onto the three-band labels the backend also emits. */
export function scoreTone(score: number | null | undefined): RelevanceTone {
  if (score === null || score === undefined) return 'none';
  if (score >= 70) return 'high';
  if (score >= 45) return 'moderate';
  if (score > 0) return 'low';
  return 'none';
}

export const TONE_STYLES: Record<
  RelevanceTone,
  { text: string; bg: string; ring: string; stroke: string; bar: string }
> = {
  high: {
    text: 'text-success-700',
    bg: 'bg-success-50',
    ring: 'ring-success-200',
    stroke: '#16a34a',
    bar: '#16a34a',
  },
  moderate: {
    text: 'text-brand-700',
    bg: 'bg-brand-50',
    ring: 'ring-brand-200',
    stroke: '#2563eb',
    bar: '#2563eb',
  },
  low: {
    text: 'text-amber-700',
    bg: 'bg-amber-50',
    ring: 'ring-amber-200',
    stroke: '#d97706',
    bar: '#d97706',
  },
  none: {
    text: 'text-slate-500',
    bg: 'bg-slate-100',
    ring: 'ring-slate-200',
    stroke: '#94a3b8',
    bar: '#94a3b8',
  },
};

export function formatDate(value: string | null | undefined): string {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: '2-digit' });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelative(value: string | null | undefined): string {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.round(diffMs / 60_000);
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes} min ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  return formatDate(value);
}

export function formatMs(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '--';
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(value < 10_000 ? 2 : 1)} s`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '--';
  return value.toLocaleString('en-IN');
}

export function formatPercent(value: number | null | undefined, fractionDigits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '--';
  return `${(value * 100).toFixed(fractionDigits)}%`;
}

/** Read a value out of a loose analytics bucket regardless of key casing. */
export function bucketValue(
  bucket: Record<string, string | number | null> | undefined,
  ...keys: string[]
): string | number | null {
  if (!bucket) return null;
  for (const key of keys) {
    if (key in bucket) return bucket[key];
  }
  for (const key of Object.keys(bucket)) {
    const lower = key.toLowerCase();
    if (keys.some((candidate) => candidate.toLowerCase() === lower)) return bucket[key];
  }
  return null;
}

export function bucketLabel(
  bucket: Record<string, string | number | null> | undefined,
  ...keys: string[]
): string {
  const value = bucketValue(bucket, ...keys);
  if (value === null || value === undefined) return 'Unspecified';
  return String(value);
}

export function bucketNumber(
  bucket: Record<string, string | number | null> | undefined,
  ...keys: string[]
): number {
  const value = bucketValue(bucket, ...keys);
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function truncate(value: string, max = 160): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}...`;
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}
