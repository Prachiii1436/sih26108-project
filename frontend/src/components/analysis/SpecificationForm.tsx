import { useState } from 'react';
import { FileText, Lightbulb, Sparkles, X } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { EXAMPLE_QUERIES } from '@/services/api';
import { formatNumber } from '@/lib/format';

const MIN_LENGTH = 15;
const MAX_LENGTH = 20_000;

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isLoading?: boolean;
  /** Allow the officer to add optional structured hints. */
  showAdvanced?: boolean;
  advanced?: {
    quantity?: string;
    material?: string;
    application?: string;
    sector?: string;
  };
  onAdvancedChange?: (patch: {
    quantity?: string;
    material?: string;
    application?: string;
    sector?: string;
  }) => void;
  topK?: number;
  onTopKChange?: (value: number) => void;
}

export function SpecificationForm({
  value,
  onChange,
  onSubmit,
  isLoading = false,
  showAdvanced = true,
  advanced,
  onAdvancedChange,
  topK = 5,
  onTopKChange,
}: Props) {
  const [showExamples, setShowExamples] = useState(false);
  const [showHints, setShowHints] = useState(false);

  const trimmedLength = value.trim().length;
  const tooShort = trimmedLength > 0 && trimmedLength < MIN_LENGTH;
  const canSubmit = trimmedLength >= MIN_LENGTH && !isLoading;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && canSubmit) {
      event.preventDefault();
      onSubmit();
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) onSubmit();
      }}
      className="card"
    >
      <div className="p-5">
        <label htmlFor="specification" className="label">
          Procurement specification
        </label>
        <textarea
          id="specification"
          value={value}
          onChange={(event) => onChange(event.target.value.slice(0, MAX_LENGTH))}
          onKeyDown={handleKeyDown}
          rows={6}
          disabled={isLoading}
          placeholder="Example: We need 1000 safety helmets for construction workers with impact and penetration protection..."
          aria-describedby="specification-help"
          className="input resize-y text-sm leading-relaxed"
        />

        <div id="specification-help" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className={trimmedLength > MAX_LENGTH * 0.95 ? 'font-semibold text-amber-700' : 'text-slate-500'}>
            {formatNumber(value.length)} characters
          </span>
          {tooShort ? (
            <span className="font-medium text-amber-700">
              Enter at least {MIN_LENGTH} characters of meaningful detail.
            </span>
          ) : null}
          <span className="ml-auto hidden text-slate-400 sm:inline">Ctrl + Enter to analyze</span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            type="submit"
            size="lg"
            loading={isLoading}
            disabled={!canSubmit}
            icon={<Sparkles aria-hidden className="h-4 w-4" />}
          >
            {isLoading ? 'Analyzing...' : 'Analyze Specification'}
          </Button>

          <Button
            type="button"
            variant="secondary"
            size="lg"
            disabled={isLoading}
            onClick={() => setShowExamples((open) => !open)}
            icon={<Lightbulb aria-hidden className="h-4 w-4" />}
          >
            Example Query
          </Button>

          {showAdvanced ? (
            <Button
              type="button"
              variant="ghost"
              size="lg"
              disabled={isLoading}
              onClick={() => setShowHints((open) => !open)}
              icon={<FileText aria-hidden className="h-4 w-4" />}
            >
              {showHints ? 'Hide' : 'Add'} details
            </Button>
          ) : null}

          {onTopKChange ? (
            <label className="ml-auto flex items-center gap-2 text-xs text-slate-600">
              Results
              <select
                className="select h-9 w-20 py-0 text-xs"
                value={topK}
                onChange={(event) => onTopKChange(Number(event.target.value))}
                disabled={isLoading}
                aria-label="Number of recommendations to return"
              >
                {[3, 5, 8, 10, 15].map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        {/* Example query picker */}
        {showExamples ? (
          <div className="mt-4 rounded-lg border border-brand-200 bg-brand-50/60 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-brand-900">Example specifications</p>
                <p className="mt-0.5 text-xs text-brand-800">
                  Pick one to load a realistic procurement requirement and run the full pipeline.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowExamples(false)}
                aria-label="Close examples"
                className="rounded p-1 text-brand-700 hover:bg-brand-100"
              >
                <X aria-hidden className="h-4 w-4" />
              </button>
            </div>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {EXAMPLE_QUERIES.map((example) => (
                <li key={example.label}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(example.text);
                      setShowExamples(false);
                    }}
                    className="h-full w-full rounded-md border border-brand-200 bg-white p-3 text-left transition-colors hover:border-brand-400 hover:bg-brand-50"
                  >
                    <p className="text-xs font-semibold text-brand-800">{example.label}</p>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-600">
                      {example.text}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Optional structured hints (sent as overrides, not required) */}
        {showHints && advanced && onAdvancedChange ? (
          <div className="mt-4 grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                { key: 'quantity', label: 'Quantity', placeholder: '1000 nos' },
                { key: 'material', label: 'Material', placeholder: 'HDPE' },
                { key: 'application', label: 'Application', placeholder: 'Construction workers' },
                { key: 'sector', label: 'Sector', placeholder: 'Safety & Protection' },
              ] as const
            ).map((field) => (
              <div key={field.key}>
                <label className="label" htmlFor={`hint-${field.key}`}>
                  {field.label} <span className="font-normal normal-case text-slate-400">(optional)</span>
                </label>
                <input
                  id={`hint-${field.key}`}
                  className="input"
                  placeholder={field.placeholder}
                  value={advanced[field.key] ?? ''}
                  disabled={isLoading}
                  onChange={(event) => onAdvancedChange({ [field.key]: event.target.value })}
                />
              </div>
            ))}
            <p className="text-[11px] leading-relaxed text-slate-500 sm:col-span-2 lg:col-span-4">
              These hints supplement — never replace — the AI extraction. Leave them blank and the
              engine will infer everything from the specification text.
            </p>
          </div>
        ) : null}
      </div>
    </form>
  );
}
