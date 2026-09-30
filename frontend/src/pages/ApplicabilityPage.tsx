import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { ApplicabilityStep } from '@/components/applicability/ApplicabilityStep';
import { RequirementStep, type RequirementInput } from '@/components/applicability/RequirementStep';
import { ReportStep, type Decision, type ReportStage } from '@/components/applicability/ReportStep';
import { ReviewStep } from '@/components/applicability/ReviewStep';
import { StandardsStep } from '@/components/applicability/StandardsStep';
import { StepRail, type WizardStep } from '@/components/applicability/StepRail';
import { useToast } from '@/components/ui/Toast';
import {
  analyzeApplicability,
  submitReview,
  type DemoPreset,
} from '@/services/applicabilityApi';
import type {
  ApplicabilityResponse,
  OfficerReview,
  UploadResponse,
} from '@/types/applicability';

const STEPS: WizardStep[] = [
  { id: 1, label: 'Requirement' },
  { id: 2, label: 'Review' },
  { id: 3, label: 'Standards' },
  { id: 4, label: 'Applicability' },
  { id: 5, label: 'Report' },
];

const INITIAL_INPUT: RequirementInput = {
  productName: '',
  description: '',
  technicalRequirements: '',
  application: '',
  fileText: null,
  fileName: null,
};

/**
 * One task per screen: Requirement -> Review -> Standards -> Applicability ->
 * Report. Every screen has a single primary action so the officer always knows
 * what to do next.
 */
