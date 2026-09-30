/**
 * Data-fetching and state hooks.
 *
 * `useAsync` is the primitive every page builds on: it tracks
 * loading/error/data, cancels stale results via an incrementing token, and
 * re-runs only when the caller asks (manual mode) or a dependency changes.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError } from '@/services/api';

export type AsyncStatus = 'idle' | 'loading' | 'success' | 'error';

export interface AsyncState<T> {
  data: T | null;
  error: ApiError | null;
  status: AsyncStatus;
  /** True only for the first successful load - lets pages skip loading UI on refetch. */
  isInitialLoading: boolean;
}

export interface UseAsyncResult<T> extends AsyncState<T> {
  reload: () => Promise<T | null>;
  setData: (updater: T | ((previous: T | null) => T | null)) => void;
  reset: () => void;
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof Error) return new ApiError(error.message, 0, 'unexpected_error', null, true);
  return new ApiError('An unexpected error occurred.', 0, 'unexpected_error', null, true);
}

export function useAsync<T>(
  fn: () => Promise<T>,
  deps: unknown[] = [],
  options: { immediate?: boolean } = {},
): UseAsyncResult<T> {
  const { immediate = true } = options;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [status, setStatus] = useState<AsyncStatus>(immediate ? 'loading' : 'idle');
  const [isInitialLoading, setIsInitialLoading] = useState(immediate);

  // Guards against a slow response from a previous invocation overwriting newer state.
  const runIdRef = useRef(0);
  const mountedRef = useRef(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(async (): Promise<T | null> => {
    const runId = ++runIdRef.current;
    setStatus('loading');
    setError(null);
    try {
      const result = await fnRef.current();
      if (!mountedRef.current || runId !== runIdRef.current) return null;
      setData(result);
      setStatus('success');
      return result;
    } catch (caught) {
      if (!mountedRef.current || runId !== runIdRef.current) return null;
      setError(toApiError(caught));
      setStatus('error');
      return null;
    } finally {
      if (mountedRef.current && runId === runIdRef.current) setIsInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!immediate) {
      setStatus('idle');
      return;
    }
    setIsInitialLoading(true);
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const updateData = useCallback((updater: T | ((previous: T | null) => T | null)) => {
    setData((previous) =>
      typeof updater === 'function' ? (updater as (p: T | null) => T | null)(previous) : updater,
    );
  }, []);

  const reset = useCallback(() => {
    runIdRef.current += 1;
    setData(null);
    setError(null);
    setStatus('idle');
    setIsInitialLoading(false);
  }, []);

  return { data, error, status, isInitialLoading, reload: run, setData: updateData, reset };
}

/** Debounce a rapidly changing value (search inputs). */
export function useDebounced<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

/** Lock/unlock body scroll while a modal is open. */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
}

/** Copy text and report success for ~2s so a button can show a check mark. */
export function useCopyToClipboard(resetMs = 2000): [boolean, (text: string) => Promise<void>] {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const copy = useCallback(
    async (text: string) => {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          // Fallback for non-secure contexts (plain http on a LAN address).
          const area = document.createElement('textarea');
          area.value = text;
          area.setAttribute('readonly', '');
          area.style.position = 'absolute';
          area.style.left = '-9999px';
          document.body.appendChild(area);
          area.select();
          document.execCommand('copy');
          document.body.removeChild(area);
        }
        setCopied(true);
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => setCopied(false), resetMs);
      } catch {
        setCopied(false);
      }
    },
    [resetMs],
  );

  return [copied, copy];
}
