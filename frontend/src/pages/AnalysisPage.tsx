import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { Working } from '@/components/ui/Notice';
import { ApplicabilityStep } from '@/components/workflow/ApplicabilityStep';
import { EMPTY_INPUT, RequirementStep, type RequirementInput } from '@/components/workflow/RequirementStep';
import { ReportStep } from '@/components/workflow/ReportStep';
import { ReviewStep } from '@/components/workflow/ReviewStep';
import { StandardsStep } from '@/components/workflow/StandardsStep';
import { StepIndicator } from '@/components/workflow/StepIndicator';
import { WhyPanel } from '@/components/workflow/WhyPanel';
import { runAnalysis, submitReview } from '@/lib/analysisApi';
import { downloadReport } from '@/lib/report';
import type { AnalysisResult, Assessment, Decision } from '@/lib/types';
import type { OfficerDecision } from '@/components/workflow/OfficerReview';

const LAST_STEP = 5;
const STORAGE_KEY = 'sih26108.analysis.v2';

interface PersistedState {
  step: number;
  maxReached: number;
  input: RequirementInput;
  result: AnalysisResult | null;
  edits: Record<string, string>;
  answers: Record<string, string>;
  decisions: Record<string, OfficerDecision>;
}

function loadPersisted(): Partial<PersistedState> {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<PersistedState>) : {};
  } catch {
    return {};
  }
}

function clampStep(step: number, maxReached: number): number {
  return Math.min(Math.max(step, 1), Math.max(1, Math.min(maxReached, LAST_STEP)));
}

/**
 * The guided workflow.
 *
 * One screen, one task, one main action — the five steps share this page and a
 * single result object. `POST /api/applicability/analyze` already returns the
 * extracted requirements, the candidates and the completed applicability check,
 * so each step reads its own slice rather than re-querying the server. Officer
 * edits and clarification answers are sent back as overrides, which re-runs the
 * check from the extraction stage.
 */
