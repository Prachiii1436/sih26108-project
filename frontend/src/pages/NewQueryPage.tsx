import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Brain, FileSearch, Info, Sparkles, Zap } from 'lucide-react';

import { SpecificationForm } from '@/components/analysis/SpecificationForm';
import { ExtractedRequirementsPanel } from '@/components/standards/ExtractedRequirementsPanel';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, InlineNotice, PageTitle } from '@/components/ui/Panel';
import { useToast } from '@/components/ui/Toast';
import { analyze, extractOnly, type ApiError } from '@/services/api';
import { formatPercent } from '@/lib/format';
import type { AnalyzeRequest, ExtractedRequirements } from '@/types/api';

/**
 * Two-step flow: (1) run the fast extraction stage to preview what the engine
 * understood, letting the officer correct it before committing; (2) run the
 * full recommendation pipeline.
 */
export function NewQueryPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const [specification, setSpecification] = useState('');
  const [topK, setTopK] = useState(5);
  const [hints, setHints] = useState<{
    quantity?: string;
    material?: string;
    application?: string;
    sector?: string;
  }>({});

  const [preview, setPreview] = useState<ExtractedRequirements | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const buildPayload = (): AnalyzeRequest => ({
    specification: specification.trim(),
    top_k: topK,
    persist: true,
    use_extraction: true,
    quantity: hints.quantity?.trim() || null,
    material: hints.material?.trim() || null,
    application: hints.application?.trim() || null,
    sector: hints.sector?.trim() || null,
  });

  const runExtraction = async () => {
    setIsExtracting(true);
    setError(null);
    try {
      const response = await extractOnly(buildPayload());
      setPreview(response.extraction);
      toast.success(
        'Requirements extracted',
        `Product: ${response.extraction.product ?? 'not detected'} · confidence ${formatPercent(response.extraction.confidence)}`,
      );
    } catch (caught) {
      const apiError = caught as ApiError;
      setError(apiError);
      toast.error('Extraction failed', apiError.message);
    } finally {
      setIsExtracting(false);
    }
  };

  const runFullAnalysis = async () => {
    setIsAnalyzing(true);
    setError(null);
    try {
      const result = await analyze(buildPayload());
      if (result.recommendations.length === 0) {
        toast.info('No sufficiently relevant standard found', 'Add more technical detail or use the Standards Explorer.');
      } else {
        toast.success(
          `${result.recommendations.length} standards ranked`,
          `Top match ${result.recommendations[0].standard.is_number} at ${result.recommendations[0].match_score.toFixed(0)}%.`,
        );
      }
      navigate(`/analysis/${result.query_id}`, { state: { result } });
    } catch (caught) {
      const apiError = caught as ApiError;
      setError(apiError);
      toast.error('Analysis failed', apiError.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const isBusy = isExtracting || isAnalyzing;
  const canRun = specification.trim().length >= 15;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <PageTitle
        title="New Procurement Query"
        description="Describe what you need to buy. The engine extracts the requirements, searches the standards knowledge base and ranks the most relevant Indian Standards."
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <SpecificationForm
            value={specification}
            onChange={setSpecification}
            onSubmit={runFullAnalysis}
            isLoading={isBusy}
            advanced={hints}
            onAdvancedChange={(patch) => setHints((current) => ({ ...current, ...patch }))}
            topK={topK}
            onTopKChange={setTopK}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              loading={isExtracting}
              disabled={!canRun || isBusy}
              onClick={runExtraction}
              icon={<Brain aria-hidden className="h-4 w-4" />}
            >
              Preview extraction only
            </Button>
            <Button
              loading={isAnalyzing}
              disabled={!canRun || isBusy}
              onClick={runFullAnalysis}
              icon={<Sparkles aria-hidden className="h-4 w-4" />}
            >
              Run full analysis
            </Button>
            <span className="text-xs text-slate-500">
              {topK} result{topK === 1 ? '' : 's'} requested
            </span>
          </div>

          {error ? (
            <InlineNotice tone="danger" title="Request rejected">
              <p>{error.message}</p>
              {error.fieldErrors().length > 0 ? (
                <ul className="mt-1 list-disc pl-4">
                  {error.fieldErrors().map((field) => (
                    <li key={field.field}>
                      <span className="font-semibold">{field.field}</span>: {field.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </InlineNotice>
          ) : null}

          {preview ? (
            <ExtractedRequirementsPanel
              extraction={preview}
              onReanalyze={async (edited) => {
                setPreview(edited);
                toast.info('Requirements updated', 'Run the full analysis to rank standards with these values.');
              }}
              isReanalyzing={false}
            />
          ) : null}
        </div>

        {/* Guidance rail */}
        <aside className="space-y-4">
          <Card>
            <CardHeader
              title="How to write a good specification"
              icon={<FileSearch aria-hidden className="h-4 w-4" />}
            />
            <div className="p-5">
              <ol className="space-y-3">
                {[
                  {
                    title: 'Name the product precisely',
                    text: '"Safety helmet" matches better than "head protection device".',
                  },
                  {
                    title: 'State the application',
                    text: 'Where and who will use it — construction, hospital, agricultural field.',
                  },
                  {
                    title: 'List the required properties',
                    text: 'Impact and penetration protection, flame retardancy, food-grade contact.',
                  },
                  {
                    title: 'Include the material',
                    text: 'HDPE, XLPE copper, Portland cement — material is a strong ranking signal.',
                  },
                  {
                    title: 'Add quantity and standards context',
                    text: 'Quantities and any referenced standard number sharpen the match.',
                  },
                ].map((tip, index) => (
                  <li key={tip.title} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800">{tip.title}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{tip.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </Card>

          <Card>
            <CardHeader title="What the engine does" icon={<Zap aria-hidden className="h-4 w-4" />} />
            <div className="space-y-3 p-5">
              <div>
                <Badge tone="brand">Step 1</Badge>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                  Text normalisation, tokenisation and stop-word handling.
                </p>
              </div>
              <div>
                <Badge tone="brand">Step 2</Badge>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                  Entity and requirement extraction: product, material, application, sector, quantity and
                  typed technical / safety / performance requirements.
                </p>
              </div>
              <div>
                <Badge tone="brand">Step 3</Badge>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                  Sentence-Transformers embedding of the query and cosine retrieval over the vector index.
                </p>
              </div>
              <div>
                <Badge tone="brand">Step 4</Badge>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                  Weighted six-factor scoring, ranking, and a plain-English explanation per standard.
                </p>
              </div>
            </div>
          </Card>

          <InlineNotice tone="info" title="Not an official BIS system" icon={<Info aria-hidden className="h-3.5 w-3.5" />}>
            Results come from a demonstration dataset and a similarity algorithm. They narrow the
            field for human review — they never certify, approve or declare that a standard applies.
          </InlineNotice>
        </aside>
      </div>
    </div>
  );
}
