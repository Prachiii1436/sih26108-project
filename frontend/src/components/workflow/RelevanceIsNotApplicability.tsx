import { EqualNot } from 'lucide-react';

/**
 * The project's central idea, kept visible wherever a decision is being made.
 *
 * "Relevant" is what a search engine returns. "Applicable" is what this engine
 * proves by checking the standard's recorded conditions against the actual
 * procurement requirement.
 */
export function RelevanceIsNotApplicability({
  variant = 'banner',
  message,
  className,
}: {
  variant?: 'banner' | 'inline';
  /** Server-supplied wording, so the statement stays in one place. */
  message?: string;
  className?: string;
}) {
  if (variant === 'inline') {
    return (
      <p className={['text-xs leading-relaxed text-ink-500', className].filter(Boolean).join(' ')}>
        <strong className="font-semibold text-ink-700">Relevant is not the same as applicable.</strong>{' '}
        {message ??
          'We do not simply search for similar standards. We check the standard’s conditions and scope against the actual procurement requirement.'}
      </p>
    );
  }

  return (
    <div
      className={[
        'rounded-2xl border border-primary-200 bg-primary-50 px-5 py-4',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex items-start gap-3.5">
        <span
          aria-hidden
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-700 text-white"
        >
          <EqualNot className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold leading-snug text-primary-900">
            Relevant <span className="font-normal text-ink-400">is not</span> Applicable
          </p>
          <p className="mt-1 text-sm leading-relaxed text-primary-900/80">
            {message ??
              'Our AI does not simply search for similar standards. It checks the standard’s conditions and scope against the actual procurement requirement.'}
          </p>
        </div>
      </div>
    </div>
  );
}
