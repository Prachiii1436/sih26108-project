import { useEffect, useRef, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';

import type { PipelineStage } from '@/types/api';

/**
 * The six real stages of the pipeline. Progress advances on a timer so the
 * officer sees the work happening, and is reconciled with the server's actual
 * `pipeline` response once it lands (see `serverStages`).
 */
const DEFAULT_STAGES: { key: string; label: string; minMs: number }[] = [
  { key: 'reading', label: 'Reading specification', minMs: 420 },
  { key: 'extraction', label: 'Extracting requirements', minMs: 620 },
  { key: 'category', label: 'Identifying product category', minMs: 520 },
  { key: 'search', label: 'Searching standards', minMs: 700 },
  { key: 'scoring', label: 'Calculating relevance', minMs: 560 },
  { key: 'recommendations', label: 'Generating recommendations', minMs: 480 },
];

interface Props {
  /** Once the request resolves, show the real backend timings. */
  serverStages?: PipelineStage[];
  finished?: boolean;
  specification: string;
}

export function AnalysisPipelineLoader({ serverStages, finished = false, specification }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<number>(Date.now());
  const timerRef = useRef<number | null>(null);

  // Reset whenever a new analysis starts.
  useEffect(() => {
    startedAt.current = Date.now();
    setActiveIndex(0);
    setElapsed(0);
  }, [specification]);

  useEffect(() => {
    if (finished) return;
    const tick = () => {
      const delta = Date.now() - startedAt.current;
      setElapsed(delta);

      let accumulated = 0;
      let next = 0;
      for (let index = 0; index < DEFAULT_STAGES.length; index += 1) {
        accumulated += DEFAULT_STAGES[index].minMs;
        if (delta < accumulated) {
          next = index;
          break;
        }
        next = index + 1;
      }
      setActiveIndex(Math.min(next, DEFAULT_STAGES.length - 1));
    };

    tick();
    timerRef.current = window.setInterval(tick, 120);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [finished, specification]);

  const stageDetail = new Map((serverStages ?? []).map((stage) => [stage.key, stage]));
  const visible = DEFAULT_STAGES.map((stage, index) => {
    const server = stageDetail.get(stage.key);
    const done = finished || server?.status === 'completed' || index < activeIndex;
    return {
      key: stage.key,
      label: server?.label ?? stage.label,
      detail: server?.detail ?? undefined,
      duration: server?.duration_ms ?? undefined,
      state: done ? ('done' as const) : index === activeIndex ? ('active' as const) : ('pending' as const),
    };
  });

  return (
    <div className="card" role="status" aria-live="polite">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <Loader2 aria-hidden className="h-5 w-5 animate-spin text-brand-600" />
          <h2 className="text-sm font-semibold text-navy-900">Analyzing procurement specification...</h2>
        </div>
        <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-brand-600 transition-[width] duration-200 ease-out"
            style={{ width: `${Math.min(100, (elapsed / 3300) * 100)}%` }}
          />
        </div>
      </div>

      <ol className="divide-y divide-slate-100">
        {visible.map((stage) => (
          <li key={stage.key} className="flex items-start gap-3 px-5 py-3">
            <span
              aria-hidden
              className={[
                'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                stage.state === 'done'
                  ? 'bg-success-600 text-white'
                  : stage.state === 'active'
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-200 text-slate-400',
              ].join(' ')}
            >
              {stage.state === 'done' ? (
                <Check className="h-3 w-3" />
              ) : stage.state === 'active' ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
              )}
            </span>

            <div className="min-w-0 flex-1">
              <p
                className={[
                  'text-sm',
                  stage.state === 'pending' ? 'text-slate-400' : 'font-medium text-slate-800',
                ].join(' ')}
              >
                {stage.state === 'done' ? '✓ ' : ''}
                {stage.label}
              </p>
              {stage.detail ? (
                <p className="mt-0.5 break-words text-xs text-slate-500">{stage.detail}</p>
              ) : null}
            </div>

            {stage.duration !== undefined && stage.duration !== null ? (
              <span className="shrink-0 text-xs tabular-nums text-slate-400">
                {stage.duration.toFixed(0)} ms
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
