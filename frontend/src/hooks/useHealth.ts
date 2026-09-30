import { useCallback, useEffect, useRef, useState } from 'react';

import { getHealth, type ApiError } from '@/services/api';
import type { HealthResponse } from '@/types/api';

export interface EngineHealth {
  data: HealthResponse | null;
  error: ApiError | null;
  isLoading: boolean;
  /** Convenience flag: the backend answered and reports a healthy database. */
  isOnline: boolean;
  refresh: () => void;
}

/**
 * Polls `GET /api/health`. Shared by the header status pill and the settings
 * page so the whole app reflects one engine state.
 */
export function useHealth(pollMs?: number): EngineHealth {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const runIdRef = useRef(0);

  const load = useCallback(async () => {
    const runId = ++runIdRef.current;
    try {
      const result = await getHealth();
      if (runId !== runIdRef.current) return;
      setData(result);
      setError(null);
    } catch (caught) {
      if (runId !== runIdRef.current) return;
      setData(null);
      setError(caught as ApiError);
    } finally {
      if (runId === runIdRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    if (!pollMs) return;
    const timer = window.setInterval(() => void load(), pollMs);
    return () => window.clearInterval(timer);
  }, [load, pollMs]);

  const isOnline = data?.status === 'ok' && data?.database?.ok === true;

  return { data, error, isLoading, isOnline, refresh: () => void load() };
}
