import { useRef, useState } from 'react';
import { ArrowRight, FileText, Upload, X } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { InlineNotice } from '@/components/ui/Panel';
import { DEMO_PRESETS, type DemoPreset } from '@/services/applicabilityApi';
import type { UploadResponse } from '@/types/applicability';

export const APPLICATION_OPTIONS = [
  'Domestic',
  'Institutional',
  'Industrial',
  'Commercial',
  'Agricultural',
  'Construction',
  'Potable Water',
  'Drainage',
  'Mining',
];

export interface RequirementInput {
  productName: string;
  description: string;
  technicalRequirements: string;
  application: string;
  fileText: string | null;
  fileName: string | null;
}

interface RequirementStepProps {
  input: RequirementInput;
  busy: boolean;
  error: string | null;
  onChange: (patch: Partial<RequirementInput>) => void;
  onFileText: (upload: UploadResponse | null) => void;
  onPreset: (preset: DemoPreset) => void;
  onAnalyze: () => void;
}

const EXAMPLE =
  'Example: Procurement of a 1000 litre electric water heater operating at 230 V for an institutional building.';

/** Step 1 - one clean form: what are you procuring? */
export function RequirementStep({
  input,
  busy,
  error,
  onChange,
  onFileText,
  onPreset,
  onAnalyze,
}: RequirementStepProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadNote, setUploadNote] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    const { uploadDocument } = await import('@/services/applicabilityApi');
    setUploading(true);
    setUploadNote(null);
    try {
      const result = await uploadDocument(file);
      onFileText(result);
      setUploadNote(result.message);
    } catch (err) {
      setUploadNote(err instanceof Error ? err.message : 'The file could not be read.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const ready = (input.description.trim() || input.productName.trim()).length >= 5;

  return (
    <section className="mx-auto max-w-3xl">
      <div className="rounded-xl border border-slate-200 bg-white shadow-card">
        <header className="border-b border-slate-200 px-6 py-5">
          <h1 className="text-xl font-bold tracking-tight text-navy-900">What are you procuring?</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
            Fill in what you know. Leave anything blank if you are unsure - the system will ask you
            later only if it is needed.
          </p>
        </header>

        <div className="space-y-5 px-6 py-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Load an example
            </span>
            {DEMO_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                title={preset.hint}
                onClick={() => onPreset(preset)}
                className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-brand-500 hover:bg-brand-50 hover:text-brand-800"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div>
            <label className="label" htmlFor="product-name">
              Product Name
            </label>
            <input
              id="product-name"
              className="input"
              value={input.productName}
              onChange={(event) => onChange({ productName: event.target.value })}
              placeholder="e.g. Electric Water Heater"
            />
          </div>

          <div>
            <label className="label" htmlFor="product-description">
              Product Description
            </label>
            <textarea
              id="product-description"
              className="input min-h-[150px] resize-y leading-relaxed"
              value={input.description}
              onChange={(event) => onChange({ description: event.target.value })}
              placeholder={EXAMPLE}
            />
          </div>

          <div>
            <label className="label" htmlFor="technical-requirements">
              Technical Requirements
            </label>
            <textarea
              id="technical-requirements"
              className="input min-h-[90px] resize-y leading-relaxed"
              value={input.technicalRequirements}
              onChange={(event) => onChange({ technicalRequirements: event.target.value })}
              placeholder="e.g. Must carry the ISI mark and comply with applicable safety requirements."
            />
          </div>

          <div>
            <label className="label" htmlFor="intended-application">
              Intended Application
            </label>
            <select
              id="intended-application"
              className="select"
              value={input.application}
              onChange={(event) => onChange({ application: event.target.value })}
            >
              <option value="">Not sure yet - ask me later if needed</option>
              {APPLICATION_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className="label">Upload Tender / Specification (optional)</span>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.txt,.docx,.md,.csv,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={(event) => handleFile(event.target.files?.[0])}
            />
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3">
              <Button
                variant="secondary"
                loading={uploading}
                icon={<Upload aria-hidden className="h-4 w-4" />}
                onClick={() => fileRef.current?.click()}
              >
                Choose file
              </Button>
              <span className="text-xs text-slate-500">Supported: PDF, TXT, DOCX</span>
              {input.fileName ? (
                <span className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700">
                  <FileText aria-hidden className="h-3.5 w-3.5 text-slate-400" />
                  {input.fileName}
                  <button
                    type="button"
                    aria-label="Remove attachment"
                    onClick={() => {
                      onFileText(null);
                      setUploadNote(null);
                    }}
                    className="text-slate-400 hover:text-red-600"
                  >
                    <X aria-hidden className="h-3.5 w-3.5" />
                  </button>
                </span>
              ) : null}
            </div>
            {uploadNote ? <p className="mt-2 text-xs text-slate-500">{uploadNote}</p> : null}
          </div>

          {error ? (
            <InlineNotice tone="danger" title="Could not analyze the specification">
              {error}
            </InlineNotice>
          ) : null}
        </div>

        <footer className="border-t border-slate-200 px-6 py-5">
          <Button
            size="lg"
            loading={busy}
            disabled={!ready}
            icon={<ArrowRight aria-hidden className="h-4 w-4" />}
            onClick={onAnalyze}
          >
            Analyze Specification
          </Button>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            AI will extract the important technical requirements before checking applicable
            standards.
          </p>
        </footer>
      </div>
    </section>
  );
}