export function ApplicabilityPage() {
  const { notify } = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [maxReached, setMaxReached] = useState(1);
  const [input, setInput] = useState<RequirementInput>(INITIAL_INPUT);

  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ApplicabilityResponse | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [reportStage, setReportStage] = useState<ReportStage>('summary');
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [savedCount, setSavedCount] = useState(0);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // "View Demo" on the home page hands over a ready-made specification.
  useEffect(() => {
    const state = location.state as { preset?: string } | null;
    if (!state?.preset) return;
    let cancelled = false;
    import('@/services/applicabilityApi').then(({ DEMO_PRESETS }) => {
      const preset = DEMO_PRESETS.find((item) => item.id === state.preset);
      if (preset && !cancelled) {
        applyPreset(preset);
        navigate('/applicability', { replace: true });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [location.state, navigate]);

  const goTo = useCallback((target: number) => {
    setStep(target);
    setMaxReached((current) => Math.max(current, target));
    if (target === 5) setReportStage('summary');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const buildRequirements = useCallback(
    (extra: Record<string, string> = {}) => {
      const base: Record<string, string> = {};
      if (input.application) base.application = input.application;
      return { ...base, ...overrides, ...extra };
    },
    [input.application, overrides],
  );

  const runAnalysis = useCallback(
    async (stage: 'analyze' | 'recheck', requirements: Record<string, string>) => {
      const specification = input.description.trim() || input.productName.trim();
      setBusy(true);
      setError(null);
      try {
        const response = await analyzeApplicability({
          specification,
          product_name: input.productName.trim() || null,
          technical_requirements: input.technicalRequirements.trim() || null,
          file_text: input.fileText,
          requirements: Object.keys(requirements).length > 0 ? requirements : null,
          stage,
        });
        setResult(response);
        return response;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'The analysis could not be completed.');
        return null;
      } finally {
        setBusy(false);
      }
    },
    [input],
  );

  /* ---------------------------------------------------------------- step 1 */

  function patchInput(patch: Partial<RequirementInput>) {
    setInput((current) => ({ ...current, ...patch }));
  }

  function applyPreset(preset: DemoPreset) {
    setInput({
      productName: preset.productName,
      description: preset.specification,
      technicalRequirements: preset.technicalRequirements,
      application: '',
      fileText: null,
      fileName: null,
    });
    setOverrides({});
    setAnswers({});
    setError(null);
  }

  async function handleAnalyze() {
    const response = await runAnalysis('analyze', buildRequirements());
    if (response) {
      goTo(2);
      notify({
        tone: 'success',
        title: 'Requirements extracted',
        description: `${response.fields.filter((field) => !field.missing).length} detail(s) found. Please review them.`,
      });
    }
  }

  /* ---------------------------------------------------------------- step 2 */

  async function handleFindStandards() {
    const response = await runAnalysis('recheck', buildRequirements());
    if (response) goTo(3);
  }

  /* ---------------------------------------------------------------- step 3 */

  function handleFieldOverride(key: string, value: string) {
    setOverrides((current) => ({ ...current, [key]: value }));
  }

  function clearOverrides() {
    setOverrides({});
    setAnswers({});
  }

  /* ---------------------------------------------------------------- step 4 */

  async function handleAnswer(dimension: string, value: string) {
    const nextAnswers = { ...answers, [dimension]: value };
    const nextOverrides = { ...overrides, [dimension]: value };
    setAnswers(nextAnswers);
    setOverrides(nextOverrides);

    const response = await runAnalysis('recheck', buildRequirements(nextOverrides));
    if (response) {
      const stillOpen = response.clarifications.filter((item) => !nextAnswers[item.dimension]).length;
      notify({
        tone: 'success',
        title: 'Applicability re-checked',
        description:
          stillOpen > 0
            ? `${value} recorded - ${stillOpen} question(s) still open.`
            : `${value} recorded - the results are now up to date.`,
      });
    }
  }

  /* ---------------------------------------------------------------- step 5 */

  async function handleReviewSubmit() {
    if (!result) return;
    const pending = result.candidates.filter((candidate) => decisions[candidate.standard_id]);
    if (pending.length === 0) return;

    setReviewBusy(true);
    setReviewError(null);
    try {
      const recorded: OfficerReview[] = [];
      for (const candidate of pending) {
        recorded.push(
          await submitReview({
            standard_id: candidate.standard_id,
            is_number: candidate.is_number,
            edition: candidate.edition,
            reported_status: candidate.status,
            decision: decisions[candidate.standard_id],
            note: notes[candidate.standard_id] || null,
            specification: result.specification,
            requirements: Object.fromEntries(
              Object.entries(result.requirements)
                .filter(([, field]) => field.value)
                .map(([key, field]) => [key, field.value as string]),
            ),
          }),
        );
      }
      setSavedCount(recorded.length);
      setReportStage('report');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      notify({
        tone: 'success',
        title: 'Decisions recorded',
        description: `${recorded.length} decision(s) saved. Your report is ready.`,
      });
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Could not record the decisions.');
    } finally {
      setReviewBusy(false);
    }
  }

  /* ------------------------------------------------------------------ view */

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <StepRail steps={STEPS} current={step} maxReached={maxReached} onJump={goTo} />

      {busy ? (
        <div
          className="mb-5 h-1.5 overflow-hidden rounded-full bg-slate-200"
          role="status"
          aria-label="Working"
        >
          <div className="h-full w-1/3 animate-progress-indeterminate rounded-full bg-brand-600" />
        </div>
      ) : null}

      {step === 1 ? (
        <RequirementStep
          input={input}
          busy={busy}
          error={error}
          onChange={patchInput}
          onFileText={(upload: UploadResponse | null) =>
            patchInput({ fileText: upload?.text ?? null, fileName: upload?.filename ?? null })
          }
          onPreset={applyPreset}
          onAnalyze={handleAnalyze}
        />
      ) : null}

      {step === 2 && result ? (
        <ReviewStep
          result={result}
          overrides={overrides}
          busy={busy}
          onOverride={handleFieldOverride}
          onClearOverrides={clearOverrides}
          onBack={() => goTo(1)}
          onContinue={handleFindStandards}
        />
      ) : null}

      {step === 3 && result ? (
        <StandardsStep result={result} onBack={() => goTo(2)} onContinue={() => goTo(4)} />
      ) : null}

      {step === 4 && result ? (
        <ApplicabilityStep
          result={result}
          answers={answers}
          busy={busy}
          onAnswer={handleAnswer}
          onBack={() => goTo(3)}
          onContinue={() => goTo(5)}
        />
      ) : null}

      {step === 5 && result ? (
        <ReportStep
          result={result}
          stage={reportStage}
          onStage={(stage) => {
            setReportStage(stage);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          decisions={decisions}
          notes={notes}
          busy={reviewBusy}
          error={reviewError}
          savedCount={savedCount}
          onDecision={(standardId, decision) =>
            setDecisions((current) => ({ ...current, [standardId]: decision }))
          }
          onNote={(standardId, note) => setNotes((current) => ({ ...current, [standardId]: note }))}
          onSubmitReviews={handleReviewSubmit}
          onBack={() => goTo(4)}
        />
      ) : null}

      {step > 1 && !result ? (
        <p className="py-10 text-center text-sm text-slate-500">
          No analysis is loaded yet. Start a new analysis to continue.
        </p>
      ) : null}
    </div>
  );
}

export default ApplicabilityPage;
