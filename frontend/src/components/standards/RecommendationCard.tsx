import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bookmark,
  BookmarkCheck,
  Check,
  ChevronDown,
  Columns3,
  Eye,
  Lightbulb,
  Minus,
  TriangleAlert,
} from 'lucide-react';

import { Badge, SampleDataBadge, ScoreBadge, SectorBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { MatchFactorBar, MatchScoreGauge, ScoreMethodNote } from '@/components/standards/MatchScore';
import { useSavedStandards } from '@/context/SavedStandardsContext';
import { formatScore, scoreTone, TONE_STYLES } from '@/lib/format';
import type { Recommendation } from '@/types/api';

interface Props {
  recommendation: Recommendation;
  queryId?: number | null;
  defaultExpanded?: boolean;
}

export function RecommendationCard({ recommendation, queryId, defaultExpanded = false }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const { isSaved, toggleSave, isInCompare, toggleCompare } = useSavedStandards();

  const { standard, factors, evidence } = recommendation;
  const saved = isSaved(standard.id);
  const inCompare = isInCompare(standard.id);
  const tone = TONE_STYLES[scoreTone(recommendation.match_score)];

  const matched = evidence?.matched_requirements ?? [];
  const gaps = evidence?.gaps ?? [];

  const handleSave = async () => {
    setSaving(true);
    try {
      await toggleSave(standard, { queryId });
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="card overflow-hidden transition-shadow hover:shadow-panel">
      <div className="flex flex-col gap-4 p-5 lg:flex-row">
        {/* Rank + score */}
        <div className="flex items-center gap-4 lg:w-52 lg:shrink-0 lg:flex-col lg:items-center lg:gap-2">
          <div className="flex items-center gap-2">
            <span
              aria-label={`Rank ${recommendation.rank}`}
              className={`flex h-8 w-8 items-center justify-center rounded-md text-sm font-bold ${tone.bg} ${tone.text} ring-1 ring-inset ${tone.ring}`}
            >
              #{recommendation.rank}
            </span>
            <span className="lg:hidden">
              <ScoreBadge score={recommendation.match_score} label={recommendation.relevance_label} />
            </span>
          </div>
          <div className="hidden lg:block">
            <MatchScoreGauge
              score={recommendation.match_score}
              size={116}
              thickness={10}
              label={recommendation.relevance_label}
            />
          </div>
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold text-brand-800">{standard.is_number}</span>
            {standard.is_demonstration ? <SampleDataBadge /> : null}
            {standard.status && standard.status !== 'Active' ? (
              <Badge tone="neutral">{standard.status}</Badge>
            ) : null}
          </div>

          <h3 className="mt-1 text-base font-semibold leading-snug text-navy-900">
            <Link
              to={`/standards/${standard.id}`}
              className="hover:text-brand-700 hover:underline underline-offset-2"
            >
              {standard.title}
            </Link>
          </h3>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <SectorBadge sector={standard.sector} />
            <Badge tone="neutral">{standard.category}</Badge>
            {standard.product ? <Badge tone="info">{standard.product}</Badge> : null}
            {standard.year ? <span className="text-xs text-slate-500">{standard.year}</span> : null}
          </div>

          {matched.length > 0 ? (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Matched requirements
              </p>
              <ul className="mt-1.5 grid gap-1 sm:grid-cols-2">
                {matched.slice(0, 6).map((item, index) => (
                  <li key={`${item}-${index}`} className="flex items-start gap-1.5 text-xs text-slate-700">
                    <Check aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success-600" />
                    <span className="min-w-0">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-3 rounded-md border-l-2 border-brand-500 bg-brand-50/60 py-2 pl-3 pr-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-900">
              <Lightbulb aria-hidden className="h-3.5 w-3.5" />
              Why this was recommended
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-700">{recommendation.reason}</p>
          </div>

          {gaps.length > 0 ? (
            <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-800">
              <TriangleAlert aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>
                <span className="font-semibold">Not covered:</span> {gaps.join('; ')}
              </span>
            </p>
          ) : null}

          {/* Expandable score breakdown */}
          {factors.length > 0 ? (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setExpanded((open) => !open)}
                aria-expanded={expanded}
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-800 hover:underline"
              >
                {expanded ? 'Hide' : 'Show'} score breakdown ({factors.length} factors)
                <ChevronDown
                  aria-hidden
                  className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
                />
              </button>

              {expanded ? (
                <div className="mt-3 grid gap-3 rounded-md bg-slate-50 p-4 sm:grid-cols-2">
                  {factors.map((factor) => (
                    <MatchFactorBar key={factor.key} factor={factor} />
                  ))}
                  <div className="sm:col-span-2">
                    <ScoreMethodNote />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Actions */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              icon={<Eye aria-hidden className="h-3.5 w-3.5" />}
              onClick={() =>
                navigate(`/standards/${standard.id}`, {
                  state: queryId ? { queryId, fromResults: true } : undefined,
                })
              }
            >
              View Details
            </Button>
            <Button
              variant={inCompare ? 'success' : 'secondary'}
              size="sm"
              icon={
                inCompare ? (
                  <Minus aria-hidden className="h-3.5 w-3.5" />
                ) : (
                  <Columns3 aria-hidden className="h-3.5 w-3.5" />
                )
              }
              onClick={() => toggleCompare(standard)}
            >
              {inCompare ? 'In comparison' : 'Compare'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              loading={saving}
              icon={
                saved ? (
                  <BookmarkCheck aria-hidden className="h-3.5 w-3.5" />
                ) : (
                  <Bookmark aria-hidden className="h-3.5 w-3.5" />
                )
              }
              onClick={handleSave}
            >
              {saved ? 'Saved' : 'Save'}
            </Button>
            <span className="ml-auto text-xs tabular-nums text-slate-500">
              Overall {formatScore(recommendation.match_score, 1)}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
