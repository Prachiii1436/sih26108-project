import { useRef, useState } from 'react';
import { FileUp, Sparkles, X } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { DEMO_EXAMPLES, uploadDocument, type DemoExample } from '@/lib/analysisApi';

export interface RequirementInput {
  productName: string;
  specification: string;
  technicalRequirements: string;
  application: string;
  fileText: string | null;
  fileName: string | null;
}

export const EMPTY_INPUT: RequirementInput = {
  productName: '',
  specification: '',
  technicalRequirements: '',
  application: '',
  fileText: null,
  fileName: null,
};

interface RequirementStepProps {
  value: RequirementInput;
  busy: boolean;
  error: string | null;
  onChange: (patch: Partial<RequirementInput>) => void;
  onSubmit: () => void;
}

const PLACEHOLDER =
  'Example: Procurement of a 1000 litre electric water heater operating at 230 V for an institutional building.';

const APPLICATION_OPTIONS = [
  'Domestic',
  'Institutional',
  'Industrial',
  'Commercial',
  'Agricultural',
  'Construction',
];

/**
 * Step 1 - the officer states what is being procured.
 *
 * One screen, one task: capture the requirement well enough for the system to
 * work with. Everything else the officer may know can wait.
 */
export function RequirementStep({
  value,
  busy,
  error,
  onChange,
  onSubmit,
}: RequirementStepProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const ready = value.specification.trim().length >= 10;

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setUploadNote(null);
    setUploadError(null);
    try {
      const result = await uploadDocument(file);
      onChange({ fileText: result.text, fileName: result.filename });
      setUploadNote(result.message);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'The file could not be read.');
      onChange({ fileText: null, fileName: null });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function applyExample(example: DemoExample) {
    onChange({
      productName: example.productName,
      specification: example.specification,
      technicalRequirements: example.technicalRequirements,
      application: '',
      fileText: null,
      fileName: null,
    });
    setUploadNote(null);
    setUploadError(null);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">What are you procuring?</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-600">
          Describe the requirement in your own words. Include the numbers — capacity, voltage,
          material, quantity — because the system checks those values against each standard.
        </p>
      </header>

      <div className="card overflow-hidden">
        <div className="card-pad space-y-5">
          <div>
            <label className="label" htmlFor="product-name">
              Product name
            </label>
            <input
              id="product-name"
              className="input"
              value={value.productName}
              onChange={(event) => onChange({ productName: event.target.value })}
              placeholder="Example: Electric Water Heater"
              autoComplete="off"
            />
          </div>

          <div>
            <label className="label" htmlFor="specification">
              Product description
            </label>
            <textarea
              id="specification"
              className="input min-h-[132px] resize-y"
              value={value.specification}
              onChange={(event) => onChange({ specification: event.target.value })}
              placeholder={PLACEHOLDER}
            />
            <p className="hint">Write it as you would in a tender document.</p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="technical-requirements">
                Technical requirements
              </label>
              <textarea
                id="technical-requirements"
                className="input min-h-[104px] resize-y"
                value={value.technicalRequirements}
                onChange={(event) => onChange({ technicalRequirements: event.target.value })}
                placeholder="Example: Must carry the ISI mark and meet applicable safety requirements."
              />
            </div>
            <div>
              <label className="label" htmlFor="application">
                Intended application
                <span className="ml-1.5 font-normal normal-case text-ink-400">(optional)</span>
              </label>
              <select
                id="application"
                className="input cursor-pointer"
                value={value.application}
                onChange={(event) => onChange({ application: event.target.value })}
              >
                <option value="">Not stated — let the system ask me</option>
                {APPLICATION_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <p className="hint">
                Where the product will be used. This decides scope limits, so leaving it out is
                fine — the system will ask before it decides.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-dashed border-ink-300 bg-ink-50 px-4 py-4">
            <span className="label">Upload tender / specification</span>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.docx,.txt,.md,application/pdf,text/plain"
                className="sr-only"
                onChange={(event) => handleFile(event.target.files?.[0])}
              />
              <Button
                variant="secondary"
                size="sm"
                loading={uploading}
                icon={<FileUp aria-hidden className="h-4 w-4" />}
                onClick={() => fileRef.current?.click()}
              >
                Choose a file
              </Button>
              <span className="text-xs text-ink-500">Supported: PDF, DOCX, TXT</span>
              {value.fileName ? (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-ink-700 ring-1 ring-inset ring-ink-200">
                  {value.fileName}
                  <button
                    type="button"
                    aria-label={`Remove ${value.fileName}`}
                    onClick={() => {
                      onChange({ fileText: null, fileName: null });
                      setUploadNote(null);
                    }}
                    className="text-ink-400 transition-colors hover:text-stop-600"
                  >
                    <X aria-hidden className="h-3.5 w-3.5" />
                  </button>
                </span>
              ) : null}
            </div>
            {uploadNote ? <p className="hint">{uploadNote}</p> : null}
            {uploadError ? (
              <p className="mt-2 text-xs font-medium text-stop-700">{uploadError}</p>
            ) : null}
          </div>

          {error ? <Notice tone="danger" title="We could not read the requirement">{error}</Notice> : null}

          <div className="border-t border-ink-200 pt-5">
            <Button
              size="lg"
              loading={busy}
              disabled={!ready}
              icon={<Sparkles aria-hidden className="h-4 w-4" />}
              onClick={onSubmit}
            >
              Analyze Specification
            </Button>
            <p className="mt-2.5 text-sm text-ink-500">
              The system will read the requirement and list what it understood, before it looks at
              any standard.
            </p>
          </div>
        </div>
      </div>

      <details className="group rounded-2xl border border-ink-200 bg-white">
        <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-ink-700 marker:hidden">
          <span className="inline-flex items-center gap-2">
            <span className="text-primary-600 group-open:hidden">Fill it in for me</span>
            <span className="hidden text-primary-600 group-open:inline">Hide examples</span>
            <span className="font-normal text-ink-500">— use a ready-made requirement</span>
          </span>
        </summary>
        <ul className="grid gap-2.5 border-t border-ink-200 p-4 sm:grid-cols-3">
          {DEMO_EXAMPLES.map((example) => (
            <li key={example.id}>
              <button
                type="button"
                onClick={() => applyExample(example)}
                className="h-full w-full rounded-xl border border-ink-200 bg-ink-50 px-3.5 py-3 text-left transition-colors hover:border-primary-400 hover:bg-primary-50"
              >
                <span className="block text-[13px] font-semibold text-ink-800">{example.label}</span>
                <span className="mt-1 block text-xs leading-relaxed text-ink-500">
                  {example.description}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