export function AnalysisPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const saved = useRef(loadPersisted()).current;

  const [step, setStep] = useState<number>(() => {
    const requested = Number(searchParams.get('step'));
    return Number.isFinite(requested) && requested > 0
      ? clampStep(requested, saved.maxReached ?? 1)
      : clampStep(saved.step ?? 1, saved.maxReached ?? 1);
  });
  const [maxReached, setMaxReached] = useState<number>(saved.maxReached ?? 1);
  const [input, setInput] = useState<RequirementInput>(saved.input ?? EMPTY_INPUT);
  const [result, setResult] = useState<AnalysisResult | null>(saved.result ?? null);
  const [edits, setEdits] = useState<Record<string, string>>(saved.edits ?? {});
  const [answers, setAnswers] = useState<Record<string, string>>(saved.answers ?? {});
  const [decisions, setDecisions] = useState<Record<string, OfficerDecision>>(
    saved.decisions ?? {},
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [explain, setExplain] = useState<Assessment | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);

  /* ------------------------------------------------- step + URL in sync */

  useEffect(() => {
    const current = searchParams.get('step');
    if (current !== String(step)) {
      setSearchParams({ step: String(step) }, { replace: true });
    }
    // Only re-run when the step itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  /* ------------------------------------- survive a refresh mid-demo */

  useEffect(() => {
    const payload: PersistedState = { step, maxReached, input, result, edits, answers, decisions };
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* storage full or unavailable - the wizard still works without it */
    }
  }, [step, maxReached, input, result, edits, answers, decisions]);

  /* ------------------------------------------------------ overrides */

  /** Officer edits and clarification answers both override the parser. */
  const overrides = useMemo<Record<string, string>>(
    () => ({
      ...edits,
      ...answers,
      ...(input.application ? { application: input.application } : {}),
    }),
    [edits, answers, input.application],
  );

  const goTo = useCallback(
    (target: number) => {
      setStep(target);
      setMaxReached((current) => Math.max(current, target));
    },
    [],
  );

  function patchInput(patch: Partial<RequirementInput>) {
    setInput((current) => ({ ...current, ...patch }));
  }

  const analyse = useCallback(
    async (overridesToSend: Record<string, string>, stage: 'analyze' | 'recheck') => {
      setBusy(true);
      setError(null);
      try {
        const response = await runAnalysis({
          specification: input.specification.trim(),
          product_name: input.productName.trim() || null,
          technical_requirements: input.technicalRequirements.trim() || null,
          file_text: input.fileText,
          requirements: Object.keys(overridesToSend).length > 0 ? overridesToSend : null,
          stage,
        });
        setResult(response);
        return response;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'The analysis could not be completed.');
        return null;
      } finally {
        setBusy(false);
      }
    },
    [input],
  );

  /* --------------------------------------------------------- actions */

  async function handleAnalyse() {
    const response = await analyse(
      input.application ? { application: input.application } : {},
      'analyze',
    );
    if (response) {
      setEdits({});
      setAnswers({});
      setDecisions({});
      setSavedCount(0);
      goTo(2);
    }
  }

  async function handleFindStandards() {
    const response = await analyse(overrides, 'recheck');
    if (response) goTo(3);
  }

  async function handleAnswer(dimension: string, value: string) {
    const nextAnswers = { ...answers, [dimension]: value };
    setAnswers(nextAnswers);
    await analyse({ ...overrides, ...nextAnswers }, 'recheck');
  }

  function handleEdit(key: string, value: string) {
    setEdits((current) => ({ ...current, [key]: value }));
  }

  function handleResetEdits() {
    setEdits({});
  }

  function handleDecide(standardId: string, decision: Decision) {
    setDecisions((current) => ({
      ...current,
      [standardId]: { decision, note: current[standardId]?.note ?? '' },
    }));
  }

  function handleNote(standardId: string, note: string) {
    setDecisions((current) => ({
      ...current,
      [standardId]: { decision: current[standardId]?.decision ?? 'modified', note },
    }));
  }

  async function handleSaveDecisions() {
    if (!result) return;
    const pending = result.candidates.filter((item) => decisions[item.standard_id]);
    if (pending.length === 0) return;

    setReviewBusy(true);
    setReviewError(null);
    try {
      for (const candidate of pending) {
        await submitReview({
          standard_id: candidate.standard_id,
          is_number: candidate.is_number,
          edition: candidate.edition,
          reported_status: candidate.status,
          decision: decisions[candidate.standard_id].decision,
          note: decisions[candidate.standard_id].note.trim() || null,
          specification: result.specification,
          requirements: Object.fromEntries(
            Object.entries(result.requirements)
              .filter(([, field]) => field.value)
              .map(([key, field]) => [key, field.value as string]),
          ),
        });
      }
      setSavedCount(pending.length);
    } catch (caught) {
      setReviewError(
        caught instanceof Error ? caught.message : 'The decisions could not be recorded.',
      );
    } finally {
      setReviewBusy(false);
    }
  }

  function handleDownload() {
    if (!result) return;
    downloadReport(result, decisions);
  }

  function handleStartOver() {
    setInput(EMPTY_INPUT);
    setResult(null);
    setEdits({});
    setAnswers({});
    setDecisions({});
    setSavedCount(0);
    setError(null);
    setMaxReached(1);
    goTo(1);
  }

  /* ---------------------------------------------------------- render */

  return (
    <>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <StepIndicator current={step} maxReached={maxReached} onJump={goTo} />

        {step === 1 ? (
          <RequirementStep
            value={input}
            busy={busy}
            error={error}
            onChange={patchInput}
            onSubmit={handleAnalyse}
          />
        ) : null}

        {step === 2 ? (
          busy && !result ? (
            <Working label="Reading your requirement…" />
          ) : result ? (
            <ReviewStep
              fields={result.fields}
              edits={edits}
              busy={busy}
              onEdit={handleEdit}
              onResetEdits={handleResetEdits}
              onBack={() => goTo(1)}
              onContinue={handleFindStandards}
            />
          ) : null
        ) : null}

        {step === 3 ? (
          result ? (
            <StandardsStep
              candidates={result.candidates}
              uiMessage={result.ui_message}
              onBack={() => goTo(2)}
              onContinue={() => goTo(4)}
            />
          ) : null
        ) : null}

        {step === 4 ? (
          result ? (
            <ApplicabilityStep
              result={result}
              answers={answers}
              busy={busy}
              onOpenWhy={setExplain}
              onAnswer={handleAnswer}
              onBack={() => goTo(3)}
              onContinue={() => goTo(5)}
            />
          ) : null
        ) : null}

        {step === 5 ? (
          result ? (
            <ReportStep
              result={result}
              decisions={decisions}
              savedCount={savedCount}
              busy={reviewBusy}
              error={reviewError}
              onDecide={handleDecide}
              onNote={handleNote}
              onSave={handleSaveDecisions}
              onDownload={handleDownload}
              onBack={() => goTo(4)}
              onOpenWhy={setExplain}
            />
          ) : null
        ) : null}

        {step > 1 && result ? (
          <div className="mt-10 flex justify-center">
            <button
              type="button"
              onClick={handleStartOver}
              className="text-sm font-semibold text-ink-500 underline underline-offset-2 transition-colors hover:text-primary-700"
            >
              Start a new analysis
            </button>
          </div>
        ) : null}
      </div>

      <WhyPanel assessment={explain} onClose={() => setExplain(null)} />
    </>
  );
}
